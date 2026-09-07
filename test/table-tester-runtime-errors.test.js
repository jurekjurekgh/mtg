import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { observeRuntimeErrors } from '../tools/table-tester/runtime-errors.mjs';
import { runDetectors } from '../tools/table-tester/detectors.mjs';

function fakeWindow() {
  const listeners = new Map();
  return {
    document: {}, crypto: { getRandomValues() {} }, requestAnimationFrame() {}, cancelAnimationFrame() {},
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    emit(type, event) { for (const fn of listeners.get(type) ?? []) fn(event); },
  };
}

test('M348/runtime A: wyjątek trafia do rekordów bez wyciszania domyślnej obsługi', () => {
  const window = fakeWindow(), records = [];
  observeRuntimeErrors(window, records);
  window.emit('error', { error: new TypeError('log is not a function'), filename: 'artifact', lineno: 12,
    preventDefault: () => assert.fail('nie maskujemy raportowania przeglądarki'),
  });
  assert.deepEqual(records, [{ type: 'error', message: 'log is not a function', source: 'artifact', line: 12 }]);
});

test('M348/runtime B: nieobsłużone odrzucenia Promise — Error i zwykły tekst', () => {
  const window = fakeWindow(), records = [];
  observeRuntimeErrors(window, records);
  window.emit('unhandledrejection', { reason: new Error('awaria') });
  window.emit('unhandledrejection', { reason: 'druga awaria' });
  assert.deepEqual(records, [
    { type: 'unhandledrejection', message: 'awaria' },
    { type: 'unhandledrejection', message: 'druga awaria' },
  ]);
});

test('M348/runtime C: prawdziwe boot podpina obserwatora PRZED wykonaniem skryptów artefaktu', async () => {
  const source = readFileSync(new URL('../tools/table-tester/run-game.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function boot() {');
  const end = source.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start);
  const loadJsdom = "  const { JSDOM } = await import('jsdom');";
  let boot = source.slice(start, end + 2);
  assert.equal(boot.split(loadJsdom).length - 1, 1);
  // Wstrzyknięty wyłącznie konstruktor biblioteki; kolejność boot jest z kodu.
  // Test działa także w CI bez zainstalowanego jsdom w podkatalogu narzędzia.
  boot = boot.replace(loadJsdom, '');
  class JSDOM {
    constructor(html, options) {
      assert.equal(html, '<script>throw new Error()</script>');
      this.window = fakeWindow();
      options.beforeParse?.(this.window);
      this.window.emit('error', { message: 'awaria przy starcie' });
    }
  }
  const ctx = createContext({ JSDOM, observeRuntimeErrors, ARTIFACT: 'artifact', fs: {
    existsSync: () => true, readFileSync: () => '<script>throw new Error()</script>',
  } });
  const result = await runInContext(`${boot}\nboot();`, ctx);
  assert.equal(result.runtimeErrors.length, 1, 'listener dodany dopiero po konstruktorze zgubiłby ten wyjątek');
  assert.equal(result.runtimeErrors[0].message, 'awaria przy starcie');
});

const runtimeFlags = (lines, options) => runDetectors(lines, options).filter((f) => f.message === 'Wyjątek JavaScript w stole');

test('M348/runtime D: wyjątek nie jest wyciszany dla impatient ani przez quiet', () => {
  const runtimeErrors = [{ type: 'error', message: 'awaria UI' }];
  const expected = runtimeFlags([], { runtimeErrors, profile: 'greedy' });
  assert.equal(expected.length, 1);
  assert.equal(expected[0].category, 'ui');
  assert.match(expected[0].evidence, /awaria UI/);
  assert.deepEqual(runtimeFlags([], { runtimeErrors, profile: 'impatient' }), expected);
  assert.deepEqual(runtimeFlags(['  LOG: zwykły wpis'], { runtimeErrors, profile: 'impatient' }), expected);
});

test('M348/runtime E: oczekiwane odrzucenie komendy nie jest wyjątkiem JavaScript', () => {
  const window = fakeWindow(), runtimeErrors = [];
  observeRuntimeErrors(window, runtimeErrors);
  window.emit('command_rejected', { reason: 'wrong_timing' });
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(runtimeFlags([], { runtimeErrors, profile: 'impatient', rejectionRecords: [{ reason: 'wrong_timing' }] }), []);
});

test('M348/runtime F: sterownik przekazuje zebrane wyjątki do detektorów, nie gubi ich przy wywołaniu', () => {
  const source = readFileSync(new URL('../tools/table-tester/run-game.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const findings = runDetectors(lines,');
  const end = source.indexOf(';', start);
  assert.ok(start >= 0 && end > start);
  const ctx = createContext({
    runDetectors, lines: [], actionRecords: [], windowRecords: [], profile: 'impatient', probeRecords: [], rejectionRecords: [],
    harmfulNames: new Set(), allCardNames: new Set(), myPermanentNames: new Set(), enemyPermanentNames: new Set(),
    runtimeErrors: [{ type: 'error', message: 'wyjątek z prawdziwego parametru sterownika' }],
  });
  const findings = runInContext(`${source.slice(start, end + 1)}\nfindings;`, ctx);
  assert.equal(findings.filter((f) => f.message === 'Wyjątek JavaScript w stole').length, 1);
});
