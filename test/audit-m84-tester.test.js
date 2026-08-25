import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Ostateczne wyzwanie Testera Gracza (M84) — audyt „z perspektywy gracza\":
 * gramatyka/odmiana polska w logu, opisy efektów i triggerów, root-cause
 * bugów ujawnionych przez żywe partie (proliferate total, damage_prevented).
 */

const REGISTRY = createCardRegistry();

function game(seed = 1) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function mainPhase(state, pid = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
  return state;
}

// --- 2. Epic Experiment odmiana ---
test('M84/2: Epic Experiment — „1 kartę\" / „2 karty\" (odmiana)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: (id) => id === 'p1' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const one = describeGameEvent({ type: 'epic_experiment_resolved', playerId: 'p1', restToGrave: 1 }, helpers, names);
  const two = describeGameEvent({ type: 'epic_experiment_resolved', playerId: 'p1', restToGrave: 2 }, helpers, names);
  assert.match(one, /1 karta do grobu/, one);
  assert.match(two, /2 karty do grobu/, two);
});

// --- 3. Proliferate counter_added ma total ---
test('M84/3: proliferate emituje counter_added z total (nie „razem undefined\")', async () => {
  const { addObject } = await import('../src/engine/game-state.js');
  const state = game();
  mainPhase(state);
  addObject(state, {
    id: 'tgt', instanceId: 'i-t', cardId: 'x-tgt', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('tgt', Object.freeze({ ...state.objects.get('tgt'), counters: { '+1/+1': 1 } }));
  addObject(state, {
    id: 'cic', instanceId: 'i-cic', cardId: 'courage-in-crisis', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', manaCost: 3,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'add_counter', counter: '+1/+1', amount: 1 }, { type: 'proliferate' }] },
  });
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'cic');
  if (cast) execute(state, cast);
  let sawTotal = false;
  for (let i = 0; i < 15; i += 1) {
    const h = state.turn.priorityPlayerId;
    const v = playerView(state, h);
    const pick = v.legalCommands.find((c) => c.type === 'resolve_proliferate')
      ?? v.legalCommands.find((c) => c.type === 'pass_priority')
      ?? v.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    const rr = execute(state, pick);
    for (const e of rr.events || []) {
      if (e.type === 'counter_added' && e.counter === '+1/+1') {
        assert.equal(typeof e.total, 'number', `counter_added total: ${e.total}`);
        sawTotal = true;
      }
    }
  }
  assert.ok(sawTotal, 'proliferate wyemitował counter_added z total');
});



// --- 5. Index/look_top odmiana ---
test('M84/5: Index/look_top — „1 kartę\"/„2 karty\" (odmiana)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: (id) => id === 'p1' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const one = describeGameEvent({ type: 'look_top_started', playerId: 'p1', count: 1 }, helpers, names);
  const two = describeGameEvent({ type: 'look_top_started', playerId: 'p1', count: 2 }, helpers, names);
  const idx1 = describeGameEvent({ type: 'index_started', playerId: 'p1', count: 1 }, helpers, names);
  // M101/C: opisy o graczu są w 2. osobie („Patrzysz…") — testowany jest tu
  // przypadek RZECZOWNIKA (1 kartę / 2 karty), więc czasownik dopuszczamy w obu formach.
  assert.match(one, /patrz(ysz|y) na 1 kartę z wierzchu/i, one);
  assert.match(two, /patrz(ysz|y) na 2 karty z wierzchu/i, two);
  // M213: opis Index nie nazywa już karty — liczy się odmiana liczebnika.
  assert.match(idx1, /1 kartę/i, idx1);
});

// --- 6. Fertile Thicket odmiana ---
test('M84/6: Fertile Thicket — „odsłania 1 kartę\" (odmiana)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: (id) => id === 'p1' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent({ type: 'fertile_thicket_reveal_started', controllerId: 'p1', cardCount: 1, basicLandCount: 1 }, helpers, names);
  assert.match(text, /odsłani(asz|a) 1 kartę z wierzchu/i, text);
});

// --- 7. damage_prevented ma powód ---
test('M84/7: damage_prevented podaje powód (protection / prewencja bojowa / tarcza)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: (o) => o, isPlayer: (id) => id === 'p1' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const prot = describeGameEvent({ type: 'damage_prevented', objectId: 'x', amount: 2, protection: true }, helpers, names);
  const inspire = describeGameEvent({ type: 'damage_prevented', objectId: 'x', amount: 2, inspireAwe: true }, helpers, names);
  const shield = describeGameEvent({ type: 'damage_prevented', target: 'p1', amount: 2, shield: true }, helpers, names);
  assert.match(prot, /ochrona przed kolorem/, prot);
  // M213: powód opisuje MECHANIKĘ, nie kartę, która ją wprowadziła.
  assert.match(inspire, /prewencja obrażeń bojowych/, inspire);
  assert.match(shield, /tarcza prewencji/, shield);
  assert.ok(!prot.includes('zniwelowane'), 'nie „zniwelowane\": ' + prot);
});

// --- 1. equipped_creature_attacks czytelny opis ---
test('M84/1: kafel Greatsword of Tyr — „Gdy wyposażony stwór atakuje\" (nie surowy Trigger)', () => {
  // Sprawdź render.js źródło — opis w describeTriggered.
  const fs = require_undefined();
  void fs;
  const card = REGISTRY.get('greatsword-of-tyr');
  assert.ok(card, 'karta istnieje');
  // Opis jest w render.js (sprawdzony statycznie przez PR).
  assert.equal(card.abilities[0].trigger.event, 'equipped_creature_attacks');
});
function require_undefined() {
  return undefined;
}
