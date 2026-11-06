// PR #179, etap 1: aktywne testy chroniące zachowania, które już działają.
// Nie zmieniają produkcji i nie zamykają otwartych A110–A113.
//
// Podstawa: CR 603.2 (wyzwolenie przy zdarzeniu), 603.3b (umieszczenie na
// stosie przed priorytetem), 603.10/603.10a (odejście patrzy wstecz na stan
// sprzed zdarzenia). Oracle Nefarious Imp: „Whenever one or more permanents
// you control leave the battlefield, scry 1.”
//
// Imp, Gather the Townsfolk i biblioteki są rzeczywistymi kartami. Ofiary bez
// zdolności są jawnie syntetycznym przygotowaniem planszy; wszystkie kroki gry
// wykonują rzeczywiste komendy silnika. Liczymy `ability_triggered`, nie tylko
// `scry_started`, bo pierwsza decyzja scry blokuje rozstrzyganie kolejnych.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

const REGISTRY = createCardRegistry();
const IMP_EVENT = 'permanents_you_control_leave_battlefield';

function put(state, id, cardId, playerId, zone = 'battlefield') {
  const card = REGISTRY.get(cardId);
  addObject(state, {
    ...gameObjectDataOf(card), id, instanceId: `i-${id}`, cardId,
    ownerId: playerId, controllerId: playerId, zone,
    types: card.types ?? [], subtypes: card.subtypes ?? [],
  });
  return state.objects.get(id);
}

function scene(active = 'p1') {
  const state = createGameState({ seed: 17901, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', active);
  state.turn.activePlayerId = state.turn.priorityPlayerId = active;
  for (const player of ['p1', 'p2']) {
    put(state, `lib-${player}-0`, 'basic-forest', player, 'library');
    put(state, `lib-${player}-1`, 'basic-forest', player, 'library');
  }
  return state;
}

function victim(state, id, playerId, { ownerId = playerId, damage = 99 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'test-victim', ownerId, controllerId: playerId,
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), damage, summoningSickness: false }));
  return state.objects.get(id);
}

const legal = (state) => playerView(state, state.turn.priorityPlayerId).legalCommands;
function act(state, command) {
  assert.ok(command, JSON.stringify(legal(state)));
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
function pass(state) {
  act(state, legal(state).find((c) => c.type === 'pass_priority'));
}
function drainToDecision(state) {
  for (let i = 0; i < 40 && state.zones.stack.length > 0 && !state.pendingScry; i += 1) {
    const commands = legal(state);
    const order = commands.find((c) => c.type === 'resolve_trigger_order');
    if (order) { act(state, order); continue; }
    const next = commands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    act(state, next);
  }
}
function resolveScry(state) {
  const command = legal(state).find((c) => c.type === 'resolve_scry');
  assert.ok(command, 'oczekiwana decyzja scry');
  act(state, { ...command, bottomIds: [] });
}
const impFired = (state) => state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'nefarious-imp');
const impStack = (state) => state.zones.stack
  .map((id) => state.objects.get(id))
  .filter((o) => o?.triggerEntry?.ability?.trigger?.event === IMP_EVENT);
const scryStarts = (state) => state.events.filter((e) => e.type === 'scry_started' && e.playerId != null);

function checkReplay(state, base, factory) {
  const replay = replayFromState(state);
  const verified = verifyReplay({ ...replay, commands: replay.commands.slice(base) }, factory, execute);
  assert.ok(verified.deterministic, 'replay jest deterministyczny');
  assert.ok(verified.results.every((r) => r.ok), `każda komenda replay jest legalna: ${JSON.stringify(verified.results.filter((r) => !r.ok))}`);
  assert.equal(stateFingerprint(verified.state), stateFingerprint(state));
}

test('regresja: trzy własne permanenty odchodzące razem dają jeden wyzwalacz Impa i jeden scry', () => {
  const factory = () => {
    const state = scene();
    put(state, 'imp', 'nefarious-imp', 'p1');
    for (const id of ['v1', 'v2', 'v3']) victim(state, id, 'p1');
    return state;
  };
  const state = factory(), base = state.commands.length;
  pass(state);
  assert.equal(state.events.filter((e) => e.type === 'creature_destroyed').length, 3);
  assert.equal(impFired(state).length, 1, 'jedno zdarzenie zbiorcze, nie trzy');
  assert.equal(impStack(state).length, 1);
  assert.equal(impStack(state)[0].triggerEntry.sourceId, 'imp');
  assert.equal(impStack(state)[0].controllerId, 'p1');
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p1');
  assert.equal(scryStarts(state).length, 1);
  checkReplay(state, base, factory);
  resolveScry(state);
  assert.equal(state.pendingScry, null);
  checkReplay(state, base, factory);
});

test('regresja: same permanenty przeciwnika nie wyzwalają Impa', () => {
  const factory = () => {
    const state = scene();
    put(state, 'imp', 'nefarious-imp', 'p1');
    victim(state, 'e1', 'p2');
    victim(state, 'e2', 'p2');
    return state;
  };
  const state = factory(), base = state.commands.length;
  pass(state);
  assert.equal(state.events.filter((e) => e.type === 'creature_destroyed').length, 2);
  assert.equal(impFired(state).length, 0);
  assert.equal(impStack(state).length, 0);
  assert.equal(state.pendingScry, null);
  checkReplay(state, base, factory);
});

test('regresja: mieszani kontrolerzy dostają po jednym wyzwalaczu, tylko za własne odejścia', () => {
  const factory = () => {
    const state = scene('p1');
    put(state, 'imp-p1', 'nefarious-imp', 'p1');
    put(state, 'imp-p2', 'nefarious-imp', 'p2');
    victim(state, 'a1', 'p1');
    victim(state, 'a2', 'p1');
    victim(state, 'b1', 'p2');
    return state;
  };
  const state = factory(), base = state.commands.length;
  pass(state);
  const fired = impFired(state);
  assert.equal(fired.length, 2);
  assert.equal(fired.filter((e) => e.playerId === 'p1').length, 1);
  assert.equal(fired.filter((e) => e.playerId === 'p2').length, 1);
  assert.deepEqual(impStack(state).map((o) => o.triggerEntry.sourceId), ['imp-p1', 'imp-p2'],
    'aktywny p1 umieszcza swój wyzwalacz pod wyzwalaczem nieaktywnego p2');
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p2', 'LIFO: najpierw wyzwalacz gracza nieaktywnego');
  resolveScry(state);
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p1');
  resolveScry(state);
  assert.equal(scryStarts(state).length, 2);
  checkReplay(state, base, factory);
});

test('regresja: dwa tokeny Gather the Townsfolk odchodzące razem liczą się jak permanenty', () => {
  const factory = () => {
    const state = scene();
    put(state, 'imp', 'nefarious-imp', 'p1');
    put(state, 'gather', 'gather-the-townsfolk', 'p1', 'hand');
    addMana(state, 'p1', 2);
    act(state, legal(state).find((c) => c.type === 'cast_spell' && c.objectId === 'gather'));
    drainToDecision(state);
    const created = [...state.objects.values()].filter((o) => o.cardId === 'token_human' && o.zone === 'battlefield');
    assert.equal(created.length, 2);
    for (const token of created) {
      state.objects.set(token.id, Object.freeze({ ...state.objects.get(token.id), damage: 99 }));
    }
    return state;
  };
  const state = factory(), base = state.commands.length;
  const tokens = [...state.objects.values()].filter((o) => o.cardId === 'token_human' && o.zone === 'battlefield');
  pass(state);
  assert.equal(state.events.filter((e) => e.type === 'creature_destroyed' && e.cardId === 'token_human').length, 2);
  assert.equal(impFired(state).length, 1, 'token to permanent; dwa tokeny razem to jeden wyzwalacz');
  assert.ok(tokens.every((token) => !state.objects.has(token.id)), 'tokeny poza polem bitwy przestają istnieć');
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p1');
  resolveScry(state);
  checkReplay(state, base, factory);
});

test('regresja: dwie kopie Impa wyzwalają się osobno od tego samego odejścia', () => {
  const factory = () => {
    const state = scene();
    put(state, 'imp1', 'nefarious-imp', 'p1');
    put(state, 'imp2', 'nefarious-imp', 'p1');
    victim(state, 'v', 'p1');
    return state;
  };
  const state = factory(), base = state.commands.length;
  pass(state);
  assert.equal(impFired(state).length, 2, 'każda instancja zdolności wyzwala osobno');
  assert.equal(impStack(state).length, 2);
  assert.deepEqual(impStack(state).map((o) => o.triggerEntry.sourceId).sort(), ['imp1', 'imp2']);
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p1');
  resolveScry(state);
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p1');
  resolveScry(state);
  assert.equal(scryStarts(state).length, 2);
  checkReplay(state, base, factory);
});

test('regresja: przejęty permanent liczy się kontrolerowi, nie właścicielowi', () => {
  const factory = () => {
    const state = scene();
    put(state, 'imp', 'nefarious-imp', 'p1');
    victim(state, 'stolen', 'p1', { ownerId: 'p2' });
    return state;
  };
  const state = factory(), base = state.commands.length;
  pass(state);
  assert.equal(impFired(state).length, 1);
  assert.equal(impFired(state)[0].playerId, 'p1', 'kontroler z chwili odejścia, nie właściciel karty');
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p1');
  resolveScry(state);
  checkReplay(state, base, factory);
});

test('regresja: w turze przeciwnika scry przejmuje priorytet i oddaje go po decyzji', () => {
  const factory = () => {
    const state = scene('p2');
    put(state, 'imp', 'nefarious-imp', 'p1');
    victim(state, 'v', 'p1');
    put(state, 'foe', 'highland-game', 'p2', 'hand');
    addMana(state, 'p2', 3);
    return state;
  };
  const state = factory(), base = state.commands.length;
  // Rzutu permanentu nie kończy tury: po SBA i triggerze priorytet ma zostać u p2.
  act(state, legal(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'foe'));
  assert.equal(impFired(state).length, 1);
  drainToDecision(state);
  assert.equal(state.pendingScry?.playerId, 'p1');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'decyzję podejmuje kontroler Impa');
  checkReplay(state, base, factory);
  resolveScry(state);
  assert.equal(state.pendingScry, null);
  assert.equal(state.turn.priorityPlayerId, 'p2', 'priorytet wraca do gracza, który go miał');
  checkReplay(state, base, factory);
});
