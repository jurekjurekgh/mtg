// CR 113.7a: „Once activated or triggered, an ability exists on the stack
// independently of its source. Destruction or removal of the source after
// that time won't affect the ability.” https://blogs.magicjudges.org/rules/comprehensive-rules/
// Oracle: „At the beginning of enchanted player's upkeep, that player mills
// two cards.” https://api.scryfall.com/cards/isd/50
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { processTriggers } from '../src/engine/triggers.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();
function setup(cardId = 'curse-of-the-bloody-tome') {
  const s = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'upkeep', 'p2');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  for (const playerId of ['p1', 'p2']) for (let i = 0; i < 3; i++) {
    addObject(s, { id: `lib-${playerId}-${i}`, cardId: `blank-${playerId}-${i}`, instanceId: `i-${playerId}-${i}`, zone: 'library', ownerId: playerId, controllerId: playerId, kind: 'sorcery', types: ['Sorcery'], abilities: [], keywords: [] });
  }
  const def = registry.get(cardId);
  addObject(s, { id: 'curse', instanceId: 'i-curse', cardId: def.id, ownerId: 'p1', controllerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def), types: def.types, abilities: def.abilities });
  s.objects.set('curse', Object.freeze({ ...s.objects.get('curse'), enchantedPlayerId: 'p2' }));
  processTriggers(s, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  assert.equal(s.zones.stack.length, 1, 'trigger upkeppu jest na stosie');
  return s;
}
function resolve(s) {
  for (let i = 0; i < 8 && s.zones.stack.length; i++) {
    const cmd = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(cmd);
    assert.equal(execute(s, cmd).ok, true);
  }
  assert.equal(s.zones.stack.length, 0);
}
const milled = (s, player) => s.events.filter(e => e.type === 'card_milled' && e.playerId === player).length;

test('klątwa mieli gracza z upkeepu mimo zniszczenia źródła w odpowiedzi', () => {
  const s = setup();
  applyEffect(s, { type: 'destroy_permanent' }, { id: 'x', cardId: 'x', controllerId: 'p2' }, ['curse']);
  assert.equal(s.objects.has('curse'), false);
  resolve(s);
  assert.equal(milled(s, 'p2'), 2);
  assert.equal(milled(s, 'p1'), 0);
});

test('przesunięcie aury nie zmienia gracza wskazanego przez zdarzenie upkeepu', () => {
  const s = setup();
  s.objects.set('curse', Object.freeze({ ...s.objects.get('curse'), enchantedPlayerId: 'p1' }));
  resolve(s);
  assert.equal(milled(s, 'p2'), 2);
  assert.equal(milled(s, 'p1'), 0);
});

test('trigger obrażeń tej samej rodziny zachowuje gracza po odejściu aury', () => {
  const s = setup('curse-of-the-pierced-heart');
  applyEffect(s, { type: 'destroy_permanent' }, { id: 'x', cardId: 'x', controllerId: 'p2' }, ['curse']);
  resolve(s);
  assert.equal(s.players.find(p => p.id === 'p2').life, 19);
});
