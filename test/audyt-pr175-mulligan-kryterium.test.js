/**
 * Audyt PR #175 / pętla jakości 2026-10-26c — kryterium mulliganu w
 * narzędziu audytowym (`tools/scoring-mulligan-audit.mjs`).
 *
 * Dwa błędy pomiaru znalezione Żywym Testerem sesji (analizatory):
 *
 *  F-M1 (kontrakt FoW): `playerView.zones.hand` to strefa ZŁOŻONA — karty
 *        przeciwnika leżą tam jako `{ id, controllerId, hidden: true }`
 *        (`src/engine/game-state.js:6867`). Narzędzie liczyło je jako WŁASNE
 *        czary (`kind !== 'land'`), więc raport pokazywał „czary=12” dla
 *        7-kartowej ręki, a kryterium oceniało zbiór, którego bot nie ma.
 *  F-M2 (model gorszy od mierzonego kodu, L118/L119): klasa „keep bez
 *        grywalnego czaru” była zapisana jako `najtańszy > lądy`, co dawało
 *        fałszywy alarm dla zwykłej ręki 2 lądy + najtańszy czar 3 many —
 *        po dobraniu jednego lądu czar JEST grywalny, więc ręka nie spełnia
 *        opisu klasy („bot nic nie robi przez ≥2 tury”).
 *
 * Piny:
 *   M/1 — własna ręka: cudze `hidden` nie wchodzą do liczb (RED przed fixem);
 *   M/2 — regresja zgłoszenia: 2 lądy + najtańszy 3 many NIE jest naruszeniem;
 *   M/3 — alarm NADAL dzwoni (2 lądy + najtańszy 6, ręka bez czarów);
 *   M/4 — polityka (keep <2 lądów / mulligan mimo 2+ lądów) bez zmian.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMulliganDecision, ownHandCards, ownHandSummary,
} from '../tools/mulligan-keep-criterion.mjs';

/** Kształt z `playerView`: własne karty jawne, cudze jako `hidden` (FoW). */
function hand(own, hiddenCount = 0) {
  const cards = own.map(([kind, manaCost], index) => ({
    id: `p1-card-${index}`, controllerId: 'p1', kind, ...(manaCost == null ? {} : { manaCost }),
  }));
  const cudze = Array.from({ length: hiddenCount }, (_, index) => ({
    id: `p2-card-${index}`, controllerId: 'p2', hidden: true,
  }));
  return [...cards, ...cudze];
}

test('M/1: cudza (ukryta) ręka nie jest liczona jako własne czary — strefa złożona, FoW', () => {
  const view = hand([['land', 0], ['land', 0], ['creature', 3], ['spell', 4], ['creature', 6]], 7);
  assert.equal(view.length, 12, 'widok niesie 5 własnych + 7 ukrytych kart (kontrakt FoW)');
  const own = ownHandCards(view, 'p1');
  assert.equal(own.length, 5, 'tylko własne karty');
  assert.ok(own.every((card) => card.hidden !== true), 'żadna ukryta karta nie wchodzi do podsumowania');
  const summary = ownHandSummary(view, 'p1');
  assert.deepEqual(summary, { lands: 2, spells: 3, cheapestSpell: 3 });
});

test('M/2: 2 lądy + najtańszy czar 3 many to NIE „keep bez grywalnego czaru” (fałszywy alarm z audytu)', () => {
  // Dokładnie ręka zmierzona w próbce 2026-10-26c: the-edge, seed 1234,
  // 2 lądy + 12 „czarów” (7 z nich to cudza ręka). Po jednym lądzie czar
  // 3 many jest grywalny — klasa opisuje ≥2 tury bez akcji, więc nie zachodzi.
  const summary = ownHandSummary(
    hand([['land', 0], ['land', 0], ['enchantment', 3], ['creature', 6], ['creature', 5]], 7),
    'p1',
  );
  assert.deepEqual(summary, { lands: 2, spells: 3, cheapestSpell: 3 });
  assert.equal(
    classifyMulliganDecision({ keep: true, lands: summary.lands, spells: summary.spells, cheapestSpell: summary.cheapestSpell }),
    null,
    'keep 2 lądy + 3-drop nie może być naruszeniem (było: KEEP bez grywalnego czaru)',
  );
});

test('M/3: alarm nadal dzwoni — ręka bez czarów i ręka bez czaru nawet po lądzie', () => {
  assert.equal(
    classifyMulliganDecision({ keep: true, lands: 2, spells: 3, cheapestSpell: 6 }),
    'KEEP bez grywalnego czaru',
    '2 lądy + najtańszy 6 many = nic do zagrania po jednym lądzie → naruszenie',
  );
  assert.equal(
    classifyMulliganDecision({ keep: true, lands: 3, spells: 4, cheapestSpell: 3 }),
    null,
    '3 lądy + czar 3 many jest grywalne od razu',
  );
  assert.equal(
    classifyMulliganDecision({ keep: true, lands: 2, spells: 0, cheapestSpell: null }),
    'KEEP bez czarów (same lądy)',
  );
});

test('M/4: polityka bota bez zmian (keep ⇔ ≥2 lądy albo ≥2 mulligany)', () => {
  assert.equal(classifyMulliganDecision({ keep: true, lands: 1, mulligans: 0, spells: 6, cheapestSpell: 1 }), 'KEEP bez polityki');
  assert.equal(classifyMulliganDecision({ keep: true, lands: 1, mulligans: 2, spells: 6, cheapestSpell: 1 }), null,
    'po dwóch mulliganach keep z 1 lądem jest polityką');
  assert.equal(classifyMulliganDecision({ keep: false, lands: 3, mulligans: 0, spells: 4, cheapestSpell: 2 }), 'MULLIGAN mimo 2+ lądów');
  assert.equal(classifyMulliganDecision({ keep: false, lands: 0, mulligans: 0, spells: 7, cheapestSpell: 1 }), null,
    'mulligan bez lądów jest zgodny z polityką');
});
