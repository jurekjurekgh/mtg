import { event } from '../protocol/types.js';
import { assertZone } from './zones.js';
import { addCounter, removeCounter } from './counters.js';
import { attachmentGrant, attachmentsAttachedTo, effectiveProtectionFromColors } from './attachments.js';

export function replaceObject(state, object, patch) {
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
    if (!source || source.zone !== 'battlefield') return false;
    // Lira: blokada działa, gdy źródło jest zatapnięte.
    if (source.tapped) return true;
    // Aura lock (Spectral Prison): blokada działa zawsze, gdy źródło jest
    // załączoną aurą na bitwisku (nie wymaga tapped).
    if (source.kind === 'aura' && source.attachedTo) return true;
    return false;
  });
}

/**
 * Czy obiekt jest źródłem aktywnej blokady untap (np. Entrancing Lyre).
 * „You may choose not to untap" — deterministycznie nie odkręcamy obiektu,
 * który blokuje innego, żeby blokada nie wygasła.
 */
function isActiveLockSource(state, objectId) {
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    if ((object.untapLockedBy ?? []).includes(objectId)) return true;
  }
  return false;
}

export function untapObject(state, objectId, playerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) throw new Error('Nie można untapować tego obiektu');
  if (!object.tapped) return object;
  if (isUntapLocked(state, object)) return object;
  // Stun counters (Lodestone Needle): jeśli permanent ma liczniki stun,
  // zamiast odkręcenia zdejmij jeden licznik stun (CR 122.1b).
  if ((object.counters ?? {}).stun > 0) {
    removeCounter(state, objectId, 'stun', 1);
    return state.objects.get(objectId);
  }
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
      // „You may choose not to untap" (Entrancing Lyre): obiekt będący
      // źródłem aktywnej blokady nie odkręca się — deterministycznie
      // zawsze wybieramy „nie odkręcaj", żeby blokada nie wygasła.
      if (object.tapped && isActiveLockSource(state, object.id)) continue;
      // Wavecrash Triton (CR): „doesn't untap during its controller's next
      // untap step" — jednorazowa flaga zużywana przy tym untap (obiekt
      // zostaje zatapnięty, flaga zniknie, więc następny untap odkręci).
      if (object.tapped && object.dontUntapNextUntapStep === playerId) {
        replaceObject(state, object, { dontUntapNextUntapStep: null });
        continue;
      }
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
  // Crew Captain: „has indestructible as long as it entered this turn".
  // Flaga enteredOnTurn (numer tury wejścia) — NIE summoning sickness:
  // kradzież/zmiana kontroli nakłada SS (CR 302.6) bez wejścia na bitwisko.
  if (condition.enteredThisTurn) return object.enteredOnTurn === state?.turn?.number;
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
  // Esper Stormblade: „As long as you control another multicolored permanent".
  // Multicolored = permanent z co najmniej dwoma kolorami (colors.length >= 2);
  // „another" wyklucza samo źródło.
  if (condition.controlsAnotherMulticolored) {
    return [...(state?.objects?.values?.() ?? [])].some((candidate) => candidate.zone === 'battlefield'
      && candidate.id !== object.id
      && candidate.controllerId === object.controllerId
      && (candidate.colors ?? []).length >= 2);
  }
  // „... as long as it has a +1/+1 counter on it\" (Ainok Artillerist, warunek
  // generyczny na dowolny licznik): źródło musi mieć co najmniej jeden licznik
  // o podanej nazwie (np. { hasCounter: '+1/+1' }).
  if (condition.hasCounter != null) {
    return (object.counters?.[condition.hasCounter] ?? 0) > 0;
  }
  // „As long as there are four or more creature cards in your graveyard\"
  // (Gray Slaad — menace i deathtouch): liczba KART-stworów (nie tokenów)
  // w grobie kontrolera źródła.
  if (condition.minCreatureCardsInGraveyard != null) {
    let count = 0;
    for (const objectId of state.zones.graveyard) {
      const candidate = state.objects.get(objectId);
      if (!candidate || candidate.controllerId !== object.controllerId) continue;
      if (candidate.name != null) continue; // tokeny nie są kartami
      if (candidate.kind === 'creature' || (candidate.types ?? []).includes('Creature')) count += 1;
    }
    return count >= condition.minCreatureCardsInGraveyard;
  }
  // Ramroller: „as long as you control another artifact\" — dowolny inny
  // artefakt kontrolera źródła (także artefaktowy stwór czy equipment);
  // „another\" wyklucza samo źródło.
  if (condition.controlsAnotherArtifact) {
    return [...(state?.objects?.values?.() ?? [])].some((candidate) => candidate.zone === 'battlefield'
      && candidate.id !== object.id
      && candidate.controllerId === object.controllerId
      && (candidate.kind === 'artifact' || (candidate.types ?? []).includes('Artifact')));
  }
  // Carapace Forger — Metalcraft (CR 702.80): trzy lub więcej artefaktów.
  if (condition.minArtifactsControlled != null) {
    const count = [...(state?.objects?.values?.() ?? [])].filter((c) => c.zone === 'battlefield'
      && c.controllerId === object.controllerId
      && (c.kind === 'artifact' || (c.types ?? []).includes('Artifact'))).length;
    return count >= condition.minArtifactsControlled;
  }
  // Kabira Vindicator — Level counters (CR 702.86)
  if (condition.minLevel != null || condition.maxLevel != null) {
    const level = object.counters?.level ?? 0;
    if (condition.minLevel != null && level < condition.minLevel) return false;
    if (condition.maxLevel != null && level > condition.maxLevel) return false;
    return true;
  }
  return false;
}

/**
 * Liczba RÓŻNYCH typów kart wśród kart we WSZYSTKICH grobach (Tarmogoyf —
 * token Disy the Restless; wariant graveyardCardTypeCount liczący jednego
 * gracza). Tokeny nie są kartami (name ustawione) i się nie liczą.
 */
const ALL_GRAVEYARD_CARD_TYPES = Object.freeze([
  'Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment',
  'Instant', 'Kindred', 'Land', 'Phenomenon', 'Plane', 'Planeswalker',
  'Scheme', 'Sorcery', 'Tribal', 'Vanguard',
]);
export function allGraveyardsCardTypeCount(state) {
  const present = new Set();
  for (const objectId of state.zones.graveyard) {
    const object = state.objects.get(objectId);
    if (!object || object.name != null) continue;
    for (const type of object.types ?? []) {
      if (ALL_GRAVEYARD_CARD_TYPES.includes(type)) present.add(type);
    }
  }
  return present.size;
}

/**
 * Emissary Escort: „This creature gets +X/+0, where X is the greatest mana
 * value among other artifacts you control." Największa mana value wśród
 * artefaktów kontrolera źródła, z wyłączeniem samego źródła.
 */
function greatestManaAmongOtherArtifacts(state, object) {
  let max = 0;
  for (const candidate of state.objects.values()) {
    if (candidate.zone !== 'battlefield' || candidate.id === object.id) continue;
    if (candidate.controllerId !== object.controllerId) continue;
    const isArtifact = candidate.kind === 'artifact' || (candidate.types ?? []).includes('Artifact');
    if (!isArtifact) continue;
    max = Math.max(max, candidate.manaCost ?? 0);
  }
  return max;
}

function staticBonuses(state, object) {
  const bonus = { power: 0, toughness: 0, keywords: [] };
  if (!state || object.zone !== 'battlefield' || object.faceDown) return bonus;
  for (const ability of object.abilities ?? []) {
    if (ability?.type !== 'static') continue;
    // Zdolności hymnowe ze scope (Trostani — „other creatures you control")
    // NIE buffują samego źródła — obsługuje je anthemBonuses na INNYCH obiektach.
    if (ability.scope) continue;
    if (!staticConditionHolds(state, object, ability.condition)) continue;
    // Dynamiczny pump (np. Emissary Escort): `power` bywa markerem zamiast
    // liczbą — wartość liczona z planszy, nie stała w definicji (CR 604.3).
    let power = ability.pump?.power ?? 0;
    if (power === 'greatest_mana_among_other_artifacts') {
      power = greatestManaAmongOtherArtifacts(state, object);
    }
    // Necrosquito (ONE): „This creature gets +1/+1 for each oil counter on
    // it." — dynamiczny pump liczony z liczników oil obiektu (CR 604.3).
    if (power === 'oil_counters') {
      power = (object.counters ?? {})['oil'] ?? 0;
    }
    // Tarmogoyf (token Disy the Restless): „power is equal to the number of
    // card types among cards in ALL graveyards, toughness = that number + 1".
    if (power === 'card_types_in_all_graveyards') {
      power = allGraveyardsCardTypeCount(state);
    }
    let toughness = ability.pump?.toughness ?? 0;
    if (toughness === 'card_types_in_all_graveyards_plus_1') {
      toughness = allGraveyardsCardTypeCount(state) + 1;
    }
    if (toughness === 'oil_counters') {
      toughness = (object.counters ?? {})['oil'] ?? 0;
    }
    bonus.power += power;
    bonus.toughness += toughness;
    bonus.keywords.push(...(ability.keywords ?? []));
  }
  return bonus;
}

/**
 * Hymn (Trostani Discordant, CR 604): zdolności statyczne ZE WSKAZANIEM
 * zasięgu (`scope.affects === 'other_creatures_you_control'`) buffują INNE
 * obiekty spełniające predykat — tu: inne stwory kontrolera źródła hymnówki.
 * Liczone przy każdym odczycie statystyk, jak staticBonuses, ale iterujące
 * po permanentach-źródłach, nie po zdolnościach samego obiektu.
 */
function anthemBonuses(state, object) {
  const bonus = { power: 0, toughness: 0, keywords: [] };
  if (!state || object.zone !== 'battlefield' || object.faceDown) return bonus;
  if (object.kind !== 'creature') return bonus;
  for (const source of state.objects.values()) {
    if (source.zone !== 'battlefield') continue;
    for (const ability of source.abilities ?? []) {
      if (ability?.type !== 'static' || !ability.scope) continue;
      // Altar of the Goyf: „Lhurgoyf creatures you control have trample." —
      // scope na PODTYP (affects 'creatures_with_subtype', scope.subtype).
      const subtypeScope = ability.scope.affects === 'creatures_with_subtype';
      const creatureAffects = ability.scope.affects === 'other_creatures_you_control'
        || ability.scope.affects === 'all_creatures_you_control';
      if (!creatureAffects && !subtypeScope) continue;
      if (subtypeScope && !(object.subtypes ?? []).includes(ability.scope.subtype)) continue;
      // 'other_creatures_you_control' excludes the source itself; 'all_creatures_you_control' includes it.
      if (ability.scope.affects === 'other_creatures_you_control' && source.id === object.id) continue;
      if (source.controllerId !== object.controllerId) continue;
      if (!staticConditionHolds(state, source, ability.condition)) continue;
      bonus.power += ability.pump?.power ?? 0;
      bonus.toughness += ability.pump?.toughness ?? 0;
      bonus.keywords.push(...(ability.keywords ?? []));
    }
  }
  return bonus;
}

/**
 * Ograniczenia nakładane przez załączniki (aury/equipment) na gospodarza
 * (Hobble: „Enchanted creature can't attack. Enchanted creature can't block
 * if it's black."). Deskryptor `cantAttack` (bool) blokuje deklarację ataku;
 * `cantBlock` — bool (zawsze) albo warunek { hostHasColor } oceniany przy
 * odczycie względem kolorów gospodarza. Liczone przy każdym odczycie —
 * odłączenie aury znosi ograniczenie natychmiast (bez cleanupu).
 */
export function attachmentRestrictions(state, object) {
  const restrictions = { cantAttack: false, cantBlock: false };
  if (!state || object.zone !== 'battlefield' || object.kind !== 'creature') return restrictions;
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const descriptor = attachment.aura ?? attachment.equipment ?? null;
    if (!descriptor) continue;
    if (descriptor.cantAttack) restrictions.cantAttack = true;
    // Batch 23: Vow of Wildness — "can't attack you or planeswalkers you control"
    // W 1v1: jeśli aura zaczarowuje stwora przeciwnika, ten stwór nie może
    // atakować kontrolera aury (you). Sprawdzamy: aura controller != creature
    // controller → cantAttack.
    if (descriptor.cantAttackYou) {
      if (attachment.controllerId !== object.controllerId) {
        // W 1v1 jedyny legalny atak to na kontrolera aury, więc blokujemy.
        // W multiplayer wystarczyłoby sprawdzać defendingPlayer, ale w naszym
        // silniku 1v1 ataki są zawsze na przeciwnika, więc nie ma wyboru.
        restrictions.cantAttack = true;
      }
    }
    const cantBlock = descriptor.cantBlock;
    if (cantBlock === true) {
      restrictions.cantBlock = true;
    } else if (cantBlock && typeof cantBlock === 'object') {
      if (cantBlock.hostHasColor && (object.colors ?? []).includes(cantBlock.hostHasColor)) {
        restrictions.cantBlock = true;
      }
    }
  }
  return restrictions;
}

function attachmentBonuses(state, object) {
  if (!state || object.zone !== 'battlefield' || object.kind !== 'creature') return { power: 0, toughness: 0, keywords: [] };
  const bonus = { power: 0, toughness: 0, keywords: [] };
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const grant = attachmentGrant(attachment);
    bonus.power += grant.power;
    bonus.toughness += grant.toughness;
    bonus.keywords.push(...grant.keywords);

    // Conditional keywords (Hunter's Blowgun): different keywords granted
    // based on whose turn it is (evaluated at read time with game state).
    for (const ck of (grant.conditionalKeywords ?? [])) {
      const cond = ck.condition ?? {};
      let active = false;
      if (cond.activePlayerIsController === true) {
        active = state.turn.activePlayerId === object.controllerId;
      } else if (cond.activePlayerIsController === false) {
        active = state.turn.activePlayerId !== object.controllerId;
      }
      if (active) bonus.keywords.push(...ck.keywords);
    }
  }
  return bonus;
}

/**
 * Wpływ liczników na statystyki (CR 122.1c/613.4c): +1/+1 podnosi obie
 * wartości, -1/-1 obniża. Liczniki -1/-1 weszły z persist (Puppeteer Clique).
 */
function counterDelta(object) {
  const counters = object.counters ?? {};
  // Audyt PR #41 (B5): sam licznik oil NIE daje +1/+1 — daje go dopiero
  // zdolność Necrosquito („This creature gets +1/+1 for each oil counter on
  // it.", statyczny pump oil_counters w staticBonuses). Generyczne dodawanie
  // oil do P/T każdego obiektu byłoby nadmierną generalizacją (CR 122.1c —
  // liczniki P/T to tylko +1/+1 i -1/-1).
  return (counters['+1/+1'] ?? 0) - (counters['-1/-1'] ?? 0);
}

/** Ciągłe buffy „do końca tury" (CR 611.2c — patrz state.untilEndOfTurnBuffs):
 *  czytane przy każdym odczycie statystyk — obejmują też obiekty, które
 *  weszły na bitwisko PO rozstrzygnięciu efektu (Hysterical Blindness,
 *  Turn the Tide, Angel of the Dawn, Your Temple). */
function untilEndOfTurnBonuses(state, object) {
  if (!state || !object || object.zone !== 'battlefield' || object.kind !== 'creature') {
    return { power: 0, toughness: 0, keywords: [] };
  }
  const out = { power: 0, toughness: 0, keywords: [] };
  for (const buff of state.untilEndOfTurnBuffs ?? []) {
    // Buff TYLKO jednego obiektu (Altar of the Goyf — atakujący samotnie):
    // buff.objectId ogranicza do wskazanego obiektu; inaczej buff globalny.
    if (buff.objectId != null && buff.objectId !== object.id) continue;
    const applies = buff.opponent
      ? object.controllerId !== buff.controllerId
      : object.controllerId === buff.controllerId;
    if (!applies) continue;
    out.power += buff.power ?? 0;
    out.toughness += buff.toughness ?? 0;
    out.keywords.push(...(buff.keywords ?? []));
  }
  return out;
}

export function effectivePower(object, state = null) {
  if (object.power === null) return null;
  const base = object.faceDown ? 2 : object.power;
  return base + (object.powerModifier ?? 0) + counterDelta(object)
    + attachmentBonuses(state, object).power + staticBonuses(state, object).power
    + anthemBonuses(state, object).power
    + untilEndOfTurnBonuses(state, object).power;
}

export function effectiveToughness(object, state = null) {
  if (object.toughness === null) return null;
  const base = object.faceDown ? 2 : object.toughness;
  return base + (object.toughnessModifier ?? 0) + counterDelta(object)
    + attachmentBonuses(state, object).toughness + staticBonuses(state, object).toughness
    + anthemBonuses(state, object).toughness
    + untilEndOfTurnBonuses(state, object).toughness;
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

/** Podtypy nadane gospodarzowi przez załączniki (np. Warrior's Sword: „is a
 *  Warrior in addition to its other types"). Wymaga stanu (read-time). */
export function attachmentSubtypes(state, object) {
  if (!state || object.zone !== 'battlefield' || object.kind !== 'creature') return [];
  const out = [];
  for (const attachment of attachmentsAttachedTo(state, object.id)) {
    const grant = attachmentGrant(attachment);
    out.push(...(grant.subtypes ?? []));
  }
  return out;
}

/** Efektywne podtypy stwora na bitwisku — własne + granty załączników. */
export function effectiveSubtypesOnBattlefield(state, object) {
  const own = object?.subtypes ?? [];
  const granted = attachmentSubtypes(state, object);
  return [...new Set([...own, ...granted])];
}

/**
 * Efektywne keywordy obiektu = własne + tymczasowe „do końca tury"
 * (keywordGrants — np. backup, CR 702.165a) + nadane przez załączniki.
 */
export function effectiveKeywords(object, state = null) {
  // CR 708.2a — face-down permanent (morph/megamorph) ma TYLKO cechy, które
  // sam określa: 2/2, bez nazwy, bez zdolności i bez keywordów. Keywordy
  // karty są zakryte, dopóki stwór nie zostanie odsłonięty (turnFaceUp
  // czyta oryginalne `keywords` z obiektu — pole niezmieniane). Bez tego
  // zakryty stwór z flying błędnie odblokowywałby Lurking Green Dragon
  // („defending player controls a creature with flying") i mógł blokować
  // flyery — audyt Batchu 26 (M65).
  if (object.faceDown) {
    // Audyt PR #41 (B4): CR 708.2a tłumi DRUKOWANE keywordy/zdolności
    // zakrytego stwora (morph/cloak) — ale nie liczniki nadające zdolności
    // (CR 122.1b). Ruling cloak/Veiled Ascension: „Other effects that apply
    // to the permanent can still grant it any characteristics it doesn't
    // have." Licznik flying na zakrytym stworze daje flying — to sedno
    // Veiled Ascension (zakryte stwory mogą blokować flyery).
    const counterKeywords = [];
    if ((object.counters ?? {}).flying > 0) counterKeywords.push('flying');
    if ((object.counters ?? {}).deathtouch > 0) counterKeywords.push('deathtouch');
    if ((object.counters ?? {}).lifelink > 0) counterKeywords.push('lifelink');
    return counterKeywords;
  }
  const base = [...(object.keywords ?? [])];
  for (const keyword of [
    ...(object.keywordGrants ?? []),
    ...attachmentBonuses(state, object).keywords,
    ...staticBonuses(state, object).keywords,
    ...anthemBonuses(state, object).keywords,
    ...untilEndOfTurnBonuses(state, object).keywords,
  ]) {
    if (!base.includes(keyword)) base.push(keyword);
  }
  // Hexproof „do twojej następnej tury" (Throne of the Dead Three): trwa przez
  // turę przeciwnika i gaśnie z początkiem następnej tury kontrolera — to NIE
  // grant czyszczony w cleanup, tylko licznik tur.
  if (object.hexproofUntilTurn != null && state && state.turn.number < object.hexproofUntilTurn) {
    if (!base.includes('hexproof')) base.push('hexproof');
  }
  // Licznik deathtouch (Kappa Tech-Wrecker): permanent z licznikiem deathtouch
  // ma keyword deathtouch (CR 122.1b — counters grant abilities).
  if ((object.counters ?? {}).deathtouch > 0) {
    if (!base.includes('deathtouch')) base.push('deathtouch');
  }
  // Licznik lifelink (Batch 24: Unbreakable Bond) — CR 122.1b, jak wyżej.
  if ((object.counters ?? {}).lifelink > 0) {
    if (!base.includes('lifelink')) base.push('lifelink');
  }
  // Licznik flying (Veiled Ascension, MKC) — face-down stwory dostają flying
  // counter; CR 122.1b (counters grant abilities), jak deathtouch/lifelink.
  if ((object.counters ?? {}).flying > 0) {
    if (!base.includes('flying')) base.push('flying');
  }
  // Station (EOE Spacecraft, Wedgelight Rammer): po osiągnięciu progu
  // liczników charge obiekt jest stworem i ma keywordy z deskryptora
  // („9+ | Flying, first strike\"). Liczone przy odczycie, jak static bonus.
  if (object.station && (object.counters?.charge ?? 0) >= object.station.threshold) {
    for (const keyword of object.station.keywords ?? []) {
      if (!base.includes(keyword)) base.push(keyword);
    }
  }
  // „Enchanted creature loses flying" (Grounded, CR 604/613): załącznik z
  // deskryptorem losesKeywords ODBIERA keywordy gospodarzowi. Warstwa
  // ostatnia — po wszystkich grantach (karta, liczniki, statyki, załączniki)
  // — więc odbiór wygrywa np. z buffem „gains flying" z innej aury.
  if (state && object.zone === 'battlefield') {
    const lost = new Set();
    for (const attachment of attachmentsAttachedTo(state, object.id)) {
      const descriptor = attachment.aura ?? attachment.equipment ?? null;
      for (const keyword of descriptor?.losesKeywords ?? []) lost.add(keyword);
    }
    if (lost.size > 0) return base.filter((keyword) => !lost.has(keyword));
  }
  return base;
}

/**
 * Protection from colors (CR 702.16): zwraca listę kolorów, przed którymi
 * obiekt jest chroniony — z pól obiektu (protectionFromColors) i z
 * załączników (aura z chosenColor). Nie modyfikuje zamrożonego obiektu.
 */
/**
 * Obraca permanent twarzą do góry (morph/megamorph): wraca do bazowych
 * statystyk karty i dostaje ewentualne liczniki (megamorph kładzie +1/+1).
 * Obiekt nie zmienia strefy, więc obrażenia i modyfikatory pozostają.
 */
export function turnFaceUp(state, objectId, counters = {}) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || !object.faceDown) throw new Error('Obrócić twarzą do góry można tylko face-down permanent');
  replaceObject(state, object, {
    faceDown: false,
    // Przywrócenie oryginalnych zdolności karty po obrocie (Batch 24 —
    // Willbender; face-down cast ukrył je pod flip-ability — patrz
    // resources.castPermanent). CR 702.36: obrót „odkrywa" kartę wraz
    // z jej zdolnościami.
    ...(Array.isArray(object.originalAbilities)
      ? { abilities: [...object.originalAbilities], originalAbilities: undefined }
      : {}),
  });
  state.events.push(event('object_flipped', { objectId }));
  // Batch 24 (Willbender): „When this creature is turned face up" — osobny
  // event dla triggerów reakcji na obrót (object_flipped jest ogólny).
  state.events.push(event('turned_face_up', { objectId, cardId: object.cardId }));
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

/**
 * Prewencja obrażeń „prevent all damage that would be dealt to ... this turn\"
 * (Ethersworn Shieldmage): wpisy w state.preventDamageThisTurn opisują filtr
 * celu generycznie ({ typesInclude, isCreature }); czyszczone w cleanup.
 * Zwraca true, gdy AKtywna prewencja skasowałaby obrażenia dla obiektu.
 */
export function isDamagePrevented(state, object) {
  if (!object || object.zone !== 'battlefield') return false;
  for (const filter of state.preventDamageThisTurn ?? []) {
    const typesOk = (filter.typesInclude ?? []).every((type) => (object.types ?? []).includes(type));
    const kindOk = !filter.isCreature || object.kind === 'creature' || (object.types ?? []).includes('Creature');
    if (typesOk && kindOk) return true;
  }
  return false;
}

/**
 * Tarcze prewencji „prevent the next N damage that would be dealt to any
 * target this turn" (Withstand, CR 615 w minimalnym wymiarze): wpisy w
 * state.damageShields to { targetId, remaining } — cel to gracz albo obiekt.
 * Każde zadanie obrażeń celowi najpierw zużywa tarczę (kolejność wpisów),
 * a zdarzenie damage_prevented trafia do strumienia. Zwraca liczbę
 * zapobiegniętych obrażeń (0, gdy tarczy brak). Czyste w cleanup.
 */
export function preventDamageTo(state, targetId, amount) {
  const shields = state.damageShields ?? [];
  if (shields.length === 0 || !Number.isInteger(amount) || amount <= 0) return 0;
  let prevented = 0;
  const remaining = [];
  for (const shield of shields) {
    if (prevented >= amount) {
      remaining.push(shield);
      continue;
    }
    if (shield.targetId !== targetId) {
      remaining.push(shield);
      continue;
    }
    const take = Math.min(shield.remaining, amount - prevented);
    prevented += take;
    if (shield.remaining > take) remaining.push({ ...shield, remaining: shield.remaining - take });
    if (take > 0) {
      state.events.push(event('damage_prevented', { target: targetId, amount: take, cardId: shield.sourceCardId ?? null, shield: true }));
    }
  }
  state.damageShields = remaining;
  return prevented;
}

/**
 * Czy obrażenia od źródła o danym kolorze są zapobiegane przez protection
 * celu (CR 702.16a — DEBT: D = damage prevention). Sprawdzamy kolory źródła
 * vs protection celu. Nie modyfikujemy zamrożonego obiektu.
 */
export function isDamagePreventedByProtection(state, target, source) {
  if (!target || !source || target.zone !== 'battlefield') return false;
  const protColors = effectiveProtectionFromColors(state, target);
  if (protColors.length === 0) return false;
  const sourceColors = source.colors ?? [];
  return sourceColors.some(c => protColors.includes(c));
}

export function markDamage(state, objectId, amount, sourceId = null) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel obrażeń');
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
  // Prewencja (CR 614): filtr „prevent all damage" — zamiast zaznaczyć
  // obrażenia emitujemy fakt ich skasowania.
  if (amount > 0 && isDamagePrevented(state, object)) {
    const prevented = event('damage_prevented', { objectId, amount, cardId: object.cardId });
    state.events.push(prevented);
    return object;
  }
  // Protection (CR 702.16a): obrażenia od źródła chronionego koloru
  // są zapobiegane.
  if (amount > 0 && sourceId) {
    const source = state.objects.get(sourceId);
    if (source && isDamagePreventedByProtection(state, object, source)) {
      const prevented = event('damage_prevented', { objectId, amount, cardId: object.cardId, protection: true });
      state.events.push(prevented);
      return object;
    }
  }
  const updated = replaceObject(state, object, { damage: object.damage + amount });
  state.events.push(event('damage_marked', { objectId, amount, total: updated.damage }));
  return updated;
}

export function clearMarkedDamage(state) {
  for (const object of state.objects.values()) {
    if ((object.damage > 0 || object.damagedByDeathtouch) && object.zone === 'battlefield') {
      replaceObject(state, object, { damage: 0, damagedByDeathtouch: false });
    }
  }
}

/** Cleanup kończy też modyfikacje „do końca tury" i tymczasowe keywordy. */
export function clearStatModifiers(state) {
  // Ciągłe buffy „do końca tury" (CR 611.2c) — czyścimy razem z resztą.
  state.untilEndOfTurnBuffs = [];
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    if (object.originalBeforeAnimation) {
      replaceObject(state, object, {
        kind: object.originalBeforeAnimation.kind,
        types: object.originalBeforeAnimation.types,
        subtypes: object.originalBeforeAnimation.subtypes,
        power: object.originalBeforeAnimation.power,
        toughness: object.originalBeforeAnimation.toughness,
        originalBeforeAnimation: null,
      });
    }
    const current = state.objects.get(object.id);
    const dirty = current.powerModifier !== 0 || current.toughnessModifier !== 0
      || (current.keywordGrants ?? []).length > 0
      || (current.abilityGrants ?? []).length > 0
      || current.typeGrant != null
      || current.cantBlock === true
      || current.cantBeBlocked === true;
    if (dirty) {
      replaceObject(state, current, {
        powerModifier: 0, toughnessModifier: 0, keywordGrants: [],
        abilityGrants: [], typeGrant: null,
        // „Can't block this turn\" (Panic Spellbomb) — cleanup zdejmuje.
        cantBlock: false, cantBeBlocked: false,
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
export function goadUntilNextTurn(state, objectId, sourceControllerId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') {
    throw new Error('Goadować można tylko stwora na bitwisku');
  }
  if (object.goaded) return object;
  // CR 701.38c: goad trwa do początku NASTĘPNEJ tury gracza, który goadował —
  // w 1v1 (tury naprzemienne) to turn.number + 2. Wcześniej goad wygasał
  // w cleanup TEJ SAMEJ tury („until end of turn") — zaczarowany stwór nie
  // musiał atakować w turze przeciwnika, co łamało całą mechanikę goadu
  // (pokoje lochu Forge/Arena). Wygaszenie na starcie tury: game-state.js.
  const updated = replaceObject(state, object, { goaded: true, goadedUntilTurn: state.turn.number + 2 });
  state.events.push(event('object_goaded', { objectId, cardId: object.cardId, byPlayerId: sourceControllerId }));
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

/**
 * Animuje permanent do końca tury (Silvanus's Invoker: land staje się
 * stworzeniem 8/8 z trample i haste, wciąż będąc landem).
 */
export function animatePermanentUntilEndOfTurn(state, objectId, { power, toughness, typesAdd = [], subtypesAdd = [], keywordsAdd = [], retainTypes = true }) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') return object;
  const originalBeforeAnimation = object.originalBeforeAnimation || {
    kind: object.kind,
    types: [...(object.types ?? [])],
    subtypes: [...(object.subtypes ?? [])],
    power: object.power,
    toughness: object.toughness,
  };
  const types = retainTypes ? [...new Set([...(object.types ?? []), ...typesAdd])] : [...typesAdd];
  const subtypes = retainTypes ? [...new Set([...(object.subtypes ?? []), ...subtypesAdd])] : [...subtypesAdd];
  const kind = types.includes('Creature') ? 'creature' : object.kind;
  const updated = replaceObject(state, object, {
    kind,
    types,
    subtypes,
    power,
    toughness,
    originalBeforeAnimation,
  });
  if (keywordsAdd.length > 0) {
    grantKeywordsUntilEndOfTurn(state, objectId, keywordsAdd);
  }
  state.events.push(event('permanent_animated', {
    objectId,
    cardId: object.cardId,
    power,
    toughness,
    types,
    subtypes,
    untilEndOfTurn: true,
  }));
  return updated;
}
