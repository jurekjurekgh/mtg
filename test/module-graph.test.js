import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertNoNameCollisions, collectModules } from '../tools/module-graph.mjs';

/**
 * Strażnik wymagań artefaktu jednoplikowego (ADR 0011): żaden kluczowy
 * podgraf źródeł nie może zawierać cyklu importów, a unia wszystkich modułów
 * src/ nie może mieć kolizji nazw — bo po sklejeniu dzielą jeden zasięg.
 */

const ENTRIES = [
  'src/table/main.js',
  'src/engine/game-state.js',
  'src/engine/simulation.js',
  'src/engine/replay.js',
  'src/cards/card-data.js',
  'src/cards/materialize.js',
];

test('kluczowe podgrafy źródeł nie zawierają cykli importów', () => {
  for (const entry of ENTRIES) {
    assert.doesNotThrow(() => collectModules(entry), `cykl w podgrafie ${entry}`);
  }
});

test('unia modułów src/ nie ma kolizji nazw najwyższego poziomu', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  };
  walk('src');
  const modules = files.map((abs) => ({ abs: path.resolve(abs), source: fs.readFileSync(abs, 'utf8') }));
  assert.doesNotThrow(() => assertNoNameCollisions(modules));
});
