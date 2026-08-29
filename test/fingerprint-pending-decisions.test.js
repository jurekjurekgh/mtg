// Audyt PR #86 (sesja arena/01a047db, znalezisko N1) — klasa L16 domknięta:
// KAŻDA decyzja blokująca priorytet (konsultowana przez
// firstPendingDecisionPlayerId — ground truth tego, co wstrzymuje grę)
// MUSI być częścią fingerprintu stanu.
//
// Tło: E1 z PR #85 dopisał `pendingEscapeExile` do PENDING_DECISION_FIELDS,
// ale ta sama luka istniała dla PIĘCIU innych decyzji: pendingManifestDread,
// pendingSuspendCast, pendingOpponentTarget, pendingFabricate,
// pendingCopyTargets — ustawienie każdego z nich NIE zmieniało odcisku
// (sonda 5/5), więc sonda „oferta bez skutku" i weryfikacja replayów były
// na nich ślepe (L16/L18).
//
// RED→GREEN: przed dopisaniem pól do fingerprintu testy są czerwone.
// Mutacja strażnika (L13/L61): usuń dowolne pole z PENDING_DECISION_FIELDS
// — guard musi być RED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGameState } from '../src/engine/game-state.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Zbiór pendingów KONSULTOWANYCH przez firstPendingDecisionPlayerId —
 * ta funkcja decyduje, kto ma priorytet po każdej komendzie (inwariant
 * accepted()), więc jej pola to definicja „decyzji blokującej grę".
 */
function blockingPendingFieldsFromSource() {
  const src = readFileSync(join(ROOT, 'src/engine/game-state.js'), 'utf8');
  const body = src.match(/function firstPendingDecisionPlayerId\(state\) \{[\s\S]*?\n\}/);
  assert.ok(body, 'firstPendingDecisionPlayerId znalezione w game-state.js');
  // Funkcja to płaska sekwencja `if (state.pendingX…) return …;` — zapis
  // kontraktowy; jeśli kiedyś zyska zagnieżdżone bloki, doprecyzuj regex.
  return [...new Set([...body[0].matchAll(/state\.(pending[A-Z][A-Za-z]*)/g)].map((m) => m[1]))].sort();
}

/**
 * Usuwa komentarze (`//` i blokowe) z kodu — bez znajomości ciągów
 * znakowych.
 *
 * Znalezisko A1 (audyt PR #86, sesja arena/01a049c7): poprzednia wersja
 * liczyła pokrycie regexem po SUROWYM pliku, więc nazwa pola wspomniana
 * w komentarzu była nieodróżnialna od wpisu w `PENDING_DECISION_FIELDS`
 * i od ręcznej projekcji `state.pendingX` — strażnik milczał dla decyzji,
 * której w odcisku nie było (klasa L31/L56: strażnik pilnuje tekstu,
 * a reguła mieszka w kodzie).
 */
function stripComments(src) {
  let out = '';
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Pola pokryte przez fingerprint: wpisy w `PENDING_DECISION_FIELDS`
 * (czytane z literału tablicy) + ręczne projekcje (`state.<pole>`).
 * argumentem jest ŹRÓDŁO PO USUNIĘCIU KOMENTARZY — patrz `stripComments`.
 */
function coveredFieldsInFingerprintSource(fingerprintSource) {
  const covered = new Set();
  const list = fingerprintSource.match(/PENDING_DECISION_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(list, 'PENDING_DECISION_FIELDS znalezione w fingerprint.js');
  for (const m of list[1].matchAll(/'([^']+)'/g)) covered.add(m[1]);
  for (const m of fingerprintSource.matchAll(/state\.(pending[A-Z][A-Za-z]*)/g)) covered.add(m[1]);
  return covered;
}

/** Kompozycja używana przez strażnika: surowy plik → kod bez komentarzy → pokryte pola. */
function coveredFieldsFromFingerprintFile(rawSource) {
  return coveredFieldsInFingerprintSource(stripComments(rawSource));
}

/** Pola pokryte przez fingerprint (produkcyjna ścieżka strażnika). */
function fingerprintCoveredFieldsFromSource() {
  return coveredFieldsFromFingerprintFile(readFileSync(join(ROOT, 'src/engine/fingerprint.js'), 'utf8'));
}

test('STRAŻNIK klasy L16: każdy pending blokujący grę jest pokryty w fingerprintcie', () => {
  const blocking = blockingPendingFieldsFromSource();
  const covered = fingerprintCoveredFieldsFromSource();
  const missing = blocking.filter((field) => !covered.has(field));
  assert.deepEqual(missing, [],
    `Decyzje blokujące grę spoza fingerprintu (L16): ${missing.join(', ')}. `
    + 'Nowe pole wstrzymujące grę MUSI trafić do PENDING_DECISION_FIELDS '
    + 'w src/engine/fingerprint.js (albo mieć ręczną projekcję w stateFingerprint).');
});

test('A1 (pin strażnika): pokrycie wyłącznie KOMENTARZEM nie zamyka klasy L16', () => {
  // Znalezisko A1 z audytu PR #86: skan surowego źródła `fingerprint.js`
  // zaliczał wystąpienie nazwy w komentarzu jako pokrycie — nowa decyzja
  // blokująca przechodziła strażnik bez wpisu w odcisku. Pin idzie na
  // strażnika, nie na kod: jeśli skan znów zacznie czytać komentarze,
  // ten test musi być czerwony (L13/L67 — detektor ma umieć krzyczeć).
  const synthetic = [
    "const PENDING_DECISION_FIELDS = Object.freeze([",
    "  'pendingAmass',",
    "]);",
    "// pendingZzz opisana wyłącznie w komentarzu (klasa L31/L56):",
    "//   if (state.pendingZzz) return state.pendingZzz.playerId;",
    "export function stateFingerprint(state) { return { pendingDecisions: {} }; }",
  ].join('\n');
  const covered = coveredFieldsFromFingerprintFile(synthetic);
  assert.ok(covered.has('pendingAmass'), 'wpis w PENDING_DECISION_FIELDS jest pokryciem');
  assert.ok(!covered.has('pendingZzz'), 'KOMENTARZ nie jest pokryciem fingerprintu');
  // Dowód, że pin mierzy coś realnego: skan SUROWY (sprzed naprawy A1)
  // widział `pendingZzz` i przepuszczał taką decyzję.
  const rawSees = [...synthetic.matchAll(/pending[A-Z][A-Za-z]*/g)].some((m) => m[0] === 'pendingZzz');
  assert.ok(rawSees, 'skan bez usuwania komentarzy widziałby lukę (regresja A1)');
  // I druga noga: SAMEJ kompozycji nie wolno obejść — gdyby ścieżka
  // produkcyjna czytała plik bez `stripComments`, pin wyżej pozostałby
  // zielony, a realna luka wróciła (L67: strażnik bez pokrycia własnej
  // ścieżki jest wart tyle, co jego brak).
  const guardSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const prodBody = guardSrc.match(/function fingerprintCoveredFieldsFromSource\(\) \{[\s\S]*?\n\}/);
  assert.ok(prodBody, 'ciało fingerprintCoveredFieldsFromSource znalezione w tym pliku');
  assert.match(prodBody[0], /stripComments|coveredFieldsFromFingerprintFile/,
    'ścieżka produkcyjna strażnika skanuje KOD (bez komentarzy), nie surowy plik — regresja A1');
});

test('fingerprint projektuje 5 pendingów z audytu PR #86 (N1)', () => {
  const cases = {
    pendingManifestDread: { playerId: 'p1', objectIds: ['lib0', 'lib1'], restorePriorityTo: 'p1' },
    pendingSuspendCast: { playerId: 'p1', objectId: 'susp-1', restorePriorityTo: 'p2' },
    pendingOpponentTarget: { playerId: 'p2', activatingPlayerId: 'p1', sourceId: 'src-1', spec: { type: 'any_target' } },
    pendingFabricate: { playerId: 'p1', sourceId: 'src-2', amount: 1, hostOnBattlefield: true },
    pendingCopyTargets: { playerId: 'p1', queue: [{ copyId: 'c1', targetIndex: 0 }], specs: [{ type: 'creature' }] },
  };
  for (const [field, value] of Object.entries(cases)) {
    const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
    const before = stateFingerprint(state);
    state[field] = value;
    const after = JSON.parse(stateFingerprint(state));
    assert.notEqual(JSON.stringify(after), before, `${field}: odcisk MUSI drgnąć po otwarciu decyzji`);
    assert.ok(after.pendingDecisions?.[field], `${field}: jawny wpis w pendingDecisions`);
  }
});
