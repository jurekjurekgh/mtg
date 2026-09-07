import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tool = fileURLToPath(new URL('../tools/fetch-card-rulings.mjs', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));
const url = 'https://api.scryfall.com/cards/tst/1/rulings';
const ruling = { date: '2024-02-02', source: 'wotc', comment: 'Zachowaj ten ruling.' };
const base = { name: 'Probe', set: 'tst', collector_number: '1', rulings: [ruling] };
const ok = (data) => ({ status: 200, body: { data } });
const wireRuling = { published_at: '2024-02-02', source: 'wotc', comment: 'Nowy ruling.' };

function run(responses, snapshot = base, args = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mtg-rulings-api-'));
  try {
    const file = path.join(dir, 'scryfall-probe.json');
    const before = JSON.stringify(snapshot, null, 2) + '\n';
    writeFileSync(file, before);
    const callsFile = path.join(dir, 'calls.json');
    const mock = path.join(dir, 'mock.mjs');
    // Podmieniamy wyłącznie granicę sieci i zegar retry. Prawdziwe CLI/FS/
    // normalizacja/zapis pozostają w produkcyjnym narzędziu; zero żądań HTTP.
    writeFileSync(mock, `
      import {writeFileSync} from 'node:fs';
      const responses = ${JSON.stringify(responses)};
      let calls = 0;
      globalThis.fetch = async () => {
        const response = responses[Math.min(calls++, responses.length - 1)];
        writeFileSync(${JSON.stringify(callsFile)}, JSON.stringify(calls));
        return {status: response.status, ok: response.status >= 200 && response.status < 300,
          headers: {get: () => '0'}, json: async () => response.body};
      };
      globalThis.setTimeout = (callback) => { queueMicrotask(callback); return 0; };
    `);
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, tool, '--only=probe', ...args], {
      cwd: root, env: { ...process.env, MTG_CARDS_DIR: dir }, encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    const after = readFileSync(file, 'utf8');
    return { ...result, before, after, snapshot: JSON.parse(after), calls: JSON.parse(readFileSync(callsFile, 'utf8')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('M345/A: trzy HTTP 429 są błędem — snapshot nie traci starych rulingów ani formatu', () => {
  const r = run([{ status: 429 }]);
  assert.equal(r.calls, 3);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /429/);
  assert.equal(r.after, r.before);
  assert.doesNotMatch(r.stdout, /zapisane/);
});

test('M345/B: po przejściowym 429 prawdziwe 200 może zaktualizować snapshot', () => {
  const r = run([{ status: 429 }, ok([wireRuling])]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls, 2);
  assert.deepEqual(r.snapshot.rulings, [{ ...ruling, comment: 'Nowy ruling.' }]);
  assert.equal(r.snapshot.rulingsSource, url);
  assert.match(r.snapshot.rulingsPobrano, /^\d{4}-\d{2}-\d{2}$/);
});

test('M345/C: 200 bez tablicy data nie jest dowodem pustej listy rulingów', () => {
  const r = run([{ status: 200, body: { error: 'nieprawidłowa odpowiedź' } }]);
  assert.equal(r.status, 1);
  assert.equal(r.calls, 3);
  assert.match(r.stderr, /BŁĄD.*tablicy data/);
  assert.doesNotMatch(r.stderr, /TypeError/);
  assert.equal(r.after, r.before);
});

test('M345/D: HTTP 500 nadal nie nadpisuje danych (kontrola dotychczasowej obsługi błędów)', () => {
  const r = run([{ status: 500 }]);
  assert.equal(r.calls, 3);
  assert.equal(r.status, 1);
  assert.equal(r.after, r.before);
});

test('M345/E: potwierdzona pusta lista zastępuje stare rulingi, z prawidłową proweniencją', () => {
  const r = run([ok([])]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.snapshot.rulings, []);
  assert.equal(r.snapshot.rulingsSource, url);
  assert.ok(r.snapshot.rulingsPobrano);
});

test('M345/F: pierwsze pobranie pustej listy odróżnia się od „nigdy nie pobrano”', () => {
  const { rulings, ...unfetched } = base;
  const r = run([ok([])], unfetched);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.snapshot.rulings, []);
  assert.equal(r.snapshot.rulingsSource, url);
  assert.ok(r.snapshot.rulingsPobrano);
});

test('M345/G: --dry-run nie zapisuje nawet udanej odpowiedzi sieciowej', () => {
  const r = run([ok([wireRuling])], base, ['--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\]/);
  assert.equal(r.after, r.before);
});

test('M345/H: niezmienione, wcześniej pobrane rulingi nie reformatują pliku', () => {
  const snapshot = { ...base, rulingsSource: url, rulingsPobrano: '2026-09-06' };
  const r = run([ok([{ ...wireRuling, comment: ruling.comment }])], snapshot);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /bez zmian/);
  assert.equal(r.after, r.before);
});
