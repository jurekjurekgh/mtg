import { event } from '../protocol/types.js';
import { markDamage, modifyStats, turnFaceUp } from './permanents.js';
import { addCounter, removeCounter } from './counters.js';
import { changeLife } from './players.js';
import { moveObjectDirectly } from './objects.js';
import { createBattlefieldToken } from './tokens.js';

/**
 * Wspólny interpreter efektów dla czarów i zdolności aktywowanych.
 * Deskryptor efektu (typ + parametry) buduje warstwa kart; core zna wyłącznie
 * ogólne typy: damage, pump, create_token. Efekty zapisują swoje zdarzenia
 * wprost do `state.events` (jak dotąd robiły to w spells.js), więc są widoczne
 * w logu i strumieniu rozstrzygania.
 *
 * @param {object} state
 * @param {{type: string, [k: string]: unknown}} effect
 * @param {object} sourceObject obiekt źródła (kontroler tokenów/obrażeń)
 * @param {string[]} targets id celów (dla damage/pump pierwszy cel)
 */
export function applyEffect(state, effect, sourceObject, targets = []) {
  if (effect.type === 'damage') {
    const targetId = targets[0];
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
    const damage = event('damage_dealt', { source: sourceObject.id, target: targetId, amount: effect.amount });
    state.events.push(damage);
    markDamage(state, targetId, effect.amount);
    return;
  }
  if (effect.type === 'pump') {
    const targetId = targets[0];
    modifyStats(state, targetId, { power: effect.power ?? 0, toughness: effect.toughness ?? 0 });
    return;
  }
  if (effect.type === 'create_token') {
    createBattlefieldToken(state, sourceObject.controllerId, {
      cardId: effect.cardId,
      name: effect.name,
      kind: effect.kind ?? 'creature',
      power: effect.power ?? 1,
      toughness: effect.toughness ?? 1,
      colors: effect.colors ?? [],
    });
    return;
  }
  if (effect.type === 'gain_life') {
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Zysk życia musi być nieujemny');
    changeLife(state, sourceObject.controllerId, effect.amount);
    return;
  }
  if (effect.type === 'add_counter') {
    addCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'remove_counter') {
    removeCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'exile_permanent') {
    const targetId = targets[0];
    if (!targetId) throw new Error('exile_permanent wymaga celu');
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel wygnania');
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId);
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile' }));
    return;
  }
  if (effect.type === 'turn_face_up') {
    turnFaceUp(state, sourceObject.id, effect.counters ?? {});
    return;
  }
  throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
