import { event } from '../protocol/types.js';
import { assertZone } from './zones.js';
import { addCounter } from './counters.js';
import { attachmentGrant, attachmentsAttachedTo } from './attachments.js';

function replaceObject(state, object, patch) {
  const updated = Object.freeze({ ...object, ...patch });
  state.objects.set(object.id, updated);
  return updated;
}

export function tapObject(state, objectId, playerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nie można tapować tego obiektu');
  if (object.tapped) throw new Error('Obiekt jest już tapped');
  const updated = replaceObject(state, object, { tapped: true });
  const e = event('object_tapped', { objectId, playerId });
  state.events.push(e);
  return updated;
}

/** Czy permanent nie może się odkręcić z powodu aktywnej blokady (np. Lira). */
function isUntapLocked(state, object) {
  return (object.untapLockedBy ?? []).some((sourceId) => {
    const source = state.objects.get(sourceId);
    return source && source.zone === 'battlefield' && source.tapped;
  });
}

export function untapObject(state, objectId, playerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nie można untapować tego obiektu');
  if (!object.tapped) return object;
  if (isUntapLocked(state, object)) return object;
  const updated = replaceObject(state, object, { tapped: false });
  state.events.push(event('object_untapped', { objectId, playerId }));
  return updated;
}

export function untapControlled(state, playerId) {
  const untapped = [];
  for (const object of state.objects.values()) {
    if (object.zone === 'battlefield' && object.controllerId === playerId && (object.tapped || object.summoningSickness)) {
      // Zablokowane stworzenie (np. przez Entrancing Lyre) nie odkręca się;
      // choroba atakowa (summoning sickness) też znika tylko przy odkręceniu.
      if (object.tapped && isUntapLocked(state, object)) continue;
      const updated = replaceObject(state, object, { tapped: false, summoningSickness: false });
      untapped.push(updated);
      state.events.push(event('object_untapped', { objectId: object.id, playerId }));
    }
  }
  return untapped;
}

/**
 * Efektywne statystyki stwora = baza + modyfikatory ciągłe (pump do cleanup)
 * + liczniki +1/+1 + buffy załączników (aury bestow, czyste aury, equipmenty;
 * CR 613 w minimalnym wymiarze: jedna warstwa efektów „+N/+N i keywordy"
 * z deskryptorów załączników).
 * Stwór zagrany twarzą w dół (morph/megamorph) ma bazę 2/2, dopóki nie
 * zostanie obrócony. `state` potrzebny jest do zliczenia załączników — bez
 * niego funkcja zachowuje dawną sygnaturę (bez buffów); miejsca mechaniczne
 * (combat, SBA, PlayerView, koszty {X}) zawsze przekazują stan.
 */
function attachmentBonuses(state, object) {
  if (!state || object.zone !== 'battlefield' || object.kind !== 'creature') return { power: 0, toughness: 0, keywords: [] };
  const bonus = { power: 0, toughness: 0, keywords: [] };
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const grant = attachmentGrant(attachment);
    bonus.power += grant.power;
    bonus.toughness += grant.toughness;
    bonus.keywords.push(...grant.keywords);
  }
  return bonus;
}

export function effectivePower(object, state = null) {
  if (object.power === null) return null;
  const base = object.faceDown ? 2 : object.power;
  return base + (object.powerModifier ?? 0) + ((object.counters ?? {})['+1/+1'] ?? 0) + attachmentBonuses(state, object).power;
}

export function effectiveToughness(object, state = null) {
  if (object.toughness === null) return null;
  const base = object.faceDown ? 2 : object.toughness;
  return base + (object.toughnessModifier ?? 0) + ((object.counters ?? {})['+1/+1'] ?? 0) + attachmentBonuses(state, object).toughness;
}

/**
 * Efektywne keywordy obiektu = własne + tymczasowe „do końca tury"
 * (keywordGrants — np. backup, CR 702.165a) + nadane przez załączniki.
 */
export function effectiveKeywords(object, state = null) {
  const base = [...(object.keywords ?? [])];
  for (const keyword of [...(object.keywordGrants ?? []), ...attachmentBonuses(state, object).keywords]) {
    if (!base.includes(keyword)) base.push(keyword);
  }
  return base;
}

/**
 * Obraca permanent twarzą do góry (morph/megamorph): wraca do bazowych
 * statystyk karty i dostaje ewentualne liczniki (megamorph kładzie +1/+1).
 * Obiekt nie zmienia strefy, więc obrażenia i modyfikatory pozostają.
 */
export function turnFaceUp(state, objectId, counters = {}) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || !object.faceDown) throw new Error('Obrócić twarzą do góry można tylko face-down permanent');
  replaceObject(state, object, { faceDown: false });
  state.events.push(event('object_flipped', { objectId }));
  let updated = state.objects.get(objectId);
  for (const [name, amount] of Object.entries(counters)) {
    updated = addCounter(state, objectId, name, amount);
  }
  return updated;
}

/** Dodaje modyfikatory statystyk (np. efekt pump); zeruje się w cleanup. */
export function modifyStats(state, objectId, { power = 0, toughness = 0 }) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error('Modyfikować można tylko stwora na battlefield');
  if (!Number.isInteger(power) || !Number.isInteger(toughness)) throw new TypeError('Modyfikatory muszą być całkowite');
  const updated = replaceObject(state, object, {
    powerModifier: object.powerModifier + power,
    toughnessModifier: object.toughnessModifier + toughness,
  });
  state.events.push(event('stats_modified', {
    objectId, powerModifier: updated.powerModifier, toughnessModifier: updated.toughnessModifier,
  }));
  return updated;
}

export function markDamage(state, objectId, amount) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel obrażeń');
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
  const updated = replaceObject(state, object, { damage: object.damage + amount });
  state.events.push(event('damage_marked', { objectId, amount, total: updated.damage }));
  return updated;
}

export function clearMarkedDamage(state) {
  for (const object of state.objects.values()) {
    if (object.damage > 0 && object.zone === 'battlefield') replaceObject(state, object, { damage: 0 });
  }
}

/** Cleanup kończy też modyfikacje „do końca tury" i tymczasowe keywordy. */
export function clearStatModifiers(state) {
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    if (object.powerModifier !== 0 || object.toughnessModifier !== 0 || (object.keywordGrants ?? []).length > 0) {
      replaceObject(state, object, { powerModifier: 0, toughnessModifier: 0, keywordGrants: [] });
    }
  }
}

/**
 * Nadaje stworowi keywordy „do końca tury" (np. backup, CR 702.165a) —
 * czyszczone w cleanup przez clearStatModifiers. Zwraca obiekt po zmianie.
 */
export function grantKeywordsUntilEndOfTurn(state, objectId, keywords) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error('Tymczasowe keywordy można nadawać tylko stworowi na bitwisku');
  if (!Array.isArray(keywords) || keywords.some((k) => typeof k !== 'string' || !k)) throw new TypeError('Keywordy muszą być niepustymi napisami');
  const grants = [...new Set([...(object.keywordGrants ?? []), ...keywords])];
  const updated = replaceObject(state, object, { keywordGrants: grants });
  state.events.push(event('keyword_granted', {
    objectId, cardId: object.cardId, keywords: [...keywords], untilEndOfTurn: true,
  }));
  return updated;
}
