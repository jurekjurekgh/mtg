import { assertZone } from './zones.js';
import { assertStateInvariants } from './invariants.js';
import { detachAttachmentsFromHost } from './attachments.js';

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
  // Obiekt może opuścić bitwisko przez koszt/efekt w oknie combat (np.
  // sacrifice aktywowanego permanenta). Combat nie może zachować wiszącego
  // odwołania do starego obiektu — usuwamy go z atakujących i bloków przed
  // zmianą strefy, bez znajomości konkretnej karty.
  if (object.zone === 'battlefield' && state.combat) {
    const wasAttacker = state.combat.attackers.includes(object.id);
    if (wasAttacker) {
      state.combat.attackers = state.combat.attackers.filter((id) => id !== object.id);
      state.combat.blockers.delete(object.id);
      state.combat.blockedAttackers?.delete(object.id);
    }
    // If the object was a blocker, remove only its live object reference.
    // The map key and blockedAttackers marker remain: the attacker is still
    // blocked for combat damage even though the blocker is gone.
    for (const [attackerId, blockerIds] of state.combat.blockers) {
      state.combat.blockers.set(attackerId, blockerIds.filter((id) => id !== object.id));
    }
  }
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
    counters: {}, faceDown: false, keywordGrants: [], abilityGrants: [], typeGrant: null,
    goaded: false, hexproofUntilTurn: null,
    // Last known information (CR 603.10): stan sprzed zmiany strefy, potrzebny
    // triggerom „leave the battlefield" (persist sprawdza liczniki -1/-1,
    // które zmiana strefy już zdjęła).
    formerCounters: Object.freeze({ ...(object.counters ?? {}) }),
    formerZone: object.zone,
    // LKI zdolności nadanych „do końca tury": trigger „when this creature
    // dies" nadany przez czar (Fake Your Own Death) działa z ostatniej znanej
    // informacji, choć sam grant nie przechodzi przez zmianę strefy.
    formerAbilityGrants: Object.freeze([...(object.abilityGrants ?? [])]),
    attachedTo: null,
    kind: object.kind === 'aura' ? (object.baseKind ?? 'creature') : object.kind,
    baseKind: null,
  });
  state.objects.delete(object.id); state.objects.set(newObjectId, moved);
  // Załączniki wskazujące odchodzący obiekt rozłączają się od razu —
  // attachedTo nigdy nie wskazuje obiektu spoza bitwiska (inwariant).
  // Polityki zależą od rodziny: bestow znów jest stworem (CR 702.103b),
  // equipment zostaje odłączony (CR 704.5n), czysta aura idzie do grobu
  // (CR 704.5m) — detale w attachments.js.
  if (object.zone === 'battlefield') detachAttachmentsFromHost(state, objectId);
  assertStateInvariants(state);
  return moved;
}
