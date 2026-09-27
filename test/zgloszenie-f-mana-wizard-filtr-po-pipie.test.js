import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wizardProgress } from '../src/table/mana-wizard.js';

/**
 * F (zgłoszenie właściciela 2026-09-25g): koszt {1}{W}{U} — po zapłaceniu
 * {U} kreator pokazywał TYLKO W-landy, a powinien WSZYSTKIE źródła.
 * Ograniczenie do brakującego koloru włącza się dopiero, gdy do zapłacenia
 * zostanie SAMA mana kolorowa (z pipem).
 *
 * Root cause: `wizardProgress` liczył filtr jako `pool >= genericNeeded`,
 * gdzie `pool` to SUMA many w puli — a jednostka pokrywająca pip liczyła
 * się PODWÓJNIE (i do sumy generycznej, i do pipu). Poprawka:
 * `(pool - covered) >= genericNeeded` (każdy pokryty pip zużywa 1 manę).
 *
 * Świadkowie arytmetyki (mają być zielone PRZED i PO fixie — dowód, że
 * poprawka nie łamie zgłoszenia G ani uwagi 23c): F2, F3, F4.
 */

function widok(battlefield, mana) {
  return {
    players: [{ id: 'p1', mana }],
    zones: { battlefield },
  };
}

const POLE = [
  { id: 'l1', cardId: 'basic-plains', kind: 'land', controllerId: 'p1', tapped: false },
  { id: 'l2', cardId: 'basic-island', kind: 'land', controllerId: 'p1', tapped: false },
  { id: 'l3', cardId: 'basic-mountain', kind: 'land', controllerId: 'p1', tapped: false },
];
const ZRODLA = [
  { id: 'l1', cardId: 'basic-plains', colors: ['W'], amount: 1 },
  { id: 'l2', cardId: 'basic-island', colors: ['U'], amount: 1 },
  { id: 'l3', cardId: 'basic-mountain', colors: ['R'], amount: 1 },
];
const KOSZT_1WU = { totalNeeded: 3, requirements: [['W'], ['U']], costStr: '{1}{W}{U}' };

// F1: pin zgłoszenia — po {U} z {1}{W}{U} zostają WSZYSTKIE źródła.
test('F1: {1}{W}{U} po tapnięciu Wyspy — kreator pokazuje wszystkie źródła', () => {
  const poolUnits = [['U']];
  const p = wizardProgress(widok(POLE, 1), 'p1', KOSZT_1WU, ZRODLA, poolUnits);
  assert.deepEqual(
    p.untappedSources.map((s) => s.id).sort(),
    ['l1', 'l2', 'l3'].sort(),
    'pip {U} nie zamyka części generycznej — Góra płaci {1}, Równina {W}',
  );
  assert.equal(p.done, false);
});

// F2: regresja G — {1}{B} po tapnięciu Lasu (mana NIE na pip) → tylko {B}.
test('F2: {1}{B} po tapnięciu Lasu — tylko Bagno (zgłoszenie G bez zmian)', () => {
  const pole = [
    { id: 'l3', cardId: 'basic-forest', kind: 'land', controllerId: 'p1', tapped: false },
    { id: 'l4', cardId: 'basic-swamp', kind: 'land', controllerId: 'p1', tapped: false },
  ];
  const zrodla = [
    { id: 'l3', cardId: 'basic-forest', colors: ['G'], amount: 1 },
    { id: 'l4', cardId: 'basic-swamp', colors: ['B'], amount: 1 },
  ];
  const koszt = { totalNeeded: 2, requirements: [['B']], costStr: '{1}{B}' };
  const p = wizardProgress(widok(pole, 1), 'p1', koszt, zrodla, [['G']]);
  assert.deepEqual(p.untappedSources.map((s) => s.id), ['l4'], 'suma generyczna zebrana ({G}), brakuje tylko {B}');
});

// F3: regresja uwagi 23c — {1}{B}{G} po {U,B} → tylko {G}.
test('F3: {1}{B}{G} po tapnięciu {U} i {B} — tylko {G} (uwaga 23c bez zmian)', () => {
  const pole = [
    { id: 'g', cardId: 'basic-forest', kind: 'land', controllerId: 'p1', tapped: false },
    { id: 'm', cardId: 'basic-mountain', kind: 'land', controllerId: 'p1', tapped: false },
  ];
  const zrodla = [
    { id: 'g', cardId: 'basic-forest', colors: ['G'], amount: 1 },
    { id: 'm', cardId: 'basic-mountain', colors: ['R'], amount: 1 },
  ];
  const koszt = { totalNeeded: 3, requirements: [['B'], ['G']], costStr: '{1}{B}{G}' };
  const p = wizardProgress(widok(pole, 2), 'p1', koszt, zrodla, [['U'], ['B']]);
  assert.deepEqual(p.untappedSources.map((s) => s.id), ['g'], '{U} zamknęło {1}, {B} pip — zostaje sam pip {G}');
});

// F4: koszt z samych pipów ({W}{W}{U}) — filtr od razu (pula 0).
test('F4: {W}{W}{U} przy pustej puli — tylko źródła W/U (brak części generycznej)', () => {
  const koszt = { totalNeeded: 3, requirements: [['W'], ['W'], ['U']], costStr: '{W}{W}{U}' };
  const p = wizardProgress(widok(POLE, 0), 'p1', koszt, ZRODLA, []);
  assert.deepEqual(
    p.untappedSources.map((s) => s.id).sort(),
    ['l1', 'l2'].sort(),
    'do zapłacenia sama mana kolorowa — Góra bezużyteczna od razu',
  );
});

// F5: pełna sekwencja {1}{W}{U}: Wyspa → dowolne → Równina → dowolne → Góra → done.
test('F5: {1}{W}{U} domyka się w trzech tapnięciach, filtr nie blokuje sumy', () => {
  let poolUnits = [];
  const tap = (id) => {
    const src = ZRODLA.find((s) => s.id === id);
    poolUnits = [...poolUnits, src.colors];
    return wizardProgress(widok(POLE, poolUnits.length), 'p1', KOSZT_1WU, ZRODLA, poolUnits);
  };
  const poU = tap('l2');
  assert.equal(poU.done, false);
  assert.equal(poU.untappedSources.length, 3, 'po {U} wszystkie 3 źródła');
  const poW = tap('l1');
  assert.equal(poW.done, false);
  assert.equal(poW.untappedSources.length, 3, 'po {W} wszystkie 3 źródła (brakuje sumy {1})');
  const poR = tap('l3');
  assert.equal(poR.done, true, 'płatność domyka się trzecim tapnięciem');
});
