// Audyt #168/A-11: historyczny PMSSB-69 nie może uczyć odwrotności CR 726.2/726.5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plan = readFileSync('docs/plans/PLAN_2026-10-20b-pmssb69-initiative.md', 'utf8');
const hub = readFileSync('docs/PMSSB.md', 'utf8');
const pmssb69 = hub.split('## PMSSB-69 —')[1]?.split('\n## PMSSB-70 —')[0] ?? '';
const oneLine = (text) => text.replace(/\s+/g, ' ');

test('A-11: plan PMSSB-69 jawnie oznacza F1 jako historyczną hipotezę obaloną przez CR', () => {
  assert.match(oneLine(plan), /Korekta.*A-3.*CR 726\.2.*ponown.*venture/i);
  assert.match(oneLine(plan), /F1 \(historyczn/i);
});

test('A-11: bieżący opis PMSSB-69 rozdziela pomiar sprzed audytu od aktualnej wyceny', () => {
  assert.match(oneLine(pmssb69), /Korekta.*A-3.*CR 726\.2.*ponown.*venture/i);
  assert.match(pmssb69, /Obecnie: 6 dla aktualnego posiadacza/i);
  assert.match(oneLine(pmssb69), /Tabela PRZED\/PO.*historyczn/i);
});
