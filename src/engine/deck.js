import { shuffle } from './shuffle.js';
import { addObject } from './game-state.js';

/**
 * Tworzy deterministyczną bibliotekę z listy identyfikatorów kart.
 * Dane karty pozostają poza engine; engine przechowuje tylko instancje.
 */
export function createDeck({ cardIds, ownerId, prefix = ownerId }) {
  if (!Array.isArray(cardIds) || !ownerId) throw new TypeError('Talia wymaga cardIds i ownerId');
  return cardIds.map((cardId, index) => ({
    instanceId: `${prefix}-instance-${index}`,
    objectId: `${prefix}-library-${index}`,
    cardId,
    ownerId,
  }));
}

export function installDeck(state, deck, { seed }) {
  if (!Array.isArray(deck) || !Number.isInteger(seed)) throw new TypeError('Instalacja talii wymaga talii i seeda');
  const shuffled = shuffle(deck, seed);
  for (const card of shuffled) {
    if (card.ownerId === undefined) throw new TypeError('Egzemplarz talii wymaga ownerId');
    // Opcjonalne statystyki (kind/power/toughness/manaCost/spell) dostarcza
    // warstwa kart; engine pozostaje ślepy na registry i definicje.
    // Lista pól MUSI pokrywać wszystkie deskryptory przenoszone na obiekt
    // (types, entersTapped, bestow…) — pominięty deskryptor po cichu
    // znikałby w prawdziwych partiach (regresja znaleziona przy bestow).
    addObject(state, {
      id: card.objectId,
      instanceId: card.instanceId,
      cardId: card.cardId,
      controllerId: card.ownerId,
      zone: 'library',
      kind: card.kind,
      power: card.power,
      toughness: card.toughness,
      manaCost: card.manaCost,
      spell: card.spell,
      abilities: card.abilities,
      morph: card.morph,
      entersWithCounters: card.entersWithCounters,
      keywords: card.keywords,
      subtypes: card.subtypes,
      transformTo: card.transformTo,
      types: card.types,
      entersTapped: card.entersTapped,
      bestow: card.bestow,
    });
  }
  return shuffled.map((card) => card.objectId);
}

export function installDecks(state, decks, seed) {
  if (!(decks instanceof Map)) throw new TypeError('Talia gracza musi być Map');
  const installed = new Map();
  for (const [playerId, deck] of decks) {
    installed.set(playerId, installDeck(state, deck, { seed: seed + installed.size }));
  }
  return installed;
}
