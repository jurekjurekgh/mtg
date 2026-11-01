/**
 * Sesja 2026-10-27c (PR #177) — uwaga A właściciela z gry.
 *
 * PIN: bez naprawy czerwienieje (mutacja sprawdzona w ciele PR #177).
 *
 * A. Fathom Fleet Cutthroat (ETB: „destroy target creature an opponent controls
 * that was dealt damage this turn") — bot rzucał w Głównej 1, gdzie nie ma
 * jeszcze celu, więc trigger nie wchodził na stos (CR 603.3d) i karta+mana
 * przepadały. Reguła: czekaj na Główną 2, chyba że cel już istnieje.
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

// ---------------------------------------------------------------- A (ETB) ---
test('A: Fathom Fleet Cutthroat czeka na Główną 2, gdy nie ma celu „obrażony w tej turze”', () => {
  const state = botTurn('main1');
  put(state, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand', kind: 'creature' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'pass_priority',
    `bot nie może rzucać w Głównej 1, gdy ETB nie ma legalnego celu; wybrał ${JSON.stringify(choice)}`);

  const main2 = botTurn('main2');
  put(main2, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand', kind: 'creature' });
  put(main2, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  damageIt(main2, 'foe', 1);
  const afterCombat = bot().chooseCommand(playerView(main2, 'p2'), {});
  assert.equal(afterCombat.type, 'cast_permanent',
    `w Głównej 2 (cel już obrażony) bot ma rzucać; wybrał ${JSON.stringify(afterCombat)}`);
  assert.equal(afterCombat.objectId, 'ffc');
});

test('A: istniejący cel „obrażony w tej turze” nie jest wstrzymywany do Głównej 2', () => {
  const state = botTurn('main1');
  put(state, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand', kind: 'creature' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  damageIt(state, 'foe', 1);

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'cast_permanent',
    `ETB ma legalny cel — czekanie byłoby stratą tempa; wybrał ${JSON.stringify(choice)}`);
});

test('A: reguła nie łapie kart bez ETB „obrażony w tej turze” (bez nadgorliwości)', () => {
  const state = botTurn('main1');
  put(state, { id: 'bear', cardId: 'ordinary-bear', controllerId: 'p2', zone: 'hand', kind: 'creature' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'cast_permanent',
    `vanilla stwór ma być rzucany w Głównej 1; wybrał ${JSON.stringify(choice)}`);
});

