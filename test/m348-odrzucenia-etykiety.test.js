// M348/BATCH5 (audyt PR #111, F2): strażnik kontraktu rejectionReasonLabel.
// Fix z PR #111 wszedł bez testu — audyt zmierzył, że cofnięcie etykiet
// discard_choice_* i guarda „≥2 podkreślenia bez sluga" NIE czerwieni żadnego
// testu (szybki rdzeń 5055/5055). Domknięcie luki L13.
//
// Kontrakt (dwa kanały, L6): UI/log dostaje polską etykietę BEZ surowego
// snake_case dla kodów z ≥2 podkreśleniami (detektor INFO Żywego Testera
// flaguje wyciek slugów w tekście gracza), a kod 1-podkreślnikowy zachowuje
// slug w nawiasie (ustalony kształt etykiet). Surowy powód zostaje
// strukturalnie w rejectionRecords — tu pilnujemy wyłącznie tekstu gracza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REJECTION_REASON_LABELS, rejectionReasonLabel } from '../src/table/session.js';

test('M348: rodzina discard_choice — polska etykieta bez snake_case w tekście gracza', () => {
  assert.equal(rejectionReasonLabel('discard_choice_unresolved'), 'najpierw wybierz kartę do odrzucenia');
  assert.equal(rejectionReasonLabel('discard_choice_not_your_decision'), 'to nie twoja decyzja o odrzuceniu');
  assert.equal(rejectionReasonLabel('illegal_discard_choice'), 'nielegalny wybór karty do odrzucenia');
});

test('M348: kody z ≥2 podkreśleniami nigdy nie niosą sluga (znane i nieznane)', () => {
  const dlugie = [
    'discard_choice_unresolved', 'discard_choice_not_your_decision', 'illegal_discard_choice',
    'illegal_jakis_nowy_powod', 'wrong_inny_moment', 'no_takiego_czegos', 'empty_calkiem_nowe',
    'zupełnie_obcy_kod_x',
  ];
  for (const reason of dlugie) {
    const label = rejectionReasonLabel(reason);
    assert.ok(!/[a-zżźćńółęąś]+_[a-zżźćńółęąś]+/i.test(label),
      `${reason}: etykieta nie może zawierać snake_case — dostaliśmy: „${label}”`);
  }
  // Fallbacki rodzinne nadal opisowe (nie goły tekst generyczny dla wszystkich).
  assert.equal(rejectionReasonLabel('illegal_jakis_nowy_powod'), 'ruch niezgodny z zasadami');
  assert.equal(rejectionReasonLabel('wrong_inny_moment'), 'niewłaściwy moment na tę akcję');
  assert.equal(rejectionReasonLabel('no_takiego_czegos'), 'brak wymaganego elementu');
  assert.equal(rejectionReasonLabel('zupełnie_obcy_kod_x'), 'ruch odrzucony przez zasady gry');
});

test('M348 (anty-over-fix): kody z 1 podkreśleniem zachowują slug w nawiasie', () => {
  // Ustalony kształt etykiet sprzed M348 — krótkie kody są czytelne także
  // z kodem (i pomagają w zgłoszeniach).
  assert.equal(rejectionReasonLabel('not_priority'), 'nie masz teraz priorytetu (not_priority)');
  assert.equal(rejectionReasonLabel('no_targets'), 'brak celów (no_targets)');
  assert.equal(rejectionReasonLabel('illegal_x'), 'ruch niezgodny z zasadami (illegal_x)');
  assert.equal(rejectionReasonLabel('wrong_x'), 'niewłaściwy moment na tę akcję (wrong_x)');
});

test('M348: niezmiennik po CAŁEJ mapie — reguła podkreśleń trzymana dla przyszłych wpisów', () => {
  // Strażnik klasy, nie egzemplarza (L5/L29): każdy klucz mapy przechodzi
  // przez regułę — przy nowym kodzie z 2 podkreśleniami test sam się upomni.
  for (const reason of Object.keys(REJECTION_REASON_LABELS)) {
    const label = rejectionReasonLabel(reason);
    const underscores = (reason.match(/_/g) || []).length;
    if (underscores >= 2) {
      assert.ok(!label.includes(reason), `${reason}: slug wycieka do tekstu gracza: „${label}”`);
    } else {
      assert.ok(label.includes(`(${reason})`), `${reason}: oczekiwany slug w nawiasie: „${label}”`);
    }
  }
});

test('M348: wejścia puste i nie-tekstowe — etykieta generyczna bez wyjątków', () => {
  assert.equal(rejectionReasonLabel(null), 'ruch odrzucony przez zasady gry');
  assert.equal(rejectionReasonLabel(''), 'ruch odrzucony przez zasady gry');
  assert.equal(rejectionReasonLabel(42), 'ruch odrzucony przez zasady gry');
});
