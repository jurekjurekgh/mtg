import { createGameObject } from './identity.js';
import { assertZone, ZONES } from './zones.js';
import { command, event } from '../protocol/types.js';
import { initialTurn, jumpToStep, nextTurnStep } from './turn.js';
import { assertStateInvariants } from './invariants.js';
import { initializeResources, beginTurn, castAuraSpell, castPermanent, legalAuraCasts, playLand, producibleMana, tapLandForMana, canPayColoredCost } from './resources.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { parseManaCost, canPayManaCost, coloredPipsOf } from './mana-cost.js';
import { allControlledManaSources } from './mana-sources.js';

function hasColorForCardId(state, playerId, cardId, phyrexianPay = 0) {
  const costStr = MANA_COSTS[cardId];
  if (!costStr) return true;
  const parsed = parseManaCost(costStr);
  if (!parsed) return true;
  if (parsed.colored.length === 0 && parsed.hybrid.length === 0 && parsed.phyrexian.length === 0) return true;
  // Kolorowa pula (cz. 7): MtG-castability z UŻYTECZNYCH źródeł (pula + untapped).
  return canPayColoredCost(state, playerId, coloredPipsOf(cardId, phyrexianPay));
}
import { COMBAT_OPTION_CAP, declareAttackers, declareBlockers, legalAttackerOptions, legalBlockerOptions, resolveCombatDamage } from './combat.js';
import { castSpell, castCleave, legalSpellCasts, legalCleaveCasts, plotCard, resolveTopOfStack, finishPendingSpell, castEscape, legalEscapeCasts, castAdventure, legalAdventureCasts, castAdventureCreature, legalAdventureCreatureCasts, effectiveSpellManaCost } from './spells.js';
import { legalActivatedAbilities, activateAbility } from './abilities.js';
import { clearMarkedDamage, clearStatModifiers, effectiveKeywords, effectivePower, effectiveToughness, grantKeywordsUntilEndOfTurn, markDamage, modifyStats } from './permanents.js';
import { addCounter } from './counters.js';
import { runStateBasedActions } from './state-based.js';
import { graveyardCardTypeCount, processTriggers } from './triggers.js';
import { moveObjectDirectly } from './objects.js';
import { createBattlefieldToken } from './tokens.js';
import { changeLife } from './players.js';
import { shuffle } from './shuffle.js';
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
    // Liczba rzutów PER GRACZ w bieżącej turze (Illvoi Operative: „your
    // second spell each turn"). Naliczana w skanie zdarzeń rzutu
    // (triggers.js — każde zdarzenie skanowane raz), zerowana z turą.
    spellsCastThisTurnByPlayer: {},
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
    // Wpis: { playerId, sourceId, cardId, counters, grantKeywords,
    // restorePriorityTo } — decydent przejmuje priorytet na czas wyboru.
    pendingBackups: [],
    // Ile kart każdy gracz dobrał w bieżącej turze (Evangel of Synthesis:
    // „as long as you've drawn two or more cards this turn"). Zerowane przy
    // zmianie tury, jak spellsCastThisTurn.
    cardsDrawnThisTurn: {},
    // Aktywowane w bieżącej turze zdolności z limitem „activate only once
    // each turn" (Snarling Wolf): klucz `${objectId}:${abilityIndex}` → true.
    // Zerowane przy zmianie tury, jak cardsDrawnThisTurn.
    abilityActivatedThisTurn: {},
    // Oczekująca decyzja poświęcenia Food (Insatiable Appetite):
    // blokująca decyzja jak scry/surveil.
    pendingFoodChoice: null,
    // Oczekująca decyzja Discover (Geological Appraiser):
    // rzuć bez kosztu many albo weź do ręki; reszta na spód.
    pendingDiscover: null,
    // Oczekująca decyzja Craft (Lodestone Needle): wybór artefaktu do
    // wygnania wraz ze źródłem przed transformacją.
    pendingCraftExile: null,
    // Oczekująca decyzja Explore (Guidestone Compass):
    // wierzch albo grób karty (po +1/+1 na stworze).
    pendingExplore: null,
    // Oczekująca decyzja „put a multicolored creature card from your hand onto
    // the battlefield" (Dragon Arch): gracz wybiera, którego wielokolorowego
    // stwora z ręki położyć na bitwisko (albo żadnego — „you may").
    pendingHandCreature: null,
    // Kolejka decyzji devour (CR 702.82, Gorger Wurm): przy wejściu stwora
    // z devour kontroler może poświęcać swoje INNE stwory jeden po drugim —
    // każdy resolve_devour_choice{targetId} poświęca i dokłada devour.counters
    // liczników +1/+1 na źródło; resolve_devour_choice{done:true} kończy.
    // Wpis: { playerId, sourceId, counters, candidateIds, restorePriorityTo }.
    pendingDevours: [],
    // Kolejka decyzji endure (TDM — Kin-Tree Nurturer): „endures N" to wybór
    // gracza: N liczników +1/+1 na źródle ALBO token Spirit N/N biały.
    // Wpis: { playerId, sourceId, counters, restorePriorityTo }.
    pendingEndures: [],
    // Kolejka decyzji celu delirium (Fear of Burning Alive): trigger
    // „whenever a source you control deals noncombat damage to an opponent"
    // celuje w stwora kontrolowanego przez poszkodowanego gracza — wybór
    // należy do kontrolera triggera (nie do poszkodowanego). Wpis:
    // { playerId, sourceId, amount, opponentId, candidateIds, restorePriorityTo }.
    pendingDeliriumTargets: [],
    // Oczekujące wybory celu triggera mentora (CR 702.133, Boros Challenger):
    // wpisy jak przy delirium (playerId/sourceId/candidateIds + snapshot
    // siły źródła), rozstrzygane komendą resolve_mentor_target.
    pendingMentorTargets: [],
    // Oczekująca decyzja „put any number of target creature cards from your
    // graveyard on top of your library" (Forever Young): sekwencyjny wybór —
    // resolve_graveyard_top_choice{targetId} przenosi kartę na wierzch (ostatni
    // wybór ląduje najwyżej); resolve_graveyard_top_choice{done:true} kończy
    // i dokańcza wstrzymany czar (pendingSpell — „Draw a card.").
    // Wpis: { playerId, candidateIds, restorePriorityTo }.
    pendingGraveyardToTop: null,
    // Oczekująca decyzja prawa legend (CR 704.5j): state-based wykryło
    // duplikaty legendarnych permanentów o tej samej nazwie pod jednym
    // kontrolerem — właściciel wybiera resolve_legend_choice{keepId}, który
    // zostaje; pozostałe idą do grobu („dies" odpala się normalnie, bo
    // prawo legend kładzie obiekt do grobu Z BITWISKA, CR 700.4).
    // Wpis: { playerId, name, candidateIds, restorePriorityTo }.
    pendingLegendChoice: null,
    // Opóźnione triggery (CR 603.7): zaplanowane zdarzenia, które odpalą się
    // w przyszłym kroku (Puppeteer Clique: „at the beginning of your next end
    // step, exile it"). Wpis: { type, objectId, playerId, armedOnTurn }.
    delayedTriggers: [],
    // Prewencja obrażeń „prevent all damage that would be dealt to ... this
    // turn\" (Ethersworn Shieldmage, CR 614 w minimalnym wymiarze): lista
    // generycznych filtrów celu ({ typesInclude, isCreature }); markDamage
    // kasuje obrażenia spełniające filtr, a cleanup czyści tę listę.
    preventDamageThisTurn: [],
    // Tarcze prewencji „prevent the next N damage ... this turn" (Withstand,
    // CR 615 w minimalnym wymiarze): { targetId, remaining } — cel to gracz
    // albo obiekt; zużywane przez preventDamageTo, czyszczone w cleanup.
    damageShields: [],
    // Animacje z linkiem do źródła (Skilled Animator — „as long as this
    // creature remains on the battlefield"): wpisy { sourceId, targetId };
    // cofane przy odejściu źródła z bitwiska (objects.js).
    linkedAnimations: [],
    // Ostatnia płatność many (wpisuje spendMana): { playerId, amount,
    // treasure } — castPermanent czyta ją, żeby na permanencie zapisać, ile
    // many ze Skarba wydano na jego rzut (Marut).
    lastManaSpend: null,
    // Morbid (Caravan Vigil): czy JAKIKOLWIEK stwór zginął w tej turze.
    creatureDiedThisTurn: false,
    // Bloodthirst (Gorehorn Minotaurs): czy gracz zadał obrażenia przeciwnikowi
    // w tej turze. Klucz = playerId dealera.
    dealtDamageToOpponentThisTurn: {},
    moonlitUsedThisTurn: {},
  };
  return initializeResources(state);
}

export function addObject(state, { id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, plot, plotted, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, entersTappedCondition, bestow, aura, equipment, backup, colors = [], phyrexianManaCost = 0, enchantPlayer = false, saga = null, station = null, ownerId = null, devour = null, endure = null, cardName = null, bloodthirst = null, additionalCost = null, kicker = null, adventure = null }) {
  assertZone(zone);
  if (!state.players.some((p) => p.id === controllerId) || state.objects.has(id)) {
    throw new Error('Nieprawidłowy kontroler albo zajęte id obiektu');
  }
  const object = createGameObject({ id, instanceId, cardId, controllerId, ownerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, plot, plotted, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, entersTappedCondition, bestow, aura, equipment, backup, colors, phyrexianManaCost, enchantPlayer, saga, station, devour, endure, cardName, bloodthirst, additionalCost, kicker, adventure });
  state.objects.set(id, object);
  state.zones[zone].push(id);
  assertStateInvariants(state);
  return object;
}

function reject(reason) { return { ok: false, events: [event('command_rejected', { reason })] }; }

/**
 * Kandydaci pokoju lochu, którzy są legalni „teraz\". Między utworzeniem
 * decyzji a jej wyborem kandydat mógł zniknąć — np. trigger „deals combat
 * damage\" (Kappa Tech-Wrecker) wygnął stwora w TEJ SAMEJ komendzie, która
 * kolejkowała wybór celu pokoju Forge (degenerate case pełnej macierzy B0
 * 2026-08-05, `illegal_room_target` przy losowym bocie). legalCommands oferuje
 * wyłącznie ten zbiór, execute waliduje identycznie — komenda zawsze spójna.
 */
export function legalRoomTargetCandidates(state, pending) {
  const legal = [];
  for (const targetId of pending.candidateIds) {
    if (pending.kind === 'creature') {
      const target = state.objects.get(targetId);
      if (target && target.zone === 'battlefield' && target.kind === 'creature') legal.push(targetId);
    } else if (pending.kind === 'player') {
      if (state.players.some((player) => player.id === targetId)) legal.push(targetId);
    } else if (pending.kind === 'revealed_creature') {
      const object = state.objects.get(targetId);
      if (object && object.zone === 'library' && object.controllerId === pending.playerId) legal.push(targetId);
    } else {
      legal.push(targetId);
    }
  }
  return legal;
}

/**
 * Kandydaci do poświęcenia devour (CR 702.82): INNE stwory kontrolera
 * na bitwisku — liczone dynamicznie (kandydat mógł zniknąć między
 * zakolejkowaniem a wyborem; poświęcone w poprzednich krokach odpadają
 * same). Samo źródło poświęcić się nie może (liczniki lądują na źródle).
 */
function legalDevourCandidates(state, pending) {
  return state.zones.battlefield.filter((objectId) => {
    const candidate = state.objects.get(objectId);
    return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
      && candidate.controllerId === pending.playerId && candidate.id !== pending.sourceId;
  });
}

/**
 * Legalne cele triggera delirium (Fear of Burning Alive): stwory
 * poszkodowanego przeciwnika — dynamicznie, jak cele pokoi lochu.
 */
function legalDeliriumTargetCandidates(state, pending) {
  return state.zones.battlefield.filter((objectId) => {
    const candidate = state.objects.get(objectId);
    return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
      && candidate.controllerId === pending.opponentId;
  });
}

/**
 * Trigger delirium wciąż wymaga decyzji: intervening-if (CR 603.4/702.34)
 * utrzymuje się przy rozstrzyganiu i jest legalny cel. Gdy warunek zniknął
 * albo celów nie ma, zdolność nic nie robi (execute czyści ślepą głowę
 * kolejki, a widok nie blokuje pass — jak cele pokoi lochu).
 */
function deliriumDecisionPending(state, pending) {
  return legalDeliriumTargetCandidates(state, pending).length > 0
    && graveyardCardTypeCount(state, pending.playerId) >= 4;
}

/**
 * Legalni kandydaci celu mentora (CR 702.133): atakujący stwory kontrolera
 * o sile MNIEJSZEJ niż siła źródła. Siła źródła i celu jest sprawdzana
 * dynamicznie (intervening — cel mógł urosnąć, źródło zniknąć: wtedy
 * porównujemy do snapshotu z chwili odpalenia). Kandydaci muszą nadal
 * atakować (combat w toku) i leżeć na bitwisku.
 */
function legalMentorCandidates(state, pending) {
  const source = state.objects.get(pending.sourceId);
  const sourcePower = source?.zone === 'battlefield'
    ? (effectivePower(source, state) ?? 0)
    : pending.sourcePower;
  const attackers = state.combat?.attackers ?? [];
  return (pending.candidateIds ?? []).filter((objectId) => {
    const candidate = state.objects.get(objectId);
    return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
      && candidate.controllerId === pending.playerId
      && attackers.includes(objectId)
      && (effectivePower(candidate, state) ?? 0) < sourcePower;
  });
}

/** Mentor wciąż wymaga decyzji, gdy istnieje legalny cel (jak delirium). */
function mentorDecisionPending(state, pending) {
  return legalMentorCandidates(state, pending).length > 0;
}

/**
 * Kandydaci „put target creature cards from your graveyard on top" (Forever
 * Young): karty-stwory w grobie gracza (tokeny — z ustawionym name — nie są
 * kartami).
 */
function graveyardToTopCandidates(state, playerId) {
  return state.zones.graveyard.filter((objectId) => {
    const object = state.objects.get(objectId);
    return object && object.controllerId === playerId && object.kind === 'creature' && object.name == null;
  });
}

/**
 * Auto-skip ślepych blokujących decyzji: kandydaci mogli zniknąć po
 * utworzeniu kolejki (wygnanie/śmierć/zmiana kontroli w tej samej komendzie
 * albo w serii zdarzeń ze skanu wieloprzebiegowego). Pokój bez celu gaśnie
 * jak czar bez legalnego celu (CR 608.2b), devour bez poświęceń nie ma
 * decyzji, delirium bez intervening-if (CR 603.4) nic nie robi.
 * Wywoływana na starcie execute() ORAZ na końcu accepted() — zwraca
 * wyemitowane zdarzenia, żeby accepted() mogło dołączyć je do wyniku.
 */
function pruneDeadPendingDecisions(state) {
  const emitted = [];
  while (state.pendingRoomTargets.length > 0
    && legalRoomTargetCandidates(state, state.pendingRoomTargets[0]).length === 0) {
    const pending = state.pendingRoomTargets[0];
    const e = { type: 'room_target_resolved', playerId: pending.playerId, room: pending.room, roomName: pending.roomName, targetId: null, noLegalTargets: true };
    state.events.push(e); emitted.push(e);
    state.pendingRoomTargets.shift();
    if (state.pendingRoomTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingRoomTargets[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
  }
  while (state.pendingDevours.length > 0
    && legalDevourCandidates(state, state.pendingDevours[0]).length === 0) {
    const pending = state.pendingDevours.shift();
    const e = event('devour_choice_resolved', {
      playerId: pending.playerId, sourceId: pending.sourceId,
      cardId: state.objects.get(pending.sourceId)?.cardId ?? null,
      done: true, skipped: true,
    });
    state.events.push(e); emitted.push(e);
    if (state.pendingDevours.length > 0) {
      state.turn.priorityPlayerId = state.pendingDevours[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
  }
  while (state.pendingDeliriumTargets.length > 0
    && !deliriumDecisionPending(state, state.pendingDeliriumTargets[0])) {
    const pending = state.pendingDeliriumTargets.shift();
    const e = event('delirium_target_resolved', {
      playerId: pending.playerId, sourceId: pending.sourceId,
      cardId: state.objects.get(pending.sourceId)?.cardId ?? null, noEffect: true,
    });
    state.events.push(e); emitted.push(e);
    if (state.pendingDeliriumTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingDeliriumTargets[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
  }
  // Ślepe wybory mentora (cel umarł/urósł, źródło zniknęło albo combat się
  // zakończył) zdejmujemy z głowy — jak przy celach pokoi lochu/delirium:
  // trigger bez legalnego celu nic nie robi i nie blokuje gry.
  while (state.pendingMentorTargets.length > 0
    && !mentorDecisionPending(state, state.pendingMentorTargets[0])) {
    const pending = state.pendingMentorTargets.shift();
    const e = event('mentor_target_resolved', {
      playerId: pending.playerId, sourceId: pending.sourceId,
      cardId: state.objects.get(pending.sourceId)?.cardId ?? null, noEffect: true,
    });
    state.events.push(e); emitted.push(e);
    if (state.pendingMentorTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingMentorTargets[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
  }
  return emitted;
}

/**
 * Decydent pierwszej oczekującej blokującej decyzji — w TEJ SAMEJ kolejności,
 * w jakiej execute() sprawdza bramki (scry → surveil → backup → clash → cel
 * pokoju → poświęcenie → food → discover → explore → craft → stwór z ręki →
 * devour → endure → delirium → grób na wierzch → prawo legend). accepted()
 * nadaje temu graczowi priorytet, więc oferta (playerView) i walidacja
 * (execute) zawsze dotyczą tej samej decyzji — także gdy w jednej komendzie
 * powstało kilka decyzji różnych typów (skan wieloprzebiegowy, np. scry
 * z pokoju lochu i cel delirium z obrażeń triggera w tym samym upkeep).
 */
function firstPendingDecisionPlayerId(state) {
  if (state.pendingScry) return state.pendingScry.playerId;
  if (state.pendingSurveil) return state.pendingSurveil.playerId;
  if (state.pendingBackups.length > 0) return state.pendingBackups[0].playerId;
  if (state.pendingClash) return state.pendingClash.choices[0];
  if (state.pendingRoomTargets.length > 0) return state.pendingRoomTargets[0].playerId;
  if (state.pendingSacrifice) return state.pendingSacrifice.playerId;
  if (state.pendingFoodChoice) return state.pendingFoodChoice.playerId;
  if (state.pendingDiscover) return state.pendingDiscover.playerId;
  if (state.pendingExplore) return state.pendingExplore.playerId;
  if (state.pendingCraftExile) return state.pendingCraftExile.playerId;
  if (state.pendingHandCreature) return state.pendingHandCreature.playerId;
  if (state.pendingDevours.length > 0) return state.pendingDevours[0].playerId;
  if (state.pendingEndures.length > 0) return state.pendingEndures[0].playerId;
  if (state.pendingDeliriumTargets.length > 0) return state.pendingDeliriumTargets[0].playerId;
  if (state.pendingMentorTargets.length > 0) return state.pendingMentorTargets[0].playerId;
  if (state.pendingGraveyardToTop) return state.pendingGraveyardToTop.playerId;
  return state.pendingLegendChoice?.playerId ?? null;
}

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
  // Trackery Bloodthirst/Morbid: skan zdarzeń bieżącej komendy.
  for (const e of result.events) {
    if (e.type === 'object_moved' && e.fromZone === 'battlefield' && e.toZone === 'graveyard'
      && e.object?.kind === 'creature') state.creatureDiedThisTurn = true;
    if (e.type === 'damage_dealt' && state.players.some((pl) => pl.id === e.target)) {
      const src = state.objects.get(e.source);
      const dealer = src?.controllerId;
      if (dealer && dealer !== e.target) state.dealtDamageToOpponentThisTurn[dealer] = true;
    }
  }
  // Ślepe decyzje gasimy także PO triggerach — kandydat mógł zniknąć od
  // zdarzeń tej komendy (np. cel pokoju zginął od obrażeń triggera).
  const prunedEvents = pruneDeadPendingDecisions(state);
  if (prunedEvents.length > 0) result.events = [...result.events, ...prunedEvents];
  // Inwariant planowania decyzji: gdy po komendzie czeka blokująca decyzja,
  // priorytet należy do JEJ decydenta (pierwszej w porządku bramek execute).
  // Ze skanem wieloprzebiegowym decyzje różnych typów mogą powstać w jednej
  // komendzie (np. scry z venture + cel delirium z obrażeń triggera) —
  // bez wyrównania posiadacz priorytetu nie miałby legalnej komendy.
  const decisionOwner = state.status === 'active' ? firstPendingDecisionPlayerId(state) : null;
  if (decisionOwner && state.turn.priorityPlayerId !== decisionOwner) {
    state.turn.priorityPlayerId = decisionOwner;
  }
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
    // Po decyzji: kolejka niepusta → priorytet do właściciela następnego
    // wpisu; pusta → powrót do posiadacza sprzed pierwszej decyzji (jak
    // pendingDevours/pendingEndures).
    if (state.pendingBackups.length > 0) {
      state.turn.priorityPlayerId = state.pendingBackups[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
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
  // Auto-skip ślepych decyzji przed bramkami zwykłych pendingów (wspólna
  // prozedura z accepted()): pokój bez celu gaśnie jak czar bez legalnego
  // celu (CR 608.2b) i gra toczy się dalej.
  pruneDeadPendingDecisions(state);
  if (state.pendingRoomTargets.length > 0) {
    const pending = state.pendingRoomTargets[0];
    if (cmd.type !== 'resolve_room_target') return reject('room_target_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('room_target_not_your_decision');
    // Legalność dynamiczna w chwili wyboru (cel mógł zniknąć) — ta sama
    // lista, którą wyliczają legalCommands, więc oferta i walidacja są spójne.
    if (!legalRoomTargetCandidates(state, pending).includes(cmd.targetId)) return reject('illegal_room_target');
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
  // Oczekująca decyzja poświęcenia Food (Insatiable Appetite):
  // blokuje grę do resolve_food_choice.
  if (state.pendingFoodChoice) {
    const food = state.pendingFoodChoice;
    if (cmd.type !== 'resolve_food_choice') return reject('food_choice_unresolved');
    if (cmd.playerId !== food.playerId) return reject('food_choice_not_your_decision');
    const before = state.events.length;
    let sacrificed = false;
    if (food.hasFood && cmd.sacrifice) {
      // Poświęć pierwszego Food z listy (deterministycznie).
      const foodId = food.foodIds[0];
      const foodObj = state.objects.get(foodId);
      if (foodObj && foodObj.zone === 'battlefield') {
        const graveId = `grave-${state.objectSequence++}`;
        moveObjectDirectly(state, foodId, 'graveyard', graveId);
        state.events.push(event('permanent_sacrificed', {
          fromId: foodId, objectId: graveId, playerId: food.playerId, cardId: foodObj.cardId,
          sacrificeFood: true,
        }));
        sacrificed = true;
      }
    }
    state.pendingFoodChoice = null;
    // Zastosuj wynik pump na docelowym stworze.
    const creatureId = food.creatureId;
    const amount = sacrificed ? 5 : 3;
    const creatureObj = state.objects.get(creatureId);
    if (creatureObj && creatureObj.zone === 'battlefield' && creatureObj.kind === 'creature') {
      modifyStats(state, creatureId, { power: amount, toughness: amount });
    }
    state.events.push(event('food_choice_resolved', { playerId: food.playerId, sacrificed, creatureId }));
    if (food.restorePriorityTo && state.players.some((p) => p.id === food.restorePriorityTo)) {
      state.turn.priorityPlayerId = food.restorePriorityTo;
    }
    const resolvedEvents = state.events.slice(before);
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja Discover (Geological Appraiser): rzuć bez kosztu
  // albo weź do ręki; reszta na spód biblioteki.
  if (state.pendingDiscover) {
    const disc = state.pendingDiscover;
    if (cmd.type !== 'resolve_discover_choice') return reject('discover_unresolved');
    if (cmd.playerId !== disc.playerId) return reject('discover_not_your_decision');
    if (typeof cmd.castFree !== 'boolean') return reject('illegal_discover_choice');
    const before = state.events.length;
    const foundObj = state.objects.get(disc.foundExileId);
    if (!foundObj) return reject('illegal_discover_choice');
    if (cmd.castFree && foundObj.kind === 'spell') {
      // Rzuć czar (instant/sorcery) bez kosztu many — idzie na stos.
      const stackId = `spell-${state.objectSequence++}`;
      moveObjectDirectly(state, disc.foundExileId, 'stack', stackId);
      const spellTargets = (foundObj.spell?.targets ?? []);
      const stacked = Object.freeze({ ...state.objects.get(stackId), tapped: false, chosenTargets: [], freeDiscover: true });
      state.objects.set(stackId, stacked);
      state.spellsCastThisTurn += 1;
      state.events.push(event('spell_cast', { playerId: disc.playerId, fromId: disc.foundExileId, object: stacked, cardId: foundObj.cardId, targets: [], discover: true, manaSpent: 0 }));
    } else if (cmd.castFree && (foundObj.kind === 'creature' || foundObj.kind === 'artifact' || foundObj.kind === 'enchantment')) {
      // Rzuć permanent bez kosztu many — idzie na bitwisko.
      const bfId = `permanent-${state.objectSequence++}`;
      moveObjectDirectly(state, disc.foundExileId, 'battlefield', bfId);
      const perm = Object.freeze({ ...state.objects.get(bfId), summoningSickness: true, wasCast: true });
      state.objects.set(bfId, perm);
      state.spellsCastThisTurn += 1;
      state.events.push(event('permanent_cast', { playerId: disc.playerId, fromId: disc.foundExileId, object: perm, manaCost: 0, discover: true, manaSpent: 0 }));
    } else {
      // Do ręki.
      const handId = `hand-${state.objectSequence++}`;
      moveObjectDirectly(state, disc.foundExileId, 'hand', handId);
      state.events.push(event('object_moved', { fromId: disc.foundExileId, object: state.objects.get(handId), fromZone: 'exile', toZone: 'hand', discover: true }));
    }
    // Reszta na spód biblioteki.
    if (disc.restExileIds.length > 0) {
      const shuffled = shuffle(disc.restExileIds, state.seed + state.objectSequence);
      for (const exileId of shuffled) {
        const libId = `library-${state.objectSequence++}`;
        moveObjectDirectly(state, exileId, 'library', libId);
      }
    }
    state.events.push(event('discover_resolved', { playerId: disc.playerId, amount: disc.amount, foundCardId: disc.foundCardId, castFree: cmd.castFree }));
    state.pendingDiscover = null;
    if (disc.restorePriorityTo && state.players.some((p) => p.id === disc.restorePriorityTo)) {
      state.turn.priorityPlayerId = disc.restorePriorityTo;
    }
    const resolvedEvents = state.events.slice(before);
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja Explore (Guidestone Compass): wierzch albo grób.
  if (state.pendingExplore) {
    const expl = state.pendingExplore;
    if (cmd.type !== 'resolve_explore_choice') return reject('explore_unresolved');
    if (cmd.playerId !== expl.playerId) return reject('explore_not_your_decision');
    const before = state.events.length;
    const obj = state.objects.get(expl.objectId);
    if (!obj) {
      state.pendingExplore = null;
      return reject('illegal_explore_choice');
    }
    if (cmd.putInGraveyard) {
      const graveId = `grave-${state.objectSequence++}`;
      moveObjectDirectly(state, expl.objectId, 'graveyard', graveId);
      state.events.push(event('card_milled', { playerId: expl.playerId, fromId: expl.objectId, objectId: graveId, cardId: obj.cardId, explore: true }));
    } else {
      // Na wierzch biblioteki (zostaje na swoim miejscu w bibliotece).
    }
    state.events.push(event('explore_resolved', { playerId: expl.playerId, foundCardId: expl.cardId, isLand: false, putInGraveyard: cmd.putInGraveyard }));
    state.pendingExplore = null;
    if (expl.restorePriorityTo && state.players.some((p) => p.id === expl.restorePriorityTo)) {
      state.turn.priorityPlayerId = expl.restorePriorityTo;
    }
    const resolvedEvents = state.events.slice(before);
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja Craft exile (Lodestone Needle): wybór artefaktu
  // do wygnania wraz ze źródłem przed transformacją.
  if (state.pendingCraftExile) {
    const craft = state.pendingCraftExile;
    if (cmd.type !== 'resolve_craft_exile') return reject('craft_exile_unresolved');
    if (cmd.playerId !== craft.playerId) return reject('craft_exile_not_your_decision');
    if (!craft.candidateIds.includes(cmd.targetId)) return reject('illegal_craft_target');
    const before = state.events.length;
    // 1. Exile the chosen artifact.
    const chosenObj = state.objects.get(cmd.targetId);
    if (!chosenObj) return reject('illegal_craft_target');
    const chosenExileId = `exile-${state.objectSequence++}`;
    moveObjectDirectly(state, cmd.targetId, 'exile', chosenExileId);
    state.events.push(event('object_moved', { fromId: cmd.targetId, object: state.objects.get(chosenExileId), fromZone: chosenObj.zone, toZone: 'exile', craft: true }));
    // 2. Exile the source artifact.
    const sourceExileId = `exile-${state.objectSequence++}`;
    moveObjectDirectly(state, craft.sourceId, 'exile', sourceExileId);
    state.events.push(event('object_moved', { fromId: craft.sourceId, object: state.objects.get(sourceExileId), fromZone: 'battlefield', toZone: 'exile', craft: true }));
    // 3. Return source transformed to battlefield.
    const bfId = `permanent-${state.objectSequence++}`;
    const moved = state.objects.get(sourceExileId);
    if (moved) {
      const target = craft.transformTo;
      const transformed = Object.freeze({
        ...moved,
        id: bfId, zone: 'battlefield',
        cardId: target.cardId,
        cardName: target.cardName ?? moved.cardName ?? null,
        power: target.power,
        toughness: target.toughness,
        abilities: target.abilities,
        keywords: target.keywords ?? [],
        subtypes: target.subtypes ?? [],
        transformTo: {
          cardId: moved.cardId,
          cardName: moved.cardName ?? null,
          power: moved.power,
          toughness: moved.toughness,
          abilities: moved.abilities,
          keywords: moved.keywords ?? [],
          subtypes: moved.subtypes ?? [],
        },
      });
      state.objects.delete(sourceExileId);
      state.objects.set(bfId, transformed);
      state.zones.exile = state.zones.exile.filter((id) => id !== sourceExileId);
      state.zones.battlefield.push(bfId);
      state.events.push(event('object_moved', { fromId: sourceExileId, object: transformed, fromZone: 'exile', toZone: 'battlefield', craft: true }));
      state.events.push(event('object_transformed', { objectId: bfId, fromCardId: moved.cardId, cardId: target.cardId }));
    }
    state.pendingCraftExile = null;
    if (craft.restorePriorityTo && state.players.some((p) => p.id === craft.restorePriorityTo)) {
      state.turn.priorityPlayerId = craft.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekująca decyzja „put a multicolored creature from your hand onto the
  // battlefield" (Dragon Arch): gracz wybiera stwora z ręki albo nic („you may").
  if (state.pendingHandCreature) {
    const pending = state.pendingHandCreature;
    if (cmd.type !== 'resolve_hand_creature') return reject('hand_creature_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('hand_creature_not_your_decision');
    const before = state.events.length;
    if (cmd.targetId != null) {
      if (!pending.candidateIds.includes(cmd.targetId)) return reject('illegal_hand_creature_target');
      const card = state.objects.get(cmd.targetId);
      if (!card || card.zone !== 'hand' || card.controllerId !== pending.playerId) return reject('illegal_hand_creature_target');
      const bfId = `permanent-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, cmd.targetId, 'battlefield', bfId);
      const permanent = Object.freeze({ ...moved, summoningSickness: true });
      state.objects.set(bfId, permanent);
      state.events.push(event('permanent_entered_battlefield', {
        fromId: cmd.targetId, objectId: bfId, object: permanent, cardId: permanent.cardId,
        controllerId: pending.playerId, putFromHand: true,
      }));
      state.events.push(event('hand_creature_choice_resolved', { playerId: pending.playerId, putCreature: true, cardId: permanent.cardId }));
    } else {
      state.events.push(event('hand_creature_choice_resolved', { playerId: pending.playerId, putCreature: false }));
    }
    state.pendingHandCreature = null;
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekująca decyzja devour (CR 702.82, Gorger Wurm): kontroler sekwencyjnie
  // poświęca swoje INNE stwory — każdy resolve_devour_choice{targetId}
  // poświęca i dokłada counters liczników +1/+1 na źródło; { done: true }
  // kończy („any number" — także zero). Blokuje grę (po jednej na wpis, jak
  // pendingBackups).
  if (state.pendingDevours.length > 0) {
    const pending = state.pendingDevours[0];
    if (cmd.type !== 'resolve_devour_choice') return reject('devour_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('devour_not_your_decision');
    const before = state.events.length;
    const sourceCardId = state.objects.get(pending.sourceId)?.cardId ?? null;
    if (cmd.done === true) {
      state.pendingDevours.shift();
      state.events.push(event('devour_choice_resolved', {
        playerId: cmd.playerId, sourceId: pending.sourceId, cardId: sourceCardId, done: true,
        remaining: state.pendingDevours.length,
      }));
      if (state.pendingDevours.length > 0) {
        state.turn.priorityPlayerId = state.pendingDevours[0].playerId;
      } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
        state.turn.priorityPlayerId = pending.restorePriorityTo;
      }
      return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
    }
    if (!legalDevourCandidates(state, pending).includes(cmd.targetId)) return reject('illegal_devour_target');
    const moved = moveObjectDirectly(state, cmd.targetId, 'graveyard', `grave-${state.objectSequence++}`);
    state.events.push(event('permanent_sacrificed', {
      fromId: cmd.targetId, objectId: moved.id, playerId: pending.playerId, cardId: moved.cardId, devour: true,
    }));
    // Liczniki lądują na źródle — o ile nie opuściło bitwiska (np. triggerem
    // z poświęcenia); licznika nie można położyć na obiekcie w innej strefie.
    const source = state.objects.get(pending.sourceId);
    const applied = Boolean(source && source.zone === 'battlefield' && source.kind === 'creature');
    if (applied) addCounter(state, pending.sourceId, '+1/+1', pending.counters);
    let autoClosed = false;
    // Poświęcenie ostatniego kandydata zamyka decyzję automatycznie — gracz
    // nie może poświęcić więcej, a wisząca decyzja bez wariantów byłaby ślepa
    // (oferta done, którego wykonanie odrzuciłby auto-skip z pustą kolejką).
    if (legalDevourCandidates(state, pending).length === 0) {
      state.pendingDevours.shift();
      autoClosed = true;
      if (state.pendingDevours.length > 0) {
        state.turn.priorityPlayerId = state.pendingDevours[0].playerId;
      } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
        state.turn.priorityPlayerId = pending.restorePriorityTo;
      }
    }
    state.events.push(event('devour_choice_resolved', {
      playerId: cmd.playerId, sourceId: pending.sourceId, cardId: sourceCardId,
      targetId: cmd.targetId, targetCardId: moved.cardId, counters: pending.counters,
      applied, done: autoClosed, autoClosed, remaining: state.pendingDevours.length,
    }));
    // Decyzja pozostaje otwarta wyłącznie, gdy są jeszcze kandydaci —
    // priorytet bez zmian, wpis kolejki zostaje do jawnego done.
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekująca decyzja endure (TDM — Kin-Tree Nurturer): N liczników +1/+1
  // na źródle ALBO token Spirit N/N biały. Liczniki są legalne tylko, gdy
  // źródło wciąż jest stworem na bitwisku (licznika nie można położyć na
  // obiekcie w innej strefie); token jest legalny zawsze.
  if (state.pendingEndures.length > 0) {
    const pending = state.pendingEndures[0];
    if (cmd.type !== 'resolve_endure_choice') return reject('endure_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('endure_not_your_decision');
    const source = state.objects.get(pending.sourceId);
    const countersLegal = Boolean(source && source.zone === 'battlefield' && source.kind === 'creature');
    if (cmd.mode !== 'counters' && cmd.mode !== 'token') return reject('illegal_endure_choice');
    if (cmd.mode === 'counters' && !countersLegal) return reject('illegal_endure_choice');
    const before = state.events.length;
    let tokenId = null;
    if (cmd.mode === 'counters') {
      addCounter(state, pending.sourceId, '+1/+1', pending.counters);
    } else {
      const token = createBattlefieldToken(state, pending.playerId, {
        cardId: 'token_spirit', name: 'Spirit', kind: 'creature',
        power: pending.counters, toughness: pending.counters,
        colors: ['W'], types: ['Creature'], subtypes: ['Spirit'],
      });
      tokenId = token.id;
    }
    state.pendingEndures.shift();
    state.events.push(event('endure_choice_resolved', {
      playerId: cmd.playerId, sourceId: pending.sourceId, cardId: source?.cardId ?? null,
      mode: cmd.mode, counters: pending.counters, tokenId,
      remaining: state.pendingEndures.length,
    }));
    if (state.pendingEndures.length > 0) {
      state.turn.priorityPlayerId = state.pendingEndures[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekujący wybór celu triggera delirium (Fear of Burning Alive):
  // kontroler triggera wybiera stwora poszkodowanego gracza; źródło zadaje
  // mu obrażenia równe obrażeniom, które odpaliły trigger (snapshot amount).
  // Lifelink/infect źródła respektuje generyczna ścieżka obrażeń (markDamage
  // na stworze — tu bez lifelink, jak przy efekcie damage).
  if (state.pendingDeliriumTargets.length > 0) {
    const pending = state.pendingDeliriumTargets[0];
    if (cmd.type !== 'resolve_delirium_target') return reject('delirium_target_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('delirium_target_not_your_decision');
    if (!legalDeliriumTargetCandidates(state, pending).includes(cmd.targetId)) return reject('illegal_delirium_target');
    const before = state.events.length;
    state.events.push(event('damage_dealt', {
      source: pending.sourceId, target: cmd.targetId, amount: pending.amount, combat: false,
    }));
    markDamage(state, cmd.targetId, pending.amount);
    state.pendingDeliriumTargets.shift();
    state.events.push(event('delirium_target_resolved', {
      playerId: cmd.playerId, sourceId: pending.sourceId,
      cardId: state.objects.get(pending.sourceId)?.cardId ?? null,
      targetId: cmd.targetId, targetCardId: state.objects.get(cmd.targetId)?.cardId ?? null,
      amount: pending.amount, remaining: state.pendingDeliriumTargets.length,
    }));
    if (state.pendingDeliriumTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingDeliriumTargets[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekujący wybór celu mentora (CR 702.133, Boros Challenger): kontroler
  // wskazuje atakującego stwora o mniejszej sile — CEL dostaje licznik +1/+1.
  // Siła porównywana dynamicznie przy rozstrzygnięciu (intervening — cel
  // mógł urosnąć albo źródło zniknąć; wtedy liczy się snapshot z odpalenia).
  if (state.pendingMentorTargets.length > 0) {
    const pending = state.pendingMentorTargets[0];
    if (cmd.type !== 'resolve_mentor_target') return reject('mentor_target_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('mentor_target_not_your_decision');
    if (!legalMentorCandidates(state, pending).includes(cmd.targetId)) return reject('illegal_mentor_target');
    const before = state.events.length;
    addCounter(state, cmd.targetId, '+1/+1', 1);
    state.pendingMentorTargets.shift();
    state.events.push(event('mentor_target_resolved', {
      playerId: cmd.playerId, sourceId: pending.sourceId,
      cardId: state.objects.get(pending.sourceId)?.cardId ?? null,
      targetId: cmd.targetId, targetCardId: state.objects.get(cmd.targetId)?.cardId ?? null,
      remaining: state.pendingMentorTargets.length,
    }));
    if (state.pendingMentorTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingMentorTargets[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekująca decyzja „put any number of target creature cards from your
  // graveyard on top of your library" (Forever Young): sekwencyjny wybór —
  // { targetId } przenosi kartę na wierzch (ostatni wybór ląduje najwyżej),
  // { done: true } kończy i dokańcza wstrzymany czar (pendingSpell —
  // „Draw a card.").
  if (state.pendingGraveyardToTop) {
    const pending = state.pendingGraveyardToTop;
    if (cmd.type !== 'resolve_graveyard_top_choice') return reject('graveyard_top_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('graveyard_top_not_your_decision');
    const before = state.events.length;
    if (cmd.done === true) {
      state.pendingGraveyardToTop = null;
      state.events.push(event('graveyard_top_choice_resolved', { playerId: cmd.playerId, done: true }));
      if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
        state.turn.priorityPlayerId = pending.restorePriorityTo;
      }
      const resolvedEvents = state.events.slice(before);
      // Wstrzymany czar (Forever Young: „Draw a card." po przeniesieniach)
      // dokańcza swoje efekty po decyzji.
      if (state.pendingSpell) {
        const spellPending = state.pendingSpell;
        state.pendingSpell = null;
        resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
      }
      return accepted(state, cmd, { ok: true, events: resolvedEvents });
    }
    if (!graveyardToTopCandidates(state, pending.playerId).includes(cmd.targetId)) return reject('illegal_graveyard_top_target');
    const libId = `library-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, cmd.targetId, 'library', libId);
    // moveObjectDirectly dokłada na KONIEC zones.library (spód) — „on top of
    // your library" to pozycja przed pierwszą własną kartą od wierzchu
    // (dobranie bierze pierwszą własną). Pusta biblioteka: koniec = wierzch.
    const library = state.zones.library.filter((id) => id !== libId);
    const topIndex = library.findIndex((id) => state.objects.get(id)?.controllerId === pending.playerId);
    if (topIndex === -1) library.push(libId);
    else library.splice(topIndex, 0, libId);
    state.zones.library = library;
    state.events.push(event('graveyard_top_choice_resolved', {
      playerId: cmd.playerId, targetId: cmd.targetId, movedId: libId,
      cardId: moved.cardId, done: false,
    }));
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Prawo legend (CR 704.5j): state-based actions zakolejkowały wybór —
  // właściciel duplikatów wskazuje resolve_legend_choice{keepId}, który
  // legendarny permanent o danej nazwie ZOSTAJE; pozostałe idą do grobu.
  // „Dies" odpala się normalnie (obiekty przechodzą z bitwiska do grobu,
  // CR 700.4) — zdarzenie object_moved dokłada scan triggerów w accepted().
  if (state.pendingLegendChoice) {
    const pending = state.pendingLegendChoice;
    if (cmd.type !== 'resolve_legend_choice') return reject('legend_choice_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('legend_choice_not_your_decision');
    if (!pending.candidateIds.includes(cmd.keepId)) return reject('illegal_legend_choice');
    const before = state.events.length;
    const keptCardId = state.objects.get(cmd.keepId)?.cardId ?? null;
    const buriedIds = [];
    const buriedCardIds = [];
    for (const objectId of pending.candidateIds) {
      if (objectId === cmd.keepId) continue;
      // Finality counter (CR 122.1b): śmierć z prawa legend też jest śmiercią
      // — obiekt z finality idzie do exile zamiast do grobu.
      const doomed = state.objects.get(objectId);
      const toZone = (doomed?.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
      const moved = moveObjectDirectly(state, objectId, toZone, `${toZone}-${state.objectSequence++}`);
      buriedIds.push(objectId);
      buriedCardIds.push(moved.cardId);
      state.events.push(event('object_moved', {
        fromId: objectId, object: moved, fromZone: 'battlefield', toZone, legendRule: true,
      }));
    }
    state.pendingLegendChoice = null;
    state.events.push(event('legend_rule_resolved', {
      playerId: cmd.playerId, name: pending.name,
      keepId: cmd.keepId, keepCardId: keptCardId, buriedIds, buriedCardIds,
    }));
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
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
        // Rozstrzygnięty czar mógł stworzyć blokującą decyzję (surveil/scry/
        // clash w środku listy efektów — np. Curate, Release the Ants).
        // Właściciel decyzji przejął już priorytet w efekcie; nadpisanie go
        // aktywnym graczem zablokowałoby grę (posiadacz priorytetu nie miałby
        // żadnej legalnej komendy).
        if (!state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !state.pendingGraveyardToTop && state.pendingBackups.length === 0 && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && state.pendingDeliriumTargets.length === 0 && state.pendingMentorTargets.length === 0 && !state.pendingLegendChoice) {
          state.turn.priorityPlayerId = state.turn.activePlayerId;
        }
      } else {
        const previousTurnNumber = state.turn.number;
        state.turn = nextTurnStep(state.turn, state.players);
        events.push(event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step }));
        if (state.turn.step === 'cleanup') {
          clearMarkedDamage(state);
          clearStatModifiers(state);
          // Prewencja obrażeń „this turn\" (Ethersworn Shieldmage) wygasa
          // w cleanup razem z grantami i modyfikatorami (CR 514.2).
          state.preventDamageThisTurn = [];
          // Tarcze prewencji „this turn" (Withstand) wygasają w cleanup.
          state.damageShields = [];
        }
        if (state.turn.number !== previousTurnNumber) {
          // Przeliczenie licznika czarów poprzedniej tury (transform).
          state.lastTurnSpellsCast = state.spellsCastThisTurn;
          state.spellsCastThisTurn = 0;
          state.spellsCastThisTurnByPlayer = {};
          state.cardsDrawnThisTurn = {};
          // „Activate only once each turn" (Snarling Wolf) — limit aktywacji
          // zeruje się z nową turą, jak licznik dobrań.
          state.abilityActivatedThisTurn = {};
          // „Descended this turn" (Canonized in Blood) — znacznik zeruje się
          // z nową turą, jak licznik dobrań.
          state.descendedThisTurn = {};
          state.creatureDiedThisTurn = false;
          state.dealtDamageToOpponentThisTurn = {};
          state.moonlitUsedThisTurn = {};
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
        exileTargetId: cmd.exileTargetId ?? null,
        kicked: Boolean(cmd.kicked),
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
      // Zdarzenia zagnieżdżone rzutu (koszty dodatkowe — poświęcenie, exile,
      // produkcja many, triggery kosztów) MUSZĄ trafić do strumienia komendy:
      // accepted() skanuje result.events pod kątem triggerów dies/leaves.
      // Wcześniej tylko [e] — poświęcony kosztem stwór nie odpalał dies.
      const before = state.events.length;
      const e = castSpell(state, cmd.playerId, cmd.objectId, cmd.targets, cmd.sacrificeTargetId, cmd.modeIndex, cmd.stunTargetId);
      const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_spell:${error.message}`);
    }
  }

  if (cmd.type === 'cast_cleave') {
    try {
      const before = state.events.length;
      const e = castCleave(state, cmd.playerId, cmd.objectId, cmd.targets, cmd.sacrificeTargetId);
      const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_cleave:${error.message}`);
    }
  }

  if (cmd.type === 'cast_escape') {
    try {
      const before = state.events.length;
      const e = castEscape(state, cmd.playerId, cmd.objectId, cmd.targets, cmd.escapeExileIds);
      const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_escape:${error.message}`);
    }
  }

  if (cmd.type === 'cast_adventure') {
    try {
      const before = state.events.length;
      const e = castAdventure(state, cmd.playerId, cmd.objectId, cmd.targets);
      const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_adventure:${error.message}`);
    }
  }

  if (cmd.type === 'cast_adventure_creature') {
    try {
      const before = state.events.length;
      const e = castAdventureCreature(state, cmd.playerId, cmd.objectId);
      const events = [e, ...state.events.slice(before).filter((entry) => entry !== e)];
      return accepted(state, cmd, { ok: true, events });
    } catch (error) {
      return reject(`illegal_adventure_creature:${error.message}`);
    }
  }

  if (cmd.type === 'activate_ability') {
    try {
      const before = state.events.length;
      const e = activateAbility(state, cmd.playerId, cmd.objectId, cmd.abilityIndex, cmd.attackerId, cmd.targets, cmd.xValue, cmd.crewCreatureIds);
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
  // Decyzja pokoju lochu blokuje pozostałe akcje tylko, gdy ktokolwiek z
  // kandydatów pozostał legalny (mógł zniknąć po utworzeniu kolejki — np.
  // wygnany triggerem w tej samej komendzie). Ślepą decyzję czyści execute
  // (auto-skip jak czar bez celu), a widok nie może na niej utknąć bez
  // legalnej komendy.
  const roomTargetBlocks = state.pendingRoomTargets.some((p) => legalRoomTargetCandidates(state, p).length > 0);
  // Decyzja delirium blokuje pozostałe akcje tylko, gdy choć jeden wpis
  // wciąż wymaga decyzji (intervening-if + legalny cel) — ślepe głowy
  // kolejki czyści execute przy następnej komendzie (jak cele pokoi lochu).
  const deliriumBlocks = state.pendingDeliriumTargets.some((p) => deliriumDecisionPending(state, p));
  // Decyzja mentora blokuje pozostałe akcje tylko, gdy choć jeden wpis ma
  // legalnego kandydata — ślepe głowy kolejki czyści execute (jak delirium).
  const mentorBlocks = state.pendingMentorTargets.some((p) => mentorDecisionPending(state, p));
  if (state.status === 'active') {
    // Koncesję może zgłosić każdy gracz niezależnie od priorytetu; pass
    // oferujemy wyłącznie posiadaczowi priorytetu.
    legalCommands.push(command('concede', playerId));
    const hasPriority = state.turn.priorityPlayerId === playerId;
    // Pass jest niedostępny, gdy trwa nierozstrzygnięty krok obrażeń combat —
    // jedyna droga dalej to resolve_combat (albo koncesja). Oczekujący scry
    // albo backup blokuje pass u wszystkich (patrz resolve_* poniżej).
    const blockedByCombat = state.turn.step === 'combat_damage' && state.combat;
    if (hasPriority && !blockedByCombat && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !mentorBlocks && !state.pendingLegendChoice) legalCommands.push(command('pass_priority', playerId));
  }
  // Oczekujące decyzje oferujemy SEKWENCYJNIE — w tej samej kolejności, w
  // jakiej bramki execute() je zamykają: scry → surveil → backup → clash →
  // cel pokoju lochu → poświęcenie → Food → discover → explore → craft exile
  // → stwor z ręki → devour → endure → delirium → grob na wierzch. Gdy w
  // jednej komendzie zakolejkują się dwie decyzje (np. scry triggera ETB +
  // devour przy wejściu stwora z devour), gracz widzi wyłącznie tę pierwszą
  // — kontroler nie może wybrać „niewłaściwej" (regresja: benchmark padał,
  // bo oferowany resolve_devour_choice przy otwartym scry był odrzucany
  // scry_unresolved).
  const activeBackup = pendingBackup && pendingBackup.playerId === playerId;
  const activeScry = state.pendingScry && state.pendingScry.playerId === playerId;
  const activeSurveil = state.pendingSurveil && state.pendingSurveil.playerId === playerId;
  const activeClash = state.pendingClash && state.pendingClash.choices[0] === playerId;
  const headRoomCandidates = state.pendingRoomTargets.length > 0
    ? legalRoomTargetCandidates(state, state.pendingRoomTargets[0])
    : [];
  const activeRoomTarget = state.pendingRoomTargets.length > 0
    && state.pendingRoomTargets[0].playerId === playerId && headRoomCandidates.length > 0;
  const activeSacrifice = state.pendingSacrifice && state.pendingSacrifice.playerId === playerId;
  const activeFoodChoice = state.pendingFoodChoice && state.pendingFoodChoice.playerId === playerId;

  const activeDiscover = state.pendingDiscover && state.pendingDiscover.playerId === playerId;
  const activeExplore = state.pendingExplore && state.pendingExplore.playerId === playerId;

  const activeCraftExile = state.pendingCraftExile && state.pendingCraftExile.playerId === playerId;

  const activeHandCreature = state.pendingHandCreature && state.pendingHandCreature.playerId === playerId;

  const activeDevour = state.pendingDevours.length > 0 && state.pendingDevours[0].playerId === playerId;

  const activeEndure = state.pendingEndures.length > 0 && state.pendingEndures[0].playerId === playerId;

  const pendingDeliriumHead = state.pendingDeliriumTargets[0] ?? null;
  const pendingMentorHead = state.pendingMentorTargets[0] ?? null;

  const activeGraveyardToTop = state.pendingGraveyardToTop && state.pendingGraveyardToTop.playerId === playerId;
  const activeLegendChoice = state.pendingLegendChoice && state.pendingLegendChoice.playerId === playerId;

  // Sekwencyjność ofert także MIĘDZY graczami: execute() odblokowuje decyzje
  // w ustalonym porządku bramek, więc gdy decyzja innego gracza jest
  // wcześniejsza (np. cudze scry przed naszym delirium — skan
  // wieloprzebiegowy może kolejkować kilka typów decyzji w jednej komendzie),
  // ten gracz nie dostaje jeszcze swojej oferty — execute odrzuciłby ją
  // bramką wcześniejszej decyzji (regresja scry_unresolved, benchmark B0).
  const firstDecisionOwner = state.status === 'active' ? firstPendingDecisionPlayerId(state) : null;
  const blockedByOthersDecision = firstDecisionOwner != null && firstDecisionOwner !== playerId;

  if (state.status === 'active' && !blockedByOthersDecision && activeScry) {
    // Oczekująca decyzja scry: właściciel dostaje wyliczone warianty (każda
    // przeglądana karta ma osobną decyzję wierzch/spód, w kolejności przeglądu).
    const variants = [[]];
    for (const objectId of state.pendingScry.objectIds) {
      variants.push(...variants.slice().map((chosen) => [...chosen, objectId]));
    }
    for (const bottomIds of variants) {
      legalCommands.unshift(command('resolve_scry', playerId, bottomIds.length > 0 ? { bottomIds } : {}));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeSurveil) {
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
  } else if (state.status === 'active' && !blockedByOthersDecision && activeBackup) {
    for (const objectId of state.zones.battlefield) {
      const object = state.objects.get(objectId);
      if (object?.zone === 'battlefield' && object.kind === 'creature') {
        legalCommands.unshift(command('resolve_backup', playerId, { targetId: objectId }));
      }
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeClash) {
    // Oczekujący clash (CR 701.40): gracz, którego kolej, wybiera wierzch/spód
    // dla swojej odsłoniętej karty.
    legalCommands.unshift(command('resolve_clash_choice', playerId, { putOnBottom: true }));
    legalCommands.unshift(command('resolve_clash_choice', playerId, {}));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeRoomTarget) {
    // Oczekujący wybór celu pokoju lochu (M24): właściciel decyzji wybiera
    // spośród celów legalnych w tej chwili (kandydat mógł zniknąć po
    // utworzeniu kolejki — legalRoomTargetCandidates, ta sama lista co
    // walidacja w execute).
    for (const targetId of headRoomCandidates) {
      legalCommands.unshift(command('resolve_room_target', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeSacrifice) {
    // Oczekująca decyzja poświęcenia (Grave Exchange): cel wybiera stwora
    // do poświęcenia spośród kandydatów (resolve_sacrifice_choice).
    for (const targetId of state.pendingSacrifice.candidateIds) {
      legalCommands.unshift(command('resolve_sacrifice_choice', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeFoodChoice) {
    // Oczekująca decyzja poświęcenia Food (Insatiable Appetite):
    // poświęć Food (+5/+3) lub nie (+3/+3).
    legalCommands.unshift(command('resolve_food_choice', playerId, { sacrifice: true }));
    legalCommands.unshift(command('resolve_food_choice', playerId, { sacrifice: false }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeDiscover) {
    // Oczekująca decyzja Discover (Geological Appraiser): rzuć bez kosztu
    // albo weź do ręki.
    legalCommands.unshift(command('resolve_discover_choice', playerId, { castFree: true }));
    legalCommands.unshift(command('resolve_discover_choice', playerId, { castFree: false }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeExplore) {
    // Oczekująca decyzja Explore (Guidestone Compass): wierzch albo grób.
    legalCommands.unshift(command('resolve_explore_choice', playerId, { putInGraveyard: true }));
    legalCommands.unshift(command('resolve_explore_choice', playerId, { putInGraveyard: false }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeCraftExile) {
    // Oczekująca decyzja Craft exile (Lodestone Needle): wybór artefaktu
    // do wygnania (z battlefield lub graveyard).
    for (const targetId of state.pendingCraftExile.candidateIds) {
      legalCommands.unshift(command('resolve_craft_exile', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeHandCreature) {
    // Oczekująca decyzja Dragon Arch: wybór wielokolorowego stwora z ręki
    // (resolve_hand_creature) albo nic — „you may" (targetId: null).
    legalCommands.unshift(command('resolve_hand_creature', playerId, { targetId: null }));
    for (const targetId of state.pendingHandCreature.candidateIds) {
      legalCommands.unshift(command('resolve_hand_creature', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeDevour) {
    // Oczekująca decyzja devour: po jednym kandydacie na krok (liczone
    // dynamicznie — poświęceni odpadają) albo zakończenie { done: true }.
    for (const targetId of legalDevourCandidates(state, state.pendingDevours[0])) {
      legalCommands.unshift(command('resolve_devour_choice', playerId, { targetId }));
    }
    legalCommands.unshift(command('resolve_devour_choice', playerId, { done: true }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeEndure) {
    // Oczekująca decyzja endure: liczniki (tylko gdy źródło wciąż stworem na
    // bitwisku) albo token Spirit N/N biały (zawsze).
    const endureSource = state.objects.get(state.pendingEndures[0].sourceId);
    if (endureSource && endureSource.zone === 'battlefield' && endureSource.kind === 'creature') {
      legalCommands.unshift(command('resolve_endure_choice', playerId, { mode: 'counters' }));
    }
    legalCommands.unshift(command('resolve_endure_choice', playerId, { mode: 'token' }));
  } else if (state.status === 'active' && !blockedByOthersDecision && pendingDeliriumHead && pendingDeliriumHead.playerId === playerId) {
    // Oczekujący wybór celu delirium: spośród stworów poszkodowanego gracza
    // (dynamicznie; ślepy wpis wyczyści execute — tu zostawiamy pustą ofertę).
    for (const targetId of legalDeliriumTargetCandidates(state, pendingDeliriumHead)) {
      legalCommands.unshift(command('resolve_delirium_target', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && pendingMentorHead && pendingMentorHead.playerId === playerId) {
    // Oczekujący wybór celu mentora: atakujący stwory kontrolera o mniejszej
    // sile niż źródło (dynamicznie; ślepy wpis wyczyści execute).
    for (const targetId of legalMentorCandidates(state, pendingMentorHead)) {
      legalCommands.unshift(command('resolve_mentor_target', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeGraveyardToTop) {
    // Oczekująca decyzja Forever Young: karta-stwora z grobu na wierzch
    // (dynamicznie — przeniesione odpadają) albo zakończenie { done: true }.
    for (const targetId of graveyardToTopCandidates(state, state.pendingGraveyardToTop.playerId)) {
      legalCommands.unshift(command('resolve_graveyard_top_choice', playerId, { targetId }));
    }
    legalCommands.unshift(command('resolve_graveyard_top_choice', playerId, { done: true }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeLegendChoice) {
    // Oczekujący wybór prawa legend (CR 704.5j): kandydaci to duplikaty —
    // gracz wskazuje, który permanent o danej nazwie ZOSTAJE na bitwisku.
    for (const keepId of state.pendingLegendChoice.candidateIds) {
      legalCommands.unshift(command('resolve_legend_choice', playerId, { keepId }));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !mentorBlocks && !state.pendingLegendChoice && state.turn.step === 'draw' && state.turn.activePlayerId === playerId
    && !state.turn.drawnInStep) {
    const top = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
    legalCommands.unshift(command('draw_card', playerId, top ? { objectId: top } : {}));
  }
  const player = state.players.find((entry) => entry.id === playerId);
  // Mana produkowalna (pula + nietapnięte landy) steruje ofertą rzutów i
  // zdolności: dostępną akcją jest od razu rzucenie czaru, a zebranie many
  // (tapowanie landów) robi automatycznie płatność — patrz spendMana.
  // Z tego powodu tap_for_mana NIE jest już enumerowany jako osobna akcja
  // (komenda pozostaje legalna w protokole — replaye i trigger ETB typu
  // „pay or sacrifice" korzystają z niej nadal).
  const manaAvailable = producibleMana(state, playerId);
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !mentorBlocks && !state.pendingLegendChoice && state.turn.priorityPlayerId === playerId) {
    for (const cast of legalSpellCasts(state, playerId)) {
      legalCommands.unshift(command('cast_spell', playerId, cast));
    }
    for (const cast of legalCleaveCasts(state, playerId)) {
      legalCommands.unshift(command('cast_cleave', playerId, cast));
    }
    // Escape (Sweet Oblivion): czary z grobu rzucane za koszt escape + wygnanie
    // kart z grobu — sorcery-speed, jak zwykłe czary.
    for (const cast of legalEscapeCasts(state, playerId)) {
      legalCommands.unshift(command('cast_escape', playerId, cast));
    }
    // Adventure (CR 715, Gray Slaad): strona przygodowa z ręki — sorcery;
    // po rozstrzygnięciu karta idzie do exile („on an adventure"), skąd
    // cast_adventure_creature rzuca stronę-stwora (obaj w main phase).
    for (const cast of legalAdventureCasts(state, playerId)) {
      legalCommands.unshift(command('cast_adventure', playerId, cast));
    }
    for (const cast of legalAdventureCreatureCasts(state, playerId)) {
      legalCommands.unshift(command('cast_adventure_creature', playerId, cast));
    }
    // Flash (CR 702.8): permanenty z flash można zagrać z priorytetem w każdej
    // fazie (jak instanty), nie tylko w main phase. Dodajemy je tuż po czarach.
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId !== playerId) continue;
      if (object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') continue;
      if (!(object.keywords ?? []).includes('flash')) continue;
      if (effectiveSpellManaCost(state, object) > manaAvailable) continue;
      if (!hasColorForCardId(state, playerId, object.cardId, 0)) continue;
      legalCommands.unshift(command('cast_permanent', playerId, { objectId: id }));
    }
    // Plot jest specjalną akcją sorcery-speed z ręki: płaci koszt plot i
    // przenosi kartę do exile, gdzie później legalSpellCasts oferuje cast bez many.
    if (state.turn.activePlayerId === playerId
      && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
      && state.zones.stack.length === 0) {
      for (const id of state.zones.hand) {
        const object = state.objects.get(id);
        if (object?.controllerId === playerId && object.plot
          && (object.plot.cost ?? 0) <= manaAvailable) {
          legalCommands.unshift(command('plot_card', playerId, { objectId: id }));
        }
      }
    }
    // Zdolności aktywowane są jak instanty: dostępne z priorytetem, niezależnie
    // od fazy. Każda oferowana aktywacja jest akceptowana przez execute.
    // Ninjutsu niesie dodatkowo attackerId (atakujący do zwrotu do ręki);
    // zdolności celowane/{X} niosą targets i xValue.
    for (const { objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds } of legalActivatedAbilities(state, playerId)) {
      const extra = { objectId, abilityIndex };
      if (attackerId !== undefined) extra.attackerId = attackerId;
      if (targets !== undefined) extra.targets = targets;
      if (xValue !== undefined) extra.xValue = xValue;
      // Crew (CR 701.36): wybór stworów do tapnięcia jedzie w komendzie —
      // bez tego oferowana komenda byłaby odrzucana (nielegalny crew).
      if (crewCreatureIds !== undefined) extra.crewCreatureIds = crewCreatureIds;
      legalCommands.unshift(command('activate_ability', playerId, extra));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !state.pendingLegendChoice && state.turn.activePlayerId === playerId
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
        if (manaNeeded > manaAvailable) continue;
        if (2 * k > (player.life ?? 0)) continue;
        out.push(k);
      }
      return out;
    };
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId !== playerId || object.aura) continue;
      if (object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') continue;
      // Additional cost "exile a creature you control" (Fear of Abduction):
      // enumerujemy własne stwory — każdy to osobny wariant komendy cast_permanent.
      if (object.additionalCost?.exileCreature) {
        const exilePool = state.zones.battlefield.filter((oid) => {
          const candidate = state.objects.get(oid);
          return candidate?.zone === 'battlefield' && candidate.kind === 'creature' && candidate.controllerId === playerId;
        });
        for (const exileId of exilePool) {
          if (effectiveSpellManaCost(state, object) > manaAvailable) continue;
          if (!hasColorForCardId(state, playerId, object.cardId, 0)) continue;
          legalCommands.unshift(command('cast_permanent', playerId, { objectId: id, exileTargetId: exileId }));
        }
        continue; // obsłużone — nie generuj zwykłego cast_permanent
      }
      // Morph/megamorph: zagranie twarzą w dół jako 2/2 za koszt morph ({3}) —
      // niezależnie od kosztu many karty (alternatywny koszt zagrania).
      if (object.kind === 'creature' && object.morph && (object.morph.cost ?? 0) <= manaAvailable) {
        // Morph jest bezbarwny (CR 702.36) – nie wymaga kolorowego źródła
        legalCommands.unshift(command('cast_permanent', playerId, { objectId: id, faceDown: true }));
      }
      // Podstawa kosztu zawsze z many — bez niej permanent nie jest grywalny.
      // Koszt efektywny: modyfikatory z permanentów (Etherium Sculptor) mogą
      // obniżyć część generyczną już na etapie OFERTY rzutu.
      if (effectiveSpellManaCost(state, object) > manaAvailable) continue;
      // Kolejność wariantów: unshift wkłada na początek, więc iterujemy od
      // najdroższego życiowo (k=max) do najtańszego (k=0) — manowy wariant
      // ląduje PIERWSZY (proste boty biorą najtańszy).
      const variants = phyrexianVariants(object).slice().reverse();
      for (const k of variants) {
        const payWithLife = k === null ? 0 : k;
        if (!hasColorForCardId(state, playerId, object.cardId, payWithLife)) continue;
        legalCommands.unshift(command('cast_permanent', playerId,
          k === null ? { objectId: id } : { objectId: id, phyrexianPayWithLife: k }));
      }
      // Kicker (CR 702.33, Kor Sanctifiers): „You may pay an additional {W}"
      // — wariant kicked: true ZA zwykłym rzutem (unshift przed pętlą
      // wariantów many, więc naturalny rzut zostaje pierwszy — proste boty
      // biorą najtańszy). Pipy kolorów kickera wchodzą do wymagań.
      if (object.kicker) {
        const kickerCost = object.kicker.cost ?? 0;
        if (effectiveSpellManaCost(state, object) + kickerCost <= manaAvailable) {
          const kickerReqs = [...coloredPipsOf(object.cardId, 0), ...(object.kicker.colors ?? []).map((color) => [color])];
          if (canPayColoredCost(state, playerId, kickerReqs)) {
            legalCommands.unshift(command('cast_permanent', playerId, { objectId: id, kicked: true }));
          }
        }
      }
    }
  }
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !state.pendingLegendChoice && state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase) && (player.landPlays ?? 0) > 0) {
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId === playerId && object.kind === 'land') legalCommands.unshift(command('play_land', playerId, { objectId: id }));
    }
  }
  if (state.status === 'active' && !state.pendingScry && !state.pendingSurveil && !state.pendingClash && !state.pendingSacrifice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !state.pendingLegendChoice && state.turn.priorityPlayerId === playerId) {
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
  // Prawo legend jest w całości informacją publiczną (bitwisko): obaj
  // gracze widzą nazwę duplikatów, kandydatów i to, czyja to decyzja.
  const pendingLegendChoiceView = state.pendingLegendChoice ? {
    playerId: state.pendingLegendChoice.playerId,
    name: state.pendingLegendChoice.name,
    candidateIds: [...state.pendingLegendChoice.candidateIds],
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
    pendingClash, pendingRoomTarget, pendingLegendChoice: pendingLegendChoiceView,
    initiativePlayerId,
    undercityProgress: { ...state.undercityProgress },
    descendedThisTurn: { ...state.descendedThisTurn },
  });
}
