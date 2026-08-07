import { event } from '../protocol/types.js';
import { applyEffect } from './effects.js';
import { addCounter, hasCounter } from './counters.js';
import { effectiveAbilities, effectivePower } from './permanents.js';
import { moveObjectDirectly } from './objects.js';
import { tapLandForMana } from './resources.js';

/**
 * Minimalny framework zdolności triggerowanych (CR 603).
 *
 * Uruchamiany po każdej zaakceptowanej komendzie (game-state.js `accepted`):
 * skanuje zdarzenia wygenerowane przez tę komendę (łącznie z centralnymi
 * state-based actions) i odpala triggery pasujących źródeł. Efekty triggerów
 * rozstrzygają się od razu — bez własnego okna priorytetu (uproszczenie:
 * obecne karty nie potrzebują interakcji na stosie w oknie triggera).
 *
 * Obsługiwane zdarzenia triggerów:
 * - `dies` — obiekt opuszcza battlefield do graveyard (np. Highland Game);
 * - `combat_damage_to_player` — stwór zadaje obrażenia combat graczowi
 *   (Kappa Tech-Wrecker); `requiresTarget` daje deterministyczną wersję
 *   opcjonalnego „you may" (gdy celu brak, opcja jest odrzucona);
 * - `enter_battlefield` — permanent wchodzi na bitwisko (Zoraline; także landy:
 *   Rupture Spire z obowiązkową płatnością „sacrifice it unless you pay {1}",
 *   deskryptor `payMana` + `sacrificeIfUnpaid` — patrz firePayOrSacrifice);
 * - `attacks` — stwór zostaje zadeklarowany jako atakujący (Zoraline);
 * - `bat_attacks` — „whenever a Bat you control attacks" (tribał Zoraline);
 * - `upkeep` — początek kroku upkeep z warunkiem na liczbę czarów
 *   w poprzedniej turze (transform wilkołaków).
 *
 * Opcjonalny koszt triggera: `payMana` / `payLife` w deskryptorze — trigger
 * odpala się tylko, gdy kontroler może zapłacić (deterministyczne „you may").
 */

/**
 * Typy KART (delirium, CR 702.34): liczba różnych typów kart wśród kart
 * w grobie gracza. Nadtypy (Basic, Legendary…) się nie liczą — filtrujemy
 * do zamkniętej listy typów kart. Tokeny w grobie nie są kartami (name
 * ustawione) i nie wnoszą typu.
 */
const DELIRIUM_CARD_TYPES = Object.freeze([
  'Artifact', 'Battle', 'Conspiracy', 'Creature', 'Dungeon', 'Enchantment',
  'Instant', 'Kindred', 'Land', 'Phenomenon', 'Plane', 'Planeswalker',
  'Scheme', 'Sorcery', 'Tribal', 'Vanguard',
]);

/**
 * Liczba różnych typów kart obecnych w grobie gracza (delirium: próg 4).
 */
export function graveyardCardTypeCount(state, playerId) {
  const present = new Set();
  for (const objectId of state.zones.graveyard) {
    const object = state.objects.get(objectId);
    if (!object || object.controllerId !== playerId || object.name != null) continue;
    for (const type of object.types ?? []) {
      if (DELIRIUM_CARD_TYPES.includes(type)) present.add(type);
    }
  }
  return present.size;
}

function toEffectList(ability) {
  return Array.isArray(ability?.effect) ? ability.effect : [ability?.effect].filter(Boolean);
}

function isPlayerId(state, id) {
  return state.players.some((p) => p.id === id);
}

/** Czy warunek triggera (np. „no spells were cast last turn") jest spełniony. */
function conditionHolds(trigger, state, sourceObject = null, eventData = {}) {
  const condition = trigger?.condition ?? {};
  if (condition.noSpellsLastTurn) return state.lastTurnSpellsCast === 0;
  if (condition.minSpellsLastTurn != null) return state.lastTurnSpellsCast >= condition.minSpellsLastTurn;
  // „Whenever a player casts a WHITE spell" (Angel's Feather): trigger
  // `player_casts_spell` z warunkiem na kolorze rzucanego czaru — kolory
  // niosie samo zdarzenie (publiczne dane karty, ADR 0002).
  if (Array.isArray(condition.spellColorsInclude)) {
    return (eventData.colors ?? []).some((color) => condition.spellColorsInclude.includes(color));
  }
  // „If you descended this turn" (Canonized in Blood, CR 603.4 — intervening
  // if): permanent card wpadł do grobu kontrolera w bieżącej turze.
  if (condition.descendedThisTurn) {
    return Boolean((state.descendedThisTurn ?? {})[sourceObject?.controllerId]);
  }
  // „if you control a creature with a counter on it" (CR 603.4 — intervening
  // if; Delta Bloodflies). Warunek sprawdzany jest przy odpaleniu triggera.
  if (condition.controlsCreatureWithCounter) {
    const controllerId = sourceObject?.controllerId;
    return [...state.objects.values()].some((object) => object.zone === 'battlefield'
      && object.controllerId === controllerId && object.kind === 'creature'
      && Object.values(object.counters ?? {}).some((count) => count > 0));
  }
  // Persist (CR 702.79): wraca tylko stwór, który NIE miał liczników -1/-1
  // w chwili śmierci — LKI z formerCounters (liczniki znikają przy zmianie
  // strefy, więc bieżący obiekt w grobie ich już nie ma).
  if (condition.noMinusCountersWhenDied) {
    return ((sourceObject?.formerCounters ?? {})['-1/-1'] ?? 0) === 0;
  }
  // „At the beginning of ENCHANTED player's upkeep" (Curse of the Pierced
  // Heart): trigger odpala się tylko w upkeep gracza zaczarowanego przez
  // źródło — nie kontrolera (karta „Enchant player").
  if (condition.enchantedPlayerUpkeep) {
    return Boolean(sourceObject && sourceObject.enchantedPlayerId === state.turn.activePlayerId);
  }
  // Delirium (CR 702.34, Fear of Burning Alive — intervening if):
  // warunek spełniony, gdy w grobie kontrolera źródła są co najmniej
  // cztery typy kart (licznik graveyardCardTypeCount).
  if (condition.delirium) {
    return graveyardCardTypeCount(state, sourceObject?.controllerId) >= 4;
  }
  // „If you cast it\" (Geological Appraiser): trigger ETB odpala się
  // tylko, gdy permanent został zagrany z ręki (wasCast), a nie wszedł
  // na bitwisko inną drogą (reanimacja, token, itp.).
  if (condition.ifCast) {
    return Boolean(sourceObject?.wasCast);
  }
  // „If it was kicked\" (Kor Sanctifiers, CR 702.33): trigger odpala się
  // tylko, gdy rzut opłacił dodatkowy koszt kickera (flaga na permanencie).
  if (condition.wasKicked) {
    return Boolean(sourceObject?.wasKicked);
  }
  return true;
}

/** Czy kontroler triggera może opłacić opcjonalny koszt (mana / życie). */
function canPayTrigger(state, controllerId, trigger) {
  const player = state.players.find((p) => p.id === controllerId);
  if (!player) return false;
  if ((trigger?.payMana ?? 0) > (player.mana ?? 0)) return false;
  // Płatność życia może zejść do 0, ale nie poniżej (CR 118.4).
  if ((trigger?.payLife ?? 0) > player.life) return false;
  return true;
}

/** Znajduje legalny cel triggera; null, gdy brak (trigger nie odpala). */
function findTriggerTarget(state, spec, sourceObject, damagedPlayerId) {
  if (!spec) return null;
  if (spec.type === 'any_target') {
    // „Any target" bez blokującej decyzji w tym minimalnym silniku wybiera
    // deterministycznie najpierw przeciwnika źródła (potem pierwszego stwora,
    // a na końcu kontrolera). Sam predykat pozostaje generyczny.
    if (spec.prefer === 'opponent') {
      const opponent = state.players.find((player) => player.id !== sourceObject.controllerId);
      if (opponent) return opponent.id;
    }
    const creature = state.zones.battlefield.find((objectId) => state.objects.get(objectId)?.kind === 'creature');
    if (creature) return creature;
    return state.players[0]?.id ?? null;
  }
  if (spec.type === 'artifact_or_enchantment' && spec.controlledBy === 'damaged_player') {
    // Predykat na linii typów (types), nie na samym kind: enchantment creature
    // (Leafcrown Dryad) też jest legalnym celem „artifact or enchantment".
    const matches = (object) => (object.types ?? []).includes('Artifact')
      || (object.types ?? []).includes('Enchantment')
      || object.kind === 'artifact'
      || object.kind === 'enchantment';
    const id = state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.controllerId === damagedPlayerId && matches(object);
    });
    return id ?? null;
  }
  if (spec.type === 'player') {
    if (spec.prefer === 'opponent') {
      const opponent = state.players.find((player) => player.id !== sourceObject.controllerId);
      if (opponent) return opponent.id;
    }
    return sourceObject.controllerId;
  }
  if (spec.type === 'opponent') {
    const opponent = state.players.find((player) => player.id !== sourceObject.controllerId);
    return opponent ? opponent.id : null;
  }
  if (spec.type === 'creature_card_in_opponent_graveyard') {
    // Puppeteer Clique: „target creature card from an opponent's graveyard".
    // Wybór deterministyczny (ADR 0005): najsilniejszy stwór, przy remisie
    // pierwszy w kolejności grobu — bez losowości i bez nazw kart.
    let best = null;
    for (const objectId of state.zones.graveyard) {
      const object = state.objects.get(objectId);
      if (!object || object.kind !== 'creature') continue;
      if (object.controllerId === sourceObject.controllerId) continue;
      const value = (object.power ?? 0) * 2 + (object.toughness ?? 0);
      if (!best || value > best.value) best = { id: objectId, value };
    }
    return best?.id ?? null;
  }
  if (spec.type === 'permanent_card_in_graveyard' && spec.controlledBy === 'controller') {
    const id = state.zones.graveyard.find((objectId) => {
      const object = state.objects.get(objectId);
      if (!object || object.controllerId !== sourceObject.controllerId) return false;
      if (object.kind === 'land' || object.kind === 'spell') return false;
      return (object.manaCost ?? 0) <= (spec.maxManaValue ?? Number.POSITIVE_INFINITY);
    });
    return id ?? null;
  }
  if (spec.type === 'creature_you_control') {
    // „Target creature you control" (Canonized in Blood — end-step trigger).
    // Wybór deterministyczny (ADR 0005): pierwszy własny stwór na bitwisku.
    return state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && object.controllerId === sourceObject.controllerId;
    }) ?? null;
  }
  if (spec.type === 'creature') {
    // ETB trigger targeting any creature (Cloudbound Moogle).
    // Deterministic: first creature on battlefield (not self).
    return state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield' && object.kind === 'creature'
        && object.id !== sourceObject.id;
    }) ?? null;
  }
  if (spec.type === 'artifact_or_enchantment' && !spec.controlledBy) {
    // „Destroy target artifact or enchantment" (Kor Sanctifiers — trigger
    // kickera): dowolny artefakt/enchantment na bitwisku (linia typów, nie
    // sam kind — enchantment creature też jest legalnym celem). Wybór
    // deterministyczny (ADR 0005): pierwszy w kolejności bitwiska, nie źródło.
    const matches = (object) => (object.types ?? []).includes('Artifact')
      || (object.types ?? []).includes('Enchantment')
      || object.kind === 'artifact'
      || object.kind === 'enchantment';
    return state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.id !== sourceObject.id && matches(object);
    }) ?? null;
  }
  if (spec.type === 'artifact_you_control') {
    // „Target artifact you control" (Skilled Animator — animacja 5/5):
    // pierwszy własny artefakt na bitwisku (deterministycznie, ADR 0005).
    return state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && object.controllerId === sourceObject.controllerId
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'))
        && object.id !== sourceObject.id;
    }) ?? null;
  }
  if (spec.type === 'artifact_or_creature') {
    // ETB trigger targeting any artifact or creature (Lodestone Needle).
    // Deterministic: first artifact/creature on battlefield (not self).
    return state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.zone === 'battlefield'
        && (object.kind === 'creature' || object.kind === 'artifact')
        && object.id !== sourceObject.id;
    }) ?? null;
  }
  if (spec.type === 'other_nonland_permanent') {
    // „Return up to one other target nonland permanent to its owner's hand\"
    // (Jill, Shiva's Dominant): cel musi być INNYM permanentem niż źródło i
    // NIE może być landem. Wybór deterministyczny (ADR 0005): NAJSILNIEJSZY
    // permanent PRZECIWNIKA (stwór: power*2+toughness, inny: manaCost; remis
    // → pierwszy w kolejności bitwiska). Brak permanentu przeciwnika =
    // deterministyczne odrzucenie „up to one\" (trigger nie odpala).
    let best = null;
    for (const objectId of state.zones.battlefield) {
      const object = state.objects.get(objectId);
      if (!object || object.id === sourceObject.id) continue;
      if (object.controllerId === sourceObject.controllerId) continue;
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      if (isLand) continue;
      const value = object.kind === 'creature'
        ? (object.power ?? 0) * 2 + (object.toughness ?? 0)
        : (object.manaCost ?? 0);
      if (!best || value > best.value) best = { id: objectId, value };
    }
    return best?.id ?? null;
  }
  return null;
}

/**
 * Zdolności działające przy śmierci: własne + nadane „do końca tury" przed
 * zmianą strefy (LKI, CR 603.10 — np. trigger z Fake Your Own Death).
 */
function abilitiesOnDeath(object) {
  return [...effectiveAbilities(object), ...(object.formerAbilityGrants ?? [])];
}

/** Czy któryś efekt wymaga zdjęcia licznika ze źródła (warunek odpalenia). */
function requiresCounter(ability, counterName) {
  return toEffectList(ability).some((effect) => effect.type === 'remove_counter' && effect.counter === counterName);
}

/**
 * Deterministyczny cel efektu rozdziału Sagi (bez blokującej decyzji,
 * ADR 0005). Efekty bezcelowe zwracają pustą listę; celowane bez legalnego
 * celu są pomijane (jak „up to one\" — brak celu nie blokuje rozdziału).
 */
function findSagaChapterTargets(state, effect, source) {
  // Mesmerize (Shiva, Warden of Ice — rozdziały I/II): „Target creature can't
  // be blocked this turn\" — własny najsilniejszy stwór (power*2+toughness).
  if (effect.type === 'cant_block') {
    let best = null;
    for (const objectId of state.zones.battlefield) {
      const object = state.objects.get(objectId);
      if (!object || object.kind !== 'creature' || object.controllerId !== source.controllerId) continue;
      const value = (object.power ?? 0) * 2 + (object.toughness ?? 0);
      if (!best || value > best.value) best = { id: objectId, value };
    }
    return best ? [best.id] : [];
  }
  return [];
}

/**
 * Odpala rozdział Sagi (CR 714): efekty rozdziału, zdarzenie saga_chapter_fired,
 * a po rozdziale OSTATNIM — poświęcenie Sagi (CR 714.4), o ile wciąż jest na
 * bitwisku jako Saga (Shiva sama się przemienia w rozdziale III, więc jej
 * poświęcenia nie ma). Rozdział zwracający permanenta na bitwisko (powrót
 * stroną przednią) uruchamia jego triggery wejścia — jeden ograniczony poziom
 * zagnieżdżenia, jak zdarzenia zdolności aktywowanej trafiające do
 * recentEvents komendy (głębsze zagnieżdżenie nie jest skanowane — spójne
 * z jednoprzebiegowym modelem triggerów engine).
 */
function fireSagaChapter(state, sagaObject, chapterNumber, events) {
  const chapters = sagaObject.saga?.chapters ?? [];
  const effects = chapters[chapterNumber - 1] ?? [];
  const before = state.events.length;
  for (const effect of effects) {
    applyEffect(state, effect, sagaObject, findSagaChapterTargets(state, effect, sagaObject));
  }
  state.events.push(event('saga_chapter_fired', {
    objectId: sagaObject.id, cardId: sagaObject.cardId,
    chapter: chapterNumber, totalChapters: chapters.length,
  }));
  events.push(...state.events.slice(before));
  // Ograniczony poziom zagnieżdżenia: triggery wejścia permanenta zwróconego
  // przez rozdział (Jill powracająca jako strona przednia po Cold Snap).
  for (const ev of state.events.slice(before)) {
    if (ev.type !== 'object_moved' || ev.toZone !== 'battlefield') continue;
    const entered = state.objects.get(ev.object?.id);
    if (!entered || entered.id === sagaObject.id) continue;
    for (const ability of effectiveAbilities(entered)) {
      if (ability?.trigger?.event === 'enter_battlefield') tryFire(state, ability, entered, [], events);
    }
  }
  if (chapterNumber >= chapters.length) {
    const current = state.objects.get(sagaObject.id);
    if (current && current.zone === 'battlefield' && current.saga) {
      const graveId = `grave-${state.objectSequence++}`;
      const moved = moveObjectDirectly(state, current.id, 'graveyard', graveId);
      const sacrificed = event('permanent_sacrificed', {
        fromId: current.id, objectId: graveId, playerId: current.controllerId,
        cardId: moved.cardId, saga: true,
      });
      state.events.push(sacrificed);
      events.push(sacrificed);
    }
  }
}

function fireTrigger(state, ability, source, targets, events, context = {}) {
  // Efekty triggera zapisują swoje zdarzenia (life_changed, counter_added,
  // object_moved…) do state.events — zbieramy cały przyrost, żeby trafił
  // też do strumienia wynikowego komendy i logu UI. `context` niesie dane
  // zdarzenia nadrzędnego (np. manaSpent rzutu — progi Tellah, Great Sage).
  const before = state.events.length;
  for (const effect of toEffectList(ability)) {
    applyEffect(state, effect, source, targets, context);
  }
  const e = event('ability_triggered', { objectId: source.id, cardId: source.cardId, trigger: ability.trigger?.event });
  state.events.push(e);
  events.push(...state.events.slice(before));
}

/**
 * Obowiązkowy trigger płatności w stylu „sacrifice it unless you pay {N}"
 * (Rupture Spire). Nie jest to opcjonalne „you may" — trigger odpala się
 * ZAWSZE, a kontroler musi zapłacić albo poświęcić permanent.
 *
 * Świadome uproszczenie (minimalny wymiar, udokumentowane w M10): płatność
 * jest automatyczna — najpierw z puli many, a gdy jej brak, engine tapuje
 * jednego nietapniętego landa kontrolera (pierwszego z listy bitwiska),
 * żeby opłacić koszt. Kontroler nie może dobrowolnie zrezygnować z płatności;
 * poświęcenie następuje wyłącznie, gdy zapłacić się nie da.
 */
function firePayOrSacrifice(state, ability, source, events) {
  const amount = ability.trigger?.payMana ?? 0;
  const player = state.players.find((p) => p.id === source.controllerId);
  let autoTappedId = null;
  if (player && (player.mana ?? 0) < amount) {
    const landId = state.zones.battlefield.find((objectId) => {
      const object = state.objects.get(objectId);
      return object && object.controllerId === source.controllerId
        && object.kind === 'land' && object.id !== source.id && !object.tapped;
    });
    if (landId) {
      const gain = state.events.length;
      tapLandForMana(state, source.controllerId, landId);
      autoTappedId = landId;
      // Zdarzenia produkcji many dołączamy do strumienia triggera.
      events.push(...state.events.slice(gain));
    }
  }
  const before = state.events.length;
  if (player && (player.mana ?? 0) >= amount) {
    applyEffect(state, { type: 'pay_mana', amount }, source, []);
    const e = event('ability_triggered', {
      objectId: source.id, cardId: source.cardId, trigger: ability.trigger?.event,
      paid: amount, autoTapped: autoTappedId,
    });
    state.events.push(e);
    events.push(...state.events.slice(before));
    return true;
  }
  applyEffect(state, { type: 'sacrifice_permanent' }, source, []);
  const e = event('ability_triggered', {
    objectId: source.id, cardId: source.cardId, trigger: ability.trigger?.event,
    sacrificed: true,
  });
  state.events.push(e);
  events.push(...state.events.slice(before));
  return true;
}

/** Odpala trigger z opcjonalnym kosztem; zwraca true, gdy się odpalił. */
function tryFire(state, ability, source, targets, events, extra = {}) {
  const trigger = ability?.trigger ?? {};
  if (ability?.type !== 'triggered') return false;
  if (!conditionHolds(trigger, state, source)) return false;
  if (trigger.requiresTarget) {
    const targetId = findTriggerTarget(state, trigger.requiresTarget, source, extra.damagedPlayerId);
    if (!targetId) return false;
    if (requiresCounter(ability, 'deathtouch') && !hasCounter(source, 'deathtouch')) return false;
    if (!canPayTrigger(state, source.controllerId, trigger)) return false;
    // Kontekst zdarzenia (extra) trafia do efektów triggera: manaSpent rzutu
    // (Tellah), enteredControllerId landa przeciwnika (Nightshade Harvester),
    // graveyardCardId karty do grobu (Disa) — fireTrigger przekazuje go do
    // applyEffect jako context. Bez tego triggery z danymi zdarzenia ginęły
    // cicho (root cause: tryFire upuszczał extra przy delegacji).
    fireTrigger(state, ability, source, [targetId], events, extra);
    return true;
  }
  if (!canPayTrigger(state, source.controllerId, trigger)) return false;
  fireTrigger(state, ability, source, [], events, extra);
  return true;
}

/**
 * „Whenever a [subtype] permanent card is put into your graveyard from
 * anywhere other than the battlefield, put it onto the battlefield" (Disa
 * the Restless — Lhurgoyf): trigger skanuje wejścia KART do grobu kontrolera
 * spoza bitwiska (odrzucenie, mill, wygnanie, czar skontrowany). Deskryptor
 * niesie filtr podtypu (trigger.subtypes), a zdarzenie przekazuje konkretną
 * kartę w kontekście (graveyardCardId — efekt czyta ją z context).
 */
function fireCardIntoGraveyardFromNonbattlefield(state, ev, entered, events) {
  if (!entered || entered.name != null) return; // tokeny nie są kartami
  if (entered.kind === 'spell' || entered.kind === 'land') return; // nie permanent card
  for (const source of state.objects.values()) {
    if (source.zone !== 'battlefield') continue;
    for (const ability of effectiveAbilities(source)) {
      if (ability?.trigger?.event !== 'card_put_into_graveyard_from_nonbattlefield') continue;
      // „Your graveyard" — karta musi wpadać do grobu kontrolera źródła.
      if (entered.controllerId !== source.controllerId) continue;
      // Filtr podtypu (np. Lhurgoyf) — bez niego trigger dotyczy każdej karty.
      const wanted = ability.trigger.subtypes ?? [];
      if (wanted.length > 0 && !(wanted.some((subtype) => (entered.subtypes ?? []).includes(subtype)))) continue;
      tryFire(state, ability, source, [], events, { graveyardCardId: entered.id });
    }
  }
}

/**
 * Przetwarza triggery dla zdarzeń bieżącej komendy; zwraca nowe zdarzenia
 * (i dopisuje je do state.events). Wywoływana PO state-based actions, żeby
 * śmierć w wyniku obrażeń zdążyła wygenerować creature_destroyed.
 */
export function processTriggers(state, recentEvents) {
  const events = [];
  // Kontrolerzy, których permanenty opuściły bitwisko w tej komendzie —
  // trigger „one or more permanents you control leave the battlefield"
  // odpala się RAZ na komendę, nie raz na permanent (CR 603.2).
  const leftBattlefield = new Set();
  // Kontrolerzy, których STWORY zadały w tej komendzie combat damage graczowi
  // (Disa the Restless — „one or more creatures you control").
  const anyCombatDamageControllers = new Set();
  /**
   * „You descended this turn" (CR 700.x, Canonized in Blood): gdy PERMANENT
   * CARD (nie token, nie czar) trafia do grobu gracza z dowolnej strefy.
   * Liczymy po kontrolerze obiektu (do czyjego grobu wpadł).
   */
  const markDescended = (object) => {
    if (!object) return;
    const isPermanentCard = object.name == null && object.kind !== 'spell';
    if (!isPermanentCard) return;
    if (!state.descendedThisTurn[object.controllerId]) {
      state.descendedThisTurn = { ...state.descendedThisTurn, [object.controllerId]: true };
    }
  };
  // Kolejka zdarzeń do skanu triggerów (CR 603.2): zdarzenia bieżącej
  // komendy ORAZ zdarzenia wytworzone przez ROZSTRZYGNĘTE triggery — trigger
  // rozstrzygnięty przed nadaniem priorytetu jest już faktem, więc triggery
  // od jego zdarzeń (np. delirium od obrażeń ETB Fear of Burning Alive,
  // odkręcenie Midnight Guard po tokenie z ETB Herdcallera) odpalają się w
  // TEJ SAMEJ komendzie. Każde zdarzenie skanowane dokładnie raz; CAP to
  // deterministyczny hamulec inżynierski przed nieograniczoną reakcją
  // łańcuchową (obecny katalog cykli nie produkuje — to granica stabilności
  // silnika, nie reguła MtG).
  const MAX_TRIGGER_EVENTS_SCANNED = 512;
  const queue = [...recentEvents];
  const aggregatedControllers = new Set();
  let scanned = 0;
  let idx = 0;
  const processEvent = (ev) => {
    if (ev.type === 'creature_destroyed') {
      // Finality (exile) NIE uruchamia triggera „dies".
      if (ev.toZone === 'exile') return;
      const died = state.objects.get(ev.toId);
      markDescended(died);
      if (!died) return;
      for (const ability of abilitiesOnDeath(died)) {
        if (ability?.trigger?.event === 'dies' || ability?.trigger?.event === 'any_creature_dies') tryFire(state, ability, died, [], events);
      }
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.id === died.id) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'any_creature_dies') tryFire(state, ability, source, [], events);
        }
      }
    }
    // „Whenever one or more permanents you control leave the battlefield"
    // (Nefarious Imp). Jedno zdarzenie = jedno odejście; CR 603.2 mówi
    // „one or more", ale w engine każde odejście generuje osobne zdarzenie,
    // więc grupujemy je po komendzie (patrz leftBattlefieldControllers niżej).
    if (ev.type === 'creature_destroyed' || ev.type === 'permanent_sacrificed'
      || (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone !== 'battlefield')
      || (ev.type === 'object_exiled' && ev.fromId)) {
      const gone = ev.type === 'permanent_sacrificed'
        ? state.objects.get(ev.objectId)
        : (state.objects.get(ev.toId) ?? state.objects.get(ev.object?.id) ?? state.objects.get(ev.objectId));
      if (gone?.controllerId) leftBattlefield.add(gone.controllerId);
    }
    if (ev.type === 'object_moved' && ev.fromZone === 'battlefield' && ev.toZone === 'graveyard') {
      const died = state.objects.get(ev.object?.id);
      markDescended(died);
      if (!died) return;
      for (const ability of abilitiesOnDeath(died)) {
        if (ability?.trigger?.event === 'dies' || ability?.trigger?.event === 'any_creature_dies') tryFire(state, ability, died, [], events);
      }
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.id === died.id) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'any_creature_dies') tryFire(state, ability, source, [], events);
        }
      }
    }
    // Descended: permanent card wpada do grobu z ręki (odrzucenie), milla
    // albo poświęcenia — liczymy po kontrolerze docelowego obiektu.
    if (ev.type === 'permanent_sacrificed') markDescended(state.objects.get(ev.objectId));
    if (ev.type === 'card_discarded' || ev.type === 'card_milled') {
      const enteredGrave = state.objects.get(ev.objectId);
      markDescended(enteredGrave);
      // Wejście karty do grobu z ręki/biblioteki (nie z bitwiska) — trigger
      // Disa the Restless („from anywhere other than the battlefield").
      fireCardIntoGraveyardFromNonbattlefield(state, ev, enteredGrave, events);
    }
    if (ev.type === 'object_moved' && ev.toZone === 'graveyard') {
      const enteredGrave = state.objects.get(ev.object?.id);
      markDescended(enteredGrave);
      if (ev.fromZone !== 'battlefield' && enteredGrave) {
        fireCardIntoGraveyardFromNonbattlefield(state, ev, enteredGrave, events);
      }
    }
    if (ev.type === 'damage_dealt' && ev.combat !== false && isPlayerId(state, ev.target)) {
      const source = state.objects.get(ev.source);
      // Uproszczenie: źródło musi wciąż być na bitwisku (trigger „z grobu"
      // dla źródła, które zginęło w tej samej komendzie, nie jest obsługiwany).
      if (!source || source.zone !== 'battlefield') return;
      // Inicjatywa (CR 725): stwory zadające combat damage posiadaczowi
      // inicjatywy przejmują ją (karta The Initiative; podstawa Underdark
      // Explorer). Pierwsze objęcie inicjatywy = venture do lochu.
      if (state.initiativePlayerId === ev.target && source.controllerId !== state.initiativePlayerId) {
        const before = state.events.length;
        applyEffect(state, { type: 'take_initiative' }, source, []);
        events.push(...state.events.slice(before));
      }
      for (const ability of effectiveAbilities(source)) {
        if (ability?.trigger?.event === 'combat_damage_to_player') {
          tryFire(state, ability, source, [], events, { damagedPlayerId: ev.target });
        }
      }
      // „Whenever one or more creatures you control deal combat damage to a
      // player" (Disa the Restless, CR 603.2): trigger odpala się RAZ na
      // komendę, gdy DOWOLNY stwór kontrolera źródła zadał obrażenia graczowi
      // (grupowanie jak leftBattlefield — zdarzenie per stwór, trigger per
      // kontroler). Źródło triggera samo może być stworem lub nie (Disa).
      if (!anyCombatDamageControllers.has(source.controllerId)) {
        anyCombatDamageControllers.add(source.controllerId);
        for (const candidate of state.objects.values()) {
          if (candidate.zone !== 'battlefield' || candidate.controllerId !== source.controllerId) continue;
          for (const ability of effectiveAbilities(candidate)) {
            if (ability?.trigger?.event === 'any_combat_damage_to_player') {
              tryFire(state, ability, candidate, [], events, { damagedPlayerId: ev.target });
            }
          }
        }
      }
    }
    // „Whenever a source you control deals noncombat damage to an opponent"
    // (Fear of Burning Alive — Delirium): zdarzenie damage_dealt z flagą
    // combat === false, którego CEL jest graczem (obrażenia w stwora nie
    // odpalają — „to an opponent\"). Źródłem obrażeń (ev.source) może być
    // czar już po rozstrzygnięciu — czytamy kontrolera z ostatniej znanej
    // informacji obiektu (spelle w grobie zachowują controllerId). Cel
    // (stwór poszkodowanego gracza) wybiera KONTROLER triggera blokującą
    // decyzją resolve_delirium_target — jak wybory pokoi lochu (M24).
    if (ev.type === 'damage_dealt' && ev.combat === false && isPlayerId(state, ev.target)) {
      const damageSource = state.objects.get(ev.source);
      const damageControllerId = damageSource?.controllerId ?? null;
      if (!damageControllerId || damageControllerId === ev.target) return;
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.controllerId !== damageControllerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event !== 'noncombat_damage_to_opponent') continue;
          // Warunek intervening-if (delirium) sprawdzany przy odpaleniu;
          // powtórzony przy rozstrzyganiu celu (stan grobu mógł się zmienić)
          // — reguła CR 702.34 wymaga weryfikacji w obu momentach.
          if (!conditionHolds(ability.trigger, state, source)) continue;
          const candidates = state.zones.battlefield.filter((objectId) => {
            const candidate = state.objects.get(objectId);
            return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
              && candidate.controllerId === ev.target;
          });
          // Trigger bez legalnego celu nie trafia na stos — nie kolejkujemy.
          if (candidates.length === 0) continue;
          state.pendingDeliriumTargets.push({
            playerId: source.controllerId,
            sourceId: source.id,
            amount: ev.amount,
            opponentId: ev.target,
            candidateIds: candidates,
            restorePriorityTo: state.turn.priorityPlayerId,
          });
          state.turn.priorityPlayerId = source.controllerId;
          const required = event('delirium_target_required', {
            playerId: source.controllerId, sourceId: source.id,
            cardId: source.cardId, amount: ev.amount, opponentId: ev.target,
          });
          state.events.push(required); events.push(required);
          const fired = event('ability_triggered', {
            objectId: source.id, cardId: source.cardId,
            trigger: 'noncombat_damage_to_opponent',
          });
          state.events.push(fired); events.push(fired);
        }
      }
    }
    // Wejście na bitwisko (zagranie z ręki, powrót z grobu, land drop,
    // rozstrzygnięty czar aury bestow).
    if (ev.type === 'permanent_cast' || ev.type === 'land_played' || ev.type === 'permanent_entered_battlefield' || (ev.type === 'object_moved' && ev.toZone === 'battlefield')) {
      const entered = state.objects.get(ev.object?.id);
      if (!entered) return;
      // stworem może być dowolny stwór (także samo źródło; wtedy bez grantu
      // zdolności). Cel wybiera kontroler realną, blokującą decyzją
      // resolve_backup (jak scry) — kolejkowane do state.pendingBackups.
      // Decydent przejmuje priorytet (jak pendingDevours) — ze skanem
      // wieloprzebiegowym stwór z backup może wejść ze zdarzenia TRIGGERA
      // także w komendzie przeciwnika; bez przejęcia priorytetu gra by
      // stanęła (posiadacz priorytetu nie miałby legalnej komendy).
      if (entered.backup && entered.kind === 'creature') {
        state.pendingBackups.push({
          playerId: entered.controllerId,
          sourceId: entered.id,
          cardId: entered.cardId,
          counters: entered.backup.counters,
          grantKeywords: [...(entered.backup.grantKeywords ?? [])],
          restorePriorityTo: state.turn.priorityPlayerId,
        });
        state.turn.priorityPlayerId = entered.controllerId;
        const fired = event('ability_triggered', {
          objectId: entered.id, cardId: entered.cardId,
          trigger: 'enter_battlefield', backup: true,
        });
        state.events.push(fired); events.push(fired);
      }
      // Devour (CR 702.82, Gorger Wurm): „As this creature enters, you may
      // sacrifice any number of creatures. It enters with that many +1/+1
      // counters on it." Sekwencyjna, blokująca decyzja kontrolera
      // (resolve_devour_choice — poświęcenie jednego stwora na krok albo
      // zakończenie). Bez innych stworów do poświęcenia decyzji nie kolejkujemy
      // — wyboru nie ma (jak „up to" bez celów). Poświęcić nie można samego
      // źródła (reguła devour: liczniki lądują NA źródle).
      if (entered.kind === 'creature' && entered.devour) {
        const devourCandidates = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate?.zone === 'battlefield' && candidate.kind === 'creature'
            && candidate.controllerId === entered.controllerId && candidate.id !== entered.id;
        });
        if (devourCandidates.length > 0) {
          state.pendingDevours.push({
            playerId: entered.controllerId,
            sourceId: entered.id,
            counters: entered.devour.counters ?? 1,
            candidateIds: devourCandidates,
            restorePriorityTo: state.turn.priorityPlayerId,
          });
          state.turn.priorityPlayerId = entered.controllerId;
          const required = event('devour_choice_required', {
            playerId: entered.controllerId, sourceId: entered.id,
            cardId: entered.cardId, counters: entered.devour.counters ?? 1,
            candidateIds: [...devourCandidates],
          });
          state.events.push(required); events.push(required);
        }
        const fired = event('ability_triggered', {
          objectId: entered.id, cardId: entered.cardId,
          trigger: 'enter_battlefield', devour: true,
        });
        state.events.push(fired); events.push(fired);
      }
      // Endure (TDM, Kin-Tree Nurturer): „When this creature enters, it
      // endures N" — wybór gracza: N liczników +1/+1 na źródle ALBO token
      // Spirit N/N biały (resolve_endure_choice). Decyzję kolejkujemy zawsze
      // (niezależnie od planszy — obie opcje działają na pustym stole).
      if (entered.kind === 'creature' && entered.endure != null) {
        state.pendingEndures.push({
          playerId: entered.controllerId,
          sourceId: entered.id,
          counters: entered.endure,
          restorePriorityTo: state.turn.priorityPlayerId,
        });
        state.turn.priorityPlayerId = entered.controllerId;
        const required = event('endure_choice_required', {
          playerId: entered.controllerId, sourceId: entered.id,
          cardId: entered.cardId, counters: entered.endure,
        });
        state.events.push(required); events.push(required);
        const fired = event('ability_triggered', {
          objectId: entered.id, cardId: entered.cardId,
          trigger: 'enter_battlefield', endure: true,
        });
        state.events.push(fired); events.push(fired);
      }
      // Saga (CR 714.3a/2a, Shiva Warden of Ice): „As this Saga enters\" —
      // kontroler kładzie licznik lore, co odpala rozdział I. Dotyczy każdej
      // drogi wejścia (rzut, powrót przemieniony, reanimacja).
      if (entered.saga) {
        addCounter(state, entered.id, 'lore', 1);
        fireSagaChapter(state, state.objects.get(entered.id) ?? entered, 1, events);
      }
      for (const ability of effectiveAbilities(entered)) {
        if (ability?.trigger?.event !== 'enter_battlefield') continue;
        // Obowiązkowa płatność typu „sacrifice unless you pay" to nie „you may"
        // — osobna, deterministyczna ścieżka (firePayOrSacrifice).
        if (ability.trigger?.sacrificeIfUnpaid) {
          firePayOrSacrifice(state, ability, entered, events);
          continue;
        }
        tryFire(state, ability, entered, [], events);
      }
      // Triggery innych permanentów na wejście obiektu:
      // - „another_creature_enters" (Midnight Guard): wejście INNEGO stwora
      //   odkręca źródło (CR 603.2d — źródło nie jest tym, które weszło);
      // - „land_entered_under_your_control" (landfall, np. Skyclave Geopede):
      //   wejście landa pod kontrolą źródła.
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(source)) {
          const triggerEvent = ability?.trigger?.event;
          if (triggerEvent === 'another_creature_enters') {
            if (entered.kind === 'creature' && source.id !== entered.id) {
              tryFire(state, ability, source, [], events);
            }
          } else if (triggerEvent === 'land_entered_under_your_control') {
            if (entered.kind === 'land' && entered.controllerId === source.controllerId) {
              tryFire(state, ability, source, [], events);
            }
          } else if (triggerEvent === 'land_entered_under_opponent_control') {
            // Nightshade Harvester: „Whenever a land an opponent controls
            // enters, that player loses 1 life" — kontroler wchodzącego landa
            // (nie kontroler źródła) trafia w kontekście zdarzenia.
            if (entered.kind === 'land' && entered.controllerId !== source.controllerId) {
              tryFire(state, ability, source, [], events, { enteredControllerId: entered.controllerId });
            }
          }
        }
      }
    }
    // Rzucenie czaru (spell_cast — instant/sorcery), zagranie permanentu
    // (permanent_cast — stwór/artefakt/enchantment) albo czar aury
    // (aura_spell_cast — bestow/czysta aura): triggery „when you cast a spell"
    // (np. Illusory Demon — poświęcenie źródła, tylko własne czary) oraz
    // „whenever a player casts a [kolor] spell" (Angel's Feather — dowolny
    // gracz, warunek na kolorze z deskryptora triggera). Źródło musi być na
    // bitwisku, więc casting samego źródła go nie poświęca (nie było na bitwisku).
    if (ev.type === 'spell_cast' || ev.type === 'permanent_cast' || ev.type === 'aura_spell_cast') {
      // Licznik rzutów PER GRACZ (Illvoi Operative: „your second spell each
      // turn" — transform używa globalnego spellsCastThisTurn). Każde
      // zdarzenie rzutu przechodzi skan dokładnie raz (kolejka FIFO z M37),
      // więc inkrement tutaj nie może się podwoić. Czar aury też jest
      // czarem i liczy się do „second spell" (inaczej niż licznik
      // transformu — jego semantyka zostaje bez zmian).
      state.spellsCastThisTurnByPlayer = {
        ...state.spellsCastThisTurnByPlayer,
        [ev.playerId]: (state.spellsCastThisTurnByPlayer?.[ev.playerId] ?? 0) + 1,
      };
      const castNumberThisTurn = state.spellsCastThisTurnByPlayer[ev.playerId];
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(source)) {
          const triggerEvent = ability?.trigger?.event;
          if (triggerEvent === 'when_you_cast_spell') {
            // Casting SAMEJ karty nie poświęca jej: w MtG źródło nie jest na
            // bitwisku w momencie rzucenia (jest na stosie). Ev permanent_cast
            // niesie obiekt już na bitwisku — pomijamy go.
            if (source.controllerId !== ev.playerId || ev.object?.id === source.id) continue;
            fireTrigger(state, ability, source, [], events);
          } else if (triggerEvent === 'you_cast_noncreature_spell') {
            // Prowess (CR 702.108, Jeskai Windscout): „whenever you cast a
            // noncreature spell". Noncreature = instant/sorcery (spell_cast),
            // czar aury (aura_spell_cast — także karta-stwór rzucona za bestow,
            // bo wtedy jest czarem AURY, nie stwora, CR 702.103a) albo
            // permanent nie-będący stworem (permanent_cast z kind innym niż
            // 'creature': artefakt, enchantment). Land drop nie jest rzutem
            // (osobne zdarzenie) i tu nie wchodzi.
            if (source.controllerId !== ev.playerId || ev.object?.id === source.id) continue;
            const isNoncreatureCast = ev.type !== 'permanent_cast'
              || ev.object?.kind !== 'creature';
            if (!isNoncreatureCast) continue;
            // Kontekst rzutu: manaSpent ze zdarzenia (progi efektów Tellah,
            // Great Sage — „if four/eight or more mana was spent").
            fireTrigger(state, ability, source, [], events, { manaSpent: ev.manaSpent ?? 0 });
          } else if (triggerEvent === 'you_cast_second_spell_each_turn') {
            // Illvoi Operative: „Whenever you cast your second spell each
            // turn". Odpala wyłącznie przy DRUGIM rzucie kontrolera źródła
            // w tej turze (licznik per gracz powyżej). Własny rzut źródła go
            // nie odpala — źródło nie jest jeszcze na bitwisku (jak prowess).
            if (source.controllerId !== ev.playerId || castNumberThisTurn !== 2) continue;
            fireTrigger(state, ability, source, [], events);
          } else if (triggerEvent === 'player_casts_spell') {
            if (!conditionHolds(ability.trigger, state, source, ev)) continue;
            fireTrigger(state, ability, source, [], events);
          }
        }
      }
      // Spectral Prison: „When enchanted creature becomes the target of a
      // spell, sacrifice this Aura.\" Aury załączone do stwora, na które celuje
      // czar, poświęcają się.
      const spellTargets = ev.targets ?? [];
      for (const auraSource of state.objects.values()) {
        if (auraSource.zone !== 'battlefield' || !auraSource.attachedTo) continue;
        if (!spellTargets.includes(auraSource.attachedTo)) continue;
        for (const ability of effectiveAbilities(auraSource)) {
          if (ability?.trigger?.event === 'aura_host_targeted_by_spell') {
            fireTrigger(state, ability, auraSource, [], events);
          }
        }
      }
    }
    // Deklaracja atakujących: triggery „attacks" (na atakującym), tribał
    // „bat_attacks" (na kontrolowanych permanentach — np. Zoraline) oraz
    // triggery załączników „whenever equipped creature attacks" (Greatsword
    // of Tyr — zdolność siedzi na EQUIPMENTU, nie na nosicielu).
    if (ev.type === 'attackers_declared') {
      for (const attackerId of ev.attackerIds ?? []) {
        const attacker = state.objects.get(attackerId);
        if (!attacker || attacker.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(attacker)) {
          if (ability?.trigger?.event === 'attacks') tryFire(state, ability, attacker, [], events);
        }
        if ((attacker.subtypes ?? []).includes('Bat')) {
          for (const object of state.objects.values()) {
            if (object.zone !== 'battlefield' || object.controllerId !== attacker.controllerId) continue;
            for (const ability of effectiveAbilities(object)) {
              if (ability?.trigger?.event === 'bat_attacks') tryFire(state, ability, object, [], events);
            }
          }
        }
        // Equipment noszony przez atakującego: „Whenever equipped creature
        // attacks, put a +1/+1 counter on it and tap up to one target creature
        // defending player controls.\" Cele przekazywane JAWNIE: [atakujący
        // (nosiciel), stwór obrońcy albo null]. Drugi cel „up to one" jest
        // deterministyczny: NAJSILNIEJSZY stwór gracza broniącego (power*2+
        // toughness); brak stwora obrońcy = deterministyczne odrzucenie (null)
        // — trigger i tak odpala (licznik na nosicielu zawsze ląduje).
        const defendingPlayerId = state.players.find((player) => player.id !== attacker.controllerId)?.id ?? null;
        const attachmentsWithAttackTrigger = [...state.objects.values()].filter((attachment) => attachment.zone === 'battlefield'
          && attachment.attachedTo === attackerId
          && effectiveAbilities(attachment).some((ability) => ability?.trigger?.event === 'equipped_creature_attacks'));
        if (attachmentsWithAttackTrigger.length > 0) {
          let defenderTarget = null;
          let best = null;
          for (const objectId of state.zones.battlefield) {
            const object = state.objects.get(objectId);
            if (!object || object.kind !== 'creature' || object.controllerId !== defendingPlayerId) continue;
            const value = (object.power ?? 0) * 2 + (object.toughness ?? 0);
            if (!best || value > best.value) best = { id: objectId, value };
          }
          defenderTarget = best?.id ?? null;
          for (const attachment of attachmentsWithAttackTrigger) {
            for (const ability of effectiveAbilities(attachment)) {
              if (ability?.trigger?.event === 'equipped_creature_attacks') {
                fireTrigger(state, ability, attachment, [attackerId, defenderTarget], events);
              }
            }
          }
        }
        // Mentor (CR 702.133, Boros Challenger): „Whenever this creature
        // attacks, put a +1/+1 counter on target attacking creature with
        // lesser power". Cel wybiera KONTROLER blokującą decyzją
        // resolve_mentor_target (jak cel delirium, M36). Kandydaci liczeni
        // w chwili odpalenia (siła żywa — effectivePower); brak kandydata =
        // zdolność nie trafia na stos (CR 603.3d) i nie blokuje gry.
        let hasMentor = false;
        for (const ability of effectiveAbilities(attacker)) {
          if (ability?.trigger?.event === 'mentor_attacks') hasMentor = true;
        }
        if (hasMentor) {
          const sourcePower = effectivePower(attacker, state) ?? 0;
          const candidates = (ev.attackerIds ?? []).filter((otherId) => {
            if (otherId === attackerId) return false;
            const other = state.objects.get(otherId);
            return other?.zone === 'battlefield' && other.kind === 'creature'
              && other.controllerId === attacker.controllerId
              && (effectivePower(other, state) ?? 0) < sourcePower;
          });
          if (candidates.length > 0) {
            state.pendingMentorTargets.push({
              playerId: attacker.controllerId,
              sourceId: attacker.id,
              sourcePower,
              candidateIds: candidates,
              restorePriorityTo: state.turn.priorityPlayerId,
            });
            state.turn.priorityPlayerId = attacker.controllerId;
            const required = event('mentor_target_required', {
              playerId: attacker.controllerId, sourceId: attacker.id,
              cardId: attacker.cardId, sourcePower,
            });
            state.events.push(required); events.push(required);
            const fired = event('ability_triggered', {
              objectId: attacker.id, cardId: attacker.cardId,
              trigger: 'mentor_attacks',
            });
            state.events.push(fired); events.push(fired);
          }
        }
      }
    }
    // Początek upkeepu: triggery z warunkiem na liczbę czarów w poprzedniej
    // turze (transform wilkołaków), zasada inicjatywy (CR 725) „venture into
    // Undercity" oraz opóźnione triggery „at the beginning of their next
    // upkeep" (Plague Reaver — powrót pod kontrolą gracza-celu).
    if (ev.type === 'step_advanced' && ev.step === 'upkeep') {
      if (state.initiativePlayerId && state.turn.activePlayerId === state.initiativePlayerId) {
        applyEffect(state, { type: 'venture_into_undercity', playerId: state.initiativePlayerId }, {}, []);
      }
      // Opóźniony powrót pod kontrolą celu (Plague Reaver): odpala się na
      // początku upkeepu gracza-celu. „NEXT upkeep\" — gdy zdolność aktywowała
      // się w turze samego celu, najbliższy (bieżący) upkeep się nie liczy
      // (wpis armedAt zachowuje turę i aktywnego gracza z chwili aktywacji).
      const remainingUpkeepDelayed = [];
      for (const pending of state.delayedTriggers) {
        if (pending.type !== 'reanimate_under_target_control' || pending.playerId !== state.turn.activePlayerId) {
          remainingUpkeepDelayed.push(pending);
          continue;
        }
        if (pending.armedAt && pending.armedAt.turn === state.turn.number && pending.armedAt.active === pending.playerId) {
          remainingUpkeepDelayed.push(pending);
          continue;
        }
        const object = state.objects.get(pending.objectId);
        // Obiekt zniknął z grobu (np. wygnany w międzyczasie) — trigger wygasa.
        if (!object || object.zone !== 'graveyard') continue;
        const newId = `permanent-${state.objectSequence++}`;
        const moved = moveObjectDirectly(state, pending.objectId, 'battlefield', newId);
        const permanent = Object.freeze({ ...moved, controllerId: pending.playerId, summoningSickness: true });
        state.objects.set(newId, permanent);
        const movedEvent = event('object_moved', {
          fromId: pending.objectId, object: permanent, fromZone: 'graveyard', toZone: 'battlefield', delayed: true,
        });
        state.events.push(movedEvent); events.push(movedEvent);
        const controlEvent = event('control_changed', {
          objectId: newId, cardId: permanent.cardId,
          controllerId: pending.playerId, fromControllerId: moved.controllerId,
        });
        state.events.push(controlEvent); events.push(controlEvent);
      }
      state.delayedTriggers = remainingUpkeepDelayed;
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event === 'upkeep') tryFire(state, ability, object, [], events);
        }
      }
    }
    // Po kroku dobierania (CR 714.3b: „after your draw step\") każda Saga
    // AKTYWNEGO gracza dostaje licznik lore i odpala kolejny rozdział.
    if (ev.type === 'step_advanced' && ev.step === 'main' && ev.phase === 'precombat_main') {
      for (const object of [...state.objects.values()]) {
        if (object.zone !== 'battlefield' || object.controllerId !== state.turn.activePlayerId || !object.saga) continue;
        addCounter(state, object.id, 'lore', 1);
        fireSagaChapter(state, state.objects.get(object.id) ?? object, state.objects.get(object.id)?.counters?.lore ?? 0, events);
      }
    }
    // Krok end: triggery „at the beginning of your end step" (Canonized in
    // Blood — „if you descended this turn, put a +1/+1 counter…") oraz
    // opóźnione triggery (CR 603.7) „at the beginning of your next end step,
    // exile it" (Puppeteer Clique).
    if (ev.type === 'step_advanced' && ev.step === 'end') {
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield' || object.controllerId !== state.turn.activePlayerId) continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event === 'end_step') tryFire(state, ability, object, [], events);
        }
      }
      const remaining = [];
      for (const pending of state.delayedTriggers) {
        if (pending.playerId !== state.turn.activePlayerId) { remaining.push(pending); continue; }
        // Inne typy opóźnionych triggerów (Plague Reaver — powrót w upkeep
        // celu) obsługuje wyłącznie blok upkeep; tu tylko je zachowujemy.
        if (pending.type !== 'exile_object') { remaining.push(pending); continue; }
        const object = state.objects.get(pending.objectId);
        if (!object || object.zone !== 'battlefield') continue; // obiekt zniknął — trigger wygasa
        if (pending.type === 'exile_object') {
          const exileId = `exile-${state.objectSequence++}`;
          moveObjectDirectly(state, pending.objectId, 'exile', exileId);
          const fired = event('object_exiled', { objectId: exileId, fromId: pending.objectId, cardId: object.cardId, playerId: pending.playerId, delayed: true });
          state.events.push(fired); events.push(fired);
        }
      }
      state.delayedTriggers = remaining;
    }
    // Początek walki: triggery „beginning_of_combat" (np. Jyoti — land
    // creatures dostają +X/+X do końca tury).
    if (ev.type === 'step_advanced' && ev.step === 'beginning_of_combat') {
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event === 'beginning_of_combat') tryFire(state, ability, object, [], events);
        }
      }
    }
  };
  for (;;) {
    for (; idx < queue.length && scanned < MAX_TRIGGER_EVENTS_SCANNED; idx += 1, scanned += 1) {
      const beforeEvent = events.length;
      processEvent(queue[idx]);
      // Zdarzenia wytworzone przez triggery wchodzą do kolejki skanu (CR 603.2).
      for (let j = beforeEvent; j < events.length; j += 1) queue.push(events[j]);
    }
    if (scanned >= MAX_TRIGGER_EVENTS_SCANNED) break;
    const freshControllers = [...leftBattlefield].filter((controllerId) => !aggregatedControllers.has(controllerId));
    if (freshControllers.length === 0 && idx >= queue.length) break;
    // „Whenever one or more permanents you control leave the battlefield"
    // (Nefarious Imp, CR 603.2): RAZ na kontrolera na komendę, także po
    // odejściach spowodowanych przez same triggery; zdarzenia agregatu
    // wracają do kolejki i też są skanowane.
    for (const controllerId of freshControllers) {
      aggregatedControllers.add(controllerId);
      const beforeAggregate = events.length;
      for (const source of state.objects.values()) {
        if (source.zone !== 'battlefield' || source.controllerId !== controllerId) continue;
        for (const ability of effectiveAbilities(source)) {
          if (ability?.trigger?.event === 'permanents_you_control_leave_battlefield') {
            tryFire(state, ability, source, [], events);
          }
        }
      }
      for (let j = beforeAggregate; j < events.length; j += 1) queue.push(events[j]);
    }
  }
  // Uwaga: zdarzenia triggerów są JUŻ w state.events — fireTrigger i bloki
  // kroków dopisują je przy tworzeniu, a lokalny `events` zbiera wyłącznie
  // wycinki state.events (slice(before)). Ponowny push duplikowałby każde
  // zdarzenie w logu (naprawione przy Plague Reaver / batch 16).
  return events;
}
