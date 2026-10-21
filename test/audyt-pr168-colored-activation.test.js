// Audyt PR #168/A-8: `cost.mana` oznacza CAŁKOWITY koszt, wliczając pipy
// `cost.colors`. Dwie karty batcha 69 zapisywały {R}/{G} jako mana:0 —
// samo sprawdzenie źródła koloru nie oznacza płatności (CR 602.1a/601.2h).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();
function game() {
  const state = createGameState({ seed: 168, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}
function put(state, id, cardId, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types,
    subtypes: def.subtypes, keywords: def.keywords });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}
function activate(state, id) {
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === id);
  assert.ok(offer, `brak oferty zdolności ${id}`);
  const result = execute(state, offer);
  assert.equal(result.ok, true, result.reason ?? 'nieudana aktywacja');
}
const mana = (s) => s.players.find((p) => p.id === 'p1').mana;

test('A-8: Bloodfire Infusion płaci {R} oprócz poświęcenia stwora', () => {
  const state = game();
  put(state, 'host', 'tuskguard-captain');
  put(state, 'bf', 'bloodfire-infusion', { attachedTo: 'host' });
  addMana(state, 'p1', 1, { colors: ['R'] });
  assert.equal(mana(state), 1);
  activate(state, 'bf');
  assert.equal(mana(state), 0, 'za aktywację musi zniknąć czerwony pip');
  assert.notEqual(state.objects.get('host')?.zone, 'battlefield', 'koszt poświęcenia zapłacony');
});

test('A-8: Outlast Tuskguard Captain płaci {G}, a nie tylko tapuje stwora', () => {
  const state = game();
  put(state, 'tusk', 'tuskguard-captain', { summoningSickness: false });
  addMana(state, 'p1', 1, { colors: ['G'] });
  activate(state, 'tusk');
  assert.equal(mana(state), 0, 'za aktywację musi zniknąć zielony pip');
  assert.equal(state.objects.get('tusk')?.tapped, true, 'koszt {T} pozostaje wymagany');
});

test('A-8: kontrakt katalogu: koszt liczbowy zawiera co najmniej drukowane pipy koloru', () => {
  const invalid = [];
  for (const card of registry.all()) for (const [index, ability] of (card.abilities ?? []).entries()) {
    if (ability?.type !== 'activated' || !ability.cost) continue;
    const colors = (ability.cost.colors ?? []).length + (ability.cost.hybrid ?? []).length;
    if (colors > 0 && (ability.cost.mana ?? 0) < colors) invalid.push(`${card.id}#${index}`);
  }
  assert.deepEqual(invalid, [], 'mana:0 + colors:[R] tylko sprawdza źródło; nie pobiera many');
});
