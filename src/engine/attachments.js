import { event } from '../protocol/types.js';

/**
 * Załączniki — aury bestow (CR 301.5, CR 303.4, CR 702.103).
 *
 * Model (minimalny, ale kompletny dla kart z bestow):
 * - aura rzucona za koszt bestow wchodzi na bitwisko z `attachedTo` = obiekt
 *   zaczarowanego stwora i `kind: 'aura'` — dopóki jest załączona, NIE jest
 *   stworem (nie atakuje, nie blokuje, nie ginie z obrażeń stwora;
 *   `baseKind` pamięta pierwotny kind, np. 'creature');
 * - zaczarowany stwór dostaje buff z deskryptora `bestow` aury (pump +
 *   keywordy) — patrz permanents.aurasAttachedTo i effectivePower/Toughness;
 * - gdy zaczarowany obiekt przestaje być stworem kontrolowanym przez gracza
 *   na bitwisku (zginał, wygnany, odszedł), aura ODŁĄCZA się i zostaje na
 *   bitwisku jako stwór (CR 702.103b) — to state-based action uruchamiane
 *   po każdej akceptowanej komendzie, identycznie jak obrażenia/życie;
 * - „enchant creature" obejmuje KAŻDEGO stwora na bitwisku (także wrogiego,
 *   gdyby któraś karta tego chciała — deskryptor nie ogranicza kontrolera).
 */

function patchAuraObject(state, object, patch) {
  const updated = Object.freeze({ ...object, ...patch });
  state.objects.set(object.id, updated);
  return updated;
}

/** Wszystkie aury załączone do danego obiektu (obiekty z attachedTo = id). */
export function aurasAttachedTo(state, hostId) {
  const auras = [];
  for (const object of state.objects.values()) {
    if (object.zone === 'battlefield' && object.kind === 'aura' && object.attachedTo === hostId) auras.push(object);
  }
  return auras;
}

/** Czy obiekt jest załączoną aurą bestow (nie jest wtedy stworem). */
export function isAttachedAura(object) {
  return object?.kind === 'aura' && typeof object.attachedTo === 'string';
}

/** Zaczarowany stwór (obiekt, do którego aura jest załączona) albo null. */
export function enchantedObject(state, aura) {
  if (!isAttachedAura(aura)) return null;
  return state.objects.get(aura.attachedTo) ?? null;
}

/**
 * Załącza aurę do stwora przy wejściu na bitwisko (rozstrzygnięcie czaru
 * aury bestow). Zwraca obiekt po zatwierdzeniu.
 */
export function attachAuraToCreature(state, auraId, hostId) {
  const aura = state.objects.get(auraId);
  const host = state.objects.get(hostId);
  if (!aura || aura.zone !== 'battlefield' || !aura.bestow) throw new Error('Załączyć można tylko aurę bestow na bitwisku');
  if (auraId === hostId) throw new Error('Aura nie może zaczarować samej siebie');
  if (!host || host.zone !== 'battlefield' || host.kind !== 'creature') throw new Error('Aurę można załączyć tylko do stwora na bitwisku');
  // Załączona aura przestaje być stworem; obrażenia oznaczone na niej nie
  // liczą się, dopóki nie będzie stworem (CR 702.103a) — zerujemy je.
  const updated = patchAuraObject(state, aura, {
    attachedTo: hostId,
    baseKind: aura.baseKind ?? aura.kind,
    kind: 'aura',
    powerModifier: 0, toughnessModifier: 0, damage: 0,
    counters: {},
    summoningSickness: true, // po odłączeniu jako stwór obowiązuje choroba atakowa
  });
  state.events.push(event('object_attached', {
    objectId: auraId, hostId, cardId: aura.cardId,
    controllerId: aura.controllerId, hostCardId: host.cardId,
  }));
  return updated;
}

/**
 * Odłącza wszystkie aury wskazujące dany obiekt (gospodarza). Wywoływane z
 * moveObjectDirectly, gdy gospodarz opuszcza bitwisko — relacja attachedTo
 * nigdy nie wskazuje obiektu poza bitwiskiem (pilnuje tego inwariant),
 * więc odłączenie dzieje się w chwili ruchu, a aura natychmiast znów staje
 * się stworem (CR 303.4c + wyjątek bestow 702.103b: zostaje na bitwisku).
 * Zwraca zdarzenia object_detached.
 */
export function detachAurasFromHost(state, hostId) {
  const detached = [];
  for (const object of [...state.objects.values()]) {
    if (!isAttachedAura(object) || object.attachedTo !== hostId) continue;
    const updated = patchAuraObject(state, object, {
      attachedTo: null,
      kind: object.baseKind ?? 'creature',
      baseKind: null,
    });
    const e = event('object_detached', {
      objectId: object.id, fromHostId: hostId, cardId: updated.cardId,
      controllerId: updated.controllerId, becameKind: updated.kind,
    });
    state.events.push(e);
    detached.push(e);
  }
  return detached;
}

/**
 * SBA 702.103b / 303.4c: aura, której zaczarowany obiekt przestał być dopuszczalny
 * (przestał być stworem będąc na bitwisku), ODŁĄCZA się i zostaje na bitwisku
 * jako stwór (wraca pierwotny kind). Gospodarz opuszczający bitwisko jest
 * obsłużony wcześniej — w samej zmianie strefy (detachAurasFromHost).
 */
export function detachIllegallyAttachedAuras(state) {
  const detached = [];
  for (const object of [...state.objects.values()]) {
    if (!isAttachedAura(object)) continue;
    const host = state.objects.get(object.attachedTo);
    const hostLegal = host && host.zone === 'battlefield' && host.kind === 'creature';
    if (hostLegal) continue;
    const fromHostId = object.attachedTo;
    const updated = patchAuraObject(state, object, {
      attachedTo: null,
      kind: object.baseKind ?? 'creature',
      baseKind: null,
    });
    const e = event('object_detached', {
      objectId: object.id, fromHostId, cardId: updated.cardId,
      controllerId: updated.controllerId, becameKind: updated.kind,
    });
    state.events.push(e);
    detached.push(e);
  }
  return detached;
}
