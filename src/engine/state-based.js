import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './objects.js';
import { effectiveKeywords, effectiveToughness } from './permanents.js';
import { removeIllegalAttachments } from './attachments.js';

/**
 * Regeneracja (CR 701.12): tarcza z efektu „regenerate" zastępuje następne
 * ZNISZCZENIE permanentu w tej turze — zamiast śmierci: odtappowanie,
 * zdjęcie wszystkich obrażeń, usunięcie z walki i zużycie tarczy. Chroni
 * przed śmiertelnymi obrażeniami i efektami destroy; NIE chroni przed
 * poświęceniem, prawem legend ani wytrzymałością <= 0 (to nie jest
 * zniszczenie — CR 704.5f).
 */
export function tryRegenerate(state, object) {
  if (!object || object.zone !== 'battlefield') return false;
  if (!(state.regenerationShields ?? []).includes(object.id)) return false;
  // CR 701.12b (minimalny wymiar): „It can't be regenerated this turn" (Rage
  // of Purphoros) — flaga trwała do końca tury ustawiana na obiekcie
  // efektem cant_be_regenerated_this_turn. Blokuje regenerację TEGO
  // obiektu niezależnie od źródła tarczy (regenerate / destroy z efektem
  // regeneracji / planeswalker itd.).
  if ((state.cantBeRegeneratedThisTurn ?? []).includes(object.id)) return false;
  state.regenerationShields = (state.regenerationShields ?? []).filter((id) => id !== object.id);
  // Odcięcie od walki (CR 701.12a: „removed from combat").
  if (state.combat) {
    state.combat.attackers = (state.combat.attackers ?? []).filter((id) => id !== object.id);
    for (const [attackerId, blockerIds] of state.combat.blockers) {
      state.combat.blockers.set(attackerId, blockerIds.filter((id) => id !== object.id));
    }
    state.combat.blockedAttackers?.delete(object.id);
  }
  const regenerated = Object.freeze({
    ...object, tapped: true, damage: 0, damagedByDeathtouch: false,
  });
  state.objects.set(object.id, regenerated);
  state.events.push(event('permanent_regenerated', {
    objectId: object.id, cardId: object.cardId, playerId: object.controllerId,
  }));
  return true;
}

/** Dodaje tarczę regeneracji (koszt zdolności „regenerate" — CR 701.12). */
export function addRegenerationShield(state, objectId) {
  state.regenerationShields = [...(state.regenerationShields ?? []), objectId];
  const object = state.objects.get(objectId);
  state.events.push(event('regeneration_shield_added', {
    objectId, cardId: object?.cardId ?? null, playerId: object?.controllerId ?? null,
  }));
  return object;
}

/**
 * Centralne state-based actions — jedyne miejsce, które rozstrzyga przegraną
 * z powodu życia <= 0 oraz niszczenie stworów ze śmiertelnymi obrażeniami.
 * Wywoływane po każdej zaakceptowanej komendzie (game-state.js `accepted`)
 * oraz przez API obrażeń; funkcja jest idempotentna i może wykonać więcej
 * niż jedną akcję naraz.
 *
 * Kolejność w jednym przebiegu odzwierciedla zależności (CR 704.3): najpierw
 * śmierći stworów (gospodarz może odejść z bitwiska), potem rozłączenie
 * załączników, które straciły legalnego gospodarza — bestow znów jest stworem
 * i zostaje (CR 702.103b), equipment zostaje odłączony (CR 704.5n), a czysta
 * aura trafia do grobu (CR 704.5m).
 */
export function runStateBasedActions(state) {
  const events = [];
  for (const player of state.players) {
    const isZeroLife = player.life <= 0;
    const isPoisoned = (player.poison ?? 0) >= 10;
    if ((isZeroLife || isPoisoned) && state.status === 'active') {
      const winner = state.players.find((entry) => entry.id !== player.id);
      state.status = 'finished';
      state.winnerId = winner.id;
      const reason = isPoisoned ? 'poison_ten' : 'life_zero';
      const lost = event('player_lost', { playerId: player.id, reason, winnerId: winner.id });
      state.events.push(lost); events.push(lost);
    }
  }
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield' || object.kind !== 'creature' || object.toughness === null) continue;
    // Jwari: „enter as a copy” — SBA nie zabija 0/0, dopoki gracz nie wybierze celu.
    if (object.enteringAsCopy) continue;
    const toughness = effectiveToughness(object, state);
    // CR 704.5f: stwór o wytrzymałości <= 0 idzie do grobu (indestructible nie chroni).
    const killedByZeroToughness = toughness <= 0;
    const isIndestructible = effectiveKeywords(object, state).includes('indestructible');
    // Deathtouch (CR 702.4): obrażenia od stwora z deathtouch niszczą
    // cel niezależnie od wytrzymałości (wystarczy 1 obrażenie).
    const killedByDamage = !isIndestructible && object.damage >= toughness;
    const killedByDeathtouch = !isIndestructible && object.damagedByDeathtouch && object.damage > 0;
    if (!killedByZeroToughness && !killedByDamage && !killedByDeathtouch) continue;
    // Shield: zniszczenie z obrażeń zastąp zdjęciem tarczy (CR 122.1b).
    if (!killedByZeroToughness && (object.counters?.shield ?? 0) > 0) {
      const next = { ...(object.counters ?? {}) };
      next.shield = (next.shield ?? 0) - 1;
      if (next.shield <= 0) delete next.shield;
      state.objects.set(object.id, Object.freeze({ ...object, counters: Object.freeze(next), damage: 0, damagedByDeathtouch: false }));
      state.events.push(event('shield_consumed', { objectId: object.id, cardId: object.cardId, reason: 'destroy' }));
      continue;
    }
    // Regeneracja (CR 701.12): zniszczenie z obrażeń zastępujemy odtapowaniem,
    // zdjęciem obrażeń i usunięciem z walki — stwór NIE umiera (brak dies).
    // Wytrzymałość <= 0 NIE jest zniszczeniem — regeneracja nie chroni.
    if (!killedByZeroToughness && tryRegenerate(state, object)) continue;
    // Finality counter: zamiast do grobu, stwór idzie do exile (CR 122.1b
    // w minimalnym wymiarze — dotyczy śmierci z obrażeń).
    const hasFinality = (object.counters ?? {}).finality > 0;
    const toZone = hasFinality ? 'exile' : 'graveyard';
    const toId = hasFinality ? `exile-${state.objectSequence++}` : `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, object.id, toZone, toId);
    const destroyed = event('creature_destroyed', { fromId: object.id, toId, toZone, cardId: object.cardId });
    state.events.push(destroyed); events.push(destroyed);
  }
  // CR 122.3 (anihilacja liczników): jeśli permanent ma jednocześnie liczniki
  // +1/+1 i -1/-1, N par znika, gdzie N = mniejsza z liczb. Liczona przy
  // każdym przebiegu SBA (jak w MtG — state-based action).
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield') continue;
    const counters = object.counters ?? {};
    const plus = counters['+1/+1'] ?? 0;
    const minus = counters['-1/-1'] ?? 0;
    if (plus > 0 && minus > 0) {
      const removed = Math.min(plus, minus);
      const next = { ...counters };
      next['+1/+1'] = plus - removed;
      next['-1/-1'] = minus - removed;
      if (next['+1/+1'] === 0) delete next['+1/+1'];
      if (next['-1/-1'] === 0) delete next['-1/-1'];
      state.objects.set(object.id, Object.freeze({ ...object, counters: Object.freeze(next) }));
      state.events.push(event('counter_removed', {
        objectId: object.id, cardId: object.cardId,
        counter: 'mixed', amount: removed, annihilated: true, total: 0,
      }));
      events.push(event('counter_removed', {
        objectId: object.id, cardId: object.cardId,
        counter: 'mixed', amount: removed, annihilated: true, total: 0,
      }));
    }
  }
  // Załączniki bez legalnego gospodarza rozłączają się zgodnie z polityką
  // rodziny (bestow→stwór na bitwisku, equipment→odłączony artefakt,
  // czysta aura→grób — CR 704.5m/n).
  events.push(...removeIllegalAttachments(state));
  // Prawo legend (CR 704.5j): gracz kontrolujący DWA lub więcej legendarnych
  // permanentów o tej samej nazwie wybiera, który zostaje — pozostałe idą
  // do grobu. Wybór należy do gracza (jak cele pokoi lochu, M24): SBA
  // kolejkuje pierwszą grupę duplikatów jako blokującą decyzję, a execute()
  // zamyka ją komendą resolve_legend_choice; następne SBA (po tej komendzie)
  // obsłuży ewentualną kolejną grupę. Nazwa to cardName z definicji karty
  // (dwa wydania = ta sama nazwa, CR 704.5j patrzy na nazwy — a nie na id);
  // tokeny (pole `name`) nie są legendarnymi kartami w tym katalogu, ale
  // porównanie jest generyczne. Kolejność kandydatów = kolejność wejścia
  // na bitwisko (zones.battlefield jest listą przybycia).
  if (state.status === 'active' && !state.pendingLegendChoice) {
    let pendingGroup = null;
    const seen = new Map();
    for (const objectId of state.zones.battlefield) {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield') continue;
      if (!(object.types ?? []).includes('Legendary')) continue;
      // CR 708.2: permanent twarzą w dół nie ma nazwy — prawo legend (CR 704.5j)
      // porównuje NAZWY, więc face-down nie wchodzi do grup duplikatów.
      if (object.faceDown) continue;
      const name = object.cardName ?? object.name ?? null;
      if (!name) continue;
      const key = object.controllerId + '|' + name;
      const group = seen.get(key) ?? { playerId: object.controllerId, name, candidateIds: [] };
      group.candidateIds.push(objectId);
      seen.set(key, group);
      if (group.candidateIds.length >= 2 && !pendingGroup) pendingGroup = group;
    }
    if (pendingGroup) {
      state.pendingLegendChoice = {
        playerId: pendingGroup.playerId,
        name: pendingGroup.name,
        candidateIds: [...pendingGroup.candidateIds],
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = pendingGroup.playerId;
      const started = event('legend_rule_choice_started', {
        playerId: pendingGroup.playerId,
        name: pendingGroup.name,
        candidateIds: [...pendingGroup.candidateIds],
      });
      state.events.push(started); events.push(started);
    }
  }
  return events;
}

