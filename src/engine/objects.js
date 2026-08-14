import { event } from '../protocol/types.js';
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
  // M69 (Unearth, CR 702.87b): „Exile it ... if it would leave the battlefield"
  // — permanent z flagą unearthExile opuszczający bitwisko idzie do exile
  // zamiast docelowej strefy (replacement, jak finality dla dies). Delayed
  // exile na end step też przechodzi tu — cel to już exile, bez zmian.
  if (object.zone === 'battlefield' && object.unearthExile && toZone !== 'exile') {
    toZone = 'exile';
  }
  // Flashback (CR 702.34b): po zapłaceniu flashback karta opuszczająca stos
  // idzie do exile (kontrczar, bounce ze stosu, rozstrzygnięcie).
  if (object.zone === 'stack' && object.flashedBack && toZone !== 'exile') {
    toZone = 'exile';
  }
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
  // CR 400.3 + CR 110.2a: kontrola istnieje wyłącznie na bitwisku i na stosie.
  // Obiekt w grobie / exile / ręce / bibliotece jest kontrolowany przez swojego
  // WŁAŚCICIELA. Bez tego stwór przejęty efektem „gain control" (Puppeteer
  // Clique, Awaken the Sleeper) po śmierci lądował w grobie ZŁODZIEJA i
  // zostawał jego kartą na stałe; właściciel nie widział jej we własnym grobie
  // i nie mógł jej reanimować. `bounce_permanent` miał już własną korektę na
  // ownerId — tu naprawiamy to raz, w jedynym choke poincie zmian stref.
  const controllerAfterMove = (object.zone === 'battlefield' && toZone !== 'battlefield' && toZone !== 'stack')
    ? (object.ownerId ?? object.controllerId)
    : object.controllerId;
  const moved = Object.freeze({
    ...object, id: newObjectId, zone: toZone, controllerId: controllerAfterMove,
    // Crew Captain / enteredThisTurn: numer tury WEJŚCIA na bitwisko.
    // Opuszczenie bitwiska czyści flagę (nowy obiekt, CR 400.7).
    enteredOnTurn: toZone === 'battlefield' ? state.turn.number : null,
    damage: 0, powerModifier: 0, toughnessModifier: 0, chosenTargets: null,
    counters: {}, faceDown: false, keywordGrants: [], abilityGrants: [], typeGrant: null,
    goaded: false, goadedUntilTurn: null, hexproofUntilTurn: null,
    // LKI płatności Skarbem NIE przechodzi przez zmianę strefy (CR 400.7) —
    // permanent wchodzący na bitwisko inną drogą (reanimacja, token) nie
    // był rzucany za manę ze Skarba (Marut). castPermanent wpisuje wartość
    // na obiekcie PO przeniesieniu, więc rzut z ręki ją zachowuje.
    manaFromTreasureSpent: 0,
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
  // Animacje z linkiem (Skilled Animator: „as long as this creature remains
  // on the battlefield") kończą się, gdy ŹRÓDŁO opuszcza bitwisko — cofamy
  // animację celu (root cause: trwałość efektu zależy od strefy źródła,
  // więc naprawiamy ją w jedynym choke poincie zmian stref). To samo
  // dotyczy kosztów/efektów wygnań, poświęceń i zniszczeń — wszystkie
  // przechodzą przez moveObjectDirectly.
  if (object.zone === 'battlefield' && toZone !== 'battlefield') {
    const links = state.linkedAnimations ?? [];
    if (links.length > 0) {
      const remaining = links.filter((entry) => entry.sourceId !== objectId);
      const revertedTargets = new Set();
      for (const entry of links) {
        if (entry.sourceId !== objectId) continue;
        revertedTargets.add(entry.targetId);
      }
      state.linkedAnimations = remaining;
      for (const targetId of revertedTargets) {
        const stillTargeted = remaining.some((entry) => entry.targetId === targetId);
        if (stillTargeted) continue;
        const target = state.objects.get(targetId);
        if (!target || target.zone !== 'battlefield' || !target.originalBeforeAnimation) continue;
        const original = target.originalBeforeAnimation;
        const reverted = Object.freeze({
          ...target,
          kind: original.kind,
          types: original.types,
          subtypes: original.subtypes,
          power: original.power,
          toughness: original.toughness,
          originalBeforeAnimation: null,
        });
        state.objects.set(targetId, reverted);
        state.events.push(event('permanent_animation_ended', {
          objectId: targetId, cardId: reverted.cardId,
          sourceId: objectId, kind: reverted.kind,
        }));
      }
    }
  }
  assertStateInvariants(state);
  return moved;
}
