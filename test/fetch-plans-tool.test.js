import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plansFromRows, withPlan, collectionCsvWithPlan } from '../tools/fetch-plans.mjs';

const ROWS = [
  ['Ilustracja', 'Nazwa Karty', 'Set / Fusion / Story', 'Plan / Setting', 'MV'],
  ['1LTR', 'Dunland Crebain', 'LTR', 'Śródziemie', '4'],
  ['2BFZ', 'Coralhelm Guide', 'BFZ', 'Zendikar', '2'],
  ['3CLB', 'Nefarious Imp', 'CLB', 'Forgotten Realms', '3'],
];

test('plansFromRows wyciąga mapę nazwa → plan (kolumna Plan / Setting)', () => {
  const plans = plansFromRows(ROWS);
  assert.equal(plans.get('dunland crebain'), 'Śródziemie');
  assert.equal(plans.get('coralhelm guide'), 'Zendikar');
  assert.equal(plans.get('nefarious imp'), 'Forgotten Realms');
  assert.equal(plans.size, 3);
});

test('plansFromRows pomija wiersze bez planu i zgłasza brak kolumn', () => {
  const sparse = [['Ilustracja', 'Nazwa Karty', 'Plan / Setting'], ['1X', 'Bezplan', '']];
  assert.equal(plansFromRows(sparse).size, 0);
  assert.throws(() => plansFromRows([['A', 'B']]), /Plan/);
});

test('withPlan wstawia plan idempotentnie do definicji karty', () => {
  const src = "defineCard({\n    id: 'dunland-crebain', name: 'Dunland Crebain', set: 'LTR',\n    colors: ['B'],\n    support: { status: 'supported' },\n  })";
  const r1 = withPlan(src, 'dunland-crebain', 'Śródziemie');
  assert.ok(r1.changed);
  assert.match(r1.source, /plan: 'Śródziemie'/);
  // Drugie wywołanie — aktualizacja wartości (idempotentna ścieżka replace).
  const r2 = withPlan(r1.source, 'dunland-crebain', 'Inny');
  assert.ok(r2.changed);
  assert.match(r2.source, /plan: 'Inny'/);
  assert.doesNotMatch(r2.source, /plan: 'Śródziemie'/);
});

test('collectionCsvWithPlan dodaje kolumnę Plan dopasowaną po nazwie', () => {
  const existing = 'Ilustracja,Nazwa Karty\n1LTR,Dunland Crebain\n2BFZ,Coralhelm Guide\n99XXX,Nieznana Karta\n';
  const plans = plansFromRows(ROWS);
  const out = collectionCsvWithPlan(existing, plans);
  const lines = out.trim().split('\n');
  assert.equal(lines[0], 'Ilustracja,Nazwa Karty,Plan');
  assert.equal(lines[1], '1LTR,Dunland Crebain,Śródziemie');
  assert.equal(lines[2], '2BFZ,Coralhelm Guide,Zendikar');
  assert.equal(lines[3], '99XXX,Nieznana Karta,'); // brak planu → pusta
});
