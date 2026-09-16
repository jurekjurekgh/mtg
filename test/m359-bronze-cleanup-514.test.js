import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

/**
 * M359 / Brązowa odznaka II (2026-09-16): krok cleanup (CR 514).
 *
 * Źródło reguł (online, nie z pamięci): mtg.wiki/page/Ending_phase,
 * CR z 7 sierpnia 2026:
 * - CR 514.3: „Normally, no player receives priority during the cleanup
 *   step, so no spells can be cast and no abilities can be activated.”
 * - CR 514.3a: „…those triggered abilities are put on the stack, then the
 *   active player gets priority. Players may cast spells and activate
 *   abilities. Once the stack is empty and all players pass in succession,
 *   another cleanup step begins.”
 *
 * Błąd #1 (CR 514.3a): brak pętli cleanup. Trigger odpalony w cleanupie
 * (tu: madness Revolutionista odrzuconego do limitu ręki + jego ETB
 * zwracające kartę do ręki) nie otwierał kolejnego cleanupu — tura
 * kończyła się z ręką 8 kart. Przesłanka ograniczenia M62#3 („brak karty
 * w katalogu tego wymagającej”) wygasła z wejściem madness (Batch 39).
 * Błąd #2 (CR 514.3): w PUSTYM cleanupie (pusty stos, brak triggerów)
 * silnik oferował i wykonywał cast_spell / activate_ability.
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 359, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function handSize(state, playerId = 'p1') {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId).length;
}

/** Wejście w cleanup „od frontu” (rundą passów z kroku end) — jak w grze. */
function enterCleanup(state) {
  state.turn = jumpToStep(state.turn, 'end', state.turn.activePlayerId);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.equal(state.turn.step, 'cleanup', 'runda passów w end wchodzi w cleanup');
}

function passRound(state) {
  for (let i = 0; i < 2; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: pid });
    assert.ok(r.ok, `pass ${pid} przyjęty`);
  }
}

test('M359/1 (CR 514.3a): trigger w cleanupie → KOLEJNY cleanup z limitem ręki (RED: ręka 8 w turze 2)', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  for (let i = 1; i <= 7; i++) putCard(state, `f${i}`, 'basic-forest', 'p1', 'hand');
  putCard(state, 'cur', 'curate', 'p1', 'graveyard');
  assert.equal(handSize(state), 8);
  enterCleanup(state);
  // Pierwszy cleanup: limit ręki → odrzuć Revolutionista (madness kolejkuje się).
  assert.ok(state.pendingDiscardChoice, 'cleanup pyta o limit ręki');
  assert.equal(state.pendingDiscardChoice.count, 1);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev' }).ok);
  assert.equal(handSize(state), 7);
  assert.ok(state.pendingMadnessCast, 'madness otwarty w cleanupie (CR 702.35a)');
  // Rzut za madness {3}{R} → ETB zwraca Curate do ręki (ręka znów 8).
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && c.cast);
  assert.ok(cast, 'oferta rzutu madness w cleanupie');
  assert.ok(execute(state, cast).ok);
  passRound(state); // Revolutionist wchodzi…
  passRound(state); // …ETB wraca Curate do ręki.
  assert.equal(handSize(state), 8, 'ETB Revolutionista podniósł rękę do 8 w cleanupie');
  passRound(state); // pusty stos, pełna runda passów
  // CR 514.3a: skoro w cleanupie były triggery na stosie, zaczyna się KOLEJNY
  // cleanup (nie tura 2) — z ponownym limitem ręki.
  assert.equal(state.turn.number, 1, 'tura jeszcze się nie skończyła (kolejny cleanup)');
  assert.equal(state.turn.step, 'cleanup');
  assert.ok(state.pendingDiscardChoice, 'kolejny cleanup pyta o limit ręki');
  const discards = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(discards.length > 0, 'oferta odrzucenia w kolejnym cleanupie');
  assert.ok(execute(state, discards[0]).ok);
  assert.equal(handSize(state), 7);
  passRound(state);
  assert.equal(state.turn.number, 2, 'po pustym kolejnym cleanupie tura przechodzi dalej');
  assert.equal(handSize(state), 7, 'limit ręki utrzymany');
});

test('M359/1b (anty-regresja): cleanup BEZ triggerów przechodzi w turę bez pętli', () => {
  const state = game();
  for (let i = 1; i <= 8; i++) putCard(state, `f${i}`, 'basic-forest', 'p1', 'hand');
  enterCleanup(state);
  assert.ok(state.pendingDiscardChoice, 'pierwszy cleanup pyta o limit ręki');
  const discards = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(execute(state, discards[0]).ok);
  assert.equal(handSize(state), 7);
  passRound(state);
  assert.equal(state.turn.number, 2, 'brak triggerów = brak kolejnego cleanupu');
  assert.equal(state.turn.step, 'upkeep');
});

test('M359/2 (CR 514.3): PUSTY cleanup — brak oferty i reject cast_spell / activate_ability (RED)', () => {
  const state = game();
  putCard(state, 'cur', 'curate', 'p1', 'hand');
  putCard(state, 'lantern', 'seers-lantern', 'p1', 'battlefield');
  enterCleanup(state);
  assert.equal(state.zones.stack.length, 0, 'stos pusty');
  addMana(state, 'p1', 4, { colors: ['U'] });
  const offers = playerView(state, 'p1').legalCommands;
  assert.ok(!offers.some((c) => c.type === 'cast_spell'), 'brak oferty cast_spell w pustym cleanupie');
  assert.ok(!offers.some((c) => c.type === 'activate_ability'), 'brak oferty activate_ability w pustym cleanupie');
  const manual = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'cur', targets: [] });
  assert.ok(!manual.ok, 'ręczny cast_spell w pustym cleanupie odrzucony');
  const abilityIdx = (state.objects.get('lantern').abilities ?? []).findIndex((a) => a.type === 'activated');
  const manualAbility = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lantern', abilityIndex: abilityIdx, targets: [] });
  assert.ok(!manualAbility.ok, 'ręczne activate_ability w pustym cleanupie odrzucone');
  passRound(state);
  assert.equal(state.turn.number, 2, 'passy w pustym cleanupie kończą turę');
});

test('M359/2b (CR 514.3a): cleanup Z triggerem — priorytet OTWARTY, cast instantu legalny', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  for (let i = 1; i <= 7; i++) putCard(state, `f${i}`, 'basic-forest', 'p1', 'hand');
  putCard(state, 'shk', 'shock', 'p1', 'hand');
  putCard(state, 'bear', 'tenth-district-veteran', 'p2', 'battlefield');
  enterCleanup(state);
  // Ręka 9 → odrzuć 2, w tym Revolutionista (madness = trigger w cleanupie).
  assert.equal(state.pendingDiscardChoice.count, 2);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev' }).ok);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'f1' }).ok);
  assert.ok(state.pendingMadnessCast, 'madness czeka (trigger w cleanupie)');
  // Rezygnacja z madness (stos pusty), ale trigger JUŻ był → priorytet otwarty.
  const decline = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(execute(state, decline).ok);
  addMana(state, 'p1', 1, { colors: ['R'] });
  const offers = playerView(state, 'p1').legalCommands;
  assert.ok(offers.some((c) => c.type === 'cast_spell'), 'po triggerze w cleanupie cast_spell legalny (CR 514.3a)');
});

test('M359/1c (CR 514.2): obrażenia zadane W cleanupie schodzą w kolejnym cleanupie', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand');
  for (let i = 1; i <= 7; i++) putCard(state, `f${i}`, 'basic-forest', 'p1', 'hand');
  putCard(state, 'shk', 'shock', 'p1', 'hand');
  putCard(state, 'bear', 'tenth-district-veteran', 'p2', 'battlefield');
  enterCleanup(state);
  assert.equal(state.pendingDiscardChoice.count, 2);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev' }).ok);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'f1' }).ok);
  const decline = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(execute(state, decline).ok);
  // Priorytet otwarty (trigger madness) → Shock w misia (2/2, przeżyje).
  addMana(state, 'p1', 1, { colors: ['R'] });
  const castShock = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell');
  assert.ok(castShock, 'Shock rzucalny w otwartym cleanupie');
  const shockCmd = { ...castShock, targets: ['bear'] };
  assert.ok(execute(state, shockCmd).ok, 'Shock rzucony');
  passRound(state); // Shock rozstrzyga się w cleanupie
  assert.equal(state.objects.get('bear')?.damage ?? 0, 2, 'miś ma 2 obrażenia po Shocku');
  passRound(state); // domknięcie cleanupu → kolejny cleanup (były triggery)
  assert.equal(state.turn.number, 1, 'kolejny cleanup zamiast tury 2');
  assert.equal(state.objects.get('bear')?.damage ?? 0, 0, 'kolejny cleanup czyści obrażenia (CR 514.2)');
  passRound(state);
  assert.equal(state.turn.number, 2);
});
