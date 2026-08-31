// M264/Etap 2.3 — enterAsCopy (Jwari Shapeshifter) wobec karty dwustronnej.
//
// CR 712.9: „Only permanents represented by double-faced tokens and
// double-faced cards can transform ... If a spell or ability instructs a
// player to transform ... any permanent that isn't represented by a
// double-faced token or a double-faced card, nothing happens." Przykład
// reguły: Clone wchodzący jako kopia back-face DFC (Wildblood Pack) jest
// kopią TEJ twarzy i NIE MOŻE się transformować — kopia ma jedną stronę,
// bo obiekt reprezentujący ją (Jwari — zwykła karta) nie jest dwustronny.
//
// M155 kopiował do enterAsCopy cały `transformTo` — przez co kopia Jwari
// stawała się „pół-DFC": umiała się obrócić, a druga transformacja
// przywracała cardId ŹRÓDŁA (Jwari), tworząc chimerę (transformTo.cardId
// nie należał już do pary). Zgodnie z 712.9 kopia w ogóle nie ma drugiej
// strony: zdolność transform z bieżącej twarzy jest kopiowana (CR 707.2),
// ale instrukcja transform na takim permanencie to no-op („nothing
// happens"). To samo dla craft (efekt bez transformTo jest już no-op od
// M155 — test/batch38-audit-fixes.test.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Realna materializacja z talii (createCardDeck) — niesie transformTo/frontFaceId. */
function put(state, id, cardId, controllerId = 'p1') {
  const entry = createCardDeck({ cardIds: [cardId], ownerId: controllerId, registry: REGISTRY })[0];
  const { instanceId, objectId, ownerId, ...data } = entry;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...data,
  });
  return state.objects.get(id);
}

function asCopy(state, sourceId, targetId) {
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId, candidateIds: [targetId], restorePriorityTo: 'p1',
  };
  return execute(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId });
}

test('M264/2.3-A1: kopia Jwari nie nosi transformTo (CR 712.9 — jedna strona)', () => {
  const state = game();
  put(state, 'villager', 'scorned-villager'); // DFC z triggerem transform (upkeep)
  put(state, 'jwari', 'jwari-shapeshifter');
  const r = asCopy(state, 'jwari', 'villager');
  assert.ok(r.ok, `kopiowanie: ${r.events?.[0]?.reason}`);
  const copy = state.objects.get('jwari');
  assert.equal(copy.cardName, 'Scorned Villager');
  assert.equal(copy.cardId, 'jwari-shapeshifter', 'kopiowany obiekt to nadal karta Jwari');
  assert.equal(copy.transformTo, null, 'kopia jednostronna — brak drugiej strony (RED: skopiowany transformTo)');
  assert.equal(copy.frontFaceId, null, 'i brak tożsamości frontu pary');
});

test('M264/2.3-A2: transform na kopii Jwari to no-op (CR 712.9 — „nothing happens")', () => {
  const state = game();
  put(state, 'villager', 'scorned-villager');
  put(state, 'jwari', 'jwari-shapeshifter');
  asCopy(state, 'jwari', 'villager');

  // Trigger upkeep „transform this creature" jest skopiowany (CR 707.2) —
  // ale instrukcja transform na jednostronnym permanencie nic nie robi.
  applyEffect(state, { type: 'transform' }, state.objects.get('jwari'), []);
  const after = state.objects.get('jwari');
  assert.equal(after.cardId, 'jwari-shapeshifter', 'bez zmian cardId');
  assert.equal(after.cardName, 'Scorned Villager', 'bez zmian charakterystyk');
  assert.equal(after.transformTo, null, 'bez drugiej strony w obie strony');
});

test('M264/2.3-A3: kopia TYLNEJ twarzy też jest jednostronna i nie transformuje', () => {
  const state = game();
  const scholar = put(state, 'scholar', 'civilized-scholar');
  applyEffect(state, { type: 'transform' }, scholar, []);
  assert.equal(state.objects.get('scholar').cardId, 'homicidal-brute', 'tył w górę (kontrola)');

  put(state, 'jwari', 'jwari-shapeshifter');
  asCopy(state, 'jwari', 'scholar');
  const copy = state.objects.get('jwari');
  assert.equal(copy.cardName, 'Homicidal Brute', 'kopia bieżącej twarzy');
  assert.equal(copy.transformTo, null, 'kopia jednostronna — brak drugiej strony (RED: skopiowany transformTo)');

  applyEffect(state, { type: 'transform' }, copy, []);
  const after = state.objects.get('jwari');
  assert.equal(after.cardId, 'jwari-shapeshifter', 'transform = no-op');
  assert.equal(after.cardName, 'Homicidal Brute');
});

test('M264/2.3-A4: kopiowanie DFC przez enterAsCopy nie tworzy „chimery" pętli transformTo', () => {
  // Kontrola, że źródło-cel jest poprawnie dwustronne (anty-over-fix):
  // pierwowzór ma frontFaceId, a jego transformTo.cardId wraca do frontu.
  const state = game();
  const villager = put(state, 'villager', 'scorned-villager');
  assert.equal(villager.frontFaceId, 'scorned-villager');
  applyEffect(state, { type: 'transform' }, villager, []);
  const wolf = state.objects.get('villager');
  assert.equal(wolf.cardId, 'moonscarred-werewolf');
  assert.equal(wolf.transformTo.cardId, 'scorned-villager', 'pierwowzór bez chimery');
  applyEffect(state, { type: 'transform' }, wolf, []);
  const back = state.objects.get('villager');
  assert.equal(back.cardId, 'scorned-villager');
  assert.equal(back.transformTo.cardId, 'moonscarred-werewolf', 'druga transformacja wraca do pary');
});
