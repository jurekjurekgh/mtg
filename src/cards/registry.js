export const SUPPORT_STATUS = Object.freeze([
  'unsupported',
  'in-development',
  'supported',
  'limited',
]);

/** @typedef {{ id: string, name: string, set?: string, plan?: string, types?: string[], support: { status: string, limitations?: string[] } }} CardDefinition */

export function defineCard(data) {
  if (!data?.id || !data?.name || !data?.support?.status) throw new TypeError('Karta wymaga id, name i support.status');
  if (!SUPPORT_STATUS.includes(data.support.status)) throw new RangeError(`Nieznany status: ${data.support.status}`);
  return Object.freeze({
    id: data.id,
    name: data.name,
    set: data.set ?? null,
    plan: data.plan ?? null,
    types: Object.freeze([...(data.types ?? [])]),
    colors: Object.freeze([...(data.colors ?? [])]),
    support: Object.freeze({ status: data.support.status, limitations: Object.freeze([...(data.support.limitations ?? [])]) }),
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
