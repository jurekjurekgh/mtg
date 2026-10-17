// PMSSB-63/K (batch 68) — Kulrath Zealot: basic landcycling {1}{R} jako wymiana karty na ląd.
// Pomiar PRZED/PO: tools/pmssb63-batch68-audyt-sonda.mjs (KUL1–KUL4). PRZED: landcycling = +2 (KUL2/KUL3 best 2).
// Model (L41, ta sama miara co szukanie): landKeepValue(znaleziony ląd) − cardKeepValue(oddany Kulrath).
// KUL3: landKeepCritical 30 (0 lądów) − cardKeepValue(6-drop, zasięg 1, koszt 6 > 3) = 30 − (−3) = 33.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDYT_SCENARIOS, runAudyt, buildAudyt, decideWith, bestOf } from '../tools/pmssb63-batch68-audyt-sonda.mjs';
import { putCard } from '../tools/pmssb63-batch68-sonda.mjs';

const sc = (prefix) => AUDYT_SCENARIOS.find((s) => s.id.startsWith(prefix));

test('PMSSB-63/K1 pusty stół, 6 many: rzut Kulratha (ETB + karta)', () => {
  assert.equal(runAudyt(sc('KUL1')).ok, true);
});

test('PMSSB-63/K2 5 many, 0 lądów: nie rzuca 6-drop, ale landcykluje (ziemia na przyszłość)', () => {
  const r = runAudyt(sc('KUL2'));
  assert.equal(r.ok, true);
  assert.equal(r.choice.type, 'activate_ability');
});

test('PMSSB-63/K3 2 many, 0 lądów: landcykling (bez ziem nic się nie zagra)', () => {
  assert.equal(runAudyt(sc('KUL3')).ok, true);
});

test('PMSSB-63/K4 5 ziem na stole: NIE landcykluje (bramka −5, ziemi wystarczy)', () => {
  assert.equal(runAudyt(sc('KUL4')).ok, true);
});

test('PMSSB-63/K-pin: landcykling z 0 lądami = 33 (30 ziemia krytyczna + 3 oddany 6-drop poza zasięgiem)', () => {
  const { bot } = decideWith(buildAudyt(sc('KUL3')));
  const best = bestOf(bot, 'activate_ability(kz');
  assert.ok(Math.abs(best - 33) < 0.01, `wynik ${best}`);
});

test('PMSSB-63/K-pokrętło: landKeepCritical −40 → landcykling schodzi pod pass (drabina land steruje wynikiem)', () => {
  assert.equal(runAudyt(sc('KUL3'), { landKeepCritical: -40 }).choice.type, 'pass_priority');
});

test('PMSSB-63/K-anty-over-fix: tanie castowalne zagranie (Bloodfire 3 many) wygrywa z landcyklingiem (33)', () => {
  // Ręka: Kulrath + Bloodfire, 5 many czerwonej, 0 lądów. Bloodfire (≈67) > landcykling (33):
  // nowa wycena landcyklingu nie może wyprzeć lepszego, tańszego zagrania.
  const state = buildAudyt(sc('KUL2'));
  putCard(state, 'bf', 'bloodfire-expert', 'p2', 'hand');
  const { choice } = decideWith(state);
  assert.equal(choice.type, 'cast_permanent', `wybór: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'bf');
});
