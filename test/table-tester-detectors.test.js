// M97 — detektory Żywego Testera: automatyczny przesiew transkryptu.
//
// Reguła z docs/setup/TESTER_STOLU.md („tester też się naprawia", lekcja L12):
// narzędzie audytowe jest produktem i ma testy jak produkcja. Detektory są
// czystymi funkcjami (bez jsdom), więc testujemy je bezpośrednio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRawText, detectBotRepeats, detectBotSelfTargeting,
  detectEmptyBotMoveModal, detectMissingIgnoreTick, detectRuleSmells,
  detectDeadEndWindow, detectNoResponseWindow, detectGroupWithoutTick,
  detectNoEffectOffers,
  runDetectors, formatFindings,
} from '../tools/table-tester/detectors.mjs';

test('detectRawText: łapie surowe nazwy stref w tekście dla gracza', () => {
  const found = detectRawText([
    '  [ROZGRYWKA]   • Nieprzyjaciel: Segmented Krotiq — library → hand',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'info');
  assert.match(found[0].message, /strefy/i);
});

test('detectRawText: łapie surowy identyfikator zdarzenia (snake_case)', () => {
  const found = detectRawText(['  LOG: proliferate_target_resolved']);
  assert.ok(found.some((f) => /identyfikator/i.test(f.message)));
});

test('detectRawText: nie zgłasza poprawnego polskiego tekstu', () => {
  const found = detectRawText([
    '  [ROZGRYWKA]   • Nieprzyjaciel: Krotiq — biblioteka → ręka',
    '  LOG: Kappa Tech-Wrecker zadaje 5 obrażeń (Ty)',
  ]);
  assert.deepEqual(found, [], `fałszywe alarmy: ${JSON.stringify(found)}`);
});

test('detectRawText: łapie placeholder „?" i undefined', () => {
  const found = detectRawText([
    '  LOG: Czar → cel: ?',
    '  AKCJE: Rzuć: undefined',
  ]);
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.category === 'ui'));
});

test('detectRawText: „(brak)"/„(pusty)" to nie placeholdery', () => {
  const found = detectRawText([
    '  AKCJE: (brak)',
    '  RĘKA: (pusta)',
    '  MOJE POLA: (puste)',
  ]);
  assert.deepEqual(found, []);
});

test('detectBotRepeats: zgłasza powtórzoną akcję bota w jednej turze', () => {
  const lines = [
    '  [ROZGRYWKA]   • Tura 14 — Nieprzyjaciel',
    ...Array.from({ length: 5 }, () => "  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Shiv's Embrace"),
  ];
  const found = detectBotRepeats(lines);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'bot');
  assert.match(found[0].message, /5×/);
});

test('detectBotRepeats: licznik zeruje się między turami', () => {
  const lines = [
    '  [ROZGRYWKA]   • Tura 1 — Nieprzyjaciel',
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: X',
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: X',
    '  [ROZGRYWKA]   • Tura 2 — Nieprzyjaciel',
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: X',
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: X',
  ];
  assert.deepEqual(detectBotRepeats(lines), [], 'po 2 aktywacje na turę to nie patologia');
});

test('detectBotSelfTargeting: łapie bota celującego SZKODLIWYM efektem w siebie', () => {
  const found = detectBotSelfTargeting([
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Cellar Door → cel: Nieprzyjaciel — mieli 1 kartę',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'bot');
});

test('detectBotSelfTargeting: korzystny efekt na siebie to NIE błąd (Inspiration)', () => {
  // M97: „Target player draws two cards" na siebie jest optymalne — detektor
  // zgłaszał to jako patologię (fałszywy alarm).
  const found = detectBotSelfTargeting([
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Inspiration → cel: Nieprzyjaciel — dobierz 2 karty',
  ]);
  assert.deepEqual(found, []);
});

test('detectBotSelfTargeting: celowanie w gracza jest poprawne', () => {
  const found = detectBotSelfTargeting([
    '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Cellar Door → cel: Ty',
  ]);
  assert.deepEqual(found, []);
});

test('detectEmptyBotMoveModal: modal z samą nazwą FAZY to zgłoszenie', () => {
  const found = detectEmptyBotMoveModal([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Faza: Główna 1',
    '',
  ]);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /fazy/i);
});

test('M98: modal z nagłówkiem TURY to NIE błąd (korekta właściciela)', () => {
  // Właściciel: „Początek każdej tury to bardzo istotna informacja — chcę ją
  // widzieć, nawet jeśli nic innego się nie dzieje."
  const found = detectEmptyBotMoveModal([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Tura 9 — Ty',
    '',
  ]);
  assert.deepEqual(found, [], 'nagłówek tury niesie istotną informację');
});

test('M98: modal „faza + tura" też jest w porządku (jest w nim tura)', () => {
  const found = detectEmptyBotMoveModal([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Faza: Główna 1',
    '  [ROZGRYWKA]   • Tura 9 — Ty',
    '',
  ]);
  assert.deepEqual(found, []);
});

test('detectEmptyBotMoveModal: modal z realnym zagraniem nie jest zgłaszany', () => {
  const found = detectEmptyBotMoveModal([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Faza: Główna 1',
    '  [ROZGRYWKA]   • Nieprzyjaciel zagrywa Forest',
    '',
  ]);
  assert.deepEqual(found, []);
});

test('detectMissingIgnoreTick: akcja wyciszalna bez ptaszka', () => {
  const found = detectMissingIgnoreTick([
    { label: 'Rzuć: Brute Force (koszt R)', hasTick: false },
    { label: 'Cycling: Fiery Fall (koszt 1R)', hasTick: true },
    { label: 'Zagraj ląd: Forest', hasTick: false },
    { label: 'Dalej (pass)', hasTick: false },
  ]);
  assert.equal(found.length, 1, 'tylko „Rzuć:" bez ptaszka jest błędem');
  assert.match(found[0].evidence, /Brute Force/);
});

test('detectRuleSmells: odrzucona komenda gracza to sygnał', () => {
  const found = detectRuleSmells(['  LOG: Ruch odrzucony: not_priority']);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'rules');
});

test('detectRuleSmells: „zadaje 0 obrażeń" nie powinno trafiać do logu', () => {
  const found = detectRuleSmells(['  LOG: Goblin zadaje 0 obrażeń (Ty)']);
  assert.equal(found.length, 1);
});

test('runDetectors: deduplikuje identyczne zgłoszenia i grupuje kategorie', () => {
  const line = '  LOG: Ruch odrzucony: not_priority';
  const findings = runDetectors([line, line, line]);
  assert.equal(findings.length, 1, 'ten sam komunikat + dowód = jedno zgłoszenie');
  const formatted = formatFindings(findings);
  assert.match(formatted[0], /DETEKTORY: 1/);
  assert.ok(formatted.some((l) => /\[rules\]/.test(l)));
});

test('formatFindings: czysty przebieg mówi to wprost', () => {
  assert.match(formatFindings([])[0], /brak zgłoszeń/);
});

// =============================================================================
// M98 — detektory przypadków zgłaszanych dotąd RĘCZNIE z telefonu.
//
// Właściciel (2026-08-14): „Forever Young, okno na instant i ptaszek przy
// Village Rites to nie są błędy UX. Każdy z nich powinien wykrywać tester."
// Wszystkie trzy są w pełni widoczne w DOM, więc narzędzie ma je łapać samo.
// Testy poniżej używają PRAWDZIWYCH fragmentów transkryptów z M90/M91.
// =============================================================================

test('M98/Forever Young: detektor łapie okno z jedyną opcją „Poddaj partię"', () => {
  const found = detectDeadEndWindow([
    '  AKCJE: Poddaj partię',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'ui');
  assert.match(found[0].message, /Poddaj/);
});

test('M98/Forever Young: okno bez żadnej akcji też jest zgłaszane', () => {
  const found = detectDeadEndWindow(['  AKCJE: (brak)']);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /BEZ żadnej akcji/i);
});

test('M98/Forever Young: normalne okno z akcjami nie jest zgłaszane', () => {
  const found = detectDeadEndWindow([
    '  AKCJE: Zagraj ląd: Forest  ||  Rzuć: Brute Force (koszt R)  ||  Dalej (pass)  ||  Poddaj partię',
  ]);
  assert.deepEqual(found, []);
});

test('M98/Forever Young: alarm UI o oknie z samym passem jest przechwytywany', () => {
  const found = detectDeadEndWindow([
    '  AKCJE: Brak akcji — sesja przewija okna z samym passem. To nie powinno się zdarzyć; zgłoś w PR.',
  ]);
  assert.ok(found.some((f) => /samym passem/.test(f.message)));
});

test('M98/Carrion Call: detektor łapie czar bota rozstrzygnięty bez okna na odpowiedź', () => {
  // Dokładny wzorzec z transkryptu M90: bot rzuca instant i ten sam czar
  // rozstrzyga się w tym samym bloku ruchu — gracz nigdy nie dostał priorytetu.
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Carrion Call',
    '  [ROZGRYWKA]   • Carrion Call zostaje rozstrzygnięty',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'info');
  assert.match(found[0].message, /Carrion Call/);
});

test('M98/Carrion Call: gdy gracz DOSTAŁ okno (stos niepusty), brak zgłoszenia', () => {
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Carrion Call',
    '  STOS: Carrion Call (rzuca: Nieprzyjaciel)',
    '  [ROZGRYWKA]   • Carrion Call zostaje rozstrzygnięty',
  ]);
  assert.deepEqual(found, [], 'okno na odpowiedź było — to poprawny przebieg');
});

test('M98/Village Rites: detektor łapie grupę wariantów bez ptaszka', () => {
  const found = detectGroupWithoutTick([
    { label: 'Cel czaru: Bone Splinters (3 opcje)', hasTick: false },
    { label: 'Cel czaru: Inspiration (2 opcje)', hasTick: true },
  ]);
  assert.equal(found.length, 1);
  assert.match(found[0].evidence, /Bone Splinters/);
});

test('M98/Village Rites: obowiązkowe decyzje (scry, mulligan) nie wymagają ptaszka', () => {
  const found = detectGroupWithoutTick([
    { label: 'Wybierz: Scry — co odłożyć na spód? (2 opcje)', hasTick: false },
    { label: 'Wybierz: Mulligan (2 opcje)', hasTick: false },
    { label: 'Wybierz: Karta do odrzucenia (8 opcji)', hasTick: false },
  ]);
  assert.deepEqual(found, [], 'decyzji resolve_* nie wycisza się — brak ptaszka jest poprawny');
});

test('M98: runDetectors uruchamia także nowe detektory', () => {
  const findings = runDetectors(
    ['  AKCJE: Poddaj partię'],
    { actionRecords: [{ label: 'Cel czaru: Village Rites (2 opcje)', hasTick: false }] },
  );
  assert.ok(findings.some((f) => /Poddaj/.test(f.message)), 'martwe okno');
  assert.ok(findings.some((f) => /Grupa wariantów/.test(f.message)), 'grupa bez ptaszka');
});

test('M98/Forever Young: pusty panel PO KOŃCU partii to nie martwe okno', () => {
  // Fałszywy alarm wykryty przy weryfikacji regresyjnej: po zakończeniu gry
  // panel akcji jest pusty i tak ma być.
  const found = detectDeadEndWindow([
    '== KONIEC PARTII == Koniec partii — wygrywa On',
    '--- krok 64 | Koniec partii — wygrywa On ---',
    '  AKCJE: (brak)',
  ]);
  assert.deepEqual(found, []);
});

test('M98/Forever Young: martwe okno W TRAKCIE partii nadal jest zgłaszane', () => {
  const found = detectDeadEndWindow([
    '--- krok 12 | T. 5 Ty | Główna 1 ---',
    '  AKCJE: Poddaj partię',
  ]);
  assert.equal(found.length, 1);
});

// --- M99: weryfikacja mutacyjna wykryła FAŁSZYWY ALARM detektora ------------
// Uruchomienie `black vs spellslinger --policy-seed 32 --seed 732` z `--quiet`
// dało zgłoszenie „Czar bota »Index« rzucony i rozstrzygnięty bez okna na
// odpowiedź gracza". To samo uruchomienie z `--snapshot-every 1` dało 0 —
// bo jedynym dowodem „okno BYŁO" była linia `STOS:` ze snapshotu, a `--quiet`
// snapshoty wyłącza. Detektor zależał od poziomu logowania, nie od faktów.
//
// Dowodem odzyskania priorytetu, który jest ZAWSZE w transkrypcie, jest
// granica bloków modala „Rozgrywka": bot pauzuje, gracz zamyka modal
// i wykonuje krok. Rzeczywisty brak okna (Carrion Call) rozgrywa się w JEDNYM
// bloku modala — więc detektor zachowuje moc wykrywania.

test('M99: przerwa między blokami modala ruchu bota = okno na odpowiedź BYŁO', () => {
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Index',
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Index zostaje rozstrzygnięty',
  ]);
  assert.deepEqual(found, [], `fałszywy alarm (tryb --quiet): ${JSON.stringify(found)}`);
});

test('M99: akcja gracza między rzuceniem a rozstrzygnięciem = okno BYŁO', () => {
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Index',
    '  >> Wznów grę bota',
    '  [ROZGRYWKA]   • Index zostaje rozstrzygnięty',
  ]);
  assert.deepEqual(found, [], `fałszywy alarm: ${JSON.stringify(found)}`);
});

test('M99: prawdziwy brak okna (jeden blok modala) nadal jest zgłaszany', () => {
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Carrion Call',
    '  [ROZGRYWKA]   • Carrion Call zostaje rozstrzygnięty',
    '  [ROZGRYWKA]   • token Insect wchodzi na bitwisko',
  ]);
  assert.equal(found.length, 1, 'detektor nie może stracić mocy przez naprawę fałszywego alarmu');
  assert.match(found[0].message, /Carrion Call/);
});

// --- M99: detektor martwego okna też zależał od poziomu logowania ----------
// `detectDeadEndWindow` czytał WYŁĄCZNIE linie `AKCJE:` ze snapshotów, a te
// pod `--quiet` (tryb używany w skanach wieloseedowych) w ogóle nie powstają:
// w 300-krokowym przebiegu detektor oglądał JEDNO okno zamiast wszystkich.
// Przypadek właściciela (Forever Young — ekran z samym „Poddaj partię")
// mógł więc przejść niezauważony.
//
// Fix u root cause: sterownik rejestruje panel akcji w KAŻDYM kroku
// (`windowRecords`), niezależnie od snapshotów, a detektor przyjmuje te dane
// strukturalnie. Parsowanie linii zostaje dla transkryptów z archiwum.

test('M99: detektor martwego okna działa na danych strukturalnych (bez snapshotów)', () => {
  const found = detectDeadEndWindow([], {
    windowRecords: [
      { actions: ['Zagraj ląd: Forest', 'Dalej (pass)', 'Poddaj partię'], gameOver: false },
      { actions: ['Poddaj partię'], gameOver: false },
      { actions: [], gameOver: false },
    ],
  });
  assert.equal(found.length, 2, JSON.stringify(found));
  assert.ok(found.some((f) => /nie ma wyjścia/.test(f.message)));
  assert.ok(found.some((f) => /martwe okno/.test(f.message)));
});

test('M99: puste okna PO końcu partii nadal nie są zgłaszane', () => {
  const found = detectDeadEndWindow([], {
    windowRecords: [{ actions: [], gameOver: true }, { actions: ['Poddaj partię'], gameOver: true }],
  });
  assert.deepEqual(found, [], 'panel po końcu partii jest pusty prawidłowo');
});

test('M99: stary tryb (parsowanie linii AKCJE:) nadal działa — zgodność wstecz', () => {
  const found = detectDeadEndWindow(['  AKCJE: Poddaj partię']);
  assert.equal(found.length, 1);
});

// --- M99: profil `impatient` a detektor odrzuceń ---------------------------
// Profil `impatient` celowo klika dwa razy (double-tap z telefonu), więc
// odrzucenie drugiej komendy jest OCZEKIWANYM elementem scenariusza, a nie
// znaleziskiem. Zgłaszanie go zawyżałoby statystyki — a właściciel wymaga
// uczciwego raportowania. Sprawdzana jest KONSEKWENCJA odrzucenia (czy gracz
// nie został z samym „Poddaj partię"), którą łapie detektor martwego okna.
test('M99: odrzucenie po double-tapie (profil impatient) nie jest zgłaszane', () => {
  const lines = ['  LOG: Ruch odrzucony: wrong_timing'];
  assert.equal(detectRuleSmells(lines).length, 1, 'domyślnie odrzucenie to sygnał');
  assert.deepEqual(
    detectRuleSmells(lines, { profile: 'impatient' }), [],
    'w scenariuszu double-tap odrzucenie jest zamierzone',
  );
});

// =============================================================================
// M103 (L15) — detektor OFERT BEZ SKUTKU (kategoria `noop`)
//
// Wejście: rekordy sondy (window.__mtgDebug) zbierane przez sterownik przy
// kliknięciach panelu akcji. Rekord: { label, applied, probe } — sonda
// wykonuje komendę na klonie stanu z pasywnym przeciwnikiem, więc detektor
// klasyfikuje czysto, bez czytania transkryptu. Wzorzec z M102 U8/U9/U10.
// =============================================================================

const probeOf = (partial) => ({
  ok: true, changed: true, effectDiffs: [], ownLandTaps: 0, ownOtherTaps: 0,
  opponentTaps: 0, ownUntaps: 0, opponentUntaps: 0, humanLifeDelta: 0,
  fizzle: false, costSignature: {}, steps: 4, ...partial,
});

test('noop: kliknięcie bez ZADNEJ zmiany stanu (U9 z pulą many) jest zgłaszane', () => {
  const found = detectNoEffectOffers([{
    label: 'Wyposaż: Greatsword of Tyr → Rycerz',
    applied: true,
    probe: probeOf({ changed: false, costSignature: { mana: true } }),
  }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'noop');
  assert.match(found[0].message, /nie zmienia stanu/i);
  assert.match(found[0].evidence, /Greatsword of Tyr/);
});

test('noop: jedyna zmiana to zapłacony koszt (tap landów, U9) jest zgłaszany', () => {
  const found = detectNoEffectOffers([{
    label: 'Wyposaż: Cloak of the Bat → Nosiciel',
    applied: true,
    probe: probeOf({ changed: true, ownLandTaps: 1, costSignature: { mana: true } }),
  }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'noop');
  assert.match(found[0].message, /koszt/i);
});

test('noop: koszt {T} bez żadnego skutku jest zgłaszany', () => {
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Przeklęty artefakt (koszt T)',
    applied: true,
    probe: probeOf({ changed: true, ownOtherTaps: 1, costSignature: { tap: true } }),
  }]);
  assert.equal(found.length, 1);
});

test('noop: fizzle przy pasywnym przeciwniku (U8) jest zgłaszany jako pewna strata', () => {
  const found = detectNoEffectOffers([{
    label: 'Rzuć: Bone Splinters → cel: Midnight Guard',
    applied: true,
    probe: probeOf({
      changed: true,
      effectDiffs: ['zones.graveyard', 'objects.guard.zone'],
      ownLandTaps: 1,
      fizzle: true,
      costSignature: { mana: true },
    }),
  }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'noop');
  assert.match(found[0].message, /fizzl/i);
});

test('noop: zdolność many (tap dorka) NIE jest zgłaszana — mana to efekt poza fingerprint', () => {
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Llanowar Elves (koszt T) — dodaj manę',
    applied: true,
    probe: probeOf({ changed: true, ownOtherTaps: 1, costSignature: { tap: true } }),
  }]);
  assert.equal(found.length, 0);
});

test('noop: tapnięcie stwora PRZECIWNIKA to efekt, nie koszt — nie zgłaszamy', () => {
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: X — tapnij docelowego stwora',
    applied: true,
    probe: probeOf({ changed: true, opponentTaps: 1 }),
  }]);
  assert.equal(found.length, 0);
});

test('noop: untapnięcie własnego stwora to efekt — nie zgłaszamy', () => {
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Y (koszt T) — odtapnij stwora',
    applied: true,
    probe: probeOf({ changed: true, ownOtherTaps: 1, ownUntaps: 1, costSignature: { tap: true } }),
  }]);
  assert.equal(found.length, 0);
});

test('noop: realny efekt (buff, stwór) nie jest zgłaszany', () => {
  const found = detectNoEffectOffers([{
    label: 'Rzuć: Brute Force → cel: Rycerz',
    applied: true,
    probe: probeOf({ changed: true, effectDiffs: ['objects.knight.powerModifier'], ownLandTaps: 1, costSignature: { mana: true } }),
  }]);
  assert.equal(found.length, 0);
});

test('noop: kliknięcie odrzucone przez UI lub bez sondy nie jest zgłaszane', () => {
  const found = detectNoEffectOffers([
    { label: 'Wyposaż: X → Y', applied: false, probe: probeOf({ changed: false }) },
    { label: 'Wyposaż: X → Y', applied: true, probe: { ok: false, reason: 'pass_or_concede' } },
    { label: 'Dalej', applied: true, probe: probeOf({ changed: false }) },
  ]);
  assert.equal(found.length, 0);
});

test('noop: utrata życia jako JEDYNA zmiana (koszt życiem) jest zgłaszana', () => {
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Zła machina — zapłać 2 życia',
    applied: true,
    probe: probeOf({ changed: true, humanLifeDelta: -2, costSignature: { life: true } }),
  }]);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /koszt/i);
});

test('noop: runDetectors włącza nową kategorię do kompletnego przebiegu', () => {
  const found = runDetectors(['  >> Wyposaż: X → Y'], {
    actionRecords: [], windowRecords: null, profile: 'greedy',
    probeRecords: [{
      label: 'Wyposaż: X → Y',
      applied: true,
      probe: probeOf({ changed: false }),
    }],
  });
  assert.ok(found.some((f) => f.category === 'noop'), 'kategoria noop obecna w wyniku');
});

test('M103: grupa „Cel pokoju lochu" (decyzja obowiązkowa) NIE jest zgłaszana jako brak ptaszka', () => {
  // Wybór pokoju lochu to decyzja resolve_* (venture/Undercity) — ptaszek
  // wyciszenia NIE należy się decyzjom obowiązkowym. Detektor dopasowywał
  // sam prefiks „Cel" i produkował fałszywe alarmy (macierz M103: black
  // vs green — 4 zgłoszenia w trzech profilach).
  const found = detectGroupWithoutTick([
    { label: 'Wybierz: Cel pokoju lochu (5 opcji)', hasTick: false },
    { label: 'Wybierz: Cel pokoju lochu (8 opcji)', hasTick: false },
  ]);
  assert.equal(found.length, 0);
});

test('M103: generyczna grupa „Wybierz: Cel" (wariant czaru) nadal jest zgłaszana', () => {
  const found = detectGroupWithoutTick([
    { label: 'Wybierz: Cel (3 opcje)', hasTick: false },
  ]);
  assert.equal(found.length, 1);
});

// =============================================================================
// M104 — sonda `noop` w OPCJACH MODALI
//
// Do M103 sonda mierzyła wyłącznie przyciski panelu „Twoje działania", więc
// widziała pierwszy wariant grupy (klucz `options[0]`). Warianty (cel, tryb,
// wybór karty) zapadają w MODALU — rekordy niosą teraz `source: 'modal'`.
// Bramka fałszywych alarmów: w modalu opcja „nic nie rób" (rezygnuję / nie
// płacę / bez celów) jest LEGALNYM wyborem gracza, nie ofertą bez skutku.
// =============================================================================

test('M104/noop: opcja MODALA bez skutku jest zgłaszana z adnotacją o modalu', () => {
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Rustvine Cultivator → cel: Island',
    source: 'modal',
    applied: true,
    probe: probeOf({ changed: true, ownOtherTaps: 1, costSignature: { tap: true } }),
  }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'noop');
  assert.match(found[0].message, /modal/i, 'zgłoszenie mówi, gdzie gracz widział ofertę');
  assert.match(found[0].evidence, /Rustvine Cultivator/);
});

test('M104/noop: opcja REZYGNACJI w modalu nie jest ofertą bez skutku', () => {
  // „you may", „up to one target", odmowa płatności — brak zmiany stanu jest
  // ZAMIERZONY. Panel takich przycisków nie pokazuje (tam „nic nie rób" = pass).
  const declines = [
    'Szukanie — nie znajduj karty (rezygnuję)',
    'Nie płać (Trigon of Corruption — efekt nie odpali)',
    'Nie kładź stwora (you may)',
    'Proliferate: bez celów (nic nie dostaje liczników)',
    'Springbloom Druid — nie poświęcaj landa (rezygnuję)',
    'Bez bloków',
  ];
  const found = detectNoEffectOffers(declines.map((label) => ({
    label, source: 'modal', applied: true, probe: probeOf({ changed: false }),
  })));
  assert.equal(found.length, 0);
});

test('M104/noop: ta sama etykieta rezygnacji w PANELU nadal jest zgłaszana', () => {
  // Bramka dotyczy wyłącznie modala — w panelu akcja, która nic nie zmienia,
  // pozostaje podejrzana niezależnie od brzmienia etykiety.
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Machina — pomijam efekt',
    source: 'panel',
    applied: true,
    probe: probeOf({ changed: false }),
  }]);
  assert.equal(found.length, 1);
});

test('M104/noop: rekord bez pola source jest traktowany jak panel (wstecznie)', () => {
  const found = detectNoEffectOffers([{
    label: 'Wyposaż: X → Y',
    applied: true,
    probe: probeOf({ changed: false }),
  }]);
  assert.equal(found.length, 1);
  assert.doesNotMatch(found[0].message, /modal/i);
});

test('M104/noop: rekord ze SKANU okna (bez kliknięcia) jest dowodem', () => {
  // Sonda mierzy każdą ofertę widoczną w oknie, nie tylko tę, którą gracz
  // kliknął — inaczej no-op, którego polityka gracza akurat nie wybrała,
  // nigdy nie jest mierzony (weryfikacja mutacyjna M104).
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Rustvine Cultivator — odkręć → cel: Forest',
    source: 'panel',
    scanned: true,
    applied: false,
    probe: probeOf({
      changed: true,
      costSignature: { removeCounter: { name: 'oil', amount: 1 } },
      costCounterPaid: true,
    }),
  }]);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /koszt/i);
});

test('M104/noop: koszt „Remove a counter" nie maskuje no-opa, ale sam licznik musi zejść', () => {
  // Gdy licznika NIE zdjęto (costCounterPaid false), a poza tym nic się nie
  // zmieniło, nie mamy dowodu na zapłacony koszt — brak zgłoszenia.
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: X — odkręć → cel: Forest',
    source: 'panel',
    scanned: true,
    applied: false,
    probe: probeOf({
      changed: true,
      costSignature: { removeCounter: { name: 'oil', amount: 1 } },
      costCounterPaid: false,
    }),
  }]);
  assert.equal(found.length, 0);
});

test('M104/noop: kliknięcie ODRZUCONE przez UI (bez skanu) nadal nie jest dowodem', () => {
  const found = detectNoEffectOffers([{
    label: 'Wyposaż: X → Y', source: 'panel', applied: false, probe: probeOf({ changed: false }),
  }]);
  assert.equal(found.length, 0);
});

// =============================================================================
// M104 (reguła M99) — odrzucenia komend jako dane STRUKTURALNE
//
// Dotąd `detectRuleSmells` czytał je wyłącznie z linii `LOG:` snapshotu, więc
// pod `--quiet` (gdzie snapshotów nie ma) odrzucenia były niewidzialne:
// ten sam przebieg dawał 0 zgłoszeń w quiet i 3 w trybie ze snapshotami.
// =============================================================================

test('M104/rules: odrzucenia z rekordów sterownika są zgłaszane bez linii LOG', () => {
  const found = detectRuleSmells([], {
    profile: 'random',
    rejectionRecords: [{ action: 'Zagraj: Porcelain Legionnaire', reason: 'Ruch odrzucony: illegal_cast:Zagranie poza main phase' }],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'rules');
  assert.match(found[0].evidence, /Porcelain Legionnaire/);
  assert.match(found[0].evidence, /illegal_cast/);
});

test('M104/rules: przy rekordach sterownika linie LOG nie dublują zgłoszeń', () => {
  const found = detectRuleSmells(['  LOG: Ruch odrzucony: not_priority'], {
    profile: 'random',
    rejectionRecords: [{ action: 'Rzuć: X', reason: 'Ruch odrzucony: not_priority' }],
  });
  assert.equal(found.length, 1, 'jedno zgłoszenie na odrzucenie, nie dwa');
});

test('M104/rules: profil impatient nadal nie zgłasza odrzuceń (są zamierzone)', () => {
  const found = detectRuleSmells([], {
    profile: 'impatient',
    rejectionRecords: [{ action: 'Rzuć: X', reason: 'Ruch odrzucony: not_priority' }],
  });
  assert.equal(found.length, 0);
});

test('M104/rules: bez rekordów sterownika parsowanie linii LOG działa jak dotąd', () => {
  const found = detectRuleSmells(['  LOG: Ruch odrzucony: not_priority'], { profile: 'greedy' });
  assert.equal(found.length, 1, 'transkrypty z archiwum nadal są analizowane');
});

test('M104/ui: odrzucenie tuż po ptaszku wyciszenia to obserwacja UX, nie łamanie reguł', () => {
  // Zaznaczenie ptaszka przewija okno (session.recheckAutoPass — feature
  // 2026-08-11), więc kliknięty zaraz potem przycisk jest już nieaktualny.
  const found = detectRuleSmells([], {
    profile: 'random',
    rejectionRecords: [{
      action: 'Zagraj: Porcelain Legionnaire (phyrexian 1× po 2 życia)',
      reason: 'Ruch odrzucony: illegal_cast:Zagranie poza main phase',
      afterTick: true,
    }],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'ui', 'kategoria UX, nie rules');
  assert.match(found[0].message, /ptaszku wyciszenia/);
});
