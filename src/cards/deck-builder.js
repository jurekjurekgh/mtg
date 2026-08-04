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

/** Zeruje talię (wyczyść) — pusta lista kart, nazwa zostaje. */
export function clearDeck(cardIds) {
  assertCardList(cardIds);
  return [];
}

/**
 * Dodaje po jednej kopii każdej karty z przekazanej listy (wynik filtrów),
 * z poszanowaniem limitu kopii. Zwraca nową listę i liczbę dodanych kart
 * (pomija karty, które osiągnęły limit). Podstawowe landy bez limitu.
 */
export function addFilteredToDeck(cardIds, cards, registry, { maxCopies = 4 } = {}) {
  assertCardList(cardIds);
  assertRegistry(registry);
  if (!Array.isArray(cards)) throw new TypeError('addFilteredToDeck wymaga listy kart');
  let next = [...cardIds];
  let added = 0;
  for (const card of cards) {
    const result = addCardToDeck(next, card.id, registry, { maxCopies });
    if (result.ok) { next = result.cardIds; added += 1; }
  }
  return { ok: true, cardIds: next, added, error: null };
}

/**
 * Kolejność kart w liście kreatora: podstawowe landy na samej górze (żeby je
 * łatwo dodawać), potem reszta alfabetycznie po nazwie.
 */
export function sortBuilderCards(cards) {
  if (!Array.isArray(cards)) return [];
  return [...cards].sort((a, b) => {
    const aLand = isBuilderBasicLand(a) ? 0 : 1;
    const bLand = isBuilderBasicLand(b) ? 0 : 1;
    if (aLand !== bLand) return aLand - bLand;
    return String(a.name).localeCompare(String(b.name), 'pl');
  });
}

/**
 * Pełne statystyki talii dla kreatora: rozkład typów, kolory i krzywa many
 * (mana value) kart nielandowych. Podstawa do oceny „stanu" edytowanej talii.
 */
export function deckStatistics(cardIds, registry) {
  assertCardList(cardIds);
  assertRegistry(registry);
  const colors = new Map();
  const curve = new Map();
  const typeCounts = { lands: 0, creatures: 0, instants: 0, sorceries: 0, artifacts: 0, enchantments: 0, other: 0 };
  let nonlandTotal = 0;
  let nonlandManaSum = 0;
  for (const id of cardIds) {
    const card = registry.get(id);
    if (!card) continue;
    const types = card.types ?? [];
    if (types.includes('Land')) { typeCounts.lands += 1; continue; }
    nonlandTotal += 1;
    nonlandManaSum += card.manaCost ?? 0;
    const cmc = card.manaCost ?? 0;
    const bucket = cmc >= 7 ? '7+' : String(cmc);
    curve.set(bucket, (curve.get(bucket) ?? 0) + 1);
    if (types.includes('Creature')) typeCounts.creatures += 1;
    else if (types.includes('Instant')) typeCounts.instants += 1;
    else if (types.includes('Sorcery')) typeCounts.sorceries += 1;
    else if (types.includes('Artifact')) typeCounts.artifacts += 1;
    else if (types.includes('Enchantment')) typeCounts.enchantments += 1;
    else typeCounts.other += 1;
    for (const color of card.colors ?? []) colors.set(color, (colors.get(color) ?? 0) + 1);
  }
  return {
    total: cardIds.length,
    lands: typeCounts.lands,
    nonlands: nonlandTotal,
    avgCmc: nonlandTotal > 0 ? Math.round((nonlandManaSum / nonlandTotal) * 10) / 10 : 0,
    typeCounts,
    colors,
    curve,
  };
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
