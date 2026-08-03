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

export function createGameObject({ id, instanceId, cardId, controllerId, zone, kind = 'card', power = null, toughness = null, manaCost = 0, spell = null, abilities = [], morph = null, plot = null, plotted = false, entersWithCounters = null, keywords = [], subtypes = [], transformTo = null, types = [], entersTapped = false, bestow = null, aura = null, equipment = null, backup = null, colors = [], phyrexianManaCost = 0 }) {
  if (!id || !instanceId || !cardId || !controllerId || !zone) {
    throw new TypeError('Obiekt gry wymaga id, instanceId, cardId, controllerId i zone');
  }
  return Object.freeze({
    id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities,
    // Kolory karty (np. ['W','B'] dla dwukolorowego tokenu) — jawna informacja
    // publiczna; trigger „a player casts a white spell" (Angel's Feather) czyta
    // je z obiektu czaru przy rzuceniu.
    colors: Object.freeze([...colors]),
    // Fyryksjańska mana (CR 118.9, Porcelain Legionnaire): {W/P} można opłacić
    // maną albo 2 życiem za każdy symbol. Pula many engine jest bezbarwna,
    // więc 1 symbol = 1 mana albo 2 życia.
    phyrexianManaCost,
    morph, plot, plotted: Boolean(plotted), entersWithCounters,
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
    // Czysta aura (CR 303.4, Serra's Embrace): zawsze rzucana jako czar aury
    // z celem; przy nielegalnym celu idzie do grobu (inaczej niż bestow).
    aura: aura ? Object.freeze({ pump: aura.pump ? Object.freeze({ ...aura.pump }) : null, keywords: Object.freeze([...(aura.keywords ?? [])]) }) : null,
    // Equipment (CR 301.5/702.6): permanent-artefakt ze zdolnością equip;
    // załączony daje zaczarowanemu nosicielowi pump/keywordy, a po utracie
    // gospodarza ZOSTAJE na bitwisku odłączony (nie ginie jak aura).
    equipment: equipment ? Object.freeze({ equip: equipment.equip, pump: equipment.pump ? Object.freeze({ ...equipment.pump }) : null, keywords: Object.freeze([...(equipment.keywords ?? [])]) }) : null,
    // Backup (CR 702.165, Gloomfang Mauler): ETB-trigger „połóż N liczników
    // +1/+1 na docelowym stworze; jeśli to inny stwór, zyskuje podane
    // zdolności do końca tury". Cel wybiera kontroler (komenda resolve_backup).
    backup: backup ? Object.freeze({ counters: backup.counters, grantKeywords: Object.freeze([...(backup.grantKeywords ?? [])]) }) : null,
    // Załącznik (CR 301/702.103): aura jest na bitwisku NIE-stworem (kind
    // 'aura') i wskazuje zaczarowany obiekt; odłączenie przywraca pierwotny
    // kind (stwór / czysty enchantment) — patrz attachments.js.
    attachedTo: null, baseKind: null,
    tapped: false, summoningSickness: false, damage: 0,
    powerModifier: 0, toughnessModifier: 0, chosenTargets: null,
    counters: {}, faceDown: false,
    untapLockedBy: [],
    // Tymczasowe keywordy „do końca tury" (Backup 702.165a, CR 613 w minimalnym
    // wymiarze); czyszczone w cleanup przez clearStatModifiers.
    keywordGrants: [],
    // Zdolności nadane „do końca tury" (Fake Your Own Death nadaje stworowi
    // trigger dies); czyszczone w cleanup przez clearStatModifiers.
    abilityGrants: [],
    // Tymczasowa zmiana podtypów (Unstable Frontier: land staje się wybranym
    // typem podstawowym do końca tury) — { subtypes: [...] } albo null.
    typeGrant: null,
    // LKI (CR 603.10): wypełniane dopiero przy zmianie strefy (objects.js).
    formerCounters: Object.freeze({}), formerZone: null, formerAbilityGrants: Object.freeze([]),
  });
}

export function moveGameObject(object, { id, zone, controllerId = object.controllerId }) {
  if (!object || !id || !zone) throw new TypeError('Zmiana strefy wymaga nowego id i zone');
  return Object.freeze({ ...object, id, zone, controllerId });
}
