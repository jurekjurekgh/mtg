// PMSSB-6 fala A (F-A1/A2/A3/A4): model foeRipValue (blind-4/reveal-8) +
// strazniki-fizzle + galaz-ability + rider-delusion.
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
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  addMana(state, 'p1', 12);
  return state;
}
function handCard(state, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'hand', ...gameObjectDataOf(def) });
}
function foeHand(state, cardIds) {
  cardIds.forEach((cid, i) => handCard(state, `fh${i}`, cid, 'p2'));
}
function foeGraveCreature(state, id = 'gc') {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p2', ownerId: 'p2', zone: 'graveyard', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id });
}
function fieldCard(state, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield', ...gameObjectDataOf(def) });
}
function scores(state, match) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  const options = bot.trace().at(-1).options.filter((o) => o.cmd.includes(match));
  return { chosen, options };
}

// F-A1: model — 5 czarow vs reka-3 (PRZED: 50/50/50/50/59).
for (const [id, want] of [['divest', 58], ['dreams-of-steel-and-oil', 58], ['mindstab', 62], ['nightsnare', 66], ['toll-of-the-invasion', 67]]) {
  test(`F-A1: ${id} vs reka-3 = ${want}`, () => {
    const s = newState(); handCard(s, 'rip', id); foeHand(s, ['shock', 'twiddle', 'fireball']);
    const { chosen, options } = scores(s, 'cast_spell(rip->p2');
    assert.equal(options.length, 1);
    assert.equal(options[0].score, want);
    assert.equal(chosen.type, 'cast_spell');
  });
}
// F-A2: strazniki — rip w pustke = -70 (toll ratuje amass: 59).
for (const [id, want] of [['divest', -70], ['dreams-of-steel-and-oil', -70], ['mindstab', -70], ['nightsnare', -70], ['toll-of-the-invasion', 59]]) {
  test(`F-A2: ${id} vs pusta reka = ${want}`, () => {
    const s = newState(); handCard(s, 'rip', id);
    const { chosen, options } = scores(s, `cast_spell(rip->p2`);
    assert.equal(options[0].score, want);
    if (want === 59) assert.equal(chosen.type, 'cast_spell');
    else assert.notEqual(chosen.type, 'cast_spell');
  });
}
test('F-A2: mindstab w pustke woli suspend (emergentne, nie -70-rzut)', () => {
  const s = newState(); handCard(s, 'rip', 'mindstab');
  const { chosen } = scores(s, 'cast_spell(rip');
  assert.equal(chosen.type, 'suspend_card');
});
test('F-A1 cap: mindstab-3 vs 1-karta = 54, vs 7-kart = 62; divest bez skali (58 == 58); nightsnare vs 1-karta = 58', () => {
  for (const [id, k, want] of [['mindstab', 1, 54], ['mindstab', 7, 62], ['divest', 1, 58], ['divest', 7, 58], ['nightsnare', 1, 58]]) {
    const s = newState(); handCard(s, 'rip', id);
    foeHand(s, Array.from({ length: k }, (_, i) => ['shock', 'twiddle', 'fireball'][i % 3]));
    const { options } = scores(s, 'cast_spell(rip->p2');
    assert.equal(options[0].score, want, `${id}/${k}`);
  }
});
test('F-A1 dreams: grob-ratuje (pusta-reka + stwor-w-grobie = 56, strzela)', () => {
  const s = newState(); handCard(s, 'rip', 'dreams-of-steel-and-oil'); foeGraveCreature(s);
  const { chosen, options } = scores(s, 'cast_spell(rip->p2');
  assert.equal(options[0].score, 56);
  assert.equal(chosen.type, 'cast_spell');
});
test('F-A2 dreams: pusta-reka i pusty-grob = -70 (guard pelny)', () => {
  const s = newState(); handCard(s, 'rip', 'dreams-of-steel-and-oil');
  const { options } = scores(s, 'cast_spell(rip->p2');
  assert.equal(options[0].score, -70);
});
test('F-A1 hecteyes: pusta = 63.0, reka-3 = 66.6 (waga-rodziny permanent x0.9!)', () => {
  for (const [k, want] of [[0, 63.0], [3, 66.6]]) {
    const s = newState(); handCard(s, 'he', 'hecteyes');
    foeHand(s, Array.from({ length: k }, () => 'shock'));
    const { options } = scores(s, 'cast_permanent(he');
    assert.ok(Math.abs(options[0].score - want) < 1e-9, `${k}: ${options[0].score}`);
  }
});
test('F-A3 bat: reka-3 = -1 (flip ogon->trzymaj!), pusta = -40 (guard)', () => {
  for (const [k, want] of [[3, -1], [0, -40]]) {
    const s = newState(); fieldCard(s, 'bat', 'dementia-bat');
    foeHand(s, Array.from({ length: k }, () => 'shock'));
    const { chosen, options } = scores(s, 'activate_ability(bat#0->p2');
    assert.equal(options[0].score, want);
    assert.equal(chosen.type, 'pass_priority');
  }
});
test('F-A3 skullcairn: reka-2 = -54 (stabilne trzymaj), pusta = -58 (cap-0!)', () => {
  for (const [k, want] of [[2, -54], [0, -58]]) {
    const s = newState(); fieldCard(s, 'sk', 'immersturm-skullcairn');
    foeHand(s, Array.from({ length: k }, () => 'shock'));
    addObject(s, { id: 'wrog', instanceId: 'i-wrog', cardId: 'x-wrog', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'wrog' });
    const { options } = scores(s, 'activate_ability(sk#1->p2');
    assert.equal(options[0].score, want);
  }
});
test('F-A1 guard: self-rip bez zmian (divest +3, mindstab -1); self-lone-divest = -70 (inert!)', () => {
  for (const [id, want] of [['divest', 3], ['mindstab', -1]]) {
    const s = newState(); handCard(s, 'rip', id); foeHand(s, ['shock', 'twiddle', 'fireball']);
    handCard(s, 'c1', 'shock'); handCard(s, 'c2', 'twiddle');
    const { options } = scores(s, 'cast_spell(rip->p1');
    assert.equal(options[0].score, want, id);
  }
  const s = newState(); handCard(s, 'rip', 'divest');
  assert.equal(scores(s, 'cast_spell(rip->p1').options[0].score, -70);
});
test('F-A1 guard: loot nietkniety (scholar +8, fisher 74.7036)', () => {
  const a = newState(); fieldCard(a, 'sc', 'civilized-scholar');
  for (let i = 0; i < 10; i += 1) addObject(a, { id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`, controllerId: 'p1', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}` });
  handCard(a, 'c1', 'shock'); handCard(a, 'c2', 'twiddle');
  assert.equal(scores(a, 'activate_ability(sc#0').options[0].score, 8);
  const b = newState(); handCard(b, 'fi', 'quicksilver-fisher');
  for (let i = 0; i < 10; i += 1) addObject(b, { id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`, controllerId: 'p1', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}` });
  handCard(b, 'c1', 'shock'); handCard(b, 'c2', 'twiddle');
  assert.ok(Math.abs(scores(b, 'cast_permanent(fi').options[0].score - 74.7036) < 1e-9);
});
test('F-A4: rider-delusion zyje (tapped-out + reka-3 = 54)', () => {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p1';
  s.turn.number = 5;
  addMana(s, 'p1', 9);
  handCard(s, 'dl', 'frightful-delusion');
  const fb = REG.get('fireball');
  addObject(s, { id: 'fbst', instanceId: 'i-fbst', cardId: 'fireball', controllerId: 'p2', ownerId: 'p2', zone: 'stack', ...gameObjectDataOf(fb) });
  foeHand(s, ['shock', 'twiddle', 'fireball']);
  const { chosen, options } = scores(s, 'cast_spell(dl');
  assert.equal(options[0].score, 54);
  assert.equal(chosen.type, 'cast_spell');
});
