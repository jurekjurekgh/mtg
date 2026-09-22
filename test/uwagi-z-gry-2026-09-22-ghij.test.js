// Uwagi z gry właściciela, 2026-09-22 (G, H, I, J) — cztery zgłoszenia z partii.
//
// G. Panic Spellbomb: „Kolejna karta, która jest bezbarwna, ale ma specjalną
//    zdolność opłacaną czerwoną maną. Powinna być rozdawana do talii, które
//    mają czerwony, a nie do WU.”
//    Root cause: pip {R} tej karty siedzi w `trigger.payColors` (opcjonalna
//    płatność triggera „dies”), a `abilityCostColorsOf` w generatorze czytał
//    wyłącznie `ability.cost.*` i `spell.*` — pip był niewidoczny, więc karta
//    trafiała do `mirrodin-wu`, gdzie triggera NIE DA SIĘ opłacić.
//    Klasa (ADR 0002): każdy kolorowy pip w KOSZCIE DO ZAPŁACENIA należy do
//    tożsamości kolorystycznej karty (CR 903.4), niezależnie od tego, czy jest
//    to koszt aktywacji, czy opcjonalna płatność triggera.
//
// H. Kor Sanctifiers: „Wchodzi Kicked. Nie ma informacji o tym, że zapłacono
//    Kick ani w Rozgrywka, ani w logu.”
//    Root cause: zdarzenia rzutu niosły `kicked` wyłącznie dla TRIGGERÓW
//    („if it was kicked”), a warstwa opisu (`describeEvent` — wspólna dla logu
//    i „Rozgrywka”) jej nie czytała.
//
// I. Porcelain Legionnaire / first strike jako KLASA: „Bot nie umie blokować
//    ataków kreatur z first strike. Blokuje wieloma kreaturami, które giną…
//    sam nic nie tracę, bo ich atak nie wchodzi we mnie. Jeśli kreatura
//    z first strike nie ma trample, to blokowanie więcej niż jedną kreaturą
//    w momencie braku lethala nie ma sensu. (…) wyznacza na wymianę dużego
//    stwora zamiast 1/1. Wystarczyło, żeby zablokował najmniejszym.”
//    Root cause: wycena `declare_blockers` porównywała gołe sumy mocy —
//    first strike atakującego nie istniał w modelu (CR 510.4, 702.7b).
//
// J. Infect: „Mam na stole kreaturę 5/5 z Infect. Bot ma 6 znaczników trucizny
//    i 20 życia. Mimo że zaraz zginie od trucizny, atakuje mnie wszystkimi
//    kreaturami (…). Ginie od 11 poison counterów. Widocznie patrzy tylko na
//    życie, a w ogóle nie ocenia ryzyka trucizny.”
//    Root cause: model gardy i `lethalThreat` liczyły wyłącznie obrażenia
//    w życie; drugi zegar przegranej (CR 104.3c / 704.5c — dziesięć liczników)
//    nie istniał po stronie OBRONY (po stronie ataku był — C-R5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockExchangeOf } from '../src/controllers/heuristic-bot.js';
import { paidExtraCostSuffix } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { abilityCostColorsOf } from '../tools/generate-plan-decks.mjs';
import { readFileSync } from 'node:fs';

const creature = (id, power, toughness, keywords = []) => ({
  id, power, toughness, damage: 0, keywords, kind: 'creature', types: ['Creature'],
});

// ─── G ───────────────────────────────────────────────────────────────────────

test('G: pip {R} z payColors triggera należy do tożsamości kolorystycznej (CR 903.4)', () => {
  const registry = createCardRegistry();
  // Panic Spellbomb: „{T}, Sacrifice: target creature can't block” + trigger
  // „When this is put into a graveyard, you may pay {R}: draw a card”.
  assert.deepEqual(abilityCostColorsOf(registry.get('panic-spellbomb')), ['R'],
    'pip {R} z trigger.payColors musi być widoczny dla generatora talii');
  // Ta sama klasa, inny kolor — dowód, że to reguła, nie wyjątek na kartę.
  assert.deepEqual(abilityCostColorsOf(registry.get('horizon-spellbomb')), ['G']);
});

test('G: Spellbomby trafiają do talii, która UMIE opłacić ich pip', () => {
  const brg = readFileSync(new URL('../decks/mirrodin-brg.txt', import.meta.url), 'utf8');
  const wu = readFileSync(new URL('../decks/mirrodin-wu.txt', import.meta.url), 'utf8');
  assert.ok(brg.includes('Panic Spellbomb'), 'Panic Spellbomb ({R}) należy do talii z czerwonym');
  assert.ok(!wu.includes('Panic Spellbomb'), 'w WU triggera nie da się opłacić — karta tam nie należy');
  assert.ok(brg.includes('Horizon Spellbomb'), 'Horizon Spellbomb ({G}) — ta sama klasa');
  assert.ok(!wu.includes('Horizon Spellbomb'));
});

// ─── H ───────────────────────────────────────────────────────────────────────

test('H: opłacony kicker jest widoczny w opisie rzutu', () => {
  assert.equal(paidExtraCostSuffix({ kicked: true }), ' — kicker opłacony');
  assert.equal(paidExtraCostSuffix({ kicked: false }), '', 'bez kickera — bez dopisku');
  assert.equal(paidExtraCostSuffix({}), '');
});

test('H: offspring to ta sama klasa dodatkowego kosztu; oba naraz się łączą', () => {
  assert.equal(paidExtraCostSuffix({ offspring: true }), ' — offspring opłacony');
  assert.equal(paidExtraCostSuffix({ kicked: true, offspring: true }),
    ' — kicker opłacony, offspring opłacony');
});

test('H: obie ścieżki rzutu (permanent i czar) używają jednego brzmienia', () => {
  const src = readFileSync(new URL('../src/table/session.js', import.meta.url), 'utf8');
  const uses = src.split('paidExtraCostSuffix(e)').length - 1;
  assert.ok(uses >= 2, `oba case'y rzutu muszą wołać helper (znaleziono ${uses})`);
});

// ─── I ───────────────────────────────────────────────────────────────────────

test('I: 2/1 first strike NIE ginie od dwóch 1/1 — one giną, zanim zadadzą cios (CR 702.7b)', () => {
  // Porcelain Legionnaire w wersji minimalnej: atakujący bije pierwszy i zabija
  // oba blokery w kroku first strike, więc ich moc nigdy nie dochodzi.
  const attacker = creature('a', 2, 1, ['first_strike']);
  const r = blockExchangeOf(attacker, [creature('b1', 1, 1), creature('b2', 1, 1)]);
  assert.equal(r.attackerDies, false, 'suma mocy 2 >= 1, ale ci blokerzy już nie żyją');
  assert.ok(r.wastedBlockers >= 1, 'drugi bloker ginie za nic — atak i tak jest zablokowany');
});

test('I: bez first strike ci sami dwaj blokerzy ZABIJAJĄ atakującego (kontrola)', () => {
  const r = blockExchangeOf(creature('a', 2, 1), [creature('b1', 1, 1), creature('b2', 1, 1)]);
  assert.equal(r.attackerDies, true, 'równoczesne obrażenia — multi-block kill działa jak dotąd');
});

test('I: atakujący z trample nie ma „zbędnych” blokerów (CR 702.19b)', () => {
  const r = blockExchangeOf(creature('a', 5, 5, ['first_strike', 'trample']),
    [creature('b1', 1, 1), creature('b2', 1, 1)]);
  assert.equal(r.wastedBlockers, 0, 'przy trample dodatkowe ciało wchłania nadwyżkę obrażeń');
});

test('I: blok first strikera pojedynczym ciałem nie jest marnotrawstwem', () => {
  const r = blockExchangeOf(creature('a', 2, 1, ['first_strike']), [creature('b1', 1, 1)]);
  assert.equal(r.wastedBlockers, 0, 'jedno ciało zatrzymuje obrażenia — to jest sens bloku');
});

test('I: deathtouch bije first strikera tylko wtedy, gdy dożyje swojego kroku', () => {
  // 1/1 deathtouch vs 2/1 first strike: ginie w pierwszym kroku, nie zabija.
  const martwy = blockExchangeOf(creature('a', 2, 1, ['first_strike']),
    [creature('b', 1, 1, ['deathtouch'])]);
  assert.equal(martwy.attackerDies, false);
  // 1/3 deathtouch przeżywa 2 obrażenia i zabija (CR 702.2b).
  const zyje = blockExchangeOf(creature('a', 2, 1, ['first_strike']),
    [creature('b', 1, 3, ['deathtouch'])]);
  assert.equal(zyje.attackerDies, true);
});

test('I: bloker z first strike po naszej stronie zabija atakującego BEZ strat', () => {
  const r = blockExchangeOf(creature('a', 3, 2), [creature('b', 2, 2, ['first_strike'])]);
  assert.equal(r.attackerDies, true);
  assert.equal(r.blockerValueLost, 0, 'atakujący padł, zanim zadał obrażenia (CR 702.7b)');
});

// ─── J ───────────────────────────────────────────────────────────────────────

test('J: trucizna jest drugim zegarem przegranej w ocenie obrony', () => {
  const src = readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  // Garda musi być liczona także w walucie liczników (CR 704.5c), nie tylko życia.
  assert.ok(src.includes('enemyInfectCrackbackPower'),
    'model gardy musi znać kontratak infect');
  assert.ok(/poisonHeadroom/.test(src), 'zapas do dziesięciu liczników musi być policzony');
  assert.ok(/infectThreat/.test(src),
    'lethalThreat przy blokowaniu musi uwzględniać atak infect');
});
