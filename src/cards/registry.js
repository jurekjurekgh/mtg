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
    // Bestow (CR 702.103): alternatywny koszt rzucenia karty jako czaru aury.
    // Deskryptor: { cost, pump: { power, toughness }, keywords } — buff, który
    // załączona aura daje zaczarowanemu stworowi (Leafcrown Dryad: +2/+2, reach).
    bestow: data.bestow ? Object.freeze({
      cost: data.bestow.cost,
      pump: Object.freeze({ ...data.bestow.pump }),
      keywords: Object.freeze([...(data.bestow.keywords ?? [])]),
    }) : null,
    // Czysta aura (CR 303.4): enchant creature, buff zaczarowanego stwora
    // (Serra's Embrace: +2/+2, flying, vigilance). Wzajemnie wyklucza się
    // z bestow (karta albo jest aurą, albo stworem zbestow).
    aura: data.aura ? Object.freeze({
      pump: data.aura.pump ? Object.freeze({ ...data.aura.pump }) : null,
      keywords: Object.freeze([...(data.aura.keywords ?? [])]),
    }) : null,
    // Equipment (CR 702.6): { equip: koszt, pump, keywords } — załączony daje
    // nosicielowi pump/keywordy (Cloak of the Bat: flying, haste; equip {2}).
    equipment: data.equipment ? Object.freeze({
      equip: data.equipment.equip,
      pump: data.equipment.pump ? Object.freeze({ ...data.equipment.pump }) : null,
      keywords: Object.freeze([...(data.equipment.keywords ?? [])]),
    }) : null,
    // Backup (CR 702.165): { counters: N, grantKeywords: [...] } — ETB trigger
    // kładzie N liczników +1/+1 na docelowym stworze; jeśli to inny stwór,
    // zyskuje podane zdolności do końca tury (Gloomfang Mauler: menace).
    backup: data.backup ? Object.freeze({
      counters: data.backup.counters,
      grantKeywords: Object.freeze([...(data.backup.grantKeywords ?? [])]),
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
  if (!Array.isArray(spell.effects) || spell.effects.length === 0) throw new TypeError('Czar wymaga niepustej listy efektów');
  return Object.freeze({
    timing: spell.timing,
    targets: Object.freeze((spell.targets ?? []).map((spec) => Object.freeze({ ...spec }))),
    effects: Object.freeze(spell.effects.map((effect) => Object.freeze({ ...effect }))),
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
