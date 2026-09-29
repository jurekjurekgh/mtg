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
import { matchColorRequirements } from '../src/engine/mana-cost.js';

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

test('granice katalogu: {C} w koszcie ZDOLNOŚCI obsługiwany, spoza WUBRG/{C} — nie', () => {
  // Batch 61/158 (Kozilek's Shrieker) wprowadził pierwszy pip bezbarwny
  // katalogu — w koszcie AKTYWOWANEJ zdolności (`cost` z kluczem `mana`,
  // inaczej niż koszty alternatywne kart, patrz test niżej). Ta droga jest
  // obsługiwana end-to-end: `matchColorRequirements` (CR 107.4c) dopuszcza
  // dla `['C']` wyłącznie jednostkę bezbarwną `[]`, a wołają go walidacja,
  // oferta i płatność (resources.js). Strażnik pilnuje więc DWÓCH rzeczy:
  // (a) żaden inny symbol niż WUBRG/{C} nie wchodzi do kosztów zdolności,
  // (b) znana karta z {C} nadal istnieje (inaczej asercja (a) jest pusta).
  const zle = [];
  const zC = [];
  const visit = (cardId, node, path) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.colors) && Number.isInteger(node.mana)) {
      const spoza = node.colors.filter((c) => !['W', 'U', 'B', 'R', 'G', 'C'].includes(c));
      if (spoza.length) zle.push(`${cardId}:${path} {${spoza.join('')}}`);
      if (node.colors.includes('C')) zC.push(`${cardId}:${path}`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object' && key !== 'imageUri') visit(cardId, value, `${path}.${key}`);
    }
  };
  for (const def of registry.all()) visit(def.id, def, '');
  assert.deepEqual(zle, [],
    'Koszt zdolności z symbolem spoza WUBRG/{C} — zaimplementuj go w matchColorRequirements (patrz nagłówek src/engine/mana-cost.js)');
  assert.ok(zC.length >= 1,
    'Brak karty z {C} w koszcie zdolności — jeśli 158 wypadła z katalogu, usuń ten strażnik ŚWIADOMIE');

  // (c) reguła płatności: {C} opłaca tylko jednostka bezbarwna [].
  assert.equal(matchColorRequirements([[]], [['C']]), true, 'bezbarwna jednostka opłaca {C}');
  assert.equal(matchColorRequirements([['R']], [['C']]), false, 'czerwona jednostka NIE opłaca {C}');
  assert.equal(matchColorRequirements([['R']], [['R']]), true, 'kontrola: {R} opłaca czerwona');
  assert.equal(matchColorRequirements([[]], [['R']]), false, 'kontrola: bezbarwna NIE opłaca {R}');
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
