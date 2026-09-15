/**
 * Analiza lądów we wszystkich taliach decks/ + empiryczna symulacja rąk otwarcia.
 *
 * Definicje (z repo):
 *  - M132 (zgłoszenie B właściciela): na 2 karty nielandowe co najmniej 1 ląd
 *    (ląd = KAŻDA karta z types zawierającym 'Land', także niepodstawowa);
 *    limit górny: 55% lądów.
 *  - Generator (tools/generate-plan-decks.mjs): basic landy = ceil(nonbasic/2),
 *    karty niepodstawowe (w tym utility-landy) liczą się po stronie „nielandów".
 *
 * Symulacja: setupCardMatch (prawdziwa ścieżka: shuffle Fishera-Yatesa +
 * rozdanie 7 kart) × 2000 seedów na talię — liczymy ręce otwarcia gracza 1
 * bez lądów i z ≤1 lądem, porównujemy z rozkładem hipergeometrycznym.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { setupCardMatch } from '../src/cards/materialize.js';

const registry = createCardRegistry();
const files = readdirSync('decks').filter((f) => f.endsWith('.txt')).sort();

/** Dokładne P(0 lądów) w ręce 7 z talii o danych rozmiarach (hipergeometryczne). */
function hypergeometricZero(deckSize, lands, hand = 7) {
  const nonlands = deckSize - lands;
  if (lands > deckSize || hand > deckSize) return NaN;
  // P(0) = C(nonlands, hand) / C(deckSize, hand) — liczone iloczynowo.
  let p = 1;
  for (let i = 0; i < hand; i += 1) {
    p *= (nonlands - i) / (deckSize - i);
    if (p <= 0) break;
  }
  return p;
}

console.log('TALIA                      total  lądy(b+u)  nie-lądy  lądy%   nieland:land  M132(<=2)  1:2 dokładnie  P(0 lądów,7) teoret.');
console.log('='.repeat(140));
let worstZero = { name: '', p: 0 };
let deviations = [];
for (const file of files) {
  const { name, cardIds } = parseDeckText(readFileSync(`decks/${file}`, 'utf8'), registry);
  let lands = 0; let basic = 0; let utility = 0; let nonland = 0;
  const utilityNames = [];
  for (const id of cardIds) {
    const card = registry.get(id);
    const isLand = (card.types ?? []).includes('Land');
    const isBasic = id.startsWith('basic-');
    if (isLand) {
      lands += 1;
      if (isBasic) basic += 1; else { utility += 1; utilityNames.push(card.name); }
    } else nonland += 1;
  }
  const total = cardIds.length;
  const share = (lands / total) * 100;
  const ratio = nonland / lands;
  const m132ok = ratio <= 2.0 && share <= 55;
  const exact = Math.abs(lands - nonland / 2) < 1e-9;
  const p0 = hypergeometricZero(total, lands);
  if (!m132ok) deviations.push(`${file}: ratio ${ratio.toFixed(2)}, share ${share.toFixed(1)}%`);
  if (p0 > worstZero.p) worstZero = { name: file, p: p0 };
  const mark = m132ok ? ' OK ' : 'NIE!';
  const exactMark = exact ? 'TAK' : 'nie';
  console.log(
    `${mark}${file.padEnd(24)} ${String(total).padStart(4)}  ${String(basic).padStart(2)}+${String(utility).padStart(2)}        ` +
    `${String(nonland).padStart(5)}   ${share.toFixed(1).padStart(5)}%  ${ratio.toFixed(2).padStart(8)}        ` +
    `${String(m132ok).padEnd(5)}  ${exactMark.padEnd(5)}       ${(p0 * 100).toFixed(1).padStart(4)}%`,
  );
  if (utility > 0) console.log(`     utility-landy: ${utilityNames.join(', ')}`);
}

console.log('\nOdstępstwa od reguły M132:', deviations.length === 0 ? 'BRAK' : deviations.join('; '));
console.log(`Najwyższe teoretyczne P(0 lądów w ręce 7): ${worstZero.name} — ${(worstZero.p * 100).toFixed(2)}% (1 na ${(1 / worstZero.p).toFixed(0)} gier)`);

// --- Symulacja empiryczna: prawdziwa ścieżka rozdania ---
console.log('\nSYMULACJA (setupCardMatch, 2000 seedów/talia — liczone ręce P1):');
console.log('TALIA                      teoret.P(0)  empir. 0 lądów  teoret.P(<=1)  empir. <=1 ląd');
console.log('='.repeat(120));
const SIM_N = 2000;
for (const file of files) {
  const { cardIds } = parseDeckText(readFileSync(`decks/${file}`, 'utf8'), registry);
  const deck = { cards: cardIds };
  let landsInDeck = 0;
  for (const id of cardIds) if (registry.get(id).types.includes('Land')) landsInDeck += 1;
  const total = cardIds.length;
  let zero = 0; let leOne = 0;
  for (let seed = 0; seed < SIM_N; seed += 1) {
    const state = setupCardMatch({
      seed,
      players: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }],
      decks: new Map([['p1', cardIds], ['p2', cardIds]]),
      registry,
    });
    const handIds = state.zones.hand.filter((id) => state.objects.get(id).controllerId === 'p1');
    let handLands = 0;
    for (const id of handIds) {
      const obj = state.objects.get(id);
      if ((obj.types ?? []).includes('Land')) handLands += 1;
    }
    if (handLands === 0) zero += 1;
    if (handLands <= 1) leOne += 1;
  }
  // teoret. P(<=1) hipergeom.: P(0)+P(1), P(1) = C(L,1)·C(N,6)/C(T,7)
  const p0 = hypergeometricZero(total, landsInDeck);
  const C = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 0; i < k; i += 1) r = r * (n - i) / (i + 1); return r; };
  const pOne = (C(landsInDeck, 1) * C(total - landsInDeck, 6)) / C(total, 7);
  const theoLe1 = p0 + pOne;
  const zPct = ((zero / SIM_N) * 100).toFixed(2);
  const tPct = (p0 * 100).toFixed(2);
  const diff = Math.abs(zero / SIM_N - p0) / p0;
  const flag = diff > 0.3 ? '  <-- ROZJAZD!' : '';
  console.log(
    `${file.padEnd(24)} ${tPct.padStart(7)}%   ${zPct.padStart(8)}%     ${(theoLe1 * 100).toFixed(2).padStart(7)}%      ` +
    `${((leOne / SIM_N) * 100).toFixed(2).padStart(7)}%${flag}`,
  );
}
console.log('\nROZJAZD = empiryczne odchylenie >30% od teorii (sygnał błędu tasowania/rozdania).');
