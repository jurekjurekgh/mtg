import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

// F1 audytu PR140: walidujemy CAŁĄ decyzję przed ruchem z biblioteki.
// CR 608.2d (pobrane 2026-09-28): „The player can't choose an option that's
// illegal or impossible” — https://mtg.wiki/page/Resolving_spells_and_abilities
// CR 733.1: „No abilities trigger and no effects apply as a result of an
// undone action.” — https://mtg.wiki/page/Illegal_action (CR 2026-09-25).
// Nie cofamy wykonanego legalnego look ani nie odwracamy biblioteki:
// niepoprawna komenda nie rozpoczyna żadnego ruchu. Chronimy również
// sekwencję ID, LKI, linki źródła, eventy, priorytet i dziennik komend.
const registry = createCardRegistry();

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const card = registry.get(cardId);
  assert.ok(card, `${cardId} z rzeczywistego rejestru`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, ownerId: playerId, controllerId: playerId,
    zone, ...gameObjectDataOf(card), types: card.types, subtypes: card.subtypes,
    keywords: card.keywords,
  });
}

function run(state, cmd) {
  assert.ok(cmd, 'komenda istnieje w ofercie');
  const result = execute(state, cmd);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

function waitingForLook(cardId) {
  const state = createGameState({ seed: 142, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  const cards = ['basic-swamp', 'highland-game', 'basic-forest', 'razorfoot-griffin', 'basic-island', 'basic-mountain'];
  for (const playerId of ['p1', 'p2']) {
    cards.forEach((id, i) => put(state, `lib-${playerId}-${i}`, id, playerId, 'library'));
  }
  addMana(state, 'p1', 5);
  if (cardId === 'merchants-dockhand') {
    put(state, 'source', cardId, 'p1', 'battlefield');
    state.objects.set('source', Object.freeze({ ...state.objects.get('source'), summoningSickness: false }));
    for (let i = 0; i < 4; i++) put(state, `artifact-${i}`, 'trigon-of-thought', 'p1', 'battlefield');
    run(state, playerView(state, 'p1').legalCommands.find((c) =>
      c.type === 'activate_ability' && c.objectId === 'source' && c.xValue === 4));
  } else {
    put(state, 'source', cardId);
    run(state, playerView(state, 'p1').legalCommands.find((c) =>
      c.type === 'cast_permanent' && c.objectId === 'source'));
  }
  for (let i = 0; !state.pendingLookTopN && i < 20; i++) {
    run(state, playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  assert.ok(state.pendingLookTopN, 'decyzja pochodzi z prawdziwego ETB/rozdziału/aktywacji');
  assert.equal(state.pendingLookTopN.restTo, 'library_bottom');
  assert.ok(state.pendingLookTopN.objectIds.length >= 3, 'test kolejności ma co najmniej dwie pozostałe karty');
  return state;
}

const badOrders = [
  ['za krótka', (rest) => rest.slice(1)],
  ['za długa', (rest) => [...rest, 'obca-karta']],
  ['duplikat', (rest) => [rest[0], ...rest.slice(0, -1)]],
  ['obca karta przy właściwej długości', (rest) => ['obca-karta', ...rest.slice(1)]],
  ['wybrana karta również na spód', (rest, pickId) => [pickId, ...rest.slice(1)]],
];

for (const cardId of ['clone-shell', 'merchants-dockhand', 'rediscover-the-way']) {
  for (const [name, makeOrder] of badOrders) {
    test(`PR140/F1 ${cardId}: ${name} — odmowa atomowa, ponowienie legalne`, () => {
      const state = waitingForLook(cardId);
      const pending = state.pendingLookTopN;
      const pickId = pending.objectIds[1];
      const rest = pending.objectIds.filter((id) => id !== pickId);
      const before = structuredClone(state);
      const rejected = execute(state, {
        type: 'resolve_look_top_choice', playerId: 'p1', cardId: pickId,
        bottomOrder: makeOrder(rest, pickId),
      });
      assert.equal(rejected.ok, false);
      assert.equal(rejected.events[0].reason, 'illegal_look_top_bottom_order');
      assert.deepEqual(state, before, 'odmowa nie zmienia ŻADNEJ części GameState');

      const legal = {
        type: 'resolve_look_top_choice', playerId: 'p1', cardId: pickId,
        bottomOrder: [...rest].reverse(),
      };
      run(state, legal);
      run(before, legal);
      assert.deepEqual(state, before, 'ponowienie = wynik bez poprzedzającej nielegalnej próby');
      assert.equal(state.pendingLookTopN, null);
      assert.deepEqual(state.zones.library.slice(-rest.length), [...rest].reverse());
      assert.equal(state.objects.has(pickId), false, 'wybrana karta zmieniła obiekt i strefę');
      if (pending.pickTo === 'exile_face_down_linked') {
        const ids = state.objects.get(pending.sourceId).exiledCardIds;
        assert.equal(ids.length, 1, 'dokładnie jeden link, nie dwa po ponowieniu');
        assert.equal(state.objects.get(ids[0]).zone, 'exile');
        assert.equal(state.objects.get(ids[0]).faceDown, true);
      } else {
        assert.equal(state.zones.hand.length, 1, 'dokładnie jedna karta do ręki');
      }
    });
  }

  test(`PR140/F1 ${cardId}: brak bottomOrder zachowuje kolejność pozostałych`, () => {
    const state = waitingForLook(cardId);
    const [pickId, ...rest] = state.pendingLookTopN.objectIds;
    run(state, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: pickId });
    assert.equal(state.pendingLookTopN, null);
    assert.deepEqual(state.zones.library.slice(-rest.length), rest);
  });

  test(`PR140/F1 ${cardId}: zły gracz i nielegalny pick też nie zmieniają stanu`, () => {
    const state = waitingForLook(cardId);
    const before = structuredClone(state);
    const pickId = state.pendingLookTopN.objectIds[0];
    for (const [playerId, cardId, reason] of [
      ['p2', pickId, 'look_top_not_your_decision'],
      ['p1', null, 'illegal_look_top_choice'],
      ['p1', 'obca-karta', 'illegal_look_top_choice'],
    ]) {
      const result = execute(state, { type: 'resolve_look_top_choice', playerId, cardId });
      assert.equal(result.ok, false);
      assert.equal(result.events[0].reason, reason);
      assert.deepEqual(state, before);
    }
  });
}
