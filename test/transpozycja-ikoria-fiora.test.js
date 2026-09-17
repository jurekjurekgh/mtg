// Transpozycja 2026-09-13 (zlecenie właściciela): plany Ikoria i Fiora
// USUNIĘTE (nie miały własnych talii, tylko wpisy w workach). 3 karty
// przeniesione na inne plany:
//   571CMR Vow of Flight (Fiora → Eldraine) — worek-legend → worek-baśni,
//   201MOM Tiller of Flesh (Ikoria → Mirrodin) — worek-mroczny → mirrodin-wu,
//   446IKO Unbreakable Bond (Ikoria → Ixalan) — worek-mroczny → worek-dziki.
// Efekt uboczny w podziale Mirrodina (deterministyczny, ADR 0024): bezbarwny
// wypełniacz Horizon Spellbomb przeszedł mirrodin-wu → mirrodin-brg, żeby
// zbilansować strony 18/18 (leak 0, imbalance 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { WOREK_DECKS } from '../tools/generate-plan-decks.mjs';

const REGISTRY = createCardRegistry();

test('transpozycja: katalog niesie nowe plany 3 kart', () => {
  assert.equal(REGISTRY.get('vow-of-flight').plan, 'Eldraine');
  assert.equal(REGISTRY.get('tiller-of-flesh').plan, 'Mirrodin');
  assert.equal(REGISTRY.get('unbreakable-bond').plan, 'Ixalan');
});

test('transpozycja: każda z 3 kart w DOKŁADNIE jednej (nowej) talii', () => {
  const deckOf = (file) => parseDeckText(fs.readFileSync(`decks/${file}`, 'utf8'), REGISTRY).cardIds;
  const gdzie = (cardId) => fs.readdirSync('decks')
    .filter((f) => f.endsWith('.txt'))
    .filter((f) => deckOf(f).includes(cardId));
  for (const [cardId, oczekiwane] of [
    ['vow-of-flight', 'worek-basni.txt'],
    ['tiller-of-flesh', 'mirrodin-wu.txt'],
    // Batch 56 (B6): Ixalan dobił do progu 15 wspieranych kart i generator
    // awansował go do własnej talii „ixalan" (M181, ADR 0023 §4) — karty
    // planu wychodzą z worka-dzikiego razem z nim.
    ['unbreakable-bond', 'ixalan.txt'],
  ]) {
    assert.deepEqual(gdzie(cardId), [oczekiwane],
      `${cardId} ma być w DOKŁADNIE jednej talii: ${oczekiwane}`);
  }
});

test('transpozycja: Ikoria i Fiora nie istnieją w danych ani w mapie worków', () => {
  const plans = new Set(REGISTRY.all().map((c) => c.plan).filter(Boolean));
  assert.equal(plans.has('Ikoria'), false);
  assert.equal(plans.has('Fiora'), false);
  assert.equal(WOREK_DECKS.Ikoria, undefined);
  assert.equal(WOREK_DECKS.Fiora, undefined);
});
