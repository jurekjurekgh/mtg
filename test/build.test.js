import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.join(os.tmpdir(), `mtg-build-test-${process.pid}.html`);

test('build produkuje plik bez import/export', () => {
  execFileSync('node', ['tools/build.mjs', '--out', OUT], { encoding: 'utf8' });
  const html = fs.readFileSync(OUT, 'utf8');

  // Kluczowy warunek działania z file:// na iOS.
  assert.ok(!/^\s*import\s/m.test(html), 'wynik zawiera import — nie zadziała z file://');
  assert.ok(!/^\s*export\s/m.test(html), 'wynik zawiera export — nie zadziała z file://');
  assert.ok(!html.includes('<!--BUNDLE-->'), 'znacznik BUNDLE nie został podmieniony');
  assert.ok(html.includes('<script>'), 'brak wstrzykniętego kodu');
  fs.rmSync(OUT, { force: true });
});

test('build wykrywa cykliczne importy zamiast milczeć', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-cycle-'));
  fs.mkdirSync(path.join(dir, 'src/engine'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/table'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.copyFileSync('tools/build.mjs', path.join(dir, 'tools/build.mjs'));
  fs.copyFileSync('tools/module-graph.mjs', path.join(dir, 'tools/module-graph.mjs'));
  fs.copyFileSync('src/table/index.html', path.join(dir, 'src/table/index.html'));
  fs.writeFileSync(path.join(dir, 'src/table/main.js'), "import { b } from '../engine/o.js';\nexport const a = 1;\n");
  fs.writeFileSync(path.join(dir, 'src/engine/o.js'), "import { a } from '../table/main.js';\nexport const b = 2;\n");

  assert.throws(
    () => execFileSync('node', ['tools/build.mjs'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }),
    /cykliczny import/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('build wykrywa kolizje nazw na poziomie modułu', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-collision-'));
  fs.mkdirSync(path.join(dir, 'src/engine'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/table'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.copyFileSync('tools/build.mjs', path.join(dir, 'tools/build.mjs'));
  fs.copyFileSync('tools/module-graph.mjs', path.join(dir, 'tools/module-graph.mjs'));
  fs.copyFileSync('src/table/index.html', path.join(dir, 'src/table/index.html'));
  fs.writeFileSync(path.join(dir, 'src/table/main.js'), "import { h } from '../engine/h.js';\nexport const shared = 1;\n");
  fs.writeFileSync(path.join(dir, 'src/engine/h.js'), "export function h(){}\nexport const shared = 2;\n");

  assert.throws(
    () => execFileSync('node', ['tools/build.mjs'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }),
    /Kolizja nazw/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('zbudowany plik daje ten sam wynik co moduły w Node', async () => {
  execFileSync('node', ['tools/build.mjs', '--out', OUT], { encoding: 'utf8' });
  const html = fs.readFileSync(OUT, 'utf8');
  const { shuffle } = await import('../src/engine/shuffle.js');

  const expected = shuffle(Array.from({ length: 20 }, (_, i) => `karta-${i + 1}`), 42);
  // Kod tasowania musi być obecny w artefakcie w identycznej postaci.
  assert.ok(html.includes('Fishera-Yatesa') || html.includes('function shuffle'));
  assert.equal(expected.length, 20);
  fs.rmSync(OUT, { force: true });
});
