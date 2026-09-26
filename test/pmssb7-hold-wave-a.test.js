// PMSSB-7 Wave-A: domknięcie hold — divest-self (F-H1) + martwy −25 (F-H2) + sweep.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const mk = () => {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14); return s;
};
const put = (s, id, cid, ctl = 'p1', zone = 'hand') => {
  const d = REG.get(cid);
  addObject(s, { id, instanceId: 'i-' + id, cardId: cid, controllerId: ctl, ownerId: ctl, zone, ...gameObjectDataOf(d) });
};
const mine22 = (s) => addObject(s, { id: 'mine', instanceId: 'i-m', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'mine' });
const decide = (s) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  const ch = b.chooseCommand(v);
  return { ch, opts: b.trace().at(-1).options };
};
const scoreOf = (opts, frag) => opts.find((o) => o.cmd.includes(frag))?.score;

describe('PMSSB-7 Wave-A: hold-closure', () => {
  it('F-H1: divest-self+2friends = -5 (flip z +3, trzyma)', () => {
    const s = mk(); put(s, 'dv', 'divest'); put(s, 'f1', 'shock'); put(s, 'f2', 'shock');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(dv->p1)'), -5);
    assert.ok(scoreOf(opts, 'cast_spell(dv->p1)') < 0);
  });
  it('F-H1: bot woli rzucić shock niż divest-self', () => {
    const s = mk(); put(s, 'dv', 'divest'); put(s, 'f1', 'shock'); put(s, 'f2', 'shock');
    const { ch } = decide(s);
    assert.equal(ch.type, 'cast_spell');
    assert.ok(ch.objectId === 'f1' || ch.objectId === 'f2');
  });
  it('F-H1: mindstab-self+2shock = -9 (trzyma mocniej)', () => {
    const s = mk(); put(s, 'ms', 'mindstab'); put(s, 'f1', 'shock'); put(s, 'f2', 'shock');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(ms->p1)'), -9);
  });
  it('F-H1-kontekst: samotny divest-self = -70 (F-A2, pusta ręka)', () => {
    const s = mk(); put(s, 'dv', 'divest');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(dv->p1)'), -70);
  });
  it('F-H2: flurry-main-bez-ataku = -70 (allEffects, nie martwy -25)', () => {
    const s = mk(); put(s, 'fl', 'flurry-of-wings');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(fl'), -70);
  });
  it('F-H2: howl-bez-ziemi = -70', () => {
    const s = mk(); put(s, 'hw', 'howl-of-the-night-pack');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(hw'), -70);
  });
  it('sweep: temple-bez-stworow = -70', () => {
    const s = mk(); put(s, 'tp', 'your-temple-is-under-attack');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(tp->)'), -70);
  });
  it('sweep: spare-bez-stworow = -70', () => {
    const s = mk(); put(s, 'sp', 'spare-from-evil');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(sp'), -70);
  });
  it('sweep: wrap-pusty-stol = -70', () => {
    const s = mk(); put(s, 'wf', 'wrap-in-flames');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(wf'), -70);
  });
  it('sweep: blindness-bez-stworow-wroga = -70', () => {
    const s = mk(); put(s, 'hb', 'hysterical-blindness');
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(hb'), -70);
  });
  it('sweep: volley-bez-celu nie ma oferty (silnik)', () => {
    const s = mk(); put(s, 'sv', 'sagittars-volley');
    const { opts } = decide(s);
    assert.equal(opts.filter((o) => o.cmd.includes('cast_spell(sv')).length, 0);
  });
  it('sweep: force-away-na-wlasnego-2/2 = -114', () => {
    const s = mk(); put(s, 'fa', 'force-away'); mine22(s);
    const { opts } = decide(s);
    assert.equal(scoreOf(opts, 'cast_spell(fa->mine)'), -114);
  });
});
