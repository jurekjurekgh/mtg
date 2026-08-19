import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * M100/E10 (P3 — Żywy Tester h04): komunikat tworzenia tokenu pokazywał
 * surowe staty definicji zamiast efektywnych („Ty tworzysz token Tarmogoyf
 * (0/0)", choć na stole token ma staty z CDA — „liczba typów kart w grobach").
 * Zdarzenie token_created musi nieść statystyki WIDZIANE po wejściu na
 * pole bitwy (CR 613: CDA aplikuje się przed SBA) — to one trafiają do panelu.
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Groby: stwór + land → 2 typy kart, Tarmogoyf = 2/3.
  addObject(state, { id: 'g1', instanceId: 'i-g1', cardId: 'highland-game', controllerId: 'p1', zone: 'graveyard', kind: 'permanent', types: ['Creature'], name: null });
  addObject(state, { id: 'g2', instanceId: 'i-g2', cardId: 'basic-forest', controllerId: 'p2', zone: 'graveyard', kind: 'land', types: ['Land'], name: null });
  return state;
}

test('token z CDA (Tarmogoyf): token_created niesie staty efektywne, nie definicji', () => {
  const state = game();
  const def = REGISTRY.get('token_tarmogoyf');
  createBattlefieldToken(state, 'p1', {
    cardId: 'token_tarmogoyf', name: 'Tarmogoyf', power: def.power, toughness: def.toughness,
    colors: def.colors, types: def.types, subtypes: def.subtypes, abilities: def.abilities,
  });
  const e = state.events.find((ev) => ev.type === 'token_created');
  assert.ok(e, 'zdarzenie token_created');
  assert.equal(e.power, 2, 'P = liczba typów kart w grobach (nie 0)');
  assert.equal(e.toughness, 3, 'T = liczba typów + 1 (nie 0)');
});

test('zwykły token bez bonusów: bez zmian (1/1 jak w definicji)', () => {
  const state = game();
  createBattlefieldToken(state, 'p1', { cardId: 'token_goblin', name: 'Goblin', power: 1, toughness: 1, colors: ['R'], types: ['Creature'], subtypes: ['Goblin'] });
  const e = state.events.find((ev) => ev.type === 'token_created');
  assert.equal(e.power, 1);
  assert.equal(e.toughness, 1);
});

test('token niestworowy (Treasure): nadal bez statystyk (null — bez „(null/null)")', () => {
  const state = game();
  createBattlefieldToken(state, 'p1', { cardId: 'token_treasure', name: 'Treasure', kind: 'artifact', types: ['Artifact'] });
  const e = state.events.find((ev) => ev.type === 'token_created');
  assert.equal(e.power, null);
  assert.equal(e.toughness, null);
});
