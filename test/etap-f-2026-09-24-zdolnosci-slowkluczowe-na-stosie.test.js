// Etap F/3 (PR #135, polecenie właściciela: „żadnych uproszczeń wpływających
// na grę") — zdolności wyzwalane słów kluczowych, które silnik dotąd
// rozstrzygał W CHWILI WYZWOLENIA, z pominięciem stosu (CR 603.3: zdolność
// wyzwalana idzie na stos następnym razem, gdy gracz miałby otrzymać
// priorytet; CR 603.5: wybór „may" przy rozstrzyganiu):
// - exploit (CR 702.110a — „When this creature enters, you may sacrifice
//   a creature"),
// - endure z ETB (Kin-Tree Nurturer — „When this creature enters, it
//   endures 1"; CR 701.63),
// - suspend, druga zdolność (CR 702.62a — „At the beginning of your upkeep,
//   if this card is suspended, remove a time counter from it"),
// - rebound (CR 702.88a — opóźniona zdolność „At the beginning of your next
//   upkeep, you may cast this card from exile…"); dawniej druga karta
//   z rebound w tym samym upkeepie w ogóle nie dostawała decyzji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { processTriggers } from '../src/engine/triggers.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game(step = 'main', active = 'p1') {
  const state = createGameState({ seed: 6033, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  return state;
}

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId}`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const pass = (state) => execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
const triggersOnStack = (state) => state.zones.stack.map((id) => state.objects.get(id)).filter((o) => o?.kind === 'trigger');
const onBattlefield = (state, cardId) => [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield');

test('Exploit (CR 702.110a + 603.3/603.5): zdolność na stosie; wybór ofiary przy rozstrzyganiu', () => {
  const state = game();
  put(state, 'drowner', 'gurmag-drowner', 'p1', 'hand');
  put(state, 'elk', 'highland-game', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'drowner' }).ok);
  pass(state); pass(state); // stwór się rozstrzyga
  assert.equal(state.pendingExploits.length, 0, 'brak decyzji w chwili wejścia');
  const [entry] = triggersOnStack(state);
  assert.equal(entry?.triggerEntry?.ability?.keyword, 'exploit', 'zdolność exploit na stosie');
  // Okno odpowiedzi: przeciwnik usuwa Łosia, zanim exploit się rozstrzygnie.
  moveObjectDirectly(state, 'elk', 'graveyard', 'grave-elk');
  pass(state); pass(state);
  assert.equal(state.pendingExploits.length, 1, 'decyzja przy rozstrzyganiu');
  const drowner = onBattlefield(state, 'gurmag-drowner');
  assert.deepEqual(state.pendingExploits[0].candidateIds, [drowner.id],
    'kandydaci liczeni TERAZ — Łosia już nie ma, zostaje sam exploiter');
});

test('Endure z ETB (CR 701.63 + 603.3): na stosie; gdy źródło zniknie w odpowiedzi — tylko token', () => {
  const state = game();
  put(state, 'kin', 'kin-tree-nurturer', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kin' }).ok);
  pass(state); pass(state);
  assert.equal(state.pendingEndures.length, 0, 'brak decyzji w chwili wejścia');
  const endureEntry = triggersOnStack(state).find((o) => o.triggerEntry?.ability?.keyword === 'endure');
  assert.ok(endureEntry, 'zdolność endure na stosie');
  const kin = onBattlefield(state, 'kin-tree-nurturer');
  moveObjectDirectly(state, kin.id, 'graveyard', 'grave-kin');
  for (let i = 0; i < 6 && state.pendingEndures.length === 0 && state.zones.stack.length > 0; i += 1) pass(state);
  assert.equal(state.pendingEndures.length, 1, 'decyzja przy rozstrzyganiu');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_endure_choice');
  assert.deepEqual(offers.map((c) => c.mode), ['token'], 'CR 701.63b: źródła nie ma — tylko token Spirit');
});

test('Suspend (CR 702.62a + 603.3): zdjęcie licznika to zdolność na stosie', () => {
  const state = game('upkeep');
  put(state, 'susp', 'mindstab', 'p1', 'exile', { suspended: true, timeCounters: 2 });
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning', activePlayerId: 'p1' }]);
  assert.equal(state.objects.get('susp').timeCounters, 2, 'licznik nietknięty, dopóki zdolność czeka');
  assert.equal(triggersOnStack(state)[0]?.triggerEntry?.ability?.keyword, 'suspend');
  pass(state); pass(state);
  assert.equal(state.objects.get('susp').timeCounters, 1, 'rozstrzygnięcie zdjęło licznik');
  assert.equal(state.zones.stack.length, 0, 'nie ostatni licznik — brak suspend_ready');
});

test('Suspend: ostatni licznik zdjęty przez rozstrzygnięcie wyzwala suspend_ready (też na stos)', () => {
  const state = game('upkeep');
  put(state, 'susp', 'mindstab', 'p1', 'exile', { suspended: true, timeCounters: 1 });
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning', activePlayerId: 'p1' }]);
  pass(state); pass(state);
  assert.equal(state.objects.get('susp').timeCounters, 0);
  assert.equal(state.pendingSuspendCast, null, 'decyzja rzutu dopiero po rozstrzygnięciu suspend_ready');
  assert.equal(triggersOnStack(state)[0]?.triggerEntry?.ability?.trigger?.event, 'suspend_ready');
  pass(state); pass(state);
  assert.ok(state.pendingSuspendCast, 'rzuć za darmo albo zostaw');
});

test('Rebound (CR 702.88a + 603.7): każda karta dostaje własną zdolność na stosie i własną decyzję', () => {
  const state = game('upkeep');
  put(state, 'b1', 'ojutais-breath', 'p1', 'exile', { reboundReady: true });
  put(state, 'b2', 'ojutais-breath', 'p1', 'exile', { reboundReady: true });
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning', activePlayerId: 'p1' }]);
  assert.equal(state.pendingReboundCast, null, 'brak decyzji w chwili wyzwolenia');
  assert.equal(triggersOnStack(state).length, 2, 'dwie zdolności rebound na stosie');
  const decided = [];
  for (let i = 0; i < 8 && decided.length < 2; i += 1) {
    if (state.pendingReboundCast) {
      decided.push(state.pendingReboundCast.objectId);
      assert.ok(execute(state, { type: 'resolve_rebound_cast', playerId: 'p1', cast: false }).ok);
      continue;
    }
    pass(state);
  }
  assert.deepEqual([...decided].sort(), ['b1', 'b2'], 'obie karty dostały decyzję w tym samym upkeepie');
});
