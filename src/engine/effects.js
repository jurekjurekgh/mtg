import { event } from '../protocol/types.js';
import { animatePermanentUntilEndOfTurn, effectiveKeywords, effectivePower, effectiveToughness, effectiveSubtypes, goadUntilNextTurn, grantAbilitiesUntilEndOfTurn, grantBasicLandTypeUntilEndOfTurn, grantKeywordsUntilEndOfTurn, isDamagePrevented, markDamage, modifyStats, preventDamageTo, replaceObject, turnFaceUp } from './permanents.js';
import { addCounter, removeCounter } from './counters.js';
import { addPoisonCounters, changeLife } from './players.js';
import { spendMana, addMana } from './resources.js';
import { getSourceForObject } from './mana-sources.js';
import { moveObjectDirectly } from './objects.js';
import { tryRegenerate } from './state-based.js';
import { createBattlefieldToken } from './tokens.js';
import { shuffle } from './shuffle.js';
import { createGameObject } from './identity.js';

/**
 * Loch „Undercity" (komponent inicjatywy, CR 725; karta „Undercity //
 * The Initiative" z CLB — w legacy aplikacji karta specjalna 990006).
 *
 * Venture wchodzi do pokoju i WYKONUJE jego efekt (M24 — pełna mechanika,
 * decyzja właściciela 2026-08-03). Pokoje z „target creature"/„target
 * player"/wyborem stwora z odsłoniętych kart kolejkują REALNY wybór celu
 * dla właściciela decyzji (komenda resolve_room_target — jak scry/backup);
 * boty odpowiadają deterministycznie. Lost Well daje scry 2 — blokującą
 * decyzję resolve_scry jak przy Prismari Campus.
 */
export const UNDERCITY_ROOMS = Object.freeze([
  // 1. Secret Entrance — szukaj Basic Land do ręki, tasuj.
  Object.freeze({ name: 'Secret Entrance', effects: Object.freeze([Object.freeze({ type: 'search_library_to_hand', qualifier: { types: ['Basic', 'Land'] } })]) }),
  // 2. Forge — dwa liczniki +1/+1 na docelowym stworze (wybór celu).
  Object.freeze({ name: 'Forge', effects: Object.freeze([Object.freeze({ type: 'add_counter', counter: '+1/+1', amount: 2, target: 'creature' })]) }),
  // 3. Lost Well — scry 2 (blokująca decyzja gracza).
  Object.freeze({ name: 'Lost Well', effects: Object.freeze([Object.freeze({ type: 'scry', amount: 2 })]) }),
  // 4. Trap! — docelowy gracz traci 5 życia (wybór celu).
  Object.freeze({ name: 'Trap!', effects: Object.freeze([Object.freeze({ type: 'lose_life', amount: 5, target: 'player' })]) }),
  // 5. Arena — goad docelowego stwora (musi atakować do końca tury; wybór celu).
  Object.freeze({ name: 'Arena', effects: Object.freeze([Object.freeze({ type: 'goad', target: 'creature' })]) }),
  // 6. Stash — token Treasure (ze zdolnością „{T}, Sacrifice: Add one mana
  //    of any color\", jak każdy Skarb w MtG; mana oznaczona fromTreasure —
  //    Marut, Batch 16. Deskryptor pisany z ręki: effects.js nie importuje
  //    abilities.js, żeby nie tworzyć cyklu modułów).
  Object.freeze({ name: 'Stash', effects: Object.freeze([Object.freeze({
    type: 'create_token', cardId: 'token_treasure', name: 'Treasure', kind: 'artifact',
    colors: [], types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [Object.freeze({
      type: 'activated', timing: 'instant', keyword: null,
      cost: Object.freeze({ tap: true, sacrificeSelf: true }),
      effect: Object.freeze({ type: 'add_mana', amount: 1, fromTreasure: true }),
      trigger: null, targets: null, cycling: null, condition: null, pump: null,
      keywords: null, oncePerTurn: false, mustAttack: false,
    })],
  })]) }),
  // 7. Archives — dobierz kartę.
  Object.freeze({ name: 'Archives', effects: Object.freeze([Object.freeze({ type: 'draw_cards', amount: 1 })]) }),
  // 8. Catacombs — 4/1 czarny Skeleton z menace.
  Object.freeze({ name: 'Catacombs', effects: Object.freeze([Object.freeze({ type: 'create_token', cardId: 'token_skeleton', name: 'Skeleton', kind: 'creature', power: 4, toughness: 1, colors: ['B'], types: ['Creature'], subtypes: ['Skeleton'], keywords: ['menace'] })]) }),
  // 9. Throne of the Dead Three — odsłoń 10 kart, połóż STWORA SPOŚRÓD NICH
  //    (wybór celu) z 3× +1/+1 i hexproof do twojej następnej tury, tasuj.
  Object.freeze({ name: 'Throne of the Dead Three', effects: Object.freeze([Object.freeze({ type: 'reveal_top_put_creature', amount: 10, counters: '+1/+1', countersAmount: 3, hexproofUntilNextTurn: true })]) }),
]);

/** Wirtualne źródło efektów lochu (nie jest obiektem w strefie — jak emblem). */
function dungeonSource(playerId) {
  return { id: `dungeon-${playerId}`, controllerId: playerId, cardId: 'undercity', kind: 'card' };
}

/**
 * Kolejkuje realny wybór celu pokoju (M24, decyzja właściciela 2026-08-03):
 * właściciel decyzji (gracz venture) wybiera z legalnych celów komendą
 * resolve_room_target; boty odpowiadają deterministycznie. Kolejka działa
 * jak pendingBackups — po jednej decyzji naraz, z priorytetem u wybierającego.
 */
function queueRoomTarget(state, playerId, entry) {
  state.pendingRoomTargets.push({
    playerId,
    room: entry.room,
    roomName: entry.roomName,
    kind: entry.kind,        // 'creature' | 'player' | 'revealed_creature'
    effectType: entry.effectType,
    params: entry.params ?? {},
    candidateIds: entry.candidateIds,
    // Dla revealed_creature (Throne): odsłonięte karty są jawne właścicielowi
    // decyzji — niesiemy ich mini-dane (id, cardId, P/T) do PlayerView.
    cards: entry.cards ?? null,
    restorePriorityTo: state.turn.priorityPlayerId,
  });
  state.events.push(event('room_target_required', {
    playerId, room: entry.room, roomName: entry.roomName,
    kind: entry.kind, effectType: entry.effectType,
    count: entry.candidateIds.length,
  }));
  // Jak scry/surveil: priorytet przechodzi na wybierającego, żeby pętla
  // symulacji/sesji zapytała właściwego gracza.
  state.turn.priorityPlayerId = playerId;
}

/** Tasowanie własnej biblioteki seedem (wspólne dla efektów lochu). */
function shuffleOwnLibrary(state, ownerId) {
  const own = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId);
  const shuffled = shuffle(own, state.seed + state.objectSequence);
  let cursor = 0;
  state.zones.library = state.zones.library.map((id) => {
    if (state.objects.get(id)?.controllerId !== ownerId) return id;
    const replacement = shuffled[cursor];
    cursor += 1;
    return replacement;
  });
}

/** Położenie wybranego stwora Throne: bitwisko + liczniki + hexproof + tasowanie. */
function thronePutChosenCreature(state, pending, targetId) {
  const ownerId = pending.playerId;
  const object = state.objects.get(targetId);
  if (!object || object.zone !== 'library' || object.controllerId !== ownerId) {
    throw new Error('Wybrany stwór nie jest już w bibliotece');
  }
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
  const permanent = Object.freeze({
    ...moved,
    summoningSickness: true,
    // „It gains hexproof until your next turn" — trwa do początku NASTĘPNEJ
    // tury kontrolera (turę przeciwnika + swoją do początku).
    hexproofUntilTurn: state.turn.number + 2,
  });
  state.objects.set(newId, permanent);
  state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'library', toZone: 'battlefield' }));
  state.events.push(event('permanent_entered_battlefield', {
    fromId: targetId, objectId: newId, object: permanent, cardId: permanent.cardId,
    controllerId: ownerId, revealedTop: true,
  }));
  addCounter(state, newId, pending.params.counters ?? '+1/+1', pending.params.countersAmount ?? 3);
  state.events.push(event('hexproof_granted', {
    objectId: newId, cardId: permanent.cardId, untilTurn: state.turn.number + 2,
  }));
  shuffleOwnLibrary(state, ownerId);
  state.events.push(event('library_searched', {
    playerId: ownerId, foundCardId: permanent.cardId, destination: 'battlefield',
    shuffled: true, revealTop: pending.params.amount ?? 10,
  }));
}

/**
 * Wykonuje WYBRANY cel pokoju (komenda resolve_room_target, game-state.js).
 * Zwraca zdarzenia zakończonego wyboru (dopisane do state.events).
 */
export function applyRoomTargetChoice(state, pending, targetId) {
  if (pending.kind === 'player') {
    changeLife(state, targetId, -(pending.params.amount ?? 5));
  } else if (pending.kind === 'creature') {
    const source = dungeonSource(pending.playerId);
    if (pending.effectType === 'goad') {
      goadUntilNextTurn(state, targetId, pending.playerId);
    } else {
      applyEffect(state, { type: 'add_counter', counter: '+1/+1', amount: pending.params.amount ?? 2 }, source, [targetId]);
    }
  } else if (pending.kind === 'revealed_creature') {
    thronePutChosenCreature(state, pending, targetId);
  } else {
    throw new Error(`Nieznany rodzaj celu pokoju: ${pending.kind}`);
  }
  const resolved = event('room_target_resolved', {
    playerId: pending.playerId, room: pending.room, roomName: pending.roomName,
    targetId, kind: pending.kind,
    // Dla odsłoniętych kart lochu (Throne) niesiemy cardId — log/UI pokaże nazwę.
    cardId: pending.kind === 'revealed_creature' ? state.objects.get(targetId)?.cardId ?? null : null,
  });
  state.events.push(resolved);
  return resolved;
}

/**
 * Wykonuje efekt pokoju. Pokoje bez celu wykonują się od razu; pokoje
 * z celem kolejkują WYBÓR dla właściciela decyzji (resolve_room_target).
 */
function executeRoomEffect(state, roomIndex, playerId) {
  const room = UNDERCITY_ROOMS[roomIndex - 1];
  const source = dungeonSource(playerId);
  for (const effect of room.effects) {
    if (effect.target === 'creature') {
      const candidates = state.zones.battlefield
        .map((id) => state.objects.get(id))
        .filter((object) => object && object.zone === 'battlefield' && object.kind === 'creature')
        .map((object) => object.id);
      if (candidates.length === 0) continue; // brak legalnego celu — efekt nie działa
      queueRoomTarget(state, playerId, {
        room: roomIndex, roomName: room.name, kind: 'creature',
        effectType: effect.type === 'goad' ? 'goad' : 'add_counter',
        params: { amount: effect.amount ?? 2 },
        candidateIds: candidates,
      });
      continue;
    }
    if (effect.target === 'player') {
      // Trap!: „target player" — legalni są obaj gracze (także siebie).
      queueRoomTarget(state, playerId, {
        room: roomIndex, roomName: room.name, kind: 'player',
        effectType: 'lose_life', params: { amount: effect.amount ?? 5 },
        candidateIds: state.players.map((player) => player.id),
      });
      continue;
    }
    if (effect.type === 'reveal_top_put_creature') {
      // Throne: najpierw odsłonięcie N kart, potem WYBÓR stwora spośród nich
      // (resolve_room_target), a tasowanie dopiero po położeniu („Then shuffle").
      const amount = effect.amount ?? 10;
      const seen = state.zones.library
        .filter((id) => state.objects.get(id)?.controllerId === playerId)
        .slice(0, amount);
      for (const id of seen) {
        state.events.push(event('card_revealed', {
          playerId, objectId: id, cardId: state.objects.get(id).cardId, revealTop: true,
        }));
      }
      const creatures = seen.filter((id) => state.objects.get(id)?.kind === 'creature');
      if (creatures.length === 0) {
        // Brak stwora wśród odsłoniętych — tylko tasowanie.
        shuffleOwnLibrary(state, playerId);
        state.events.push(event('library_searched', {
          playerId, foundCardId: null, destination: 'battlefield', shuffled: true, revealTop: amount,
        }));
        continue;
      }
      queueRoomTarget(state, playerId, {
        room: roomIndex, roomName: room.name, kind: 'revealed_creature',
        effectType: 'throne',
        params: { amount, counters: effect.counters ?? '+1/+1', countersAmount: effect.countersAmount ?? 3 },
        candidateIds: creatures,
        cards: creatures.map((id) => {
          const object = state.objects.get(id);
          return {
            id, cardId: object.cardId, kind: object.kind,
            power: object.power, toughness: object.toughness, controllerId: object.controllerId,
          };
        }),
      });
      continue;
    }
    applyEffect(state, effect, source, []);
  }
}

/**
 * Wspólny przebieg „venture into the Undercity": gracz wchodzi do pierwszego
 * pokoju albo przechodzi do następnego; każdy pokój WYKONUJE swój efekt.
 * Po Throne of the Dead Three loch się kończy i dalsze venture nic nie robi.
 * Postęp jest jawny (event + stan w PlayerView) — kartę lochu renderuje stół.
 */
function ventureIntoUndercity(state, playerId) {
  const current = state.undercityProgress[playerId] ?? 0;
  if (current >= UNDERCITY_ROOMS.length) return;
  const room = current + 1;
  state.undercityProgress = { ...state.undercityProgress, [playerId]: room };
  state.events.push(event('ventured_into_undercity', {
    playerId, room, roomName: UNDERCITY_ROOMS[room - 1].name, total: UNDERCITY_ROOMS.length,
    last: room === UNDERCITY_ROOMS.length,
  }));
  executeRoomEffect(state, room, playerId);
}

/** Tasuje listę obiektów w exile i przenosi je na spód biblioteki właściciela. */
function shuffleAndPlaceOnBottom(state, ownerId, exileIds) {
  const shuffled = shuffle(exileIds, state.seed + state.objectSequence);
  for (const exileId of shuffled) {
    const libId = `library-${state.objectSequence++}`;
    moveObjectDirectly(state, exileId, 'library', libId);
  }
}

/**
 * Liczba landów o zadanym podtypie podstawowym (np. „Forest") kontrolowanych
 * przez gracza (Howl of the Night Pack: „for each Forest you control").
 * Uwzględnia tymczasową zmianę typu podstawowego landa (effectiveSubtypes —
 * Unstable Frontier) oraz land creatures (token Forest Dryad z typem Land).
 */
function countLandsWithSubtype(state, controllerId, subtype) {
  if (!subtype) return 0;
  let count = 0;
  for (const candidate of state.objects.values()) {
    if (candidate.zone !== 'battlefield' || candidate.controllerId !== controllerId) continue;
    const isLand = candidate.kind === 'land' || (candidate.types ?? []).includes('Land');
    if (!isLand) continue;
    if (effectiveSubtypes(candidate).includes(subtype)) count += 1;
  }
  return count;
}

function countArtifactsControlled(state, controllerId) {
  return [...state.objects.values()].filter((o) => o.zone === 'battlefield'
    && o.controllerId === controllerId
    && (o.kind === 'artifact' || (o.types ?? []).includes('Artifact'))).length;
}

function drawPlayerCards(state, playerId, amount) {
  // Ochrona kart wstrzymanych przez pending scry/surveil/explore/clash (jak
  // mill_cards): dobrać można dopiero kartę POZA przeglądanymi, inaczej karta
  // opuszcza bibliotekę i invariant pendingScry (karty muszą być w bibliotece)
  // się łamie. Pre-istniejący utajony błąd odsłonięty przez inne trajektorie.
  const protectedIds = new Set();
  if (state.pendingScry?.playerId === playerId) for (const id of state.pendingScry.objectIds) protectedIds.add(id);
  if (state.pendingSurveil?.playerId === playerId) for (const id of state.pendingSurveil.objectIds) protectedIds.add(id);
  if (state.pendingExplore?.playerId === playerId && state.pendingExplore.objectId) protectedIds.add(state.pendingExplore.objectId);
  if (state.pendingClash?.cards?.[playerId]) protectedIds.add(state.pendingClash.cards[playerId]);
  let drawn = 0;
  for (let i = 0; i < amount; i += 1) {
    const topId = state.zones.library.find((id) => {
      const object = state.objects.get(id);
      return object?.controllerId === playerId && !protectedIds.has(id);
    });
    if (!topId) break;
    const object = state.objects.get(topId);
    const newId = `drawn-${state.objectSequence++}`;
    state.zones.library = state.zones.library.filter((id) => id !== topId);
    state.zones.hand.push(newId);
    const drawnObj = Object.freeze({ ...object, id: newId, zone: 'hand' });
    state.objects.delete(topId);
    state.objects.set(newId, drawnObj);
    state.cardsDrawnThisTurn[playerId] = (state.cardsDrawnThisTurn[playerId] ?? 0) + 1;
    drawn += 1;
    state.events.push(event('card_drawn', { playerId, fromId: topId, object: drawnObj }));
  }
  // CR 104.3c: gracz, który MUSI dobrać więcej kart, niż ma w bibliotece,
  // dobiera pozostałe, a następnie PRZEGRYWA. Poprzednio efekt draw_cards
  // cicho pomijał brak kart (przegrana tylko z próby dobrania w kroku draw) —
  // Phyrexian Rager / Evangel / Glitch Ghost Surveyor nie kończyły gry przy
  // deck-out (bug złotej odznaki; spójnie z komendą draw_card).
  if (drawn < amount && state.status === 'active') {
    const winner = state.players.find((pl) => pl.id !== playerId);
    state.status = 'finished';
    state.winnerId = winner?.id ?? null;
    state.events.push(event('player_lost', {
      playerId, reason: 'empty_library', winnerId: winner?.id ?? null,
    }));
  }
}

/**
 * Wspólny interpreter efektów dla czarów i zdolności aktywowanych.
 * Deskryptor efektu (typ + parametry) buduje warstwa kart; core zna wyłącznie
 * ogólne typy: damage, pump, create_token. Efekty zapisują swoje zdarzenia
 * wprost do `state.events` (jak dotąd robiły to w spells.js), więc są widoczne
 * w logu i strumieniu rozstrzygania.
 *
 * @param {object} state
 * @param {{type: string, [k: string]: unknown}} effect
 * @param {object} sourceObject obiekt źródła (kontroler tokenów/obrażeń)
 * @param {string[]} targets id celów (dla damage/pump pierwszy cel)
 */
/** Wspólna ścieżka obrażeń NIEcombat (czary, zdolności, triggery) — CR 119.3,
 *  614, 615, 702.15, 702.89 w pełnym wymiarze:
 *  - prewencja tarcz (Withstand — damageShields) ORAZ filtr „prevent all damage
 *    to ... this turn" (Ethersworn Shieldmage — filtr typów dla permanentów);
 *  - zdarzenie damage_dealt niesie kwotę FAKTYCZNIE ZADANĄ (po prewencji) —
 *    „zapobiegnięte obrażenia nie są zadane" (CR 119.3); triggery czytające
 *    ev.amount (delirium Fear of Burning Alive: „deals that much damage")
 *    dostają właściwą kwotę zamiast kwoty sprzed prewencji;
 *  - infect: do gracza → poison, do stwora → -1/-1 (po prewencji — CR 702.89);
 *  - lifelink źródła: zysk życia = obrażenia zadane (CR 702.15 — dotyczy
 *    WSZYSTKICH obrażeń, także niecombat).
 *  Zwraca kwotę zadaną (0, gdy w pełni zapobiegnięta).
 */
function dealNonCombatDamage(state, sourceObject, targetId, rawAmount) {
  if (!Number.isInteger(rawAmount) || rawAmount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
  const targetIsPlayer = state.players.some((player) => player.id === targetId);
  const targetObject = targetIsPlayer ? null : state.objects.get(targetId);
  // Filtr „prevent all damage to ... this turn" dotyczy permanentów (stworów
  // o zadanych typach); gracz nie jest objęty filtrem typów.
  const filterPrevented = !targetIsPlayer && rawAmount > 0 && isDamagePrevented(state, targetObject) ? rawAmount : 0;
  if (filterPrevented > 0) {
    // Zdarzenie jak przy tarczach — strumień informuje o skasowanych obrażeniach.
    state.events.push(event('damage_prevented', {
      objectId: targetId, amount: filterPrevented, cardId: targetObject?.cardId ?? null,
    }));
  }
  const shieldPrevented = preventDamageTo(state, targetId, rawAmount - filterPrevented);
  const dealt = rawAmount - filterPrevented - shieldPrevented;
  state.events.push(event('damage_dealt', {
    source: sourceObject.id, target: targetId, amount: dealt, combat: false,
  }));
  if (dealt <= 0) return 0;
  if (effectiveKeywords(sourceObject, state).includes('infect')) {
    if (targetIsPlayer) {
      addPoisonCounters(state, targetId, dealt);
    } else {
      addCounter(state, targetId, '-1/-1', dealt);
    }
  } else if (targetIsPlayer) {
    changeLife(state, targetId, -dealt);
  } else {
    markDamage(state, targetId, dealt);
  }
  // Lifelink (CR 702.15): zysk życia równy obrażeniom ZADANYM (po prewencji).
  if (effectiveKeywords(sourceObject, state).includes('lifelink')) {
    changeLife(state, sourceObject.controllerId, dealt);
  }
  return dealt;
}

export function applyEffect(state, effect, sourceObject, targets = [], context = {}) {
  // Próg wydanej many na poziomie pojedynczego EFEKTU triggera (Tellah,
  // Great Sage: „if four/eight or more mana was spent to cast that spell") —
  // kontekst niesie manaSpent ze zdarzenia rzutu (triggers.fireTrigger);
  // próg niespełniony pomija TYLKO ten efekt, nie całą zdolność.
  if (effect.condition?.manaSpentAtLeast != null && (context?.manaSpent ?? 0) < effect.condition.manaSpentAtLeast) return;
  if (effect.type === 'damage') {
    const targetId = targets[0];
    // CR 608.2b: cel-stwór, który zniknął z bitwiska przed rozstrzygnięciem
    // (T6 — okno odpowiedzi na triggerze), sprawia, że efekt nic nie robi.
    if (targetId != null && !state.players.some((player) => player.id === targetId)) {
      const targetObj = state.objects.get(targetId);
      if (!targetObj || targetObj.zone !== 'battlefield' || targetObj.kind !== 'creature') return;
    }
    let amount = effect.amount;
    if (amount === 'artifacts_you_control') {
      amount = countArtifactsControlled(state, sourceObject.controllerId);
    }
    dealNonCombatDamage(state, sourceObject, targetId, amount);
    return;
  }
  if (effect.type === 'damage_each_opponent') {
    // „It deals N damage to each opponent" (Fear of Burning Alive, ETB):
    // obrażenia NIEsą combat damage (combat: false — istotne dla triggerów
    // „noncombat damage", np. delirium tej samej karty) i trafiają w KAŻDEGO
    // gracza poza kontrolerem źródła; kontroler jest nienaruszony.
    // amountFrom: 'manaSpent' — wartość z kontekstu triggera (Tellah:
    // „it deals that much damage to each opponent" — wydana mana rzutu).
    const amount = effect.amountFrom === 'manaSpent' ? (context?.manaSpent ?? 0) : effect.amount;
    for (const player of state.players) {
      if (player.id === sourceObject.controllerId) continue;
      dealNonCombatDamage(state, sourceObject, player.id, amount);
    }
    return;
  }
  if (effect.type === 'control_to_owners_all_creatures') {
    // „Each player gains control of all creatures they own" (Trostani
    // Discordant, trigger end step): stwory, których kontroler NIE jest
    // właścicielem (CR 108.3 — pole ownerId, CR 111.2 dla tokenów), wracają
    // do właściciela. Zmiana kontroli NIE jest zmianą strefy — obiekt zostaje,
    // liczniki/obrażenia/załączniki przechodzą (CR 301.5e: aura zostaje
    // przypięta i nadal kontrolowana przez swojego kontrolera). Po zmianie
    // kontroli stwór ma chorobę atakową (CR 302.6 — dopóki jego nowy
    // kontroler nie rozpocznie z nim tury).
    const moved = [];
    for (const object of [...state.objects.values()]) {
      if (object.zone !== 'battlefield' || object.kind !== 'creature') continue;
      const ownerId = object.ownerId ?? object.controllerId;
      if (ownerId === object.controllerId) continue;
      const updated = Object.freeze({ ...object, controllerId: ownerId, summoningSickness: true });
      state.objects.set(object.id, updated);
      state.events.push(event('control_changed', {
        objectId: object.id, cardId: object.cardId,
        controllerId: ownerId, fromControllerId: object.controllerId, toOwner: true,
      }));
      moved.push(object.id);
    }
    return;
  }
  if (effect.type === 'damage_to_controller') {
    // Forge Devil: „it deals 1 damage to target creature and 1 damage to you."
    // „You" (kontroler źródła) nie jest celem — obrażenia trafiają w kontrolera,
    // niezależnie od innych celów efektu. To NIE są obrażenia combat.
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
    const targetId = sourceObject.controllerId;
    // CR 119.3 (platynowa odznaka): event damage_dealt niesie kwotę FAKTYCZNIE
    // zadaną (po prewencji tarcz) — spójnie z dealNonCombatDamage; poprzednio
    // event raportował kwotę sprzed prewencji.
    const dealt = effect.amount - preventDamageTo(state, targetId, effect.amount);
    const damage = event('damage_dealt', { source: sourceObject.id, target: targetId, amount: dealt, combat: false });
    state.events.push(damage);
    if (dealt > 0) changeLife(state, targetId, -dealt);
    return;
  }
  if (effect.type === 'pump') {
    // Trigger bez jawnych celów (np. landfall) pumpuje samo źródło.
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel, który zniknął z bitwiska przed rozstrzygnięciem
    // (T6 — okno odpowiedzi; źródło triggera może być LKI stubem), sprawia,
    // że efekt nic nie robi.
    const pumpTarget = state.objects.get(targetId);
    if (!pumpTarget || pumpTarget.zone !== 'battlefield' || pumpTarget.kind !== 'creature') return;
    // Dynamiczna wartość „source_power" (np. Jyoti: pump wg mocy źródła).
    const power = effect.power === 'source_power' ? effectivePower(sourceObject, state) : (effect.power ?? 0);
    const toughness = effect.toughness === 'source_power' ? effectivePower(sourceObject, state) : (effect.toughness ?? 0);
    modifyStats(state, targetId, { power, toughness });
    return;
  }
  // Moonlit Meditation (replacement effect, EOE): pierwsze tworzenie tokenu w turze
  // -> kopie zaczarowanego permanentu (deterministycznie TAK).
  if (effect.type === 'create_token' && !state.moonlitUsedThisTurn?.[sourceObject.controllerId]) {
    const ctrl = sourceObject.controllerId;
    const moonlitAuraId = state.zones.battlefield.find((aid) => {
      const a = state.objects.get(aid);
      return a?.cardId === 'moonlit-meditation' && a.controllerId === ctrl && a.attachedTo;
    });
    if (moonlitAuraId) {
      const enchanted = state.objects.get(state.objects.get(moonlitAuraId).attachedTo);
      if (enchanted && enchanted.zone === 'battlefield') {
        // Temat 9 — „you may instead create that many tokens that are copies":
        // decyzja należy do GRACZA (resolve_moonlit_choice). Samo tworzenie
        // (kopie albo zwykłe tokeny) wykonuje komenda; tu tylko kolejkujemy.
        state.pendingMoonlitChoice = {
          playerId: ctrl,
          sourceId: moonlitAuraId,
          enchantedId: enchanted.id,
          effect: Object.freeze({ ...effect }),
          sourceObjectId: sourceObject.id,
          targets: [...(targets ?? [])],
          restorePriorityTo: state.turn.priorityPlayerId,
        };
        state.turn.priorityPlayerId = ctrl;
        state.events.push(event('moonlit_choice_required', {
          playerId: ctrl, enchantedId: enchanted.id,
          enchantedCardId: enchanted.cardId, sourceCardId: sourceObject.cardId ?? null,
        }));
        return true;
      }
    }
  }
  if (effect.type === 'create_token') {
    // Liczba tokenów: jawna (amount) albo dynamiczna „commander_casts"
    // (Jyoti — liczba rzuceń commandera z command zone; w obecnym formacie
    // bez command zone zawsze 0, więc 0 tokenów).
    let amount = effect.amount ?? 1;
    if (effect.amount === 'commander_casts') {
      amount = state.players.find((p) => p.id === sourceObject.controllerId)?.commanderCasts ?? 0;
    }
    // Howl of the Night Pack: token za każdy land o zadanym podtypie podstawowym
    // („for each Forest you control") kontrolowany przez źródło.
    if (effect.amount === 'lands_with_subtype_you_control') {
      amount = countLandsWithSubtype(state, sourceObject.controllerId, effect.subtype);
    }
    // Undead Servant: „create a 2/2 black Zombie token for each card named
    // Undead Servant in your graveyard" — liczba dynamiczna równa liczbie
    // kart o danej nazwie (dane, nie warunek na kartę) w grobie kontrolera.
    if (effect.amount === 'cards_named_in_graveyard') {
      // Liczba kopii o tym samym cardId w grobie kontrolera (inne egzemplarze
      // tej samej karty — Undead Servant). Token ma inny cardId, więc nie jest
      // liczony.
      const countCardId = effect.countCardId;
      amount = [...state.objects.values()].filter((object) => object.zone === 'graveyard'
        && object.controllerId === sourceObject.controllerId
        && object.cardId === countCardId).length;
    }
    // Marut: „create a Treasure token for each mana from a Treasure spent
    // to cast it" — liczba dynamiczna równa jednostkom many ze Skarbów
    // wydanym na rzut źródła (wpisane na permanencie przez castPermanent;
    // wejście inną drogą = 0, zgodnie z warunkiem „if mana ... was spent").
    if (effect.amount === 'mana_from_treasure_spent') {
      amount = sourceObject.manaFromTreasureSpent ?? 0;
    }
    // Fateful hour (Gather the Townsfolk): przy życiu ≤ N kontroler tworzy
    // inną (większą) liczbę tokenów. Deskryptor generyczny: warunek na życiu.
    if (effect.ifLifeAtMost && effect.amountIfCondition != null) {
      const life = state.players.find((p) => p.id === sourceObject.controllerId)?.life ?? 0;
      if (life <= effect.ifLifeAtMost) amount = effect.amountIfCondition;
    }
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Liczba tokenów musi być nieujemna');
    const greatestPower = [...state.objects.values()]
      .filter((object) => object.zone === 'battlefield' && object.controllerId === sourceObject.controllerId && object.kind === 'creature')
      .reduce((max, object) => Math.max(max, effectivePower(object, state) ?? 0), 0);
    const tokenPower = effect.power === 'greatest_power_you_control' ? greatestPower : (effect.power ?? 1);
    const tokenToughness = effect.toughness === 'greatest_power_you_control' ? greatestPower : (effect.toughness ?? 1);
    for (let i = 0; i < amount; i += 1) {
      createBattlefieldToken(state, sourceObject.controllerId, {
        cardId: effect.cardId,
        name: effect.name,
        kind: effect.kind ?? 'creature',
        power: tokenPower,
        toughness: tokenToughness,
        colors: effect.colors ?? [],
        types: effect.types ?? [],
        subtypes: effect.subtypes ?? [],
        keywords: effect.keywords ?? [],
        // Tokeny z własnymi zdolnościami (Treasure: „{T}, Sacrifice this
        // token: Add one mana of any color") — deskryptory generyczne.
        abilities: effect.abilities ?? [],
      });
    }
    return;
  }
  if (effect.type === 'buff_creatures_you_control') {
    // Globalny buff do końca tury (Angel of the Dawn +1/+1 vigilance, Your
    // Temple — indestructible): efekt CIĄGŁY do końca tury — wpis na liście
    // czytany przy każdym odczycie statystyk, więc obejmuje też stwory
    // wchodzące PO rozstrzygnięciu (CR 611.2c). Poprzednio aplikowano tylko
    // do stworów obecnych w chwili rozstrzygnięcia.
    state.untilEndOfTurnBuffs = [
      ...(state.untilEndOfTurnBuffs ?? []),
      Object.freeze({
        controllerId: sourceObject.controllerId,
        opponent: false,
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
        keywords: Object.freeze([...(effect.keywords ?? [])]),
      }),
    ];
    return;
  }
  if (effect.type === 'mill_cards') {
    // Mill N: karty z wierzchu biblioteki przechodzą do grobu jako nowe obiekty
    // strefy; pusta biblioteka nie przegrywa poza draw stepem. Domyślnie młynuje
    // się kontroler źródła; „Target player mills N" (Sweet Oblivion) młynuje
    // GRACZA-CEL (targets[0]), gdy wskaźnik celu jest graczem.
    //
    // Ochrona scry/surveil: karty przeglądane przez oczekujący scry/surveil
    // gracza-celu NIE są młynowane. Silnik rozstrzyga triggery natychmiast (bez
    // stosu), więc mill odpalony np. śmiercią stwora z czaru „obrażenia + scry"
    // (Selhoff Occultist) mógłby usunąć kartę, którą gracz właśnie scryuje —
    // invariant pendingScry (karty muszą być w bibliotece) złamałby się. Pomijamy
    // te karty, a mill bierze kolejną (decyzja scry „wstrzymuje" swe karty).
    const amount = effect.amount ?? 0;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Mill wymaga nieujemnej liczby kart');
    const targetPlayerId = (targets[0] && state.players.some((player) => player.id === targets[0]))
      ? targets[0]
      : sourceObject.controllerId;
    const protectedIds = new Set();
    if (state.pendingScry?.playerId === targetPlayerId) for (const id of state.pendingScry.objectIds) protectedIds.add(id);
    if (state.pendingSurveil?.playerId === targetPlayerId) for (const id of state.pendingSurveil.objectIds) protectedIds.add(id);
    if (state.pendingExplore?.playerId === targetPlayerId && state.pendingExplore.objectId) protectedIds.add(state.pendingExplore.objectId);
    if (state.pendingClash?.cards?.[targetPlayerId]) protectedIds.add(state.pendingClash.cards[targetPlayerId]);
    // Najpierw snapshot kart do mila (kolejność wierzchu, pomijając chronione),
    // potem mill — modyfikujemy state.zones.library, więc nie iterujemy jej
    // jednocześnie z mutacją.
    const toMill = [];
    for (const topId of state.zones.library) {
      if (toMill.length >= amount) break;
      const object = state.objects.get(topId);
      if (!object || object.controllerId !== targetPlayerId) continue;
      if (protectedIds.has(topId)) continue; // karta wstrzymana przez scry/surveil
      toMill.push(topId);
    }
    for (const topId of toMill) {
      const object = state.objects.get(topId);
      const graveId = `grave-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, topId, 'graveyard', graveId);
      state.events.push(event('card_milled', {
        playerId: targetPlayerId, fromId: topId, objectId: graveId, cardId: object.cardId, object: moved,
      }));
    }
    return;
  }
/**
 * Temat 6 — „You may search your library for ..." (CR 701.19b): blokująca
 * decyzja gracza, KTÓRĄ kartę znaleźć (albo w ogóle nie szukać — fail to
 * find). Ruch karty + tasowanie wykonuje komenda resolve_search_choice.
 * Zwraca true (blokada), gdy są kandydaci; bez kandydatów automatycznie
 * tasuje (szukanie z pustym/niepasującym zbiorem to samo „search... shuffle").
 */
function queueSearchChoice(state, sourceObject, { qualifier, destination, entersTapped }) {
  const ownerId = sourceObject.controllerId;
  const matches = (object) => {
    if (!object || object.controllerId !== ownerId || object.zone !== 'library') return false;
    const typeMatch = (qualifier.types ?? []).length === 0
      || (qualifier.types ?? []).every((type) => (object.types ?? []).includes(type));
    const subtypeMatch = (qualifier.subtypes ?? []).length === 0
      || (qualifier.subtypes ?? []).some((subtype) => (object.subtypes ?? []).includes(subtype));
    return typeMatch && subtypeMatch;
  };
  const candidateIds = state.zones.library.filter((id) => matches(state.objects.get(id)));
  if (candidateIds.length === 0) {
    // Brak pasujących kart — samo przeszukanie i tasowanie (fail to find).
    const own = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId);
    const shuffled = shuffle(own, state.seed + state.objectSequence);
    let cursor = 0;
    state.zones.library = state.zones.library.map((id) => {
      if (state.objects.get(id)?.controllerId !== ownerId) return id;
      const replacement = shuffled[cursor];
      cursor += 1;
      return replacement;
    });
    state.events.push(event('library_searched', {
      playerId: ownerId, foundCardId: null, destination, shuffled: true, qualifier,
    }));
    return;
  }
  state.pendingSearchChoice = {
    playerId: ownerId, qualifier, destination, entersTapped,
    sourceCardId: sourceObject.cardId ?? null,
    restorePriorityTo: state.turn.priorityPlayerId,
  };
  state.turn.priorityPlayerId = ownerId;
  state.events.push(event('search_choice_required', {
    playerId: ownerId, candidateIds: [...candidateIds],
    destination, sourceCardId: sourceObject.cardId ?? null,
  }));
  return true;
}

  if (effect.type === 'search_library_to_battlefield') {
    // „You may search your library for a card with qualifier, put it onto the
    // battlefield [tapped], then shuffle" (Kor Cartographer, Dawntreader Elk;
    // Temat 6 — CR 701.19b). Którą kartę wziąć (i czy w ogóle szukać) wybiera
    // GRACZ: blokująca decyzja resolve_search_choice; sam ruch + tasowanie
    // wykonuje komenda.
    return queueSearchChoice(state, sourceObject, {
      qualifier: effect.qualifier ?? {},
      destination: 'battlefield',
      entersTapped: Boolean(effect.entersTapped),
    });
  }
  if (effect.type === 'search_basic_land_morbid') {
    // Caravan Vigil (Temat 6): search basic land → ręka; Morbid (stwór zginął
    // w tej turze) → bitwisko zamiast ręki. Wybór karty należy do gracza.
    const toBattlefield = Boolean(state.creatureDiedThisTurn);
    return queueSearchChoice(state, sourceObject, {
      qualifier: { types: ['Basic', 'Land'] },
      destination: toBattlefield ? 'battlefield' : 'hand',
      entersTapped: false,
    });
  }
  if (effect.type === 'search_library_to_hand') {
    // „You may search your library for a card with qualifier, reveal it, put
    // it into your hand, then shuffle" (Pilgrim's Eye; loch — Secret
    // Entrance; Temat 6). Wybór karty należy do gracza.
    return queueSearchChoice(state, sourceObject, {
      qualifier: effect.qualifier ?? {},
      destination: 'hand',
      entersTapped: false,
    });
  }
  if (effect.type === 'amass') {
    // Amass N: wybierz istniejącą Army kontrolera albo utwórz 0/0 Army,
    // następnie połóż N liczników +1/+1. Deskryptor nie zna nazwy karty.
    const amount = effect.amount ?? 0;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Amass wymaga nieujemnej liczby liczników');
    const subtype = effect.subtype ?? 'Orc';
    let army = [...state.objects.values()].find((object) => object.zone === 'battlefield'
      && object.controllerId === sourceObject.controllerId && object.kind === 'creature'
      && (object.subtypes ?? []).includes('Army'));
    if (!army) {
      army = createBattlefieldToken(state, sourceObject.controllerId, {
        cardId: effect.cardId ?? `token_${String(subtype).toLowerCase()}_army`,
        name: effect.name ?? `${subtype} Army`,
        kind: 'creature', power: 0, toughness: 0,
        colors: effect.colors ?? ['B'], types: ['Creature'], subtypes: [subtype, 'Army'],
      });
    }
    if (amount > 0) addCounter(state, army.id, '+1/+1', amount);
    return;
  }
  if (effect.type === 'buff_land_creatures') {
    // Wzmocnienie wszystkich land creatures kontrolera źródła do końca tury
    // (Jyoti: „land creatures you control get +X/+X until end of turn, where
    // X is Jyoti's power"). Land creature = kind creature + typ Land.
    const power = effect.power === 'source_power' ? effectivePower(sourceObject, state) : (effect.power ?? 0);
    const toughness = effect.toughness === 'source_power' ? effectivePower(sourceObject, state) : (effect.toughness ?? 0);
    for (const object of state.objects.values()) {
      if (object.zone !== 'battlefield' || object.controllerId !== sourceObject.controllerId) continue;
      const isLandCreature = object.kind === 'creature' && (object.types ?? []).includes('Land');
      if (isLandCreature) modifyStats(state, object.id, { power, toughness });
    }
    return;
  }
  if (effect.type === 'draw_cards') {
    // Dobranie N kart przez kontrolera źródła (Phyrexian Rager, Evangel of
    // Synthesis). Pusta biblioteka NIE kończy tu gry — przegraną z powodu
    // pustej biblioteki rozstrzyga próba dobrania w kroku draw (jak dotąd);
    // efekt karty po prostu nie dobiera niczego więcej.
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Dobranie wymaga dodatniej liczby kart');
    drawPlayerCards(state, sourceObject.controllerId, amount);
    return;
  }
  if (effect.type === 'draw_cards_both_players') {
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Dobranie wymaga dodatniej liczby kart');
    const targetId = targets[0];
    drawPlayerCards(state, sourceObject.controllerId, amount);
    if (targetId && state.players.some((p) => p.id === targetId)) {
      drawPlayerCards(state, targetId, amount);
    }
    return;
  }
  if (effect.type === 'animate_permanent_until_end_of_turn') {
    // Bez celów (crew — Irontread Crusher animuje SIEBIE) źródło jest celem.
    const targetId = targets[0] ?? sourceObject.id;
    if (targetId) {
      animatePermanentUntilEndOfTurn(state, targetId, {
        power: effect.power,
        toughness: effect.toughness,
        typesAdd: effect.typesAdd ?? [],
        subtypesAdd: effect.subtypesAdd ?? [],
        keywordsAdd: effect.keywordsAdd ?? [],
        retainTypes: effect.retainTypes ?? true,
      });
    }
    return;
  }
  if (effect.type === 'discard_cards') {
    // Odrzucenie N kart (Temat 4 — CR 701.18: wybór należy do gracza, który
    // odrzuca). applyTo: 'target' → GRACZ-CEL wybiera (Dementia Bat: „Target
    // player discards two cards"); bez applyTo → kontroler źródła wybiera
    // (Evangel: „draw a card, then discard a card"). Blokująca decyzja
    // resolve_discard_choice — czar czeka na stosie (pendingSpell), jak przy
    // surveil; sekwencyjnie po jednej karcie (Plague Reaver-style count > 1).
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Odrzucenie wymaga dodatniej liczby kart');
    const playerId = effect.applyTo === 'target' ? targets[0] : sourceObject.controllerId;
    if (effect.applyTo === 'target' && !state.players.some((entry) => entry.id === playerId)) {
      throw new Error('Nieprawidłowy gracz-cel odrzucenia');
    }
    const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
    if (handIds.length === 0) return; // brak kart — nic do odrzucenia
    state.pendingDiscardChoice = {
      playerId,
      count: Math.min(amount, handIds.length),
      handIds,
      purpose: 'effect',
      sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = playerId;
    state.events.push(event('discard_choice_required', {
      playerId, count: Math.min(amount, handIds.length), cardIds: [...handIds],
      purpose: 'effect', sourceCardId: sourceObject.cardId ?? null,
    }));
    // Blokująca decyzja — rozstrzyganie czaru czeka (state.pendingSpell).
    return true;
  }
  if (effect.type === 'lose_life') {
    // Utrata życia (Delta Bloodflies: „each opponent loses 1 life"; loch
    // Undercity — Trap!: „target player loses 5 life"). To NIE są obrażenia
    // (nie odpalają triggerów damage i nie da się ich zapobiec jak obrażeniom).
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Utrata życia musi być dodatnia');
    // „That player loses 1 life" (Nightshade Harvester — trigger wejścia
    // landa przeciwnika): cel z kontekstu zdarzenia, nie z deskryptora.
    if (effect.applyTo === 'event_player') {
      const eventPlayerId = context?.enteredControllerId;
      if (eventPlayerId && state.players.some((player) => player.id === eventPlayerId)) {
        changeLife(state, eventPlayerId, -effect.amount);
      }
      return;
    }
    if (effect.targetPlayerId != null) {
      if (!state.players.some((player) => player.id === effect.targetPlayerId)) {
        throw new Error('Nieznany cel utraty życia');
      }
      changeLife(state, effect.targetPlayerId, -effect.amount);
      return;
    }
    const scope = effect.scope ?? 'each_opponent';
    for (const player of state.players) {
      const isOpponent = player.id !== sourceObject.controllerId;
      if (scope === 'each_opponent' && !isOpponent) continue;
      if (scope === 'controller' && isOpponent) continue;
      changeLife(state, player.id, -effect.amount);
    }
    return;
  }
  if (effect.type === 'goad') {
    // Goad (CR 701.38, loch Undercity — Arena): „goad target creature" —
    // stwór musi atakować w każdym combacie do końca tury.
    const targetId = targets[0];
    if (!targetId) return;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu.
    const goadTarget = state.objects.get(targetId);
    if (!goadTarget || goadTarget.zone !== 'battlefield' || goadTarget.kind !== 'creature') return;
    goadUntilNextTurn(state, targetId, sourceObject.controllerId);
    return;
  }
  if (effect.type === 'grant_abilities') {
    // Nadanie zdolności „do końca tury" (Fake Your Own Death). Deskryptory
    // zdolności są generyczne — engine ich nie interpretuje po nazwie karty.
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu.
    const grantTarget = state.objects.get(targetId);
    if (!grantTarget || grantTarget.zone !== 'battlefield' || grantTarget.kind !== 'creature') return;
    grantAbilitiesUntilEndOfTurn(state, targetId, effect.abilities ?? []);
    return;
  }
  if (effect.type === 'grant_keywords_until_end_of_turn') {
    // Nadanie keywordów celowi „do końca tury" (Stirring Bard: menace, haste).
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu.
    const keywordTarget = state.objects.get(targetId);
    if (!keywordTarget || keywordTarget.zone !== 'battlefield' || keywordTarget.kind !== 'creature') return;
    grantKeywordsUntilEndOfTurn(state, targetId, effect.keywords ?? []);
    return;
  }
  if (effect.type === 'become_basic_land_type') {
    // Unstable Frontier: „target land you control becomes the basic land type
    // of your choice until end of turn" (Temat 5 — CR 305.7): typ WYBIERA
    // kontroler (blokująca decyzja resolve_land_type_choice). Samą zmianę
    // typu wykonuje komenda; efekt tylko kolejkuje decyzję.
    const targetId = targets[0];
    if (!targetId) return;
    const target = state.objects.get(targetId);
    if (!target || target.zone !== 'battlefield') return;
    state.pendingLandTypeChoice = {
      playerId: sourceObject.controllerId,
      targetId,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('land_type_choice_required', {
      playerId: sourceObject.controllerId, targetId, sourceCardId: sourceObject.cardId ?? null,
    }));
    return;
  }
  if (effect.type === 'return_to_battlefield_tapped') {
    // Powrót obiektu z grobu na bitwisko ZATAPNIĘTEGO pod kontrolą właściciela
    // (Fake Your Own Death). Cel domyślny: samo źródło (trigger „when this
    // creature dies" — obiekt jest już w grobie po zmianie strefy).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    // Obiekt mógł już wrócić na bitwisko (dwa nadane triggery „dies" na tym
    // samym stworze — drugi widzi już nowy obiekt, CR 400.7): efekt nic nie robi.
    if (!object || object.zone !== 'graveyard') return;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, tapped: true, summoningSickness: true });
    state.objects.set(newId, permanent);
    state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield' }));
    return;
  }
  if (effect.type === 'gain_life') {
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Zysk życia musi być nieujemny');
    changeLife(state, sourceObject.controllerId, effect.amount);
    return;
  }
  if (effect.type === 'add_counter') {
    // Licznik na celu (domyślnie na źródle) — np. trigger Canonized in Blood:
    // „put a +1/+1 counter on target creature you control". `targetIndex`
    // wskazuje inną pozycję na liście celów (Greatsword of Tyr: cel 0 =
    // nosiciel-atakujący).
    const targetId = targets[effect.targetIndex ?? 0] ?? sourceObject.id;
    // CR 608.2b: cel, który zniknął z bitwiska przed rozstrzygnięciem
    // (T6 — okno odpowiedzi), sprawia, że efekt nic nie robi.
    const targetObj = state.objects.get(targetId);
    if (!targetObj || targetObj.zone !== 'battlefield') return;
    addCounter(state, targetId, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'remove_counter') {
    // Źródło mogło zniknąć (LKI stub) — bez permanenta nie ma czego zdjąć.
    const sourceObj = state.objects.get(sourceObject.id);
    if (!sourceObj || sourceObj.zone !== 'battlefield') return;
    removeCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'tap_permanent') {
    // `targetIndex` wskazuje inną pozycję na liście celów (Greatsword of Tyr:
    // „tap up to one target creature defending player controls\" — cel 1).
    // „Up to one\" zrealizowane deterministycznie: brak celu = brak efektu.
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return; // cel zniknął — brak efektu (CR 608.2b)
    if (!object.tapped) {
      const updated = Object.freeze({ ...object, tapped: true });
      state.objects.set(targetId, updated);
      state.events.push(event('object_tapped', { objectId: targetId, playerId: sourceObject.controllerId }));
    }
    return;
  }
  if (effect.type === 'tap_permanents') {
    // Aerith Rescue Mission („Take 59 Flights of Stairs"): tap up to N target
    // creatures — tapujemy wszystkie przekazane cele (już przefiltrowane przez
    // rozstrzyganie modalne na żywe na bitwisku).
    for (const targetId of targets) {
      const object = state.objects.get(targetId);
      if (!object || object.zone !== 'battlefield' || object.tapped) continue;
      state.objects.set(targetId, Object.freeze({ ...object, tapped: true }));
      state.events.push(event('object_tapped', { objectId: targetId, playerId: sourceObject.controllerId }));
    }
    return;
  }
  if (effect.type === 'lock_untap') {
    // Stwór nie odkręca się, dopóki źródło (np. zatapnięta Lira) jest na
    // bitwisku i zatapnięte; blokada wygasa, gdy źródło opuści bitwisko.
    // Dla aury Spectral Prison: cel to zaczarowany stwór (attachedTo).
    const targetId = targets[0] ?? sourceObject.attachedTo;
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    const lockedBy = [...(object.untapLockedBy ?? [])];
    if (!lockedBy.includes(sourceObject.id)) lockedBy.push(sourceObject.id);
    state.objects.set(targetId, Object.freeze({ ...object, untapLockedBy: lockedBy }));
    return;
  }
  if (effect.type === 'untap_permanent') {
    // Odkręcenie permanentu — domyślnie źródła (np. trigger Midnight Guard:
    // „Whenever another creature enters, untap this creature").
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu
    // (źródło triggera może być LKI stubem, gdy odeszło w oknie odpowiedzi).
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    if (object.tapped) {
      state.objects.set(targetId, Object.freeze({ ...object, tapped: false }));
      state.events.push(event('object_untapped', { objectId: targetId, playerId: sourceObject.controllerId }));
    }
    return;
  }
  if (effect.type === 'add_mana') {
    // Kolorowa pula (cz. 7): mana ze zdolności ma KOLOR źródła (Skarb/dowolny
    // land → dowolny, Apprentice Wizard → bezbarwna). fromTreasure oznacza manę
    // ze Skarba (identyfikowalną — Marut pyta, ile ze Skarba wydano na rzut).
    const src = getSourceForObject(sourceObject);
    addMana(state, sourceObject.controllerId, effect.amount ?? 1, { colors: src?.colors ?? [], fromTreasure: Boolean(effect.fromTreasure) });
    return;
  }
  if (effect.type === 'pay_life') {
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Płatność życia musi być dodatnia');
    changeLife(state, sourceObject.controllerId, -effect.amount);
    return;
  }
  if (effect.type === 'pay_mana') {
    spendMana(state, sourceObject.controllerId, effect.amount ?? 0);
    return;
  }
  if (effect.type === 'return_permanent_from_graveyard') {
    // CR 608.2b: karta mogła opuścić grób, zanim efekt się rozstrzygnął
    // (T6 — odpowiedź na triggerze) — brak efektu.
    const targetId = targets[0];
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard' || object.kind === 'land' || object.kind === 'spell') return;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, summoningSickness: true });
    state.objects.set(newId, permanent);
    if (effect.finalityCounter) addCounter(state, newId, 'finality', 1);
    // Batch 24 (Unbreakable Bond): „return ... with a lifelink counter on it" —
    // wejście z licznikami (CR 122.1b — licznik lifelink nadaje keyword).
    for (const [name, amount] of Object.entries(effect.counters ?? {})) {
      addCounter(state, newId, name, amount);
    }
    state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield' }));
    return;
  }
  if (effect.type === 'transform') {
    const target = sourceObject.transformTo;
    if (!target) throw new Error('Obiekt bez transformTo odpala transform — bug');
    const updated = Object.freeze({
      ...sourceObject,
      cardId: target.cardId,
      cardName: target.cardName ?? sourceObject.cardName,
      power: target.power,
      toughness: target.toughness,
      abilities: target.abilities,
      keywords: target.keywords ?? [],
      subtypes: target.subtypes ?? [],
      transformTo: {
        cardId: sourceObject.cardId,
        cardName: sourceObject.cardName,
        power: sourceObject.power,
        toughness: sourceObject.toughness,
        abilities: sourceObject.abilities,
        keywords: sourceObject.keywords ?? [],
        subtypes: sourceObject.subtypes ?? [],
      },
    });
    state.objects.set(sourceObject.id, updated);
    state.events.push(event('object_transformed', { objectId: sourceObject.id, fromCardId: sourceObject.cardId, cardId: target.cardId }));
    return;
  }
  if (effect.type === 'exile_all') {
    // Bezcelowe wygnanie WSZYSTKICH permanentów spełniających filtr
    // (Ruinous Rampage: „Exile all artifacts with mana value 3 or less").
    // Filtr: types (każdy wymieniony typ musi być na obiekcie) +
    // manaValueAtMost. Zdarzenie jak przy exile_permanent (object_moved →
    // exile), żeby reszta systemu (triggery LKI) widziała zmianę tak samo.
    const filterTypes = effect.filter?.types ?? [];
    const manaValueAtMost = effect.filter?.manaValueAtMost ?? null;
    for (const objectId of [...state.zones.battlefield]) {
      const object = state.objects.get(objectId);
      if (!object) continue;
      if (filterTypes.length > 0 && !filterTypes.every((type) => (object.types ?? []).includes(type))) continue;
      if (manaValueAtMost != null && (object.manaCost ?? 0) > manaValueAtMost) continue;
      const exileId = `exile-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, objectId, 'exile', exileId);
      state.events.push(event('object_moved', {
        fromId: objectId, object: moved, fromZone: 'battlefield', toZone: 'exile',
      }));
    }
    return;
  }
  if (effect.type === 'exile_permanent') {
    // „You may ... exile target ..." (Kappa Tech-Wrecker, Temat 2): przy
    // odrzuconym celu (null) efekt nie robi nic — jak tap_permanent „up to
    // one" (CR 608.2b); zniknięty cel też jest pomijany.
    const targetId = targets[0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId);
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile' }));
    return;
  }
  if (effect.type === 'exile_own_land') {
    // Wormfang Newt (ETB): exile land you control (T2: cel wybiera
    // kontroler) i zapamiętaj id wygnanej karty na źródle, żeby LTB
    // trigger mógł ją przywrócić. targets[0] = id wybranego landa.
    const targetId = targets[0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    if (object.controllerId !== sourceObject.controllerId) return;
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId);
    state.events.push(event('object_moved', {
      fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile',
    }));
    // Zapisz na źródle id wygnanej karty (do LKI po odejściu źródła z BF
    // formerExiledBy też niesie tę informację — patrz objects.js).
    const src = state.objects.get(sourceObject.id);
    if (src) {
      const exiled = [...(src.exiledCardIds ?? [])];
      if (!exiled.includes(exileId)) exiled.push(exileId);
      state.objects.set(sourceObject.id, Object.freeze({ ...src, exiledCardIds: exiled }));
    }
    return;
  }
  if (effect.type === 'exile_target_creature') {
    // Faceless Butcher (TOR): ETB „exile another target creature" — linked
    // exile zapamiętany na źródle (exiledCardIds), LTB przywraca go przez
    // return_exiled_to_battlefield (jak exile_own_land Wormfang Newt, ale cel
    // to DOWOLNY stwór — „another" pilnują kandydaci triggera, nie engine).
    const targetId = targets[0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId);
    state.events.push(event('object_moved', {
      fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile',
    }));
    const src = state.objects.get(sourceObject.id);
    if (src) {
      const exiled = [...(src.exiledCardIds ?? [])];
      if (!exiled.includes(exileId)) exiled.push(exileId);
      state.objects.set(sourceObject.id, Object.freeze({ ...src, exiledCardIds: exiled }));
    }
    return;
  }
  if (effect.type === 'destroy_permanent') {
    // Destroy target artifact/permanent (Shatter, CR 701.7): cel trafia do grobu
    // (zmiana strefy battlefield → graveyard), co odpala trigger „dies\" przez
    // zdarzenie object_moved (jak sacrifice). W engine bez regeneracji destroy
    // i sacrifice różnią się wyłącznie eventem.
    // `targetIndex` wskazuje pozycję na liście celów (konwencja reszty
    // efektów — Vandalize „Destroy both": efekt 2 niszczy cel nr 2, czyli
    // land; bez tego drugi efekt ponownie celował w artefakt i land przeżywał).
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return; // nielegalny/zniknięty cel — brak efektu (CR 608.2b)
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    // Indestructible (CR 702.12): permanenty z tym keywordem nie da się
    // zniszczyć — destroy nie ma efektu. To generyczna cecha obiektu, nie
    // warunek na nazwę karty (łagodzi deathtouch i śmiertelne obrażenia
    // już w state-based actions, tu chroni przed efektem „destroy").
    if (effectiveKeywords(object, state).includes('indestructible')) return;
    // Regeneracja (CR 701.12): efekt „destroy" jest zastępowany — permanent
    // zostaje (odtapowany, bez obrażeń), tarcza zniknęła.
    if (tryRegenerate(state, object)) return;
    // Finality counter (CR 122.1b w pełnym wymiarze): „If this permanent would
    // die, exile it instead" — dotyczy KAŻDEJ przyczyny śmierci, także
    // zniszczenia efektem (wcześniej tylko zgony SBA).
    const toZone = (object.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, toZone, destId);
    state.events.push(event('permanent_destroyed', {
      fromId: targetId, objectId: destId, playerId: object.controllerId, cardId: moved.cardId, toZone,
    }));
    return;
  }
  if (effect.type === 'sacrifice_permanent') {
    // Poświęcenie permanentu: domyślnie samo źródło („sacrifice it"), z
    // możliwością wskazania celu przez targets[0]. Trafia do grobu (nie exile).
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    // Finality counter (CR 122.1b): poświęcenie też jest śmiercią — zamiast
    // grobu obiekt idzie do exile (wcześniej tylko zgony SBA).
    const toZone = (object.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, object.id, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: object.id, objectId: destId, playerId: object.controllerId, cardId: moved.cardId, toZone,
    }));
    return;
  }
  if (effect.type === 'return_with_counter') {
    // Persist (CR 702.79): stwór wraca z grobu na bitwisko pod kontrolą
    // WŁAŚCICIELA z licznikiem -1/-1, o ile nie miał liczników -1/-1 w chwili
    // śmierci (LKI — formerCounters ustawiane przy zmianie strefy).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    // Jak wyżej (CR 400.7): karta zdążyła zmienić strefę — persist wygasa.
    if (!object || object.zone !== 'graveyard') return;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    state.objects.set(newId, Object.freeze({ ...moved, summoningSickness: true }));
    addCounter(state, newId, effect.counter ?? '-1/-1', effect.amount ?? 1);
    state.events.push(event('object_moved', { fromId: targetId, object: state.objects.get(newId), fromZone: 'graveyard', toZone: 'battlefield' }));
    return;
  }
  if (effect.type === 'reanimate_under_your_control') {
    // Puppeteer Clique: „put target creature card from an opponent's graveyard
    // onto the battlefield under your control. It gains haste. At the beginning
    // of your next end step, exile it." Kontrola przechodzi na kontrolera
    // źródła (jedyny efekt zmiany kontroli w engine), stwór dostaje haste,
    // a wygnanie jest opóźnionym triggerem (state.delayedTriggers).
    const targetId = targets[0];
    // CR 608.2b: karta mogła opuścić grób przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard' || object.kind !== 'creature') return;
    const controllerId = sourceObject.controllerId;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    const keywords = [...new Set([...(moved.keywords ?? []), ...(effect.grantKeywords ?? [])])];
    const permanent = Object.freeze({ ...moved, controllerId, keywords: Object.freeze(keywords), summoningSickness: true });
    state.objects.set(newId, permanent);
    state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield' }));
    state.events.push(event('control_changed', { objectId: newId, cardId: permanent.cardId, controllerId, fromControllerId: moved.controllerId }));
    if (effect.exileAtNextEndStep) {
      state.delayedTriggers.push({
        type: 'exile_object', objectId: newId, playerId: controllerId,
        // „At the beginning of your NEXT end step" — trigger należy do
        // kontrolera i czeka na jego najbliższy krok end.
        armedOnTurn: state.turn.number, cardId: permanent.cardId,
      });
    }
    return;
  }
  if (effect.type === 'scry') {
    // Scry N (CR 701.18, minimalny wymiar — pierwsza karta to Prismari Campus):
    // patrzymy na N wierzchnich kart własnej biblioteki; decyzję o spodzie
    // podejmuje gracz osobną komendą resolve_scry (patrz game-state.js).
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Scry wymaga dodatniej liczby kart');
    const ownerId = sourceObject.controllerId;
    const seen = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId).slice(0, effect.amount);
    // Scry może odpalić się z triggera w turze PRZECIWNIKA (Nefarious Imp:
    // „whenever one or more permanents you control leave the battlefield").
    // Decyzja należy do właściciela, więc priorytet przechodzi na niego i
    // wraca po resolve_scry — inaczej gracz z priorytetem nie miałby żadnej
    // legalnej komendy i partia stawałaby w miejscu.
    state.pendingScry = seen.length > 0
      ? { playerId: ownerId, objectIds: seen, restorePriorityTo: state.turn.priorityPlayerId }
      : null;
    if (seen.length > 0) state.turn.priorityPlayerId = ownerId;
    state.events.push(event('scry_started', {
      playerId: ownerId, amount: seen.length,
      cardIds: seen.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
    }));
    // Zwracamy true, gdy decyzja zablokowała bieg gry — rozstrzyganie czaru
    // (resolveTopOfStack) musi wtedy wstrzymać dalsze efekty do resolve_*.
    return seen.length > 0;
  }
  if (effect.type === 'surveil') {
    // Surveil N (CR 701.41, Curate): patrzymy na N wierzchnich kart własnej
    // biblioteki; decyzja o liczbie kart do grobu należy do gracza (komenda
    // resolve_surveil), reszta zostaje na wierzchu w pierwotnej kolejności.
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Surveil wymaga dodatniej liczby kart');
    const ownerId = sourceObject.controllerId;
    const seen = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId).slice(0, effect.amount);
    state.pendingSurveil = seen.length > 0
      ? { playerId: ownerId, objectIds: seen, restorePriorityTo: state.turn.priorityPlayerId }
      : null;
    if (seen.length > 0) state.turn.priorityPlayerId = ownerId;
    state.events.push(event('surveil_started', {
      playerId: ownerId, amount: seen.length,
      cardIds: seen.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
    }));
    return seen.length > 0;
  }
  if (effect.type === 'take_initiative') {
    // Inicjatywa (CR 725, Underdark Explorer): gracz obejmuje inicjatywę;
    // jeśli nie miał jej wcześniej, natychmiast zagłębia się w Podziemia
    // („Whenever you take the initiative … venture into Undercity").
    const playerId = effect.playerId ?? sourceObject.controllerId;
    const previous = state.initiativePlayerId ?? null;
    state.initiativePlayerId = playerId;
    const firstTime = previous !== playerId;
    state.events.push(event('initiative_taken', { playerId, previousPlayerId: previous, firstTime }));
    if (firstTime) ventureIntoUndercity(state, playerId);
    return;
  }
  if (effect.type === 'venture_into_undercity') {
    const playerId = effect.playerId ?? sourceObject.controllerId;
    ventureIntoUndercity(state, playerId);
    return;
  }
  if (effect.type === 'clash') {
    // Clash (CR 701.40, Release the Ants): obaj gracze odsłaniają wierzchnią
    // kartę swojej biblioteki i każdy kładzie ją na WIERZCH ALBO SPÓD — to
    // realny wybór gracza (blokująca decyzja resolve_clash_choice, jak
    // scry/surveil). Wygrywa wyższa mana value; remis i brak karty (pusta
    // biblioteka) to przegrana tej strony. „If you win, return the spell to
    // its owner's hand" rozstrzyga się po decyzjach — pendingSpellReturnToHand.
    if (!state.players.some((player) => player.id === sourceObject.controllerId)) {
      throw new Error('Nieznany kontroler clash');
    }
    const playerId = sourceObject.controllerId;
    const opponentId = state.players.find((player) => player.id !== playerId).id;
    const revealTop = (id) => {
      const topId = state.zones.library.find((objectId) => state.objects.get(objectId)?.controllerId === id);
      if (!topId) return null;
      const object = state.objects.get(topId);
      state.events.push(event('card_revealed', { playerId: id, objectId: topId, cardId: object.cardId, clash: true }));
      return object;
    };
    const mine = revealTop(playerId);
    const theirs = revealTop(opponentId);
    const myValue = mine ? (mine.manaCost ?? 0) : -1;
    const opponentValue = theirs ? (theirs.manaCost ?? 0) : -1;
    const won = myValue > opponentValue;
    state.events.push(event('clash_resolved', {
      playerId, opponentId,
      myManaValue: mine ? myValue : null,
      opponentManaValue: theirs ? opponentValue : null,
      won,
      pendingChoices: Boolean(mine || theirs),
    }));
    if (!mine && !theirs) {
      // Obie biblioteki puste — nie ma czego odkładać; rozstrzygnięcie od razu.
      if (won && effect.returnToHandOnWin) state.pendingSpellReturnToHand = true;
      return;
    }
    // Decyzje „wierzch albo spód" — każdy gracz, który ma kartę, w kolejności
    // caster → przeciwnik (niezależne wybory). Blokuje grę do resolve_clash_choice.
    state.pendingClash = {
      choices: [playerId, opponentId].filter((id) => (id === playerId ? mine : theirs)),
      cards: {
        [playerId]: mine ? mine.id : null,
        [opponentId]: theirs ? theirs.id : null,
      },
      won,
      returnToHandOnWin: Boolean(effect.returnToHandOnWin),
      restorePriorityTo: state.turn.activePlayerId,
    };
    // Priorytet przechodzi na pierwszego wybierającego (jak scry/surveil) —
    // pętla symulacji pyta wtedy właściwego gracza; po decyzjach wraca.
    state.turn.priorityPlayerId = state.pendingClash.choices[0];
    // Zwracamy true — resolveTopOfStack wstrzymuje dalsze efekty czaru
    // (state.pendingSpell), a czar zostaje na stosie do zakończenia decyzji.
    return true;
  }
  if (effect.type === 'turn_face_up') {
    // CR 608.2b: źródło zniknęło z bitwiska (LKI stub) — nie ma czego obracać.
    const flipSource = state.objects.get(sourceObject.id);
    if (!flipSource || flipSource.zone !== 'battlefield' || !flipSource.faceDown) return;
    turnFaceUp(state, sourceObject.id, effect.counters ?? {});
    return;
  }
  if (effect.type === 'return_creature_card_to_hand') {
    // Grave Exchange (pierwszy cel): „Return target creature card from your
    // graveyard to your hand." Nielegalny/zniknięty cel (null) = brak efektu.
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    // CR 608.2b: karta mogła opuścić grób przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard' || object.kind !== 'creature') return;
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'hand', handId);
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'graveyard', toZone: 'hand' }));
    return;
  }
  if (effect.type === 'put_graveyard_card_on_bottom') {
    // Barkform Harvester: „{2}: Put target card from your graveyard on the
    // bottom of your library." Nowy obiekt w bibliotece na jej końcu (spód).
    const targetId = targets[0];
    if (targetId == null) return;
    // CR 608.2b: karta mogła opuścić grób przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard') return;
    const libId = `library-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'library', libId);
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'graveyard', toZone: 'library', toBottom: true }));
    return;
  }
  if (effect.type === 'put_graveyard_card_on_top') {
    // Batch 24 (Mystic Sanctuary): „put target instant or sorcery card from
    // your graveyard on top of your library". Na wierzch = przed pierwszą
    // WŁASNĄ kartą od wierzchu (biblioteka to wspólna lista obu graczy;
    // wzorzec graveyard_top_choice w game-state.js).
    const targetId = targets[0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard') return;
    const libId = `library-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'library', libId);
    const library = state.zones.library.filter((id) => id !== libId);
    const topIndex = library.findIndex((id) => state.objects.get(id)?.controllerId === moved.controllerId);
    if (topIndex === -1) library.unshift(libId);
    else library.splice(topIndex, 0, libId);
    state.zones.library = library;
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'graveyard', toZone: 'library', toTop: true }));
    return;
  }
  if (effect.type === 'buff_opponents_creatures') {
    // Hysterical Blindness / Turn the Tide: „Creatures your opponents control
    // get ±N/±0 until end of turn." Efekt CIĄGŁY do końca tury (CR 611.2c) —
    // obejmuje też stwory przeciwnika wchodzące później (poprzednio tylko
    // obecne w chwili rozstrzygnięcia — bug złotej odznaki).
    state.untilEndOfTurnBuffs = [
      ...(state.untilEndOfTurnBuffs ?? []),
      Object.freeze({
        controllerId: sourceObject.controllerId,
        opponent: true,
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
        keywords: Object.freeze([...(effect.keywords ?? [])]),
      }),
    ];
    return;
  }
  if (effect.type === 'start_engines') {
    // „Start your engines!" (DFT, Glitch Ghost Surveyor): jeśli gracz nie ma
    // speed, startuje od 1 (CR: speed jest cechą GRACZA, trwa po odejściu
    // źródła). Wzrost speed — patrz triggers.js (raz na turę przy obrażeniach
    // przeciwnika, max 4).
    const player = state.players.find((pl) => pl.id === sourceObject.controllerId);
    if (player && (player.speed ?? 0) < 1) {
      player.speed = 1;
      state.events.push(event('speed_changed', { playerId: player.id, speed: 1 }));
    }
    return;
  }
  if (effect.type === 'redirect_spell_target') {
    // Willbender (Batch 24): „When this creature is turned face up, change the
    // target of target spell or ability with a single target." Cel triggera
    // (targets[0]) to czar na stosie; efekt kolejkuje DECYZJĘ nowego celu
    // (pendingRedirectChoice) — kandydaci liczeni dynamicznie w bramce
    // execute (legalTargetCandidates specyfikacji czaru, minus obecny cel).
    // Ograniczenie: engine nie ma zdolności na stosie (rozstrzyga je
    // natychmiast), więc redirect dotyczy wyłącznie czarów — udokumentowane.
    const stackId = targets[0];
    const spell = state.objects.get(stackId);
    if (!spell || spell.zone !== 'stack') return;
    if (!Array.isArray(spell.chosenTargets) || spell.chosenTargets.length !== 1) return;
    const spec = (spell.spell?.targets ?? [])[0];
    if (!spec) return;
    state.pendingRedirectChoice = {
      playerId: sourceObject.controllerId,
      sourceId: sourceObject.id,
      sourceCardId: sourceObject.cardId ?? null,
      stackId,
      spellControllerId: spell.controllerId,
      spellCardId: spell.cardId ?? null,
      currentTargetId: spell.chosenTargets[0],
      spec,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('redirect_choice_required', {
      playerId: sourceObject.controllerId,
      stackId, cardId: spell.cardId ?? null,
      currentTargetId: spell.chosenTargets[0],
    }));
    return;
  }
  if (effect.type === 'damage_enchanted_player') {
    // Curse of the Pierced Heart: „this Aura deals 1 damage to that player
    // or a planeswalker that player controls." Engine nie ma planeswalkerów,
    // więc obrażenia zawsze trafiają zaczarowanego gracza. Wspólny pipeline
    // non-combat: prewencja (tarcze/filtr), event z kwotą zadaną, lifelink.
    const playerId = sourceObject.enchantedPlayerId;
    if (!playerId) return;
    dealNonCombatDamage(state, sourceObject, playerId, effect.amount ?? 0);
    return;
  }
  // Batch 23: Feedback — „At the beginning of the upkeep of enchanted
  // enchantment's controller, this Aura deals 1 damage to that player."
  // attachedTo wskazuje enchantment, jego kontroler to cel obrażeń.
  if (effect.type === 'damage_enchanted_permanent_controller') {
    const enchantedId = sourceObject.attachedTo;
    if (!enchantedId) return;
    const enchanted = state.objects.get(enchantedId);
    if (!enchanted || enchanted.zone !== 'battlefield') return;
    dealNonCombatDamage(state, sourceObject, enchanted.controllerId, effect.amount ?? 1);
    return;
  }
  // Batch 23: Scorch Spitter — „Whenever this creature attacks, it deals
  // 1 damage to the player or planeswalker it's attacking." W 1v1
  // obrażenia zawsze trafiają defendingPlayer (engine nie ma planeswalkerów).
  if (effect.type === 'damage_defending_player') {
    // W 1v1 obrażenia zawsze trafiają defendingPlayer (engine nie ma
    // planeswalkerów); fallback = przeciwnik kontrolera źródła.
    const defendingId = state.combat?.defendingPlayerId
      ?? state.players.find((pl) => pl.id !== sourceObject.controllerId)?.id;
    if (!defendingId) return;
    dealNonCombatDamage(state, sourceObject, defendingId, effect.amount ?? 1);
    return;
  }
  // Batch 23: Shiv's Embrace — "{R}: Enchanted creature gets +1/+0 until
  // end of turn." Aura na bitwisku pompuje swojego gospodarza (attachedTo).
  if (effect.type === 'pump_enchanted_creature') {
    const enchantedId = sourceObject.attachedTo;
    if (!enchantedId) return;
    const enchanted = state.objects.get(enchantedId);
    if (!enchanted || enchanted.zone !== 'battlefield' || enchanted.kind !== 'creature') return;
    modifyStats(state, enchantedId, { power: effect.power ?? 0, toughness: effect.toughness ?? 0 });
    if (effect.keywords?.length) grantKeywordsUntilEndOfTurn(state, enchantedId, effect.keywords);
    return;
  }
  if (effect.type === 'exile_opponent_creature') {
    // Fear of Abduction ETB: exile strongest opponent creature + link on source.
    const opponentId = state.players.find((pl) => pl.id !== sourceObject.controllerId)?.id;
    if (!opponentId) return;
    let best = null;
    for (const id of state.zones.battlefield) {
      const obj = state.objects.get(id);
      if (!obj || obj.zone !== 'battlefield' || obj.kind !== 'creature' || obj.controllerId !== opponentId) continue;
      const power = obj.power ?? 0;
      if (best === null || power > best.power) best = { id, power };
    }
    if (!best) return;
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, best.id, 'exile', exileId);
    const src = state.objects.get(sourceObject.id);
    if (src) state.objects.set(sourceObject.id, Object.freeze({ ...src, banishedIds: [...(src.banishedIds ?? []), exileId] }));
    state.events.push(event('object_exiled', { fromId: best.id, objectId: exileId, object: exiled, cardId: exiled.cardId, banished: true }));
    return;
  }
  if (effect.type === 'return_banished_to_hand') {
    // Fear of Abduction dies: return exiled cards to owners' hands.
    const src = state.objects.get(sourceObject.id);
    for (const exileId of src?.banishedIds ?? []) {
      const exiled = state.objects.get(exileId);
      if (!exiled || exiled.zone !== 'exile') continue;
      const handId = `hand-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, exileId, 'hand', handId);
      state.events.push(event('object_moved', { fromId: exileId, object: moved, fromZone: 'exile', toZone: 'hand', returnedFromBanish: true }));
    }
    return;
  }
  if (effect.type === 'opponent_hand_card_to_top') {
    // Chittering Rats: "target opponent puts a card from their hand on top
    // of their library." (Temat 4 — CR 701.18: kartę WYBIERA cel, nie engine.)
    // Blokująca decyzja resolve_hand_top_choice; sam ruch wykonuje komenda.
    const targetId = targets[0];
    if (!targetId || !state.players.some((pl) => pl.id === targetId)) return;
    const hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === targetId);
    if (hand.length === 0) return;
    state.pendingHandTopChoice = {
      playerId: targetId,
      handIds: hand,
      sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = targetId;
    state.events.push(event('hand_top_choice_required', {
      playerId: targetId, cardIds: [...hand], sourceCardId: sourceObject.cardId ?? null,
    }));
    return;
  }
  if (effect.type === 'cant_block') {
    // Panic Spellbomb: „Target creature can't block this turn.\" Tymczasowy
    // znacznik na obiekcie — zdejmowany w cleanup razem z innymi grantami.
    const targetId = targets[0];
    if (!targetId) return;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    state.objects.set(targetId, Object.freeze({ ...object, cantBlock: true }));
    state.events.push(event('cant_block_granted', { objectId: targetId, cardId: object.cardId }));
    return;
  }
  if (effect.type === 'cant_be_blocked') {
    // Coralhelm Guide: "Target creature can't be blocked this turn."
    const targetId = targets[0];
    if (!targetId) return;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    state.objects.set(targetId, Object.freeze({ ...object, cantBeBlocked: true }));
    state.events.push(event('cant_be_blocked_granted', { objectId: targetId, cardId: object.cardId }));
    return;
  }
  if (effect.type === 'cant_be_regenerated_this_turn') {
    // Rage of Purphoros (THS): „It can't be regenerated this turn." Flaga
    // trwała do końca tury ustawiana na celu — tryRegenerate w state-based.js
    // (SBA) i destroy_permanent w effects.js sprawdzają listę
    // state.cantBeRegeneratedThisTurn, żeby regeneracja tego obiektu
    // nie zadziałała (nawet jeśli obiekt ma aktywną tarczę regeneracji
    // z innego źródła — planeswalker, druga karta, itd.). Czyszczona
    // w cleanup razem z regenerationShields (oba trwają do końca tury).
    const targetId = targets[0];
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    if (!(state.cantBeRegeneratedThisTurn ?? []).includes(targetId)) {
      state.cantBeRegeneratedThisTurn = [
        ...(state.cantBeRegeneratedThisTurn ?? []),
        targetId,
      ];
    }
    state.events.push(event('cant_be_regenerated_set', {
      objectId: targetId, cardId: object.cardId, untilEndOfTurn: true,
    }));
    return;
  }
  if (effect.type === 'sacrifice_food_choice') {
    // Insatiable Appetite: „You may sacrifice a Food. If you do, +5/+5.
    // Otherwise, +3/+3.\" Blokująca decyzja — jak scry/surveil: czar
    // wstrzymuje rozstrzyganie do resolve_food_choice.
    const controllerId = sourceObject.controllerId;
    const foodCandidates = state.zones.battlefield.filter((id) => {
      const object = state.objects.get(id);
      return object?.controllerId === controllerId && object.zone === 'battlefield'
        && (object.subtypes ?? []).includes('Food');
    });
    if (foodCandidates.length === 0) {
      // Brak Food — automatycznie „Otherwise\": +3/+3 na celu.
      const creatureId = targets[0];
      if (creatureId) {
        const creatureObj = state.objects.get(creatureId);
        if (creatureObj && creatureObj.zone === 'battlefield' && creatureObj.kind === 'creature') {
          modifyStats(state, creatureId, { power: 3, toughness: 3 });
        }
      }
      state.events.push(event('food_choice_resolved', { playerId: controllerId, sacrificed: false, auto: true }));
      return; // Nie blokuje — brak decyzji.
    }
    state.pendingFoodChoice = { playerId: controllerId, creatureId: targets[0], hasFood: true, foodIds: foodCandidates, restorePriorityTo: state.turn.priorityPlayerId };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('food_choice_required', { playerId: controllerId, creatureId: targets[0] }));
    return true;
  }
  if (effect.type === 'pump_food_result') {
    // Efekt po resolve_food_choice: +5/+5 jeśli poświęcono Food, +3/+3 wpp.
    const targetId = targets[0];
    if (!targetId) return;
    // CR 608.2b: cel zniknął z bitwiska przed rozstrzygnięciem — brak efektu.
    const foodTarget = state.objects.get(targetId);
    if (!foodTarget || foodTarget.zone !== 'battlefield' || foodTarget.kind !== 'creature') return;
    const amount = effect.sacrificed ? 5 : 3;
    modifyStats(state, targetId, { power: amount, toughness: amount });
    return;
  }
  if (effect.type === 'counter_spell') {
    // Negate: „Counter target noncreature spell." Cel — czar na stosie;
    // przeniesiony do grobu bez rozstrzygania. Nielegalny/zniknięty cel
    // (null albo już rozstrzygnięty) = brak efektu (CR 608.2b).
    const targetId = targets[0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'stack') return;
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'graveyard', graveId);
    state.events.push(event('spell_countered', {
      fromId: targetId, toId: graveId, cardId: moved.cardId,
      controllerId: moved.controllerId, counteredBy: sourceObject.id,
    }));
    return;
  }
  if (effect.type === 'player_sacrifices_creature') {
    // Grave Exchange (drugi cel): „Target player sacrifices a creature of
    // their choice." Wybór należy do CELU (blokująca decyzja resolve_sacrifice_choice,
    // jak scry/surveil). Gracz bez stworów nie poświęca niczego.
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    if (!state.players.some((player) => player.id === targetId)) throw new Error('Nieprawidłowy cel: gracz');
    const candidates = state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object?.kind === 'creature' && object.zone === 'battlefield' && object.controllerId === targetId;
    });
    if (candidates.length === 0) return;
    state.pendingSacrifice = {
      playerId: targetId,
      candidateIds: [...candidates],
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = targetId;
    state.events.push(event('sacrifice_choice_required', { playerId: targetId, candidates: [...candidates] }));
    // Blokująca decyzja — rozstrzyganie czaru czeka (state.pendingSpell).
    return true;
  }
  if (effect.type === 'graveyard_creatures_to_library_top_choice') {
    // Forever Young: „Put any number of target creature cards from your
    // graveyard on top of your library." Sekwencyjna, blokująca decyzja
    // kontrolera źródła (resolve_graveyard_top_choice — po jednej karcie na
    // krok albo zakończenie; ostatni wybór ląduje najwyżej). Gracz bez
    // kart-stworów w grobie nie podejmuje decyzji — „any number" to także
    // zero — czar rozstrzyga się dalej bez wstrzymania.
    const ownerId = sourceObject.controllerId;
    const candidates = state.zones.graveyard.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.controllerId === ownerId && object.kind === 'creature' && object.name == null;
    });
    if (candidates.length === 0) return;
    state.pendingGraveyardToTop = {
      playerId: ownerId,
      candidateIds: [...candidates],
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = ownerId;
    state.events.push(event('graveyard_top_choice_required', { playerId: ownerId, candidateIds: [...candidates] }));
    // Blokująca decyzja — rozstrzyganie czaru czeka (state.pendingSpell,
    // pozostałe efekty dokończy resolve_graveyard_top_choice{done:true}).
    return true;
  }
  if (effect.type === 'discover') {
    // Discover X (Geological Appraiser, CR 701.53): odsłoń karty z wierzchu
    // biblioteki, aż odsłonisz nie-land z mana value ≤ X. Możesz rzucić ją
    // bez kosztu many albo wziąć do ręki. Reszta trafia na spód w losowej
    // kolejności. Blokująca decyzja jak scry/surveil.
    const x = effect.amount ?? 3;
    const ownerId = sourceObject.controllerId;
    const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId);
    let foundId = null;
    const exiled = [];
    for (const id of ownLibrary) {
      const card = state.objects.get(id);
      if (!card) continue;
      exiled.push(id);
      const isLand = (card.types ?? []).includes('Land') || card.kind === 'land';
      const mv = card.manaCost ?? 0;
      if (!isLand && mv <= x) {
        foundId = id;
        break;
      }
    }
    // Przenieś odsłonięte karty do exile.
    const exileIds = [];
    for (const id of exiled) {
      const exileId = `exile-${state.objectSequence++}`;
      moveObjectDirectly(state, id, 'exile', exileId);
      exileIds.push(exileId);
      state.events.push(event('card_revealed', { playerId: ownerId, objectId: exileId, cardId: state.objects.get(exileId)?.cardId }));
    }
    if (!foundId) {
      // Nie znaleziono karty — karty wracają na spód biblioteki.
      shuffleAndPlaceOnBottom(state, ownerId, exileIds);
      state.events.push(event('discover_resolved', { playerId: ownerId, amount: x, found: false }));
      return;
    }
    // Blokująca decyzja: rzuć bez kosztu albo weź do ręki.
    const foundExileId = exileIds[exiled.indexOf(foundId)];
    const restExileIds = exileIds.filter((eid) => eid !== foundExileId);
    state.pendingDiscover = {
      playerId: ownerId,
      foundExileId,
      foundCardId: state.objects.get(foundExileId)?.cardId,
      restExileIds,
      restorePriorityTo: state.turn.priorityPlayerId,
      amount: x,
    };
    state.turn.priorityPlayerId = ownerId;
    state.events.push(event('discover_started', { playerId: ownerId, amount: x, foundCardId: state.objects.get(foundExileId)?.cardId }));
    return true;
  }
  if (effect.type === 'explore') {
    // Explore (Lodestone Needle back — Guidestone Compass, CR 701.54):
    // odsłoń wierzchnią kartę biblioteki. Jeśli to land — do ręki. Wpp
    // połóż licznik +1/+1 na docelowym stworze, potem odłóż kartę na wierzch
    // albo do grobu. Blokująca decyzja (jak scry).
    const ownerId = sourceObject.controllerId;
    const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === ownerId);
    if (!topId) {
      state.events.push(event('explore_resolved', { playerId: ownerId, found: false }));
      return;
    }
    const topCard = state.objects.get(topId);
    const isLand = (topCard.types ?? []).includes('Land') || topCard.kind === 'land';
    state.events.push(event('card_revealed', { playerId: ownerId, objectId: topId, cardId: topCard.cardId, explore: true }));
    if (isLand) {
      // Land do ręki.
      const handId = `hand-${state.objectSequence++}`;
      moveObjectDirectly(state, topId, 'hand', handId);
      state.events.push(event('explore_resolved', { playerId: ownerId, foundCardId: topCard.cardId, isLand: true }));
      return;
    }
    // Nie-land: +1/+1 na docelowym stworze (cel z targets[0]).
    const creatureId = targets[0];
    if (creatureId) {
      addCounter(state, creatureId, '+1/+1', 1);
    }
    // Blokująca decyzja: wierzch albo grób.
    state.pendingExplore = {
      playerId: ownerId,
      objectId: topId,
      cardId: topCard.cardId,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = ownerId;
    state.events.push(event('explore_choice_required', { playerId: ownerId, cardId: topCard.cardId }));
    return true;
  }
  if (effect.type === 'put_multicolored_creature_from_hand') {
    // Dragon Arch: „You may put a multicolored creature card from your hand onto
    // the battlefield." Blokująca decyzja: gracz wybiera wielokolorowego stwora
    // z ręki do położenia (albo żadnego — „you may"). Brak kandydata = nic.
    const controllerId = sourceObject.controllerId;
    const candidates = state.zones.hand.filter((id) => {
      const card = state.objects.get(id);
      return card?.controllerId === controllerId && card.zone === 'hand' && card.kind === 'creature'
        && (card.colors ?? []).length >= 2;
    });
    if (candidates.length === 0) {
      state.events.push(event('hand_creature_choice_resolved', { playerId: controllerId, putCreature: false, auto: true }));
      return;
    }
    state.pendingHandCreature = {
      playerId: controllerId,
      candidateIds: [...candidates],
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('hand_creature_choice_required', { playerId: controllerId, candidates: [...candidates] }));
    return true;
  }
  if (effect.type === 'craft_transform') {
    // Craft (Lodestone Needle): exile this artifact + exile another artifact
    // you control or artifact card from your graveyard → return transformed.
    // Blokująca decyzja: wybór artefaktu do wygnania (jak resolve_sacrifice_choice).
    const target = sourceObject.transformTo;
    if (!target) throw new Error('Ta karta nie ma drugiej strony (craft)');
    // Find valid exile targets: artifacts you control on battlefield (not self)
    // + artifact cards in your graveyard.
    const controllerId = sourceObject.controllerId;
    const candidates = [];
    for (const id of state.zones.battlefield) {
      const obj = state.objects.get(id);
      if (obj && obj.id !== sourceObject.id && obj.controllerId === controllerId
        && (obj.kind === 'artifact' || (obj.types ?? []).includes('Artifact'))) {
        candidates.push(id);
      }
    }
    for (const id of state.zones.graveyard) {
      const obj = state.objects.get(id);
      if (obj && obj.controllerId === controllerId
        && (obj.kind === 'artifact' || (obj.types ?? []).includes('Artifact'))) {
        candidates.push(id);
      }
    }
    if (candidates.length === 0) throw new Error('Brak artefaktu do wygnania (craft)');
    // Queue blocking choice for which artifact to exile.
    state.pendingCraftExile = {
      playerId: controllerId,
      sourceId: sourceObject.id,
      candidateIds: candidates,
      transformTo: target,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('craft_exile_required', { playerId: controllerId, sourceId: sourceObject.id, candidates: [...candidates] }));
    return true;
  }
  if (effect.type === 'bounce_permanent') {
    // „Return target permanent to its owner's hand" (Jill, Shiva's Dominant,
    // Lunar Rejection). CR 108.3/400.7: obiekt wraca na rękę WŁAŚCICIELA
    // (ownerId — śledzone od Trostani), nie dotychczasowego kontrolera;
    // karta w ręce właściciela jest przez niego kontrolowana. Poprzednio
    // stwór przejęty przez Puppeteer Clique wracał na rękę złodzieja.
    const targetId = targets[0];
    if (targetId == null) return; // „up to one" bez celu — brak efektu
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return; // cel zniknął (CR 608.2b)
    const ownerId = object.ownerId ?? object.controllerId;
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'hand', handId);
    const inOwnersHand = Object.freeze({ ...moved, controllerId: ownerId });
    state.objects.set(handId, inOwnersHand);
    state.events.push(event('object_moved', {
      fromId: targetId, object: inOwnersHand, fromZone: 'battlefield', toZone: 'hand',
      bounced: true, toOwner: true,
    }));
    return;
  }
  if (effect.type === 'exile_return_transformed') {
    // „Exile this permanent, then return it to the battlefield transformed\"
    // (Jill → Shiva; Saga III Shivy: powrót STRONĄ PRZEDNIA — ta sama
    // mechanika: deskryptor transformTo wskazuje zawsze „inną\" stronę).
    // Nowy obiekt (CR 400.7): liczniki i modyfikacje nie przechodzą, wchodzi
    // z summoning sickness jak każdy permanent wchodzący na bitwisko.
    const target = sourceObject.transformTo;
    if (!target) return;
    const object = state.objects.get(sourceObject.id);
    // Źródło zdążyło opuścić bitwisko (np. rozdział Sagi po zniszczeniu) —
    // efekt nie ma czego przemieniać (CR 608.2b), bez błędu.
    if (!object || object.zone !== 'battlefield') return;
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, object.id, 'exile', exileId);
    state.events.push(event('object_moved', {
      fromId: object.id, object: exiled, fromZone: 'battlefield', toZone: 'exile', transformReturn: true,
    }));
    const bfId = `permanent-${state.objectSequence++}`;
    // Strona, z której pochodzimy, trafia do transformTo nowego obiektu
    // (obiekt może flickerować w obie strony wielokrotnie).
    const frontFace = {
      cardId: object.cardId,
      cardName: object.cardName,
      power: object.power,
      toughness: object.toughness,
      abilities: object.abilities,
      keywords: object.keywords ?? [],
      subtypes: object.subtypes ?? [],
      types: object.types ?? [],
      manaCost: object.manaCost ?? 0,
      ...(object.saga ? { saga: object.saga } : {}),
    };
    const transformed = Object.freeze({
      ...exiled,
      id: bfId, zone: 'battlefield', summoningSickness: true,
      cardId: target.cardId,
      cardName: target.cardName ?? exiled.cardName,
      power: target.power,
      toughness: target.toughness,
      abilities: target.abilities,
      keywords: target.keywords ?? [],
      subtypes: target.subtypes ?? [],
      types: target.types ?? exiled.types ?? [],
      manaCost: target.manaCost ?? exiled.manaCost ?? 0,
      // Saga drugiej strony (Shiva) wchodzi z pustymi licznikami lore —
      // ETB zdarzenie niżej odpali rozdział I przez generyczny kod Sagi.
      saga: target.saga ?? null,
      transformTo: frontFace,
    });
    state.objects.delete(exileId);
    state.objects.set(bfId, transformed);
    state.zones.exile = state.zones.exile.filter((id) => id !== exileId);
    state.zones.battlefield.push(bfId);
    state.events.push(event('object_moved', {
      fromId: exileId, object: transformed, fromZone: 'exile', toZone: 'battlefield', transformReturn: true,
    }));
    const transformedEvent = event('object_transformed', { objectId: bfId, fromCardId: object.cardId, cardId: target.cardId });
    state.events.push(transformedEvent);
    return;
  }
  if (effect.type === 'prevent_damage_this_turn') {
    // „Prevent all damage that would be dealt to artifact creatures this
    // turn\" (Ethersworn Shieldmage, CR 614 w minimalnym wymiarze): filtr
    // celu jest generyczny ({ typesInclude, isCreature }); obowiązuje do
    // cleanup (game-state zeruje state.preventDamageThisTurn). Dotyczy
    // stworów OBU graczy spełniających filtr — jak w tekście karty.
    const filter = Object.freeze({
      typesInclude: Object.freeze([...(effect.typesInclude ?? [])]),
      isCreature: Boolean(effect.isCreature),
    });
    state.preventDamageThisTurn = [...(state.preventDamageThisTurn ?? []), filter];
    state.events.push(event('damage_prevention_started', {
      sourceId: sourceObject.id, cardId: sourceObject.cardId, filter,
    }));
    return;
  }
  if (effect.type === 'prevent_next_damage') {
    // Tarcza prewencji „Prevent the next N damage that would be dealt to any
    // target this turn" (Withstand, CR 615 w minimalnym wymiarze): cel to
    // gracz albo obiekt (targets[0]); każda kolejna próba zadania obrażeń
    // celowi zużywa tarczę (preventDamageTo), a czyści ją cleanup.
    const targetId = targets[0];
    if (!targetId) return;
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Tarcza prewencji wymaga dodatniej liczby obrażeń');
    const shield = {
      targetId, remaining: effect.amount,
      sourceCardId: sourceObject.cardId ?? null,
    };
    state.damageShields = [...(state.damageShields ?? []), shield];
    state.events.push(event('damage_shield_created', {
      sourceId: sourceObject.id, cardId: sourceObject.cardId,
      target: targetId, remaining: effect.amount,
    }));
    return;
  }
  if (effect.type === 'animate_linked') {
    // Animacja z linkiem do źródła (Skilled Animator: „target artifact you
    // control becomes an artifact creature with base power and toughness 5/5
    // FOR AS LONG AS this creature remains on the battlefield"). Obiekt jest
    // mutowany jak przy animacji do końca tury, ale wpis ląduje w
    // state.linkedAnimations — przy odejściu źródła z bitwiska (objects.js)
    // animacja jest COFANA (root cause: trwałość efektu wiąże się ze strefą
    // źródła, nie z końcem tury).
    const targetId = targets[0];
    if (!targetId) return;
    const target = state.objects.get(targetId);
    if (!target || target.zone !== 'battlefield') return;
    const original = target.originalBeforeAnimation || {
      kind: target.kind,
      types: [...(target.types ?? [])],
      subtypes: [...(target.subtypes ?? [])],
      power: target.power,
      toughness: target.toughness,
    };
    const typesAdd = effect.typesAdd ?? ['Artifact', 'Creature'];
    const types = [...new Set([...(target.types ?? []), ...typesAdd])];
    const subtypes = [...new Set([...(target.subtypes ?? []), ...(effect.subtypesAdd ?? [])])];
    const updated = replaceObject(state, target, {
      kind: types.includes('Creature') ? 'creature' : target.kind,
      types, subtypes,
      power: effect.power ?? 0, toughness: effect.toughness ?? 0,
      originalBeforeAnimation: original,
    });
    state.linkedAnimations = [
      ...(state.linkedAnimations ?? []).filter((entry) => entry.targetId !== targetId),
      { sourceId: sourceObject.id, targetId },
    ];
    state.events.push(event('permanent_animated', {
      objectId: targetId, cardId: target.cardId,
      power: effect.power ?? 0, toughness: effect.toughness ?? 0,
      types, subtypes, linkedTo: sourceObject.id,
    }));
    return updated;
  }
  if (effect.type === 'transfer_counters_on_dies') {
    // „When this creature dies, put X +1/+1 counters on target creature you
    // control, where X is the number of +1/+1 counters on this creature"
    // (Servant of the Scale). Licznik z ostatniej znanej informacji (LKI —
    // formerCounters, CR 603.10); cel to targets[0] (trigger requiresTarget).
    const counterName = effect.counter ?? '+1/+1';
    const amount = (sourceObject.formerCounters ?? {})[counterName] ?? 0;
    const targetId = targets[0];
    if (amount > 0 && targetId) addCounter(state, targetId, counterName, amount);
    return;
  }
  if (effect.type === 'put_graveyard_card_onto_battlefield') {
    // „Whenever a Lhurgoyf permanent card is put into your graveyard from
    // anywhere other than the battlefield, put it onto the battlefield"
    // (Disa the Restless): karta ze zdarzenia (context.graveyardCardId) —
    // trigger skanuje wejścia do grobu i podaje konkretną kartę.
    const cardId = context?.graveyardCardId;
    if (!cardId) return;
    const card = state.objects.get(cardId);
    if (!card || card.zone !== 'graveyard') return;
    if (card.kind === 'land' || card.kind === 'spell') return;
    const bfId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, cardId, 'battlefield', bfId);
    state.events.push(event('permanent_entered_battlefield', {
      objectId: bfId, object: moved, cardId: moved.cardId,
      controllerId: moved.controllerId, fromGraveyard: true,
    }));
    return;
  }
  if (effect.type === 'sacrifice_each_other_creature') {
    // „Sacrifice each other creature you control\" (Plague Reaver, end-step
    // trigger): wszystkie inne stwory kontrolera źródła trafiają do grobu.
    // Pętla po kopii listy — każde poświęcenie to zmiana strefy (CR 400.7).
    const controllerId = sourceObject.controllerId;
    const victims = [...state.zones.battlefield].filter((objectId) => {
      const candidate = state.objects.get(objectId);
      return candidate && candidate.id !== sourceObject.id
        && candidate.controllerId === controllerId && candidate.kind === 'creature';
    });
    for (const victimId of victims) {
      const victim = state.objects.get(victimId);
      const toZone = (victim?.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
      const destId = `${toZone}-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, victimId, toZone, destId);
      state.events.push(event('permanent_sacrificed', {
        fromId: victimId, objectId: destId, playerId: controllerId, cardId: moved.cardId, toZone,
      }));
    }
    return;
  }
  if (effect.type === 'return_to_battlefield_under_control_at_upkeep') {
    // Plague Reaver: „Return this creature to the battlefield under that
    // player's control at the beginning of their next upkeep.\" Opóźniony
    // trigger (CR 603.7): wpis wskazuje obiekt ŹRÓDŁA W GROBIE (zdolność
    // kosztuje sacrifice — abilities.js przekazuje obiekt z grobu) i gracza-
    // cel; rozstrzyga go blok upkeep w triggers.js. „Next upkeep\" — gdy cel
    // aktywowałby we WŁASNEJ turze, najbliższy upkeep się nie liczy (wpis
    // armedAt to odnotowuje).
    const targetPlayerId = targets[0];
    if (!targetPlayerId || !state.players.some((player) => player.id === targetPlayerId)) {
      throw new Error('Powrót pod kontrolę wymaga celu-gracza');
    }
    state.delayedTriggers.push({
      type: 'reanimate_under_target_control',
      objectId: sourceObject.id,
      playerId: targetPlayerId,
      armedAt: { turn: state.turn.number, active: state.turn.activePlayerId },
      cardId: sourceObject.cardId,
    });
    state.events.push(event('delayed_trigger_armed', {
      objectId: sourceObject.id, cardId: sourceObject.cardId,
      playerId: targetPlayerId, atNextUpkeep: true,
    }));
    return;
  }
  if (effect.type === 'tap_all_lands_opponents_control') {
    // „Tap all lands your opponents control\" (Saga III Shivy — Cold Snap):
    // każdy land (kind land albo typ Land, także land creature) kontrolowany
    // przez każdego przeciwnika kontrolera źródła zostaje zatapnięty.
    const controllerId = sourceObject.controllerId;
    let tappedCount = 0;
    for (const objectId of [...state.zones.battlefield]) {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId === controllerId || object.tapped) continue;
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      if (!isLand) continue;
      state.objects.set(objectId, Object.freeze({ ...object, tapped: true }));
      state.events.push(event('object_tapped', { objectId, playerId: controllerId }));
      tappedCount += 1;
    }
    state.events.push(event('opponents_lands_tapped', { playerId: controllerId, count: tappedCount }));
    return;
  }
  if (effect.type === 'station_counters') {
    // Station (Wedgelight Rammer): „Tap another creature you control: Put
    // charge counters equal to its power on this Spacecraft.\" Zatapnięty
    // w koszcie stwór przychodzi jako targets[0] (abilities.js tapOtherCreature).
    const tappedId = targets[0];
    const tapped = state.objects.get(tappedId);
    if (!tapped) throw new Error('Station wymaga stwora zatapniętego w koszcie');
    // Moc 0 (np. Apprentice Wizard) = zero liczników — zdolność rozstrzyga
    // się normalnie, koszt tap już zapłacony (CR 107.1c, 608.2b).
    const amount = Math.max(0, effectivePower(tapped, state) ?? 0);
    if (amount > 0) addCounter(state, sourceObject.id, effect.counter ?? 'charge', amount);
    return;
  }
  if (effect.type === 'proliferate') {
    // Proliferate (CR 701.27, Courage in Crisis): „choose any number of
    // permanents and/or players" — DECYZJA gracza. Bez oczekującej decyzji
    // kolejkujemy pendingProliferate (kandydaci: permanenty z licznikami +
    // gracze z poison > 0) i zwracamy true — rozstrzyganie czaru/triggera
    // czeka na resolve_proliferate (jak scry/surveil). Poprzednio nic nie
    // kolejkowało decyzji — efekt cicho proliferował cele czaru (gracz nie
    // wybierał, „any number" sprowadzone do wymuszonego jednego celu).
    if (!state.pendingProliferate) {
      const candidates = [];
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield') continue;
        if (Object.values(object.counters ?? {}).some((count) => count > 0)) candidates.push(object.id);
      }
      for (const player of state.players) {
        // CR 701.27a: gracze z licznikami też są celami proliferate — trucizna
        // mieszka w player.poison (addPoisonCounters/SBA), nie player.counters.
        if ((player.poison ?? 0) > 0) candidates.push(player.id);
      }
      if (candidates.length === 0) return false;
      state.pendingProliferate = {
        playerId: sourceObject.controllerId,
        sourceId: sourceObject.id,
        sourceCardId: sourceObject.cardId ?? null,
        candidateIds: candidates,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = sourceObject.controllerId;
      state.events.push(event('proliferate_started', {
        playerId: sourceObject.controllerId,
        sourceId: sourceObject.id,
        candidateCount: candidates.length,
      }));
      return true;
    }
    // Dla każdego wybranego obiektu/gracza dolicz po 1 do każdego typu
    // licznika, który ma wartość > 0. Gracz: poison (jedyny licznik gracza
    // w naszym engine). Obiekt: wszystkie liczniki dodatnie w
    // `object.counters`. Emitujemy `counter_added` per (target, counter).
    let proliferated = 0;
    for (const targetId of targets) {
      const player = state.players.find((p) => p.id === targetId);
      if (player) {
        // CR 701.27a: +1 licznik trucizny na graczu — pole player.poison
        // (poprzednio +1 szło do nigdzie nieczytanego player.counters.poison).
        if ((player.poison ?? 0) > 0) {
          player.poison += 1;
          state.events.push(event('counter_added', {
            objectId: player.id, cardId: null, counter: 'poison', amount: 1,
            fromProliferate: true,
          }));
          proliferated += 1;
        }
        continue;
      }
      const obj = state.objects.get(targetId);
      if (!obj || obj.zone !== 'battlefield') continue;
      const counters = obj.counters ?? {};
      const updated = { ...counters };
      for (const [name, count] of Object.entries(counters)) {
        if (count > 0) {
          updated[name] = count + 1;
          state.events.push(event('counter_added', {
            objectId: obj.id, cardId: obj.cardId, counter: name, amount: 1,
            fromProliferate: true,
          }));
          proliferated += 1;
        }
      }
      // Re-inkarnacja obiektu (frozen, więc nie mutujemy `counters` wprost;
      // zamrażanie jest wymagane przez inwarianty, by LKI było niezmienne).
      if (proliferated > 0 || Object.keys(updated).length > 0) {
        state.objects.set(obj.id, Object.freeze({ ...obj, counters: updated }));
      }
    }
    state.events.push(event('proliferated', { source: sourceObject.id, count: proliferated }));
    return;
  }
  if (effect.type === 'reveal_top_to_bottom_order') {
    // Stomping Slabs (MOR): reveal top N kart → gracz układa je na
    // spodzie biblioteki w dowolnej kolejności. `targets` = wybrana
    // kolejność (bottomOrder) z `pendingRevealOrder` (analogicznie
    // do resolve_scry / resolve_surveil).
    if (!state.pendingRevealOrder) {
      // Kolejkujemy decyzję: reveal top N (wierzch = początek biblioteki,
      // CR 401.4 — patrz draw/mill) + zdarzenia card_revealed; właściwy
      // reorder wykona komenda resolve_reveal_order (game-state). Poprzednio
      // nic nie kolejkowało pendingRevealOrder — czar był kompletnym no-op
      // (Stomping Slabs nic nie robił po rzuceniu; test batch22 budował
      // pending ręcznie, „peek").
      const ownerId = sourceObject.controllerId;
      const amount = Math.max(0, effect.amount ?? 0);
      const topN = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId).slice(0, amount);
      if (topN.length === 0) return false;
      for (const id of topN) {
        const o = state.objects.get(id);
        state.events.push(event('card_revealed', { playerId: ownerId, objectId: id, cardId: o?.cardId ?? null, revealTop: true }));
      }
      state.pendingRevealOrder = {
        playerId: ownerId,
        sourceId: sourceObject.id,
        sourceCardId: sourceObject.cardId ?? null,
        cardIds: topN,
        amount,
        restorePriorityTo: state.turn.priorityPlayerId,
        effect,
      };
      state.turn.priorityPlayerId = ownerId;
      state.events.push(event('reveal_started', {
        playerId: ownerId, amount: topN.length,
        cardIds: topN.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
      }));
      return true;
    }
    const pending = state.pendingRevealOrder;
    const order = targets.length === pending.cardIds.length
      ? targets : pending.cardIds;
    // Sprawdź poprawność: order musi być permutacją revealed.
    const orderSet = new Set(order);
    const expectedSet = new Set(pending.cardIds);
    if (orderSet.size !== expectedSet.size || !pending.cardIds.every((id) => orderSet.has(id))) {
      throw new Error('resolve_reveal_order: kolejność musi być permutacją revealed');
    }
    // Przenieś odsłonięte karty z WIERZCHU biblioteki na SPÓD w wybranej
    // kolejności. UWAGA: state.zones.library to WSPÓLNA lista obu graczy —
    // wyjmujemy wyłącznie id z pending.cardIds (karty właściciela), nie
    // pierwsze `amount` pozycji tablicy (tam mogą siedzieć karty przeciwnika
    // — splice(0, N) psuł cudzą bibliotekę, inwariant stref). Dopisujemy
    // `order` na końcu (order[0] tuż nad resztą, order[last] na samym
    // spodzie — „in any order").
    const amount = pending.cardIds.length;
    const removed = state.zones.library.filter((id) => pending.cardIds.includes(id));
    state.zones.library = state.zones.library.filter((id) => !pending.cardIds.includes(id));
    for (const id of order) {
      if (removed.includes(id)) state.zones.library.push(id);
    }
    // Warunek if_named_in_revealed: czy w revealed jest karta o danej nazwie?
    // Nazwa karty to `cardName` (prawo legend CR 704.5j — pole niosą obiekty
    // z talii); `name` mają tylko tokeny. Poprzednio sprawdzano `obj.name` —
    // warunek nigdy nie zachodził dla prawdziwych kart.
    if (effect.namedCard) {
      const found = pending.cardIds.some((id) => {
        const obj = state.objects.get(id);
        return obj && (obj.cardName === effect.namedCard || obj.name === effect.namedCard);
      });
      if (found && effect.thenDamage != null) {
        // Drugi efekt czaru: zadaj obrażenia dowolnemu celu (damage z
        // requiresTarget 'any_target'). Kolejkujemy decyzję gracza
        // (resolve_damage_target) — boty deterministycznie biorą
        // pierwszą ofertę (prefer: opponent).
        // Inline enumeracja „any target" — unikamy importu
        // legalTargetCandidates z spells.js (cykl: spells.js →
        // effects.js → spells.js). Wzorzec identyczny jak w
        // spells.js legalTargetCandidates (CR 601.2c): gracze +
        // stwory na bitwisku (z wyłączeniem źródła). Hexproof
        // celu nie blokuje efektu bezcelowego (Stomping Slabs
        // zadaje 7 dmg, nie jest celowany; czar jest „any target"
        // w rozstrzygnięciu, nie w trakcie wyboru).
        const players = state.players.map((p) => p.id);
        const creatures = state.zones.battlefield.filter((oid) => {
          const o = state.objects.get(oid);
          return o?.kind === 'creature' && o.zone === 'battlefield';
        });
        const anyTargetCandidates = [...players, ...creatures];
        if (anyTargetCandidates.length > 0) {
          state.pendingDamageTarget = {
            playerId: sourceObject.controllerId,
            sourceId: sourceObject.id,
            cardId: sourceObject.cardId,
            amount: effect.thenDamage,
            candidateIds: anyTargetCandidates,
            fromNamedRevealed: effect.namedCard,
            restorePriorityTo: state.turn.priorityPlayerId,
          };
          state.turn.priorityPlayerId = sourceObject.controllerId;
          state.events.push(event('damage_target_required', {
            playerId: sourceObject.controllerId, amount: effect.thenDamage,
            fromRevealed: effect.namedCard,
          }));
        }
      }
    }
    state.pendingRevealOrder = null;
    return;
  }
  if (effect.type === 'mill_from_bottom') {
    // Cellar Door (ISD): cel-gracz kładzie DOLNĄ kartę biblioteki
    // do grobu. Jeśli to creature — create_token Zombie 2/2 (efekt
    // warunkowy, podany w `effect.if_creature_create_token`).
    const playerId = targets[0];
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;
    const amount = effect.amount ?? 1;
    const milledIds = [];
    for (let i = 0; i < amount && state.zones.library.length > 0; i++) {
      // Biblioteka to WSPÓLNA lista obu graczy ([0]=wierzch); „spód własnej
      // biblioteki" = ostatnia WŁASNA karta gracza-celu (CR 401.4), NIE ostatni
      // element wspólnej listy. Poprzednio brano library[last] — po scry/
      // mulligan-bottom gracza P1 ostatni element należał do P1 i Cellar Door
      // celujący w P2 młynował kartę P1 (i tworzył Zombie z NIE tej karty).
      let bottomId = null;
      for (let idx = state.zones.library.length - 1; idx >= 0; idx -= 1) {
        const candidateId = state.zones.library[idx];
        if (state.objects.get(candidateId)?.controllerId === playerId) {
          bottomId = candidateId;
          break;
        }
      }
      if (bottomId === null) break; // gracz-cel nie ma już kart w bibliotece
      const obj = state.objects.get(bottomId);
      if (!obj) {
        state.zones.library = state.zones.library.filter((id) => id !== bottomId);
        continue;
      }
      state.zones.library = state.zones.library.filter((id) => id !== bottomId);
      const graveId = `grave-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, bottomId, 'graveyard', graveId);
      milledIds.push(moved.id);
      state.events.push(event('object_moved', {
        fromId: bottomId, object: moved, fromZone: 'library', toZone: 'graveyard',
        fromBottom: true,
      }));
      // Warunek: jeśli karta to creature — create_token Zombie przez
      // createBattlefieldToken (wypełnia instanceId, ownerId, ETB,
      // summoning sickness standardowo — tu Cellar Door z undead servant
      // dzielą profil tokena).
      if (effect.if_creature_create_token
        && (moved.kind === 'creature' || (moved.types ?? []).includes('Creature'))) {
        const tok = effect.if_creature_create_token;
        createBattlefieldToken(state, sourceObject.controllerId, {
          cardId: tok.cardId, name: tok.name,
          kind: tok.kind ?? 'creature', power: tok.power, toughness: tok.toughness,
          colors: tok.colors ?? [], types: tok.types ?? ['Creature'],
          subtypes: tok.subtypes ?? [], keywords: tok.keywords ?? [],
        });
      }
    }
    state.events.push(event('cards_milled', {
      playerId, amount: milledIds.length, fromBottom: true, ids: milledIds,
    }));
    return;
  }
  if (effect.type === 'return_exiled_to_battlefield') {
    // Wormfang Newt: powrót wygnanej karty (LKI) na battlefield
    // pod kontrolą właściciela. `exiledCardId` to id karty, którą
    // Newt wygnal przy ETB. Kolejność szukania ID:
    // 1) effect.exiledCardId (jawne wskazanie w definicji)
    // 2) targets[0] (gdy trigger ma requiresTarget i wybrany cel)
    // 3) sourceObject.exiledCardId (pole na obiekcie-źródle po exile
    //    — odczytuje też LKI przez formerExiledBy, gdy źródło zdążyło
    //    opuścić battlefield).
    let exiledCardId = effect.exiledCardId ?? targets[0];
    if (!exiledCardId && sourceObject) {
      // Kolejność szukania: (1) jawne effect.exiledCardId/targets[0],
      // (2) pole `exiledCardId` (pojedyncze) zapisane przez exile_own_land,
      // (3) lista `exiledCardIds` (Batch 22) — pierwszy element wciąż w exile,
      // (4) LKI formerExiledBy (gdy źródło opuściło battlefield i moveObjectDirectly
      // zresetowało exiledCardIds).
      exiledCardId = sourceObject.exiledCardId
        ?? (Array.isArray(sourceObject.exiledCardIds)
          ? sourceObject.exiledCardIds.find((id) => state.objects.get(id)?.zone === 'exile')
          : null)
        ?? (sourceObject.formerExiledBy ?? []).find((id) => state.objects.get(id)?.zone === 'exile')
        ?? null;
    }
    if (!exiledCardId) return;
    const obj = state.objects.get(exiledCardId);
    if (!obj || obj.zone !== 'exile') return;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, exiledCardId, 'battlefield', newId);
    // Kontroler = właściciel (NIE kontroler źródła efektu).
    const ownerId = obj.ownerId ?? moved.controllerId;
    const permanent = Object.freeze({ ...moved, controllerId: ownerId, summoningSickness: true });
    state.objects.set(newId, permanent);
    state.events.push(event('object_moved', {
      fromId: exiledCardId, object: permanent, fromZone: 'exile', toZone: 'battlefield',
      returnToOwner: true,
    }));
    state.events.push(event('control_changed', {
      objectId: newId, cardId: permanent.cardId,
      controllerId: ownerId, fromControllerId: moved.controllerId,
      returnToOwner: true,
    }));
    return;
  }
  // Fertile Thicket (BFZ): ETB — "you may look at top 5, reveal up to one
  // basic land, put on top, rest on bottom in any order."
  // "You may" = player can decline entirely (CR 701.18).
  // Implemented as: pending decision to look or skip, then choose 0 or 1 land.
  if (effect.type === 'fertile_thicket_reveal') {
    const controllerId = sourceObject.controllerId;
    const library = state.zones.library;
    const count = Math.min(5, library.length);
    if (count === 0) return;
    // "You may" — always offer the choice (even if no basic lands, player
    // can still decline). The resolve handler allows skip.
    state.pendingFertileThicket = {
      controllerId,
      topCardIds: library.slice(0, count),
      basicLandIds: library.slice(0, count).map(id => {
        const obj = state.objects.get(id);
        return obj && (obj.types ?? []).includes('Basic') && (obj.types ?? []).includes('Land') ? id : null;
      }).filter(Boolean),
      allowSkip: true, // "you may" = can decline
    };
    state.events.push(event('fertile_thicket_reveal_started', {
      controllerId, cardCount: count, basicLandCount: (state.pendingFertileThicket.basicLandIds).length,
    }));
    return;
  }
   // Springbloom Druid (MH1): ETB — "you may sacrifice a land. If you do,
  // search for up to 2 basic lands, put onto battlefield tapped, shuffle."
  if (effect.type === 'springbloom_sacrifice_search') {
    const controllerId = sourceObject.controllerId;
    const lands = state.zones.battlefield.filter(id => {
      const obj = state.objects.get(id);
      return obj && obj.controllerId === controllerId && (obj.kind === 'land' || (obj.types ?? []).includes('Land'));
    });
    if (lands.length === 0) return; // No land to sacrifice — do nothing
    state.pendingSpringbloom = {
      controllerId,
      sourceId: sourceObject.id,
      landIds: lands,
    };
    state.events.push(event('springbloom_choice_required', { controllerId }));
    return;
  }

    throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
