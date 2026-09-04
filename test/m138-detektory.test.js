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
  detectBotHarmsOwnPermanent,
  detectFalseNoEffect,
  detectLogNoiseLeak,
  detectTruncatedCardText,
  harmfulCardNames,
  runDetectors,
} from '../tools/table-tester/detectors.mjs';
import { createCardRegistry } from '../src/cards/card-data.js';

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
  // Goblin Piker NIE jest na moim polu bitwy — to poprawny ruch bota.
  assert.deepEqual(detectBotBuffsMyCreatures(lines, new Set(['Giant Spider'])), []);
});

test('M223/detektor Z1: NIE zgłasza removalu, gdy obok przeplata się CUDZA korzyść (Piercing Rays vs Mentor)', () => {
  // Audyt Batch 50 (k1): Piercing Rays (Exile target tapped creature) w mój
  // stwór, a w oknie ±3 linii przeplata się trigger Mentora dający +1/+1
  // INNEMU stworowi bota. Ślepe okno łapało cudzą korzyść i fałszywie
  // oskarżało removal. Korzyść musi dotyczyć TEGO celu (L61).
  const lines = [
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Piercing Rays → cel: Relic Robber',
    '  [ROZGRYWKA]   • Mentor (Boros Challenger): Nieprzyjaciel wybiera swojego atakującego o sile mniejszej niż 2 — dostanie licznik +1/+1',
    '  [ROZGRYWKA]   • Boros Challenger — trigger (atak mentora)',
  ];
  assert.deepEqual(detectBotBuffsMyCreatures(lines, new Set(['Relic Robber'])), [],
    'removal w mój permanent + przeplot cudzej korzyści nie może być fałszywym alarmem');
});

test('M138/detektor Z1: NIE zgłasza efektu SZKODLIWEGO w mój permanent (to poprawna gra)', () => {
  const lines = [
    "  [ROZGRYWKA]   • Nieprzyjaciel rzuca Shatter → cel: Great Furnace",
    '  [ROZGRYWKA]   • Great Furnace zostaje zniszczony',
  ];
  assert.deepEqual(detectBotBuffsMyCreatures(lines, new Set(['Great Furnace'])), [],
    'usuwanie moich permanentów to sens gry, nie błąd — detektor nie może hałasować');
});

test('M229/detektor Z1: NIE zgłasza PRZEJĘCIA KONTROLI jako buffa (Awaken the Sleeper)', () => {
  // Audyt nowych talii (warhammer-ubr vs mirrodin-brg, seed 23): bot rzuca
  // Awaken the Sleeper na Hill Giant gracza — PRZEJMUJE kontrolę (kradzież,
  // poprawna gra), przejęty stwór dostaje haste („zyskuje: pośpiech" → BENEFIT).
  // Karta jest w harmfulNames (gain_control_until_end_of_turn), więc detektor
  // milczy. Log-level-independent: nazwa karty jest wprost we wpisie rzutu.
  const lines = [
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Awaken the Sleeper → cel: Hill Giant',
    '  [ROZGRYWKA]   • Hill Giant zyskuje: pośpiech',
  ];
  // BEZ harmfulNames: detektor (słusznie z jego perspektywy) widziałby buff.
  assert.equal(detectBotBuffsMyCreatures(lines, new Set(['Hill Giant'])).length, 1,
    'bez klasyfikacji karty „zyskuje: pośpiech" wygląda jak buff — to dowód, że test mierzy właściwą ścieżkę');
  // Z harmfulNames (rejestr klasyfikuje Awaken jako wrogą) — cisza.
  assert.deepEqual(
    detectBotBuffsMyCreatures(lines, new Set(['Hill Giant']), new Set(), new Set(['Awaken the Sleeper'])),
    [],
    'przejęcie kontroli to poprawna gra przeciw graczowi, nie buff — detektor milczy');
});

test('M229: harmfulCardNames klasyfikuje przejęcie kontroli jako wrogie', () => {
  const registry = createCardRegistry();
  const names = harmfulCardNames(registry);
  assert.ok(names.has('Awaken the Sleeper'),
    'gain_control_until_end_of_turn = efekt szkodliwy dla celu (utrata stwora)');
});

// --- Z4: fałszywe „nic się nie wydarzyło” ---------------------------------

test('M138/detektor Z4: łapie „zerowy wynik” obok widocznego skutku TEGO SAMEGO źródła', () => {
  // Prawdziwy L24 (naprawiony w M138): cichy skutek mutował stan BEZ zdarzenia,
  // więc log mówił „zerowy wynik", a efekt (np. set_base_pt na źródle) zadziałał.
  // Dowód musi dotyczyć TEGO SAMEGO źródła — inaczej to inny trigger w oknie.
  const lines = [
    '  [ROZGRYWKA]   • Voice of the Vermin — trigger bez efektu (nic się nie wydarzyło (zerowy wynik))',
    '  [ROZGRYWKA]   • Voice of the Vermin dostaje +2 liczniki',
  ];
  const found = detectFalseNoEffect(lines);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'rules');
});

test('M138/detektor Z4: działa też na SKLEJONYM ogonie logu (linia LOG: z ⏎)', () => {
  // Ten kształt dał realny transkrypt — bez rozwijania ⏎ detektor milczał.
  const lines = [
    '  LOG: Voice of the Vermin — trigger bez efektu (nic się nie wydarzyło (zerowy wynik)) ⏎ Voice of the Vermin dostaje +2 liczniki',
  ];
  assert.equal(detectFalseNoEffect(lines).length, 1,
    'reguła M99: ten sam fakt musi być widoczny w obu kształtach logu');
});

// M151 (audyt żywym testerem): detektor mieszał DWA niezależne triggery
// w jednym oknie (Veiled Ascension “zerowy wynik" + osobny pump Akrasan
// Squire w tym samym kroku) i zgłaszał fałszywy alarm. Skutek jest
// oddzielony innymi zdarzeniami — to NIE jest ten sam trigger.
// M155 (audyt żywym testerem, Steelfin Whale): „zerowy wynik" jednego triggera
// (odkręcenie i tak odkręconego) obok skutku INNEGO triggera (token Germ z
// living weapon Strandwalkera) w sąsiedztwie to FAŁSZYWY ALARM — nie flagujemy.
test('M138/detektor Z4 (M155): NIE zgłasza skutku INNEGO źródła w sąsiedztwie (Steelfin + Germ)', () => {
  const lines = [
    '  [ROZGRYWKA]   • Steelfin Whale — trigger bez efektu (nic się nie wydarzyło (zerowy wynik))',
    '  [ROZGRYWKA]   • Nieprzyjaciel tworzy token Germ (0/0)',
  ];
  assert.deepEqual(detectFalseNoEffect(lines), [],
    'Germ (0/0) to skutek Strandwalkera, nie Steelfin Whale — nie flagujemy');
});

test('M138/detektor Z4 (M151): NIE zgłasza, gdy skutek należy do INNEGO triggera w tym samym oknie', () => {
  const lines = [
    '  [ROZGRYWKA]   • Veiled Ascension — trigger bez efektu (nic się nie wydarzyło (zerowy wynik))',
    '  [ROZGRYWKA]   • Veiled Ascension zostaje rozstrzygnięty',
    '  [ROZGRYWKA]   • Tura 7 — Nieprzyjaciel',
    '  LOG: Wedgelight Rammer dostaje +1/+1 ⏎ Akrasan Squire — trigger (samotny atak)',
  ];
  assert.deepEqual(detectFalseNoEffect(lines), [],
    'skutek nie jest następnym wpisem po “zerowy wynik" — to inny trigger (M151)');
});

test('M138/detektor Z4: NIE zgłasza uczciwego „brak legalnych celów”', () => {
  const lines = [
    '  [ROZGRYWKA]   • Academy Journeymage — trigger bez efektu (brak legalnych celów)',
    '  [ROZGRYWKA]   • Tura 5 — Ty',
  ];
  assert.deepEqual(detectFalseNoEffect(lines), [],
    'trigger bez celów naprawdę nic nie robi — to poprawny komunikat');
});

// --- M151: przeciek szumu do logu gracza ----------------------------------
test('M151/detektor: zgłasza „przygotowuje manę" w logu gracza (szum ma być wyciszony)', () => {
  const lines = [
    '  LOG: Nieprzyjaciel przygotowuje manę (Swamp) ⏎ Nieprzyjaciel przygotowuje manę (Forest) ⏎ Nieprzyjaciel zagrywa Swamp',
  ];
  const found = detectLogNoiseLeak(lines);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'info');
});

test('M151/detektor: zgłasza przejście fazy „— faza/krok —" w logu gracza', () => {
  const lines = [
    '  LOG: — beginning/upkeep — ⏎ Nieprzyjaciel zagrywa Swamp',
    '  LOG: — combat/declare_attackers —',
  ];
  const found = detectLogNoiseLeak(lines);
  assert.equal(found.length, 2);
});

test('M151/detektor: NIE hałasuje na czystym logu (bez szumu)', () => {
  const lines = [
    '  LOG: Nieprzyjaciel zagrywa Swamp ⏎ Nieprzyjaciel rzuca Tumbleweed Rising',
  ];
  assert.deepEqual(detectLogNoiseLeak(lines), []);
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

// --- M212/Z7c: szkodliwy efekt bota we własny permanent --------------------
//
// POWÓD: audyt trzech partii po naprawie rebounda dał ZERO zgłoszeń, choć
// transkrypt zawierał wzorcowy błąd („Nieprzyjaciel rzuca Ojutai\'s Breath
// → cel: Trade Route Envoy”, czyli w swojego stwora). Istniejący
// `detectBotSelfHarmOnOwnPermanents` czyta snapshoty „POLA WROGA:”, a pod
// `--quiet` w całym transkrypcie był ich DWA — detektor nie znał stanu stołu
// w chwili akcji i milczał. Nowy wariant bierze dane strukturalne.

test('M212/Z7c: łapie szkodliwy czar bota skierowany we własny permanent', () => {
  const lines = [
    "  [ROZGRYWKA]   • Nieprzyjaciel rzuca Ojutai's Breath → cel: Trade Route Envoy",
  ];
  const found = detectBotHarmsOwnPermanent(
    lines,
    new Set(['Trade Route Envoy']),   // pola bota
    new Set(['Academy Journeymage']), // moje pola
    new Set(["Ojutai's Breath"]),     // karty szkodliwe wg rejestru
  );
  assert.equal(found.length, 1, 'bot tapuje własnego stwora — detektor musi zgłosić');
  assert.match(found[0].message, /we WŁASNY permanent: Trade Route Envoy/);
});

test('M212/Z7c: milczy, gdy cel stoi po MOJEJ stronie (poprawne usuwanie)', () => {
  const lines = [
    "  [ROZGRYWKA]   • Nieprzyjaciel rzuca Ojutai's Breath → cel: Academy Journeymage",
  ];
  const found = detectBotHarmsOwnPermanent(
    lines,
    new Set(['Trade Route Envoy']),
    new Set(['Academy Journeymage']),
    new Set(["Ojutai's Breath"]),
  );
  assert.deepEqual(found, [], 'celowanie w permanent przeciwnika to poprawna gra');
});

test('M212/Z7c: milczy przy nazwie widocznej po OBU stronach stołu', () => {
  const lines = [
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Shock → cel: Llanowar Elves',
  ];
  const found = detectBotHarmsOwnPermanent(
    lines,
    new Set(['Llanowar Elves']),
    new Set(['Llanowar Elves']),
    new Set(['Shock']),
  );
  assert.deepEqual(found, [], 'nie da się rozstrzygnąć czyj egzemplarz — cisza zamiast zgadywania');
});

test('M212/Z7c: runDetektory podpina nowy detektor', () => {
  const lines = [
    "  [ROZGRYWKA]   • Nieprzyjaciel rzuca Ojutai's Breath → cel: Trade Route Envoy",
  ];
  const findings = runDetectors(lines, {
    enemyPermanentNames: new Set(['Trade Route Envoy']),
    myPermanentNames: new Set(['Academy Journeymage']),
    harmfulNames: new Set(["Ojutai's Breath"]),
  });
  assert.match(findings.map((f) => f.message).join(' | '), /we WŁASNY permanent/);
});
