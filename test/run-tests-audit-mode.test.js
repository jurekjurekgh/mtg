// Tryb `audit` runnera ma jawnie wylistować wszystkie pliki kwarantanny i flagi,
// żeby otwarte RED nie zależały od ręcznie odtwarzanej komendy env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(root, 'tools', 'run-tests.mjs');

test('run-tests: audit --list wykrywa pliki i flagi kwarantanny', () => {
  const r = spawnSync(process.execPath, [runner, 'audit', '--list'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.mode, 'audit');
  assert.ok(!plan.files.includes('audyt-pr177-a84-ward-apnap.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a101-reflexive-apnap.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a98-spellbomb-apnap.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a102-draw-apnap.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a103-second-draw-apnap.test.js'));
  // A111, A110, A112, A113, A108, A109, A100, A84, A101, A98, A102 i A103 zostały zamknięte w PR #179 i nie są już plikami kwarantanny.
  assert.ok(!plan.files.includes('audyt-pr177-a111-imp-self-lki.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a110-auto-mana-events.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a112-imp-selhoff-apnap.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a113-mixed-combat-apnap.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a108-ward-sba.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a109-ward-aura-sba.test.js'));
  assert.ok(!plan.files.includes('audyt-pr177-a100-ward-triggers.test.js'));
  assert.ok(plan.files.length >= 4);
  for (const file of plan.files) {
    assert.ok(fs.existsSync(path.join(root, 'test', file)), file);
  }
  const flags = Object.keys(plan.env);
  assert.ok(!flags.includes('AUDIT_A84_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A101_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A98_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A102_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A103_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A111_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A110_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A112_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A113_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A108_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A109_ENFORCE'));
  assert.ok(!flags.includes('AUDIT_A100_ENFORCE'));
  assert.equal(flags.length, 4);
  for (const flag of flags) assert.equal(plan.env[flag], '1');
});

test('run-tests: nieznany tryb kończy się błędem użycia', () => {
  const r = spawnSync(process.execPath, [runner, 'nieistniejacy'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Użycie/);
});
