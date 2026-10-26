// =============================================================================
// Zgłoszenie S (2026-10-26, właściciel) — Clone Shell / Imprint:
//   „karty, które zostają, winny trafić na spód biblioteki »w dowolnej
//   kolejności« (wybranej przeze mnie w modalu). Nie mam wyboru kolejności."
//
// Przyczyna (sonda `.arena/probe-s.mjs` na produkcyjnej ścieżce): silnik,
// `playerView.pendingLookTopN` i kreator `renderPickOneRestBottomWizard`
// poprawnie niosą wymiar `bottomOrder`, ale `openChoiceRequest` liczy
// generyczny `singleTargetPlanOf` PRZED `lookWizardKindOf` — a detektor
// przejmował komendy `resolve_look_top_choice` po samym polu `cardId`
// i kończył gołą komendą bez `bottomOrder` (reszta lądowała na spodzie
// w kolejności biblioteki). Ta sama kradzież dotyczyła *Impulse*;
// *Fertile Thicket* działało, bo ma osobny typ komendy spoza detektora.
//
// Reguły: Imprint to dziś ability word bez znaczenia regułowego (słownik
// CR) — rozstrzyga tekst Oracle Clone Shell: „put the rest on the bottom
// of your library in any order".
//
// Fix: `resolve_look_top_choice` wykluczony z ogólnej rodziny single-pick
// (komendy nie enumerują `bottomOrder` — detektor na samych komendach nie
// może tego wymiaru reprezentować), kaskada dociera do kreatora look-top.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { buildActionEntries } from '../src/table/render.js';
import { lookWizardKindOf } from '../src/table/choice-request.js';
import { singleTargetPlanOf } from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();

function game() {
  const s = createGameState({ seed: 8, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.pendingMulligans = [];
  for (let i = 0; i < 6; i += 1) put(s, `p2lib${i}`, 'basic-island', 'library', 'p2');
  return s;
}

function put(s, id, cardId, zone = 'library', pid = 'p1') {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: pid, registry: REGISTRY });
  const { objectId, ...data } = entry;
  s.objects.set(id, Object.freeze({
    ...data, id, instanceId: `i-${id}`, controllerId: pid, ownerId: pid, zone,
  }));
  s.zones[zone].push(id);
  return s.objects.get(id);
}

/** Dojeżdża komendami pasowania do oczekującej decyzji look-top. */
function settleToLook(s) {
  for (let i = 0; i < 12 && !s.pendingLookTopN; i += 1) {
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  assert.ok(s.pendingLookTopN, 'decyzja look-top jest oczekująca');
  return playerView(s, 'p1');
}

function scenaCloneShella() {
  const s = game();
  ['hill-giant', 'razorfoot-griffin', 'basic-swamp', 'basic-forest', 'basic-mountain']
    .forEach((cardId, i) => put(s, `top${i}`, cardId));
  put(s, 'shell', 'clone-shell', 'hand');
  addMana(s, 'p1', 5);
  const cast = playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'shell');
  assert.ok(cast, 'oferta rzutu Clone Shell');
  assert.equal(execute(s, cast).ok, true);
  return { s, view: settleToLook(s) };
}

/** Wpis panelu tak, jak buduje go stół (`buildActionEntries` w render.js). */
function requestStołu(s, view) {
  const session = {
    state: s,
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? null,
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  };
  const entries = buildActionEntries(view.legalCommands, session, view);
  const entry = entries.find((e) => e.request?.options?.some((c) => c.type === 'resolve_look_top_choice'));
  assert.ok(entry, 'panel grupuje decyzję look-top w jedno żądanie wyboru');
  return entry.request;
}

test('S/1: Clone Shell — produkcyjne żądanie trafia do kreatora sortowania spodu, nie do single-pick', () => {
  const { s, view } = scenaCloneShella();
  assert.equal(view.pendingLookTopN.pickTo, 'exile_face_down_linked');
  assert.equal(view.pendingLookTopN.restTo, 'library_bottom');
  const request = requestStołu(s, view);
  assert.equal(lookWizardKindOf(request, view), 'pick-one-rest-bottom',
    'wyspecjalizowany kreator rozpoznaje decyzję');
  assert.equal(singleTargetPlanOf(request.options), null,
    'generyczny single-pick NIE przejmuje decyzji (gubił wymiar bottomOrder)');
});

test('S/2: wybór gracza — wygnanie zakryte + reszta na spodzie w WYBRANEJ kolejności', () => {
  const { s, view } = scenaCloneShella();
  const karty = view.pendingLookTopN.cards.map((c) => c.id);
  assert.equal(karty.length, 4);
  const [wygnana, ...reszta] = karty;
  const cardIdWygnanej = s.objects.get(wygnana).cardId;
  const odwrócona = [...reszta].reverse();
  const r = execute(s, {
    type: 'resolve_look_top_choice', playerId: 'p1', cardId: wygnana, bottomOrder: odwrócona,
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  // Zmiana strefy = nowy obiekt (CR 400.7) — wygnaną znajdujemy w strefie.
  const exile = s.zones.exile.map((id) => s.objects.get(id)).find((o) => o?.faceDown);
  assert.ok(exile, 'wybrana karta jest wygnana zakryta (Imprint)');
  assert.equal(exile.cardId, cardIdWygnanej, 'to dokładnie karta wskazana przez gracza');
  assert.deepEqual(s.zones.library.slice(-3), odwrócona,
    'spód biblioteki dokładnie w kolejności wybranej przez gracza');
  assert.equal(s.pendingLookTopN ?? null, null, 'decyzja zamknięta');
});

test('S/3: Impulse — ta sama rodzina też wraca do kreatora sortowania spodu', () => {
  const s = game();
  ['hill-giant', 'razorfoot-griffin', 'basic-swamp', 'basic-forest', 'basic-mountain']
    .forEach((cardId, i) => put(s, `top${i}`, cardId));
  put(s, 'imp', 'impulse', 'hand');
  addMana(s, 'p1', 2);
  const cast = playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'imp');
  assert.ok(cast, 'oferta rzutu Impulse');
  assert.equal(execute(s, cast).ok, true);
  const view = settleToLook(s);
  assert.equal(view.pendingLookTopN.restTo, 'library_bottom');
  const request = requestStołu(s, view);
  assert.equal(lookWizardKindOf(request, view), 'pick-one-rest-bottom');
  assert.equal(singleTargetPlanOf(request.options), null);
});

test('S/4: anty-overfix — pozostałe rodziny single-pick nadal dostają plan', () => {
  const discard = [
    { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'a' },
    { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'b' },
  ];
  assert.ok(singleTargetPlanOf(discard), 'resolve_discard_choice zostaje w rodzinie single-pick');
});
