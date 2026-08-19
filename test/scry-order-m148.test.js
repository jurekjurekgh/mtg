// M148 (uwaga właściciela): scry ma pozwalać graczowi wybrać KOLEJNOŚĆ kart
// na wierzchu biblioteki („...and the rest on top of your library in any
// order\", CR 701.18), a nie tylko spód/wierzch. Analogicznie do surveil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

function newState() {
  const state = createGameState({ seed: 148, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addLib(state, id, name) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'spell', power: null, toughness: null, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
    cardName: name,
  });
}

test('scry: resolve_scry przyjmuje topOrder (permutacja kart zostających na wierzchu)', () => {
  const state = newState();
  addLib(state, 'a', 'Wyspa');
  addLib(state, 'b', 'Las');
  addLib(state, 'c', 'Góra');
  // Scry 3 — wierzch to [a, b, c].
  state.pendingScry = { playerId: 'p1', objectIds: ['a', 'b', 'c'], restorePriorityTo: 'p1' };

  // Gracz: b na spód, a i c na wierzch w kolejności [c, a] (góra = c, potem a).
  const cmd = { type: 'resolve_scry', playerId: 'p1', bottomIds: ['b'], topOrder: ['c', 'a'] };
  const result = execute(state, cmd);
  assert.equal(result.ok, true, result.reason);

  const library = state.zones.library;
  const names = library.map((id) => state.objects.get(id).cardId.replace(/^c-/, ''));
  // Biblioteka: [c, a, b] — c na górze, potem a, na spodzie b.
  assert.deepEqual(names, ['c', 'a', 'b'], 'topOrder=[c,a] + spód b → biblioteka [c,a,b]');
});

test('scry: topOrder musi być permutacją tylko kart zostających na wierzchu', () => {
  const state = newState();
  addLib(state, 'a', 'Wyspa');
  addLib(state, 'b', 'Las');
  addLib(state, 'c', 'Góra');
  state.pendingScry = { playerId: 'p1', objectIds: ['a', 'b', 'c'], restorePriorityTo: 'p1' };

  // topOrder zawiera kartę, która poszła na spód — nielegalne.
  const bad = execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['b'], topOrder: ['b', 'a'] });
  assert.equal(bad.ok, false, 'topOrder nie może zawierać karty ze spodu');
  assert.match(bad.events?.[0]?.reason ?? '', /illegal_scry_order/);
});

test('scry: default (bez topOrder) zachowuje pierwotną kolejność reszty na wierzchu', () => {
  const state = newState();
  addLib(state, 'a', 'Wyspa');
  addLib(state, 'b', 'Las');
  addLib(state, 'c', 'Góra');
  state.pendingScry = { playerId: 'p1', objectIds: ['a', 'b', 'c'], restorePriorityTo: 'p1' };

  const cmd = { type: 'resolve_scry', playerId: 'p1', bottomIds: ['b'] };
  const result = execute(state, cmd);
  assert.equal(result.ok, true, result.reason);
  const names = state.zones.library.map((id) => state.objects.get(id).cardId.replace(/^c-/, ''));
  assert.deepEqual(names, ['a', 'c', 'b'], 'bez topOrder: reszta w pierwotnej kolejności [a,c], b na spodzie');
});

test('scry: oferta wariantów zawiera topOrder (playerView enumeruje permutacje)', () => {
  const state = newState();
  addLib(state, 'a', 'Wyspa');
  addLib(state, 'b', 'Las');
  state.pendingScry = { playerId: 'p1', objectIds: ['a', 'b'], restorePriorityTo: 'p1' };

  const view = playerView(state, 'p1');
  const scryCmds = view.legalCommands.filter((c) => c.type === 'resolve_scry');
  // Warianty: {empty/bottom} × permutacje reszty. Sprawdźmy, że istnieje
  // wariant z topOrder zmieniającym kolejność (np. [b,a] przy obu na wierzchu).
  const reorder = scryCmds.find((c) => (c.topOrder ?? []).length === 2 && JSON.stringify(c.topOrder) === JSON.stringify(['b', 'a']));
  assert.ok(reorder, `brak wariantu topOrder [b,a] w ofercie scry; oferty: ${JSON.stringify(scryCmds)}`);
});
