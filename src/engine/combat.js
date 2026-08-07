import { event } from '../protocol/types.js';
import { addPoisonCounters, changeLife } from './players.js';
import { addCounter } from './counters.js';
import { attachmentRestrictions, effectiveAbilities, effectiveKeywords, effectivePower, effectiveToughness, isDamagePrevented, markDamage, preventDamageTo, tapObject } from './permanents.js';
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
function dealCombatDamageToPlayer(state, events, sourceId, targetPlayerId, amount) {
  const source = state.objects.get(sourceId);
  const damageEvent = event('damage_dealt', { source: sourceId, target: targetPlayerId, amount, combat: true });
  state.events.push(damageEvent);
  const before = state.events.length;
  const prevented = preventDamageTo(state, targetPlayerId, amount);
  const actual = amount - prevented;
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
  }
  state.combat = { attackingPlayerId: playerId, attackers: attackerIds.slice(), blockers: new Map(), blockedAttackers: new Set() };
  const e = event('attackers_declared', { playerId, attackerIds: attackerIds.slice() });
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
    if (ids.some((object) => usedBlockers.has(object.id))) throw new Error('Blocker jest użyty więcej niż raz');
    for (const object of ids) usedBlockers.add(object.id);
    blockers.set(attackerId, blockerIds.slice());
  }
  state.combat.blockers = blockers;
  state.combat.blockedAttackers = new Set([...blockers.entries()]
    .filter(([, blockerIds]) => blockerIds.length > 0)
    .map(([attackerId]) => attackerId));
  const e = event('blockers_declared', { playerId, assignments });
  state.events.push(e);
  return e;
}

/**
 * Rozstrzyga obrażenia combat. Uproszczenie syntetyczne: atakujący zadaje
 * pełną siłę KAŻDEMU blokującemu zamiast rozdzielać obrażenia w kolejności
 * (CR 510.1c). Zostanie zastąpione, gdy pierwsza karta tego wymaga.
 *
 * First strike (CR 702.7, Porcelain Legionnaire): obrażenia rozstrzygają się
 * w dwóch przebiegach — najpierw stwory z first strike (atakujący i blokujący),
 * potem state-based actions (śmierć ze śmiertelnych obrażeń), a dopiero wtedy
 * stwory bez first strike. Stwór zabity w pierwszym przebiegu nie zadaje
 * obrażeń w drugim (CR 510.4/510.5 w minimalnym wymiarze).
 */
export function resolveCombatDamage(state, defendingPlayerId) {
  if (!state.combat) throw new Error('Brak combat');
  const events = [];
  const aliveOnBattlefield = (id) => {
    const object = state.objects.get(id);
    return Boolean(object && object.zone === 'battlefield');
  };
  // Double strike (CR 702.4e): stwór z double strike zadaje obrażenia w OBU
  // przebiegach — first strike (jak first strike) i zwykłym. Stwory z samym
  // first strike — tylko w pierwszym, bez keyworda — tylko w drugim.
  const inFirstStrikePass = (id) => {
    const object = state.objects.get(id);
    return Boolean(object) && (hasKeyword(state, object, 'first_strike') || hasKeyword(state, object, 'double_strike'));
  };
  const inRegularPass = (id) => {
    const object = state.objects.get(id);
    return Boolean(object) && (!hasKeyword(state, object, 'first_strike') || hasKeyword(state, object, 'double_strike'));
  };
  // Dwa przebiegi obrażeń (CR 510.4/510.5 w minimalnym wymiarze): w kroku
  // first strike zadają stwory z first strike (atakujący i blokujący), po
  // state-based actions — stwory bez first strike. W obrębie przebiegu
  // obrażenia są równoczesne (markDamage kumuluje, SBA rozstrzyga po kroku).
  for (const pass of [true, false]) {
    if (state.status !== 'active') break;
    for (const attackerId of state.combat.attackers) {
      const attacker = state.objects.get(attackerId);
      if (!attacker || attacker.zone !== 'battlefield') continue;
      // Atakujący zadaje obrażenia w przebiegu zgodnym ze swoim first strike
      // (double strike obejmuje oba przebiegi).
      const attackersTurn = pass ? inFirstStrikePass(attackerId) : inRegularPass(attackerId);
      // Blokujący (żywi) — atakujący trafia ich wszystkich w swoim przebiegu.
      const blockers = (state.combat.blockers.get(attackerId) ?? []).filter(aliveOnBattlefield);
      // CR 509.1h: po deklaracji bloku atakujący pozostaje zablokowany nawet,
      // gdy wszystkie blocking creatures opuściły bitwisko. Starsze stany testowe
      // nie mają blockedAttackers — obecność klucza w mapie jest wtedy fallbackiem.
      const wasBlocked = state.combat.blockedAttackers?.has(attackerId) ?? state.combat.blockers.has(attackerId);
      if (attackersTurn) {
        // Ujemna moc (np. Hysterical Blindness -4/-0) zadaje 0 obrażeń, nigdy
        // ujemnych (CR 510.1 — moc <= 0 nie zadaje obrażeń).
        const amount = Math.max(0, effectivePower(attacker, state));
        if (!wasBlocked) {
          // Niezablokowany atakujący zadaje obrażenia graczowi.
          dealCombatDamageToPlayer(state, events, attackerId, defendingPlayerId, amount);
        } else if (blockers.length === 0) {
          // Zablokowany atakujący nie zadaje obrażeń graczowi. Trample może
          // przejść przez pustą listę blockerów, bo nie ma już obrażeń lethal do
          // przydzielenia pozostałym stworom.
          if (hasKeyword(state, attacker, 'trample')) {
            dealCombatDamageToPlayer(state, events, attackerId, defendingPlayerId, amount);
          }
        } else {
          // CR 510.1c — ROZDZIAŁ obrażeń wśród blokujących: atakujący
          // przydziela obrażenia w kolejności (deterministycznie: kolejność
          // deklaracji bloków — ADR 0005); każdy blokujący musi dostać co
          // najmniej tyle, ile potrzeba do śmiertelnych obrażeń (lethal),
          // zanim obrażenia przejdą do następnego. Wcześniej pełna siła
          // trafiała KAŻDEGO blokera (nadmiar zabijał wszystkich).
          let remaining = amount;
          for (const blockerId of blockers) {
            const blocker = state.objects.get(blockerId);
            const lethal = hasKeyword(state, attacker, 'deathtouch')
              ? 1
              : Math.max(0, effectiveToughness(blocker, state) - (blocker.damage ?? 0));
            const assigned = Math.min(remaining, lethal);
            remaining -= assigned;
            // Tarcze prewencji (Withstand) kasują część obrażeń PRZED
            // oznaczeniem — lifelink i deathtouch liczą tylko to, co doszło.
            const prevented = preventDamageTo(state, blockerId, assigned);
            const dealt = assigned - prevented;
            if (hasKeyword(state, attacker, 'infect')) {
              if (dealt > 0) addCounter(state, blockerId, '-1/-1', dealt);
            } else if (dealt > 0) {
              markDamage(state, blockerId, dealt);
            }
            // Deathtouch (CR 702.4): obrażenia od stwora z deathtouch
            // niszczą blokera niezależnie od wytrzymałości. Prewencja
            // kasuje obrażenia przed oznaczeniem — znacznik deathtouch nie
            // ma czego „zabić" (CR 702.4b).
            const blockerNow = state.objects.get(blockerId);
            if (hasKeyword(state, attacker, 'deathtouch') && dealt > 0 && !isDamagePrevented(state, blockerNow)) {
              const updated = state.objects.get(blockerId);
              if (updated) state.objects.set(blockerId, Object.freeze({ ...updated, damagedByDeathtouch: true }));
            }
            // Lifelink (CR 702.15): kontroler źródła zyskuje życie równe
            // obrażeniom zadanym (po prewencji).
            if (dealt > 0 && hasKeyword(state, attacker, 'lifelink')) {
              events.push(...changeLife(state, attacker.controllerId, dealt));
            }
            const damage = event('damage_dealt', { source: attackerId, target: blockerId, amount: assigned });
            state.events.push(damage); events.push(damage);
          }
          // Trample (CR 702.19): nadmiar po zadaniu lethal WSZYSTKIM
          // blokującym przechodzi na gracza (wcześniej liczony względem
          // łącznej wytrzymałości przy pełnych obrażeniach na każdego).
          if (hasKeyword(state, attacker, 'trample') && remaining > 0) {
            dealCombatDamageToPlayer(state, events, attackerId, defendingPlayerId, remaining);
          }
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
        const blockedPrevented = preventDamageTo(state, attackerId, blockerDamage);
        const blockerDealt = blockerDamage - blockedPrevented;
        if (hasKeyword(state, blocker, 'infect')) {
          if (blockerDealt > 0) addCounter(state, attackerId, '-1/-1', blockerDealt);
        } else if (blockerDealt > 0) {
          markDamage(state, attackerId, blockerDealt);
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
        const damage = event('damage_dealt', { source: blockerId, target: attackerId, amount: blockerDamage });
        state.events.push(damage); events.push(damage);
      }
    }
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

/** Czy dany blocker może blokować danego atakującego (reguła latania/zasięgu). */
function canBlock(state, attacker, blocker) {
  if (!attacker || !blocker) return false;
  if (attacker.cantBeBlocked) return false;
  if (hasKeyword(state, attacker, 'flying') && !hasKeyword(state, blocker, 'flying') && !hasKeyword(state, blocker, 'reach')) return false;
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
