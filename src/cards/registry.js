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
    colors: Object.freeze([...(data.colors ?? [])]),
    power: data.power ?? null,
    toughness: data.toughness ?? null,
    manaCost: data.manaCost ?? 0,
    spell,
    abilities: Object.freeze(abilities),
    // Pola realnych kart (ADR 0010): Oracle text do weryfikacji w sesji,
    // adres ilustracji konkretnego druku oraz mechaniki „na wejściu".
    oracleText: data.oracleText ?? null,
    imageUri: data.imageUri ?? null,
    morph: data.morph ? Object.freeze({ ...data.morph }) : null,
    entersWithCounters: data.entersWithCounters ? Object.freeze({ ...data.entersWithCounters }) : null,
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
