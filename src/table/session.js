import { execute, playerView } from '../engine/game-state.js';
import { setupCardMatch } from '../cards/materialize.js';
import { parseReplay, playReplay, replayFromState, serializeReplay } from '../engine/replay.js';
import { stateFingerprint } from '../engine/fingerprint.js';
import { createHeuristicBot } from '../controllers/heuristic-bot.js';

/**
 * Sesja stołu: łączy UI z protokołem engine, zgodnie z granicą
 * „kontroler → intencja → engine → zdarzenia i nowy widok → UI".
 *
 * Sesja prowadzi partię człowiek–bot: ruchy bota rozgrywa od razu, a okna,
 * w których człowiek ma do wyboru wyłącznie pass/concede, przewija
 * automatycznie — do człowieka docierają tylko prawdziwe decyzje.
 * Opcja `pauseOnBotMoves` (UI stołu) zatrzymuje przebieg po KAŻDYM istotnym
 * zagraniu bota (rzut, ląd, zdolność, zmiana strefy karty) — gracz klika
 * „Rozumiem" w modalu „Ruch bota", a sesja wznawia przez continueBotPlay.
 *
 * Moduł nie dotyka DOM-u (testowalny headless); renderowanie i zdarzenia
 * myszy są w render.js/main.js.
 */

export const HUMAN_ID = 'p1';
export const BOT_ID = 'p2';
export const PLAYER_NAMES = { [HUMAN_ID]: 'Ty', [BOT_ID]: 'Bot' };
/**
 * Imiona do sekcji „Przebieg tur (dla AI)" — decyzja właściciela 2026-08-03:
 * Czarodziejka (człowiek) i Nieprzyjaciel (bot). Reszta stołu zachowuje
 * dotychczasowe „Ty"/„Bot".
 */
export const TURN_NAMES = { [HUMAN_ID]: 'Czarodziejka', [BOT_ID]: 'Nieprzyjaciel' };

function defaultBotFactory(seed, ctx) {
  // B3: bot modeluje rękę przeciwnika (człowieka) — zna jego talię.
  return createHeuristicBot({ seed, opponentDeck: ctx?.opponentDeck });
}

/**
 * @param {{ seed: number, registry: object, decks: Map<string, string[]>,
 *   humanId?: string, botFactory?: (seed: number) => object,
 *   pauseOnBotMoves?: boolean }} config
 */
export function createSession(config) {
  const { seed, registry, decks } = config;
  if (!(decks instanceof Map) || decks.size !== 2) throw new TypeError('Sesja wymaga dwóch talii (Map)');
  if (!decks.has(HUMAN_ID) || !decks.has(BOT_ID)) throw new TypeError('Talia musi istnieć dla gracza i bota');
  const botFactory = config.botFactory ?? defaultBotFactory;
  const botCtx = { opponentDeck: decks.get(HUMAN_ID) };
  let bot = botFactory(seed + 1, botCtx);
  const names = Object.entries(PLAYER_NAMES).map(([id, name]) => ({ id, name }));
  let state = setupCardMatch({ seed, players: names, decks, registry });
  const nameById = new Map(registry.all().map((card) => [card.id, card.name]));
  const colorsById = new Map(registry.all().map((card) => [card.id, card.colors ?? []]));
  const log = []; // { kind: 'event'|'rejection'|'system', text }
  const sessionLog = (kind, text) => log.push({ kind, text });
  // Ślad decyzji bota (B5, docs/BOT_ROADMAP.md): po każdym ruchu bota z jego
  // trace() zapisujemy najnowszy wpis — co wybrał, z jaką oceną i które
  // opcje brał pod uwagę. Bufor ograniczony (60), najnowsze na końcu.
  const reasoning = [];
  /**
   * Istotne ruchy bota od ostatniego okna decyzyjnego człowieka (M18).
   * Bot gra „w tle", a większość jego zagrań (czar z ręki, zdolność, trigger)
   * nie zostawia niczego na stole — gracz dowiadywał się o nich wyłącznie
   * z logu, którego łatwo nie zauważyć. Sesja zbiera je tutaj, a UI pokazuje
   * w modalu „Ruch bota" (decyzja właściciela 2026-08-02).
   *
   * Świadomie POMIJAMY passy i tapowanie many — to szum, który zamieniłby
   * modal w klikanie bez treści (decyzja właściciela).
   */
  const botMoves = [];
  /**
   * Przebieg pełnych tur (M25): co robił gracz i bot w poprzednich turach,
   * do zasilania AI fabularnym opisem. Każda ukończona tura to rekord
   * { number, activePlayerId, lines: string[] } w kolejności zakończenia
   * (najstarsza pierwsza). „Pełna tura" = zakończona (nastąpił turn_started
   * następnej); tura bieżąca dołącza dopiero, gdy partia się skończy.
   * Imiona: TURN_NAMES (Czarodziejka / Nieprzyjaciel).
   */
  const turnHistory = [];
  let currentTurn = {
    number: state.turn.number,
    activePlayerId: state.turn.activePlayerId,
    lines: [],
  };
  const TURN_NOISE = new Set(['step_advanced', 'mana_produced', 'turn_started']);
  function recordTurnEvent(e) {
    if (e.type === 'turn_started') {
      turnHistory.push(currentTurn);
      currentTurn = { number: state.turn.number, activePlayerId: e.playerId, lines: [] };
      return;
    }
    if (TURN_NOISE.has(e.type)) return;
    const text = describeEvent(e, TURN_NAMES);
    if (!text) return;
    currentTurn.lines.push(text);
  }
  /** Formatuje N ostatnich pełnych tur (1 albo 2) do tekstu dla AI. */
  function turnHistoryText(count = 1) {
    // Po zakończeniu partii ostatnia, przerwana tura też jest pełna.
    if (state.status === 'finished' && currentTurn.lines.length > 0) {
      turnHistory.push(currentTurn);
      currentTurn = { number: state.turn.number, activePlayerId: state.turn.activePlayerId, lines: [] };
    }
    const records = turnHistory.slice(-Math.max(1, Math.min(2, count)));
    if (records.length === 0) return '';
    const blocks = records.map((record) => {
      const whoName = TURN_NAMES[record.activePlayerId] ?? record.activePlayerId;
      const header = `**Tura ${record.number} — ${whoName}**`;
      const lines = record.lines.length > 0
        ? record.lines.map((line) => `• ${line}`)
        : ['• (nic znaczącego)'];
      return [header, ...lines].join('\n');
    });
    return blocks.join('\n\n');
  }
  const captureBotReasoning = () => {
    const last = bot.trace?.().at(-1);
    if (!last) return;
    reasoning.push({
      turn: last.turn,
      step: last.step,
      chosen: last.chosen,
      score: last.score,
      options: (last.options ?? []).slice(0, 5).map((option) => ({ ...option })),
    });
    if (reasoning.length > 60) reasoning.shift();
  };

  function nameOf(cardId) {
    return nameById.get(cardId) ?? cardId ?? '?';
  }

  /** Nazwa obiektu gry (po id obiektu, nie karty) — do opisów ataków i celów. */
  function nameOfObject(objectId) {
    const object = state.objects.get(objectId);
    return object ? nameOf(object.cardId) : '?';
  }

  function who(playerId) {
    return PLAYER_NAMES[playerId] ?? playerId;
  }

  /**
   * Krótkie polskie opisy efektów zdolności aktywowanych — do logu stołu
   * zamiast „(?)\". Klucze = `effect.type` z deskryptorni zdolności; wpis
   * bez opisu zostawia samo „Bot aktywuje: <karta>".
   */
  const ABILITY_EFFECT_LABELS = Object.freeze({
    add_counter: 'licznik na celu',
    add_mana: 'dodanie many do puli',
    bounce_permanent: 'zerzucenie permanentu na rękę',
    cant_block: 'docelowy stwór nie może blokować do końca tury',
    craft_transform: 'craft — przemiana artefaktu',
    damage: 'obrażenia w cel',
    discover: 'discover',
    draw_cards: 'dobranie kart',
    exile_return_transformed: 'wygnanie i powrót przemieniony',
    explore: 'explore (odsłonięcie wierzchu biblioteki)',
    gain_life: 'zdobycie życia',
    grant_keywords_until_end_of_turn: 'nadanie słów kluczowych do końca tury',
    lock_untap: 'cel nie odtapuje podczas następnego untap kontrolera',
    lose_life: 'cel traci życie',
    mill_cards: 'mielenie kart do grobu',
    prevent_damage_this_turn: 'niwelowanie obrażeń do końca tury',
    pump: 'zmiana statystyk celu',
    scry: 'scry na wierzchu biblioteki',
    search_library_to_battlefield: 'szukanie karty w bibliotece na bitwisko',
    station_counters: 'liczniki charge ze Station (moc zatapniętego stwora)',
    take_initiative: 'objęcie inicjatywy',
    transform: 'transform karty',
    untap_permanent: 'odtapnięcie celu',
    venture_into_undercity: 'zagłębienie w Podziemia',
  });

  function describeEvent(e, names = PLAYER_NAMES) {
    const whoN = (id) => names[id] ?? id;
    switch (e.type) {
      // Zdarzenia techniczne/ulotne — zbyt gadatliwe dla logu stołu.
      case 'priority_passed':
      case 'mana_changed':
      case 'object_tapped':
      case 'object_untapped':
      case 'damage_marked':
      case 'object_moved':
      case 'game_created':
        return null;
      case 'command_rejected': return `Odrzucono: ${e.reason ?? 'nielegalna komenda'}`;
      case 'cant_block_granted': return `${nameOfObject(e.objectId)} nie może blokować do końca tury`;
      case 'spell_countered': return `${nameOf(e.cardId)} zostaje skontrowany${e.counteredBy ? ` (${nameOfObject(e.counteredBy)})` : ''}`;
      case 'sacrifice_choice_required': return `${whoN(e.playerId)} wskazuje stwora do poświęcenia`;
      case 'food_choice_required': return `${whoN(e.playerId)} rozstrzyga: poświęcić Food na +3 życia?`;
      case 'food_choice_resolved': return e.auto
        ? null
        : (e.sacrificed
          ? `${whoN(e.playerId)} poświęca Food i zdobywa 3 życia`
          : `${whoN(e.playerId)} nie poświęca Food`);
      case 'discover_started': {
        const hits = e.foundCardId ? ` — trafiono ${nameOf(e.foundCardId)}` : '';
        return `${whoN(e.playerId)} wykonuje discover (${e.amount})${hits}`;
      }
      case 'discover_resolved': return e.foundCardId
        ? `${nameOf(e.foundCardId)} — discover${e.castFree ? ' (rzut za darmo)' : ''}`
        : null;
      case 'explore_choice_required': return `${whoN(e.playerId)} rozstrzyga explore — ${nameOf(e.cardId)} na wierzchu biblioteki`;
      case 'explore_resolved': {
        if (e.isLand) return `Explore: ${nameOf(e.foundCardId)} trafia do ręki`;
        if (e.putInGraveyard) return `Explore: ${nameOf(e.foundCardId)} trafia do grobu (+1/+1 na stworze)`;
        if (e.found === false) return 'Explore: wierzch biblioteki nie jest lądem — +1/+1 na stworze';
        return `Explore: ${nameOf(e.foundCardId)} zostaje na wierzchu (+1/+1 na stworze)`;
      }
      case 'craft_exile_required': return `${whoN(e.playerId)} wybiera karty do craftu (${nameOfObject(e.sourceId)})`;
      case 'step_advanced': return `— ${e.phase}/${e.step} —`;
      case 'turn_started': return `Tura gracza ${whoN(e.playerId)}`;
      case 'card_drawn': return `${whoN(e.playerId)} dobiera kartę`;
      case 'land_played': return `${whoN(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}${e.entersTapped ? ' (wchodzi zatapnięty)' : ''}`;
      case 'mana_produced': return `${whoN(e.playerId)} przygotowuje manę (${nameOfObject(e.source)})`;
      case 'permanent_cast': {
        if (e.faceDown) return `${whoN(e.playerId)} zagrywa ${nameOf(e.object?.cardId)} twarzą w dół (2/2)`;
        // Phyrexian mana (Batch 11): symbole {W/P} opłacone maną albo 2 życiem.
        const paidWithLife = e.phyrexianPaidWithLife ?? 0;
        const phyrexian = e.phyrexianSymbols
          ? ` — phyrexian: ${paidWithLife > 0 ? `${paidWithLife}× po 2 życia` : 'za manę'}`
          : '';
        return `${whoN(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}${phyrexian}`;
      }
      case 'spell_cast': {
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        const plotted = e.plotted ? ' z exile po plot' : '';
        const cleaved = e.cleaved ? ' z kosztem Cleave' : '';
        return `${whoN(e.playerId)} rzuca ${nameOf(e.cardId)}${plotted}${cleaved}${targets ? ` → cel: ${targets}` : ''}`;
      }
      case 'spell_resolved': {
        const clashReturn = e.returnToHand ? ' — wygrany clash zwraca czar do ręki właściciela' : '';
        return `${nameOf(e.cardId)} zostaje rozstrzygnięty${e.fizzled ? ' (cel nielegalny — bez efektu)' : ''}${clashReturn}`;
      }
      case 'aura_spell_cast': {
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        return `${whoN(e.playerId)} rzuca ${nameOf(e.cardId)} za koszt bestow → cel: ${targets}`;
      }
      case 'permanent_entered_battlefield': {
        if (e.unattached) return `${nameOf(e.cardId)} wchodzi na bitwisko jako stwór (cel bestow nielegalny przy rozstrzygnięciu)`;
        return `${nameOf(e.cardId)} wchodzi na bitwisko`;
      }
      case 'object_attached': {
        if (e.via === 'equip') return `${nameOf(e.cardId)} wyposaża ${nameOfObject(e.hostId)}`;
        if (e.via === 'aura') return `${nameOf(e.cardId)} zaczarowuje ${nameOfObject(e.hostId)}`;
        return `${nameOf(e.cardId)} zostaje załączony do ${nameOfObject(e.hostId)} (bestow)`;
      }
      case 'object_detached': return e.becameKind === 'creature'
        ? `${nameOf(e.cardId)} odłącza się i znów jest stworem`
        : `${nameOf(e.cardId)} odłącza się i zostaje na bitwisku`;
      case 'stats_modified': {
        const sign = (v) => (v >= 0 ? `+${v}` : `${v}`);
        return `${nameOfObject(e.objectId)} dostaje ${sign(e.powerModifier)}/${sign(e.toughnessModifier)}`;
      }
      case 'attackers_declared': {
        const names = (e.attackerIds ?? []).map((id) => nameOfObject(id));
        return names.length ? `Atak: ${names.join(', ')}` : 'Brak ataku';
      }
      case 'blockers_declared': {
        const parts = Object.entries(e.assignments ?? {})
          .map(([blocker, targets]) => `${nameOfObject(blocker)} blokuje ${targets.map((id) => nameOfObject(id)).join(' i ')}`);
        return parts.length ? parts.join('; ') : 'Brak bloków';
      }
      case 'damage_dealt': {
        const targetName = state.players.some((player) => player.id === e.target)
          ? whoN(e.target) : nameOfObject(e.target);
        return `${nameOfObject(e.source)} zadaje ${e.amount} obrażeń (${targetName})`;
      }
      case 'damage_prevented': return `Obrażenia (${e.amount}) do ${nameOfObject(e.objectId)} zostają zniwelowane`;
      case 'damage_prevention_started': return `${nameOf(e.cardId)}: obrażenia zadawane ${e.filterDescription ?? 'chronionym obiektom'} będą niwelowane do końca tury`;
      case 'creature_destroyed': return `${nameOfObject(e.fromId)} ginie`;
      case 'life_changed': return `${whoN(e.playerId)}: życie ${e.before} → ${e.after}`;
      case 'poison_counters_added': return `${whoN(e.playerId)} otrzymuje znaki trucizny (+${e.amount}, łącznie: ${e.after})`;
      case 'permanent_animated': return `${nameOfObject(e.objectId)} staje się stworzeniem ${e.power}/${e.toughness} do końca tury`;
      case 'player_lost': {
        const reasons = {
          life_zero: 'brak życia',
          poison_ten: '10 znaków trucizny',
          empty_library: 'pusta biblioteka',
        };
        return `${whoN(e.playerId)} przegrywa (${reasons[e.reason] ?? e.reason})`;
      }
      case 'player_conceded': return `${whoN(e.playerId)} poddaje partię`;
      case 'ability_activated': {
        if (e.attackerId) return `${whoN(e.playerId)} używa Ninjutsu (${nameOfObject(e.objectId)} wchodzi zamiast ${nameOfObject(e.attackerId)})`;
        if (e.cycling) return `${whoN(e.playerId)} aktywuje cycling: ${nameOf(e.cardId)}`;
        if (e.keyword === 'equip') {
          const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
          return `${whoN(e.playerId)} wyposaża: ${nameOfObject(e.objectId)} → ${targets}`;
        }
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        const xPart = e.xValue != null ? ` (X=${e.xValue})` : '';
        // Źródło mogło zniknąć w koszcie (Sacrifice this) — nazwa jedzie
        // wtedy z e.cardId, nie z lookupu po id obiektu (naprawione „?\" w logu).
        const sourceName = e.cardId ? nameOf(e.cardId) : nameOfObject(e.objectId);
        const desc = (e.effectTypes ?? [])
          .map((type) => ABILITY_EFFECT_LABELS[type])
          .filter(Boolean)
          .join(', ');
        return `${whoN(e.playerId)} aktywuje zdolność: ${sourceName}${desc ? ` — ${desc}` : ''}${xPart}${targets ? ` → cel: ${targets}` : ''}`;
      }
      case 'ability_triggered': {
        if (e.backup) return `${nameOf(e.cardId)} — trigger Backup: kontroler wskazuje stwora na liczniki`;
        if (e.sacrificed) return `${nameOf(e.cardId)} — trigger (${e.trigger}): brak zapłaty, permanent poświęcony`;
        if (e.paid != null) return `${nameOfObject(e.objectId)} — trigger (${e.trigger}): zapłacono {${e.paid}}${e.autoTapped ? ` (auto-tap: ${nameOfObject(e.autoTapped)})` : ''}`;
        const triggerLabels = {
          another_creature_enters: 'wejście innego stworzenia',
          land_entered_under_your_control: 'Landfall',
          when_you_cast_spell: 'rzucenie czaru',
          beginning_of_combat: 'początek walki',
          attacks: 'atak',
          dies: 'śmierć stwora',
          any_creature_dies: 'śmierć stworzenia',
          permanents_you_control_leave_battlefield: 'odejście twoich permanentów z bitwiska',
          enter_battlefield: 'wejście na bitwisko',
          end_step: 'początek kroku końca tury',
          equipped_creature_attacks: 'atak stwora wyposażonego w ten sprzęt',
        };
        return `${nameOfObject(e.objectId)} — trigger (${triggerLabels[e.trigger] ?? e.trigger})`;
      }
      case 'land_type_changed': return `${nameOfObject(e.objectId)} staje się typem ${e.subtype} do końca tury`;
      case 'control_changed': return `${nameOf(e.cardId)} przechodzi pod kontrolę gracza ${whoN(e.controllerId)}`;
      case 'object_exiled': return `${nameOf(e.cardId)} zostaje wygnany${e.delayed ? ' (opóźniony trigger)' : ''}`;
      case 'permanent_sacrificed': return `${nameOf(e.cardId)} zostaje poświęcony`;
      case 'permanent_destroyed': return `${nameOfObject(e.fromId)} zostaje zniszczony`;
      case 'hand_creature_choice_required': return `${whoN(e.playerId)} wybiera wielokolorowego stwora z ręki (Dragon Arch)`;
      case 'hand_creature_choice_resolved': return e.putCreature
        ? `${nameOf(e.cardId)} wchodzi na bitwisko z ręki (Dragon Arch)`
        : `${whoN(e.playerId)} rezygnuje z położenia stwora`;
      case 'permanent_put_into_graveyard': return `${nameOf(e.cardId)} trafia do grobu (aura bez legalnego gospodarza)`;
      case 'card_discarded': return `${whoN(e.playerId)} odrzuca ${nameOf(e.cardId)}`;
      case 'card_milled': return `${whoN(e.playerId)} mieli ${nameOf(e.cardId)} do grobu`;
      case 'card_plotted': return `${whoN(e.playerId)} plotuje ${nameOf(e.cardId)} (karta trafia do exile)`;
      case 'card_revealed': return `${whoN(e.playerId)} odsłania ${nameOf(e.cardId)}`;
      case 'library_searched': return e.foundCardId
        ? `${whoN(e.playerId)} przeszukuje bibliotekę i tasuje`
        : `${whoN(e.playerId)} przeszukuje bibliotekę (bez trafienia) i tasuje`;
      case 'backup_resolved': {
        const grants = e.grantedKeywords?.length ? ` i zyskuje ${e.grantedKeywords.join(', ')} do końca tury` : '';
        return `Backup (${nameOf(e.sourceCardId)}): ${nameOfObject(e.targetId)} dostaje ${e.counters}× +1/+1${grants}`;
      }
      // keyword_granted opisuje backup_resolved — kolejna linia byłaby dubletem.
      case 'keyword_granted': return null;
      case 'scry_started': return `${whoN(e.playerId)} wykonuje scry (${e.amount === 1 ? 'patrzy na 1 kartę' : `patrzy na ${e.amount} kart`})`;
      case 'scry_resolved': return e.bottomCount > 0
        ? `${whoN(e.playerId)} kończy scry — odkłada na spód biblioteki (${e.bottomCount}/${e.total})`
        : `${whoN(e.playerId)} kończy scry — zostawia na wierzchu biblioteki`;
      case 'surveil_started': return `${whoN(e.playerId)} wykonuje surveil (patrzy na ${e.amount} kart)`;
      case 'surveil_resolved': return `${whoN(e.playerId)} kończy surveil — ${e.milledCount} ${e.milledCount === 1 ? 'karta idzie' : 'karty idą'} do grobu`;
      case 'initiative_taken': {
        const first = e.firstTime ? ' — obejmuje ją po raz pierwszy i zagłębia się w Podziemia' : '';
        return `${whoN(e.playerId)} obejmuje inicjatywę${first}`;
      }
      case 'ventured_into_undercity': return `${whoN(e.playerId)} zagłębia się w Podziemiach (pokój ${e.room}/${e.total}: ${e.roomName})`;
      case 'clash_resolved': {
        const mine = e.myManaValue ?? '—';
        const theirs = e.opponentManaValue ?? '—';
        return `Clash: ${whoN(e.playerId)} ${e.won ? 'wygrywa' : 'przegrywa'} (mana value ${mine} vs ${theirs})`;
      }
      case 'clash_choice_resolved': return `${whoN(e.playerId)} ${e.putOnBottom ? 'odkłada odsłoniętą kartę na spód' : 'zostawia odsłoniętą kartę na wierzchu'} biblioteki`;
      case 'object_goaded': return `${nameOfObject(e.objectId)} jest sprowokowany (goad) — musi atakować do końca tury`;
      case 'hexproof_granted': return `${nameOfObject(e.objectId)} dostaje hexproof do początku następnej tury kontrolera`;
      case 'room_target_required': return `${whoN(e.playerId)} wybiera cel pokoju ${e.roomName}`;
      case 'room_target_resolved': {
        if (e.kind === 'player') return `${whoN(e.playerId)} wskazuje gracza ${whoN(e.targetId)} (pokój ${e.roomName})`;
        const what = e.cardId ? nameOf(e.cardId) : nameOfObject(e.targetId);
        return `${whoN(e.playerId)} wskazuje ${what} (pokój ${e.roomName})`;
      }
      case 'object_transformed': return `${nameOf(e.fromCardId)} przemienia się w ${nameOf(e.cardId)}`;
      case 'token_created': return `${whoN(e.controllerId)} tworzy token ${e.name} (${e.power}/${e.toughness})`;
      case 'counter_added': return `${nameOfObject(e.objectId)} dostaje +${e.amount} licznik ${e.counter} (razem ${e.total})`;
      case 'counter_removed': return `${nameOfObject(e.objectId)} traci ${e.amount} licznik ${e.counter} (zostało ${e.total})`;
      case 'station_status_changed': return e.becameCreature
        ? `${nameOfObject(e.objectId)} osiąga ${e.chargeCounters} liczników charge i staje się artefaktowym stworem (Station)`
        : `${nameOfObject(e.objectId)} spada poniżej progu Station i przestaje być stworem`;
      case 'saga_chapter_fired': return `${nameOf(e.cardId)} — rozdział Sagi ${['', 'I', 'II', 'III', 'IV'][e.chapter] ?? e.chapter}`;
      case 'opponents_lands_tapped': return `Landy przeciwników ${whoN(e.playerId)} zostają zatapnięte (${e.count})`;
      case 'delayed_trigger_armed': return `${nameOf(e.cardId)} — opóźniony trigger: powrót na bitwisko w następnym upkeep gracza ${whoN(e.playerId)}`;
      case 'object_flipped': return `${nameOfObject(e.objectId)} obraca się twarzą do góry`;
      default: return e.type;
    }
  }

  /**
   * Czy zdarzenie bota warto pokazać graczowi w modalu? Pomijamy szum
   * (passy, mana, kroki tury, techniczne przenosiny obiektów) — reszta
   * (czary, zdolności, triggery, walka, tokeny, liczniki, życie) to realna
   * informacja o tym, co zrobił przeciwnik.
   */
  const BOT_MOVE_NOISE = new Set([
    'priority_passed', 'mana_changed', 'mana_produced', 'step_advanced',
    'turn_started', 'object_tapped', 'object_untapped', 'damage_marked',
    'object_moved', 'game_created', 'card_drawn', 'stats_modified',
  ]);

  /** Zdarzenia, przy których warto pokazać ilustrację zagranej karty. */
  const BOT_MOVE_CARD_EVENTS = new Set([
    'spell_cast', 'permanent_cast', 'aura_spell_cast', 'ability_activated',
    'ability_triggered', 'spell_resolved', 'permanent_entered_battlefield',
  ]);

  /**
   * „Istotne zagranie" — po takim zdarzeniu z akcji bota/auto-przewijania
   * sesja pauzuje na klik gracza (opcja `pauseOnBotMoves`; decyzja
   * właściciela 2026-08-05: pauza po każdym rzuceniu czaru przez bota,
   * wystawieniu lądu, użyciu zdolności i zmianie strefy karty — nawet gdy
   * gracz nie ma żadnej możliwej odpowiedzi). Tylko `object_moved` jest
   * jednocześnie szumem logu — dostaje własny opis w noteBotMove.
   */
  const BOT_PAUSE_EVENTS = new Set([
    'spell_cast', 'permanent_cast', 'aura_spell_cast',
    'land_played',
    'ability_activated', 'ability_triggered',
    'object_moved', 'object_exiled', 'permanent_destroyed', 'creature_destroyed',
    'permanent_sacrificed', 'permanent_put_into_graveyard',
    'token_created', 'permanent_entered_battlefield',
  ]);

  function noteBotMove(e) {
    let text;
    if (BOT_MOVE_NOISE.has(e.type)) {
      // Szum logu — pomijamy, CHYBA że zdarzenie jest pauzowalne: zmiana
      // strefy karty (object_moved) ma być pokazana w modalu ruchu bota,
      // choć do logu nie trafia (decyzja o gadatliwości logu zostaje).
      if (!BOT_PAUSE_EVENTS.has(e.type)) return;
      const movedName = nameOf(e.object?.cardId ?? state.objects.get(e.fromId)?.cardId);
      text = `${who(e.object?.controllerId)}: ${movedName} — ${e.fromZone ?? '?'} → ${e.toZone ?? '?'}`;
    } else {
      text = describeEvent(e);
      if (!text) return;
    }
    // Kartę do podglądu bierzemy z samego zdarzenia (cardId) albo z obiektu,
    // którego zdarzenie dotyczy — UI pokaże jej skan ze Scryfalla.
    let cardId = null;
    if (BOT_MOVE_CARD_EVENTS.has(e.type)) {
      cardId = e.cardId ?? e.object?.cardId ?? e.sourceCardId ?? null;
      if (!cardId && e.objectId) cardId = state.objects.get(e.objectId)?.cardId ?? null;
    }
    botMoves.push({ type: e.type, text, cardId });
  }

  // Pauza po każdym istotnym zagraniu bota (decyzja właściciela 2026-08-05):
  // gdy `pauseOnBotMoves` jest włączone, sesja zatrzymuje się po zagraniu,
  // którego strumień zdarzeń niesie BOT_PAUSE_EVENTS, i czeka na klik
  // (session.continueBotPlay). Domyślnie wyłączone, żeby konsumenci
  // synchroniczni (testy, narzędzia) zachowali dotychczasowy przebieg.
  const pauseOnBotMoves = config.pauseOnBotMoves === true;
  let awaitingBotAck = false;

  /**
   * Wspólny strumień auto-przewijania (ruch bota, auto-resolve walki,
   * auto-pass człowieka): logowanie opisanych zdarzeń + bufor modala
   * + przebieg tur. Zwraca, czy strumień niosł zdarzenie pauzowalne
   * (istotne zagranie / zmiana strefy). Historia: rozstrzygnięcia stosu przy
   * auto-passie wcześniej NIE trafiały do logu ani przebiegu tur — teraz
   * są ujęte tą samą ścieżką co ruchy bota.
   */
  function streamAutoEvents(events) {
    let significant = false;
    for (const e of events) {
      const text = describeEvent(e);
      if (text) sessionLog('event', text);
      noteBotMove(e);
      recordTurnEvent(e);
      if (BOT_PAUSE_EVENTS.has(e.type)) significant = true;
    }
    return significant;
  }

  /**
   * Prowadzi partię do przodu: ruchy bota i auto-przewijanie okien człowieka
   * bez realnej decyzji (sam pass, puste deklaracje, rozstrzyganie walki).
   * Zatrzymuje się na pierwszym z: koniec partii, okno decyzyjne człowieka
   * albo — przy włączonym pauseOnBotMoves — istotne zagranie z pauzą
   * (`awaitingBotAck`, wznowienie przez continueBotPlay).
   */
  function advance() {
    let guard = 0;
    awaitingBotAck = false;
    while (state.status === 'active') {
      if (guard++ > 5000) throw new Error('advance: brak postępu sesji');
      if (state.turn.priorityPlayerId === BOT_ID) {
        const cmd = bot.chooseCommand(playerView(state, BOT_ID));
        captureBotReasoning();
        const result = execute(state, cmd);
        if (!result.ok) throw new Error(`Bot wybrał nielegalną komendę: ${result.events[0]?.reason}`);
        const significant = streamAutoEvents(result.events);
        if (pauseOnBotMoves && significant) { awaitingBotAck = true; return; }
        continue;
      }
      const view = playerView(state, HUMAN_ID);
      if (hasMeaningfulDecision(view)) return;
      // Rozstrzygnięcie walki idzie automatycznie (pass jest tam zablokowany).
      const resolve = view.legalCommands.find((cmd) => cmd.type === 'resolve_combat');
      if (resolve) {
        const result = execute(state, resolve);
        if (!result.ok) throw new Error(`Auto-resolve odrzucony: ${result.events[0]?.reason}`);
        const significant = streamAutoEvents(result.events);
        if (pauseOnBotMoves && significant) { awaitingBotAck = true; return; }
        continue;
      }
      const pass = execute(state, { type: 'pass_priority', playerId: HUMAN_ID });
      if (!pass.ok) throw new Error(`Auto-pass odrzucony: ${pass.events[0]?.reason}`);
      const significant = streamAutoEvents(pass.events);
      if (pauseOnBotMoves && significant) { awaitingBotAck = true; return; }
    }
  }

  /**
   * Czy człowiek ma teraz realną decyzję? Sam pass i samo tapnięcie lądu
   * NIE są decyzją — auto-pass ma przewijać tury, w których gracz nie może
   * zrobić nic sensownego. Patrzymy też „do przodu": jeśli po odkręceniu
   * wszystkich landów stałoby się wykonalne zagranie czaru/stwora/morphu
   * albo zdolności aktywowanej, to tapnięcie lądu jest decyzją i okno
   * zostaje u człowieka.
   */
  function hasMeaningfulDecision(view) {
    if (view.status !== 'active') return false;
    // Puste okna nie są decyzją: sam pass, samo tapnięcie lądu, pusta
    // deklaracja ataku/bloków oraz rozstrzygnięcie walki bez odpowiedzi
    // (resolve_combat zawsze idzie automatycznie — inaczej pass jest zablokowany).
    const decisions = view.legalCommands.filter((c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type));
    const hasRealDecision = decisions.some((cmd) => {
      if (cmd.type === 'declare_attackers') return (cmd.attackerIds?.length ?? 0) > 0;
      if (cmd.type === 'declare_blockers') return Object.keys(cmd.assignments ?? {}).length > 0;
      return true;
    });
    if (hasRealDecision) return true;

    const me = view.players.find((p) => p.id === view.playerId);
    const potentialMana = (me?.mana ?? 0) + view.zones.battlefield
      .filter((o) => o.controllerId === view.playerId && o.kind === 'land' && !o.tapped).length;

    // Po odkręceniu landów może stać się wykonalne zagranie z ręki.
    // Zgodnie z timingiem: instant w dowolnym oknie priorytetu, sorcery/stwór/
    // morph tylko we własnej main phase (i sorcery przy pustym stosie).
    const myMainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
      && state.turn.activePlayerId === view.playerId;
    for (const card of view.zones.hand) {
      if (card.hidden) continue;
      const definition = registry.get(card.cardId);
      if (card.kind === 'spell') {
        if ((card.manaCost ?? 0) > potentialMana) continue;
        if (card.spell?.timing === 'instant') return true;
        if (card.spell?.timing === 'sorcery' && myMainPhase && state.zones.stack.length === 0) return true;
        continue;
      }
      if ((card.kind === 'creature' || card.kind === 'artifact') && myMainPhase) {
        if ((card.manaCost ?? 0) <= potentialMana) return true;
        if (card.kind === 'creature' && definition?.morph && (definition.morph.cost ?? 0) <= potentialMana) return true;
      }
    }
    // Zdolności aktywowane na bitwisku (po odkręceniu landów).
    for (const object of view.zones.battlefield) {
      if (object.controllerId !== view.playerId) continue;
      for (const ability of (registry.get(object.cardId)?.abilities ?? [])) {
        if (ability.type !== 'activated' || ability.keyword === 'ninjutsu') continue;
        if (ability.cost?.tap && object.tapped) continue;
        if (ability.targets?.length && !view.zones.battlefield.some((o) => o.kind === 'creature')) continue;
        if ((ability.cost?.mana ?? 0) > potentialMana) continue;
        return true;
      }
    }
    // Ninjutsu z ręki w oknie combat_damage: nieblokowany atakujący + karta z ninjutsu.
    if (state.turn.step === 'combat_damage' && state.combat) {
      const hasUnblockedAttacker = state.combat.attackers.some((id) => {
        const attacker = state.objects.get(id);
        return attacker?.controllerId === view.playerId && !state.combat.blockers.has(id);
      });
      if (hasUnblockedAttacker) {
        for (const card of view.zones.hand) {
          if (card.hidden || card.kind !== 'creature') continue;
          const ninjutsu = (registry.get(card.cardId)?.abilities ?? []).find(
            (a) => a.type === 'activated' && a.keyword === 'ninjutsu',
          );
          if (ninjutsu && (ninjutsu.cost?.mana ?? 0) <= potentialMana) return true;
        }
      }
    }
    return false;
  }

  sessionLog('system', `Nowa partia (seed ${seed}). Powodzenia!`);
  advance();

  const exposed = {
    get state() { return state; },
    nameOf,
    nameOfObject,
    /** Kolory karty (do akcentów w UI); nieznane id → pusta lista. */
    colorsOf(cardId) {
      return colorsById.get(cardId) ?? [];
    },
    cardDetails(cardId) {
      return registry.get(cardId) ?? null;
    },
    abilitiesOf(cardId) {
      const card = registry.get(cardId);
      return card?.abilities ?? [];
    },
    log,
    reasoning,
    /** Istotne ruchy bota od ostatniego okna decyzji człowieka (M18). */
    botMoves,
    /** Czyści bufor po pokazaniu go graczowi. */
    clearBotMoves() { botMoves.length = 0; },
    /** Pełne tury w kolejności zakończenia (M25, sekcja „Przebieg tur"). */
    turnHistory,
    /** Tekst N ostatnich pełnych tur (1–2) dla AI — imiona Czarodziejka/Nieprzyjaciel. */
    turnHistoryText,
    exportReplayText() {
      return serializeReplay(replayFromState(state));
    },
    view() {
      return playerView(state, HUMAN_ID);
    },
    /** Wykonuje komendę człowieka przez protokół; zwraca { ok, reason?, botPause? }. */
    apply(cmd) {
      // Modal „Ruch bota" ma pokazywać odpowiedź na TEN ruch gracza,
      // a nie historię od początku partii.
      botMoves.length = 0;
      // Defensywnie: konsument nie powinien aplikować komendy w trakcie pauzy
      // (UI blokuje ją modalem) — ignorujemy niedokończoną pauzę i gramy dalej.
      awaitingBotAck = false;
      const result = execute(state, cmd);
      if (!result.ok) {
        sessionLog('rejection', `Ruch odrzucony: ${result.events[0]?.reason}`);
        return { ok: false, reason: result.events[0]?.reason };
      }
      for (const e of result.events) {
        const text = describeEvent(e);
        if (text) sessionLog('event', text);
        recordTurnEvent(e);
      }
      advance();
      return { ok: true, botPause: awaitingBotAck };
    },
    /** Sesja czeka na potwierdzenie istotnego zagraniu bota (klik gracza). */
    get botPausePending() { return awaitingBotAck; },
    /**
     * Wznawia grę po pauzie na istotnym zagraniu bota: rozgrywa kolejne ruchy
     * do następnej pauzy albo okna decyzyjnego człowieka (klik = „rozumiem").
     * Bez pauzy jest no-op.
     */
    continueBotPlay() {
      if (!awaitingBotAck) return { ok: true, botPause: false };
      advance();
      return { ok: true, botPause: awaitingBotAck };
    },
    /** Odtwarza zapis partii w TYM samym składzie talii; zwraca podsumowanie. */
    resumeReplayText(text) {
      const replay = parseReplay(text);
      const fresh = setupCardMatch({ seed: replay.seed, players: names, decks, registry });
      const played = playReplay(replay, () => fresh, execute);
      const rejected = played.results.filter((r) => !r.ok);
      if (rejected.length > 0) {
        throw new Error(`Zapis zawiera ${rejected.length} odrzuconych komend — nie da się wznowić`);
      }
      state = played.state;
      bot = botFactory(seed + 1 + replay.commands.length, botCtx);
      reasoning.length = 0; // świeży bot = świeży ślad decyzji
      // Świeży przebieg tur: historia przed wznowieniem nie dotyczy nowej gry.
      turnHistory.length = 0;
      currentTurn = { number: state.turn.number, activePlayerId: state.turn.activePlayerId, lines: [] };
      sessionLog('system', `Wznowiono zapis (${replay.commands.length} komend).`);
      // Bufor modala mógł napełnić się przy startowym advance() świeżej
      // sesji (startGame) — wznowienie pokazuje wyłącznie akcję po zapisie.
      botMoves.length = 0;
      advance();
      return { steps: replay.commands.length, status: state.status };
    },
    importReplayText(text) {
      const replay = parseReplay(text);
      const fresh = setupCardMatch({ seed: replay.seed, players: names, decks, registry });
      const played = playReplay(replay, () => fresh, execute);
      const rejected = played.results.filter((r) => !r.ok);
      return {
        steps: replay.commands.length,
        rejected: rejected.length,
        status: played.state.status,
        winner: played.state.winnerId == null ? null : who(played.state.winnerId),
        fingerprint: stateFingerprint(played.state),
      };
    },
  };
  return exposed;
}
