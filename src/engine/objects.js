import { assertZone } from './zones.js';
import { assertStateInvariants } from './invariants.js';
import { detachAurasFromHost } from './attachments.js';

/**
 * Kontrolowana zmiana strefy obiektu gry (CR 400.7): stary obiekt przestaje
 * istnieć, a w docelowej strefie powstaje nowy obiekt z nowym id.
 *
 * To jedyne niskopoziomowe API przenoszenia obiektów. Świadomie nie zna
 * komend, tury ani PlayerView — dzięki temu moduł nie tworzy cykli z
 * game-state.js, które zablokowałyby sklejanie artefaktu (build.mjs).
 */
export function moveObjectDirectly(state, objectId, toZone, newObjectId) {
  const object = state.objects.get(objectId);
  assertZone(toZone);
  if (!object || !newObjectId || state.objects.has(newObjectId)) throw new Error('Nieprawidłowy ruch obiektu');
  state.zones[object.zone] = state.zones[object.zone].filter((id) => id !== object.id);
  state.zones[toZone].push(newObjectId);
  // CR 400.7: nowy obiekt nie pamięta stanu poprzedniego — modyfikatory
  // statystyk, obrażenia i przypisane cele nie przechodzą przez zmianę strefy.
  // Liczniki również znikają (CR 122.2), a face-down permanent po wyjściu
  // z bitwiska jest obracany twarzą do góry. Aura bestow opuszczająca bitwisko
  // przestaje być załączona i wraca do bycia stworem (to wciąż ta sama
  // karta-stwór — kind wraca do baseKind).
  const moved = Object.freeze({
    ...object, id: newObjectId, zone: toZone,
    damage: 0, powerModifier: 0, toughnessModifier: 0, chosenTargets: null,
    counters: {}, faceDown: false,
    attachedTo: null,
    kind: object.kind === 'aura' ? (object.baseKind ?? 'creature') : object.kind,
    baseKind: null,
  });
  state.objects.delete(object.id); state.objects.set(newObjectId, moved);
  // Aury wskazujące odchodzący obiekt odłączają się od razu — attachedTo
  // nigdy nie wskazuje obiektu spoza bitwiska (inwariant). Same aury
  // zostają na bitwisku jako stwory (CR 702.103b).
  if (object.zone === 'battlefield') detachAurasFromHost(state, objectId);
  assertStateInvariants(state);
  return moved;
}
