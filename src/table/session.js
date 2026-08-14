import { execute, playerView } from '../engine/game-state.js';
import { makeSimulate } from '../engine/lookahead.js';
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
export const PLAYER_NAMES = { [HUMAN_ID]: 'Ty', [BOT_ID]: 'Nieprzyjaciel' };

/**
 * Feature 2026-08-11: stabilny klucz POJEDYNCZEJ opcji akcji (rzut czaru /
 * aktywacja zdolności) — do „ptaszka wyciszenia" w panelu „Twoje działania".
 * Zaznaczona opcja nie przerywa auto-passu (hasMeaningfulDecision ją pomija).
 * Klucz obejmuje wszystkie pola rozróżniające warianty: cel(e), X, tryb,
 * buyback/escape/adventure/bestow/morph, koszt alternatywny, crew/tap.
 */
export function commandOptionKey(cmd) {
  const fields = [
    'type', 'objectId', 'abilityIndex', 'targets', 'xValue', 'modeIndex',
    'buyback', 'payAltCost', 'bestow', 'faceDown', 'sacrificeTargetId',
    'stunTargetId', 'attackerId', 'crewCreatureIds', 'tapCreatureId',
    'tapOtherCreatureId', 'escapeExileIds',
  ];
  const out = {};
  for (const k of fields) if (cmd[k] !== undefined) out[k] = cmd[k];
  return JSON.stringify(out);
}
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

/**
 * Czytelnik zdarzeń silnika na polskie linie logu (modułowy, czysty —
 * testowalny bez sesji). helpers: { nameOf(cardId), nameOfObject(objectId) };
 * names: mapa playerId → imię stołu („Ty"/„Nieprzyjaciel"). Zwraca null dla
 * zdarzeń-dubletów (pomijanych w logu) albo surowy typ, gdy brak opisu —
 * KAŻDY nowy typ zdarzenia powinien dostać case (uwagi A/D 2026-08-10).
 */
/** Odmiana polska rzeczownika wg liczby: (1 → one, 2-4 → few, 5+ → many). */
function polishPlural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (n === 1) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

/** Diament (2026-08-11): odmiana „obrażenie/obrażenia/obrażeń" wg liczby. */
function dmgCount(n) {
    return `${n} ${polishPlural(n, 'obrażenie', 'obrażenia', 'obrażeń')}`;
  }

/** Polska lista wieloelementowa: „A", „A i B", „A, B i C" (audyt M83). */
function polishList(items) {
  const arr = items.filter(Boolean);
  if (arr.length <= 1) return arr.join('');
  if (arr.length === 2) return `${arr[0]} i ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')} i ${arr[arr.length - 1]}`;
}



export const TRIGGER_EVENT_LABELS = Object.freeze({
  another_creature_enters: 'wejście innego stworzenia',
  creature_you_control_enters: 'wejście stwora pod twoją kontrolą',
  other_creature_you_control_dies: 'śmierć kontrolowanego stwora',
  any_combat_damage_to_player: 'obrażenia bojowe zadane graczowi',
  any_creature_dies: 'śmierć stworzenia',
  attacks: 'atak',
  attacks_alone: 'samotny atak',
  aura_host_targeted_by_spell: 'gospodarz aury celem czaru',
  spell_targets_this_creature: 'twoja karta celuje w to stworzenie',
  bat_attacks: 'atak nietoperza',
  beginning_of_combat: 'początek walki',
  card_put_into_graveyard_from_nonbattlefield: 'karta do grobu spoza bitwiska',
  combat_damage_to_player: 'obrażenia bojowe graczowi',
  dies: 'śmierć stwora',
  enchanted_creature_damage_to_opponent: 'obrażenia zaczarowanego stwora',
  end_step: 'krok końca tury',
  enter_battlefield: 'wejście na bitwisko',
  equipped_creature_attacks: 'atak wyposażonego stwora',
  exploits: 'exploit',
  land_entered_under_opponent_control: 'wejście landa przeciwnika',
  land_entered_under_your_control: 'Landfall',
  leaves_battlefield: 'opuszczenie bitwiska',
  mentor_attacks: 'atak mentora',
  noncombat_damage_to_opponent: 'niebojowe obrażenia przeciwnikowi',
  other_permanent_you_control_dies: 'śmierć innego twojego permanentu',
  permanents_you_control_leave_battlefield: 'odejście twoich permanentów z bitwiska',
  player_casts_spell: 'rzucenie czaru przez gracza',
  turned_face_up: 'odkrycie twarzy',
  upkeep: 'krok upkeep',
  when_you_cast_spell: 'rzucenie czaru',
  you_cast_noncreature_spell: 'rzucenie czaru niebędącego stworem',
  you_cast_second_spell_each_turn: 'drugi czar w turze',
  saga_chapter: 'rozdział sagi',
});

/**
 * Polskie nazwy stref (M96, audyt Żywym Testerem): modal „Ruch przeciwnika"
 * pokazywał graczowi surowe identyfikatory z engine — „Segmented Krotiq —
 * library → hand". Reszta UI jest po polsku, więc to był przeciek techniczny.
 */
export const ZONE_LABELS = Object.freeze({
  battlefield: 'bitwisko',
  hand: 'ręka',
  graveyard: 'cmentarz',
  exile: 'wygnanie',
  library: 'biblioteka',
  stack: 'stos',
});

/** Nazwa strefy do logu; nieznany identyfikator zwraca „?" (jak dotąd). */
export function zoneLabel(zone) {
  if (!zone) return '?';
  return ZONE_LABELS[zone] ?? zone;
}

/**
 * Polskie nazwy keywordów w logu (M96): nadanie pośpiechu (Awaken the Sleeper,
 * Cogwork Assembler) było dla gracza niewidoczne — stwór bota nagle atakował
 * w turze wejścia bez śladu w modalu „Ruch przeciwnika".
 * Osobny słownik od render.js: render.js importuje z tego modułu, więc
 * zależność w drugą stronę utworzyłaby cykl (build.mjs by go nie skleił).
 */
const KEYWORD_EVENT_LABELS = Object.freeze({
  haste: 'pośpiech', flying: 'latanie', trample: 'zadeptywanie', reach: 'zasięg',
  vigilance: 'czujność', menace: 'postrach', lifelink: 'dotykanie życia',
  deathtouch: 'dotykanie śmierci', first_strike: 'pierwsze uderzenie',
  double_strike: 'podwójne uderzenie', hexproof: 'hexproof', indestructible: 'niezniszczalność',
  defender: 'obrońca', flash: 'flash', infect: 'infect', persist: 'persist',
  saddled: 'osiodłanie', exalted: 'egzaltacja',
});

export function describeGameEvent(e, helpers, names = PLAYER_NAMES) {
  const { nameOf, nameOfObject } = helpers;
  // Rozpoznanie „cel to gracz" — sesja przekazuje isPlayer (lookup state),
  // a testy mogą polegać na mapie imion (oba stołowe słowniki mapują p1/p2).
  const isPlayer = helpers.isPlayer ?? ((id) => names[id] != null);
  const whoN = (id) => names[id] ?? id;
    switch (e.type) {
      // Zdarzenia techniczne/ulotne — zbyt gadatliwe dla logu stołu.
      case 'priority_passed':
      case 'mana_changed':
      case 'object_tapped':
      case 'object_untapped':
      case 'damage_marked':
      case 'game_created':
        return null;
      case 'object_moved': {
        if (e.bounced) {
          const whoOwner = e.object?.controllerId ? whoN(e.object.controllerId) : 'właściciela';
          return `${nameOf(e.object?.cardId)} wraca do ręki (${whoOwner})`;
        }
        return null;
      }
      case 'command_rejected': return `Odrzucono: ${e.reason ?? 'nielegalna komenda'}`;
      case 'cant_block_granted': return `${nameOfObject(e.objectId)} nie może blokować do końca tury`;
      case 'spell_countered': return `${nameOf(e.cardId)} zostaje skontrowany${e.counteredByCardId ? ` (${nameOf(e.counteredByCardId)})` : (e.counteredBy ? ` (${nameOfObject(e.counteredBy)})` : '')}`;
      case 'sacrifice_choice_required': return `${whoN(e.playerId)} wskazuje stwora do poświęcenia`;
      case 'food_choice_required': return `${whoN(e.playerId)} rozstrzyga: poświęcić Food na +3 życia?`;
      case 'food_choice_resolved': return e.auto
        ? null
        : (e.sacrificed
          ? `${whoN(e.playerId)} poświęca Food i zdobywa 3 życia`
          : `${whoN(e.playerId)} nie poświęca Food`);
      case 'amass_choice_required': return `${whoN(e.playerId)} rozstrzyga: która Armia dostaje ${e.amount}/+${e.amount}?`;
      case 'amass_choice_resolved': return `${whoN(e.playerId)} wzmacnia Armię o ${e.amount} (amass)`;
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
      case 'card_drawn': {
        if (e.object?.cardId && e.playerId === HUMAN_ID) {
          return `${whoN(e.playerId)} dobiera: ${nameOf(e.object.cardId)}`;
        }
        if (e.object?.cardId && e.playerId === BOT_ID) {
          // FoW: nie pokazujemy nazwy dobranej karty przeciwnika
          return `${whoN(e.playerId)} dobiera kartę`;
        }
        return `${whoN(e.playerId)} dobiera kartę`;
      }
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
        // M73d (C): cel-gracz (Inspiration/Sweet Oblivion) — imię zamiast „?"
        // (nameOfObject helpersów nie zna graczy; audyt żywym testerem).
        // Diament (2026-08-11): cele niosą LKI (targetCardIds) — cel, który
        // zniknął z state.objects (token/śmierć), nie wyświetla się jako „?"
        // (audyt: „Bone Splinters → cel: ?"). Gracze (bez cardId) po imieniu.
        const targets = (e.targets ?? []).map((id, i) => {
          if (isPlayer(id)) return whoN(id);
          const cid = e.targetCardIds?.[i];
          return cid ? nameOf(cid) : nameOfObject(id);
        }).join(', ');
        const plotted = e.plotted ? ' z exile po plot' : '';
        const cleaved = e.cleaved ? ' z kosztem Cleave' : '';
        const adventure = e.adventure ? ' (przygoda)' : '';
        // M91 (uwaga D): czar modalny („Choose one" — Ruinous Rampage) bez
        // nazwy trybu był w logu bezużyteczny: gracz nie wiedział, czy dostanie
        // 3 obrażenia, czy straci artefakty.
        const mode = e.modeName ? ` — tryb: ${e.modeName}` : '';
        return `${whoN(e.playerId)} rzuca ${nameOf(e.cardId)}${mode}${plotted}${cleaved}${adventure}${targets ? ` → cel: ${targets}` : ''}`;
      }
      case 'spell_resolved': {
        const clashReturn = e.returnToHand ? ' — wygrany clash zwraca czar do ręki właściciela' : '';
        const adventureReturn = e.adventure ? ' — przygoda rozstrzygnięta, karta czeka w exile (można rzucić stwora)' : '';
        // M91 (uwaga D): rozstrzygnięcie czaru modalnego nazywa wybrany tryb.
        const modeName = e.modeName ? ` — tryb: ${e.modeName}` : '';
        return `${nameOf(e.cardId)}${modeName} zostaje rozstrzygnięty${e.fizzled ? ' (cel nielegalny — bez efektu)' : ''}${clashReturn}${adventureReturn}`;
      }
      case 'aura_spell_cast': {
        const targets = (e.targets ?? []).map((id) => (isPlayer(id) ? whoN(id) : nameOfObject(id))).join(', ');
        return `${whoN(e.playerId)} rzuca ${nameOf(e.cardId)} za koszt bestow → cel: ${targets}`;
      }
      case 'permanent_entered_battlefield': {
        if (e.unattached) return `${nameOf(e.cardId)} wchodzi na bitwisko jako stwór (cel bestow nielegalny przy rozstrzygnięciu)`;
        return `${nameOf(e.cardId)} wchodzi na bitwisko`;
      }
      case 'object_attached': {
        // M73d/Gold: hostCardId niesie LKI — objectId hosta mógł się zmienić
        // przy re-equip/re-attach i nameOfObject(hostId) zwracał „?".
        const hostName = e.hostCardId ? nameOf(e.hostCardId) : nameOfObject(e.hostId);
        if (e.via === 'equip') return `${nameOf(e.cardId)} wyposaża ${hostName}`;
        if (e.via === 'aura') return `${nameOf(e.cardId)} zaczarowuje ${hostName}`;
        return `${nameOf(e.cardId)} zostaje załączony do ${hostName} (bestow)`;
      }
      case 'object_detached': return e.becameKind === 'creature'
        ? `${nameOf(e.cardId)} odłącza się i znów jest stworem`
        : `${nameOf(e.cardId)} odłącza się i zostaje na bitwisku`;
      case 'stats_modified': {
        const sign = (v) => (v >= 0 ? `+${v}` : `${v}`);
        return `${nameOfObject(e.objectId)} dostaje ${sign(e.powerModifier)}/${sign(e.toughnessModifier)}`;
      }
      case 'attackers_declared': {
        // M66 (C): cardIds niosą LKI — po SBA obiekt atakującego może nie
        // istnieć (nowe ID w grobie) i nameOfObject zwracał „?".
        const ids = e.attackerIds ?? [];
        const cards = e.attackerCardIds ?? [];
        const names = ids.map((id, i) => (cards[i] ? nameOf(cards[i]) : nameOfObject(id)));
        return names.length ? `Atak: ${names.join(', ')}` : 'Brak ataku';
      }
      case 'blockers_declared': {
        // M66 (C): klucz przypisań to ATAKUJĄCY (wcześniej render mylił go
        // z blokerem); nazwy z mapy cards (LKI).
        const parts = Object.entries(e.assignments ?? {})
          .map(([attackerId, blockerIds]) => {
            const attackerName = (e.cards?.[attackerId] ? nameOf(e.cards[attackerId]) : nameOfObject(attackerId));
            const blockers = blockerIds.map((id) => (e.cards?.[id] ? nameOf(e.cards[id]) : nameOfObject(id)));
            const verb = blockers.length > 1 ? 'blokują' : 'blokuje';
            return `${polishList(blockers)} ${verb} ${attackerName}`;
          });
        return parts.length ? parts.join('; ') : 'Brak bloków';
      }
      case 'damage_dealt': {
        // M66 (C): cardIds niosą LKI — cel/source mógł umrzeć w SBA tego
        // samego rozstrzygnięcia (nameOfObject po starym ID dawał „?").
        const targetName = isPlayer(e.target)
          ? whoN(e.target)
          : (e.targetCardId ? nameOf(e.targetCardId) : nameOfObject(e.target));
        const sourceName = e.sourceCardId ? nameOf(e.sourceCardId) : nameOfObject(e.source);
        // M73d (E): 0 obrażeń to NIE zadane obrażenia (CR 119.3) — log nie
        // informuje „zadaje 0 obrażeń" (szum/mylące; audyt żywym testerem).
        if (e.amount <= 0) return null;
        return `${sourceName} zadaje ${dmgCount(e.amount)} (${targetName})`;
      }
      case 'damage_prevented': {
        const targetName = e.target != null && isPlayer(e.target)
          ? whoN(e.target)
          : (e.cardId ? nameOf(e.cardId) : nameOfObject(e.objectId));
        // Powód prewencji (audyt M84): protection / Inspire Awe / tarcza — żeby
        // gracz wiedział, DLACZEGO obrażenia nie doszły (nie tylko „zniwelowane").
        let reason = '';
        if (e.protection) reason = ' (ochrona przed kolorem)';
        else if (e.inspireAwe) reason = ' (Inspire Awe: prewencja obrażeń bojowych)';
        else if (e.shield) reason = ' (tarcza prewencji)';
        else reason = ' (prewencja)';
        return `Obrażenia (${e.amount}) do ${targetName} zapobiegnięte${reason}`;
      }
      case 'regeneration_shield_added': return `${nameOf(e.cardId)} — tarcza regeneracji (następne zniszczenie w tej turze)`;
      case 'permanent_regenerated': return `${nameOf(e.cardId)} zostaje zregenerowany — odtapowany, bez obrażeń`;
      case 'damage_shield_created': {
        const targetName = isPlayer(e.target)
          ? whoN(e.target) : nameOfObject(e.target);
        return `${nameOf(e.cardId)}: tarcza chroni ${targetName} przed ${e.remaining} kolejnymi obrażeniami`;
      }
      case 'permanent_animation_ended': return `${nameOfObject(e.objectId)} przestaje być stworzeniem (animacja źródła dobiegła końca)`;
      case 'damage_prevention_started': return `${nameOf(e.cardId)}: obrażenia zadawane ${e.filterDescription ?? 'chronionym obiektom'} będą niwelowane do końca tury`;
      case 'creature_destroyed': {
        // A/D (2026-08-11): w momencie rozstrzygnięcia walki obiekt ma NOWE id
        // w grobie (moveObjectDirectly), więc nameOfObject(fromId) zwracał „?".
        // Nazwa jedzie z cardId zdarzenia (jak permanent_destroyed w M70).
        const name = e.cardId ? nameOf(e.cardId) : nameOfObject(e.fromId);
        return `${name} ginie`;
      }
      case 'life_changed': return `${whoN(e.playerId)}: życie ${e.before} → ${e.after}`;
      case 'poison_counters_added': return `${whoN(e.playerId)} otrzymuje znaki trucizny (+${e.amount}, łącznie: ${e.after})`;
      case 'permanent_animated': {
        const duration = e.linkedTo ? ' (dopóki źródło jest na bitwisku)' : ' do końca tury';
        return `${nameOfObject(e.objectId)} staje się stworzeniem ${e.power}/${e.toughness}${duration}`;
      }
      case 'player_lost': {
        const reasons = {
          life_zero: 'brak życia',
          poison_ten: '10 znaków trucizny',
          empty_library: 'pusta biblioteka',
        };
        // CR 104.4b: gdy wszyscy gracze przegrywają jednocześnie, partia kończy
        // się REMISEM — bez tego log mówił tylko „przegrywa", a gracz nie
        // wiedział, że nikt nie wygrał.
        const draw = e.draw ? ' — partia kończy się REMISEM' : '';
        return `${whoN(e.playerId)} przegrywa (${reasons[e.reason] ?? e.reason})${draw}`;
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
        // Crew (CR 701.36): zatapnione stwory w logu.
        const crewPart = (e.crewCreatureIds ?? []).length
          ? ` — załoga: ${e.crewCreatureIds.map((id) => nameOfObject(id)).join(', ')}`
          : '';
        // Źródło mogło zniknąć w koszcie (Sacrifice this) — nazwa jedzie
        // wtedy z e.cardId, nie z lookupu po id obiektu (naprawione „?\" w logu).
        const sourceName = e.cardId ? nameOf(e.cardId) : nameOfObject(e.objectId);
        const desc = (e.effectTypes ?? [])
          .map((type) => ABILITY_EFFECT_LABELS[type])
          .filter(Boolean)
          .join(', ');
        return `${whoN(e.playerId)} aktywuje zdolność: ${sourceName}${desc ? ` — ${desc}` : ''}${xPart}${targets ? ` → cel: ${targets}` : ''}${crewPart}`;
      }
      // D (2026-08-11): zdolność aktywowana rozstrzygnięta ze stosu.
      case 'ability_resolved': {
        const srcName = e.cardId ? nameOf(e.cardId) : nameOfObject(e.sourceId);
        return `${whoN(e.playerId)}: zdolność ${srcName} rozstrzygnięta`;
      }
      case 'ability_triggered': {
        // Wybór celu już opisuje trigger_target_required — nie dubluj.
        if (e.awaitingTarget) return null;
        if (e.backup) return `${nameOf(e.cardId)} — trigger Backup: kontroler wskazuje stwora na liczniki`;
        if (e.sacrificed) return `${nameOf(e.cardId)} — trigger (${e.trigger}): brak zapłaty, permanent poświęcony`;
        if (e.paid != null) return `${nameOfObject(e.objectId)} — trigger (${e.trigger}): zapłacono {${e.paid}}${e.autoTapped ? ` (auto-tap: ${nameOfObject(e.autoTapped)})` : ''}`;
        const src = e.cardId ? nameOf(e.cardId) : nameOfObject(e.objectId);
        return `${src} — trigger (${TRIGGER_EVENT_LABELS[e.trigger] ?? e.trigger})`;
      }
      case 'land_type_changed': return `${nameOfObject(e.objectId)} staje się typem ${e.subtype} do końca tury`;
      case 'control_changed': return `${nameOf(e.cardId)} przechodzi pod kontrolę gracza ${whoN(e.controllerId)}`;
      case 'object_exiled': return `${nameOf(e.cardId)} zostaje wygnany${e.delayed ? ' (opóźniony trigger)' : ''}`;
      case 'permanent_sacrificed': return `${nameOf(e.cardId)} zostaje poświęcony`;
      // Uwagi właściciela A (2026-08-10): fromId NIE istnieje już w objects
      // (śmierć = nowy obiekt w grobie/exile) — nazwa jedzie z cardId
      // zdarzenia, inaczej log pokazywał „? zostaje zniszczony".
      case 'permanent_destroyed': {
        const name = e.cardId ? nameOf(e.cardId) : nameOfObject(e.fromId);
        const exileSuffix = e.toZone === 'exile' ? ' — odchodzi do wygnania (licznik finality)' : '';
        return `${name} zostaje zniszczony${exileSuffix}`;
      }
      // A/D: ban regeneracji (Rage of Purphoros, Expunge) — było surowe „cant_be_regenerated_set".
      case 'cant_be_regenerated_set': return `${nameOf(e.cardId)} nie może być regenerowany do końca tury`;
      // D: modalny trigger (Etherwrought Page — „At the beginning of your
      // upkeep, choose one") — było surowe „modal_trigger_required".
      case 'modal_trigger_required': return `${nameOf(e.cardId)} — wybierz tryb zdolności triggerowanej`;
      case 'modal_trigger_resolved': {
        const mode = e.modeName ? ` — tryb: ${e.modeName}` : '';
        return `${nameOf(e.cardId ?? nameOfObject(e.sourceId))} — gracz ${whoN(e.playerId)} wybiera tryb${mode}`;
      }
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
      // M96 (audyt Żywym Testerem): nadanie keywordu było dla gracza
      // niewidoczne — stwór bota z Awaken the Sleeper / Cogwork Assembler
      // nagle atakował w turze wejścia bez śladu w logu i w modalu.
      // Wyciszamy WYŁĄCZNIE keywordy z backupu (opisuje je backup_resolved,
      // kolejna linia byłaby dubletem) — reszta trafia do gracza.
      case 'keyword_granted': {
        if (e.viaBackup) return null;
        const granted = (e.keywords ?? [])
          .map((k) => KEYWORD_EVENT_LABELS[k] ?? k)
          .filter(Boolean);
        if (granted.length === 0) return null;
        const what = nameOf(e.cardId) || nameOfObject(e.objectId);
        return `${what} zyskuje: ${granted.join(', ')}`;
      }
      case 'scry_started': {
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} wykonuje scry (${e.amount === 1 ? `patrzy na 1 kartę: ${names}` : `patrzy na ${e.amount} kart: ${names}`})`;
        }
        return `${whoN(e.playerId)} wykonuje scry (${e.amount === 1 ? 'patrzy na 1 kartę' : `patrzy na ${e.amount} kart`})`;
      }
      case 'scry_resolved': return e.bottomCount > 0
        ? `${whoN(e.playerId)} kończy scry — odkłada na spód biblioteki (${e.bottomCount}/${e.total})`
        : `${whoN(e.playerId)} kończy scry — zostawia na wierzchu biblioteki`;
      case 'surveil_started': {
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} wykonuje surveil (patrzy na ${e.amount} kart: ${names})`;
        }
        return `${whoN(e.playerId)} wykonuje surveil (patrzy na ${e.amount} kart)`;
      }
      case 'surveil_resolved': return `${whoN(e.playerId)} kończy surveil — ${e.milledCount} ${e.milledCount === 1 ? 'karta idzie' : 'karty idą'} do grobu`;
      case 'index_started': {
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} wykonuje Index (patrzy na ${e.count} kart: ${names})`;
        }
        return `${whoN(e.playerId)} wykonuje Index (patrzy na ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')})`;
      }
      case 'index_resolved': return `${whoN(e.playerId)} kończy Index — przestawia karty na wierzchu biblioteki`;
      case 'look_top_started': {
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} patrzy na ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki (${names})`;
        }
        return `${whoN(e.playerId)} patrzy na ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki`;
      }
      case 'look_top_resolved': return `${whoN(e.playerId)} bierze kartę z wierzchu do ręki (reszta do grobu)`;
      case 'epic_experiment_started': return `${whoN(e.playerId)} wykonuje Epic Experiment — wygnano ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki`;
      case 'epic_experiment_resolved': return `${whoN(e.playerId)} kończy Epic Experiment (${e.restToGrave} ${polishPlural(e.restToGrave, 'karta', 'karty', 'kart')} do grobu)`;
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
      case 'legend_rule_choice_started': return `Prawo legend: ${whoN(e.playerId)} wybiera, który permanent „${e.name}” zostaje na bitwisku (pozostałe idą do grobu)`;
      case 'legend_rule_resolved': {
        const buried = (e.buriedCardIds ?? []).map((cid) => nameOf(cid)).join(', ');
        return `Prawo legend: zostaje ${nameOfObject(e.keepId)}${buried ? `, do grobu: ${buried}` : ''}`;
      }
      case 'token_created': {
        const who = whoN(e.controllerId);
        const verb = who === 'Ty' ? 'tworzysz' : 'tworzy';
        return `${who} ${verb} token ${e.name} (${e.power}/${e.toughness})`;
      }
      case 'shield_consumed': return `${nameOfObject(e.objectId)} zużywa tarczę (shield)`;
      case 'counter_added': return `${nameOfObject(e.objectId)} dostaje +${e.amount} licznik ${e.counter} (razem ${e.total})`;
      case 'counter_removed': {
        if (e.annihilated || e.counter === 'mixed') {
          return `${nameOfObject(e.objectId)}: anihilacja ${e.amount} par liczników +1/+1 i −1/−1`;
        }
        return `${nameOfObject(e.objectId)} traci ${e.amount} licznik ${e.counter} (zostało ${e.total})`;
      }
      case 'station_status_changed': return e.becameCreature
        ? `${nameOfObject(e.objectId)} osiąga ${e.chargeCounters} liczników charge i staje się artefaktowym stworem (Station)`
        : `${nameOfObject(e.objectId)} spada poniżej progu Station i przestaje być stworem`;
      case 'saga_chapter_fired': return `${nameOf(e.cardId)} — rozdział Sagi ${['', 'I', 'II', 'III', 'IV'][e.chapter] ?? e.chapter}`;
      case 'opponents_lands_tapped': return `Landy przeciwników ${whoN(e.playerId)} zostają zatapnięte (${e.count})`;
      case 'delayed_trigger_armed': return `${nameOf(e.cardId)} — opóźniony trigger: powrót na bitwisko w następnym upkeep gracza ${whoN(e.playerId)}`;
      case 'devour_choice_required': return `Devour (${nameOf(e.cardId)}): ${whoN(e.playerId)} może poświęcać inne swoje stwory (po ${e.counters}× +1/+1 za każdego)`;
      case 'devour_choice_resolved': {
        if (e.skipped) return `Devour (${nameOf(e.cardId)}): brak stworów do poświęcenia — decyzja gaśnie bez efektu`;
        if (e.targetCardId) {
          const counters = e.applied === false ? ' — źródło opuściło bitwisko, bez liczników' : ` — ${e.counters}× licznik +1/+1 na źródle`;
          return `Devour (${nameOf(e.cardId)}): ${nameOf(e.targetCardId)} poświęcony${counters}${e.autoClosed ? ' (brak dalszych stworów — koniec)' : ''}`;
        }
        return `Devour (${nameOf(e.cardId)}): ${whoN(e.playerId)} kończy poświęcanie`;
      }
      case 'endure_choice_required': return `Endure (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera — ${e.counters}× licznik +1/+1 albo token Spirit ${e.counters}/${e.counters}`;
      case 'endure_choice_resolved': return e.mode === 'token'
        ? `Endure (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera token Spirit ${e.counters}/${e.counters}`
        : `Endure (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera ${e.counters}× licznik +1/+1 na źródle`;
      case 'delirium_target_required': return `Delirium (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera stwora gracza ${whoN(e.opponentId)} — zdolność zada ${dmgCount(e.amount)}`;
      case 'delirium_target_resolved': {
        if (e.noEffect) return `Delirium (${nameOf(e.cardId)}): zdolność nic nie robi (za mało typów kart w grobie albo brak celu)`;
        const deliriumTarget = e.targetCardId ? nameOf(e.targetCardId) : nameOfObject(e.targetId);
        return `Delirium (${nameOf(e.cardId)}): ${deliriumTarget} otrzymuje ${dmgCount(e.amount)}`;
      }
      case 'mentor_target_required': return `Mentor (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera swojego atakującego o sile mniejszej niż ${e.sourcePower} — dostanie licznik +1/+1`;
      case 'mentor_target_resolved': {
        const mentorName = e.cardId ? nameOf(e.cardId) : 'źródło bez nazwy';
        if (e.noEffect) return `Mentor (${mentorName}): zdolność nic nie robi (brak legalnego celu przy rozstrzyganiu)`;
        const mentorTarget = e.targetCardId ? nameOf(e.targetCardId) : nameOfObject(e.targetId);
        return `Mentor (${mentorName}): ${mentorTarget} otrzymuje licznik +1/+1`;
      }
      case 'search_choice_required': {
        const source = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        const dest = e.destination === 'battlefield' ? 'na bitwisko' : 'do ręki';
        return `${whoN(e.playerId)} szuka karty w bibliotece${source} — wybiera, którą wziąć ${dest} albo rezygnuje`;
      }
      case 'search_choice_resolved': return e.found
        ? `${whoN(e.playerId)} znajduje kartę i tasuje bibliotekę`
        : `${whoN(e.playerId)} rezygnuje z szukania i tasuje bibliotekę`;
      case 'pay_or_sacrifice_required': return `${nameOfObject(e.sourceId)} — zapłać {${e.amount}} albo ją poświęć (wybór gracza)`;
      case 'pay_or_sacrifice_resolved': return e.paid
        ? `${whoN(e.playerId)} płaci {${e.amount}} za ${nameOfObject(e.sourceId)}`
        : `${whoN(e.playerId)} poświęca ${nameOfObject(e.sourceId)}`;
      case 'optional_pay_required': {
        const parts = [];
        if (e.payMana) parts.push(`{${e.payMana}}`);
        if (e.payLife) parts.push(`${e.payLife} życia`);
        return `${nameOf(e.cardId)} — zapłacić ${parts.join(' i ')}? (wybór gracza)`;
      }
      case 'optional_pay_resolved': return e.paid
        ? `${whoN(e.playerId)} płaci i odpala trigger`
        : `${whoN(e.playerId)} nie płaci — trigger nie odpala`;
      case 'trigger_target_required': {
        const hint = e.effectType === 'bounce_permanent'
          ? 'inny permanent do zwrotu na rękę'
          : (e.effectType === 'cant_be_blocked' ? 'stwora, który nie może być blokowany'
            : 'cel triggera');
        return `${nameOf(e.cardId)} — wybierz ${hint} (${e.allowNone ? 'można odmówić' : 'wymagany'})`;
      }
      case 'trigger_resolved': return e.noEffect
        ? `${nameOf(e.cardId)} — trigger bez efektu (warunek/cele nieaktualne)`
        : `${nameOf(e.cardId)} — trigger się rozstrzyga${e.delayed ? ' (opóźniony)' : ''}${e.saga ? ` (rozdział ${e.chapter})` : ''}`;
      // D: cel triggera może być GRACZEM (Selhoff Occultist: „target player
      // mills") — nameOfObject dawał „?". Źródło: cardId zdarzenia, inaczej
      // lookup po sourceId (nigdy pusta nazwa przed myślnikiem).
      case 'trigger_target_resolved': {
        const src = e.cardId ? nameOf(e.cardId) : nameOfObject(e.sourceId);
        if (e.noEffect) return `${src} — cel odrzucony, trigger bez efektu`;
        const target = e.targetId == null
          ? 'nic'
          : (isPlayer(e.targetId) ? whoN(e.targetId) : nameOfObject(e.targetId));
        return `${src} — cel: ${target}`;
      }
      case 'optional_trigger_required': return `${nameOf(e.cardId)} — skorzystać z efektu „you may"? (wybór gracza)`;
      case 'optional_trigger_resolved': return e.fired
        ? `${whoN(e.playerId)} korzysta z efektu „you may"`
        : `${whoN(e.playerId)} rezygnuje z efektu „you may"`;
      case 'mulligan_choice_resolved': return e.kept
        ? `${whoN(e.playerId)} zatrzymuje rękę otwarcia`
        : `${whoN(e.playerId)} mulliganuje`;
      case 'mulligan_taken': return `${whoN(e.playerId)} bierze mulligan (${e.count}) — nowa ręka 7 kart`;
      case 'mulligan_bottom_required': return `${whoN(e.playerId)} — odłóż ${e.count} kart${e.count === 1 ? 'ę' : 'y'} na spód biblioteki (mulligan londyński)`;
      case 'mulligan_bottom_resolved': return `${whoN(e.playerId)} odkłada karty na spód po mulliganie`;
      case 'game_started': return 'Obie ręce zatrzymane — gra się zaczyna';
      case 'moonlit_choice_required': return `${whoN(e.playerId)} — Moonlit Meditation: zastąpić tokeny kopiami zaczarowanego permanentu (${e.enchantedCardId ? nameOf(e.enchantedCardId) : ''})?`;
      case 'moonlit_choice_resolved': return e.replaced
        ? `${whoN(e.playerId)} tworzy kopie zaczarowanego permanentu`
        : `${whoN(e.playerId)} tworzy zwykłe tokeny`;
      case 'land_type_choice_required': return `${whoN(e.playerId)} wybiera podstawowy typ landa (${e.sourceCardId ? nameOf(e.sourceCardId) : 'Unstable Frontier'})`;
      case 'land_type_choice_resolved': return `${nameOfObject(e.targetId)} staje się typem ${e.landType} do końca tury`;
      case 'discard_choice_required': {
        const source = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        // Uwaga D (2026-08-11): rozróżniamy POWÓD odrzucenia — limit ręki
        // w cleanup to nie „efekt" (niegramatyczne i mylące).
        const why = e.purpose === 'cost' ? 'jako koszt'
          : e.purpose === 'hand_size' ? 'przy limicie ręki'
          : 'efektem';
        return `${whoN(e.playerId)} wybiera, którą kartę odrzucić ${why}${source}`;
      }
      case 'discard_choice_resolved': return e.purpose === 'cost'
        ? `${whoN(e.playerId)} odrzuca kartę (koszt zdolności)`
        : `${whoN(e.playerId)} odrzuca kartę z ręki`;
      case 'hand_top_choice_required': return `${whoN(e.playerId)} wybiera kartę z ręki na wierzch biblioteki (${e.sourceCardId ? nameOf(e.sourceCardId) : 'Chittering Rats'})`;
      case 'hand_top_choice_resolved': return `${whoN(e.playerId)} kładzie ${nameOf(e.cardId)} na wierzch biblioteki`;
      case 'graveyard_top_choice_required': return `${whoN(e.playerId)} wybiera karty-stwory z grobu na wierzch biblioteki (Forever Young)${e.candidateIds?.length ? ` — do wyboru ${e.candidateIds.length}` : ''}`;
      case 'graveyard_top_choice_resolved': return e.done
        ? `${whoN(e.playerId)} kończy wybieranie kart na wierzch biblioteki`
        : `${nameOf(e.cardId)} wraca z grobu na wierzch biblioteki`;
      case 'object_flipped': return null; // dublet turned_face_up (audyt M86)
      // --- Uwagi D (2026-08-10): żaden typ zdarzenia nie może wypaść w logu ---
      // --- surowo. „return null" = świadome pominięcie (dublet informacji). ---
      case 'cant_be_blocked_granted': return `${nameOf(e.cardId)} nie może być blokowany do końca tury`;
      case 'cards_milled': {
        // M73d (G2): odmiana „karta/karty/kart" (audyt żywym testerem).
        // M86: od spodu to NIE zawsze Sweet Oblivion (Cellar Door też mieli
        // od dołu) — bez twardej nazwy karty (ADR 0002).
        const karta = polishPlural(e.amount, 'kartę', 'karty', 'kart');
        return e.fromBottom
          ? `${whoN(e.playerId)} mieli ${e.amount} ${karta} od spodu biblioteki`
          : `${whoN(e.playerId)} mieli ${e.amount} ${karta} do grobu`;
      }
      case 'color_choice_required': return `${nameOfObject(e.auraId)} — wybór koloru (ochrona przed nim)`;
      case 'color_choice_resolved': {
        const COLOR_NAMES = { W: 'biały', U: 'niebieski', B: 'czarny', R: 'czerwony', G: 'zielony' };
        return `${nameOfObject(e.auraId)} — wybrany kolor: ${COLOR_NAMES[e.color] ?? e.color}`;
      }
      case 'damage_assignment_required': return `${whoN(e.playerId)} rozdziela obrażenia bojowe (trample albo wielu blokerów)`;
      case 'damage_assignment_resolved': return null; // linie damage_dealt zaraz to opiszą
      // M72 (Batch 29): generyczne rozdzielanie obrażeń niecombat (Fireball).
      case 'damage_target_required': return `${whoN(e.playerId)} wybiera cel ${dmgCount(e.amount)}${e.fromRevealed ? ` (odsłonięto „${e.fromRevealed}")` : ''}`;
      case 'damage_target_resolved': return `${whoN(e.playerId)} kieruje ${dmgCount(e.amount)} w ${isPlayer(e.targetId) ? whoN(e.targetId) : nameOfObject(e.targetId)}`;
      case 'day_night_changed': return `${e.designation === 'night' ? 'Zapada noc' : 'Wstaje dzień'} — karty z daybound/nightbound obracają się`;
      case 'exploit_choice_required': return `Exploit (${nameOf(e.cardId)}): ${whoN(e.playerId)} może poświęcić swojego stwora`;
      case 'exploited': return `Exploit: ${nameOfObject(e.exploitedId)} zostaje poświęcony dla ${nameOfObject(e.exploiterId)}`;
      case 'exploit_choice_resolved': return e.skipped
        ? `Exploit: ${whoN(e.playerId)} nie poświęca — zdolność odpada`
        : null; // poświęcenie opisuje linia „exploited"
      case 'fertile_thicket_reveal_started': return `Fertile Thicket: ${whoN(e.controllerId)} odsłania ${e.cardCount} ${polishPlural(e.cardCount, 'kartę', 'karty', 'kart')} z wierzchu biblioteki (bazowych landów: ${e.basicLandCount})`;
      case 'fertile_thicket_resolved': return e.skipped
        ? `Fertile Thicket: ${whoN(e.controllerId)} odkłada wszystkie odsłonięte karty na spód`
        : `Fertile Thicket: ${whoN(e.controllerId)} kładzie wybranego landa na wierzch, resztę na spód`;
      case 'springbloom_choice_required': return `Springbloom Druid: ${whoN(e.controllerId)} może poświęcić land`;
      case 'springbloom_resolved': return `Springbloom Druid: ${whoN(e.controllerId)} poświęca land — szuka do dwóch bazowych lądów`;
      case 'springbloom_skipped': return `Springbloom Druid: ${whoN(e.controllerId)} nie poświęca landa`;
      case 'optional_draw_required': return `${whoN(e.playerId)} może dobrać kartę (potem odrzuci — Force Away)`;
      case 'optional_draw_resolved': return e.drew
        ? `${whoN(e.playerId)} dobiera kartę (i zaraz odrzuci)`
        : `${whoN(e.playerId)} nie dobiera karty`;
      case 'proliferate_started': return `${whoN(e.playerId)} wykonuje proliferate — wskazuje permanenty/graczy z licznikami`;
      case 'proliferated': return `Proliferate: ${e.count} cel${e.count === 1 ? '' : 'ów'} dostaje dodatkowe liczniki`;
      // M96: bez tej gałęzi log pokazywał dosłownie „proliferate_resolved"
      // (fallback na nazwę zdarzenia) — przeciek identyfikatora do UI.
      case 'proliferate_resolved': return null;
      case 'proliferate_target_resolved': return e.count === 0
        ? `${whoN(e.playerId)} kończy proliferate bez celów`
        : null; // opisuje linia „proliferated"
      case 'redirect_choice_required': return `Willbender: ${whoN(e.playerId)} może zmienić cel czaru ${nameOf(e.cardId)}`;
      case 'redirect_choice_resolved': return e.toTarget == null
        ? `Willbender: cel czaru ${nameOf(e.cardId)} zostaje bez zmian`
        : `Willbender zmienia cel czaru ${nameOf(e.cardId)} na ${isPlayer(e.toTarget) ? whoN(e.toTarget) : nameOfObject(e.toTarget)}`;
      case 'reveal_started': {
        const names = (e.cardIds ?? []).filter(Boolean).map((cid) => nameOf(cid)).join(', ');
        return names
          ? `${whoN(e.playerId)} odsłania ${e.amount} ${polishPlural(e.amount, 'kartę', 'karty', 'kart')} z wierzchu biblioteki: ${names}`
          : `${whoN(e.playerId)} odsłania ${e.amount} ${polishPlural(e.amount, 'kartę', 'karty', 'kart')} z wierzchu biblioteki`;
      }
      case 'reveal_exile_required': return `Dreams of Steel and Oil: ${whoN(e.playerId)} ogląda rękę i grób gracza ${whoN(e.opponentId)} i wybiera kartę do wygnania`;
      case 'reveal_exile_hand_chosen': return `${whoN(e.playerId)} wskazuje ${nameOf(e.cardId)} z ręki przeciwnika`;
      case 'reveal_exile_grave_required': return `Dreams of Steel and Oil: ${whoN(e.playerId)} wybiera kartę z grobu przeciwnika do wygnania`;
      case 'reveal_exile_grave_chosen': return e.cardId
        ? `${whoN(e.playerId)} wskazuje ${nameOf(e.cardId)} z grobu przeciwnika`
        : `${whoN(e.playerId)} nie wskazuje karty z grobu`;
      case 'reveal_exile_resolved': return `Dreams of Steel and Oil: wybrane karty zostają wygnane`;
      case 'reveal_order_resolved': return `Stomping Slabs: ${whoN(e.playerId)} układa odsłonięte karty na spodzie biblioteki`;
      case 'speed_changed': return `${whoN(e.playerId)} zwiększa prędkość (speed: ${e.speed})`;
      case 'turned_face_up': return `${nameOf(e.cardId)} zostaje obrócony twarzą do góry`;
      case 'enter_as_copy_resolved': return e.targetId
        ? `${whoN(e.playerId)} kopiuje ${nameOfObject(e.targetId)} przy wejściu`
        : `${whoN(e.playerId)} nie kopiuje — stwór wchodzi jako 0/0`;
      case 'destroy_equipment_choice_resolved': return e.destroy
        ? `${whoN(e.playerId)} niszczy equipment na ${nameOfObject(e.targetId)}`
        : `${whoN(e.playerId)} zostawia equipment na ${nameOfObject(e.targetId)}`;
      default: return e.type;
    }
  }

/**
 * @param {{ seed: number, registry: object, decks: Map<string, string[]>,
 *   humanId?: string, botFactory?: (seed: number) => object,
 *   pauseOnBotMoves?: boolean }} config
 */
export function createSession(config) {
  const { seed, registry, decks } = config;
  // Feature 2026-08-11: opcje wyciszone przez gracza (ptaszek w panelu akcji)
  // nie przerywają auto-passu. Zbiór współdzielony z UI (main.js) — sesja
  // tylko czyta, UI mutuje.
  const ignoredOptionKeys = config.ignoredOptionKeys ?? new Set();
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
    // M73d (C): cel-gracz (np. Inspiration „target player draws") — imię
    // zamiast „?" (audyt żywym testerem: „rzuca Inspiration → cel: ?").
    if (state.players.some((pl) => pl.id === objectId)) return who(objectId);
    const object = state.objects.get(objectId);
    if (!object) return '?';
    // Face-down (morph/megamorph, CR 708.2): tożsamość ukryta przed
    // przeciwnikiem — „morph" zamiast „?" w etykietach celów/logu
    // (audyt żywym testerem M73c).
    if (object.faceDown) return 'morph';
    return nameOf(object.cardId);
  }

  function who(playerId) {
    return PLAYER_NAMES[playerId] ?? playerId;
  }

  /** M73d (D): polskie nazwy zdarzeń triggerów — log i stos (audyt żywym testerem). */


/** Opis zdarzenia przez modułowego czytelnika (wstrzyknięte nazwy stanu). */
  function describeEvent(e, names = PLAYER_NAMES) {
    // Uwaga A (2026-08-12): tłumimy natychmiastowy library_searched po
    // search_choice_resolved — search_choice_resolved już opisuje wynik
    // („znajduje kartę i tasuje bibliotekę"). library_searched z innych ścieżek
    // (typecycling, pokoje lochu, bez search_choice) nadal się loguje.
    if (e.type === 'library_searched' && suppressNextLibrarySearched) {
      suppressNextLibrarySearched = false;
      return null;
    }
    if (e.type === 'search_choice_resolved') {
      suppressNextLibrarySearched = true;
    }
    return describeGameEvent(e, {
      nameOf, nameOfObject,
      isPlayer: (id) => state.players.some((player) => player.id === id),
    }, names);
  }

  /**
   * Czy zdarzenie bota warto pokazać graczowi w modalu? Pomijamy szum
   * (passy, mana, kroki tury, techniczne przenosiny obiektów) — reszta
   * (czary, zdolności, triggery, walka, tokeny, liczniki, życie) to realna
   * informacja o tym, co zrobił przeciwnik.
   */
  // Uwaga C (2026-08-12): w modalu ruchu bota pokazujemy zmiany TURY i FAZY
  // („Tura 5 — Nieprzyjaciel"/„Faza: Walka") podczas ciągłego ruchu bota —
  // bez tego gracz nie wie, że przed akcją zaczęła się nowa tura/faza.
  const STEP_LABELS = Object.freeze({
    untap: 'Odkręcenie', upkeep: 'Podtrzymanie', draw: 'Dobieranie',
    beginning_of_combat: 'Początek walki', declare_attackers: 'Deklaracja atakujących',
    declare_blockers: 'Deklaracja blokujących', combat_damage: 'Obrażenia w walce',
    end_of_combat: 'Koniec walki', end: 'Krok końcowy', cleanup: 'Sprzątanie',
  });
  // Etykieta fazy dla nagłówka „Faza: …" — BEZ słowa „faza" w środku, żeby
  // nie dublować prefiksu (audyt M83: „Faza: Faza główna").
  const stepLabelOf = (e) => (e.step === 'main'
    ? (e.phase === 'postcombat_main' ? 'Główna 2' : 'Główna 1')
    : (STEP_LABELS[e.step] ?? e.step));

  // card_drawn z draw_step to szum (krok tury) — pomijamy w modalu.
  // card_drawn z source="effect" (draw_cards z czaru: Curate, Phyrexian
  // Rager, Evangel, Curiosity itd.) jest istotny — gracz chce widzieć,
  // że przeciwnik dobrał X kart (zgłoszenie właściciela 2026-08-13,
  // M89 zadanie A).
  const BOT_MOVE_NOISE = new Set([
    'priority_passed', 'mana_changed', 'mana_produced', 'step_advanced',
    'turn_started', 'object_tapped', 'object_untapped', 'damage_marked',
    'object_moved', 'game_created', 'stats_modified',
  ]);
  const isCardDrawnNoise = (e) => e.type === 'card_drawn' && e.source !== 'effect';

  /** Zdarzenia, przy których warto pokazać ilustrację zagranej karty. */
  const BOT_MOVE_CARD_EVENTS = new Set([
    'spell_cast', 'permanent_cast', 'aura_spell_cast', 'ability_activated', 'trigger_target_required', 'trigger_target_resolved', 'trigger_resolved', 'modal_trigger_required', 'modal_trigger_resolved', 'optional_trigger_required', 'optional_trigger_resolved', 'mulligan_choice_resolved', 'mulligan_taken', 'mulligan_bottom_required', 'mulligan_bottom_resolved', 'game_started', 'regeneration_shield_added', 'permanent_regenerated', 'permanent_destroyed', 'cant_be_regenerated_set',
    'ability_triggered', 'spell_resolved', 'permanent_entered_battlefield',
    // Zagranie lądu też pokazuje skan (zgłoszenie 2026-08-06: „zagrywa
    // Swamp" bez ilustracji) — landy podstawowe mają imageUri.
    'land_played',
    // M89 (Curate modal): card_drawn z draw_cards efektu — modal ruchu
    // bota pokazuje dobraną kartę (gracz chce widzieć, co bot dobrał
    // z efektu czaru, np. Curate Surveil 2 + Draw 1).
    'card_drawn',
    // M89 cd. (bug C): token_created (Carrion Call, Raise the Alarm,
    // Scourge of Skemfar itd.) — modal ruchu bota MUSI pokazać wpis
    // o tokenie, choćby z syntetyczną twarzą (tokeny mają cardId typu
    // `token_*` bez imageUri — render wyświetli syntetyczną miniaturę).
    // Wcześniej token_created było w BOT_PAUSE_EVENTS (pauza), ale brak
    // cardId w botMoves powodował pominięcie wpisu w modalu.
    'token_created',
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
    'ability_activated', 'ability_resolved', 'ability_triggered',
    'object_moved', 'object_exiled', 'permanent_destroyed', 'creature_destroyed',
    'permanent_sacrificed', 'permanent_put_into_graveyard',
    'token_created', 'permanent_entered_battlefield',
  ]);

  // Uwaga C (2026-08-12): śledzimy ostatnią FAZĘ pokazaną w modalu ruchu bota,
  // żeby dodawać nagłówek „Faza: …" tylko przy ZMIANIE fazy (nie co krok).
  let lastBotPhaseKey = null;
  // Uwaga A (2026-08-12, po merge PR #44): nagłówek fazy jest OCZEKUJĄCY —
  // wypychamy go dopiero, gdy w tej fazie pojawi się prawdziwa akcja.
  // Puste „Faza: Odkręcenie / Dobieranie / Sprzątanie" znikały z raportu.
  let pendingBotPhase = null;
  // Uwaga A (2026-08-12): search_choice_resolved i library_searched są emitowane
  // razem dla tego samego szukania (game-state). W logu/modalu pokazujemy tylko
  // search_choice_resolved („znajduje kartę i tasuje"); natychmiastowy
  // library_searched był DUBLETEM. Flaga tłumi go, dopóki nie pojawi się
  // inny event (szukania z innych ścieżek — typecycling, pokoje — logują się).
  let suppressNextLibrarySearched = false;
  // Uwaga A: dla modala — jeśli poprzednim ruchem był search_choice_resolved,
  // kolejny library_searched (ten sam szukanie) pomijamy (dublet).
  let lastBotMoveWasSearchResolved = false;
  function noteBotMove(e) {
    // Rejestrujemy zdarzenia z RZECZYWISTEGO ruchu bota (botActing).
    // Uwaga D/E (2026-08-11): isBotAdvancing jest prawdą także podczas
    // auto-przewijania faz CZŁOWIEKA (advance() passuje też jego end/cleanup),
    // więc zdarzenia decyzji człowieka (np. discard_choice_required przy limicie
    // ręki) trafiały do modala „Ruch przeciwnika". botActing jest prawdą tylko
    // w gałęzi BOTA w advance().
    //
    // Wyjątki (uwagi A/B1, 2026-08-12):
    // - turn_started ZAWSZE (początek tury dowolnego gracza — także po
    //   auto-passie cleanup człowieka, gdy zaczyna się tura bota);
    // - CAŁA faza walki (phase === 'combat'): resolve_combat człowieka idzie
    //   w advance() bez botActing. Whitelista typów (tylko damage_dealt z
    //   flagą combat) gubiła bloki, obrażenia stwór–stwór (event bez
    //   combat:true), truciznę (infect) i triggery z walki — to, co działało
    //   przed M75, gdy isBotAdvancing obejmował auto-resolve.
    const inCombatReport = state.turn.phase === 'combat';
    if (!botActing && e.type !== 'turn_started' && !inCombatReport) return;
    let text;
    // Nowa tura: nagłówek „Tura N — <gracz>". Zawsze (uwaga A).
    if (e.type === 'turn_started') {
      pendingBotPhase = null;
      lastBotPhaseKey = null;
      botMoves.push({ type: 'turn_started', text: `Tura ${state.turn.number} — ${who(e.playerId)}`, cardId: null });
      return;
    }
    // Uwaga A (modal): pomiń library_searched bezpośrednio po
    // search_choice_resolved — wynik szukania już pokazany.
    if (e.type === 'library_searched' && lastBotMoveWasSearchResolved) {
      lastBotMoveWasSearchResolved = false;
      return;
    }
    if (e.type === 'search_choice_resolved') lastBotMoveWasSearchResolved = true;
    else lastBotMoveWasSearchResolved = false;
    if (e.type === 'step_advanced') {
      const key = `${e.number}:${e.phase}:${e.step}`;
      if (key !== lastBotPhaseKey) {
        lastBotPhaseKey = key;
        pendingBotPhase = { type: 'step_advanced', text: `Faza: ${stepLabelOf(e)}`, cardId: null };
      }
      return;
    }

    // M80 (audyt żywym testerem): „Brak ataku" to nie-pozycja — brak ataku
    // przeciwnika nie zasługuje na modal „Ruch przeciwnika" (szum, pusta faza).
    // Zdarzenie z pustą listą atakujących pomijamy w całości (także nie zostawiamy
    // pustego nagłówka fazy dla tej akcji).
    if (e.type === 'attackers_declared' && !(e.attackerIds?.length)) return;
    // M83 (audyt żywym testerem): „Brak bloków" (puste przypisania) to też
    // nie-pozycja — nie zasługuje na modal (szum jak „Brak ataku").
    if (e.type === 'blockers_declared' && Object.keys(e.assignments ?? {}).length === 0) return;
    if (BOT_MOVE_NOISE.has(e.type) || isCardDrawnNoise(e)) {
      // Szum logu — pomijamy, CHYBA że zdarzenie jest pauzowalne: zmiana
      // strefy karty (object_moved) ma być pokazana w modalu ruchu bota,
      // choć do logu nie trafia (decyzja o gadatliwości logu zostaje).
      if (!BOT_PAUSE_EVENTS.has(e.type)) return;
      const movedName = nameOf(e.object?.cardId ?? state.objects.get(e.fromId)?.cardId);
      text = `${who(e.object?.controllerId)}: ${movedName} — ${zoneLabel(e.fromZone)} → ${zoneLabel(e.toZone)}`;
    } else {
      text = describeEvent(e);
      if (!text) return;
    }
    // Faza tylko razem z akcją (uwaga A).
    if (pendingBotPhase) {
      botMoves.push(pendingBotPhase);
      pendingBotPhase = null;
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

  // Filter: only record bot events in the modal
  function isHumanEvent(e) {
    return (e.playerId ?? e.object?.controllerId ?? e.sourceControllerId) === HUMAN_ID;
  }

  // Pauza po każdym istotnym zagraniu bota (decyzja właściciela 2026-08-05):
  // gdy `pauseOnBotMoves` jest włączone, sesja zatrzymuje się po zagraniu,
  // którego strumień zdarzeń niesie BOT_PAUSE_EVENTS, i czeka na klik
  // (session.continueBotPlay). Domyślnie wyłączone, żeby konsumenci
  // synchroniczni (testy, narzędzia) zachowali dotychczasowy przebieg.
  const pauseOnBotMoves = config.pauseOnBotMoves === true;
  let awaitingBotAck = false;
  let isBotAdvancing = false;
  // Uwaga D/E: prawda tylko w gałęzi BOTA w advance() — botMoves/pauza dotyczą
  // wyłącznie ruchu bota, nie auto-passu faz człowieka.
  let botActing = false;

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
    isBotAdvancing = true;
    while (state.status === 'active') {
      if (guard++ > 5000) throw new Error('advance: brak postępu sesji');
      if (state.turn.priorityPlayerId === BOT_ID) {
        const helpers = { simulate: makeSimulate(state) };
        const cmd = bot.chooseCommand(playerView(state, BOT_ID), helpers);
        captureBotReasoning();
        botActing = true;
        const result = execute(state, cmd);
        if (!result.ok) throw new Error(`Bot wybrał nielegalną komendę: ${result.events[0]?.reason}`);
        const significant = streamAutoEvents(result.events);
        botActing = false;
        if (pauseOnBotMoves && significant) { awaitingBotAck = true; isBotAdvancing = false; return; }
        continue;
      }
      const view = playerView(state, HUMAN_ID);
      if (hasMeaningfulDecision(view)) { isBotAdvancing = false; return; }
      // Rozstrzygnięcie walki idzie automatycznie (pass jest tam zablokowany).
      const resolve = view.legalCommands.find((cmd) => cmd.type === 'resolve_combat');
      if (resolve) {
        const result = execute(state, resolve);
        if (!result.ok) throw new Error(`Auto-resolve odrzucony: ${result.events[0]?.reason}`);
        // Uwaga E (2026-08-11): pauza dotyczy ruchów BOTA — auto-resolve walki
        // CZŁOWIEKA nie otwiera „Ruchu przeciwnika". Log/botMoves mimo to
        // zbieramy (streamAutoEvents); significant ignorujemy.
        streamAutoEvents(result.events);
        continue;
      }
      const pass = execute(state, { type: 'pass_priority', playerId: HUMAN_ID });
      if (!pass.ok) throw new Error(`Auto-pass odrzucony: ${pass.events[0]?.reason}`);
      // Uwaga E: auto-pass faz CZŁOWIEKA (koniec tury, cleanup) nie pauzuje —
      // „Brak akcji"/modale ruchu przeciwnika w środku własnej tury (audyt:
      // auto-pass zatrzymał się w Głównej 2 po wyciszeniu opcji).
      streamAutoEvents(pass.events);
    }
  }

  /**
   * Czy człowiek ma teraz realną decyzję? Sam pass, samo tapnięcie lądu,
   * pusta deklaracja ataku/bloków i rozstrzygnięcie walki bez odpowiedzi
   * NIE są decyzją — auto-pass ma przewijać sekcje tury, w których gracz
   * nie może zrobić nic sensownego (untap, upkeep, własne puste main itd.).
   *
   * Źródłem prawdy jest wyłącznie PlayerView.legalCommands — to engine
   * (a nie heurystyki UI) decyduje, co jest wykonalne: oferty rzutów idą
   * po manie PRODUKOWALNEJ z auto-tapem (M34) i po kolorowej walidacji
   * many (M41), a zdolności/cele — po pełnej legalności. Historia: sesja
   * liczyła „potencjał" ręcznie (mana za nietapnięte landy, bez kolorów)
   * i zatrzymywała grę w oknach, gdzie gracz miał tylko pass — np. biała
   * karta w ręce przy samych górach (pip koloru niespłacalny) albo zdolność
   * z wymaganiami, których engine nie oferuje. Takie okna to fałszywe
   * pozytywy: gracz klikał „Dalej" w każdej sekcji tury.
   */
  function hasMeaningfulDecision(view) {
    if (view.status !== 'active') return false;
    const decisions = view.legalCommands.filter((c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type));
    return decisions.some((cmd) => {
      // Feature 2026-08-11: gracz może wyciszyć konkretną opcję (ptaszek
      // w panelu akcji) — taka opcja nie przerywa auto-passu. Inne opcje
      // nadal przerywają; odznaczenie przywraca przerywanie.
      if (ignoredOptionKeys.has(commandOptionKey(cmd))) return false;
      // Puste deklaracje ataku/bloków nie są decyzją (engine oferuje je
      // zawsze w kroku deklaracji — bez stworów to czysty pass).
      if (cmd.type === 'declare_attackers') return (cmd.attackerIds?.length ?? 0) > 0;
      if (cmd.type === 'declare_blockers') return Object.keys(cmd.assignments ?? {}).length > 0;
      // Wszystko inne w legalCommands (rzut, ląd, zdolność, resolve_*,
      // draw_card) to realna, wykonalna akcja — engine za nią ręczy.
      return true;
    });
  }

  sessionLog('system', `Nowa partia (seed ${seed}). Powodzenia!`);
  // Log ręki startowej gracza (A) – FoW: pokazujemy tylko własną rękę, nie przeciwnika.
  {
    const humanHandIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === HUMAN_ID);
    const humanHandNames = humanHandIds.map((id) => nameOf(state.objects.get(id)?.cardId)).filter(Boolean);
    if (humanHandNames.length > 0) {
      sessionLog('system', `Ręka startowa ${PLAYER_NAMES[HUMAN_ID]}: ${humanHandNames.join(', ')}`);
    }
    const botHandCount = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === BOT_ID).length;
    if (botHandCount > 0) {
      sessionLog('system', `Ręka startowa ${PLAYER_NAMES[BOT_ID]}: ${botHandCount} kart`);
    }
  }
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
    clearBotMoves() { botMoves.length = 0; lastBotPhaseKey = null; pendingBotPhase = null; lastBotMoveWasSearchResolved = false; },
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
      // M90 (bug B, zgłoszenie właściciela 2026-08-14): stan sesji zmienia
      // WYŁĄCZNIE zaakceptowana komenda. Wcześniej `apply` czyścił bufor
      // modala i kasował pauzę bota PRZED `execute()` — gdy engine odrzucił
      // komendę (`not_priority`, bo priorytet miał bot wstrzymany pauzą),
      // gracz zostawał bez pauzy i bez „▶ Wznów grę bota": w legalCommands
      // było samo `concede`, czyli ekran „Poddaj partię" bez wyjścia.
      const result = execute(state, cmd);
      if (!result.ok) {
        sessionLog('rejection', `Ruch odrzucony: ${result.events[0]?.reason}`);
        return { ok: false, reason: result.events[0]?.reason };
      }
      // Modal „Ruch bota" ma pokazywać odpowiedź na TEN ruch gracza,
      // a nie historię od początku partii.
      botMoves.length = 0;
      // Konsument nie powinien aplikować komendy w trakcie pauzy (UI blokuje
      // ją modalem) — po UDANEJ komendzie niedokończoną pauzę ignorujemy
      // i gramy dalej.
      awaitingBotAck = false;
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
    /**
     * Feature 2026-08-11: po zmianie zbioru wyciszonych opcji przewija grę,
     * jeśli bieżące okno człowieka nie ma już żadnej nie-wyciszonej decyzji
     * (auto-pass do następnego realnego okna / tury bota). No-op, gdy okno
     * nadal wymaga decyzji.
     */
    recheckAutoPass() {
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
