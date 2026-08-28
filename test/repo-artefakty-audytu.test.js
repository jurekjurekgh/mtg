// M253 (zlecenie właściciela 2026-08-28): repozytorium NIE trzyma transkryptów
// Żywego Testera — ani katalogów `tmp-audyt-` (konwencja M239), ani
// `tools/table-tester/audyt*` (M203/M205), ani logów i zrzutów z przebiegów.
// Transkrypt to artefakt przebiegu: dowodem audytu jest raport w `docs/audits/`
// (ew. fragment wklejony do opisu PR), a nie ~9 MB plików w historii. Pliki
// usunięte z repo nadal są w historii gita — decyzja jest odwracalna.
//
// Strażnik ma trzy nogi (wzorzec L39/L67 — przegląd profilaktyczny kończy się
// testem, nie dobrą wolą):
//   1. żadnego ŚLEDZONEGO pliku z tej klasy — czytane z `git ls-files`, bo to
//      ono mówi, co trafiłoby do commita (na dysku leżą gitignorowane kopie
//      z lokalnych przebiegów i nie są naruszeniem);
//   2. `.gitignore` nadal pokrywa te wzorce — inaczej następna sesja wrzuci
//      transkrypty z powrotem (M203: jeden gwiazdkowy wzorzec nie wystarczał);
//   3. kontrole pozytywne: `decks/*.txt` i wyniki benchmarku `tools/b1-*.txt`
//      ZOSTAJĄ — strażnik nie może być zielony przez „brak danych" (L26),
//      więc musi krzyczeć także wtedy, gdy ktoś posprząta za dużo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = process.cwd();

/** Wzorce artefaktów audytu, których repo nie trzyma. */
const FORBIDDEN = [
  /^tmp-audyt-/,
  /^tools\/table-tester\/(.+\/)?audyt(-|$|\.)/,
  /^tools\/table-tester\/.+\.log$/,
  /^tools\/table-tester\/.+\.zip$/,
];

/** Wzorce z .gitignore, które muszą pozostać, żeby artefakty nie wróciły. */
const IGNORE_RULES = [
  'tmp-audyt-*/',
  'tools/table-tester/*.txt',
  'tools/table-tester/**/*.txt',
  'tools/table-tester/**/*.log',
  'tools/table-tester/**/*.zip',
];

/**
 * Reguły .gitignore — bez komentarzy.
 *
 * L83: skan SUROWEGO pliku zalicza wzorzec wspomniany w komentarzu. Ten
 * strażnik wpadł w to przy pierwszej wersji: komentarz nad regułą cytował
 * ją dosłownie, więc usunięcie reguły zostawiało test zielony.
 */
function gitignoreRules() {
  return fs.readFileSync('.gitignore', 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function trackedFiles() {
  const git = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(git.status, 0,
    '`git ls-files` musi zadziałać — strażnik czyta indeks gita, nie dysk '
    + '(lokalne, gitignorowane transkrypty nie są naruszeniem)');
  return git.stdout.split('\n').filter(Boolean);
}

test('M253: repo nie trzyma transkryptów audytu (katalogi tmp-audyt-, tools/table-tester/audyt*)', () => {
  const tracked = trackedFiles();
  assert.ok(tracked.length > 100, `strażnik ma mieć dane (jest ${tracked.length} plików)`);
  const found = tracked.filter((file) => FORBIDDEN.some((re) => re.test(file)));
  assert.deepEqual(found, [],
    'Transkrypty i zrzuty Żywego Testera są artefaktami przebiegu — nie commitujemy ich. '
    + 'Dowód audytu to raport w docs/audits/ (ew. fragment wklejony do opisu PR). '
    + 'Naruszenia: ' + found.slice(0, 10).join(', '));
});

test('M253: .gitignore nadal wyklucza artefakty audytu (żeby nie wróciły następnym commitem)', () => {
  const rules = gitignoreRules();
  assert.ok(rules.length > 5, `.gitignore musi mieć reguły (jest ${rules.length})`);
  const missing = IGNORE_RULES.filter((rule) => !rules.includes(rule));
  assert.deepEqual(missing, [],
    `.gitignore musi pokrywać artefakty audytu — brakuje: ${missing.join(', ')}`);
});

test('M253 (kontrola pozytywna): talie i wyniki benchmarku ZOSTAJĄ w repo', () => {
  const tracked = trackedFiles();
  const decks = tracked.filter((f) => /^decks\/.*\.txt$/.test(f));
  const benchmarks = tracked.filter((f) => /^tools\/b\d*(-.*)?\.txt$/.test(f));
  assert.ok(decks.length >= 10, `talia to dane projektu, nie artefakt (jest ${decks.length})`);
  assert.ok(benchmarks.length >= 5,
    'wyniki benchmarku (ADR 0018: tools/b1-final-*.txt) zostają w repo — '
    + `strażnik nie może być zielony przez brak plików (jest ${benchmarks.length})`);
});
