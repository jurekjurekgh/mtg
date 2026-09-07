import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { applyEffect } from '../src/engine/effects.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';

/**
 * M331 (audyt PR #102, F6b — złapane ŻYWYM TESTEREM, nie testami engine):
 * log stołu i podsumowanie „Rozgrywka\" też opisują zakryte permanenty i
 * zostały JEDYNYM konsumentem etykiety, który nadal pisał „Morph\" o każdym
 * zakryciu. Z transkryptu partii audytowej (talia z 4× Veiled Ascension,
 * seed 8181, profil greedy):
 *
 *   • Plains (Morph) dostaje +1 licznik flying (razem 1)
 *   • Veiled Ascension (Morph) blokuje Bladed Sentinel
 *   • Bladed Sentinel zadaje 2 obrażenia (Veiled Ascension (Morph))
 *
 * Same nazwy kart są poprawne i przypadkowe (pod cloakami leżały lądy i druga
 * Veiled Ascension; ląd zakryty z cloaka to zgodny z CR 701.56a 2/2, tylko bez
 * prawa obrotu za koszt karty). BŁĘDEM był znacznik mechaniki: cloak to nie
 * morph (2/2 z ward {2}), a bez numeru kopii dwa zakrycia wyglądały w logu
 * identycznie — ta sama klasa co F6 na kaflach, tylko w pięciu miejscach więcej
 * (nazwa obiektu w zdarzeniach, ataki, bloki, obrażenia, cel).
 *
 * Naprawa przez wspólne `faceDownLabel` (L41: jedno źródło brzmienia); brama
 * nazwy zostaje nietknięta (własny permanent nazwany — CR 708.6/M100/E10,
 * obserwator „Przebieg tur (dla AI)\" nie — M199).
 */

const REGISTRY = createCardRegistry();
const WU = parseDeckText(readFileSync('decks/innistrad-wu.txt', 'utf8'), REGISTRY).cardIds;
// Talia człowieka: dwa klosze, dwie krzepiące stworzenia i same lądy —
// dzięki temu na wierzchu biblioteki leży PLAIN (zakrycie bez prawa obrotu).
const CLOAK_DECK = [
  'veiled-ascension', 'veiled-ascension', 'willbender', 'monastery-flock',
  ...Array.from({ length: 8 }, () => 'basic-plains'),
  ...Array.from({ length: 4 }, () => 'basic-island'),
];

function cloakGame() {
  const session = createSession({
    seed: 331, registry: REGISTRY, decks: new Map([[HUMAN_ID, CLOAK_DECK], [BOT_ID, WU]]),
  });
  const state = session.state;
  const vaId = [...state.zones.hand, ...state.zones.library]
    .find((id) => state.objects.get(id)?.cardId === 'veiled-ascension'
      && state.objects.get(id)?.controllerId === HUMAN_ID);
  assert.ok(vaId, 'Veiled Ascension w rące/kopalni człowieka');
  const va = moveObjectDirectly(state, vaId, 'battlefield', `bf-va-${vaId}`).id;
  const topLand = state.zones.library.find((id) => state.objects.get(id)?.controllerId === HUMAN_ID
    && (state.objects.get(id).types ?? []).includes('Land'));
  assert.ok(topLand, 'ląd w bibliotece człowieka');
  state.zones.library = [topLand, ...state.zones.library.filter((id) => id !== topLand)];
  applyEffect(state, { type: 'cloak' }, state.objects.get(va), []);
  const faceDown = state.zones.battlefield.filter((id) => state.objects.get(id).faceDown === true);
  assert.equal(faceDown.length, 1, 'jedno zakrycie na stole');
  return { session, state, va, cloakId: faceDown[0], faceDown };
}

function cloakTwo(sessionCase) {
  const { state, va } = sessionCase;
  const nextLand = state.zones.library.find((id) => state.objects.get(id)?.controllerId === HUMAN_ID
    && (state.objects.get(id).types ?? []).includes('Land'));
  assert.ok(nextLand, 'drugi ląd w bibliotece');
  state.zones.library = [nextLand, ...state.zones.library.filter((id) => id !== nextLand)];
  applyEffect(state, { type: 'cloak' }, state.objects.get(va), []);
  return state.zones.battlefield.filter((id) => state.objects.get(id).faceDown === true);
}

test('M331/A: log nazywa przyczynę zakrycia — „Plains (Cloak 1)\", nie „Plains (Morph)\\"', () => {
  const { session, cloakId } = cloakGame();
  const label = session.nameOfObject(cloakId);
  assert.equal(label, 'Plains (Cloak 1)', `własny cloak w logu: ${label}`);
  assert.doesNotMatch(label, /Morph/, `znacznik mechaniki nie kłamie: ${label}`);
});

test('M331/B: numer kopii dochodzi do logu — dwa cloake różnią się i dla gracza, i dla obserwatora', () => {
  const game = cloakGame();
  const second = cloakTwo(game);
  assert.equal(second.length, 2, 'dwa zakrycia na stole');
  const labels = second.map((id) => game.session.nameOfObject(id)).sort();
  assert.deepEqual(labels, ['Plains (Cloak 1)', 'Plains (Cloak 2)'], `etykiety: ${labels.join(' | ')}`);
  const forAi = second.map((id) => game.session.nameOfObject(id, { fogOfWar: true })).sort();
  assert.deepEqual(forAi, ['Cloak 1', 'Cloak 2'], `obserwator bez nazwy karty, ale z numerem: ${forAi.join(' | ')}`);
});

test('M331/C: zakrycie NIE z cloaka zostaje przy „Morph\\"', () => {
  const { session, state, cloakId } = cloakGame();
  assert.equal(session.nameOfObject(cloakId, { fogOfWar: true }), 'Cloak 1',
    'M199: obserwator „Przebieg tur (dla AI)\" nie zna karty pod zakryciem');
  // Cudzy stwór leżący twarzą w dół BEZ przyczyny — tak wygląda morph/disguise.
  const foe = [...state.objects.values()].find((o) => o.zone !== 'command' && o.controllerId === BOT_ID);
  assert.ok(foe, 'dowolny obiekt bota do eksperymentu');
  state.objects.set(foe.id, Object.freeze({ ...foe, faceDown: true }));
  assert.equal(session.nameOfObject(foe.id), 'Morph', 'bez przyczyny: stara etykieta (M127)');
});

test('M331/D: punkt etykiety ma jedno źródło — zakaz ręcznego „Morph\\" w nameOfObject', () => {
  const source = readFileSync(new URL('../src/table/session.js', import.meta.url), 'utf8');
  const start = source.indexOf('function nameOfObject(objectId');
  assert.ok(start >= 0, 'znaleziono nameOfObject');
  const body = source.slice(start, start + 3200);
  assert.match(body, /return faceDownLabel\(object, /, 'gałąź face-down liczy brzmienie ze wspólnego helpera');
  assert.doesNotMatch(body, /return faceDownName\(/, 'żadnej ręcznej etykiety obok helpera (L41)');
});
