// A113: mieszany checkpoint obrażeń bojowych, śmierci i własnego LKI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

// Otwarty reproduktor: wymuszaj AUDIT_A113_ENFORCE=1.
const audit = (name, fn) =>
  test(
    name,
    {
      skip: process.env.AUDIT_A113_ENFORCE === '1' ? false : 'otwarte A113 (AUDIT_A113_ENFORCE=1)',
    },
    fn,
  );
const registry = createCardRegistry();
const other = (p) => (p === 'p1' ? 'p2' : 'p1');
function put(state, id, cardId, ownerId, zone) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  return addObject(state, { ...data, id, instanceId: `i-${id}`, zone, controllerId: ownerId });
}
const view = (state) => playerView(state, state.turn.priorityPlayerId);
function act(state, command) {
  assert.ok(command, JSON.stringify(view(state).legalCommands));
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result));
}
function pass(state) {
  act(
    state,
    view(state).legalCommands.find((c) => c.type === 'pass_priority'),
  );
}

// Setup kart i tury syntetyczny; deklaracje ataku/bloku i obrażenia realne.
function combatScene(active) {
  const defending = other(active),
    state = createGameState({ seed: 177113, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', active);
  state.turn.activePlayerId = state.turn.priorityPlayerId = active;
  put(state, 'thief', 'scroll-thief', active, 'battlefield');
  put(state, 'giant', 'hill-giant', active, 'battlefield');
  for (const id of ['thief', 'giant'])
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  put(state, 'imp', 'nefarious-imp', defending, 'battlefield');
  put(state, 'selhoff', 'selhoff-occultist', active, 'battlefield');
  for (const p of ['p1', 'p2'])
    for (let i = 0; i < 3; i++) put(state, `${p}-library-${i}`, 'basic-forest', p, 'library');
  act(state, { type: 'declare_attackers', playerId: active, attackerIds: ['thief', 'giant'] });
  pass(state);
  pass(state);
  act(state, { type: 'declare_blockers', playerId: defending, assignments: { giant: ['imp'] } });
  let resolved = false;
  for (let i = 0; i < 8; i++) {
    const c = view(state).legalCommands.find((c) => c.type === 'resolve_combat');
    if (c) {
      act(state, c);
      resolved = true;
      break;
    }
    pass(state);
  }
  assert.ok(resolved);
  assert.equal([...state.objects.values()].find((o) => o.instanceId === 'i-imp').zone, 'graveyard');
  return { state, defending };
}
for (const active of ['p1', 'p2']) {
  audit(`A113: aktywny wybiera kolejność Thief i Selhoff (${active})`, () => {
    const { state } = combatScene(active);
    assert.equal(state.turn.priorityPlayerId, active);
    const choices = view(state).legalCommands.filter((c) => c.type === 'resolve_trigger_order');
    assert.deepEqual(choices.map((c) => c.cardId).sort(), ['scroll-thief', 'selhoff-occultist']);
  });
  audit(`A113: Imp nie wyprzedza Selhoff aktywnego w walce (${active})`, () => {
    const { state, defending } = combatScene(active);
    const choices = view(state).legalCommands.filter((c) => c.type === 'resolve_trigger_order');
    if (choices.length)
      act(
        state,
        choices.find((c) => c.cardId === 'scroll-thief'),
      );
    act(
      state,
      view(state).legalCommands.find(
        (c) => c.type === 'resolve_trigger_target' && c.targetId === defending,
      ),
    );
    assert.deepEqual(
      state.zones.stack
        .map((id) => state.objects.get(id))
        .filter((o) => o.kind === 'trigger')
        .map((o) => o.cardId),
      ['selhoff-occultist', 'scroll-thief', 'nefarious-imp'],
    );
  });
}
