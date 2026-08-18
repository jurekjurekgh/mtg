// =============================================================================
// M138 — trzy nowe detektory Żywego Testera.
//
// POWÓD: 22 partie audytu dały ZERO nowych zgłoszeń detektorów, a ręczne
// czytanie transkryptu — dziesięć znalezisk. To nie znaczy, że detektory są
// złe; znaczy, że nie miały reguł dla tych klas (L27). Trzy z dziesięciu
// klas są wykrywalne mechanicznie i dostają tu pokrycie.
//
// Reguła M99/M104: detektor opiera się na FAKTACH (dane strukturalne albo
// treść logu obecna w obu trybach), nie na tym, ile sterownik wypisał.
// Dlatego każdy test sprawdza też wariant „ogon logu sklejony ⏎” — tak
// wygląda linia LOG: w snapshocie.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectBotBuffsMyCreatures,
  detectFalseNoEffect,
  detectTruncatedCardText,
  runDetectors,
} from '../tools/table-tester/detectors.mjs';

// --- Z1: bot wzmacnia moje stwory -----------------------------------------

test('M138/detektor Z1: łapie bota dającego keyword MOJEMU stworowi', () => {
  const lines = [
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Soulbright Flamekin — nadanie słów kluczowych do końca tury → cel: Giant Spider',
    '  [ROZGRYWKA]   • Giant Spider zyskuje: zadeptywanie',
  ];
  const found = detectBotBuffsMyCreatures(lines, new Set(['Giant Spider']));
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'bot');
  assert.match(found[0].message, /Giant Spider/);
});

test('M138/detektor Z1: NIE zgłasza buffa na własnym stworze bota', () => {
  const lines = [
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Soulbright Flamekin — nadanie słów kluczowych → cel: Goblin Piker',
    '  [ROZGRYWKA]   • Goblin Piker zyskuje: zadeptywanie',
  ];
  // Goblin Piker NIE jest na moim bitwisku — to poprawny ruch bota.
  assert.deepEqual(detectBotBuffsMyCreatures(lines, new Set(['Giant Spider'])), []);
});

test('M138/detektor Z1: NIE zgłasza efektu SZKODLIWEGO w mój permanent (to poprawna gra)', () => {
  const lines = [
    "  [ROZGRYWKA]   • Nieprzyjaciel rzuca Shatter → cel: Great Furnace",
    '  [ROZGRYWKA]   • Great Furnace zostaje zniszczony',
  ];
  assert.deepEqual(detectBotBuffsMyCreatures(lines, new Set(['Great Furnace'])), [],
    'usuwanie moich permanentów to sens gry, nie błąd — detektor nie może hałasować');
});

// --- Z4: fałszywe „nic się nie wydarzyło” ---------------------------------

test('M138/detektor Z4: łapie „zerowy wynik” obok widocznego skutku', () => {
  const lines = [
    '  [ROZGRYWKA]   • Voice of the Vermin — trigger bez efektu (nic się nie wydarzyło (zerowy wynik))',
    '  [ROZGRYWKA]   • Giant Spider dostaje +2 liczniki',
  ];
  const found = detectFalseNoEffect(lines);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'rules');
});

test('M138/detektor Z4: działa też na SKLEJONYM ogonie logu (linia LOG: z ⏎)', () => {
  // Ten kształt dał realny transkrypt — bez rozwijania ⏎ detektor milczał.
  const lines = [
    '  LOG: Giant Spider zadaje 3 obrażenia (Nieprzyjaciel) ⏎ Voice of the Vermin — trigger bez efektu (nic się nie wydarzyło (zerowy wynik)) ⏎ Servant of the Scale dostaje +1 licznik +1/+1 (razem 1)',
  ];
  assert.equal(detectFalseNoEffect(lines).length, 1,
    'reguła M99: ten sam fakt musi być widoczny w obu kształtach logu');
});

test('M138/detektor Z4: NIE zgłasza uczciwego „brak legalnych celów”', () => {
  const lines = [
    '  [ROZGRYWKA]   • Academy Journeymage — trigger bez efektu (brak legalnych celów)',
    '  [ROZGRYWKA]   • Tura 5 — Ty',
  ];
  assert.deepEqual(detectFalseNoEffect(lines), [],
    'trigger bez celów naprawdę nic nie robi — to poprawny komunikat');
});

// --- Z2/Z3/Z5/Z9/Z10: urwany opis karty -----------------------------------

test('M138/detektor Z5: łapie cel bez parametru („o sile ≥” bez liczby)', () => {
  const lines = ['  RĘKA: Selesnya Charm · 2 · Instant · Wygnanie: wygnij artefakt · cel: stwór o sile ≥ | Plains'];
  const found = detectTruncatedCardText(lines);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'ui');
});

test('M138/detektor Z9: łapie aurę bez ŻADNEJ treści reguł', () => {
  const lines = ['  RĘKA: Grounded · 2 · Enchantment — Aura | Forest · Basic Land — Forest'];
  const found = detectTruncatedCardText(lines);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /Grounded/);
});

test('M138/detektor Z3: łapie warunek jako JEDYNĄ treść, ale nie warunek ze skutkiem', () => {
  const lone = ['  MOJE POLA: Ainok Artillerist · 3 · Creature — Dog Archer · gdy ma licznik +1/+1 · 4/1'];
  assert.equal(detectTruncatedCardText(lone).length, 1, 'sam warunek bez skutku = opis urwany');

  const fixed = ['  MOJE POLA: Ainok Artillerist · 3 · Creature — Dog Archer · Zasięg · gdy ma licznik +1/+1 · 4/1'];
  assert.deepEqual(detectTruncatedCardText(fixed), [],
    'po naprawie „Zasięg · gdy ma licznik +1/+1” to pełne zdanie — detektor musi zamilknąć');
});

test('M138/detektor Z5: NIE hałasuje na poprawnych opisach', () => {
  const lines = [
    '  RĘKA: Sterling Keykeeper · 2 · Creature — Human Mercenary · {2}, {T}: cel: stwór bez podtypu Mount — tap · 2/2',
    '  RĘKA: Entrancing Lyre · 3 · Artifact · {X}, {T}: cel: stwór o sile ≤ X — tap',
    '  MOJE POLA: Forest · Basic Land — Forest · T: dodaj 1 manę ×4',
  ];
  assert.deepEqual(detectTruncatedCardText(lines), []);
});

// --- integracja -----------------------------------------------------------

test('M138: runDetectors uruchamia nowe detektory i przyjmuje myPermanentNames', () => {
  const lines = [
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Soulbright Flamekin → cel: Giant Spider',
    '  [ROZGRYWKA]   • Giant Spider zyskuje: zadeptywanie',
    '  RĘKA: Grounded · 2 · Enchantment — Aura',
  ];
  const findings = runDetectors(lines, { myPermanentNames: new Set(['Giant Spider']) });
  const messages = findings.map((f) => f.message).join(' | ');
  assert.match(messages, /wzmacnia TWÓJ permanent/);
  assert.match(messages, /Grounded/);
});

test('M138: runDetectors bez myPermanentNames nie wywala się (zgodność wsteczna)', () => {
  const lines = ['  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: X → cel: Y', '  [ROZGRYWKA]   • Y zyskuje: zadeptywanie'];
  assert.doesNotThrow(() => runDetectors(lines));
});
