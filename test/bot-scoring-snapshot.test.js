import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_CONFIG,
  computeScoringSnapshot,
  readFixture,
} from '../tools/bot-scoring-snapshot.mjs';

/**
 * B6 T0 — golden-master wycen bota (sieć bezpieczeństwa refaktoru B6).
 *
 * Rola: udowodnić, że wyciąganie „magicznych liczb" z `scoreCommand` do
 * parametrów deskryptorowych (heuristic-params.js) NIE ZMIENIA zachowania bota
 * przy parametrach domyślnych. Ten test ma być ZIELONY przez cały refaktor —
 * gdy czerwienieje, znaczy że któraś ekstrakcja zmieniła wycenę (regresja
 * refaktoru), a agregaty (`scoreSum`, `chosenKinds`) wskazują którą partię.
 *
 * Uwaga: to golden-master REFAKTORU, nie miernik jakości. Jakość mierzy
 * benchmark (test/bot-benchmark.test.js). Gdy tuner B6 ŚWIADOMIE zmienia
 * parametry domyślne, fixture regeneruje się razem z przyjęciem nowych wag:
 *   node tools/bot-scoring-snapshot.mjs --write
 */

test('golden-master: ślad bota == zamrożony fixture (bit w bit)', () => {
  const fixture = readFixture();
  const snapshot = computeScoringSnapshot();
  assert.equal(
    snapshot.overallHash,
    fixture.overallHash,
    'Wycena bota zmieniła się względem fixture. Jeśli to ŚWIADOMA zmiana '
    + 'parametrów (nie refaktor), zregeneruj: node tools/bot-scoring-snapshot.mjs --write',
  );
});

test('golden-master: każda partia zgadza się z fixture (lokalizacja różnicy)', () => {
  const fixture = readFixture();
  const snapshot = computeScoringSnapshot();
  assert.equal(snapshot.matches.length, fixture.matches.length, 'liczba partii golden-mastera');
  for (let i = 0; i < fixture.matches.length; i += 1) {
    const want = fixture.matches[i];
    const got = snapshot.matches[i];
    assert.equal(got.pair, want.pair, `para partii #${i}`);
    assert.equal(got.seed, want.seed, `seed partii #${i}`);
    assert.equal(
      got.hash,
      want.hash,
      `ślad partii ${want.pair}@${want.seed} różni się od fixture `
      + `(decyzje ${got.decisions} vs ${want.decisions}, scoreSum ${got.scoreSum} vs ${want.scoreSum})`,
    );
  }
});

test('golden-master: konfiguracja partii jest stała (talie jednoplanowe)', () => {
  // Zmiana zbioru partii = świadoma regeneracja fixture, nie przypadkowy dryf.
  assert.deepEqual(SNAPSHOT_CONFIG.seeds, [1000, 1001]);
  assert.equal(SNAPSHOT_CONFIG.pairs.length, 3);
  const decks = SNAPSHOT_CONFIG.pairs.flat();
  for (const deck of decks) assert.equal(typeof deck, 'string');
});

test('golden-master: pomiar jest deterministyczny (ADR 0005)', () => {
  // Dwa liczenia tego samego snapshotu muszą dać identyczny hash — bez tego
  // fixture byłby bezużyteczny (fałszywe czerwienienia).
  const a = computeScoringSnapshot();
  const b = computeScoringSnapshot();
  assert.equal(a.overallHash, b.overallHash);
});
