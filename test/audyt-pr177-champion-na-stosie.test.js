// CR 702.72a: „When this permanent enters, sacrifice it unless you exile
// another [object] you control”. CR 113.7a: „Once activated or triggered,
// an ability exists on the stack independently of its source. Destruction or
// removal of the source after that time won't affect the ability.”
// https://blogs.magicjudges.org/rules/comprehensive-rules/
// Ruling mechaniki: https://mtg.fandom.com/wiki/Champion — po wcześniejszym
// rozstrzygnięciu LTB gracz nadal może wygnać stwora, ale już nie wróci.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { queueTriggerToStack, processTriggers } from '../src/engine/triggers.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();
const offers = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
function setup() {
  const s = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  const def = registry.get('changeling-berserker');
  addObject(s, { id: 'champ', instanceId: 'i-champ', cardId: def.id, ownerId: 'p1', controllerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def), types: def.types, abilities: def.abilities });
  addObject(s, { id: 'ally', instanceId: 'i-ally', cardId: 'ally', ownerId: 'p1', controllerId: 'p1', zone: 'battlefield', kind: 'creature', types: ['Creature'], power: 2, toughness: 2, abilities: [], keywords: [] });
  addObject(s, { id: 'enemy', instanceId: 'i-enemy', cardId: 'enemy', ownerId: 'p2', controllerId: 'p2', zone: 'battlefield', kind: 'creature', types: ['Creature'], power: 2, toughness: 2, abilities: [], keywords: [] });
  queueTriggerToStack(s, def.abilities[0], s.objects.get('champ'), [], []);
  return s;
}
function passUntil(s, predicate) {
  for (let i = 0; i < 12 && !predicate(); i++) {
    const pass = offers(s).find(c => c.type === 'pass_priority');
    assert.ok(pass, 'priorytet i pass dostępne');
    assert.equal(execute(s, pass).ok, true);
  }
  assert.ok(predicate(), 'osiągnięto wymagany stan stosu');
}
function sourceDiesBeforeTrigger(s) {
  const before = s.events.length;
  applyEffect(s, { type: 'destroy_permanent' }, { id: 'removal', cardId: 'removal', controllerId: 'p2' }, ['champ']);
  processTriggers(s, s.events.slice(before));
  assert.equal(s.objects.has('champ'), false);
  assert.equal(s.zones.stack.length, 2, 'LTB na ETB');
  passUntil(s, () => s.zones.stack.length === 1);
  passUntil(s, () => s.zones.stack.length === 0);
}

test('champion po odejściu: można wygnać innego stwora na stałe', () => {
  const s = setup();
  sourceDiesBeforeTrigger(s);
  const choices = offers(s, 'p1').filter(c => c.type === 'resolve_sacrifice_choice');
  assert.ok(choices.some(c => c.skip), 'można odmówić wygnania');
  const exile = choices.find(c => c.targetId === 'ally');
  assert.ok(exile, 'można wygnać własnego stwora');
  assert.ok(!choices.some(c => c.targetId === 'enemy'));
  assert.equal(execute(s, exile).ok, true);
  const ally = [...s.objects.values()].find(o => o.cardId === 'ally');
  assert.equal(ally.zone, 'exile');
  assert.ok(!ally.temporaryExile?.returnsWhenSourceLeaves, 'LTB już nie zwróci karty');
});

test('champion po odejściu: można nic nie wygnać', () => {
  const s = setup();
  sourceDiesBeforeTrigger(s);
  const skip = offers(s, 'p1').find(c => c.type === 'resolve_sacrifice_choice' && c.skip);
  assert.ok(skip);
  assert.equal(execute(s, skip).ok, true);
  assert.equal(s.objects.get('ally').zone, 'battlefield');
});

test('champion po zmianie kontroli: decyzja nadal należy do kontrolera zdolności', () => {
  const s = setup();
  s.objects.set('champ', Object.freeze({ ...s.objects.get('champ'), controllerId: 'p2' }));
  passUntil(s, () => s.zones.stack.length === 0);
  assert.equal(s.pendingSacrifice?.playerId, 'p1');
  const choices = offers(s, 'p1').filter(c => c.type === 'resolve_sacrifice_choice');
  assert.ok(choices.some(c => c.skip), 'nie można poświęcić permanenta przeciwnika');
  assert.ok(choices.some(c => c.targetId === 'ally'));
  assert.ok(!choices.some(c => c.targetId === 'champ' || c.targetId === 'enemy'));
  assert.equal(execute(s, choices.find(c => c.skip)).ok, true);
  assert.equal(s.objects.get('champ').controllerId, 'p2');
});

test('champion po zmianie kontroli bez innych stworów nie poświęca przeciwnikowi źródła', () => {
  const s = setup();
  s.objects.delete('ally');
  s.zones.battlefield = s.zones.battlefield.filter(id => id !== 'ally');
  s.objects.set('champ', Object.freeze({ ...s.objects.get('champ'), controllerId: 'p2' }));
  passUntil(s, () => s.zones.stack.length === 0);
  assert.equal(s.pendingSacrifice, null);
  assert.equal(s.objects.get('champ').controllerId, 'p2');
});

test('champion: etykiety wyboru i decyzja bota rozróżniają wygnanie od poświęcenia', async () => {
  const { commandLabel, choiceGroupTitle } = await import('../src/table/render.js');
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const s = setup();
  sourceDiesBeforeTrigger(s);
  const view = playerView(s, 'p1');
  const choices = view.legalCommands.filter(c => c.type === 'resolve_sacrifice_choice');
  const session = { nameOf: id => id, nameOfObject: id => id, cardDetails: () => null, abilitiesOf: () => [] };
  assert.match(choiceGroupTitle({ type: 'sacrifice', options: choices }, session, view), /wygnanie/i);
  assert.match(commandLabel(choices.find(c => c.skip), session, view), /nie wyganiaj/i);
  assert.match(commandLabel(choices.find(c => c.targetId === 'ally'), session, view), /wygnaj/i);
  const bot = createHeuristicBot({ seed: 4, randomness: 0, lookahead: 0, registry });
  assert.equal(bot.chooseCommand(view).skip, true, 'bot nie wygania sojusznika bez korzyści');
});
