// M189 — uwagi właściciela (2026-08-22): sprzątanie UX artefaktu.
// L: sekcja „Test działania" niepotrzebna — zostaje sama data i GODZINA
//    publikacji artefaktu (godziny dotąd nie było).
// M: sekcja „Ustawienia i pomoc" usunięta w całości.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SHELL = fs.readFileSync('src/table/index.html', 'utf8');
/** Szablon bez komentarzy (HTML i CSS) — komentarz nie jest tekstem w UI. */
const SHELL_VISIBLE = SHELL.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
/** Artefakt bez komentarzy i bez wstrzykniętego <script> (kod ≠ interfejs). */
function visibleOf(html) {
  return html
    .replace(/<script>[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function buildArtifact() {
  const out = path.join(os.tmpdir(), `m189-${process.pid}.html`);
  execFileSync('node', ['tools/build.mjs', '--out', out], { encoding: 'utf8' });
  const html = fs.readFileSync(out, 'utf8');
  fs.rmSync(out, { force: true });
  return html;
}

// ---- L: data + godzina publikacji zamiast sekcji „Test działania" --------

test('M189/L: artefakt niesie datę ORAZ godzinę publikacji', () => {
  const html = buildArtifact();
  assert.ok(!html.includes('<!--BUILT-->'), 'znacznik podmieniony przy budowie');
  // Format „YYYY-MM-DD HH:MM" — sama data (bez godziny) nie wystarcza.
  const match = html.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/);
  assert.ok(match, 'artefakt pokazuje datę z godziną publikacji');
});

test('M189/L2: sekcja „Test działania" zniknęła z interfejsu', () => {
  assert.ok(!SHELL_VISIBLE.includes('Test działania'), 'nagłówek sekcji usunięty z szablonu');
  assert.ok(!SHELL_VISIBLE.includes('Jeśli poniżej widzisz zielony komunikat'),
    'opis self-testu usunięty');
  assert.ok(!visibleOf(buildArtifact()).includes('Test działania'),
    'i nie ma go w zbudowanym artefakcie');
});

test('M189/L3: self-test nadal DZIAŁA jako bramka jakości (tylko bez UI)', () => {
  // Świadoma decyzja: `bundle-smoke` i `table-ui` używają self-testu jako
  // dowodu, że sklejony artefakt naprawdę wykonuje silnik w przeglądarce.
  // Usuwamy sekcję Z INTERFEJSU, ale nie samą kontrolę — element zostaje
  // ukryty, więc bramka CI działa dalej.
  assert.match(SHELL, /id="selftest"[^>]*hidden/,
    'kontener self-testu istnieje, ale jest ukryty przed graczem');
  const main = fs.readFileSync('src/table/main.js', 'utf8');
  assert.match(main, /runSelfTest\(\)/, 'self-test nadal uruchamiany');
});

// ---- M: „Ustawienia i pomoc" usunięte ------------------------------------

test('M189/M: sekcja „Ustawienia i pomoc" usunięta z interfejsu', () => {
  assert.ok(!SHELL_VISIBLE.includes('Ustawienia i pomoc'), 'panel usunięty z szablonu');
  assert.ok(!SHELL_VISIBLE.includes('Jak uruchomić Wirtualny Stół'), 'instrukcja usunięta');
  assert.ok(!SHELL.includes('id="image-mode"'), 'przełącznik źródła ilustracji usunięty');
  assert.ok(!visibleOf(buildArtifact()).includes('Ustawienia i pomoc'),
    'i nie ma go w artefakcie');
});

test('M189/M2: ilustracje nadal działają — tryb z AUTODETEKCJI protokołu', () => {
  // Przełącznik znika, ale zachowanie domyślne (URL → Scryfall, plik →
  // lokalne) zostaje; bez tego karty straciłyby obrazki po usunięciu panelu.
  const main = fs.readFileSync('src/table/main.js', 'utf8');
  assert.match(main, /detectImageMode\(/, 'tryb obrazów wciąż wyliczany z protokołu');
  assert.ok(!main.includes("el('image-mode')"), 'martwa obsługa selecta usunięta');
});
