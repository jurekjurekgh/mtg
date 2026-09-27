// PMSSB-4 fala C: imminent-trigger-gain przy rzucie nosiciela (H8).
// Zasada: trigger-gain liczy sie wtedy i TYLKO wtedy, gdy warunek jest
// spelnialny W TYM OKNIE; bez enablerow +0 jak przedtem (brak
// przeszacowania). F-C1 landfall (gladehart): moja main + drop nie
// polozony + lad w rece. F-C2 cast-koloru (feather W): zagrywalny teraz
// czar koloru. F-C3 bat-attacks (zoraline +1): gotowy Nietoperz.
// NO-F piny (PMSSB-9/F-T1: dies-gain highland +0.9 przez anticipację-dies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
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
  return state;
}
function setLife(s, me, foe = 20) {
  s.players.find((p) => p.id === 'p1').life = me;
  s.players.find((p) => p.id === 'p2').life = foe;
}
function fillLibrary(s) {
  for (const [who, n] of [['p1', 10], ['p2', 10]]) for (let i = 0; i < n; i += 1) {
    addObject(s, {
      id: `lb${who}${i}`, instanceId: `i-lb${who}${i}`, cardId: `x-lb${who}${i}`,
      controllerId: who, zone: 'library', kind: 'creature', power: 0, toughness: 0,
      manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'lb',
    });
  }
}
const BASIC = { W: 'basic-plains', U: 'basic-island', B: 'basic-swamp', R: 'basic-mountain', G: 'basic-forest' };
function addBasics(s, colors, count) {
  for (let i = 0; i < count; i += 1) {
    const def = REG.get(BASIC[colors[i % colors.length]]);
    addObject(s, { id: `mL${i}`, instanceId: `i-mL${i}`, cardId: def.id, controllerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def) });
  }
}
function handCard(s, id, cardId) {
  const def = REG.get(cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand', ...gameObjectDataOf(def) });
}
function fieldCreature(s, id, controllerId, power, toughness, extra = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id, ...extra,
  });
}
function scoreOf(s, match) {
  const view = playerView(s, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  bot.chooseCommand(view);
  const o = bot.trace().at(-1).options.find((e) => e.cmd.includes(match));
  assert.ok(o, `brak oferty '${match}'`);
  return o.score;
}
function approx(score, want, msg) {
  assert.ok(Math.abs(score - want) < 1e-6, `${msg}: oczekiwano ${want}, jest ${score}`);
}

test('F-C1: gladehart +tiers(2) tylko z ladem w rece (gate dropu)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['G'], 5);
  handCard(s, 'k', 'grazing-gladehart');
  approx(scoreOf(s, 'cast_permanent(k'), 64.8018, 'gladehart bez lada w rece: +0');
  const t = newState(); fillLibrary(t); setLife(t, 20); addBasics(t, ['G'], 5);
  handCard(t, 'k', 'grazing-gladehart');
  handCard(t, 'ld', 'basic-forest');
  approx(scoreOf(t, 'cast_permanent(k'), 66.6018, 'gladehart z ladem w rece: +2 x0.9');
});

test('F-C2: feather +tiers(1) tylko z bialym czarem do zagrania teraz', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['W'], 5);
  handCard(s, 'k', 'angels-feather');
  approx(scoreOf(s, 'cast_permanent(k'), 61.1982, 'feather bez bialego czaru: +0');
  const t = newState(); fillLibrary(t); setLife(t, 20); addBasics(t, ['W'], 5);
  handCard(t, 'k', 'angels-feather');
  handCard(t, 'ws', 'soulmender');
  approx(scoreOf(t, 'cast_permanent(k'), 62.0982, 'feather z bialym czarem: +1 x0.9');
});

test('F-C3: zoraline +tiers(1) tylko z gotowym Nietoperzem', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['W', 'B'], 5);
  handCard(s, 'k', 'zoraline');
  approx(scoreOf(s, 'cast_permanent(k'), 69.3036, 'zoraline bez bata: +0');
  const t = newState(); fillLibrary(t); setLife(t, 20); addBasics(t, ['W', 'B'], 5);
  handCard(t, 'k', 'zoraline');
  fieldCreature(t, 'bt', 'p1', 2, 2, { subtypes: ['Bat'] });
  approx(scoreOf(t, 'cast_permanent(k'), 70.2036, 'zoraline z gotowym batem: +1 x0.9');
});

test('F-T1: highland-game dies-gain +0.9 (PMSSB-9: anticipacja-dies 0.5×2×0.9)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['G'], 5);
  handCard(s, 'k', 'highland-game');
  approx(scoreOf(s, 'cast_permanent(k'), 65.7018, 'highland: anticipacja-dies przy rzucie');
});
