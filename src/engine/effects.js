import { event } from '../protocol/types.js';
import { effectivePower, grantAbilitiesUntilEndOfTurn, grantBasicLandTypeUntilEndOfTurn, markDamage, modifyStats, turnFaceUp } from './permanents.js';
import { addCounter, removeCounter } from './counters.js';
import { changeLife } from './players.js';
import { spendMana, addMana } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { createBattlefieldToken } from './tokens.js';
import { shuffle } from './shuffle.js';

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
    for (let i = 0; i < amount; i += 1) {
      createBattlefieldToken(state, sourceObject.controllerId, {
        cardId: effect.cardId,
        name: effect.name,
        kind: effect.kind ?? 'creature',
        power: effect.power ?? 1,
        toughness: effect.toughness ?? 1,
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
  if (effect.type === 'search_library_to_battlefield') {
    // Generyczne „may search for a card with qualifier, put it tapped on the
    // battlefield, then shuffle" (Kor Cartographer). Brak trafienia jest
    // legalnym fail-to-find; wybór pierwszej karty i tasowanie są deterministyczne.
    const ownerId = sourceObject.controllerId;
    const qualifier = effect.qualifier ?? {};
    const matches = (object) => {
      const typeMatch = (qualifier.types ?? []).some((type) => (object.types ?? []).includes(type));
      const subtypeMatch = (qualifier.subtypes ?? []).some((subtype) => (object.subtypes ?? []).includes(subtype));
      return (typeMatch || subtypeMatch) && object.controllerId === ownerId;
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
    // Utrata życia przez przeciwników kontrolera źródła (Delta Bloodflies:
    // „each opponent loses 1 life"). To NIE są obrażenia (nie odpalają
    // triggerów damage i nie da się ich zapobiec jak obrażeniom).
    if (!Number.isInteger(effect.amount) || effect.amount < 1) throw new RangeError('Utrata życia musi być dodatnia');
    const scope = effect.scope ?? 'each_opponent';
    for (const player of state.players) {
      const isOpponent = player.id !== sourceObject.controllerId;
      if (scope === 'each_opponent' && !isOpponent) continue;
      if (scope === 'controller' && isOpponent) continue;
      changeLife(state, player.id, -effect.amount);
    }
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
    addCounter(state, sourceObject.id, effect.counter, effect.amount ?? 1);
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
    return;
  }
  if (effect.type === 'turn_face_up') {
    turnFaceUp(state, sourceObject.id, effect.counters ?? {});
    return;
  }
  throw new Error(`Nieznany typ efektu: ${effect.type}`);
}
