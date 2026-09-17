import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addCounter } from '../src/engine/counters.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Znaleziska właściciela z gier testowych (2026-09-17), etap E4:
 *   D. Necrosquito — brak licznika oil, gdy PRZEJĘTY stwór (Awaken the
 *      Sleeper) zginął pod moją kontrolą. Obiekt w grobie należy do
 *      właściciela (CR 400.3), więc filtr „you control" czytał złą kontrolę —
 *      od tej poprawki wszystkie filtry śmierci biorą kontrolę z LKI
 *      (CR 603.10a), także dla triggerów „when this creature dies".
 *   E. Highland Game — trigger śmierci („you gain 2 life") musi odpalić
 *      dokładnie RAZ na śmierć, także gdy śmierć rozstrzyga się między
 *      przebiegami obrażeń (first strike) i gdy stos rozstrzyga się po walce.
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, active = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  return state;
}

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
  return state.objects.get(id);
}

/** Zmiana pola poza kontraktem addObject (L21) — np. damage albo przejęcie. */
function setField(state, id, patch) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 200) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  return state.zones.stack.length === 0;
}

const oilOf = (state, id) => state.objects.get(id)?.counters?.oil ?? 0;
const lifeOf = (state, id) => state.players.find((p) => p.id === id).life;
const fires = (state, cardId) => state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === cardId).length;
const deathEvent = (state, cardId) => state.events.filter((e) => e.type === 'creature_destroyed' && e.cardId === cardId);

// =============================================================================
// D. Kontrola z chwili śmierci (LKI), nie z właściciela obiektu w grobie
// =============================================================================

test('D1: Necrosquito dostaje oil, gdy ginie PRZEJĘTY stwór (kontrola w chwili śmierci)', () => {
  const state = mainPhase(game(11));
  addRealCard(state, 'necro', 'necrosquito', 'p1', 'battlefield');
  addCounter(state, 'necro', 'oil', 2);
  // Stwór właściciela p2 przejęty przez p1 (Awaken the Sleeper) — ginie
  // śmiertelnych obrażeń, więc trafia do grobu WŁAŚCICIELA (CR 400.3).
  addRealCard(state, 'stolen', 'highland-game', 'p1', 'battlefield', { ownerId: 'p2' });
  setField(state, 'stolen', { damage: 2, summoningSickness: false });

  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'SBA zabija stwora');
  assert.equal(deathEvent(state, 'highland-game').length, 1, 'jedna śmierć');
  assert.equal(fires(state, 'necrosquito'), 1, 'trigger Necrosquito (kontrolowałem w chwili śmierci)');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(oilOf(state, 'necro'), 3, 'oil +1 za śmierć przejętego stwora');
});

test('D2: Necrosquito NIE dostaje oil, gdy mój stwór zginął pod kontrolą przeciwnika', () => {
  const state = mainPhase(game(12));
  addRealCard(state, 'necroMine', 'necrosquito', 'p1', 'battlefield');
  addCounter(state, 'necroMine', 'oil', 2);
  addRealCard(state, 'necroThief', 'necrosquito', 'p2', 'battlefield');
  addCounter(state, 'necroThief', 'oil', 2);
  // Mój stwór przejęty przez p2 — ginie pod kontrolą p2.
  addRealCard(state, 'mine', 'highland-game', 'p1', 'battlefield');
  setField(state, 'mine', { controllerId: 'p2', damage: 2, summoningSickness: false });

  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'SBA zabija stwora');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(oilOf(state, 'necroThief'), 3, 'oil dostaje kontroler z chwili śmierci');
  assert.equal(oilOf(state, 'necroMine'), 2, 'właściciel nie kontrolował — bez oil');
});

test('D3: trigger „when this creature dies" rozstrzyga KONTROLER z chwili śmierci (CR 603.10a)', () => {
  const state = mainPhase(game(13));
  // Highland Game właściciela p1 przejęty przez p2 (Awaken the Sleeper).
  addRealCard(state, 'hg', 'highland-game', 'p1', 'battlefield', { ownerId: 'p1' });
  setField(state, 'hg', { controllerId: 'p2', damage: 2, summoningSickness: false });
  const p1Before = lifeOf(state, 'p1');
  const p2Before = lifeOf(state, 'p2');

  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'SBA zabija stwora');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(lifeOf(state, 'p2'), p2Before + 2, '2 życia dla kontrolera z chwili śmierci');
  assert.equal(lifeOf(state, 'p1'), p1Before, 'właściciel nic nie dostaje');
});

// =============================================================================
// E. Highland Game — dokładnie JEDNO +2 życia na śmierć
// =============================================================================

/** Deklaracje + obrażenia + (przy pierwszym uderzeniu) drugi przebieg. */
function runCombat(state, defenderId, attackerIds) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', state.turn.activePlayerId);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: state.turn.activePlayerId, attackerIds }).ok, 'deklaracja atakujących');
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const blockerView = playerView(state, state.turn.priorityPlayerId);
  assert.equal(blockerView.legalCommands.some((c) => c.type === 'declare_blockers'), true, 'deklaracja blokujących');
  const assignments = Object.fromEntries(attackerIds.map((id) => [id, ['hg']]));
  assert.ok(execute(state, { type: 'declare_blockers', playerId: state.turn.priorityPlayerId, assignments }).ok, 'bloki');
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  let guard = 0;
  while (state.turn.step === 'combat_damage' && guard++ < 12) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const cmd = view.legalCommands.find((c) => c.type === 'resolve_combat')
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    assert.ok(execute(state, cmd).ok, `komenda walki ${cmd.type}`);
  }
  assert.notEqual(state.turn.step, 'combat_damage', 'walka domknięta');
}

test('E1: wymiana w walce — Highland Game daje 2 życia dokładnie raz (trigger po walce)', () => {
  const state = mainPhase(game(21), 'p2');
  addRealCard(state, 'hg', 'highland-game', 'p1', 'battlefield');
  setField(state, 'hg', { summoningSickness: false });
  addRealCard(state, 'piker', 'goblin-piker', 'p2', 'battlefield');
  setField(state, 'piker', { summoningSickness: false });
  const before = lifeOf(state, 'p1');

  runCombat(state, 'p1', ['piker']);
  assert.equal(deathEvent(state, 'highland-game').length, 1, 'Highland Game umiera raz');
  assert.equal(deathEvent(state, 'goblin-piker').length, 1, 'blokujący atakujący też umiera');
  assert.equal(fires(state, 'highland-game'), 1, 'jedno zakolejkowanie triggera');
  assert.ok(resolveStack(state), 'stos (trigger) rozstrzygnięty po walce');
  assert.equal(lifeOf(state, 'p1'), before + 2, 'dokładnie +2 życia, nie +4');
  assert.equal(fires(state, 'highland-game'), 1, 'trigger nadal tylko jeden');
});

test('E2: śmierć od pierwszego uderzenia (między przebiegami) — nadal jedno +2 życia', () => {
  const state = mainPhase(game(22), 'p2');
  addRealCard(state, 'hg', 'highland-game', 'p1', 'battlefield');
  setField(state, 'hg', { summoningSickness: false });
  addRealCard(state, 'striker', 'goblin-piker', 'p2', 'battlefield');
  setField(state, 'striker', { summoningSickness: false, keywords: ['first strike'] });
  const before = lifeOf(state, 'p1');

  runCombat(state, 'p1', ['striker']);
  assert.equal(deathEvent(state, 'highland-game').length, 1, 'śmierć w przebiegu pierwszego uderzenia');
  assert.equal(lifeOf(state, 'p2'), 20, 'pierwsze uderzenie zabiło blokera przed jego obrażeniami');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(fires(state, 'highland-game'), 1, 'jedno zakolejkowanie triggera');
  assert.equal(lifeOf(state, 'p1'), before + 2, 'dokładnie +2 życia');
});
