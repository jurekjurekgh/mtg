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

test('detectEmptyBotMoveModal: modal z samymi nagłówkami to zgłoszenie', () => {
  const found = detectEmptyBotMoveModal([
    '  [RUCH PRZECIWNIKA] Ruch przeciwnika',
    '  [RUCH PRZECIWNIKA]   • Faza: Główna 1',
    '  [RUCH PRZECIWNIKA]   • Tura 9 — Ty',
    '',
  ]);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /bez treści/i);
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
