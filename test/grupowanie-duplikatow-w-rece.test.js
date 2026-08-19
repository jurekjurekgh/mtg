// M102/U4 — zgłoszenie właściciela (2026-08-16):
// „Jeśli mam w ręce więcej niż 1 sztukę takiego samego lądu, to nie ma sensu
//  wyświetlać w opcjach »Twoje działania« kilka razy tego samego. Zamiast
//  4 razy »Zagraj Forest« wystarczy np. »Zagraj Forest (1 z 4)«."
//
// OBJAW: cztery Foresty w ręce = cztery identyczne przyciski „Zagraj ląd:
// Forest" w panelu akcji. Klik w którykolwiek daje ten sam skutek (karty są
// w pełni wymienne — ten sam cardId, ta sama strefa, ten sam efekt zagrania),
// więc trzy z nich to czysty szum, który spycha realne decyzje poza ekran.
//
// ROOT CAUSE: `buildChoiceRequestEntries` grupuje warianty JEDNEJ decyzji
// (cele czaru, tryby modalne) po `choiceRequestGroupKey`, ale `play_land`
// nie ma tam klucza — każdy egzemplarz przechodzi jako osobny `{ command }`
// i dostaje własny przycisk.
//
// KONTRAKT poprawki (świadomie wąski, żeby nie ukryć realnych wyborów):
// scalamy WYŁĄCZNIE komendy w pełni wymienne — ten sam typ, ten sam cardId
// i ta sama strefa źródłowa. Różne nazwy kart (Forest vs Mountain) zostają
// osobno, bo wybór między nimi to realna decyzja gracza.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActionEntries, commandLabel } from '../src/table/render.js';

const HAND = [
  { id: 'f1', cardId: 'basic-forest', zone: 'hand', controllerId: 'p1' },
  { id: 'f2', cardId: 'basic-forest', zone: 'hand', controllerId: 'p1' },
  { id: 'f3', cardId: 'basic-forest', zone: 'hand', controllerId: 'p1' },
  { id: 'f4', cardId: 'basic-forest', zone: 'hand', controllerId: 'p1' },
  { id: 'm1', cardId: 'basic-mountain', zone: 'hand', controllerId: 'p1' },
];

const view = {
  turn: { number: 3, step: 'main', phase: 'precombat_main' },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: { hand: HAND, battlefield: [], stack: [], graveyard: [], library: [], exile: [] },
};

const NAMES = { 'basic-forest': 'Forest', 'basic-mountain': 'Mountain' };
const session = {
  nameOf: (id) => NAMES[id] ?? String(id),
  nameOfObject: (id) => NAMES[id] ?? String(id),
  cardDetails: () => null,
  abilitiesOf: () => [],
};

const landCmd = (objectId) => ({ type: 'play_land', playerId: 'p1', objectId });
const labelsOf = (entries) => entries.map((e) => e.label ?? commandLabel(e.command, session, view));

test('M102/U4: cztery identyczne Foresty dają JEDEN przycisk, nie cztery', () => {
  const commands = [landCmd('f1'), landCmd('f2'), landCmd('f3'), landCmd('f4')];
  const entries = buildActionEntries(commands, session, view);
  assert.equal(entries.length, 1, `oczekiwano 1 przycisku, jest ${entries.length}: ${JSON.stringify(labelsOf(entries))}`);
});

test('M102/U4: scalony przycisk pokazuje licznik „(1 z 4)"', () => {
  const commands = [landCmd('f1'), landCmd('f2'), landCmd('f3'), landCmd('f4')];
  const [entry] = buildActionEntries(commands, session, view);
  assert.match(entry.label, /Forest/, entry.label);
  assert.match(entry.label, /1 z 4/, `brak licznika egzemplarzy: „${entry.label}"`);
});

test('M102/U4: klik scalonego przycisku zagrywa konkretną kartę (pierwszy egzemplarz)', () => {
  const commands = [landCmd('f1'), landCmd('f2'), landCmd('f3'), landCmd('f4')];
  const [entry] = buildActionEntries(commands, session, view);
  // Panel musi wykonać PRAWDZIWĄ komendę silnika — scalanie jest wyłącznie
  // prezentacją, nie może zmienić kontraktu `play`.
  assert.deepEqual(entry.command, landCmd('f1'));
});

test('M102/U4: RÓŻNE landy zostają osobnymi przyciskami (to realny wybór)', () => {
  const commands = [landCmd('f1'), landCmd('f2'), landCmd('m1')];
  const entries = buildActionEntries(commands, session, view);
  assert.equal(entries.length, 2, `Forest i Mountain to różne decyzje: ${JSON.stringify(labelsOf(entries))}`);
  const labels = labelsOf(entries).join(' | ');
  assert.match(labels, /Forest/);
  assert.match(labels, /Mountain/);
});

test('M102/U4: pojedynczy ląd nie dostaje licznika', () => {
  const entries = buildActionEntries([landCmd('m1')], session, view);
  assert.equal(entries.length, 1);
  assert.ok(!/\d+\s*z\s*\d+/.test(entries[0].label), `unikat nie powinien mieć licznika: „${entries[0].label}"`);
});

test('M102/U4: pozostałe akcje przechodzą nietknięte', () => {
  const commands = [landCmd('f1'), landCmd('f2'), { type: 'pass_priority', playerId: 'p1' }, { type: 'concede', playerId: 'p1' }];
  const entries = buildActionEntries(commands, session, view);
  assert.equal(entries.length, 3, JSON.stringify(labelsOf(entries)));
  const types = entries.map((e) => (e.command ?? e.first)?.type);
  assert.deepEqual(types, ['play_land', 'pass_priority', 'concede']);
});

// M149/C (uwaga właściciela): wybór celu Cuombajj Witches (resolve_opponent_target)
// ma się pokazywać jako MODAL z celami, nie jako X osobnych przycisków „play".
// Wiele komend resolve_opponent_target (różne cele) grupuje się w jeden
// `{ request }` (otwierany modala), spójnie z resolve_trigger_target.
test('M149/C: wiele celów resolve_opponent_target grupuje się w jeden modal (request)', () => {
  const commands = [
    { type: 'resolve_opponent_target', playerId: 'p1', targetId: 'a' },
    { type: 'resolve_opponent_target', playerId: 'p1', targetId: 'b' },
    { type: 'resolve_opponent_target', playerId: 'p1', targetId: 'c' },
  ];
  const entries = buildActionEntries(commands, session, view);
  assert.equal(entries.length, 1, `oczekiwano 1 wpisu-modal, jest ${entries.length}`);
  const entry = entries[0];
  assert.ok(entry.request, 'resolve_opponent_target z wieloma celami musi otwierać modal (request)');
  assert.equal(entry.request.options.length, 3, 'modal niesie wszystkie cele');
  assert.equal(entry.request.type, 'target', 'typ modala to target');
});
