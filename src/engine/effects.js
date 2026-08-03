import { event } from '../protocol/types.js';
import { effectivePower, effectiveToughness, goadUntilEndOfTurn, grantAbilitiesUntilEndOfTurn, grantBasicLandTypeUntilEndOfTurn, grantKeywordsUntilEndOfTurn, markDamage, modifyStats, turnFaceUp } from './permanents.js';
import { addCounter, removeCounter } from './counters.js';
import { changeLife } from './players.js';
import { spendMana, addMana } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { createBattlefieldToken } from './tokens.js';
import { shuffle } from './shuffle.js';

/**
 * Loch „Undercity" (komponent inicjatywy, CR 725; karta „Undercity //
 * The Initiative" z CLB — w legacy aplikacji karta specjalna 990006).
 *
 * Venture wchodzi do pokoju i WYKONUJE jego efekt (M24 — pełna mechanika,
 * decyzja właściciela 2026-08-03). Cele „target creature"/„target player"
 * są deterministyczne (ADR 0005 — jak cel reanimacji Puppeteer Clique):
 * najsilniejszy stwór na bitwisku, przeciwnik gracza; scry z Lost Well to
 * realna, blokująca decyzja (komenda resolve_scry jak przy Prismari Campus).
 */
export const UNDERCITY_ROOMS = Object.freeze([
  // 1. Secret Entrance — szukaj Basic Land do ręki, tasuj.
  Object.freeze({ name: 'Secret Entrance', effects: Object.freeze([Object.freeze({ type: 'search_library_to_hand', qualifier: { types: ['Basic', 'Land'] } })]) }),
  // 2. Forge — dwa liczniki +1/+1 na docelowym stworze.
  Object.freeze({ name: 'Forge', effects: Object.freeze([Object.freeze({ type: 'add_counter', counter: '+1/+1', amount: 2, target: 'creature' })]) }),
  // 3. Lost Well — scry 2 (blokująca decyzja gracza).
  Object.freeze({ name: 'Lost Well', effects: Object.freeze([Object.freeze({ type: 'scry', amount: 2 })]) }),
  // 4. Trap! — docelowy gracz traci 5 życia.
  Object.freeze({ name: 'Trap!', effects: Object.freeze([Object.freeze({ type: 'lose_life', amount: 5, target: 'opponent' })]) }),
  // 5. Arena — goad docelowego stwora (musi atakować do końca tury).
  Object.freeze({ name: 'Arena', effects: Object.freeze([Object.freeze({ type: 'goad', target: 'creature' })]) }),
  // 6. Stash — token Treasure.
  Object.freeze({ name: 'Stash', effects: Object.freeze([Object.freeze({ type: 'create_token', cardId: 'token_treasure', name: 'Treasure', kind: 'artifact', colors: [], types: ['Artifact'], subtypes: ['Treasure'] })]) }),
  // 7. Archives — dobierz kartę.
  Object.freeze({ name: 'Archives', effects: Object.freeze([Object.freeze({ type: 'draw_cards', amount: 1 })]) }),
  // 8. Catacombs — 4/1 czarny Skeleton z menace.
  Object.freeze({ name: 'Catacombs', effects: Object.freeze([Object.freeze({ type: 'create_token', cardId: 'token_skeleton', name: 'Skeleton', kind: 'creature', power: 4, toughness: 1, colors: ['B'], types: ['Creature'], subtypes: ['Skeleton'], keywords: ['menace'] })]) }),
  // 9. Throne of the Dead Three — odsłoń 10 kart, połóż stwora z 3× +1/+1
  //    i hexproof do twojej następnej tury, tasuj.
  Object.freeze({ name: 'Throne of the Dead Three', effects: Object.freeze([Object.freeze({ type: 'reveal_top_put_creature', amount: 10, counters: '+1/+1', countersAmount: 3, hexproofUntilNextTurn: true })]) }),
]);

/** Najsilniejszy stwór na bitwisku (deterministyczny cel pokoi „target creature"). */
function strongestCreatureOnBattlefield(state) {
  let best = null;
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') continue;
    const value = (effectivePower(object, state) ?? 0) * 2 + (effectiveToughness(object, state) ?? 0);
    if (!best || value > best.value) best = { id, value };
  }
  return best ? state.objects.get(best.id) : null;
}

/** Wirtualne źródło efektów lochu (nie jest obiektem w strefie — jak emblem). */
function dungeonSource(playerId) {
  return { id: `dungeon-${playerId}`, controllerId: playerId, cardId: 'undercity', kind: 'card' };
}

/** Wykonuje efekt pokoju (deterministyczne cele, ADR 0005). */
function executeRoomEffect(state, roomIndex, playerId) {
  const room = UNDERCITY_ROOMS[roomIndex - 1];
  const source = dungeonSource(playerId);
  for (const effect of room.effects) {
    let targets = [];
    let resolved = effect;
    if (effect.target === 'creature') {
      const creature = strongestCreatureOnBattlefield(state);
      if (!creature) continue; // brak legalnego celu — efekt nie działa
      targets = [creature.id];
    } else if (effect.target === 'opponent') {
      const opponent = state.players.find((player) => player.id !== playerId);
      if (!opponent) continue;
      resolved = { ...effect, targetPlayerId: opponent.id };
    }
    applyEffect(state, resolved, source, targets);
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
    if (!Number.isInteger(effect.amount) || effect.amount < 0) throw new RangeError('Obrażenia muszą być nieujemne');
    const damage = event('damage_dealt', {
      source: sourceObject.id, target: targetId, amount: effect.amount, combat: false,
    });
    state.events.push(damage);
    if (state.players.some((player) => player.id === targetId)) {
      // Efekt „damage any target" nie jest combat damage i nie odpala triggera
      // combat_damage_to_player; SBA po komendzie rozstrzygnie ewentualne 0 życia.
      changeLife(state, targetId, -effect.amount);
    } else {
      markDamage(state, targetId, effect.amount);
    }
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
    // Mill N: karty z wierzchu własnej biblioteki przechodzą do grobu jako
    // nowe obiekty strefy; pusta biblioteka nie przegrywa poza draw stepem.
    const amount = effect.amount ?? 0;
    if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Mill wymaga nieujemnej liczby kart');
    const ownerId = sourceObject.controllerId;
    for (let i = 0; i < amount; i += 1) {
      const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === ownerId);
      if (!topId) break;
      const object = state.objects.get(topId);
      const graveId = `grave-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, topId, 'graveyard', graveId);
      state.events.push(event('card_milled', {
        playerId: ownerId, fromId: topId, objectId: graveId, cardId: object.cardId, object: moved,
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
  if (effect.type === 'reveal_top_put_creature') {
    // Throne of the Dead Three (loch Undercity): odsłoń N wierzchnich kart,
    // połóż stwora spośród nich na bitwisko z licznikami i hexproof do
    // twojej następnej tury, potem tasuj. Wybór stwora deterministyczny
    // (najsilniejszy wśród odsłoniętych — ADR 0005, jak cel reanimacji).
    const ownerId = sourceObject.controllerId;
    const amount = effect.amount ?? 10;
    const seen = state.zones.library
      .filter((id) => state.objects.get(id)?.controllerId === ownerId)
      .slice(0, amount);
    for (const id of seen) {
      state.events.push(event('card_revealed', {
        playerId: ownerId, objectId: id, cardId: state.objects.get(id).cardId, revealTop: true,
      }));
    }
    let best = null;
    for (const id of seen) {
      const object = state.objects.get(id);
      if (object?.kind !== 'creature') continue;
      const value = (object.power ?? 0) * 2 + (object.toughness ?? 0);
      if (!best || value > best.value) best = { id, value };
    }
    let foundCardId = null;
    if (best) {
      const object = state.objects.get(best.id);
      foundCardId = object.cardId;
      const newId = `permanent-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, best.id, 'battlefield', newId);
      const permanent = Object.freeze({
        ...moved,
        summoningSickness: true,
        // „It gains hexproof until your next turn" — trwa do początku
        // NASTĘPNEJ tury kontrolera (turę przeciwnika + swoją do początku).
        hexproofUntilTurn: effect.hexproofUntilNextTurn ? state.turn.number + 2 : null,
      });
      state.objects.set(newId, permanent);
      state.events.push(event('object_moved', { fromId: best.id, object: permanent, fromZone: 'library', toZone: 'battlefield' }));
      state.events.push(event('permanent_entered_battlefield', {
        fromId: best.id, objectId: newId, object: permanent, cardId: permanent.cardId,
        controllerId: ownerId, revealedTop: true,
      }));
      if (effect.counters) addCounter(state, newId, effect.counters, effect.countersAmount ?? 1);
      if (effect.hexproofUntilNextTurn) {
        state.events.push(event('hexproof_granted', {
          objectId: newId, cardId: permanent.cardId, untilTurn: state.turn.number + 2,
        }));
      }
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
      playerId: ownerId, foundCardId, destination: 'battlefield', shuffled: true, revealTop: amount,
    }));
    return;
  }
  if (effect.type === 'draw_cards') {
    // Dobranie N kart przez kontrolera źródła (Phyrexian Rager, Evangel of
    // Synthesis). Pusta biblioteka NIE kończy tu gry — przegraną z powodu
    // pustej biblioteki rozstrzyga próba dobrania w kroku draw (jak dotąd);
    // efekt karty po prostu nie dobiera niczego więcej.
    const amount = effect.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('Dobranie wymaga dodatniej liczby kart');
    const playerId = sourceObject.controllerId;
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
    // „put a +1/+1 counter on target creature you control".
    const targetId = targets[0] ?? sourceObject.id;
    addCounter(state, targetId, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'remove_counter') {
    removeCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
    return;
  }
  if (effect.type === 'tap_permanent') {
    const targetId = targets[0];
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel tapa');
    if (!object.tapped) {
      const updated = Object.freeze({ ...object, tapped: true });
      state.objects.set(targetId, updated);
      state.events.push(event('object_tapped', { objectId: targetId, playerId: sourceObject.controllerId }));
    }
    return;
  }
  if (effect.type === 'lock_untap') {
    // Stwór nie odkręca się, dopóki źródło (np. zatapnięta Lira) jest na
    // bitwisku i zatapnięte; blokada wygasa, gdy źródło opuści bitwisko.
    const targetId = targets[0];
    const object = state.objects.get(targetId);
    if (!object || object.zone !== 'battlefield') throw new Error('Nieprawidłowy cel blokady');
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
    addMana(state, sourceObject.controllerId, effect.amount ?? 1);
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
  throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
