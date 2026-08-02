import { event } from '../protocol/types.js';
import { createGameObject } from './identity.js';

/**
 * Tokeny: uproszczone stałe obiekty gry, tworzone z reguły (np. efekt czaru).
 * Moduł celowo nie importuje game-state.js (unika cykli w sklejaniu artefaktu);
 * tworzy obiekt bezpośrednio przez createGameObject i jawne strefy.
 */

/** Stała definicja tokenu (do rozszerzeń poza engine). */
export function createToken({ name = 'Token', kind = 'creature', power = 1, toughness = 1, colors = [], types = [], subtypes = [] }) {
  if (!name || !kind) throw new TypeError('Token musi mieć nazwę i rodzaj');
  return Object.freeze({
    kind, cardId: 'token_' + name.toLowerCase().replace(/\s+/g, '_'),
    name, colors, power, toughness, summoningSickness: true,
    tapped: false, damage: 0, zone: 'battlefield', controllerId: null,
    types: Object.freeze([...types]), subtypes: Object.freeze([...subtypes]),
  });
}

/**
 * Tworzy token na bitwisku kontrolera. Wywoływane z efektu czaru/zdolności;
 * token dostaje `summoningSickness` (jak świeżo zagrany permanent).
 * `types`/`subtypes` pozwalają tworzyć tokeny-landy (np. Forest Dryad Jyoti:
 * land creature — walczy jako stwór, a dzięki types ['Land','Creature'] może
 * też być tapnięty na manę).
 */
export function createBattlefieldToken(state, controllerId, { cardId, name, kind = 'creature', power = 1, toughness = 1, colors = [], types = [], subtypes = [] }) {
  if (!state || !state.players.some((p) => p.id === controllerId)) throw new Error('Nieznany kontroler tokenu');
  if (!cardId || !name) throw new TypeError('Token wymaga cardId i nazwy');
  if (!Number.isInteger(power) || !Number.isInteger(toughness) || power < 0 || toughness < 0) {
    throw new RangeError('Statystyki tokenu muszą być nieujemnymi liczbami całkowitymi');
  }
  const instanceId = `token-instance-${state.objectSequence}`;
  const id = `token-${state.objectSequence++}`;
  const base = createGameObject({
    id, instanceId, cardId, controllerId, zone: 'battlefield',
    kind, power, toughness, manaCost: 0, abilities: [],
    types, subtypes,
  });
  const token = Object.freeze({ ...base, name, summoningSickness: true });
  state.objects.set(id, token);
  state.zones.battlefield.push(id);
  state.events.push(event('token_created', { objectId: id, cardId, controllerId, name, power, toughness }));
  return token;
}
