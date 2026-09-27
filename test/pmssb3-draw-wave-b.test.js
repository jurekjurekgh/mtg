// PMSSB-3 fala B: luki wyceny draw (piny v3 -> testy regresji).
// F1: ETB-draw = P.drawCardValue (unifikacja L41; Rager 71.1018 -> 68.4018).
// F2: instant-draw na EOT wroga +10 (lustro M211/A1); sorcery = flat (F3).
// F5: rider ferocious = +5 gdy P>=4 (lustro M67), inaczej 0.
// F-temple: noga-foe both-draw (-12) + ramka isDrawOnly (-1): 62 -> -1 (flip!).
// F-scroll-sac: ability-draw + sacrificeSelf (lustro tokenow): 8 -> 7.
// F-envoy: unwrap ETB (dywergencja): 68.4054 -> 72.9054 / 73.8054.
// F-mysteries: unwrap cast + landEntered (dywergencja): 50 -> 62 / 68.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addCounter } from '../src/engine/counters.js';

const REGISTRY = createCardRegistry();

function newState(step = 'main') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}
function fillLibrary(state, n) {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`, controllerId: 'p1', zone: 'library',
      kind: 'creature', power: 0, toughness: 0, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}`,
    });
  }
}
const BASIC = { W: 'basic-plains', U: 'basic-island', B: 'basic-swamp', R: 'basic-mountain', G: 'basic-forest' };
function addBasics(state, colors, count, tag = 'm') {
  for (let i = 0; i < count; i += 1) {
    const def = REGISTRY.get(BASIC[colors[i % colors.length]]);
    addObject(state, { id: `${tag}L${i}`, instanceId: `i-${tag}L${i}`, cardId: def.id, controllerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def) });
  }
}
function handCard(state, id, cardId) {
  const def = REGISTRY.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand', ...gameObjectDataOf(def) });
}
function fieldCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id, ...extra,
  });
}
function fieldCard(state, id, cardId) {
  const def = REGISTRY.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def) });
}
function scoreOf(state, substr) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  bot.chooseCommand(view);
  const entry = bot.trace().at(-1);
  return entry.options.find((o) => o.cmd.includes(substr))?.score;
}

test('F1: Rager@lib10 = 68.4018 (ETB-draw 9 -> 6, dostarczane 5.4)', () => {
  const s = newState(); fillLibrary(s, 10); addBasics(s, ['B'], 5); handCard(s, 'rager', 'phyrexian-rager');
  assert.ok(Math.abs(scoreOf(s, 'cast_permanent(rager)') - 68.4018) < 0.001);
});

test('F2: inspiration-self na EOT wroga = 21 (11 + 10-okno)', () => {
  const s = newState('end'); fillLibrary(s, 10); addBasics(s, ['U'], 6); handCard(s, 'in', 'inspiration');
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p1';
  assert.equal(scoreOf(s, 'cast_spell(in->p1)'), 21);
});

test('F2: inspiration-self w mainie = 11 (bez premii), foe na EOT = -13 (bez premii)', () => {
  const s = newState(); fillLibrary(s, 10); addBasics(s, ['U'], 6); handCard(s, 'in', 'inspiration');
  assert.equal(scoreOf(s, 'cast_spell(in->p1)'), 11);
  const e = newState('end'); fillLibrary(e, 10); addBasics(e, ['U'], 6); handCard(e, 'in', 'inspiration');
  e.turn.activePlayerId = 'p2'; e.turn.priorityPlayerId = 'p1';
  assert.equal(scoreOf(e, 'cast_spell(in->p2)'), -13);
});

test('F3-flat: reunion main1 = main2 = 17 (sorcery-draw nie czeka)', () => {
  const mk = (step) => {
    const s = newState(step); fillLibrary(s, 10); addBasics(s, ['R'], 4);
    handCard(s, 'reu', 'cathartic-reunion');
    for (const [id, p, t, c] of [['fA', 1, 1, 1], ['fB', 2, 2, 2], ['fC', 5, 5, 5]]) {
      addObject(s, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p1', zone: 'hand', kind: 'creature', power: p, toughness: t, manaCost: c, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id });
    }
    return s;
  };
  assert.equal(scoreOf(mk('main'), 'cast_spell(reu'), 17);
  assert.equal(scoreOf(mk('main2'), 'cast_spell(reu'), 17);
});

test('F5: force-away z ferocious = 90 (+2-rider PMSSB-8/F-L1b), bez = 100 (0-rider)', () => {
  const mk = (fero) => {
    const s = newState(); fillLibrary(s, 10); addBasics(s, ['U'], 4); handCard(s, 'fa', 'force-away');
    fieldCreature(s, 'cel', 'p2', 3, 3);
    if (fero) fieldCreature(s, 'big', 'p1', 4, 4);
    return s;
  };
  assert.equal(scoreOf(mk(true), 'cast_spell(fa->cel)'), 90);
  assert.equal(scoreOf(mk(false), 'cast_spell(fa->cel)'), 100);
});

test('F-temple: pakt = -1 (flip 62 -> trzymaj; noga-foe -12 + ramka -1)', () => {
  const s = newState(); fillLibrary(s, 10); addBasics(s, ['W'], 5);
  handCard(s, 'yt', 'your-temple-is-under-attack');
  fieldCreature(s, 'mine', 'p1', 2, 2); fieldCreature(s, 'yours', 'p2', 2, 2);
  assert.equal(scoreOf(s, 'cast_spell(yt->p2)'), -1);
  assert.equal(scoreOf(s, 'cast_spell(yt->)'), -26);
});

test('F-scroll-sac: scroll-ability = 7 (8 - 1-sac-noncreature)', () => {
  const s = newState(); fillLibrary(s, 10); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 3);
  fieldCard(s, 'scr', 'scroll-of-avacyn');
  assert.equal(scoreOf(s, 'activate_ability(scr'), 7);
});

test('F-envoy: unwrap ETB (bez-counter 72.9054, z-counter 73.8054)', () => {
  const mk = (ctr) => {
    const s = newState(); fillLibrary(s, 10); addBasics(s, ['G'], 6); handCard(s, 'env', 'trade-route-envoy');
    fieldCreature(s, 'kolega', 'p1', 2, 2);
    if (ctr) addCounter(s, 'kolega', '+1/+1', 1);
    return s;
  };
  assert.ok(Math.abs(scoreOf(mk(false), 'cast_permanent(env)') - 72.9054) < 0.001);
  assert.ok(Math.abs(scoreOf(mk(true), 'cast_permanent(env)') - 73.8054) < 0.001);
});

test('F-mysteries: unwrap cast + landEntered (bez-ladu 62, z-ladem 68)', () => {
  const mk = (dropped) => {
    const s = newState(); fillLibrary(s, 10); addBasics(s, ['U'], 7); handCard(s, 'mys', 'mysteries-of-the-deep');
    if (dropped) s.landEnteredThisTurn = { p1: 1 };
    return s;
  };
  assert.equal(scoreOf(mk(false), 'cast_spell(mys'), 62);
  assert.equal(scoreOf(mk(true), 'cast_spell(mys'), 68);
});
