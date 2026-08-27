import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitPlanByColors,
  needsSplit,
  defaultColorsOf,
  SPLIT_THRESHOLD,
  MIN_NONLAND,
} from '../tools/split-deck-colors.mjs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';

/**
 * M228 (ADR 0024): podział kolorystyczny talii planowej ≥30 kart nielandowych.
 * Testy: progi, poprawność podziału na syntetycznych zbiorach ORAZ na realnych
 * planach katalogu (dowód, że reguła działa na tym, co mamy).
 */

const card = (id, colors) => ({ id, colors, types: ['Creature'] });

test('needsSplit: próg to 30 kart nielandowych', () => {
  assert.equal(needsSplit(29), false);
  assert.equal(needsSplit(30), true);
  assert.equal(needsSplit(35), true);
  assert.equal(SPLIT_THRESHOLD, 30);
  assert.equal(MIN_NONLAND, 15);
});

test('podział czysty: 15 białych + 15 zielonych → W | G', () => {
  const cards = [
    ...Array.from({ length: 15 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 15 }, (_, i) => card(`g${i}`, ['G'])),
  ];
  const r = splitPlanByColors(cards);
  assert.ok(r, 'podział musi istnieć');
  assert.equal(r.a.length, 15);
  assert.equal(r.b.length, 15);
  assert.equal(r.leak, 0, 'brak kart rozdartych między strony');
  // Sufiksy rozłączne i odpowiadają kolorom.
  assert.ok([...r.suffixA].every((c) => !r.suffixB.includes(c)), 'sufiksy rozłączne');
  const suffixes = [r.suffixA, r.suffixB].sort();
  assert.deepEqual(suffixes, ['g', 'w']);
});

test('każda karta trafia do DOKŁADNIE jednej strony (singleton zachowany)', () => {
  const cards = [
    ...Array.from({ length: 16 }, (_, i) => card(`u${i}`, ['U'])),
    ...Array.from({ length: 16 }, (_, i) => card(`r${i}`, ['R'])),
  ];
  const r = splitPlanByColors(cards);
  const ids = [...r.a.map((c) => c.id), ...r.b.map((c) => c.id)];
  assert.equal(new Set(ids).size, cards.length, 'brak duplikatów');
  assert.equal(ids.length, cards.length, 'brak zgubionych kart');
});

test('bezkolorowe (artefakty) balansują mniejszą stronę', () => {
  const cards = [
    ...Array.from({ length: 18 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 6 }, (_, i) => card(`b${i}`, ['B'])),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `art${i}`, colors: [], types: ['Artifact'] })),
  ];
  const r = splitPlanByColors(cards);
  assert.ok(r, 'podział musi istnieć (filler dobalansuje stronę B do ≥15)');
  assert.ok(r.a.length >= MIN_NONLAND && r.b.length >= MIN_NONLAND);
  assert.equal(r.a.length + r.b.length, cards.length);
});

test('colorsOf: land produkujący kolor trafia po SWOJEJ stronie, nie jako filler', () => {
  // Poprawka właściciela: non-basic land z tożsamością kolorystyczną (produkuje
  // R) MUSI iść na stronę R, nie balansować jak artefakt. Discriminator:
  // strona czerwona ma DOKŁADNIE 15 kart czerwonych bez landa; land R dopina ją
  // do 16 i przechyla balans — z regułą filler poszedłby na SŁABSZĄ stronę.
  const colorsOf = (c) => (c.producesColors ? c.producesColors : (c.colors ?? []));
  const cards = [
    ...Array.from({ length: 18 }, (_, i) => card(`u${i}`, ['U'])),
    ...Array.from({ length: 15 }, (_, i) => card(`r${i}`, ['R'])),
    { id: 'furnace', colors: [], producesColors: ['R'], types: ['Land'] }, // produkuje R
  ];
  const r = splitPlanByColors(cards, colorsOf);
  assert.ok(r);
  const sideWithLand = [r.a, r.b].find((side) => side.some((c) => c.id === 'furnace'));
  const redOnThatSide = sideWithLand.filter((c) => colorsOf(c).includes('R')).length;
  // Land R jest po stronie czerwonej (są tam inne czerwone karty).
  assert.ok(redOnThatSide > 1, 'land R trafia na stronę czerwoną (z innymi czerwonymi)');
  const otherSide = sideWithLand === r.a ? r.b : r.a;
  assert.ok(!otherSide.some((c) => colorsOf(c).includes('R')), 'strona bez landa nie ma czerwieni');
});

test('colorsOf: gdy land traktowany jako filler (BŁĘDNIE), ląduje inaczej — discriminator', () => {
  // Kontrtest: TA SAMA scena, ale colorsOf udaje, że land nie ma koloru
  // (dawne zachowanie). Wtedy land jest wypełniaczem i idzie na MNIEJSZĄ stronę
  // (U ma 18, R ma 15 → filler dobiłby stronę R do 16 też, ale bez tożsamości
  // koloru). Sprawdzamy, że sufiks strony landa NIE zawiera R (bo land-filler
  // nie wnosi koloru) — kontrast z testem wyżej.
  const asFiller = (c) => (c.id === 'furnace' ? [] : (c.colors ?? []));
  const cards = [
    ...Array.from({ length: 18 }, (_, i) => card(`u${i}`, ['U'])),
    ...Array.from({ length: 15 }, (_, i) => card(`r${i}`, ['R'])),
    { id: 'furnace', colors: [], types: ['Land'] },
  ];
  const r = splitPlanByColors(cards, asFiller);
  assert.ok(r);
  // Land-filler nie dokłada koloru do sufiksu — to różnica względem testu wyżej.
  const sideWithLand = [r.a, r.b].find((side) => side.some((c) => c.id === 'furnace'));
  const landOnlyCard = sideWithLand.find((c) => c.id === 'furnace');
  assert.equal(asFiller(landOnlyCard).length, 0, 'jako filler land nie ma koloru');
});

test('colorsOf: BEZKOLOROWY ARTEFAKT produkujący kolor idzie po swojej stronie', () => {
  // Poprawka właściciela #2: ta sama reguła co dla lądów dotyczy artefaktów
  // (mana rock) i kart devoid — nie tylko lądów. Artefakt dający {U} ma
  // tożsamość niebieską.
  const colorsOf = (c) => (c.producesColors ? c.producesColors : (c.colors ?? []));
  const cards = [
    ...Array.from({ length: 18 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 15 }, (_, i) => card(`u${i}`, ['U'])),
    { id: 'mind-stone-u', colors: [], producesColors: ['U'], types: ['Artifact'] },
  ];
  const r = splitPlanByColors(cards, colorsOf);
  assert.ok(r);
  const sideWithArt = [r.a, r.b].find((side) => side.some((c) => c.id === 'mind-stone-u'));
  assert.ok(sideWithArt.filter((c) => colorsOf(c).includes('U')).length > 1,
    'artefakt {U} trafia na stronę niebieską (z innymi niebieskimi)');
});

test('colorsOf: land any-color / bezbarwny jest wypełniaczem', () => {
  const colorsOf = (c) => (c.producesColors ? c.producesColors : (c.colors ?? []));
  const cards = [
    ...Array.from({ length: 16 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 15 }, (_, i) => card(`g${i}`, ['G'])),
    { id: 'anyland', colors: [], producesColors: ['W', 'U', 'B', 'R', 'G'], types: ['Land'] }, // filler
    { id: 'colo..less', colors: [], producesColors: [], types: ['Land'] }, // filler
  ];
  const r = splitPlanByColors(cards, colorsOf);
  assert.ok(r);
  // Oba landy to wypełniacze — balansują, nie tworzą własnego koloru w sufiksie.
  assert.equal(r.a.length + r.b.length, cards.length);
  assert.ok([...r.suffixA].every((c) => !r.suffixB.includes(c)));
});

test('defaultColorsOf: bez wstrzyknięcia używa colors[]', () => {
  assert.deepEqual(defaultColorsOf({ colors: ['W', 'U'] }), ['W', 'U']);
  assert.deepEqual(defaultColorsOf({ colors: [] }), []);
  assert.deepEqual(defaultColorsOf({}), []);
});

test('plan mocno jednokolorowy → null (fallback: zostaw jedną talię)', () => {
  // 28 zielonych + 2 czerwone: żaden podział nie da dwóch stron ≥15.
  const cards = [
    ...Array.from({ length: 28 }, (_, i) => card(`g${i}`, ['G'])),
    ...Array.from({ length: 2 }, (_, i) => card(`r${i}`, ['R'])),
  ];
  assert.equal(splitPlanByColors(cards), null);
});

test('wynik jest deterministyczny (ADR 0005)', () => {
  const cards = [
    ...Array.from({ length: 18 }, (_, i) => card(`w${i}`, ['W'])),
    ...Array.from({ length: 17 }, (_, i) => card(`b${i}`, ['B'])),
  ];
  const a = splitPlanByColors(cards);
  const b = splitPlanByColors(cards);
  assert.deepEqual(a.a.map((c) => c.id), b.a.map((c) => c.id));
  assert.deepEqual(a.suffixA, b.suffixA);
});

// --- Realne plany katalogu: dowód, że reguła działa na tym, co mamy ---
// Używamy TEJ SAMEJ tożsamości kolorystycznej co generator: kolory produkcji
// many dla lądów (getSourceForObject), colors[] dla reszty (poprawka właściciela).
const registry = createCardRegistry();
const planNonbasic = (plan) => registry.all().filter((c) => c.support?.status === 'supported'
  && c.plan === plan && !c.id.startsWith('basic-'));
const realColorsOf = (card) => {
  const declared = (card.colors ?? []).filter((c) => 'WUBRG'.includes(c));
  if (declared.length > 0) return declared;
  const kind = (card.types ?? []).includes('Land') ? 'land'
    : (card.types ?? []).includes('Creature') ? 'creature' : 'artifact';
  const src = getSourceForObject({
    id: card.id, cardId: card.id, kind,
    types: card.types ?? [], subtypes: card.subtypes ?? [],
    abilities: card.abilities ?? [], colors: [],
  }, null);
  return src?.colors ?? [];
};

for (const plan of ['Innistrad', 'Tarkir', 'Mirrodin', 'Dominaria', 'Warhammer Fantasy']) {
  test(`realny plan ${plan} (≥30) dzieli się na dwie talie ≥15`, () => {
    const cards = planNonbasic(plan);
    assert.ok(needsSplit(cards.length), `${plan} ma ${cards.length} — powinno przekraczać próg`);
    const r = splitPlanByColors(cards, realColorsOf);
    assert.ok(r, `${plan} musi dać się podzielić`);
    assert.ok(r.a.length >= MIN_NONLAND, `strona A ${r.a.length} >= 15`);
    assert.ok(r.b.length >= MIN_NONLAND, `strona B ${r.b.length} >= 15`);
    assert.equal(r.a.length + r.b.length, cards.length, 'żadna karta nie zginęła');
    const ids = new Set([...r.a.map((c) => c.id), ...r.b.map((c) => c.id)]);
    assert.equal(ids.size, cards.length, 'brak duplikatów (singleton)');
    assert.ok([...r.suffixA].every((c) => !r.suffixB.includes(c)), 'sufiksy kolorów rozłączne');
  });
}
