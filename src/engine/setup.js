import { createDeck, installDecks } from './deck.js';
import { moveObjectDirectly } from './objects.js';

/**
 * Przygotowuje partię z list kart. Rozdaje po siedem kart każdemu graczowi.
 * Mulligan pozostaje osobną komendą, żeby nie mieszać inicjalizacji ze stanem gry.
 *
 * `decks` mapuje gracza albo na listę identyfikatorów kart (wtedy instancje
 * powstają tu), albo na gotowe wpisy z createDeck/createCardDeck — warstwa
 * kart może w ten sposób dostarczyć statystyki z definicji.
 */
export function setupGame({ state, decks, seed, openingHandSize = 7 }) {
  if (!state || !(decks instanceof Map) || !Number.isInteger(seed)) {
    throw new TypeError('setupGame wymaga state, Map talii i seeda');
  }
  if (!Number.isInteger(openingHandSize) || openingHandSize < 0) {
    throw new RangeError('openingHandSize musi być nieujemną liczbą całkowitą');
  }
  const prepared = new Map();
  for (const [playerId, entries] of decks) {
    const isCardIdList = entries.length > 0 && typeof entries[0] === 'string';
    prepared.set(playerId, isCardIdList ? createDeck({ cardIds: entries, ownerId: playerId }) : entries);
  }
  installDecks(state, prepared, seed);
  for (const player of state.players) {
    for (let i = 0; i < openingHandSize; i += 1) {
      const objectId = state.zones.library.find((id) => state.objects.get(id).controllerId === player.id);
      if (!objectId) break;
      try {
        moveObjectDirectly(state, objectId, 'hand', `${player.id}-opening-${i}`);
      } catch (error) {
        throw new Error(`Nie można rozdać ręki otwarcia: ${error.message}`);
      }
    }
  }
  // Mulligan londyński (CR 103.4): po rozdaniu każdy gracz decyduje o swojej
  // ręce — sekwencyjnie, zaczyna STARTER (state.starterId — M257-r5b/B:
  // „zaczyna gracz pierwszy” było zaszyte w players[0]). Komenda
  // resolve_mulligan_choice{keep: true|false}; mulligan = tasowanie ręki do
  // biblioteki + dobranie 7 + odłożenie N kart na spód (N = numer mulligana).
  if (openingHandSize > 0) {
    state.pendingMulligans = [state.starterId,
      ...state.players.map((p) => p.id).filter((id) => id !== state.starterId)];
    state.mulliganCounts = {};
    state.turn.priorityPlayerId = state.starterId;
    state.turn.passes = 0;
  }
  return state;
}
