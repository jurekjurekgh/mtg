import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { markDamage } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(seed = 8132) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}
function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, cardId);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}
function addCreature(state, id, ctrl, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}
function resolveStack(state) {
  let guard = 0;
  while ((state.zones.stack.length > 0 || state.pendingTriggerTargets.length > 0
    || state.pendingSearchChoice || state.pendingOptionalTrigger) && guard++ < 300) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pick = view.legalCommands.find((c) => c.type === 'resolve_search_choice' && c.found)
      ?? view.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === false)
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pick || !execute(state, pick).ok) return false;
  }
  state.turn.priorityPlayerId = state.turn.activePlayerId;
  return true;
}

test('BUG1: Fierce Empath nie może wziąć stwora o MV < 6', () => {
  const state = mainPhase(game());
  addRealCard(state, 'big', 'segmented-krotiq', 'p1', 'library');
  addRealCard(state, 'small', 'highland-game', 'p1', 'library');
  addRealCard(state, 'fe', 'fierce-empath', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fe' }).ok);
  let guard = 0;
  while (!state.pendingSearchChoice && state.zones.stack.length > 0 && guard++ < 40) {
    const v = playerView(state, state.turn.priorityPlayerId);
    const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  assert.ok(state.pendingSearchChoice, 'szukanie');
  const cmds = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_search_choice');
  const foundIds = cmds.map((c) => c.found).filter(Boolean);
  assert.ok(foundIds.includes('big'), 'duży stwór legalny');
  assert.ok(!foundIds.includes('small'), 'Highland Game MV2 nielegalny');
  const bad = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'small' });
  assert.ok(!bad.ok, 'walidacja odrzuca MV<6');
});

test('BUG2: flashbackowany czar po kontrze idzie do exile (CR 702.34b)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'dt', 'dream-twist', 'p1', 'graveyard');
  addRealCard(state, 'neg', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 2, { colors: ['U'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  const fb = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_flashback');
  assert.ok(fb);
  assert.ok(execute(state, fb).ok);
  const stackId = state.zones.stack.at(-1);
  state.turn.priorityPlayerId = 'p2';
  const neg = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'neg' && c.targets?.[0] === stackId);
  assert.ok(neg, 'Negate celuje we flashback');
  assert.ok(execute(state, neg).ok);
  resolveStack(state);
  const dt = [...state.objects.values()].find((o) => o.cardId === 'dream-twist');
  assert.equal(dt?.zone, 'exile', 'po kontrze exile, nie grób');
});

test('BUG3: Soulbright 3. resolve — można odmówić 8 many', () => {
  const state = mainPhase(game());
  addRealCard(state, 'sb', 'soulbright-flamekin', 'p1', 'battlefield');
  state.objects.set('sb', Object.freeze({ ...state.objects.get('sb'), summoningSickness: false }));
  addCreature(state, 'tgt', 'p1', 2, 2);
  for (let i = 0; i < 3; i += 1) {
    addMana(state, 'p1', 2, []);
    const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'sb' && c.targets?.[0] === 'tgt');
    assert.ok(act);
    assert.ok(execute(state, act).ok);
    let g = 0;
    while (state.zones.stack.length > 0 && !state.pendingOptionalTrigger && g++ < 20) {
      const v = playerView(state, state.turn.priorityPlayerId);
      const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
      if (!pass) break;
      execute(state, pass);
    }
  }
  const no = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === false);
  assert.ok(no, 'można odmówić');
  const before = state.players[0].mana ?? 0;
  assert.ok(execute(state, no).ok);
  assert.equal(state.players[0].mana ?? 0, before, 'odmowa = brak 8 many');
});

test('BUG4: cant_block tylko gdy obrażenia faktycznie zadane', () => {
  const state = mainPhase(game());
  addRealCard(state, 'bw', 'ballista-wielder', 'p1', 'battlefield');
  state.objects.set('bw', Object.freeze({ ...state.objects.get('bw'), summoningSickness: false }));
  addCreature(state, 'foe', 'p2', 2, 2);
  state.preventDamageThisTurn = [{ typesInclude: ['Creature'], isCreature: true }];
  addMana(state, 'p1', 3, { colors: ['R'] });
  const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'bw' && c.targets?.[0] === 'foe');
  assert.ok(act);
  assert.ok(execute(state, act).ok);
  resolveStack(state);
  assert.notEqual(state.objects.get('foe').cantBlock, true, 'prewencja → brak can\'t block');
});

test('BUG5: tarcza nie oznacza „dealt damage this turn\" (CR 122.1b)', () => {
  const state = mainPhase(game());
  addCreature(state, 'sh', 'p2', 2, 2);
  state.objects.set('sh', Object.freeze({ ...state.objects.get('sh'), counters: { shield: 1 } }));
  markDamage(state, 'sh', 3);
  const sh = state.objects.get('sh');
  assert.equal(sh.zone, 'battlefield');
  assert.equal((sh.counters?.shield ?? 0), 0);
  assert.equal(Boolean(sh.damagedThisTurn), false, 'replacement — obrażenia nie zadane');
});
