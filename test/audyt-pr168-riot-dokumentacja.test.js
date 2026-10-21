// Audyt #168/A-13: historyczna sonda PMSSB-71 używała wyzwalanego wyboru
// po wejściu; CR 702.136a wymaga efektu zastępującego PRZED wejściem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plan = readFileSync('docs/plans/PLAN_2026-10-20e-pmssb71-riot.md', 'utf8');
const hub = readFileSync('docs/PMSSB.md', 'utf8').split('## PMSSB-71 —')[1]?.split('\n## Luka convoke')[0] ?? '';
const oneLine = (s) => s.replace(/\s+/g, ' ');

test('A-13: stara sonda PMSSB-71 jest oznaczona jako historia, a riot jako replacement', () => {
  assert.match(oneLine(plan), /Korekta.*A-2.*CR 702\.136a.*przed wejściem.*zastęp/i);
  assert.match(oneLine(plan), /modalny trigger.*historyczn/i);
});

test('A-13: hub PMSSB-71 wskazuje aktualną ścieżkę przed wejściem, nie modal na stosie', () => {
  assert.match(oneLine(hub), /Korekta.*A-2.*CR 702\.136a.*przed wejściem.*zastęp/i);
  assert.match(hub, /resolve_riot_choice/);
});
