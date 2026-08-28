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

/** Pola pokryte przez fingerprint: lista + projekcje ręczne (state.<pole>). */
function fingerprintCoveredFieldsFromSource() {
  const fp = readFileSync(join(ROOT, 'src/engine/fingerprint.js'), 'utf8');
  return new Set([...fp.matchAll(/pending[A-Z][A-Za-z]*/g)].map((m) => m[0]));
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
