// M104/E5 — strażnik spójności workflowów CI z ADR 0019 (tiers testów).
//
// Kontekst: pełny pakiet uruchamiany przez `node --test 'test/**/*.test.js'`
// szedł w CI SEKWENCYJNIE (~14 min na 2 vCPU). ADR 0019 wprowadził runner
// `tools/run-tests.mjs`, ale workflowy zostały ze starą komendą — rozjazd
// przeżył dwie sesje (M103 zapisał go w handoffie jako „znany rozjazd",
// bo push plików .github/workflows/* bywa blokowany brakiem uprawnienia
// `workflows` u App-a).
//
// Kopia workflowów mieszka w `docs/setup/workflows/` — właśnie po to, żeby
// sesja bez uprawnienia zostawiła gotową treść do ręcznego wgrania. Push
// z tej sesji potwierdził blokadę: „refusing to allow a GitHub App to create
// or update workflow `.github/workflows/ci.yml` without `workflows`
// permission". Test pilnuje, żeby wzorzec używał runnera tiers i żeby obie
// wersje nie rozjechały się w niczym poza linią uruchomienia testów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = ['ci.yml', 'pages.yml'];

test('M104: wzorzec workflowów (docs/setup/workflows) używa runnera tiers (ADR 0019)', () => {
  for (const name of WORKFLOWS) {
    const text = fs.readFileSync(path.join(root, 'docs', 'setup', 'workflows', name), 'utf8');
    assert.match(text, /node tools\/run-tests\.mjs all/,
      `${name}: wzorzec musi uruchamiać pakiet runnerem tiers (ADR 0019)`);
    assert.doesNotMatch(text, /node --test 'test/,
      `${name}: sekwencyjne node --test to ~14 min na 2 vCPU`);
  }
});

test('M104: wzorzec i faktyczny workflow różnią się WYŁĄCZNIE linią uruchomienia testów', () => {
  // Sesja agentowa nie może wypchnąć `.github/workflows/*` (GitHub App bez
  // uprawnienia `workflows` — push odbija się z „refusing to allow a GitHub
  // App to create or update workflow"). Dlatego docelowa treść czeka we
  // wzorcu, a właściciel wgrywa ją ręcznie (albo nadaje App-owi uprawnienie).
  // Test pilnuje, żeby przez ten czas obie wersje nie rozjechały się w NICZYM
  // INNYM niż ta jedna linia — inaczej ręczne wgranie cofnęłoby zmiany.
  const normalize = (text) => text
    .replace(/ {6}- name: Testy[^\n]*\n {8}run: [^\n]*\n/g, '      - name: TESTY\n        run: RUNNER\n');
  for (const name of WORKFLOWS) {
    const live = fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');
    const copy = fs.readFileSync(path.join(root, 'docs', 'setup', 'workflows', name), 'utf8');
    assert.equal(normalize(copy), normalize(live),
      `${name}: wzorzec rozjechał się z faktycznym workflow poza linią uruchomienia testów`);
  }
});

test('M104: runner testów zna tryby fast/slow/all', () => {
  const runner = fs.readFileSync(path.join(root, 'tools', 'run-tests.mjs'), 'utf8');
  for (const mode of ['fast', 'slow', 'all']) {
    assert.match(runner, new RegExp(`'${mode}'`), `runner musi obsługiwać tryb ${mode}`);
  }
});
