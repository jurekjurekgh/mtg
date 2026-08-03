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
  if (card.types.includes('Land')) {
    // Landy mogą wchodzić tapped (Rupture Spire, Prismari Campus) i mieć
    // zdolności aktywowane poza implikowanym {T}: add mana ({4},{T}: Scry 1).
    return { kind: 'land', entersTapped: card.entersTapped ?? false, abilities: card.abilities ?? [] };
  }
  if (card.types.includes('Creature')) {
    const data = { kind: 'creature', power: card.power, toughness: card.toughness, manaCost: card.manaCost, abilities: card.abilities ?? [] };
    if (card.morph) data.morph = card.morph;
    if (card.entersWithCounters) data.entersWithCounters = card.entersWithCounters;
    // Bestow (Leafcrown Dryad): obiekt niesie deskryptor alternatywnego
    // kosztu — cast jako czar aury obsługuje resources.castAuraSpell.
    if (card.bestow) data.bestow = card.bestow;
    // Backup (Gloomfang Mauler): ETB trigger z decyzją resolve_backup.
    if (card.backup) data.backup = card.backup;
    return data;
  }
  if (card.types.includes('Enchantment')) {
    // Czysta aura (Serra's Embrace, CR 303.4): zawsze czar aury z celem;
    // obiekt niesie deskryptor buffa zaczarowanego stwora.
    const data = { kind: 'enchantment', manaCost: card.manaCost, abilities: card.abilities ?? [] };
    if (card.aura) data.aura = card.aura;
    return data;
  }
  if (card.types.includes('Artifact')) {
    const data = { kind: 'artifact', manaCost: card.manaCost, abilities: card.abilities ?? [] };
    // Equipment (Cloak of the Bat, CR 702.6): deskryptor equip + buff nosiciela.
    if (card.equipment) data.equipment = card.equipment;
    return data;
  }
  if (card.spell && (card.types.includes('Instant') || card.types.includes('Sorcery'))) {
    return { kind: 'spell', manaCost: card.manaCost, spell: card.spell, plot: card.plot ?? null };
  }
  return { kind: 'card', manaCost: card.manaCost, abilities: card.abilities ?? [] };
}

/** Wpisy talii ze statystykami, gotowe dla setupGame/installDecks. */
export function createCardDeck({ cardIds, ownerId, registry }) {
  assertDeckSupported(cardIds, registry);
  return createDeck({ cardIds, ownerId }).map((entry) => {
    const card = registry.get(entry.cardId);
    const data = gameObjectDataOf(card);
    // Wspólne pola opisowe obecne na każdej karcie (także bez statystyk).
    data.keywords = card.keywords ?? [];
    data.subtypes = card.subtypes ?? [];
    // Pełna linia typów (np. ['Enchantment','Creature']) — predykaty mechanik
    // (np. „artefakt lub enchantment" triggera Kap-py) nie opierają się na kind.
    data.types = card.types ?? [];
    // Karty dwustronne (transform): dane drugiej strony do obiektu gry,
    // żeby engine mógł obrócić kartę bez znajomości registry (ADR 0002).
    if (card.transformTo) {
      const back = registry.get(card.transformTo);
      if (!back) throw new Error(`Brak drugiej strony transform: ${card.transformTo}`);
      data.transformTo = {
        cardId: back.id,
        power: back.power,
        toughness: back.toughness,
        abilities: back.abilities ?? [],
        keywords: back.keywords ?? [],
        subtypes: back.subtypes ?? [],
      };
    }
    return { ...entry, ...data };
  });
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
