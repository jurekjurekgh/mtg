import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { landSplit, coloredPips } from '../tools/generate-plan-decks.mjs';

/**
 * 15g/C (zlecenie właściciela): minima basic-landów z koncentracji pipów.
 * Karta z {R}{R} wymusza ≥2 Góry (proporcja dałaby czasem 1 — nie do
 * rzucenia). Niedobór dobierany kosztem innych kolorów, suma stała.
 */

const REGISTRY = createCardRegistry();
const byId = (id) => REGISTRY.get(id);
const pipsEq = (card, want) => {
  const p = coloredPips(card);
  return ['W', 'U', 'B', 'R', 'G'].every((c) => p[c] === (want[c] ?? 0));
};
/** Pierwsze N wspieranych kart o dokładnym profilu pipów (deterministycznie). */
const firstWithPips = (want, n) => REGISTRY.all()
  .filter((c) => c.support?.status === 'supported' && pipsEq(c, want))
  .slice(0, n);

test('minimum: karta z {R}{R} wymusza 2 Góry (nie 1 z proporcji)', () => {
  // Ballista Watcher {2}{R}{R} + 9 mono-G: proporcja dałaby R:1 (2/11 z 5).
  const deck = [byId('ballista-watcher'), ...firstWithPips({ G: 1 }, 9)];
  assert.equal(deck.length, 10);
  const lands = landSplit(deck);
  assert.equal(lands.R, 2, `2 Góry na {R}{R}, dostałem ${JSON.stringify(lands)}`);
});

test('dobór kosztem innego koloru: suma landów stała (ceil(n/2))', () => {
  const deck = [byId('ballista-watcher'), ...firstWithPips({ G: 1 }, 9)];
  const lands = landSplit(deck);
  const sum = Object.values(lands).reduce((a, b) => a + b, 0);
  assert.equal(sum, 5, `suma 5, dostałem ${JSON.stringify(lands)}`);
  assert.equal(lands.G, 3, 'G oddało jeden R');
});

test('determinizm: kolejność kart nie zmienia rozkładu', () => {
  const deck = [byId('banishment-decree'), ...firstWithPips({ R: 1 }, 7)];
  assert.deepEqual(landSplit([...deck].reverse()), landSplit(deck));
});

test('suma minimów powyżej totalu → total rośnie (jawnie, nie ucina)', () => {
  // 5 kart × podwójny pip różnych kolorów: minimum 2+2+2+2+2=10 > ceil(5/2).
  const deck = ['banishment-decree', 'apprentice-wizard', 'dread-warlock', 'ballista-watcher', 'crested-herdcaller']
    .map(byId);
  assert.deepEqual(landSplit(deck), { W: 2, U: 2, B: 2, R: 2, G: 2 });
});

test('min 1 na używany kolor zachowane (poprzednia reguła nie znika)', () => {
  const deck = [byId('apprentice-wizard'), ...firstWithPips({ R: 1 }, 11)];
  const lands = landSplit(deck);
  assert.ok(lands.R >= 1 && lands.U >= 1, JSON.stringify(lands));
});
