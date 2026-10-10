// Audyt PR #161 (sesja 2026-10-10), znalezisko F-1: N (Crumb and Get It,
// „wybór daru”) dodała guard `uniformGiftOf` do PIĘCIU planów składających
// warianty w jedną decyzję (singleTarget / multiTarget / castMode /
// sacrifice / divided) — `chooseOneOrBothPlanOf` został z listy (L72:
// naprawiamy WSZYSTKIE miejsca, nie jedno). Jego mapa `bySelection` jest
// kluczowana WYŁĄCZNIE wybranymi gniazdami (`a|b`) i nie zna `gifted`:
// przy niejednolitym darze (tryb × obietnica, CR 702.174a) wariant z darem
// NADPISYWAŁ wpis wariantu bez daru przy tym samym zestawie gniazd —
// wybór obietnicy cicho przepadał (ten sam defekt co N/1, inna ścieżka).
// Kontrakt K celowo trzyma warianty daru w JEDNEJ grupie modalnej
// (choiceRequestGroupKey: „dar jest wariantem tego samego rzutu”), więc
// każdy plan grupy musi to znosić.
//
// Fix: guard `uniformGiftOf(options)` — grupa z niejednolitym darem wraca
// null i pada na fallback `buttonsPlanOf` (wiersz na wariant, etykieta
// rozróżnia). ADR 0002 — po polu komendy, nie po karcie.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseOneOrBothPlanOf,
  buttonsPlanOf,
} from '../src/table/multi-target.js';

const wariant = (nadpisanie = {}) => ({
  type: 'cast_spell', objectId: 'karta#1', modeIndex: 0,
  targets: ['cel-a'], giftRecipientId: null, gifted: false,
  ...nadpisanie,
});

// Kształt B („choose one” o trybach 1-celowych, jak kontra-vs-odbita):
// tryb 0 → cel-a, tryb 1 → cel-b; dar dokłada bliźniaczy wariant każdego.
function grupaKsztaltB(zDarem) {
  const baza = [
    wariant({ modeIndex: 0, targets: ['cel-a'] }),
    wariant({ modeIndex: 1, targets: ['cel-b'] }),
  ];
  if (!zDarem) return baza;
  return [
    ...baza,
    wariant({ modeIndex: 0, targets: ['cel-a'], gifted: true, giftRecipientId: 'p2' }),
    wariant({ modeIndex: 1, targets: ['cel-b'], gifted: true, giftRecipientId: 'p2' }),
  ];
}

// Kształt A („choose one or both”: tryb ZŁOŻONY daje gniazda, tryby
// 1-celowe wiążą się po jednym): tryb 0 = oba cele, tryb 1 = artefakt,
// tryb 2 = ląd; dar dokłada bliźniaczy wariant każdego.
function grupaKsztaltA(zDarem) {
  const baza = [
    wariant({ modeIndex: 0, targets: ['art', 'land'] }),
    wariant({ modeIndex: 1, targets: ['art'] }),
    wariant({ modeIndex: 2, targets: ['land'] }),
  ];
  if (!zDarem) return baza;
  return [
    ...baza,
    wariant({ modeIndex: 0, targets: ['art', 'land'], gifted: true, giftRecipientId: 'p2' }),
    wariant({ modeIndex: 1, targets: ['art'], gifted: true, giftRecipientId: 'p2' }),
    wariant({ modeIndex: 2, targets: ['land'], gifted: true, giftRecipientId: 'p2' }),
  ];
}

test('F-1/1: chooseOneOrBothPlanOf (kształt B) odrzuca grupę z niejednolitym darem', () => {
  const plan = chooseOneOrBothPlanOf(grupaKsztaltB(true));
  assert.equal(plan, null,
    'bySelection nie zna `gifted` — wariant z darem nadpisałby wariant bez daru');
  assert.ok(buttonsPlanOf(grupaKsztaltB(true)),
    'fallback przyciskowy niesie wiersz na wariant — wybór daru przeżywa');
});

test('F-1/2: chooseOneOrBothPlanOf (kształt A) odrzuca grupę z niejednolitym darem', () => {
  assert.equal(chooseOneOrBothPlanOf(grupaKsztaltA(true)), null,
    'ta sama mapa bySelection — ten sam defekt w kształcie „one or both”');
});

test('F-1/3 kontrola: bez daru plan działa jak dawniej (kształt B)', () => {
  const plan = chooseOneOrBothPlanOf(grupaKsztaltB(false));
  assert.ok(plan, 'grupa bez daru nie traci kreatora wyboru');
  assert.equal(plan.bySelection.size, 2, 'dwa wybory gniazd → dwa wpisy mapy');
});

test('F-1/4 kontrola: jednolity dar (wszędzie obiecany) to nie wybór — plan wolny', () => {
  const wszyscyZDarem = grupaKsztaltB(false).map((cmd) => (
    { ...cmd, gifted: true, giftRecipientId: 'p2' }));
  const plan = chooseOneOrBothPlanOf(wszyscyZDarem);
  assert.ok(plan, 'stały dar nie wymaga decyzji — kreator OK (jak N/7)');
});

test('F-1/5 kontrola: kształt A bez daru działa (tryb złożony + wiązania gniazd)', () => {
  const plan = chooseOneOrBothPlanOf(grupaKsztaltA(false));
  assert.ok(plan, 'grupa bez daru przechodzi do kreatora gniazd');
  assert.equal(plan.bySelection.size, 3, 'trzy warianty wyboru gniazd');
});
