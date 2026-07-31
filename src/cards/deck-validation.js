import { assertDeckSupported } from './registry.js';

function isBasicLand(card) {
  return card.types.includes('Basic') && card.types.includes('Land');
}

/**
 * Waliduje listę ID karty bez narzucania formatu rozgrywki.
 * `size` jest opcjonalne, bo rozmiar pierwszych talii nie został jeszcze ustalony.
 */
export function validateDeck(cardIds, registry, { size, maxCopies = 4 } = {}) {
  assertDeckSupported(cardIds, registry);
  if (!Number.isInteger(maxCopies) || maxCopies < 1) throw new RangeError('maxCopies musi być dodatnią liczbą całkowitą');
  if (size !== undefined && cardIds.length !== size) {
    return { valid: false, errors: [`deck_size: oczekiwano ${size}, otrzymano ${cardIds.length}`], counts: countCards(cardIds) };
  }
  const counts = countCards(cardIds);
  const errors = [];
  for (const [id, count] of counts) {
    const card = registry.get(id);
    if (!isBasicLand(card) && count > maxCopies) errors.push(`max_copies:${id}:${count}`);
  }
  return { valid: errors.length === 0, errors, counts };
}

export function countCards(cardIds) {
  const counts = new Map();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
