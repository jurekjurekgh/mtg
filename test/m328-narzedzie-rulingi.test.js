import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeRulings, applyRulings } from '../tools/fetch-card-rulings.mjs';

/**
 * M328 (audyt PR #102, F5): `tools/fetch-card-rulings.mjs` był martwy jako CLI.
 *
 * Blok bezpośredniego uruchomienia czytał zmienną `files`, której nikt nie
 * zadeklarował — KAŻDY przebieg (`node tools/fetch-card-rulings.mjs`, także z
 * `--only=` i `--dry-run`) wywalał się `ReferenceError`em w pierwszej linijce,
 * zanim cokolwiek pobrał lub zapisał. Eksportowane pomocniki
 * (`normalizeRulings`, `applyRulings`) działały, więc testy jednostkowe nic nie
 * widziały — a dokumentacja narzędzia (ADR 0028 §3) obiecuje workflow
 * „ściągnij rulingi wskazanej karty\". Zmierzone: 0 snapshotów z realnym
 * `rulingsSource` pochodzącym z tego skryptu, a `veiled-ascension` miał
 * zachowanie przypięte do rulerządu WotC, którego w snapshotcie nie było
 * wcale (14 pozycji dopisanych w tym commicie z `fetch_page`, ten sam
 * endpoint i to samo okno dat).
 *
 * Testy poniżej NIE sieciują (egress w sandboxie jest zablokowany) — idą
 * ścieżkami, które kończą się PRZED `fetch()`: puste `--only`, pominięcie
 * snapshotu bez `set`/`collector_number`. To właśnie one czerwienieją, gdy
 * `files` znowu zniknie — sam `ReferenceError` nie jest tu asercją.
 */

const TOOL = new URL('../tools/fetch-card-rulings.mjs', import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

function runTool(args, cardsDir) {
  return spawnSync(process.execPath, [path.resolve(REPO, 'tools/fetch-card-rulings.mjs'), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, MTG_CARDS_DIR: cardsDir },
  });
}

test('M328/A: CLI w ogóle startuje (RED przed naprawą: ReferenceError `files`)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtg-rulings-'));
  try {
    const r = runTool(['--only=brak-takiego-slugu'], dir);
    assert.ok(!/ReferenceError/.test(r.stderr), `stderr: ${r.stderr.slice(0, 200)}`);
    assert.match(r.stderr, /Brak snapshotów/, `komunikat o pustym --only: ${r.stderr.slice(0, 200)}`);
    assert.equal(r.status, 1, 'pusty zbiór celów to błąd, nie ciche 0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('M328/B: --only filtruje po slugu i pomija snapshoty bez set/kolekcji (bez sieci)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtg-rulings-'));
  try {
    // Świadomie BEZ `set`/`collector_number`: narzędzie pomija taki plik przed
    // jakimkolwiek `fetch()`, więc test pozostaje hermetyczny.
    writeFileSync(path.join(dir, 'scryfall-alpha-karta.json'), JSON.stringify({ name: 'Alpha' }), 'utf8');
    writeFileSync(path.join(dir, 'scryfall-beta-karta.json'), JSON.stringify({ name: 'Beta' }), 'utf8');
    const matched = runTool(['--dry-run', '--only=alpha'], dir);
    assert.match(matched.stdout, /POMINIĘTY scryfall-alpha-karta\.json/, `stdout: ${matched.stdout}`);
    assert.doesNotMatch(matched.stdout, /beta-karta/, `--only nie wpuścił obcego pliku: ${matched.stdout}`);
    assert.equal(matched.status, 0, 'samo pominięcie pliku to nie błąd');
    const all = runTool(['--dry-run'], dir);
    assert.equal((all.stdout.match(/POMINIĘTY/g) ?? []).length, 2, `bez --only: oba pliki: ${all.stdout}`);
    assert.equal(readFileSync(path.join(dir, 'scryfall-alpha-karta.json'), 'utf8'), JSON.stringify({ name: 'Alpha' }),
      '--dry-run nie dotknął pliku');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('M328/C: normalizacja rulingów — sort po dacie, przycinanie, odrzucanie pustek', () => {
  const got = normalizeRulings([
    { published_at: '2024-02-02', source: 'wotc', comment: '  Późniejszy. \n' },
    { published_at: '2019-07-12', source: 'wotc', comment: 'Wcześniejszy.' },
    { published_at: '2020-01-01', source: 'wotc', comment: '   ' },
    { comment: 'Bez daty.' },
  ]);
  assert.deepEqual(got.map((r) => r.date), ['2019-07-12', '2024-02-02', null],
    `sort rosnący po dacie, brak daty na końcu: ${JSON.stringify(got.map((r) => r.date))}`);
  assert.deepEqual(got.map((r) => r.comment), ['Wcześniejszy.', 'Późniejszy.', 'Bez daty.'],
    'komentarze przycięte, pusty wycięty (nie zapisujemy „białego\" wpisu)');
  assert.equal(got[2].source, 'wotc', 'brak źródła → wotc (jedyne, które czytają audyty)');
  assert.equal(got[2].date, null, 'brak `published_at` → null, nie „undefined\"');
});

test('M328/D: applyRulings nie mutuje wejścia i stempluje datę oraz URL', () => {
  const snapshot = Object.freeze({ name: 'X', rulings: [{ comment: 'stare' }] });
  const out = applyRulings(snapshot, [{ date: '2024-02-02', source: 'wotc', comment: 'Nowe.' }],
    'https://api.scryfall.com/cards/mkc/18/rulings', '2026-09-06');
  assert.deepEqual(out.rulings, [{ date: '2024-02-02', source: 'wotc', comment: 'Nowe.' }]);
  assert.equal(out.rulingsPobrano, '2026-09-06');
  assert.equal(out.rulingsSource, 'https://api.scryfall.com/cards/mkc/18/rulings');
  assert.equal(snapshot.rulings.length, 1, 'wejście nietknięte');
});
