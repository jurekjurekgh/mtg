import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Smoke test poziomu wykonania: zbudowany artefakt nie tylko nie zawiera
 * import/export, ale faktycznie wykonuje się w jednym wspólnym zasięgu —
 * self-test stołu (RNG, tasowanie, silnik) wykonuje wewnętrzne kontrole.
 */

const OUT = path.join(os.tmpdir(), `mtg-bundle-smoke-${process.pid}.html`);

function runBundle(code) {
  const elements = new Map();
  const makeEl = (id) => ({
    id, textContent: '', value: id === 'seed' ? '42' : '',
    style: {}, className: '',
    appendChild(child) { (this.children ??= []).push(child); },
    addEventListener() {},
  });
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeEl(id));
      return elements.get(id);
    },
    createElement: () => makeEl('created'),
  };
  try {
    new Function(code)();
  } finally {
    delete globalThis.document;
  }
  return elements.get('selftest').children ?? [];
}

test('zbudowany artefakt wykonuje self-test silnika w jednym zasięgu', () => {
  execFileSync('node', ['tools/build.mjs', '--out', OUT], { encoding: 'utf8' });
  const html = fs.readFileSync(OUT, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'brak sekcji script w artefakcie');
  const lines = runBundle(match[1]).map((child) => child.textContent);
  const failures = lines.filter((line) => line.startsWith('✗'));
  assert.deepEqual(failures, [], `self-test artefaktu ma błędy: ${failures.join('; ')}`);
  assert.ok(lines.some((line) => line.includes('Headless engine')));
  fs.rmSync(OUT, { force: true });
});
