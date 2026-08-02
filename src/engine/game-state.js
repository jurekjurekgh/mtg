import { createGameObject } from './identity.js';
import { assertZone, ZONES } from './zones.js';
import { command, event } from '../protocol/types.js';
import { initialTurn, jumpToStep, nextTurnStep } from './turn.js';
import { assertStateInvariants } from './invariants.js';
import { initializeResources, beginTurn, castAuraSpell, castPermanent, legalAuraCasts, playLand, tapLandForMana } from './resources.js';
import { COMBAT_OPTION_CAP, declareAttackers, declareBlockers, legalAttackerOptions, legalBlockerOptions, resolveCombatDamage } from './combat.js';
import { castSpell, legalSpellCasts, resolveTopOfStack } from './spells.js';
import { legalActivatedAbilities, activateAbility } from './abilities.js';
import { clearMarkedDamage, clearStatModifiers, effectiveKeywords, effectivePower, effectiveToughness, grantKeywordsUntilEndOfTurn } from './permanents.js';
import { addCounter } from './counters.js';
import { runStateBasedActions } from './state-based.js';
import { processTriggers } from './triggers.js';
import { moveObjectDirectly } from './objects.js';
import { changeLife } from './players.js';

// Re-eksport niskopoziomowych API dla kompatybilności istniejących konsumentów.
export { moveObjectDirectly, changeLife };

/**
 * Minimalny autorytatywny stan gry. Stan jest przechowywany wyłącznie tutaj;
 * widoki i kontrolery dostają kopie projekcji.
 */
export function createGameState({ seed, players }) {
  if (!Number.isInteger(seed) || !Array.isArray(players) || players.length < 2) {
    throw new TypeError('Gra wymaga całkowitego seeda i co najmniej dwóch graczy');
  }
  const ids = players.map((p) => p.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new TypeError('Gracze muszą mieć unikalne id');
  const state = {
    seed,
    players: players.map((p) => ({ id: p.id, name: p.name ?? p.id, life: 20, commanderCasts: 0 })),
    turn: initialTurn(ids[0]),
    objects: new Map(),
    zones: Object.fromEntries(ZONES.map((zone) => [zone, []])),
    events: [],
    commands: [],
    status: 'active',
    winnerId: null,
    combat: null,
    objectSequence: 0,
    // Liczba czarów rzuconych w bieżącej i poprzedniej turze (transform
    // wilkołaków: „if no spells were cast last turn"). Liczone są wszystkie
    // zagrania niebędące landami (stwory + instants + sorceries).
    spellsCastThisTurn: 0,
    lastTurnSpellsCast: 0,
    // Oczekująca decyzja scry (CR 701.18): kto i jakie karty (w kolejności od
    // wierzchu) przegląda. Blokuje bieg gry do komendy resolve_scry.
    pendingScry: null,
    // Kolejka oczekujących decyzji backup (CR 702.165): źródło stwora, który
    // wszedł, kontroler i parametry. Blokuje grę do komend resolve_backup
    // (po jednej na wpis — jak pendingScry, ale decyzje mogą się kolejkować,
    // gdy kilka stworów z backup wejdzie w tej samej sekwencji).
    pendingBackups: [],
    // Opóźnione triggery (CR 603.7): zaplanowane zdarzenia, które odpalą się
    // w przyszłym kroku (Puppeteer Clique: „at the beginning of your next end
    // step, exile it"). Wpis: { type, objectId, playerId, armedOnTurn }.
    delayedTriggers: [],
  };
  return initializeResources(state);
}

export function addObject(state, { id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, bestow, aura, equipment, backup }) {
  assertZone(zone);
  if (!state.players.some((p) => p.id === controllerId) || state.objects.has(id)) {
    throw new Error('Nieprawidłowy kontroler albo zajęte id obiektu');
  }
  const object = createGameObject({ id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, bestow, aura, equipment, backup });
  state.objects.set(id, object);
  state.zones[zone].push(id);
  assertStateInvariants(state);
  return object;
}

function reject(reason) { return { ok: false, events: [event('command_rejected', { reason })] }; }

/**
 * Punkt zapisu każdej zaakceptowanej komendy. Centralnie uruchamia
 * state-based actions (idempotentne), waliduje inwarianty i dopiero wtedy
 * dopisuje komendę do logu replayu.
 */
function accepted(state, cmd, result) {
  const sbaEvents = runStateBasedActions(state);
  if (sbaEvents.length > 0) result.events = [...result.events, ...sbaEvents];
  // Zdolności triggerowane (dies, combat damage) rozstrzygają się po SBA,
  // skanując zdarzenia bieżącej komendy (łącznie ze śmiercią z SBA).
  const triggerEvents = processTriggers(state, result.events);
  if (triggerEvents.length > 0) result.events = [...result.events, ...triggerEvents];
  assertStateInvariants(state);
  state.commands.push({ ...cmd });
  return result;
}

/** Wykonuje komendę po walidacji i zwraca zdarzenia; tylko ta funkcja mutuje stan. */
export function execute(state, input) {
  let cmd;
  try { cmd = command(input.type, input.playerId, input); } catch { return reject('invalid_command'); }
  if (state.status !== 'active') return reject('game_over');
  if (cmd.type === 'concede') {
    const winner = state.players.find((p) => p.id !== cmd.playerId);
    state.status = 'finished';
    state.winnerId = winner.id;
    const e = event('player_conceded', { playerId: cmd.playerId, winnerId: winner.id });
    state.events.push(e);
    return accepted(state, cmd, { ok: true, events: [e] });
  }
  // Oczekująca decyzja scry zamyka wszystkie inne działania (jak
  // nierozstrzygnięty combat): jedyna droga dalej to resolve_scry.
  if (state.pendingScry) {
    if (cmd.type !== 'resolve_scry') return reject('scry_unresolved');
    if (cmd.playerId !== state.pendingScry.playerId) return reject('scry_not_your_decision');
    const scry = state.pendingScry;
    const bottomIds = Array.isArray(cmd.bottomIds) ? cmd.bottomIds : [];
    if (new Set(bottomIds).size !== bottomIds.length || bottomIds.some((id) => !scry.objectIds.includes(id))) {
      return reject('illegal_scry_choice');
    }
    if (bottomIds.length > 0) {
      // Karta na spodzie biblioteki to ten sam obiekt w tej samej strefie —
      // zmienia się wyłącznie kolejność (CR 701.18 nie jest zmianą strefy).
      const bottomsInLookOrder = scry.objectIds.filter((id) => bottomIds.includes(id));
      const library = state.zones.library.filter((id) => !bottomIds.includes(id));
      state.zones.library = [...library, ...bottomsInLookOrder];
    }
    state.pendingScry = null;
    const e = event('scry_resolved', { playerId: cmd.playerId, total: scry.objectIds.length, bottomCount: bottomIds.length });
    state.events.push(e);
    return accepted(state, cmd, { ok: true, events: [e] });
  }
  // Oczekująca decyzja backup (CR 702.165): jak scry — blokuje wszystko poza
  // resolve_backup (i koncesją). Decyzji może być kilka w kolejce, jeśli
  // więcej niż jeden stwór z backup wszedł w tej samej sekwencji.
  if (state.pendingBackups.length > 0) {
    const pending = state.pendingBackups[0];
    if (cmd.type !== 'resolve_backup') return reject('backup_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('backup_not_your_decision');
    const target = state.objects.get(cmd.targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') {
      return reject('illegal_backup_target');
    }
    state.pendingBackups.shift();
    const before = state.events.length;
    addCounter(state, target.id, '+1/+1', pending.counters);
    // Grant zdolności tylko, gdy backup wskazał INNEGO stwora niż źródło
    // (CR 702.165a): samo źródło dostaje wyłącznie liczniki.
    const grantedKeywords = target.id === pending.sourceId ? [] : pending.grantKeywords;
    if (grantedKeywords.length > 0) grantKeywordsUntilEndOfTurn(state, target.id, grantedKeywords);
    const e = event('backup_resolved', {
      playerId: cmd.playerId, sourceId: pending.sourceId, sourceCardId: pending.cardId,
      targetId: target.id, targetCardId: target.cardId,
      counters: pending.counters, grantedKeywords: [...grantedKeywords],
      self: target.id === pending.sourceId, remaining: state.pendingBackups.length,
    });
    state.events.push(e);
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  if (cmd.playerId !== state.turn.priorityPlayerId) return reject('not_priority');

  if (cmd.type === 'pass_priority') {
    // Żaden pass nie może ominąć rozstrzygnięcia obrażeń combat.
    if (state.turn.step === 'combat_damage' && state.combat) return reject('combat_unresolved');
    const current = state.players.findIndex((p) => p.id === state.turn.priorityPlayerId);
    const next = state.players[(current + 1) % state.players.length].id;
    state.turn.passes += 1;
    const events = [event('priority_passed', { playerId: cmd.playerId, nextPlayerId: next })];
    if (state.turn.passes >= state.players.length) {
      // Pełna runda passów: najpierw rozstrzygaj wierzchni czar stosu (LIFO),
      // dopiero przy pustym stosie przechodź dalej (CR 117.4 w uproszczeniu).
      if (state.zones.stack.length > 0) {
        const resolution = resolveTopOfStack(state);
        events.push(...resolution);
        state.turn.passes = 0;
        state.turn.priorityPlayerId = state.turn.activePlayerId;
      } else {
        const previousTurnNumber = state.turn.number;
        state.turn = nextTurnStep(state.turn, state.players);
        events.push(event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step }));
        if (state.turn.step === 'cleanup') { clearMarkedDamage(state); clearStatModifiers(state); }
        if (state.turn.number !== previousTurnNumber) {
          // Przeliczenie licznika czarów poprzedniej tury (transform).
          state.lastTurnSpellsCast = state.spellsCastThisTurn;
          state.spellsCastThisTurn = 0;
          // Zdarzenia startu tury (turn_started, odkręcenia) doklejamy do
          // wyniku komendy — konsument protokołu dostaje pełny strumień.
          events.push(...beginTurn(state, state.turn.activePlayerId).events);
        }
      }
    } else {
      state.turn.priorityPlayerId = next;
    }
    state.events.push(...events);
    return accepted(state, cmd, { ok: true, events });
  }

  if (cmd.type === 'play_land') {
    try {
      const e = playLand(state, cmd.playerId, cmd.objectId);
      return accepted(state, cmd, { ok: true, events: [e] });
    } catch (error) {
      return reject(`illegal_land:${error.message}`);
    }
  }

  if (cmd.type === 'tap_for_mana') {
    try {
      const events = tapLandForMana(state, cmd.playerId, cmd.objectId);
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_mana_source:${error.message}`);
    }
  }

  if (cmd.type === 'cast_permanent') {
    try {
      // Czary aur (bestow CR 702.103 oraz czyste aury CR 303.4): ten sam typ
      // komendy z wariantem — karta idzie na STOS jako czar aury z celem-
      // stworem (rozstrzyga się po rundzie passów jak każdy czar). Czystą
      // aurę rozpoznajemy po deskryptorze `aura` jej obiektu. Bez wariantu
      // zwykła ścieżka permanentu.
      if (cmd.bestow || state.objects.get(cmd.objectId)?.aura) {
        const before = state.events.length;
        const e = castAuraSpell(state, cmd.playerId, cmd.objectId, { targetId: cmd.targets?.[0], bestow: Boolean(cmd.bestow) });
        const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
        return accepted(state, cmd, { ok: true, events });
      }
      const before = state.events.length;
      const e = castPermanent(state, cmd.playerId, cmd.objectId, cmd.faceDown ? { faceDown: true } : {});
      // Zdarzenie główne (permanent_cast) pozostaje pierwsze; dokładamy
      // zdarzenia zagnieżdżone (np. counter_added przy wejściu z licznikiem).
      const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_cast:${error.message}`);
    }
  }

  if (cmd.type === 'cast_spell') {
    try {
      const e = castSpell(state, cmd.playerId, cmd.objectId, cmd.targets);
      return accepted(state, cmd, { ok: true, events: [e] });
    } catch (error) {
      return reject(`illegal_spell:${error.message}`);
    }
  }

  if (cmd.type === 'activate_ability') {
    try {
      const before = state.events.length;
      const e = activateAbility(state, cmd.playerId, cmd.objectId, cmd.abilityIndex, cmd.attackerId, cmd.targets, cmd.xValue);
      const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_ability:${error.message}`);
    }
  }

  if (cmd.type === 'declare_attackers') {
    try {
      const e = declareAttackers(state, cmd.playerId, cmd.attackerIds);
      const defenderId = state.players.find((player) => player.id !== cmd.playerId).id;
      state.turn = jumpToStep(state.turn, 'declare_blockers', defenderId);
      const step = event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step });
      state.events.push(step);
      return accepted(state, cmd, { ok: true, events: [e, step] });
    } catch (error) {
      return reject(`illegal_attackers:${error.message}`);
    }
  }

  if (cmd.type === 'declare_blockers') {
    try {
      const e = declareBlockers(state, cmd.playerId, cmd.assignments ?? {});
      state.turn = jumpToStep(state.turn, 'combat_damage', state.turn.activePlayerId);
      const step = event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step });
      state.events.push(step);
      return accepted(state, cmd, { ok: true, events: [e, step] });
    } catch (error) {
      return reject(`illegal_blockers:${error.message}`);
    }
  }

  if (cmd.type === 'resolve_combat') {
    if (state.turn.step !== 'combat_damage' || state.turn.priorityPlayerId !== cmd.playerId) return reject('wrong_combat_timing');
    if (state.turn.activePlayerId !== cmd.playerId) return reject('not_active_player');
    try {
      const e = resolveCombatDamage(state, cmd.defendingPlayerId);
      state.turn = jumpToStep(state.turn, 'end_of_combat', state.turn.activePlayerId);
      const step = event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step });
      state.events.push(step);
      e.push(step);
      return accepted(state, cmd, { ok: true, events: e });
    } catch (error) {
      return reject(`illegal_combat:${error.message}`);
    }
  }

  if (cmd.type === 'draw_card') {
    if (state.turn.step !== 'draw' || state.turn.activePlayerId !== cmd.playerId) return reject('wrong_timing');
    // Akcja turowa: dokładnie jedno dobranie w kroku draw; znacznik znika
    // przy przejściu kroku, bo automat buduje nowy obiekt turn.
    if (state.turn.drawnInStep) return reject('already_drew');
    const object = state.objects.get(cmd.objectId);
    if (!object) {
      if (state.zones.library.every((id) => state.objects.get(id)?.controllerId !== cmd.playerId)) {
        const winner = state.players.find((p) => p.id !== cmd.playerId);
        state.status = 'finished';
        state.winnerId = winner.id;
        const e = event('player_lost', { playerId: cmd.playerId, reason: 'empty_library', winnerId: winner.id });
        state.events.push(e);
        return accepted(state, cmd, { ok: true, events: [e] });
      }
      return reject('invalid_draw');
    }
    if (object.controllerId !== cmd.playerId || object.zone !== 'library') return reject('invalid_draw');
    const newObjectId = `drawn-${state.objectSequence++}`;
    state.zones.library = state.zones.library.filter((id) => id !== object.id);
    state.zones.hand.push(newObjectId);
    const drawn = Object.freeze({ ...object, id: newObjectId, zone: 'hand' });
    state.objects.delete(object.id); state.objects.set(drawn.id, drawn);
    const e = event('card_drawn', { playerId: cmd.playerId, fromId: object.id, object: drawn });
    state.events.push(e);
    state.turn.drawnInStep = true;
    return accepted(state, cmd, { ok: true, events: [e] });
  }

  if (cmd.type === 'move_object') {
    const object = state.objects.get(cmd.objectId);
    if (!object || object.controllerId !== cmd.playerId || !state.zones[object.zone].includes(object.id)) return reject('illegal_move');
    try { assertZone(cmd.toZone); } catch { return reject('invalid_zone'); }
    const newId = cmd.newObjectId;
    if (!newId || state.objects.has(newId)) return reject('invalid_object_id');
    state.zones[object.zone] = state.zones[object.zone].filter((id) => id !== object.id);
    state.zones[cmd.toZone].push(newId);
    const moved = Object.freeze({ ...object, id: newId, zone: cmd.toZone });
    state.objects.delete(object.id); state.objects.set(newId, moved);
    const e = event('object_moved', { fromId: object.id, object: moved, fromZone: object.zone, toZone: cmd.toZone });
    state.events.push(e);
    return accepted(state, cmd, { ok: true, events: [e] });
  }
  return reject('unsupported_command');
}

/**
 * Projektuje wyłącznie informacje dostępne danemu graczowi.
 *
 * `legalCommands` jest kompletnym kontraktem dla kontrolera: każda oferowana
 * komenda jest akceptowana przez `execute` (pilnuje tego test własnościowy).
 * Dla deklaracji combat opcje są enumerowane do limitu COMBAT_OPTION_CAP;
 * powyżej niego widok oferuje warianty pusty/pojedyncze/pełny, a pełna
 * walidacja pozostaje wyłącznie po stronie engine.
 */
export function playerView(state, playerId) {
  if (!state.players.some((p) => p.id === playerId)) throw new Error('Nieznany gracz');
  const zones = {};
  for (const [zone, ids] of Object.entries(state.zones)) {
    zones[zone] = ids.map((id) => {
      const object = state.objects.get(id);
      if (['hand', 'library'].includes(zone) && object.controllerId !== playerId) return { id, controllerId: object.controllerId, hidden: true };
      // Przynależność talii jest jawna — karty ani ich kolejność nie.
      if (zone === 'library') return { id: object.id, controllerId: object.controllerId, hidden: true };
      // Własna ręka jest jawna dla właściciela: pełne dane do planowania
      // (koszt, statystyki, deskryptor czaru). Przeciwnik widzi wyłącznie licznik.
      if (zone === 'hand') {
        return {
          id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone,
          kind: object.kind, power: object.power, toughness: object.toughness, manaCost: object.manaCost, spell: object.spell,
          // Deskryptory z Oracle karty nie są informacją ukrytą — UI/bot
          // planujące ruch ich potrzebują (jak morph przez object.morph).
          bestow: object.bestow ?? null, morph: object.morph ?? null,
          aura: object.aura ?? null, equipment: object.equipment ?? null,
          backup: object.backup ?? null,
        };
      }
      if (zone === 'battlefield') {
        const entry = {
          id: object.id,
          // Face-down permanent ukrywa tożsamość przed przeciwnikiem (FoW);
          // kontroler zna swoją kartę.
          cardId: object.faceDown && object.controllerId !== playerId ? null : object.cardId,
          controllerId: object.controllerId, zone: object.zone,
          kind: object.kind,
          power: effectivePower(object, state), toughness: effectiveToughness(object, state),
          powerModifier: object.powerModifier, toughnessModifier: object.toughnessModifier,
          tapped: object.tapped, summoningSickness: object.summoningSickness, damage: object.damage,
        };
        // Keywordy efektywne (własne + tymczasowe granty + nadane przez
        // załączniki) — publiczna informacja liczona tak samo jak w combat.
        const keywords = effectiveKeywords(object, state);
        if (keywords.length) entry.keywords = keywords;
        if (object.subtypes?.length) entry.subtypes = [...object.subtypes];
        if (object.faceDown) entry.faceDown = true;
        if (Object.keys(object.counters ?? {}).length > 0) entry.counters = { ...object.counters };
        // Załączenie (aura/equipment) jest informacją publiczną: obaj gracze
        // widzą, do czego obiekt jest przypięty, i jaki buff daje (z Oracle).
        if (object.attachedTo) entry.attachedTo = object.attachedTo;
        if (object.bestow) entry.bestow = object.bestow;
        if (object.aura) entry.aura = object.aura;
        if (object.equipment) entry.equipment = object.equipment;
        return entry;
      }
      // Stos jest strefą publiczną: wszyscy widzą rzucany czar i jego cele.
      if (zone === 'stack') {
        return {
          id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone,
          kind: object.kind, manaCost: object.manaCost, spell: object.spell, targets: object.chosenTargets,
          // Znacznik bestow odróżnia czar aury za koszt bestow od czystej
          // aury (inny flavor w UI, inne rozstrzygnięcie przy fizzle).
          bestow: object.bestow ?? null, attachedTo: object.attachedTo ?? null,
        };
      }
      return { id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone };
    });
  }
  const legalCommands = [];
  const pendingBackup = state.pendingBackups[0] ?? null;
  if (state.status === 'active') {
    // Koncesję może zgłosić każdy gracz niezależnie od priorytetu; pass
    // oferujemy wyłącznie posiadaczowi priorytetu.
    legalCommands.push(command('concede', playerId));
    const hasPriority = state.turn.priorityPlayerId === playerId;
    // Pass jest niedostępny, gdy trwa nierozstrzygnięty krok obrażeń combat —
    // jedyna droga dalej to resolve_combat (albo koncesja). Oczekujący scry
    // albo backup blokuje pass u wszystkich (patrz resolve_* poniżej).
    const blockedByCombat = state.turn.step === 'combat_damage' && state.combat;
    if (hasPriority && !blockedByCombat && !state.pendingScry && !pendingBackup) legalCommands.push(command('pass_priority', playerId));
  }
  // Oczekująca decyzja backup: kontroler wskazuje dowolnego stwora na
  // bitwisku (obu graczy — „target creature"), pozostałe komendy zablokowane.
  if (state.status === 'active' && pendingBackup && pendingBackup.playerId === playerId) {
    for (const objectId of state.zones.battlefield) {
      const object = state.objects.get(objectId);
      if (object?.zone === 'battlefield' && object.kind === 'creature') {
        legalCommands.unshift(command('resolve_backup', playerId, { targetId: objectId }));
      }
    }
  }
  // Oczekująca decyzja scry: właściciel dostaje wyliczone warianty (każda
  // przeglądana karta ma osobną decyzję wierzch/spód, w kolejności przeglądu);
  // wszystkie pozostałe komendy są zablokowane do czasu decyzji.
  if (state.status === 'active' && state.pendingScry && state.pendingScry.playerId === playerId) {
    const variants = [[]];
    for (const objectId of state.pendingScry.objectIds) {
      variants.push(...variants.slice().map((chosen) => [...chosen, objectId]));
    }
    for (const bottomIds of variants) {
      legalCommands.unshift(command('resolve_scry', playerId, bottomIds.length > 0 ? { bottomIds } : {}));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !pendingBackup && state.turn.step === 'draw' && state.turn.activePlayerId === playerId
    && !state.turn.drawnInStep) {
    const top = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
    legalCommands.unshift(command('draw_card', playerId, top ? { objectId: top } : {}));
  }
  const player = state.players.find((entry) => entry.id === playerId);
  if (state.status === 'active' && !state.pendingScry && !pendingBackup && state.turn.priorityPlayerId === playerId) {
    for (const id of state.zones.battlefield) {
      const object = state.objects.get(id);
      // Landy i land creatures (token Forest Dryad Jyoti — typ Land) produkują
      // manę; zwykłe stwory nie.
      const isLandSource = object?.kind === 'land' || (object?.types ?? []).includes('Land');
      if (object?.controllerId === playerId && isLandSource && !object.tapped) legalCommands.unshift(command('tap_for_mana', playerId, { objectId: id }));
    }
    for (const cast of legalSpellCasts(state, playerId)) {
      legalCommands.unshift(command('cast_spell', playerId, cast));
    }
    // Zdolności aktywowane są jak instanty: dostępne z priorytetem, niezależnie
    // od fazy. Każda oferowana aktywacja jest akceptowana przez execute.
    // Ninjutsu niesie dodatkowo attackerId (atakujący do zwrotu do ręki);
    // zdolności celowane/{X} niosą targets i xValue.
    for (const { objectId, abilityIndex, attackerId, targets, xValue } of legalActivatedAbilities(state, playerId)) {
      const extra = { objectId, abilityIndex };
      if (attackerId !== undefined) extra.attackerId = attackerId;
      if (targets !== undefined) extra.targets = targets;
      if (xValue !== undefined) extra.xValue = xValue;
      legalCommands.unshift(command('activate_ability', playerId, extra));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !pendingBackup && state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)) {
    // Czary aur (bestow CR 702.103 + czyste aury CR 303.4): alternatywna
    // ścieżka tej samej komendy — każdy legalny cel-stwór to osobny wariant
    // (czar aury idzie na stos). Warianty aure są wyliczane PRZED zwykłymi
    // castami, żeby w liście komend były ZA nimi (proste boty biorą pierwszą
    // komendę danego typu — mają dostać naturalny cast, nie aurę).
    if (state.zones.stack.length === 0) {
      for (const { objectId, targetId, bestow } of legalAuraCasts(state, playerId)) {
        legalCommands.unshift(command('cast_permanent', playerId,
          bestow ? { objectId, bestow: true, targets: [targetId] } : { objectId, targets: [targetId] }));
      }
    }
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId !== playerId || object.aura) continue;
      if (object.kind !== 'creature' && object.kind !== 'artifact') continue;
      if ((object.manaCost ?? 0) <= (player.mana ?? 0)) {
        legalCommands.unshift(command('cast_permanent', playerId, { objectId: id }));
      }
      // Morph/megamorph: zagranie twarzą w dół jako 2/2 za koszt morph ({3}).
      if (object.kind === 'creature' && object.morph && (object.morph.cost ?? 0) <= (player.mana ?? 0)) {
        legalCommands.unshift(command('cast_permanent', playerId, { objectId: id, faceDown: true }));
      }
    }
  }
  if (state.status === 'active' && !state.pendingScry && !pendingBackup && state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase) && (player.landPlays ?? 0) > 0) {
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId === playerId && object.kind === 'land') legalCommands.unshift(command('play_land', playerId, { objectId: id }));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !pendingBackup && state.turn.priorityPlayerId === playerId) {
    if (state.turn.step === 'declare_attackers' && state.turn.activePlayerId === playerId) {
      const seen = new Set();
      for (const attackerIds of legalAttackerOptions(state, playerId, COMBAT_OPTION_CAP)) {
        const key = JSON.stringify(attackerIds);
        if (seen.has(key)) continue;
        seen.add(key);
        legalCommands.unshift(command('declare_attackers', playerId, { attackerIds }));
      }
    }
    if (state.turn.step === 'declare_blockers' && state.combat && state.combat.attackingPlayerId !== playerId) {
      const seen = new Set();
      for (const assignments of legalBlockerOptions(state, playerId, COMBAT_OPTION_CAP)) {
        const key = JSON.stringify(assignments);
        if (seen.has(key)) continue;
        seen.add(key);
        legalCommands.unshift(command('declare_blockers', playerId, { assignments }));
      }
    }
    if (state.turn.step === 'combat_damage' && state.combat && state.turn.activePlayerId === playerId) {
      const defendingPlayerId = state.players.find((entry) => entry.id !== playerId).id;
      legalCommands.unshift(command('resolve_combat', playerId, { defendingPlayerId }));
    }
  }
  // Pula many i pozostałe zagrania lądu są jawną informacją stołową —
  // UI i boty planują na nich swoje okno priorytetu.
  const players = state.players.map(({ id, name, life, mana, landPlays }) => ({ id, name, life, mana: mana ?? 0, landPlays: landPlays ?? 0 }));
  // Fog of War scry: patrzący (właściciel decyzji) widzi treść kart (jak rękę),
  // przeciwnik dowiaduje się wyłącznie, że decyzja trwa i ile kart obejrzano.
  const pendingScry = state.pendingScry ? {
    playerId: state.pendingScry.playerId,
    count: state.pendingScry.objectIds.length,
    cards: state.pendingScry.playerId === playerId
      ? state.pendingScry.objectIds.map((id) => {
        const object = state.objects.get(id);
        return {
          id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone,
          kind: object.kind, power: object.power, toughness: object.toughness, manaCost: object.manaCost, spell: object.spell,
        };
      })
      : null,
  } : null;
  // Backup jest w całości informacją publiczną (bitwisko): obaj gracze widzą
  // źródło, kolejkę i to, czyja to decyzja — jak przy fazie combat.
  const pendingBackupView = pendingBackup ? {
    playerId: pendingBackup.playerId,
    sourceId: pendingBackup.sourceId,
    sourceCardId: pendingBackup.cardId,
    counters: pendingBackup.counters,
    grantKeywords: [...pendingBackup.grantKeywords],
    queueLength: state.pendingBackups.length,
  } : null;
  return Object.freeze({ playerId, status: state.status, winnerId: state.winnerId, players, turn: { ...state.turn }, zones, legalCommands, pendingScry, pendingBackup: pendingBackupView });
}
