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

export function createGameObject({ id, instanceId, cardId, controllerId, zone, kind = 'card', power = null, toughness = null, manaCost = 0, spell = null, abilities = [], morph = null, plot = null, plotted = false, plottedAtTurn = null, entersWithCounters = null, keywords = [], subtypes = [], transformTo = null, types = [], entersTapped = false, entersTappedCondition = null, bestow = null, aura = null, equipment = null, backup = null, colors = [], phyrexianManaCost = 0, enchantPlayer = false, saga = null, station = null, ownerId = null, devour = null, endure = null, exploit = null, treasureAltCost = null, cardName = null, name = null, bloodthirst = null, additionalCost = null, kicker = null, adventure = null, buyback = null, protectionFromColors = null, enterAsCopy = null }) {
  if (!id || !instanceId || !cardId || !controllerId || !zone) {
    throw new TypeError('Obiekt gry wymaga id, instanceId, cardId, controllerId i zone');
  }
  return Object.freeze({
    id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities,
    // Właściciel obiektu (CR 108.3): gracz, z czyjej talii pochodzi karta;
    // dla tokenów — gracz, pod czyją kontrolą wszedł na bitwisko. Domyślnie
    // równy kontrolerowi; rozjeżdża się po efektach zmiany kontroli
    // (reanimacja pod cudzą kontrolą). Efekt „each player gains control of
    // all creatures they own" (Trostani Discordant) czyta właśnie to pole.
    // Przechodzi przez zmiany stref (moveObjectDirectly zachowuje ...object).
    ownerId: ownerId ?? controllerId,
    // Nazwa karty z definicji (CR 704.5j — prawo legend porównuje NAZWY, nie
    // id kart, bo dwa wydania tej samej karty mają tę samą nazwę): przechodzi
    // przez warstwę kart jak colors/types (ADR 0002 — engine nie zna
    // registry). Tokeny nie są legendarnymi kartami i niosą pole `name`.
    cardName, name, bloodthirst, additionalCost, buyback,
    // Kicker (CR 702.33, Kor Sanctifiers): opcjonalny dodatkowy koszt rzutu
    // — wariant `kicked` komendy cast_permanent; flaga wasKicked ląduje na
    // permanencie po opłaceniu kosztu.
    kicker: kicker ? Object.freeze({ ...kicker }) : null,
    buyback: buyback ? Object.freeze({ ...buyback }) : null,
    protectionFromColors: protectionFromColors ? Object.freeze([...protectionFromColors]) : null,
    enterAsCopy: enterAsCopy ? Object.freeze({ ...enterAsCopy }) : null,
    // Adventure (CR 715, Gray Slaad): deskryptor przygody (koszt + czar) —
    // cast_adventure z ręki, po rozstrzygnięciu karta idzie do exile, skąd
    // cast_adventure_creature rzuca stronę-stwora.
    adventure: adventure ? Object.freeze({ ...adventure }) : null,
    // Kolory karty (np. ['W','B'] dla dwukolorowego tokenu) — jawna informacja
    // publiczna; trigger „a player casts a white spell" (Angel's Feather) czyta
    // je z obiektu czaru przy rzuceniu.
    colors: Object.freeze([...colors]),
    // Fyryksjańska mana (CR 118.9, Porcelain Legionnaire): {W/P} można opłacić
    // maną albo 2 życiem za każdy symbol. Pula many engine jest bezbarwna,
    // więc 1 symbol = 1 mana albo 2 życia.
    phyrexianManaCost,
    morph, plot, plotted: Boolean(plotted), plottedAtTurn: plottedAtTurn ?? null, entersWithCounters,
    keywords: Object.freeze([...keywords]), subtypes: Object.freeze([...subtypes]),
    transformTo,
    // Pełna linia typów z definicji (np. ['Enchantment','Creature']) — predykaty
    // mechanik (np. „artefakt lub enchantment") nie opierają się na samym kind.
    types: Object.freeze([...types]),
    // Cecha z definicji (np. Rupture Spire): permanent wchodzi na bitwisko tapped.
    entersTapped: Boolean(entersTapped),
    // Czasowe entersTapped z warunkiem (Raucous Carnival): land wchodzi
    // zatapnięty, chyba że warunek jest spełniony (wtedy wchodzi untapped).
    entersTappedCondition: entersTappedCondition ? Object.freeze({ ...entersTappedCondition }) : null,
    // Aura „Enchant player" (Curse of the Pierced Heart): zaczarowuje gracza,
    // nie stwora — docelowego gracza wybiera się przy rzucaniu.
    enchantPlayer: Boolean(enchantPlayer),
    // Bestow (CR 702.103): deskryptor alternatywnego kosztu czaru aury
    // (Leafcrown Dryad). Obiekt z bestow można rzucić jako czar aury z celem.
    bestow: bestow ? Object.freeze({ ...bestow }) : null,
    // Czysta aura (CR 303.4, Serra's Embrace): zawsze rzucana jako czar aury
    // z celem; przy nielegalnym celu idzie do grobu (inaczej niż bestow).
    // Wariant „Enchant player" (Curse of the Pierced Heart) ma `enchant`.
    aura: aura ? Object.freeze({
      pump: aura.pump ? Object.freeze({ ...aura.pump }) : null,
      keywords: Object.freeze([...(aura.keywords ?? [])]),
      ...(aura.enchant ? { enchant: aura.enchant } : {}),
      // Ograniczenia nakładane na gospodarza (Hobble): `cantAttack` (bool)
      // oraz `cantBlock` — bool albo warunek { hostHasColor } („can't block
      // if it's black"). Egzekwuje combat — permanents.attachmentRestrictions.
      ...(aura.cantAttack ? { cantAttack: true } : {}),
      ...(aura.cantAttackYou ? { cantAttackYou: true } : {}),
      ...(aura.cantBlock !== undefined && aura.cantBlock !== false
        ? { cantBlock: aura.cantBlock === true ? true : Object.freeze({ ...aura.cantBlock }) }
        : {}),
      // Odbiór keywordów gospodarzowi (Grounded: „Enchanted creature loses
      // flying") — permanents.effectiveKeywords filtruje je w warstwie
      // ostatniej (po wszystkich grantach).
      ...(aura.losesKeywords ? { losesKeywords: Object.freeze([...aura.losesKeywords]) } : {}),
      ...(aura.enchantType ? { enchantType: aura.enchantType } : {}),
      ...(aura.grantMana ? { grantMana: Object.freeze({ ...aura.grantMana }) } : {}),
    }) : null,
    // Equipment (CR 301.5/702.6): permanent-artefakt ze zdolnością equip;
    // załączony daje zaczarowanemu nosicielowi pump/keywordy, a po utracie
    // gospodarza ZOSTAJE na bitwisku odłączony (nie ginie jak aura).
    equipment: equipment ? (() => {
      const base = { equip: equipment.equip, pump: equipment.pump ? Object.freeze({ ...equipment.pump }) : null, keywords: Object.freeze([...(equipment.keywords ?? [])]), subtypes: Object.freeze([...(equipment.subtypes ?? [])]) };
      if (equipment.conditionalKeywords && equipment.conditionalKeywords.length > 0) {
        base.conditionalKeywords = Object.freeze(equipment.conditionalKeywords.map((ck) => Object.freeze({ condition: Object.freeze({ ...ck.condition }), keywords: Object.freeze([...ck.keywords]) })));
      }
      // Ograniczenia nosiciela (jak przy aurze) — zarezerwowane dla
      // przyszłych equipmentów; obecnie żaden ich nie używa.
      if (equipment.cantAttack) base.cantAttack = true;
      if (equipment.cantBlock !== undefined && equipment.cantBlock !== false) {
        base.cantBlock = equipment.cantBlock === true ? true : Object.freeze({ ...equipment.cantBlock });
      }
      return Object.freeze(base);
    })() : null,
    // Backup (CR 702.165, Gloomfang Mauler): ETB-trigger „połóż N liczników
    // +1/+1 na docelowym stworze; jeśli to inny stwór, zyskuje podane
    // zdolności do końca tury". Cel wybiera kontroler (komenda resolve_backup).
    backup: backup ? Object.freeze({ counters: backup.counters, grantKeywords: Object.freeze([...(backup.grantKeywords ?? [])]) }) : null,
    // Devour (CR 702.82) i endure (TDM): deskryptory ETB — jak backup,
    // decyzje blokujące (pendingDevours/pendingEndures, cz. 2 batchu).
    devour: devour ? Object.freeze({ counters: devour.counters }) : null,
    endure: endure ?? null,
    // Exploit (CR 702.110, Silumgar Butcher) — flaga ETB opcjonalnego
    // poświęcenia; alternatywny koszt ze Skarbów (Security Rhox).
    exploit: exploit ? Object.freeze({}) : null,
    treasureAltCost: treasureAltCost ? Object.freeze({ ...treasureAltCost }) : null,
    // Załącznik (CR 301/702.103): aura jest na bitwisku NIE-stworem (kind
    // 'aura') i wskazuje zaczarowany obiekt; odłączenie przywraca pierwotny
    // kind (stwór / czysty enchantment) — patrz attachments.js.
    attachedTo: null, baseKind: null,
    tapped: false, summoningSickness: false, damage: 0,
    // Numer tury, w której obiekt wszedł na bitwisko (Crew Captain —
    // „as long as it entered this turn\"). null poza bitwiskiem.
    enteredOnTurn: null,
    damagedByDeathtouch: false,
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
    // Goad (CR 701.38, loch Undercity — pokój Arena): stwór musi atakować
    // w każdym combacie, jeśli tylko może; znacznik znika w cleanup (do końca
    // tury), razem z innymi grantami.
    goaded: false, goadedUntilTurn: null,
    // „Can't block this turn\" (Panic Spellbomb): tymczasowy znacznik
    // zdejmowany w cleanup razem z innymi grantami „do końca tury\".
    cantBlock: false,
    // Hexproof „do twojej następnej tury" (loch Undercity — Throne of the
    // Dead Three): numer tury, po którym zdolność wygasa (null = brak).
    // Przetrwało cleanup, bo to nie grant „do końca tury".
    hexproofUntilTurn: null,
    // LKI (CR 603.10): wypełniane dopiero przy zmianie strefy (objects.js).
    formerCounters: Object.freeze({}), formerZone: null, formerAbilityGrants: Object.freeze([]),
    // Saga (CR 714, Shiva Warden of Ice): deskryptor rozdziałów; liczniki lore
    // wzbudzają kolejne rozdziały (wejście = I; po komponencie draw = dalsze).
    saga: saga ? Object.freeze({ chapters: saga.chapters }) : null,
    // Station (EOE Spacecraft, Wedgelight Rammer): artefakt ze „ukrytym\"
    // stworem — przy >= threshold liczników charge obiekt JEST stworem
    // (pola kind przepina counters.js po każdej zmianie liczników).
    station: station ? Object.freeze({ threshold: station.threshold, keywords: Object.freeze([...(station.keywords ?? [])]) }) : null,
    // Ile jednostek many pochodzących ze Skarba wydano na zagranie TEGO
    // permanentu (Marut, CR: „if mana from a Treasure was spent to cast
    // it\"). Wpisuje castPermanent po spendMana; null = nieznam/nie dotyczy.
    manaFromTreasureSpent: 0,
    // Wavecrash Triton (heroic): „doesn't untap during its controller's next
    // untap step" — jednorazowa blokada; trzyma kontrolera, którego untap
    // ma pominąć odkręcenie (czyszczona po tym untap).
    dontUntapNextUntapStep: null,
  });
}

export function moveGameObject(object, { id, zone, controllerId = object.controllerId }) {
  if (!object || !id || !zone) throw new TypeError('Zmiana strefy wymaga nowego id i zone');
  return Object.freeze({ ...object, id, zone, controllerId });
}
