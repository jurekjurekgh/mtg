// M361/B5 (złoto): modalny czar celowany fizzluje, gdy cel zyska hexproof
// w oknie odpowiedzi (CR 608.2b: „If all its targets are now illegal, the
// spell doesn't resolve" — hexproof gained after targeting makes the target
// illegal on resolution). Dowód online: mtg.wiki/Hexproof + CR 608.2b
// (mtg.wiki/Counter — fizzle; reguła cytowana w kodzie od M90/M271).
// Root cause: ścieżka modalna (resolveTopOfStack) filtrowała cele TYLKO po
// strefie (liveChosen: battlefield/stack), podczas gdy ścieżka zwykła idzie
// przez collectLegalTargets → validateTargets (hexproof/protection/moc).
// Naprawa: cele modalne też przez validateTargets (ADR 0030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(active = 'p1', step = 'main') {
  const state = createGameState({ seed: 361, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  const extra = zone === 'battlefield' ? { summoningSickness: false } : {};
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...extra, ...patch }));
  return state.objects.get(id);
}

function resolveStack(state, limit = 12) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
}

function zoneOf(state, id) {
  return state.objects.get(id)?.zone ?? null;
}

test('M361/B5: modalny Selesnya Charm (Wygnanie) fizzluje, gdy cel zyska hexproof w odpowiedzi', () => {
  const state = game('p1', 'main');
  put(state, 'krotiq', 'segmented-krotiq', 'p2'); // 6/5 — legalny cel trybu (moc ≥ 5)
  put(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  put(state, 'damper', 'magic-damper', 'p2', 'hand');
  addMana(state, 'p1', 2);
  addMana(state, 'p2', 1);

  assert.ok(execute(state, {
    type: 'cast_spell', playerId: 'p1', cardId: 'selesnya-charm',
    objectId: 'charm', modeIndex: 1, targets: ['krotiq'],
  }).ok, 'Charm rzucony trybem Wygnanie w Krotiqa');
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // priorytet dla odpowiedzi
  assert.ok(execute(state, {
    type: 'cast_spell', playerId: 'p2', cardId: 'magic-damper',
    objectId: 'damper', targets: ['krotiq'],
  }).ok, 'Damper w odpowiedzi na własnego stwora');
  resolveStack(state);
  assert.equal(zoneOf(state, 'krotiq'), 'battlefield', 'cel z hexproof przeżywa — modal fizzluje (CR 608.2b)');
  const fizzle = state.events.find((e) => e.type === 'spell_resolved' && e.cardId === 'selesnya-charm');
  assert.ok(fizzle?.fizzled, 'rozstrzygnięcie Charma raportuje fizzle');
});

test('M361/B5 (strażnik): zwykły (niemodalny) removal fizzluje przy hexproof w odpowiedzi', () => {
  const state = game('p1', 'main');
  put(state, 'krotiq', 'segmented-krotiq', 'p2');
  put(state, 'spread', 'spread-the-sickness', 'p1', 'hand');
  put(state, 'damper', 'magic-damper', 'p2', 'hand');
  addMana(state, 'p1', 5);
  addMana(state, 'p2', 1);

  assert.ok(execute(state, {
    type: 'cast_spell', playerId: 'p1', cardId: 'spread-the-sickness',
    objectId: 'spread', targets: ['krotiq'],
  }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // priorytet dla odpowiedzi
  assert.ok(execute(state, {
    type: 'cast_spell', playerId: 'p2', cardId: 'magic-damper',
    objectId: 'damper', targets: ['krotiq'],
  }).ok);
  resolveStack(state);
  assert.equal(zoneOf(state, 'krotiq'), 'battlefield', 'ścieżka zwykła (validateTargets) fizzluje poprawnie');
});

test('M361/B5 (strażnik): modalny Charm bez odpowiedzi wygania normalnie', () => {
  const state = game('p1', 'main');
  put(state, 'krotiq', 'segmented-krotiq', 'p2');
  put(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  addMana(state, 'p1', 2);

  assert.ok(execute(state, {
    type: 'cast_spell', playerId: 'p1', cardId: 'selesnya-charm',
    objectId: 'charm', modeIndex: 1, targets: ['krotiq'],
  }).ok);
  resolveStack(state);
  assert.notEqual(zoneOf(state, 'krotiq'), 'battlefield', 'bez odpowiedzi tryb Wygnanie działa');
});
