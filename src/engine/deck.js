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
      // Nazwa karty z definicji (prawo legend CR 704.5j — porównanie po
      // nazwach, nie id kart); deskryptor przechodzi jak types/colors.
      cardName: card.cardName,
      morph: card.morph,
      plot: card.plot,
      plotted: card.plotted,

      entersWithCounters: card.entersWithCounters,
      entersWithCountersIf: card.entersWithCountersIf ?? null,
      keywords: card.keywords,
      subtypes: card.subtypes,
      transformTo: card.transformTo,
      // M257/K5 (L21 — deskryptor ginie w łańcuchu): twarz przednia pary
      // transform — engine resetuje na nią DFC przy opuszczeniu pola bitwy
      // (CR 711.4a). Pominięcie = mechanika martwa w prawdziwych partiach.
      frontFaceId: card.frontFaceId ?? null,
      types: card.types,
      entersTapped: card.entersTapped,
      entersTappedCondition: card.entersTappedCondition,
      bestow: card.bestow,
      aura: card.aura,
      equipment: card.equipment,
      backup: card.backup,
      devour: card.devour,
      endure: card.endure,
      colors: card.colors,
      phyrexianManaCost: card.phyrexianManaCost,
      // M113: warunkowa obniżka kosztu permanentu (Academy Journeymage) —
      // deskryptor musi przejść z karty na obiekt biblioteki (lekcja L21).
      costReduction: card.costReduction,
      enchantPlayer: card.enchantPlayer ?? false,
      // M146 (L21 — deskryptor ginie po cichu, gdy brak go w łańcuchu):
      // pola mechanik, które createCardDeck kładzie na wpisie talii, muszą
      // dotrzeć do obiektu gry. Pominięcie = mechanika martwa w PRAWDZIWYCH
      // partiach przy zielonych testach (helpery testowe robią `...data`,
      // więc nie łapią dziury). Jwari (enterAsCopy) wchodził jako 0/0 i ginął,
      // Mindstab (suspend) nie oferował zawieszenia.
      enterAsCopy: card.enterAsCopy ?? null,
      suspend: card.suspend ?? null,
      saga: card.saga ?? null,
      station: card.station ?? null,
      adventure: card.adventure ?? null,
      kicker: card.kicker ?? null,
      buyback: card.buyback ?? null,
      protectionFromColors: card.protectionFromColors ?? null,
      exploit: card.exploit ?? null,
      bloodthirst: card.bloodthirst ?? null,
      renown: card.renown ?? null,
      treasureAltCost: card.treasureAltCost ?? null,
      additionalCost: card.additionalCost ?? null,
      // M258 (Żywy Tester, L21/M146 — pięć deskryptorów ginących po cichu):
      // echo (Bone Shredder), madness (Revolutionist, Terminal Agony),
      // surge (Jwar Isle Avenger), toxic (Crawling Chorus), warp (Weftblade
      // Enhancer). Helpery testowe robią `...gameObjectDataOf(def)`, więc
      // testy jednostkowe były zielone, a w PRAWDZIWYCH partiach (ta ścieżka)
      // mechaniki były martwe: Chorus bił bez trucizny (obserwowane na żywym
      // stole seed 3004), Bone Shredder nie żądał echo, surge/warp/madness
      // nie oferowały alternatywnych kosztów.
      echo: card.echo ?? null,
      madness: card.madness ?? null,
      surge: card.surge ?? null,
      toxic: card.toxic ?? null,
      warp: card.warp ?? null,
      // Właściciel karty (CR 108.3) — jawny, żeby efekty „gains control of
      // all creatures they own" (Trostani Discordant) działały po zmianach
      // kontroli (reanimacja pod cudzą kontrolą).
      ownerId: card.ownerId,
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
