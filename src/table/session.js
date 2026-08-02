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
 *
 * Moduł nie dotyka DOM-u (testowalny headless); renderowanie i zdarzenia
 * myszy są w render.js/main.js.
 */

export const HUMAN_ID = 'p1';
export const BOT_ID = 'p2';
export const PLAYER_NAMES = { [HUMAN_ID]: 'Ty', [BOT_ID]: 'Bot' };

function defaultBotFactory(seed) {
  return createHeuristicBot({ seed });
}

/**
 * @param {{ seed: number, registry: object, decks: Map<string, string[]>,
 *   humanId?: string, botFactory?: (seed: number) => object }} config
 */
export function createSession(config) {
  const { seed, registry, decks } = config;
  if (!(decks instanceof Map) || decks.size !== 2) throw new TypeError('Sesja wymaga dwóch talii (Map)');
  if (!decks.has(HUMAN_ID) || !decks.has(BOT_ID)) throw new TypeError('Talia musi istnieć dla gracza i bota');
  const botFactory = config.botFactory ?? defaultBotFactory;
  let bot = botFactory(seed + 1);
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

  function describeEvent(e) {
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
      case 'step_advanced': return `— ${e.phase}/${e.step} —`;
      case 'turn_started': return `Tura gracza ${who(e.playerId)}`;
      case 'card_drawn': return `${who(e.playerId)} dobiera kartę`;
      case 'land_played': return `${who(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}${e.entersTapped ? ' (wchodzi zatapnięty)' : ''}`;
      case 'mana_produced': return `${who(e.playerId)} przygotowuje manę (${nameOfObject(e.source)})`;
      case 'permanent_cast': {
        if (e.faceDown) return `${who(e.playerId)} zagrywa ${nameOf(e.object?.cardId)} twarzą w dół (2/2)`;
        return `${who(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}`;
      }
      case 'spell_cast': {
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        return `${who(e.playerId)} rzuca ${nameOf(e.cardId)}${targets ? ` → cel: ${targets}` : ''}`;
      }
      case 'spell_resolved':
        return `${nameOf(e.cardId)} zostaje rozstrzygnięty${e.fizzled ? ' (cel nielegalny — bez efektu)' : ''}`;
      case 'aura_spell_cast': {
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        return `${who(e.playerId)} rzuca ${nameOf(e.cardId)} za koszt bestow → cel: ${targets}`;
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
      case 'damage_dealt': return `${nameOfObject(e.source)} zadaje ${e.amount} obrażeń (${nameOfObject(e.target)})`;
      case 'creature_destroyed': return `${nameOfObject(e.fromId)} ginie`;
      case 'life_changed': return `${who(e.playerId)}: życie ${e.before} → ${e.after}`;
      case 'player_lost': return `${who(e.playerId)} przegrywa (${e.reason})`;
      case 'player_conceded': return `${who(e.playerId)} poddaje partię`;
      case 'ability_activated': {
        if (e.attackerId) return `${who(e.playerId)} używa Ninjutsu (${nameOfObject(e.objectId)} wchodzi zamiast ${nameOfObject(e.attackerId)})`;
        if (e.cycling) return `${who(e.playerId)} aktywuje cycling: ${nameOf(e.cardId)}`;
        if (e.keyword === 'equip') {
          const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
          return `${who(e.playerId)} wyposaża: ${nameOfObject(e.objectId)} → ${targets}`;
        }
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        const xPart = e.xValue != null ? ` (X=${e.xValue})` : '';
        return `${who(e.playerId)} aktywuje zdolność (${nameOfObject(e.objectId)})${xPart}${targets ? ` → cel: ${targets}` : ''}`;
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
        };
        return `${nameOfObject(e.objectId)} — trigger (${triggerLabels[e.trigger] ?? e.trigger})`;
      }
      case 'permanent_sacrificed': return `${nameOf(e.cardId)} zostaje poświęcony`;
      case 'permanent_put_into_graveyard': return `${nameOf(e.cardId)} trafia do grobu (aura bez legalnego gospodarza)`;
      case 'card_revealed': return `${who(e.playerId)} odsłania ${nameOf(e.cardId)}`;
      case 'library_searched': return e.foundCardId
        ? `${who(e.playerId)} przeszukuje bibliotekę i tasuje`
        : `${who(e.playerId)} przeszukuje bibliotekę (bez trafienia) i tasuje`;
      case 'backup_resolved': {
        const grants = e.grantedKeywords?.length ? ` i zyskuje ${e.grantedKeywords.join(', ')} do końca tury` : '';
        return `Backup (${nameOf(e.sourceCardId)}): ${nameOfObject(e.targetId)} dostaje ${e.counters}× +1/+1${grants}`;
      }
      // keyword_granted opisuje backup_resolved — kolejna linia byłaby dubletem.
      case 'keyword_granted': return null;
      case 'scry_started': return `${who(e.playerId)} wykonuje scry (${e.amount === 1 ? 'patrzy na 1 kartę' : `patrzy na ${e.amount} kart`})`;
      case 'scry_resolved': return e.bottomCount > 0
        ? `${who(e.playerId)} kończy scry — odkłada na spód biblioteki (${e.bottomCount}/${e.total})`
        : `${who(e.playerId)} kończy scry — zostawia na wierzchu biblioteki`;
      case 'object_transformed': return `${nameOf(e.fromCardId)} przemienia się w ${nameOf(e.cardId)}`;
      case 'token_created': return `${who(e.controllerId)} tworzy token ${e.name} (${e.power}/${e.toughness})`;
      case 'counter_added': return `${nameOfObject(e.objectId)} dostaje +${e.amount} licznik ${e.counter} (razem ${e.total})`;
      case 'counter_removed': return `${nameOfObject(e.objectId)} traci ${e.amount} licznik ${e.counter} (zostało ${e.total})`;
      case 'object_flipped': return `${nameOfObject(e.objectId)} obraca się twarzą do góry`;
      default: return e.type;
    }
  }

  function runBot() {
    // Bot gra, póki ma priorytet i nie oddał go passem/deklaracją.
    let guard = 0;
    while (state.status === 'active' && state.turn.priorityPlayerId === BOT_ID) {
      if (guard++ > 200) throw new Error('runBot: brak postępu sesji');
      const cmd = bot.chooseCommand(playerView(state, BOT_ID));
      captureBotReasoning();
      const result = execute(state, cmd);
      if (!result.ok) throw new Error(`Bot wybrał nielegalną komendę: ${result.events[0]?.reason}`);
      for (const e of result.events) {
        const text = describeEvent(e);
        if (text) sessionLog('event', text);
      }
    }
  }

  function passOnceForHuman() {
    const result = execute(state, { type: 'pass_priority', playerId: HUMAN_ID });
    if (!result.ok) throw new Error(`Auto-pass odrzucony: ${result.events[0]?.reason}`);
    runBot();
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

  function skipPassOnlyWindows() {
    // Okna bez realnej decyzji przechodzą automatycznie: sam pass, sytuacje
    // z samym tapnięciem landów bez wykonalnego zagrania (także po odkręceniu
    // landów), puste deklaracje ataku/bloków oraz rozstrzygnięcie walki bez
    // odpowiedzi (pass jest tam zablokowany, więc wykonujemy resolve_combat).
    let guard = 0;
    while (state.status === 'active' && state.turn.priorityPlayerId === HUMAN_ID) {
      if (guard++ > 200) throw new Error('skipPassOnlyWindows: brak postępu sesji');
      const view = playerView(state, HUMAN_ID);
      if (hasMeaningfulDecision(view)) return;
      const resolve = view.legalCommands.find((cmd) => cmd.type === 'resolve_combat');
      if (resolve) {
        const result = execute(state, resolve);
        if (!result.ok) throw new Error(`Auto-resolve odrzucony: ${result.events[0]?.reason}`);
        for (const e of result.events) {
          const text = describeEvent(e);
          if (text) sessionLog('event', text);
        }
        runBot();
        continue;
      }
      passOnceForHuman();
    }
  }

  sessionLog('system', `Nowa partia (seed ${seed}). Powodzenia!`);
  skipPassOnlyWindows();
  runBot();
  skipPassOnlyWindows();

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
    exportReplayText() {
      return serializeReplay(replayFromState(state));
    },
    view() {
      return playerView(state, HUMAN_ID);
    },
    /** Wykonuje komendę człowieka przez protokół; zwraca { ok, reason? }. */
    apply(cmd) {
      const result = execute(state, cmd);
      if (!result.ok) {
        sessionLog('rejection', `Ruch odrzucony: ${result.events[0]?.reason}`);
        return { ok: false, reason: result.events[0]?.reason };
      }
      for (const e of result.events) {
        const text = describeEvent(e);
        if (text) sessionLog('event', text);
      }
      runBot();
      skipPassOnlyWindows();
      return { ok: true };
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
      bot = botFactory(seed + 1 + replay.commands.length);
      reasoning.length = 0; // świeży bot = świeży ślad decyzji
      sessionLog('system', `Wznowiono zapis (${replay.commands.length} komend).`);
      skipPassOnlyWindows();
      runBot();
      skipPassOnlyWindows();
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
