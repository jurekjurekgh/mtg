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
  const bot = botFactory(seed + 1);
  const names = Object.entries(PLAYER_NAMES).map(([id, name]) => ({ id, name }));
  const state = setupCardMatch({ seed, players: names, decks, registry });
  const nameById = new Map(registry.all().map((card) => [card.id, card.name]));
  const colorsById = new Map(registry.all().map((card) => [card.id, card.colors ?? []]));
  const log = []; // { kind: 'event'|'rejection'|'system', text }
  const sessionLog = (kind, text) => log.push({ kind, text });

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
      case 'land_played': return `${who(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}`;
      case 'mana_produced': return `${who(e.playerId)} przygotowuje manę (${nameOfObject(e.source)})`;
      case 'permanent_cast': return `${who(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}`;
      case 'spell_cast': {
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        return `${who(e.playerId)} rzuca ${nameOf(e.cardId)}${targets ? ` → cel: ${targets}` : ''}`;
      }
      case 'spell_resolved':
        return `${nameOf(e.cardId)} zostaje rozstrzygnięty${e.fizzled ? ' (cel nielegalny — bez efektu)' : ''}`;
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
      default: return e.type;
    }
  }

  function runBot() {
    // Bot gra, póki ma priorytet i nie oddał go passem/deklaracją.
    let guard = 0;
    while (state.status === 'active' && state.turn.priorityPlayerId === BOT_ID) {
      if (guard++ > 200) throw new Error('runBot: brak postępu sesji');
      const cmd = bot.chooseCommand(playerView(state, BOT_ID));
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

  function skipPassOnlyWindows() {
    // Okna, w których człowiekowi zostaje wyłącznie pass/concede, przechodzą
    // automatycznie; prawdziwe decyzje zawsze zostają u człowieka.
    let guard = 0;
    while (state.status === 'active' && state.turn.priorityPlayerId === HUMAN_ID) {
      if (guard++ > 200) throw new Error('skipPassOnlyWindows: brak postępu sesji');
      const view = playerView(state, HUMAN_ID);
      const meaningful = view.legalCommands.filter((c) => !['pass_priority', 'concede'].includes(c.type));
      if (meaningful.length > 0) return;
      passOnceForHuman();
    }
  }

  sessionLog('system', `Nowa partia (seed ${seed}). Powodzenia!`);
  skipPassOnlyWindows();
  runBot();
  skipPassOnlyWindows();

  return {
    state,
    nameOf,
    nameOfObject,
    /** Kolory karty (do akcentów w UI); nieznane id → pusta lista. */
    colorsOf(cardId) {
      return colorsById.get(cardId) ?? [];
    },
    log,
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
}
