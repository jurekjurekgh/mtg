import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { execute } from '../src/engine/game-state.js';

/**
 * M258 (Etap 2.3 — CR hunt): CR 202.3b — „The mana value of a transforming
 * double-faced permanent or spell's back face is calculated as though it
 * had the mana cost of its front face. If a permanent or spell is a copy
 * of the back face of a transforming double-faced card (even if the card
 * representing that copy is itself a double-faced card), the mana value
 * of the copy is 0."
 *
 * Sam przekształcony permanent ma MV przedniej strony (712.8e) — silnik
 * modeluje to polam manaCost, którego transform NIE rusza (koszt przedni).
 * Ale KOPIA takiego obiektu (token-kopia z Cogwork Assemblera, kopia
 * „enter as copy" Jwari) ma MV 0 — obie ścieżki kopiowania brały koszt
 * przedniej strony (albo, jak enterAsCopy, NIE kopiowały kosztu wcale —
 * CR 707.2: koszt many jest wartością kopiowalną).
 *
 * Osiągalne w katalogu: Lodestone Needle (przód MV 2) → craft →
 * Guidestone Compass (tył, artefakt) kopiowany Cogwork Assemblerem;
 * Jwari Shapeshifter kopiujący przekształconego civilized-scholar
 * (tył = Homicidal Brute).
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function backFacePayload(backCardId) {
  const def = REGISTRY.get(backCardId);
  assert.ok(def, `karta ${backCardId} w rejestrze`);
  return {
    cardId: backCardId, cardName: def.name,
    power: def.power ?? null, toughness: def.toughness ?? null,
    abilities: def.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], kind: def.kind ?? null,
    manaCost: def.manaCost ?? 0,
  };
}

function putOnBattlefield(state, id, cardId, controllerId = 'p1', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: def.kind ?? (def.types ?? []).includes('Creature') ? 'creature' : 'artifact',
    power: def.power ?? null, toughness: def.toughness ?? null,
    manaCost: def.manaCost ?? 0, abilities: def.abilities ?? [],
    colors: def.colors ?? [], types: def.types ?? [], keywords: [],
    subtypes: def.subtypes ?? [], ...extra,
  });
  return state.objects.get(id);
}

test('M258/C1: token-kopia TYLNEJ twarzy DFC ma MV 0 (CR 202.3b, Cogwork Assembler)', () => {
  const state = game();
  // Lodestone Needle (MV 2) na polu bitwy, z drugą stroną (Guidestone Compass).
  putOnBattlefield(state, 'needle', 'lodestone-needle', 'p1', {
    frontFaceId: 'lodestone-needle',
    transformTo: backFacePayload('guidestone-compass'),
  });
  // Craft = exile + return transformed; efekt `transform` daje ten sam stan
  // „tył w górę" (cardId = tył, manaCost pozostaje przedni — 712.8e).
  applyEffect(state, { type: 'transform' }, state.objects.get('needle'), []);
  const transformed = state.objects.get('needle');
  assert.equal(transformed.cardId, 'guidestone-compass', 'tył w górę po transformacji');
  assert.equal(transformed.manaCost, 2, 'sam permanent ma MV przedniej strony (712.8e)');

  // Cogwork Assembler kopiuje przekształcony artefakt.
  const cogwork = putOnBattlefield(state, 'cogwork', 'cogwork-assembler', 'p1');
  applyEffect(state, { type: 'create_copy_token' }, cogwork, ['needle']);

  const token = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.id !== 'needle' && o.id !== 'cogwork' && o.cardId === 'guidestone-compass');
  assert.ok(token, 'token-kopia powstał');
  assert.equal(token.manaCost, 0, 'kopia tylnej twarzy ma MV 0 (CR 202.3b) — RED przed fixem: 2');
  assert.ok(token.transformTo, 'token dwustronny (M90/CR 707.8a)');
});

test('M258/C2: token-kopia PRZEDNIEJ twarzy DFC ma koszt przedni (anty-over-fix)', () => {
  const state = game();
  putOnBattlefield(state, 'needle', 'lodestone-needle', 'p1', {
    frontFaceId: 'lodestone-needle',
    transformTo: backFacePayload('guidestone-compass'),
  });
  const cogwork = putOnBattlefield(state, 'cogwork', 'cogwork-assembler', 'p1');
  applyEffect(state, { type: 'create_copy_token' }, cogwork, ['needle']);
  const token = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.id !== 'needle' && o.id !== 'cogwork' && o.cardId === 'lodestone-needle');
  assert.ok(token, 'token-kopia powstał');
  assert.equal(token.manaCost, 2, 'kopia przedniej twarzy zachowuje koszt {2}');
});

test('M258/C3: „enter as copy" tyłu DFC — MV kopii 0 (CR 202.3b; wcześniej w ogóle bez kosztu)', () => {
  const state = game();
  putOnBattlefield(state, 'scholar', 'civilized-scholar', 'p1', {
    frontFaceId: 'civilized-scholar',
    transformTo: backFacePayload('homicidal-brute'),
  });
  applyEffect(state, { type: 'transform' }, state.objects.get('scholar'), []);
  assert.equal(state.objects.get('scholar').cardId, 'homicidal-brute', 'tył w górę');

  putOnBattlefield(state, 'jwari', 'jwari-shapeshifter', 'p1');
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId: 'jwari', candidateIds: ['scholar'], restorePriorityTo: 'p1',
  };
  const result = execute(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: 'scholar' });
  assert.equal(result.ok, true, 'kopiowanie się udaje');
  const copy = state.objects.get('jwari');
  assert.equal(copy.manaCost, 0, 'kopia tylnej twarzy ma MV 0 — RED przed fixem: 2 (własny koszt Jwari)');
});

test('M258/C4: „enter as copy" przodu — kopia przejmuje koszt many celu (CR 707.2)', () => {
  const state = game();
  // civilized-scholar: {2}{U} = MV 3, Jwari: {1}{U} = MV 2 — różnica obserwowalna.
  putOnBattlefield(state, 'scholar', 'civilized-scholar', 'p1', {
    frontFaceId: 'civilized-scholar',
    transformTo: backFacePayload('homicidal-brute'),
  });
  putOnBattlefield(state, 'jwari', 'jwari-shapeshifter', 'p1');
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId: 'jwari', candidateIds: ['scholar'], restorePriorityTo: 'p1',
  };
  const result = execute(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: 'scholar' });
  assert.equal(result.ok, true);
  const copy = state.objects.get('jwari');
  assert.equal(copy.manaCost, 3, 'koszt many jest wartością kopiowalną (CR 707.2) — RED przed fixem: 2');
});
