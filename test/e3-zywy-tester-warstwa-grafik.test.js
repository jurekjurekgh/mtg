// E3 (pętla jakości 2026-09-17, ADR 0021 §4b) — znalezisko audytu Żywym
// Testerem na nowych warstwach #124: przegląd partii zatrzymywał się po
// pierwszych kilku krokach na `[STOP] brak akcji` z panelem „Poddaj partię",
// a sesja była w stanie `prio=boot`, `botPausePending=false` i OTWARTĄ warstwą
// wysoko-graficzną `#art-showcase.art-showcase active` (hi-gfx domyślnie ON).
//
// Root cause (NARZĘDZIE, nie stół — zmierzone identycznie na #123 i #124):
// warstwa grafik pauzuje grę (`awaitingArtAck` → `advance()` wraca), a wznowić
// ją może wyłącznie gest gracza (main.js: installTapGesture → closeArtShowcase
// → session.continueArtPlay; Escape jako droga alternatywna). Tester obsługiwał
// modale i pauzę bota, ale nie tę warstwę — więc każdy rzut z ilustracją kończył
// partię fałszywym zacięciem i fałszywym zgłoszeniem detektora „sam Poddaj".
// Po naprawie: 3 partie po 400 kroków kończą się naturalnie, 0 zgłoszeń.
//
// Test pilnuje DWÓCH rzeczy (klasa L83 — komentarz nie może nasycić strażnika):
//  1. ZACHOWANIE: wyjęta z `run-game.mjs` funkcja `closeArtShowcase`
//     (vm + stuby DOM) zamyka warstwę, gdy jest otwarta (gest + fallback
//     Escape na bramkę „odprysku" 350 ms), i jest no-opem, gdy warstwa jest
//     zamknięta lub jej nie ma;
//  2. MIEJSCE UŻYCIA: `step()` faktycznie woła domknięcie warstwy — skan po
//     `stripComments`, żeby zakomentowanie wywołania nie zostawiało zielonego
//     strażnika (dokładnie tak strażnik L16 stracił czujność w PR #86).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const SOURCE = readFileSync('tools/table-tester/run-game.mjs', 'utf8');

/** Usuwa komentarze (liniowe i blokowe), zachowując kod — bramka L83. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Wycina ciało funkcji strzałkowej `const <name> = async (…) => { … };`
 * z zachowaniem balansu nawiasów. Skaner pomija literały znakowe (kolejność
 * `http://` w tekście albo `}` w stringu nie może rozciąć ciała funkcji).
 */
function extractArrowFunction(text, name) {
  const header = `const ${name} = async (`;
  const start = text.indexOf(header);
  assert.notEqual(start, -1, `${name} w run-game.mjs`);
  let i = text.indexOf('{', start);
  assert.notEqual(i, -1, `${name}: brak ciała`);
  let depth = 0;
  let quote = null;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i === -1) break; continue; }
    if (ch === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i) + 1; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`${name}: niedomknięte ciało`);
}

/** Warstwa grafik jako minimalny obiekt DOM-owy testera. */
function fakeLayer({ active }) {
  const el = {
    className: active ? 'art-showcase active' : 'art-showcase',
    clicks: 0,
    click() { el.clicks += 1; },
  };
  return el;
}

function runCloser({ layer, caster = 'Rzuca: Nieprzyjaciel', clickCloses = true }) {
  const calls = { escape: 0, log: [] };
  const doc = {
    dispatchEvent(event) {
      if (event?.key === 'Escape') calls.escape += 1;
      // Escape zamyka warstwę ZAWSZE (bez bramki odprysku — taka jest
      // ścieżka klawiatury w main.js), także gdy gest przed chwilą przepadł.
      if (event?.key === 'Escape' && layer) layer.className = 'art-showcase';
    },
  };
  const ctx = createContext({
    $: (sel) => (sel === '#art-showcase' ? layer : (sel === '#art-showcase .showcase-caster' ? { textContent: caster } : null)),
    visible: (el) => Boolean(el && String(el.className).includes('active')),
    text: (el) => (el?.textContent ?? ''),
    logL: (line) => calls.log.push(line),
    sleep: async () => {},
    domWindow: {
      document: doc,
      KeyboardEvent: class KeyboardEvent { constructor(type, init) { this.type = type; this.key = init?.key; } },
    },
  });
  const fn = runInContext(`${extractArrowFunction(SOURCE, 'closeArtShowcase')}\ncloseArtShowcase;`, ctx);
  // Klik na ożywionej warstwie zamyka ją tak, jak main.js (installTapGesture).
  if (layer) {
    const original = layer.click;
    layer.click = function click() { original.call(this); if (clickCloses) this.className = 'art-showcase'; };
  }
  return fn().then((result) => ({ result, calls, layer }));
}

test('E3/warstwa grafik: zamknięta warstwa = no-op (bez kliknięcia i bez Escape)', async () => {
  const layer = fakeLayer({ active: false });
  const { result, calls } = await runCloser({ layer });
  assert.equal(result, false, 'nie ma czego zamykać');
  assert.equal(layer.clicks, 0);
  assert.equal(calls.escape, 0);
  assert.deepEqual(calls.log, [], 'brak wpisu w transkrypcie dla zamkniętej warstwy');
});

test('E3/warstwa grafik: brak elementu w DOM = no-op (starszy artefakt bez warstwy)', async () => {
  const { result, calls } = await runCloser({ layer: null });
  assert.equal(result, false);
  assert.equal(calls.escape, 0);
});

test('E3/warstwa grafik: otwarta warstwa zamyka się gestem gracza i loguje linię', async () => {
  const layer = fakeLayer({ active: true });
  const { result, calls } = await runCloser({ layer, caster: 'Rzuca: Nieprzyjaciel' });
  assert.equal(result, true, 'tester obsłużył warstwę (krok zaliczony)');
  assert.equal(layer.clicks, 1, 'jeden gest, jak gracz');
  assert.equal(calls.escape, 0, 'gest wystarczył — Escape nie był potrzebny');
  assert.equal(layer.className, 'art-showcase');
  assert.ok(calls.log.some((line) => line.includes('[warstwa grafik]') && line.includes('Rzuca: Nieprzyjaciel')),
    `transkrypt nazywa zamkniętą warstwę: ${JSON.stringify(calls.log)}`);
});

test('E3/warstwa grafik: gest zignorowany (bramka „odprysku" 350 ms) → fallback Escape', async () => {
  const layer = fakeLayer({ active: true });
  const { result, calls } = await runCloser({ layer, clickCloses: false });
  assert.equal(result, true);
  assert.equal(layer.clicks, 1, 'gest wysłany');
  assert.equal(calls.escape, 1, 'Escape domyka warstwę mimo bramki odprysku (ścieżka klawiatury z main.js)');
  assert.equal(layer.className, 'art-showcase');
});

test('E3/miejsce użycia: step() woła domknięcie warstwy grafik (skan bez komentarzy)', () => {
  const step = stripComments(extractArrowFunction(SOURCE, 'step'));
  assert.match(step, /closeArtShowcase\(\)/,
    'step() musi domykać warstwę grafik PRZED wyborem akcji — inaczej partia staje na pauzie prezentacyjnej bez wyjścia');
  // Kolejność: domknięcie warstwy na POCZĄTKU kroku, przed odczytem panelu.
  const closeAt = step.indexOf('closeArtShowcase()');
  const actionsAt = step.indexOf("#actions button.action");
  assert.ok(closeAt !== -1 && (actionsAt === -1 || closeAt < actionsAt),
    'domknięcie warstwy musi poprzedzać odczyt panelu akcji');
});

test('E3/strażnik nie jest vacuous: ekstraktor widzi realne ciało funkcji', () => {
  const closer = extractArrowFunction(SOURCE, 'closeArtShowcase');
  assert.ok(closer.startsWith('const closeArtShowcase = async ('), 'ekstraktor trafił w funkcję');
  assert.ok(closer.includes('#art-showcase'), 'ciało czyta identyfikator warstwy z artefaktu');
  assert.ok(closer.trimEnd().endsWith('}'), 'ciało domknięte');
});
