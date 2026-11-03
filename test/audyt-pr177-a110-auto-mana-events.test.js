// A110: osobne zdolności many Treasure kontra jednoczesne zniszczenie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

const registry = createCardRegistry();
const other = (p) => (p === 'p1' ? 'p2' : 'p1');
function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const card = registry.get(cardId);
  addObject(state, {
    ...gameObjectDataOf(card),
    id,
    instanceId: `i-${id}`,
    cardId,
    ownerId: controllerId,
    controllerId,
    zone,
    types: card.types,
    subtypes: card.subtypes,
  });
}
function turn(state, player) {
  state.turn = jumpToStep(state.turn, 'main1', player);
  state.turn.activePlayerId = state.turn.priorityPlayerId = player;
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
function impEvents(state, player) {
  return state.events.filter(
    (e) => e.type === 'ability_triggered' && e.cardId === 'nefarious-imp' && e.playerId === player,
  );
}
function addObserversAndTreasures(state, payer) {
  for (const player of ['p1', 'p2']) put(state, `imp-${player}`, 'nefarious-imp', player);
  const def = registry.get('token_treasure');
  for (let i = 0; i < 2; i++)
    createBattlefieldToken(state, payer, {
      cardId: def.id,
      name: def.name,
      kind: 'artifact',
      types: def.types,
      subtypes: def.subtypes,
      abilities: def.abilities,
      colors: def.colors,
    });
}
// Tury, pule i bezpośrednie umieszczenie Impów/Treasure to syntetyczny setup.
// Hellion jest rzeczywiście rzucony zakryty, Shock i Ward są rzeczywiste.
function wardScene(active, payer) {
  const state = createGameState({ seed: 177110, players: [{ id: 'p1' }, { id: 'p2' }] });
  const opponent = other(payer);
  turn(state, opponent);
  put(state, 'hellion', 'riftburst-hellion', opponent, 'hand');
  addMana(state, opponent, 3, { colors: ['R'] });
  act(
    state,
    view(state).legalCommands.find((c) => c.objectId === 'hellion' && c.faceDown),
  );
  pass(state);
  pass(state);
  const hidden = [...state.objects.values()].find(
    (o) => o.cardId === 'riftburst-hellion' && o.faceDown,
  );
  assert.ok(hidden);
  addObserversAndTreasures(state, payer);
  turn(state, active);
  state.turn.priorityPlayerId = payer;
  put(state, 'shock', 'shock', payer, 'hand');
  addMana(state, payer, 1, { colors: ['R'] });
  act(
    state,
    view(state).legalCommands.find(
      (c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes(hidden.id),
    ),
  );
  pass(state);
  pass(state);
  assert.ok(state.pendingWardPay);
  return state;
}
function assertReplay(state, base, factory) {
  const replay = replayFromState(state);
  const result = verifyReplay(
    { ...replay, commands: replay.commands.slice(base) },
    factory,
    execute,
  );
  assert.ok(result.deterministic);
  assert.ok(result.results.every((r) => r.ok));
  assert.equal(stateFingerprint(result.state), stateFingerprint(state));
}
for (const payer of ['p1', 'p2'])
  for (const active of ['p1', 'p2']) {
    test(`A110: dwa osobne auto-Treasure dają dwa triggery Imp (${active}, ${payer})`, () => {
      const state = wardScene(active, payer),
        base = state.commands.length;
      const treasures = [...state.objects.values()]
        .filter((o) => o.cardId === 'token_treasure')
        .map((o) => o.id);
      assert.equal(treasures.length, 2);
      act(
        state,
        view(state).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && c.pay),
      );
      assert.deepEqual(
        state.events
          .filter((e) => e.type === 'permanent_sacrificed' && e.cardId === 'token_treasure')
          .map((e) => e.fromId),
        treasures,
      );
      assert.equal(
        impEvents(state, payer).length,
        2,
        'każda oddzielna aktywacja many jest osobnym zdarzeniem',
      );
      assert.equal(impEvents(state, other(payer)).length, 0);
      assertReplay(state, base, () => wardScene(active, payer));
    });
    test(`A110: kontrola ręcznych Treasure i replay (${active}, ${payer})`, () => {
      const state = wardScene(active, payer),
        base = state.commands.length;
      const treasures = [...state.objects.values()]
        .filter((o) => o.cardId === 'token_treasure')
        .map((o) => o.id);
      for (const id of treasures) {
        act(
          state,
          view(state).legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === id),
        );
      }
      act(
        state,
        view(state).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && c.pay),
      );
      assert.equal(impEvents(state, payer).length, 2);
      assert.equal(impEvents(state, other(payer)).length, 0);
      assertReplay(state, base, () => wardScene(active, payer));
    });
  }
// Realny czar, dwie karty Imp i dwa tokeny w setupie. Drugi tryb oszczędza Impy.
for (const payer of ['p1', 'p2'])
  test(`A110: dwa artefakty zniszczone razem wyzwalają Imp raz (${payer})`, () => {
    const state = createGameState({ seed: 177111, players: [{ id: 'p1' }, { id: 'p2' }] });
    turn(state, payer);
    addObserversAndTreasures(state, payer);
    put(state, 'austere', 'austere-command', payer, 'hand');
    addMana(state, payer, 6, { colors: ['W'] });
    act(
      state,
      view(state).legalCommands.find(
        (c) => c.type === 'cast_spell' && c.objectId === 'austere' && c.modeIndex === 2,
      ),
    );
    pass(state);
    pass(state);
    assert.equal(
      [...state.objects.values()].filter(
        (o) => o.cardId === 'token_treasure' && o.zone === 'battlefield',
      ).length,
      0,
    );
    assert.equal(impEvents(state, payer).length, 1);
    assert.equal(impEvents(state, other(payer)).length, 0);
  });
