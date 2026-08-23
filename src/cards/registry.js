export const SUPPORT_STATUS = Object.freeze([
  'unsupported',
  'in-development',
  'supported',
  'limited',
]);

/**
 * @typedef {{ id: string, name: string, set: string|null, plan: string|null,
 *   types: string[], colors: string[], power: number|null, toughness: number|null,
 *   manaCost: number, support: { status: string, limitations: string[] } }} CardDefinition
 *
 * Pola power/toughness/manaCost opisują wyłącznie dane zasadnicze karty
 * (karta → obiekt gry); nie zastępują przyszłego systemu efektów.
 */

export function defineCard(data) {
  if (!data?.id || !data?.name || !data?.support?.status) throw new TypeError('Karta wymaga id, name i support.status');
  if (!SUPPORT_STATUS.includes(data.support.status)) throw new RangeError(`Nieznany status: ${data.support.status}`);
  const statFields = ['power', 'toughness', 'manaCost'];
  for (const field of statFields) {
    if (data[field] !== undefined && (!Number.isInteger(data[field]) || data[field] < 0)) {
      throw new RangeError(`${field} musi być nieujemną liczbą całkowitą`);
    }
  }
  const spell = freezeSpell(data.spell);
  if (spell && (data.power !== undefined || data.toughness !== undefined)) {
    throw new TypeError('Czar nie może mieć statystyk stwora');
  }
  // Słownik keywordów: silnik dopasowuje MAŁE snake_case ('reach', 'trample')
  // — keyword z wielką literą byłby MARTWY (bug-hunt 2026-08-10: 'Defender'/
  // 'Reach'/'Trample'/'Deathtouch'/'Flash' w 4 kartach). Walidacja przy
  // definicji, żeby nie dało się zarejestrować martwego keywordu.
  for (const kw of data.keywords ?? []) {
    if (typeof kw !== 'string' || !/^[a-z][a-z0-9_]*$/.test(kw)) {
      throw new RangeError(`Keyword musi być małym snake_case (np. 'reach'): ${JSON.stringify(kw)}`);
    }
  }
  const abilities = (data.abilities ?? []).map((a) => Object.freeze({ ...a }));
  return Object.freeze({
    id: data.id,
    name: data.name,
    set: data.set ?? null,
    plan: data.plan ?? null,
    types: Object.freeze([...(data.types ?? [])]),
    subtypes: Object.freeze([...(data.subtypes ?? [])]),
    colors: Object.freeze([...(data.colors ?? [])]),
    keywords: Object.freeze([...(data.keywords ?? [])]),
    power: data.power ?? null,
    toughness: data.toughness ?? null,
    manaCost: data.manaCost ?? 0,
    spell,
    abilities: Object.freeze(abilities),
    // M113 (Academy Journeymage): warunkowa obniżka kosztu karty PERMANENTU
    // („This spell costs {1} less to cast if you control a Wizard") — czary
    // instant/sorcery mają to w `spell.costReduction`, permanenty nie mają
    // deskryptora czaru, więc pole żyje na karcie.
    costReduction: data.costReduction ? Object.freeze({
      amount: data.costReduction.amount,
      condition: Object.freeze({ ...data.costReduction.condition }),
    }) : null,
    // M111: `notes` to OPIS zachowania (jak działa decyzja, co znaczy „one or
    // more", jaka jest polityka deterministyczna) — NIE odstępstwo od Oracle.
    // Pole `support.limitations` zostaje zarezerwowane wyłącznie dla realnych
    // luk („tu NIE gramy pełnego Oracle"); pilnuje tego test-strażnik
    // test/limitations-guard.test.js.
    notes: Object.freeze([...(data.notes ?? [])]),
    // Pola realnych kart (ADR 0010): Oracle text do weryfikacji w sesji,
    // adres ilustracji konkretnego druku oraz mechaniki „na wejściu".
    oracleText: data.oracleText ?? null,
    imageUri: data.imageUri ?? null,
    // Numer ilustracji z arkusza kolekcji właściciela (audyt §3.2: ID jest
    // prefiksem nazwy pliku `Ilustracja`). Zasila lokalne tory podglądu
    // `./img/<artId>FOT.png` i `<artId>KON.png`; uzupełnia go narzędzie
    // tools/fetch-art-ids.mjs, a brak wartości = tylko obraz ze Scryfall.
    artId: data.artId ?? null,
    morph: data.morph ? Object.freeze({
      ...data.morph,
      colors: Object.freeze([...(data.morph.colors ?? [])]),
    }) : null,
    plot: data.plot ? Object.freeze({ ...data.plot }) : null,
    // Suspend (CR 702.62, Mindstab): { cost, colors, timeCounters } — deskryptor
    // specjalnej akcji z ręki (jak plot); karta w exile z licznikami czasu.
    suspend: data.suspend ? Object.freeze({
      cost: data.suspend.cost,
      colors: Object.freeze([...(data.suspend.colors ?? [])]),
      timeCounters: data.suspend.timeCounters ?? 4,
    }) : null,
    // Warp (EOE, Weftblade Enhancer): alternatywny koszt { cost, colors } z ręki.
    // M158/Batch 39 (Revolutionist, CR 702.34): Madness — alternatywny koszt
    // rzutu po odrzuceniu do exile.
    madness: data.madness ? Object.freeze({
      cost: data.madness.cost,
      colors: Object.freeze([...(data.madness.colors ?? [])]),
    }) : null,
    warp: data.warp ? Object.freeze({
      cost: data.warp.cost,
      colors: Object.freeze([...(data.warp.colors ?? [])]),
    }) : null,
    entersWithCounters: data.entersWithCounters ? Object.freeze({ ...data.entersWithCounters }) : null,
    // M108 (Somberwald Spider): liczniki wejścia WARUNKOWE (morbid, CR 614.1c).
    entersWithCountersIf: data.entersWithCountersIf ? Object.freeze({
      morbid: Boolean(data.entersWithCountersIf.morbid),
      // M166/C (Adamant, ELD — Locthwain Paladin): warunek kolorow many
      // wydanej na rzut (breakdown z spendMana).
      adamant: data.entersWithCountersIf.adamant ? Object.freeze({
        color: data.entersWithCountersIf.adamant.color,
        min: data.entersWithCountersIf.adamant.min ?? 3,
      }) : null,
      counters: Object.freeze({ ...(data.entersWithCountersIf.counters ?? {}) }),
    }) : null,
    // Phyrexian mana (CR 118.9): {W/P} — alternatywa „1 mana albo 2 życia"
    // za każdy symbol (Porcelain Legionnaire). Engine płaci deterministycznie:
    // najpierw maną, przy braku many — życiem.
    phyrexianManaCost: data.phyrexianManaCost ?? 0,
    // Kicker (CR 702.33): { cost, colors } — opcjonalny dodatkowy koszt rzutu
    // (Kor Sanctifiers: „Kicker {W}" = { cost: 1, colors: ['W'] }). Wariant
    // `kicked: true` komendy cast_permanent; flaga wasKicked ląduje na
    // permanencie, a triggery „if it was kicked" filtrują po condition.
    kicker: data.kicker ? Object.freeze({
      cost: data.kicker.cost,
      colors: Object.freeze([...(data.kicker.colors ?? [])]),
    }) : null,
    // Adventure (CR 715, Gray Slaad // Entropic Decay): { cost, colors, spell }
    // — alternatywny rzut czaru z ręki (sorcery); po rozstrzygnięciu karta
    // idzie do exile („on an adventure"), skąd można rzucić stronę-stwora
    // (komenda cast_adventure_creature). Deskryptor niesie koszt many,
    // wymagania kolorów i deskryptor czaru (jak spell).
    adventure: data.adventure ? Object.freeze({
      cost: data.adventure.cost,
      colors: Object.freeze([...(data.adventure.colors ?? [])]),
      spell: Object.freeze({ ...data.adventure.spell }),
    }) : null,
    // Karty dwustronne (transform): id drugiej strony (np. 'krallenhorde-wantons').
    transformTo: data.transformTo ?? null,
    // Landy i inne permanenty wchodzące zatapnięte (Rupture Spire, Prismari Campus).
    entersTapped: Boolean(data.entersTapped),
    entersTappedCondition: data.entersTappedCondition ? Object.freeze({ ...data.entersTappedCondition }) : null,
    // Bestow (CR 702.103): alternatywny koszt rzucenia karty jako czaru aury.
    // Deskryptor: { cost, pump: { power, toughness }, keywords } — buff, który
    // załączona aura daje zaczarowanemu stworowi (Leafcrown Dryad: +2/+2, reach).
    bestow: data.bestow ? Object.freeze({
      cost: data.bestow.cost,
      pump: Object.freeze({ ...data.bestow.pump }),
      keywords: Object.freeze([...(data.bestow.keywords ?? [])]),
    }) : null,
    // Czysta aura (CR 303.4): enchant creature, buff zaczarowanego stwora
    // (Serra's Embrace: +2/+2, flying, vigilance). Wariant „Enchant player"
    // (Curse of the Pierced Heart) ma `enchant: 'player'` zamiast buffa.
    // Wzajemnie wyklucza się z bestow (karta albo jest aurą, albo stworem zbestow).
    aura: data.aura ? Object.freeze({
      pump: data.aura.pump ? Object.freeze({ ...data.aura.pump }) : null,
      keywords: Object.freeze([...(data.aura.keywords ?? [])]),
      // Ograniczenia gospodarza (Hobble): `cantAttack`/`cantBlock` (bool albo
      // warunek { hostHasColor } — „can't block if it's black\"); egzekwuje
      // combat w engine (permanents.attachmentRestrictions).
      ...(data.aura.cantAttack ? { cantAttack: true } : {}),
      ...(data.aura.cantAttackYou ? { cantAttackYou: true } : {}),
      // Odbiór keywordów gospodarzowi (Grounded: „loses flying").
      ...(data.aura.losesKeywords ? { losesKeywords: Object.freeze([...data.aura.losesKeywords]) } : {}),
      ...(data.aura.cantBlock !== undefined && data.aura.cantBlock !== false
        ? { cantBlock: data.aura.cantBlock === true ? true : Object.freeze({ ...data.aura.cantBlock }) }
        : {}),
      // „Enchant player" (Curse of the Pierced Heart) — aura zaczarowuje
      // gracza zamiast stwora; bez buffa (pump/keywords null). Pole dodawane
      // warunkowo, żeby nie zmieniać kształtu czystych aur bez enchant.
      ...(data.aura.enchant ? { enchant: data.aura.enchant } : {}),
      ...(data.aura.enchantType ? { enchantType: data.aura.enchantType } : {}),
      ...(data.aura.grantMana ? { grantMana: Object.freeze({ ...data.aura.grantMana }) } : {}),
      ...(data.aura.chooseColor ? { chooseColor: true } : {}),
      // Batch 46 (Guildscorn Ward): TRWAŁA ochrona przed JAKOŚCIĄ źródła
      // (CR 702.16e — „protection from multicolored"). L21/L48: pole musi
      // przejść CAŁY łańcuch karta → registry → obiekt gry, inaczej ginie.
      ...(data.aura.protection ? { protection: Object.freeze({ ...data.aura.protection }) } : {}),
      // Efekt zastępczy tworzenia tokenów (CR 614 — Moonlit Meditation:
      // „The first time you would create one or more tokens each turn, you
      // may instead create that many tokens that are copies of enchanted
      // permanent”). Deskryptor, nie warunek po nazwie karty: engine pyta
      // aurę „czy zastępujesz tworzenie tokenów?”, a nie „czy to jest
      // moonlit-meditation?” (ADR 0002, naprawione w M117).
      ...(data.aura.replaceTokenCreation
        ? { replaceTokenCreation: Object.freeze({ ...data.aura.replaceTokenCreation }) }
        : {}),
      ...(data.aura.keepOwnAttachmentsOnProtection ? { keepOwnAttachmentsOnProtection: true } : {}),
      // M174/D (Predator's Gambit, klasa L47): warunkowe keywordy aury —
      // ta sama zdolność co equipment (Hunter's Blowgun), gubiona przy
      // ręcznym przepisywaniu deskryptora.
      ...(data.aura.conditionalKeywords?.length
        ? { conditionalKeywords: Object.freeze(data.aura.conditionalKeywords.map((ck) => Object.freeze({ condition: Object.freeze({ ...ck.condition }), keywords: Object.freeze([...ck.keywords]) }))) }
        : {}),
    }) : null,
    // Equipment (CR 702.6): { equip: koszt, pump, keywords } — załączony daje
    // nosicielowi pump/keywordy (Cloak of the Bat: flying, haste; equip {2}).
    equipment: data.equipment ? (() => {
      const base = {
        equip: data.equipment.equip,
        pump: data.equipment.pump ? Object.freeze({ ...data.equipment.pump }) : null,
        keywords: Object.freeze([...(data.equipment.keywords ?? [])]),
        subtypes: Object.freeze([...(data.equipment.subtypes ?? [])]),
        // M146 (Blazing Torch): zdolności NADANE nosicielowi („Equipped creature
        // has ...") — statyczne (restrykcje blokowania) i aktywowane (koszt
        // tapHost + sacrificeSelf). Oferta i walidacja czytają je z obiektu
        // sprzętu (abilities.js/combat.js). Pole tylko gdy niepuste — pusta
        // lista nie zmienia kształtu deskryptora (deepEqual w testach).
        ...(data.equipment.grantedAbilities?.length
          ? { grantedAbilities: Object.freeze(data.equipment.grantedAbilities.map((a) => Object.freeze({ ...a }))) }
          : {}),
        // Batch 48 (Steelclaw Lance): TAŃSZY koszt equipu dla wskazanego
        // podtypu („Equip Knight {1}" obok „Equip {3}"). Bez tego pola
        // deskryptor ginął przy budowie rejestru (klasa L21) i karta miała
        // tylko jeden koszt.
        ...(data.equipment.equipFor
          ? { equipFor: Object.freeze({ ...data.equipment.equipFor }) }
          : {}),
      };
      // Conditional keywords (Hunter's Blowgun): different keywords granted
      // based on a condition (e.g. activePlayerIsController = your turn).
      // Only included when present to preserve backward compatibility.
      if (data.equipment.conditionalKeywords) {
        base.conditionalKeywords = Object.freeze(data.equipment.conditionalKeywords.map((ck) => Object.freeze({
          condition: Object.freeze({ ...ck.condition }),
          keywords: Object.freeze([...ck.keywords]),
        })));
      }
      // Batch 44 (Thieves' Tools): „Equipped creature can't be blocked as
      // long as its power is 3 or less" — próg mocy oceniany przy deklaracji
      // blokerów (combat.js), nie statycznie.
      if (data.equipment.cantBeBlockedMaxPower != null) base.cantBeBlockedMaxPower = data.equipment.cantBeBlockedMaxPower;
      // Ograniczenia nosiciela (jak przy aurze) — zarezerwowane pod przyszłe
      // equipmenty; obecnie żaden ich nie używa.
      if (data.equipment.cantAttack) base.cantAttack = true;
      if (data.equipment.cantBlock !== undefined && data.equipment.cantBlock !== false) {
        base.cantBlock = data.equipment.cantBlock === true ? true : Object.freeze({ ...data.equipment.cantBlock });
      }
      return Object.freeze(base);
    })() : null,
    // Backup (CR 702.165): { counters: N, grantKeywords: [...] } — ETB trigger
    // kładzie N liczników +1/+1 na docelowym stworze; jeśli to inny stwór,
    // zyskuje podane zdolności do końca tury (Gloomfang Mauler: menace).
    backup: data.backup ? Object.freeze({
      counters: data.backup.counters,
      grantKeywords: Object.freeze([...(data.backup.grantKeywords ?? [])]),
    }) : null,
    // Devour (CR 702.82, Gorger Wurm): { counters: N } — przy wejściu
    // sekwencyjna decyzja poświęceń (resolve_devour_choice); deskryptor
    // przechodzi na obiekt gry jak backup.
    devour: data.devour ? Object.freeze({ counters: data.devour.counters }) : null,
    // Endure (TDM, Kin-Tree Nurturer): N liczników +1/+1 ALBO token Spirit N/N
    // — decyzja resolve_endure_choice; kwalifikacja licznika danymi.
    endure: data.endure ?? null,
    // Toxic N (CR 702.180) — wartość liczbowa keyworda (Batch 45).
    toxic: data.toxic ?? null,
    // Batch 46 (Bone Shredder): koszt echa (CR 702.29).
    echo: data.echo ?? null,
    // Batch 46 (Manor Gate): „as this enters, choose a color…" na PERMANENCIE
    // (nie aurze) — { exclude: ['G'] } zawęża listę (CR 614.12).
    chooseColor: data.chooseColor ? Object.freeze({ ...data.chooseColor }) : null,
    // Exploit (CR 702.110, Silumgar Butcher): flaga ETB — opcjonalne
    // poświęcenie przy wejściu (resolve_exploit_choice), potem trigger „exploits".
    exploit: data.exploit ? Object.freeze({}) : null,
    // Alternatywny koszt ze Skarbów (Security Rhox): { mana, colors } — wariant
    // cast_permanent treasureAlt płatny wyłącznie maną ze Skarbów.
    treasureAltCost: data.treasureAltCost ? Object.freeze({ ...data.treasureAltCost }) : null,
    // Bloodthirst (Gorehorn Minotaurs): liczba liczników +1/+1 przy wejściu,
    // jeśli przeciwnik był obrażony w tej turze (CR 702.54).
    bloodthirst: data.bloodthirst ?? null,
    additionalCost: data.additionalCost ?? null,
    // Station (CR, EOE Spacecraft, Wedgelight Rammer): { threshold, keywords } —
    // artefakt NIE-będący stworem, który przy >= threshold licznikach charge
    // staje się artefaktowym stworem z podanymi keywordami (9+ | Flying,
    // first strike). Zdolność Station opłaca koszt „tap another creature\"
    // (createAbility z keyword 'station').
    station: data.station ? Object.freeze({
      threshold: data.station.threshold,
      keywords: Object.freeze([...(data.station.keywords ?? [])]),
    }) : null,
    // Saga (CR 714, Shiva Warden of Ice): { chapters } — lista rozdziałów;
    // każdy rozdział to lista efektów odpalana przy dołożeniu licznika lore
    // (enter = rozdział I; po komponencie draw = kolejne). Po rozdziale
    // ostatnim Saga jest poświęcana (CR 714.4), chyba że sama zniknęła.
    saga: data.saga ? Object.freeze({
      // M172/B: tytuły rozdziałów (Oracle) — etykiety decyzji celu i logu.
      chapterNames: data.saga.chapterNames ? Object.freeze([...data.saga.chapterNames]) : null,
      chapters: Object.freeze(data.saga.chapters.map((chapter) => Object.freeze(
        (chapter ?? []).map((effect) => Object.freeze({ ...effect })),
      ))),
    }) : null,
    support: Object.freeze({ status: data.support.status, limitations: Object.freeze([...(data.support.limitations ?? [])]) }),
    // „enter as a copy" (Jwari Shapeshifter): deskryptor kopiowania przy wejściu
    // — { subtype } określa typ, którego kopię można przyjąć (przed SBA).
    enterAsCopy: data.enterAsCopy ? Object.freeze({ ...data.enterAsCopy }) : null,
  });
}

const SPELL_TIMINGS = Object.freeze(['instant', 'sorcery']);

/**
 * Deskryptor czaru przepisywany na obiekt gry; core interpretuje wyłącznie
 * ogólne typy efektów i celów, nigdy nazwy kart.
 */
function freezeSpell(spell) {
  if (spell === undefined || spell === null) return null;
  if (!SPELL_TIMINGS.includes(spell.timing)) throw new RangeError(`Nieznany timing czaru: ${spell.timing}`);
  // Czar modalny (Aerith Rescue Mission) niesie `modes` zamiast nadrzędnych
  // `effects` — każdy tryb ma własną listę efektów.
  const isModal = Array.isArray(spell.modes) && spell.modes.length > 0;
  if (!isModal && (!Array.isArray(spell.effects) || spell.effects.length === 0)) throw new TypeError('Czar wymaga niepustej listy efektów');
  return Object.freeze({
    timing: spell.timing,
    targets: Object.freeze((spell.targets ?? []).map((spec) => Object.freeze({ ...spec }))),
    // Czar modalny niesie efekty w `modes`; nadrzędna lista jest wtedy pusta.
    effects: Object.freeze((isModal ? [] : (spell.effects ?? [])).map((effect) => Object.freeze({ ...effect }))),
    // Dodatkowy koszt rzucenia czaru (CR 601.2f): „As an additional cost to cast
    // this spell, sacrifice a creature" (Village Rites). Cel-poświęcenie wybiera
    // gracz przy rzucaniu; legalSpellCasts enumeruje po jego stworach.
    ...(spell.additionalCost ? { additionalCost: Object.freeze({ ...spell.additionalCost }) } : {}),
    // Modal „Choose one" (Aerith Rescue Mission): lista trybów, każdy z własnym
    // zestawem celów i efektów; legalSpellCasts enumeruje warianty trybów.
    ...(spell.modes ? { modes: Object.freeze(spell.modes.map((mode) => Object.freeze({
      ...mode,
      targets: Object.freeze((mode.targets ?? []).map((spec) => Object.freeze({ ...spec }))),
      effects: Object.freeze((mode.effects ?? []).map((effect) => Object.freeze({ ...effect }))),
    }))) } : {}),
    // Escape (CR 702.138, Sweet Oblivion): czar można rzucić z grobu za koszt
    // escape + wygnanie N innych kart z grobu. Deskryptor { cost, exileCount }.
    ...(spell.escape ? { escape: Object.freeze({ cost: spell.escape.cost, exileCount: spell.escape.exileCount }) } : {}),
    // Obniżka kosztu warunkowa (Metalcraft, Stoic Rebuttal, CR 702.80):
    // „this spell costs {1} less to cast if you control three or more
    // artifacts\" — deskryptor { amount, condition } oceniany w chwili rzutu.
    ...(spell.costReduction ? { costReduction: Object.freeze({
      amount: spell.costReduction.amount,
      condition: Object.freeze({ ...spell.costReduction.condition }),
    }) } : {}),
    // Cleave (CR 701.33, Lunar Rejection): alternatywny koszt rzucenia czaru,
    // który „wykreśla\" fragment tekstu — zmienia legalne cele i efekty.
    // Deskryptor { manaCost, targets, effects } buduje warstwa kart; core używa
    // go przy rzucie (cast_cleave) i rozstrzyganiu (cleaved → cleave.targets/
    // effects). Nigdy nie zależy od nazwy karty (ADR 0002).
    ...(spell.cleave ? { cleave: Object.freeze({
      manaCost: spell.cleave.manaCost,
      targets: Object.freeze((spell.cleave.targets ?? []).map((spec) => Object.freeze({ ...spec }))),
      effects: Object.freeze((spell.cleave.effects ?? []).map((effect) => Object.freeze({ ...effect }))),
    }) } : {}),
    // Buyback (CR 702.26): dodatkowy koszt — jeśli zapłacony, czar wraca
    // do ręki po rozstrzygnięciu zamiast do grobu.
    ...(spell.buyback ? { buyback: Object.freeze({ cost: spell.buyback.cost ?? 0, colors: Object.freeze([...(spell.buyback.colors ?? [])]) }) } : {}),
    // Rebound (CR 702.97, Ojutai's Breath): czar rzucony z RĘKI po rozstrzygnięciu
    // idzie do exile, a na początku następnego upkeepu kontrolera można go rzucić
    // bez kosztu. Flaga na deskryptorze czaru — sprawdzana w castSpell (rzut
    // z ręki) i resolveTopOfStack (exile zamiast grobu).
    ...(spell.rebound ? { rebound: true } : {}),
    // Fireball (X-cost, any number of targets, divided damage): flaga
    // specjalnego rozstrzygania — registry wymaga niepustej listy efektów,
    // więc deskryptor niesie też minimalny efekt-zaslepkę (fireball_resolve).
    ...(spell.fireball ? { fireball: true } : {}),
    // Storm (CR 702.40, Spreading Insurrection): przy rzucie czar kopiuje się
    // za każdy czar rzucony wcześniej w tej turze. Flaga; liczbę kopii liczy
    // core (state.spellsCastThisTurn).
    ...(spell.storm ? { storm: true } : {}),
    // Generyczny X-cost (Consume Spirit, Epic Experiment — Batch 30): flaga —
    // koszt bazowy w manaCost NIE zawiera X; X wybiera gracz (komenda niesie
    // xValue), całkowity koszt = manaCost + X.
    ...(spell.xCost ? { xCost: Object.freeze({
      cap: spell.xCost.cap ?? 15,
      ...(spell.xCost.black ? { black: true } : {}),
    }) } : {}),
    ...(spell.flashback ? { flashback: Object.freeze({
      cost: spell.flashback.cost ?? 0,
      colors: Object.freeze([...(spell.flashback.colors ?? [])]),
    }) } : {}),
  });
}

export function createRegistry(cards = []) {
  const byId = new Map();
  for (const card of cards) {
    if (byId.has(card.id)) throw new Error(`Duplikat definicji karty: ${card.id}`);
    byId.set(card.id, card);
  }
  return Object.freeze({
    get(id) { return byId.get(id); },
    has(id) { return byId.has(id); },
    all() { return [...byId.values()]; },
    supported() { return [...byId.values()].filter((card) => card.support.status === 'supported'); },
  });
}

export function assertDeckSupported(cardIds, registry) {
  if (!Array.isArray(cardIds) || !registry) throw new TypeError('Talia wymaga listy kart i registry');
  const unsupported = cardIds.filter((id) => !registry.get(id) || registry.get(id).support.status !== 'supported');
  if (unsupported.length) throw new Error(`Talia zawiera nieobsługiwane karty: ${[...new Set(unsupported)].join(', ')}`);
  return true;
}
