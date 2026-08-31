import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectGenericChoiceTitle,
  detectEmptyCostDescriptor,
  detectDuplicateLogEntry,
  runDetectors,
} from '../tools/table-tester/detectors.mjs';

/**
 * M266/D — detektory dla klas L101 i L102 (zadanie „Żywy Tester ma łapać sam").
 *
 * Powód powstania: trzy zgłoszenia właściciela z tej rundy (A/B/C) przeszły
 * przez KOMPLET dotychczasowych detektorów bez jednego trafienia — 14 partii
 * z audytu M265 dało zero. To dokładnie L27: „zero zgłoszeń" znaczy „nie mam
 * reguły", a nie „nie ma błędu”. Każda z klas zostawia jednak w transkrypcie
 * ślad możliwy do opisania regułą:
 *
 *   L102 (rodzina ofert niepełna) → tytuł grupy spada do generycznego
 *        „Wybierz: Wariant (N opcji)" — brakujący deskryptor rodziny.
 *   L101 (lista pól widoku niepełna) → deskryptor kosztu wychodzi PUSTY
 *        („koszt \u007b\u007d", „+ kicker " bez kwoty) — pole nie dojechało do widoku.
 *   C2 (duplikat zdarzenia w wyniku komendy) → ta sama linia „Rzucasz X"
 *        dwa razy w JEDNEJ paczce modala „Rozgrywka".
 */

test('L102: generyczne „Wybierz: Wariant" w panelu to brak deskryptora rodziny', () => {
  const lines = ['  AKCJE: >> Wybierz: Wariant (5 opcji)'];
  const found = detectGenericChoiceTitle(lines);
  assert.equal(found.length, 1, 'generyczny tytuł grupy ma być zgłoszony');
  assert.equal(found[0].category, 'ui');
  assert.match(found[0].message, /deskryptor/i);
});

test('L102: generyczny tytuł w nagłówku modala też liczy się jako zgłoszenie', () => {
  const lines = ['  [modal choice] Wybierz: Wariant Terminal Agony — rzuć Terminal Agony — odpuść'];
  assert.equal(detectGenericChoiceTitle(lines).length, 1, 'nagłówek modala to ta sama klasa');
});

test('L102: NAZWANY tytuł grupy nie jest zgłaszany (brak fałszywych alarmów)', () => {
  const ok = [
    '  AKCJE: >> Wybierz: Mulligan (2 opcje)',
    '  AKCJE: >> Aura: Benevolent Blessing (3 opcje)',
    '  [modal choice] Wybierz: Karta do odrzucenia Odrzuć: Hecteyes',
    '  AKCJE: >> Wybierz: Cel (4 opcje)',
  ];
  assert.deepEqual(detectGenericChoiceTitle(ok), [], 'nazwane deskryptory są poprawne');
});

test('L101: pusty deskryptor kosztu w etykiecie akcji', () => {
  const lines = [
    '  AKCJE: >> Rzuć: Kor Sanctifiers (koszt 2W + kicker )',
    '  AKCJE: >> Rzuć za warp: Weftblade Enhancer (koszt )',
  ];
  const found = detectEmptyCostDescriptor(lines);
  assert.equal(found.length, 2, 'oba puste koszty mają być zgłoszone');
  assert.ok(found.every((f) => /koszt/i.test(f.message)), 'komunikat mówi o koszcie');
});

test('L101: pełny koszt (także darmowy rzut opisany słownie) nie jest zgłaszany', () => {
  const ok = [
    '  AKCJE: >> Rzuć: Kor Sanctifiers (koszt 2W + kicker 1W)',
    '  AKCJE: >> Aktywuj: Kishla Village (Ty) (koszt T) — dodaj 1 manę zieloną',
    '  AKCJE: >> Rzuć za suspend: Jhoira (koszt 1U)',
    '  AKCJE: >> Rzuć za darmo: Halo Forager (bez kosztu many)',
  ];
  assert.deepEqual(detectEmptyCostDescriptor(ok), [], 'wypełnione koszty są poprawne');
});

test('C2: ta sama linia dwa razy w jednej paczce modala „Rozgrywka"', () => {
  const lines = [
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Rzucasz Terminal Agony',
    '  [ROZGRYWKA]   • Rzucasz Terminal Agony',
    '  [ROZGRYWKA]   • Terminal Agony zostaje rozstrzygnięty',
  ];
  const found = detectDuplicateLogEntry(lines);
  assert.equal(found.length, 1, 'duplikat wpisu w jednej paczce ma być zgłoszony');
  assert.match(found[0].message, /dwukrotnie|duplikat/i);
});

test('C2: ta sama czynność w OSOBNYCH paczkach to nie duplikat', () => {
  const ok = [
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Dobierasz kartę',
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Dobierasz kartę',
  ];
  assert.deepEqual(detectDuplicateLogEntry(ok), [], 'dwie tury = dwie paczki');
});

test('C2: powtarzalne wpisy techniczne (auto-pass, fazy) nie są duplikatem', () => {
  const ok = [
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Faza: Główna 1',
    '  [ROZGRYWKA]   • Faza: Główna 1',
  ];
  assert.deepEqual(detectDuplicateLogEntry(ok), [], 'wpisy fazowe bywają powtarzalne z natury');
});

test('C2/kalibracja: legalne powtórzenia z realnych partii NIE są zgłaszane', () => {
  // Zestaw wzięty wprost z 14 transkryptów audytu M265: naiwna reguła
  // „ta sama linia dwa razy w paczce" dawała na nich 42 fałszywe alarmy.
  // Dwa tokeny tej samej nazwy, dwa triggery tej samej aury i dwie instancje
  // obrażeń od tego samego stworzenia to normalny przebieg gry.
  const ok = [
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Ty tworzysz token Soldier (1/1)',
    '  [ROZGRYWKA]   • Soldier wchodzi na pole bitwy',
    '  [ROZGRYWKA]   • Ty tworzysz token Soldier (1/1)',
    '  [ROZGRYWKA]   • Soldier wchodzi na pole bitwy',
    '  [ROZGRYWKA]   • Angelic Benediction — trigger się rozstrzyga',
    '  [ROZGRYWKA]   • Angelic Benediction — trigger się rozstrzyga',
    '  [ROZGRYWKA]   • Blade-Blizzard Kitsune zadaje 2 obrażenia (Ty)',
    '  [ROZGRYWKA]   • Blade-Blizzard Kitsune zadaje 2 obrażenia (Ty)',
    '  [ROZGRYWKA]   • Mielisz Island do grobu',
    '  [ROZGRYWKA]   • Mielisz Island do grobu',
  ];
  assert.deepEqual(detectDuplicateLogEntry(ok), [], 'zero fałszywych alarmów na realnym korpusie');
});

test('runDetectors: wszystkie trzy nowe detektory są wpięte w bieg partii', () => {
  const lines = [
    '  AKCJE: >> Wybierz: Wariant (5 opcji)',
    '  AKCJE: >> Rzuć: Kor Sanctifiers (koszt 2W + kicker )',
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Rzucasz Terminal Agony',
    '  [ROZGRYWKA]   • Rzucasz Terminal Agony',
  ];
  const messages = runDetectors(lines).map((f) => f.message).join(' | ');
  assert.match(messages, /deskryptor/i, 'L102 wpięty w runDetectors');
  assert.match(messages, /koszt/i, 'L101 wpięty w runDetectors');
  assert.match(messages, /dwukrotnie|duplikat/i, 'C2 wpięty w runDetectors');
});
