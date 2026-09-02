import { event } from '../protocol/types.js';
import { spellExitZone } from './zones.js';
import { untapByEffect, allGraveyardsCardTypeCount, animatePermanentUntilEndOfTurn, deathZoneFor, detainUntilYourNextTurn, effectiveColors, effectiveKeywords, effectivePower, effectiveToughness, effectiveSubtypes, goadUntilNextTurn, grantAbilitiesUntilEndOfTurn, grantBasicLandTypeUntilEndOfTurn, grantKeywordsUntilEndOfTurn, isDamagePrevented, isProtectedFromSource, markDamage, modifyStats, preventDamageTo, replaceObject, turnFaceUp , markDealtDamageThisTurn, transformedCharacteristics } from './permanents.js';
import { addCounter, removeCounter } from './counters.js';
import { addPoisonCounters, changeLife, recordCardDrawn, startEnginesFor } from './players.js';
import { spendMana, addMana, producibleMana } from './resources.js';
import { getSourceForObject } from './mana-sources.js';
import { moveObjectDirectly, removeFromCombat, singleTargetOfStackEntry } from './objects.js';
import { tryRegenerate } from './state-based.js';
import { createBattlefieldToken, nextCopyNumber, TREASURE_TOKEN_EFFECT } from './tokens.js';

import { effectiveProtectionFromColors } from './attachments.js';
import { shuffle } from './shuffle.js';
import { createGameObject, copyManaValueOf } from './identity.js';
import { attachEquipmentToCreature, detachAttachmentsFromHost } from './attachments.js';

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
  Object.freeze({ name: 'Secret Entrance', effects: Object.freeze([Object.freeze({ type: 'search_library_to_hand', qualifier: { types: ['Basic', 'Land'] } })]), leadsTo: Object.freeze(['Forge', 'Lost Well']) }),
  // 2. Forge — dwa liczniki +1/+1 na docelowym stworze (wybór celu).
  Object.freeze({ name: 'Forge', effects: Object.freeze([Object.freeze({ type: 'add_counter', counter: '+1/+1', amount: 2, target: 'creature' })]), leadsTo: Object.freeze(['Trap!', 'Arena']) }),
  // 3. Lost Well — scry 2 (blokująca decyzja gracza).
  Object.freeze({ name: 'Lost Well', effects: Object.freeze([Object.freeze({ type: 'scry', amount: 2 })]), leadsTo: Object.freeze(['Arena', 'Stash']) }),
  // 4. Trap! — docelowy gracz traci 5 życia (wybór celu).
  Object.freeze({ name: 'Trap!', effects: Object.freeze([Object.freeze({ type: 'lose_life', amount: 5, target: 'player' })]), leadsTo: Object.freeze(['Archives']) }),
  // 5. Arena — goad docelowego stwora (musi atakować do końca tury; wybór celu).
  Object.freeze({ name: 'Arena', effects: Object.freeze([Object.freeze({ type: 'goad', target: 'creature' })]), leadsTo: Object.freeze(['Archives', 'Catacombs']) }),
  // 6. Stash — token Treasure („{T}, Sacrifice this artifact: Add one mana of
  //    any color”). Współdzielony deskryptor Skarba (audyt PR #93) — patrz
  //    `TREASURE_TOKEN_EFFECT` w tokens.js.
  Object.freeze({ name: 'Stash', effects: Object.freeze([TREASURE_TOKEN_EFFECT]), leadsTo: Object.freeze(['Catacombs']) }),
  // 7. Archives — dobierz kartę.
  Object.freeze({ name: 'Archives', effects: Object.freeze([Object.freeze({ type: 'draw_cards', amount: 1 })]), leadsTo: Object.freeze(['Throne of the Dead Three']) }),
  // 8. Catacombs — 4/1 czarny Skeleton z menace.
  Object.freeze({ name: 'Catacombs', effects: Object.freeze([Object.freeze({ type: 'create_token', cardId: 'token_skeleton', name: 'Skeleton', kind: 'creature', power: 4, toughness: 1, colors: ['B'], types: ['Creature'], subtypes: ['Skeleton'], keywords: ['menace'] })]), leadsTo: Object.freeze(['Throne of the Dead Three']) }),
  // 9. Throne of the Dead Three — odsłoń 10 kart, połóż STWORA SPOŚRÓD NICH
  //    (wybór celu) z 3× +1/+1 i hexproof do twojej następnej tury, tasuj.
  Object.freeze({ name: 'Throne of the Dead Three', effects: Object.freeze([Object.freeze({ type: 'reveal_top_put_creature', amount: 10, counters: '+1/+1', countersAmount: 3, hexproofUntilNextTurn: true })]), leadsTo: Object.freeze([]) }),
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

/** Położenie wybranego stwora Throne: pole bitwy + liczniki + hexproof + tasowanie. */
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
  // M273 (błąd #24): liczniki WEJŚCIA karty (CR 121.6) są niezależne od
  // liczników nadawanych przez sam efekt — obie porcje się sumują.
  applyEnterCounters(state, newId);
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
 * Manifest (CR 701.34): przenosi kartę z biblioteki na pole bitwy jako face-down
 * stwór 2/2 bez nazwy/typów/kosztu (jak morph face-down, CR 708.2). Zapisuje
 * `faceDownOriginal` (cechy karty) i `manifestReady` — jeśli karta jest kartą
 * STWORA, można ją obrócić twarzą do góry za jej koszt many (turnFaceUp).
 * Generyczne, bez nazw kart (ADR 0002).
 */
export function manifestCardFaceDown(state, cardObjectId, controllerId) {
  const card = state.objects.get(cardObjectId);
  if (!card) return null;
  const isCreatureCard = card.kind === 'creature' || (card.types ?? []).includes('Creature');
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, cardObjectId, 'battlefield', newId);
  const manifested = Object.freeze({
    ...moved,
    faceDown: true,
    summoningSickness: true,
    tapped: false,
    kind: 'creature',
    power: 2,
    toughness: 2,
    // CR 708.2 — face-down bez cech karty; oryginał chowamy do obrotu.
    colors: [],
    subtypes: [],
    types: ['Creature'],
    keywords: [],
    manaCost: 0,
    cardName: null,
    abilities: [],
    originalAbilities: card.abilities ?? [],
    faceDownOriginal: Object.freeze({
      colors: Object.freeze([...(card.colors ?? [])]),
      subtypes: Object.freeze([...(card.subtypes ?? [])]),
      types: Object.freeze([...(card.types ?? [])]),
      keywords: Object.freeze([...(card.keywords ?? [])]),
      manaCost: card.manaCost ?? 0,
      cardName: card.cardName ?? null,
    }),
    // „Turn it face up any time for its mana cost if it's a creature card":
    // koszt obrotu = koszt many karty; tylko dla kart stworów (CR 701.34e).
    manifestReady: isCreatureCard,
    manifestTurnUpCost: isCreatureCard ? (card.manaCost ?? 0) : null,
  });
  state.objects.set(newId, manifested);
  state.events.push(event('object_moved', {
    fromId: cardObjectId, object: manifested, fromZone: 'library', toZone: 'battlefield', manifested: true,
  }));
  return newId;
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
function roomIndexByName(name) {
  return UNDERCITY_ROOMS.findIndex((room) => room.name === name) + 1;
}

/** Czy pokój jest ostatni (brak dalszych ścieżek — „Throne of the Dead Three")? */
function isFinalRoom(roomIndex) {
  return (UNDERCITY_ROOMS[roomIndex - 1]?.leadsTo ?? []).length === 0;
}

/**
 * Batch 47 (CR 701.51b): gracz UKOŃCZYŁ loch, gdy jego znacznik dotarł do
 * pokoju bez dalszych ścieżek. Undercity jest GRAFEM (M190/B), więc „ostatni
 * pokój" to nie „pokój numer 9", tylko taki, z którego nie ma wyjścia —
 * liczone z danych lochu, nie ze stałej.
 */
function hasCompletedDungeon(state, playerId) {
  const room = state.undercityProgress?.[playerId] ?? 0;
  return room > 0 && isFinalRoom(room);
}

/** Wchodzi do WSKAZANEGO pokoju: postęp, zdarzenie i efekt pokoju. */
function enterUndercityRoom(state, playerId, room) {
  state.undercityProgress = { ...state.undercityProgress, [playerId]: room };
  state.events.push(event('ventured_into_undercity', {
    playerId, room, roomName: UNDERCITY_ROOMS[room - 1].name, total: UNDERCITY_ROOMS.length,
    last: isFinalRoom(room),
  }));
  executeRoomEffect(state, room, playerId);
}

export function ventureIntoUndercityForTest(state, playerId) {
  return ventureIntoUndercity(state, playerId);
}

/**
 * M190/B (zgłoszenie właściciela): Undercity to GRAF, nie lista 1..9.
 * Oracle (Scryfall tclb/20) daje przy każdym pokoju klauzulę „(Leads to: …)",
 * a CR 309.4 mówi, że gracz wybiera następny pokój spośród wskazanych
 * strzałkami. Wcześniej silnik robił `current + 1`, czyli jedną sztywną
 * trasę przez wszystkie dziewięć pokoi — gracza „przenosiło" do Forge bez
 * pytania, a loch nigdy nie kończył się po 4–5 pokojach, jak powinien.
 *
 * Wybór jest blokującą decyzją (`pendingUndercityRoute`), jak każda inna
 * decyzja gracza; przy JEDNEJ możliwej ścieżce nie pytamy (spójnie z resztą
 * silnika — brak realnego wyboru nie zatrzymuje gry).
 */
function ventureIntoUndercity(state, playerId) {
  const current = state.undercityProgress[playerId] ?? 0;
  if (current === 0) {
    enterUndercityRoom(state, playerId, 1);
    return;
  }
  if (isFinalRoom(current)) return; // loch ukończony (CR 309.5)
  const nextRooms = (UNDERCITY_ROOMS[current - 1]?.leadsTo ?? [])
    .map((name) => ({ name, room: roomIndexByName(name) }))
    .filter((entry) => entry.room > 0);
  if (nextRooms.length === 0) return;
  if (nextRooms.length === 1) {
    enterUndercityRoom(state, playerId, nextRooms[0].room);
    return;
  }
  state.pendingUndercityRoute = {
    playerId,
    fromRoom: current,
    fromRoomName: UNDERCITY_ROOMS[current - 1].name,
    candidates: nextRooms,
    restorePriorityTo: state.turn.priorityPlayerId,
  };
  state.turn.priorityPlayerId = playerId;
  state.events.push(event('undercity_route_required', {
    playerId, fromRoom: current, fromRoomName: UNDERCITY_ROOMS[current - 1].name,
    candidates: nextRooms.map((entry) => ({ room: entry.room, roomName: entry.name })),
  }));
}

/** Domyka decyzję trasy — wywoływane przez komendę resolve_undercity_route. */
export function enterChosenUndercityRoom(state, playerId, room) {
  enterUndercityRoom(state, playerId, room);
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

/**
 * Zbiór stworów objętych masowym buffem „do końca tury" — ustalany W CHWILI
 * ROZSTRZYGNIĘCIA efektu (CR 611.2c: „the set of objects a continuous effect
 * affects is determined when that effect begins"). `opponent` przełącza między
 * „creatures you control" a „creatures your opponents control".
 */
function affectedCreatureIds(state, controllerId, opponent) {
  const ids = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') continue;
    const matches = opponent ? object.controllerId !== controllerId : object.controllerId === controllerId;
    if (matches) ids.push(id);
  }
  return ids;
}

/**
 * M106/Z1 (audyt stołu): masowy buff „do końca tury" (Hysterical Blindness
 * −4/−0, Turn the Tide, Angel of the Dawn +1/+1 i czujność, Jyoti dla land
 * creatures) był CAŁKOWICIE niewidoczny dla gracza — wpis lądował w
 * `state.untilEndOfTurnBuffs` (albo szedł przez modifyStats, wyciszony jako
 * szum), więc log i panel „Rozgrywka" pokazywały tylko „czar zostaje
 * rozstrzygnięty". Zdarzenie niesie zbiór dotkniętych obiektów (CR 611.2c —
 * ustalany przy rozstrzygnięciu), wartości modyfikacji i nadane keywordy.
 */
function emitMassBuff(state, sourceObject, { objectIds, power, toughness, keywords }, scope) {
  state.events.push(event('mass_stats_modified', {
    sourceId: sourceObject?.id ?? null,
    cardId: sourceObject?.cardId ?? null,
    playerId: sourceObject?.controllerId ?? null,
    scope,
    objectIds: [...(objectIds ?? [])],
    powerModifier: power ?? 0,
    toughnessModifier: toughness ?? 0,
    keywords: [...(keywords ?? [])],
  }));
}

export function drawPlayerCards(state, playerId, amount, source = 'effect') {
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
    // A92/3: porządek dobrania stempluje choke point `recordCardDrawn`
    // (players.js) — dawny własny inkrement nie mówił nic o tym, KTÓRA to
    // karta w turze, więc triggery „druga karta” czytały licznik po fakcie.
    recordCardDrawn(state, playerId, { fromId: topId, object: drawnObj, source });
    drawn += 1;
  }
  // CR 704.5m: gracz, który MUSI dobrać więcej kart, niż ma w bibliotece,
  // dobiera pozostałe, a następnie PRZEGRYWA — ale przegrana jest AKCJĄ
  // STANOWĄ (CR 704), a nie natychmiastowym skutkiem efektu. Poprzednio gra
  // kończyła się tutaj, więc o wyniku decydowała KOLEJNOŚĆ przetwarzania:
  // „You and target opponent each draw two cards” (Strike a Deal) przy dwóch
  // pustych bibliotekach ogłaszało zwycięzcą tego, kto dobierał DRUGI —
  // tymczasem CR 104.4b mówi, że gdy wszyscy pozostali gracze przegrywają
  // jednocześnie, partia jest REMISEM. Ten sam błąd był już naprawiony dla
  // życia/trucizny w `runStateBasedActions`; ścieżka dobrania go nie miała.
  // Znacznik kasuje przebieg SBA (CR 704.5m: „since the last time state-based
  // actions were checked”).
  if (drawn < amount && state.status === 'active') {
    state.emptyLibraryDraw = { ...(state.emptyLibraryDraw ?? {}), [playerId]: true };
  }
}

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
export function dealNonCombatDamage(state, sourceObject, targetId, rawAmount) {
  if (!Number.isInteger(rawAmount) || rawAmount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
  const targetIsPlayer = state.players.some((player) => player.id === targetId);
  const targetObject = targetIsPlayer ? null : state.objects.get(targetId);
  // =========================================================================
  // M133 (CR 608.2b) — cel, którego JUŻ NIE MA na polu bitwy, to FIZZLE, a nie
  // awaria silnika.
  //
  // Objaw: `Error: Nieprawidłowy cel obrażeń` wywalał CAŁY benchmark (crash
  // procesu, nie przegrana partia). Ujawniło się to dopiero przy szerszej
  // próbce (16 seedów) po zmianie składu talii w M132 — sam błąd był w kodzie
  // od dawna, talie tylko zmieniły rozdania. Ścieżka: zdolność aktywowana
  // z obrażeniami leży na stosie, cel ginie wcześniej (inne obrażenia, SBA,
  // poświęcenie), a przy rozstrzyganiu `markDamage` dostaje obiekt spoza
  // pola bitwy i rzuca wyjątek.
  //
  // Reguła: „Jeśli wszystkie cele są nielegalne, czar/zdolność nie
  // rozstrzyga się" — skutek ma po prostu nie nastąpić. Zwracamy 0 zadanych
  // obrażeń i zostawiamy ślad w strumieniu zdarzeń, żeby UI i testy widziały
  // POWÓD (lekcja L24: brak zdarzenia = brak skutku dla reszty systemu).
  // =========================================================================
  if (!targetIsPlayer && (!targetObject || targetObject.zone !== 'battlefield')) {
    state.events.push(event('damage_fizzled', {
      source: sourceObject?.id ?? null,
      target: targetId,
      amount: rawAmount,
      sourceCardId: sourceObject?.cardId ?? null,
      reason: 'target_left_battlefield',
    }));
    return 0;
  }
  // Protection (CR 702.16a): obrażenia od źródła chronionego koloru
  // są zapobiegane — sprawdzamy PRZED filtrem prewencji.
  if (!targetIsPlayer && rawAmount > 0 && targetObject) {
    // M109 (CR 702.16d): ochrona przed JAKOŚCIĄ źródła (Spare from Evil —
    // „protection from non-Human creatures").
    if (isProtectedFromSource(state, targetObject, sourceObject)) {
      state.events.push(event('damage_prevented', {
        objectId: targetId, amount: rawAmount, cardId: targetObject.cardId, protection: true,
      }));
      return 0;
    }
    const protColors = effectiveProtectionFromColors(state, targetObject);
    if (protColors.length > 0) {
      const srcColors = effectiveColors(sourceObject);
      if (srcColors.some(c => protColors.includes(c))) {
        state.events.push(event('damage_prevented', {
          objectId: targetId, amount: rawAmount, cardId: targetObject.cardId, protection: true,
        }));
        return 0;
      }
    }
  }
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
    sourceCardId: sourceObject.cardId ?? null,
    targetCardId: targetIsPlayer ? null : (targetObject?.cardId ?? null),
    // M166/B (Enrage): LKI celu — trigger „is dealt damage" odpala również,
    // gdy stwór zginął w SBA tej samej komendy (CR 603.10 looks-back).
    ...(targetIsPlayer || !targetObject ? {} : { targetLki: Object.freeze({ ...targetObject }) }),
  }));
  if (dealt <= 0) return 0;
  if (effectiveKeywords(sourceObject, state).includes('infect')) {
    if (targetIsPlayer) {
      addPoisonCounters(state, targetId, dealt);
    } else {
      addCounter(state, targetId, '-1/-1', dealt);
      markDealtDamageThisTurn(state, targetId);
    }
  } else if (targetIsPlayer) {
    changeLife(state, targetId, -dealt);
  } else {
    markDamage(state, targetId, dealt);
  }
  // Deathtouch (CR 702.4b): „Any amount of damage this deals to a creature is
  // enough to destroy it" — dotyczy WSZYSTKICH obrażeń, także niecombatowych
  // (fight, „deals damage equal to its power", triggery). Wcześniej oznaczenie
  // damagedByDeathtouch ustawiał wyłącznie combat.js — stwór 1/2 z deathtouch
  // zadający 1 obrażenie w fight nie zabijał 4/4 (SBA nie miała flagi, a
  // obrażenia < wytrzymałości). Prewencja/protection kasują obrażenia przed
  // oznaczeniem — CR 702.4b: bez zadanych obrażeń nie ma śmierci.
  if (!targetIsPlayer && dealt > 0 && effectiveKeywords(sourceObject, state).includes('deathtouch')) {
    const current = state.objects.get(targetId);
    if (current && current.zone === 'battlefield') {
      state.objects.set(targetId, Object.freeze({ ...current, damagedByDeathtouch: true }));
    }
  }
  // Lifelink (CR 702.15): zysk życia równy obrażeniom ZADANYM (po prewencji).
  if (effectiveKeywords(sourceObject, state).includes('lifelink')) {
    changeLife(state, sourceObject.controllerId, dealt);
  }
  return dealt;
}

/**
 * M177/C (Sifter Wurm): reveal wierzchu biblioteki + życie równe mana value
 * odsłoniętej karty. Wspólne dla ścieżki natychmiastowej (scry bez blokady)
 * i po resolve_scry (game-state).
 */
export function revealTopGainLife(state, playerId, sourceCardId = null) {
  const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
  if (!topId) return;
  const top = state.objects.get(topId);
  state.events.push(event('card_revealed', {
    playerId, objectId: topId, cardId: top.cardId, fromLibraryTop: true, sourceCardId,
  }));
  const gained = top.manaCost ?? 0;
  if (gained > 0) changeLife(state, playerId, gained);
}

/** Czy karta z biblioteki pasuje do kwalifikatora szukania (types/subtypes/kind/minMV). */
export function librarySearchMatches(object, qualifier, ownerId) {
  if (!object || object.controllerId !== ownerId || object.zone !== 'library') return false;
  const typeMatch = (qualifier.types ?? []).length === 0
    || (qualifier.types ?? []).every((type) => (object.types ?? []).includes(type));
  const subtypeMatch = (qualifier.subtypes ?? []).length === 0
    || (qualifier.subtypes ?? []).some((subtype) => (object.subtypes ?? []).includes(subtype));
  const kindMatch = !qualifier.kind || object.kind === qualifier.kind;
  const minMv = qualifier.minManaValue;
  const mvOk = minMv == null || (object.manaCost ?? 0) >= minMv;
  // Batch 44 (Angel's Herald): „search ... for a card named Empyrial
  // Archangel" — kwalifikator po dokładnej nazwie karty (CR 701.19b;
  // kryterium jakości, więc fail to find pozostaje legalny).
  const nameOk = !qualifier.name || (object.cardName ?? object.name) === qualifier.name;
  return typeMatch && subtypeMatch && kindMatch && mvOk && nameOk;
}

/**
 * Temat 6 — „You may search your library for ..." (CR 701.19b): blokująca
 * decyzja gracza, KTÓRĄ kartę znaleźć (albo w ogóle nie szukać — fail to
 * find). Ruch karty + tasowanie wykonuje komenda resolve_search_choice.
 * Zwraca true (blokada), gdy są kandydaci; bez kandydatów automatycznie
 * tasuje (szukanie z pustym/niepasującym zbiorem to samo „search... shuffle").
 */
export function queueSearchChoice(state, sourceObject, { qualifier, destination, entersTapped, destinations = null, chain = null, emitter = null, mandatory = false }) {
  const ownerId = sourceObject.controllerId;
  const matches = (object) => librarySearchMatches(object, qualifier, ownerId);
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
    playerId: ownerId, qualifier, destination,
    // Caravan Vigil Morbid: gracz wybiera, czy znaleziony ląd ląduje w ręce
    // czy na pole bitwy („you may put it onto the battlefield instead of into
    // your hand"). destinations = dopuszczalne strefy; null = jedna.
    destinations: destinations ? [...destinations] : null,
    entersTapped, sourceCardId: sourceObject.cardId ?? null,
    restorePriorityTo: state.turn.priorityPlayerId,
    // „Up to N" (Springbloom Druid): po udanym znalezieniu kolejkowana jest
    // kolejna decyzja (chain.remaining) — pełne 0/1/2 jako wybory gracza.
    chain: chain ? { ...chain } : null,
    // Emiter decyzji pośredniej z aktywacji (cycling/channel): po wyborze
    // handler resolve_search_choice emituje ability_activated (jak cycling).
    emitter: emitter ? { ...emitter } : null,
    // M177/C (Final Parting, CR 701.19c): szukanie BEZ kryterium jakości
    // nie może „fail to find” — przy kandydatach decline nie jest oferowany.
    mandatory: Boolean(mandatory),
  };
  state.turn.priorityPlayerId = ownerId;
  state.events.push(event('search_choice_required', {
    playerId: ownerId, candidateIds: [...candidateIds],
    destination, sourceCardId: sourceObject.cardId ?? null,
  }));
  return true;
}

/**
 * Audyt PR #41 (B4): „Face-down creatures you control enter with a flying
 * counter on them." (Veiled Ascension) — generyczna zdolność statyczna na
 * źródle; każdy zakryty stwór kontrolera wchodzący na pole bitwy (cloak, morph,
 * megamorph, disguise) dostaje flying counter, gdy kontroler ma takie źródło.
 */
export function maybeAddFaceDownFlyingCounter(state, controllerId, objectId) {
  const hasSource = [...state.objects.values()].some((source) => source.zone === 'battlefield'
    && source.controllerId === controllerId
    && (source.abilities ?? []).some((a) => a?.type === 'static' && a.faceDownEnterFlyingCounter));
  if (hasSource) addCounter(state, objectId, 'flying', 1);
}

/** Stwory-lądy kontrolera (Jyoti: „land creatures you control"). */
export function landCreaturesYouControl(state, controllerId) {
  return [...state.objects.values()].filter((object) => object.zone === 'battlefield'
    && object.controllerId === controllerId
    && object.kind === 'creature'
    && (object.types ?? []).includes('Land'));
}

/** Wszystkie stwory kontrolera (Village Bell-Ringer: „untap all creatures you control"). */
export function creaturesYouControl(state, controllerId) {
  return [...state.objects.values()].filter((object) => object.zone === 'battlefield'
    && object.controllerId === controllerId
    && object.kind === 'creature');
}

/**
 * Inne stwory kontrolera (Plague Reaver: „sacrifice each other creature you
 * control"). Porządek jak w `state.zones.battlefield` — kolejność poświęceń
 * jest widoczna w logu, więc selektor nie może jej zmieniać.
 */
export function otherCreaturesYouControl(state, controllerId, exceptId) {
  return [...state.zones.battlefield]
    .map((objectId) => state.objects.get(objectId))
    .filter((object) => object && object.zone === 'battlefield'
      && object.controllerId === controllerId
      && object.kind === 'creature'
      && object.id !== exceptId);
}

/** Karty biblioteki gracza — strefa jest WSPÓLNA, filtr idzie po kontrolerze. */
export function libraryCardsOf(state, playerId) {
  return state.zones.library.filter((id) => state.objects.get(id)?.controllerId === playerId);
}

/**
 * Gracz, którego bibliotekę mieli `mill_cards` (Chronic Flooding: kontroler
 * ZACZAROWANEGO permanentu — CR 109.5; „target player mills N": cel).
 */
export function millTargetPlayerId(state, effect, sourceObject, targets = []) {
  if (effect.applyTo === 'enchanted_controller') {
    const host = sourceObject?.attachedTo ? state.objects.get(sourceObject.attachedTo) : null;
    return host?.controllerId ?? null;
  }
  return (targets[0] && state.players.some((player) => player.id === targets[0]))
    ? targets[0]
    : sourceObject?.controllerId ?? null;
}

/**
 * Odbiorcy efektu „każdy zakryty stwór, którego kontrolujesz" (Veiled
 * Ascension). Wspólna definicja zbioru: efekt bierze z niej stwory do
 * licznika, a raport „trigger bez efektu" w `triggers.js` pyta, czy zbiór
 * jest pusty. Jedna reguła zamiast dwóch kopii (L41/L48 — kopie się
 * rozjeżdżają); deskryptor po typie efektu, nie po nazwie karty (ADR 0002).
 */
export function faceDownCreaturesYouControl(state, controllerId) {
  return [...state.objects.values()].filter((object) => object.zone === 'battlefield'
    && object.controllerId === controllerId
    && Boolean(object.faceDown)
    && object.kind === 'creature');
}

/**
 * Stwory, których kontroler NIE jest właścicielem (Trostani Discordant:
 * „each player gains control of all creatures they own"). Ta sama reguła
 * w obu miejscach — patrz `faceDownCreaturesYouControl`.
 */
export function creaturesNotControlledByOwner(state) {
  return [...state.objects.values()].filter((object) => object.zone === 'battlefield'
    && object.kind === 'creature'
    && (object.ownerId ?? object.controllerId) !== object.controllerId);
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
/**
 * M258/F3 — WARD (CR 702.21): kontrowanie obiektu na stosie. Czar-karta
 * wraca do grobu właściciela (jak counter_spell, CR 701.2a); wpis
 * zdolności (activated/trigger — pseudo-obiekt) znika ze stosu bez strefy
 * docelowej: skontrowana zdolność po prostu nic nie robi.
 */
export function counterStackObject(state, stackId, { counteredBy = null, counteredByCardId = null, byWard = false } = {}) {
  const object = state.objects.get(stackId);
  if (!object || object.zone !== 'stack') return null;
  if (object.activatedEntry || object.triggerEntry) {
    state.zones.stack = state.zones.stack.filter((id) => id !== stackId);
    state.objects.delete(stackId);
    state.events.push(event('spell_countered', {
      fromId: stackId, toId: null, cardId: object.cardId ?? null,
      controllerId: object.controllerId, counteredBy, counteredByCardId, byWard,
    }));
    return object;
  }
  // M271 (błąd #15, CR 701.5a + 118.9): skontrowany czar idzie do grobu
  // WŁAŚCICIELA, ale zastąpienie „if it would be put into a graveyard, exile
  // it instead" (Halo Forager) obowiązuje także tutaj — strefę wyznacza
  // WSPÓLNY `spellExitZone`, ten sam co przy rozstrzygnięciu i fizzlu.
  const zoneAfterCounter = spellExitZone(object);
  const graveId = `${zoneAfterCounter}-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, zoneAfterCounter, graveId);
  state.events.push(event('spell_countered', {
    fromId: stackId, toId: graveId, cardId: moved.cardId,
    controllerId: moved.controllerId, counteredBy, counteredByCardId, byWard,
  }));
  return moved;
}

/**
 * Kanoniczne „destroy" jednego permanentu (CR 701.7a) wraz z całą warstwą
 * efektów zastępujących i chroniących, w kolejności wymaganej przez reguły:
 *  1. indestructible (CR 702.12) — zniszczenie po prostu się nie dzieje;
 *  2. licznik shield (CR 122.1) — pochłania zniszczenie i znika;
 *  3. regeneracja (CR 701.15) — zastępuje zniszczenie;
 *  4. strefa śmierci przez `deathZoneFor` (licznik finality / naznaczenie
 *     wygnaniem, CR 122.1e) — a nie sztywno cmentarz.
 *
 * M272 (błąd #19): tę sekwencję znała TYLKO ścieżka `destroy_permanent`.
 * `destroy_equipment_attached` (Awaken the Sleeper) miała własną, uboższą
 * kopię — sprawdzała jedynie strefę śmierci, więc niezniszczalny lub
 * regenerujący się Equipment i tak trafiał do grobu. Ósma ofiara wzorca L107.
 *
 * Zwraca true, gdy permanent FAKTYCZNIE został zniszczony.
 */
export function destroyPermanentByEffect(state, objectId, options = {}) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield') return false;
  if (effectiveKeywords(object, state).includes('indestructible')) return false;
  if ((object.counters?.shield ?? 0) > 0) {
    const next = { ...(object.counters ?? {}) };
    next.shield -= 1;
    if (next.shield <= 0) delete next.shield;
    state.objects.set(objectId, Object.freeze({ ...object, counters: Object.freeze(next) }));
    state.events.push(event('shield_consumed', {
      objectId, cardId: object.cardId, reason: options.reason ?? 'destroy',
    }));
    return false;
  }
  if (tryRegenerate(state, object)) return false;
  const toZone = deathZoneFor(state, object);
  const destId = `${toZone}-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, toZone, destId);
  state.events.push(event('permanent_destroyed', {
    // `toZone` jest CZĘŚCIĄ faktu, nie ozdobą: triggery śmierci sprawdzają,
    // czy permanent poszedł do wygnania — wtedy „dies" się nie wydarzyło.
    fromId: objectId, objectId: destId, playerId: object.controllerId,
    cardId: moved.cardId, controllerId: object.controllerId, toZone,
  }));
  return true;
}

/**
 * Liczniki WEJŚCIA na pole bitwy (CR 121.6 + 614.1c) — „enters with a +1/+1
 * counter on it" to efekt zastępujący samo wejście, więc obowiązuje przy
 * KAŻDYM wejściu: rzucie czaru, reanimacji z cmentarza, wprowadzeniu efektem.
 *
 * M273 (błąd #24): cechę obsługiwała wyłącznie ścieżka rozstrzygnięcia czaru
 * permanentu (`resolvePermanentSpell` w spells.js) oraz ninjutsu. Rodzina
 * reanimacji wprowadzała permanent gołym `moveObjectDirectly`, więc Servant
 * of the Scale wracał na pole jako 0/0 i ginął natychmiast od akcji stanowej
 * (CR 704.5f), Trigon of Corruption bez trzech liczników charge był
 * bezużyteczny, a Kappa Tech-Wrecker tracił deathtouch.
 *
 * Wywoływać PO wejściu obiektu na pole bitwy, przed zdarzeniem wejścia.
 * Karta zakryta (morph/manifest) liczników wejścia NIE dostaje — jest wtedy
 * bezimiennym 2/2 bez zdolności (CR 708.2).
 *
 * M274 (błąd #26): helper obejmuje też BLOODTHIRST (CR 702.54a). To słowo
 * kluczowe WYDRUKOWANE na karcie jest efektem zastępującym wejście, więc
 * działa przy każdym wejściu — także gdy permanent trafia na pole bitwy bez
 * rzucania (reanimacja). Rozróżnienie z rulingu Bloodghasta: bloodthirst
 * NADANY czarom przez inny permanent (Bloodlord of Vaasgoth) wymaga rzutu,
 * bo dotyczy CZARU — ale takiego efektu silnik nie zna, a `object.bloodthirst`
 * pochodzi wyłącznie z definicji karty.
 */
export function applyEnterCounters(state, objectId) {
  const object = state.objects.get(objectId);
  if (!object || object.zone !== 'battlefield' || object.faceDown) return;
  for (const [name, amount] of Object.entries(object.entersWithCounters ?? {})) {
    addCounter(state, objectId, name, amount);
  }
  // Liczniki wejścia WARUNKOWE (CR 614.1c): „enters with two +1/+1 counters
  // if a creature died this turn" (morbid) / „if at least three <color> mana
  // was spent to cast this spell" (adamant). Deskryptor generyczny, bez nazw
  // kart (ADR 0002). Adamant z natury dotyczy tylko rzutu — na ścieżce bez
  // rzucania `manaColorsSpent` jest puste, więc warunek po prostu nie zachodzi.
  const rule = object.entersWithCountersIf;
  if (rule) {
    let holds = rule.morbid ? Boolean(state.creatureDiedThisTurn) : false;
    if (!holds && rule.adamant) {
      // Wpis jednoznaczny (1 znak) liczy się, gdy jest tym kolorem; wildcard
      // (>1 znaku — jednostka wielokolorowa, CR 106.7) gdy zawiera kolor.
      const spent = object.manaColorsSpent ?? [];
      holds = spent.filter((color) => color === rule.adamant.color
        || (color.length > 1 && color.includes(rule.adamant.color))).length >= (rule.adamant.min ?? 3);
    }
    if (holds) {
      for (const [name, amount] of Object.entries(rule.counters ?? {})) {
        addCounter(state, objectId, name, amount);
      }
    }
  }
  // Bloodthirst N: „If an opponent was dealt damage this turn, this creature
  // enters with N +1/+1 counters on it" — warunek sprawdzany przy WEJŚCIU.
  if (object.bloodthirst && state.dealtDamageToOpponentThisTurn?.[object.controllerId]) {
    addCounter(state, objectId, '+1/+1', object.bloodthirst);
  }
}

export function applyEffect(state, effect, sourceObject, targets = [], context = {}) {
  // X-cost czary (Consume Spirit, Epic Experiment — Batch 30): efekty mogą
  // użyć amount: 'X' (lub amountFrom: 'X') — wartość X z obiektu stosu
  // (sourceObject.spellX). Resolwowane raz, spójnie dla wszystkich efektów.
  if (effect.amount === 'X' && sourceObject && sourceObject.spellX != null) {
    effect = { ...effect, amount: sourceObject.spellX };
  }
  if (effect.amountFrom === 'X' && sourceObject && sourceObject.spellX != null) {
    effect = { ...effect, amountFrom: sourceObject.spellX };
  }
  // Próg wydanej many na poziomie pojedynczego EFEKTU triggera (Tellah,
  // Great Sage: „if four/eight or more mana was spent to cast that spell") —
  // kontekst niesie manaSpent ze zdarzenia rzutu (triggers.fireTrigger);
  // próg niespełniony pomija TYLKO ten efekt, nie całą zdolność.
  if (effect.condition?.manaSpentAtLeast != null && (context?.manaSpent ?? 0) < effect.condition.manaSpentAtLeast) return;
  if (effect.type === 'damage') {
    // M111: `targetIndex` wskazuje slot celu (konwencja reszty efektów) —
    // czar o kilku celach zadaje obrażenia właściwemu z nich, zamiast lać
    // wszystko w pierwszy. Bez pola zachowanie bez zmian (slot 0).
    const targetId = targets[effect.targetIndex ?? 0];
    // CR 608.2b: cel-stwór, który zniknął z pola bitwy przed rozstrzygnięciem
    // (T6 — okno odpowiedzi na triggerze), sprawia, że efekt nic nie robi.
    if (targetId != null && !state.players.some((player) => player.id === targetId)) {
      const targetObj = state.objects.get(targetId);
      if (!targetObj || targetObj.zone !== 'battlefield' || targetObj.kind !== 'creature') return;
    }
    let amount = effect.amount;
    if (amount === 'artifacts_you_control') {
      amount = countArtifactsControlled(state, sourceObject.controllerId);
    }
    // Batch 46 (Bring Low): „If that creature has a +1/+1 counter on it,
    // deals 5 damage instead." Warunek sprawdzamy przy ROZSTRZYGNIĘCIU
    // (CR 608.2) — licznik dołożony w oknie odpowiedzi podbija kwotę.
    const bonus = effect.amountIfTargetHasCounter;
    if (bonus && targetId != null) {
      const target = state.objects.get(targetId);
      if ((target?.counters?.[bonus.counter] ?? 0) > 0) amount = bonus.amount;
    }
    dealNonCombatDamage(state, sourceObject, targetId, amount);
    return;
  }
  // M109 (Diplomatic Relations): „It deals damage equal to its power to target
  // creature an opponent controls." ŹRÓDŁEM obrażeń jest STWÓR (cel spod
  // sourceTargetIndex), nie czar — liczy się jego deathtouch/lifelink/kolor
  // (protection) i moc EFEKTYWNA w chwili rozstrzygania (CR 608.2c: efekty
  // czaru wykonują się po kolei, więc buff z wcześniejszego efektu już działa).
  // M109 (Sagittars' Volley): „deals 1 damage to each creature with flying
  // your opponents control" — fala obrażeń po KEYWORDZIE (efektywnym),
  // ograniczona do stworów przeciwników kontrolera źródła. Źródłem obrażeń
  // jest czar, więc protection/prewencja liczą jego kolory (dealNonCombatDamage).
  if (effect.type === 'damage_creatures_with_keyword') {
    const amount = effect.amount ?? 1;
    const keyword = effect.keyword;
    const onlyOpponents = effect.opponentsOnly !== false;
    const hit = [];
    for (const objectId of [...state.zones.battlefield]) {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') continue;
      if (onlyOpponents && object.controllerId === sourceObject.controllerId) continue;
      if (!effectiveKeywords(object, state).includes(keyword)) continue;
      hit.push(objectId);
    }
    for (const objectId of hit) dealNonCombatDamage(state, sourceObject, objectId, amount);
    return;
  }
  // Batch 46 (Glint-Sleeve Artisan) — FABRICATE N (CR 702.122): „When this
  // creature enters, put N +1/+1 counters on it OR create N 1/1 colorless
  // Servo artifact creature tokens." Wybór należy do KONTROLERA, więc jest
  // blokującą decyzją (jak amass/endure), a nie deterministycznym efektem.
  // Batch 46 (Rediscover the Way III) — „Whenever you cast a noncreature
  // spell THIS TURN, target creature you control gains double strike until
  // end of turn." Rozdział nadaje ŹRÓDŁU (Sadze) zdolność wyzwalaną na czas
  // tury — wykorzystujemy istniejący mechanizm grantAbilitiesUntilEndOfTurn,
  // więc trigger znika razem z końcem tury bez osobnego sprzątania.
  if (effect.type === 'grant_double_strike_on_noncreature_cast_this_turn') {
    const source = state.objects.get(sourceObject.id);
    if (!source || source.zone !== 'battlefield') return;
    const granted = Object.freeze({
      type: 'triggered',
      trigger: Object.freeze({
        event: 'you_cast_noncreature_spell',
        requiresTarget: Object.freeze({ type: 'creature_you_control' }),
      }),
      effect: Object.freeze([Object.freeze({
        type: 'grant_keywords_until_end_of_turn', keywords: Object.freeze(['double_strike']),
      })]),
    });
    const grants = [...(source.abilityGrants ?? []), granted];
    state.objects.set(source.id, Object.freeze({ ...source, abilityGrants: Object.freeze(grants) }));
    state.events.push(event('keyword_granted', {
      objectId: source.id, cardId: source.cardId,
      keywords: ['double_strike'], delayed: true, untilEndOfTurn: true,
    }));
    return;
  }
  // Batch 46 (Gila Courser) — IMPULSE EXILE: „exile the top card of your
  // library. Until the end of your next turn, you may play that card."
  // Karta idzie do exile ze znacznikiem `playableUntilTurn` (numer TWOJEJ
  // następnej tury); ofertę rzutu/zagrania z exile enumeruje spells.js,
  // a znacznik wygasa sam — nie trzeba go sprzątać cleanupem.
  if (effect.type === 'exile_top_playable_until_next_turn') {
    const controllerId = sourceObject.controllerId;
    const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === controllerId);
    if (topId == null) return;
    const card = state.objects.get(topId);
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, topId, 'exile', exileId, { exiledBy: sourceObject.cardId });
    // „Until the end of your NEXT turn" — jeśli to twoja tura, chodzi o tę
    // następną (numer + 2 przy dwóch graczach); poza swoją turą o najbliższą.
    const isMyTurn = state.turn.activePlayerId === controllerId;
    const playableUntilTurn = state.turn.number + (isMyTurn ? 2 : 1);
    // Batch 47 (Caves of Chaos Adventurer): „If you've COMPLETED A DUNGEON,
    // you may play that card this turn without paying its mana cost.
    // Otherwise, you may play that card this turn." Warunek jest deskryptorem
    // efektu (ADR 0002), a jego spełnienie liczy silnik ze stanu lochu:
    // ukończenie = dotarcie do pokoju bez dalszych ścieżek (Throne of the
    // Dead Three). Bez deskryptora zachowanie zostaje jak dotąd — karta
    // grywalna za pełny koszt (Gila Courser).
    const freeCondition = effect.freeIfCondition ?? null;
    const withoutPaying = freeCondition?.type === 'completed_dungeon'
      && hasCompletedDungeon(state, controllerId);
    state.objects.set(exileId, Object.freeze({
      ...moved, playableUntilTurn,
      ...(withoutPaying ? { playableWithoutPaying: true } : {}),
    }));
    state.events.push(event('object_exiled', {
      fromId: topId, objectId: exileId, object: state.objects.get(exileId),
      cardId: card?.cardId ?? null, playerId: controllerId, playableUntilTurn,
      ...(withoutPaying ? { playableWithoutPaying: true } : {}),
    }));
    return;
  }
  // Vaan, Street Thief (FIN): „exile the top card of that player's library.
  // You may cast it. If you don't, create a Treasure token." Gracz, z którego
  // biblioteki wygnano kartę, to poszkodowany (context.damagedPlayerId —
  // trigger any_combat_damage_to_player). Rzut „teraz" to blokująca decyzja
  // resolve_exile_cast (blokująca decyzja na stosie), a uprawnienie do rzutu
  // z exile i poza timingiem daje flaga `abilityWindowCast` w
  // requireSpell/castPermanent — ruling WotC: rzucasz, póki zdolność jest na
  // stosie, ignorując ograniczenia typu czaru).
  if (effect.type === 'exile_top_of_player_library_and_may_cast') {
    const controllerId = sourceObject.controllerId;
    const libraryOwnerId = context.damagedPlayerId ?? controllerId;
    const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === libraryOwnerId);
    if (topId == null) return; // pusta biblioteka — nic do wygnania ani rzucenia
    const card = state.objects.get(topId);
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, topId, 'exile', exileId, { exiledBy: sourceObject.cardId });
    // Audyt PR #92 (ruling WotC 2025-02-10): „You cast the exiled card while
    // Vaan's first ability is still on the stack. You can’t wait to cast it
    // later in the turn". OKNEM RZUTU jest więc sama nierozstrzygnięta
    // decyzja `pendingExileCast` (poniżej), a NIE stempel na obiekcie.
    // Dawniej efekt doklejał `playableUntilTurn: state.turn.number` — po
    // rezygnacji karta zostawała w exile „rzucalna do końca tury" i dało się
    // ją rzucić później za pełny koszt. Uprawnienie do rzutu z exile daje
    // teraz wyłącznie flaga `abilityWindowCast` w `requireSpell`/`castPermanent`.
    // (Impuls, plot i suspend MAJĄ własny stempel — tam okno jest efektem
    // trwającym wiele tur i nie jest decyzją na stosie.)
    state.events.push(event('object_exiled', {
      fromId: topId, objectId: exileId, object: state.objects.get(exileId),
      cardId: card?.cardId ?? null,
    }));
    state.pendingExileCast = {
      playerId: controllerId,
      objectId: exileId,
      cardId: card?.cardId ?? null,
      sourceId: sourceObject.id,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('exile_cast_required', {
      playerId: controllerId, objectId: exileId, cardId: card?.cardId ?? null,
    }));
    return true; // decyzja blokuje dalsze efekty zdolności
  }
  if (effect.type === 'fabricate') {
    const amount = effect.amount ?? 1;
    const controllerId = sourceObject.controllerId;
    const source = state.objects.get(sourceObject.id);
    // Stwór mógł opuścić pole bitwy, zanim trigger się rozstrzygnął — wtedy
    // liczniki nie mają na czym usiąść, ale tokeny powstają normalnie
    // (CR 702.122a: wybór nadal należy do gracza).
    state.pendingFabricate = {
      playerId: controllerId,
      sourceId: sourceObject.id,
      cardId: sourceObject.cardId ?? null,
      amount,
      hostOnBattlefield: Boolean(source && source.zone === 'battlefield'),
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('fabricate_choice_required', {
      playerId: controllerId, sourceId: sourceObject.id,
      cardId: sourceObject.cardId ?? null, amount,
    }));
    return true; // decyzja blokuje dalsze efekty
  }
  if (effect.type === 'fight') {
    // Batch 45 (Malamet Battle Glyph, CR 701.12): dwa stwory-cele zadają
    // sobie NAWZAJEM obrażenia równe swojej mocy. Obie moce liczone PRZED
    // zadaniem (jednoczesność — CR 701.12b); jeśli którykolwiek przestał
    // być legalny, ŻADEN nie zadaje obrażeń (CR 701.12c).
    const aId = targets[effect.targetIndexA ?? 0];
    const bId = targets[effect.targetIndexB ?? 1];
    if (aId == null || bId == null) return;
    const a = state.objects.get(aId);
    const b = state.objects.get(bId);
    if (!a || a.zone !== 'battlefield' || a.kind !== 'creature') return;
    if (!b || b.zone !== 'battlefield' || b.kind !== 'creature') return;
    const powerA = Math.max(0, effectivePower(a, state) ?? 0);
    const powerB = Math.max(0, effectivePower(b, state) ?? 0);
    dealNonCombatDamage(state, a, bId, powerA);
    dealNonCombatDamage(state, b, aId, powerB);
    return;
  }
  if (effect.type === 'damage_from_target_power') {
    const dealerId = targets[effect.sourceTargetIndex ?? 0];
    const victimId = targets[effect.targetIndex ?? 1];
    if (!dealerId || !victimId) return;
    const dealer = state.objects.get(dealerId);
    // CR 608.2b: cel, który przestał być legalny, jest w tablicy jako null —
    // brak stwora-źródła albo brak celu = efekt nic nie robi.
    if (!dealer || dealer.zone !== 'battlefield' || dealer.kind !== 'creature') return;
    const victim = state.objects.get(victimId);
    if (!victim || victim.zone !== 'battlefield' || victim.kind !== 'creature') return;
    const amount = Math.max(0, effectivePower(dealer, state) ?? 0);
    dealNonCombatDamage(state, dealer, victimId, amount);
    return;
  }
  if (effect.type === 'damage_from_enchanted_power') {
    // Batch 45 (Pain for All, ETB): „enchanted creature deals damage equal
    // to its power to any other target" — źródłem obrażeń jest GOSPODARZ
    // aury (nie aura); moc efektywna z chwili rozstrzygnięcia (CR 608.2).
    const targetId = targets[0];
    if (targetId == null) return;
    const host = state.objects.get(sourceObject.attachedTo);
    if (!host || host.zone !== 'battlefield' || host.kind !== 'creature') return;
    const amount = Math.max(0, effectivePower(host, state) ?? 0);
    dealNonCombatDamage(state, host, targetId, amount);
    return;
  }
  if (effect.type === 'damage_each_opponent') {
    // „It deals N damage to each opponent" (Fear of Burning Alive, ETB):
    // obrażenia NIEsą combat damage (combat: false — istotne dla triggerów
    // „noncombat damage", np. delirium tej samej karty) i trafiają w KAŻDEGO
    // gracza poza kontrolerem źródła; kontroler jest nienaruszony.
    // amountFrom: 'manaSpent' — wartość z kontekstu triggera (Tellah:
    // „it deals that much damage to each opponent" — wydana mana rzutu).
    // Batch 45 (Pain for All): amountFrom generycznie z kontekstu
    // ('damageAmount' — tyle, ile obrażeń dostał zaczarowany stwór), a
    // fromEnchanted przenosi ŹRÓDŁO obrażeń na gospodarza aury (CR 611.2c
    // — to stwór zadaje, nie aura; istotne dla lifelinka/protection hosta).
    const amount = effect.amountFrom ? (context?.[effect.amountFrom] ?? 0) : effect.amount;
    const dmgSource = effect.fromEnchanted
      ? (state.objects.get(sourceObject.attachedTo) ?? sourceObject)
      : sourceObject;
    for (const player of state.players) {
      if (player.id === sourceObject.controllerId) continue;
      dealNonCombatDamage(state, dmgSource, player.id, amount);
    }
    return;
  }
  if (effect.type === 'gain_control_until_end_of_turn') {
    // Awaken the Sleeper: „Gain control of target creature until end of turn.
    // Untap it. It gains haste until end of turn." Czasowa zmiana kontroli —
    // zapisujemy numer tury, w której wróci do właściciela (cleanup rewersuje).
    const targetId = targets[0];
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    const controllerId = sourceObject.controllerId;
    const ownerId = object.ownerId ?? object.controllerId;
    // M272 (błąd #18): „untap it" z Awaken the Sleeper też podlega
    // zastąpieniu przez licznik stun (CR 122.1d) i blokadzie odkręcania —
    // odkręcenie wykonuje wspólny helper, a nie ręczna mutacja pola.
    // Helper emituje `object_untapped` sam (patrz niżej: warunek na zdarzenie
    // został usunięty), więc kolejność jest: najpierw odkręć, potem przejmij.
    const faktycznieOdkrecony = untapByEffect(state, targetId, controllerId);
    const untapped = state.objects.get(targetId) ?? object;
    const updated = Object.freeze({
      ...untapped,
      controllerId,
      summoningSickness: false, // untap + haste → może atakować od razu
      keywordGrants: [...(untapped.keywordGrants ?? []), 'haste'],
      tempControlUntilTurn: state.turn.number,
      tempControlOwner: ownerId,
    });
    state.objects.set(targetId, updated);
    state.events.push(event('control_changed', {
      objectId: targetId, cardId: updated.cardId,
      controllerId, fromControllerId: object.controllerId, untilEndOfTurn: true,
    }));
    state.events.push(event('keyword_granted', { objectId: targetId, cardId: updated.cardId, keywords: ['haste'] }));
    void faktycznieOdkrecony; // zdarzenie object_untapped emituje helper
    return;
  }
  if (effect.type === 'destroy_equipment_attached') {
    // Awaken: "you may destroy all Equipment attached" — decyzja gracza.
    const targetId = targets[0];
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    const attached = [...state.objects.values()].filter((att) => att.zone === 'battlefield' && att.equipment && att.attachedTo === targetId);
    if (attached.length === 0) return;
    if (effect.confirmed) {
      for (const att of attached) {
        // M270 (błąd #7, CR 122.1e): zniszczenie Equipment to śmierć jak każda
        // inna — strefę docelową wyznacza WSPÓLNY `deathZoneFor` (licznik
        // finality / naznaczenie exileIfDiesThisTurn kierują do wygnania).
        // Ta ścieżka szła na sztywno do cmentarza, więc Equipment zwrócone
        // przez Zoraline („nonland permanent card with mana value 3 or less"
        // — artefakty się kwalifikują) z licznikiem finality dawało się
        // odzyskać drugi raz.
        // M272 (błąd #19): zniszczenie Equipment przechodzi przez ten sam
        // helper co „destroy target permanent" — wcześniej ta ścieżka nie
        // znała ani indestructible (CR 702.12), ani licznika shield, ani
        // regeneracji, więc chroniony Equipment i tak lądował w grobie.
        destroyPermanentByEffect(state, att.id);
      }
      return;
    }
    state.pendingDestroyEquipment = {
      playerId: sourceObject.controllerId,
      targetId,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('optional_trigger_required', {
      playerId: sourceObject.controllerId, sourceId: sourceObject.id, cardId: sourceObject.cardId,
    }));
    return true;
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
    for (const object of creaturesNotControlledByOwner(state)) {
      const ownerId = object.ownerId ?? object.controllerId;
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
    const targetId = sourceObject.controllerId;
    // M276 (błąd #28): obrażenia w kontrolera idą przez CHOKE POINT
    // `dealNonCombatDamage`, a nie własną kopią. Kopia znała tylko prewencję
    // tarcz i zmianę życia, więc gubiła resztę kontraktu obrażeń:
    // lifelink (CR 702.15 — Forge Devil z licznikiem lifelink, CR 122.1b,
    // nie dawał życia), infect (CR 702.90b — obrażenia w gracza mają dawać
    // liczniki trucizny, nie utratę życia) oraz filtr „prevent all damage
    // this turn". Cel jest tu GRACZEM, więc gałęzie permanentowe choke pointu
    // (protection, markDamage, deathtouch) po prostu nie zachodzą.
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
    dealNonCombatDamage(state, sourceObject, targetId, effect.amount);
    return;
  }
  if (effect.type === 'pump') {
    // Trigger bez jawnych celów (np. landfall) pumpuje samo źródło.
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel, który zniknął z pola bitwy przed rozstrzygnięciem
    // (T6 — okno odpowiedzi; źródło triggera może być LKI stubem), sprawia,
    // że efekt nic nie robi.
    const pumpTarget = state.objects.get(targetId);
    if (!pumpTarget || pumpTarget.zone !== 'battlefield' || pumpTarget.kind !== 'creature') return;
    // Dynamiczna wartość „source_power" (np. Jyoti: pump wg mocy źródła).
    // Altar of the Goyf: pump wg liczby typów kart we wszystkich grobach.
    const dynt = (v, fallback) => {
      if (v === 'source_power') return effectivePower(sourceObject, state);
      if (v === 'card_types_in_all_graveyards') return allGraveyardsCardTypeCount(state);
      return v ?? fallback;
    };
    let power = dynt(effect.power, 0);
    let toughness = dynt(effect.toughness, 0);
    // M177/A (You're Not Alone): „If you control three or more creatures,
    // it gets +4/+4 instead” — warunek liczony przy ROZSTRZYGANIU (CR 608.2),
    // bonus ZASTĘPUJE bazową kwotę („instead”), nie sumuje się.
    if (effect.upgradeIfCreatures) {
      const mine = [...state.objects.values()].filter((o) => o.zone === 'battlefield'
        && o.kind === 'creature' && o.controllerId === sourceObject.controllerId).length;
      if (mine >= (effect.upgradeIfCreatures.min ?? 0)) {
        power = effect.upgradeIfCreatures.power ?? power;
        toughness = effect.upgradeIfCreatures.toughness ?? toughness;
      }
    }
    modifyStats(state, targetId, { power, toughness });
    return;
  }
  // Exalted (CR 702.82, Angelic Benediction): „Whenever a creature you control
  // attacks alone, that creature gets +1/+1 until end of turn." Trigger
  // attacks_alone niesie attackerId w context; pumpuje SAMOTNEGO atakującego.
  // modifyStats (powerModifier/toughnessModifier) jest czyszczone w cleanup —
  // efekt działa do końca tury.
  if (effect.type === 'exalted_pump') {
    const attackerId = context?.attackerId ?? targets[0];
    const attacker = state.objects.get(attackerId);
    if (!attacker || attacker.zone !== 'battlefield' || attacker.kind !== 'creature') return;
    modifyStats(state, attackerId, { power: effect.power ?? 1, toughness: effect.toughness ?? 1 });
    return;
  }
  // Investigate (CR 701.37, Floodhound): stwórz token Clue. Token Clue to
  // artefakt z „{2}, Sacrifice this token: Draw a card.".
  if (effect.type === 'create_copy_token') {
    // Cogwork Assembler: „Create a token that's a copy of target artifact.
    // That token gains haste. Exile it at the beginning of the next end step."
    // Kopiujemy cechy artefaktu (CR 707), token dostaje haste (grant do tury)
    // i opóźnione wygnanie na najbliższy end step kontrolera.
    const targetId = targets[0];
    if (!targetId) return;
    const src = state.objects.get(targetId);
    if (!src || src.zone !== 'battlefield') return;
    if (!(src.kind === 'artifact' || (src.types ?? []).includes('Artifact'))) return;
    const ctrl = sourceObject.controllerId;
    // CR 707.2: kopiowane są WYŁĄCZNIE wartości kopiowalne, czyli te wydrukowane
    // na karcie (plus efekty kopiowania i „as enters”). Efekt „until end of
    // turn” zmieniający charakterystyki — animacja artefaktu na stwora
    // (Skilled Animator) — kopiowalny NIE jest. Bez tego token-kopia ożywionego
    // artefaktu rodził się jako stwór 5/5 i po wygaśnięciu animacji oryginału
    // zostawał trwałym stworem, którego karta nigdy nim nie była.
    // `originalBeforeAnimation` trzyma stan sprzed animacji (permanents.js).
    const copyBase = src.originalBeforeAnimation ?? src;
    // M172/D: kopia dostaje kolejny numer wśród żywych kopii tej nazwy —
    // stół pokazuje „Nazwa (kopia N)" (rozróżnialne cele/bloki).
    const copyName = src.cardName ?? src.cardId ?? 'Copy';
    const token = createBattlefieldToken(state, ctrl, {
      cardId: src.cardId, name: copyName,
      copyNumber: nextCopyNumber(state, copyName),
      kind: (copyBase.kind ?? src.kind) === 'creature' ? 'creature' : 'artifact',
      power: copyBase.power ?? null, toughness: copyBase.toughness ?? null,
      colors: [...(src.colors ?? [])], types: [...(copyBase.types ?? src.types ?? [])],
      subtypes: [...(copyBase.subtypes ?? src.subtypes ?? [])],
      keywords: [...new Set([...(src.keywords ?? []), 'haste'])],
      abilities: [...(src.abilities ?? [])],
      // CR 202.3b (M258): kopia TYLNEJ twarzy karty dwustronnej ma MV 0,
      // a kopia przedniej/przodowej twarzy — koszt pierwowzoru. Wcześniej
      // pole lądowało cicho w createBattlefieldToken (destrukturyzacja go
      // nie znała), więc KAŻDY token-kopia miał MV 0 (Divine Offering
      // dawałby 0 życia za kopię Wynnogiefu). Wspólny helper — patrz
      // identity.js copyManaValueOf.
      manaCost: copyManaValueOf(src),
      // M141/B (station + animacja, saga): token-kopia traciła deskryptor
      // station/saga — stąd np. kopia Wedgelight Rammer nie miała progu 9+
      // i nigdy nie stawała się stworem (CR 707.2 — kopiowalne wartości to
      // WSZYSTKIE wydrukowane cechy, w tym station i saga). Używamy
      // copyBase (stan PRZED animacją), żeby nie kopiować efektu „until EOT".
      ...(src.station ? { station: src.station } : {}),
      ...(src.saga ? { saga: src.saga } : {}),
      // CR 707.8a (M90): token-kopia karty DWUSTRONNEJ jest tokenem
      // dwustronnym — ma obie strony, a charakterystyki każdej biorą się
      // z wartości kopiowalnych tej samej strony oryginału. Bez tego token
      // kopiował zdolność craft/transform, ale nie miał drugiej strony:
      // aktywacja craftu na tokenie-kopii Lodestone Needle rzucała wyjątkiem
      // „Ta karta nie ma drugiej strony (craft)" i przerywała partię (crash
      // ujawniony pełną macierzą benchmarku B0).
      ...(src.transformTo ? { transformTo: src.transformTo } : {}),
      // M264/2.3 (CR 707.8a): dwustronny token zna też front pary — inaczej
      // kopia TYLNEJ twarzy nie odróżnia się od zwykłego obiektu na tyle
      // (MV 0 — CR 202.3b przez copyManaValueOf; reset K5 — CR 711.4a).
      ...(src.transformTo && src.frontFaceId ? { frontFaceId: src.frontFaceId } : {}),
    });
    // M105/B6 (CR 603.7b): „Exile it at the beginning of THE NEXT end step"
    // — najbliższy krok końcowy, niezależnie od tego, czyja to tura.
    // Zdolność Cogwork Assembler ({7}, bez ograniczenia czasowego) bywa
    // aktywowana w turze przeciwnika; wcześniej wpis czekał na krok końcowy
    // KONTROLERA, więc token-kopia przeżywał całą turę przeciwnika i wracał
    // do ataku. Puppeteer Clique („YOUR next end step") zostaje bez flagi.
    state.delayedTriggers.push({
      type: 'exile_object', objectId: token.id, playerId: ctrl,
      anyPlayerEndStep: true,
      armedOnTurn: state.turn.number, cardId: token.cardId,
      // M262: badge „Wygnane: <źródło>" — token znika z efektu karty.
      exiledBy: sourceObject.cardId,
    });
    return;
  }
  if (effect.type === 'return_source_from_graveyard_to_hand') {
    // Furious Forebear: po zapłacie {1}{W} karta wraca z grobu na rękę
    // właściciela (CR 400.7 — nowy obiekt).
    const object = state.objects.get(sourceObject.id);
    if (!object || object.zone !== 'graveyard') return;
    const ownerId = object.ownerId ?? object.controllerId;
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sourceObject.id, 'hand', handId);
    const inHand = Object.freeze({ ...moved, controllerId: ownerId });
    state.objects.set(handId, inHand);
    state.events.push(event('object_moved', {
      fromId: sourceObject.id, object: inHand, fromZone: 'graveyard', toZone: 'hand',
    }));
    return;
  }
  if (effect.type === 'copy_creature') {
    // Jwari Shapeshifter: „have this creature enter as a copy of any Ally
    // creature on the battlefield" — źródło przyjmuje cechy celu (CR 707).
    const targetId = targets[0];
    if (!targetId) return; // „you may" bez celu — zostaje 0/0 (ginie SBA)
    const target = state.objects.get(targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') return;
    const src = state.objects.get(sourceObject.id);
    if (!src || src.zone !== 'battlefield') return;
    const updated = Object.freeze({
      ...src,
      power: target.power, toughness: target.toughness,
      colors: [...(target.colors ?? [])],
      types: [...(target.types ?? [])],
      subtypes: [...(target.subtypes ?? [])],
      keywords: [...(target.keywords ?? [])],
      abilities: [...(target.abilities ?? [])],
      cardName: target.cardName ?? target.cardId,
    });
    state.objects.set(sourceObject.id, updated);
    state.events.push(event('stats_modified', {
      objectId: sourceObject.id, cardId: updated.cardId,
      powerModifier: 0, toughnessModifier: 0, copy: true,
    }));
    return;
  }
  if (effect.type === 'prevent_combat_damage_except_enchanted') {
    // Inspire Awe: „Prevent all combat damage that would be dealt this turn
    // except combat damage that would be dealt by enchanted creatures and
    // enchantment creatures." Flaga aktywna do cleanup; combat.js pyta ją
    // dla każdego źródła obrażeń combat.
    state.preventCombatExceptEnchanted = true;
    state.events.push(event('damage_prevention_started', {
      sourceId: sourceObject.id, cardId: sourceObject.cardId, inspireAwe: true,
    }));
    return;
  }
  if (effect.type === 'job_select') {
    // Warrior's Sword (FIN): „Job select (When this Equipment enters, create a
    // 1/1 colorless Hero creature token, then attach this to it.)" — tworzymy
    // token Hero i przypinamy do niego źródło-equipment.
    const ctrl = sourceObject.controllerId;
    const hero = createBattlefieldToken(state, ctrl, {
      cardId: 'token_hero', name: 'Hero', kind: 'creature', power: 1, toughness: 1,
      colors: [], types: ['Creature'], subtypes: ['Hero'],
    });
    // Przypnij źródło (equipment) do tokenu Hero.
    const equipment = state.objects.get(sourceObject.id);
    if (equipment && equipment.zone === 'battlefield' && equipment.equipment) {
      const attached = Object.freeze({ ...equipment, attachedTo: hero.id });
      state.objects.set(sourceObject.id, attached);
      state.events.push(event('object_attached', {
        // M102/U2: kontrakt zdarzenia musi być TEN SAM co w emitAttached
        // (attachments.js): { objectId, cardId, hostId, hostCardId, via }.
        // Wcześniej job select emitował `attachmentId`/`attachmentCardId`,
        // więc czytelnik logu brał `e.cardId` → undefined i pokazywał graczowi
        // „? zostaje załączony do Hero (bestow)".
        objectId: sourceObject.id, hostId: hero.id,
        cardId: equipment.cardId, controllerId: equipment.controllerId,
        hostCardId: 'token_hero', via: 'job_select',
      }));
    }
    return;
  }
  if (effect.type === 'reveal_subtype_deal_damage') {
    // M158/Batch 39 (Invasion of the Giants II): „Then you may reveal a
    // Giant card from your hand. When you do, this Saga deals 2 damage to
    // target opponent or planeswalker." — blokująca decyzja gracza
    // (pendingRevealChoice): ujawnij kartę podtypu (obrażenia) albo zrezygnuj.
    const controllerId = sourceObject.controllerId;
    const subtype = effect.subtype ?? null;
    const cardIds = state.zones.hand.filter((id) => {
      const card = state.objects.get(id);
      return card && card.controllerId === controllerId
        && subtype != null && (card.subtypes ?? []).includes(subtype);
    });
    if (cardIds.length === 0) return;
    state.pendingRevealChoice = {
      playerId: controllerId,
      cardIds: [...cardIds],
      amount: effect.amount ?? 2,
      sourceId: sourceObject.id,
      cardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('reveal_choice_required', {
      playerId: controllerId, subtype, count: cardIds.length, amount: effect.amount ?? 2,
    }));
    return;
  }
  if (effect.type === 'next_spell_discount') {
    // M158/Batch 39 (Invasion of the Giants III): „The next Giant spell you
    // cast this turn costs {2} less to cast." — rabat jednorazowy (konsumowany
    // przez cast*), wygasa w cleanup („this turn").
    const controllerId = sourceObject.controllerId;
    const entry = { playerId: controllerId, amount: effect.amount ?? 2, subtype: effect.subtype ?? null };
    state.pendingSpellDiscounts = [
      ...(state.pendingSpellDiscounts ?? []).filter((d) => !(d.playerId === controllerId && d.subtype === entry.subtype)),
      entry,
    ];
    state.events.push(event('spell_discount_armed', {
      playerId: controllerId, amount: entry.amount, subtype: entry.subtype,
    }));
    return;
  }
  if (effect.type === 'apply_to_each_target') {
    // M158/Batch 39 (Wrap in Flames): „deals 1 damage to EACH of up to three
    // target creatures. Those creatures can't block this turn." — generyczny
    // wrapper aplikujący listę efektów wewnętrznych RAZ NA CEL (cele
    // wielokrotne z variableTargets czaru). Cele nielegalne pomijają efekty
    // same (CR 608.2b — każdy wewnętrzny efekt sprawdza strefę).
    const inner = Array.isArray(effect.effects) ? effect.effects : [];
    for (const targetId of targets) {
      for (const innerEffect of inner) {
        applyEffect(state, innerEffect, sourceObject, [targetId], context);
      }
    }
    return;
  }
  if (effect.type === 'regenerate') {
    // M158/Batch 39 (Exterminator Magmarch, CR 701.12): „{1}{B}: Regenerate
    // this creature." — tarcza regeneracji do końca tury; zużywa ją
    // tryRegenerate przy próbie zniszczenia (state-based/effects), a cleanup
    // czyści niewykorzystane tarcze (razem z cantBeRegeneratedThisTurn).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    if (!(state.regenerationShields ?? []).includes(targetId)) {
      state.regenerationShields = [...(state.regenerationShields ?? []), targetId];
    }
    state.events.push(event('regeneration_shield_added', {
      objectId: targetId, cardId: object.cardId, playerId: sourceObject.controllerId,
    }));
    return;
  }
  if (effect.type === 'each_player_loses_life_fraction') {
    // M158/Batch 39 (Dire Fleet Ravager): „each player loses a third of their
    // life, rounded up" — generyczny ułamek (numerator/denominator), zaokr.
    // w górę; to UTRATA życia, nie obrażenia (jak lose_life — bez triggerów
    // damage i bez prewencji).
    const numerator = effect.numerator ?? 1;
    const denominator = effect.denominator ?? 3;
    for (const player of state.players) {
      const loss = Math.ceil((player.life * numerator) / denominator);
      if (loss > 0) changeLife(state, player.id, -loss);
    }
    state.events.push(event('players_lost_life_fraction', {
      sourceId: sourceObject.id, cardId: sourceObject.cardId,
      numerator, denominator,
    }));
    return;
  }
  if (effect.type === 'damage_divided') {
    // M166/D (Inferno Titan, LTC): „deals 3 damage divided as you choose
    // among one, two, or three targets". Cele wybrane w decyzji multi-target
    // (M157/F4a); jeden cel = całość, więcej celów = kwoty wybiera kontroler
    // w JEDNEJ komendzie (pendingDamageDivision + resolve_damage_division —
    // kompozycje total na N części po ≥1, przestrzeń: 3=[3]|[2,1]|[1,1,1]).
    const total = effect.amount ?? 3;
    const chosen = (targets ?? []).filter((id) => id != null);
    if (chosen.length === 0) return;
    if (chosen.length === 1) {
      dealNonCombatDamage(state, sourceObject, chosen[0], total);
      return;
    }
    // M171/Z6 (CR 603.3d/601.2d): kwoty ZADEKLAROWANE przy umieszczaniu na
    // stosie jadą w context.damageDivision (announce w resolve_trigger_target,
    // zapis na wpisie stosu). Cel nielegalny przy rozstrzyganiu nie dostaje
    // nic — bez realokacji (CR 608.2b). Brak deklaracji przy >=2 celach =
    // producent ominął ścieżkę announce (pierwszy CZAR z damage_divided —
    // strażnik w test/m171-damage-division-announce.test.js) — jawny błąd
    // zamiast cichej ścieżki niezgodnej z CR (L52).
    const declared = Array.isArray(context.damageDivision) ? context.damageDivision : null;
    if (!declared || declared.length !== chosen.length) {
      throw new Error('damage_divided: podział niezadeklarowany przy umieszczaniu na stosie (CR 601.2d/603.3d)');
    }
    for (let i = 0; i < chosen.length; i += 1) {
      const targetId = chosen[i];
      const isPlayer = state.players.some((pl) => pl.id === targetId);
      const stillLegal = isPlayer || (state.objects.get(targetId)?.zone === 'battlefield');
      if (!stillLegal) continue; // CR 608.2b: kwota przepada.
      dealNonCombatDamage(state, sourceObject, targetId, declared[i]);
    }
    return;
  }
  if (effect.type === 'opponents_lose_life_if_poison') {
    // M166/B (Feed the Infection, Corrupted — ONE): „Each opponent who has
    // three or more poison counters loses 3 life." Warunek rozstrzygany
    // PER PRZECIWNIK na rozpatrywaniu efektu (poison jest w stanie gry —
    // M157/F). Utrata życia, nie obrażenia (nie da się zapobiec).
    const min = effect.min ?? 3;
    const amount = effect.amount ?? 3;
    for (const player of state.players) {
      if (player.id === sourceObject.controllerId) continue;
      if ((player.poison ?? 0) < min) continue;
      changeLife(state, player.id, -amount);
    }
    return;
  }
  if (effect.type === 'becomes_subtype_until_end_of_turn') {
    // M158/Batch 39 (Wishful Merfolk): „This creature loses defender and
    // becomes a Human until end of turn." — nadpisanie podtypów DO KOŃCA TURY
    // (wzorzec originalBeforeAnimation: zapamiętany oryginał, cleanup
    // przywraca) + tymczasowa utrata keywordów (lostKeywordsUntilEOT
    // odejmowane w effectiveKeywords).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    const patch = {
      lostKeywordsUntilEOT: Object.freeze([
        ...new Set([...(object.lostKeywordsUntilEOT ?? []), ...(effect.losesKeywords ?? [])]),
      ]),
    };
    if (Array.isArray(effect.subtypes) && effect.subtypes.length > 0 && !object.subtypesBeforeOverride) {
      patch.subtypesBeforeOverride = Object.freeze([...(object.subtypes ?? [])]);
      patch.subtypes = Object.freeze([...effect.subtypes]);
    }
    state.objects.set(targetId, Object.freeze({ ...object, ...patch }));
    state.events.push(event('became_subtype', {
      objectId: targetId, cardId: object.cardId,
      subtypes: [...(patch.subtypes ?? object.subtypes ?? [])],
      lostKeywords: [...(effect.losesKeywords ?? [])],
      untilEndOfTurn: true,
    }));
    return;
  }
  if (effect.type === 'attach_self_to_target') {
    // M158/Batch 39 (Squire's Lightblade): „When this Equipment enters,
    // attach it to target creature you control." — przypięcie ŹRÓDŁA
    // (equipmentu) do wybranego celu; trigger z requiresTarget
    // creature_you_control. Generyczne: dowolny equipment z ETB-attach,
    // cel wybiera gracz (jak living weapon, ale z wyborem).
    const targetId = targets[0];
    if (!targetId) return;
    const target = state.objects.get(targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') return;
    const self = state.objects.get(sourceObject.id);
    if (!self || self.zone !== 'battlefield' || !self.equipment) return;
    attachEquipmentToCreature(state, sourceObject.id, targetId);
    return;
  }
  if (effect.type === 'living_weapon') {
    // Living weapon (CR 702.91, Strandwalker): „When this Equipment enters,
    // create a 0/0 black Phyrexian Germ creature token, then attach this to
    // it.” — jak job_select, ale token to 0/0 Germ (żyje dzięki +2/+4
    // z equipmentu). Deskryptor tokenu generyczny (dane karty, ADR 0002).
    const ctrl = sourceObject.controllerId;
    const germ = createBattlefieldToken(state, ctrl, {
      cardId: effect.cardId ?? 'token_germ',
      name: effect.name ?? 'Germ',
      kind: 'creature',
      power: 0, toughness: 0,
      colors: ['B'],
      types: ['Creature'],
      subtypes: ['Phyrexian', 'Germ'],
    });
    const equipment = state.objects.get(sourceObject.id);
    if (equipment && equipment.zone === 'battlefield' && equipment.equipment) {
      const attached = Object.freeze({ ...equipment, attachedTo: germ.id });
      state.objects.set(sourceObject.id, attached);
      state.events.push(event('object_attached', {
        objectId: sourceObject.id, hostId: germ.id,
        cardId: equipment.cardId, controllerId: equipment.controllerId,
        hostCardId: 'token_germ', via: 'living_weapon',
      }));
    }
    return;
  }
  if (effect.type === 'investigate') {
    const amount = effect.amount ?? 1;
    for (let i = 0; i < amount; i += 1) {
      createBattlefieldToken(state, sourceObject.controllerId, {
        cardId: 'token_clue', name: 'Clue', kind: 'artifact',
        types: ['Artifact', 'Token'], subtypes: ['Clue'], colors: [],
        abilities: [{
          type: 'activated', cost: { mana: 2, sacrificeSelf: true },
          effect: { type: 'draw_cards', amount: 1 },
        }],
      });
    }
    return;
  }
  // Efekt zastępczy tworzenia tokenów (CR 614; Moonlit Meditation, EOE):
  // „The first time you would create one or more tokens each turn, you may
  // instead create that many tokens that are copies of enchanted permanent.”
  //
  // M117 (ADR 0002): engine szuka DESKRYPTORA `aura.replaceTokenCreation`,
  // a nie konkretnego `cardId`. Wcześniej warunek brzmiał
  // `a?.cardId === 'moonlit-meditation'`, czyli core rozpoznawał zachowanie
  // po identyfikatorze karty — dokładnie to, czego zabrania ADR 0002.
  if (effect.type === 'create_token' && !state.moonlitUsedThisTurn?.[sourceObject.controllerId]) {
    const ctrl = sourceObject.controllerId;
    const moonlitAuraId = state.zones.battlefield.find((aid) => {
      const a = state.objects.get(aid);
      return a?.aura?.replaceTokenCreation?.copiesOfEnchanted
        && a.controllerId === ctrl && a.attachedTo;
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
  // Cloak (Veiled Ascension, MKC; CR 702.75 — „cloak"): wierzch biblioteki
  // gracza na pole bitwy TWARZĄ W DÓŁ jako bezimienny stwór 2/2 bez zdolności
  // (jak morph). Rzeczywisty cardId zostaje ukryty (faceDown), a obiekt ma
  // cechy tylko 2/2 (CR 708.2). Wracający na górę po obrocie twarzą do góry
  // odzyskuje cechy karty (turnFaceUp).
  if (effect.type === 'cloak') {
    const controllerId = sourceObject.controllerId;
    const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === controllerId);
    if (ownLibrary.length === 0) return; // pusta biblioteka — brak karty do cloak
    const topId = ownLibrary[0];
    const topObj = state.objects.get(topId);
    const battleId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, topId, 'battlefield', battleId);
    const cloaked = Object.freeze({
      ...moved,
      faceDown: true,
      kind: 'creature',
      power: 2, toughness: 2,
      types: ['Creature'],
      subtypes: [],
      // M258/F3 (CR 702.75): zakryty permanent to stwór 2/2 z WARD {2} —
      // pełna mechanika CR 702.21 (decyzja właściciela: żadnych
      // limitations), nie wpis w support.limitations. Keyword + kwota
      // (czyta wardAmountOf).
      keywords: ['ward'],
      abilities: [],
      colors: [],
      cardName: null,
      manaCost: 0,
      ward: 2,
      summoningSickness: true,
      tapped: false,
    });
    state.objects.set(battleId, cloaked);
    // Veiled Ascension (MKC): „Face-down creatures you control enter with a
    // flying counter on them." — wspólny helper (morph/ cloak / inne ścieżki
    // wejścia zakrytych stworów — patrz maybeAddFaceDownFlyingCounter).
    maybeAddFaceDownFlyingCounter(state, controllerId, battleId);
    state.events.push(event('permanent_entered_battlefield', {
      fromId: topId, objectId: battleId, object: cloaked, cardId: cloaked.cardId,
      controllerId, cloaked: true, faceDown: true,
    }));
    return;
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
    // Flurry of Wings (ARB): „Create X ... where X is the number of attacking
    // creatures" — liczba atakujących w toczącym się combacie (liczona przy
    // rozstrzyganiu czaru, jak X z planszy).
    if (effect.amount === 'attacking_creatures_count') {
      amount = state.combat?.attackers?.length ?? 0;
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
    // M69 (Relic Robber): token tworzy GRACZ-CEL, nie kontroler źródła —
    // „that player creates a token" (combat_damage_to_player niesie
    // damagedPlayerId w context triggera).
    const tokenController = effect.controllerFromEvent
      ? (context[effect.controllerFromEvent] ?? sourceObject.controllerId)
      : sourceObject.controllerId;
    for (let i = 0; i < amount; i += 1) {
      createBattlefieldToken(state, tokenController, {
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
        // M69 (Relic Robber — Goblin Construct „This token can't block").
        cantBlock: Boolean(effect.cantBlock),
        // Batch 45 (Crawling Chorus — token Mite z toxic 1, CR 702.180).
        ...(effect.toxic != null ? { toxic: effect.toxic } : {}),
        // M147 (Static Net — Powerstone): token wchodzi ZATAPNIĘTY.
        tapped: Boolean(effect.tapped),
      });
    }
    return;
  }
  // M109 (Tiller of Flesh — incubate N, CR 701.47): „Create an Incubator token
  // with N +1/+1 counters on it and ”{2}: Transform this token.” It transforms
  // into a 0/0 Phyrexian artifact creature." Token jest DWUSTRONNY (CR 707.8a):
  // strona przednia to artefakt, tylna — artefaktowy stwór 0/0; liczniki
  // zostają na permanencie po przemianie (CR 707.9), więc na stole to N/N.
  if (effect.type === 'incubate') {
    const amount = effect.amount ?? 2;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Incubate wymaga nieujemnej liczby liczników');
    const token = createBattlefieldToken(state, sourceObject.controllerId, {
      cardId: 'token_incubator', name: 'Incubator', kind: 'artifact',
      power: null, toughness: null, colors: [],
      types: ['Artifact', 'Token'], subtypes: ['Incubator'], keywords: [],
      abilities: [Object.freeze({
        type: 'activated', timing: 'instant', keyword: null,
        cost: Object.freeze({ mana: 2 }),
        effect: Object.freeze({ type: 'transform' }),
        trigger: null, targets: null, cycling: null, condition: null, pump: null,
        keywords: null, oncePerTurn: false, mustAttack: false,
      })],
      transformTo: {
        cardId: 'token_phyrexian', cardName: 'Phyrexian',
        kind: 'creature', power: 0, toughness: 0,
        types: ['Artifact', 'Creature', 'Token'], subtypes: ['Phyrexian'],
        keywords: [], abilities: [],
      },
      // M264/2.3 (CR 701.51 + 707.8a): Incubator to dwustronny token
      // „z własnym zestawem cech" — zna front pary, więc ewentualna kopia
      // Phyrexiana (tył) policzy MV 0 i reset K5 zadziała jak dla każdego
      // dwustronnego obiektu (bez tego frontFaceId ginął na zawsze).
      frontFaceId: 'token_incubator',
    });
    if (amount > 0) addCounter(state, token.id, '+1/+1', amount);
    return;
  }
  // M109 (Spare from Evil): „Creatures you control gain protection from
  // non-Human creatures until end of turn." Zbiór objętych stworów ustala się
  // W CHWILI ROZSTRZYGNIĘCIA (CR 611.2c) — stwór, który wejdzie później,
  // ochrony nie dostaje. Deskryptor jakości jest generyczny (ADR 0002).
  if (effect.type === 'grant_protection_until_end_of_turn') {
    const controllerId = sourceObject.controllerId;
    const objectIds = state.zones.battlefield.filter((id) => {
      const object = state.objects.get(id);
      return object?.zone === 'battlefield' && object.kind === 'creature'
        && object.controllerId === controllerId;
    });
    state.untilEndOfTurnProtections = [
      ...(state.untilEndOfTurnProtections ?? []),
      Object.freeze({
        controllerId,
        objectIds: Object.freeze([...objectIds]),
        quality: Object.freeze({ ...(effect.protection ?? {}) }),
      }),
    ];
    state.events.push(event('protection_granted', {
      playerId: controllerId, objectIds: [...objectIds],
      sourceCardId: sourceObject.cardId ?? null,
      protection: { ...(effect.protection ?? {}) },
    }));
    return;
  }
  if (effect.type === 'buff_creatures_you_control') {
    // Globalny buff do końca tury (Angel of the Dawn +1/+1 vigilance, Your
    // Temple — indestructible): efekt CIĄGŁY do końca tury, ale CR 611.2c —
    // „the set of objects it affects is determined when that continuous
    // effect begins" — zbiór stworów ustala się W CHWILI ROZSTRZYGNIĘCIA.
    // Wpis niesie więc listę objectIds; stwór, który wejdzie później, buffa
    // NIE dostaje (M101/B2 — wcześniej wpis był bezlistowy i łapał wszystko,
    // co pojawiło się do końca tury).
    // Batch 43 (Rush of Battle): „Warrior creatures you control gain lifelink"
    // — opcjonalny filtr `subtype` zawęża zbiór (ustalany przy rozstrzygnięciu,
    // CR 611.2c — jak cała lista objectIds).
    const buffIds = affectedCreatureIds(state, sourceObject.controllerId, false)
      .filter((id) => !effect.subtype
        || (state.objects.get(id)?.subtypes ?? []).includes(effect.subtype));
    state.untilEndOfTurnBuffs = [
      ...(state.untilEndOfTurnBuffs ?? []),
      Object.freeze({
        controllerId: sourceObject.controllerId,
        opponent: false,
        objectIds: Object.freeze(buffIds),
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
        keywords: Object.freeze([...(effect.keywords ?? [])]),
      }),
    ];
    emitMassBuff(state, sourceObject, state.untilEndOfTurnBuffs[state.untilEndOfTurnBuffs.length - 1], 'yours');
    return;
  }
  if (effect.type === 'buff_attacking_creatures') {
    // Batch 51 (Thunderstaff): „Attacking creatures get +1/+0 until end of
    // turn." — zbiór objętych stworów ustala się W CHWILI ROZSTRZYGNIĘCIA
    // (CR 611.2c), więc stwór wchodzący na pole bitwy później buffa NIE
    // dostaje (ten sam wzorzec co buff_creatures_you_control, M101/B2).
    // Poza walką `state.combat` jest pusty — efekt legalnie nic nie robi.
    const attackerIds = state.combat?.attackers ?? [];
    const buffIds = attackerIds.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature';
    });
    if (buffIds.length === 0) return;
    state.untilEndOfTurnBuffs = [
      ...(state.untilEndOfTurnBuffs ?? []),
      Object.freeze({
        controllerId: sourceObject.controllerId,
        opponent: false,
        objectIds: Object.freeze(buffIds),
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
        keywords: Object.freeze([...(effect.keywords ?? [])]),
      }),
    ];
    emitMassBuff(state, sourceObject, state.untilEndOfTurnBuffs[state.untilEndOfTurnBuffs.length - 1], 'attacking');
    return;
  }
  if (effect.type === 'buff_creature_until_end_of_turn') {
    // Altar of the Goyf: „Whenever a creature you control attacks alone, it
    // gets +X/+X until end of turn, where X is the number of card types among
    // cards in all graveyards." — pump TYLKO celu (atakującego) do końca tury.
    // Wartość X dynamiczna (card_types_in_all_graveyards), liczona przy
    // rozstrzygnięciu (jak pump source_power / card_types).
    // M254/E (zgłoszenie właściciela, Altar of the Goyf): trigger
    // `attacks_alone` niesie atakującego w `context.attackerId`. Zdolność
    // siedzi na ARTEFAKCIE („whenever a creature you control attacks alone,
    // IT gets +X/+X"), więc bez tego spadku efekt pumpował ŹRÓDŁO — a źródło
    // nie jest stworem, więc wychodziło „trigger bez efektu (nie było czego
    // wykonać)". Ten sam wzorzec co `exalted_pump` wyżej (ADR 0002: reguła po
    // treści efektu, nie po tym, kto niesie zdolność).
    const targetId = targets[0] ?? context?.attackerId ?? sourceObject.id;
    const target = state.objects.get(targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') return; // CR 608.2b
    const dyn = (v, fb) => {
      if (v === 'card_types_in_all_graveyards') return allGraveyardsCardTypeCount(state);
      if (v === 'source_power') return effectivePower(sourceObject, state);
      return v ?? fb;
    };
    const power = dyn(effect.power, 0);
    const toughness = dyn(effect.toughness, 0);
    const keywords = Object.freeze([...(effect.keywords ?? [])]);
    state.untilEndOfTurnBuffs = [
      ...(state.untilEndOfTurnBuffs ?? []),
      Object.freeze({
        objectId: targetId,
        controllerId: target.controllerId,
        opponent: false,
        power,
        toughness,
        keywords,
      }),
    ];
    // M255/A (pętla jakości Żywym Testerem, Kulrath Mystic): skutek bez
    // zdarzenia jest dla reszty systemu NIEWIDZIALNY, a `resolveTrigger`
    // czyta „0 nowych zdarzeń” jako „trigger bez efektu” — log mówił
    // graczowi „nie było czego wykonać” w chwili, gdy stwór realnie dostał
    // +2/+0 i czujność (klasa M138/Z4 dla `set_base_pt_until_end_of_turn`).
    // Ten sam wzorzec co masowe buffy (`emitMassBuff`): buff ogłasza się
    // zdarzeniem, nawet gdy jedyną zmianą jest wpis w `untilEndOfTurnBuffs`.
    // Dotyczy też Altara of the Goyf po naprawie M254/E — tam komunikat był
    // prawdziwy (pompowany był artefakt), teraz byłby kłamstwem.
    state.events.push(event('stats_modified', {
      objectId: targetId,
      cardId: target.cardId,
      powerModifier: power,
      toughnessModifier: toughness,
      untilEndOfTurn: true,
    }));
    if (keywords.length > 0) {
      state.events.push(event('keyword_granted', {
        objectId: targetId,
        cardId: target.cardId,
        keywords: [...keywords],
        untilEndOfTurn: true,
      }));
    }
    return;
  }
  // M115 (Krumar Initiate, TDM): „This creature endures X" — X z kosztu
  // aktywacji. Endure to WYBÓR kontrolera (CR: X liczników +1/+1 na źródle
  // albo token Spirit X/X) — kolejkujemy tę samą decyzję, co endure z ETB
  // (Kin-Tree Nurturer), tylko z wartością dynamiczną.
  if (effect.type === 'endure_x') {
    const amount = effect.amount ?? context?.xValue ?? 0;
    if (!Number.isInteger(amount) || amount <= 0) return; // endure 0 nic nie robi
    const controllerId = sourceObject.controllerId;
    state.pendingEndures.push({
      playerId: controllerId,
      sourceId: sourceObject.id,
      counters: amount,
      restorePriorityTo: state.turn.priorityPlayerId,
    });
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('endure_choice_required', {
      playerId: controllerId, sourceId: sourceObject.id,
      cardId: sourceObject.cardId ?? null, counters: amount,
    }));
    return true;
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
    // Chronic Flooding: „ITS CONTROLLER mills three cards" — mieli kontroler
    // ZACZAROWANEGO permanentu, a nie kontroler aury (CR 109.5). Deskryptor
    // `applyTo: 'enchanted_controller'` jest generyczny (ADR 0002).
    const enchantedHost = effect.applyTo === 'enchanted_controller' && sourceObject.attachedTo
      ? state.objects.get(sourceObject.attachedTo)
      : null;
    if (effect.applyTo === 'enchanted_controller' && (!enchantedHost || enchantedHost.zone !== 'battlefield')) {
      return; // aura odpięta w oknie odpowiedzi — brak skutku (CR 608.2b)
    }
    const targetPlayerId = millTargetPlayerId(state, effect, sourceObject, targets);
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
    // w tej turze) → pole bitwy zamiast ręki. Wybór karty należy do gracza.
    // Caravan Vigil (CR): „Search your library for a basic land ... put it
    // into your hand, then shuffle. Morbid — You MAY put that card onto the
    // battlefield instead of into your hand if a creature died this turn."
    // Ręka jest ZAWSZE dozwolona; przy morbid gracz wybiera ręka ALBO pole bitwy.
    const toBattlefield = Boolean(state.creatureDiedThisTurn);
    return queueSearchChoice(state, sourceObject, {
      qualifier: { types: ['Basic', 'Land'] },
      destination: 'hand',
      destinations: toBattlefield ? ['hand', 'battlefield'] : null,
      entersTapped: false,
    });
  }
  if (effect.type === 'search_library_two_cards_hand_and_grave') {
    // Final Parting (DOM): „Search your library for two cards. Put one into
    // your hand and the other into your graveyard. Then shuffle.” — dwa
    // OBOWIĄZKOWE wybory (bez kryterium = bez fail to find): najpierw karta
    // do ręki, potem łańcuchem (jak Springbloom) karta do grobu.
    return queueSearchChoice(state, sourceObject, {
      qualifier: {},
      destination: 'hand',
      entersTapped: false,
      mandatory: true,
      chain: { remaining: 1, destination: 'graveyard', qualifier: {}, mandatory: true },
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
  // M174/E (Halo Forager, MOM): „you may pay {X}. When you do, you may cast
  // target instant or sorcery card with mana value X from a graveyard
  // without paying its mana cost. If that spell would be put into a
  // graveyard, exile it instead." Model: JEDNA decyzja (wybór karty = X i
  // rzut; rezygnacja = nic) — wzorzec pendingMadnessCast/Epic; kandydaci
  // liczeni ŻYWO w playerView (dowolny grób, MV == X, w zakresie epicCastOffers).
  if (effect.type === 'pay_x_cast_from_graveyard') {
    state.pendingGraveFreeCast = {
      playerId: sourceObject.controllerId,
      sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('grave_free_cast_required', {
      playerId: sourceObject.controllerId, sourceCardId: sourceObject.cardId ?? null,
    }));
    return true;
  }
  if (effect.type === 'amass') {
    // Amass N: wybierz istniejącą Army kontrolera albo utwórz 0/0 Army,
    // następnie połóż N liczników +1/+1. Deskryptor nie zna nazwy karty.
    const amount = effect.amount ?? 0;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Amass wymaga nieujemnej liczby liczników');
    const subtype = effect.subtype ?? 'Orc';
    const armies = [...state.objects.values()].filter((object) => object.zone === 'battlefield'
      && object.controllerId === sourceObject.controllerId && object.kind === 'creature'
      && (object.subtypes ?? []).includes('Army'));
    // CR 701.43: „Amass N — Choose an Army you control or create one" — przy
    // 2+ armiach gracz wybiera (blokująca decyzja resolve_amass_choice).
    if (armies.length > 1) {
      state.pendingAmass = {
        playerId: sourceObject.controllerId,
        armyIds: armies.map((a) => a.id),
        amount, subtype,
        sourceCardId: sourceObject.cardId ?? null,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = sourceObject.controllerId;
      state.events.push(event('amass_choice_required', {
        playerId: sourceObject.controllerId, armyIds: armies.map((a) => a.id),
        amount, cardId: sourceObject.cardId,
      }));
      return true;
    }
    let army = armies[0];
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
    const buffed = [];
    for (const object of landCreaturesYouControl(state, sourceObject.controllerId)) {
      modifyStats(state, object.id, { power, toughness });
      buffed.push(object.id);
    }
    if (buffed.length > 0) {
      emitMassBuff(state, sourceObject, { objectIds: buffed, power, toughness, keywords: [] }, 'your_lands');
    }
    return;
  }
  if (effect.type === 'draw_cards') {
    // Dobranie N kart przez kontrolera źródła (Phyrexian Rager, Evangel of
    // Synthesis) albo GRACZA-CELU przy applyTo:'target' (Inspiration:
    // „Target player draws two cards"). Pusta biblioteka NIE kończy tu gry —
    // przegraną z powodu pustej biblioteki rozstrzyga próba dobrania w kroku
    // draw (jak dotąd); efekt karty po prostu nie dobiera niczego więcej.
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Dobranie wymaga dodatniej liczby kart');
    // M67 (Batch 27): cel-gracz jak w discard_cards (Dementia Bat) — targets[0].
    const targetPlayerId = effect.applyTo === 'target' ? targets[0] : sourceObject.controllerId;
    if (effect.applyTo === 'target' && !state.players.some((entry) => entry.id === targetPlayerId)) {
      throw new Error('Nieprawidłowy gracz-cel dobrania');
    }
    drawPlayerCards(state, targetPlayerId, amount, 'effect');
    return;
  }
  if (effect.type === 'mill_both_players') {
    // Ghoulcaller's Bell: „{T}: Each player mills a card." — mieli OBAJ gracze
    // (własną bibliotekę i przeciwnika). Pełna ścieżka mill_cards (ochrona
    // scry/surveil, eventy card_milled) — reużywana per gracz.
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Mill wymaga dodatniej liczby kart');
    const opponentId = state.players.find((p) => p.id !== sourceObject.controllerId)?.id;
    applyEffect(state, { type: 'mill_cards', amount }, sourceObject, [sourceObject.controllerId], context);
    if (opponentId) applyEffect(state, { type: 'mill_cards', amount }, sourceObject, [opponentId], context);
    return;
  }
  if (effect.type === 'draw_cards_both_players') {
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Dobranie wymaga dodatniej liczby kart');
    const targetId = targets[0];
    drawPlayerCards(state, sourceObject.controllerId, amount, 'effect');
    if (targetId && state.players.some((p) => p.id === targetId)) {
      drawPlayerCards(state, targetId, amount, 'effect');
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
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu.
    const goadTarget = state.objects.get(targetId);
    if (!goadTarget || goadTarget.zone !== 'battlefield' || goadTarget.kind !== 'creature') return;
    goadUntilNextTurn(state, targetId, sourceObject.controllerId);
    return;
  }
  if (effect.type === 'grant_abilities') {
    // Nadanie zdolności „do końca tury" (Fake Your Own Death). Deskryptory
    // zdolności są generyczne — engine ich nie interpretuje po nazwie karty.
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu.
    const grantTarget = state.objects.get(targetId);
    if (!grantTarget || grantTarget.zone !== 'battlefield' || grantTarget.kind !== 'creature') return;
    grantAbilitiesUntilEndOfTurn(state, targetId, effect.abilities ?? []);
    return;
  }
  if (effect.type === 'grant_keywords_until_end_of_turn') {
    // Nadanie keywordów celowi „do końca tury" (Stirring Bard: menace, haste).
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu.
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
    // Powrót obiektu z grobu na pole bitwy ZATAPNIĘTEGO pod kontrolą właściciela
    // (Fake Your Own Death). Cel domyślny: samo źródło (trigger „when this
    // creature dies" — obiekt jest już w grobie po zmianie strefy).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    // Obiekt mógł już wrócić na pole bitwy (dwa nadane triggery „dies" na tym
    // samym stworze — drugi widzi już nowy obiekt, CR 400.7): efekt nic nie robi.
    if (!object || object.zone !== 'graveyard') return;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, tapped: true, summoningSickness: true });
    state.objects.set(newId, permanent);
    // M273 (błąd #24, CR 121.6 + 614.1c): liczniki WEJŚCIA obowiązują przy
    // każdym wejściu na pole bitwy, także przy reanimacji — bez nich
    // Servant of the Scale wraca jako 0/0 i ginie od razu (CR 704.5f).
    applyEnterCounters(state, newId);
    state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield' }));
    return;
  }
  if (effect.type === 'gain_life') {
    // Batch 43 (Severed Strands): „You gain life equal to the sacrificed
    // creature's toughness" — kwota z LKI poświęconego stwora (koszt rzutu),
    // niesiona na obiekcie stosu przez castSpell (sacrificedToughness).
    const amount = effect.amountFromSacrificedToughness
      ? Math.max(0, sourceObject.sacrificedToughness ?? 0)
      : effect.amount;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Zysk życia musi być nieujemny');
    changeLife(state, sourceObject.controllerId, amount);
    return;
  }
  // Mournful Zombie (APC): „{W}, {T}: Target player gains 1 life." — zysk
  // życia GRACZA-CELU (targets[0] to id gracza, nie kontrolera źródła).
  if (effect.type === 'gain_life_target') {
    const targetId = targets[0] ?? sourceObject.controllerId;
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Zysk życia musi być nieujemny');
    changeLife(state, targetId, effect.amount);
    return;
  }
  // Veiled Ascension (MKC): „When this enchantment enters, put a flying counter
  // on each face-down creature you control." — wszystkie zakryte stwory
  // kontrolera źródła dostają licznik flying.
  if (effect.type === 'add_flying_counter_to_face_down_you_control') {
    for (const object of faceDownCreaturesYouControl(state, sourceObject.controllerId)) {
      addCounter(state, object.id, 'flying', 1);
    }
    return;
  }
  // Vaan, Street Thief (FIN): „put a +1/+1 counter on each Scout, Pirate, and
  // Rogue you control". Generycznie: licznik na każdym stworze kontrolera
  // źródła o podtypie z listy (ADR 0002 — filtr po podtypach, nie nazwach).
  if (effect.type === 'add_counter_to_creatures_you_control') {
    const subtypes = effect.subtypes ?? [];
    for (const object of [...state.objects.values()]) {
      if (object.zone !== 'battlefield' || object.controllerId !== sourceObject.controllerId) continue;
      if (object.kind !== 'creature') continue;
      if (subtypes.length && !(object.subtypes ?? []).some((sub) => subtypes.includes(sub))) continue;
      addCounter(state, object.id, effect.counter ?? '+1/+1', effect.amount ?? 1);
    }
    return;
  }
  // Warunkowe rozgałęzienie efektów (Trade Route Envoy: „draw a card if you
  // control a creature with a counter on it. If you don't, put a +1/+1 counter
  // on this creature"). Generyczne if/then/else po deskryptorze warunku —
  // `then` wykonuje się, gdy warunek zachodzi, `else` w przeciwnym razie.
  // Warunki są wspólne z triggers.js (conditionHolds) — ta sama semantyka
  // „intervening if" dla efektu.
  if (effect.type === 'conditional') {
    const controllerId = sourceObject.controllerId;
    let holds = false;
    if (effect.condition === 'landEnteredThisTurn') {
      holds = (state.landEnteredThisTurn?.[controllerId] ?? 0) > 0;
    }
    if (effect.condition === 'controlsCreatureWithCounter') {
      holds = [...state.objects.values()].some((object) => object.zone === 'battlefield'
        && object.controllerId === controllerId && object.kind === 'creature'
        && Object.values(object.counters ?? {}).some((count) => count > 0));
    }
    // Liliana's Triumph (Batch 37): „If you control a Liliana planeswalker,
    // each opponent also discards a card.” — generyczny warunek po typie
    // i podtypie PLANESWALKERA (ADR 0002: brak nazw kart). Działa od razu,
    // gdy w katalogu pojawi się jakikolwiek planeswalker o podtypie Liliana
    // (decyzja właściciela 2026-08-19 — kodujemy efekt z wyprzedzeniem).
    // M166/C (Sarkhan's Rage, DTK): „If you control no Dragons" — negatywny
    // warunek po podtypie STWORA (generyczny; ADR 0002).
    if (effect.condition === 'controlsNoCreatureSubtype') {
      const sub = effect.subtype;
      holds = sub != null && ![...state.objects.values()].some((object) => object.zone === 'battlefield'
        && object.controllerId === controllerId
        && object.kind === 'creature'
        && (object.subtypes ?? []).includes(sub));
    }
    if (effect.condition === 'controlsPlaneswalkerWithSubtype') {
      const sub = effect.subtype;
      holds = sub != null && [...state.objects.values()].some((object) => object.zone === 'battlefield'
        && object.controllerId === controllerId
        && (object.types ?? []).includes('Planeswalker')
        && (object.subtypes ?? []).includes(sub));
    }
    const branch = holds ? effect.then : effect.else;
    if (branch) applyEffect(state, branch, sourceObject, targets, context);
    return;
  }
  if (effect.type === 'add_counter') {
    // Licznik na celu (domyślnie na źródle) — np. trigger Canonized in Blood:
    // „put a +1/+1 counter on target creature you control". `targetIndex`
    // wskazuje inną pozycję na liście celów (Greatsword of Tyr: cel 0 =
    // nosiciel-atakujący).
    const targetId = targets[effect.targetIndex ?? 0] ?? sourceObject.id;
    // CR 608.2b: cel, który zniknął z pola bitwy przed rozstrzygnięciem
    // (T6 — okno odpowiedzi), sprawia, że efekt nic nie robi.
    const targetObj = state.objects.get(targetId);
    if (!targetObj || targetObj.zone !== 'battlefield') return;
    // Batch 45 (Malamet Battle Glyph): „If the creature you control entered
    // this turn, put a +1/+1 counter on it" — warunek na CELU, oceniany przy
    // rozstrzygnięciu (CR 608.2); bez spełnienia licznika nie ma, ale dalsze
    // efekty czaru (fight) i tak następują.
    if (effect.onlyIfTargetEnteredThisTurn && targetObj.enteredOnTurn !== state.turn?.number) return;
    // M177/B (Rakshasa Vizier): liczba liczników z kontekstu zdarzenia
    // („that many +1/+1 counters” — tyle, ile kart wyszło z grobu).
    const counterAmount = effect.amountFromContext
      ? (context?.[effect.amountFromContext] ?? effect.amount ?? 1)
      : (effect.amount ?? 1);
    addCounter(state, targetId, effect.counter, counterAmount);
    return;
  }
  if (effect.type === 'remove_counter') {
    // Źródło mogło zniknąć (LKI stub) — bez permanenta nie ma czego zdjąć.
    const sourceObj = state.objects.get(sourceObject.id);
    if (!sourceObj || sourceObj.zone !== 'battlefield') return;
    // M66: kilka triggerów z tego samego zdarzenia (Kappa Tech-Wrecker —
    // „combat damage to a player" ×2 w jednym combacie: double strike albo
    // dwie Kappy) próbuje zdjąć TEN SAM licznik — drugi nie ma czego zdjąć
    // i jest no-opem (CR 608.2b), bez crasha benchmarku.
    if ((sourceObj.counters?.[effect.counter] ?? 0) < (effect.amount ?? 1)) return;
    removeCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'attach_equipment_to_source') {
    // Kazuul's Toll Collector: „{0}: Attach target Equipment you control to
    // this creature." Przypięcie sprzętu do ŹRÓDŁA zdolności (CR 301.5c) —
    // ten sam mechanizm co koszt equip, ale bez płacenia equip.
    const equipmentId = targets[0];
    const equipment = equipmentId ? state.objects.get(equipmentId) : null;
    const host = state.objects.get(sourceObject.id);
    if (!equipment || equipment.zone !== 'battlefield') return; // CR 608.2b
    if (!host || host.zone !== 'battlefield' || host.kind !== 'creature') return;
    if (equipment.controllerId !== host.controllerId) return; // „you control"
    if (equipment.attachedTo === host.id) return; // już przypięty — brak zmian
    attachEquipmentToCreature(state, equipmentId, host.id);
    return;
  }
  if (effect.type === 'tap_permanent') {
    // `targetIndex` wskazuje inną pozycję na liście celów (Greatsword of Tyr:
    // „tap up to one target creature defending player controls” — cel 1).
    // „Up to one” zrealizowane deterministycznie: brak celu = brak efektu.
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
    // rozstrzyganie modalne na żywe na polu bitwy).
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
    // polu bitwy i zatapnięte; blokada wygasa, gdy źródło opuści pole bitwy.
    // Dla aury Spectral Prison: cel to zaczarowany stwór (attachedTo).
    const targetId = targets[0] ?? sourceObject.attachedTo;
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    const lockedBy = [...(object.untapLockedBy ?? [])];
    if (!lockedBy.includes(sourceObject.id)) lockedBy.push(sourceObject.id);
    state.objects.set(targetId, Object.freeze({ ...object, untapLockedBy: lockedBy }));
    // M138/Z4 (L24): blokada odkręcania to realny skutek — bez zdarzenia
    // `resolveTrigger` liczyłby ją jako „nic się nie wydarzyło”.
    state.events.push(event('stats_modified', {
      objectId: targetId, cardId: object.cardId, untapLocked: true, sourceId: sourceObject.id,
    }));
    return;
  }
  if (effect.type === 'dont_untap_next_untap_step') {
    // Wavecrash Triton (heroic): „That creature doesn't untap during its
    // controller's NEXT untap step." Jednorazowa blokada — inna niż trwały
    // `lock_untap` (Entrancing Lyre / Spectral Prison). Zapisujemy kontrolera,
    // którego następny untap step ma pominąć odkręcenie; untapControlled
    // zużywa flagę (patrz permanents.js).
    const targetId = targets[0];
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    state.objects.set(targetId, Object.freeze({ ...object, dontUntapNextUntapStep: object.controllerId }));
    // M138/Z4 (L24): jednorazowa blokada odkręcania — jak wyżej.
    state.events.push(event('stats_modified', {
      objectId: targetId, cardId: object.cardId, skipsNextUntap: true,
    }));
    return;
  }
  // M154 (Batch 38, Silken Strength): „When this Aura enters, untap enchanted
  // permanent." — odkręca GOSPODARZA aury (sourceObject.attachedTo). Generyczne:
  // jak pump_enchanted_creature, ale dla dowolnego zaczarowanego permanentu.
  if (effect.type === 'untap_enchanted_permanent') {
    const enchantedId = sourceObject.attachedTo;
    if (!enchantedId) return;
    const object = state.objects.get(enchantedId);
    if (!object || object.zone !== 'battlefield') return;
    // M272 (błąd #18): wspólny helper — respektuje licznik stun (CR 122.1d)
    // i blokadę odkręcania, których ręczna mutacja `tapped: false` nie znała.
    untapByEffect(state, enchantedId, sourceObject.controllerId);
    return;
  }
  if (effect.type === 'untap_permanent') {
    // Odkręcenie permanentu — domyślnie źródła (np. trigger Midnight Guard:
    // „Whenever another creature enters, untap this creature").
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu
    // (źródło triggera może być LKI stubem, gdy odeszło w oknie odpowiedzi).
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    // M272 (błąd #18): wspólny helper (stun CR 122.1d + blokada odkręcania).
    untapByEffect(state, targetId, sourceObject.controllerId);
    return;
  }
  if (effect.type === 'untap_all_creatures_you_control') {
    // Village Bell-Ringer: „When this creature enters, untap all creatures you
    // control.” — odkręca KAŻDEGO stwora kontrolera źródła (CR 701.16a),
    // po jednym zdarzeniu object_untapped na stwora.
    const ctrl = sourceObject.controllerId;
    for (const object of creaturesYouControl(state, ctrl)) {
      // M272 (błąd #18): wspólny helper per stwór (stun CR 122.1d).
      untapByEffect(state, object.id, ctrl);
    }
    return;
  }
  if (effect.type === 'add_mana') {
    // Kolorowa pula (cz. 7): mana ze zdolności ma KOLOR źródła (Skarb/dowolny
    // land → dowolny, Apprentice Wizard → bezbarwna). fromTreasure oznacza manę
    // ze Skarba (identyfikowalną — Marut pyta, ile ze Skarba wydano na rzut).
    const src = getSourceForObject(sourceObject);
    // M67 (Jeskai Devotee): efekt może podać kolory wprost ({1}: Add {U}, {R},
    // or {W}) — jednostka many ['U','R','W'] opłaca każdy z tych pipów (MtG:
    // gracz wybiera kolor przy produkcji; pula trzyma ją jako wielokolorową).
    const colors = effect.colors ?? src?.colors ?? [];
    addMana(state, sourceObject.controllerId, effect.amount ?? 1, {
      colors, fromTreasure: Boolean(effect.fromTreasure),
      // M201 (znalezisko #3): ograniczenie wydania jedzie z deskryptora
      // zdolności do puli (Powerstone: „only to cast artifact spells”).
      spendOnly: effect.spendOnly ?? null,
    });
    return;
  }
  if (effect.type === 'pay_life') {
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Płatność życia musi być dodatnia');
    changeLife(state, sourceObject.controllerId, -effect.amount);
    return;
  }
  if (effect.type === 'pay_mana') {
    // M259/B7 (CR 118.2): pipy kolorowe płatności (echo {2}{B}) — każda
    // jednostka colors to wymaganie [kolor] w formacie spendMana.
    const pips = (effect.colors ?? []).map((color) => [color]);
    spendMana(state, sourceObject.controllerId, effect.amount ?? 0, pips);
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
    // M273 (błąd #24, CR 121.6 + 614.1c): liczniki WEJŚCIA obowiązują przy
    // każdym wejściu na pole bitwy, także przy reanimacji — bez nich
    // Servant of the Scale wraca jako 0/0 i ginie od razu (CR 704.5f).
    applyEnterCounters(state, newId);
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
    const object = state.objects.get(sourceObject.id);
    // LKI (CR 603.10/608.2b): trigger transform wilkołaków poszedł na stos,
    // a źródło zdążyło opuścić pole bitwy (np. -1/-1 z Trigonu, ping w oknie
    // priorytetu) — stub źródła nie ma transformTo; transform dotyczy
    // permanentu NA polu bitwy, więc przy braku źródła efekt jest no-op
    // (bez crasha). Pełne B0 (seed 1025, random red vs heuristic green).
    if (!sourceObject || sourceObject.zone !== 'battlefield' || !sourceObject.transformTo) return;
    const target = sourceObject.transformTo;
    const updated = Object.freeze({
      ...sourceObject,
      cardId: target.cardId,
      cardName: target.cardName ?? sourceObject.cardName,
      power: target.power,
      toughness: target.toughness,
      abilities: target.abilities,
      keywords: target.keywords ?? [],
      subtypes: target.subtypes ?? [],
      // M109 (incubate): druga strona może zmieniać RODZAJ permanentu
      // (Incubator: artefakt → artefaktowy stwór). Bez tego obiekt zostawał
      // artefaktem z P/T, więc nie mógł atakować ani blokować.
      ...(target.kind ? { kind: target.kind } : {}),
      ...(target.types ? { types: target.types } : {}),
      // CR 202.3b (M258/Etap 2.3b): przy zmianie twarzy MV obiektu = koszt
      // twarzy PRZEDNIEJ. Payload transformTo niesie właśnie to (materialize
      // buduje go jako card.manaCost), więc aplikujemy go wprost; fallback
      // = dotychczasowa wartość (zwykłe DFC: identyczny wynik, transform
      // kosztu nie zmieniał). Różnica pojawia się dopiero przy tokenie-kopii
      // TYLNEJ twarzy (MV 0), który wraca na przód — wtedy musi dostać
      // koszt przedniej strony (CR 707.8a).
      manaCost: target.manaCost ?? sourceObject.manaCost ?? 0,
      transformTo: {
        cardId: sourceObject.cardId,
        cardName: sourceObject.cardName,
        power: sourceObject.power,
        toughness: sourceObject.toughness,
        abilities: sourceObject.abilities,
        keywords: sourceObject.keywords ?? [],
        subtypes: sourceObject.subtypes ?? [],
        kind: sourceObject.kind,
        types: sourceObject.types ?? [],
        // MV obiektu z TĄ (opuszczaną) twarzą w górę — symetryczny kontrakt:
        // zwykły DFC = koszt przedni, token-kopia tyłu = 0 póki jest tyłem.
        manaCost: sourceObject.manaCost ?? 0,
      },
    });
    state.objects.set(sourceObject.id, updated);
    // controllerId: warstwa stołu (isHumanHeadline, M100/E5) kwalifikuje
    // transform własnego permanentu do panelu „Rozgrywka" po kontrolerze —
    // bez tego pola wpis w HUMAN_DIGEST_EVENTS był martwy (audyt M257/K4:
    // transform człowieka nie pokazywał się w podsumowaniu pauzy).
    state.events.push(event('object_transformed', { objectId: sourceObject.id, fromCardId: sourceObject.cardId, cardId: target.cardId, controllerId: sourceObject.controllerId }));
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
      const moved = moveObjectDirectly(state, objectId, 'exile', exileId, { exiledBy: sourceObject.cardId });
      state.events.push(event('object_moved', {
        fromId: objectId, object: moved, fromZone: 'battlefield', toZone: 'exile',
      }));
    }
    return;
  }
  if (effect.type === 'detain') {
    // M177/E (Azorius Justiciar): detain KAŻDEGO z wybranych celów
    // („up to two target creatures” — multi-target trigger; CR 701.29).
    for (const targetId of targets) {
      const detainee = state.objects.get(targetId);
      if (!detainee || detainee.zone !== 'battlefield') continue; // CR 608.2b
      detainUntilYourNextTurn(state, targetId, sourceObject.controllerId);
    }
    return;
  }
  if (effect.type === 'gain_life_if_target_dies_this_turn') {
    // Time to Feed (THS): „When that creature dies this turn, you gain 3 life.”
    // CR 603.7a — opóźniony trigger utworzony przy rozstrzyganiu czaru, czekający
    // na śmierć KONKRETNEGO obiektu do końca tury. Wzorzec znacznika jak
    // exile_if_dies_this_turn: lista na stanie, czyszczona w cleanup.
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const marked = state.objects.get(targetId);
    if (!marked || marked.zone !== 'battlefield') return;
    state.gainLifeIfDiesThisTurn = [
      ...(state.gainLifeIfDiesThisTurn ?? []),
      Object.freeze({
        objectId: targetId,
        playerId: sourceObject.controllerId,
        amount: effect.amount ?? 1,
        sourceCardId: sourceObject.cardId ?? null,
      }),
    ];
    state.events.push(event('gain_life_if_dies_marked', {
      objectId: targetId, cardId: marked.cardId,
      playerId: sourceObject.controllerId, amount: effect.amount ?? 1,
    }));
    return;
  }
  if (effect.type === 'exile_if_dies_this_turn') {
    // M177/A (Agate Assault): „If that creature would die this turn, exile it
    // instead” — znacznik na id celu, konsumowany przez deathZoneFor we
    // wszystkich ścieżkach śmierci; wygasa w cleanup (jak tarcze prewencji).
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const marked = state.objects.get(targetId);
    if (!marked || marked.zone !== 'battlefield') return;
    // M262: wpisy {id, byCardId} — śmierć zamiast grobu ma mieć badge
    // źródła (karta, która naznaczyła cel).
    if (!(state.exileIfDiesThisTurn ?? []).some((entry) => entry.id === targetId)) {
      state.exileIfDiesThisTurn = [...(state.exileIfDiesThisTurn ?? []), { id: targetId, byCardId: sourceObject.cardId }];
    }
    state.events.push(event('exile_if_dies_marked', { objectId: targetId, cardId: marked.cardId }));
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
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId, { exiledBy: sourceObject.cardId });
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile' }));
    return;
  }
  if (effect.type === 'exile_nonland_permanent_linked') {
    // Static Net (BRO): „When this enchantment enters, exile target nonland
    // permanent an opponent controls until this enchantment leaves the
    // battlefield." — LINKED exile: id wygnanego zapamiętujemy na źródle
    // (exiledCardIds), a LTB (leaves_battlefield) przywraca go przez
    // return_exiled_to_battlefield (jak Faceless Butcher / Wormfang Newt).
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    if ((object.types ?? []).includes('Land')) return; // nonland
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId, { exiledBy: sourceObject.cardId });
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile' }));
    const src = state.objects.get(sourceObject.id);
    if (src) {
      const exiled = [...(src.exiledCardIds ?? [])];
      if (!exiled.includes(exileId)) exiled.push(exileId);
      state.objects.set(sourceObject.id, Object.freeze({ ...src, exiledCardIds: exiled }));
    }
    // M254/D: znacznik na WYGNANEJ karcie (stół pokazuje ją w strefie
    // „wygnania tymczasowego" obok Suspend/Plot).
    markTemporaryExile(state, exileId, sourceObject);
    return;
  }

/**
 * M254/D (zgłoszenie właściciela, Wormfang Newt): karta wygnana z LINKIEM
 * powrotu („When this creature leaves the battlefield, return the exiled
 * card to the battlefield") dostaje na sobie znacznik, KTO ją wygnał i KIEDY
 * wraca. Bez tego stół nie miał skąd wiedzieć, że to wygnanie TYMCZASOWE —
 * karta lądowała w zwykłym exile obok wygnanych na zawsze, bez badge'a i bez
 * informacji, co ją sprowadzi (ADR 0002: znacznik po treści efektu, nie po
 * nazwie karty — działa dla Newta, Faceless Butchera, Static Net i każdej
 * następnej karty o tym kształcie).
 */
function markTemporaryExile(state, exileId, sourceObject) {
  const exiled = state.objects.get(exileId);
  if (!exiled) return;
  state.objects.set(exileId, Object.freeze({
    ...exiled,
    temporaryExile: Object.freeze({
      byCardId: sourceObject?.cardId ?? null,
      byName: sourceObject?.cardName ?? null,
      // Powrót jest związany z odejściem ŹRÓDŁA z pola bitwy (CR 610.3 —
      // efekt połączony jednorazowy). Inne rodziny (Suspend, Plot) niosą
      // własne liczniki i nie przechodzą przez ten znacznik.
      returnsWhenSourceLeaves: true,
    }),
  }));
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
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId, { exiledBy: sourceObject.cardId });
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
    // M254/D: znacznik na WYGNANEJ karcie (stół pokazuje ją w strefie
    // „wygnania tymczasowego" obok Suspend/Plot).
    markTemporaryExile(state, exileId, sourceObject);
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
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId, { exiledBy: sourceObject.cardId });
    state.events.push(event('object_moved', {
      fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile',
    }));
    const src = state.objects.get(sourceObject.id);
    if (src) {
      const exiled = [...(src.exiledCardIds ?? [])];
      if (!exiled.includes(exileId)) exiled.push(exileId);
      state.objects.set(sourceObject.id, Object.freeze({ ...src, exiledCardIds: exiled }));
    }
    // M254/D: znacznik na WYGNANEJ karcie (stół pokazuje ją w strefie
    // „wygnania tymczasowego" obok Suspend/Plot).
    markTemporaryExile(state, exileId, sourceObject);
    return;
  }
  if (effect.type === 'destroy_if_least_power') {
    // Wretched Banquet: „Destroy target creature IF it has the least power or
    // is tied for least power among creatures on the battlefield." Warunek
    // oceniany przy rozstrzyganiu (CR 608.2b); niespełniony = brak efektu.
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    const creatures = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.kind === 'creature');
    const minPower = Math.min(...creatures.map((o) => effectivePower(o, state) ?? 0));
    const targetPower = effectivePower(object, state) ?? 0;
    if (targetPower !== minPower) return; // nie najmniejsza moc — nic się nie dzieje
    applyEffect(state, { type: 'destroy_permanent' }, sourceObject, [targetId], context);
    return;
  }
  // M154 (Batch 38, Divine Offering): „Destroy target artifact. You gain life
  // equal to its mana value." — zniszcz artefakt-cel i zyskaj życie równe jego
  // mana value (przed zniszczeniem; CR 701.7). Generyczne: cel-arteFakt,
  // efekt niszczy i nagradza życiem wg kosztu many celu.
  if (effect.type === 'destroy_artifact_gain_life_mana_value') {
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    const isArtifact = object.kind === 'artifact' || (object.types ?? []).includes('Artifact');
    if (!isArtifact) return; // nie-artefakt — brak efektu (legalność zapewnia target type)
    const manaValue = object.manaCost ?? 0;
    // Niszcz (CR 701.7) — reużycie logicznej części destroy_permanent przez
    // ponowne wywołanie efektu (niszczy i emituje zdarzenia); potem zysk życia.
    applyEffect(state, { type: 'destroy_permanent' }, sourceObject, [targetId]);
    // M156/F3 (audyt PR #65): „Destroy target artifact. You gain life equal to
    // its mana value." to DWIE sekwencyjne instrukcje (CR 608.2c) — zysk życia
    // NIE zależy od powodzenia zniszczenia. Indestructible/regeneracja/tarcza
    // blokują wyłącznie pierwsze zdanie; mana value bierzemy z chwili przed
    // próbą zniszczenia (LKI, CR 400.7). changeLife samo emituje life_changed.
    if (manaValue > 0) {
      changeLife(state, sourceObject.controllerId, manaValue);
    }
    return;
  }
  if (effect.type === 'destroy_permanent') {
    // Destroy target artifact/permanent (Shatter, CR 701.7): cel trafia do grobu
    // (zmiana strefy battlefield → graveyard), co odpala trigger „dies” przez
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
    // M272 (błąd #19): pełna sekwencja destroy (indestructible → shield →
    // regeneracja → strefa śmierci) mieszka we WSPÓLNYM helperze.
    destroyPermanentByEffect(state, targetId);
    return;
  }
  if (effect.type === 'sacrifice_permanent') {
    // Poświęcenie permanentu: domyślnie samo źródło („sacrifice it"), z
    // możliwością wskazania celu przez targets[0]. Trafia do grobu (nie exile).
    const targetId = targets[0] ?? sourceObject.id;
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    // Finality counter (CR 122.1b): poświęcenie też jest śmiercią — zamiast
    // grobu obiekt idzie do exile (wcześniej tylko zgony SBA).
    const toZone = deathZoneFor(state, object);
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, object.id, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: object.id, objectId: destId, playerId: object.controllerId, cardId: moved.cardId, toZone,
    }));
    return;
  }
  if (effect.type === 'return_with_counter') {
    // Persist (CR 702.79): stwór wraca z grobu na pole bitwy pod kontrolą
    // WŁAŚCICIELA z licznikiem -1/-1, o ile nie miał liczników -1/-1 w chwili
    // śmierci (LKI — formerCounters ustawiane przy zmianie strefy).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    // Jak wyżej (CR 400.7): karta zdążyła zmienić strefę — persist wygasa.
    if (!object || object.zone !== 'graveyard') return;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    state.objects.set(newId, Object.freeze({ ...moved, summoningSickness: true }));
    // M273 (błąd #24): najpierw liczniki WEJŚCIA karty (CR 121.6), potem
    // licznik nadawany przez efekt („return with a -1/-1 counter on it").
    applyEnterCounters(state, newId);
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
    // M273 (błąd #24, CR 121.6 + 614.1c): liczniki WEJŚCIA obowiązują przy
    // każdym wejściu na pole bitwy, także przy reanimacji — bez nich
    // Servant of the Scale wraca jako 0/0 i ginie od razu (CR 704.5f).
    applyEnterCounters(state, newId);
    state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield' }));
    state.events.push(event('control_changed', { objectId: newId, cardId: permanent.cardId, controllerId, fromControllerId: moved.controllerId }));
    if (effect.exileAtNextEndStep) {
      state.delayedTriggers.push({
        type: 'exile_object', objectId: newId, playerId: controllerId,
        // „At the beginning of your NEXT end step" — trigger należy do
        // kontrolera i czeka na jego najbliższy krok end.
        armedOnTurn: state.turn.number, cardId: permanent.cardId,
        // M262: źródłem wygnania jest karta, która postawiła permanenta.
        exiledBy: sourceObject.cardId,
      });
    }
    return;
  }
  if (effect.type === 'scry') {
    // M177/C (Sifter Wurm): „scry 3, THEN reveal the top card of your
    // library. You gain life equal to that card's mana value” — reveal
    // dzieje się PO decyzji scry (flaga na pendingScry, konsumowana w
    // resolve_scry); bez blokady (pusta biblioteka) — od razu.
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
    if (effect.thenRevealTopGainLife) {
      if (seen.length > 0) state.pendingScry.revealTopGainLife = { sourceCardId: sourceObject.cardId ?? null };
      else revealTopGainLife(state, ownerId, sourceObject.cardId ?? null);
    }
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
    // Inicjatywa (CR 725, Underdark Explorer): gracz obejmuje inicjatywę.
    // „Take the initiative" zawsze zagłębia w Podziemia (wejście do pokoju 1
    // albo awans do następnego pokoju — CR 725.4); nic się nie dzieje tylko
    // wtedy, gdy gracz JUŻ ją posiada (wtedy to nie jest objęcie).
    const playerId = effect.playerId ?? sourceObject.controllerId;
    const previous = state.initiativePlayerId ?? null;
    state.initiativePlayerId = playerId;
    const changedHands = previous !== playerId;
    // M163/B (uwaga właściciela): „po raz pierwszy" w komunikacie UI oznacza
    // WEJŚCIE do Podziemi (gracz nie jest jeszcze w lochu), a NIE zmianę
    // posiadacza — po utracie i odzyskaniu inicjatywy gracz nadal jest
    // w lochu (venture awansuje pokój), więc komunikat nie może mówić
    // „po raz pierwszy i zagłębia się w Podziemia".
    const firstTime = changedHands && (state.undercityProgress[playerId] ?? 0) === 0;
    state.events.push(event('initiative_taken', { playerId, previousPlayerId: previous, firstTime }));
    if (changedHands) ventureIntoUndercity(state, playerId);
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
    // CR 608.2b: źródło zniknęło z pola bitwy (LKI stub) — nie ma czego obracać.
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
  // Circle of the Land Druid: „return target land card from your graveyard to
  // your hand". Wariant generyczny return_creature_card_to_hand — filtr typu
  // opisuje deskryptor (`cardKind`), a nie nazwa karty (ADR 0002).
  if (effect.type === 'return_card_from_graveyard_to_hand') {
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard') return; // CR 608.2b
    if (effect.cardKind === 'land') {
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      if (!isLand) return;
    }
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'hand', handId);
    state.events.push(event('object_moved', {
      fromId: targetId, object: moved, fromZone: 'graveyard', toZone: 'hand',
    }));
    // Cemetery Recruitment (EMN): „If it's a Zombie card, draw a card."
    // Generycznie: po powrocie, jeśli karta ma podtyp z listy — dobierz
    // (filtr po podtypie, nie nazwie — ADR 0002).
    if (effect.drawIfSubtypes?.length
      && (moved.subtypes ?? []).some((sub) => effect.drawIfSubtypes.includes(sub))) {
      drawPlayerCards(state, sourceObject.controllerId, 1, 'effect');
    }
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
    // get ±N/±0 until end of turn." Efekt CIĄGŁY do końca tury, ale zbiór
    // stworów jest ustalany przy rozstrzygnięciu (CR 611.2c) — stwór
    // przeciwnika wchodzący PÓŹNIEJ nie jest osłabiony (M101/B2).
    state.untilEndOfTurnBuffs = [
      ...(state.untilEndOfTurnBuffs ?? []),
      Object.freeze({
        controllerId: sourceObject.controllerId,
        opponent: true,
        objectIds: Object.freeze(affectedCreatureIds(state, sourceObject.controllerId, true)),
        power: effect.power ?? 0,
        toughness: effect.toughness ?? 0,
        keywords: Object.freeze([...(effect.keywords ?? [])]),
      }),
    ];
    emitMassBuff(state, sourceObject, state.untilEndOfTurnBuffs[state.untilEndOfTurnBuffs.length - 1], 'opponents');
    return;
  }
  if (effect.type === 'start_engines') {
    // „Start your engines!" (DFT): jeden choke point `startEnginesFor`
    // (players.js) — ten sam, który woła akcja stanowa w `state-based.js`.
    // Ścieżka efektowa zostaje dla kart, które kazzą „start your engines!"
    // JAKO EFEKT (nie jako zdolność ciągłą); wzrost prędkości — triggers.js.
    startEnginesFor(state, sourceObject.controllerId);
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
    // M110: wpisem stosu może być czar ALBO zdolność (aktywowana/triggerowana)
    // — Oracle mówi „spell or ability with a single target" (CR 115.7).
    const single = singleTargetOfStackEntry(spell);
    if (!single) return;
    const spec = single.spec;
    state.pendingRedirectChoice = {
      playerId: sourceObject.controllerId,
      sourceId: sourceObject.id,
      sourceCardId: sourceObject.cardId ?? null,
      stackId,
      spellControllerId: spell.controllerId,
      spellCardId: spell.cardId ?? null,
      currentTargetId: single.targetId,
      entryKind: single.kind,
      spec,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('redirect_choice_required', {
      playerId: sourceObject.controllerId,
      stackId, cardId: spell.cardId ?? null,
      currentTargetId: single.targetId, entryKind: single.kind,
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
  if (effect.type === 'lose_life_enchanted_permanent_controller') {
    // Batch 48 (Clawing Torment, NEO): „Enchanted permanent has »At the
    // beginning of your upkeep, you LOSE 1 LIFE.«" Wariant Feedbacku, ale
    // utrata zycia (CR 118.2), nie obrazenia — nie da sie jej zapobiec
    // prewencja obrazen ani przekierowac.
    const enchantedId = sourceObject.attachedTo;
    if (!enchantedId) return;
    const enchanted = state.objects.get(enchantedId);
    if (!enchanted || enchanted.zone !== 'battlefield') return;
    changeLife(state, enchanted.controllerId, -(effect.amount ?? 1));
    return;
  }
  if (effect.type === 'your_creatures_gain_keywords_until_end_of_turn') {
    // Batch 48 (Stampeding Elk Herd, DTK): formidable — „creatures YOU
    // control gain trample until end of turn". Zbior stworow ustalany PRZY
    // ROZSTRZYGNIECIU (CR 611.2c): stwor wchodzacy pozniej nie dostaje nic.
    // Slowa kluczowe sa deskryptorem, wiec ta sama sciezka obsluzy przyszle
    // „gain flying" itd.
    const controllerId = sourceObject.controllerId;
    const keywords = effect.keywords ?? [];
    if (keywords.length === 0) return;
    const affected = [];
    for (const id of state.zones.battlefield) {
      const object = state.objects.get(id);
      if (!object || object.kind !== 'creature' || object.controllerId !== controllerId) continue;
      affected.push(id);
    }
    if (affected.length === 0) return;
    state.untilEndOfTurnBuffs = [
      ...(state.untilEndOfTurnBuffs ?? []),
      Object.freeze({
        controllerId,
        objectIds: Object.freeze(affected),
        power: 0,
        toughness: 0,
        keywords: Object.freeze([...keywords]),
      }),
    ];
    state.events.push(event('mass_stats_modified', {
      playerId: controllerId, objectIds: [...affected],
      power: 0, toughness: 0, keywords: [...keywords],
    }));
    return;
  }
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
  // end of turn." Aura na polu bitwy pompuje swojego gospodarza (attachedTo).
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
    // Fear of Abduction ETB: exile TARGET opponent creature (CR 115.1b) + link.
    // Wcześniej deterministycznie najsilniejszy — Oracle wymaga celu gracza.
    const chosenId = targets[0];
    let targetId = chosenId;
    if (!targetId) {
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
      targetId = best.id;
    }
    const live = state.objects.get(targetId);
    if (!live || live.zone !== 'battlefield' || live.kind !== 'creature') return;
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, targetId, 'exile', exileId, { exiledBy: sourceObject.cardId });
    const src = state.objects.get(sourceObject.id);
    if (src) state.objects.set(sourceObject.id, Object.freeze({ ...src, banishedIds: [...(src.banishedIds ?? []), exileId] }));
    state.events.push(event('object_exiled', { fromId: targetId, objectId: exileId, object: exiled, cardId: exiled.cardId, banished: true }));
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
    // Panic Spellbomb: „Target creature can't block this turn.” Tymczasowy
    // znacznik na obiekcie — zdejmowany w cleanup razem z innymi grantami.
    const targetId = targets[0];
    if (!targetId) return;
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    if (effect.ifDealtDamage) {
      const last = [...state.events].reverse().find((ev) => ev.type === 'damage_dealt');
      if (!last || last.target !== targetId || (last.amount ?? 0) <= 0) return;
    }
    state.objects.set(targetId, Object.freeze({ ...object, cantBlock: true }));
    state.events.push(event('cant_block_granted', { objectId: targetId, cardId: object.cardId }));
    return;
  }
  if (effect.type === 'attacker_gains_control_and_untaps') {
    // Batch 48 (Contested Game Ball, LCI): „Whenever you're dealt combat
    // damage, the ATTACKING PLAYER gains control of this artifact and untaps
    // it." Zmiana kontroli jest TRWALA (bez tempControlUntilTurn) — pilka
    // przechodzi z rak do rak przez cala partie.
    const source = state.objects.get(sourceObject.id);
    if (!source || source.zone !== 'battlefield') return;
    // Atakujący: kontekst triggera (zamrożony przy odpaleniu — state.combat
    // jest null po end_of_combat), potem stan (ścieżki natychmiastowe),
    // na końcu przeciwnik kontrolera (1v1: obrażenia bojowe dostaje się
    // wyłącznie od przeciwnika, z wyjątkiem nadwyżki trample we własnym
    // ataku — stąd kontekst ma pierwszeństwo).
    const attackerId = context.attackingPlayerId
      ?? state.combat?.attackingPlayerId
      ?? state.players.find((p) => p.id !== source.controllerId)?.id
      ?? null;
    if (attackerId == null) return;
    // Edge case (CR, audyt M200/N3): gdy atakującymi był kontroler piłki
    // (otrzymał obrażenia od blokerów we WŁASNYM ataku), „gains control"
    // jest puste — ale Oracle i tak mówi „and untaps it".
    const sameController = attackerId === source.controllerId;
    if (sameController && !source.tapped) return;
    const previous = source.controllerId;
    // M272 (błąd #18): „and untaps it" przechodzi przez wspólny helper —
    // licznik stun (CR 122.1d) i blokada odkręcania obowiązują też tutaj.
    // Helper emituje `object_untapped`, gdy permanent FAKTYCZNIE wstał.
    const wasTapped = untapByEffect(state, source.id, attackerId);
    const poOdkreceniu = state.objects.get(source.id) ?? source;
    state.objects.set(source.id, Object.freeze({ ...poOdkreceniu, controllerId: attackerId }));
    if (!sameController) {
      state.events.push(event('control_changed', {
        objectId: source.id, cardId: source.cardId,
        controllerId: attackerId, fromControllerId: previous,
      }));
    }
    // M269 (błąd #3, lekcja L24 / CR 701.21a): „and untaps it" jest zdarzeniem
    // widocznym dla reguł i dla gracza — NIEZALEŻNIE od tego, czy przy okazji
    // zmienił się kontroler. Dotąd `object_untapped` powstawało wyłącznie
    // w gałęzi „ten sam kontroler": gdy piłka realnie zmieniała ręce (ścieżka
    // typowa — atakujący to przeciwnik), odkręcenie działo się po cichu.
    // Żaden trigger „becomes untapped" go nie widział, a log stołu pokazywał
    // samą zmianę kontroli, choć permanent stanął odkręcony.
    void wasTapped; // zdarzenie object_untapped emituje wspólny helper
    return;
  }
  if (effect.type === 'sacrifice_self_if_counters_then_treasure') {
    // Batch 48 (Contested Game Ball): „Then if it has five or more point
    // counters on it, sacrifice it and create a Treasure token." Prog jest
    // DESKRYPTOREM (counter/threshold), nie stala w kodzie (ADR 0002).
    const source = state.objects.get(sourceObject.id);
    if (!source || source.zone !== 'battlefield') return;
    const counterName = effect.counter ?? 'point';
    const have = source.counters?.[counterName] ?? 0;
    if (have < (effect.threshold ?? 5)) return;   // ponizej progu — nic sie nie dzieje
    const controllerId = source.controllerId;
    applyEffect(state, { type: 'sacrifice_permanent' }, source, []);
    // Skarb z tej samej współdzielonej definicji co Stash i rezygnacja
    // z rzutu w oknie zdolności (audyt PR #93).
    applyEffect(state, TREASURE_TOKEN_EFFECT, { ...source, controllerId }, []);
    return;
  }
  if (effect.type === 'subtype_spells_gain_flash_and_etb_fight_this_turn') {
    // Batch 48 (Cherished Hatchling, RIX): „you may cast Dinosaur spells this
    // turn as though they had flash, and whenever you cast a Dinosaur spell
    // this turn, it gains »When this creature enters, you may have it fight
    // another target creature.«"
    //
    // Efekt dotyczy PRZYSZLYCH czarow w tej turze, wiec zapisujemy go jako
    // pozwolenie na poziomie STANU (jak inne efekty „this turn"), a nie na
    // konkretnej karcie. Podtyp jest deskryptorem — ta sama sciezka obsluzy
    // przyszle „Angel spells" itd.
    state.subtypeFlashThisTurn = [
      ...(state.subtypeFlashThisTurn ?? []),
      Object.freeze({
        controllerId: sourceObject.controllerId,
        subtype: effect.subtype,
        etbFight: true,
      }),
    ];
    return;
  }
  if (effect.type === 'creatures_cant_block_this_turn') {
    // Batch 48 (Ruthless Invasion, NPH): „Nonartifact creatures can't block
    // this turn." Efekt GLOBALNY (bez celu) — dotad `cant_block` dzialal
    // wylacznie na jeden wskazany cel. Wyjatek typu jest DESKRYPTOREM
    // (`exceptTypes`), wiec przyszle „non-Zombie creatures can't block"
    // pojda ta sama sciezka bez zmian w silniku (ADR 0002).
    //
    // M200/L (CR 611.2 — efekt CIAGLY): ograniczenie obowiazuje przez
    // cala swoje trwanie i dotyczy kazdego stwora spelniajacego warunek
    // W TYM CZASIE — takze stwora wchodzacego na pole bitwy POZCIEJ w tej
    // turze. Stara implementacja znaczkowala zbiór przy rozstrzygnięciu
    // (jednorazowa flaga na obiekcie) — odchyłka od Oracle (audyt: zbior
    // „zamrazany” przy resolution). Ograniczenie zyj na obiekcie tury
    // (nowa tura = nowy state.turn = wygasniecie naturalne, CR 514.2) i
    // jest czytane read-time w creatureCantBlock (centralny odczyt).
    const except = [...(effect.exceptTypes ?? [])];
    state.turn.cantBlockRestrictions = [...(state.turn.cantBlockRestrictions ?? []), {
      exceptTypes: except,
      cardId: sourceObject?.cardId ?? null,
    }];
    state.events.push(event('turn_cant_block', { exceptTypes: except, cardId: sourceObject?.cardId ?? null }));
    return;
  }
  if (effect.type === 'cant_be_blocked') {
    // Coralhelm Guide: "Target creature can't be blocked this turn."
    const targetId = targets[0];
    if (!targetId) return;
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu.
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    state.objects.set(targetId, Object.freeze({ ...object, cantBeBlocked: true }));
    state.events.push(event('cant_be_blocked_granted', { objectId: targetId, cardId: object.cardId }));
    return;
  }
  if (effect.type === 'destroy_pair_if_same_colors') {
    // Dead Ringers (APC): „Destroy two target nonblack creatures UNLESS EITHER
    // ONE IS A COLOR THE OTHER ISN'T. They can't be regenerated."
    // Oracle = równość ZBIORÓW kolorów obu celów (CR 105.2): dwa zielone stwory
    // tak, zielony vs zielono-biały nie, dwa bezbarwne (puste zbiory) tak.
    // Efekt jest „wszystko albo nic" — jeśli kolory się różnią, NIC nie ginie.
    const idA = targets[effect.targetIndexA ?? 0];
    const idB = targets[effect.targetIndexB ?? 1];
    if (idA == null || idB == null) return;
    const objectA = state.objects.get(idA);
    const objectB = state.objects.get(idB);
    // CR 608.2b — jeśli którykolwiek cel zniknął, czar nie robi nic dla niego;
    // przy porównaniu kolorów brak jednego celu = brak porównania = brak efektu.
    if (!objectA || objectA.zone !== 'battlefield') return;
    if (!objectB || objectB.zone !== 'battlefield') return;
    const colorsA = [...effectiveColors(objectA)].sort();
    const colorsB = [...effectiveColors(objectB)].sort();
    const sameColors = colorsA.length === colorsB.length
      && colorsA.every((color, index) => color === colorsB[index]);
    state.events.push(event('destroy_pair_color_check', {
      cardId: sourceObject?.cardId ?? null,
      colorsA, colorsB, matched: sameColors,
    }));
    if (!sameColors) return;
    // „They can't be regenerated" — znacznik PRZED zniszczeniem, żeby tarcza
    // regeneracji nie uratowała celu (ta sama lista, co Rage of Purphoros).
    for (const targetId of [idA, idB]) {
      if (!(state.cantBeRegeneratedThisTurn ?? []).includes(targetId)) {
        state.cantBeRegeneratedThisTurn = [...(state.cantBeRegeneratedThisTurn ?? []), targetId];
      }
    }
    for (const targetId of [idA, idB]) {
      applyEffect(state, { type: 'destroy_permanent', targetIndex: 0 }, sourceObject, [targetId]);
    }
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
    // Otherwise, +3/+3.” Blokująca decyzja — jak scry/surveil: czar
    // wstrzymuje rozstrzyganie do resolve_food_choice.
    const controllerId = sourceObject.controllerId;
    const foodCandidates = state.zones.battlefield.filter((id) => {
      const object = state.objects.get(id);
      return object?.controllerId === controllerId && object.zone === 'battlefield'
        && (object.subtypes ?? []).includes('Food');
    });
    if (foodCandidates.length === 0) {
      // Brak Food — automatycznie „Otherwise”: +3/+3 na celu.
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
    // CR 608.2b: cel zniknął z pola bitwy przed rozstrzygnięciem — brak efektu.
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
    // M271 (błąd #15): kontra idzie przez WSPÓLNY `counterStackObject` —
    // własna kopia gubiła `exileInsteadOfGraveyard` (Halo Forager).
    // LKI (CR 603.10): nazwa kontrującego po cardId — obiekt na stosie znika
    // z state.objects po rozstrzygnięciu (audyt diamentowy: „(?)").
    counterStackObject(state, targetId, {
      counteredBy: sourceObject.id, counteredByCardId: sourceObject.cardId,
    });
    return;
  }
  if (effect.type === 'counter_spell_unless_pays') {
    // Batch 44 (Frightful Delusion): „Counter target spell unless its
    // controller pays {1}. That player discards a card." — decyzja należy do
    // KONTROLERA celowanego czaru (blokująca, resolve_counter_pay_choice).
    // Bez many na opłatę nie ma decyzji: czar skontrowany od razu, potem
    // discard (wybór karty w pendingDiscardChoice — CR 701.18).
    const targetId = targets[0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'stack') return; // cel zniknął (CR 608.2b)
    const payerId = object.controllerId;
    const amount = effect.amount ?? 1;
    const canPay = producibleMana(state, payerId) >= amount;
    if (!canPay) {
      // M271 (błąd #15): jak wyżej — wspólny helper, nie kopia.
      counterStackObject(state, targetId, {
        counteredBy: sourceObject.id, counteredByCardId: sourceObject.cardId,
      });
      const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === payerId);
      if (handIds.length === 0) return; // bez ręki — nic więcej
      state.pendingDiscardChoice = {
        playerId: payerId, count: 1, handIds, purpose: 'effect',
        sourceCardId: sourceObject.cardId ?? null,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = payerId;
      state.events.push(event('discard_choice_required', {
        playerId: payerId, count: 1, cardIds: [...handIds], purpose: 'effect',
        sourceCardId: sourceObject.cardId ?? null,
      }));
      return true; // discard dokończy rozstrzyganie czaru-źródła
    }
    state.pendingCounterPay = {
      playerId: payerId, targetId, amount,
      sourceId: sourceObject.id, sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = payerId;
    state.events.push(event('counter_pay_required', {
      playerId: payerId, targetId, cardId: object.cardId, amount,
      sourceCardId: sourceObject.cardId ?? null,
    }));
    return true; // decyzja blokuje dalsze efekty czaru
  }
  if (effect.type === 'player_sacrifices_creature') {
    // Dwa warianty tej samej treści („a creature of their choice" — wybór
    // należy do POŚWIĘCAJĄCEGO, blokująca decyzja resolve_sacrifice_choice):
    //  - CELOWANY (Grave Exchange: „TARGET player sacrifices…") — gracz
    //    z listy celów czaru;
    //  - BEZCELOWY (M266/B, Liliana's Triumph: „EACH OPPONENT sacrifices…")
    //    — Oracle nie mówi „target", więc czar nie ma celu (CR 115.1);
    //    zakres liczymy z kontrolera źródła, jak w `discard_each_opponent`.
    // Gracz bez stworów nie poświęca niczego.
    const targetId = effect.scope === 'each_opponent'
      ? (state.players.find((player) => player.id !== sourceObject.controllerId)?.id ?? null)
      : targets[effect.targetIndex ?? 0];
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
      sourceCardId: sourceObject?.cardId ?? null,
      candidateIds: [...candidates],
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = ownerId;
    state.events.push(event('graveyard_top_choice_required', { playerId: ownerId, candidateIds: [...candidates], sourceCardId: sourceObject?.cardId ?? null }));
    // Blokująca decyzja — rozstrzyganie czaru czeka (state.pendingSpell,
    // pozostałe efekty dokończy resolve_graveyard_top_choice{done:true}).
    return true;
  }
  if (effect.type === 'graveyard_card_to_library_top_choice') {
    // Batch 47 (Sequestered Stash, KLD): „Then you MAY put an artifact card
    // from your graveyard on top of your library." Wariant Forever Young:
    // JEDNA karta (maxCards) i wybor OPCJONALNY, a rodzaj karty niesie
    // deskryptor (`filter.anyTypes`) — silnik nie zna nazw kart (ADR 0002).
    // Decyzja jest blokujaca i nastepuje PO millu, wiec kandydatem moze byc
    // takze artefakt dopiero co zmielony (CR 608.2).
    const ownerId = sourceObject.controllerId;
    const anyTypes = effect.filter?.anyTypes ?? null;
    const candidates = state.zones.graveyard.filter((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId !== ownerId || object.name != null) return false;
      if (anyTypes) return anyTypes.some((type) => (object.types ?? []).includes(type));
      return true;
    });
    if (candidates.length === 0) return; // „may" bez kandydatow — brak decyzji
    state.pendingGraveyardToTop = {
      playerId: ownerId,
      sourceCardId: sourceObject?.cardId ?? null,
      candidateIds: [...candidates],
      filter: effect.filter ?? null,
      maxCards: 1,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = ownerId;
    state.events.push(event('graveyard_top_choice_required', {
      playerId: ownerId, candidateIds: [...candidates], optional: true, maxCards: 1,
    }));
    return true;
  }
  if (effect.type === 'each_player_exiles_top_face_down') {
    // Batch 47 (Pyxis of Pandemonium, THS): „{T}: Each player exiles the top
    // card of their library face down." Kazdy gracz wygania SWOJ wierzch,
    // karta lezy ZAKRYTA (CR 708 — nikt jej nie zna), a zrodlo pamieta, ktore
    // karty wygnalo (CR 400.7): druga zdolnosc odkrywa wylacznie te wygnane
    // TYM artefaktem, wiec bez powiazania nie dalaby sie wykonac poprawnie.
    const source = state.objects.get(sourceObject.id) ?? sourceObject;
    const exiledIds = [...(source.exiledCardIds ?? [])];
    for (const player of state.players) {
      const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === player.id);
      if (topId == null) continue; // pusta biblioteka — ten gracz nic nie wygania
      const exileId = `exile-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, topId, 'exile', exileId, { exiledBy: sourceObject.cardId });
      state.objects.set(exileId, Object.freeze({ ...moved, faceDown: true }));
      exiledIds.push(exileId);
      // Zdarzenie BEZ cardId: karta jest zakryta, wiec jej nazwa nie jest
      // informacja publiczna (mgla wojny — nawet wlasciciel jej nie oglada).
      state.events.push(event('object_exiled', {
        fromId: topId, objectId: exileId, object: state.objects.get(exileId),
        playerId: player.id, faceDown: true,
      }));
    }
    if (state.objects.has(source.id)) {
      state.objects.set(source.id, Object.freeze({ ...state.objects.get(source.id), exiledCardIds: exiledIds }));
    }
    return;
  }
  if (effect.type === 'turn_up_exiled_and_put_permanents') {
    // Batch 47 (Pyxis of Pandemonium): „{7}, {T}, Sacrifice this artifact:
    // Each player turns face up all cards they own exiled with this artifact,
    // then puts all permanent cards among them onto the battlefield."
    // Zrodlo jest juz poswiecone (koszt), wiec liste wygnanych czytamy z LKI
    // obiektu przekazanego jako sourceObject.
    const linked = [...(state.objects.get(sourceObject.id)?.exiledCardIds ?? sourceObject.exiledCardIds ?? [])];
    if (linked.length === 0) return;
    const NONPERMANENT = ['Instant', 'Sorcery'];
    for (const exileId of linked) {
      const card = state.objects.get(exileId);
      if (!card || card.zone !== 'exile') continue;
      // Odkrycie: karta przestaje byc zakryta niezaleznie od tego, czy jest
      // permanentem (Oracle: „turns face up ALL cards they own").
      state.objects.set(exileId, Object.freeze({ ...card, faceDown: false }));
      state.events.push(event('card_revealed', {
        playerId: card.ownerId ?? card.controllerId, objectId: exileId, cardId: card.cardId ?? null,
      }));
      const types = card.types ?? [];
      const isPermanent = types.length > 0 && !types.some((type) => NONPERMANENT.includes(type));
      if (!isPermanent) continue; // instant/sorcery zostaje w wygnaniu
      // „puts … onto the battlefield" — pod kontrole WLASCICIELA karty
      // (Oracle: „all cards THEY OWN"), nie kontrolera artefaktu.
      const ownerId = card.ownerId ?? card.controllerId;
      const battlefieldId = `permanent-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, exileId, 'battlefield', battlefieldId);
      state.objects.set(battlefieldId, Object.freeze({
        ...moved, controllerId: ownerId, faceDown: false,
        summoningSickness: (moved.types ?? []).includes('Creature'),
      }));
      // M274 (#24, CR 121.6): wprowadzenie permanentu z wygnania to WEJŚCIE —
      // liczniki wejścia obowiązują. Karta jest tu już odkryta (faceDown:
      // false ustawione wyżej), więc helper nadaje liczniki.
      applyEnterCounters(state, battlefieldId);
      state.events.push(event('permanent_entered_battlefield', {
        objectId: battlefieldId, object: state.objects.get(battlefieldId),
        cardId: moved.cardId ?? null, controllerId: ownerId, fromExile: true,
      }));
    }
    return;
  }
  if (effect.type === 'epic_experiment') {
    // Epic Experiment (OTC): „Exile the top X cards of your library. You may
    // cast instant and sorcery spells with mana value X or less from among
    // them without paying their mana costs. Then put all cards exiled this way
    // that weren't cast into your graveyard." X = spellX (z obiektu stosu).
    const X = sourceObject?.spellX ?? 0;
    const controllerId = sourceObject.controllerId;
    const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === controllerId);
    const topIds = ownLibrary.slice(0, X);
    const exileIds = [];
    for (const id of topIds) {
      const exileId = `exile-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, id, 'exile', exileId, { exiledBy: sourceObject.cardId });
      exileIds.push(exileId);
      state.events.push(event('card_revealed', { playerId: controllerId, objectId: exileId, cardId: moved?.cardId ?? null }));
    }
    if (exileIds.length === 0) return; // pusta biblioteka
    // Blokująca, wielokrotna decyzja: gracz może rzucać instants/sorceries
    // MV <= X z wygnanych (bez kosztu) aż do zakończenia (done); reszta do grobu.
    state.pendingEpicExperiment = {
      playerId: controllerId,
      sourceCardId: sourceObject?.cardId ?? null,
      exileIds,
      maxMV: X,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('epic_experiment_started', {
      playerId: controllerId, count: exileIds.length,
      cardIds: exileIds.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
      sourceCardId: sourceObject?.cardId ?? null,
    }));
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
      moveObjectDirectly(state, id, 'exile', exileId, { exiledBy: sourceObject.cardId });
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
      sourceCardId: sourceObject?.cardId ?? null,
      candidateIds: [...candidates],
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('hand_creature_choice_required', { playerId: controllerId, candidates: [...candidates], sourceCardId: sourceObject?.cardId ?? null }));
    return true;
  }
  if (effect.type === 'craft_transform') {
    // Craft (Lodestone Needle): exile this artifact + exile another artifact
    // you control or artifact card from your graveyard → return transformed.
    // Blokująca decyzja: wybór artefaktu do wygnania (jak resolve_sacrifice_choice).
    const target = sourceObject.transformTo;
    // M155 (audyt żywym testerem / benchmark B0): token-kopia artefaktu
    // z craft (np. przez enterAsCopy) mogła nieść zdolność craft, ale NIE
    // drugą stronę (transformTo). Zamiast crasha „Ta karta nie ma drugiej
    // strony (craft)" — no-op (CR 608.2b: craft bez drugiej strony nic nie
    // robi; oferta legalActivatedAbilities też nie oferuje craft bez
    // transformTo).
    if (!target) return;
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
      // M125/B: Craft mówi „an artifact card from YOUR graveyard". Grób jest
      // strefą WŁAŚCICIELA (CR 400.7), więc przynależność liczymy po
      // `ownerId`, nie po `controllerId`. W praktyce silnik przywraca
      // kontrolę właścicielowi przy wejściu do grobu, więc obie wartości są
      // dziś zgodne — ale opieranie reguły strefy ukrytej na kontrolerze to
      // pułapka czekająca na pierwszy efekt kradzieży kontroli.
      const owner = obj?.ownerId ?? obj?.controllerId;
      if (obj && owner === controllerId
        && (obj.kind === 'artifact' || (obj.types ?? []).includes('Artifact'))) {
        candidates.push(id);
      }
    }
    if (candidates.length === 0) return; // CR 608.2b: „If you do" bez artefaktu do wygnania = no-op
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
  if (effect.type === 'owner_library_top_or_bottom') {
    // M177/D (Vanish from Sight): „Target nonland permanent's owner puts it
    // on their choice of the top or bottom of their library” — decyzja
    // należy do WŁAŚCICIELA celu (nie rzucającego): blokująca
    // resolve_library_placement; sam ruch wykonuje komenda. Czar wisi
    // (pendingSpell) — surveil 1 rzucającego dopiero po decyzji.
    const targetId = targets[0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return; // cel zniknął (CR 608.2b)
    const ownerId = object.ownerId ?? object.controllerId;
    state.pendingLibraryPlacement = {
      playerId: ownerId, targetId, sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = ownerId;
    state.events.push(event('library_placement_required', {
      playerId: ownerId, targetId, cardId: object.cardId, sourceCardId: sourceObject.cardId ?? null,
    }));
    return true; // decyzja blokuje dalsze efekty czaru
  }
  if (effect.type === 'bounce_to_library_top') {
    // Banishment Decree: „Put target artifact, creature, or enchantment on top
    // of its owner's library." CR 108.3/400.7: na wierzch biblioteki
    // WŁAŚCICIELA (ownerId), nie kontrolera — wzorzec bounce_permanent.
    const targetId = targets[0];
    if (targetId == null) return; // „up to one" bez celu — brak efektu
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return; // cel zniknął (CR 608.2b)
    const ownerId = object.ownerId ?? object.controllerId;
    const libId = `library-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'library', libId);
    const inOwnersLibrary = Object.freeze({ ...moved, controllerId: ownerId });
    state.objects.set(libId, inOwnersLibrary);
    // Wierzch biblioteki = pierwszy element w strefie (top of library).
    state.zones.library = [libId, ...state.zones.library.filter((id) => id !== libId)];
    state.events.push(event('object_moved', {
      fromId: targetId, object: inOwnersLibrary, fromZone: 'battlefield', toZone: 'library',
      toTop: true, bounced: true, toOwner: true,
    }));
    return;
  }
  if (effect.type === 'bounce_to_library_bottom') {
    // Batch 43 (Forced Landing): „Put target creature with flying on the
    // bottom of its owner's library." — lustro bounce_to_library_top, ale na
    // SPÓD (ostatni element strefy). Token poza polem bitwy przestaje istnieć
    // (CR 111.7) — kasujemy go OD RAZU zamiast wkładać do biblioteki (wzorzec
    // resolve_library_placement z M177: SBA sprzątałoby go dopiero po fakcie,
    // a w bibliotece zdążyłby zaburzyć pending scry/surveil).
    const targetId = targets[0];
    if (targetId == null) return; // „up to one" bez celu — brak efektu
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return; // cel zniknął (CR 608.2b)
    if (object.isToken) {
      // M191: przed skasowaniem tokena ODEPNIJ od niego aury/equipment —
      // inaczej zostaje „wisząca" aura wskazująca nieistniejący obiekt
      // (inwariant wywraca partię). Ta sama reguła co w SBA (CR 111.7).
      detachAttachmentsFromHost(state, targetId);
      // M273 (błąd #25): token znika z gry z POMINIĘCIEM choke pointu stref,
      // więc trzeba jawnie przejść tę samą listę „kto o nim jeszcze pyta"
      // (L43). `state.combat` trzymał wiszące id skasowanego tokena:
      // atakujący/bloker, którego nie ma w `state.objects`. Ten sam rodzaj
      // niespójności wywrócił partię w M271 (błąd #16).
      if (state.combat) removeFromCombat(state, targetId);
      state.objects.delete(targetId);
      state.zones.battlefield = state.zones.battlefield.filter((id) => id !== targetId);
      state.events.push(event('token_ceased_to_exist', {
        objectId: targetId, cardId: object.cardId, name: object.name,
        controllerId: object.controllerId, zone: 'library',
      }));
      return;
    }
    const ownerId = object.ownerId ?? object.controllerId;
    const libId = `library-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'library', libId);
    const inOwnersLibrary = Object.freeze({ ...moved, controllerId: ownerId });
    state.objects.set(libId, inOwnersLibrary);
    // Spód biblioteki = OSTATNI element w strefie (top = pierwszy).
    state.zones.library = [...state.zones.library.filter((id) => id !== libId), libId];
    state.events.push(event('object_moved', {
      fromId: targetId, object: inOwnersLibrary, fromZone: 'battlefield', toZone: 'library',
      toBottom: true, bounced: true, toOwner: true,
    }));
    return;
  }
  if (effect.type === 'exile_return_transformed') {
    // „Exile this permanent, then return it to the battlefield transformed”
    // (Jill → Shiva; Saga III Shivy: powrót STRONĄ PRZEDNIA — ta sama
    // mechanika: deskryptor transformTo wskazuje zawsze „inną” stronę).
    // Nowy obiekt (CR 400.7): liczniki i modyfikacje nie przechodzą, wchodzi
    // z summoning sickness jak każdy permanent wchodzący na pole bitwy.
    const target = sourceObject.transformTo;
    if (!target) return;
    const object = state.objects.get(sourceObject.id);
    // Źródło zdążyło opuścić pole bitwy (np. rozdział Sagi po zniszczeniu) —
    // efekt nie ma czego przemieniać (CR 608.2b), bez błędu.
    if (!object || object.zone !== 'battlefield') return;
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, object.id, 'exile', exileId, { exiledBy: sourceObject.cardId });
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
      // M270 (CR 400.7): permanent WRACA na pole bitwy jako nowy obiekt, więc
      // „wszedł na pole bitwy" W TEJ turze. Baza `exiled` pochodzi ze strefy
      // wygnania, gdzie moveObjectDirectly ustawiło `enteredOnTurn: null`,
      // a ręczne złożenie obiektu (ta ścieżka omija choke point) przenosiło
      // tę wartość na pole bitwy. Skutkiem warunek „as long as it entered
      // this turn" (Crew Captain — indestructible) i `onlyIfTargetEnteredThisTurn`
      // czytały turę SPRZED wygnania: permanent, który wrócił właśnie teraz,
      // nie był uznawany za świeżo przybyły.
      enteredOnTurn: state.turn.number,
      // Komplet charakterystyk drugiej strony (CR 711.2) — wspólny helper
      // niesie też `kind`, którego wcześniej brakowało: strona zmieniająca
      // rodzaj permanentu (Incubator → Phyrexian) wracała z pola bitwy jako
      // obiekt o rodzaju strony przedniej.
      ...transformedCharacteristics(target, exiled),
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
    // M273 (błąd #24): powrót transformowanej karty to WEJŚCIE na pole bitwy
    // (CR 121.6) — liczniki wejścia obowiązują także tutaj. Ta ścieżka omija
    // choke point stref (mutuje `state.zones` wprost), więc helper trzeba
    // zawołać jawnie.
    applyEnterCounters(state, bfId);
    state.events.push(event('object_moved', {
      fromId: exileId, object: transformed, fromZone: 'exile', toZone: 'battlefield', transformReturn: true,
    }));
    // controllerId: warstwa stołu kwalifikuje transform do panelu
    // „Rozgrywka" po kontrolerze (isHumanHeadline, M257/K4).
    const transformedEvent = event('object_transformed', { objectId: bfId, fromCardId: object.cardId, cardId: target.cardId, controllerId: transformed.controllerId });
    state.events.push(transformedEvent);
    return;
  }
  if (effect.type === 'prevent_damage_this_turn') {
    // „Prevent all damage that would be dealt to artifact creatures this
    // turn” (Ethersworn Shieldmage, CR 614 w minimalnym wymiarze): filtr
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
    // state.linkedAnimations — przy odejściu źródła z pola bitwy (objects.js)
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
    // CR 608.2b: cel mógł opuścić pole bitwy między wyborem a rozstrzygnięciem
    // (stos triggerów) — brak efektu zamiast crasha addCounter.
    const target = targetId ? state.objects.get(targetId) : null;
    if (amount > 0 && target && target.zone === 'battlefield') addCounter(state, targetId, counterName, amount);
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
    // M273 (błąd #24): liczniki wejścia — ta sama reguła co przy rzucie.
    applyEnterCounters(state, bfId);
    state.events.push(event('permanent_entered_battlefield', {
      objectId: bfId, object: moved, cardId: moved.cardId,
      controllerId: moved.controllerId, fromGraveyard: true,
    }));
    return;
  }
  if (effect.type === 'sacrifice_each_other_creature') {
    // „Sacrifice each other creature you control” (Plague Reaver, end-step
    // trigger): wszystkie inne stwory kontrolera źródła trafiają do grobu.
    // Pętla po kopii listy — każde poświęcenie to zmiana strefy (CR 400.7).
    const controllerId = sourceObject.controllerId;
    const victims = otherCreaturesYouControl(state, controllerId, sourceObject.id);
    for (const victim of victims) {
      const victimId = victim.id;
      const toZone = deathZoneFor(state, victim);
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
    // player's control at the beginning of their next upkeep.” Opóźniony
    // trigger (CR 603.7): wpis wskazuje obiekt ŹRÓDŁA W GROBIE (zdolność
    // kosztuje sacrifice — abilities.js przekazuje obiekt z grobu) i gracza-
    // cel; rozstrzyga go blok upkeep w triggers.js. „Next upkeep” — gdy cel
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
    // „Tap all lands your opponents control” (Saga III Shivy — Cold Snap):
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
    // Station (Wedgelight Rammer, Warmaker Gunship): „Tap another creature you
    // control: Put charge counters equal to its power on this Spacecraft.”
    // Zatapnięty w koszcie stwór przychodzi jako targets[0] (abilities.js
    // tapOtherCreature). D (2026-08-11): zdolność idzie na STOS — przeciwnik
    // mógł odpowiedzieć instanitem (usunąć zatapniętego stwora), więc przy
    // rozstrzyganiu cel może być już poza polem bitwy. CR 608.2b: jeśli cel
    // nie jest już legalny, efekt nic nie robi (koszt tap już zapłacony).
    const tappedId = targets[0];
    const tapped = state.objects.get(tappedId);
    if (!tapped || tapped.zone !== 'battlefield') return;
    // Źródło (Spacecraft) mogło opuścić pole bitwy przed rozstrzygnięciem
    // (CR 608.2b — zdolność na stosie, przeciwnik mógł odpowiedzieć) —
    // wtedy nie ma na co kłaść liczników.
    const stationSource = state.objects.get(sourceObject.id);
    if (!stationSource || stationSource.zone !== 'battlefield') return;
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
          // M269 (błąd #4): trucizna idzie przez WSPÓLNY helper
          // `addPoisonCounters`, a nie przez `player.poison += 1`. Helper
          // emituje `poison_counters_added` — jedyne zdarzenie, które
          // rozumie log stołu („otrzymuje znaki trucizny") i heurystyczny bot
          // (waga 45). Dotąd proliferate zgłaszał truciznę jako `counter_added`
          // z `objectId` będącym ID GRACZA: log szukał obiektu o tym id,
          // nie znajdował go i pisał „? dostaje +1 licznik poison" (klasa L29
          // — fallback-znak zapytania), a bot nie widział postępu do wygranej
          // przez truciznę (CR 704.5c). `counter_added` zostaje obok, żeby
          // liczniki gracza i permanentów dalej miały wspólny strumień.
          addPoisonCounters(state, player.id, 1);
          state.events.push(event('counter_added', {
            objectId: player.id, cardId: null, counter: 'poison', amount: 1,
            total: player.poison, fromProliferate: true,
          }));
          proliferated += 1;
        }
        continue;
      }
      const obj = state.objects.get(targetId);
      if (!obj || obj.zone !== 'battlefield') continue;
      // M269 (błąd #2): dokładanie liczników idzie przez WSPÓLNY helper
      // `addCounter`, a nie przez własną re-inkarnację obiektu. Własna
      // ścieżka pomijała `syncStationKind`, więc Spacecraft (station)
      // dobity proliferatem do progu („It's an artifact creature at 6+")
      // zostawał zwykłym artefaktem: nie mógł atakować ani blokować, a
      // kafel dalej pokazywał „Artifact — Spacecraft". Helper emituje
      // `counter_added` i synchronizuje rodzaj/typy (CR 205.1); znacznik
      // `fromProliferate` dokładamy do wyemitowanego zdarzenia, żeby log
      // nadal odróżniał proliferate od zwykłego dołożenia licznika.
      const namesToBump = Object.entries(obj.counters ?? {})
        .filter(([, count]) => count > 0)
        .map(([name]) => name);
      for (const name of namesToBump) {
        const before = state.events.length;
        addCounter(state, obj.id, name, 1);
        // Zdarzenia są płaskie i zamrożone (protocol/types.js: { type, ...data }),
        // więc znacznik dokładamy przez odtworzenie wpisu. Szukamy po INDEKSIE
        // (a nie „ostatniego"), bo addCounter może dołożyć po nim kolejne
        // zdarzenie — np. `station_status_changed` przy przekroczeniu progu.
        for (let i = before; i < state.events.length; i += 1) {
          if (state.events[i]?.type !== 'counter_added') continue;
          const { type, ...data } = state.events[i];
          state.events[i] = event('counter_added', { ...data, fromProliferate: true });
          break;
        }
        proliferated += 1;
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
      // M89: cardIds to obiekty odsłoniętych kart (objectIds, jak w teście
      // 909 i reszcie engine). Dodatkowe pole revealedNames (cardId karty
      // w kolejności topN) — UI/commandLabel czyta NAZWY, a nie id obiektów
      // (FoW biblioteki ukrywa objectIds przed graczem). Utrzymujemy je
      // w synchroniczności z topN: cardIds[i] ↔ revealedNames[i].
      const revealedNames = topN.map((id) => state.objects.get(id)?.cardId ?? null);
      state.pendingRevealOrder = {
        playerId: ownerId,
        sourceId: sourceObject.id,
        sourceCardId: sourceObject.cardId ?? null,
        cardIds: [...topN],
        revealedNames,
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
    // Sprawdź poprawność: order musi być permutacją revealed (objectIds).
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
        // stwory na polu bitwy (z wyłączeniem źródła). Hexproof
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
    // M254/D: powrót czyści znacznik — karta wraca na stół jako zwykły
    // permanent, a nie „wygnana tymczasowo" (bez tego badge wisiałby na
    // obiekcie na polu bitwy, choć strefa wygnania już go nie dotyczy).
    const permanent = Object.freeze({
      ...moved, controllerId: ownerId, summoningSickness: true, temporaryExile: null,
    });
    state.objects.set(newId, permanent);
    // M273 (błąd #24): powrót z wygnania to też WEJŚCIE na pole bitwy
    // (CR 121.6) — liczniki wejścia obowiązują.
    applyEnterCounters(state, newId);
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
    // CR 401.4: gracz ogląda wierzch WŁASNEJ biblioteki — zones.library jest
    // wspólną listą przeplatanych kart obu graczy, filtrujemy po kontrolerze
    // (fix 2026-08-10; analogicznie do mill_from_bottom z M58).
    const library = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === controllerId);
    const count = Math.min(5, library.length);
    if (count === 0) return;
    // "You may" — always offer the choice (even if no basic lands, player
    // can still decline). The resolve handler allows skip.
    state.pendingFertileThicket = {
      controllerId,
      sourceCardId: sourceObject?.cardId ?? null,
      topCardIds: library.slice(0, count),
      basicLandIds: library.slice(0, count).map(id => {
        const obj = state.objects.get(id);
        return obj && (obj.types ?? []).includes('Basic') && (obj.types ?? []).includes('Land') ? id : null;
      }).filter(Boolean),
      allowSkip: true, // "you may" = can decline
    };
    state.events.push(event('fertile_thicket_reveal_started', {
      controllerId, cardCount: count, basicLandCount: (state.pendingFertileThicket.basicLandIds).length,
      sourceCardId: sourceObject?.cardId ?? null,
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
    if (lands.length === 0) {
      // M258/F4 (Żywy Tester, CR 101.3/608.2b): „Sacrifice a land." Roilinga
      // to INSTRUKCJA rozstrzygnięcia, nie koszt dodatkowy — niemożliwą
      // instrukcję pomija się, ale kolejne („Search...") trzeba wykonać.
      // Opcjonalny Springbloom Druid („you may... If you do") bez lądu
      // nie robi nic — bez szukania.
      if (!effect.mandatory) return;
      queueSearchChoice(state, sourceObject, {
        qualifier: { types: ['Basic', 'Land'] },
        destination: 'battlefield',
        entersTapped: true,
        chain: { remaining: 1, qualifier: { types: ['Basic', 'Land'] }, destination: 'battlefield', entersTapped: true },
      });
      return;
    }
    state.pendingSpringbloom = {
      controllerId,
      sourceId: sourceObject.id,
      // M201/F: nazwa ŹRÓDŁA jedzie w decyzji — kolejne zdarzenia (resolved,
      // skipped) też muszą nazwać właściwą kartę, nie pierwszą, która
      // wprowadziła mechanikę.
      cardId: sourceObject?.cardId ?? null,
      landIds: lands,
      // Batch 46 (Roiling Regrowth): „Sacrifice a land." jest OBOWIĄZKOWE,
      // w odróżnieniu od Springbloom Druida („you may sacrifice a land").
      // Bez tej flagi gracz dostawał opcję „nie poświęcaj" przy czarze,
      // który jej nie ma (CR 601.2h — koszt/efekt obowiązkowy).
      mandatory: Boolean(effect.mandatory),
    };
    // M201/F (zgłoszenie właściciela): zdarzenie niesie ŹRÓDŁO efektu —
    // mechanika nazywa się po pierwszej karcie, która ją wprowadziła
    // (Springbloom Druid), ale używa jej też Roiling Regrowth. Bez cardId
    // warstwa opisu pisała w logu cudzą nazwę (ADR 0002 w warstwie opisu).
    state.events.push(event('springbloom_choice_required', {
      controllerId, cardId: sourceObject?.cardId ?? null,
      // M258/F5: opcjonalność poświęcenia to informacja regułowa — log nie
      // może mówić „może" przy obowiązkowym poświęceniu (Roiling Regrowth).
      mandatory: Boolean(effect.mandatory),
    }));
    return;
  }
  // Might of the Masses (2XM): target creature gets +1/+1 per creature you control
  if (effect.type === 'pump_by_creature_count') {
    const targetId = targets[0];
    if (targetId == null) return;
    const target = state.objects.get(targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') return;
    const count = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.controllerId === sourceObject.controllerId && o.kind === 'creature').length;
    const amount = count * (effect.perCreature ?? 1);
    modifyStats(state, targetId, { power: amount, toughness: amount });
    return;
  }
  // Basilisk Gate (CLB): „Target creature gets +X/+X until end of turn, where
  // X is the number of Gates you control" — pump dynamiczny po liczbie
  // kontrolowanych permanentów o podtypie Gate (CR 205.3d).
  if (effect.type === 'pump_by_gates') {
    const targetId = targets[0];
    if (targetId == null) return;
    const target = state.objects.get(targetId);
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') return;
    const gates = [...state.objects.values()].filter((o) => o.zone === 'battlefield'
      && o.controllerId === sourceObject.controllerId
      && (o.subtypes ?? []).includes('Gate')).length;
    modifyStats(state, targetId, { power: gates, toughness: gates });
    return;
  }
  // Hecteyes (FIN): ETB each opponent discards a card
  if (effect.type === 'discard_each_opponent') {
    const opponents = state.players.filter((p) => p.id !== sourceObject.controllerId);
    for (const opp of opponents) {
      const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === opp.id);
      if (handIds.length === 0) continue;
      // Dla 1v1 tylko jeden przeciwnik — queue pierwsza decyzja, reszta via kolejka? Dla uproszczenia 1v1: jedna decyzja
      state.pendingDiscardChoice = {
        playerId: opp.id,
        count: Math.min(effect.amount ?? 1, handIds.length),
        handIds,
        purpose: 'effect',
        sourceCardId: sourceObject.cardId ?? null,
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = opp.id;
      state.events.push(event('discard_choice_required', {
        playerId: opp.id, count: Math.min(effect.amount ?? 1, handIds.length), cardIds: [...handIds],
        purpose: 'effect', sourceCardId: sourceObject.cardId ?? null,
      }));
      return true;
    }
    return;
  }
  // Index (APC): sorcery — look at top 5, put back any order
  if (effect.type === 'index_look') {
    const controllerId = sourceObject.controllerId;
    const topIds = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === controllerId).slice(0, 5);
    if (topIds.length === 0) return;
    state.pendingIndex = {
      playerId: controllerId,
      sourceCardId: sourceObject?.cardId ?? null,
      objectIds: [...topIds],
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('index_started', { playerId: controllerId, count: topIds.length, cardIds: topIds.map((id) => state.objects.get(id)?.cardId).filter(Boolean), sourceCardId: sourceObject?.cardId ?? null }));
    return true;
  }

  // Gurmag Drowner (DTK): „When this creature exploits a creature, look at
  // the top four cards of your library. Put one of them into your hand and
  // the rest into your graveyard." — look top N, wybierz JEDNĄ do ręki,
  // reszta do grobu. Blokująca decyzja jak scry/surveil (pendingLookTopN).
  if (effect.type === 'look_top_put_one_hand_rest_bottom') {
    // M177/E (Merchant's Dockhand): „Look at the top X cards… Put one of
    // them into your hand and the rest on the bottom of your library in any
    // order.” — X z kosztu (context.xValue); reszta na SPÓD (pendingLookTopN
    // z restTo, opcjonalna kolejność bottomOrder na komendzie — jak scry).
    const controllerId = sourceObject.controllerId;
    const n = effect.amount === 'x' ? (context?.xValue ?? 0) : (effect.amount ?? 1);
    const topIds = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === controllerId).slice(0, n);
    if (topIds.length === 0) return;
    state.pendingLookTopN = {
      playerId: controllerId,
      objectIds: [...topIds],
      restTo: 'library_bottom',
      restorePriorityTo: state.turn.priorityPlayerId,
      // Pętla jakości (Żywy Tester, tarkir-wur vs innistrad-brg, seed 316):
      // źródło decyzji (permanent na polu bitwy — informacja publiczna) dla
      // tytułu modala, jak pendingManifestDread (M251/B) i pendingSatyrLook
      // (M240/B) — bez nazw w warstwie opisu (ADR 0002).
      sourceCardId: sourceObject?.cardId ?? null,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('look_top_started', {
      playerId: controllerId, count: topIds.length,
      cardIds: topIds.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
    }));
    return true;
  }
  // Manifest Dread (DSK, CR 701.34): „Look at the top two cards of your library.
  // Put one onto the battlefield face down as a 2/2 creature and the other into
  // your graveyard." Blokująca decyzja kontrolera (pendingManifestDread,
  // resolve_manifest_dread). Generyczne (ADR 0002) — bez nazw kart.
  if (effect.type === 'manifest_dread') {
    const controllerId = sourceObject.controllerId;
    const topIds = state.zones.library
      .filter((id) => state.objects.get(id)?.controllerId === controllerId)
      .slice(0, 2);
    if (topIds.length === 0) return;
    if (topIds.length === 1) {
      // Tylko jedna karta w bibliotece: manifestujemy ją bez wyboru (CR 701.34c
      // — „as many as possible"), nic do grobu.
      manifestCardFaceDown(state, topIds[0], controllerId);
      return true;
    }
    state.pendingManifestDread = {
      playerId: controllerId,
      objectIds: [...topIds],
      restorePriorityTo: state.turn.priorityPlayerId,
      // M251/B (audyt Żywym Testerem): źródło decyzji jak u pendingSatyrLook
      // (M240/B) — rozstrzygany czar leży na stosie, czyli jest informacją
      // PUBLICZNĄ; stół nazywa nim tytuł modala (klasa M162/C, ADR 0002).
      sourceCardId: sourceObject?.cardId ?? null,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('manifest_dread_required', {
      playerId: controllerId,
      objectIds: [...topIds],
      cardIds: topIds.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
    }));
    return true;
  }
  if (effect.type === 'look_top_put_one_hand_rest_grave') {
    const controllerId = sourceObject.controllerId;
    const n = effect.amount ?? 4;
    const topIds = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === controllerId).slice(0, n);
    if (topIds.length === 0) return;
    state.pendingLookTopN = {
      playerId: controllerId,
      objectIds: [...topIds],
      restorePriorityTo: state.turn.priorityPlayerId,
      // Pętla jakości: źródło decyzji dla tytułu modala (permanent na polu
      // bitwy — informacja publiczna); ten sam wzorzec co M251/B i M240/B.
      sourceCardId: sourceObject?.cardId ?? null,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('look_top_started', {
      playerId: controllerId, count: topIds.length,
      cardIds: topIds.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
    }));
    return true;
  }
  // Satyr Wayfinder (M15): „When this creature enters, reveal the top four
  // cards of your library. You may put a land card from among them into your
  // hand. Put the rest into your graveyard.” — blokująca decyzja kontrolera:
  // może wybrać LĄD z odsłoniętych do ręki (lub zrezygnować — „you may”);
  // reszta (i te bez wyboru) idzie do grobu. Nowy pendingSatyrLook.
  if (effect.type === 'reveal_top_pick_land_rest_grave') {
    const controllerId = sourceObject.controllerId;
    const n = effect.amount ?? 4;
    const topIds = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === controllerId).slice(0, n);
    // Batch 44 (Blanchwood Prowler): „mill three... You may put a land card
    // from among the cards milled this way into your hand. If you don't, put
    // a +1/+1 counter on this creature." — counterIfNone: gdy landa nie
    // wzięto (rezygnacja ALBO brak landa wśród kart), źródło dostaje licznik.
    // Bez landów decyzji nie ma: karty idą do grobu, licznik od razu.
    if (topIds.length === 0) {
      if (effect.counterIfNone && sourceObject.zone === 'battlefield' && sourceObject.kind === 'creature') {
        addCounter(state, sourceObject.id, '+1/+1', 1);
      }
      return;
    }
    const landIds = topIds.filter((id) => {
      const o = state.objects.get(id);
      return o && ((o.kind ?? '') === 'land' || (o.types ?? []).includes('Land'));
    });
    if (effect.counterIfNone && landIds.length === 0) {
      for (const id of topIds) {
        const graveId = `grave-${state.objectSequence++}`;
        const movedGrave = moveObjectDirectly(state, id, 'graveyard', graveId);
        state.events.push(event('object_moved', { fromId: id, object: movedGrave, fromZone: 'library', toZone: 'graveyard', milled: true }));
      }
      const src = state.objects.get(sourceObject.id);
      if (src && src.zone === 'battlefield' && src.kind === 'creature') {
        addCounter(state, sourceObject.id, '+1/+1', 1);
      }
      return;
    }
    state.pendingSatyrLook = {
      playerId: controllerId,
      objectIds: [...topIds],
      landIds: [...landIds],
      // M240/B (zgłoszenie): tytuł decyzji nazywa ŹRÓDŁO (karta na polu
      // bitwy — informacja publiczna). Bez tego modal mówił „Wybierz:
      // Wariant (N opcji)” — gracz nie wiedział, jakiej to karty decyzja.
      sourceCardId: sourceObject.cardId ?? null,
      ...(effect.counterIfNone ? { counterIfNoneSourceId: sourceObject.id } : {}),
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = controllerId;
    state.events.push(event('satyr_look_started', {
      playerId: controllerId, count: topIds.length,
      landCount: landIds.length,
      cardIds: topIds.map((id) => state.objects.get(id)?.cardId).filter(Boolean),
    }));
    return true;
  }

  // Civilized Scholar (ISD): „{T}: Draw a card, then discard a card. If a
  // creature card is discarded this way, untap this creature, then transform
  // it." — draw 1, potem blokująca decyzja odrzucenia (CR 701.18 — wybór
  // odrzucającego). Po odrzuceniu karty-stwora resolve_discard_choice wykonuje
  // untap + transform źródła (pole onCreatureDiscard w pendingDiscardChoice).
  if (effect.type === 'draw_then_discard') {
    drawPlayerCards(state, sourceObject.controllerId, effect.amount ?? 1, 'effect');
    const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === sourceObject.controllerId);
    if (handIds.length === 0) return;
    state.pendingDiscardChoice = {
      playerId: sourceObject.controllerId,
      count: 1,
      handIds,
      purpose: 'effect',
      sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
      // Po odrzuceniu karty-stwora: odkręć i przemień źródło (Civilized Scholar).
      onCreatureDiscard: effect.transformOnCreatureDiscard
        ? { sourceId: sourceObject.id, untap: true, transform: true }
        : null,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('discard_choice_required', {
      playerId: sourceObject.controllerId, count: 1, cardIds: [...handIds],
      purpose: 'effect', sourceCardId: sourceObject.cardId ?? null,
    }));
    return true;
  }
  // Force Away (KTK): „Ferocious — If you control a creature with power 4 or
  // greater, you may draw a card. If you do, discard a card." Warunek i decyzja
  // przy ROZSTRZYGANIU czaru (plansza mogła się zmienić na stosie). Efekt
  // kolejkuje pendingOptionalDraw (tak/nie); po TAK: draw 1 + discard 1.
  if (effect.type === 'ferocious_draw_discard') {
    const ctrl = sourceObject.controllerId;
    const hasFerocious = [...state.objects.values()].some((o) => o.zone === 'battlefield'
      && o.controllerId === ctrl && o.kind === 'creature' && effectivePower(o, state) >= 4);
    if (!hasFerocious) return;
    state.pendingOptionalDraw = {
      playerId: ctrl,
      sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = ctrl;
    state.events.push(event('optional_draw_required', { playerId: ctrl, sourceCardId: sourceObject?.cardId ?? null }));
    return true;
  }

  // Etherium Abomination — Unearth (CR 702.87): „{1}{U}{B}: Return this card
  // from your graveyard to the battlefield. It gains haste. Exile it at the
  // beginning of the next end step or if it would leave the battlefield.
  // Unearth only as a sorcery." Podobne do Puppeteer (haste + delayed exile),
  // ale obiekt wraca do WŁAŚCICIELA (nie kontrolera źródła) i niesie flagę
  // unearthExile — moveObjectDirectly wygnuje go zamiast opuścić pole bitwy.
  if (effect.type === 'unearth_return') {
    const sourceObj = state.objects.get(sourceObject.id);
    if (!sourceObj || sourceObj.zone !== 'graveyard' || sourceObj.kind !== 'creature') return;
    const ownerId = sourceObj.ownerId ?? sourceObj.controllerId;
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sourceObject.id, 'battlefield', newId);
    const keywords = [...new Set([...(moved.keywords ?? []), 'haste'])];
    const permanent = Object.freeze({
      ...moved, controllerId: ownerId, keywords: Object.freeze(keywords),
      summoningSickness: true, unearthExile: true,
    });
    state.objects.set(newId, permanent);
    // M273 (błąd #24): liczniki wejścia — ta sama reguła co przy rzucie.
    applyEnterCounters(state, newId);
    state.events.push(event('object_moved', { fromId: sourceObject.id, object: permanent, fromZone: 'graveyard', toZone: 'battlefield', unearth: true }));
    state.delayedTriggers.push({
      type: 'exile_object', objectId: newId, playerId: ownerId,
      // Unearth (CR 702.83a): „Exile it at the beginning of THE NEXT end
      // step" — jak wyżej, najbliższy krok końcowy (M105/B6).
      anyPlayerEndStep: true,
      armedOnTurn: state.turn.number, cardId: permanent.cardId,
      // M262: wygnanie z mechaniki unearth — badge mechaniki, nie karty.
      exiledBy: 'unearth',
    });
    return;
  }
  // M109 (Nightsnare): „Target opponent reveals their hand. You may choose
  // a nonland card from it. If you do, that player discards that card.
  // If you don't, that player discards two cards." Reveal + decyzja
  // RZUCAJĄCEGO (chooserId) o karcie z CUDZEJ ręki; rezygnacja przełącza
  // na zwykłe odrzucenie dwóch kart wybieranych przez właściciela ręki
  // (CR 701.8a — odrzuca ten, kto odrzuca).
  if (effect.type === 'reveal_hand_choose_discard') {
    const targetId = targets[0];
    if (!state.players.some((p) => p.id === targetId)) return;
    const handIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === targetId);
    if (handIds.length === 0) return; // pusta ręka — nic do odsłonięcia i odrzucenia
    state.events.push(event('hand_revealed', {
      playerId: targetId, cardIds: [...handIds],
      cardNames: handIds.map((id) => state.objects.get(id)?.cardId ?? null),
      sourceCardId: sourceObject.cardId ?? null, revealedToId: sourceObject.controllerId,
    }));
    // Batch 47 (Divest, 2XM): Oracle zawęża wybór do „an artifact or creature
    // card". Dotąd filtr był ZASZYTY na „nonland" (Toll of the Invasion), więc
    // Divest wybierałby też instanty i enchantmenty. Filtr jest teraz
    // deskryptorem karty (ADR 0002 — reguła w danych, nie w kodzie):
    // `filter.anyTypes` = karta musi mieć CO NAJMNIEJ JEDEN z tych typów.
    // Bez filtra zachowanie zostaje jak dotąd (dowolna karta nielandowa).
    const anyTypes = effect.filter?.anyTypes ?? null;
    const nonland = handIds.filter((id) => {
      const o = state.objects.get(id);
      if (!o) return false;
      if (anyTypes) return anyTypes.some((type) => (o.types ?? []).includes(type));
      return o.kind !== 'land' && !(o.types ?? []).includes('Land');
    });
    const declineAmount = effect.declineAmount ?? 2;
    // M174/B (Toll of the Invasion, WAR): „You choose a nonland card from
    // it. That player discards that card." — wybór OBOWIĄZKOWY (bez opcji
    // rezygnacji); brak kart nieladowych = nikt nic nie odrzuca (Oracle),
    // a nie kara declineAmount (to wariant Nightsnare „If you don't").
    const mandatory = effect.mandatory === true;
    const restorePriorityTo = state.turn.priorityPlayerId;
    if (nonland.length === 0 && mandatory) return;
    if (nonland.length === 0) {
      // „If you don't" bez możliwości wyboru: od razu odrzucenie N kart
      // przez właściciela ręki (bez pustej oferty dla rzucającego).
      const count = Math.min(declineAmount, handIds.length);
      state.pendingDiscardChoice = {
        playerId: targetId, count, handIds, purpose: 'effect',
        sourceCardId: sourceObject.cardId ?? null, restorePriorityTo,
      };
      state.turn.priorityPlayerId = targetId;
      state.events.push(event('discard_choice_required', {
        playerId: targetId, count, cardIds: [...handIds],
        purpose: 'effect', sourceCardId: sourceObject.cardId ?? null,
      }));
      return true;
    }
    state.pendingDiscardChoice = {
      playerId: targetId,
      // Decyzję podejmuje KTO INNY niż odrzucający — stąd osobne pole.
      chooserId: sourceObject.controllerId,
      count: 1,
      handIds: nonland,
      allowDecline: !mandatory,
      ...(mandatory ? {} : { declineAmount }),
      purpose: 'effect',
      sourceCardId: sourceObject.cardId ?? null,
      restorePriorityTo,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('discard_choice_required', {
      playerId: targetId, chooserId: sourceObject.controllerId, count: 1,
      cardIds: [...nonland], allowDecline: !mandatory,
      ...(mandatory ? {} : { declineAmount }),
      purpose: 'effect', sourceCardId: sourceObject.cardId ?? null,
    }));
    return true;
  }
  // Dreams of Steel and Oil (BRO): „Target opponent reveals their hand. You
  // choose an artifact or creature card from it, then choose an artifact or
  // creature card from their graveyard. Exile the chosen cards." — reveal +
  // DWIE sekwencyjne decyzje gracza (ręka, potem grób); exile obu.
  if (effect.type === 'reveal_hand_choose_exile') {
    const targetId = targets[0];
    if (!state.players.some((p) => p.id === targetId)) return;
    const handIds = state.zones.hand.filter((id) => {
      const o = state.objects.get(id);
      return o && o.controllerId === targetId && (o.kind === 'creature' || (o.types ?? []).includes('Artifact'));
    });
    const graveIds = state.zones.graveyard.filter((id) => {
      const o = state.objects.get(id);
      return o && o.controllerId === targetId && (o.kind === 'creature' || (o.types ?? []).includes('Artifact'));
    });
    if (handIds.length === 0 && graveIds.length === 0) return; // fizzle części — nic do wyboru
    state.pendingRevealExile = {
      playerId: sourceObject.controllerId,
      opponentId: targetId,
      cardId: sourceObject?.cardId ?? null, // M201/F: źródło do opisów
      handIds,
      graveIds,
      chosenHand: null,
      chosenGrave: null,
      // M69: etap decyzji — 'hand' → 'grave' (chosenHand=null oznacza „brak
      // wyboru", nie „nie wybrano"; bez etapu pętla przy pustej ręce).
      stage: 'hand',
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = sourceObject.controllerId;
    state.events.push(event('reveal_exile_required', {
      playerId: sourceObject.controllerId, opponentId: targetId,
      handCardIds: handIds, graveCardIds: graveIds,
      // M201/F (ta sama klasa co springbloom): opis nazywa ŹRÓDŁO z danych,
      // nie zaszytą w kodzie nazwę karty.
      cardId: sourceObject?.cardId ?? null,
    }));
    return true;
  }

  if (effect.type === 'set_base_pt_until_end_of_turn') {
    const targetId = targets[0];
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return;
    const newPower = effect.power ?? 4;
    const newToughness = effect.toughness ?? 4;
    state.objects.set(targetId, Object.freeze({
      ...object, tempBasePT: Object.freeze({ power: newPower, toughness: newToughness }),
    }));
    // M138/Z4 (audyt Żywym Testerem, L24): skutek bez zdarzenia jest dla reszty
    // systemu NIEWIDZIALNY — a `resolveTrigger` uznaje „0 nowych zdarzeń” za
    // „trigger bez efektu” i pisze graczowi „nic się nie wydarzyło (zerowy
    // wynik)”. Voice of the Vermin realnie ustawił bazowe 4/4 (Giant Spider
    // 1/3 → 3/3), a log twierdził, że nic z tego nie wyszło. Cisza nie tylko
    // ukrywała skutek, ale produkowała AKTYWNIE fałszywy komunikat.
    state.events.push(event('stats_modified', {
      objectId: targetId, cardId: object.cardId,
      basePower: newPower, baseToughness: newToughness, untilEndOfTurn: true,
    }));
    return;
  }
  // Jolrael, Mwonvuli Recluse (MKC): „Until end of turn, creatures you
  // control have base power and toughness X/X, where X is the number of cards
  // in your hand." Masowa wersja set_base_pt_until_end_of_turn — tempBasePT na
  // każdym stworze kontrolera źródła (czyszczone w cleanup, jak pojedyncze).
  // X liczony przy rozstrzygnięciu (CR 608.2g) z liczby kart w ręce.
  if (effect.type === 'set_base_pt_creatures_you_control') {
    const x = (effect.power === 'hand_size')
      ? state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === sourceObject.controllerId).length
      : (effect.power ?? 0);
    // Zdarzenie PER STWÓR (jak pojedynczy set_base_pt_until_end_of_turn):
    // stats_modified z basePower/baseToughness — konsument logu opisuje
    // „X staje się X/X do końca tury". Masowy wariant nie używa
    // mass_stats_modified (ten niesie modyfikatory +X/+Y, nie bazę).
    for (const object of [...state.objects.values()]) {
      if (object.zone !== 'battlefield' || object.controllerId !== sourceObject.controllerId || object.kind !== 'creature') continue;
      state.objects.set(object.id, Object.freeze({
        ...object, tempBasePT: Object.freeze({ power: x, toughness: x }),
      }));
      state.events.push(event('stats_modified', {
        objectId: object.id, cardId: object.cardId,
        basePower: x, baseToughness: x, untilEndOfTurn: true,
      }));
    }
    return;
  }
  if (effect.type === 'set_saddled') {
    const object = state.objects.get(sourceObject.id);
    if (!object || object.zone !== 'battlefield') return;
    state.objects.set(object.id, Object.freeze({ ...object, saddled: true }));
    state.events.push(event('keyword_granted', { objectId: object.id, cardId: object.cardId, keywords: ['saddled'] }));
    return;
  }
    throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
