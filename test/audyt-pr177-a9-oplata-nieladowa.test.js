// Audyt PR #177 A9: opłata wejścia lądu może korzystać z innych źródeł niż lądy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, createCardDeck } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const P1 = 'p1';

function land(s, id, cardId, tapped = false) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: P1, registry: REG });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: P1, zone: 'battlefield' });
  if (tapped) s.objects.set(id, Object.freeze({ ...s.objects.get(id), tapped: true }));
}

/** Stół: Rupture Spire w ręce + (opcjonalnie) pula i nietapnięte lądy. */
function setup({ mana = 0, untappedLands = 0, tappedLands = 0, hand = 'rupture-spire' } = {}) {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', P1);
  s.turn.activePlayerId = P1;
  s.turn.priorityPlayerId = P1;
  if (mana > 0) addMana(s, P1, mana);
  for (let i = 0; i < untappedLands; i += 1) land(s, `u${i}`, 'basic-forest');
  for (let i = 0; i < tappedLands; i += 1) land(s, `t${i}`, 'basic-forest', true);
  const def = REG.get(hand);
  addObject(s, {
    id: 'c1', instanceId: 'i-c1', cardId: hand, controllerId: P1, ownerId: P1, zone: 'hand',
    ...gameObjectDataOf(def),
  });
  return s;
}

function choose(state) {
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(playerView(state, P1));
  const options = bot.trace().at(-1)?.options ?? [];
  const play = options.find((option) => option.cmd.startsWith('play_land'));
  return { chosen, playScore: play?.score };
}



test('A9: Rupture Spire może zapłacić {1} z Druid of the Cowl', () => {
  const s=setup(); const def=REG.get('druid-of-the-cowl');
  addObject(s, { id:'druid', instanceId:'i-druid', cardId:def.id, controllerId:P1, ownerId:P1, zone:'battlefield', ...gameObjectDataOf(def), types:def.types, subtypes:def.subtypes, keywords:def.keywords });
  s.objects.set('druid',Object.freeze({...s.objects.get('druid'),summoningSickness:false}));
  const view=playerView(s,P1);
  assert.ok(view.legalCommands.some(c=>c.type==='activate_ability'&&c.objectId==='druid'), 'druid potrafi tapnąć na manę');
  const d=choose(s); assert.equal(d.chosen.type,'play_land',JSON.stringify(d));
  assert.equal(execute(s,d.chosen).ok,true);
  for(let i=0;i<8&&!s.pendingPayOrSacrifice;i++) execute(s,{type:'pass_priority',playerId:s.turn.priorityPlayerId});
  assert.ok(s.pendingPayOrSacrifice);
  const payment = choose(s).chosen; assert.equal(payment.type, 'resolve_pay_or_sacrifice'); assert.equal(payment.pay, true);
  assert.equal(execute(s, payment).ok, true, 'bot rzeczywiście płaci');
});

test('A9: Druid z chorobą przywołania nie płaci za Rupture Spire', () => {
  const s = setup(); const def = REG.get('druid-of-the-cowl');
  addObject(s, { id: 'druid', instanceId: 'i-druid', cardId: def.id, controllerId: P1, ownerId: P1, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  s.objects.set('druid', Object.freeze({ ...s.objects.get('druid'), summoningSickness: true }));
  assert.equal(playerView(s, P1).legalCommands.some(c => c.type === 'activate_ability' && c.objectId === 'druid'), false);
  assert.notEqual(choose(s).chosen.type, 'play_land');
});

test('A9: Powerstone opłaca koszt zdolności wejścia Rupture Spire, choć nie opłaca czaru nieartefaktowego', () => {
  const s = setup(); const def = REG.get('token_powerstone');
  addObject(s, { id: 'stone', instanceId: 'i-stone', cardId: def.id, controllerId: P1, ownerId: P1, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  assert.ok(playerView(s, P1).legalCommands.some(c => c.type === 'activate_ability' && c.objectId === 'stone'));
  const { chosen } = choose(s); assert.equal(chosen.type, 'play_land', JSON.stringify(chosen));
  assert.equal(execute(s, chosen).ok, true);
  for (let i = 0; i < 8 && !s.pendingPayOrSacrifice; i++) execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  const payment = choose(s).chosen; assert.equal(payment.type, 'resolve_pay_or_sacrifice'); assert.equal(payment.pay, true);
  assert.equal(execute(s, payment).ok, true, 'bot rzeczywiście płaci');
});

test('A9: ograniczona mana w puli płaci za zdolność wejścia', () => {
  const s = setup(); addMana(s, P1, 1, { colors: [], spendOnly: 'artifact' });
  const { chosen } = choose(s); assert.equal(chosen.type, 'play_land');
  assert.equal(execute(s, chosen).ok, true);
  for (let i = 0; i < 8 && !s.pendingPayOrSacrifice; i++) execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  const payment = choose(s).chosen; assert.equal(payment.type, 'resolve_pay_or_sacrifice'); assert.equal(payment.pay, true);
  assert.equal(execute(s, payment).ok, true);
});
