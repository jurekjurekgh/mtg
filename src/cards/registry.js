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
    // Pola realnych kart (ADR 0010): Oracle text do weryfikacji w sesji,
    // adres ilustracji konkretnego druku oraz mechaniki „na wejściu".
    oracleText: data.oracleText ?? null,
    imageUri: data.imageUri ?? null,
    // Numer ilustracji z arkusza kolekcji właściciela (audyt §3.2: ID jest
    // prefiksem nazwy pliku `Ilustracja`). Zasila lokalne tory podglądu
    // `./img/<artId>FOT.png` i `<artId>KON.png`; uzupełnia go narzędzie
    // tools/fetch-art-ids.mjs, a brak wartości = tylko obraz ze Scryfall.
    artId: data.artId ?? null,
    morph: data.morph ? Object.freeze({ ...data.morph }) : null,
    plot: data.plot ? Object.freeze({ ...data.plot }) : null,
    entersWithCounters: data.entersWithCounters ? Object.freeze({ ...data.entersWithCounters }) : null,
    // Phyrexian mana (CR 118.9): {W/P} — alternatywa „1 mana albo 2 życia"
    // za każdy symbol (Porcelain Legionnaire). Engine płaci deterministycznie:
    // najpierw maną, przy braku many — życiem.
    phyrexianManaCost: data.phyrexianManaCost ?? 0,
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
      // „Enchant player" (Curse of the Pierced Heart) — aura zaczarowuje
      // gracza zamiast stwora; bez buffa (pump/keywords null). Pole dodawane
      // warunkowo, żeby nie zmieniać kształtu czystych aur bez enchant.
      ...(data.aura.enchant ? { enchant: data.aura.enchant } : {}),
    }) : null,
    // Equipment (CR 702.6): { equip: koszt, pump, keywords } — załączony daje
    // nosicielowi pump/keywordy (Cloak of the Bat: flying, haste; equip {2}).
    equipment: data.equipment ? (() => {
      const base = {
        equip: data.equipment.equip,
        pump: data.equipment.pump ? Object.freeze({ ...data.equipment.pump }) : null,
        keywords: Object.freeze([...(data.equipment.keywords ?? [])]),
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
      return Object.freeze(base);
    })() : null,
    // Backup (CR 702.165): { counters: N, grantKeywords: [...] } — ETB trigger
    // kładzie N liczników +1/+1 na docelowym stworze; jeśli to inny stwór,
    // zyskuje podane zdolności do końca tury (Gloomfang Mauler: menace).
    backup: data.backup ? Object.freeze({
      counters: data.backup.counters,
      grantKeywords: Object.freeze([...(data.backup.grantKeywords ?? [])]),
    }) : null,
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
      chapters: Object.freeze(data.saga.chapters.map((chapter) => Object.freeze(
        (chapter ?? []).map((effect) => Object.freeze({ ...effect })),
      ))),
    }) : null,
    support: Object.freeze({ status: data.support.status, limitations: Object.freeze([...(data.support.limitations ?? [])]) }),
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
