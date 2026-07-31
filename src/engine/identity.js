/**
 * Tożsamości obiektów gry. Definicje kart i ich egzemplarze są rozdzielone
 * od obiektów, które istnieją chwilowo w strefach (CR 400.7).
 */

/** @typedef {{ id: string, name: string }} CardDefinition */
/** @typedef {{ id: string, cardId: string, ownerId: string }} CardInstance */
/** @typedef {{ id: string, instanceId: string, cardId: string, controllerId: string, zone: string }} GameObject */

export function defineCard({ id, name }) {
  if (!id || !name) throw new TypeError('Definicja karty wymaga id i name');
  return Object.freeze({ id, name });
}

export function createCardInstance({ id, cardId, ownerId }) {
  if (!id || !cardId || !ownerId) throw new TypeError('Egzemplarz wymaga id, cardId i ownerId');
  return Object.freeze({ id, cardId, ownerId });
}

export function createGameObject({ id, instanceId, cardId, controllerId, zone }) {
  if (!id || !instanceId || !cardId || !controllerId || !zone) {
    throw new TypeError('Obiekt gry wymaga id, instanceId, cardId, controllerId i zone');
  }
  return Object.freeze({ id, instanceId, cardId, controllerId, zone });
}

/** Zmiana strefy tworzy nowy obiekt gry, ale zachowuje egzemplarz karty. */
export function moveGameObject(object, { id, zone, controllerId = object.controllerId }) {
  if (!object || !id || !zone) throw new TypeError('Zmiana strefy wymaga nowego id i zone');
  return createGameObject({ id, instanceId: object.instanceId, cardId: object.cardId, controllerId, zone });
}
