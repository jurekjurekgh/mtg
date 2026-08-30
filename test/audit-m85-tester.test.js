import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { addCounter } from '../src/engine/counters.js';
import { describeGameEvent } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function game() {
  const state = createGameState({ seed: 85, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

test('Negate nie celuje w zdolność aktywowaną na stosie (CR 701.5)', () => {
  const state = game();
  addMana(state, 'p2', 2, { colors: ['U'] });
  addObject(state, {
    id: 'soul', instanceId: 'i-s', cardId: 'soulmender', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1,
    abilities: [{ type: 'activated', cost: { tap: true }, effect: { type: 'gain_life', amount: 1 } }],
  });
  addObject(state, {
    id: 'negate', instanceId: 'i-n', cardId: 'negate', controllerId: 'p2',
    zone: 'hand', kind: 'spell', manaCost: 2, colors: ['U'],
    spell: { timing: 'instant', targets: [{ type: 'noncreature_spell_on_stack' }], effects: [{ type: 'counter_spell' }] },
  });
  const act = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'soul', abilityIndex: 0 });
  assert.ok(act.ok, act.events[0]?.reason);
  assert.ok(state.zones.stack.length >= 1);
  const stacked = state.objects.get(state.zones.stack.at(-1));
  assert.equal(stacked.kind, 'activated');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const view = playerView(state, 'p2');
  const negateCasts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'negate');
  assert.equal(negateCasts.length, 0, 'Negate nie oferuje activated na stosie');
  const rejected = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'negate', targets: [stacked.id] });
  assert.equal(rejected.ok, false);
});

test('SBA anihilacji +1/+1 vs -1/-1 ma total i polski opis', () => {
  const state = game();
  addObject(state, {
    id: 'bard', instanceId: 'i-b', cardId: 'stirring-bard', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
  });
  addCounter(state, 'bard', '+1/+1', 1);
  addCounter(state, 'bard', '-1/-1', 1);
  runStateBasedActions(state);
  const ev = state.events.find((e) => e.type === 'counter_removed' && e.annihilated);
  assert.ok(ev);
  assert.equal(ev.total, 0);
  const text = describeGameEvent(ev, {
    nameOf: (id) => id,
    nameOfObject: () => 'Stirring Bard',
  });
  assert.match(text, /anihilacja/);
  assert.doesNotMatch(text, /undefined/);
});

test('commandLabel szukania i Fertile Thicket używa nameOfObject', () => {
  const session = {
    nameOf: (id) => id ?? '?',
    nameOfObject: (id) => (id === 'lib-1' ? 'Forest' : id === 'lib-2' ? 'Plains' : '?'),
  };
  const view = { zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [{ id: 'lib-1' }], exile: [] }, players: [] };
  assert.equal(commandLabel({ type: 'resolve_search_choice', found: 'lib-1' }, session, view), 'Szukanie: Forest');
  assert.match(commandLabel({ type: 'resolve_fertile_thicket', chosenCardId: 'lib-2' }, session, view), /Plains/);
  // M260/A2 (zgłoszenie właściciela z PR #89): skip = rezygnacja z ZAGLĄDANIA
  // (biblioteka nietknięta) — wcześniejsza etykieta „Odłóż wszystko na spód"
  // opisywała inną opcję i myliła gracza.
  assert.match(commandLabel({ type: 'resolve_fertile_thicket', skip: true }, session, view), /rezygnuj/i);
  assert.ok(!/spód/.test(commandLabel({ type: 'resolve_fertile_thicket', skip: true }, session, view)));
});

test('bot nie punktuje Fireballa w siebie wyżej niż we wroga', () => {
  const bot = createHeuristicBot({ seed: 7 });
  const view = {
    playerId: 'p2',
    winnerId: null,
    status: 'active',
    turn: { number: 5, step: 'main', phase: 'precombat_main', activePlayerId: 'p2' },
    players: [{ id: 'p1', life: 12 }, { id: 'p2', life: 18 }],
    zones: {
      hand: [{ id: 'fb', cardId: 'fireball', kind: 'spell', controllerId: 'p2', manaCost: 1, spell: { fireball: true, timing: 'sorcery', effects: [{ type: 'damage', amount: 'X' }] } }],
      battlefield: [],
      library: Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, controllerId: 'p2' })),
      graveyard: [],
      exile: [],
      stack: [],
    },
    legalCommands: [
      { type: 'cast_spell', objectId: 'fb', targets: ['p2'], xValue: 5 },
      { type: 'cast_spell', objectId: 'fb', targets: ['p1'], xValue: 5 },
      { type: 'pass_priority', playerId: 'p2' },
    ],
  };
  const cmd = bot.chooseCommand(view);
  assert.deepEqual(cmd.targets, ['p1']);
});
