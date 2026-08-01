/**
 * Tożsamości obiektów gry. Definicje kart i ich egzemplarze są rozdzielone
 * od obiektów, które istnieją chwilowo w strefach (CR 400.7).
 */

/**
 * Rekord tożsamości definicji karty. Kanoniczną fabryką definicji pozostaje
 * `defineCard` z warstwy kart (cards/registry.js); nazwa jest tu rozróżniona,
 * bo po sklejeniu artefaktu wszystkie moduły dzielą jeden zasięg (build.mjs).
 */
export function defineCardIdentity({ id, name }) {
  if (!id || !name) throw new TypeError('Definicja karty wymaga id i name');
  return Object.freeze({ id, name });
}

export function createCardInstance({ id, cardId, ownerId }) {
  if (!id || !cardId || !ownerId) throw new TypeError('Egzemplarz wymaga id, cardId i ownerId');
  return Object.freeze({ id, cardId, ownerId });
}

export function createGameObject({ id, instanceId, cardId, controllerId, zone, kind = 'card', power = null, toughness = null, manaCost = 0, spell = null, abilities = [], morph = null, entersWithCounters = null, keywords = [], subtypes = [], transformTo = null, types = [], entersTapped = false, bestow = null }) {
  if (!id || !instanceId || !cardId || !controllerId || !zone) {
    throw new TypeError('Obiekt gry wymaga id, instanceId, cardId, controllerId i zone');
  }
  return Object.freeze({
    id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities,
    morph, entersWithCounters,
    keywords: Object.freeze([...keywords]), subtypes: Object.freeze([...subtypes]),
    transformTo,
    // Pełna linia typów z definicji (np. ['Enchantment','Creature']) — predykaty
    // mechanik (np. „artefakt lub enchantment") nie opierają się na samym kind.
    types: Object.freeze([...types]),
    // Cecha z definicji (np. Rupture Spire): permanent wchodzi na bitwisko tapped.
    entersTapped: Boolean(entersTapped),
    // Bestow (CR 702.103): deskryptor alternatywnego kosztu czaru aury
    // (Leafcrown Dryad). Obiekt z bestow można rzucić jako czar aury z celem.
    bestow: bestow ? Object.freeze({ ...bestow }) : null,
    // Załącznik (CR 301/702.103): aura rzucona za koszt bestow jest na bitwisku
    // NIE-stworem (kind 'aura') i wskazuje zaczarowany obiekt; odłączenie
    // przywraca pierwotny kind (stwór) — patrz attachments.js.
    attachedTo: null, baseKind: null,
    tapped: false, summoningSickness: false, damage: 0,
    powerModifier: 0, toughnessModifier: 0, chosenTargets: null,
    counters: {}, faceDown: false,
    untapLockedBy: [],
  });
}

export function moveGameObject(object, { id, zone, controllerId = object.controllerId }) {
  if (!object || !id || !zone) throw new TypeError('Zmiana strefy wymaga nowego id i zone');
  return Object.freeze({ ...object, id, zone, controllerId });
}
