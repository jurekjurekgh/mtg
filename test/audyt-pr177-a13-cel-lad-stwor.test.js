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
import { animatePermanentUntilEndOfTurn } from '../src/engine/permanents.js';
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

test('A13: obrażony ląd-stwór jest celem ETB Cutthroata', () => {
  const state = botTurn('main1');
  put(state, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand' });
  put(state, { id: 'foe', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield' });
  animatePermanentUntilEndOfTurn(state, 'foe', { power: 5, toughness: 5, typesAdd: ['Creature'] });
  damageIt(state, 'foe', 1);
  const v = playerView(state, 'p2');
  const foe = v.zones.battlefield.find(o => o.id === 'foe');
  assert.equal(foe.kind, 'creature');
  assert.ok(foe.types.includes('Land'));
  const choice = bot().chooseCommand(v);
  assert.equal(choice.type, 'cast_permanent', JSON.stringify(choice));
  assert.equal(choice.objectId, 'ffc');
  assert.ok(execute(state, choice).ok);
  for (let i = 0; i < 12 && state.objects.get('foe')?.zone === 'battlefield'; i++) {
    const options = playerView(state, state.turn.priorityPlayerId).legalCommands;
    const next = options.find(c => c.type === 'resolve_trigger_target' && c.targetId === 'foe')
      ?? options.find(c => c.type === 'pass_priority');
    assert.ok(next, `oczekiwano priorytetu lub wyboru celu (${JSON.stringify(options)})`);
    assert.ok(execute(state, next).ok);
  }
  assert.notEqual(state.objects.get('foe')?.zone, 'battlefield', 'silnik niszczy ląd-stwora');
  assert.ok([...state.objects.values()].some(o => o.cardId === 'basic-forest' && o.zone === 'graveyard'));
});

test('A13: jedyny obrażony stwór z hexproof nie jest legalnym celem', () => {
  const state = botTurn('main1');
  put(state, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield' });
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), keywords: ['hexproof'] }));
  damageIt(state, 'foe', 1);
  const choice = bot().chooseCommand(playerView(state, 'p2'));
  assert.equal(choice.type, 'pass_priority', JSON.stringify(choice));
});

test('A13: bez obrażeń ląd-stwór nie jest celem', () => {
  const state = botTurn('main1');
  put(state, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand' });
  put(state, { id: 'foe', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield' });
  animatePermanentUntilEndOfTurn(state, 'foe', { power: 5, toughness: 5, typesAdd: ['Creature'] });
  assert.equal(bot().chooseCommand(playerView(state, 'p2')).type, 'pass_priority');
});

test('A13: jedyny obrażony stwór z ochroną przed czernią nie jest celem czarnego źródła', () => {
  const state = botTurn('main1');
  put(state, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield' });
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), protectionFromColors: ['B'] }));
  damageIt(state, 'foe', 1);
  assert.equal(bot().chooseCommand(playerView(state, 'p2')).type, 'pass_priority');
});

test('A13: ochrona przed innym kolorem nie ukrywa legalnego celu', () => {
  const state = botTurn('main1');
  put(state, { id: 'ffc', cardId: 'fathom-fleet-cutthroat', controllerId: 'p2', zone: 'hand' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield' });
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), protectionFromColors: ['R'] }));
  damageIt(state, 'foe', 1);
  assert.equal(bot().chooseCommand(playerView(state, 'p2')).type, 'cast_permanent');
});
