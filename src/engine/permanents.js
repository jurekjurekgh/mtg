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
/**
 * Statyczne zdolności warunkowe (CR 604.3): deskryptor
 * `{ type: 'static', condition, pump, keywords }` daje buff, dopóki warunek
 * jest spełniony — nie jest to efekt „do końca tury", tylko ciągła własność
 * przeliczana przy każdym odczycie statystyk (Evangel of Synthesis: „as long
 * as you've drawn two or more cards this turn").
 */
function staticConditionHolds(state, object, condition) {
  if (!condition) return true;
  if (condition.minCardsDrawnThisTurn != null) {
    const drawn = (state?.cardsDrawnThisTurn ?? {})[object.controllerId] ?? 0;
    return drawn >= condition.minCardsDrawnThisTurn;
  }
  if (condition.minLandsControlled != null) {
    const lands = [...(state?.objects?.values?.() ?? [])].filter((candidate) => candidate.zone === 'battlefield'
      && candidate.controllerId === object.controllerId
      && (candidate.kind === 'land' || (candidate.types ?? []).includes('Land'))).length;
    return lands >= condition.minLandsControlled;
  }
  return false;
}

function staticBonuses(state, object) {
  const bonus = { power: 0, toughness: 0, keywords: [] };
  if (!state || object.zone !== 'battlefield' || object.faceDown) return bonus;
  for (const ability of object.abilities ?? []) {
    if (ability?.type !== 'static') continue;
    if (!staticConditionHolds(state, object, ability.condition)) continue;
    bonus.power += ability.pump?.power ?? 0;
    bonus.toughness += ability.pump?.toughness ?? 0;
    bonus.keywords.push(...(ability.keywords ?? []));
  }
  return bonus;
}

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

/**
 * Wpływ liczników na statystyki (CR 122.1c/613.4c): +1/+1 podnosi obie
 * wartości, -1/-1 obniża. Liczniki -1/-1 weszły z persist (Puppeteer Clique).
 */
function counterDelta(object) {
  const counters = object.counters ?? {};
  return (counters['+1/+1'] ?? 0) - (counters['-1/-1'] ?? 0);
}

export function effectivePower(object, state = null) {
  if (object.power === null) return null;
  const base = object.faceDown ? 2 : object.power;
  return base + (object.powerModifier ?? 0) + counterDelta(object)
    + attachmentBonuses(state, object).power + staticBonuses(state, object).power;
}

export function effectiveToughness(object, state = null) {
  if (object.toughness === null) return null;
  const base = object.faceDown ? 2 : object.toughness;
  return base + (object.toughnessModifier ?? 0) + counterDelta(object)
    + attachmentBonuses(state, object).toughness + staticBonuses(state, object).toughness;
}

/**
 * Efektywne zdolności obiektu = własne + nadane „do końca tury"
 * (abilityGrants — np. Fake Your Own Death nadaje stworowi trigger dies).
 * Triggery i legalne aktywacje czytają zawsze tę listę, nie object.abilities.
 */
export function effectiveAbilities(object) {
  const grants = object?.abilityGrants ?? [];
  if (grants.length === 0) return object?.abilities ?? [];
  return [...(object.abilities ?? []), ...grants];
}

/**
 * Efektywne podtypy = własne + tymczasowa zmiana typu (Unstable Frontier:
 * „target land you control becomes the basic land type of your choice until
 * end of turn" — CR 205.1a/305.7: nowy typ ZASTĘPUJE dotychczasowe typy
 * podstawowe landa).
 */
export function effectiveSubtypes(object) {
  const grant = object?.typeGrant;
  if (!grant) return object?.subtypes ?? [];
  const basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  const kept = (object.subtypes ?? []).filter((subtype) => !basics.includes(subtype));
  return [...kept, ...grant.subtypes];
}

/**
 * Efektywne keywordy obiektu = własne + tymczasowe „do końca tury"
 * (keywordGrants — np. backup, CR 702.165a) + nadane przez załączniki.
 */
export function effectiveKeywords(object, state = null) {
  const base = [...(object.keywords ?? [])];
  for (const keyword of [
    ...(object.keywordGrants ?? []),
    ...attachmentBonuses(state, object).keywords,
    ...staticBonuses(state, object).keywords,
  ]) {
    if (!base.includes(keyword)) base.push(keyword);
  }
  // Hexproof „do twojej następnej tury" (Throne of the Dead Three): trwa przez
  // turę przeciwnika i gaśnie z początkiem następnej tury kontrolera — to NIE
  // grant czyszczony w cleanup, tylko licznik tur.
  if (object.hexproofUntilTurn != null && state && state.turn.number < object.hexproofUntilTurn) {
    if (!base.includes('hexproof')) base.push('hexproof');
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
    const dirty = object.powerModifier !== 0 || object.toughnessModifier !== 0
      || (object.keywordGrants ?? []).length > 0
      || (object.abilityGrants ?? []).length > 0
      || object.typeGrant != null
      || object.goaded === true;
    if (dirty) {
      replaceObject(state, object, {
        powerModifier: 0, toughnessModifier: 0, keywordGrants: [],
        abilityGrants: [], typeGrant: null,
        // Goad (CR 701.38) trwa do końca tury — cleanup zdejmuje znacznik.
        goaded: false,
      });
    }
  }
}

/**
 * Nadaje stworowi zdolności „do końca tury" (Fake Your Own Death: trigger
 * „when this creature dies…"). Deskryptory są generyczne (createAbility),
 * a czyszczenie idzie tą samą ścieżką co pump i keywordy — cleanup.
 */
export function grantAbilitiesUntilEndOfTurn(state, objectId, abilities) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error('Zdolności do końca tury można nadawać tylko stworowi na bitwisku');
  if (!Array.isArray(abilities) || abilities.length === 0) throw new TypeError('Lista nadawanych zdolności nie może być pusta');
  const grants = [...(object.abilityGrants ?? []), ...abilities.map((ability) => Object.freeze({ ...ability }))];
  return replaceObject(state, object, { abilityGrants: Object.freeze(grants) });
}

/**
 * Tymczasowa zmiana typu podstawowego landa (Unstable Frontier) — do końca
 * tury; czyszczona w cleanup razem z pozostałymi grantami.
 */
export function grantBasicLandTypeUntilEndOfTurn(state, objectId, subtype) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || !((object.types ?? []).includes('Land') || object.kind === 'land')) {
    throw new Error('Typ podstawowy można nadać tylko landowi na bitwisku');
  }
  if (typeof subtype !== 'string' || !subtype) throw new TypeError('Typ podstawowy musi być napisem');
  const updated = replaceObject(state, object, { typeGrant: Object.freeze({ subtypes: Object.freeze([subtype]) }) });
  state.events.push(event('land_type_changed', { objectId, cardId: object.cardId, subtype, untilEndOfTurn: true }));
  return updated;
}

/**
 * Goad (CR 701.38): do końca tury stwór musi atakować w każdym combacie,
 * jeśli tylko może (loch Undercity — pokój Arena). Znacznik zdejmuje cleanup
 * (clearStatModifiers). Zwraca obiekt po zmianie.
 */
export function goadUntilEndOfTurn(state, objectId, sourceControllerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') {
    throw new Error('Goadować można tylko stwora na bitwisku');
  }
  if (object.goaded) return object;
  const updated = replaceObject(state, object, { goaded: true });
  state.events.push(event('object_goaded', { objectId, cardId: object.cardId, byPlayerId: sourceControllerId, untilEndOfTurn: true }));
  return updated;
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
