// M149 — uwagi właściciela A2/A3/D (jakość decyzji bota):
//
// A2 — trick bojowy (pump „do końca tury") rzucany we WŁASNYM upkeep/draw/end
//      to wyrzucona karta; bot ma czekać do walki (albo main przed atakiem).
// A3 — czar z dodatkowym kosztem „poświęć stwora" (Bone Splinters) opłaca się
//      tylko, gdy niszczymy cenniejszego stwora (por. TMC); nie poświęcamy
//      dobrego stwora, żeby zabić słabszego.
// D  — „target player sacrifices a creature" (Grave Exchange) celujemy
//      w przeciwnika, NIE w siebie.
//
// Reguły generyczne (ADR 0002), zero nazw kart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState(step = 'main') {
  const state = createGameState({ seed: 149, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: over.kind ?? data.kind, power: over.power ?? data.power,
    toughness: over.toughness ?? data.toughness, manaCost: over.manaCost ?? data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// --- A2: trick bojowy nie w draw/upkeep/end ---------------------------------
test('A2: bot NIE rzuca pumpu „do końca tury" we własnym draw (czeka na walkę)', () => {
  const state = newState('draw');
  state.turn.step = 'draw';
  put(state, 'fod', 'fake-your-own-death', 'p1', 'hand');
  put(state, 'myp', 'highland-game', 'p1', 'battlefield');
  put(state, 'foe', 'highland-game', 'p2', 'battlefield');
  addMana(state, 'p1', 2);
  const bot = createHeuristicBot({ seed: 149 });
  const choice = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.notEqual(choice.type, 'cast_spell',
    `bot rzucił trick bojowy w draw phase: ${JSON.stringify(choice)}`);
});

test('A2: bot RZUCA pump „do końca tury" w swojej main przed atakiem (trick przygotowany na atak)', () => {
  const state = newState('main');
  put(state, 'fod', 'fake-your-own-death', 'p1', 'hand');
  put(state, 'myp', 'highland-game', 'p1', 'battlefield');
  put(state, 'foe', 'highland-game', 'p2', 'battlefield');
  addMana(state, 'p1', 2);
  const bot = createHeuristicBot({ seed: 149 });
  const choice = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(choice.type, 'cast_spell',
    `bot powinien rzucić trick bojowy w main przed atakiem: ${JSON.stringify(choice)}`);
});

// --- A3: Bone Splinters — nie poświęcaj dobrego stwora za słabszy ----------
test('A3: bot NIE rzuca Bone Splinters poświęcając mocnego stwora za słabego celu', () => {
  const state = newState();
  put(state, 'bs', 'bone-splinters', 'p1', 'hand');
  // Własny stwór 2/1 (TMC 2), cel 1/1 (TMC 1) — poświęcenie bez sensu
  // (cel NIE ma wyższego TMC).
  put(state, 'myp', 'highland-game', 'p1', 'battlefield', { power: 2, toughness: 1, manaCost: 2 });
  put(state, 'foe', 'highland-game', 'p2', 'battlefield', { power: 1, toughness: 1, manaCost: 1 });
  addMana(state, 'p1', 1);
  const bot = createHeuristicBot({ seed: 149 });
  const choice = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.notEqual(choice.type, 'cast_spell',
    `bot poświęcił mocnego stwora za słabszy cel: ${JSON.stringify(choice)}`);
});

test('A3: bot RZUCA Bone Splinters poświęcając słabego stwora za mocniejszy cel', () => {
  const state = newState();
  put(state, 'bs', 'bone-splinters', 'p1', 'hand');
  // Własny 1/1 (TMC 1), cel 2/1 (TMC 2) — poświęcenie się opłaca (cel droższy).
  put(state, 'myp', 'highland-game', 'p1', 'battlefield', { power: 1, toughness: 1, manaCost: 1 });
  put(state, 'foe', 'highland-game', 'p2', 'battlefield', { power: 2, toughness: 1, manaCost: 2 });
  addMana(state, 'p1', 1);
  const bot = createHeuristicBot({ seed: 149 });
  const choice = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(choice.type, 'cast_spell',
    `bot powinien rzucić Bone Splinters za mocniejszy cel: ${JSON.stringify(choice)}`);
});

// --- D: Grave Exchange — nie celuj w siebie jako „poświęcającego" ---------
test('D: bot celuje Grave Exchange w przeciwnika (nie w siebie)', () => {
  const state = newState();
  put(state, 'grave', 'grave-exchange', 'p1', 'hand');
  put(state, 'myp', 'highland-game', 'p1', 'battlefield');
  put(state, 'foe', 'highland-game', 'p2', 'battlefield');
  put(state, 'gravecard', 'highland-game', 'p1', 'graveyard');
  addMana(state, 'p1', 6);
  const bot = createHeuristicBot({ seed: 149 });
  const choice = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(choice.type, 'cast_spell', `bot powinien rzucić Grave Exchange: ${JSON.stringify(choice)}`);
  assert.equal(choice.targets?.[1], 'p2',
    `Grave Exchange celuje w SIEBIE (p1) zamiast przeciwnika: ${JSON.stringify(choice)}`);
});
