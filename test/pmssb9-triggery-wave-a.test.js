// PMSSB-9 Wave-A: anticipacja-dies (F-T1: 0.5 × tabela-ETB).
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
const decide = (s) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(v);
  return b.trace().at(-1).options;
};
const disp = (opts, frag) => Number(opts.find((o) => o.cmd.includes(frag))?.score.toFixed(1));

describe('PMSSB-9 Wave-A: anticipacja-dies', () => {
  it('F-T1: prowler = 67.5 (było 64.8: +2.7 = 0.5×6×0.9)', () => {
    const s = mk(); fillLib(s); put(s, 'pr', 'guildsworn-prowler');
    assert.equal(disp(decide(s), 'cast_permanent(pr'), 67.5);
  });
  it('F-T1: piker-twin = 64.8 BEZ ZMIAN (różnica izoluje anticipację)', () => {
    const s = mk(); fillLib(s); put(s, 'pk', 'goblin-piker');
    assert.equal(disp(decide(s), 'cast_permanent(pk'), 64.8);
  });
  it('F-T1: game = 65.7 (dies-gain: 0.5×drabina-bufora)', () => {
    const s = mk(); fillLib(s); put(s, 'hg', 'highland-game');
    assert.equal(disp(decide(s), 'cast_permanent(hg'), 65.7);
  });
  it('F-T1: dissenter = 72.0 (dies-token: 0.5×tokenBody-duch-20!)', () => {
    const s = mk(); fillLib(s); put(s, 'dd', 'doomed-dissenter');
    assert.equal(disp(decide(s), 'cast_permanent(dd'), 72.0);
  });
  it('F-T1: clique = 71.1 BEZ ZMIAN (persist: flat-+5, skip w helperze)', () => {
    const s = mk(); fillLib(s); put(s, 'pc', 'puppeteer-clique');
    assert.equal(disp(decide(s), 'cast_permanent(pc'), 71.1);
  });
  it('F-T1: spellbomb = 62.1 (pay-gated-dies SKIP, konserwatywnie 0)', () => {
    const s = mk(); fillLib(s); put(s, 'sb', 'panic-spellbomb');
    assert.equal(disp(decide(s), 'cast_permanent(sb'), 62.1);
  });
  it('F-T1: selhoff = 65.7 (any_creature_dies EXCLUDE — nie własny-dies)', () => {
    const s = mk(); fillLib(s); put(s, 'so', 'selhoff-occultist');
    assert.equal(disp(decide(s), 'cast_permanent(so'), 65.7);
  });
  it('F-T1: prowler-lib0 = 10.8 (drabina deck-outu żyje w anticipacji!)', () => {
    const s = mk(); put(s, 'pr', 'guildsworn-prowler');
    assert.equal(disp(decide(s), 'cast_permanent(pr'), 10.8);
  });
  it('guard: bloodflies = 68.4 (Wave-B/F-T2 wylądowała: +1.8)', () => {
    const s = mk(); fillLib(s); put(s, 'bf', 'delta-bloodflies');
    assert.equal(disp(decide(s), 'cast_permanent(bf'), 68.4);
  });
  it('guard: butcher/oryx = 63.9/64.8 (leaves → forward, BEZ ZMIAN)', () => {
    const a = mk(); fillLib(a); put(a, 'fb', 'faceless-butcher');
    assert.equal(disp(decide(a), 'cast_permanent(fb'), 63.9);
    const b = mk(); fillLib(b); put(b, 'ox', 'emerald-oryx');
    assert.equal(disp(decide(b), 'cast_permanent(ox'), 64.8);
  });
});
