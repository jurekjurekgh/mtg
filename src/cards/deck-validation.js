import { assertDeckSupported } from './registry.js';

function isBasicLand(card) {
  return card.types.includes('Basic') && card.types.includes('Land');
}

/**
 * Waliduje listę ID kart według nowego paradygmatu talii (decyzja właściciela
 * 2026-08-04): **singleton** — maksymalnie 1 kopia każdej karty z wyjątkiem
 * lądów podstawowych (tych dowolna liczba) — oraz **minimum 15 kart
 * nielandowych**. Lądy podstawowe są „dopasowywane" do rozmiaru talii (ich
 * liczba nie jest limitowana ani narzucana).
 *
 * `size` pozostaje opcjonalne (dokładna liczba wszystkich kart); `maxCopies`
 * domyślnie 1 (singleton); `minNonland` domyślnie 15 (0 wyłącza).
 */
export function validateDeck(cardIds, registry, { size, maxCopies = 1, minNonland = 15 } = {}) {
  assertDeckSupported(cardIds, registry);
  if (!Number.isInteger(maxCopies) || maxCopies < 1) throw new RangeError('maxCopies musi być dodatnią liczbą całkowitą');
  const counts = countCards(cardIds);
  const errors = [];
  // Singleton: max 1 kopia karty nielandowej (lądy podstawowe bez limitu).
  for (const [id, count] of counts) {
    const card = registry.get(id);
    if (!card) continue;
    if (!isBasicLand(card) && count > maxCopies) errors.push(`max_copies:${id}:${count}`);
  }
  // Minimum 15 kart nielandowych.
  if (Number.isInteger(minNonland) && minNonland > 0) {
    let nonland = 0;
    for (const [id, count] of counts) {
      const card = registry.get(id);
      if (card && !isBasicLand(card)) nonland += count;
    }
    if (nonland < minNonland) errors.push(`deck_min_nonland:${nonland}/${minNonland}`);
  }
  // Opcjonalny dokładny rozmiar (wszystkie karty).
  if (size !== undefined && cardIds.length !== size) {
    errors.push(`deck_size: oczekiwano ${size}, otrzymano ${cardIds.length}`);
  }
  return { valid: errors.length === 0, errors, counts };
}

export function countCards(cardIds) {
  const counts = new Map();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
