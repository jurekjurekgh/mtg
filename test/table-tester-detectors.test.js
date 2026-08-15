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
  runDetectors, formatFindings,
} from '../tools/table-tester/detectors.mjs';

test('detectRawText: łapie surowe nazwy stref w tekście dla gracza', () => {
  const found = detectRawText([
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel: Segmented Krotiq — library → hand',
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
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel: Krotiq — biblioteka → ręka',
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
    '  [RUCH PRZECIWNIKA]   • Tura 14 — Nieprzyjaciel',
    ...Array.from({ length: 5 }, () => "  [RUCH PRZECIWNIKA]   • Nieprzyjaciel aktywuje zdolność: Shiv's Embrace"),
  ];
  const found = detectBotRepeats(lines);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'bot');
  assert.match(found[0].message, /5×/);
});

test('detectBotRepeats: licznik zeruje się między turami', () => {
  const lines = [
    '  [RUCH PRZECIWNIKA]   • Tura 1 — Nieprzyjaciel',
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel aktywuje zdolność: X',
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel aktywuje zdolność: X',
    '  [RUCH PRZECIWNIKA]   • Tura 2 — Nieprzyjaciel',
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel aktywuje zdolność: X',
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel aktywuje zdolność: X',
  ];
  assert.deepEqual(detectBotRepeats(lines), [], 'po 2 aktywacje na turę to nie patologia');
});

test('detectBotSelfTargeting: łapie bota celującego SZKODLIWYM efektem w siebie', () => {
  const found = detectBotSelfTargeting([
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel aktywuje zdolność: Cellar Door → cel: Nieprzyjaciel — mieli 1 kartę',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'bot');
});

test('detectBotSelfTargeting: korzystny efekt na siebie to NIE błąd (Inspiration)', () => {
  // M97: „Target player draws two cards" na siebie jest optymalne — detektor
  // zgłaszał to jako patologię (fałszywy alarm).
  const found = detectBotSelfTargeting([
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel rzuca Inspiration → cel: Nieprzyjaciel — dobierz 2 karty',
  ]);
  assert.deepEqual(found, []);
});

test('detectBotSelfTargeting: celowanie w gracza jest poprawne', () => {
  const found = detectBotSelfTargeting([
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel aktywuje zdolność: Cellar Door → cel: Ty',
  ]);
  assert.deepEqual(found, []);
});

test('detectEmptyBotMoveModal: modal z samą nazwą FAZY to zgłoszenie', () => {
  const found = detectEmptyBotMoveModal([
    '  [RUCH PRZECIWNIKA] Ruch przeciwnika',
    '  [RUCH PRZECIWNIKA]   • Faza: Główna 1',
    '',
  ]);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /fazy/i);
});

test('M98: modal z nagłówkiem TURY to NIE błąd (korekta właściciela)', () => {
  // Właściciel: „Początek każdej tury to bardzo istotna informacja — chcę ją
  // widzieć, nawet jeśli nic innego się nie dzieje."
  const found = detectEmptyBotMoveModal([
    '  [RUCH PRZECIWNIKA] Ruch przeciwnika',
    '  [RUCH PRZECIWNIKA]   • Tura 9 — Ty',
    '',
  ]);
  assert.deepEqual(found, [], 'nagłówek tury niesie istotną informację');
});

test('M98: modal „faza + tura" też jest w porządku (jest w nim tura)', () => {
  const found = detectEmptyBotMoveModal([
    '  [RUCH PRZECIWNIKA] Ruch przeciwnika',
    '  [RUCH PRZECIWNIKA]   • Faza: Główna 1',
    '  [RUCH PRZECIWNIKA]   • Tura 9 — Ty',
    '',
  ]);
  assert.deepEqual(found, []);
});

test('detectEmptyBotMoveModal: modal z realnym zagraniem nie jest zgłaszany', () => {
  const found = detectEmptyBotMoveModal([
    '  [RUCH PRZECIWNIKA] Ruch przeciwnika',
    '  [RUCH PRZECIWNIKA]   • Faza: Główna 1',
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel zagrywa Forest',
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
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel rzuca Carrion Call',
    '  [RUCH PRZECIWNIKA]   • Carrion Call zostaje rozstrzygnięty',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'info');
  assert.match(found[0].message, /Carrion Call/);
});

test('M98/Carrion Call: gdy gracz DOSTAŁ okno (stos niepusty), brak zgłoszenia', () => {
  const found = detectNoResponseWindow([
    '  [RUCH PRZECIWNIKA]   • Nieprzyjaciel rzuca Carrion Call',
    '  STOS: Carrion Call (rzuca: Nieprzyjaciel)',
    '  [RUCH PRZECIWNIKA]   • Carrion Call zostaje rozstrzygnięty',
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
