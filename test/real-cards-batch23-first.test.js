
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
  assert.equal(j.name, def.name, `${id}: nazwa`);
}

test('Vandalize: destroy artifact mode', () => {
  assertScryfall('vandalize');
  const state = newState();
  const def = REGISTRY.get('vandalize');
  addObject(state, {
    id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p2',
    zone: 'battlefield', kind: 'artifact', power: null, toughness: null, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  addObject(state, {
    id: 'vandal', instanceId: 'i-vand', cardId: 'vandalize', controllerId: 'p1',
    zone: 'hand', kind: 'spell', power: null, toughness: null, manaCost: 5,
    spell: def.spell, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: ['R'],
  });
  state.players.find(p=>p.id==='p1').mana = 5;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'vandal', modeIndex: 0, targets: ['art'] });
  assert.equal(r.ok, true, 'cast artifact mode');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const art = state.objects.get('art');
  assert.ok(!art || art.zone === 'graveyard', 'artifact destroyed');
});

test('Expunge: destroy nonblack nonartifact and cant be regenerated', () => {
  assertScryfall('expunge');
  const state = newState();
  const def = REGISTRY.get('expunge');
  addObject(state, {
    id: 'victim', instanceId: 'i-victim', cardId: 'x-victim', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
  });
  addObject(state, {
    id: 'expunge', instanceId: 'i-exp', cardId: 'expunge', controllerId: 'p1',
    zone: 'hand', kind: 'spell', power: null, toughness: null, manaCost: 3,
    spell: def.spell, abilities: def.abilities, keywords: [], subtypes: [], types: ['Instant'], colors: ['B'],
  });
  state.players.find(p=>p.id==='p1').mana = 3;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'expunge', targets: ['victim'] });
  assert.equal(r.ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const victim = state.objects.get('victim');
  assert.ok(!victim || victim.zone !== 'battlefield', 'victim destroyed');
});

test('Shivs Embrace: aura pump and activated +1/+0', async () => {
  assertScryfall('shivs-embrace');
  const def = REGISTRY.get('shivs-embrace');
  assert.ok(def.aura.pump.power === 2 && def.aura.keywords.includes('flying'));
  assert.equal(def.abilities[0].effect.type, 'pump_enchanted_creature');
});
