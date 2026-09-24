// Etap F (PR #135) — STRAŻNIK GRANIC KATALOGU.
//
// Polecenie właściciela (2026-09-24): „Kart, których nie ma, nie trzeba
// okodowywać. Jak się pojawią, to wtedy — warto to jasno opisać
// w komentarzach w kodzie." Każdy test poniżej pilnuje jednej reguły CR,
// której silnik ŚWIADOMIE nie implementuje, bo w katalogu nie ma karty, która
// by jej wymagała. Gdy test pęknie, to znaczy, że do katalogu weszła taka
// karta — wtedy trzeba zaimplementować regułę w miejscu wskazanym przez
// komunikat (tam też leży komentarz z opisem poprawnego modelu), a nie
// poluzować strażnika.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const registry = createCardRegistry();

test('granice katalogu: koszty many zawierają wyłącznie symbole obsługiwane przez parseManaCost', () => {
  // Obsługiwane: {N}, {X}, {W}{U}{B}{R}{G}, hybryda dwukolorowa {W/B},
  // phyrexian {W/P} i phyrexian hybryda {W/U/P} (src/engine/mana-cost.js).
  // NIEobsługiwane (brak w katalogu): {C} (CR 107.4c — wymaga many
  // bezbarwnej), hybryda mono {2/W}, {S}, {H} i inne.
  const supported = /^(\d+|X|[WUBRG]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|[WUBRG]\/[WUBRG]\/P)$/;
  const offenders = [];
  for (const [cardId, cost] of Object.entries(MANA_COSTS)) {
    if (cost == null) continue;
    for (const [, token] of String(cost).matchAll(/\{([^}]+)\}/g)) {
      if (!supported.test(token)) offenders.push(`${cardId}: {${token}}`);
    }
  }
  assert.deepEqual(offenders, [],
    'Nowy symbol many w katalogu — zaimplementuj go w parseManaCost i płatnościach (patrz nagłówek src/engine/mana-cost.js)');
});

test('granice katalogu: koszty alternatywne w katalogu nie mają {C}', () => {
  // Deskryptory kosztów alternatywnych (escape/cleave/flashback/bestow/surge/
  // madness/warp/plot/kicker/offspring/przygoda) zapisują pipy jako `colors`
  // z WUBRG — pip bezbarwny nie ma tam reprezentacji (CR 107.4c).
  const offenders = [];
  const visit = (cardId, node, path) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.colors) && node.colors.some((c) => !['W', 'U', 'B', 'R', 'G'].includes(c))
      && Number.isInteger(node.cost ?? node.manaCost)) {
      offenders.push(`${cardId}:${path}`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object' && key !== 'imageUri') visit(cardId, value, `${path}.${key}`);
    }
  };
  for (const def of registry.all()) visit(def.id, def, '');
  assert.deepEqual(offenders, []);
});
