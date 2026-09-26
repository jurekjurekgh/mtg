// PMSSB-10 Wave-B1: leaves-O-ring + upkeep-self-damage (F-O2).
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

describe('PMSSB-10 Wave-B1: leaves + upkeep-negatyw', () => {
  it('F-O2: newt = 64.8 (było 60.3: own-refund +4.5!)', () => {
    const s = mk(); fillLib(s); put(s, 'wn', 'wormfang-newt');
    assert.equal(disp(decide(s), 'cast_permanent(wn'), 64.8);
  });
  it('F-O2: butcher = 58.5 (było 63.9: foe-risk −5.4!)', () => {
    const s = mk(); fillLib(s); put(s, 'fb', 'faceless-butcher');
    assert.equal(disp(decide(s), 'cast_permanent(fb'), 58.5);
  });
  it('F-O2: abduction BRAK OFERTY (silnik, forward-engine; model via butcher)', () => {
    const s = mk(); fillLib(s); put(s, 'fa', 'fear-of-abduction');
    assert.equal(decide(s).filter((o) => o.cmd.includes('cast_permanent(fa')).length, 0);
  });
  it('F-O2: goblin = 62.1 (było 63.9: upkeep-ping −1.8, lustro-drain!)', () => {
    const s = mk(); fillLib(s); put(s, 'gc', 'token_goblin_construct');
    assert.equal(disp(decide(s), 'cast_permanent(gc'), 62.1);
  });
  it('F-O2: outcasts = 68.4 BEZ ZMIAN (transform = silnik-no-op!)', () => {
    const s = mk(); fillLib(s); put(s, 'go', 'grizzled-outcasts');
    assert.equal(disp(decide(s), 'cast_permanent(go'), 68.4);
  });
  it('F-O2: page = 56.7 BEZ ZMIAN (upkeep-pusty = no-op!)', () => {
    const s = mk(); fillLib(s); put(s, 'ep', 'etherwrought-page');
    assert.equal(disp(decide(s), 'cast_permanent(ep'), 56.7);
  });
  it('guard: scrollthief/jester = 66.6/64.8 (Wave-A nietknięta)', () => {
    const a = mk(); fillLib(a); put(a, 'st', 'scroll-thief');
    assert.equal(disp(decide(a), 'cast_permanent(st'), 66.6);
    const b = mk(); fillLib(b); put(b, 'gj', 'goblin-battle-jester');
    assert.equal(disp(decide(b), 'cast_permanent(gj'), 64.8);
  });
});
