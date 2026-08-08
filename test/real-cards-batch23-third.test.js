
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}
function assertScryfall(id) {
  const raw = fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8');
  const j = JSON.parse(raw);
  const def = REGISTRY.get(id);
  assert.equal(j.name, def.name);
}

test('Vow of Wildness: cantAttackYou', () => {
  assertScryfall('vow-of-wildness');
  const def = REGISTRY.get('vow-of-wildness');
  assert.ok(def.aura.cantAttackYou);
});

test('Greater Tanuki: channel search basic land', () => {
  assertScryfall('greater-tanuki');
  const def = REGISTRY.get('greater-tanuki');
  assert.ok(def.abilities[0].channel);
  assert.ok(def.keywords.includes('trample'));
});

test('Scorch Spitter: attacks trigger damage defending player', () => {
  assertScryfall('scorch-spitter');
  const state = newState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const def = REGISTRY.get('scorch-spitter');
  addObject(state, {
    id: 'spitter', instanceId: 'i-spit', cardId: 'scorch-spitter', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    abilities: def.abilities, keywords: [], subtypes: ['Elemental','Lizard'], types: ['Creature'], colors: ['R'],
  });
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['spitter'] });
  assert.equal(r.ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(state.players.find(p=>p.id==='p2').life, 19, 'defending player took 1');
});

test('Turn the Tide: -2/-0 to opponents creatures', () => {
  assertScryfall('turn-the-tide');
  const def = REGISTRY.get('turn-the-tide');
  assert.equal(def.spell.effects[0].type, 'buff_opponents_creatures');
  assert.equal(def.spell.effects[0].power, -2);
});
