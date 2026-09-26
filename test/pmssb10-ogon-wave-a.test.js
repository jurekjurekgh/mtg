// PMSSB-10 Wave-A: anticipacja-ogona (F-O: gated/cast/negatywy/aury-host).
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
const fillLib = (s, n = 30) => {
  for (let i = 0; i < n; i++) addObject(s, { id: `lb${i}`, instanceId: `i-lb${i}`, cardId: `x-lb${i}`, controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: `lb${i}` });
};
const dude = (s, id, ctl, p = 2, t = 2, kw = []) => addObject(s, { id, instanceId: 'i-' + id, cardId: 'x', controllerId: ctl, ownerId: ctl, zone: 'battlefield', kind: 'creature', power: p, toughness: t, manaCost: 2, abilities: [], keywords: kw, subtypes: [], types: ['Creature'], colors: [], cardName: id });
const decide = (s) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(v);
  return b.trace().at(-1).options;
};
const disp = (opts, frag) => Number(opts.find((o) => o.cmd.includes(frag))?.score.toFixed(1));

describe('PMSSB-10 Wave-A: anticipacja-ogona', () => {
  it('F-O: scrollthief = 66.6 (było 63.9: gated-draw +2.7)', () => {
    const s = mk(); fillLib(s); put(s, 'st', 'scroll-thief');
    assert.equal(disp(decide(s), 'cast_permanent(st'), 66.6);
  });
  it('F-O: wrecker-pusty = 64.8 / wrecker+cel = 68.4 (exile-gated!)', () => {
    const a = mk(); fillLib(a); put(a, 'kw', 'kappa-tech-wrecker');
    assert.equal(disp(decide(a), 'cast_permanent(kw'), 64.8);
    const b = mk(); fillLib(b); put(b, 'kw', 'kappa-tech-wrecker'); dude(b, 'foe', 'p2');
    assert.equal(disp(decide(b), 'cast_permanent(kw'), 68.4);
  });
  it('F-O: robber = 66.9 (foe-token-NET +2.1: ciało-ujemne + upkeep-wroga!)', () => {
    const s = mk(); fillLib(s); put(s, 'rr', 'relic-robber');
    assert.equal(disp(decide(s), 'cast_permanent(rr'), 66.9);
  });
  it('F-O: disa = 70.2 BEZ ZMIAN (goyf-0/0 nieczytelny, konserwatywnie 0)', () => {
    const s = mk(); fillLib(s); put(s, 'di', 'disa-the-restless');
    assert.equal(disp(decide(s), 'cast_permanent(di'), 70.2);
  });
  it('F-O: curiosity+host = 67.5 / blokowany = 66.2 (bramka-gospodarza!)', () => {
    const a = mk(); fillLib(a); put(a, 'cu', 'curiosity'); dude(a, 'mine', 'p1', 2, 2, ['flying']);
    assert.equal(disp(decide(a), 'cast_permanent(cu'), 67.5);
    const b = mk(); fillLib(b); put(b, 'cu', 'curiosity'); dude(b, 'mine', 'p1'); dude(b, 'ff', 'p2', 2, 2, ['flying']);
    assert.equal(disp(decide(b), 'cast_permanent(cu->mine'), 66.2);
  });
  it('F-O: flooding = 76.8 (było 58.5: mill-0.7×29!)', () => {
    const s = mk(); fillLib(s); put(s, 'au', 'chronic-flooding');
    addObject(s, { id: 'land1', instanceId: 'i-land1', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'land', power: 0, toughness: 0, manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: [], cardName: 'land1' });
    assert.equal(disp(decide(s), 'cast_permanent(au'), 76.8);
  });
  it('F-O: jester = 64.8 (cant_block +0.9; self-red otwiera bramkę)', () => {
    const s = mk(); fillLib(s); put(s, 'gj', 'goblin-battle-jester');
    assert.equal(disp(decide(s), 'cast_permanent(gj'), 64.8);
  });
  it('F-O: demon = 64.8 (było 71.1: sac-NEGATYW −6.3!)', () => {
    const s = mk(); fillLib(s); put(s, 'id', 'illusory-demon');
    assert.equal(disp(decide(s), 'cast_permanent(id'), 64.8);
  });
  it('F-O: tellah = 69.3 (token +4.5; nogi-manaSpent SKIP!)', () => {
    const s = mk(); fillLib(s); put(s, 'tg', 'tellah-great-sage');
    assert.equal(disp(decide(s), 'cast_permanent(tg'), 69.3);
  });
  it('F-O: harvester = 69.6 (drain+counter ×0.7: +5.7!)', () => {
    const s = mk(); fillLib(s); put(s, 'nh', 'nightshade-harvester');
    assert.equal(disp(decide(s), 'cast_permanent(nh'), 69.6);
  });
  it('F-O: guard/windscout/devotee = 69.3/68.0/66.4', () => {
    const a = mk(); fillLib(a); put(a, 'mg', 'midnight-guard');
    assert.equal(disp(decide(a), 'cast_permanent(mg'), 69.3);
    const b = mk(); fillLib(b); put(b, 'jw', 'jeskai-windscout');
    assert.equal(disp(decide(b), 'cast_permanent(jw'), 68.0);
    const c = mk(); fillLib(c); put(c, 'jd', 'jeskai-devotee');
    assert.equal(disp(decide(c), 'cast_permanent(jd'), 66.4);
  });
  it('F-O: token_wizard = 65.7 (drain +1.8)', () => {
    const s = mk(); fillLib(s); put(s, 'tw', 'token_wizard');
    assert.equal(disp(decide(s), 'cast_permanent(tw'), 65.7);
  });
  it('guard: outcasts/shaman = 68.4/63.9 (Wave-B!); butcher = 58.5 (B1-risk!)', () => {
    const a = mk(); fillLib(a); put(a, 'go', 'grizzled-outcasts');
    assert.equal(disp(decide(a), 'cast_permanent(go'), 68.4);
    const b = mk(); fillLib(b); put(b, 'fb', 'faceless-butcher');
    assert.equal(disp(decide(b), 'cast_permanent(fb'), 58.5);
    const c = mk(); fillLib(c); put(c, 'bs', 'battle-rattle-shaman');
    assert.equal(disp(decide(c), 'cast_permanent(bs'), 63.9);
  });
});
