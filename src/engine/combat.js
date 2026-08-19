import { event } from '../protocol/types.js';
import { addPoisonCounters, changeLife } from './players.js';
import { addCounter } from './counters.js';
import { attachmentRestrictions, effectiveAbilities, effectiveKeywords, effectivePower, effectiveToughness, isDamagePrevented, isDamagePreventedByProtection, isProtectedFromSource, markDamage, markDealtDamageThisTurn, preventDamageTo, tapObject } from './permanents.js';
import { attachmentsAttachedTo } from './attachments.js';
import { effectiveProtectionFromColors } from './attachments.js';
import { runStateBasedActions } from './state-based.js';

function getCreature(state, id) {
  const object = state.objects.get(id);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nieprawidłowy creature object: ${id}`);
  return object;
}

const hasKeyword = (state, object, keyword) => effectiveKeywords(object, state).includes(keyword);

/**
 * Combat damage w gracza (niezablokowany atakujący, trample przez puste
 * bloki, nadmiar trample): tarcze prewencji (Withstand) redukują obrażenia,
 * a lifelink źródła (True Conviction) daje kontrolerowi zysk życia równy
 * obrażeniom ZADANYM (po prewencji). Infect zadaje znaczniki trucizny
 * zamiast utraty życia (CR 702.89) i też jest ograniczony prewencją.
 */
/** Inspire Awe (CR): „Prevent all combat damage this turn except by enchanted
 * creatures and enchantment creatures." Zwraca true, gdy obrażenia combat z
 * TEGO źródła mają być zapobiegnięte (źródło NIE jest zaczarowanym stworem
 * ani enchantment-creature). */
function isCombatDamagePreventedByInspire(state, source) {
  if (!state.preventCombatExceptEnchanted || !source) return false;
  if (source.kind !== 'creature' && !(source.types ?? []).includes('Creature')) return false;
  const isEnchantmentCreature = (source.types ?? []).includes('Enchantment');
  const isEnchanted = attachmentsAttachedTo(state, source.id).some((a) => a.kind === 'aura');
  return !isEnchantmentCreature && !isEnchanted;
}

function dealCombatDamageToPlayer(state, events, sourceId, targetPlayerId, amount) {
  const source = state.objects.get(sourceId);
  // CR 119.3: zapobiegnięte obrażenia NIE są zadane — zdarzenie damage_dealt
  // niesie kwotę FAKTYCZNIE zadaną (po prewencji tarcz Withstand itp.).
  // Poprzednio event niósł kwotę sprzed prewencji — log i triggery („deals
  // combat damage") widziały 4 obrażenia, gdy gracz tracił 1; przy w pełni
  // zapobiegniętym trafieniu trigger odpalał się mimo 0 zadanych obrażeń
  // (bug złotej odznaki — spójność ze ścieżką niecombat dealNonCombatDamage).
  const before = state.events.length;
  const inspireAmount = isCombatDamagePreventedByInspire(state, source) ? 0 : amount;
  const prevented = preventDamageTo(state, targetPlayerId, inspireAmount);
  const actual = inspireAmount - prevented;
  const damageEvent = event('damage_dealt', {
    source: sourceId, target: targetPlayerId, amount: actual, combat: true,
    sourceCardId: source?.cardId ?? null,
  });
  state.events.push(damageEvent);
  // Zdarzenia tarcz (damage_prevented) dołączamy do strumienia komendy.
  if (prevented > 0) events.push(...state.events.slice(before));
  if (hasKeyword(state, source, 'infect')) {
    events.push(damageEvent, ...addPoisonCounters(state, targetPlayerId, actual));
  } else if (actual > 0) {
    events.push(damageEvent, ...changeLife(state, targetPlayerId, -actual));
  } else {
    events.push(damageEvent);
  }
  if (actual > 0 && hasKeyword(state, source, 'lifelink')) {
    events.push(...changeLife(state, source.controllerId, actual));
  }
}

/**
 * „This creature attacks each combat if able\" (Ramroller, Juggernaut,
 * CR 508.1c): statyczny wymóg ataku — traktowany jak goad bez daty ważności,
 * czytany ze zdolności statycznych obiektu (deskryptor mustAttack).
 */
function hasMustAttack(object) {
  return effectiveAbilities(object).some((ability) => ability?.type === 'static' && ability.mustAttack);
}

/**
 * „This creature can't attack or block alone" (Ember Beast, CR 508.1d/509.1c
 * w minimalnym wymiarze): statyczne ograniczenie — stwór może być zadeklarowany
 * jako atakujący tylko, gdy RAZEM z nim atakuje co najmniej jeden inny stwór,
 * a jako blokujący — tylko, gdy tego samego atakującego blokuje też ktoś inny.
 * Czytane ze zdolności statycznych obiektu (deskryptory cantAttackAlone /
 * cantBlockAlone), jak mustAttack.
 */
function hasAloneRestriction(object, field) {
  return effectiveAbilities(object).some((ability) => ability?.type === 'static' && ability[field] === true);
}

function isLegalAttacker(state, object, playerId) {
  if (object?.controllerId !== playerId || object.kind !== 'creature' || object.tapped) return false;
  // Defender (CR 702.3): stwór z defender NIE może atakować.
  if (hasKeyword(state, object, 'defender')) return false;
  // „Enchanted creature can't attack" (Hobble): ograniczenie nakładane przez
  // załącznik, liczone przy odczycie — odłączenie aury znosi je natychmiast.
  if (attachmentRestrictions(state, object).cantAttack) return false;
  // Lurking Green Dragon (CLB): „can't attack unless defending player controls a creature with flying"
  // Sprawdzane jako statyczna zdolność `cantAttackUnlessDefenderHasFlying`.
  const hasRestriction = effectiveAbilities(object).some((ability) => ability?.type === 'static' && ability.cantAttackUnlessDefenderHasFlying);
  if (hasRestriction) {
    const defendingPlayerId = state.players.find((p) => p.id !== playerId)?.id;
    if (defendingPlayerId) {
      const hasFlyer = [...state.objects.values()].some((candidate) => candidate.zone === 'battlefield'
        && candidate.controllerId === defendingPlayerId
        && candidate.kind === 'creature'
        && hasKeyword(state, candidate, 'flying'));
      if (!hasFlyer) return false;
    }
  }
  // Chained Throatseeker (NPH): „can't attack unless defending player is
  // poisoned" — gracz jest zatruty, gdy ma co najmniej jeden znacznik
  // trucizny (CR 122.1 + 704.5c). Statyczna zdolność, jak restrykcja
  // Lurking Green Dragon powyżej.
  const poisonRestriction = effectiveAbilities(object)
    .some((ability) => ability?.type === 'static' && ability.cantAttackUnlessDefenderPoisoned);
  if (poisonRestriction) {
    const defender = state.players.find((p) => p.id !== playerId);
    if (!defender || (defender.poison ?? 0) <= 0) return false;
  }
  // Haste (CR 702.10): stwór może atakować mimo choroby przywołania.
  if (object.summoningSickness && !hasKeyword(state, object, 'haste')) return false;
  return true;
}

export function declareAttackers(state, playerId, attackerIds) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_attackers') throw new Error('Nieprawidłowy krok deklaracji atakujących');
  if (state.turn.activePlayerId !== playerId) throw new Error('Nieaktywny gracz nie deklaruje atakujących');
  if (!Array.isArray(attackerIds) || new Set(attackerIds).size !== attackerIds.length) throw new Error('Atakujący nie może wystąpić więcej niż raz');
  const attackers = attackerIds.map((id) => getCreature(state, id));
  if (attackers.some((object) => !isLegalAttacker(state, object, playerId))) throw new Error('Nielegalny atakujący');
  // Wymuszeni atakujący (CR 701.38 goad + CR 508.1c „attacks each combat if
  // able\" — Ramroller): zdolny do ataku stwór z wymogiem musi być zadeklarowany
  // — deklaracja go pomijająca jest nielegalna.
  const mandatory = [...state.objects.values()].filter((object) => object.zone === 'battlefield'
    && object.controllerId === playerId
    && (object.goaded === true || hasMustAttack(object))
    && isLegalAttacker(state, object, playerId));
  const missing = mandatory.filter((object) => !attackerIds.includes(object.id));
  if (missing.length > 0) {
    throw new Error('Stwór z wymogiem ataku (goad lub „attacks each combat if able\") musi atakować w tym combacie');
  }
  // „Can't attack alone" (Ember Beast, CR 508.1d): stwór z tym ograniczeniem
  // może atakować wyłącznie w grupie — deklaracja bez innego atakującego jest
  // nielegalna (samotny atak tego stwora nie może obejść wymogu).
  if (attackers.length === 1 && attackers.some((object) => hasAloneRestriction(object, 'cantAttackAlone'))) {
    throw new Error('Stwór z „can\'t attack alone\" musi atakować z co najmniej jednym innym stworem');
  }
  for (const attacker of attackers) {
    // Vigilance: stwór nie tapuje się przy ataku.
    if (!hasKeyword(state, attacker, 'vigilance')) tapObject(state, attacker.id, playerId);
    // M67 (Homicidal Brute — tył Civilized Scholar): „if this creature didn't
    // attack this turn" — atakujący dostaje flagę (czyszczona w cleanup).
    const withFlag = state.objects.get(attacker.id);
    if (withFlag && withFlag.zone === 'battlefield') {
      state.objects.set(attacker.id, Object.freeze({ ...withFlag, attackedThisTurn: true }));
    }
  }
  state.combat = { attackingPlayerId: playerId, attackers: attackerIds.slice(), blockers: new Map(), blockedAttackers: new Set() };
  // M66 (C): zdarzenie niesie cardId każdego atakującego — log może nazwać
  // stwory także po tym, jak zginęły w SBA (stare ID znika z state.objects).
  const e = event('attackers_declared', {
    playerId, attackerIds: attackerIds.slice(),
    attackerCardIds: attackerIds.map((id) => state.objects.get(id)?.cardId ?? null),
  });
  state.events.push(e);
  return e;
}

export function declareBlockers(state, playerId, assignments) {
  if (state.turn.phase !== 'combat' || state.turn.step !== 'declare_blockers') throw new Error('Nieprawidłowy krok deklaracji blokujących');
  if (!state.combat) throw new Error('Brak deklaracji atakujących');
  if (state.combat.attackingPlayerId === playerId) throw new Error('Atakujący gracz nie deklaruje blokujących');
  const blockers = new Map();
  const usedBlockers = new Set();
  for (const [attackerId, blockerIds] of Object.entries(assignments)) {
    if (!state.combat.attackers.includes(attackerId)) throw new Error('Blokowanie nieistniejącego atakującego');
    const attacker = getCreature(state, attackerId);
    if (attacker.cantBeBlocked) throw new Error('Stwora z cantBeBlocked nie można blokować');
    const ids = blockerIds.map((id) => getCreature(state, id));
    // Dread Warlock: „can't be blocked except by black creatures".
    const blockColors = attackerBlockColorRestriction(state, attacker);
    if (blockColors && ids.some((b) => !((b.colors ?? []).some((c) => blockColors.includes(c))))) {
      throw new Error('Stwora z „can\'t be blocked except by [kolor]" może blokować tylko stwór tego koloru');
    }
    // Blazing Torch: „can't be blocked by Vampires or Zombies" — spójnie
    // z ofertą (canBlock), bo execute musi odrzucić złą komendę (L48).
    const blockSubtypes = attackerBlockSubtypeRestriction(state, attacker);
    if (blockSubtypes && ids.some((b) => blockSubtypes.some((sub) => (b.subtypes ?? []).includes(sub)))) {
      throw new Error('Stwora z „can\'t be blocked by [podtyp]" nie może blokować stwór tego podtypu');
    }
    // Landwalk (forestwalk): obrońca kontrolujący Forest nie może blokować.
    const landwalkSub = attackerLandwalkSubtype(state, attacker);
    if (landwalkSub && controlsLandWithSubtype(state, playerId, landwalkSub)) {
      throw new Error(`Stwora z landwalkiem (${landwalkSub}) nie może blokować obrońca z takim lądem`);
    }
    if (ids.some((object) => object.controllerId !== playerId || object.tapped)) throw new Error('Nielegalny blokujący');
    // Ograniczenia z załączników (Hobble: „can't block if it's black") —
    // walidacja niezależna od enumeracji (execute musi odrzucić zła komendę).
    if (ids.some((object) => object.cantBlock || attachmentRestrictions(state, object).cantBlock)) throw new Error('Nielegalny blokujący');
    // „Can't block alone" (Ember Beast, CR 509.1c): stwór może blokować tylko,
    // gdy tego samego atakującego blokuje też co najmniej jeden inny stwór.
    if (ids.length === 1 && ids.some((object) => hasAloneRestriction(object, 'cantBlockAlone'))) {
      throw new Error('Stwór z „can\'t block alone\" musi blokować z co najmniej jednym innym stworem');
    }
    // Flying/reach (CR 702.9/702.17): atakującego z lataniem mogą blokować
    // wyłącznie stwory z lataniem albo zasięgiem.
    const cantBlockFlyer = (object) => !hasKeyword(state, object, 'flying') && !hasKeyword(state, object, 'reach');
    if (hasKeyword(state, attacker, 'flying') && ids.some(cantBlockFlyer)) {
      throw new Error('Atakującego z lataniem blokują tylko stwory z lataniem lub zasięgiem');
    }
    // Menace (CR 702.110): atakującego z menace nie może blokować pojedynczy
    // stwór — tylko dwóch lub więcej (albo nikt).
    if (hasKeyword(state, attacker, 'menace') && ids.length === 1) {
      throw new Error('Stwora z menace może blokować wyłącznie dwóch lub więcej stworów');
    }
    // Protection (CR 702.16a): atakujący z ochroną przed kolorem nie może
    // być blokowany przez stwory tego koloru. Walidacja spójna z canBlock.
    const attackerProtection = effectiveProtectionFromColors(state, attacker);
    if (attackerProtection.length > 0) {
      for (const blocker of ids) {
        const blockerColors = blocker.colors ?? [];
        if (blockerColors.some(c => attackerProtection.includes(c))) {
          throw new Error('Chroniony stwór nie może być blokowany przez stwora tego koloru');
        }
      }
    }
    // M109 (Spare from Evil, CR 702.16e): ochrona przed JAKOŚCIĄ — atakującego
    // nie może blokować stwór mający tę jakość (np. nie-Człowiek).
    for (const blocker of ids) {
      if (isProtectedFromSource(state, attacker, blocker)) {
        throw new Error('Chroniony stwór nie może być blokowany przez stwora o tej jakości');
      }
    }
    if (ids.some((object) => usedBlockers.has(object.id))) throw new Error('Blocker jest użyty więcej niż raz');
    for (const object of ids) usedBlockers.add(object.id);
    blockers.set(attackerId, blockerIds.slice());
  }
  // M67 (Guildsworn Prowler): „if it wasn't blocking" — zadeklarowani blokerzy
  // dostają flagę (LKI przy śmierci; czyszczona w cleanup).
  for (const blockerIds of blockers.values()) {
    for (const blockerId of blockerIds) {
      const blocker = state.objects.get(blockerId);
      if (blocker && blocker.zone === 'battlefield') {
        state.objects.set(blockerId, Object.freeze({ ...blocker, isBlockingThisCombat: true }));
      }
    }
  }
  state.combat.blockers = blockers;
  state.combat.blockedAttackers = new Set([...blockers.entries()]
    .filter(([, blockerIds]) => blockerIds.length > 0)
    .map(([attackerId]) => attackerId));
  // M66 (C): mapa cardId dla atakujących i blokerów (LKI dla logu).
  const cards = {};
  for (const [attackerId, blockerIds] of blockers) {
    cards[attackerId] = state.objects.get(attackerId)?.cardId ?? null;
    for (const blockerId of blockerIds) cards[blockerId] = state.objects.get(blockerId)?.cardId ?? null;
  }
  const e = event('blockers_declared', { playerId, assignments, cards });
  state.events.push(e);
  return e;
}

/**
 * Rozstrzyga obrażenia combat (CR 510). Przydział: jeden bloker bez trample
 * dostaje pełną moc (M66 D); wielu blokerów / trample — decyzja atakującego
 * (CR 510.1c/d, pendingDamageAssignment). Boty biorą lethal-first.
 *
 * First strike (CR 702.7, Porcelain Legionnaire): obrażenia rozstrzygają się
 * w dwóch przebiegach — najpierw stwory z first strike (atakujący i blokujący),
 * potem state-based actions (śmierć ze śmiertelnych obrażeń), a dopiero wtedy
 * stwory bez first strike. Stwór zabity w pierwszym przebiegu nie zadaje
 * obrażeń w drugim (CR 510.4/510.5 w minimalnym wymiarze).
 */
export function resolveCombatDamage(state, defendingPlayerId, resume = null) {
  if (!state.combat) throw new Error('Brak combat');
  const events = [];
  // BUG 2026-08-11 (CR 510.4/510.5): `resume.pass` to boolean (true = przebieg
  // first strike, false = zwykły) i NIE wolno go używać jako indeksu tablicy
  // `passes` — `passes[true]` koercjuje do `passes[1]` (zwykły przebieg),
  // więc wznowienie decyzji stwora z first/double strike pomijało CAŁY przebieg
  // first strike (stawory z first strike nie zadają też w zwykłym przebiegu —
  // CR 510.5). Mapa na indeks numeryczny: true→0 (first strike), false→1.
  const startIndex = resume ? (resume.pass ? 0 : 1) : 0;
  const startFrom = resume ? resume.resumeFrom : 0;
  let assignmentResult = resume ? resume.assignments : null;
  // Dwa przebiegi obrażeń (CR 510.4/510.5 w minimalnym wymiarze): w kroku
  // first strike zadają stwory z first strike (atakujący i blokujący), po
  // state-based actions — stwory bez first strike. W obrębie przebiegu
  // obrażenia są równoczesne (markDamage kumuluje, SBA rozstrzyga po kroku).
  const passes = [true, false];
  for (let pi = startIndex; pi < passes.length; pi += 1) {
    const pass = passes[pi];
    if (state.status !== 'active') break;
    const from = pi === startIndex ? startFrom : 0;
    // M66 (R): rozdzielanie obrażeń przy wielu blokerach/trample to decyzja
    // ATAKUJĄCEGO (CR 510.1c/d). Gdy przebieg napotka taką sytuację, ustawia
    // pendingDamageAssignment i kończy komendę — reszta przebiegu wykona się
    // po resolve_damage_assignment (resume).
    if (!processCombatPass(state, pass, events, defendingPlayerId, from, assignmentResult)) {
      return events;
    }
    assignmentResult = null;
    if (pass) {
      // Między przebiegami: state-based actions rozstrzygają śmiertelne
      // obrażenia z first strike — zabite stwory nie biorą udziału w zwykłym
      // przebiegu (CR 510.4/510.5 w minimalnym wymiarze).
      events.push(...runStateBasedActions(state));
    }
  }
  // Sesja combat kończy się przed state-based actions: śmierć stwora nie może
  // pozostawić odwołań do obiektów już poza battlefield (pilnuje inwariant).
  state.combat = null;
  events.push(...runStateBasedActions(state));
  return events;
}

/** Czy obrażenia tego atakującego wymagają decyzji gracza (CR 510.1c/d). */
function needsDamageAssignmentDecision(state, attacker, blockers) {
  // Jeden bloker bez trample: pełna moc (naturalny wybór — M66 D).
  // Wiele blokerów: gracz dzieli obrażenia. Trample: gracz decyduje, ile
  // zostaje na blokerach (nadmiar idzie na gracza).
  return blockers.length > 1 || hasKeyword(state, attacker, 'trample');
}

/** Lethal (CR 510.1c/702.19b — bez efektów zmieniających faktycznie zadane). */
function lethalOf(state, attacker, blocker) {
  if (hasKeyword(state, attacker, 'deathtouch')) return 1;
  return Math.max(0, effectiveToughness(blocker, state) - (blocker.damage ?? 0));
}

/** Pełna moc na jedynego blokera (bez trample) — naturalny wybór gracza (M66 D). */
function singleBlockerFullAssignment(blockers, amount) {
  return blockers.length === 1 ? [{ blockerId: blockers[0], amount }] : [];
}

/**
 * Domyślny (deterministyczny) przydział: lethal-first w kolejności deklaracji
 * bloków — dokładnie zachowanie sprzed M66 (boty biorą ten wariant).
 */
function defaultDamageAssignment(state, attacker, blockers, amount) {
  const out = [];
  let remaining = amount;
  for (const blockerId of blockers) {
    const blocker = state.objects.get(blockerId);
    if (!blocker || blocker.zone !== 'battlefield') continue;
    const assigned = Math.min(remaining, lethalOf(state, attacker, blocker));
    out.push({ blockerId, amount: assigned });
    remaining -= assigned;
  }
  return out;
}

/**
 * Buduje widok decyzji rozdzielania obrażeń (PlayerView): atakujący z
 * przebiegu `pass` od indeksu resumeFrom, którzy są zablokowani i wymagają
 * decyzji (wielu blokerów albo trample). Lethal liczone na żywo — między
 * kolejką a decyzją bloker mógł dostać buffa albo zginąć (CR 608.2b).
 */
export function buildDamageAssignmentView(state, viewerId = null) {
  const pending = state.pendingDamageAssignment;
  if (!pending) return null;
  const pass = pending.pass;
  const entries = [];
  // M100 (BUG A): widok podziału obrażeń nie zdradza nazwy zakrytej karty
  // przeciwnika (face-down = bezimienny stwór 2/2, CR 708.2) — jak pole
  // cardId w PlayerView pola bitwy. Kontroler widzi swoją kartę (CR 708.6);
  // wewnętrzni konsumenci (domyślne przydziały bota) wołają bez viewerId
  // i dostają pełne dane.
  const faceId = (object) => (
    object.faceDown && viewerId != null && object.controllerId !== viewerId ? null : object.cardId
  );
  const aliveOnBattlefield = (id) => {
    const object = state.objects.get(id);
    return Boolean(object && object.zone === 'battlefield');
  };
  const inFirstStrikePass = (id) => {
    const object = state.objects.get(id);
    return Boolean(object) && (hasKeyword(state, object, 'first_strike') || hasKeyword(state, object, 'double_strike'));
  };
  const inRegularPass = (id) => {
    const object = state.objects.get(id);
    return Boolean(object) && (!hasKeyword(state, object, 'first_strike') || hasKeyword(state, object, 'double_strike'));
  };
  for (let i = pending.resumeFrom; i < (state.combat?.attackers ?? []).length; i += 1) {
    const attackerId = state.combat.attackers[i];
    const attacker = state.objects.get(attackerId);
    if (!attacker || attacker.zone !== 'battlefield') continue;
    const attackersTurn = pass ? inFirstStrikePass(attackerId) : inRegularPass(attackerId);
    if (!attackersTurn) continue;
    const blockers = (state.combat.blockers.get(attackerId) ?? []).filter(aliveOnBattlefield);
    const wasBlocked = state.combat.blockedAttackers?.has(attackerId) ?? state.combat.blockers.has(attackerId);
    if (!wasBlocked || blockers.length === 0) continue;
    if (!needsDamageAssignmentDecision(state, attacker, blockers)) continue;
    entries.push({
      attackerId,
      attackerCardId: faceId(attacker),
      power: Math.max(0, effectivePower(attacker, state)),
      trample: hasKeyword(state, attacker, 'trample'),
      blockers: blockers.map((id) => {
        const blocker = state.objects.get(id);
        return {
          id,
          cardId: faceId(blocker),
          toughness: effectiveToughness(blocker, state),
          damage: blocker.damage ?? 0,
          lethal: lethalOf(state, attacker, blocker),
        };
      }),
    });
  }
  return { playerId: pending.playerId, entries };
}

/** Domyślne przypisania dla wszystkich atakujących z decyzją (wariant bota). */
export function buildDefaultDamageAssignments(state) {
  const view = buildDamageAssignmentView(state);
  if (!view) return {};
  const assignments = {};
  for (const entry of view.entries) {
    const attacker = state.objects.get(entry.attackerId);
    assignments[entry.attackerId] = defaultDamageAssignment(state, attacker, entry.blockers.map((b) => b.id), entry.power);
  }
  return assignments;
}

/**
 * Waliduje przydział gracza (resolve_damage_assignment) względem ŻYWEGO stanu:
 * permutacja żywych blokerów, ilości całkowite >= 0, suma <= moc, reguła
 * „>= lethal przed następnym" (CR 510.1d). Zwraca null albo powód odrzucenia.
 */
export function validateDamageAssignment(state, attackerId, assignment) {
  const attacker = state.objects.get(attackerId);
  if (!attacker || attacker.zone !== 'battlefield') return null; // atakujący zniknął — bez walidacji
  const blockers = (state.combat.blockers.get(attackerId) ?? []).filter((id) => {
    const o = state.objects.get(id);
    return Boolean(o && o.zone === 'battlefield');
  });
  if (blockers.length === 0) return null; // nie ma już kogo rozdzielać
  if (!Array.isArray(assignment) || assignment.length !== blockers.length) return 'illegal_damage_assignment';
  const live = new Set(blockers);
  const seen = new Set();
  let sum = 0;
  const amount = Math.max(0, effectivePower(attacker, state));
  for (const entry of assignment) {
    if (!entry || !Number.isInteger(entry.amount) || entry.amount < 0) return 'illegal_damage_amount';
    if (!live.has(entry.blockerId) || seen.has(entry.blockerId)) return 'illegal_damage_blocker';
    seen.add(entry.blockerId);
    sum += entry.amount;
  }
  if (sum > amount) return 'damage_exceeds_power';
  // Reguła kolejności (CR 510.1d): zanim obrażenia trafią do późniejszego
  // blokera, każdy wcześniejszy musi mieć przydzielone >= lethal.
  for (let i = 1; i < assignment.length; i += 1) {
    if (assignment[i].amount <= 0) continue;
    const prev = state.objects.get(assignment[i - 1].blockerId);
    if (prev && assignment[i - 1].amount < lethalOf(state, attacker, prev)) return 'illegal_damage_order';
  }
  // M101/B6 (CR 702.19b): trample przepuszcza nadmiar na gracza DOPIERO, gdy
  // KAŻDY blokujący ma przydzielone co najmniej lethal. Bez tego atakujący
  // z trample mógł dać blokerom 0 i wpakować pełną moc w obrońcę — bloker
  // przeżywał, a blok nie chronił przed niczym. Reguła dotyczy wyłącznie
  // trample: bez niego nieprzydzielone obrażenia po prostu przepadają
  // (nie ma ich gdzie skierować), więc niedobór jest legalny.
  if (hasKeyword(state, attacker, 'trample') && sum < amount) {
    for (const entry of assignment) {
      const blocker = state.objects.get(entry.blockerId);
      if (!blocker) continue;
      if (entry.amount < lethalOf(state, attacker, blocker)) return 'trample_blocker_below_lethal';
    }
  }
  return null;
}

/**
 * Jeden przebieg obrażeń. Zwraca false, gdy zakolejkowano decyzję
 * rozdzielania (pendingDamageAssignment) — reszta przebiegu czeka.
 */
function processCombatPass(state, pass, events, defendingPlayerId, resumeFrom, assignmentResult) {
  const aliveOnBattlefield = (id) => {
    const object = state.objects.get(id);
    return Boolean(object && object.zone === 'battlefield');
  };
  const inFirstStrikePass = (id) => {
    const object = state.objects.get(id);
    return Boolean(object) && (hasKeyword(state, object, 'first_strike') || hasKeyword(state, object, 'double_strike'));
  };
  const inRegularPass = (id) => {
    const object = state.objects.get(id);
    return Boolean(object) && (!hasKeyword(state, object, 'first_strike') || hasKeyword(state, object, 'double_strike'));
  };
  for (let i = resumeFrom; i < state.combat.attackers.length; i += 1) {
    const attackerId = state.combat.attackers[i];
    const attacker = state.objects.get(attackerId);
    if (!attacker || attacker.zone !== 'battlefield') continue;
    const attackersTurn = pass ? inFirstStrikePass(attackerId) : inRegularPass(attackerId);
    const blockers = (state.combat.blockers.get(attackerId) ?? []).filter(aliveOnBattlefield);
    const wasBlocked = state.combat.blockedAttackers?.has(attackerId) ?? state.combat.blockers.has(attackerId);
    if (attackersTurn) {
      const amount = Math.max(0, effectivePower(attacker, state));
      if (!wasBlocked) {
        dealCombatDamageToPlayer(state, events, attackerId, defendingPlayerId, amount);
      } else if (blockers.length === 0) {
        // CR 509.1h: zablokowany atakujący nie zadaje obrażeń graczowi.
        // Trample może przejść przez pustą listę blockerów, bo nie ma już
        // obrażeń lethal do przydzielenia pozostałym stworom.
        if (hasKeyword(state, attacker, 'trample')) {
          dealCombatDamageToPlayer(state, events, attackerId, defendingPlayerId, amount);
        }
      } else if (assignmentResult) {
        // Wznowienie po decyzji gracza: przydziały gracza (albo domyślne dla
        // atakujących, których decyzja nie dotyczyła).
        const assignment = assignmentResult[attackerId] ?? defaultDamageAssignment(state, attacker, blockers, amount);
        assignDamageToBlockers(state, events, attacker, attackerId, blockers, amount, assignment);
      } else if (needsDamageAssignmentDecision(state, attacker, blockers)) {
        // M66 (R): decyzja gracza — CR 510.1c/d. Bez enumeracji kombinacji:
        // PlayerView niesie dane, legalCommands oferuje JEDEN domyślny wariant,
        // gracz-człowiek dostaje wizard (choice-request.js).
        state.pendingDamageAssignment = {
          playerId: state.combat.attackingPlayerId,
          pass,
          resumeFrom: i,
          defendingPlayerId,
          restorePriorityTo: state.turn.priorityPlayerId,
        };
        state.turn.priorityPlayerId = state.combat.attackingPlayerId;
        const required = event('damage_assignment_required', { playerId: state.combat.attackingPlayerId });
        state.events.push(required);
        events.push(required);
        return false;
      } else {
        // Jeden bloker, bez trample — pełna moc (M66 D): 3/3 vs 1/1 zadaje 3.
        const assignment = singleBlockerFullAssignment(blockers, amount);
        assignDamageToBlockers(state, events, attacker, attackerId, blockers, amount, assignment);
      }
    }
    // Blokujący z first strike tego przebiegu odpowiadają atakującemu
    // (CR 510.5 — obrażenia blokera rozstrzyga jego własny first strike,
    // niezależnie od atakującego; po SBA pierwszego przebiegu nieżywi
    // blokujący już tu nie ma).
    if (attacker.zone !== 'battlefield') continue;
    for (const blockerId of blockers) {
      const blocker = state.objects.get(blockerId);
      if (!blocker || blocker.zone !== 'battlefield') continue;
      if (pass ? !inFirstStrikePass(blockerId) : !inRegularPass(blockerId)) continue;
      // Bloker o ujemnej mocy też zadaje 0 obrażeń (CR 510.1).
      const blockerDamage = Math.max(0, effectivePower(blocker, state));
      // Filtr „prevent all damage to ... this turn" (Ethersworn Shieldmage)
      // — kasuje CAŁOŚĆ obrażeń blokera (CR 119.3; spójnie ze ścieżką
      // atakujący→bloker). Poprzednio filtr działał dopiero wewnątrz
      // markDamage, a event/lifelink/deathtouch liczyły kwotę sprzed filtra.
      const inspireBlocked = isCombatDamagePreventedByInspire(state, blocker) ? blockerDamage : 0;
      const attackerFilterPrevented = (isDamagePrevented(state, attacker) ? blockerDamage : 0) + inspireBlocked;
      if (attackerFilterPrevented > 0) {
        const filterEvent = event('damage_prevented', { objectId: attackerId, amount: attackerFilterPrevented, cardId: attacker.cardId, inspireAwe: inspireBlocked > 0 });
        state.events.push(filterEvent); events.push(filterEvent);
      }
      const shieldBefore = state.events.length;
      const blockedPrevented = preventDamageTo(state, attackerId, blockerDamage - attackerFilterPrevented);
      if (blockedPrevented > 0) events.push(...state.events.slice(shieldBefore));
      // CR 119.3: event niesie kwotę faktycznie zadaną (po prewencji).
      let blockerDealt = blockerDamage - attackerFilterPrevented - blockedPrevented;
      // BUG 2026-08-11 (CR 702.16d + 702.15): protection zapobiega obrażeniom
      // od źródła chronionego koloru w CAŁOŚCI — lifelink/deathtouch/infect
      // liczą tylko FAKTYCZNIE zadane obrażenia. markDamage robił prewencję
      // protection wewnętrznie, ale kwota lifelink/deathtouch liczona była
      // z wartości sprzed prewencji (błędny zysk życia kontrolera blokera).
      const attackerAtDeal = state.objects.get(attackerId);
      const blockerProtPrevented = isDamagePreventedByProtection(state, attackerAtDeal, blocker) ? blockerDealt : 0;
      blockerDealt -= blockerProtPrevented;
      if (blockerProtPrevented > 0) {
        const protEvent = event('damage_prevented', { objectId: attackerId, amount: blockerProtPrevented, cardId: blocker.cardId, protection: true });
        state.events.push(protEvent); events.push(protEvent);
      }
      if (hasKeyword(state, blocker, 'infect')) {
        if (blockerDealt > 0) {
          addCounter(state, attackerId, '-1/-1', blockerDealt);
          markDealtDamageThisTurn(state, attackerId);
        }
      } else if (blockerDealt > 0) {
        markDamage(state, attackerId, blockerDealt, blockerId);
      }
      // Deathtouch (CR 702.4): obrażenia od blokera z deathtouch niszczą
      // atakującego niezależnie od wytrzymałości. Prewencja kasuje
      // obrażenia przed oznaczeniem (jak wyżej — CR 702.4b).
      const attackerNow = state.objects.get(attackerId);
      if (hasKeyword(state, blocker, 'deathtouch') && blockerDealt > 0 && !isDamagePrevented(state, attackerNow)) {
        const updated = state.objects.get(attackerId);
        if (updated) state.objects.set(attackerId, Object.freeze({ ...updated, damagedByDeathtouch: true }));
      }
      // Lifelink blokera (CR 702.15).
      if (blockerDealt > 0 && hasKeyword(state, blocker, 'lifelink')) {
        events.push(...changeLife(state, blocker.controllerId, blockerDealt));
      }
      const damage = event('damage_dealt', {
        source: blockerId, target: attackerId, amount: blockerDealt, combat: true,
        sourceCardId: blocker.cardId, targetCardId: attacker.cardId,
      });
      state.events.push(damage); events.push(damage);
    }
  }
  return true;
}

/**
 * Zadaje obrażenia atakującego blokerom wg przydziału (kolejność = kolejność
 * assignment — dla gracza CR 510.1d, dla domyślnego lethal-first). Bloker,
 * który zniknął z pola bitwy między decyzją a rozstrzygnięciem, jest pomijany
 * (CR 608.2b). Trample: nadmiar po wszystkich blokerach idzie na gracza.
 */
function assignDamageToBlockers(state, events, attacker, attackerId, blockers, amount, assignment) {
  const assignedById = new Map(assignment.map((entry) => [entry.blockerId, entry.amount]));
  let remaining = amount;
  for (const blockerId of blockers) {
    const blocker = state.objects.get(blockerId);
    if (!blocker || blocker.zone !== 'battlefield') continue;
    const assigned = assignedById.get(blockerId) ?? 0;
    remaining -= assigned;
    // Filtr „prevent all damage to ... this turn" (Ethersworn Shieldmage) —
    // kasuje CAŁOŚĆ przydzieloną (jak dealNonCombatDamage).
    const inspireAssigned = isCombatDamagePreventedByInspire(state, attacker) ? assigned : 0;
    const filterPrevented = (isDamagePrevented(state, blocker) ? assigned : 0) + inspireAssigned;
    if (filterPrevented > 0) {
      const filterEvent = event('damage_prevented', { objectId: blockerId, amount: filterPrevented, cardId: blocker.cardId, inspireAwe: inspireAssigned > 0 });
      state.events.push(filterEvent); events.push(filterEvent);
    }
    // Tarcze prewencji (Withstand) kasują część obrażeń PRZED oznaczeniem —
    // lifelink i deathtouch liczą tylko to, co doszło. Zdarzenia tarcz trafiają
    // też do strumienia wyniku (jak w dealCombatDamageToPlayer), żeby log
    // komendy był kompletny.
    const shieldBefore = state.events.length;
    const shieldPrevented = preventDamageTo(state, blockerId, assigned - filterPrevented);
    if (shieldPrevented > 0) events.push(...state.events.slice(shieldBefore));
    // CR 119.3: event damage_dealt niesie kwotę FAKTYCZNIE zadaną (po prewencji).
    let dealt = assigned - filterPrevented - shieldPrevented;
    // BUG 2026-08-11 (CR 702.16d + 702.15): protection blokera od koloru
    // atakującego zapobiega obrażeniom w całości — lifelink/deathtouch/infect
    // liczą tylko faktycznie zadane (markDamage prewencjonował w środku, ale
    // zysk życia i znacznik deathtouch liczyły kwotę sprzed prewencji).
    const blockerAtDeal = state.objects.get(blockerId);
    const attackerProtPrevented = isDamagePreventedByProtection(state, blockerAtDeal, attacker) ? dealt : 0;
    dealt -= attackerProtPrevented;
    if (attackerProtPrevented > 0) {
      const protEvent = event('damage_prevented', { objectId: blockerId, amount: attackerProtPrevented, cardId: attacker.cardId, protection: true });
      state.events.push(protEvent); events.push(protEvent);
    }
    if (hasKeyword(state, attacker, 'infect')) {
      if (dealt > 0) {
        addCounter(state, blockerId, '-1/-1', dealt);
        markDealtDamageThisTurn(state, blockerId);
      }
    } else if (dealt > 0) {
      markDamage(state, blockerId, dealt, attackerId);
    }
    // Deathtouch (CR 702.4): obrażenia od stwora z deathtouch niszczą blokera
    // niezależnie od wytrzymałości. Prewencja kasuje obrażenia przed
    // oznaczeniem — znacznik deathtouch nie ma czego „zabić" (CR 702.4b).
    const blockerNow = state.objects.get(blockerId);
    if (hasKeyword(state, attacker, 'deathtouch') && dealt > 0 && !isDamagePrevented(state, blockerNow)) {
      const updated = state.objects.get(blockerId);
      if (updated) state.objects.set(blockerId, Object.freeze({ ...updated, damagedByDeathtouch: true }));
    }
    // Lifelink (CR 702.15): kontroler źródła zyskuje życie równe obrażeniom
    // zadanym (po prewencji).
    if (dealt > 0 && hasKeyword(state, attacker, 'lifelink')) {
      events.push(...changeLife(state, attacker.controllerId, dealt));
    }
    // M66 (C): sourceCardId/targetCardId — log nazywa stwory także po śmierci
    // w SBA tego samego rozstrzygnięcia.
    const damage = event('damage_dealt', {
      source: attackerId, target: blockerId, amount: dealt, combat: true,
      sourceCardId: attacker.cardId, targetCardId: blocker.cardId,
    });
    state.events.push(damage); events.push(damage);
  }
  // Trample (CR 702.19): nadmiar po przydziale idzie na gracza.
  if (hasKeyword(state, attacker, 'trample') && remaining > 0) {
    dealCombatDamageToPlayer(state, events, attackerId, defendingPlayerIdOf(state), remaining);
  }
}

/** Obrońca w toczącym się combacie (do trample w assignDamageToBlockers). */
function defendingPlayerIdOf(state) {
  const attacking = state.combat?.attackingPlayerId;
  return state.players.find((p) => p.id !== attacking)?.id ?? null;
}

/**
 * Ograniczenie enumeracji opcji w PlayerView: kompletne podzbiory podawane
 * są tylko dla małych pul, przy większych planszach widok oferuje warianty
 * pusty/pojedyncze/pełny. Walidacja w execute pozostaje niezależna i pełna.
 */
export const COMBAT_OPTION_CAP = 32;

function boundedSubsets(ids, cap) {
  if (ids.length === 0) return [[]];
  if (2 ** ids.length <= cap) {
    const all = [[]];
    for (const id of ids) {
      const extended = all.map((subset) => [...subset, id]);
      all.push(...extended);
    }
    return all;
  }
  return [[], ...ids.map((id) => [id]), ids.slice()];
}

/** Wszystkie zbiory atakujących, które gracz może teraz legalnie zadeklarować. */
export function legalAttackerOptions(state, playerId, cap = COMBAT_OPTION_CAP) {
  const legal = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object && object.zone === 'battlefield' && isLegalAttacker(state, object, playerId)) legal.push(id);
  }
  // Wymuszeni atakujący (goad CR 701.38 oraz „attacks each combat if able\"
  // CR 508.1c — Ramroller) MUSZĄ być w każdej opcji; wybór dotyczy tylko
  // pozostałych stworów.
  const mandatory = legal.filter((id) => {
    const object = state.objects.get(id);
    return object?.goaded === true || hasMustAttack(object);
  });
  const optional = legal.filter((id) => !mandatory.includes(id));
  return boundedSubsets(optional, cap)
    .map((subset) => [...mandatory, ...subset])
    // „Can't attack alone" (Ember Beast, CR 508.1d): opcja z JEDNYM
    // atakującym, który ma to ograniczenie, nie może być zaoferowana —
    // execute odrzucałby oferowaną komendę (spójność oferty i walidacji).
    .filter((subset) => !(subset.length === 1
      && hasAloneRestriction(state.objects.get(subset[0]), 'cantAttackAlone')));
}

/** Landwalk (CR 702.33, Emerald Oryx — forestwalk): podtyp lądu, którego
 * obecność u OBRONCY czyni atakującego nieblokowalnym — ze zdolności
 * statycznych atakującego (null = brak landwalka). */
function attackerLandwalkSubtype(state, attacker) {
  for (const ability of effectiveAbilities(attacker)) {
    if (ability?.type === 'static' && ability.landwalk?.subtype) {
      return ability.landwalk.subtype;
    }
  }
  return null;
}

/** Czy gracz kontroluje ląd o danym podtypie (np. Forest dla forestwalka). */
function controlsLandWithSubtype(state, playerId, subtype) {
  return [...state.objects.values()].some((o) => o.zone === 'battlefield'
    && o.controllerId === playerId
    && (o.kind === 'land' || (o.types ?? []).includes('Land'))
    && (o.subtypes ?? []).includes(subtype));
}

/** Kolory, którymi dany stwór MOŻE być blokowany (np. Dread Warlock: „can't be
 * blocked except by black creatures") — zable ze zdolności statycznych. */
function attackerBlockColorRestriction(state, attacker) {
  for (const ability of effectiveAbilities(attacker)) {
    if (ability?.type === 'static' && Array.isArray(ability.cantBeBlockedExceptByColors)) {
      return ability.cantBeBlockedExceptByColors;
    }
  }
  return null;
}

/** Podtypy, którymi dany stwór NIE MOŻE być blokowany (Blazing Torch:
 * „Equipped creature can't be blocked by Vampires or Zombies") — ze zdolności
 * statycznych (nadawanych nosicielowi przez sprzęt). Zwraca listę podtypów
 * albo null. */
function attackerBlockSubtypeRestriction(state, attacker) {
  for (const ability of effectiveAbilities(attacker)) {
    if (ability?.type === 'static' && Array.isArray(ability.cantBeBlockedBySubtypes)) {
      return ability.cantBeBlockedBySubtypes;
    }
  }
  // Restrykcje statyczne NADANE przez przypięty sprzęt (equipment.grantedAbilities
  // — Blazing Torch). Nosiciel ma zdolność, dopóki sprzęt jest przypięty
  // (CR 301.5c: „Equipped creature has ...").
  for (const attachment of attachmentsAttachedTo(state, attacker.id)) {
    for (const ability of attachment.equipment?.grantedAbilities ?? []) {
      if (ability?.type === 'static' && Array.isArray(ability.cantBeBlockedBySubtypes)) {
        return ability.cantBeBlockedBySubtypes;
      }
    }
  }
  return null;
}

/** Czy dany blocker może blokować danego atakującego (reguła latania/zasięgu). */
function canBlock(state, attacker, blocker) {
  if (!attacker || !blocker) return false;
  // CR 701.38b: goad nakłada WYŁĄCZNIE wymogi ataku („attacks each combat if
  // able”, „attacks a player other than the goader if able”). Nie mówi nic
  // o blokowaniu — goadowany stwór blokuje normalnie. Wcześniej silnik
  // zabraniał mu blokowania, co odbierało obrońcy legalne bloki.
  // Dread Warlock (CR): „can't be blocked except by black creatures" — bloker
  // musi mieć jeden z dozwolonych kolorów.
  const blockColors = attackerBlockColorRestriction(state, attacker);
  if (blockColors) {
    const blockerColors = blocker.colors ?? [];
    if (!blockerColors.some((c) => blockColors.includes(c))) return false;
  }
  // Blazing Torch (CR): „can't be blocked by Vampires or Zombies" — bloker
  // o zakazanym podtypie nie może blokować (podtypy efektywne, jak w walce).
  const blockSubtypes = attackerBlockSubtypeRestriction(state, attacker);
  if (blockSubtypes) {
    const blockerSubtypes = blocker.subtypes ?? [];
    if (blockSubtypes.some((sub) => blockerSubtypes.includes(sub))) return false;
  }
  // Landwalk (CR 702.33, forestwalk): atakujący nie może być blokowany, gdy
  // OBRONCA kontroluje ląd o podtypie landwalka (defender = kontroler blokera).
  const landwalkSub = attackerLandwalkSubtype(state, attacker);
  if (landwalkSub && controlsLandWithSubtype(state, blocker.controllerId, landwalkSub)) return false;
  if (attacker.cantBeBlocked) return false;
  if (hasKeyword(state, attacker, 'flying') && !hasKeyword(state, blocker, 'flying') && !hasKeyword(state, blocker, 'reach')) return false;
  // Protection (CR 702.16a): atakujący z ochroną przed kolorem NIE MOŻE
  // być blokowany przez stwory tego koloru. Sprawdzamy ochronę ATAKUJĄCEGO
  // vs kolory blokera (nie odwrotnie).
  const attackerProt = effectiveProtectionFromColors(state, attacker);
  if (attackerProt.length > 0) {
    const blockerColors = blocker.colors ?? [];
    if (blockerColors.some(c => attackerProt.includes(c))) return false;
  }
  // M109 (CR 702.16e): ochrona przed jakością blokera (Spare from Evil).
  if (isProtectedFromSource(state, attacker, blocker)) return false;
  return true;
}

/** Czy przypisanie spełnia menace: atakujący ma 0 albo ≥2 blokujących (CR 702.110b). */
function satisfiesMenace(state, attackerId, blockerIds) {
  const attacker = state.objects.get(attackerId);
  if (!hasKeyword(state, attacker, 'menace')) return true;
  return (blockerIds ?? []).length !== 1;
}

/** Wszystkie legalne przypisania blokujących dla bieżącego combat. */
export function legalBlockerOptions(state, playerId, cap = COMBAT_OPTION_CAP) {
  const attackers = state.combat?.attackers ?? [];
  const blockers = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    // CR 701.38b: goad nie ogranicza blokowania — nie filtrujemy po `goaded`.
    if (object && object.zone === 'battlefield' && object.controllerId === playerId && object.kind === 'creature' && !object.tapped && !object.cantBlock
      && !attachmentRestrictions(state, object).cantBlock) blockers.push(id);
  }
  if ((attackers.length + 1) ** blockers.length <= cap) {
    const all = [{}];
    for (const blockerId of blockers) {
      const blocker = state.objects.get(blockerId);
      // „Can't block this turn\" (Panic Spellbomb): stwór z cantBlock
      // nie może blokować w tym combacie.
      if (blocker.cantBlock) continue;
      // Ograniczenie z załącznika (Hobble: „can't block if it's black").
      if (attachmentRestrictions(state, blocker).cantBlock) continue;
      const extended = [];
      for (const assignment of all) {
        for (const attackerId of attackers) {
          const attacker = state.objects.get(attackerId);
          if (!canBlock(state, attacker, blocker)) continue;
          const candidate = { ...assignment, [attackerId]: [...(assignment[attackerId] ?? []), blockerId] };
          // Menace: przypisanie dokładnie jednego blokującego jest nielegalne
          // — takiej kombinacji nie wolno ani zaoferować, ani rozbudowywać
          // (rozbudowa może dojść do legalnej ≥2, więc jej nie filtrujemy tu;
          // filtr dotyczy wyłącznie przypisań finalizowanych poniżej).
          extended.push(candidate);
        }
      }
      all.push(...extended);
    }
    // Finalne przypisania nie mogą łamać menace (0 albo ≥2 blokujących)
    // ani „can't block alone" (Ember Beast — blokujący musi mieć partnera
    // przy TYM SAMYM atakującym; spójne z walidacją declareBlockers).
    return all.filter((assignment) => Object.entries(assignment)
      .every(([attackerId, blockerIds]) => satisfiesMenace(state, attackerId, blockerIds)
        && !(blockerIds.length === 1 && hasAloneRestriction(state.objects.get(blockerIds[0]), 'cantBlockAlone'))));
  }
  const options = [{}];
  for (const attackerId of attackers) {
    const attacker = state.objects.get(attackerId);
    for (const blockerId of blockers) {
      const blocker = state.objects.get(blockerId);
      // Pojedynczy blok na atakującym z menace jest nielegalny — nie oferujemy.
      // To samo dla blokera z „can't block alone" (wymaga partnera).
      if (canBlock(state, attacker, blocker) && !hasKeyword(state, attacker, 'menace')
        && !hasAloneRestriction(blocker, 'cantBlockAlone')) options.push({ [attackerId]: [blockerId] });
    }
  }
  const free = blockers.slice();
  const greedy = {};
  for (const attackerId of attackers) {
    const attacker = state.objects.get(attackerId);
    const menace = hasKeyword(state, attacker, 'menace');
    const needed = menace ? 2 : 1;
    const chosen = [];
    while (chosen.length < needed) {
      const blockerId = free.find((id) => !chosen.includes(id) && canBlock(state, attacker, state.objects.get(id)));
      if (blockerId === undefined) break;
      chosen.push(blockerId);
    }
    if (chosen.length < needed) break; // nie da się legalnie zablokować (menace)
    // „Can't block alone" (Ember Beast): samotny bloker tego typu nie może
    // być zaoferowany — próbujemy dobrać partnera, a bez niego rezygnujemy.
    if (chosen.length === 1 && hasAloneRestriction(state.objects.get(chosen[0]), 'cantBlockAlone')) {
      const partnerId = free.find((id) => !chosen.includes(id) && canBlock(state, attacker, state.objects.get(id)));
      if (partnerId === undefined) continue;
      chosen.push(partnerId);
    }
    for (const blockerId of chosen) free.splice(free.indexOf(blockerId), 1);
    greedy[attackerId] = chosen;
  }
  if (Object.keys(greedy).length > 0) options.push(greedy);
  return options;
}
