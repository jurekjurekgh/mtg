import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { triggerTargetPowerPumpOf } from '../src/engine/effect-intent.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * B (znalezisko właściciela 2026-09-12, Battle-Rattle Shaman): trigger
 * „na początku combatu możesz dać stworowi +2/+0" bot celował w NAJWIĘKSZY
 * własny stwór — także z chorobą przywoływania, który atakować NIE MOŻE.
 * +2/+0 do końca tury na nie-atakującym wygasa bez skutku (trigger odpala
 * się PRZED deklaracją ataku, więc bonus M167/A za atakujących nie działa).
 *
 * Reguła generyczna (ADR 0002): silnik niesie w ofercie `pump` (dodatni
 * pump SIŁY z deskryptora — bliźniak `debuff`), a bot przy pumpie siły
 * na WŁASNEJ turze premiuje stwora zdolnego do ataku (proxy zamiaru ataku:
 * odkręcony, bez choroby / z haste) i karze niezdolnego (-60, skala
 * zabójstwa — przy planszy samych chorych wygrywa odmowa).
 */

const REGISTRY = createCardRegistry();

function newState(step = 'beginning_of_combat', active = 'p1') {
  const state = createGameState({ seed: 1209, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, controllerId = 'p1', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield',
    kind: over.kind ?? data.kind, power: over.power ?? data.power,
    toughness: over.toughness ?? data.toughness, manaCost: over.manaCost ?? data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: over.keywords ?? def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: over.summoningSickness ?? false,
    tapped: over.tapped ?? false,
  }));
  return state.objects.get(id);
}

/** Oczekująca decyzja celu PRAWDZIWEGO triggera Shamana (jak bot-quality-m150). */
function pendShaman(state, candidates) {
  const shamanDef = REGISTRY.get('battle-rattle-shaman');
  const shaman = state.objects.get('shaman');
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: shaman.id,
    cardId: shaman.cardId,
    ability: shamanDef.abilities[0],
    candidates: [...candidates],
    allowNone: true,
    fixedTargetIds: [],
    extra: {},
    restorePriorityTo: 'p1',
  });
}

function botPick(state) {
  const bot = createHeuristicBot({ seed: 1209 });
  return bot.chooseCommand(playerView(state, 'p1'));
}

test('B/1: oferta niesie sygnał pumpu siły (+2/+0 Shamana)', () => {
  const state = newState();
  put(state, 'shaman', 'battle-rattle-shaman', 'p1');
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const offers = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'resolve_trigger_target');
  assert.ok(offers.length >= 2, 'cele + odmowa');
  assert.ok(offers.every((cmd) => cmd.friendly === true), 'friendly jak w M150');
  assert.deepEqual(offers[0].pump, { power: 2, toughness: 0 });
});

test('B/2: sygnał pumpu tylko dla dodatniej SIŁY (toughness-only i debuff poza)', () => {
  assert.deepEqual(
    triggerTargetPowerPumpOf({ effect: { type: 'pump', power: 2, toughness: 0 } }),
    { power: 2, toughness: 0 });
  assert.deepEqual(
    triggerTargetPowerPumpOf({ effect: { type: 'buff_creature_until_end_of_turn', power: 1, toughness: 1 } }),
    { power: 1, toughness: 1 });
  // +0/+3: chory stwór nadal blokuje — brak sygnału „musi atakować".
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'pump', power: 0, toughness: 3 } }), null);
  // Ujemny pump to debuff (gałąź wroga), nie cel ataku.
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'pump', power: -1, toughness: -1 } }), null);
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'add_counter', counter: '+1/+1' } }), null);
  assert.equal(triggerTargetPowerPumpOf({}), null);
});

test('B/3: bot buffuje zdrowego małego, NIE chorego olbrzyma (sedno zgłoszenia)', () => {
  const state = newState();
  // Sam Shaman tapnięty (nie atakuje) — jedyny słuszny cel to zdrowy scout.
  put(state, 'shaman', 'battle-rattle-shaman', 'p1', { tapped: true });
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const chosen = botPick(state);
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'scout',
    `+2/+0 ma iść na stwora zdolnego do ataku: ${JSON.stringify(chosen)}`);
});

test('B/4: chory z haste MOŻE atakować — wraca do gry (większy wygrywa)', () => {
  const state = newState();
  put(state, 'shaman', 'battle-rattle-shaman', 'p1');
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true, keywords: ['haste'] });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const chosen = botPick(state);
  assert.equal(chosen.targetId, 'brute',
    `haste znosi chorobę — 5/5 bije 2/2: ${JSON.stringify(chosen)}`);
});

test('B/5: plansza samych chorych — bot ODMÓWIA (jałowy buff gorszy niż brak)', () => {
  const state = newState();
  put(state, 'shaman', 'battle-rattle-shaman', 'p1', { tapped: true });
  put(state, 'brute', 'highland-game', 'p1', { power: 2, toughness: 2, summoningSickness: true });
  pendShaman(state, ['brute']);
  const chosen = botPick(state);
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, null,
    `nikt nie atakuje — „you may" zostaje niewybrane: ${JSON.stringify(chosen)}`);
});

test('B/6: cudza tura — pump siły wspiera BLOK, wraca stara polityka (największy)', () => {
  const state = newState('main', 'p2');
  put(state, 'shaman', 'battle-rattle-shaman', 'p1');
  put(state, 'brute', 'highland-game', 'p1', { power: 5, toughness: 5, summoningSickness: true });
  put(state, 'scout', 'highland-game', 'p1', { power: 2, toughness: 2 });
  pendShaman(state, ['brute', 'scout']);
  const chosen = botPick(state);
  assert.equal(chosen.targetId, 'brute',
    `w cudzej turze chory 5/5 blokuje najlepiej: ${JSON.stringify(chosen)}`);
});
