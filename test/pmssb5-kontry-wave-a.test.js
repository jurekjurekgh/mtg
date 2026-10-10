// PMSSB-5 fala A (F-H3): bramka HIGH_IMPACT += 6 podtypow.
// K10 PRZED: -10 (trzyma); PO: 50 (strzela). Guardy: reszta bez ruchu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  addMana(state, 'p1', 9);
  return state;
}
function handCard(state, id, cardId) {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand', ...gameObjectDataOf(def) });
}
function stackSpell(state, id, cardId, controllerId) {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'stack', ...gameObjectDataOf(def) });
}
function foeLand(state, id, tapped) {
  const def = REG.get('basic-island');
  addObject(state, { id, instanceId: `i-${id}`, cardId: def.id, controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', ...gameObjectDataOf(def) });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
}
function scores(state, match) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  const options = bot.trace().at(-1).options.filter((o) => o.cmd.includes(match));
  return { chosen, options };
}

// Flipy F-H3: 6 luk K10 strzela (L: 50 → 50+22+6×MV — premia za zatrzymanie,
// baza 50 + removal-parytet 22 + waga TMC zatrzymywanego czaru).
for (const [id, want] of [['divest', 78], ['dreams-of-steel-and-oil', 78], ['divine-offering', 84], ['unearth', 78], ['forced-landing', 84], ['lilianas-triumph', 84]]) {
  test(`F-H3: negate strzela w ${id} (${want})`, () => {
    const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'foe', id, 'p2');
    const { chosen, options } = scores(s, 'cast_spell(ng');
    assert.equal(options.length, 1);
    assert.equal(options[0].score, want);
    assert.equal(chosen.type, 'cast_spell');
  });
}
test('F-H3 guard: twiddle dalej trzymany (-10)', () => {
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'tw', 'twiddle', 'p2');
  const { chosen, options } = scores(s, 'cast_spell(ng');
  assert.equal(options[0].score, -10);
  assert.equal(chosen.type, 'pass_priority');
});
test('F-H3 guard: mill (tome-scour) dalej trzymany (-10)', () => {
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'mill', 'tome-scour', 'p2');
  const { options } = scores(s, 'cast_spell(ng');
  assert.equal(options[0].score, -10);
});
test('F-H3 guard: modal z groznym trybem strzela (selesnya-charm 84)', () => {
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'ch', 'selesnya-charm', 'p2');
  const { options } = scores(s, 'cast_spell(ng');
  assert.equal(options[0].score, 84); // L: MV2 → 50+22+12
});
test('F-H3 guard: fireball 78, shock-MV1 78, wlasny -90', () => {
  for (const [id, ctl, want] of [['fireball', 'p2', 78], ['shock', 'p2', 78], ['shock', 'p1', -90]]) {
    const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'x', id, ctl);
    const { options } = scores(s, 'cast_spell(ng');
    assert.equal(options[0].score, want, `${id}/${ctl}`);
  }
});
test('F-H3 guard: delusion -40 (placi) / 78 (tapped-out)', () => {
  // L: tapped-out 50→78 (fireball MV1: 50+22+6); płacący BEZ premii (-40 —
  // wykupiona kontra wygasa, flaga counterUnlessPaidOff).
  for (const [tapped, want] of [[false, -40], [true, 78]]) {
    const s = newState(); handCard(s, 'dl', 'frightful-delusion'); stackSpell(s, 'fb', 'fireball', 'p2');
    foeLand(s, 'isl', tapped);
    const { options } = scores(s, 'cast_spell(dl');
    assert.equal(options[0].score, want);
  }
});
test('F-H3 guard: platnik dalej flat 85/10 (1-drop i 7-drop rowno)', () => {
  for (const id of ['shock', 'howl-of-the-night-pack']) {
    const s = newState(); stackSpell(s, 'mine', id, 'p1');
    s.pendingCounterPay = { playerId: 'p1', targetId: 'mine', amount: 1, sourceId: 'x', discardCount: 1 };
    const { options } = scores(s, 'resolve_counter_pay_choice');
    assert.deepEqual(options.map((o) => o.score).sort((a, b) => b - a), [85, 10]);
  }
});
test('F-H3 guard: wojna kontr 84, sabo-bounce 80, fuel 78', () => {
  const w = newState(); handCard(w, 'ng', 'negate'); stackSpell(w, 'mine', 'shock', 'p1'); stackSpell(w, 'fn', 'negate', 'p2');
  assert.equal(scores(w, 'cast_spell(ng->fn').options[0].score, 84); // L: foe negate MV2 → 50+22+12
  const b = newState(); handCard(b, 'sb', 'steel-sabotage');
  addObject(b, { id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'artifact', power: 0, toughness: 0, manaCost: 3, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'art' });
  assert.equal(scores(b, 'cast_spell(sb').options[0].score, 80);
  const f = newState(); handCard(f, 'ff', 'fuel-for-the-cause'); stackSpell(f, 'fb', 'fireball', 'p2');
  assert.equal(scores(f, 'cast_spell(ff').options[0].score, 78); // L: fireball MV1 → 50+22+6 (+0 proliferate)
});
test('F-H3 guard: abstruse 87.97 / -30.03 (token +10, tie-break F7)', () => {
  // L: tapped-out 59.97→87.97 (+28 premii za zatrzymany fireball MV1);
  // untapped BEZ premii (-30.03 — płatnik się wykupi, flaga counterUnlessPaidOff).
  for (const [tapped, want] of [[true, 87.97], [false, -30.03]]) {
    const s = newState(); handCard(s, 'ab', 'abstruse-interference'); stackSpell(s, 'fb', 'fireball', 'p2');
    foeLand(s, 'isl', tapped);
    const { options } = scores(s, 'cast_spell(ab');
    assert.ok(Math.abs(options[0].score - want) < 1e-9, `${want}: ${options[0].score}`);
  }
});
test('F-H3 guard: wybor celu 78 vs -10 (fireball bije twiddle)', () => {
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'fb', 'fireball', 'p2'); stackSpell(s, 'tw', 'twiddle', 'p2');
  const { chosen, options } = scores(s, 'cast_spell(ng');
  assert.deepEqual(options.map((o) => o.score).sort((a, b) => b - a), [78, -10]);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['fb']);
});
