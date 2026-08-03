import { event } from '../protocol/types.js';
import { applyEffect } from './effects.js';
import { hasCounter } from './counters.js';
import { effectiveAbilities } from './permanents.js';
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

function fireTrigger(state, ability, source, targets, events) {
  // Efekty triggera zapisują swoje zdarzenia (life_changed, counter_added,
  // object_moved…) do state.events — zbieramy cały przyrost, żeby trafił
  // też do strumienia wynikowego komendy i logu UI.
  const before = state.events.length;
  for (const effect of toEffectList(ability)) {
    applyEffect(state, effect, source, targets);
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
    fireTrigger(state, ability, source, [targetId], events);
    return true;
  }
  if (!canPayTrigger(state, source.controllerId, trigger)) return false;
  fireTrigger(state, ability, source, [], events);
  return true;
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
  for (const ev of recentEvents) {
    if (ev.type === 'creature_destroyed') {
      // Finality (exile) NIE uruchamia triggera „dies".
      if (ev.toZone === 'exile') continue;
      const died = state.objects.get(ev.toId);
      markDescended(died);
      if (!died) continue;
      for (const ability of abilitiesOnDeath(died)) {
        if (ability?.trigger?.event === 'dies') tryFire(state, ability, died, [], events);
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
      if (!died) continue;
      for (const ability of abilitiesOnDeath(died)) {
        if (ability?.trigger?.event === 'dies') tryFire(state, ability, died, [], events);
      }
    }
    // Descended: permanent card wpada do grobu z ręki (odrzucenie), milla
    // albo poświęcenia — liczymy po kontrolerze docelowego obiektu.
    if (ev.type === 'permanent_sacrificed') markDescended(state.objects.get(ev.objectId));
    if (ev.type === 'card_discarded' || ev.type === 'card_milled') markDescended(state.objects.get(ev.objectId));
    if (ev.type === 'object_moved' && ev.toZone === 'graveyard') markDescended(state.objects.get(ev.object?.id));
    if (ev.type === 'damage_dealt' && ev.combat !== false && isPlayerId(state, ev.target)) {
      const source = state.objects.get(ev.source);
      // Uproszczenie: źródło musi wciąż być na bitwisku (trigger „z grobu"
      // dla źródła, które zginęło w tej samej komendzie, nie jest obsługiwany).
      if (!source || source.zone !== 'battlefield') continue;
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
    }
    // Wejście na bitwisko (zagranie z ręki, powrót z grobu, land drop,
    // rozstrzygnięty czar aury bestow).
    if (ev.type === 'permanent_cast' || ev.type === 'land_played' || ev.type === 'permanent_entered_battlefield' || (ev.type === 'object_moved' && ev.toZone === 'battlefield')) {
      const entered = state.objects.get(ev.object?.id);
      if (!entered) continue;
      // stworem może być dowolny stwór (także samo źródło; wtedy bez grantu
      // zdolności). Cel wybiera kontroler realną, blokującą decyzją
      // resolve_backup (jak scry) — kolejkowane do state.pendingBackups.
      if (entered.backup && entered.kind === 'creature') {
        state.pendingBackups.push({
          playerId: entered.controllerId,
          sourceId: entered.id,
          cardId: entered.cardId,
          counters: entered.backup.counters,
          grantKeywords: [...(entered.backup.grantKeywords ?? [])],
        });
        const fired = event('ability_triggered', {
          objectId: entered.id, cardId: entered.cardId,
          trigger: 'enter_battlefield', backup: true,
        });
        state.events.push(fired); events.push(fired);
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
          } else if (triggerEvent === 'player_casts_spell') {
            if (!conditionHolds(ability.trigger, state, source, ev)) continue;
            fireTrigger(state, ability, source, [], events);
          }
        }
      }
    }
    // Deklaracja atakujących: triggery „attacks" (na atakującym) i tribał
    // „bat_attacks" (na kontrolowanych permanentach — np. Zoraline).
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
      }
    }
    // Początek upkeepu: triggery z warunkiem na liczbę czarów w poprzedniej
    // turze (transform wilkołaków) oraz zasada inicjatywy (CR 725): na
    // początku upkeepu posiadacza inicjatywy „venture into Undercity".
    if (ev.type === 'step_advanced' && ev.step === 'upkeep') {
      if (state.initiativePlayerId && state.turn.activePlayerId === state.initiativePlayerId) {
        applyEffect(state, { type: 'venture_into_undercity', playerId: state.initiativePlayerId }, {}, []);
      }
      for (const object of state.objects.values()) {
        if (object.zone !== 'battlefield') continue;
        for (const ability of effectiveAbilities(object)) {
          if (ability?.trigger?.event === 'upkeep') tryFire(state, ability, object, [], events);
        }
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
  }
  for (const controllerId of leftBattlefield) {
    for (const source of state.objects.values()) {
      if (source.zone !== 'battlefield' || source.controllerId !== controllerId) continue;
      for (const ability of effectiveAbilities(source)) {
        if (ability?.trigger?.event === 'permanents_you_control_leave_battlefield') {
          tryFire(state, ability, source, [], events);
        }
      }
    }
  }
  if (events.length > 0) state.events.push(...events);
  return events;
}
