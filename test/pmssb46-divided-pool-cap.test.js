// PMSSB-46 (2026-10-03g, O1 z audytu PR #150): DIVIDED_POOL_CAP —
// gracz-wróg nie znika z puli celów obrażeń podzielonych przy 8+ wrogich
// stworach (Fiery Justice mógł trafić tylko stwory, nie gracza = nie mógł
// dobić przy szerokim stole).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const R = createCardRegistry();

function put(state, id, cardId, ctl, zone, patch = {}) {
  const d = R.get(cardId);
  addObject(state, {
    id, instanceId: 'i-' + id, cardId, controllerId: ctl, ownerId: ctl, zone,
    ...gameObjectDataOf(d), types: d.types ?? [], keywords: d.keywords ?? [],
    subtypes: d.subtypes ?? [], spell: d.spell, manaCost: d.manaCost,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
}

function makeLands(state) {
  const types = ['basic-mountain', 'basic-forest', 'basic-plains'];
  const subs = ['Mountain', 'Forest', 'Plains'];
  for (let t = 0; t < types.length; t++) {
    for (let i = 0; i < 2; i++) {
      put(state, `l${t}${i}`, types[t], 'p1', 'battlefield', { subtypes: [subs[t]] });
    }
  }
}

function setup(nEnemy) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...jumpToStep(state.turn, 'main', 'p1'), activePlayerId: 'p1', priorityPlayerId: 'p1' };
  makeLands(state);
  for (let i = 0; i < nEnemy; i++) {
    put(state, `e${i}`, 'goblin-piker', 'p2', 'battlefield', { power: 1, toughness: 1 });
  }
  put(state, 'sp', 'fiery-justice', 'p1', 'hand');
  return state;
}

function damageTargetIds(view) {
  const ids = new Set();
  for (const c of view.legalCommands) {
    if (!c.type?.startsWith('cast')) continue;
    for (const d of (c.damageDivision ?? [])) ids.add(d.id);
  }
  return ids;
}

describe('PMSSB-46: DIVIDED_POOL_CAP rezerwuje miejsce dla gracza-wroga', () => {
  it('O1 przy 8 wrogich stworach Fiery Justice nadal celuje w przeciwnika', () => {
    const view = playerView(setup(8), 'p1');
    const ids = damageTargetIds(view);
    assert.ok(ids.has('p2'), 'gracz p2 jest w damageDivision przy 8 wrogach');
  });

  it('O2 przy 12 wrogich stworach Fiery Justice nadal celuje w przeciwnika', () => {
    const view = playerView(setup(12), 'p1');
    const ids = damageTargetIds(view);
    assert.ok(ids.has('p2'), 'gracz p2 jest w damageDivision przy 12 wrogach');
  });

  it('O3 (regresja): przy 7 wrogich stworach pula ma 7/7 stworów + gracza', () => {
    const view = playerView(setup(7), 'p1');
    const ids = damageTargetIds(view);
    for (let i = 0; i < 7; i++) assert.ok(ids.has(`e${i}`), `e${i} jest w puli`);
    assert.ok(ids.has('p2'));
  });

  it('O4 solo-offer na p2 istnieje i legalnie się rzuca (execute przechodzi)', () => {
    const state = setup(10);
    const view = playerView(state, 'p1');
    const soloP2 = view.legalCommands.find((c) => c.type?.startsWith('cast')
      && Array.isArray(c.damageDivision) && c.damageDivision.length === 1
      && c.damageDivision[0].id === 'p2' && c.damageDivision[0].amount === 5);
    assert.ok(soloP2, 'oferta rzutu 5 obrażeń w p2 istnieje');
  });
});
