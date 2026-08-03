import { event } from '../protocol/types.js';
import { changeLife } from './players.js';
import { effectiveKeywords, effectivePower, effectiveToughness, markDamage, tapObject } from './permanents.js';
import { runStateBasedActions } from './state-based.js';

function getCreature(state, id) {
  const object = state.objects.get(id);
  if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nieprawidłowy creature object: ${id}`);
  return object;
}

const hasKeyword = (state, object, keyword) => effectiveKeywords(object, state).includes(keyword);

function isLegalAttacker(state, object, playerId) {
  if (object?.controllerId !== playerId || object.kind !== 'creature' || object.tapped) return false;
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
  for (const attacker of attackers) {
    // Vigilance: stwór nie tapuje się przy ataku.
    if (!hasKeyword(state, attacker, 'vigilance')) tapObject(state, attacker.id, playerId);
  }
  state.combat = { attackingPlayerId: playerId, attackers: attackerIds.slice(), blockers: new Map() };
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
  const e = event('blockers_declared', { playerId, assignments });
  state.events.push(e);
  return e;
}

/**
 * Rozstrzyga obrażenia combat. Uproszczenie syntetyczne: atakujący zadaje
 * pełną siłę KAŻDEMU blokującemu zamiast rozdzielać obrażenia w kolejności
 * (CR 510.1c). Zostanie zastąpione, gdy pierwsza karta tego wymaga.
 */
export function resolveCombatDamage(state, defendingPlayerId) {
  if (!state.combat) throw new Error('Brak combat');
  const events = [];
  for (const attackerId of state.combat.attackers) {
    const attacker = getCreature(state, attackerId);
    const blockers = state.combat.blockers.get(attackerId) ?? [];
    if (blockers.length === 0) {
      // Obrażenia graczowi BEZ uruchamiania SBA w środku pętli — przegrana
      // i śmierć stworów rozstrzygają się raz, po zamknięciu sesji combat
      // (por. CR 510.2: cały combat damage zadawany jednocześnie). Gdyby
      // SBA odpaliło się tu, śmierć blokowanego stwora w trakcie rozliczania
      // zostawiłaby żywe odwołanie w state.combat i zawiesiła inwariant.
      const amount = effectivePower(attacker, state);
      const damageEvent = event('damage_dealt', { source: attackerId, target: defendingPlayerId, amount, combat: true });
      state.events.push(damageEvent);
      events.push(damageEvent, ...changeLife(state, defendingPlayerId, -amount));
    } else {
      // Trample (CR 702.19): atakujący musi przydzielić blokerom tyle, ile
      // potrzeba do ich zabicia, a nadmiar siły przechodzi na gracza.
      // W uproszczeniu istniejącego combatu (pełna siła każdemu blokerowi)
      // nadmiar liczony jest względem łącznej wytrzymałości blokerów.
      let trampleOverflow = 0;
      if (hasKeyword(state, attacker, 'trample')) {
        const totalToughness = blockers.reduce((sum, blockerId) => {
          const blocker = getCreature(state, blockerId);
          return sum + effectiveToughness(blocker, state) - (blocker.damage ?? 0);
        }, 0);
        trampleOverflow = Math.max(0, effectivePower(attacker, state) - totalToughness);
      }
      for (const blockerId of blockers) {
        const blocker = getCreature(state, blockerId);
        const damageToBlocker = effectivePower(attacker, state);
        markDamage(state, blockerId, damageToBlocker);
        const damage = event('damage_dealt', { source: attackerId, target: blockerId, amount: damageToBlocker });
        state.events.push(damage); events.push(damage);
        markDamage(state, attackerId, effectivePower(blocker, state));
      }
      if (trampleOverflow > 0) {
        const damageEvent = event('damage_dealt', { source: attackerId, target: defendingPlayerId, amount: trampleOverflow, combat: true });
        state.events.push(damageEvent);
        events.push(damageEvent, ...changeLife(state, defendingPlayerId, -trampleOverflow));
      }
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
  return boundedSubsets(legal, cap);
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
    if (object && object.zone === 'battlefield' && object.controllerId === playerId && object.kind === 'creature' && !object.tapped) blockers.push(id);
  }
  if ((attackers.length + 1) ** blockers.length <= cap) {
    const all = [{}];
    for (const blockerId of blockers) {
      const blocker = state.objects.get(blockerId);
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
