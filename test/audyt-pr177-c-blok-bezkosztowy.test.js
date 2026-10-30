/**
 * Sesja 2026-10-27c (PR #177) — uwaga C właściciela z gry.
 *
 * PIN: bez naprawy czerwienieje (mutacja sprawdzona w ciele PR #177).
 *
 * C. Blok: bot z 1/2 przepuszczał CAŁY atak (3/2 + 1/2 + 1/3), bo blok
 * bezkosztowy remisował z passem (+1 wchłonięte obrażenia −1 zaangażowania)
 * i remis rozstrzygała kolejność ofert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, kind }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function damageIt(state, id, damage) {
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, damage, damagedThisTurn: true }));
}

/** Tura bota (p2), priorytet bota, pełna pula. */
function botTurn(step = 'main1') {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

const bot = () => createHeuristicBot({ seed: 7 });

// ------------------------------------------------------------- C (blok) ----
function combatWith(blockerPower, blockerToughness, attackers) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const attackerIds = [];
  for (const [index, [power, toughness]] of attackers.entries()) {
    const id = `a${index}`;
    attackerIds.push(id);
    put(state, { id, cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
    const object = state.objects.get(id);
    state.objects.set(id, Object.freeze({ ...object, power, toughness }));
  }
  put(state, { id: 'blk', cardId: 'greenwood-sentinel', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  state.objects.set('blk', Object.freeze({
    ...state.objects.get('blk'), power: blockerPower, toughness: blockerToughness,
  }));
  const attack = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  assert.equal(attack.ok, true, 'atak zadeklarowany');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'declare_blockers', 'silnik prowadzi do kroku bloków');
  return { state, attackerIds };
}

test('C: 1/2 BLOKUJE przy ataku 3/2 + 1/2 + 1/3 (nikt nie ginie — obrażenia za darmo)', () => {
  const { state } = combatWith(1, 2, [[3, 2], [1, 2], [1, 3]]);
  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'declare_blockers');
  const assignments = choice.assignments ?? {};
  const blocked = Object.keys(assignments);
  assert.equal(blocked.length, 1,
    `blok ma objąć dokładnie jednego atakującego o sile 1; wybrano ${JSON.stringify(assignments)}`);
  const attacker = state.objects.get(blocked[0]);
  assert.equal(attacker.power, 1, `blokować trzeba 1/2 albo 1/3, nie ${attacker.power}/?`);
  assert.deepEqual(assignments[blocked[0]], ['blk']);
});

test('C: bloker, który GINIE od ataku 3/3, nadal nie blokuje bez presji (bez nadgorliwości)', () => {
  const { state } = combatWith(2, 2, [[3, 3]]);
  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.deepEqual(choice.assignments ?? {}, {},
    `2/2 za 3/3 to strata ciała — pass; wybrano ${JSON.stringify(choice)}`);
});

