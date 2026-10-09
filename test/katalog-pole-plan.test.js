/**
 * Pole `plan` — reguła właściciela (ustalona 2026-10-09, audyt batcha 64).
 *
 * `plan` to fabularne przyporządkowanie karty do świata, nie set. Bez planu
 * mogą być tylko basic landy, tokeny, karty specjalne oraz potwierdzone tyły
 * DFC. Undercity i Day/Night są specjalnymi wpisami poza registry, więc
 * dołączamy je w teście, by ta kategoria wyjątków też była wykonywalna.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCardRegistry,
  DAY_NIGHT_TOKEN,
  UNDERCITY_DUNGEON,
} from '../src/cards/card-data.js';

const registry = createCardRegistry();
const allCards = registry.all();
const specialEntries = [UNDERCITY_DUNGEON, DAY_NIGHT_TOKEN]
  .map((card) => ({ ...card, special: true }));
const planEntries = [...allCards, ...specialEntries];

function isBasicLand(card) {
  return (card.types ?? []).includes('Basic') && (card.types ?? []).includes('Land');
}

function planExceptionKind(card) {
  if (isBasicLand(card)) return 'basic';
  if (card.support?.status === 'token') return 'token';
  if (card.support?.status === 'back') return 'back';
  if (card.special === true || card.support?.status === 'special') return 'special';
  return null;
}

test('każda regularna karta ma plan; bez planu tylko wyjątki z AGENTS.md', () => {
  const bezPlanu = planEntries.filter((card) => !card.plan);
  const kategorie = { basic: [], token: [], special: [], back: [], reszta: [] };
  for (const card of bezPlanu) {
    const kind = planExceptionKind(card);
    if (kind) kategorie[kind].push(card.id);
    else kategorie.reszta.push(`${card.id} [set ${card.set ?? 'null'}, support ${card.support?.status ?? '?'}]`);
  }

  assert.deepEqual(kategorie.reszta, [],
    'Karty regularne bez planu — właściciel przypisuje plan przy dostawie batcha '
    + '(fabularne przyporządkowanie, nie set): ' + kategorie.reszta.join(', '));

  // Każda kategoria wyjątku jest jawnie rozpoznana; basic landy/tokeny z
  // registry oraz dwie specjalne karty spoza registry są przykładami polityki.
  assert.equal(kategorie.basic.length, 5,
    `oczekiwano 5 basic landów bez planu, jest ${kategorie.basic.length}`);
  assert.equal(kategorie.token.length, 48,
    `oczekiwano 48 tokenów bez planu, jest ${kategorie.token.length}`);
  assert.deepEqual(kategorie.special.sort(), ['day-night', 'undercity'],
    'specjalne wpisy Day/Night i Undercity mogą nie mieć planu');

  // Każdy tył musi mieć dokładnie wskazywalny przód w registry, którego
  // transformTo prowadzi do niego. Chroni przed przepuszczeniem zwykłej karty
  // przez samo ręczne `support.status: back`.
  const niepoprawneTyle = allCards.filter((back) => back.support?.status === 'back')
    .filter((back) => !allCards.some((front) => front.transformTo === back.id
      && front.support?.status === 'supported'))
    .map((back) => back.id);
  assert.deepEqual(niepoprawneTyle, [], 'status back wymaga wspieranego przodu DFC');

  // Regularne karty wspierane — żadna bez planu. To warunek, przy którym
  // `generate-plan-decks.mjs` rzuca wyjątek.
  const wspieraneBezPlanu = allCards
    .filter((card) => card.support?.status === 'supported' && !card.plan && !planExceptionKind(card));
  assert.deepEqual(wspieraneBezPlanu.map((card) => card.id), [],
    'karta wspierana i nie-basic bez planu zatrzymałaby generator talii');
});

// Pin faktów, na których opiera się reguła — gdyby ktoś je „uporządkował",
// straż wyżej przestałaby mierzyć to, co ma mierzyć.
test('pole `plan` nie jest setem: grupy planowe mieszają dodatki (Wiedźmin, Warhammer, Kaldheim)', () => {
  const grupy = new Map();
  for (const card of allCards) {
    if (!card.plan) continue;
    if (!grupy.has(card.plan)) grupy.set(card.plan, new Set());
    grupy.get(card.plan).add(card.set ?? 'null');
  }
  const mieszane = [...grupy.entries()].filter(([, sety]) => sety.size >= 4);
  assert.ok(mieszane.length >= 10,
    `oczekiwano co najmniej 10 grup planowych z 4+ dodatkami (pole jest workiem fabularnym), `
    + `jest ${mieszane.length}`);

  // Konkrety z katalogu, żeby komunikat był sprawdzalny bez uruchamiania.
  assert.equal(registry.get('druid-of-the-cowl').plan, 'Kaladesh',
    'Druid of the Cowl: druk M19, fabularnie Kaladesh (Cowl to część Ghirapur)');
  assert.equal(registry.get('universal-solvent').plan, 'Kaladesh');
  assert.equal(registry.get('scouting-hawk').plan, 'Kaldheim');
  assert.ok(grupy.has('Wiedźmin') && grupy.get('Wiedźmin').size >= 4,
    'talia Wiedźmina istnieje mimo braku takiego setu/planu w vanilla MtG');
  assert.ok(grupy.has('Warhammer Fantasy') && grupy.get('Warhammer Fantasy').size >= 4,
    'talia Warhammer Fantasy istnieje mimo braku takiego setu/planu w vanilla MtG');
});
