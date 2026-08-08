
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

test('Deepwood Denizen: cost reduction per counter', () => {
  assertScryfall('deepwood-denizen');
  const def = REGISTRY.get('deepwood-denizen');
  assert.ok(def.abilities[0].costReduction.perCounter === '+1/+1');
  assert.equal(def.abilities[0].cost.mana, 6);
});

test('Welder Automaton: damage each opponent', () => {
  assertScryfall('welder-automaton');
  const def = REGISTRY.get('welder-automaton');
  assert.equal(def.abilities[0].effect.type, 'damage_each_opponent');
});

test('Feedback: upkeep damage to enchanted controller', async () => {
  assertScryfall('feedback');
  const state = newState();
  const def = REGISTRY.get('feedback');
  addObject(state, {
    id: 'ench', instanceId: 'i-ench', cardId: 'x-ench', controllerId: 'p2',
    zone: 'battlefield', kind: 'enchantment', power: null, toughness: null, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Enchantment'], colors: ['U'],
  });
  const auraId = 'feedback-aura';
  const auraObj = { id: auraId, cardId: 'feedback', controllerId: 'p1', zone: 'battlefield', kind: 'enchantment', attachedTo: 'ench', aura: def.aura, abilities: def.abilities };
  state.objects.set(auraId, auraObj);
  state.zones.battlefield.push(auraId);
  // Simulate upkeep trigger by directly applying effect
  const { applyEffect } = await import('../src/engine/effects.js');
  const src = state.objects.get(auraId);
  applyEffect(state, { type: 'damage_enchanted_permanent_controller', amount: 1 }, src, []);
  assert.equal(state.players.find(p=>p.id==='p2').life, 19);
});
