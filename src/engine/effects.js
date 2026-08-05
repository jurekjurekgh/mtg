import { event } from '../protocol/types.js';
import { animatePermanentUntilEndOfTurn, effectiveKeywords, effectivePower, effectiveToughness, effectiveSubtypes, goadUntilEndOfTurn, grantAbilitiesUntilEndOfTurn, grantBasicLandTypeUntilEndOfTurn, grantKeywordsUntilEndOfTurn, markDamage, modifyStats, turnFaceUp } from './permanents.js';
import { addCounter, removeCounter } from './counters.js';
import { addPoisonCounters, changeLife } from './players.js';
import { spendMana, addMana } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { createBattlefieldToken } from './tokens.js';
import { shuffle } from './shuffle.js';

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
      goadUntilEndOfTurn(state, targetId, pending.playerId);
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
  for (let i = 0; i < amount; i += 1) {
    const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
    if (!topId) break;
    const object = state.objects.get(topId);
    const newId = `drawn-${state.objectSequence++}`;
    state.zones.library = state.zones.library.filter((id) => id !== topId);
    state.zones.hand.push(newId);
    const drawn = Object.freeze({ ...object, id: newId, zone: 'hand' });
    state.objects.delete(topId);
    state.objects.set(newId, drawn);
    state.cardsDrawnThisTurn[playerId] = (state.cardsDrawnThisTurn[playerId] ?? 0) + 1;
    state.events.push(event('card_drawn', { playerId, fromId: topId, object: drawn }));
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
export function applyEffect(state, effect, sourceObject, targets = []) {
  if (effect.type === 'damage') {
    const targetId = targets[0];
    let amount = effect.amount;
    if (amount === 'artifacts_you_control') {
      amount = countArtifactsControlled(state, sourceObject.controllerId);
    }
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
    const damage = event('damage_dealt', {
      source: sourceObject.id, target: targetId, amount, combat: false,
    });
    state.events.push(damage);
    if (effectiveKeywords(sourceObject, state).includes('infect')) {
      if (state.players.some((player) => player.id === targetId)) {
        addPoisonCounters(state, targetId, amount);
      } else {
        addCounter(state, targetId, '-1/-1', amount);
      }
    } else if (state.players.some((player) => player.id === targetId)) {
      // Efekt „damage any target" nie jest combat damage i nie odpala triggera
      // combat_damage_to_player; SBA po komendzie rozstrzygnie ewentualne 0 życia.
      changeLife(state, targetId, -amount);
    } else {
      markDamage(state, targetId, amount);
    }
    return;
  }
  if (effect.type === 'damage_to_controller') {
    // Forge Devil: „it deals 1 damage to target creature and 1 damage to you."
    // „You" (kontroler źródła) nie jest celem — obrażenia trafiają w kontrolera,
    // niezależnie od innych celów efektu. To NIE są obrażenia combat.
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
    const targetId = sourceObject.controllerId;
    const damage = event('damage_dealt', { source: sourceObject.id, target: targetId, amount: effect.amount, combat: false });
    state.events.push(damage);
    changeLife(state, targetId, -effect.amount);
    return;
  }
  if (effect.type === 'pump') {
    // Trigger bez jawnych celów (np. landfall) pumpuje samo źródło.
    const targetId = targets[0] ?? sourceObject.id;
    // Dynamiczna wartość „source_power" (np. Jyoti: pump wg mocy źródła).
    const power = effect.power === 'source_power' ? effectivePower(sourceObject, state) : (effect.power ?? 0);
    const toughness = effect.toughness === 'source_power' ? effectivePower(sourceObject, state) : (effect.toughness ?? 0);
    modifyStats(state, targetId, { power, toughness });
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
    // Globalny buff do końca tury (Angel of the Dawn): wszystkie stwory
    // kontrolera źródła dostają statystyki i keywordy z jednego deskryptora.
    for (const object of [...state.objects.values()]) {
      if (object.zone !== 'battlefield' || object.controllerId !== sourceObject.controllerId || object.kind !== 'creature') continue;
      modifyStats(state, object.id, { power: effect.power ?? 0, toughness: effect.toughness ?? 0 });
      if (effect.keywords?.length) grantKeywordsUntilEndOfTurn(state, object.id, effect.keywords);
    }
    return;
  }
  if (effect.type === 'mill_cards') {
    // Mill N: karty z wierzchu biblioteki przechodzą do grobu jako nowe obiekty
    // strefy; pusta biblioteka nie przegrywa poza draw stepem. Domyślnie młynuje
    // się kontroler źródła; „Target player mills N" (Sweet Oblivion) młynuje
    // GRACZA-CEL (targets[0]), gdy wskaźnik celu jest graczem.
    const amount = effect.amount ?? 0;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Mill wymaga nieujemnej liczby kart');
    const targetPlayerId = (targets[0] && state.players.some((player) => player.id === targets[0]))
      ? targets[0]
      : sourceObject.controllerId;
    for (let i = 0; i < amount; i += 1) {
      const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === targetPlayerId);
      if (!topId) break;
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
    // Generyczne „may search for a card with qualifier, put it tapped on the
    // battlefield, then shuffle" (Kor Cartographer). Brak trafienia jest
    // legalnym fail-to-find; wybór pierwszej karty i tasowanie są deterministyczne.
    const ownerId = sourceObject.controllerId;
    const qualifier = effect.qualifier ?? {};
    const matches = (object) => {
      if (!object || object.controllerId !== ownerId) return false;
      const typeMatch = (qualifier.types ?? []).length === 0
        || (qualifier.types ?? []).every((type) => (object.types ?? []).includes(type));
      const subtypeMatch = (qualifier.subtypes ?? []).length === 0
        || (qualifier.subtypes ?? []).some((subtype) => (object.subtypes ?? []).includes(subtype));
      return typeMatch && subtypeMatch;
    };
    const matchId = state.zones.library.find((id) => matches(state.objects.get(id)));
    let foundCardId = null;
    if (matchId) {
      const newId = `permanent-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, matchId, 'battlefield', newId);
      const placed = Object.freeze({ ...moved, tapped: Boolean(effect.entersTapped || moved.entersTapped) });
      state.objects.set(newId, placed);
      foundCardId = placed.cardId;
      state.events.push(event('object_moved', {
        fromId: matchId, object: placed, fromZone: 'library', toZone: 'battlefield', searched: true,
      }));
      state.events.push(event('permanent_entered_battlefield', {
        fromId: matchId, objectId: newId, object: placed, cardId: placed.cardId,
        controllerId: ownerId, searched: true, entersTapped: placed.tapped,
      }));
    }
    const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId);
    const shuffled = shuffle(ownLibrary, state.seed + state.objectSequence);
    let cursor = 0;
    state.zones.library = state.zones.library.map((id) => {
      if (state.objects.get(id)?.controllerId !== ownerId) return id;
      const replacement = shuffled[cursor];
      cursor += 1;
      return replacement;
    });
    state.events.push(event('library_searched', {
      playerId: ownerId, foundCardId, destination: 'battlefield', shuffled: true, qualifier,
    }));
    return;
  }
  if (effect.type === 'search_library_to_hand') {
    // „Search your library for a card with qualifier, reveal it, put it into
    // your hand, then shuffle" (loch Undercity — Secret Entrance). Wybór
    // pierwszej pasującej karty i tasowanie są deterministyczne (ADR 0005).
    const ownerId = sourceObject.controllerId;
    const qualifier = effect.qualifier ?? {};
    const matches = (object) => {
      if (!object || object.controllerId !== ownerId) return false;
      const typeMatch = (qualifier.types ?? []).length === 0
        || (qualifier.types ?? []).every((type) => (object.types ?? []).includes(type));
      const subtypeMatch = (qualifier.subtypes ?? []).length === 0
        || (qualifier.subtypes ?? []).some((subtype) => (object.subtypes ?? []).includes(subtype));
      return typeMatch && subtypeMatch;
    };
    const matchId = state.zones.library.find((id) => matches(state.objects.get(id)));
    let foundCardId = null;
    if (matchId) {
      const handId = `hand-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, matchId, 'hand', handId);
      foundCardId = moved.cardId;
      state.events.push(event('card_revealed', { playerId: ownerId, objectId: handId, cardId: moved.cardId }));
    }
    const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === ownerId);
    const shuffled = shuffle(ownLibrary, state.seed + state.objectSequence);
    let cursor = 0;
    state.zones.library = state.zones.library.map((id) => {
      if (state.objects.get(id)?.controllerId !== ownerId) return id;
      const replacement = shuffled[cursor];
      cursor += 1;
      return replacement;
    });
    state.events.push(event('library_searched', {
      playerId: ownerId, foundCardId, destination: 'hand', shuffled: true, qualifier,
    }));
    return;
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
    const targetId = targets[0];
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
    // Odrzucenie N kart z ręki kontrolera źródła (Evangel: „draw a card, then
    // discard a card"). Wybór deterministyczny (ADR 0005): najdroższa karta,
    // przy remisie pierwsza w kolejności ręki — bez blokującej decyzji gracza.
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Odrzucenie wymaga dodatniej liczby kart');
    const playerId = sourceObject.controllerId;
    for (let i = 0; i < amount; i += 1) {
      let worst = null;
      for (const id of state.zones.hand) {
        const object = state.objects.get(id);
        if (object?.controllerId !== playerId) continue;
        const value = object.manaCost ?? 0;
        if (!worst || value > worst.value) worst = { id, value };
      }
      if (!worst) break;
      const object = state.objects.get(worst.id);
      const graveId = `grave-${state.objectSequence++}`;
      moveObjectDirectly(state, worst.id, 'graveyard', graveId);
      state.events.push(event('card_discarded', { playerId, fromId: worst.id, objectId: graveId, cardId: object.cardId }));
    }
    return;
  }
  if (effect.type === 'lose_life') {
    // Utrata życia (Delta Bloodflies: „each opponent loses 1 life"; loch
    // Undercity — Trap!: „target player loses 5 life"). To NIE są obrażenia
    // (nie odpalają triggerów damage i nie da się ich zapobiec jak obrażeniom).
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Utrata życia musi być dodatnia');
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
    goadUntilEndOfTurn(state, targetId, sourceObject.controllerId);
    return;
  }
  if (effect.type === 'grant_abilities') {
    // Nadanie zdolności „do końca tury" (Fake Your Own Death). Deskryptory
    // zdolności są generyczne — engine ich nie interpretuje po nazwie karty.
    const targetId = targets[0] ?? sourceObject.id;
    grantAbilitiesUntilEndOfTurn(state, targetId, effect.abilities ?? []);
    return;
  }
  if (effect.type === 'grant_keywords_until_end_of_turn') {
    // Nadanie keywordów celowi „do końca tury" (Stirring Bard: menace, haste).
    const targetId = targets[0] ?? sourceObject.id;
    grantKeywordsUntilEndOfTurn(state, targetId, effect.keywords ?? []);
    return;
  }
  if (effect.type === 'become_basic_land_type') {
    // Unstable Frontier: „target land you control becomes the basic land type
    // of your choice until end of turn". Wybór typu jest parametrem komendy
    // (subtype) — deterministycznie domyślnie Forest, gdy nie podano.
    const targetId = targets[0];
    grantBasicLandTypeUntilEndOfTurn(state, targetId, effect.subtype ?? 'Forest');
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
    addCounter(state, targetId, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'remove_counter') {
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
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel odkręcenia');
    if (object.tapped) {
      state.objects.set(targetId, Object.freeze({ ...object, tapped: false }));
      state.events.push(event('object_untapped', { objectId: targetId, playerId: sourceObject.controllerId }));
    }
    return;
  }
  if (effect.type === 'add_mana') {
    // Dodanie many do puli (Holdout Settlement: „Add one mana of any color" —
    // pula engine jest bezbarwna, więc dowolny kolor = 1 bezbarwna).
    // Mana produkowana przez Skarb (fromTreasure: true) jest identyfikowalna
    // w puli — Marut pyta, ile many ze Skarba wydano na jego rzut.
    addMana(state, sourceObject.controllerId, effect.amount ?? 1, { fromTreasure: Boolean(effect.fromTreasure) });
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
    const targetId = targets[0];
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard' || object.kind === 'land' || object.kind === 'spell') {
      throw new Error('Nieprawidłowy cel powrotu z grobu');
    }
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, summoningSickness: true });
    state.objects.set(newId, permanent);
    if (effect.finalityCounter) addCounter(state, newId, 'finality', 1);
    state.events.push(event('object_moved', { fromId: targetId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield' }));
    return;
  }
  if (effect.type === 'transform') {
    const target = sourceObject.transformTo;
    if (!target) throw new Error('Ta karta nie ma drugiej strony (transform)');
    const updated = Object.freeze({
      ...sourceObject,
      cardId: target.cardId,
      power: target.power,
      toughness: target.toughness,
      abilities: target.abilities,
      keywords: target.keywords ?? [],
      subtypes: target.subtypes ?? [],
      transformTo: {
        cardId: sourceObject.cardId,
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
  if (effect.type === 'exile_permanent') {
    const targetId = targets[0];
    if (!targetId) throw new Error('exile_permanent wymaga celu');
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel wygnania');
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'exile', exileId);
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'exile' }));
    return;
  }
  if (effect.type === 'destroy_permanent') {
    // Destroy target artifact/permanent (Shatter, CR 701.7): cel trafia do grobu
    // (zmiana strefy battlefield → graveyard), co odpala trigger „dies\" przez
    // zdarzenie object_moved (jak sacrifice). W engine bez regeneracji/
    // indestructible destroy i sacrifice różnią się wyłącznie eventem.
    const targetId = targets[0];
    if (targetId == null) return; // nielegalny/zniknięty cel — brak efektu (CR 608.2b)
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return;
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'graveyard', graveId);
    state.events.push(event('permanent_destroyed', {
      fromId: targetId, objectId: graveId, playerId: object.controllerId, cardId: moved.cardId,
    }));
    return;
  }
  if (effect.type === 'sacrifice_permanent') {
    // Poświęcenie permanentu: domyślnie samo źródło („sacrifice it"), z
    // możliwością wskazania celu przez targets[0]. Trafia do grobu (nie exile).
    const targetId = targets[0] ?? sourceObject.id;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel poświęcenia');
    const graveId = `grave-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, object.id, 'graveyard', graveId);
    state.events.push(event('permanent_sacrificed', { fromId: object.id, objectId: graveId, playerId: object.controllerId, cardId: moved.cardId }));
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
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard' || object.kind !== 'creature') throw new Error('Nieprawidłowy cel reanimacji');
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
    state.events.push(event('scry_started', { playerId: ownerId, amount: seen.length }));
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
    state.events.push(event('surveil_started', { playerId: ownerId, amount: seen.length }));
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
    turnFaceUp(state, sourceObject.id, effect.counters ?? {});
    return;
  }
  if (effect.type === 'return_creature_card_to_hand') {
    // Grave Exchange (pierwszy cel): „Return target creature card from your
    // graveyard to your hand." Nielegalny/zniknięty cel (null) = brak efektu.
    const targetId = targets[effect.targetIndex ?? 0];
    if (targetId == null) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard' || object.kind !== 'creature') {
      throw new Error('Nieprawidłowy cel powrotu z grobu do ręki');
    }
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
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'graveyard') throw new Error('Nieprawidłowy cel: karta z grobu');
    const libId = `library-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'library', libId);
    state.events.push(event('object_moved', { fromId: targetId, object: moved, fromZone: 'graveyard', toZone: 'library', toBottom: true }));
    return;
  }
  if (effect.type === 'buff_opponents_creatures') {
    // Hysterical Blindness: „Creatures your opponents control get -4/-0 until
    // end of turn." Globalny modyfikator do końca tury na stworach kontrolera
    // przeciwnego względem źródła (jak buff_creatures_you_control, ale obcy).
    for (const object of [...state.objects.values()]) {
      if (object.zone !== 'battlefield' || object.kind !== 'creature') continue;
      if (object.controllerId === sourceObject.controllerId) continue;
      modifyStats(state, object.id, { power: effect.power ?? 0, toughness: effect.toughness ?? 0 });
      if (effect.keywords?.length) grantKeywordsUntilEndOfTurn(state, object.id, effect.keywords);
    }
    return;
  }
  if (effect.type === 'damage_enchanted_player') {
    // Curse of the Pierced Heart: „this Aura deals 1 damage to that player
    // or a planeswalker that player controls." Engine nie ma planeswalkerów,
    // więc obrażenia zawsze trafiają zaczarowanego gracza.
    const playerId = sourceObject.enchantedPlayerId;
    if (!playerId) return;
    const amount = effect.amount ?? 0;
    const damage = event('damage_dealt', { source: sourceObject.id, target: playerId, amount, combat: false });
    state.events.push(damage);
    changeLife(state, playerId, -amount);
    return;
  }
  if (effect.type === 'cant_block') {
    // Panic Spellbomb: „Target creature can't block this turn.\" Tymczasowy
    // znacznik na obiekcie — zdejmowany w cleanup razem z innymi grantami.
    const targetId = targets[0];
    if (!targetId) return;
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error('Nieprawidłowy cel efektu cant_block');
    state.objects.set(targetId, Object.freeze({ ...object, cantBlock: true }));
    state.events.push(event('cant_block_granted', { objectId: targetId, cardId: object.cardId }));
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
    // „Return target permanent to its owner's hand\" (Jill, Shiva's Dominant).
    // Uproszczenie engine: nie rozróżniamy właściciela i kontrolera kart —
    // obiekt wraca na rękę jego DOTYCHCZASOWEGO kontrolera (uzupełnia
    // Puppeteer Clique: jedyny efekt zmiany kontroli „przestawia\" właściciela).
    const targetId = targets[0];
    if (targetId == null) return; // „up to one\" bez celu — brak efektu
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') return; // cel zniknął (CR 608.2b)
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, targetId, 'hand', handId);
    state.events.push(event('object_moved', {
      fromId: targetId, object: moved, fromZone: 'battlefield', toZone: 'hand', bounced: true,
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
    if (!target) throw new Error('Ta karta nie ma drugiej strony (transform)');
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
      const graveId = `grave-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, victimId, 'graveyard', graveId);
      state.events.push(event('permanent_sacrificed', {
        fromId: victimId, objectId: graveId, playerId: controllerId, cardId: moved.cardId,
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
  throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
