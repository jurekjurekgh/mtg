/**
 * Tożsamości obiektów gry. Definicje kart i ich egzemplarze są rozdzielone
 * od obiektów, które istnieją chwilowo w strefach (CR 400.7).
 */

export function defineCard({ id, name }) {
  if (!id || !name) throw new TypeError('Definicja karty wymaga id i name');
  return Object.freeze({ id, name });
}

export function createCardInstance({ id, cardId, ownerId }) {
  if (!id || !cardId || !ownerId) throw new TypeError('Egzemplarz wymaga id, cardId i ownerId');
  return Object.freeze({ id, cardId, ownerId });
}

export function createGameObject({ id, instanceId, cardId, controllerId, zone, kind = 'card', power = null, toughness = null }) {
  if (!id || !instanceId || !cardId || !controllerId || !zone) {
    throw new TypeError('Obiekt gry wymaga id, instanceId, cardId, controllerId i zone');
  }
  return Object.freeze({ id, instanceId, cardId, controllerId, zone, kind, power, toughness, tapped: false, damage: 0 });
}

export function moveGameObject(object, { id, zone, controllerId = object.controllerId }) {
  if (!object || !id || !zone) throw new TypeError('Zmiana strefy wymaga nowego id i zone');
  return Object.freeze({ ...object, id, zone, controllerId });
}
