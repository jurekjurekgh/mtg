import { querySupportedCards } from './catalog.js';
import { summarizeDeck } from './deck-summary.js';
import { countCards, validateDeck } from './deck-validation.js';
import { writeDeckText } from './deck-text.js';

/** Karta Basic Land może mieć dowolną liczbę kopii w kreatorze. */
export function isBuilderBasicLand(card) {
  return Boolean(card?.types?.includes('Basic') && card.types.includes('Land'));
}

function assertCardList(cardIds) {
  if (!Array.isArray(cardIds)) throw new TypeError('Kreator wymaga listy kart');
}

function assertRegistry(registry) {
  if (!registry || typeof registry.get !== 'function') throw new TypeError('Kreator wymaga registry');
}

/**
 * Dodaje jedną kartę, zwracając wynik zamiast rzucać błędem — UI może dzięki
 * temu pokazać limit kopii bez przerywania obsługi kliknięcia.
 */
export function addCardToDeck(cardIds, cardId, registry, { maxCopies = 4 } = {}) {
  assertCardList(cardIds);
  assertRegistry(registry);
  if (!Number.isInteger(maxCopies) || maxCopies < 1) throw new RangeError('maxCopies musi być dodatnią liczbą całkowitą');
  const card = registry.get(cardId);
  if (!card || card.support.status !== 'supported') {
    return { ok: false, cardIds: [...cardIds], error: `unsupported:${cardId}` };
  }
  const count = cardIds.filter((id) => id === cardId).length;
  if (!isBuilderBasicLand(card) && count >= maxCopies) {
    return { ok: false, cardIds: [...cardIds], error: `max_copies:${cardId}:${maxCopies}` };
  }
  return { ok: true, cardIds: [...cardIds, cardId], error: null };
}

/** Usuwa jedną kopię karty; kolejność pozostałych kart pozostaje stabilna. */
export function removeCardFromDeck(cardIds, cardId, registry) {
  assertCardList(cardIds);
  assertRegistry(registry);
  const index = cardIds.indexOf(cardId);
  if (index < 0) return { ok: false, cardIds: [...cardIds], error: `missing:${cardId}` };
  return { ok: true, cardIds: cardIds.slice(0, index).concat(cardIds.slice(index + 1)), error: null };
}

/**
 * Waliduje stan kreatora razem z nazwą talii. Rozmiar pozostaje opcjonalny,
 * zgodnie z decyzją właściciela — engine nie przyjmuje jeszcze minimalnego
 * formatu Constructed.
 */
export function validateDeckBuilder({ name, cardIds }, registry, options = {}) {
  assertCardList(cardIds);
  assertRegistry(registry);
  const errors = [];
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) errors.push('deck_name:empty');
  try {
    const result = validateDeck(cardIds, registry, options);
    errors.push(...result.errors);
    return {
      valid: errors.length === 0,
      errors,
      counts: result.counts,
      summary: summarizeDeck(cardIds, registry),
    };
  } catch (error) {
    return {
      valid: false,
      errors: [...errors, `deck_cards:${error.message}`],
      counts: countCards(cardIds),
      summary: summarizeDeck(cardIds, registry),
    };
  }
}

/**
 * Zwraca kompletny, serializowalny snapshot potrzebny renderowi kreatora.
 * `text` jest puste, gdy talia ma błąd — nie da się wtedy pobrać nielegalnego
 * pliku do repozytorium.
 */
export function deckBuilderSnapshot({ name, cardIds }, registry, options = {}) {
  const validation = validateDeckBuilder({ name, cardIds }, registry, options);
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  return {
    name: trimmedName,
    cardIds: [...cardIds],
    counts: new Map(validation.counts),
    summary: validation.summary,
    validation,
    text: validation.valid ? writeDeckText({ name: trimmedName, cardIds }, registry) : '',
  };
}

/** Karty do listy wyników: zawsze tylko `supported`, z filtrami ADR 0012. */
export function deckBuilderCards(registry, filters = {}) {
  assertRegistry(registry);
  return querySupportedCards(registry, filters);
}

/** Bezpieczna nazwa pliku pobieranego przez przeglądarkę. */
export function deckDownloadFilename(name) {
  const base = String(name ?? '')
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[łŁ]/g, 'l')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'moja-talia'}.txt`;
}

/** Tekst błędu walidacji przyjazny dla polskiego UI. */
export function deckBuilderErrorText(error, registry) {
  if (!error) return '';
  const parts = String(error).split(':');
  if (parts[0] === 'deck_name') return 'Podaj nazwę talii.';
  if (parts[0] === 'max_copies') {
    const card = registry?.get(parts[1]);
    return `${card?.name ?? parts[1]}: osiągnięto limit ${parts[2]} kopii.`;
  }
  if (parts[0] === 'unsupported') return `${parts[1]} nie jest kartą supported.`;
  if (parts[0] === 'deck_cards') return parts.slice(1).join(':');
  if (parts[0] === 'deck_size') return parts.slice(1).join(':');
  return String(error);
}
