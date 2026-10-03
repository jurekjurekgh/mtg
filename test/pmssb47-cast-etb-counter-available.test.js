// PMSSB-47 (2026-10-03h): etbFriendlyCounterTargetAvailable zwracało true
// nawet przy pustym stole własnym — ETB +1/+1 na up-to-N celów dostawał stałą
// premię +6 chociaż liczników nie było komu dać. Poprawka: sprawdź realną
// obecność co najmniej jednego przyjaznego stwora.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const R = createCardRegistry();
const cardDef = (cid) => R.get(cid);

function put(state, id, cid, ctl, zone, patch = {}) {
  const d = cardDef(cid);
  addObject(state, {
    id, instanceId: 'i-' + id, cardId: cid, controllerId: ctl, ownerId: ctl, zone,
    ...gameObjectDataOf(d), types: d.types ?? [], keywords: d.keywords ?? [],
    subtypes: d.subtypes ?? [], spell: d.spell, manaCost: d.manaCost,
    warp: d.warp ? { ...d.warp } : undefined, abilities: d.abilities ?? [],
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
}
function setup(nMyCreatures) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...jumpToStep(state.turn, 'main', 'p1'), activePlayerId: 'p1', priorityPlayerId: 'p1' };
  for (let i = 0; i < 6; i++) put(state, `l${i}`, 'basic-plains', 'p1', 'battlefield', { subtypes: ['Plains'] });
  for (let i = 0; i < nMyCreatures; i++) {
    put(state, `m${i}`, 'goblin-piker', 'p1', 'battlefield', { power: 2, toughness: 2, summoningSickness: false });
  }
  put(state, 'w', 'weftblade-enhancer', 'p1', 'hand');
  return state;
}

describe('PMSSB-47: etbFriendlyCounterTargetAvailable widzi realny stół', () => {
  let score0, score1, chosen0, chosen1;
  before(() => {
    function evalSetup(n) {
      const s = setup(n);
      const v = playerView(s, 'p1');
      const b = createHeuristicBot({ seed: 1 });
      b.chooseCommand(v, {});
      const t = b.trace().at(-1);
      const opt = t.options.find((o) => typeof o.cmd === 'string' && o.cmd.startsWith('cast_permanent'));
      return { chosen: typeof t.chosen === 'string' ? t.chosen : null, score: opt?.score ?? -Infinity };
    }
    ({ chosen: chosen0, score: score0 } = evalSetup(0));
    ({ chosen: chosen1, score: score1 } = evalSetup(1));
  });

  it('E1 przy 0 własnych stworach score ETB rzutu jest o co najmniej 3 niższy niż przy 1 stworem', () => {
    assert.ok(score1 > score0 + 3, `score1 (${score1}) - score0 (${score0}) powinno być >3 (premia za realny ETB)`);
  });

  it('E2 przy 1 własnym stwórze bot wybiera cast_permanent', () => {
    assert.ok(chosen1.startsWith('cast_permanent'), 'bot wybiera rzut przy dostępnym celu');
  });

  it('E3 przy 0 własnych stworach score rzutu jest liczbą skończoną', () => {
    assert.ok(Number.isFinite(score0), 'oferta rzutu istnieje (sam korpus jest wart zagrania)');
  });
});
