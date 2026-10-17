// PMSSB-63/S (batch 68) — Secure the Scene: wymiana ciał (wygnanie + token dla kontrolera celu).
// Pomiar PRZED/PO: tools/pmssb63-batch68-audyt-sonda.mjs (SEC1–SEC4).
// Model: wartość = (karta wroga + jego ciało) − ciało tokena − (koszt mojej karty + many).
// Składowe S2 (1/1 wroga, MV1): −6 −5 +6 +4 −3 +2 (TMC celu) −0.05 = −2.05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDYT_SCENARIOS, runAudyt, buildAudyt, decideWith, bestOf } from '../tools/pmssb63-batch68-audyt-sonda.mjs';

const sc = (prefix) => AUDYT_SCENARIOS.find((s) => s.id.startsWith(prefix));

test('PMSSB-63/S1 duży wróg 5/5 MV5: rzut (wymiana opłacalna, token 1/1 nie zastąpi zagrożenia)', () => {
  assert.equal(runAudyt(sc('SEC1')).ok, true);
});

test('PMSSB-63/S2 wróg 1/1 MV1: pass (wymiana 1/1 za token 1/1 + 5 many za nic)', () => {
  assert.equal(runAudyt(sc('SEC2')).ok, true);
});

test('PMSSB-63/S3 wróg 4/4 MV4 przy moim 3/3: rzut (zagrożenie największego stwora)', () => {
  assert.equal(runAudyt(sc('SEC3')).ok, true);
});

test('PMSSB-63/S4 tylko mój stwór na stole: pass (cel tylko wrogi, nie wygnanie własnego)', () => {
  assert.equal(runAudyt(sc('SEC4')).ok, true);
});

test('PMSSB-63/S-pin S2: wynik = −2.05 (składowe modelu, nie przypadek)', () => {
  const state = buildAudyt(sc('SEC2'));
  const { bot } = decideWith(state);
  const best = bestOf(bot, 'cast_spell(kar');
  assert.ok(Math.abs(best - (-2.05)) < 0.01, `wynik ${best}`);
});

test('PMSSB-63/S-pokrętło: creatureManaCostWeight ×0 zdejmuje karę za many → S2 rzuca (mana steruje wynikiem)', () => {
  // −6 +6 +4 −3 +2 −0.05 + 0 = 2.95 > 0
  assert.equal(runAudyt(sc('SEC2'), { creatureManaCostWeight: 0 }).choice.type, 'cast_spell');
});

test('PMSSB-63/S-pokrętło: massDestroyCastCost ×0 zdejmuje koszt mojej karty → S2 rzuca (karta steruje wynikiem)', () => {
  // −5 +6 +4 −3 +2 −0.05 = 3.95 > 0
  assert.equal(runAudyt(sc('SEC2'), { massDestroyCastCost: 0 }).choice.type, 'cast_spell');
});

test('PMSSB-63/S-anty-over-fix: duży cel wroga nadal rzucany po przejściu na model wymiany (nie przykręcone na ślepo)', () => {
  // S1 i S3 nadal rzucane — wymiana ciał nie zabija każdego wygnania.
  assert.equal(runAudyt(sc('SEC1')).choice.type, 'cast_spell');
  assert.equal(runAudyt(sc('SEC3')).choice.type, 'cast_spell');
});
