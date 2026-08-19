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
  // Kolory są jawną, publiczną częścią karty (potrzebne triggerom typu
  // „a player casts a white spell" — Angel's Feather); trafiają na każdy obiekt.
  const colors = () => card.colors ?? [];
  if (card.types.includes('Land')) {
    // Landy mogą wchodzić tapped (Rupture Spire, Prismari Campus) i mieć
    // zdolności aktywowane poza implikowanym {T}: add mana ({4},{T}: Scry 1).
    const landData = { kind: 'land', entersTapped: card.entersTapped ?? false, abilities: card.abilities ?? [], colors: colors(), cardName: card.name };
    if (card.entersTappedCondition) landData.entersTappedCondition = card.entersTappedCondition;
    return landData;
  }
  if (card.types.includes('Creature')) {
    const data = { kind: 'creature', power: card.power, toughness: card.toughness, manaCost: card.manaCost, abilities: card.abilities ?? [], colors: colors(), cardName: card.name };
    if (card.morph) data.morph = card.morph;
    if (card.entersWithCounters) data.entersWithCounters = card.entersWithCounters;
    if (card.entersWithCountersIf) data.entersWithCountersIf = card.entersWithCountersIf;
    if (card.enterAsCopy) data.enterAsCopy = card.enterAsCopy;
    // Bestow (Leafcrown Dryad): obiekt niesie deskryptor alternatywnego
    // kosztu — cast jako czar aury obsługuje resources.castAuraSpell.
    if (card.bestow) data.bestow = card.bestow;
    // Plot (Batch 24: Spinewoods Paladin) — plot działa też dla permanentów:
    // karta z ręki do exile (plot_card), potem cast_permanent bez many.
    if (card.plot) data.plot = card.plot;
    // Suspend (CR 702.62, Mindstab): { cost, colors, timeCounters } — specjalna
    // akcja z ręki (jak plot), karta w exile z licznikami czasu.
    if (card.suspend) data.suspend = card.suspend;
    // Backup (Gloomfang Mauler): ETB trigger z decyzją resolve_backup.
    if (card.backup) data.backup = card.backup;
    // Devour (Gorger Wurm): ETB z sekwencyjną decyzją resolve_devour_choice.
    if (card.devour) data.devour = card.devour;
    // Endure (Kin-Tree Nurturer): ETB z decyzją resolve_endure_choice.
    if (card.endure != null) data.endure = card.endure;
    // Exploit (CR 702.110, Silumgar Butcher): ETB z opcjonalnym poświęceniem
    // (resolve_exploit_choice); po poświęceniu trigger „exploits".
    if (card.exploit) data.exploit = card.exploit;
    // Alternatywny koszt ze Skarbów (Security Rhox): cast_permanent wariant
    // treasureAlt — koszt {R}{G} płatny wyłącznie maną ze Skarbów.
    if (card.treasureAltCost) data.treasureAltCost = card.treasureAltCost;
    // Phyrexian mana (CR 118.9): {W/P} = 1 mana albo 2 życia (porcelain-legionnaire).
    if (card.phyrexianManaCost) data.phyrexianManaCost = card.phyrexianManaCost;
    // Bloodthirst (Gorehorn Minotaurs): jeśli przeciwnik był obrażony w tej turze,
    // stwór wchodzi z licznikami +1/+1.
    if (card.bloodthirst) data.bloodthirst = card.bloodthirst;
    if (card.additionalCost) data.additionalCost = card.additionalCost;
    // Kicker (CR 702.33, Kor Sanctifiers): opcjonalny dodatkowy koszt rzutu
    // — wariant `kicked` komendy cast_permanent (resources.castPermanent).
    if (card.kicker) data.kicker = card.kicker;
    // M113: warunkowa obniżka kosztu permanentu (Academy Journeymage).
    if (card.costReduction) data.costReduction = card.costReduction;
    // Adventure (CR 715, Gray Slaad): alternatywny rzut czaru z ręki, po
    // rozstrzygnięciu karta idzie do exile, skąd można rzucić stronę-stwora.
    if (card.adventure) data.adventure = card.adventure;
    // Saga (CR 714, Shiva Warden of Ice): rozdziały odpalane licznikami lore.
    if (card.saga) data.saga = card.saga;
    return data;
  }
  if (card.types.includes('Planeswalker')) {
    // Planeswalker (CR 306, Liliana's Triumph w Batch 37): obiekt ze
    // zdolnościami, bez statystyk stwora. Na razie tylko typ — karty
    // planeswalkerów pojawią się w przyszłości (decyzja właściciela).
    const data = { kind: 'planeswalker', manaCost: card.manaCost, abilities: card.abilities ?? [], colors: colors(), cardName: card.name };
    return data;
  }
  if (card.types.includes('Enchantment')) {
    // Czysta aura (Serra's Embrace, CR 303.4): zawsze czar aury z celem;
    // obiekt niesie deskryptor buffa zaczarowanego stwora. Zwykły enchantment
    // (Canonized in Blood) to permanent zagrywany jak stwór/artefakt.
    const data = { kind: 'enchantment', manaCost: card.manaCost, abilities: card.abilities ?? [], colors: colors(), cardName: card.name };
    if (card.aura) data.aura = card.aura;
    // Aura „Enchant player" (Curse of the Pierced Heart): zaczarowuje GRACZA,
    // nie stwora — obiekt niesie flagę, a docelowego gracza wybiera się przy
    // rzucaniu (cast_permanent z targetem gracza, jak czar aury).
    if (card.aura?.enchant === 'player') data.enchantPlayer = true;
    return data;
  }
  if (card.types.includes('Artifact')) {
    const data = { kind: 'artifact', manaCost: card.manaCost, abilities: card.abilities ?? [], colors: colors(), cardName: card.name };
    // Equipment (Cloak of the Bat, CR 702.6): deskryptor equip + buff nosiciela.
    if (card.equipment) data.equipment = card.equipment;
    // Artefakt wchodzący z licznikami (Trigon of Corruption — charge counters).
    if (card.entersWithCounters) data.entersWithCounters = card.entersWithCounters;
    if (card.entersWithCountersIf) data.entersWithCountersIf = card.entersWithCountersIf;
    if (card.enterAsCopy) data.enterAsCopy = card.enterAsCopy;
    // Station (EOE Spacecraft, Wedgelight Rammer): artefakt bez typu Creature,
    // który staje się artefaktowym stworem przy >= threshold liczników charge.
    // Wydrukowane P/T ma dopiero jako stwór — nosimy je na obiekcie, a o tym,
    // czy obiekt jest stworem, decyduje liczba liczników (counters.stationSync).
    if (card.station) {
      data.station = card.station;
      data.power = card.power;
      data.toughness = card.toughness;
    }
    return data;
  }
  if (card.spell && (card.types.includes('Instant') || card.types.includes('Sorcery'))) {
    // Spelle mogą nosić zdolności aktywowane z ręki (cycling — Fiery Fall,
    // CR 702.28): materializujemy je także na obiekcie czaru.
    const data = { kind: 'spell', manaCost: card.manaCost, spell: card.spell, plot: card.plot ?? null, suspend: card.suspend ?? null, colors: colors(), abilities: card.abilities ?? [], cardName: card.name };
    return data;
  }
  return { kind: 'card', manaCost: card.manaCost, abilities: card.abilities ?? [], colors: colors(), cardName: card.name };
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
        // RODZAJ drugiej strony (CR 711.2): bez niego transformacja nie umiała
        // odróżnić „artefakt → artefaktowy stwór" od zwykłej podmiany statystyk
        // i musiała zgadywać z types. Liczony tym samym kodem, co strona
        // przednia, więc pozostaje spójny z `kind` obiektu wejściowego.
        kind: gameObjectDataOf(back).kind,
        power: back.power,
        toughness: back.toughness,
        abilities: back.abilities ?? [],
        keywords: back.keywords ?? [],
        subtypes: back.subtypes ?? [],
        // Linia typów i mana value drugiej strony (DFC ze zmianą typu, np.
        // Jill → Shiva Saga): obiekt po transformacji też niesie typy.
        types: back.types ?? [],
        manaCost: back.manaCost ?? 0,
        // Nazwa drugiej strony (DFC Legendary jak Shiva): obiekt po
        // transformacji zmienia cardName — prawo legend patrzy na WŁAŚCIWĄ stronę.
        cardName: back.name,
        // Deskryptor Sagi drugiej strony (Shiva): flicker-transform musi
        // przenieść rozdziały na nowy obiekt.
        ...(back.saga ? { saga: back.saga } : {}),
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
