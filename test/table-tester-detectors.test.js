// M97 — detektory Żywego Testera: automatyczny przesiew transkryptu.
//
// Reguła z docs/setup/TESTER_STOLU.md („tester też się naprawia", lekcja L12):
// narzędzie audytowe jest produktem i ma testy jak produkcja. Detektory są
// czystymi funkcjami (bez jsdom), więc testujemy je bezpośrednio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRawText, detectBotRepeats, detectBotSelfTargeting,
  detectBotSelfHarmOnOwnPermanents, harmfulCardNames, detectHiddenCardLeak,
  detectEmptyBotMoveModal, detectMissingIgnoreTick, detectRuleSmells,
  detectDeadEndWindow, detectNoResponseWindow, detectGroupWithoutTick,
  detectNoEffectOffers,
  detectBotUntapsMyPermanent,
  detectTokenRawId,
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

// M189 (pętla jakości, transkrypt audyt-m187/g6): „token_wizard — trigger…"
// przeszedł przez detektor, bo SNAKE_CASE_EVENT wymaga DWÓCH podkreślników,
// a identyfikatory tokenów mają jeden („token_wizard", „token_squirrel").
// Klasa L27/L40: „0 zgłoszeń" znaczyło „nie mam takiej reguły".
// M190/A: po zmianie etykiety („dodaj 1 manę dowolnego koloru") wzorzec
// wyciszający zdolności many przestał pasować i sonda zgłaszała je jako
// „oferty bez skutku" (mana w puli nie wchodzi do fingerprintu — L12).
test('detectNoEffectOffers: zdolność many z LICZBĄ w etykiecie jest wyciszona', () => {
  const found = detectNoEffectOffers([{
    applied: true, source: 'panel',
    label: 'Aktywuj: Heap Gate (Ty) (koszt 1, T) — dodaj 1 manę dowolnego koloru',
    probe: { ok: true, changed: false },
  }]);
  assert.deepEqual(found, [], `zdolność many to nie „oferta bez skutku": ${JSON.stringify(found)}`);
});

// M189/Z4 (transkrypt audyt-m187/v-b): detektor „noop" zgłaszał ofertę
// Bone Splinters celującą we własnego stwora poświęcanego jako koszt — ale
// to przypadek M102/U8, ROZWIĄZANY świadomie: wariant jest legalny (CR
// 601.2c), spychany na koniec listy i etykieta SAMA ostrzega „UWAGA: czar
// fizzluje". Zgłaszanie go co przebieg to szum, który przykrywa realne
// znaleziska (L12: odróżniaj artefakt narzędzia od błędu produktu).
test('detectNoopOffers: oferta z JAWNYM ostrzeżeniem o fizzlu to nie zgłoszenie', () => {
  const found = detectNoEffectOffers([{
    applied: true,
    source: 'modal',
    label: 'Rzuć: Bone Splinters (koszt B) → cel: Esper Stormblade (Ty) — poświęć Esper Stormblade (Ty) — UWAGA: czar fizzluje (cel poświęcony jako koszt)',
    probe: { ok: true, changed: true, fizzle: true },
  }]);
  assert.deepEqual(found, [], `ostrzeżona oferta nie jest zgłoszeniem: ${JSON.stringify(found)}`);
});

test('detectNoopOffers: fizzle BEZ ostrzeżenia nadal zgłaszany (kontrola)', () => {
  const found = detectNoEffectOffers([{
    applied: true,
    source: 'panel',
    label: 'Rzuć: Shatter → cel: Bladed Sentinel',
    probe: { ok: true, changed: true, fizzle: true },
  }]);
  assert.equal(found.length, 1, 'realny fizzle bez ostrzeżenia nadal łapany');
});

// M189/Z3 (transkrypt audyt-m187/g13): „Wybierz: Cel (7 opcji)" pochodziło
// z Cuombajj Witches — `resolve_opponent_target`, czyli OBOWIĄZKOWEJ decyzji
// wskazania celu (CR 601.2c). Ptaszek wyciszenia się jej nie należy (gracz
// musi wskazać cel), a detektor zgłaszał brak ptaszka. Klasa L12: fałszywy
// alarm narzędzia, nie błąd produktu — poprawiamy TESTER.
test('detectGroupWithoutTick: obowiązkowa decyzja „Wskaż cel obrażeń" to NIE zgłoszenie', () => {
  const found = detectGroupWithoutTick([
    { label: 'Wybierz: Cel (7 opcji)', hasTick: false, commandKey: '{"type":"resolve_opponent_target","targetId":"orc-army"}' },
  ]);
  assert.deepEqual(found, [],
    `wybór celu narzucony przez kartę przeciwnika nie jest wyciszalny: ${JSON.stringify(found)}`);
});

test('detectGroupWithoutTick: grupa CELU CZARU bez ptaszka nadal zgłaszana (kontrola)', () => {
  const found = detectGroupWithoutTick([
    { label: 'Wybierz: Cel czaru (3 opcje)', hasTick: false, commandKey: '{"type":"cast_spell","objectId":"shatter"}' },
  ]);
  assert.equal(found.length, 1, 'realny brak ptaszka nadal łapany (M98)');
});

test('detectRawText: łapie surowy identyfikator TOKENU (jedno podkreślenie)', () => {
  const found = detectRawText([
    '  [ROZGRYWKA]   • token_wizard — trigger (rzucenie czaru niebędącego stworem)',
  ]);
  assert.ok(found.some((f) => /identyfikator/i.test(f.message)),
    `token_* w tekście dla gracza musi być zgłoszony: ${JSON.stringify(found)}`);
});

test('detectRawText: nie myli nazwy tokenu z poprawnym opisem', () => {
  const found = detectRawText([
    '  [ROZGRYWKA]   • Wizard zadaje 1 obrażenie (Ty)',
    '  [ROZGRYWKA]   • Nieprzyjaciel tworzy token Squirrel (1/1)',
  ]);
  assert.deepEqual(found, [], 'poprawne polskie opisy tokenów bez zgłoszeń');
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

// M203/#3 (audyt PR #75, seed 61 forgotten-realms vs alara): pauza bota bywa
// renderowana wielokrotnie z TĄ SAMĄ, rosnącą listą wpisów, a tester logował
// całą listę za każdym razem — jedna aktywacja Unstable Frontier ({T}) wyglądała
// na powtórzoną 4× w jednej turze, choć po aktywacji tapped=true i ofert jest 0
// (CR 602.2). Identyczny BLOK modala (od `[ROZGRYWKA]` do następnego takiego
// nagłówka) to przedruk artefaktu testera, nie nowa akcja — detektor liczy go
// raz. Prawdziwe powtórzenie (kolejny wpis w NOWYM bloku) jest nadal łapane.
//
// M205/1 (audyt PR #77): pierwsza wersja tych dwóch testów była ŚLEPA —
// przechodziła identycznie z fiksem deduplikacji i po jego cofnięciu
// (mutacja `if (text !== prevBlock) deduped.push(...)` → `deduped.push(...)`:
// nadal 91/91 pass). Powód: przypadek sklejał bloki bez separatora i powtarzał
// w każdym z nich linię `• Tura 7 — Nieprzyjaciel`, a ta linia SAMA zeruje
// licznik (gałąź `turnMark` woła `flush()`), więc akcje nigdy nie sumowały się
// do progu — test był zielony z niewłaściwego powodu (L1).
//
// Dowodowy jest kształt realnego transkryptu: między renderami modala stoi
// nagłówek kroku ze `snapshot()` (`--- krok N | T. X ---`), który zamyka blok,
// a wpis `• Tura N` pojawia się tylko wtedy, gdy modal akurat go pokazał.
// Zmierzone (zgłoszenia z fiksem / bez fiksu): ten kształt 0 / 1 (łapie
// regresję), kształt z PR #77 0 / 0 (ślepy).
const REPEAT_STEP_SEPARATOR = '--- krok 12 | T. 7 | faza main1 ---';
const REPEAT_MODAL_HEAD = '  [ROZGRYWKA] Rozgrywka';
const REPEAT_ACTION = '  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Unstable Frontier → cel: Mountain';

test('M203/#3: przedruk identycznego bloku modala liczony raz (brak fałszywego alarmu)', () => {
  // Pięć renderów TEJ SAMEJ pauzy bota, rozdzielonych nagłówkiem kroku —
  // czyli dokładnie to, co produkuje `run-game.mjs` przy `snapshot()` między
  // krokami. Powtórzeń akcji w silniku jest ZERO (po `{T}` obiekt jest
  // tapnięty, dalszych ofert brak — CR 602.2).
  const reprint = [REPEAT_MODAL_HEAD, REPEAT_ACTION];
  const lines = [
    ...reprint, REPEAT_STEP_SEPARATOR,
    ...reprint, REPEAT_STEP_SEPARATOR,
    ...reprint, REPEAT_STEP_SEPARATOR,
    ...reprint, REPEAT_STEP_SEPARATOR,
    ...reprint,
  ];
  const found = detectBotRepeats(lines);
  assert.deepEqual(found, [], `przedruk identycznego bloku nie jest powtórzeniem akcji: ${JSON.stringify(found)}`);
});

test('M203/#3 (kontrola): RÓŻNE bloki z realnymi akcjami nadal są zgłaszane', () => {
  // Ten sam kształt transkryptu (bloki rozdzielone nagłówkiem kroku), ale
  // każdy kolejny render dokłada NOWY wpis — tak wygląda prawdziwe powtórzenie
  // (station, firebreathing, mill). Deduplikacja nie może go wyciszyć.
  const mk = (n) => [
    REPEAT_MODAL_HEAD,
    ...Array.from({ length: n }, () => "  [ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Shiv's Embrace"),
  ];
  const lines = [
    ...mk(1), REPEAT_STEP_SEPARATOR,
    ...mk(2), REPEAT_STEP_SEPARATOR,
    ...mk(3), REPEAT_STEP_SEPARATOR,
    ...mk(4),
  ];
  const found = detectBotRepeats(lines);
  assert.ok(found.length >= 1, `realne aktywacje w jednej turze muszą być zgłoszone: ${JSON.stringify(found)}`);
});

test('M205/1: nagłówek kroku zamyka blok, więc przedruk NIE maskuje realnego powtórzenia', () => {
  // Strażnik odwrotnej pomyłki: deduplikacja porównuje wyłącznie SĄSIEDNIE
  // bloki, więc przeplot „przedruk, nowa akcja, przedruk…" musi być policzony
  // po treści, a nie wyciszony hurtem.
  const other = '  [ROZGRYWKA]   • Nieprzyjaciel rzuca czar: Shock → cel: Gracz';
  const lines = [
    REPEAT_MODAL_HEAD, REPEAT_ACTION, REPEAT_STEP_SEPARATOR,
    REPEAT_MODAL_HEAD, other, REPEAT_STEP_SEPARATOR,
    REPEAT_MODAL_HEAD, REPEAT_ACTION, REPEAT_STEP_SEPARATOR,
    REPEAT_MODAL_HEAD, other, REPEAT_STEP_SEPARATOR,
    REPEAT_MODAL_HEAD, REPEAT_ACTION, REPEAT_STEP_SEPARATOR,
    REPEAT_MODAL_HEAD, other, REPEAT_STEP_SEPARATOR,
    REPEAT_MODAL_HEAD, REPEAT_ACTION, REPEAT_STEP_SEPARATOR,
    REPEAT_MODAL_HEAD, other,
  ];
  const found = detectBotRepeats(lines);
  assert.ok(
    found.length >= 1,
    `cztery różne bloki z tą samą akcją to realne powtórzenie: ${JSON.stringify(found)}`,
  );
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

// --- M205: DOWÓD auto-passa w transkrypcie ---------------------------------
// Audyt PR #77 (M204) zostawił „znany szum": detektor zgłaszał instanty
// i sorcery rzucane w turze bota (Withstand, Toll of the Invasion, Courage
// in Crisis) jako rozstrzygnięte bez okna na odpowiedź. Engine był poprawny —
// człowiek dostawał priorytet i auto-pasował, bo nie miał czym odpowiedzieć
// (CR 117.3b/117.4) — ale transkrypt nie niósł ŻADNEGO śladu tego passa,
// więc detektor nie mógł odróżnić legalnego przebiegu od realnego pominięcia
// okna. Zmierzone przed naprawą: seed 42 (dominaria vs ravnica) = 2 zgłoszenia,
// po naprawie = 0, przy zachowanej mocy wykrywania (test niżej).
//
// Ślad zostawia sesja (`Auto-pass: …` w logu głównego stołu), zbiera go tester
// (także pod `--quiet`, gdzie snapshotów nie ma wcale), a detektor uznaje za
// dowód odzyskania kontroli.
test('M205: wpis „Auto-pass" w logu jest dowodem, że gracz oddał priorytet', () => {
  // Kształt zmierzony w transkrypcie seeda 42 — wpis stoi dokładnie między
  // rzuceniem czaru a jego rozstrzygnięciem.
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Withstand → cel: Nieprzyjaciel',
    '  LOG: Auto-pass: nie masz odpowiedzi — oddajesz priorytet, stos się rozstrzyga',
    '  [ROZGRYWKA]   • Withstand zostaje rozstrzygnięty',
  ]);
  assert.deepEqual(found, [], `auto-pass jest legalnym oknem na odpowiedź: ${JSON.stringify(found)}`);
});

test('M205 (kontrola): BEZ wpisu o auto-passie ten sam przebieg jest nadal zgłaszany', () => {
  // Mutacja poprzedniego przypadku: jedyna różnica to brak linii dowodowej.
  // Gdyby detektor wyciszał czary bota z innego powodu, ten test byłby zielony
  // mimo cofnięcia naprawy — i cała para nie pilnowałaby niczego (L1).
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Withstand → cel: Nieprzyjaciel',
    '  [ROZGRYWKA]   • Withstand zostaje rozstrzygnięty',
  ]);
  assert.equal(found.length, 1, 'brak dowodu na oddanie priorytetu = zgłoszenie zostaje');
  assert.match(found[0].message, /Withstand/);
});

test('M99: prawdziwy brak okna (jeden blok modala) nadal jest zgłaszany', () => {
  const found = detectNoResponseWindow([
    '  [ROZGRYWKA] Rozgrywka',
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Carrion Call',
    '  [ROZGRYWKA]   • Carrion Call zostaje rozstrzygnięty',
    '  [ROZGRYWKA]   • token Insect wchodzi na pole bitwy',
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

test('M219: utrata życia gracza BEZ kosztu życiowego to SKUTEK, nie no-op', () => {
  // Pętla jakości Żywym Testerem (h10 wiedzmin vs forgotten-realms s=15):
  // Ballista Watcher „{2}{R},{T}: 1 obrażenie dowolnemu celowi" wycelowany
  // we WŁASNĄ twarz zabiera 1 życia — to SKUTEK zadanych obrażeń, nie koszt.
  // Detektor liczył humanLifeDelta<=0 jako koszt niezależnie od kosztu
  // życiowego zdolności i zgłaszał poprawną (choć samobójczą) ofertę jako
  // no-opa (L18/L75). Koszt {2}{R},{T} nie ma składnika `life`.
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Ballista Watcher (koszt 2R, T) — 1 obrażenie → cel: Ty',
    applied: true,
    probe: probeOf({ changed: true, humanLifeDelta: -1, ownOtherTaps: 1, costSignature: { mana: true, tap: true } }),
  }]);
  assert.equal(found.length, 0, 'strata życia gracza bez kosztu życiowego = skutek, nie zgłaszaj no-opa');
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

test('M104/rules: odrzucenie po ptaszku wyciszenia zostaje w kategorii rules, z kontekstem w dowodzie', () => {
  // Trzy takie odrzucenia z macierzy M104 miały jedną przyczynę: panel nie
  // był przerysowany po przewinięciu, które wywołuje zaznaczenie ptaszka
  // (naprawione w main.js). Semantyka ptaszka jest poprawna (decyzja
  // właściciela 2026-08-16), więc nawrót MUSI być widoczny jako `rules` —
  // kontekst „[tuż po ptaszku wyciszenia]" pomaga tylko w diagnozie.
  const found = detectRuleSmells([], {
    profile: 'random',
    rejectionRecords: [{
      action: 'Zagraj: Porcelain Legionnaire (phyrexian 1× po 2 życia)',
      reason: 'Ruch odrzucony: illegal_cast:Zagranie poza main phase',
      afterTick: true,
    }],
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'rules');
  assert.match(found[0].evidence, /tuż po ptaszku wyciszenia/);
});

// =============================================================================
// M119 — detektory dopisane po audycie „z perspektywy gracza”.
// Dwanaście partii przeszło przez komplet dotychczasowych detektorów z zerem
// zgłoszeń, a ręczne czytanie transkryptu wykryło błędy odmiany i modal
// z nieodróżnialnymi opcjami. Te dwie klasy mają się teraz łapać same.
// =============================================================================

test('M119: detektor łapie błędną odmianę polską w tekście dla gracza', async () => {
  const { detectPolishPluralErrors } = await import('../tools/table-tester/detectors.mjs');
  const found = detectPolishPluralErrors([
    '  [ROZGRYWKA]   • Leafcrown Dryad dostaje +2 licznik +1/+1 (razem 2)',
    '  [ROZGRYWKA]   • Obiekt traci 5 licznik stun (zostało 0)',
    '  LOG: Proliferate: 2 celów dostaje dodatkowe liczniki',
  ]);
  const messages = found.map((f) => f.message).join(' | ');
  assert.equal(found.length, 3, `oczekiwano 3 zgłoszeń, było: ${messages}`);
  assert.match(messages, /„2 licznik" — powinno być „2 liczniki"/);
  assert.match(messages, /„5 licznik" — powinno być „5 liczników"/);
  assert.match(messages, /„2 celów" — powinno być „2 cele"/);
});

test('M119: detektor odmiany NIE zgłasza poprawnych form (bez fałszywek)', async () => {
  const { detectPolishPluralErrors } = await import('../tools/table-tester/detectors.mjs');
  // Polskie ogonki: „kartę”/„obrażeń” muszą przejść — granica wyrazu \b
  // nie działa po literach spoza ASCII i produkowała fałszywe alarmy.
  const found = detectPolishPluralErrors([
    '  [ROZGRYWKA]   • Dobierz 1 kartę',
    '  [ROZGRYWKA]   • Mielisz 3 karty do grobu',
    '  [ROZGRYWKA]   • Mielisz 5 kart do grobu',
    '  [ROZGRYWKA]   • Giant Spider zadaje 2 obrażenia (Nieprzyjaciel)',
    '  [ROZGRYWKA]   • Leafcrown Dryad zadaje 6 obrażeń (Nieprzyjaciel)',
    '  [ROZGRYWKA]   • Obiekt dostaje +1 licznik +1/+1 (razem 1)',
    '  [ROZGRYWKA]   • Obiekt dostaje +12 liczników (razem 12)',
    '  [ROZGRYWKA]   • Obiekt dostaje +22 liczniki (razem 22)',
    // M223 (audyt Batch 50): dopełniacz po „z" — „z 3 kart" jest POPRAWNE
    // (out of N cards), nie mianownik „3 karty". Nie zgłaszamy.
    '  [ROZGRYWKA]   • Nieprzyjaciel kończy scry — odkłada na spód biblioteki 2 z 3 kart',
    '  [ROZGRYWKA]   • Bierze kartę z wierzchu do ręki (2 z 7 kart do grobu)',
  ]);
  assert.deepEqual(found, [], `fałszywe alarmy: ${found.map((f) => f.message).join(' | ')}`);
});

test('M223: detektor odmiany NADAL łapie błąd mianownikowy „3 kart" (bez „z")', async () => {
  const { detectPolishPluralErrors } = await import('../tools/table-tester/detectors.mjs');
  const found = detectPolishPluralErrors([
    '  [ROZGRYWKA]   • Odłóż 3 kart na spód biblioteki',
  ]);
  assert.equal(found.length, 1, `wciąż łapie błąd mianownikowy: ${found.map((f) => f.message).join(' | ')}`);
  assert.match(found[0].message, /„3 kart\" — powinno być „3 karty\"/);
});

test('M119: detektor łapie modal z nieodróżnialnymi opcjami', async () => {
  const { detectIndistinguishableOptions } = await import('../tools/table-tester/detectors.mjs');
  const line = '  [modal choice] Wybierz: Karty na spód biblioteki (mulligan) '
    + 'Mulligan — odłóż na spód (2): Mountain, Mountain (1 z 15) '
    + 'Mulligan — odłóż na spód (2): Mountain, Mountain (2 z 15) '
    + 'Mulligan — odłóż na spód (2): Mountain, Mountain (3 z 15) '
    + 'Mulligan — odłóż na spód (2): Seismic Monstrosaur, Mountain (1 z 5)';
  const found = detectIndistinguishableOptions([line]);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /3 nieodróżnialnych opcji/);
  assert.equal(found[0].category, 'ui');
});

test('M119: modal z różnymi opcjami nie jest zgłaszany', async () => {
  const { detectIndistinguishableOptions } = await import('../tools/table-tester/detectors.mjs');
  const line = '  [modal choice] Wybierz: Szukanie w bibliotece '
    + 'Szukanie: Forest Szukanie: Mountain Szukanie: Island Szukanie: Swamp';
  assert.deepEqual(detectIndistinguishableOptions([line]), []);
});

// =============================================================================
// M121 — detektor: bot rzuca czar / aktywuje zdolność we WŁASNY permanent.
//
// Polecenie właściciela: „zrób detektor sytuacji, gdy bot rzuca czary na
// własne stwory”. `detectBotSelfTargeting` łapie tylko celowanie w bota-GRACZA
// („→ cel: Nieprzyjaciel”); tutaj celem jest nazwany PERMANENT kontrolowany
// przez bota. Właściciela celu ustalamy z ostatniego snapshotu „MOJE POLA:” /
// „POLA WROGA:” poprzedzającego akcję.
//
// Klasyfikacja szkodliwości idzie po DESKRYPTORACH z rejestru, nie po polskim
// tekście: w logu widać samą nazwę karty („rzuca Shatter → cel: X”), więc
// regex po słowach kluczowych nie miałby czego dopasować.
// =============================================================================

const FIELD_FOE = '  POLA WROGA: Great Furnace · Artifact | Goblin Piker · Creature';
const FIELD_MINE = '  MOJE POLA: Etherium Abomination · Creature';

test('M121: wykrywa czar niszczący własny permanent bota', () => {
  const names = new Set(['Shatter']);
  const found = detectBotSelfHarmOnOwnPermanents([
    FIELD_FOE, FIELD_MINE,
    '[ROZGRYWKA]   • Nieprzyjaciel rzuca Shatter → cel: Great Furnace',
  ], names);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'bot');
  assert.match(found[0].message, /WŁASNY permanent: Great Furnace/);
});

test('M121: wykrywa zdolność aktywowaną wymierzoną we własnego stwora', () => {
  const found = detectBotSelfHarmOnOwnPermanents([
    FIELD_FOE, FIELD_MINE,
    '[ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Entrancing Lyre → cel: Goblin Piker',
  ], new Set(['Entrancing Lyre']));
  assert.equal(found.length, 1);
});

test('M121: NIE zgłasza usunięcia permanentu przeciwnika (poprawna gra)', () => {
  const found = detectBotSelfHarmOnOwnPermanents([
    FIELD_FOE, FIELD_MINE,
    '[ROZGRYWKA]   • Nieprzyjaciel rzuca Shatter → cel: Etherium Abomination',
  ], new Set(['Shatter']));
  assert.equal(found.length, 0);
});

test('M121: NIE zgłasza wzmocnienia własnego stwora', () => {
  const found = detectBotSelfHarmOnOwnPermanents([
    FIELD_FOE, FIELD_MINE,
    '[ROZGRYWKA]   • Nieprzyjaciel rzuca Brute Force → cel: Goblin Piker',
  ], new Set(['Shatter'])); // Brute Force nie jest kartą szkodliwą
  assert.equal(found.length, 0);
});

test('M121: NIE zgłasza celowania w GRACZY (to domena detectBotSelfTargeting)', () => {
  const found = detectBotSelfHarmOnOwnPermanents([
    FIELD_FOE, FIELD_MINE,
    '[ROZGRYWKA]   • Nieprzyjaciel rzuca Dream Twist → cel: Ty',
    '[ROZGRYWKA]   • Nieprzyjaciel rzuca Cellar Door → cel: Nieprzyjaciel',
  ], new Set(['Dream Twist', 'Cellar Door']));
  assert.equal(found.length, 0);
});

test('M121: nazwa obecna po OBU stronach stołu jest niejednoznaczna — brak zgłoszenia', () => {
  const found = detectBotSelfHarmOnOwnPermanents([
    '  POLA WROGA: Goblin Piker · Creature',
    '  MOJE POLA: Goblin Piker · Creature',
    '[ROZGRYWKA]   • Nieprzyjaciel rzuca Shatter → cel: Goblin Piker',
  ], new Set(['Shatter']));
  assert.equal(found.length, 0);
});

test('M121: harmfulCardNames klasyfikuje po deskryptorach, nie po nazwach', () => {
  const registry = { all: () => [
    { name: 'Niszczyciel', spell: { effects: [{ type: 'destroy_permanent' }] } },
    { name: 'Tapowacz', abilities: [{ effect: { type: 'tap_permanent' } }] },
    { name: 'Modalny', spell: { modes: [{ effects: [{ type: 'exile_permanent' }] }] } },
    { name: 'Dobieracz', spell: { effects: [{ type: 'draw_cards' }] } },
  ] };
  const names = harmfulCardNames(registry);
  assert.ok(names.has('Niszczyciel') && names.has('Tapowacz') && names.has('Modalny'));
  assert.equal(names.has('Dobieracz'), false, 'dobieranie kart nie jest efektem ofensywnym');
});

test('M121: detektor działa wstecznie na prawdziwym znalezisku (Spectral Prison)', () => {
  // Wycinek z /tmp/D-sojusznicy-innistrad-404.txt (linia 504) — bot założył
  // aurę „blokada odkręcania" na WŁASNEGO Selhoff Occultist.
  const found = detectBotSelfHarmOnOwnPermanents([
    '  MOJE POLA: Deadly Recluse · 2 · Creature — Spider | Giant Spider · 4 · Creature — Spider',
    '  POLA WROGA: Selhoff Occultist · 3 · Creature — Human Rogue | Gorger Wurm · 5 · Creature — Wurm',
    '[ROZGRYWKA]   • Nieprzyjaciel rzuca Spectral Prison → cel: Selhoff Occultist',
  ], new Set(['Spectral Prison']));
  assert.equal(found.length, 1, 'to znalezisko musi się łapać automatycznie');
});

// =============================================================================
// M123 — detektor przecieku ukrytej informacji (zgłoszenie właściciela).
// Modal pokazywał miniaturki kart przy „Nieprzyjaciel dobiera kartę" — tekst
// ukrywał nazwę (FoW), obrazek nie. 60 partii M122 tego nie zgłosiło, bo żaden
// detektor nie miał reguły dla tej klasy (L27). Ta reguła zamyka lukę.
// =============================================================================

const CARD_NAMES = new Set(['Grave Exchange', 'Village Rites', 'Island', 'Swamp']);

test('M123: wykrywa nazwę karty przy bezimiennym wpisie o dobraniu bota', () => {
  const found = detectHiddenCardLeak([
    '[ROZGRYWKA]   • Nieprzyjaciel dobiera kartę Grave Exchange',
  ], CARD_NAMES);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'rules');
  assert.match(found[0].message, /Grave Exchange/);
});

test('M123: poprawnie ukryte dobranie bota nie jest zgłaszane', () => {
  const found = detectHiddenCardLeak([
    '[ROZGRYWKA]   • Nieprzyjaciel dobiera kartę',
    '[ROZGRYWKA]   • Village Rites zostaje rozstrzygnięty',
  ], CARD_NAMES);
  assert.equal(found.length, 0);
});

test('M123: jawne dobranie GRACZA nie jest przeciekiem', () => {
  const found = detectHiddenCardLeak(['[ROZGRYWKA]   • Dobierasz: Island'], CARD_NAMES);
  assert.equal(found.length, 0, 'własne karty gracz ma prawo widzieć');
});

// M146 — bot odkręca TWÓJ permanent (Twiddle — tryb Odkręcenie).
test('detectBotUntapsMyPermanent: łapie bot odkręcający mój permanent', () => {
  const lines = [
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Twiddle — tryb: Odkręcenie → cel: Mountain',
    '  [ROZGRYWKA]   • Twiddle — tryb: Odkręcenie zostaje rozstrzygnięty',
  ];
  const my = new Set(['Mountain']);
  const enemy = new Set(['Island']);
  const found = detectBotUntapsMyPermanent(lines, my, enemy);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, /odkręca TWÓJ permanent/);
});

test('detectBotUntapsMyPermanent: milczy, gdy cel jest własny albo tryb tap', () => {
  const own = [
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Twiddle — tryb: Odkręcenie → cel: Island',
    '  [ROZGRYWKA]   • Twiddle — tryb: Odkręcenie zostaje rozstrzygnięty',
  ];
  assert.equal(detectBotUntapsMyPermanent(own, new Set(['Mountain']), new Set(['Island'])).length, 0,
    'własny cel (Island po stronie wroga) nie jest zgłoszeniem');
  const tap = [
    '  [ROZGRYWKA]   • Nieprzyjaciel rzuca Twiddle — tryb: Tapnięcie → cel: Mountain',
  ];
  assert.equal(detectBotUntapsMyPermanent(tap, new Set(['Mountain']), new Set()).length, 0,
    'tryb Tapnięcie to nie odkręcanie');
});

// M155 — wyciek raw id tokenu (token_squirrel zamiast Squirrel) w kaflach/celach.
test('detectTokenRawId: łapie surowy id tokenu w kaflu pola', () => {
  const lines = ['  MOJE POLA: token_squirrel · 0 · Creature — Squirrel · 1/1 | Colossodon Yearling · 3 · Creature — Beast · 2/4'];
  const found = detectTokenRawId(lines);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, /token_squirrel/);
});

test('detectTokenRawId: łapie surowy id tokenu w celu/modalu', () => {
  const lines = ['  [modal choice] Lotusguard Disciple — cel triggera: token_wizard (Nieprzyjaciel)'];
  const found = detectTokenRawId(lines);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.match(found[0].message, /token_wizard/);
});

test('detectTokenRawId: milczy, gdy token ma czytelną nazwę (bez surowego id)', () => {
  const ok = [
    '  MOJE POLA: Squirrel · 0 · Creature — Squirrel · 1/1 | Colossodon Yearling · 3 · Creature — Beast · 2/4',
    '  [modal choice] Lotusguard Disciple — cel triggera: Wizard (Nieprzyjaciel)',
  ];
  assert.equal(detectTokenRawId(ok).length, 0, 'czytelne nazwy to nie wyciek');
});

// --- M213: tap CELU efektem to skutek, nie zapłacony koszt -----------------
//
// Żywy Tester (worek-legend vs worek-mroczny, s=77) zgłosił 4 no-opy na
// Sterling Keykeeper („{2}, {T}: Tap target non-Mount creature”) wycelowanym
// we własne stwory. Zdolność działa poprawnie — sonda liczyła jednak tap
// ŹRÓDŁA (koszt) i tap CELU (skutek) do jednego licznika `ownOtherTaps`,
// więc „sam koszt” wychodziło prawdą i detektor krzyczał na dobrą ofertę.
// Fałszywy alarm w narzędziu audytu jest kosztowny: przykrywa realne
// znaleziska i uczy ignorować zgłoszenia (L12).

test('M213/noop: tapnięcie WŁASNEGO permanentu EFEKTEM nie jest „samym kosztem\"', () => {
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Sterling Keykeeper (Ty) (koszt 2, T) — tap → cel: Robot (Ty)',
    source: 'modal', scanned: true, applied: false,
    probe: {
      ok: true, changed: true, effectDiffs: [],
      ownLandTaps: 2, ownOtherTaps: 1, ownEffectTaps: 1,
      opponentTaps: 0, ownUntaps: 0, opponentUntaps: 0,
      humanLifeDelta: 0, manaChanged: true,
      costSignature: { mana: true, tap: true },
    },
  }]);
  assert.deepEqual(found, [], 'tapnięcie celu zmienia stan stołu — to skutek, nie koszt');
});

test('M213/noop: REALNY no-op (koszt bez żadnego tapnięcia-skutku) nadal krzyczy', () => {
  // Kontrola po uciszeniu alarmu (L67): naprawa, która przy okazji wyłącza
  // detektor, jest gorsza od błędu, który naprawiała.
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Jakaś Zdolność (koszt 2, T)',
    source: 'panel', scanned: true, applied: true,
    probe: {
      ok: true, changed: true, effectDiffs: [],
      ownLandTaps: 2, ownOtherTaps: 1, ownEffectTaps: 0,
      opponentTaps: 0, ownUntaps: 0, opponentUntaps: 0,
      humanLifeDelta: 0, manaChanged: true,
      costSignature: { mana: true, tap: true },
    },
  }]);
  assert.equal(found.length, 1, 'oferta, która naprawdę nic nie robi, musi być zgłoszona');
});

test('noop: kontr wardem/regułą (spell_countered) to realny skutek — nie zgłaszamy', () => {
  // M264 (Żywy Tester, partia 4002): ward {2} zakrytego 2/2 auto-kontruje
  // zdolność (gracz bez many na dopłatę). Sonda widziała „tap kosztu i nic"
  // i zgłaszała poprawną aktywację jako no-op — kontr to odpowiedź gry,
  // nie wada oferty (L12: szum przykrywa prawdziwe znaleziska).
  const found = detectNoEffectOffers([{
    label: 'Aktywuj: Stirring Bard (Ty) (koszt T) — zdobądź Postrach, Pośpiech do końca tury → cel: Morph (Nieprzyjaciel)',
    source: 'modal',
    scanned: true,
    probe: probeOf({
      changed: true,
      ownOtherTaps: 1,
      countered: true,
      costSignature: { tap: true },
    }),
  }]);
  assert.equal(found.length, 0);
});
