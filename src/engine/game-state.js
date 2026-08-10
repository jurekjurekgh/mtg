import { createGameObject } from './identity.js';
import { assertZone, ZONES } from './zones.js';
import { command, event } from '../protocol/types.js';
import { initialTurn, jumpToStep, nextTurnStep } from './turn.js';
import { assertStateInvariants } from './invariants.js';
import { initializeResources, beginTurn, castAuraSpell, castPermanent, legalAuraCasts, playLand, producibleMana, tapLandForMana, canPayColoredCost, spendMana, treasureManaAvailable } from './resources.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { parseManaCost, canPayManaCost, coloredPipsOf, matchColorRequirements } from './mana-cost.js';
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
import { COMBAT_OPTION_CAP, declareAttackers, declareBlockers, legalAttackerOptions, legalBlockerOptions, resolveCombatDamage, buildDamageAssignmentView, buildDefaultDamageAssignments, validateDamageAssignment } from './combat.js';
import { castSpell, castCleave, legalSpellCasts, legalCleaveCasts, plotCard, resolveTopOfStack, finishPendingSpell, castEscape, legalEscapeCasts, castAdventure, legalAdventureCasts, castAdventureCreature, legalAdventureCreatureCasts, effectiveSpellManaCost, legalTargetCandidates } from './spells.js';
import { legalActivatedAbilities, activateAbility, performActivation } from './abilities.js';
import { clearMarkedDamage, clearStatModifiers, effectiveKeywords, effectivePower, effectiveToughness, grantBasicLandTypeUntilEndOfTurn, grantKeywordsUntilEndOfTurn, markDamage, modifyStats, untapObject } from './permanents.js';
import { addCounter } from './counters.js';
import { runStateBasedActions } from './state-based.js';
import { graveyardCardTypeCount, processTriggers, queueTriggerToStack, triggerTargetDecisionPending, legalTriggerTargetCandidates, triggerConditionHolds } from './triggers.js';
import { moveObjectDirectly } from './objects.js';
import { detachAttachmentsFromHost } from './attachments.js';
import { createBattlefieldToken } from './tokens.js';
import { changeLife } from './players.js';
import { shuffle } from './shuffle.js';
import { applyRoomTargetChoice, applyEffect, drawPlayerCards } from './effects.js';

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
    players: players.map((p) => ({ id: p.id, name: p.name ?? p.id, life: 20, commanderCasts: 0, speed: 0 })),
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
    // M68 (daybound/nightbound, CR 708.9): GLOBALNY znacznik dnia/nocy gry —
    // jak inicjatywa; null = nieustalony. Rzuty czarów i upkeep zmieniają go.
    dayNight: null,
    // Czary poprzedniej tury PER GRACZ (daybound upkeep — CR 708.9f: aktywny
    // gracz bez czarów w SWOJEJ poprzedniej turze → dzień).
    lastTurnSpellsCastByPlayer: {},
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
    // Batch 22: oczekująca decyzja proliferate (CR 701.27, Courage in
    // Crisis). Gracz wybiera DOWOLNĄ liczbę permanentów i/lub graczy
    // (z licznikami) — każdy dostaje po +1 do każdego typu licznika
    // już obecnego. Wpis: { playerId, sourceId, sourceCardId,
    // candidateIds, restorePriorityTo }. Blokuje grę do
    // resolve_proliferate (jak pendingSurveil).
    pendingProliferate: null,
    // Batch 22: oczekująca decyzja reveal + reorder (Stomping Slabs,
    // CR 701.16 + 401.4): kto przegląda wierzchnie N kart biblioteki
    // i układa je na spodzie w DOWOLNEJ kolejności. Wpis:
    // { playerId, sourceId, sourceCardId, cardIds, amount,
    // restorePriorityTo }. Blokuje grę do resolve_reveal_order.
    pendingRevealOrder: null,
    // Batch 22: oczekująca decyzja celu damage z named-revealed
    // (Stomping Slabs po reveal, jeśli w reveal było „Stomping
    // Slabs" — 7 dmg do dowolnego celu). Decyzja gracza wskazująca
    // ofiarę. Wpis: { playerId, sourceId, amount, candidateIds,
    // restorePriorityTo }.
    pendingDamageTarget: null,
    // Batch 22: oczekująca decyzja modalnego triggera (Etherwrought Page
    // upkeep "choose one"). Gracz wybiera tryb (modeIndex), a efekty
    // wybranego trybu są aplikowane jak zwykły efekt triggera.
    // Wpis: { playerId, sourceId, sourceCardId, ability, modes,
    // extra, restorePriorityTo }.
    pendingModalTrigger: null,
    // Batch 24 (Willbender): oczekująca decyzja zmiany celu czaru na stosie
    // (resolve_redirect_choice) — jak pendingDamageTarget.
    pendingRedirectChoice: null,
    // Benevolent Blessing (CMR): choose color for protection
    pendingColorChoice: null,
    // Fertile Thicket (BFZ): ETB reveal top 5, choose basic land for top
    pendingFertileThicket: null,
    // Springbloom Druid (MH1): ETB sacrifice land → search 2 basic lands
    pendingSpringbloom: null,
    pendingIndex: null,
    // M67 (Batch 27, Force Away): ferocious „you may draw a card. If you do,
    // discard a card" — decyzja tak/nie przy rozstrzyganiu czaru.
    pendingOptionalDraw: null,
    // M69 (Batch 28): Exploit (Silumgar Butcher) — opcjonalne poświęcenie
    // przy wejściu (resolve_exploit_choice) i Dreams of Steel and Oil —
    // reveal ręki + wybór z ręki i z grobu (resolve_reveal_exile_*).
    pendingExploits: [],
    pendingRevealExile: null,
    // M66 (R): rozdzielanie obrażeń combat (CR 510.1c/d) — wielu blokerów
    // albo trample; ustawiane przez resolveCombatDamage, rozstrzygane
    // resolve_damage_assignment (wizard u gracza, default u botów).
    pendingDamageAssignment: null,
    // Benevolent Blessing: choose color on aura entry
    pendingColorChoice: null,
    // Flaga z efektu clash (Release the Ants): wygrany czar wraca do ręki
    // właściciela zamiast do grobu (rozstrzyga resolveTopOfStack).
    pendingSpellReturnToHand: false,
    // Oczekująca decyzja odrzucenia (Temat 4 — CR 701.18 „discard a card"):
    // decider to gracz, który WYBIERA karty z ręki do odrzucenia — koszt
    // (Goblin Picker, Plague Reaver — kontroler) albo efekt (Dementia Bat —
    // cel, Evangel — kontroler). Wpis: { playerId, count, handIds, purpose:
    // 'cost'|'effect', sourceCardId, restorePriorityTo }.
    pendingDiscardChoice: null,
    // Oczekująca decyzja „put a card from your hand on top of your library\"
    // (Chittering Rats — cel wybiera kartę z własnej ręki).
    // Wpis: { playerId, handIds, sourceCardId, restorePriorityTo }.
    pendingHandTopChoice: null,
    // Wstrzymana aktywacja zdolności z kosztem-discard (Goblin Picker,
    // Plague Reaver): po dokończeniu wyborów resolve_discard_choice wykonuje
    // pozostałe koszty i efekty. Wpis: { playerId, objectId, abilityIndex,
    // attackerId, targets, xValue, crewCreatureIds }.
    pendingAbilityActivation: null,
    // Oczekująca decyzja wyboru podstawowego typu landa (Unstable Frontier,
    // CR 305.7): { playerId, targetId, restorePriorityTo } — resolve_land_type_choice.
    pendingLandTypeChoice: null,
    // Oczekująca decyzja szukania w bibliotece (Temat 6 — „you may search
    // your library for ...": gracz wybiera KARTĘ albo rezygnuje (fail to
    // find, CR 701.19b). Wpis: { playerId, qualifier, destination,
    // entersTapped, sourceCardId, emitter, restorePriorityTo }.
    pendingSearchChoice: null,
    // Oczekująca decyzja „zapłać albo poświęć" (Rupture Spire, Temat 7):
    // { playerId, amount, sourceId, restorePriorityTo } — resolve_pay_or_sacrifice.
    pendingPayOrSacrifice: null,
    // Oczekująca decyzja opcjonalnej płatności triggera (Panic Spellbomb,
    // Zoraline — Temat 8): „you may pay ... When you do, ...". Wpis:
    // { playerId, sourceId, ability, targetId|null, extra, restorePriorityTo,
    // requiresTargetDecision } — Zoraline po zapłacie kolejkuje decyzję CELU.
    pendingOptionalPay: null,
    // Kolejka decyzji CELU triggera (Temat 2 — CR 603/115.1b): kontroler
    // wybiera cel zamiast deterministycznego findTriggerTarget (Forge Devil,
    // Kor Sanctifiers, Jill, Puppeteer Clique, Greatsword itd.). Wpis:
    // { playerId, sourceId, cardId, ability, candidates, allowNone,
    // fixedTargetIds, extra, restorePriorityTo }. Blokuje grę do
    // resolve_trigger_target (jak pendingDeliriumTargets/pendingMentorTargets).
    pendingTriggerTargets: [],
    // Mulligan londyński (CR 103.4): kolejka graczy czekających na decyzję
    // o ręce otwarcia (setupGame). Wpis = id gracza; mulliganCounts[playerId]
    // = liczba wykonanych mulliganów (N kart na spód przy następnym).
    pendingMulligans: [],
    mulliganCounts: {},
    // Oczekująca decyzja odłożenia N kart na spód po mulliganie (CR 103.4):
    // { playerId, count, handIds, restorePriorityTo } — resolve_mulligan_bottom_choice.
    pendingMulliganBottom: null,
    // Oczekująca decyzja „you may" triggera BEZ celu (Angel's Feather —
    // „you may gain 1 life"): tak/nie (resolve_optional_trigger_choice).
    // Wpis: { playerId, sourceId, ability, extra, restorePriorityTo }.
    pendingOptionalTrigger: null,
    // Oczekująca decyzja Moonlit Meditation (Temat 9 — „you may instead
    // create that many tokens that are copies..."). Wpis: { playerId,
    // sourceId, enchantedId, effect, sourceObjectId, targets, restorePriorityTo }.
    pendingMoonlitChoice: null,
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
    // Tarcze regeneracji (CR 701.12): id obiektów z aktywną „regeneracją"
    // („the next time it would be destroyed this turn"). Zużywane przez
    // tryRegenerate (SBA/efekty destroy), czyszczone w cleanup.
    regenerationShields: [],
    // Flaga „can't be regenerated this turn" (Rage of Purphoros: „It can't
    // be regenerated this turn.", CR 701.12b w minimalnym wymiarze) — id
    // obiektów zablokowanych przed regeneracją do końca tury. Ustawiana
    // efektem `cant_be_regenerated_this_turn`, sprawdzana w tryRegenerate
    // (SBA) i destroy_permanent; czyszczona w cleanup razem z
    // regenerationShields.
    cantBeRegeneratedThisTurn: [],
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
    // Speed (DFT „Start your engines!", Batch 24 — Glitch Ghost Surveyor):
    // speed gracza (0..4); speedIncreasedThisTurn pilnuje „increases once on
    // each of your turns" (raz na turę aktywnego gracza).
    speedIncreasedThisTurn: {},
    // Ciągłe efekty „do końca tury" (Hysterical Blindness -4/-0, Turn the
    // Tide -2/-0, Angel of the Dawn +1/+1 vigilance, Your Temple indestructible):
    // wpisy { controllerId, opponent, power, toughness, keywords } — czytane
    // przy KAŻDYM odczycie statystyk, więc dotyczą także stworów wchodzących
    // PO rozstrzygnięciu (CR 611.2c — efekty trwałe do końca tury stosują
    // się do obiektów wchodzących później). Poprzednio buff aplikowano tylko
    // do stworów obecnych w chwili rozstrzygnięcia (bug złotej odznaki).
    untilEndOfTurnBuffs: [],
    moonlitUsedThisTurn: {},
  };
  return initializeResources(state);
}

export function addObject(state, { id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, plot, plotted, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, entersTappedCondition, bestow, aura, equipment, backup, colors = [], phyrexianManaCost = 0, enchantPlayer = false, saga = null, station = null, ownerId = null, devour = null, endure = null, exploit = null, treasureAltCost = null, cardName = null, name = null, bloodthirst = null, additionalCost = null, kicker = null, adventure = null, buyback = null, protectionFromColors = null, plottedAtTurn = null }) {
  assertZone(zone);
  if (!state.players.some((p) => p.id === controllerId) || state.objects.has(id)) {
    throw new Error('Nieprawidłowy kontroler albo zajęte id obiektu');
  }
  const object = createGameObject({ id, instanceId, cardId, controllerId, ownerId, zone, kind, power, toughness, manaCost, spell, abilities, morph, plot, plotted, entersWithCounters, keywords, subtypes, transformTo, types, entersTapped, entersTappedCondition, bestow, aura, equipment, backup, colors, phyrexianManaCost, enchantPlayer, saga, station, devour, endure, exploit, treasureAltCost, cardName, name, bloodthirst, additionalCost, kicker, adventure, buyback, protectionFromColors, plottedAtTurn });
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
  // Ślepe decyzje CELU triggera (Temat 2): źródło zniknęło z bitwiska,
  // intervening-if (CR 603.4) przestał zachodzić albo kandydaci wyparowali —
  // zdolność nic nie robi i nie blokuje gry (jak delirium/mentor).
  while (state.pendingTriggerTargets.length > 0
    && !triggerTargetDecisionPending(state, state.pendingTriggerTargets[0])) {
    const pending = state.pendingTriggerTargets.shift();
    const e = event('trigger_target_resolved', {
      playerId: pending.playerId, sourceId: pending.sourceId,
      cardId: pending.cardId, noEffect: true,
    });
    state.events.push(e); emitted.push(e);
    if (state.pendingTriggerTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingTriggerTargets[0].playerId;
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
  if (state.pendingMulligans.length > 0) return state.pendingMulligans[0];
  if (state.pendingMulliganBottom) return state.pendingMulliganBottom.playerId;
  if (state.pendingScry) return state.pendingScry.playerId;
  if (state.pendingSurveil) return state.pendingSurveil.playerId;
  // Kolejność bramek execute: scry → surveil → reveal_order → proliferate →
  // modal_trigger → damage_target → backups → … (Batch 22/23: Stomping Slabs,
  // Courage in Crisis, Etherwrought Page). Gdy kilka decyzji czeka naraz,
  // pierwszy właściciel musi odpowiadać kolejności bramek execute — inaczej
  // oferowana komenda byłaby odrzucona wcześniejszą bramką.
  if (state.pendingRevealOrder) return state.pendingRevealOrder.playerId;
  if (state.pendingProliferate) return state.pendingProliferate.playerId;
  if (state.pendingModalTrigger) return state.pendingModalTrigger.playerId;
  if (state.pendingDamageTarget) return state.pendingDamageTarget.playerId;
  if (state.pendingRedirectChoice) return state.pendingRedirectChoice.playerId;
  if (state.pendingFertileThicket) return state.pendingFertileThicket.controllerId;
  if (state.pendingSpringbloom) return state.pendingSpringbloom.controllerId;
  if (state.pendingIndex) return state.pendingIndex.playerId;
  if (state.pendingOptionalDraw) return state.pendingOptionalDraw.playerId;
  if (state.pendingColorChoice) return state.pendingColorChoice.playerId;
  if (state.pendingBackups.length > 0) return state.pendingBackups[0].playerId;
  if (state.pendingClash) return state.pendingClash.choices[0];
  if (state.pendingRoomTargets.length > 0) return state.pendingRoomTargets[0].playerId;
  if (state.pendingSearchChoice) return state.pendingSearchChoice.playerId;
  if (state.pendingPayOrSacrifice) return state.pendingPayOrSacrifice.playerId;
  if (state.pendingOptionalPay) return state.pendingOptionalPay.playerId;
  // Ślepe wpisy celu triggera (źródło zniknęło, intervening-if nie zachodzi)
  // nie blokują gry — pierwszy ŻYWY wpis przejmuje priorytet (jak delirium).
  if (state.pendingTriggerTargets.some((p) => triggerTargetDecisionPending(state, p))) {
    return state.pendingTriggerTargets.find((p) => triggerTargetDecisionPending(state, p)).playerId;
  }
  // M66 (R): rozdzielanie obrażeń — PO decyzjach celów triggerów, bo bramka
  // execute dla pendingTriggerTargets jest wcześniejsza (triggery z obrażeń
  // combatu mogą czekać, gdy drugi pass kolejkuje przydział obrażeń).
  if (state.pendingDamageAssignment) return state.pendingDamageAssignment.playerId;
  if (state.pendingExploits.length > 0) return state.pendingExploits[0].playerId;
  if (state.pendingRevealExile) return state.pendingRevealExile.playerId;
  if (state.pendingOptionalTrigger) return state.pendingOptionalTrigger.playerId;
  if (state.pendingMoonlitChoice) return state.pendingMoonlitChoice.playerId;
  if (state.pendingLandTypeChoice) return state.pendingLandTypeChoice.playerId;
  if (state.pendingDiscardChoice) return state.pendingDiscardChoice.playerId;
  if (state.pendingHandTopChoice) return state.pendingHandTopChoice.playerId;
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
    // Bloodthirst (CR 702.80 — „if an opponent was dealt damage this turn"):
    // zapobiegnięte obrażenia nie są zadane (CR 119.3) — event z amount 0 nie
    // liczy się do obrażeń zadanych przeciwnikowi.
    if (e.type === 'damage_dealt' && e.amount > 0 && state.players.some((pl) => pl.id === e.target)) {
      const src = state.objects.get(e.source);
      const dealer = src?.controllerId;
      if (dealer && dealer !== e.target) state.dealtDamageToOpponentThisTurn[dealer] = true;
    }
  }
  // Ślepe decyzje gasimy także PO triggerach — kandydat mógł zniknąć od
  // zdarzeń tej komendy (np. cel pokoju zginął od obrażeń triggera).
  const prunedEvents = pruneDeadPendingDecisions(state);
  if (prunedEvents.length > 0) result.events = [...result.events, ...prunedEvents];
  // CR 704.5d: token poza bitwiskiem przestaje istnieć. Usuwamy PO triggerach
  // (dies musiał zobaczyć obiekt w grobie) i PO przycięciu ślepych decyzji —
  // tokeny nie mogą być kandydatami decyzji (np. wybór z grobu — „karty").
  // Tokeny rozpoznajemy po cardId z prefiksem `token_` (tworzy je
  // createBattlefieldToken); karty (z Scryfall albo testowe) mają pełne
  // cardId jak „stomping-slabs" i pole `name` zostawiamy na nich.
  const offBattlefieldTokens = [...state.objects.values()]
    .filter((o) => typeof o.cardId === 'string' && o.cardId.startsWith('token_')
      && o.name != null && o.zone !== 'battlefield');
  if (offBattlefieldTokens.length > 0) {
    for (const token of offBattlefieldTokens) {
      // CR 704.5d (root cause Batch 24, ujawniony przez Moonlit Meditation +
      // Feedback): token poza bitwiskiem przestaje istnieć — najpierw odczep
      // ZAŁĄCZNIKI (aury/equipment na tokenie), inaczej dangle
      // („załącznik wskazuje nieistniejącego gospodarza") łapany przez
      // inwarianty przy następnym ruchu obiektu.
      if (token.zone === 'battlefield') detachAttachmentsFromHost(state, token.id);
      state.zones[token.zone] = (state.zones[token.zone] ?? []).filter((id) => id !== token.id);
      state.objects.delete(token.id);
    }
  }
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
  // Odłożenie N kart na spód po mulliganie (CR 103.4).
  if (state.pendingMulliganBottom) {
    if (cmd.type !== 'resolve_mulligan_bottom_choice') return reject('mulligan_bottom_unresolved');
    if (cmd.playerId !== state.pendingMulliganBottom.playerId) return reject('mulligan_bottom_not_your_decision');
    const pending = state.pendingMulliganBottom;
    const chosen = Array.isArray(cmd.cardIds) ? cmd.cardIds : [];
    // Mała biblioteka: mulligan dobiera mniej niż 7 — odkładamy min(N, ręka)
    // (CR 103.4 — „equal to that many", nie więcej niż masz).
    const expected = Math.min(pending.count, pending.handIds.length);
    if (chosen.length !== expected
      || new Set(chosen).size !== chosen.length
      || chosen.some((id) => !pending.handIds.includes(id))) return reject('illegal_mulligan_bottom_choice');
    const before = state.events.length;
    // Odłożenie na spód w podanej kolejności (pierwsza = najgłębiej).
    state.zones.library = state.zones.library.filter((id) => !chosen.includes(id));
    for (const id of chosen) {
      const libId = `library-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, id, 'library', libId);
      state.events.push(event('object_moved', { fromId: id, object: moved, fromZone: 'hand', toZone: 'library', mulliganBottom: true }));
    }
    state.pendingMulliganBottom = null;
    // Gracz decyduje dalej (keep albo kolejny mulligan).
    state.events.push(event('mulligan_bottom_resolved', { playerId: pending.playerId, count: pending.count }));
    state.turn.priorityPlayerId = pending.playerId;
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Mulligan londyński (CR 103.4): sekwencyjna decyzja o ręce otwarcia —
  // blokuje wszystko, dopóki obaj gracze nie zatrzymają rąk.
  if (state.pendingMulligans.length > 0 && !state.pendingMulliganBottom) {
    if (cmd.type !== 'resolve_mulligan_choice') return reject('mulligan_unresolved');
    if (cmd.playerId !== state.pendingMulligans[0]) return reject('mulligan_not_your_decision');
    const playerId = cmd.playerId;
    const before = state.events.length;
    if (cmd.keep) {
      state.pendingMulligans.shift();
      state.events.push(event('mulligan_choice_resolved', { playerId, kept: true, mulligans: state.mulliganCounts[playerId] ?? 0 }));
      if (state.pendingMulligans.length > 0) {
        state.turn.priorityPlayerId = state.pendingMulligans[0];
      } else {
        state.turn.priorityPlayerId = state.players[0].id;
        state.events.push(event('game_started', {}));
      }
      return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
    }
    // Mulligan: ręka wraca do biblioteki, całość tasowana, dobranie 7
    // (CR 103.4 — mulligan londyński).
    const count = (state.mulliganCounts[playerId] ?? 0) + 1;
    state.mulliganCounts = { ...(state.mulliganCounts ?? {}), [playerId]: count };
    const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
    // 1. Karty ręki na spód biblioteki (moveObjectDirectly pilnuje spójności).
    const movedBack = [];
    for (const handId of handIds) {
      const libId = `library-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, handId, 'library', libId);
      movedBack.push(moved);
      state.events.push(event('object_moved', { fromId: handId, object: moved, fromZone: 'hand', toZone: 'library', mulliganShuffle: true }));
    }
    // 2. Tasowanie CAŁEJ własnej biblioteki (jak po przeszukaniu, CR 701.19c).
    const ownLib = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === playerId);
    const shuffled = shuffle(ownLib, state.seed + state.objectSequence);
    let cursor = 0;
    state.zones.library = state.zones.library.map((id) => {
      if (state.objects.get(id)?.controllerId !== playerId) return id;
      const replacement = shuffled[cursor];
      cursor += 1;
      return replacement;
    });
    state.events.push(event('mulligan_taken', { playerId, count }));
    // Dobranie 7 nowych kart (na rękę — po kolei z wierzchu).
    const drawn = [];
    for (let i = 0; i < 7; i += 1) {
      const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
      if (!topId) break;
      const newId = `hand-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, topId, 'hand', newId);
      drawn.push(moved);
      state.events.push(event('card_drawn', { playerId, fromId: topId, object: moved, mulligan: true }));
    }
    // Odłożenie N kart na spód — decyzja gracza (resolve_mulligan_bottom_choice).
    const newHand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
    state.pendingMulliganBottom = { playerId, count, handIds: newHand, restorePriorityTo: playerId };
    state.events.push(event('mulligan_bottom_required', { playerId, count }));
    state.turn.priorityPlayerId = playerId;
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
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
  // Oczekująca decyzja reveal + reorder (Batch 22: Stomping Slabs,
  // CR 701.16 + 401.4): kto przegląda wierzchnie N kart biblioteki i
  // układa je na spodzie w DOWOLNEJ kolejności. Rozstrzyga
  // applyEffect(type 'reveal_top_to_bottom_order', namedCard, thenDamage).
  if (state.pendingRevealOrder) {
    if (cmd.type !== 'resolve_reveal_order') return reject('reveal_order_unresolved');
    if (cmd.playerId !== state.pendingRevealOrder.playerId) return reject('reveal_order_not_your_decision');
    const pending = state.pendingRevealOrder;
    const order = Array.isArray(cmd.order) ? cmd.order : pending.cardIds;
    if (order.length !== pending.cardIds.length
      || new Set(order).size !== pending.cardIds.length
      || !pending.cardIds.every((id) => order.includes(id))) {
      return reject('illegal_reveal_order');
    }
    const source = state.objects.get(pending.sourceId);
    if (!source) return reject('reveal_source_missing');
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    state.events.push(event('reveal_order_resolved', {
      playerId: cmd.playerId, total: pending.cardIds.length, order: [...order],
    }));
    // applyEffect wykonuje reorder (CR 401.4) + opcjonalny damage z
    // `thenDamage` jeśli named „<effect.namedCard>" był w reveal
    // (kolejkuje pendingDamageTarget dla gracza).
    const revealSource = state.objects.get(pending.sourceId);
    const before = state.events.length;
    // Zachowaj namedCard + thenDamage z effects (w pending nie ma tego,
    // bo kolejka jest specyficzna dla Stomping Slabs — nazwa karty
    // bierze się z definicji karty źródła, a thenDamage jest stałe dla
    // Stomping Slabs = 7). Czytamy z efekty w spec.czaru przez
    // `pending.effect` (nowe pole).
    const effect = pending.effect ?? { type: 'reveal_top_to_bottom_order' };
    if (revealSource) {
      applyEffect(state, effect, revealSource, order);
    }
    state.pendingRevealOrder = null;
    const resolvedEvents = state.events.slice(before);
    // Wstrzymany czar (Stomping Slabs — reveal był jedynym efektem) dokańcza
    // i opuszcza stos po decyzji; efekt reveal mógł właśnie zakolejkować
    // pendingDamageTarget (named „Stomping Slabs" w reveal) — to osobna
    // decyzja, która blokuje dalsze komendy do resolve_damage_target.
    if (state.pendingSpell) {
      const pendingSpell = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, pendingSpell.stackId, pendingSpell.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja proliferate (Batch 22: Courage in Crisis, CR 701.27):
  // gracz wybiera DOWOLNĄ liczbę celów (permanenty z licznikami +
  // gracze z poison > 0); każdy zwiększa licznik każdego typu o 1.
  if (state.pendingProliferate) {
    if (cmd.type !== 'resolve_proliferate') return reject('proliferate_unresolved');
    if (cmd.playerId !== state.pendingProliferate.playerId) return reject('proliferate_not_your_decision');
    const pending = state.pendingProliferate;
    const chosen = Array.isArray(cmd.targetIds) ? cmd.targetIds : [];
    const chosenSet = new Set(chosen);
    if (chosen.some((id) => !pending.candidateIds.includes(id))) {
      return reject('illegal_proliferate_target');
    }
    if (chosenSet.size !== chosen.length) return reject('illegal_proliferate_target');
    const source = state.objects.get(pending.sourceId);
    if (!source) return reject('proliferate_source_missing');
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    state.events.push(event('proliferate_target_resolved', {
      playerId: cmd.playerId, count: chosen.length,
    }));
    // pendingProliferate ZOSTAJE ustawione podczas applyEffect — efekt
    // rozróżnia „kolejkuj nową decyzję" (gdy pending puste) od „zastosuj
    // wybrane cele" (gdy pending aktywne). Zerujemy PO aplikacji (jak
    // reveal gate); zerowanie przed wywołaniem powodowało re-kolejkę
    // decyzji z tą samą sourceId i po przeniesieniu czaru do grobu —
    // proliferate_source_missing przy drugiej ofercie.
    if (source) applyEffect(state, { type: 'proliferate' }, source, chosen);
    state.pendingProliferate = null;
    const resolvedEvents = state.events.slice(
      state.events.length - (chosen.length * 2 + 1)
    );
    // Wstrzymany czar (Courage in Crisis — proliferate był ostatnim efektem)
    // dokańcza i opuszcza stos po decyzji (jak scry/surveil).
    if (state.pendingSpell) {
      const pendingSpell = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, pendingSpell.stackId, pendingSpell.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja modalnego triggera (Batch 22: Etherwrought Page):
  // gracz wybiera tryb (modeIndex). Wybrane efekty trybu są
  // aplikowane (jak zwykły efekt triggera w applyTriggerEffects).
  if (state.pendingModalTrigger) {
    if (cmd.type !== 'resolve_modal_choice') return reject('modal_trigger_unresolved');
    if (cmd.playerId !== state.pendingModalTrigger.playerId) return reject('modal_trigger_not_your_decision');
    const pending = state.pendingModalTrigger;
    const modeIndex = cmd.modeIndex;
    if (!Number.isInteger(modeIndex) || modeIndex < 0 || modeIndex >= pending.modes.length) {
      return reject('illegal_modal_choice');
    }
    const source = state.objects.get(pending.sourceId);
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    state.events.push(event('modal_trigger_resolved', {
      playerId: cmd.playerId, sourceId: pending.sourceId,
      modeIndex, modeName: pending.modes[modeIndex].name,
    }));
    const before = state.events.length;
    state.pendingModalTrigger = null;
    if (source) {
      const mode = pending.modes[modeIndex];
      // Aplikujemy wybrany tryb (efekty w mode.effects; targets:
      // modalne tryby Etherwrought Page nie mają celu — collectLegal
      // nie jest potrzebne).
      for (const effect of (mode.effects ?? [])) {
        applyEffect(state, effect, source, []);
      }
    }
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekująca decyzja damage target (Batch 22: Stomping Slabs po reveal):
  // gracz wybiera cel (gracz albo stwór) dla obrażeń z kolejki
  // pendingDamageTarget. Prosta bramka: identyfikujemy czyjekolwiek
  // obrażenia w kolejce, aplikujemy na wybranym celu.
  if (state.pendingDamageTarget) {
    if (cmd.type !== 'resolve_damage_target') return reject('damage_target_unresolved');
    if (cmd.playerId !== state.pendingDamageTarget.playerId) return reject('damage_target_not_your_decision');
    const pending = state.pendingDamageTarget;
    if (!pending.candidateIds.includes(cmd.targetId)) {
      return reject('illegal_damage_target');
    }
    const source = state.objects.get(pending.sourceId);
    state.pendingDamageTarget = null;
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    state.events.push(event('damage_target_resolved', {
      playerId: cmd.playerId, targetId: cmd.targetId, amount: pending.amount,
    }));
    if (source) {
      applyEffect(state, { type: 'damage', amount: pending.amount }, source, [cmd.targetId]);
    } else {
      // LKI (CR 113.7a/608.2h): źródło (czar Stomping Slabs) rozstrzygnęło się
      // i opuściło stos — obrażenia i tak są zadawane przez ten czar. Stub
      // niesie kontrolera, żeby efekt „damage" miał komu przypisać źródło.
      applyEffect(state, { type: 'damage', amount: pending.amount },
        Object.freeze({ id: pending.sourceId, controllerId: pending.playerId, cardId: pending.cardId ?? pending.sourceCardId ?? null }), [cmd.targetId]);
    }
    return accepted(state, cmd, { ok: true, events: state.events });
  }
  // Oczekująca decyzja backup (CR 702.165): jak scry — blokuje wszystko poza
  // resolve_backup (i koncesją). Decyzji może być kilka w kolejce, jeśli
  // więcej niż jeden stwór z backup wszedł w tej samej sekwencji.
  // Oczekująca decyzja redirect celu (Batch 24, Willbender): kontroler
  // triggera wybiera NOWY cel dla czaru na stosie (kandydaci = legalne cele
  // specyfikacji czaru minus obecny; liczeni dynamicznie — cel mógł zniknąć).
  // Benevolent Blessing (CMR): choose color for protection
  if (state.pendingColorChoice) {
    const pending = state.pendingColorChoice;
    if (cmd.type !== 'resolve_color_choice') return reject('color_choice_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('color_choice_not_your_decision');
    const COLORS = ['W', 'U', 'B', 'R', 'G'];
    if (!COLORS.includes(cmd.color)) return reject('illegal_color_choice');
    state.pendingColorChoice = null;
    // Apply protection from chosen color to the aura object
    const auraObj = state.objects.get(pending.auraId);
    if (auraObj && auraObj.zone === 'battlefield') {
      const updated = Object.freeze({ ...auraObj, aura: { ...auraObj.aura, chosenColor: cmd.color } });
      state.objects.set(pending.auraId, updated);
    }
    state.events.push(event('color_choice_resolved', {
      playerId: pending.playerId, color: cmd.color, auraId: pending.auraId,
    }));
    return accepted(state, cmd, { ok: true, events: state.events.slice(state.events.length - 1) });
  }
  // Fertile Thicket (BFZ): ETB reveal — gracz wybiera 0 lub 1 basic land z top 5.
  if (state.pendingFertileThicket) {
    const pending = state.pendingFertileThicket;
    if (cmd.type !== 'resolve_fertile_thicket') return reject('fertile_thicket_unresolved');
    if (cmd.playerId !== pending.controllerId) return reject('fertile_thicket_not_your_decision');
    // "You may" skip: player declines entirely (CR 701.18)
    if (cmd.skip) {
      state.pendingFertileThicket = null;
      state.events.push(event('fertile_thicket_resolved', {
        controllerId: pending.controllerId, chosenCardId: null, skipped: true,
      }));
      return accepted(state, cmd, { ok: true, events: state.events.slice(state.events.length - 1) });
    }
    const chosenId = cmd.chosenCardId ?? null;
    if (chosenId !== null) {
      if (!pending.basicLandIds.includes(chosenId)) return reject('illegal_fertile_thicket_choice');
    }
    // Reorder: chosen land goes on top, rest go to bottom
    const library = state.zones.library;
    const count = pending.topCardIds.length;
    const topCards = library.splice(0, count);
    // Put chosen on top (if any), rest on bottom
    if (chosenId !== null) {
      const idx = topCards.indexOf(chosenId);
      if (idx >= 0) topCards.splice(idx, 1);
      library.unshift(chosenId); // on top
    }
    // Rest go to bottom in given order
    for (const id of topCards) library.push(id);
    state.pendingFertileThicket = null;
    state.events.push(event('fertile_thicket_resolved', {
      controllerId: pending.controllerId, chosenCardId: chosenId,
    }));
    return accepted(state, cmd, { ok: true, events: state.events.slice(state.events.length - 1) });
  }
  // Springbloom Druid (MH1): ETB sacrifice land → search 2 basic lands tapped.
  if (state.pendingSpringbloom) {
    const pending = state.pendingSpringbloom;
    if (cmd.type !== 'resolve_springbloom') return reject('springbloom_unresolved');
    if (cmd.playerId !== pending.controllerId) return reject('springbloom_not_your_decision');
    // Player can choose to not sacrifice (skip)
    if (cmd.skip) {
      state.pendingSpringbloom = null;
      state.events.push(event('springbloom_skipped', { controllerId: pending.controllerId }));
      return accepted(state, cmd, { ok: true, events: state.events.slice(state.events.length - 1) });
    }
    const landId = cmd.sacrificeLandId;
    if (!pending.landIds.includes(landId)) return reject('illegal_springbloom_sacrifice');
    // Sacrifice the land
    const land = state.objects.get(landId);
    if (!land || land.zone !== 'battlefield') return reject('springbloom_land_missing');
    const toZone = (land.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, landId, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: landId, objectId: destId, playerId: pending.controllerId,
      cardId: moved.cardId, reason: 'springbloom_druid',
    }));
    // Search for up to 2 basic lands, put onto battlefield tapped
    const qualifier = { types: ['Basic', 'Land'] };
    const found = [];
    for (const id of [...state.zones.library]) {
      const obj = state.objects.get(id);
      if (!obj) continue;
      const types = obj.types ?? [];
      const matches = (qualifier.types ?? []).every(t => types.includes(t));
      if (matches && found.length < 2) {
        found.push(id);
      }
    }
    for (const cardId of found) {
      const newId = `permanent-${state.objectSequence++}`;
      const card = moveObjectDirectly(state, cardId, 'battlefield', newId);
      const permanent = Object.freeze({ ...card, controllerId: pending.controllerId, tapped: true, summoningSickness: true });
      state.objects.set(newId, permanent);
      state.events.push(event('permanent_entered_battlefield', {
        objectId: newId, cardId: card.cardId, controllerId: pending.controllerId, tapped: true,
      }));
    }
    // Shuffle library
    const seed = state.seed + state.objectSequence;
    const lib = state.zones.library;
    for (let i = lib.length - 1; i > 0; i--) {
      const j = Math.floor(((seed * (i + 1)) % 2147483647) / 2147483647 * (i + 1));
      [lib[i], lib[j]] = [lib[j], lib[i]];
    }
    state.pendingSpringbloom = null;
    state.events.push(event('springbloom_resolved', {
      controllerId: pending.controllerId, sacrificedLandId: landId,
      foundCardIds: found,
    }));
    return accepted(state, cmd, { ok: true, events: state.events.slice(state.events.length - 1) });
  }
  // Index (APC): look at top 5, reorder any order
  if (state.pendingIndex) {
    if (cmd.type !== 'resolve_index_choice') return reject('index_unresolved');
    if (cmd.playerId !== state.pendingIndex.playerId) return reject('index_not_your_decision');
    const pending = state.pendingIndex;
    const order = Array.isArray(cmd.order) ? cmd.order : pending.objectIds;
    if (order.length !== pending.objectIds.length || new Set(order).size !== order.length || !pending.objectIds.every((id) => order.includes(id))) {
      return reject('illegal_index_order');
    }
    // Reorder library: top 5 in given order (order[0] = new top)
    const library = state.zones.library;
    const topSet = new Set(pending.objectIds);
    state.zones.library = [...order, ...library.filter((id) => !topSet.has(id))];
    state.pendingIndex = null;
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    state.events.push(event('index_resolved', { playerId: pending.playerId, count: pending.objectIds.length, order: [...order] }));
    const resolved = state.events.slice(state.events.length - 1);
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolved.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    return accepted(state, cmd, { ok: true, events: resolved });
  }

    if (state.pendingRedirectChoice) {
    if (cmd.type !== 'resolve_redirect_choice') return reject('redirect_unresolved');
    if (cmd.playerId !== state.pendingRedirectChoice.playerId) return reject('redirect_not_your_decision');
    const pending = state.pendingRedirectChoice;
    const spell = state.objects.get(pending.stackId);
    if (!spell || spell.zone !== 'stack') return reject('redirect_spell_missing');
    const legal = legalTargetCandidates(state, pending.spellControllerId, pending.spec)
      .filter((id) => id !== pending.currentTargetId);
    if (!legal.includes(cmd.targetId)) return reject('illegal_redirect_target');
    state.pendingRedirectChoice = null;
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    state.events.push(event('redirect_choice_resolved', {
      playerId: cmd.playerId, stackId: pending.stackId,
      fromTarget: pending.currentTargetId, toTarget: cmd.targetId,
      cardId: spell.cardId ?? null,
    }));
    // Zmiana celu czaru (CR 115.7d): nowy cel już zwalidowany; podmieniamy
    // chosenTargets obiektu na stosie.
    const updated = Object.freeze({ ...spell, chosenTargets: [cmd.targetId] });
    state.objects.set(pending.stackId, updated);
    return accepted(state, cmd, { ok: true, events: state.events.slice(state.events.length - 1) });
  }
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
  // Oczekująca decyzja szukania w bibliotece (Temat 6): resolve_search_choice
  // { found: objectId | null } — wybór karty albo rezygnacja (fail to find).
  if (state.pendingSearchChoice) {
    if (cmd.type !== 'resolve_search_choice') return reject('search_choice_unresolved');
    if (cmd.playerId !== state.pendingSearchChoice.playerId) return reject('search_choice_not_your_decision');
    const pending = state.pendingSearchChoice;
    const matches = (object) => {
      if (!object || object.controllerId !== pending.playerId || object.zone !== 'library') return false;
      const q = pending.qualifier ?? {};
      const typeMatch = (q.types ?? []).length === 0
        || (q.types ?? []).every((type) => (object.types ?? []).includes(type));
      const subtypeMatch = (q.subtypes ?? []).length === 0
        || (q.subtypes ?? []).some((subtype) => (object.subtypes ?? []).includes(subtype));
      return typeMatch && subtypeMatch;
    };
    const before = state.events.length;
    let foundCardId = null;
    if (cmd.found != null) {
      const chosen = state.objects.get(cmd.found);
      if (!chosen || !matches(chosen)) return reject('illegal_search_choice');
      foundCardId = chosen.cardId;
      const destZone = pending.destination === 'battlefield' ? 'battlefield' : 'hand';
      const newId = `${destZone === 'battlefield' ? 'permanent' : 'hand'}-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, cmd.found, destZone, newId);
      const placed = destZone === 'battlefield'
        ? Object.freeze({ ...moved, tapped: Boolean(pending.entersTapped || moved.entersTapped) })
        : moved;
      if (placed !== moved) state.objects.set(newId, placed);
      state.events.push(event('card_revealed', { playerId: pending.playerId, objectId: newId, cardId: placed.cardId, searched: true }));
      state.events.push(event('object_moved', {
        fromId: cmd.found, object: placed, fromZone: 'library', toZone: destZone, searched: true,
      }));
      if (destZone === 'battlefield') {
        state.events.push(event('permanent_entered_battlefield', {
          fromId: cmd.found, objectId: newId, object: placed, cardId: placed.cardId,
          controllerId: pending.playerId, searched: true, entersTapped: placed.tapped,
        }));
      }
    }
    // Po przeszukaniu biblioteka jest tasowana (CR 701.19c) — także przy
    // rezygnacji („search... then shuffle" — samo szukanie tasuje).
    const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === pending.playerId);
    const shuffled = shuffle(ownLibrary, state.seed + state.objectSequence);
    let cursor = 0;
    state.zones.library = state.zones.library.map((id) => {
      if (state.objects.get(id)?.controllerId !== pending.playerId) return id;
      const replacement = shuffled[cursor];
      cursor += 1;
      return replacement;
    });
    state.pendingSearchChoice = null;
    state.events.push(event('search_choice_resolved', {
      playerId: pending.playerId, found: cmd.found != null, sourceCardId: pending.sourceCardId,
    }));
    state.events.push(event('library_searched', {
      playerId: pending.playerId, foundCardId,
      destination: pending.destination, shuffled: true, qualifier: pending.qualifier,
    }));
    const resolvedEvents = state.events.slice(before);
    // Cycling (typecycling): po wyborze emitujemy ability_activated.
    if (pending.emitter?.kind === 'cycling') {
      state.events.push(event('ability_activated', {
        playerId: pending.playerId, objectId: pending.emitter.objectId,
        abilityIndex: pending.emitter.abilityIndex, cardId: pending.emitter.cardId, cycling: true,
      }));
      resolvedEvents.push(state.events[state.events.length - 1]);
    }
    // Czar na stosie (Caravan Vigil itd.) dokańcza efekty po decyzji.
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja „zapłać albo poświęć" (Rupture Spire, Temat 7).
  if (state.pendingPayOrSacrifice) {
    if (cmd.type !== 'resolve_pay_or_sacrifice') return reject('pay_or_sacrifice_unresolved');
    if (cmd.playerId !== state.pendingPayOrSacrifice.playerId) return reject('pay_or_sacrifice_not_your_decision');
    const pending = state.pendingPayOrSacrifice;
    const before = state.events.length;
    const source = state.objects.get(pending.sourceId);
    state.pendingPayOrSacrifice = null;
    if (cmd.pay && source && source.zone === 'battlefield') {
      applyEffect(state, { type: 'pay_mana', amount: pending.amount }, source, []);
      state.events.push(event('pay_or_sacrifice_resolved', {
        playerId: pending.playerId, sourceId: pending.sourceId, paid: true, amount: pending.amount,
      }));
    } else {
      if (source && source.zone === 'battlefield') {
        applyEffect(state, { type: 'sacrifice_permanent' }, source, []);
      }
      state.events.push(event('pay_or_sacrifice_resolved', {
        playerId: pending.playerId, sourceId: pending.sourceId, paid: false,
      }));
    }
    const resolvedEvents = state.events.slice(before);
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja opcjonalnej płatności triggera (Panic Spellbomb,
  // Zoraline — Temat 8): „you may pay ... When you do, ...".
  if (state.pendingOptionalPay) {
    if (cmd.type !== 'resolve_optional_pay_choice') return reject('optional_pay_unresolved');
    if (cmd.playerId !== state.pendingOptionalPay.playerId) return reject('optional_pay_not_your_decision');
    const pending = state.pendingOptionalPay;
    const before = state.events.length;
    state.pendingOptionalPay = null;
    if (cmd.pay) {
      const payColors = (pending.ability?.trigger?.payColors ?? []).map((color) => [color]);
      const payMana = pending.ability?.trigger?.payMana ?? 0;
      const payLife = pending.ability?.trigger?.payLife ?? 0;
      // Płatność wykonujemy RAZ (tutaj). Definicje triggerów (Zoraline) mogą
      // dodatkowo nieść efekty pay_mana/pay_life — filtrujemy je przed
      // odpaleniem, żeby nie płacić drugi raz.
      const rawEffects = Array.isArray(pending.ability?.effect)
        ? pending.ability.effect
        : [pending.ability?.effect].filter(Boolean);
      const effects = rawEffects.filter((e) => e?.type !== 'pay_mana' && e?.type !== 'pay_life');
      const abilityToFire = { ...pending.ability, effect: effects.length === 1 ? effects[0] : effects };
      if (payMana > 0) spendMana(state, pending.playerId, payMana, payColors);
      if (payLife > 0) changeLife(state, pending.playerId, -payLife);
      const source = state.objects.get(pending.sourceId);
      if (source) {
        if (pending.requiresTargetDecision) {
          // Zoraline (Temat 2): PO zapłacie kontroler wybiera CEL reanimacji
          // (resolve_trigger_target) — „When you do, return target ...".
          const spec = abilityToFire.trigger?.requiresTarget;
          const candidates = legalTriggerTargetCandidates(state, {
            sourceId: pending.sourceId, ability: abilityToFire, extra: pending.extra ?? {},
          });
          if (candidates.length > 0) {
            state.pendingTriggerTargets.push({
              playerId: pending.playerId,
              sourceId: pending.sourceId,
              cardId: source.cardId,
              ability: Object.freeze({ ...abilityToFire }),
              candidates: [...candidates],
              allowNone: false,
              fixedTargetIds: [],
              extra: Object.freeze({ ...(pending.extra ?? {}) }),
              restorePriorityTo: pending.restorePriorityTo,
            });
            const required = event('trigger_target_required', {
              playerId: pending.playerId, sourceId: pending.sourceId,
              cardId: source.cardId, candidateIds: [...candidates], allowNone: false,
            });
            state.events.push(required);
          } else {
            // Brak legalnego celu — „When you do" nic nie robi (CR 608.2b).
            state.events.push(event('trigger_target_resolved', {
              playerId: pending.playerId, sourceId: pending.sourceId,
              cardId: source.cardId, targetId: null, noEffect: true,
            }));
          }
        } else {
          // T6: opłacony trigger idzie na STOS — rozstrzyga się po passach.
          queueTriggerToStack(state, abilityToFire, source, pending.targetId ? [pending.targetId] : [], [], pending.extra ?? {});
        }
      }
      state.events.push(event('optional_pay_resolved', { playerId: pending.playerId, paid: true }));
    } else {
      state.events.push(event('optional_pay_resolved', { playerId: pending.playerId, paid: false }));
    }
    const resolvedEvents = state.events.slice(before);
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja „you may" triggera bez celu (Angel's Feather):
  // tak/nie — jak opcjonalna płatność, ale bez kosztu.
  // M69 (Exploit, Silumgar Butcher — CR 702.110): „When this creature enters,
  // you may sacrifice a creature. When this creature exploits a creature, ..."
  // Opcjonalna decyzja kontrolera: poświęć INNEGO stwora albo skip. Po
  // poświęceniu emitujemy exploited (odpala trigger „exploits" na źródle).
  if (state.pendingExploits.length > 0) {
    const pending = state.pendingExploits[0];
    if (cmd.type !== 'resolve_exploit_choice') return reject('exploit_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('exploit_not_your_decision');
    const before = state.events.length;
    if (cmd.skip === true) {
      state.pendingExploits.shift();
      state.events.push(event('exploit_choice_resolved', { playerId: pending.playerId, sourceId: pending.sourceId, skipped: true }));
      if (state.pendingExploits.length > 0) state.turn.priorityPlayerId = state.pendingExploits[0].playerId;
      else if (pending.restorePriorityTo && state.players.some((pl) => pl.id === pending.restorePriorityTo)) state.turn.priorityPlayerId = pending.restorePriorityTo;
      return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
    }
    if (!pending.candidateIds.includes(cmd.targetId)) return reject('illegal_exploit_target');
    const target = state.objects.get(cmd.targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature' || target.controllerId !== pending.playerId) return reject('illegal_exploit_target');
    state.pendingExploits.shift();
    const moved = moveObjectDirectly(state, cmd.targetId, 'graveyard', `grave-${state.objectSequence++}`);
    state.events.push(event('permanent_sacrificed', {
      fromId: cmd.targetId, objectId: moved.id, playerId: pending.playerId, cardId: moved.cardId, exploit: true,
    }));
    state.events.push(event('exploited', { exploiterId: pending.sourceId, exploitedId: moved.id }));
    state.events.push(event('exploit_choice_resolved', { playerId: pending.playerId, sourceId: pending.sourceId, exploitedId: moved.id }));
    if (state.pendingExploits.length > 0) state.turn.priorityPlayerId = state.pendingExploits[0].playerId;
    else if (pending.restorePriorityTo && state.players.some((pl) => pl.id === pending.restorePriorityTo)) state.turn.priorityPlayerId = pending.restorePriorityTo;
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }

  // M69 (Dreams of Steel and Oil, BRO): „Target opponent reveals their hand.
  // You choose an artifact or creature card from it, then choose an artifact or
  // creature card from their graveyard. Exile the chosen cards." — dwie
  // sekwencyjne decyzje (ręka → grób); czar czeka na stosie (pendingSpell).
  if (state.pendingRevealExile) {
    const pending = state.pendingRevealExile;
    if (cmd.type !== 'resolve_reveal_exile_hand' && cmd.type !== 'resolve_reveal_exile_grave') return reject('reveal_exile_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('reveal_exile_not_your_decision');
    const before = state.events.length;
    if (cmd.type === 'resolve_reveal_exile_hand') {
      const cardId = cmd.cardId ?? null;
      // Wybór OBOWIĄZKOWY: null tylko, gdy w ręce nie ma żadnego kandydata
      // (etap pomijany — karta musiała zniknąć między kolejką a decyzją).
      if (cardId != null && !pending.handIds.includes(cardId)) return reject('illegal_reveal_exile_hand');
      if (cardId == null && pending.handIds.length > 0) return reject('illegal_reveal_exile_hand');
      pending.chosenHand = cardId;
      pending.stage = 'grave';
      state.events.push(event('reveal_exile_hand_chosen', { playerId: pending.playerId, opponentId: pending.opponentId, cardId }));
      if (pending.graveIds.length > 0) {
        state.turn.priorityPlayerId = pending.playerId;
        state.events.push(event('reveal_exile_grave_required', { playerId: pending.playerId, opponentId: pending.opponentId, graveCardIds: [...pending.graveIds] }));
        return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
      }
    } else {
      const cardId = cmd.cardId ?? null;
      if (cardId != null && !pending.graveIds.includes(cardId)) return reject('illegal_reveal_exile_grave');
      if (cardId == null && pending.graveIds.length > 0) return reject('illegal_reveal_exile_grave');
      pending.chosenGrave = cardId;
      pending.stage = 'done';
      state.events.push(event('reveal_exile_grave_chosen', { playerId: pending.playerId, opponentId: pending.opponentId, cardId }));
    }
    // Obie decyzje podjęte — wygnaj wybrane (lub te, które wciąż istnieją).
    state.pendingRevealExile = null;
    for (const cardId of [pending.chosenHand, pending.chosenGrave]) {
      if (cardId == null) continue;
      const object = state.objects.get(cardId);
      if (!object) continue;
      const zone = object.zone;
      if (zone !== 'hand' && zone !== 'graveyard') continue;
      const exileId = `exile-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, cardId, 'exile', exileId);
      state.events.push(event('object_exiled', { fromId: cardId, objectId: exileId, object: moved, cardId: moved.cardId, playerId: pending.playerId }));
    }
    state.events.push(event('reveal_exile_resolved', { playerId: pending.playerId, opponentId: pending.opponentId }));
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      state.events.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    if (pending.restorePriorityTo && state.players.some((pl) => pl.id === pending.restorePriorityTo)) state.turn.priorityPlayerId = pending.restorePriorityTo;
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }

  if (state.pendingOptionalTrigger) {
    if (cmd.type !== 'resolve_optional_trigger_choice') return reject('optional_trigger_unresolved');
    if (cmd.playerId !== state.pendingOptionalTrigger.playerId) return reject('optional_trigger_not_your_decision');
    const pending = state.pendingOptionalTrigger;
    const before = state.events.length;
    state.pendingOptionalTrigger = null;
    if (cmd.fire) {
      const source = state.objects.get(pending.sourceId);
      if (source && source.zone === 'battlefield') {
        // T6: zaakceptowany „you may" idzie na STOS — rozstrzyga się po passach.
        queueTriggerToStack(state, pending.ability, source, [], [], pending.extra ?? {});
      }
    }
    state.events.push(event('optional_trigger_resolved', {
      playerId: pending.playerId, fired: Boolean(cmd.fire),
      sourceCardId: pending.sourceId ? (state.objects.get(pending.sourceId)?.cardId ?? null) : null,
    }));
    const resolvedEvents = state.events.slice(before);
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja CELU triggera (Temat 2): kontroler wskazuje cel —
  // kandydaci liczeni dynamicznie w chwili wyboru (jak delirium/mentor);
  // allowNone pozwala odmówić („up to one"/„you may").
  if (state.pendingTriggerTargets.length > 0) {
    const pending = state.pendingTriggerTargets[0];
    if (cmd.type !== 'resolve_trigger_target') return reject('trigger_target_unresolved');
    if (cmd.playerId !== pending.playerId) return reject('trigger_target_not_your_decision');
    const legal = legalTriggerTargetCandidates(state, pending);
    const chosen = cmd.targetId ?? null;
    if (chosen === null) {
      if (!pending.allowNone) return reject('illegal_trigger_target');
    } else if (!legal.includes(chosen)) {
      return reject('illegal_trigger_target');
    }
    const before = state.events.length;
    state.pendingTriggerTargets.shift();
    const source = state.objects.get(pending.sourceId);
    const sourceLegal = Boolean(source
      && ['battlefield', 'graveyard', 'exile'].includes(source.zone)
      && triggerConditionHolds(state, pending.ability, source, pending.extra ?? {}));
    // Trigger odpala się przy legalnym źródle. Odmowa celu (chosen === null):
    // - „you may ... When you do, ..." (requiresTarget.optional — Kappa,
    //   Reclusive Artificer, Jill): cała zdolność odrzucona (nic nie odpala);
    // - „up to one" w obowiązkowym triggerze (Greatsword): trigger odpala
    //   z celami stałymi (licznik na nosicielu), a efekty z targetIndex
    //   wskazującym null są pomijane przez applyEffect.
    const specOptional = Boolean(pending.ability?.trigger?.requiresTarget?.optional);
    if (sourceLegal && (chosen !== null || !specOptional)) {
      // T6: wybrany cel wędruje z triggerem na STOS — rozstrzyga się po passach.
      queueTriggerToStack(state, pending.ability, source, [...pending.fixedTargetIds, chosen], [], pending.extra ?? {});
    }
    state.events.push(event('trigger_target_resolved', {
      playerId: pending.playerId, sourceId: pending.sourceId, cardId: pending.cardId,
      targetId: chosen, noEffect: !sourceLegal || chosen === null,
      remaining: state.pendingTriggerTargets.length,
    }));
    if (state.pendingTriggerTargets.length > 0) {
      state.turn.priorityPlayerId = state.pendingTriggerTargets[0].playerId;
    } else if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: state.events.slice(before) });
  }
  // Oczekująca decyzja Moonlit Meditation (Temat 9 — „you may instead").
  if (state.pendingMoonlitChoice) {
    if (cmd.type !== 'resolve_moonlit_choice') return reject('moonlit_choice_unresolved');
    if (cmd.playerId !== state.pendingMoonlitChoice.playerId) return reject('moonlit_choice_not_your_decision');
    const pending = state.pendingMoonlitChoice;
    const before = state.events.length;
    const ctrl = pending.playerId;
    state.pendingMoonlitChoice = null;
    // Pierwsze tworzenie tokenu w turze jest „zużyte" niezależnie od wyboru
    // (CR: „The first time ... each turn" — trigger już się odpalił).
    state.moonlitUsedThisTurn = { ...(state.moonlitUsedThisTurn ?? {}), [ctrl]: true };
    if (cmd.replace) {
      const enchanted = state.objects.get(pending.enchantedId);
      if (enchanted && enchanted.zone === 'battlefield') {
        let amount = pending.effect.amount ?? 1;
        if (pending.effect.amount === 'commander_casts') amount = 0;
        for (let i = 0; i < amount; i += 1) {
          createBattlefieldToken(state, ctrl, {
            cardId: 'token_clone', name: enchanted.cardName ?? 'Clone',
            kind: enchanted.kind === 'creature' ? 'creature' : 'artifact',
            power: enchanted.power, toughness: enchanted.toughness,
            colors: [...(enchanted.colors ?? [])], types: [...(enchanted.types ?? [])],
            subtypes: [...(enchanted.subtypes ?? [])], keywords: [...(enchanted.keywords ?? [])],
            abilities: [...(enchanted.abilities ?? [])].filter((a) => {
              const effs = Array.isArray(a.effect) ? a.effect : [a.effect];
              return !effs.some((e) => e?.type === 'transform');
            }),
          });
        }
      }
      state.events.push(event('moonlit_choice_resolved', { playerId: ctrl, replaced: true }));
    } else {
      // Zwykłe tworzenie tokenów — efekt odtwarzany z zapisanym źródłem/celami.
      const source = state.objects.get(pending.sourceObjectId);
      if (source) applyEffect(state, { type: 'create_token', ...pending.effect }, source, pending.targets ?? []);
      state.events.push(event('moonlit_choice_resolved', { playerId: ctrl, replaced: false }));
    }
    const resolvedEvents = state.events.slice(before);
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja wyboru typu landa (Unstable Frontier).
  if (state.pendingLandTypeChoice) {
    if (cmd.type !== 'resolve_land_type_choice') return reject('land_type_choice_unresolved');
    if (cmd.playerId !== state.pendingLandTypeChoice.playerId) return reject('land_type_choice_not_your_decision');
    const pending = state.pendingLandTypeChoice;
    const BASIC_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
    if (!BASIC_TYPES.includes(cmd.landType)) return reject('illegal_land_type');
    const before = state.events.length;
    grantBasicLandTypeUntilEndOfTurn(state, pending.targetId, cmd.landType);
    state.pendingLandTypeChoice = null;
    state.events.push(event('land_type_choice_resolved', {
      playerId: pending.playerId, targetId: pending.targetId, landType: cmd.landType,
      sourceCardId: pending.sourceCardId,
    }));
    const resolvedEvents = state.events.slice(before);
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // M67 (Force Away): ferocious „you may draw a card. If you do, discard a
  // card." — decyzja tak/nie; po TAK dobranie + łańcuch resolve_discard_choice
  // (który dokańcza pendingSpell). Po NIE czar rozstrzyga się normalnie.
  if (state.pendingOptionalDraw) {
    if (cmd.type !== 'resolve_optional_draw') return reject('optional_draw_unresolved');
    if (cmd.playerId !== state.pendingOptionalDraw.playerId) return reject('optional_draw_not_your_decision');
    const pending = state.pendingOptionalDraw;
    const before = state.events.length;
    state.pendingOptionalDraw = null;
    let resolvedEvents = state.events.slice(before);
    if (cmd.draw) {
      drawPlayerCards(state, pending.playerId, 1);
      const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === pending.playerId);
      if (handIds.length > 0) {
        state.pendingDiscardChoice = {
          playerId: pending.playerId,
          count: 1,
          handIds,
          purpose: 'effect',
          sourceCardId: pending.sourceCardId,
          restorePriorityTo: pending.restorePriorityTo ?? state.turn.priorityPlayerId,
        };
        state.turn.priorityPlayerId = pending.playerId;
        const required = event('discard_choice_required', {
          playerId: pending.playerId, count: 1, cardIds: [...handIds],
          purpose: 'effect', sourceCardId: pending.sourceCardId,
        });
        state.events.push(required);
        resolvedEvents.push(required);
        return accepted(state, cmd, { ok: true, events: resolvedEvents });
      }
    }
    state.events.push(event('optional_draw_resolved', { playerId: pending.playerId, drew: Boolean(cmd.draw) }));
    resolvedEvents = state.events.slice(before);
    if (state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }

  // Oczekująca decyzja odrzucenia (Temat 4): jedyna droga dalej to
  // resolve_discard_choice decydenta.
  if (state.pendingDiscardChoice) {
    if (cmd.type !== 'resolve_discard_choice') return reject('discard_choice_unresolved');
    if (cmd.playerId !== state.pendingDiscardChoice.playerId) return reject('discard_choice_not_your_decision');
    const pending = state.pendingDiscardChoice;
    if (!pending.handIds.includes(cmd.cardId)) return reject('illegal_discard_choice');
    const card = state.objects.get(cmd.cardId);
    if (!card || card.zone !== 'hand' || card.controllerId !== pending.playerId) return reject('illegal_discard_choice');
    const before = state.events.length;
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, cmd.cardId, 'graveyard', graveId);
    state.events.push(event('card_discarded', {
      playerId: pending.playerId, fromId: cmd.cardId, objectId: graveId,
      cardId: moved.cardId, choice: true, purpose: pending.purpose,
    }));
    // M67 (Civilized Scholar): „If a creature card is discarded this way,
    // untap this creature, then transform it." — po odrzuceniu karty-stwora
    // wykonaj akcje zapisane w pending (odkręcenie + transform źródła).
    if (pending.onCreatureDiscard && (moved.kind === 'creature' || (moved.types ?? []).includes('Creature'))) {
      const target = pending.onCreatureDiscard;
      const source = state.objects.get(target.sourceId);
      if (source && source.zone === 'battlefield') {
        if (target.untap) {
          const updated = untapObject(state, target.sourceId, pending.playerId);
          state.events.push(event('object_untapped', { objectId: target.sourceId, playerId: pending.playerId }));
        }
        if (target.transform) {
          applyEffect(state, { type: 'transform' }, state.objects.get(target.sourceId), []);
        }
      }
    }
    const remaining = pending.count - 1;
    const stillInHand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === pending.playerId);
    const resolvedEvents = state.events.slice(before);
    if (remaining > 0 && stillInHand.length > 0) {
      // Kolejny wybór (Plague Reaver — dwie karty): decyzja sekwencyjna.
      state.pendingDiscardChoice = { ...pending, count: remaining, handIds: stillInHand };
      const required = event('discard_choice_required', {
        playerId: pending.playerId, count: remaining, cardIds: [...stillInHand],
        purpose: pending.purpose, sourceCardId: pending.sourceCardId,
      });
      state.events.push(required);
      resolvedEvents.push(required);
      state.turn.priorityPlayerId = pending.playerId;
      return accepted(state, cmd, { ok: true, events: resolvedEvents });
    }
    state.pendingDiscardChoice = null;
    const resolved = event('discard_choice_resolved', {
      playerId: pending.playerId, purpose: pending.purpose, sourceCardId: pending.sourceCardId,
    });
    state.events.push(resolved);
    resolvedEvents.push(resolved);
    // Koszt zdolności: po dokończeniu wyborów wykonaj wstrzymaną aktywację.
    if (pending.purpose === 'cost' && state.pendingAbilityActivation) {
      const activation = state.pendingAbilityActivation;
      state.pendingAbilityActivation = null;
      const marker = state.events.length;
      const outcome = performActivation(state, activation);
      if (outcome) resolvedEvents.push(...state.events.slice(marker));
    }
    // Efekt czaru: dokończ wstrzymane rozstrzyganie (pendingSpell).
    if (pending.purpose === 'effect' && state.pendingSpell) {
      const spellPending = state.pendingSpell;
      state.pendingSpell = null;
      resolvedEvents.push(...finishPendingSpell(state, spellPending.stackId, spellPending.effects));
    }
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
  // Oczekująca decyzja „karta z ręki na wierzch biblioteki\" (Chittering Rats).
  if (state.pendingHandTopChoice) {
    if (cmd.type !== 'resolve_hand_top_choice') return reject('hand_top_choice_unresolved');
    if (cmd.playerId !== state.pendingHandTopChoice.playerId) return reject('hand_top_choice_not_your_decision');
    const pending = state.pendingHandTopChoice;
    if (!pending.handIds.includes(cmd.cardId)) return reject('illegal_hand_top_choice');
    const card = state.objects.get(cmd.cardId);
    if (!card || card.zone !== 'hand' || card.controllerId !== pending.playerId) return reject('illegal_hand_top_choice');
    const before = state.events.length;
    const libId = `library-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, cmd.cardId, 'library', libId);
    // Na wierzch = przed pierwszą własną kartą od wierzchu.
    const library = state.zones.library.filter((id) => id !== libId);
    const topIndex = library.findIndex((id) => state.objects.get(id)?.controllerId === pending.playerId);
    const insertAt = topIndex === -1 ? library.length : topIndex;
    library.splice(insertAt, 0, libId);
    state.zones.library = library;
    state.events.push(event('object_moved', {
      fromId: cmd.cardId, object: moved, fromZone: 'hand', toZone: 'library', handToTop: true,
    }));
    state.pendingHandTopChoice = null;
    state.events.push(event('hand_top_choice_resolved', {
      playerId: pending.playerId, cardId: moved.cardId, sourceCardId: pending.sourceCardId,
    }));
    const resolvedEvents = state.events.slice(before);
    if (pending.restorePriorityTo && state.players.some((p) => p.id === pending.restorePriorityTo)) {
      state.turn.priorityPlayerId = pending.restorePriorityTo;
    }
    return accepted(state, cmd, { ok: true, events: resolvedEvents });
  }
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
      // Rzuć permanent bez kosztu many — idzie na STOS jak każdy rzut czaru
      // (CR 601); na bitwisko wchodzi po rozstrzygnięciu (resolvePermanentSpell).
      const stackId = `spell-${state.objectSequence++}`;
      moveObjectDirectly(state, disc.foundExileId, 'stack', stackId);
      const perm = Object.freeze({
        ...state.objects.get(stackId), summoningSickness: true, wasCast: true,
        tapped: false, chosenTargets: [],
      });
      state.objects.set(stackId, perm);
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
    // Żaden pass nie może ominąć rozstrzygnięcia obrażeń combat — ALE tylko
    // przy PUSTYM stosie: instant/trigger w oknie combat_damage musi się
    // rozstrzygnąć passami (T6), zanim obrażenia zostaną zadane.
    if (state.turn.step === 'combat_damage' && state.combat && state.zones.stack.length === 0) return reject('combat_unresolved');
    const current = state.players.findIndex((p) => p.id === state.turn.priorityPlayerId);
    const next = state.players[(current + 1) % state.players.length].id;
    state.turn.passes += 1;
    const events = [event('priority_passed', { playerId: cmd.playerId, nextPlayerId: next })];
    if (state.turn.passes >= state.players.length) {
      // Pełna runda passów: najpierw rozstrzygaj wierzchni czar stosu (LIFO),
      // dopiero przy pustym stosie przechodź dalej (CR 117.4 w uproszczeniu).
      if (state.zones.stack.length > 0) {
        // CR 117.3b: po rozstrzygnięciu czaru priorytet należy do AKTYWNEGO
        // gracza. Ustawiamy go PRZED rozstrzygnięciem — triggery ETB czarów
        // permanentów odpalały się w rundzie passów (od T1), więc decyzje
        // kolejkowane przez nie (search/pay-or-sacrifice itd.) zapamiętywały
        // restorePriorityTo = ostatni passer zamiast aktywnego gracza.
        state.turn.priorityPlayerId = state.turn.activePlayerId;
        const resolution = resolveTopOfStack(state);
        events.push(...resolution);
        state.turn.passes = 0;
        // Rozstrzygnięty czar mógł stworzyć blokującą decyzję (surveil/scry/
        // clash w środku listy efektów — np. Curate, Release the Ants).
        // Właściciel decyzji przejął już priorytet w efekcie; nadpisanie go
        // aktywnym graczem zablokowałoby grę (posiadacz priorytetu nie miałby
        // żadnej legalnej komendy).
        if (!state.pendingScry && !state.pendingSurveil && !state.pendingRevealOrder && !state.pendingProliferate && !state.pendingModalTrigger && !state.pendingDamageTarget && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingIndex && !state.pendingOptionalDraw && !state.pendingDamageAssignment && state.pendingExploits.length === 0 && !state.pendingRevealExile && !state.pendingColorChoice && !state.pendingClash && !state.pendingSacrifice && !state.pendingDiscardChoice && !state.pendingHandTopChoice && !state.pendingLandTypeChoice && !state.pendingSearchChoice && !state.pendingPayOrSacrifice && !state.pendingOptionalPay && !state.pendingTriggerTargets.some((p) => triggerTargetDecisionPending(state, p)) && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingColorChoice && !state.pendingOptionalTrigger && !state.pendingMoonlitChoice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !state.pendingGraveyardToTop && state.pendingBackups.length === 0 && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && state.pendingDeliriumTargets.length === 0 && state.pendingMentorTargets.length === 0 && !state.pendingLegendChoice) {
          state.turn.priorityPlayerId = state.turn.activePlayerId;
        }
      } else {
        const previousTurnNumber = state.turn.number;
        state.turn = nextTurnStep(state.turn, state.players);
        events.push(event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step }));
        // CR 106.4: niewykorzystana mana znika z puli na końcu KAŻDEGO kroku
        // i fazy (wcześniej utrzymywała się do końca tury — tapnięte landy
        // „trzymały" manę przez walkę i fazy przeciwnika).
        for (const player of state.players) {
          player.mana = 0;
          player.manaPool = {};
          player.treasureMana = 0;
        }
        if (state.turn.step === 'cleanup') {
          clearMarkedDamage(state);
          clearStatModifiers(state);
          // M67: flagi tury (Homicidal Brute „didn't attack this turn",
          // Guildsworn Prowler „wasn't blocking") — czyszczone w cleanup
          // razem z innymi znacznikami tury (CR 514.2).
          for (const object of state.objects.values()) {
            if (object.zone !== 'battlefield') continue;
            if (object.attackedThisTurn || object.isBlockingThisCombat) {
              const next = { ...object };
              if (next.attackedThisTurn) delete next.attackedThisTurn;
              if (next.isBlockingThisCombat) delete next.isBlockingThisCombat;
              state.objects.set(object.id, Object.freeze(next));
            }
          }
          // Prewencja obrażeń „this turn\" (Ethersworn Shieldmage) wygasa
          // w cleanup razem z grantami i modyfikatorami (CR 514.2).
          state.preventDamageThisTurn = [];
          // Tarcze prewencji „this turn" (Withstand) wygasają w cleanup.
          state.damageShields = [];
          // Tarcze regeneracji (CR 701.12a — „this turn") wygasają w cleanup.
          state.regenerationShields = [];
          // Flaga „can't be regenerated this turn" (Rage of Purphoros) wygasa
          // w cleanup razem z tarczami regeneracji (oba są efektami trwałymi
          // do końca tury).
          state.cantBeRegeneratedThisTurn = [];
          // CR 514.1 (limit ręki): w cleanup TYLKO AKTYWNY gracz odrzuca
          // nadmiar ponad maksymalny rozmiar ręki (zwykle 7). Poprzednio
          // pętla po WSZYSTKICH graczach zmuszała też nieaktywnego do
          // odrzucania — w MtG limit ręki sprawdzany jest wyłącznie w
          // cleanup aktywnego gracza (bug złotej odznaki). Wybór kart
          // należy do gracza — kolejkowana decyzja discard (purpose
          // 'hand_size'), która blokuje grę do resolve_discard_choice.
          const activePlayer = state.players.find((pl) => pl.id === state.turn.activePlayerId);
          if (activePlayer) {
            const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === activePlayer.id);
            if (handIds.length > 7) {
              state.pendingDiscardChoice = {
                playerId: activePlayer.id,
                count: handIds.length - 7,
                handIds,
                purpose: 'hand_size',
                sourceCardId: null,
                restorePriorityTo: state.turn.priorityPlayerId,
              };
              state.turn.priorityPlayerId = activePlayer.id;
              const required = event('discard_choice_required', {
                playerId: activePlayer.id, count: handIds.length - 7,
                cardIds: [...handIds], purpose: 'hand_size',
              });
              state.events.push(required);
              events.push(required);
              // Czekamy na decyzję PRZED przejściem do następnej tury.
              return accepted(state, cmd, { ok: true, events });
            }
          }
        }
        if (state.turn.number !== previousTurnNumber) {
          // Przeliczenie licznika czarów poprzedniej tury (transform).
          state.lastTurnSpellsCast = state.spellsCastThisTurn;
          // M68: per-gracz kopia poprzedniej tury (daybound upkeep — CR 708.9f).
          state.lastTurnSpellsCastByPlayer = { ...state.spellsCastThisTurnByPlayer };
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
          state.speedIncreasedThisTurn = {};
          state.moonlitUsedThisTurn = {};
          // Zdarzenia startu tury (turn_started, odkręcenia) doklejamy do
          // wyniku komendy — konsument protokołu dostaje pełny strumień.
          events.push(...beginTurn(state, state.turn.activePlayerId).events);
          // CR 701.38c: goad trwa do początku NASTĘPNEJ tury gracza, który
          // goadował (w 1v1 turn.number + 2) — wygasa na starcie tury, gdy
          // goadedUntilTurn <= bieżący numer tury. Wcześniej goad wygasał
          // w cleanup tej samej tury, więc zaczarowany stwór nie musiał
          // atakować w turze przeciwnika (bug znaleziony w srebrnym audycie).
          for (const goadedObject of state.objects.values()) {
            if (goadedObject.zone !== 'battlefield' || !goadedObject.goaded) continue;
            if ((goadedObject.goadedUntilTurn ?? 0) <= state.turn.number) {
              state.objects.set(goadedObject.id, Object.freeze({ ...goadedObject, goaded: false, goadedUntilTurn: null }));
            }
          }
        }
      }
    } else {
      state.turn.priorityPlayerId = next;
    }
    // Rozstrzygnięcie stosu (resolveTopOfStack) i beginTurn już dopisały swoje
    // zdarzenia do state.events — dokładamy TYLKO nowe (dedupe po referencji),
    // żeby zdarzenia efektów nie dublowały się w logu (T6: triggery rozstrzygają
    // się w tej komendzie, a ich efekty pushują bezpośrednio do state.events).
    state.events.push(...events.filter((e) => !state.events.includes(e)));
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
        treasureAlt: Boolean(cmd.treasureAlt),
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
      const e = castSpell(state, cmd.playerId, cmd.objectId, cmd.targets, cmd.sacrificeTargetId, cmd.modeIndex, cmd.stunTargetId, cmd.buyback);
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
      const e = activateAbility(state, cmd.playerId, cmd.objectId, cmd.abilityIndex, cmd.attackerId, cmd.targets, cmd.xValue, cmd.crewCreatureIds, cmd.tapCreatureId, cmd.tapOtherCreatureId);
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
    // CR: deklaracja bloków następuje po rozstrzygnięciu stosu — przy
    // triggerach/czarach na stosie nie można blokować (T6).
    if (state.zones.stack.length > 0) return reject('stack_not_empty');
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
    // CR: obrażenia bojowe po rozstrzygnięciu stosu (instanty w odpowiedzi
    // na bloki muszą się rozstrzygnąć najpierw — T6).
    if (state.zones.stack.length > 0) return reject('stack_not_empty');
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

  // M66 (R): rozdzielanie obrażeń combat (CR 510.1c/d) — decyzja atakującego.
  // Walidacja względem ŻYWEGO stanu (bloker mógł zginąć/dostać buffa między
  // kolejką a decyzją); reszta przebiegu (i drugi pass) wznawia się przez
  // resolveCombatDamage z resume.
  if (state.pendingDamageAssignment) {
    if (cmd.type !== 'resolve_damage_assignment') return reject('damage_assignment_unresolved');
    if (cmd.playerId !== state.pendingDamageAssignment.playerId) return reject('damage_assignment_not_your_decision');
    const pending = state.pendingDamageAssignment;
    const assignments = cmd.assignments ?? {};
    for (const attackerId of Object.keys(assignments)) {
      const err = validateDamageAssignment(state, attackerId, assignments[attackerId]);
      if (err) return reject(`illegal_damage_assignment:${err}`);
    }
    state.pendingDamageAssignment = null;
    try {
      const e = resolveCombatDamage(state, pending.defendingPlayerId, {
        pass: pending.pass, resumeFrom: pending.resumeFrom, assignments,
      });
      const resolved = event('damage_assignment_resolved', { playerId: pending.playerId });
      state.events.push(resolved);
      e.push(resolved);
      // Drugi pass mógł zakolejkować kolejną decyzję — kroku wtedy nie zmieniamy.
      if (state.pendingDamageAssignment) return accepted(state, cmd, { ok: true, events: e });
      state.turn = jumpToStep(state.turn, 'end_of_combat', state.turn.activePlayerId);
      const step = event('step_advanced', { number: state.turn.number, phase: state.turn.phase, step: state.turn.step });
      state.events.push(step);
      e.push(step);
      return accepted(state, cmd, { ok: true, events: e });
    } catch (error) {
      return reject(`illegal_damage_assignment:${error.message}`);
    }
  }

  if (cmd.type === 'draw_card') {
    if (state.turn.step !== 'draw' || state.turn.activePlayerId !== cmd.playerId) return reject('wrong_timing');
    // CR 103.7a: pierwsza tura gry — aktywny gracz (startujący) nie dobiera.
    if (state.turn.number === 1 && state.turn.activePlayerId === state.players[0].id) {
      return reject('first_turn_no_draw');
    }
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
          id: object.id,
          // Face-down czar na stosie jest bezimiennym 2/2 (CR 708.2) —
          // przeciwnik nie widzi tożsamości karty (jak na bitwisku).
          cardId: object.faceDown && object.controllerId !== playerId ? null : object.cardId,
          controllerId: object.controllerId, zone: object.zone,
          kind: object.kind, manaCost: object.manaCost, spell: object.spell, targets: object.chosenTargets,
          // Znacznik bestow odróżnia czar aury za koszt bestow od czystej
          // aury (inny flavor w UI, inne rozstrzygnięcie przy fizzle).
          bestow: object.bestow ?? null, attachedTo: object.attachedTo ?? null,
          faceDown: Boolean(object.faceDown),
          // T6: zdolność triggerowana na stosie (pseudo-obiekt kind 'trigger').
          trigger: Boolean(object.triggerEntry),
          triggerEvent: object.triggerEntry?.ability?.trigger?.event ?? null,
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
  // Decyzje CELU triggera (Temat 2) — blokują tylko, gdy są ŻYWE (źródło na
  // bitwisku/LKI + intervening-if + kandydaci); ślepe wpisy czyści execute.
  const triggerTargetsBlock = state.pendingTriggerTargets.some((p) => triggerTargetDecisionPending(state, p));
  if (state.status === 'active' && state.pendingMulligans.length === 0 && !state.pendingMulliganBottom) {
    // Koncesję może zgłosić każdy gracz niezależnie od priorytetu; pass
    // oferujemy wyłącznie posiadaczowi priorytetu.
    legalCommands.push(command('concede', playerId));
    const hasPriority = state.turn.priorityPlayerId === playerId;
    // Pass jest niedostępny, gdy trwa nierozstrzygnięty krok obrażeń combat —
    // jedyna droga dalej to resolve_combat (albo koncesja). Oczekujący scry
    // albo backup blokuje pass u wszystkich (patrz resolve_* poniżej).
    const blockedByCombat = state.turn.step === 'combat_damage' && state.combat && state.zones.stack.length === 0;
    if (hasPriority && !blockedByCombat && state.pendingMulligans.length === 0 && !state.pendingMulliganBottom && !state.pendingScry && !state.pendingSurveil
      && !state.pendingRevealOrder && !state.pendingProliferate && !state.pendingModalTrigger && !state.pendingDamageTarget && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingIndex && !state.pendingOptionalDraw && !state.pendingDamageAssignment && state.pendingExploits.length === 0 && !state.pendingRevealExile && !state.pendingColorChoice && !state.pendingClash && !state.pendingSacrifice && !state.pendingDiscardChoice && !state.pendingHandTopChoice && !state.pendingLandTypeChoice && !state.pendingSearchChoice && !state.pendingPayOrSacrifice && !state.pendingOptionalPay && !triggerTargetsBlock && !state.pendingOptionalTrigger && !state.pendingMoonlitChoice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !mentorBlocks && !state.pendingLegendChoice) legalCommands.push(command('pass_priority', playerId));
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
  // Batch 22/23: decyzje reveal/proliferate/modal/damage-target (Stomping
  // Slabs, Courage in Crisis, Etherwrought Page, Stomping Slabs dmg) — oferty
  // w kolejności bramek execute (scry → surveil → reveal → proliferate →
  // modal → damage → backup). Bez ofert gra (człowiek i bot) soft-lockowała
  // z „*_unresolved", bo execute miał bramkę, ale widok nie dawał komendy.
  const activeRevealOrder = state.pendingRevealOrder && state.pendingRevealOrder.playerId === playerId;
  const activeProliferate = state.pendingProliferate && state.pendingProliferate.playerId === playerId;
  const activeModalTrigger = state.pendingModalTrigger && state.pendingModalTrigger.playerId === playerId;
  const activeDamageTarget = state.pendingDamageTarget && state.pendingDamageTarget.playerId === playerId;
  const activeRedirectChoice = state.pendingRedirectChoice && state.pendingRedirectChoice.playerId === playerId;
  const activeClash = state.pendingClash && state.pendingClash.choices[0] === playerId;
  const headRoomCandidates = state.pendingRoomTargets.length > 0
    ? legalRoomTargetCandidates(state, state.pendingRoomTargets[0])
    : [];
  const activeRoomTarget = state.pendingRoomTargets.length > 0
    && state.pendingRoomTargets[0].playerId === playerId && headRoomCandidates.length > 0;
  const activeSearchChoice = state.pendingSearchChoice && state.pendingSearchChoice.playerId === playerId;
  const activePayOrSacrifice = state.pendingPayOrSacrifice && state.pendingPayOrSacrifice.playerId === playerId;
  const activeOptionalPay = state.pendingOptionalPay && state.pendingOptionalPay.playerId === playerId;
  const activeOptionalTrigger = state.pendingOptionalTrigger && state.pendingOptionalTrigger.playerId === playerId;
  const triggerTargetHead = state.pendingTriggerTargets[0] ?? null;
  const activeTriggerTarget = triggerTargetHead && triggerTargetHead.playerId === playerId
    && triggerTargetDecisionPending(state, triggerTargetHead);
  const activeMoonlitChoice = state.pendingMoonlitChoice && state.pendingMoonlitChoice.playerId === playerId;
  const activeLandTypeChoice = state.pendingLandTypeChoice && state.pendingLandTypeChoice.playerId === playerId;
  const activeDiscardChoice = state.pendingDiscardChoice && state.pendingDiscardChoice.playerId === playerId;
  const activeHandTopChoice = state.pendingHandTopChoice && state.pendingHandTopChoice.playerId === playerId;
  const activeSacrifice = state.pendingSacrifice && state.pendingSacrifice.playerId === playerId;
  const activeFoodChoice = state.pendingFoodChoice && state.pendingFoodChoice.playerId === playerId;

  const activeDiscover = state.pendingDiscover && state.pendingDiscover.playerId === playerId;
  const activeExplore = state.pendingExplore && state.pendingExplore.playerId === playerId;

  const activeCraftExile = state.pendingCraftExile && state.pendingCraftExile.playerId === playerId;

  const activeHandCreature = state.pendingHandCreature && state.pendingHandCreature.playerId === playerId;

  const activeDevour = state.pendingDevours.length > 0 && state.pendingDevours[0].playerId === playerId;
  const activeExploit = state.pendingExploits.length > 0 && state.pendingExploits[0].playerId === playerId;
  const activeRevealExile = state.pendingRevealExile && state.pendingRevealExile.playerId === playerId;

  const activeEndure = state.pendingEndures.length > 0 && state.pendingEndures[0].playerId === playerId;

  const pendingDeliriumHead = state.pendingDeliriumTargets[0] ?? null;
  const pendingMentorHead = state.pendingMentorTargets[0] ?? null;

  const activeGraveyardToTop = state.pendingGraveyardToTop && state.pendingGraveyardToTop.playerId === playerId;
  const activeLegendChoice = state.pendingLegendChoice && state.pendingLegendChoice.playerId === playerId;
  const activeFertileThicket = state.pendingFertileThicket && state.pendingFertileThicket.controllerId === playerId;
  const activeSpringbloom = state.pendingSpringbloom && state.pendingSpringbloom.controllerId === playerId;
  const activeIndex = state.pendingIndex && state.pendingIndex.playerId === playerId;
  const activeDamageAssignment = state.pendingDamageAssignment && state.pendingDamageAssignment.playerId === playerId;
  const activeOptionalDraw = state.pendingOptionalDraw && state.pendingOptionalDraw.playerId === playerId;
  const activeColorChoice = state.pendingColorChoice && state.pendingColorChoice.playerId === playerId;

  // Sekwencyjność ofert także MIĘDZY graczami: execute() odblokowuje decyzje
  // w ustalonym porządku bramek, więc gdy decyzja innego gracza jest
  // wcześniejsza (np. cudze scry przed naszym delirium — skan
  // wieloprzebiegowy może kolejkować kilka typów decyzji w jednej komendzie),
  // ten gracz nie dostaje jeszcze swojej oferty — execute odrzuciłby ją
  // bramką wcześniejszej decyzji (regresja scry_unresolved, benchmark B0).
  const firstDecisionOwner = state.status === 'active' ? firstPendingDecisionPlayerId(state) : null;
  const blockedByOthersDecision = firstDecisionOwner != null && firstDecisionOwner !== playerId;

  // Mulligan londyński (CR 103.4): decydujący gracz wybiera keep (pierwsza
  // oferta — boty zatrzymują rękę) albo mulligan. Po mulliganie — wybór N
  // kart do odłożenia na spód (podzbiory ręki; limit enumeracji 4 kart na
  // decyzję — większe N i tak jest rzadkie).
  if (state.status === 'active' && !blockedByOthersDecision && state.pendingMulligans.length > 0
    && !state.pendingMulliganBottom && state.pendingMulligans[0] === playerId) {
    legalCommands.unshift(command('resolve_mulligan_choice', playerId, { keep: false }));
    legalCommands.unshift(command('resolve_mulligan_choice', playerId, { keep: true }));
  } else if (state.status === 'active' && !blockedByOthersDecision && state.pendingMulliganBottom
    && state.pendingMulliganBottom.playerId === playerId) {
    const pending = state.pendingMulliganBottom;
    // Wszystkie podzbiory ręki o rozmiarze count (max 35 ofert dla 7 kart) —
    // mulligan londyński pozwala zejść do 0, więc count może być dowolny.
    const subsets = (arr, k) => {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [head, ...rest] = arr;
      const withHead = subsets(rest, k - 1).map((s) => [head, ...s]);
      return [...withHead, ...subsets(rest, k)];
    };
    const expected = Math.min(pending.count, pending.handIds.length);
    for (const combo of subsets(pending.handIds, expected)) {
      legalCommands.unshift(command('resolve_mulligan_bottom_choice', playerId, { cardIds: combo }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeScry) {
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
  } else if (state.status === 'active' && !blockedByOthersDecision && activeRevealOrder) {
    // Stomping Slabs — reveal top N + ułóż na spodzie w dowolnej kolejności.
    // Oferujemy kolejność „jak w reveal" (top→bottom) — deterministyczna
    // pierwsza oferta dla botów; gracz widzi jedną komendę reorderu (ograniczenie
    // enumeracji: N! permutacji nie jest oferowanych, walidacja execute
    // przyjmuje każdą permutację cardIds).
    legalCommands.unshift(command('resolve_reveal_order', playerId, { order: [...state.pendingRevealOrder.cardIds] }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeProliferate) {
    // Proliferate (CR 701.27, Courage in Crisis): „choose any number of
    // permanents and/or players" — podzbiory kandydatów (permanenty z
    // licznikami + gracze z poison). Przy dużych pulach ograniczamy enumerację
    // (jak combat options): pełne podzbiory do 6 kandydatów, wyżej warianty
    // wszystkie/pojedyncze/puste. Pierwsza oferta = WSZYSTKO (deterministyczny
    // wybór botów — proliferacja wszystkiego).
    const cands = state.pendingProliferate.candidateIds ?? [];
    const subsets = (arr) => {
      if (arr.length === 0) return [[]];
      const [head, ...rest] = arr;
      const without = subsets(rest);
      return [...without, ...without.map((s) => [head, ...s])];
    };
    const variants = cands.length <= 6 ? subsets(cands) : [[...cands], ...cands.map((id) => [id]), []];
    // „Pierwsza oferta" = ostatni unshift; chcemy, by pierwszą ofertą był
    // pełny wybór (wszystkie kandydaty — deterministyczna polityka botów).
    // subsets() generuje od najuboższych do najbogatszych (pełny ostatni) —
    // wtedy unshiftujemy w tej kolejności. Dla okrojonej wersji (duże pule)
    // pełny jest PIERWSZY, więc odwracamy, żeby znów lądował ostatni.
    const ordered = cands.length <= 6 ? variants : [...variants].reverse();
    for (const chosen of ordered) {
      legalCommands.unshift(command('resolve_proliferate', playerId, chosen.length > 0 ? { targetIds: chosen } : {}));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeModalTrigger) {
    // Modalny trigger upkeep (Etherwrought Page): gracz wybiera tryb.
    // Boty biorą pierwszą ofertę = tryb 0 (jak deklaracja karty).
    const pending = state.pendingModalTrigger;
    for (let modeIndex = pending.modes.length - 1; modeIndex >= 0; modeIndex -= 1) {
      legalCommands.unshift(command('resolve_modal_choice', playerId, { modeIndex }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeDamageTarget) {
    // Stomping Slabs — obrażenia 7 do „any target" (gracz albo stwór).
    // Kandydaci dynamicznie (cel mógł zniknąć); pierwsza oferta = przeciwnik
    // (boty biorą pierwszą ofertę — prefer: opponent).
    const pending = state.pendingDamageTarget;
    const live = (pending.candidateIds ?? []).filter((id) => {
      if (state.players.some((pl) => pl.id === id)) return true;
      const o = state.objects.get(id);
      return o && o.zone === 'battlefield';
    });
    for (const targetId of [...live].reverse()) {
      legalCommands.unshift(command('resolve_damage_target', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeRedirectChoice) {
    // Willbender — nowy cel czaru na stosie (kandydaci dynamicznie;
    // pierwsza oferta = pierwszy kandydat — deterministyczna polityka botów).
    const pending = state.pendingRedirectChoice;
    const spell = state.objects.get(pending.stackId);
    if (spell && spell.zone === 'stack') {
      const legal = legalTargetCandidates(state, pending.spellControllerId, pending.spec)
        .filter((id) => id !== pending.currentTargetId);
      for (const targetId of [...legal].reverse()) {
        legalCommands.unshift(command('resolve_redirect_choice', playerId, { targetId }));
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
  } else if (state.status === 'active' && !blockedByOthersDecision && activeSearchChoice) {
    // Szukanie w bibliotece (Temat 6): kandydaci w kolejności biblioteki +
    // opcja rezygnacji (fail to find — „you may search").
    const pending = state.pendingSearchChoice;
    const candidateIds = state.zones.library.filter((id) => {
      const o = state.objects.get(id);
      if (!o || o.controllerId !== pending.playerId || o.zone !== 'library') return false;
      const q = pending.qualifier ?? {};
      const typeOk = (q.types ?? []).length === 0 || (q.types ?? []).every((t) => (o.types ?? []).includes(t));
      const subtypeOk = (q.subtypes ?? []).length === 0 || (q.subtypes ?? []).some((s) => (o.subtypes ?? []).includes(s));
      return typeOk && subtypeOk;
    });
    for (const targetId of candidateIds) {
      legalCommands.unshift(command('resolve_search_choice', playerId, { found: targetId }));
    }
    legalCommands.unshift(command('resolve_search_choice', playerId, { found: null }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activePayOrSacrifice) {
    // „Sacrifice it unless you pay {N}" (Rupture Spire, Temat 7): wybór
    // kontrolera — zapłać albo poświęć. Boty płacą (pierwsza oferta).
    legalCommands.unshift(command('resolve_pay_or_sacrifice', playerId, { pay: true }));
    legalCommands.unshift(command('resolve_pay_or_sacrifice', playerId, { pay: false }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeOptionalPay) {
    // „You may pay ... When you do, ..." (Panic Spellbomb, Zoraline —
    // Temat 8): tak/nie. Boty płacą (pierwsza oferta).
    legalCommands.unshift(command('resolve_optional_pay_choice', playerId, { pay: true }));
    legalCommands.unshift(command('resolve_optional_pay_choice', playerId, { pay: false }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeTriggerTarget) {
    // Temat 2 — cel triggera wybiera kontroler: kandydaci w kolejności dawnej
    // polityki (pierwszy = dawny wybór deterministyczny — boty biorą pierwszą
    // ofertę); „up to one"/„you may" (allowNone) dostaje opcję „brak celu"
    // NA KOŃCU listy (unshift przed kandydatami).
    const legal = legalTriggerTargetCandidates(state, triggerTargetHead);
    if (triggerTargetHead.allowNone) {
      legalCommands.unshift(command('resolve_trigger_target', playerId, { targetId: null }));
    }
    // unshift wkłada na początek — iterujemy ODWROTNIE, żeby PIERWSZA oferta
    // była pierwszym kandydatem (dawny wybór deterministyczny — boty biorą
    // pierwszą ofertę).
    for (const targetId of [...legal].reverse()) {
      legalCommands.unshift(command('resolve_trigger_target', playerId, { targetId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeOptionalTrigger) {
    // „You may" bez celu (Angel's Feather): tak/nie — boty „tak" (pierwsza
    // oferta = dotychczasowe zachowanie).
    legalCommands.unshift(command('resolve_optional_trigger_choice', playerId, { fire: true }));
    legalCommands.unshift(command('resolve_optional_trigger_choice', playerId, { fire: false }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeMoonlitChoice) {
    // Moonlit Meditation (Temat 9): „you may instead create copies" — tak/nie.
    legalCommands.unshift(command('resolve_moonlit_choice', playerId, { replace: true }));
    legalCommands.unshift(command('resolve_moonlit_choice', playerId, { replace: false }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeLandTypeChoice) {
    // Wybór podstawowego typu landa (Unstable Frontier): 5 opcji.
    for (const landType of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) {
      legalCommands.unshift(command('resolve_land_type_choice', playerId, { landType }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeDiscardChoice) {
    // Oczekująca decyzja odrzucenia (Temat 4): decydent wybiera KARTĘ z ręki.
    // Kolejność ofert wg polityki (deterministycznej — ADR 0005): koszt →
    // najtańsza pierwsza (kontroler zostawia droższe), efekt → najdroższa
    // pierwsza (wymuszone odrzucenie zabiera najlepsze). Proste boty biorą
    // pierwszą ofertę, więc zachowują dotychczasową politykę.
    const pending = state.pendingDiscardChoice;
    const valueOf = (id) => state.objects.get(id)?.manaCost ?? 0;
    const ordered = [...pending.handIds].sort((a, b) => (pending.purpose === 'cost' ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a)));
    for (const cardId of ordered) {
      legalCommands.unshift(command('resolve_discard_choice', playerId, { cardId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeHandTopChoice) {
    // Oczekująca decyzja „karta z ręki na wierzch" (Chittering Rats): cel
    // wybiera kartę z własnej ręki. Polityka: najtańsza pierwsza (jak
    // dotychczasowy deterministyczny „najgorsza karta").
    const pending = state.pendingHandTopChoice;
    const valueOf = (id) => state.objects.get(id)?.manaCost ?? 0;
    const ordered = [...pending.handIds].sort((a, b) => valueOf(a) - valueOf(b));
    for (const cardId of ordered) {
      legalCommands.unshift(command('resolve_hand_top_choice', playerId, { cardId }));
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
  } else if (state.status === 'active' && !blockedByOthersDecision && activeExploit) {
    // M69 (Exploit): poświęć INNEGO stwora kontrolera (kandydaci żywi) albo skip.
    const pending = state.pendingExploits[0];
    for (const targetId of pending.candidateIds) {
      const candidate = state.objects.get(targetId);
      if (!candidate || candidate.zone !== 'battlefield' || candidate.kind !== 'creature') continue;
      legalCommands.unshift(command('resolve_exploit_choice', playerId, { targetId }));
    }
    legalCommands.unshift(command('resolve_exploit_choice', playerId, { skip: true }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeRevealExile) {
    // M69 (Dreams of Steel and Oil): najpierw wybór z ręki, potem z grobu.
    // Wybór jest OBOWIĄZKOWY („You choose an artifact or creature card from
    // it" — bez „up to one"): odmowa tylko, gdy brak kandydatów w danej strefie
    // (wtedy etap jest pomijany automatycznie przez handler).
    const pending = state.pendingRevealExile;
    if (pending.stage === 'hand') {
      if (pending.handIds.length === 0) {
        // brak kart w ręce — etap pomijany (handler z null przechodzi do grobu)
        legalCommands.unshift(command('resolve_reveal_exile_hand', playerId, { cardId: null }));
      } else {
        for (const handId of pending.handIds) legalCommands.unshift(command('resolve_reveal_exile_hand', playerId, { cardId: handId }));
      }
    } else if (pending.stage === 'grave') {
      if (pending.graveIds.length === 0) {
        legalCommands.unshift(command('resolve_reveal_exile_grave', playerId, { cardId: null }));
      } else {
        for (const graveId of pending.graveIds) legalCommands.unshift(command('resolve_reveal_exile_grave', playerId, { cardId: graveId }));
      }
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
  } else if (state.status === 'active' && !blockedByOthersDecision && activeIndex) {
    // Index (APC): reorder top 5 — warianty permutacji, pierwsza oferta = oryginalna kolejność
    const pending = state.pendingIndex;
    // Dla testów: oferujemy jedną komendę z oryginalną kolejnością; execute przyjmuje dowolną permutację
    legalCommands.unshift(command('resolve_index_choice', playerId, { order: [...pending.objectIds] }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeOptionalDraw) {
    // M67 (Force Away): ferocious „you may draw a card. If you do, discard a
    // card." — dokładnie dwa warianty (tak/nie), bez kombinacji.
    legalCommands.unshift(command('resolve_optional_draw', playerId, { draw: false }));
    legalCommands.unshift(command('resolve_optional_draw', playerId, { draw: true }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeDamageAssignment) {
    // M66 (R): rozdzielanie obrażeń — DOKŁADNIE JEDEN wariant (deterministyczny
    // default = lethal-first w kolejności deklaracji, obecne zachowanie botów).
    // Kombinacji nie enumerujemy; gracz-człowiek dostaje wizard w UI, który
    // buduje własną, walidowaną przez execute komendę (CR 510.1c/d).
    legalCommands.unshift(command('resolve_damage_assignment', playerId, {
      assignments: buildDefaultDamageAssignments(state),
    }));
  } else if (state.status === 'active' && !blockedByOthersDecision && activeFertileThicket) {
    // Fertile Thicket (BFZ): ETB reveal — gracz wybiera 0 lub 1 basic land z top 5.
    // "You may" = can decline entirely.
    const pending = state.pendingFertileThicket;
    legalCommands.unshift(command('resolve_fertile_thicket', playerId, { skip: true })); // decline
    legalCommands.unshift(command('resolve_fertile_thicket', playerId, { chosenCardId: null })); // keep all on top
    for (const landId of pending.basicLandIds) {
      legalCommands.unshift(command('resolve_fertile_thicket', playerId, { chosenCardId: landId }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeColorChoice) {
    // Benevolent Blessing: choose a color for protection
    const COLORS = ['W', 'U', 'B', 'R', 'G'];
    for (const color of COLORS) {
      legalCommands.unshift(command('resolve_color_choice', playerId, { color }));
    }
  } else if (state.status === 'active' && !blockedByOthersDecision && activeSpringbloom) {
    // Springbloom Druid (MH1): ETB sacrifice land → search 2 basic lands tapped.
    const pending = state.pendingSpringbloom;
    legalCommands.unshift(command('resolve_springbloom', playerId, { skip: true })); // decline
    for (const landId of pending.landIds) {
      legalCommands.unshift(command('resolve_springbloom', playerId, { sacrificeLandId: landId }));
    }
  }
  // CR 103.7a: gracz, który wykonuje PIERWSZĄ turę gry, pomija swój draw step
  // (nie dobiera w 1. turze). Oferta i walidacja spójne — boty nie zobaczą
  // draw_card, a ręczna komenda zostanie odrzucona.
  const firstTurnSkipDraw = state.turn.number === 1 && state.turn.activePlayerId === state.players[0].id;
  if (state.status === 'active' && state.pendingMulligans.length === 0 && !state.pendingMulliganBottom && !state.pendingScry && !state.pendingSurveil
      && !state.pendingRevealOrder && !state.pendingProliferate && !state.pendingModalTrigger && !state.pendingDamageTarget && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingIndex && !state.pendingOptionalDraw && !state.pendingDamageAssignment && state.pendingExploits.length === 0 && !state.pendingRevealExile && !state.pendingColorChoice && !state.pendingClash && !state.pendingSacrifice && !state.pendingDiscardChoice && !state.pendingHandTopChoice && !state.pendingLandTypeChoice && !state.pendingSearchChoice && !state.pendingPayOrSacrifice && !state.pendingOptionalPay && !triggerTargetsBlock && !state.pendingOptionalTrigger && !state.pendingMoonlitChoice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !mentorBlocks && !state.pendingLegendChoice && state.turn.step === 'draw' && state.turn.activePlayerId === playerId
    && !state.turn.drawnInStep && !firstTurnSkipDraw) {
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
  if (state.status === 'active' && state.pendingMulligans.length === 0 && !state.pendingMulliganBottom && !state.pendingScry && !state.pendingSurveil
      && !state.pendingRevealOrder && !state.pendingProliferate && !state.pendingModalTrigger && !state.pendingDamageTarget && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingIndex && !state.pendingOptionalDraw && !state.pendingDamageAssignment && state.pendingExploits.length === 0 && !state.pendingRevealExile && !state.pendingColorChoice && !state.pendingClash && !state.pendingSacrifice && !state.pendingDiscardChoice && !state.pendingHandTopChoice && !state.pendingLandTypeChoice && !state.pendingSearchChoice && !state.pendingPayOrSacrifice && !state.pendingOptionalPay && !triggerTargetsBlock && !state.pendingOptionalTrigger && !state.pendingMoonlitChoice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !mentorBlocks && !state.pendingLegendChoice && state.turn.priorityPlayerId === playerId) {
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
    // przenosi kartę do exile, gdzie później cast_permanent/cast_spell oferuje
    // rzut bez many (Batch 24: Spinewoods Paladin — plot dla permanentów).
    if (state.turn.activePlayerId === playerId
      && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
      && state.zones.stack.length === 0) {
      for (const id of state.zones.hand) {
        const object = state.objects.get(id);
        if (object?.controllerId === playerId && object.plot
          && (object.plot.cost ?? 0) <= manaAvailable) {
          // Koszt plot może nieść pipy kolorów (Plot {3}{G}) — oferta spójna
          // z walidacją plotCard.
          const plotColors = (object.plot.colors ?? []).map((c) => [c]);
          if (plotColors.length === 0 || canPayColoredCost(state, playerId, plotColors)) {
            legalCommands.unshift(command('plot_card', playerId, { objectId: id }));
          }
        }
      }
    }
    // Zaplotowane PERMANENTY w exile: rzut bez kosztu many (sorcery-speed).
    if (state.turn.activePlayerId === playerId
      && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
      && state.zones.stack.length === 0) {
      for (const id of state.zones.exile) {
        const object = state.objects.get(id);
        if (object?.controllerId === playerId && object.plotted && !object.aura
          && (object.kind === 'creature' || object.kind === 'artifact' || object.kind === 'enchantment')
          // CR 702.136: "on a later turn" — don't offer cast on the same turn as plot
          && (object.plottedAtTurn == null || state.turn.number > object.plottedAtTurn)) {
          legalCommands.unshift(command('cast_permanent', playerId, { objectId: id }));
        }
      }
    }
    // Zdolności aktywowane są jak instanty: dostępne z priorytetem, niezależnie
    // od fazy. Każda oferowana aktywacja jest akceptowana przez execute.
    // Ninjutsu niesie dodatkowo attackerId (atakujący do zwrotu do ręki);
    // zdolności celowane/{X} niosą targets i xValue.
    for (const { objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId } of legalActivatedAbilities(state, playerId)) {
      const extra = { objectId, abilityIndex };
      if (attackerId !== undefined) extra.attackerId = attackerId;
      if (targets !== undefined) extra.targets = targets;
      if (xValue !== undefined) extra.xValue = xValue;
      // Crew (CR 701.36): wybór stworów do tapnięcia jedzie w komendzie —
      // bez tego oferowana komenda byłaby odrzucana (nielegalny crew).
      if (crewCreatureIds !== undefined) extra.crewCreatureIds = crewCreatureIds;
      if (tapCreatureId !== undefined) extra.tapCreatureId = tapCreatureId;
      if (tapOtherCreatureId !== undefined) extra.tapOtherCreatureId = tapOtherCreatureId;
      legalCommands.unshift(command('activate_ability', playerId, extra));
    }
  }
  if (state.status === 'active' && state.pendingMulligans.length === 0 && !state.pendingMulliganBottom && !state.pendingScry && !state.pendingSurveil
      && !state.pendingRevealOrder && !state.pendingProliferate && !state.pendingModalTrigger && !state.pendingDamageTarget && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingIndex && !state.pendingOptionalDraw && !state.pendingDamageAssignment && state.pendingExploits.length === 0 && !state.pendingRevealExile && !state.pendingColorChoice && !state.pendingClash && !state.pendingSacrifice && !state.pendingDiscardChoice && !state.pendingHandTopChoice && !state.pendingLandTypeChoice && !state.pendingSearchChoice && !state.pendingPayOrSacrifice && !state.pendingOptionalPay && !triggerTargetsBlock && !state.pendingOptionalTrigger && !state.pendingMoonlitChoice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !state.pendingLegendChoice && state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
    && state.zones.stack.length === 0) {
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
      // M69 (Security Rhox): „You may pay {R}{G} rather than pay this spell's
      // mana cost. Spend only mana produced by Treasures to cast it this way."
      // — wariant kosztu ALTERNATYWNEGO (tylko ze Skarbów), oferowany ZANIM
      // bramka zwykłej many (koszt ze Skarbów nie wymaga many z lądów).
      if (object.treasureAltCost) {
        const alt = object.treasureAltCost;
        const altMana = alt.mana ?? 0;
        const altReqs = (alt.colors ?? []).map((color) => [color]);
        const avail = treasureManaAvailable(state, playerId);
        if (avail >= altMana
          && matchColorRequirements(Array.from({ length: avail }, () => ['W', 'U', 'B', 'R', 'G']), altReqs)) {
          legalCommands.unshift(command('cast_permanent', playerId, { objectId: id, treasureAlt: true }));
        }
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
  if (state.status === 'active' && state.pendingMulligans.length === 0 && !state.pendingMulliganBottom && !state.pendingScry && !state.pendingSurveil
      && !state.pendingRevealOrder && !state.pendingProliferate && !state.pendingModalTrigger && !state.pendingDamageTarget && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingIndex && !state.pendingOptionalDraw && !state.pendingDamageAssignment && state.pendingExploits.length === 0 && !state.pendingRevealExile && !state.pendingColorChoice && !state.pendingClash && !state.pendingSacrifice && !state.pendingDiscardChoice && !state.pendingHandTopChoice && !state.pendingLandTypeChoice && !state.pendingSearchChoice && !state.pendingPayOrSacrifice && !state.pendingOptionalPay && !triggerTargetsBlock && !state.pendingOptionalTrigger && !state.pendingMoonlitChoice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !state.pendingLegendChoice && state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
    && state.zones.stack.length === 0 && (player.landPlays ?? 0) > 0) {
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId === playerId && object.kind === 'land') legalCommands.unshift(command('play_land', playerId, { objectId: id }));
    }
  }
  if (state.status === 'active' && state.pendingMulligans.length === 0 && !state.pendingMulliganBottom && !state.pendingScry && !state.pendingSurveil
      && !state.pendingRevealOrder && !state.pendingProliferate && !state.pendingModalTrigger && !state.pendingDamageTarget && !state.pendingRedirectChoice && !state.pendingFertileThicket && !state.pendingSpringbloom && !state.pendingIndex && !state.pendingOptionalDraw && !state.pendingDamageAssignment && state.pendingExploits.length === 0 && !state.pendingRevealExile && !state.pendingColorChoice && !state.pendingClash && !state.pendingSacrifice && !state.pendingDiscardChoice && !state.pendingHandTopChoice && !state.pendingLandTypeChoice && !state.pendingSearchChoice && !state.pendingPayOrSacrifice && !state.pendingOptionalPay && !triggerTargetsBlock && !state.pendingOptionalTrigger && !state.pendingMoonlitChoice && !state.pendingFoodChoice && !state.pendingDiscover && !state.pendingExplore && !state.pendingCraftExile && !state.pendingHandCreature && !roomTargetBlocks && !pendingBackup && !state.pendingGraveyardToTop && state.pendingDevours.length === 0 && state.pendingEndures.length === 0 && !deliriumBlocks && !state.pendingLegendChoice && state.turn.priorityPlayerId === playerId) {
    if (state.turn.step === 'declare_attackers' && state.turn.activePlayerId === playerId) {
      const seen = new Set();
      for (const attackerIds of legalAttackerOptions(state, playerId, COMBAT_OPTION_CAP)) {
        const key = JSON.stringify(attackerIds);
        if (seen.has(key)) continue;
        seen.add(key);
        legalCommands.unshift(command('declare_attackers', playerId, { attackerIds }));
      }
    }
    if (state.turn.step === 'declare_blockers' && state.combat && state.combat.attackingPlayerId !== playerId
      && state.zones.stack.length === 0) {
      const seen = new Set();
      for (const assignments of legalBlockerOptions(state, playerId, COMBAT_OPTION_CAP)) {
        const key = JSON.stringify(assignments);
        if (seen.has(key)) continue;
        seen.add(key);
        legalCommands.unshift(command('declare_blockers', playerId, { assignments }));
      }
    }
    if (state.turn.step === 'combat_damage' && state.combat && state.turn.activePlayerId === playerId
      && state.zones.stack.length === 0) {
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
  // Batch 22/23 — oczekujące decyzje reveal/proliferate/damage/modal (publiczne
  // dane dla UI: nazwy trybów, kandydaci). Wcześniej widok ich NIE wystawiał
  // i nie oferował resolve_* — gra (człowiek i bot) soft-lockowała.
  const pendingModalTriggerView = state.pendingModalTrigger
    ? {
        playerId: state.pendingModalTrigger.playerId,
        sourceId: state.pendingModalTrigger.sourceId,
        cardId: state.pendingModalTrigger.cardId ?? null,
        modes: state.pendingModalTrigger.modes.map((m) => Object.freeze({ name: m.name ?? null })),
      }
    : null;
  const pendingProliferateView = state.pendingProliferate
    ? {
        playerId: state.pendingProliferate.playerId,
        sourceId: state.pendingProliferate.sourceId,
        candidateIds: [...state.pendingProliferate.candidateIds],
      }
    : null;
  const pendingDamageTargetView = state.pendingDamageTarget
    ? {
        playerId: state.pendingDamageTarget.playerId,
        sourceId: state.pendingDamageTarget.sourceId,
        amount: state.pendingDamageTarget.amount,
        candidateIds: [...state.pendingDamageTarget.candidateIds],
      }
    : null;
  const pendingRevealOrderView = state.pendingRevealOrder
    ? {
        playerId: state.pendingRevealOrder.playerId,
        sourceId: state.pendingRevealOrder.sourceId,
        cardIds: [...state.pendingRevealOrder.cardIds],
        amount: state.pendingRevealOrder.amount,
      }
    : null;
  const pendingRedirectChoiceView = state.pendingRedirectChoice
    ? {
        playerId: state.pendingRedirectChoice.playerId,
        stackId: state.pendingRedirectChoice.stackId,
        spellCardId: state.pendingRedirectChoice.spellCardId,
        currentTargetId: state.pendingRedirectChoice.currentTargetId,
      }
    : null;
  // Index (APC): „Look at the top five cards of your library, then put them
  // back in any order" — jak scry: decydent (właściciel decyzji) widzi treść
  // kart, przeciwnik dowiaduje się wyłącznie, że decyzja trwa i ile kart
  // obejrzano (Fog of War). Audyt Batchu 26 (M65): bez tego gracz-człowiek
  // nie widział top 5 i nie mógł przestawić kart.
  const pendingIndexView = state.pendingIndex ? {
    playerId: state.pendingIndex.playerId,
    count: state.pendingIndex.objectIds.length,
    cards: state.pendingIndex.playerId === playerId
      ? state.pendingIndex.objectIds.map((id) => {
        const object = state.objects.get(id);
        return {
          id: object.id, cardId: object.cardId, controllerId: object.controllerId, zone: object.zone,
          kind: object.kind, power: object.power, toughness: object.toughness, manaCost: object.manaCost, spell: object.spell,
        };
      })
      : null,
  } : null;
  return Object.freeze({
    playerId, status: state.status, winnerId: state.winnerId, players, turn: { ...state.turn },
    zones, legalCommands, pendingScry, pendingSurveil, pendingBackup: pendingBackupView,
    pendingClash, pendingRoomTarget, pendingLegendChoice: pendingLegendChoiceView,
    pendingModalTrigger: pendingModalTriggerView, pendingProliferate: pendingProliferateView,
    pendingDamageTarget: pendingDamageTargetView, pendingRevealOrder: pendingRevealOrderView,
    pendingRedirectChoice: pendingRedirectChoiceView,
    pendingIndex: pendingIndexView,
    pendingOptionalDraw: state.pendingOptionalDraw ? {
      playerId: state.pendingOptionalDraw.playerId,
      sourceCardId: state.pendingOptionalDraw.sourceCardId,
    } : null,
    pendingDamageAssignment: buildDamageAssignmentView(state),
    // M69 (Exploit): czyja decyzja, źródło i żywi kandydaci (publiczne bitwisko).
    pendingExploits: state.pendingExploits.length > 0 ? {
      playerId: state.pendingExploits[0].playerId,
      sourceId: state.pendingExploits[0].sourceId,
      candidateIds: [...state.pendingExploits[0].candidateIds],
    } : null,
    // M69 (Dreams of Steel and Oil): reveal ręki — po odsłonięciu karty są
    // JAWNE dla obu graczy (MtG: „reveals their hand"), więc view niesie
    // cardIds ręki i grobu (kandydaci wyboru) oraz etap (chosenHand != null).
    pendingRevealExile: state.pendingRevealExile ? {
      playerId: state.pendingRevealExile.playerId,
      opponentId: state.pendingRevealExile.opponentId,
      handCardIds: [...state.pendingRevealExile.handIds],
      graveCardIds: [...state.pendingRevealExile.graveIds],
      chosenHand: state.pendingRevealExile.chosenHand,
    } : null,
    initiativePlayerId,
    dayNight: state.dayNight ?? null,
    undercityProgress: { ...state.undercityProgress },
    descendedThisTurn: { ...state.descendedThisTurn },
  });
}
