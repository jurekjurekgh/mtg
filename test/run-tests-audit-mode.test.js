// Tryb `audit` runnera ma jawnie wylistować pełny zestaw regresji PR #177
// i nie wstrzykiwać flag kwarantanny. Strażnik blokuje powrót wymuszonych RED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(root, 'tools', 'run-tests.mjs');

test('run-tests: audit --list uruchamia pełny zestaw regresji bez kwarantanny', () => {
  const r = spawnSync(process.execPath, [runner, 'audit', '--list'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.mode, 'audit');
  assert.ok(plan.files.length >= 100);
  assert.deepEqual(plan.env, {});
  for (const file of plan.files) {
    assert.match(file, /^audyt-pr177-.*\.test\.js$/);
    assert.ok(fs.existsSync(path.join(root, 'test', file)), file);
    const content = fs.readFileSync(path.join(root, 'test', file), 'utf8');
    assert.ok(!/process\.env\.AUDIT_A\d+_ENFORCE/.test(content), `kwarantanna w ${file}`);
    assert.ok(!/skip:\s*process\.env\.AUDIT_A\d+_ENFORCE/.test(content), `wrapper skip w ${file}`);
  }
  for (const closed of ['a94-optional-apnap', 'a98-spellbomb-apnap', 'a100-ward-triggers', 'a101-reflexive-apnap',
    'a102-draw-apnap', 'a103-second-draw-apnap', 'a104-flooding-apnap', 'a105-nanoform-apnap',
    'a106-ward-target-apnap', 'a107-two-ward-apnap']) {
    assert.ok(plan.files.includes(`audyt-pr177-${closed}.test.js`), closed);
  }
});

test('run-tests: nieznany tryb kończy się błędem użycia', () => {
  const r = spawnSync(process.execPath, [runner, 'nieistniejacy'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Użycie/);
});
