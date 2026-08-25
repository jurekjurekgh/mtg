// M203 — talie w narzędziu audytu i w dokumentacji (znalezisko audytu PR #74).
//
// Żywy Tester (`tools/table-tester/run-game.mjs`) miał domyślne talie
// `green`/`red`, które PRZESTAŁY istnieć w M178 (ADR 0023: talie per plan,
// „stare nazwy talii … przestały istnieć"). Wybór talii w sterowniku jest
// pętlą „jeśli opcja pasuje, ustaw" — bez else, więc podanie nieistniejącej
// talii NIE jest błędem: tester gra tym, co było wybrane w artefakcie,
// a transkrypt i tak nagłówkuje się podaną nazwą. Audyt „green vs red"
// mierzył więc coś innego, niż zapowiadał (klasa L24/L33 — narzędzie, które
// cicho mija się z prawdą o stanie gry).
//
// Reguły pilnowane tutaj:
//  1. domyślne talie testera ISTNIEJĄ w `decks/`;
//  2. nieistniejąca talia to JAWNY błąd z listą dostępnych (brak cichego
//     fallbacku) — i to samo dotyczy drugiego gracza (`--bot`);
//  3. nazwy talii podane w dokumentacji narzędzia (`TESTER_STOLU.md`,
//     `tools/table-tester/README.md`, `decks/README.md`) istnieją — bo to
//     właśnie rozjazd dokumentacji z `decks/*.txt` wpędził tester w
//     nieistniejące domyślne (L56: twierdzenie o danych sprawdzasz grepem,
//     a jeśli ma żyć w repo — dostaje strażnika).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RUNNER = 'tools/table-tester/run-game.mjs';
const DECKS = fs.readdirSync('decks').filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', ''));
const source = fs.readFileSync(RUNNER, 'utf8');

// Walidacja talii dzieje się w parseArgs, czyli PRZED bootowaniem artefaktu,
// więc `--list-decks` daje tę samą ścieżkę błędu bez ~2 s startu jsdom.
function runTester(args) {
  return spawnSync(process.execPath, [RUNNER, ...args, '--list-decks'], {
    encoding: 'utf8', timeout: 60_000, cwd: path.resolve('.'),
  });
}

test('M203/1: domyślne talie Żywego Testera istnieją w decks/', () => {
  const defaults = [...source.matchAll(/^\s+(human|bot): '([\w-]+)',$/gm)].map((m) => ({ flag: m[1], deck: m[2] }));
  assert.ok(defaults.length >= 2, `znaleziono domyślne talie w ${RUNNER}: ${JSON.stringify(defaults)}`);
  const missing = defaults.filter((d) => !DECKS.includes(d.deck));
  assert.deepEqual(missing, [], `domyślna talia nie istnieje w decks/ (dostępne: ${DECKS.join(', ')})`);
});

test('M203/2: nieistniejąca talia gracza to jawny błąd, nie cichy fallback', () => {
  const res = runTester(['--human', 'talia-ktorej-nie-ma', '--bot', DECKS[0]]);
  assert.notEqual(res.status, 0, 'tester powinien zakończyć się błędem przy nieistniejącej talii');
  const out = `${res.stdout}\n${res.stderr}`;
  assert.match(out, /talia-ktorej-nie-ma/, 'komunikat nazywa szukaną talię');
  assert.ok(DECKS.some((deck) => out.includes(deck)), 'komunikat podaje dostępne talie');
});

test('M203/2b: to samo dotyczy talii bota (--bot)', () => {
  const res = runTester(['--human', DECKS[0], '--bot', 'druga-nieistniejaca']);
  assert.notEqual(res.status, 0, 'tester powinien zakończyć się błędem przy nieistniejącej talii bota');
  assert.match(`${res.stdout}\n${res.stderr}`, /druga-nieistniejaca/);
});

test('M203/3: nazwy talii w dokumentacji istnieją w decks/', () => {
  const docs = ['docs/setup/TESTER_STOLU.md', 'tools/table-tester/README.md', 'decks/README.md'];
  const problems = [];
  for (const doc of docs) {
    const body = fs.readFileSync(doc, 'utf8');
    // Nazwa talii w dokumentacji pojawia się w trzech miejscach: przy fladze
    // testera (`--human ravnica`), jako `nazwa.txt` i w liście „talie: a, b".
    // Celowo NIE skanujemy każdego `.txt` — to złapałoby pliki transkryptów
    // (`--out g1.txt`), które z taliami nie mają nic wspólnego.
    const fromFlags = [...body.matchAll(/--(?:human|bot)\s+([a-z][\w-]*)/g)].map((m) => m[1]);
    // `.txt` liczymy tylko ze sciezka `decks/…` — sam backtick zlapalby
    // `transcript.txt` (domyslny plik transkryptu), ktory talia nie jest.
    const fromFiles = [...body.matchAll(/decks\/([a-z][\w-]*)\.txt/g)].map((m) => m[1]);
    const fromLists = [...body.matchAll(/[Tt]alie[^\n]*\(([^)]*)\)/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/`/g, '')))
      .filter((s) => /^[a-z][\w-]*$/.test(s));
    for (const deck of new Set([...fromFlags, ...fromFiles, ...fromLists])) {
      if (!DECKS.includes(deck)) problems.push(`${doc}: talia „${deck}" nie istnieje w decks/`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('M203/4 (mutacja): strażnik domyślnych talii czerwienieje po podmianie na nieistniejącą', () => {
  // Weryfikacja mutacyjna (ADR 0016): gdyby ktoś przywrócił `human: 'green'`,
  // asercja z testu 1 musi to złapać — sprawdzamy ją na kopii źródła.
  const mutated = source.replace(/^(\s+human: ')([\w-]+)(',)$/m, '$1green$3');
  assert.notEqual(mutated, source, 'mutacja faktycznie zmienia domyślną talię');
  const mutatedDefaults = [...mutated.matchAll(/^\s+(human|bot): '([\w-]+)',$/gm)].map((m) => m[2]);
  assert.ok(mutatedDefaults.some((deck) => !DECKS.includes(deck)), 'po mutacji istnieje domyślna talia spoza decks/');
});

test('M203/5: katalog talii nie jest pusty i wszystkie pliki są niepuste', () => {
  assert.ok(DECKS.length >= 6, `oczekiwano co najmniej 6 talii, jest ${DECKS.length}: ${DECKS.join(', ')}`);
  for (const deck of DECKS) {
    const size = fs.statSync(path.join('decks', `${deck}.txt`)).size;
    assert.ok(size > 20, `talia ${deck}.txt jest pusta (${size} B)`);
  }
});

test('M203/6: --list-decks wypisuje talie z decks/ (i waliduje nazwy przed partią)', () => {
  const res = runTester([]);
  assert.equal(res.status, 0, `--list-decks powinno kończyć się sukcesem: ${res.stderr}`);
  const listed = res.stdout.split('\n').map((s) => s.trim()).filter(Boolean).sort();
  assert.deepEqual(listed, [...DECKS].sort(), 'lista talii testera = zawartość decks/');
});
