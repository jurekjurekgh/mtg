import { event } from '../protocol/types.js';
import { addPoisonCounters, changeLife } from './players.js';
import { addCounter } from './counters.js';
import { effectiveAbilities, effectiveKeywords, effectivePower, effectiveToughness, isDamagePrevented, markDamage, tapObject } from './permanents.js';
import { runStateBasedActions } from './state-based.js';

function getCreature(state, id) {
  const object = state.objects.get(id);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nieprawidłowy creature object: ${id}`);
  return object;
}

const hasKeyword = (state, object, keyword) => effectiveKeywords(object, state).includes(keyword);

/**
 * „This creature attacks each combat if able\" (Ramroller, Juggernaut,
 * CR 508.1c): statyczny wymóg ataku — traktowany jak goad bez daty ważności,
 * czytany ze zdolności statycznych obiektu (deskryptor mustAttack).
 */
function hasMustAttack(object) {
  return effectiveAbilities(object).some((ability) => ability?.type === 'static' && ability.mustAttack);
}

function isLegalAttacker(state, object, playerId) {
  if (object?.controllerId !== playerId || object.kind !== 'creature' || object.tapped) return false;
  // Defender (CR 702.3): stwór z defender NIE może atakować.
  if (hasKeyword(state, object, 'defender')) return false;
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
    const ids = blockerIds.map((id) => getCreature(state, id));
    if (ids.some((object) => object.controllerId !== playerId || object.tapped)) throw new Error('Nielegalny blokujący');
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
  const withFirstStrike = (id) => {
    const object = state.objects.get(id);
    return Boolean(object) && hasKeyword(state, object, 'first_strike');
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
      // Atakujący zadaje obrażenia w przebiegu zgodnym ze swoim first strike.
      const attackersTurn = withFirstStrike(attackerId) === pass;
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
          const damageEvent = event('damage_dealt', { source: attackerId, target: defendingPlayerId, amount, combat: true });
          state.events.push(damageEvent);
          if (hasKeyword(state, attacker, 'infect')) {
            events.push(damageEvent, ...addPoisonCounters(state, defendingPlayerId, amount));
          } else {
            events.push(damageEvent, ...changeLife(state, defendingPlayerId, -amount));
          }
        } else if (blockers.length === 0) {
          // Zablokowany atakujący nie zadaje obrażeń graczowi. Trample może
          // przejść przez pustą listę blockerów, bo nie ma już obrażeń lethal do
          // przydzielenia pozostałym stworom.
          if (hasKeyword(state, attacker, 'trample')) {
            const damageEvent = event('damage_dealt', { source: attackerId, target: defendingPlayerId, amount, combat: true });
            state.events.push(damageEvent);
            if (hasKeyword(state, attacker, 'infect')) {
              events.push(damageEvent, ...addPoisonCounters(state, defendingPlayerId, amount));
            } else {
              events.push(damageEvent, ...changeLife(state, defendingPlayerId, -amount));
            }
          }
        } else {
          // Trample (CR 702.19): w istniejącym uproszczeniu pełna siła trafia
          // każdego pozostałego blockera, a nadmiar liczony jest względem ich
          // łącznej wytrzymałości.
          let trampleOverflow = 0;
          if (hasKeyword(state, attacker, 'trample')) {
            const totalToughness = blockers.reduce((sum, blockerId) => {
              const blocker = state.objects.get(blockerId);
              return sum + effectiveToughness(blocker, state) - (blocker.damage ?? 0);
            }, 0);
            trampleOverflow = Math.max(0, amount - totalToughness);
          }
          for (const blockerId of blockers) {
            const blocker = state.objects.get(blockerId);
            if (hasKeyword(state, attacker, 'infect')) {
              addCounter(state, blockerId, '-1/-1', amount);
            } else {
              markDamage(state, blockerId, amount);
            }
            // Deathtouch (CR 702.4): obrażenia od stwora z deathtouch
            // niszczą blokera niezależnie od wytrzymałości. Prewencja
            // (Ethersworn Shieldmage) kasuje obrażenia przed oznaczeniem —
            // znacznik deathtouch nie ma czego „zabić" (CR 702.4b).
            if (hasKeyword(state, attacker, 'deathtouch') && amount > 0 && !isDamagePrevented(state, blocker)) {
              const updated = state.objects.get(blockerId);
              if (updated) state.objects.set(blockerId, Object.freeze({ ...updated, damagedByDeathtouch: true }));
            }
            const damage = event('damage_dealt', { source: attackerId, target: blockerId, amount });
            state.events.push(damage); events.push(damage);
          }
          if (trampleOverflow > 0) {
            const damageEvent = event('damage_dealt', { source: attackerId, target: defendingPlayerId, amount: trampleOverflow, combat: true });
            state.events.push(damageEvent);
            if (hasKeyword(state, attacker, 'infect')) {
              events.push(damageEvent, ...addPoisonCounters(state, defendingPlayerId, trampleOverflow));
            } else {
              events.push(damageEvent, ...changeLife(state, defendingPlayerId, -trampleOverflow));
            }
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
        if (withFirstStrike(blockerId) !== pass) continue;
        // Bloker o ujemnej mocy też zadaje 0 obrażeń (CR 510.1).
        const blockerDamage = Math.max(0, effectivePower(blocker, state));
        if (hasKeyword(state, blocker, 'infect')) {
          addCounter(state, attackerId, '-1/-1', blockerDamage);
        } else {
          markDamage(state, attackerId, blockerDamage);
        }
        // Deathtouch (CR 702.4): obrażenia od blokera z deathtouch niszczą
        // atakującego niezależnie od wytrzymałości. Prewencja kasuje
        // obrażenia przed oznaczeniem (jak wyżej — CR 702.4b).
        const attackerNow = state.objects.get(attackerId);
        if (hasKeyword(state, blocker, 'deathtouch') && blockerDamage > 0 && !isDamagePrevented(state, attackerNow)) {
          const updated = state.objects.get(attackerId);
          if (updated) state.objects.set(attackerId, Object.freeze({ ...updated, damagedByDeathtouch: true }));
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
    .map((subset) => [...mandatory, ...subset]);
}

/** Czy dany blocker może blokować danego atakującego (reguła latania/zasięgu). */
function canBlock(state, attacker, blocker) {
  if (!attacker || !blocker) return false;
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
    if (object && object.zone === 'battlefield' && object.controllerId === playerId && object.kind === 'creature' && !object.tapped && !object.cantBlock) blockers.push(id);
  }
  if ((attackers.length + 1) ** blockers.length <= cap) {
    const all = [{}];
    for (const blockerId of blockers) {
      const blocker = state.objects.get(blockerId);
      // „Can't block this turn\" (Panic Spellbomb): stwór z cantBlock
      // nie może blokować w tym combacie.
      if (blocker.cantBlock) continue;
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
    // Finalne przypisania nie mogą łamać menace (0 albo ≥2 blokujących).
    return all.filter((assignment) => Object.entries(assignment)
      .every(([attackerId, blockerIds]) => satisfiesMenace(state, attackerId, blockerIds)));
  }
  const options = [{}];
  for (const attackerId of attackers) {
    const attacker = state.objects.get(attackerId);
    for (const blockerId of blockers) {
      const blocker = state.objects.get(blockerId);
      // Pojedynczy blok na atakującym z menace jest nielegalny — nie oferujemy.
      if (canBlock(state, attacker, blocker) && !hasKeyword(state, attacker, 'menace')) options.push({ [attackerId]: [blockerId] });
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
    for (const blockerId of chosen) free.splice(free.indexOf(blockerId), 1);
    greedy[attackerId] = chosen;
  }
  if (Object.keys(greedy).length > 0) options.push(greedy);
  return options;
}
