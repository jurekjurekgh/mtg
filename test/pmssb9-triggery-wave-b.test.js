// PMSSB-9 Wave-B: anticipacja-attacks (F-T2: 0.5 × bramka-evasion × ETB).
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
const foe = (s, id, kw = []) => addObject(s, { id, instanceId: 'i-' + id, cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: kw, subtypes: [], types: ['Creature'], colors: [], cardName: id });
const decide = (s) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(v);
  return b.trace().at(-1).options;
};
const disp = (opts, frag) => Number(opts.find((o) => o.cmd.includes(frag))?.score.toFixed(1));

describe('PMSSB-9 Wave-B: anticipacja-attacks', () => {
  it('F-T2: bloodflies = 68.4 (było 66.6: +1.8 = 0.5×4×0.9)', () => {
    const s = mk(); fillLib(s); put(s, 'bf', 'delta-bloodflies');
    assert.equal(disp(decide(s), 'cast_permanent(bf'), 68.4);
  });
  it('F-T2: horror = 67.5 (było 63.9: +3.6 = 0.5×8×0.9)', () => {
    const s = mk(); fillLib(s); put(s, 'ih', 'infectious-horror');
    assert.equal(disp(decide(s), 'cast_permanent(ih'), 67.5);
  });
  it('F-T2: courser = 69.8 (było 68.4: impuls +3 → +1.35)', () => {
    const s = mk(); fillLib(s); put(s, 'gc', 'gila-courser');
    assert.equal(disp(decide(s), 'cast_permanent(gc'), 69.8);
  });
  it('F-T2: caves = 77.0 (było 75.6: +1.35 na nodze-ataku)', () => {
    const s = mk(); fillLib(s); put(s, 'cc', 'caves-of-chaos-adventurer');
    assert.equal(disp(decide(s), 'cast_permanent(cc'), 77.0);
  });
  it('F-T2: veteran/thistledown = 68.4/70.2 (untap +2.7)', () => {
    const a = mk(); fillLib(a); put(a, 'td', 'tenth-district-veteran');
    assert.equal(disp(decide(a), 'cast_permanent(td'), 68.4);
    const b = mk(); fillLib(b); put(b, 'tp', 'thistledown-players');
    assert.equal(disp(decide(b), 'cast_permanent(tp'), 70.2);
  });
  it('F-T2: waveskimmer/benediction = 66.2/58.9 (exalted-solo +0.45; float!)', () => {
    const a = mk(); fillLib(a); put(a, 'wa', 'waveskimmer-aven');
    assert.equal(disp(decide(a), 'cast_permanent(wa'), 66.2);
    const b = mk(); fillLib(b); put(b, 'ab', 'angelic-benediction');
    assert.equal(disp(decide(b), 'cast_permanent(ab'), 58.9);
  });
  it('F-T2: zoraline = 69.3 BEZ ZMIAN (pay-SKIP + bat-imminent-0)', () => {
    const s = mk(); fillLib(s); put(s, 'zo', 'zoraline');
    assert.equal(disp(decide(s), 'cast_permanent(zo'), 69.3);
  });
  it('F-T2: bramka-evasion (fly-blok 71.1 vs plain 72.0, delta-0.9!)', () => {
    const a = mk(); fillLib(a); put(a, 'bf', 'delta-bloodflies'); foe(a, 'f1', ['flying']);
    assert.equal(disp(decide(a), 'cast_permanent(bf'), 71.1);
    const b = mk(); fillLib(b); put(b, 'bf', 'delta-bloodflies'); foe(b, 'f1');
    assert.equal(disp(decide(b), 'cast_permanent(bf'), 72.0);
  });
  it('guard: prowler = 67.5 (F-T1 nietknięty)', () => {
    const s = mk(); fillLib(s); put(s, 'pr', 'guildsworn-prowler');
    assert.equal(disp(decide(s), 'cast_permanent(pr'), 67.5);
  });
});
