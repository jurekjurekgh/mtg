// E2/A planu 2026-09-07 (wyceny bota): cztery decyzje, których brak case
// w scoreCommand (default: finish(0)) czynił wybór ZALEŻNYM OD KOLEJNOŚCI
// OFERT (antywzorzec L41, klasa M131/M336):
//  1. resolve_optional_draw — pierwsza oferta draw:false → bot NIGDY nie
//     dobierał (ferocious „draw a card. If you do, discard a card.").
//  2. resolve_damage_target — „any target" (Stomping Slabs): cel z kolejności.
//  3. resolve_hand_creature — Dragon Arch: pierwsza oferta to ODMOWA
//     (darmowy wielokolorowy stwór przepadał).
//  4. resolve_modal_choice z celem — modeScore bez targetId: pump mógł
//     wzmocnić stwora PRZECIWNIKA (Inspiring Bard).
// Nośniki: stany z ustawionym pending* (kanał ofert silnika) + karty
// katalogu jako treść decyzji (ADR 0029: zero nowych kart).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function putCreature(state, id, controllerId, power, toughness, zone = 'battlefield') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone,
    kind: 'creature', power, toughness, manaCost: 3,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    cardName: id,
  });
  return state.objects.get(id);
}

function botChoice(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  return bot.chooseCommand(view);
}

test('E2/A1: ferocious draw+discard — bot dobiera (draw:true), nie pierwszy wariant draw:false', () => {
  const state = newState();
  // Ręka z „najgorszą” kartą: kantryp (dobierz, odłóż najgorszą) podnosi jakość.
  putCreature(state, 'r1', 'p1', 1, 1, 'hand');
  // UWAGA (L116): createGameState bez talii ma PUSTĄ bibliotekę — dobieranie
  // byłoby przegraną (CR 104.4c). Dodajemy kartę, by testował kantryp.
  putCreature(state, 'lib1', 'p1', 0, 0, 'library');
  state.pendingOptionalDraw = { playerId: 'p1', sourceCardId: null, restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_optional_draw');
  assert.equal(chosen.draw, true, `bot ma dobrać kartę, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/A1b: pusta biblioteka — dobieranie oznacza przegraną (CR 104.4c), bot odmawia', () => {
  const state = newState();
  putCreature(state, 'r1', 'p1', 1, 1, 'hand');
  state.pendingOptionalDraw = { playerId: 'p1', sourceCardId: null, restorePriorityTo: null };
  state.zones.library = []; // dobieranie z pustej biblioteki = przegrana
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_optional_draw');
  assert.equal(chosen.draw, false, `przy pustej bibliotece bot ma odmówić: ${JSON.stringify(chosen)}`);
});

test('E2/A2: „any target" 7 obrażeń — bot czyta KWOTĘ: zabija 2/2 (removal > chip w gracza)', () => {
  const state = newState();
  putCreature(state, 'moj', 'p1', 2, 2);
  putCreature(state, 'chump', 'p2', 2, 2);   // 7 obrażeń = lethal → removal (~30)
  putCreature(state, 'goliat', 'p2', 9, 9);  // nieletalny (7 < 9) → zły cel
  state.pendingDamageTarget = {
    playerId: 'p1', sourceId: 'slabs', cardId: 'stomping-slabs', amount: 7,
    candidateIds: ['moj', 'chump', 'goliat', 'p2'], restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_damage_target');
  assert.equal(chosen.targetId, 'chump',
    `wspólna polityka damageTargetValue: zabić stwora zamiast chipać gracza (20 pkt), wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/A3: Dragon Arch — bot wyłania NAJMOCNIEJSzego stwora z ręki (nie odmowę z początku oferty)', () => {
  const state = newState();
  function handCreature(id, power, toughness) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p1', zone: 'hand',
      kind: 'creature', power, toughness, manaCost: 4,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G', 'W'],
      cardName: id,
    });
  }
  handCreature('slaby', 1, 1);
  handCreature('mocny', 6, 6);
  state.pendingHandCreature = { playerId: 'p1', sourceCardId: null, candidateIds: ['slaby', 'mocny'], restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_hand_creature');
  assert.equal(chosen.targetId, 'mocny', `darmowy stwór: najmocniejszy kandydat, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/A4: modalny trigger z celem (Inspiring Bard) — pump idzie we WŁASNEGO stwora', () => {
  const state = newState();
  const def = REGISTRY.get('inspiring-bard');
  addObject(state, {
    id: 'bard', instanceId: 'i-bard', cardId: 'inspiring-bard', controllerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def),
  });
  putCreature(state, 'moj', 'p1', 2, 2);
  putCreature(state, 'wrogi', 'p2', 5, 5); // pierwszy w kolejności pola — dotąd dostawał pump
  // Kolejność pola bitwy z wrogim pierwszym: oferta pierwsza = wrogi stwór.
  state.zones.battlefield = ['wrogi', 'moj', 'bard'];
  state.pendingModalTrigger = {
    playerId: 'p1', sourceId: 'bard', cardId: 'inspiring-bard',
    ability: def.abilities[0],
    modes: [def.abilities[0].trigger.modes[0]], // tylko tryb z celem (pump +2/+2)
    extra: {}, restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_modal_choice');
  assert.deepEqual([chosen.modeIndex, chosen.targetId], [0, 'moj'],
    `+2/+2 ma wzmocnić własnego stwora, wybrał: ${JSON.stringify(chosen)}`);
});
