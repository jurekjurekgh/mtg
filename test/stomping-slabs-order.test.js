// M89: Stomping Slabs — modal „ułóż karty na spodzie" pokazuje NAZWY kart
// (nie pozycje 1..N), żeby gracz wiedział co układa.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { setupCardMatch, gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createSession } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';

let _seq = 0;
function putInHand(state, registry, playerId, cardId) {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  const player = state.players.find((p) => p.id === playerId);
  addObject(state, {
    ...data,
    id: `hand-${cardId}-${++_seq}`,
    instanceId: `inst-${cardId}-${++_seq}`,
    cardId: def.id,
    controllerId: player.id,
    zone: 'hand',
  });
}
function putOnBattlefield(state, registry, playerId, cardId) {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  const player = state.players.find((p) => p.id === playerId);
  addObject(state, {
    ...data,
    id: `bf-${cardId}-${++_seq}`,
    instanceId: `inst-bf-${cardId}-${++_seq}`,
    cardId: def.id,
    controllerId: player.id,
    zone: 'battlefield',
  });
}

test('Stomping Slabs: commandLabel dla resolve_reveal_order pokazuje nazwy kart', () => {
  const registry = createCardRegistry();
  const state = setupCardMatch({
    seed: 1,
    players: [{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }],
    decks: new Map([
      // Biblioteka z kartami, które gracz może odsłonić.
      ['p1', ['stomping-slabs', 'basic-mountain', 'basic-mountain', 'vandalize', 'irontread-crusher', 'forge-devil', 'ainok-tracker', ...Array(33).fill('basic-mountain')]],
      ['p2', Array(40).fill('basic-mountain')],
    ]),
    registry,
  });
  // Rozstrzygnij mulligan + przejdź do main.
  // M257-r5b/B: starter losowy — keepujemy wg aktualnej kolejki mulliganów.
  for (const pid of [...state.pendingMulligans]) {
    execute(state, { type: 'resolve_mulligan_choice', playerId: pid, keep: true });
  }
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';

  // Wstaw Stomping Slabs do ręki p1 (losowo mógł trafić do biblioteki).
  putInHand(state, registry, 'p1', 'stomping-slabs');
  // 2 lands mountains (mana {R}{R} = 2) + 1 generic (dla 2R).
  putOnBattlefield(state, registry, 'p1', 'basic-mountain');
  putOnBattlefield(state, registry, 'p1', 'basic-mountain');
  putOnBattlefield(state, registry, 'p1', 'basic-mountain');
  // Daj dodatkową many w puli.
  state.players[0].mana = 1;
  state.players[0].manaPool = { '': 1 };
  const slabsInHand = state.zones.hand.find((id) => state.objects.get(id)?.cardId === 'stomping-slabs');
  assert.ok(slabsInHand, 'Stomping Slabs powinno być w ręce p1');
  const castResult = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: slabsInHand });
  assert.ok(castResult.ok, `cast: ${castResult.events?.[0]?.reason}`);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  // Powinno być pendingRevealOrder z cardIds.
  assert.ok(state.pendingRevealOrder, 'pendingRevealOrder powinno istnieć');
  const view = playerView(state, 'p1');
  assert.ok(view.pendingRevealOrder, 'view.pendingRevealOrder powinno istnieć');
  assert.ok(view.pendingRevealOrder.cardIds.length > 0, 'cardIds powinny istnieć');

  // Użyj createSession żeby mieć pełne nameOf/registry (commandLabel go woła).
  const session = createSession({
    seed: 1,
    registry,
    decks: new Map([
      ['p1', ['stomping-slabs', 'basic-mountain', 'basic-mountain', 'basic-mountain', ...Array(35).fill('basic-mountain')]],
      ['p2', Array(40).fill('basic-mountain')],
    ]),
  });
  // Zbuduj fikcyjną komendę resolve_reveal_order (order = pełna lista odsłoniętych).
  const fakeCmd = {
    type: 'resolve_reveal_order',
    playerId: 'p1',
    order: view.pendingRevealOrder.cardIds.slice(),
  };
  const label = commandLabel(fakeCmd, session, view);

  // Etykieta MUSI zawierać nazwy kart (np. „Mountain", „Vandalize"), nie „karty 1, 2, 3".
  assert.ok(!/karty 1, 2/.test(label),
    `Etykieta NIE MOŻE być pozycjami (1, 2, 3...): ${label}`);
  // Powinna zawierać nazwy kart z biblioteki.
  // pendingRevealOrder.cardIds to objectIds (id obiektów gry), a revealedNames
  // to cardIds kart w tej samej kolejności — registry zna cardIds, nie objectIds.
  const sample = (view.pendingRevealOrder.revealedNames ?? [])
    .map((cardId) => registry.get(cardId)?.name)
    .filter(Boolean);
  assert.ok(sample.length > 0, 'Powinny być nazwy odsłoniętych kart: ' + JSON.stringify(view.pendingRevealOrder));
  for (const name of sample.slice(0, 3)) {
    assert.ok(label.includes(name),
      `Etykieta MUSI zawierać nazwę ${name}: ${label}`);
  }
});
