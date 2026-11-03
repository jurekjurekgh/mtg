// A112: własny trigger odchodzącego Imp i celowany dies w APNAP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';

// Otwarty reproduktor: wymuszaj AUDIT_A112_ENFORCE=1.
const audit = (name, fn) =>
  test(
    name,
    {
      skip: process.env.AUDIT_A112_ENFORCE === '1' ? false : 'otwarte A112 (AUDIT_A112_ENFORCE=1)',
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
// Tura, pula, biblioteka, Imp i niektóre cechy są syntetycznie ustawione;
// Shock rzeczywiście rzucany i rozstrzygany.
function scene(
  controller,
  { stolen = false, finality = false, stripped = false, second = false } = {},
) {
  const state = createGameState({ seed: 177111, players: [{ id: 'p1' }, { id: 'p2' }] });
  const shooter = other(controller),
    owner = stolen ? shooter : controller;
  state.turn = jumpToStep(state.turn, 'main1', shooter);
  state.turn.activePlayerId = state.turn.priorityPlayerId = shooter;
  put(state, 'imp', 'nefarious-imp', owner, 'battlefield');
  if (stolen || stripped)
    state.objects.set(
      'imp',
      Object.freeze({
        ...state.objects.get('imp'),
        controllerId: controller,
        ...(stripped ? { abilitiesStripped: true } : {}),
      }),
    );
  if (finality) addCounter(state, 'imp', 'finality', 1);
  if (second) put(state, 'second', 'nefarious-imp', controller, 'battlefield');
  put(state, 'other-imp', 'nefarious-imp', other(controller), 'battlefield');
  for (let i = 0; i < 3; i++) put(state, `lib-${i}`, 'basic-forest', controller, 'library');
  put(state, 'shock', 'shock', shooter, 'hand');
  addMana(state, shooter, 1, { colors: ['R'] });
  return state;
}
function castAndResolve(state) {
  act(
    state,
    view(state).legalCommands.find(
      (c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes('imp'),
    ),
  );
  pass(state);
  pass(state);
}
function impEvents(state) {
  return state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'nefarious-imp');
}
for (const controller of ['p1', 'p2'])
  for (const active of [controller, other(controller)]) {
    audit(
      `A112: Imp i Selhoff po Shock w kolejności APNAP (Imp ${controller}, aktywny ${active})`,
      () => {
        const state = scene(controller);
        state.turn.activePlayerId = active;
        put(state, 'selhoff', 'selhoff-occultist', other(controller), 'battlefield');
        castAndResolve(state);
        const choose = view(state).legalCommands.find(
          (c) => c.type === 'resolve_trigger_target' && c.targetId === controller,
        );
        act(state, choose);
        const actual = state.zones.stack
          .map((id) => state.objects.get(id))
          .filter((o) => o.kind === 'trigger')
          .map((o) => o.cardId);
        const expected =
          active === controller
            ? ['nefarious-imp', 'selhoff-occultist']
            : ['selhoff-occultist', 'nefarious-imp'];
        assert.deepEqual(actual, expected, 'trigger aktywnego pod triggerem nieaktywnego');
      },
    );
  }

// Oba własne triggery niecelowane: kontroler wybiera ich względny porządek.
for (const controller of ['p1', 'p2'])
  for (const active of [controller, other(controller)]) {
    audit(
      `A112: kontroler wybiera porządek Imp i Murder of Crows (${controller}, aktywny ${active})`,
      () => {
        const state = scene(controller);
        state.turn.activePlayerId = active;
        put(state, 'crow', 'murder-of-crows', controller, 'battlefield');
        castAndResolve(state);
        assert.equal(state.turn.priorityPlayerId, controller);
        const choices = view(state).legalCommands.filter((c) => c.type === 'resolve_trigger_order');
        assert.deepEqual(choices.map((c) => c.cardId).sort(), ['murder-of-crows', 'nefarious-imp']);
        act(
          state,
          choices.find((c) => c.cardId === 'murder-of-crows'),
        );
        assert.deepEqual(
          state.zones.stack
            .map((id) => state.objects.get(id))
            .filter((o) => o.kind === 'trigger')
            .map((o) => o.cardId),
          ['nefarious-imp', 'murder-of-crows'],
        );
      },
    );
  }

for (const controller of ['p1', 'p2'])
  audit(`A112: kontroler rozróżnia triggery dwóch Impów (${controller})`, () => {
    const state = scene(controller, { second: true });
    castAndResolve(state);
    assert.equal(state.turn.priorityPlayerId, controller);
    const choices = view(state).legalCommands.filter(
      (c) => c.type === 'resolve_trigger_order' && c.cardId === 'nefarious-imp',
    );
    assert.equal(choices.length, 2);
    const bySource = choices.map((c) => ({
      cmd: c,
      source: state.objects.get(c.stackEntryId).triggerEntry.sourceId,
    }));
    assert.deepEqual(bySource.map((x) => x.source).sort(), ['imp', 'second']);
    act(state, bySource.find((x) => x.source === 'imp').cmd);
    assert.deepEqual(
      state.zones.stack
        .map((id) => state.objects.get(id))
        .filter((o) => o.kind === 'trigger')
        .map((o) => o.triggerEntry.sourceId),
      ['second', 'imp'],
    );
  });
