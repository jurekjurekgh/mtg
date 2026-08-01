import { createGameState } from '../engine/game-state.js';
import { createDeck } from '../engine/deck.js';
import { setupGame } from '../engine/setup.js';
import { assertDeckSupported } from './registry.js';

/**
 * Most między warstwą danych kart a silnikiem. Engine celowo nie zna registry
 * ani definicji — dostaje gotowe wpisy talii ze statystykami permanenta.
 */

/** Dane obiektu gry wynikające z definicji karty (karta → obiekt gry). */
export function gameObjectDataOf(card) {
  if (!card) throw new Error('Nieznana definicja karty');
  if (card.types.includes('Land')) return { kind: 'land' };
  if (card.types.includes('Creature')) return { kind: 'creature', power: card.power, toughness: card.toughness, manaCost: card.manaCost };
  if (card.spell && (card.types.includes('Instant') || card.types.includes('Sorcery'))) {
    return { kind: 'spell', manaCost: card.manaCost, spell: card.spell };
  }
  return { kind: 'card', manaCost: card.manaCost };
}

/** Wpisy talii ze statystykami, gotowe dla setupGame/installDecks. */
export function createCardDeck({ cardIds, ownerId, registry }) {
  assertDeckSupported(cardIds, registry);
  return createDeck({ cardIds, ownerId }).map((entry) => ({
    ...entry,
    ...gameObjectDataOf(registry.get(entry.cardId)),
  }));
}

/**
 * Składa gotową partię headless z tali zdefiniowanych kartami z registry:
 * tworzy stan, instaluje przetasowane biblioteki i rozdaje ręce otwarcia.
 */
export function setupCardMatch({ seed, players, decks, registry, openingHandSize = 7 }) {
  if (!registry) throw new TypeError('setupCardMatch wymaga registry');
  const state = createGameState({ seed, players });
  const prepared = new Map();
  for (const [playerId, cardIds] of decks) {
    prepared.set(playerId, createCardDeck({ cardIds, ownerId: playerId, registry }));
  }
  setupGame({ state, decks: prepared, seed, openingHandSize });
  return state;
}
