import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import {
  addMana, consumeManaPool, expandManaPool, initializeResources, tapLandForMana,
} from '../src/engine/resources.js';
import { manaUnitKey } from '../src/engine/mana-sources.js';

/**
 * Kolorowa pula many (cz. 6): player.mana zostaje total, a player.manaPool
 * śledzi kolory jednostek. Testy czystej puli + produkcji kolorowej z landów.
 */

test('manaUnitKey: pojedynczy/dwubarwny/dowolny/bezbarwny', () => {
  assert.equal(manaUnitKey(['U']), 'U');
  assert.equal(manaUnitKey(['R', 'U']), 'UR', 'kolejność kanoniczna wg WUBRG');
  assert.equal(manaUnitKey(['U', 'R']), 'UR');
  assert.equal(manaUnitKey(['W', 'U', 'B', 'R', 'G']), 'WUBRG', 'dowolny kolor');
  assert.equal(manaUnitKey([]), '', 'bezbarwna (generic)');
});

test('addMana: domyślnie bezbarwna; colors trafia do manaPool', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  const p = state.players[0];
  addMana(state, 'p1', 3, { colors: [] }); // jawne [] = generic (bezbarwna)
  assert.equal(p.mana, 3);
  assert.deepEqual(p.manaPool, { '': 3 });
  addMana(state, 'p1', 1, { colors: ['U'] });
  assert.equal(p.mana, 4);
  assert.deepEqual(p.manaPool, { '': 3, U: 1 });
  addMana(state, 'p1', 2, { colors: ['W', 'U', 'B', 'R', 'G'] }); // dowolny
  assert.deepEqual(p.manaPool, { '': 3, U: 1, WUBRG: 2 });
});

test('tapLandForMana: Wyspa produkuje {U}, nie bezbarwną', () => {
  const state = createGameState({ seed: 2, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  addObject(state, { id: 'island', instanceId: 'i', cardId: 'basic-island', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  tapLandForMana(state, 'p1', 'island');
  const p = state.players[0];
  assert.equal(p.mana, 1);
  assert.deepEqual(p.manaPool, { U: 1 }, 'Wyspa dodaje jednostkę {U}');
  const produced = state.events.find((e) => e.type === 'mana_produced');
  assert.deepEqual(produced.colors, ['U']);
});

test('expandManaPool: rozwija mapę do listy jednostek kolorów', () => {
  const units = expandManaPool({ '': 2, U: 1, UR: 1 });
  assert.equal(units.length, 4);
  assert.equal(units.filter((c) => c.length === 0).length, 2, 'dwie bezbarwne');
  assert.ok(units.some((c) => c.join('') === 'U'));
  assert.ok(units.some((c) => c.join('') === 'UR'));
});

test('consumeManaPool: pipy kolorowe do pasujących jednostek, generic od bezbarwnych', () => {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  const p = state.players[0];
  // Pula: 1×{U}, 1×{W}, 2×bezbarwna. Koszt {1}{U} = 1 pip U + 1 generic.
  p.manaPool = { U: 1, W: 1, '': 2 };
  consumeManaPool(p, 2, [['U']]);
  // {U} konsumowana (pip), 1×bezbarwna (generic — zachowuje {W}). Zostaje {W}+1×bezb.
  assert.deepEqual(p.manaPool, { W: 1, '': 1 }, 'pip U zużyty, generic z bezbarwnej, {W} zachowana');
});

test('consumeManaPool: dwubarwna jednostka opłaca pasujący pip (U lub R, nie G)', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  const p = state.players[0];
  p.manaPool = { UR: 1 }; // Prismari Campus
  consumeManaPool(p, 1, [['U']]);
  assert.deepEqual(p.manaPool, {}, 'jednostka U|R opłaca pip {U}');
  p.manaPool = { UR: 1 };
  consumeManaPool(p, 1, [['R']]);
  assert.deepEqual(p.manaPool, {}, 'jednostka U|R opłaca pip {R}');
});

test('consumeManaPool: wiele pipów — dopasowanie do różnych jednostek', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  const p = state.players[0];
  p.manaPool = { U: 2 }; // {U}{U}
  consumeManaPool(p, 2, [['U'], ['U']]);
  assert.deepEqual(p.manaPool, {}, 'oba pipy {U} opłacone dwiema jednostkami {U}');
});
