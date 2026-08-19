// M102/U3 — audyt żywym testerem (rola gracza, 2026-08-16).
//
// OBJAW (transkrypt /tmp/g1.txt, krok 42): Springbloom Druid wchodzi na
// pole bitwy, a modal wyboru pokazuje CZTERY identyczne opcje:
//
//     Wybierz: Springbloom Druid — land do poświęcenia (4 opcje)
//       ▶ Springbloom Druid (poświęcenie landa)
//         Springbloom Druid (poświęcenie landa)
//         Springbloom Druid (poświęcenie landa)
//         Springbloom Druid (poświęcenie landa)
//
// Gracz poświęca land w ciemno — nie wie, czy oddaje Forest, czy jedyną górę
// (a to decyduje o kolorach many na resztę partii). Wśród tych opcji ukryta
// jest też rezygnacja (`skip: true`), nieodróżnialna od poświęcenia.
//
// ROOT CAUSE: `commandLabel` (src/table/render.js) nie ma gałęzi `case` dla
// `resolve_springbloom`, więc wszystkie warianty komendy spadają do `default`
// i dostają nazwę TYPU decyzji z REASONING_ACTION_LABELS — identyczną dla
// każdej opcji. Dokładnie ta sama klasa błędu co M101/B
// (`resolve_optional_pay_choice`) i M101/B7 (etykiety crew/saddle).
//
// Ta sama poprawka dotyczy `resolve_search_choice` z wieloma kopiami tej samej
// karty („Szukanie: Forest\" ×17) — tam nazwa jest poprawna, ale opcje są
// nierozróżnialne; numerujemy egzemplarze, żeby klik był świadomy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel, labelChoiceOptions } from '../src/table/render.js';

const view = {
  zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [] },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
};

// Trzy landy o różnych nazwach + duplikat — jak na realnym polu bitwy.
const NAMES = { land1: 'Forest', land2: 'Forest', land3: 'Mountain' };
const session = {
  nameOf: (id) => NAMES[id] ?? String(id),
  nameOfObject: (id) => NAMES[id] ?? String(id),
  cardDetails: () => null,
  abilitiesOf: () => [],
};

const label = (cmd) => commandLabel(cmd, session, view);

test('M102/U3: każda opcja poświęcenia landa nazywa KONKRETNY land', () => {
  const forest = label({ type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'land1' });
  const mountain = label({ type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'land3' });
  assert.match(forest, /Forest/, `opcja nie nazywa poświęcanego landa: „${forest}"`);
  assert.match(mountain, /Mountain/, `opcja nie nazywa poświęcanego landa: „${mountain}"`);
  assert.notEqual(forest, mountain, 'różne landy dają identyczną etykietę');
});

test('M102/U3: rezygnacja jest odróżnialna od poświęcenia', () => {
  const skip = label({ type: 'resolve_springbloom', playerId: 'p1', skip: true });
  const sac = label({ type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'land1' });
  assert.notEqual(skip, sac, `rezygnacja wygląda jak poświęcenie: „${skip}"`);
  assert.match(skip, /nie poświęcaj|rezygn|bez poświęc/i, skip);
});

// Rozróżnianie DUPLIKATÓW jest generyczne: robi je `labelChoiceOptions`,
// które widzi całą listę opcji naraz (pojedyncza etykieta nie wie, że gdzieś
// obok istnieje jej bliźniak). Dzięki temu poprawka działa dla KAŻDEGO typu
// wyboru, nie tylko dla Springblooma i szukania.
test('M102/U3: dwa egzemplarze tego samego landa są rozróżnialne', () => {
  const labels = labelChoiceOptions([
    { type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'land1' },
    { type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'land2' },
  ], session, view);
  assert.equal(new Set(labels).size, 2, `dwa egzemplarze Forest mają identyczną etykietę: ${JSON.stringify(labels)}`);
});

test('M102/U3: kopie tej samej karty w szukaniu biblioteki są rozróżnialne', () => {
  const cmds = ['land1', 'land2', 'land3'].map((id) => ({ type: 'resolve_search_choice', playerId: 'p1', found: id }));
  const labels = labelChoiceOptions(cmds, session, view);
  assert.match(labels[0], /Forest/, labels[0]);
  assert.equal(new Set(labels).size, 3, `kopie mają identyczne etykiety: ${JSON.stringify(labels)}`);
  // Unikat (Mountain) nie dostaje sztucznego numeru — numerujemy tylko duplikaty.
  assert.equal(labels[2], 'Szukanie: Mountain', labels[2]);
});

test('M102/U3: unikalne opcje zostają nietknięte', () => {
  const labels = labelChoiceOptions([
    { type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'land3' },
    { type: 'resolve_springbloom', playerId: 'p1', skip: true },
  ], session, view);
  assert.equal(new Set(labels).size, 2);
  assert.ok(labels.every((l) => !/\d+\s*z\s*\d+/.test(l)), `nie numerujemy unikatów: ${JSON.stringify(labels)}`);
});
