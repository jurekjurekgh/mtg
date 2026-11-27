// M111 — strażnik pola `support.limitations`.
//
// Zasada (polecenie właściciela „100 % kart wg Oracle"): `limitations` znaczy
// „TU NIE GRAMY PEŁNEGO ORACLE" i nic więcej. Opisy zachowania (jak działa
// decyzja, co znaczy „one or more", jaka jest polityka deterministyczna)
// mieszkają w polu `notes`.
//
// Dzięki temu liczba kart z niepustym `limitations` jest wiarygodnym
// licznikiem długu wobec Oracle — a nowa karta z ograniczeniem wymusza
// świadomą decyzję: albo dopisujemy ją tutaj z uzasadnieniem, albo
// implementujemy pełne Oracle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();

/**
 * Jedyne dopuszczone POWODY ograniczeń. Każdy nowy powód to decyzja do
 * przedyskutowania z właścicielem, nie „wpiszę i zapomnę".
 */
const ALLOWED_REASONS = [
  {
    id: 'token',
    match: (text) => /token — nie można umieścić w talii/.test(text),
    why: 'token nie jest kartą (CR 111) — nie wchodzi do talii ani kreatora',
  },
  {
    id: 'druga-strona',
    match: (text) => /nie można umieścić w talii|nie do talii/.test(text),
    why: 'tylna strona karty dwustronnej — do gry trafia wyłącznie przez transform',
  },
  {
    id: 'brak-strefy-dowodzenia',
    match: (text) => /command zone/.test(text),
    why: 'format 1v1 bez strefy dowodzenia — świadoma decyzja właściciela (nie kodujemy trybów wieloosobowych)',
  },
  {
    // Batch 75 (Coordinated Maneuver, tryb A): Oracle „target creature or
    // planeswalker" — planeswalkery jako TYP nie istnieją w silniku
    // (card-data.js, decyzja architektoniczna), więc cel trybu A ograniczono
    // do stwora. To fakt STRUKTURALNY (j.w. — brak typu), nie brak reguły.
    id: 'brak-planeswalkerow',
    match: (text) => /planeswalker — typ nie istnieje w silniku/.test(text),
    why: 'planeswalkery nie istnieją w silniku jako typ (brak lojalności/komend) — ograniczenie celu do istniejących typów',
  },
];

test('limitations znaczy WYŁĄCZNIE realną lukę wobec Oracle', () => {
  const unexpected = [];
  for (const card of REGISTRY.all()) {
    for (const text of card.support.limitations ?? []) {
      if (!ALLOWED_REASONS.some((reason) => reason.match(text))) {
        unexpected.push(`${card.id}: ${text}`);
      }
    }
  }
  assert.deepEqual(unexpected, [],
    `karty z ograniczeniem spoza listy dopuszczonych powodów:\n  ${unexpected.join('\n  ')}\n`
    + 'Albo zaimplementuj pełne Oracle, albo dopisz powód do ALLOWED_REASONS '
    + 'z uzasadnieniem (opisy zachowania idą do pola `notes`).');
});

test('notes NIE opisuje luk — nie mówi „nie obsługujemy/nie obejmuje"', () => {
  const suspicious = [];
  for (const card of REGISTRY.all()) {
    for (const text of card.notes ?? []) {
      // ADR 0022 (M157): słowo 'uproszczenie' w kontekście zachowania karty to
      // luka wobec Oracle opisana jako polityka — zakazana (pełny Oracle albo
      // unsupported).
      if (/nie obsługuj|nie obejmuje|bez wsparcia|nieobsługiwan|uproszczen/i.test(text)) {
        suspicious.push(`${card.id}: ${text}`);
      }
    }
  }
  assert.deepEqual(suspicious, [],
    'notatka brzmi jak ograniczenie — jeśli to luka wobec Oracle, przenieś ją do limitations');
});

test('każda karta ma pole notes (kontrakt defineCard)', () => {
  for (const card of REGISTRY.all()) {
    assert.ok(Array.isArray(card.notes), `${card.id}: brak pola notes`);
  }
});
