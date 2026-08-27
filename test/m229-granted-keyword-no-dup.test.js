// M229 — audyt Żywym Testerem na nowych taliach (podział ADR 0024).
//
// Znalezisko (warhammer-brg vs mirrodin-brg, seed 23): bot rzuca Awaken the
// Sleeper na Hill Giant gracza — PRZEJMUJE kontrolę do końca tury (poprawna
// gra, nie „buff"), stwór dostaje haste. Kafel przejętego stwora pokazywał
// jednak „Pośpiech · Pośpiech" — keyword NADANY dublował się: raz w linii
// reguł (rulesText czyta keywordy EFEKTYWNE, z grantami), raz jako osobny
// badge grantedKeywords (render ~3026).
//
// Fix: rulesText pokazuje w linii keywordów wyłącznie keywordy WYDRUKOWANE
// (odejmuje grantedKeywords) — nadane mają własny badge. Spójne z dokumentacją
// pola grantedKeywords („efektywne − wydrukowane").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rulesText } from '../src/table/render.js';

test('M229: keyword NADANY nie dubluje się w linii reguł (ma własny badge)', () => {
  // Hill Giant przejęty Awaken the Sleeper: haste jest NADANY (grant do EOT),
  // nie wydrukowany. keywords (widok = efektywne) zawiera haste; grantedKeywords
  // też. Linia reguł nie może pokazać haste (badge to zrobi).
  const info = { keywords: ['haste'], grantedKeywords: ['haste'] };
  const text = rulesText(info);
  const occurrences = (text.match(/Pośpiech/g) ?? []).length;
  assert.equal(occurrences, 0, `haste jest tylko NADANY → nie ma go w linii reguł (dostał: „${text}")`);
});

test('M229: keyword WYDRUKOWANY zostaje w linii reguł', () => {
  // Latający stwór z wydrukowanym flying (bez grantu) — keyword w linii reguł.
  const info = { keywords: ['flying'], grantedKeywords: [] };
  assert.match(rulesText(info), /Latanie/);
});

test('M229: mix — wydrukowany zostaje, nadany schodzi do badge', () => {
  // Stwór z wydrukowanym flying, który dostał haste grantem: linia reguł ma
  // tylko Latanie; Pośpiech pokaże badge grantedKeywords (nie ta funkcja).
  const info = { keywords: ['flying', 'haste'], grantedKeywords: ['haste'] };
  const text = rulesText(info);
  assert.match(text, /Latanie/);
  assert.equal((text.match(/Pośpiech/g) ?? []).length, 0);
});
