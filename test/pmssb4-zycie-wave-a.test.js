// PMSSB-4 fala A: wspolna drabina zycia + noga-gain w cast/ETB + dedupy.
// F-A0: gainLifeValue (M236 bez zmian liczb) ; F-A1: cast gain-leg (douse/
// consume-X/severed-T/divine-MV) ; F-A1b: feed tiers(min(x,3)) ; F-A2: ETB
// tiers ; F-A2b: ETB foe-lose +4x ; F-A3: dedup M155 ; F-A4: dedup M157-foe ;
// F-A5: M157-self tiers ; F-A5b: conditional-gain w ability (scroll+Angel).
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
function fieldArtifact(s, id, controllerId, mv) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'artifact', power: 0, toughness: 0, manaCost: mv, abilities: [], keywords: [],
    subtypes: [], types: ['Artifact'], colors: [], cardName: id,
  });
}
function fieldCard(s, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', ...gameObjectDataOf(def) });
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

test('F-A0: drabina M236 nietknieta ekstrakcja (soulmender 3/4/5)', () => {
  for (const [life, want] of [[20, 3], [10, 4], [5, 5]]) {
    const s = newState(); fillLibrary(s); setLife(s, life);
    fieldCard(s, 'sm', 'soulmender');
    assert.equal(scoreOf(s, 'activate_ability(sm'), want, `soulmender@zycie${life}`);
  }
});

test('F-A1: douse-in-gloom liczy gain2 (bufor +2 / ratunek +4)', () => {
  for (const [life, want] of [[20, -28], [5, -26]]) {
    const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['B'], 5);
    handCard(s, 'dg', 'douse-in-gloom');
    fieldCreature(s, 'wrog', 'p2', 3, 3);
    assert.equal(scoreOf(s, 'cast_spell(dg'), want, `douse@zycie${life} (bylo -30 plasko)`);
  }
});

test('F-A1: consume-spirit X w twarz skaluje gain (tiers(X))', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['B'], 6);
  handCard(s, 'cs', 'consume-spirit');
  const view = playerView(s, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  bot.chooseCommand(view);
  const faces = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(cs->p2)'))
    .map((o) => o.score).sort((a, b) => b - a);
  // X=0: inert-guard -70 (gainLifeValue(0) = 0, wiec bez fantomu +1).
  assert.deepEqual(faces, [-7, -8, -8, -9, -70], `consume w twarz X=4..0 (bylo -10x4,-70): ${JSON.stringify(faces)}`);
});

test('F-A1: severed-strands liczy gain-T (TMC + tiers(T))', () => {
  for (const [t, want] of [[1, 87], [4, 88], [7, 85]]) {
    const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['B'], 4);
    handCard(s, 'ss', 'severed-strands');
    fieldCreature(s, 'cel', 'p2', 2, 2);
    fieldCreature(s, 'fod', 'p1', 1, t, { manaCost: 1 });
    assert.equal(scoreOf(s, 'cast_spell(ss'), want, `severed T${t} (bylo 86/85/82)`);
  }
});

test('F-A1: divine-offering liczy gain-MV (TMC + tiers(MV))', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['W'], 4);
  handCard(s, 'do', 'divine-offering');
  fieldArtifact(s, 'art1', 'p2', 1); fieldArtifact(s, 'art4', 'p2', 4);
  assert.equal(scoreOf(s, 'cast_spell(do->art1'), 75, 'divine w MV1 (bylo 74)');
  assert.equal(scoreOf(s, 'cast_spell(do->art4'), 83, 'divine w MV4 (bylo 80)');
});

test('F-A1b: time-to-feed gain_if_dies przez tiers (cap-3 zostaje)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['G'], 5);
  handCard(s, 'tf', 'time-to-feed');
  fieldCreature(s, 'moj', 'p1', 3, 3); fieldCreature(s, 'slaby', 'p2', 2, 2); fieldCreature(s, 'mocny', 'p2', 5, 5);
  assert.equal(scoreOf(s, 'cast_spell(tf->slaby'), 81, 'feed kill (bylo 82: +3flat -> +2tiers)');
  assert.equal(scoreOf(s, 'cast_spell(tf->mocny'), 37, 'feed chip (bylo 38)');
  const t = newState(); fillLibrary(t); setLife(t, 5); addBasics(t, ['G'], 5);
  handCard(t, 'tf', 'time-to-feed');
  fieldCreature(t, 'moj', 'p1', 3, 3); fieldCreature(t, 'slaby', 'p2', 2, 2); fieldCreature(t, 'mocny', 'p2', 5, 5);
  assert.equal(scoreOf(t, 'cast_spell(tf->slaby'), 84, 'feed kill@5 (ratunek +5)');
});

test('F-A2: ETB-gain przez tiers i wrazliwe na zycie (healer/paladin)', () => {
  for (const life of [20, 5]) {
    const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['G'], 6);
    handCard(s, 'k', 'healer-of-the-glade');
    approx(scoreOf(s, 'cast_permanent(k'), life === 20 ? 66.6018 : 69.3018, `healer@zycie${life} (bylo 70.2018 plasko)`);
  }
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['G'], 7);
  handCard(s, 'k', 'spinewoods-paladin');
  approx(scoreOf(s, 'cast_permanent(k'), 72.0072, 'paladin@20 (bylo 75.6072)');
});

test('F-A2b: skymarch ETB-drain: gain-tiers + foe-lose +4', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['B'], 5);
  handCard(s, 'sk', 'skymarch-bloodletter');
  fieldCreature(s, 'wrog', 'p2', 2, 2);
  approx(scoreOf(s, 'cast_permanent(sk'), 75.6018, 'skymarch (bylo 72.9018: lose-miss 0)');
});

test('F-A3: talisman = soulmender (dedup M155: 6->3, 8->5)', () => {
  for (const [life, want] of [[20, 3], [5, 5]]) {
    const s = newState(); fillLibrary(s); setLife(s, life);
    fieldCard(s, 'tal', 'pristine-talisman');
    assert.equal(scoreOf(s, 'activate_ability(tal'), want, `talisman@zycie${life} (pusta reka, mana +0)`);
  }
});

test('F-A4+F-A5: zombie: self-tiers (5->3), foe-dedup (-55->-29)', () => {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['W'], 3);
  fieldCard(s, 'zom', 'mournful-zombie');
  assert.equal(scoreOf(s, 'activate_ability(zom#0->p1'), 3, 'zombie w siebie@20 (bylo 5 flat)');
  assert.equal(scoreOf(s, 'activate_ability(zom#0->p2'), -29, 'zombie we wroga (bylo -55: M157+misaim)');
  const t = newState(); fillLibrary(t); setLife(t, 5); addBasics(t, ['W'], 3);
  fieldCard(t, 'zom', 'mournful-zombie');
  assert.equal(scoreOf(t, 'activate_ability(zom#0->p1'), 5, 'zombie w siebie@5 (ratunek)');
});

test('F-A5b: scroll-of-avacyn: gain5 tylko z Aniolem (bramka stanu)', () => {
  for (const [angel, life, want] of [[false, 20, 7], [false, 5, 7], [true, 20, 10], [true, 5, 14]]) {
    const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['W'], 4);
    fieldCard(s, 'scr', 'scroll-of-avacyn');
    if (angel) fieldCreature(s, 'ang', 'p1', 4, 4, { subtypes: ['Angel'] });
    assert.equal(scoreOf(s, 'activate_ability(scr'), want, `scroll aniol=${angel} zycie=${life} (bylo 7 plasko)`);
  }
});
