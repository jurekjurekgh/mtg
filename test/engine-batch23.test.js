
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { legalTargetCandidates } from '../src/engine/spells.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

test('Vandalize: 3 modes defined for choose one or both', () => {
  const def = REGISTRY.get('vandalize');
  assert.ok(def.spell.modes.length === 3, '3 modes');
  // M124/C: nazwy trybów są widoczne w panelu „Twoje działania", więc muszą
  // być po polsku (były: „Destroy artifact/land/both").
  assert.equal(def.spell.modes[0].name, 'Zniszcz artefakt');
  assert.equal(def.spell.modes[1].name, 'Zniszcz ląd');
  assert.equal(def.spell.modes[2].name, 'Zniszcz oba');
});

test('Expunge: target nonartifact nonblack', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'black', instanceId: 'i-black', cardId: 'x-black', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['B'],
  });
  addObject(state, {
    id: 'valid', instanceId: 'i-valid', cardId: 'x-valid', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
  });
  const cands = legalTargetCandidates(state, 'p1', { type: 'nonartifact_nonblack_creature' });
  assert.ok(cands.includes('valid'), 'valid included');
  assert.ok(!cands.includes('black'), 'black excluded');
});

test('Feedback: enchantment target exists', () => {
  const def = REGISTRY.get('feedback');
  assert.equal(def.aura.enchant, 'enchantment');
});

test('Vow of Wildness: aura has cantAttackYou', () => {
  const def = REGISTRY.get('vow-of-wildness');
  assert.ok(def.aura.cantAttackYou);
});

test('Turn the Tide: spell has buff_opponents_creatures', () => {
  const def = REGISTRY.get('turn-the-tide');
  assert.equal(def.spell.effects[0].type, 'buff_opponents_creatures');
  assert.equal(def.spell.effects[0].power, -2);
});

test('Deepwood costReduction defined', () => {
  const def = REGISTRY.get('deepwood-denizen');
  assert.ok(def.abilities[0].costReduction.perCounter === '+1/+1');
});

test('Welder damage_each_opponent', () => {
  const def = REGISTRY.get('welder-automaton');
  assert.equal(def.abilities[0].effect.type, 'damage_each_opponent');
});
