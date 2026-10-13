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

// Kontekst (2026-10-13c): push `.github/workflows/*` był odmawiany przez
// GitHuba („refusing to allow a GitHub App to create or update workflow …
// without `workflows` permission"), więc zmiany powstawały we wzorcu
// w `docs/setup/workflows/` i czekały na ręczne wgranie. Właściciel przyznał
// Appce uprawnienie `workflows` i od tego czasu agent wnosi je sam, ale
// mechanizm zostaje jako bezpiecznik na wypadek powrotu ograniczenia: fragment
// czekający na wgranie oznacza się znacznikami
// `# >>> PENDING-UPLOAD (X)` … `# <<< PENDING-UPLOAD (X)`, a strażnik zgodności
// ignoruje WYŁĄCZNIE takie regiony. Każda inna różnica między wzorcem a żywym
// workflowem to błąd (np. ręczne cofnięcie protezy).
const PENDING_UPLOAD = /^[ \t]*# >>> PENDING-UPLOAD[^\n]*\n[\s\S]*?^[ \t]*# <<< PENDING-UPLOAD[^\n]*\n/gm;
const bezOczekujacejWgrywki = (text) => text.replace(PENDING_UPLOAD, '');

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
    assert.equal(normalize(bezOczekujacejWgrywki(copy)), normalize(bezOczekujacejWgrywki(live)),
      `${name}: wzorzec rozjechał się z faktycznym workflow poza linią uruchomienia testów `
      + 'oraz regionami oznaczonymi # >>> PENDING-UPLOAD');
  }
});

test('M104: runner testów zna tryby fast/slow/all', () => {
  const runner = fs.readFileSync(path.join(root, 'tools', 'run-tests.mjs'), 'utf8');
  for (const mode of ['fast', 'slow', 'all']) {
    assert.match(runner, new RegExp(`'${mode}'`), `runner musi obsługiwać tryb ${mode}`);
  }
});

test('2026-10-13c: publikacja na Pages jest odporna na re-run (artefakty `github-pages`)', () => {
  // Awaria runu 38424779872 (push 7bd1fcf) nie była regresją workflow: próba 1
  // padła na wyścigu (świeży artefakt `github-pages` nie był jeszcze widoczny
  // w API, gdy `deploy-pages` pytał o metadane), a próby 2–4 na kumulacji —
  // każdy re-run dokłada kolejny artefakt o tej samej nazwie, a `deploy-pages`
  // wymaga DOKŁADNIE jednego. Proteza: sprzątanie przed uploadem + czekanie na
  // widoczność świeżego artefaktu między uploadem a publikacją.
  const live = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.match(live, /^ {2}actions: write$/m,
    'żywy workflow musi mieć `actions: write`, inaczej krok sprzątający dostanie 403 i publikacja padnie');
  assert.match(live, /gh api --method DELETE "repos\/\$repo\/actions\/artifacts\/\$id"/,
    'sprzątanie musi realnie kasować artefakty (DELETE na API), nie tylko je liczyć');
  const sprzatanie = live.indexOf('Usuń artefakty `github-pages` z poprzednich prób tego runu');
  const upload = live.indexOf('actions/upload-pages-artifact@');
  const czekanie = live.indexOf('Poczekaj, aż świeży artefakt `github-pages` będzie widoczny dla API');
  const deploy = live.indexOf('actions/deploy-pages@');
  assert.ok(sprzatanie > 0, 'brak kroku sprzątania artefaktów poprzednich prób');
  assert.ok(upload > 0 && czekanie > 0 && deploy > 0, 'brak kroków publikacji (upload/czekanie/deploy)');
  assert.ok(sprzatanie < upload,
    'sprzątanie MUSI być przed uploadem — inaczej skasowałoby też świeży artefakt tej próby');
  assert.ok(upload < czekanie && czekanie < deploy,
    'oczekiwanie na widoczność artefaktu MUSI być między uploadem a publikacją');

  // Znaczniki PENDING-UPLOAD (jeśli są użyte) muszą być domknięte, a żywy
  // workflow nie może mieć „połowicznej" protezy: kroków sprzątania bez
  // uprawnienia `actions: write` (sprzątanie padłoby na 403).
  const wzorzec = fs.readFileSync(path.join(root, 'docs', 'setup', 'workflows', 'pages.yml'), 'utf8');
  const otwarte = wzorzec.match(/# >>> PENDING-UPLOAD/g) ?? [];
  const zamkniete = wzorzec.match(/# <<< PENDING-UPLOAD/g) ?? [];
  assert.equal(zamkniete.length, otwarte.length,
    'każdy region PENDING-UPLOAD w wzorcu musi mieć zamknięcie');
  const liveMaKroki = live.includes('Usuń artefakty `github-pages` z poprzednich prób tego runu');
  const liveMaUprawnienie = /^ {2}actions: write$/m.test(live);
  assert.ok(!liveMaKroki || liveMaUprawnienie,
    'żywy workflow ma kroki sprzątania bez `actions: write` — połowiczna proteza');
});
