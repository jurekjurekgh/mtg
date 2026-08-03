import { createGameObject } from './identity.js';
import { assertZone, ZONES } from './zones.js';
import { command, event } from '../protocol/types.js';
import { initialTurn, jumpToStep, nextTurnStep } from './turn.js';
import { assertStateInvariants } from './invariants.js';
import { initializeResources, beginTurn, castAuraSpell, castPermanent, legalAuraCasts, playLand, tapLandForMana } from './resources.js';
import { COMBAT_OPTION_CAP, declareAttackers, declareBlockers, legalAttackerOptions, legalBlockerOptions, resolveCombatDamage } from './combat.js';
import { castSpell, legalSpellCasts, plotCard, resolveTopOfStack, finishPendingSpell } from './spells.js';
import { legalActivatedAbilities, activateAbility } from './abilities.js';
import { clearMarkedDamage, clearStatModifiers, effectiveKeywords, effectivePower, effectiveToughness, grantKeywordsUntilEndOfTurn } from './permanents.js';
import { addCounter } from './counters.js';
import { runStateBasedActions } from './state-based.js';
import { processTriggers } from './triggers.js';
import { moveObjectDirectly } from './objects.js';
import { changeLife } from './players.js';
import { applyRoomTargetChoice } from './effects.js';

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
    // Oczekująca decyzja surveil (CR 701.41, Curate): jak scry, ale wybór
    // dotyczy liczby kart do grobu (reszta zostaje na wierzchu). Blokuje grę
    // do komendy resolve_surveil.
    pendingSurveil: null,
    // Niedokończone rozstrzyganie czaru wstrzymane przez blokującą decyzję
    // (surveil/scry/clash w środku listy efektów): { stackId, effects } —
    // pozostałe efekty dokończy komenda resolve_*, zanim czar opuści stos
    // (Curate: „Surveil 2, then draw a card").
    pendingSpell: null,
    // Oczekujące decyzje clash (CR 701.40): kto i którą kartę (wierzch/spód)
    // odkłada. Wpis: { choices: [playerId…], cards: {playerId: objectId|null},
    // won, returnToHandOnWin, restorePriorityTo }. Blokuje grę do
    // resolve_clash_choice; po ostatniej decyzji dokańcza wstrzymany czar.
    pendingClash: null,
    // Kolejka oczekujących wyborów celu pokoju lochu (M24): pokoje
    // Undercity z „target creature"/„target player"/wyborem stwora
    // z odsłoniętych kart kolejkują decyzję dla właściciela venture.
    // Wpis: { playerId, room, roomName, kind, effectType, params,
    // candidateIds, cards, restorePriorityTo }. Blokuje grę do
    // resolve_room_target (jak pendingBackups).
    pendingRoomTargets: [],
    // Flaga z efektu clash (Release the Ants): wygrany czar wraca do ręki
    // właściciela zamiast do grobu (rozstrzyga resolveTopOfStack).
    pendingSpellReturnToHand: false,
    // Oczekująca decyzja poświęcenia „of their choice\" (Grave Exchange):
    // cel — gracz, który ma poświęcić stwora własnego wyboru. Wpis:
    // { playerId, candidateIds, restorePriorityTo }. Blokuje grę do
    // resolve_sacrifice_choice (jak scry/surveil).
    pendingSacrifice: null,
    // Inicjatywa (CR 725): id gracza, który ją posiada (null = nikt). Kto ją
    // obejmuje po raz pierwszy, zagłębia się w Podziemia; posiadacz venture'uje
    // też na początku swojego upkeepu. Postęp lochu: undercityProgress[player].
    initiativePlayerId: null,
    undercityProgress: {},
    // „You descended this turn" (CR 700.x, Canonized in Blood): czy permanent
    // card wpadł do grobu gracza w bieżącej turze (z dowolnej strefy).
    // Zerowane przy zmianie tury, jak cardsDrawnThisTurn.
    descendedThisTurn: {},
    // Kolejka oczekujących decyzji backup (CR 702.165): źródło stwora, który
    // wszedł, kontroler i parametry. Blokuje grę do komend resolve_backup
    // (po jednej na wpis — jak pendingScry, ale decyzje mogą się kolejkować,
    // gdy kilka stworów z backup wejdzie w tej samej sekwencji).
    pendingBackups: [],
    // Ile kart każdy gracz dobrał w bieżącej turze (Evangel of Synthesis:
    // „as long as you've drawn two or more cards this turn"). Zerowane przy
    // zmianie tury, jak spellsCastThisTurn.
    cardsDrawnThisTurn: {},
    // Opóźnione triggery (CR 603.7): zaplanowane zdarzenia, które odpalą się
    // w przyszłym kroku (Puppeteer Clique: „at the beginning of your next end
    // step, exile it"). Wpis: { type, objectId, playerId, armedOnTurn }.
    delayedTriggers: [],
  };
  return initializeResources(state);
}

export function addObject(state, { id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, plot, plotted, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, bestow, aura, equipment, backup, colors = [], phyrexianManaCost = 0 }) {
  assertZone(zone);
  if (!state.players.some((p) => p.id === controllerId) || state.objects.has(id)) {
    throw new Error('Nieprawidłowy kontroler albo zajęte id obiektu');
  }
  const object = createGameObject({ id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, plot, plotted, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, bestow, aura, equipment, backup, colors, phyrexianManaCost });
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
    const before = state.events.length;
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
    if (scry.restorePriorityTo && state.players.some((p) => p.id === scry.restorePriorityTo)) {
      state.turn.priorityPlayerId = scry.restorePriorityTo;
    }
    state.pendingScry = null;
    state.events.push(event('scry_resolved', { playerId: cmd.playerId, total: scry.objectIds.length, bottomCount: bottomIds.length }));
    const resolvedEvents = state.events.slice(before);
    // Wstrzymany czar zakończony blokującym scry (np. Rage of Purphoros:
    // „...Scry 1\" jako ostatni efekt) dokańcza się po decyzji — inaczej
    // zostaje na stosie z pendingSpell na zawsze (dotyczy też scry w środku
    // listy efektów czaru, jak surveil w Curate).
    if (state.pendingSpell) {
      const pending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, pending.stackId, pending.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja surveil (CR 701.41): jak scry — blokuje wszystko poza
  // resolve_surveil. Po rozstrzygnięciu dokańczamy czar wstrzymany w środku
  // listy efektów (state.pendingSpell — np. Curate: surveil, potem dobranie).
  if (state.pendingSurveil) {
    if (cmd.type !== 'resolve_surveil') return reject('surveil_unresolved');
    if (cmd.playerId !== state.pendingSurveil.playerId) return reject('surveil_not_your_decision');
    const surveil = state.pendingSurveil;
    const millIds = Array.isArray(cmd.millIds) ? cmd.millIds : [];
    if (new Set(millIds).size !== millIds.length || millIds.some((id) => !surveil.objectIds.includes(id))) {
      return reject('illegal_surveil_choice');
    }
    // „The rest on top of your library in any order" (CR 701.41): topOrder to
    // permutacja kart, które NIE idą do grobu — kolejność od wierzchu.
    const rest = surveil.objectIds.filter((id) => !millIds.includes(id));
    const order = Array.isArray(cmd.topOrder) ? cmd.topOrder : rest;
    if (order.length !== rest.length || new Set(order).size !== order.length || order.some((id) => !rest.includes(id))) {
      return reject('illegal_surveil_order');
    }
    // Decyzja zamknięta PRZED zmianą stref — inwariant pendingSurveil wymaga,
    // by przeglądane karty były jeszcze w bibliotece (podczas ruchu do grobu
    // sprawdzany jest stan przejściowy).
    state.pendingSurveil = null;
    const before = state.events.length;
    for (const id of surveil.objectIds) {
      if (!millIds.includes(id)) continue;
      const object = state.objects.get(id);
      const graveId = `grave-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, id, 'graveyard', graveId);
      state.events.push(event('card_milled', {
        playerId: surveil.playerId, fromId: id, objectId: graveId, cardId: moved.cardId, object: moved,
      }));
    }
    // Karty pozostawione na wierzchu w wybranej kolejności; reszta biblioteki
    // (poniżej przeglądu) zachowuje względną kolejność.
    const orderSet = new Set(order);
    state.zones.library = [...order, ...state.zones.library.filter((id) => !orderSet.has(id))];
    if (surveil.restorePriorityTo && state.players.some((p) => p.id === surveil.restorePriorityTo)) {
      state.turn.priorityPlayerId = surveil.restorePriorityTo;
    }
    state.events.push(event('surveil_resolved', {
      playerId: cmd.playerId, total: surveil.objectIds.length, milledCount: millIds.length,
      topOrder: [...order],
    }));
    const resolvedEvents = state.events.slice(before);
    // Wstrzymany czar (np. Curate: „Surveil 2, then draw a card") dokańcza
    // swoje efekty i opuszcza stos dopiero po decyzji.
    if (state.pendingSpell) {
      const pending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, pending.stackId, pending.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
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
  // Oczekujący clash (CR 701.40): każdy gracz z odsłoniętą kartą decyduje,
  // kładzie ją na wierzch albo spód — po kolei (caster, potem przeciwnik).
  // Po ostatniej decyzji dokańczamy wstrzymany czar (powrót do ręki przy
  // wygranej — pendingSpellReturnToHand).
  if (state.pendingClash) {
    const clash = state.pendingClash;
    if (cmd.type !== 'resolve_clash_choice') return reject('clash_unresolved');
    if (cmd.playerId !== clash.choices[0]) return reject('clash_not_your_decision');
    const objectId = clash.cards[cmd.playerId];
    if (!objectId) return reject('illegal_clash_choice');
    const before = state.events.length;
    if (cmd.putOnBottom) {
      const library = state.zones.library.filter((id) => id !== objectId);
      state.zones.library = [...library, objectId];
    }
    state.events.push(event('clash_choice_resolved', {
      playerId: cmd.playerId, putOnBottom: Boolean(cmd.putOnBottom), remaining: clash.choices.length - 1,
    }));
    clash.choices.shift();
    const resolvedEvents = state.events.slice(before);
    if (clash.choices.length > 0) {
      // Kolej na następnego wybierającego (pętla symulacji pyta posiadacza
      // priorytetu — musi nim być gracz, którego decyzja jest teraz oczekiwana).
      state.turn.priorityPlayerId = clash.choices[0];
      return accepted(state, cmd, { ok: true, events: resolvedEvents });
    }
    if (clash.choices.length === 0) {
      state.pendingClash = null;
      if (clash.won && clash.returnToHandOnWin) state.pendingSpellReturnToHand = true;
      if (clash.restorePriorityTo && state.players.some((p) => p.id === clash.restorePriorityTo)) {
        state.turn.priorityPlayerId = clash.restorePriorityTo;
      } else {
        state.turn.priorityPlayerId = state.turn.activePlayerId;
      }
      // Wstrzymany czar dokańcza się po decyzjach obu graczy.
      if (state.pendingSpell) {
        const pending = state.pendingSpell;
        state.pendingSpell = null;
        resolvedEvents.push(...finishPendingSpell(state, pending.stackId, pending.effects));
      }
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekujący wybór celu pokoju lochu (M24): właściciel decyzji (gracz
  // venture) wybiera spośród LEGALNYCH celów (resolve_room_target); boty
  // odpowiadają deterministycznie. Jak inne decyzje — blokuje grę.
  if (state.pendingRoomTargets.length > 0) {
    const pending = state.pendingRoomTargets[0];
    if (cmd.type !== 'resolve_room_target') return reject('room_target_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('room_target_not_your_decision');
    if (!pending.candidateIds.includes(cmd.targetId)) return reject('illegal_room_target');
    // Legalność dynamiczna w chwili wyboru (cel mógł zniknąć).
    if (pending.kind === 'creature') {
      const target = state.objects.get(cmd.targetId);
      if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') {
        return reject('illegal_room_target');
      }
    } else if (pending.kind === 'player') {
      if (!state.players.some((player) => player.id === cmd.targetId)) return reject('illegal_room_target');
    } else if (pending.kind === 'revealed_creature') {
      const object = state.objects.get(cmd.targetId);
      if (!object || object.zone !== 'library' || object.controllerId !== pending.playerId) {
        return reject('illegal_room_target');
      }
    }
    const before = state.events.length;
    try {
      applyRoomTargetChoice(state, pending, cmd.targetId);
    } catch (error) {
      return reject(`illegal_room_target:${error.message}`);
    }
    state.pendingRoomTargets.shift();
    const events = state.events.slice(before);
    if (state.pendingRoomTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingRoomTargets[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events });
  }
  // Oczekująca decyzja poświęcenia „of their choice\" (Grave Exchange): cel
  // (gracz) wybiera stwora do poświęcenia — blokuje wszystko poza
  // resolve_sacrifice_choice, jak scry/surveil.
  if (state.pendingSacrifice) {
    if (cmd.type !== 'resolve_sacrifice_choice') return reject('sacrifice_unresolved');
    if (cmd.playerId !== state.pendingSacrifice.playerId) return reject('sacrifice_not_your_decision');
    if (!state.pendingSacrifice.candidateIds.includes(cmd.targetId)) return reject('illegal_sacrifice_target');
    const target = state.objects.get(cmd.targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') return reject('illegal_sacrifice_target');
    const pending = state.pendingSacrifice;
    const before = state.events.length;
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, target.id, 'graveyard', graveId);
    state.events.push(event('permanent_sacrificed', {
      fromId: target.id, objectId: graveId, playerId: target.controllerId, cardId: moved.cardId,
      sacrificeChoice: true,
    }));
    state.pendingSacrifice = null;
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    const resolvedEvents = state.events.slice(before);
    // Wstrzymany czar (Grave Exchange) dokańcza swoje efekty po decyzji.
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
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
        // Rozstrzygnięty czar mógł stworzyć blokującą decyzję (surveil/scry/
        // clash w środku listy efektów — np. Curate, Release the Ants).
        // Właściciel decyzji przejął już priorytet w efekcie; nadpisanie go
        // aktywnym graczem zablokowałoby grę (posiadacz priorytetu nie miałby
        // żadnej legalnej komendy).
        if (!state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && state.pendingBackups.length === 0) {
          state.turn.priorityPlayerId = state.turn.activePlayerId;
        }
      } else {
        const previousTurnNumber = state.turn.number;
        state.turn = nextTurnStep(state.turn, state.players);
        events.push(event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step }));
        if (state.turn.step === 'cleanup') { clearMarkedDamage(state); clearStatModifiers(state); }
        if (state.turn.number !== previousTurnNumber) {
          // Przeliczenie licznika czarów poprzedniej tury (transform).
          state.lastTurnSpellsCast = state.spellsCastThisTurn;
          state.spellsCastThisTurn = 0;
          state.cardsDrawnThisTurn = {};
          // „Descended this turn" (Canonized in Blood) — znacznik zeruje się
          // z nową turą, jak licznik dobrań.
          state.descendedThisTurn = {};
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

  if (cmd.type === 'plot_card') {
    try {
      const e = plotCard(state, cmd.playerId, cmd.objectId);
      return accepted(state, cmd, { ok: true, events: [e] });
    } catch (error) {
      return reject(`illegal_plot:${error.message}`);
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
      const e = castPermanent(state, cmd.playerId, cmd.objectId, {
        faceDown: Boolean(cmd.faceDown),
        phyrexianPayWithLife: cmd.phyrexianPayWithLife ?? 0,
      });
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
    state.cardsDrawnThisTurn[cmd.playerId] = (state.cardsDrawnThisTurn[cmd.playerId] ?? 0) + 1;
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
          plot: object.plot ?? null, aura: object.aura ?? null, equipment: object.equipment ?? null,
          backup: object.backup ?? null,
          // Kolory karty (publiczne) i fyryksyjskie symbole w koszcie —
          // bot planuje płatność „maną albo życiem" z widoku, nie z registry.
          colors: [...(object.colors ?? [])], phyrexianManaCost: object.phyrexianManaCost ?? 0,
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
        if (object.goaded === true) entry.goaded = true;
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
      return { id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone, plotted: Boolean(object.plotted) };
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
    if (hasPriority && !blockedByCombat && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && state.pendingRoomTargets.length === 0 && !pendingBackup) legalCommands.push(command('pass_priority', playerId));
  }
  // Oczekujące decyzje oferujemy SEKWENCYJNIE — w tej samej kolejności, w
  // jakiej bramki execute() je zamykają (backup → scry → surveil → clash →
  // wybór celu pokoju). Gdy w jednej komendzie zakolejkują się dwie decyzje
  // (np. scry Nefarious Imp + wybór celu z przejęcia inicjatywy), gracz widzi
  // wyłącznie tę pierwszą — kontroler nie może wybrać „niewłaściwej".
  const activeBackup = pendingBackup && pendingBackup.playerId === playerId;
  const activeScry = state.pendingScry && state.pendingScry.playerId === playerId;
  const activeSurveil = state.pendingSurveil && state.pendingSurveil.playerId === playerId;
  const activeClash = state.pendingClash && state.pendingClash.choices[0] === playerId;
  const activeRoomTarget = state.pendingRoomTargets.length > 0
    && state.pendingRoomTargets[0].playerId === playerId;
  const activeSacrifice = state.pendingSacrifice && state.pendingSacrifice.playerId === playerId;
  if (state.status === 'active' && activeBackup) {
    for (const objectId of state.zones.battlefield) {
      const object = state.objects.get(objectId);
      if (object?.zone === 'battlefield' && object.kind === 'creature') {
        legalCommands.unshift(command('resolve_backup', playerId, { targetId: objectId }));
      }
    }
  } else if (state.status === 'active' && activeScry) {
    // Oczekująca decyzja scry: właściciel dostaje wyliczone warianty (każda
    // przeglądana karta ma osobną decyzję wierzch/spód, w kolejności przeglądu).
    const variants = [[]];
    for (const objectId of state.pendingScry.objectIds) {
      variants.push(...variants.slice().map((chosen) => [...chosen, objectId]));
    }
    for (const bottomIds of variants) {
      legalCommands.unshift(command('resolve_scry', playerId, bottomIds.length > 0 ? { bottomIds } : {}));
    }
  } else if (state.status === 'active' && activeSurveil) {
    // Oczekująca decyzja surveil (CR 701.41): warianty = podzbiór kart do
    // grobu × permutacja reszty na wierzchu („in any order"). Przy większych
    // przeglądach (N>4) kolejność pozostaje pierwotna (ograniczenie enumeracji).
    const permutations = (arr) => {
      if (arr.length <= 1) return [arr];
      const out = [];
      for (let i = 0; i < arr.length; i += 1) {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        for (const perm of permutations(rest)) out.push([arr[i], ...perm]);
      }
      return out;
    };
    const variants = [[]];
    for (const objectId of state.pendingSurveil.objectIds) {
      variants.push(...variants.slice().map((chosen) => [...chosen, objectId]));
    }
    for (const millIds of variants) {
      const rest = state.pendingSurveil.objectIds.filter((id) => !millIds.includes(id));
      const orders = rest.length <= 4 ? permutations(rest) : [rest];
      for (const order of orders) {
        const data = { millIds };
        if (order.length > 0) data.topOrder = order;
        legalCommands.unshift(command('resolve_surveil', playerId, data));
      }
    }
  } else if (state.status === 'active' && activeClash) {
    // Oczekujący clash (CR 701.40): gracz, którego kolej, wybiera wierzch/spód
    // dla swojej odsłoniętej karty.
    legalCommands.unshift(command('resolve_clash_choice', playerId, { putOnBottom: true }));
    legalCommands.unshift(command('resolve_clash_choice', playerId, {}));
  } else if (state.status === 'active' && activeRoomTarget) {
    // Oczekujący wybór celu pokoju lochu (M24): właściciel decyzji wybiera
    // spośród legalnych celów (resolve_room_target).
    for (const targetId of state.pendingRoomTargets[0].candidateIds) {
      legalCommands.unshift(command('resolve_room_target', playerId, { targetId }));
    }
  } else if (state.status === 'active' && activeSacrifice) {
    // Oczekująca decyzja poświęcenia (Grave Exchange): cel wybiera stwora
    // do poświęcenia spośród kandydatów (resolve_sacrifice_choice).
    for (const targetId of state.pendingSacrifice.candidateIds) {
      legalCommands.unshift(command('resolve_sacrifice_choice', playerId, { targetId }));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && state.pendingRoomTargets.length === 0 && !pendingBackup && state.turn.step === 'draw' && state.turn.activePlayerId === playerId
    && !state.turn.drawnInStep) {
    const top = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
    legalCommands.unshift(command('draw_card', playerId, top ? { objectId: top } : {}));
  }
  const player = state.players.find((entry) => entry.id === playerId);
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && state.pendingRoomTargets.length === 0 && !pendingBackup && state.turn.priorityPlayerId === playerId) {
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
    // Plot jest specjalną akcją sorcery-speed z ręki: płaci koszt plot i
    // przenosi kartę do exile, gdzie później legalSpellCasts oferuje cast bez many.
    if (state.turn.activePlayerId === playerId
      && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
      && state.zones.stack.length === 0) {
      for (const id of state.zones.hand) {
        const object = state.objects.get(id);
        if (object?.controllerId === playerId && object.plot
          && (object.plot.cost ?? 0) <= (player.mana ?? 0)) {
          legalCommands.unshift(command('plot_card', playerId, { objectId: id }));
        }
      }
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
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && state.pendingRoomTargets.length === 0 && !pendingBackup && state.turn.activePlayerId === playerId
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
    // Phyrexian mana (CR 118.9): każdy symbol {W/P} można opłacić maną albo
    // 2 życiem — PlayerView wylicza WSZYSTKIE opłacalne warianty komendy
    // (phyrexianPayWithLife = liczba symboli opłaconych życiem), a UI grupuje
    // je w wybór jak wartości X. Kolejność: k rosnące, więc manowy wariant
    // (k=0) jest pierwszy — proste boty biorą najtańszy.
    const phyrexianVariants = (object) => {
      const symbols = object.phyrexianManaCost ?? 0;
      if (symbols === 0) return [null];
      const out = [];
      for (let k = 0; k <= symbols; k += 1) {
        const manaNeeded = (object.manaCost ?? 0) + (symbols - k);
        if (manaNeeded > (player.mana ?? 0)) continue;
        if (2 * k > (player.life ?? 0)) continue;
        out.push(k);
      }
      return out;
    };
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId !== playerId || object.aura) continue;
      if (object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') continue;
      // Morph/megamorph: zagranie twarzą w dół jako 2/2 za koszt morph ({3}) —
      // niezależnie od kosztu many karty (alternatywny koszt zagrania).
      if (object.kind === 'creature' && object.morph && (object.morph.cost ?? 0) <= (player.mana ?? 0)) {
        legalCommands.unshift(command('cast_permanent', playerId, { objectId: id, faceDown: true }));
      }
      // Podstawa kosztu zawsze z many — bez niej permanent nie jest grywalny.
      if ((object.manaCost ?? 0) > (player.mana ?? 0)) continue;
      // Kolejność wariantów: unshift wkłada na początek, więc iterujemy od
      // najdroższego życiowo (k=max) do najtańszego (k=0) — manowy wariant
      // ląduje PIERWSZY (proste boty biorą najtańszy).
      const variants = phyrexianVariants(object).slice().reverse();
      for (const k of variants) {
        legalCommands.unshift(command('cast_permanent', playerId,
          k === null ? { objectId: id } : { objectId: id, phyrexianPayWithLife: k }));
      }
    }
  }
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && state.pendingRoomTargets.length === 0 && !pendingBackup && state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase) && (player.landPlays ?? 0) > 0) {
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId === playerId && object.kind === 'land') legalCommands.unshift(command('play_land', playerId, { objectId: id }));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && state.pendingRoomTargets.length === 0 && !pendingBackup && state.turn.priorityPlayerId === playerId) {
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
  // Surveil — jak scry: patrzący widzi treść kart, przeciwnik tylko fakt.
  const pendingSurveil = state.pendingSurveil ? {
    playerId: state.pendingSurveil.playerId,
    count: state.pendingSurveil.objectIds.length,
    cards: state.pendingSurveil.playerId === playerId
      ? state.pendingSurveil.objectIds.map((id) => {
        const object = state.objects.get(id);
        return {
          id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone,
          kind: object.kind, power: object.power, toughness: object.toughness, manaCost: object.manaCost, spell: object.spell,
        };
      })
      : null,
  } : null;
  // Clash (CR 701.40): odsłonięte karty są jawne — obaj gracze widzą, czyja
  // to decyzja, ile zostało i którą kartę (cardId) się odkłada.
  const pendingClash = state.pendingClash ? {
    playerId: state.pendingClash.choices[0],
    count: state.pendingClash.choices.length,
    won: state.pendingClash.won,
    cards: { ...state.pendingClash.cards },
  } : null;
  // Wybór celu pokoju lochu: właściciel decyzji widzi pokój i (dla Throne)
  // odsłonięte karty; cele „creature" czyta z bitwiska (zones.battlefield).
  const pendingRoomTarget = state.pendingRoomTargets.length > 0 ? {
    playerId: state.pendingRoomTargets[0].playerId,
    room: state.pendingRoomTargets[0].room,
    roomName: state.pendingRoomTargets[0].roomName,
    kind: state.pendingRoomTargets[0].kind,
    effectType: state.pendingRoomTargets[0].effectType,
    cards: state.pendingRoomTargets[0].cards,
  } : null;
  // Inicjatywa i postęp w lochu Undercity są jawną informacją stołową
  // (znacznik jak monarchy; pokoje lochu są drukowane na karcie).
  const initiativePlayerId = state.initiativePlayerId ?? null;
  return Object.freeze({
    playerId, status: state.status, winnerId: state.winnerId, players, turn: { ...state.turn },
    zones, legalCommands, pendingScry, pendingSurveil, pendingBackup: pendingBackupView,
    pendingClash, pendingRoomTarget,
    initiativePlayerId,
    undercityProgress: { ...state.undercityProgress },
    descendedThisTurn: { ...state.descendedThisTurn },
  });
}
