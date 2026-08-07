import { createGameState, execute, addObject } from './src/engine/game-state.js';
import { jumpToStep } from './src/engine/turn.js';
import { gameObjectDataOf } from './src/cards/materialize.js';
import { createCardRegistry } from './src/cards/card-data.js';
import { addMana } from './src/engine/resources.js';
const REGISTRY = createCardRegistry();
const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
state.turn = jumpToStep(state.turn, 'main', 'p1');
state.turn.activePlayerId = 'p1';
state.turn.priorityPlayerId = 'p1';
function addReal(id, cardId, ctrl, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: ctrl, zone, kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [], morph: data.morph ?? null, bloodthirst: data.bloodthirst ?? null, additionalCost: data.additionalCost ?? null, kicker: data.kicker ?? null, adventure: data.adventure ?? null, entersWithCounters: data.entersWithCounters ?? null, keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [], ...extra });
  return state.objects.get(id);
}
addReal('zoraline', 'zoraline', 'p1', 'hand');
addObject(state, { id: 'grave-bear', instanceId: 'igb', cardId: 'highland-game', controllerId: 'p1', zone: 'graveyard', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [] });
addMana(state, 'p1', 5);
console.log('zoraline triggers:', JSON.stringify(state.objects.get('zoraline').abilities.map(a => a.trigger)));
const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'zoraline' });
console.log('cast ok:', r.ok, r.events[0]?.reason ?? '');
console.log('cast events:', r.events.map(e => e.type).join(','));
console.log('mana po cast:', state.players.find(p => p.id === 'p1').mana);
console.log('pendingOptionalPay:', !!state.pendingOptionalPay, JSON.stringify(state.pendingOptionalPay?.ability?.trigger));
const pay = execute(state, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true });
console.log('pay ok:', pay.ok, pay.events[0]?.reason ?? '');
console.log('pay events:', pay.events.map(e => e.type).join(','));
