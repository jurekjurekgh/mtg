// Audyt PR #147 — O4: silnikowy `HOSTILE_COUNTERS` nie niósł liczników
// minusowych, a bot trzymał własną listę (`DEBUFF_COUNTERS`) — dwie prawdy
// o tej samej rzeczy (klasa L41). Rozjazd tej rodziny był już mierzalny przy
// PMSSB-23/F1: `stun` w czarze był wart 0, choć ta sama instrukcja ze
// zdolności dostawała 10 + 4·amount.
//
// Naprawa (ADR 0002 — po nazwie LICZNIKA, nie karty): jedno źródło
// `counterIsHostile` w `effect-intent.js` — `stun` (zamiast odkręcenia,
// CR 122.1d/614.6) i `finality` (śmierć → wygnanie) z listy, a liczniki
// MINUSOWE rozpoznawane WZORCEM nazwy (CR 122.1), więc reguła jest kompletna
// także dla `-2/-2` i dla karty spoza katalogu. Bot pyta to samo źródło
// w `counterEffectValue`.
//
// Kotwica anty-over-fix: liczniki przyjazne i zasobowe (`+1/+1`, `charge`,
// `oil`, `level`, `point`) zostają PRZYJAZNE — inaczej bot karałby się za
// dołożenie sobie `+1/+1` (L3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { counterIsHostile, triggerEffectIsHostile } from '../src/engine/effect-intent.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * Tabela DECYZJI dla liczników, które katalog dziś rozdaje przez `add_counter`.
 * Nowy licznik w katalogu nie przejdzie po cichu (O4/4) — trzeba go tu
 * dopisać i świadomie wybrać stronę (ADR 0002).
 */
const DECYZJA = Object.freeze({
  '+1/+1': false, // przyjazny: rośnie obdarowany (CR 122.1)
  'charge': false, // zasobowy: konsument w tej samej karcie
  'oil': false, // zasobowy (Proliferate)
  'level': false, // zasobowy (Level Up, CR 702.87)
  'point': false, // zasobowy (Contested Game Ball)
  '-1/-1': true, // minusowy: obniża statystyki
  'stun': true, // zastępuje odkręcenie (CR 122.1d/614.6)
});

const LICZNIKI_KATALOGU = (() => {
  const registry = createCardRegistry();
  const cards = typeof registry.all === 'function'
    ? registry.all()
    : [...(registry.cards?.values?.() ?? registry)];
  const names = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    if (node.type === 'add_counter' && typeof node.counter === 'string') names.add(node.counter);
    for (const value of Object.values(node)) walk(value);
  };
  for (const card of cards) walk(card.abilities ?? []);
  return [...names].sort();
})();

test('O4/1: liczniki minusowe są wrogie — i w klasyfikacji, i w bramce triggera', () => {
  for (const counter of ['-1/-1', '-1/0', '-0/-1']) {
    assert.equal(counterIsHostile(counter), true, `${counter} ma być wrogi (CR 122.1)`);
  }
  // Wzorzec, nie wyliczanka: kolejne wydania znają też większe minusy —
  // reguła musi objąć je bez dopisywania nazwy do listy.
  assert.equal(counterIsHostile('-2/-2'), true, 'wzorzec nazwy ma objąć -2/-2');
  assert.equal(triggerEffectIsHostile({ type: 'add_counter', counter: '-1/-1' }), true,
    'trigger z licznikiem -1/-1 na celu jest wrogi dla celu');
});

test('O4/2: liczniki przyjazne i zasobowe NIE są wrogie (kotwica anty-over-fix)', () => {
  for (const counter of ['+1/+1', '+1/+0', '+0/+1', 'shield', 'charge', 'oil', 'level', 'point', 'deathtouch']) {
    assert.equal(counterIsHostile(counter), false, `${counter} nie może być wrogi`);
  }
  for (const counter of [undefined, null, '', 42, {}]) {
    assert.equal(counterIsHostile(counter), false, `${JSON.stringify(counter)} nie może być wrogi`);
  }
});

test('O4/3: stun i finality zostają wrogie (regresja)', () => {
  assert.equal(counterIsHostile('stun'), true, 'stun zastępuje odkręcenie (CR 122.1d/614.6)');
  assert.equal(counterIsHostile('finality'), true, 'finality zamienia śmierć na wygnanie');
  assert.equal(triggerEffectIsHostile({ type: 'add_counter', counter: 'stun' }), true);
});

test('O4/4: każdy licznik katalogu ma decyzję w tabeli strażnika', () => {
  assert.deepEqual(LICZNIKI_KATALOGU.filter((n) => !(n in DECYZJA)), [],
    'nowy licznik rozdawany przez add_counter: dopisz go do DECYZJA (świadomie wrogi/przyjazny)');
  for (const counter of LICZNIKI_KATALOGU) {
    assert.equal(counterIsHostile(counter), DECYZJA[counter],
      `klasyfikacja licznika ${counter} rozjechała się z tabelą decyzji`);
  }
});

test('O4/5: bot nie trzyma drugiej listy — klasyfikacja z jednego źródła (L41)', () => {
  const bot = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  assert.match(bot, /counterIsHostile\(/,
    'bot ma wołać silnikowe `counterIsHostile`, nie własną listę liczników');
  assert.doesNotMatch(bot, /const DEBUFF_COUNTERS\s*=/,
    'własna lista wrogich liczników w bocie = druga prawda (rozjazd jak PMSSB-23/F1)');
  assert.doesNotMatch(bot, /new Set\(\[[^\]]*'-\d\/-\d'/,
    'lista minusowych liczników w bocie ma zniknąć na rzecz wzorca w silniku');
});
