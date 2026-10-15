import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Audyt PR #165, finding A-2 (`docs/audits/AUDYT_PR165_2026-10-15.md`).
 *
 * Opłata energią (CR 122.1, Sentry Bot „you may pay {E}{E}{E}\") musi być
 * atomowa (CR 601.2h): gdy liczników brak, komenda `pay: true` jest ODRZUCANA
 * PRZED jakąkolwiek mutacją, a oferta jej nie zawiera. Dotąd `execute` zdejmował
 * `pendingOptionalPay` i dopiero potem rzucał „Niewystarczająca energia” —
 * stan zostawał naruszony, a komenda wyjątkiem wychodziła poza kontrakt `reject`.
 *
 * Ścieżka jest nieosiągalna przez zwykłą grę (ponowny `canPayTrigger` przy
 * rozstrzyganiu, triggers.js), więc test wymusza stan ręcznie — jak w
 * `audyt-pmssb62-batch67.test.js` (sentryPayChoice).
 */

const REG = createCardRegistry();

function sentryPendingPay({ energia }) {
  const state = createGameState({ seed: 165, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'beginning_of_combat', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REG.get('sentry-bot');
  addObject(state, {
    id: 'bot', instanceId: 'i-bot', cardId: 'sentry-bot', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  state.players.find((player) => player.id === 'p1').energy = energia;
  state.pendingOptionalPay = {
    playerId: 'p1', sourceId: 'bot',
    ability: {
      type: 'triggered',
      trigger: { event: 'beginning_of_combat', payEnergy: 3 },
      effect: { type: 'add_counter_to_creatures_you_control', counter: '+1/+1', amount: 1 },
    },
    onResolution: true,
  };
  return state;
}

test('A-2: oferta „zapłać {E}{E}{E}” znika, gdy liczników jest za mało (tylko odmowa)', () => {
  const state = sentryPendingPay({ energia: 0 });
  const legal = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'resolve_optional_pay_choice');
  assert.deepEqual(legal.map((cmd) => cmd.pay), [false],
    'bez trzech liczników nie wolno oferować płatności — tylko „nie płać”');
});

test('A-2: płatność bez pokrycia jest ODRZUCONA, a stan (decyzja, energia) nietknięty', () => {
  const state = sentryPendingPay({ energia: 0 });
  const pendingBefore = state.pendingOptionalPay;
  const result = execute(state, {
    type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true, energyCost: 3, sourceId: 'bot',
  });
  assert.equal(result.ok, false, 'komenda bez pokrycia musi być odrzucona, nie rzucać wyjątkiem');
  assert.equal(result.events.at(-1)?.reason, 'energy_insufficient');
  assert.equal(state.pendingOptionalPay, pendingBefore,
    'odrzucona płatność nie zdejmuje decyzji z gracza (atomowość, CR 601.2h)');
  assert.equal(state.players.find((p) => p.id === 'p1').energy, 0);
});

test('A-2 kontrola dodatnia: z trzema licznikami płatność działa i zdejmuje energię', () => {
  const state = sentryPendingPay({ energia: 3 });
  const legal = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'resolve_optional_pay_choice');
  assert.deepEqual(legal.map((cmd) => cmd.pay), [true, false]);
  const result = execute(state, {
    type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true, energyCost: 3, sourceId: 'bot',
  });
  assert.equal(result.ok, true);
  assert.equal(state.players.find((p) => p.id === 'p1').energy, 0);
  assert.equal(state.pendingOptionalPay, null);
});
