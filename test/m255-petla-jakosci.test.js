// M255 (2026-08-29) — pętla jakości Żywym Testerem po Batchu 51 (ADR 0021).
//
// 12 partii na taliach, które dostały nowe karty (ravnica, tarkir-bg/wur,
// warhammer-brg/wu, theros, worek-mroczny, dominaria-wu), profile
// explorer/greedy/defensive/impatient/random, detektory: 0 zgłoszeń.
// Poniżej to, co wyszło z lektury transkryptów (L27/L40 — zero detektorów to
// dolna granica, nie dowód jakości):
//
// A. `buff_creature_until_end_of_turn` nie ogłaszał skutku żadnym zdarzeniem,
//    więc `resolveTrigger` czytał „0 zdarzeń” jako „trigger bez efektu” i log
//    KŁAMAŁ graczowi (Kulrath Mystic dostał realnie +2/+0 i czujność). Ta sama
//    klasa co M138/Z4 dla `set_base_pt_until_end_of_turn`. Po naprawie M254/E
//    kłamstwo dotyczyłoby też Altara of the Goyf (właściciel zgłaszał właśnie
//    ten komunikat — po naprawie celu nadal by go widział).
// B. Bloodrush (Skinbrand Goblin) — log nie nazywał mechaniki ani faktu, że
//    odrzucenie karty jest KOSZTEM (wzorzec: cycling / Morph / Equip).
// C. `ABILITY_EFFECT_LABELS` nie miało wpisów dla `buff_attacking_creatures`
//    i `buff_creature_until_end_of_turn` — aktywacja Thunderstaffa w logu to
//    było gołe „Nieprzyjaciel aktywuje zdolność: Thunderstaff" (klasa L84:
//    nowy deskryptor ma cztery dowiązania; tu: etykieta logu).
// D. Dynamiczne P/T (Altar of the Goyf, Jyoti, Tarmogoyf) traciło „+X/+X" —
//    panel mówił „Gdy atakuje samotnie: liczba typów kart w grobach do końca
//    tury", jakby treścią efektu była definicja X, a nie premia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { describeSpellEffects } from '../src/table/render.js';
import { PLAYER_NAMES, describeGameEvent, isBotMoveNoise } from '../src/table/session.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 255, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

/** Przepycha stos passami priorytetu i zwraca WSZYSTKIE zdarzenia z drogi. */
function resolveStackCollecting(state, limit = 24) {
  const seen = [];
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    seen.push(...(r.events ?? []));
  }
  return seen;
}

const LOG_HELPERS = { nameOf: (id) => id, nameOfObject: (id) => id };
const logLine = (e) => describeGameEvent(e, LOG_HELPERS, PLAYER_NAMES);

// =============================================================================
// A — skutek bez zdarzenia = log, który kłamie (Kulrath Mystic)
// =============================================================================

test('M255/A1: Kulrath Mystic — trigger „gdy rzucisz czar MV ≥ 4” NIE loguje „bez efektu”', () => {
  const state = game('p1', 'main');
  put(state, 'mystic', 'kulrath-mystic', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'big', 'voice-of-the-vermin', 'p1', 'hand'); // mana value 4
  addMana(state, 'p1', 6, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'big');
  assert.ok(cast, 'czar MV 4 do rzucenia');
  execute(state, cast);
  const seen = resolveStackCollecting(state);

  const buff = (state.untilEndOfTurnBuffs ?? []).find((b) => b.objectId === 'mystic');
  assert.ok(buff, 'buff do końca tury wchodzi na Mystica (+2/+0 i czujność)');
  assert.ok(seen.some((e) => e.type === 'stats_modified' && e.objectId === 'mystic'),
    'skutek jest OGŁOSZONY zdarzeniem (inaczej „0 zdarzeń” = „bez efektu”)');
  assert.ok(seen.some((e) => e.type === 'keyword_granted' && (e.keywords ?? []).includes('vigilance')),
    'czujność też ma być widoczna w logu');

  const resolved = seen.find((e) => e.type === 'trigger_resolved' && e.cardId === 'kulrath-mystic');
  assert.ok(resolved, 'trigger się rozstrzygnął');
  assert.equal(resolved.noEffect, undefined,
    'flaga noEffect to kłamstwo, gdy buff realnie wszedł na stwora');
  const line = logLine(resolved);
  assert.ok(!/bez efektu/.test(line), `log nie może mówić „bez efektu”: ${line}`);
});

test('M255/A2: Altar of the Goyf — po naprawie celu (M254/E) log NADAL nie może kłamać', () => {
  const state = game('p1', 'declare_attackers');
  put(state, 'altar', 'altar-of-the-goyf', 'p1', 'battlefield');
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'g-creature', 'goblin-piker', 'p1', 'graveyard');
  put(state, 'g-instant', 'shock', 'p2', 'graveyard');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(r.ok, 'deklaracja ataku');
  const seen = resolveStackCollecting(state);

  assert.equal(effectivePower(state.objects.get('atk'), state), 4, '2 typy kart w grobach → +2/+2');
  assert.equal(effectiveToughness(state.objects.get('atk'), state), 3);
  const resolved = seen.find((e) => e.type === 'trigger_resolved' && e.cardId === 'altar-of-the-goyf');
  assert.ok(resolved, 'trigger Altara się rozstrzygnął');
  assert.equal(resolved.noEffect, undefined,
    'właściciel zgłaszał „trigger bez efektu” — po naprawie celu komunikat musi zniknąć, nie zmienić treść');
});

// =============================================================================
// B — bloodrush: log nazywa mechanikę i koszt odrzucenia
// =============================================================================

test('M255/B1: log nazywa bloodrush (wzorzec cycling / Morph / Equip)', () => {
  const line = logLine({
    type: 'ability_activated', playerId: 'p1', objectId: 'grave-0',
    cardId: 'skinbrand-goblin', abilityIndex: 0, effectTypes: ['pump'],
    targets: ['atk'], onStack: true, bloodrush: true,
  });
  assert.ok(/bloodrush/i.test(line),
    `mechanika ma być nazwana po imieniu (gracz widział: „${line}”)`);
  assert.ok(/odrzuc/i.test(line), `koszt odrzucenia karty ma być w logu: ${line}`);
});

test('M255/B2: odrzucenie karty jako KOSZT różni się od zwykłego odrzucenia', () => {
  const line = logLine({
    type: 'card_discarded', playerId: 'p1', cardId: 'skinbrand-goblin',
    cost: true, bloodrush: true,
  });
  assert.ok(/koszt/i.test(line),
    `bez dopisku wygląda jak strata karty z ręki, a to cena zdolności: ${line}`);
});

// =============================================================================
// C — strażnik: każdy typ efektu zdolności aktywowanej ma opis w logu
// =============================================================================

test('M255/C1 (strażnik): aktywacja dowolnej zdolności z katalogu niesie OPIS efektu w logu', () => {
  const types = new Set();
  for (const def of REGISTRY.all()) {
    if (def.support?.status !== 'supported') continue; // wzorzec strażników m179/A2a
    for (const ability of def.abilities ?? []) {
      if (ability?.type !== 'activated') continue;
      const effects = Array.isArray(ability.effect) ? ability.effect : ability.effect ? [ability.effect] : [];
      for (const e of effects) if (e?.type) types.add(e.type);
    }
  }
  assert.ok(types.size > 20, `katalog niesie zdolności aktywowane (typów: ${types.size})`);
  const missing = [...types].filter((type) => {
    const line = logLine({
      type: 'ability_activated', playerId: 'p1', objectId: 'o', cardId: 'X', effectTypes: [type],
    });
    return !String(line).includes(' — ');
  });
  assert.deepEqual(missing, [],
    `typy efektów bez opisu w logu (gracz widzi gołą nazwę karty): ${missing.join(', ')}`);
});

test('M255/C2: Thunderstaff — aktywacja loguje CO robi zdolność', () => {
  const line = logLine({
    type: 'ability_activated', playerId: 'p2', objectId: 'ts', cardId: 'thunderstaff',
    abilityIndex: 1, effectTypes: ['buff_attacking_creatures'],
  });
  assert.ok(/—/.test(line), `etykieta efektu musi być w logu: ${line}`);
  assert.ok(/atakuj/i.test(line), `opis mówi o atakujących stworach: ${line}`);
});

// =============================================================================
// D — dynamiczne P/T: panel pokazuje +X/+X, a definicję X osobno
// =============================================================================

test('M255/D1: Altar of the Goyf — „+X/+X (X = liczba typów kart w grobach)”', () => {
  const text = describeSpellEffects({
    effects: [{
      type: 'buff_creature_until_end_of_turn',
      power: 'card_types_in_all_graveyards',
      toughness: 'card_types_in_all_graveyards',
    }],
  });
  assert.ok(/\+X\/\+X/.test(text),
    `panel musi powiedzieć, że stwór DOSTAJE premię (widziałem: „${text}”)`);
  assert.ok(text.includes('liczba typów kart w grobach'), `definicja X zostaje: ${text}`);
});

test('M255/D2: Tarmogoyf — różne wartości dynamiczne to +X/+Y z dwiema definicjami', () => {
  const text = describeSpellEffects({
    effects: [{
      type: 'pump',
      power: 'card_types_in_all_graveyards',
      toughness: 'card_types_in_all_graveyards_plus_1',
    }],
  });
  assert.ok(/\+X\/\+Y/.test(text), `premia i dwie definicje (widziałem: „${text}”)`);
  assert.ok(text.includes('liczba typów kart w grobach'), `definicja X: ${text}`);
  assert.ok(text.includes('liczba typów kart w grobach +1'), `definicja Y: ${text}`);
  assert.ok(!text.includes('card_types_in_all_graveyards_plus_1'),
    `surowy slug nie może trafić do panelu: ${text}`);
});

test('M255/D3 (anty-over-fix): zwykłe liczby dalej drukują się jako +P/+T', () => {
  const text = describeSpellEffects({ effects: [{ type: 'pump', power: 2, toughness: 1 }] });
  assert.ok(text.includes('+2/+1'), `liczby bez zmian: ${text}`);
});

// =============================================================================
// E — bot: „atakujące stwory dostają +1/+0” (Thunderstaff) tylko w oknie walki
// =============================================================================

function thunderstaffState(step) {
  const state = game('p1', step);
  put(state, 'staff', 'thunderstaff', 'p1', 'battlefield');
  put(state, 'atk', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'foe', 'segmented-krotiq', 'p2');
  addMana(state, 'p1', 4);
  return state;
}

test('M255/E1: bot NIE pali {2} + tap na Thunderstaffa w Głównej 1 (nikt nie atakuje)', () => {
  // Transkrypt r1-twur-whwu-s37, tura 16: „Nieprzyjaciel aktywuje zdolność:
  // Thunderstaff” w Głównej 1 → „zdolność rozstrzygnięta” bez ŻADNEGO skutku
  // (efekt wygasa w cleanup — klasa M96/firebreathing).
  const state = thunderstaffState('main');
  const chosen = createHeuristicBot({ seed: 5 }).chooseCommand(playerView(state, 'p1'));
  const isStaff = chosen.type === 'activate_ability' && chosen.objectId === 'staff';
  assert.ok(!isStaff,
    `premia „do końca tury” poza walką to wyrzucanie many (wybrał: ${JSON.stringify(chosen)})`);
});

test('M255/E2 (anty-over-fix): bot UŻYWA Thunderstaffa, gdy jego stwory atakują', () => {
  const state = thunderstaffState('declare_attackers');
  const attack = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('atk'));
  assert.ok(attack, 'atak legalny');
  assert.ok(execute(state, attack).ok);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.priorityPlayerId = 'p1';
  const chosen = createHeuristicBot({ seed: 5 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.type, 'activate_ability', `oczekiwano aktywacji (wybrał: ${JSON.stringify(chosen)})`);
  assert.equal(chosen.objectId, 'staff', '+1/+0 dla atakujących ma wartość w oknie walki');
});

test('M255/A3: buff „do końca tury” NIE jest szumem w modalu — gracz widzi „+2/+0”', () => {
  const e = { type: 'stats_modified', objectId: 'm', powerModifier: 2, toughnessModifier: 0, untilEndOfTurn: true };
  assert.equal(isBotMoveNoise(e, { botActing: false, stackSize: 0 }), false,
    'własny trigger (Kulrath Mystic) też ma pokazać skutek, nie tylko „zyskuje: czujność”');
  assert.equal(isBotMoveNoise(e, { botActing: true, stackSize: 0 }), false,
    'ruch bota — bez zmian (M99)');
});

test('M255/A4 (anty-over-fix): „stats_modified” bez „do końca tury” zostaje szumem (M99)', () => {
  assert.equal(isBotMoveNoise({ type: 'stats_modified', objectId: 'm', powerModifier: 2 }, { botActing: false, stackSize: 0 }), true,
    'P/T przeliczane przy każdym zdarzeniu to szum — nie zalewamy modalu');
  assert.equal(isBotMoveNoise({ type: 'stats_modified', objectId: 'm' }, { botActing: false, stackSize: 2 }), false,
    'M99: skutek czaru/zdolności bota zostaje widoczny');
  assert.equal(isBotMoveNoise({ type: 'mana_changed' }, {}), true, 'mana to szum');
  assert.equal(isBotMoveNoise({ type: 'card_drawn', source: 'effect', playerId: 'p2' }, { humanId: 'p1' }), false,
    'dobranie z efektu to treść (M89)');
  assert.equal(isBotMoveNoise({ type: 'card_drawn', source: 'draw_step', playerId: 'p2' }, { humanId: 'p1' }), true,
    'dobranie bota w kroku dobierania to szum (M100/E8)');
});
