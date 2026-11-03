#!/usr/bin/env node
/**
 * Runner testów wg ADR 0019 (tiers): `npm test` = szybki rdzeń deweloperski,
 * `npm run test:slow` = ciężkie pliki, `npm run test:all` = pełny pakiet (brama PR).
 *
 * Dlaczego istnieje: pełny pakiet rósł liniowo z każdym batchem kart i liczył
 * się kilkanaście minut. Node 22 na maszynach z 2 vCPU uruchamia pliki testów
 * SEKWENCYJNIE (domyślna konkurencja = availableParallelism - 1), więc
 * najcięższe pliki sumowały się jeden po drugim. Runner dzieli pliki na
 * tier szybki (domyślny) i wolny (manifest) oraz podnosi konkurencję plików.
 *
 * Użycie:
 *   node tools/run-tests.mjs fast   # szybki rdzeń (npm test)
 *   node tools/run-tests.mjs slow   # wyłącznie pliki z manifestu
 *   node tools/run-tests.mjs all    # pełny pakiet (brama PR)
 *   node tools/run-tests.mjs audit  # wymuszone RED otwartych przypadków audytu
 *   node tools/run-tests.mjs audit --list  # tylko pliki i flagi, bez uruchamiania
 *
 * Manifest wolnych plików: tools/test-manifest.json. Zasada dopisywania:
 * plik trafia tam, gdy jego samodzielny czas (node --test <plik>) przekracza
 * ~5 s — wtedy zysk z równoległości/odseparowania przewyższa koszt.
 *
 * Tryb `audit` NIE jest bramką na zielono: uruchamia pliki, które zawierają
 * flagi `AUDIT_A*_ENFORCE`, z wszystkimi tymi flagami ustawionymi na `1`.
 * Dzięki temu otwarte, celowo pomijane przypadków nie znikają z pola widzenia
 * i nie trzeba ręcznie odtwarzać długiej listy env. Dopóki istnieją otwarte
 * błędy, komenda kończy się niezerowo — to oczekiwany reproduktor, nie regresja
 * szybkiego pakietu. `--list` pozwala sprawdzić zakres bez uruchamiania testów.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'tools', 'test-manifest.json');

const mode = process.argv[2] ?? 'fast';
const listOnly = process.argv.includes('--list');
if (!['fast', 'slow', 'all', 'audit'].includes(mode)) {
  console.error(`Użycie: node tools/run-tests.mjs [fast|slow|all|audit] [--list] (dostałem: ${mode ?? '—'})`);
  process.exit(2);
}

const allFiles = fs.readdirSync(path.join(root, 'test'))
  .filter((name) => name.endsWith('.test.js'))
  .sort();
const slowSet = new Set(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).slow);

// Wykrywamy flagi w treści plików, żeby nowa kwarantanna nie wymagała ręcznej
// aktualizacji długiej komendy env. Zbieramy wszystkie flagi i uruchamiamy
// wyłącznie pliki, które ich używają (także kontrole GREEN w tych plikach).
const auditEnv = {};
const auditFiles = [];
if (mode === 'audit') {
  for (const name of allFiles) {
    const content = fs.readFileSync(path.join(root, 'test', name), 'utf8');
    const flags = [...content.matchAll(/process\.env\.(AUDIT_A\d+_ENFORCE)\s*===\s*'1'/g)]
      .map((m) => m[1]);
    if (flags.length === 0) continue;
    auditFiles.push(name);
    for (const flag of flags) auditEnv[flag] = '1';
  }
}

const files = mode === 'slow'
  ? allFiles.filter((name) => slowSet.has(name))
  : mode === 'fast'
    ? allFiles.filter((name) => !slowSet.has(name))
    : mode === 'audit'
      ? auditFiles
      : allFiles;

if (files.length === 0) {
  console.error('Brak plików testowych dla trybu', mode);
  process.exit(1);
}

if (listOnly) {
  console.log(JSON.stringify({ mode, files, env: auditEnv }, null, 2));
  process.exit(0);
}

// Konkurencja plików: więcej niż rdzeni, bo większość plików jest
// lekkich — ciężkie i tak liczą się same (zysk ze zrównoleglenia).
const concurrency = Math.max(4, Number(process.env.TEST_CONCURRENCY ?? 0) || 4);
const args = ['--test', `--test-concurrency=${concurrency}`, ...files.map((f) => path.join('test', f))];
console.error(`[run-tests] tryb=${mode} pliki=${files.length} konkurencja=${concurrency}${mode === 'audit' ? ` flagi=${Object.keys(auditEnv).length} (oczekiwane RED otwartych przypadków)` : ''}`);
const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  env: mode === 'audit' ? { ...process.env, ...auditEnv } : process.env,
});
process.exit(result.status ?? 1);
