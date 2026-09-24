// D3 (Żywy Tester, PR #135, Etap F): kreator ze stepperem X ma dwa kształty —
// „Tap X artefaktów” (Dockhand: Zatwierdź ⇔ zaznaczono dokładnie X wierszy)
// oraz X + CELE (Fireball: Zatwierdź ⇔ ≥ 1 cel i X + R + {1} za każdy cel
// ponad pierwszy mieści się w puli many). Dawna polityka testera („X = max,
// zaznacz X wierszy”) w drugim kształcie nigdy nie włączała Zatwierdź —
// partia audyt-f4-ubr vs ravnica seed 1 klikała „Rzuć: Fireball” ~120 razy
// do limitu kroków. Test sprawdza wyodrębnioną politykę na atrapie kreatora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseXWizard } from '../tools/table-tester/x-wizard.mjs';

function fakeWizard({ xMin = 0, xMax, rowCount, confirmRule }) {
  let x = xMin;
  const rows = Array.from({ length: rowCount }, () => {
    const row = { checked: false, disabled: false, click() { row.checked = !row.checked; } };
    return row;
  });
  const selected = () => rows.filter((r) => r.checked).length;
  return {
    ui: {
      readX: () => x,
      plus: { click() { if (x < xMax) x += 1; } },
      minus: { click() { if (x > xMin) x -= 1; } },
      rows: () => rows,
      confirmEnabled: () => confirmRule(x, selected()),
    },
    selected,
  };
}

test('X + cele (Fireball): tester składa legalny wybór zamiast pętli anulowań', async () => {
  // Pula 3 many: X + R + (cele − 1) ≤ 3, co najmniej jeden cel; xMax liczony
  // przez kreator dla jednego celu = 2 (jak w transkrypcie: „X=2, … w puli 3”).
  const mana = 3;
  const { ui, selected } = fakeWizard({
    xMax: 2,
    rowCount: 3,
    confirmRule: (x, n) => n >= 1 && x + 1 + (n - 1) <= mana,
  });
  const res = await chooseXWizard(ui);
  assert.equal(res.ok, true, 'Zatwierdź włączony — rzut dochodzi do skutku');
  assert.equal(res.x, 2, 'X pozostaje maksymalne osiągalne');
  assert.equal(selected(), 1, 'jeden cel (dwa przekroczyłyby pulę)');
});

test('X + cele: gdy przy X max nic nie przechodzi, polityka schodzi z X', async () => {
  // Atrapa wymaga dwóch celów (np. kreator z minimalną liczbą celów 2),
  // a pula 3 many mieści X + 1 + 1 ≤ 3 dopiero przy X = 1.
  const { ui, selected } = fakeWizard({
    xMax: 2,
    rowCount: 3,
    confirmRule: (x, n) => n >= 2 && x + 1 + (n - 1) <= 3,
  });
  const res = await chooseXWizard(ui);
  assert.equal(res.ok, true);
  assert.equal(res.x, 1);
  assert.equal(selected(), 2);
});

test('Tap X artefaktów (Dockhand): dalej X = max i dokładnie X wierszy', async () => {
  const { ui, selected } = fakeWizard({
    xMax: 3,
    rowCount: 4,
    confirmRule: (x, n) => n === x,
  });
  const res = await chooseXWizard(ui);
  assert.equal(res.ok, true);
  assert.equal(res.x, 3);
  assert.equal(selected(), 3);
});

test('X bez wierszy (Epic Experiment): X = max zatwierdzany bez zaznaczeń', async () => {
  const { ui } = fakeWizard({ xMax: 4, rowCount: 0, confirmRule: () => true });
  const res = await chooseXWizard(ui);
  assert.deepEqual(res, { x: 4, picked: 0, pool: 0, ok: true });
});

test('nie da się złożyć: polityka kończy (ok=false), bez nieskończonej pętli', async () => {
  const { ui } = fakeWizard({ xMax: 5, rowCount: 2, confirmRule: () => false });
  const res = await chooseXWizard(ui);
  assert.equal(res.ok, false);
  assert.equal(res.x, 0);
});

test('run-game.mjs korzysta z wyodrębnionej polityki (brak starej gałęzi „X wierszy”)', () => {
  const src = readFileSync('tools/table-tester/run-game.mjs', 'utf8');
  assert.match(src, /import \{ chooseXWizard \} from '\.\/x-wizard\.mjs'/);
  assert.match(src, /await chooseXWizard\(/);
  assert.doesNotMatch(src, /artefaktów w puli/);
});

test('D3: korekta po odmowie kreatora walki nie klika „Zatwierdź” w zamkniętym wizardzie', () => {
  // „Bez bloków”/„Bez ataku” same wysyłają deklarację (M124). Bezwarunkowe
  // ponowne „Zatwierdź” trafiało w nieaktualny kreator — silnik odrzucał drugą
  // deklarację (audyt-f4-ubr vs kaladesh seed 9, profil explorer).
  const src = readFileSync('tools/table-tester/run-game.mjs', 'utf8');
  const i = src.indexOf('poprawiam wybór');
  assert.ok(i > 0, 'gałąź korekty po odmowie istnieje');
  const branch = src.slice(i, i + 2000);
  assert.match(branch, /const stillOpen = visible\(\$\('#choice-request'\)\) && \$\('#choice-request \.combat-wizard-error'\)/);
  assert.match(branch, /const again = stillOpen\s*\?/);
});
