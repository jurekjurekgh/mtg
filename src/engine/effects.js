import { event } from '../protocol/types.js';
import { markDamage, modifyStats } from './permanents.js';
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
  throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
