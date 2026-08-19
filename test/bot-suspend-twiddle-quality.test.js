// M146 — jakość decyzji bota z nowymi kartami Batch 35 (audyt Żywym Testerem):
//  1. Basilisk Gate ({2},{T}: +X/+X) — bot NIE wzmacnia stworów przeciwnika;
//  2. Twiddle (tryb Odkręcenie) — bot NIE odkręca permanentów przeciwnika
//     (wcześniej rzucał ją na górę wroga w swoim upkeepie).
// Wzorzec M77/B: wycena pumpów i odkręceń musi karać cel wrogi.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, { id, cardId, controllerId, zone }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(card);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: card.keywords ?? [], subtypes: card.subtypes ?? [], types: card.types ?? [],
    colors: data.colors ?? [], cardName: card.name,
    costReduction: data.costReduction ?? null,
    equipment: data.equipment ?? card.equipment ?? null,
    suspend: data.suspend ?? null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    ownerId: controllerId, zone: extra.zone ?? 'battlefield', kind: extra.kind ?? 'creature',
    power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: extra.keywords ?? [], subtypes: extra.subtypes ?? [],
    types: extra.types ?? ['Creature'], colors: [], cardName: extra.cardName ?? id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botState(step = 'main') {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.turn.number = 8;
  return state;
}

test('Basilisk Gate: bot nie aktywuje +X/+X na stwora przeciwnika', () => {
  const state = botState();
  putCard(state, { id: 'gate', cardId: 'basilisk-gate', controllerId: 'p2', zone: 'battlefield' });
  putBlank(state, 'wrog', 'p1', { power: 4, toughness: 4 });   // stwór gracza
  putBlank(state, 'wlasny', 'p2', { power: 2, toughness: 2 }); // stwór bota
  addMana(state, 'p2', 2);
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  if (choice.type !== 'activate_ability' || choice.objectId !== 'gate') return; // bot może wybrać co innego
  const targetId = choice.targets?.[0];
  assert.notEqual(targetId, 'wrog', `bot nie wzmacnia wrogiego stwora: ${JSON.stringify(choice)}`);
  assert.equal(targetId, 'wlasny', 'bot wzmacnia własnego stwora');
});

test('Twiddle Odkręcenie: bot nie odkręca permanentu przeciwnika', () => {
  const state = botState();
  putCard(state, { id: 'tw', cardId: 'twiddle', controllerId: 'p2', zone: 'hand' });
  putBlank(state, 'wrog', 'p1', { power: 3, toughness: 3 });
  state.objects.set('wrog', Object.freeze({ ...state.objects.get('wrog'), tapped: true }));
  putBlank(state, 'wlasny', 'p2', { power: 2, toughness: 2 });
  state.objects.set('wlasny', Object.freeze({ ...state.objects.get('wlasny'), tapped: true }));
  addMana(state, 'p2', 1, { colors: ['U'] });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  if (choice.type !== 'cast_spell' || choice.objectId !== 'tw') return;
  const targetId = choice.targets?.[0];
  assert.notEqual(targetId, 'wrog', `bot nie odkręca wroga: ${JSON.stringify(choice)}`);
  assert.equal(targetId, 'wlasny', 'bot odkręca własnego stwora');
});

test('Twiddle Odkręcenie na własnym zatapniętym stworze ma wartość dla bota', () => {
  const state = botState();
  putCard(state, { id: 'tw', cardId: 'twiddle', controllerId: 'p2', zone: 'hand' });
  putBlank(state, 'wlasny', 'p2', { power: 4, toughness: 4 });
  state.objects.set('wlasny', Object.freeze({ ...state.objects.get('wlasny'), tapped: true }));
  addMana(state, 'p2', 1, { colors: ['U'] });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(choice.type === 'cast_spell' && choice.objectId === 'tw', `bot rzuca Twiddle: ${JSON.stringify(choice)}`);
  assert.equal(choice.targets?.[0], 'wlasny', 'cel = własny zatapnięty stwór');
});

// --- M146 (uwagi z testów właściciela): Jwari Shapeshifter, Turn the Tide,
//     atak 2/3 w 2/3 ---

test('Jwari Shapeshifter: bot nie zagrywa bez Ally na stole (0/0 ginie od SBA)', () => {
  const state = botState();
  putCard(state, { id: 'jwari', cardId: 'jwari-shapeshifter', controllerId: 'p2', zone: 'hand' });
  // brak Ally na polu bitwy
  putBlank(state, 'wrog', 'p1', { power: 2, toughness: 2, subtypes: ['Goblin'] });
  putBlank(state, 'wlasny', 'p2', { power: 2, toughness: 2, subtypes: ['Merfolk'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type === 'cast_permanent' && choice.objectId === 'jwari', true,
    `bot nie zagrywa Jwari bez Ally: ${JSON.stringify(choice)}`);
});

test('Jwari Shapeshifter: bot zagrywa, gdy Ally jest na stole', () => {
  const state = botState();
  putCard(state, { id: 'jwari', cardId: 'jwari-shapeshifter', controllerId: 'p2', zone: 'hand' });
  putBlank(state, 'ally', 'p2', { power: 3, toughness: 3, subtypes: ['Ally'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(choice.type === 'cast_permanent' && choice.objectId === 'jwari',
    `bot zagrywa Jwari z Ally: ${JSON.stringify(choice)}`);
});

test('Turn the Tide: bot nie rzuca poza walką (czar tylko do combatu)', () => {
  const state = botState('main'); // main phase, brak walki
  putCard(state, { id: 'tt', cardId: 'turn-the-tide', controllerId: 'p2', zone: 'hand' });
  putBlank(state, 'wrog', 'p1', { power: 3, toughness: 3 });
  putBlank(state, 'wlasny', 'p2', { power: 2, toughness: 2 });
  addMana(state, 'p2', 3, { colors: ['U'] });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'tt', true,
    `bot nie rzuca Turn the Tide poza walką: ${JSON.stringify(choice)}`);
});

test('atak 2/3 w blokera 2/3: bot nie atakuje, gdy nikt nie ginie', () => {
  const state = botState('declare_attackers');
  putBlank(state, 'atk', 'p2', { power: 2, toughness: 3 });
  putBlank(state, 'blk', 'p1', { power: 2, toughness: 3 });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type === 'declare_attackers' && (choice.attackerIds ?? []).includes('atk'), true,
    `bot nie atakuje 2/3 w 2/3 bez zysku: ${JSON.stringify(choice)}`);
});

test('atak 4/4 w blokera 2/2: bot atakuje (zabija blokera)', () => {
  const state = botState('declare_attackers');
  putBlank(state, 'atk', 'p2', { power: 4, toughness: 4 });
  putBlank(state, 'blk', 'p1', { power: 2, toughness: 2 });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(choice.type === 'declare_attackers' && (choice.attackerIds ?? []).includes('atk'),
    `bot atakuje 4/4 w 2/2 (zabija): ${JSON.stringify(choice)}`);
});

// --- M146 (znalezisko właściciela #5): bot blokuje, gdy blok ratuje życie ---

function blockScenario(attackers, myLife) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.turn.phase = 'combat';
  state.players.find((p) => p.id === 'p2').life = myLife;
  const def = REGISTRY.get('dread-warlock');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'warlock', instanceId: 'i-warlock', cardId: 'dread-warlock', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [], cardName: def.name,
  });
  state.objects.set('warlock', Object.freeze({ ...state.objects.get('warlock'), summoningSickness: false }));
  const atkIds = [];
  attackers.forEach(([p, t, flying], i) => {
    const id = `atk${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: p, toughness: t, manaCost: 1,
      abilities: [], keywords: flying ? ['flying'] : [], subtypes: [], types: ['Creature'], colors: [], cardName: id,
    });
    atkIds.push(id);
  });
  state.combat = { attackers: atkIds, attackingPlayerId: 'p1' };
  return createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
}

test('blok ratujący życie: bot blokuje, choć bloker ginie (3/3 + latający 2/2, 5 życia)', () => {
  const choice = blockScenario([[3, 3, false], [2, 2, true]], 5);
  assert.ok(choice.type === 'declare_blockers' && Object.keys(choice.assignments ?? {}).length > 0,
    `bot musi zablokować 3/3, by przeżyć: ${JSON.stringify(choice)}`);
});

test('blok NIE ratujący: bot nie marnowuje blokera (3× 3/3, 5 życia)', () => {
  const choice = blockScenario([[3, 3, false], [3, 3, false], [3, 3, false]], 5);
  assert.ok(!(choice.type === 'declare_blockers' && Object.keys(choice.assignments ?? {}).length > 0),
    `blok i tak nie ratuje — bot nie traci stwora: ${JSON.stringify(choice)}`);
});
