import { event } from '../protocol/types.js';
import { moveObjectDirectly, removeFromCombat } from './objects.js';
import { deathZoneFor, effectiveKeywords, effectiveToughness } from './permanents.js';
import { removeIllegalAttachments, detachAttachmentsFromHost } from './attachments.js';
import { removeCounter } from './counters.js';
import { effectiveAbilities } from './permanents.js';
import { startEnginesFor } from './players.js';

/**
 * Regeneracja (CR 701.12): tarcza z efektu „regenerate" zastępuje następne
 * ZNISZCZENIE permanentu w tej turze — zamiast śmierci: odtappowanie,
 * zdjęcie wszystkich obrażeń, usunięcie z walki i zużycie tarczy. Chroni
 * przed śmiertelnymi obrażeniami i efektami destroy; NIE chroni przed
 * poświęceniem, prawem legend ani wytrzymałością <= 0 (to nie jest
 * zniszczenie — CR 704.5f).
 */
export function tryRegenerate(state, object, collected = null) {
  if (!object || object.zone !== 'battlefield') return false;
  if (!(state.regenerationShields ?? []).includes(object.id)) return false;
  // CR 701.12b (minimalny wymiar): „It can't be regenerated this turn" (Rage
  // of Purphoros) — flaga trwała do końca tury ustawiana na obiekcie
  // efektem cant_be_regenerated_this_turn. Blokuje regenerację TEGO
  // obiektu niezależnie od źródła tarczy (regenerate / destroy z efektem
  // regeneracji / planeswalker itd.).
  if ((state.cantBeRegeneratedThisTurn ?? []).includes(object.id)) return false;
  state.regenerationShields = (state.regenerationShields ?? []).filter((id) => id !== object.id);
  // Odcięcie od walki (CR 701.12a: „removed from combat").
  if (state.combat) {
    state.combat.attackers = (state.combat.attackers ?? []).filter((id) => id !== object.id);
    for (const [attackerId, blockerIds] of state.combat.blockers) {
      state.combat.blockers.set(attackerId, blockerIds.filter((id) => id !== object.id));
    }
    state.combat.blockedAttackers?.delete(object.id);
  }
  const wasTapped = Boolean(object.tapped);
  const regenerated = Object.freeze({
    ...object, tapped: true, damage: 0, damagedByDeathtouch: false,
  });
  state.objects.set(object.id, regenerated);
  const regenerationEvent = event('permanent_regenerated', {
    objectId: object.id, cardId: object.cardId, playerId: object.controllerId,
  });
  state.events.push(regenerationEvent);
  collected?.push(regenerationEvent);
  // M117 (lekcja L24, ta sama klasa co tapnięcie landa za manę z M114):
  // regeneracja TAPUJE permanent (CR 701.15a), a tapnięcie jest zdarzeniem
  // widocznym dla reguł — bez `object_tapped` żaden trigger „becomes tapped”
  // (Chronic Flooding) by go nie zobaczył, a gracz nie przeczytałby w logu,
  // dlaczego jego stwór stoi zatapniętny. Zdarzenie tylko przy REALNEJ zmianie:
  // permanent już zatapniętny nie „staje się” zatapniętny drugi raz.
  if (!wasTapped) {
    const tappedEvent = event('object_tapped', {
      objectId: object.id, playerId: object.controllerId, viaRegeneration: true,
    });
    state.events.push(tappedEvent);
    // Zdarzenie musi trafić także do listy ZWRACANEJ przez SBA — `accepted()`
    // karmi `processTriggers` tą listą, a nie całym `state.events`. Bez tego
    // trigger „becomes tapped” nie zobaczyłby tapnięcia z regeneracji.
    collected?.push(tappedEvent);
  }
  return true;
}

/** Dodaje tarczę regeneracji (koszt zdolności „regenerate" — CR 701.12). */
export function addRegenerationShield(state, objectId) {
  state.regenerationShields = [...(state.regenerationShields ?? []), objectId];
  const object = state.objects.get(objectId);
  state.events.push(event('regeneration_shield_added', {
    objectId, cardId: object?.cardId ?? null, playerId: object?.controllerId ?? null,
  }));
  return object;
}

/**
 * Centralne state-based actions — jedyne miejsce, które rozstrzyga przegraną
 * z powodu życia <= 0 oraz niszczenie stworów ze śmiertelnymi obrażeniami.
 * Wywoływane po każdej zaakceptowanej komendzie (game-state.js `accepted`)
 * oraz przez API obrażeń; funkcja jest idempotentna i może wykonać więcej
 * niż jedną akcję naraz.
 *
 * Kolejność w jednym przebiegu odzwierciedla zależności (CR 704.3): najpierw
 * śmierći stworów (gospodarz może odejść z pola bitwy), potem rozłączenie
 * załączników, które straciły legalnego gospodarza — bestow znów jest stworem
 * i zostaje (CR 702.103b), equipment zostaje odłączony (CR 704.5n), a czysta
 * aura trafia do grobu (CR 704.5m).
 */
export function runStateBasedActions(state) {
  const events = [];
  // M202/odznaka #3 (CR 616.1): dopóki gracz nie rozstrzygnie wyboru efektu
  // zastępczego (tarcza albo regeneracja), nie przetwarzamy kolejnych akcji
  // stanowych — inaczej drugi przebieg rozstrzygnąłby za gracza.
  if (state.pendingReplacementChoice) return events;
  // CR 506.4c (M201, znalezisko #1): „A permanent that's no longer a creature
  // is removed from combat.” Przyczyna bywa dowolna — koniec animacji
  // (Skilled Animator), utrata typu, zmiana charakterystyk — więc reguła
  // musi żyć w SBA, nie w gałęzi jednej mechaniki. Bez niej `state.combat`
  // wskazuje nie-stwora i inwariant stanu wywraca komendę wyjątkiem.
  if (state.combat) {
    const inCombat = new Set([
      ...state.combat.attackers,
      ...[...state.combat.blockers.values()].flat(),
    ]);
    const attackingPlayerId = state.combat.attackingPlayerId ?? null;
    const attackers = new Set(state.combat.attackers);
    for (const id of inCombat) {
      const object = state.objects.get(id);
      const gone = !object || object.zone !== 'battlefield' || object.kind !== 'creature';
      // M201 (znalezisko #5, CR 506.4): „A permanent is removed from combat …
      // IF ITS CONTROLLER CHANGES”. Atakujący jest z definicji kontrolowany
      // przez gracza atakującego, bloker — przez broniącego; każde odejście
      // od tego znaczy, że kontrola się zmieniła (Awaken the Sleeper rzucone
      // w oknie walki). Reguła obok utraty typu, bo obie mają jedno źródło
      // (CR 506.4) i jeden skutek.
      const controllerChanged = !gone && attackingPlayerId != null
        && (attackers.has(id)
          ? object.controllerId !== attackingPlayerId
          : object.controllerId === attackingPlayerId);
      if (!gone && !controllerChanged) continue;
      if (removeFromCombat(state, id) && object) {
        events.push(event('permanent_removed_from_combat', {
          objectId: id, cardId: object.cardId ?? null,
          reason: gone ? 'not_a_creature' : 'controller_changed',
        }));
      }
    }
  }
  // CR 704.5a/704.5c: przegrana z życia <= 0 i z 10+ znaczników trucizny jest
  // sprawdzana dla WSZYSTKICH graczy w tym samym przebiegu SBA — dopiero
  // komplet przegranych rozstrzyga wynik partii.
  if (state.status === 'active') {
    const losers = [];
    for (const player of state.players) {
      const isZeroLife = player.life <= 0;
      const isPoisoned = (player.poison ?? 0) >= 10;
      // M202 (CR 704.5m): gracz, który od ostatniego przebiegu akcji stanowych
      // próbował dobrać kartę z pustej biblioteki, przegrywa. Rozstrzygamy to
      // TUTAJ, razem z życiem i trucizną, bo dopiero wtedy wiadomo, czy
      // przegranych jest więcej niż jeden — a wtedy CR 104.4b daje REMIS.
      // Wcześniej ścieżki dobrania kończyły grę natychmiast, więc przy
      // jednoczesnym deck-oucie („You and target opponent each draw two
      // cards”) zwycięzcę wyznaczała kolejność przetwarzania.
      const drewFromEmpty = Boolean(state.emptyLibraryDraw?.[player.id]);
      if (!isZeroLife && !isPoisoned && !drewFromEmpty) continue;
      losers.push({
        playerId: player.id,
        reason: drewFromEmpty ? 'empty_library' : (isPoisoned ? 'poison_ten' : 'life_zero'),
      });
    }
    // Znacznik dotyczy wyłącznie tego przebiegu akcji stanowych.
    if (state.emptyLibraryDraw) state.emptyLibraryDraw = {};
    if (losers.length > 0) {
      // CR 104.4b: „If the game somehow enters a state in which all remaining
      // players lose simultaneously, the game is a draw." Wcześniej pętla
      // kończyła grę na PIERWSZYM przegranym i ogłaszała drugiego zwycięzcą —
      // o wyniku partii decydowała kolejność w state.players.
      const isDraw = losers.length >= state.players.length;
      const winner = isDraw
        ? null
        : state.players.find((entry) => !losers.some((loser) => loser.playerId === entry.id));
      state.status = 'finished';
      state.winnerId = winner?.id ?? null;
      if (isDraw) state.isDraw = true;
      for (const loser of losers) {
        const lost = event('player_lost', {
          playerId: loser.playerId, reason: loser.reason,
          winnerId: winner?.id ?? null, draw: isDraw,
        });
        state.events.push(lost); events.push(lost);
      }
    }
  }
  // CR 704.3: akcje state-based wykonują się JEDNOCZEŚNIE — najpierw
  // zbieramy wszystkie ofiary tego przebiegu (decyzje na stanie sprzed
  // ruchów), potem przenosimy. Każde zdarzenie śmierci niesie
  // `simultaneousIds` (id wszystkich stworów umierających DO GROBU w tym
  // przebiegu) — triggery any_creature_dies stworów, które zginęły razem,
  // patrzą wstecz (CR 603.10a) i muszą zobaczyć współzgony (M160/A:
  // Selhoff Occultist mielił 1× zamiast 3× przy trzech zgonach w walce).
  const dying = [];
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield' || object.kind !== 'creature' || object.toughness === null) continue;
    // Jwari: „enter as a copy” — SBA nie zabija 0/0, dopoki gracz nie wybierze celu.
    if (object.enteringAsCopy) continue;
    const toughness = effectiveToughness(object, state);
    // CR 704.5f: stwór o wytrzymałości <= 0 idzie do grobu (indestructible nie chroni).
    const killedByZeroToughness = toughness <= 0;
    const isIndestructible = effectiveKeywords(object, state).includes('indestructible');
    // Deathtouch (CR 702.4): obrażenia od stwora z deathtouch niszczą
    // cel niezależnie od wytrzymałości (wystarczy 1 obrażenie).
    const killedByDamage = !isIndestructible && object.damage >= toughness;
    const killedByDeathtouch = !isIndestructible && object.damagedByDeathtouch && object.damage > 0;
    if (!killedByZeroToughness && !killedByDamage && !killedByDeathtouch) continue;
    // M202/odznaka #3 (CR 616.1): gdy zniszczenie można zastąpić na DWA
    // sposoby — licznikiem tarczy (CR 122.1b) albo tarczą regeneracji
    // (CR 701.12) — wybiera KONTROLER permanenta, nie silnik. Dotąd tarcza
    // była konsumowana zawsze, czyli gracz tracił licznik nawet wtedy, gdy
    // wolał regenerację (która dodatkowo zdejmuje obrażenia i odpina od walki).
    // Wytrzymałość <= 0 nie jest zniszczeniem, więc wybór tam nie istnieje.
    const hasShieldCounter = (object.counters?.shield ?? 0) > 0;
    const hasRegenerationShield = (state.regenerationShields ?? []).includes(object.id)
      && !(state.cantBeRegeneratedThisTurn ?? []).includes(object.id);
    if (!killedByZeroToughness && hasShieldCounter && hasRegenerationShield) {
      state.pendingReplacementChoice = {
        playerId: object.controllerId,
        objectId: object.id,
        cardId: object.cardId ?? null,
      };
      state.turn.priorityPlayerId = object.controllerId;
      const required = event('replacement_choice_required', {
        playerId: object.controllerId, objectId: object.id, cardId: object.cardId ?? null,
      });
      state.events.push(required); events.push(required);
      return events;
    }
    // Shield: zniszczenie z obrażeń zastąp zdjęciem tarczy (CR 122.1b).
    if (!killedByZeroToughness && (object.counters?.shield ?? 0) > 0) {
      // M270 (błąd #10): TRZECIA kopia zdejmowania licznika shield — i zarazem
      // najczęstsza ścieżka w grze (śmierć z obrażeń). Idzie przez WSPÓLNY
      // helper `removeCounter`, jak dwie pozostałe (markDamage,
      // resolve_replacement_choice): helper emituje `counter_removed`, którego
      // ręczna wersja nie dawała, więc log stołu pokazywał zdjęcie tarczy
      // tylko w części przypadków, a `syncStationKind` (CR 205.1) był
      // pomijany. Obrażenia zdejmujemy PO zdjęciu licznika (CR 122.1b:
      // zniszczenie zostaje zastąpione, więc stwór zostaje bez obrażeń).
      const przed = state.events.length;
      removeCounter(state, object.id, 'shield', 1);
      events.push(...state.events.slice(przed));
      const poZdjeciu = state.objects.get(object.id);
      state.objects.set(object.id, Object.freeze({
        ...poZdjeciu, damage: 0, damagedByDeathtouch: false,
      }));
      const consumed = event('shield_consumed', { objectId: object.id, cardId: object.cardId, reason: 'destroy' });
      state.events.push(consumed); events.push(consumed);
      continue;
    }
    // Regeneracja (CR 701.12): zniszczenie z obrażeń zastępujemy odtapowaniem,
    // zdjęciem obrażeń i usunięciem z walki — stwór NIE umiera (brak dies).
    // Wytrzymałość <= 0 NIE jest zniszczeniem — regeneracja nie chroni.
    if (!killedByZeroToughness && tryRegenerate(state, object, events)) continue;
    // Finality counter: zamiast do grobu, stwór idzie do exile (CR 122.1b
    // w minimalnym wymiarze — dotyczy śmierci z obrażeń). Wygnanie NIE jest
    // śmiercią — nie wchodzi do simultaneousIds.
    // M177/A: finality LUB znacznik Agate Assault (deathZoneFor — jedno źródło).
    const hasFinality = deathZoneFor(state, object) === 'exile';
    dying.push({ object, hasFinality });
  }
  const simultaneousIds = dying.filter((d) => !d.hasFinality).map((d) => d.object.id);
  for (const { object, hasFinality } of dying) {
    const toZone = hasFinality ? 'exile' : 'graveyard';
    const toId = hasFinality ? `exile-${state.objectSequence++}` : `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, object.id, toZone, toId);
    // `object` to LKI zniszczonego permanentu (CR 603.10) — triggery
    // „leaves the battlefield" muszą je odczytać także wtedy, gdy obiekt już
    // nie istnieje w stanie (token usunięty przez SBA CR 704.5e).
    const destroyed = event('creature_destroyed', {
      fromId: object.id, toId, toZone, cardId: object.cardId, object,
      ...(simultaneousIds.length > 1 ? { simultaneousIds: [...simultaneousIds] } : {}),
    });
    state.events.push(destroyed); events.push(destroyed);
  }
  // CR 122.3 (anihilacja liczników): jeśli permanent ma jednocześnie liczniki
  // +1/+1 i -1/-1, N par znika, gdzie N = mniejsza z liczb. Liczona przy
  // każdym przebiegu SBA (jak w MtG — state-based action).
  for (const object of [...state.objects.values()]) {
    if (object.zone !== 'battlefield') continue;
    const counters = object.counters ?? {};
    const plus = counters['+1/+1'] ?? 0;
    const minus = counters['-1/-1'] ?? 0;
    if (plus > 0 && minus > 0) {
      const removed = Math.min(plus, minus);
      const next = { ...counters };
      next['+1/+1'] = plus - removed;
      next['-1/-1'] = minus - removed;
      if (next['+1/+1'] === 0) delete next['+1/+1'];
      if (next['-1/-1'] === 0) delete next['-1/-1'];
      state.objects.set(object.id, Object.freeze({ ...object, counters: Object.freeze(next) }));
      state.events.push(event('counter_removed', {
        objectId: object.id, cardId: object.cardId,
        counter: 'mixed', amount: removed, annihilated: true, total: 0,
      }));
      events.push(event('counter_removed', {
        objectId: object.id, cardId: object.cardId,
        counter: 'mixed', amount: removed, annihilated: true, total: 0,
      }));
    }
  }
  // Załączniki bez legalnego gospodarza rozłączają się zgodnie z polityką
  // rodziny (bestow→stwór na polu bitwy, equipment→odłączony artefakt,
  // czysta aura→grób — CR 704.5m/n).
  events.push(...removeIllegalAttachments(state));
  // CR 704.5e / CR 111.7: token, który znalazł się w strefie innej niż
  // pole bitwy, PRZESTAJE ISTNIEĆ. Bez tej reguły duch tokena zostawał w grobie
  // lub wygnaniu jako pełnoprawny obiekt i dawał się wskazać jako cel
  // („target card in your graveyard” — Barkform Harvester) albo wskrzesić
  // efektem reanimacji; token-kopia wygnana przez craft zostawała w exile.
  // Deskryptor tokenu jest generyczny (ADR 0002): jawna flaga `isToken`
  // ustawiana wyłącznie w createBattlefieldToken. Rozpoznawanie po
  // `name != null` (tak robią delirium/wybór karty z grobu) to heurystyka —
  // kartom również wolno nieść `name`, więc do KASOWANIA obiektu jest za słaba.
  // Token NA STOSIE to token-kopia czaru (CR 707.10) — istnieje legalnie.
  for (const object of [...state.objects.values()]) {
    if (!object.isToken) continue;
    if (object.zone === 'battlefield' || object.zone === 'stack') continue;
    // M191 (ujawnione benchmarkiem po dodaniu Guildscorn Ward): token znika
    // z gry (CR 111.7), ale przypięte do niego aury/equipmenty zostawały ze
    // wskaźnikiem na NIEISTNIEJĄCY obiekt — inwariant „załącznik wskazuje
    // nieistniejącego gospodarza" wywracał partię. Kasowanie obiektu musi
    // przejść przez tę samą listę „kto o nim jeszcze pyta", co przy zwykłym
    // ruchu obiektu (L43: nowa reguła kasująca obiekt = przegląd konsumentów).
    detachAttachmentsFromHost(state, object.id);
    state.objects.delete(object.id);
    for (const zoneName of ['graveyard', 'exile', 'hand', 'library']) {
      const zone = state.zones[zoneName];
      if (Array.isArray(zone) && zone.includes(object.id)) {
        state.zones[zoneName] = zone.filter((id) => id !== object.id);
      }
    }
    const ceased = event('token_ceased_to_exist', {
      objectId: object.id, cardId: object.cardId, name: object.name,
      controllerId: object.controllerId, zone: object.zone,
    });
    state.events.push(ceased);
    events.push(ceased);
  }
  // Prawo legend (CR 704.5j): gracz kontrolujący DWA lub więcej legendarnych
  // permanentów o tej samej nazwie wybiera, który zostaje — pozostałe idą
  // do grobu. Wybór należy do gracza (jak cele pokoi lochu, M24): SBA
  // kolejkuje pierwszą grupę duplikatów jako blokującą decyzję, a execute()
  // zamyka ją komendą resolve_legend_choice; następne SBA (po tej komendzie)
  // obsłuży ewentualną kolejną grupę. Nazwa to cardName z definicji karty
  // (dwa wydania = ta sama nazwa, CR 704.5j patrzy na nazwy — a nie na id);
  // tokeny (pole `name`) nie są legendarnymi kartami w tym katalogu, ale
  // porównanie jest generyczne. Kolejność kandydatów = kolejność wejścia
  // na pole bitwy (zones.battlefield jest listą przybycia).
  if (state.status === 'active' && !state.pendingLegendChoice) {
    let pendingGroup = null;
    const seen = new Map();
    for (const objectId of state.zones.battlefield) {
      const object = state.objects.get(objectId);
      if (!object || object.zone !== 'battlefield') continue;
      if (!(object.types ?? []).includes('Legendary')) continue;
      // CR 708.2: permanent twarzą w dół nie ma nazwy — prawo legend (CR 704.5j)
      // porównuje NAZWY, więc face-down nie wchodzi do grup duplikatów.
      if (object.faceDown) continue;
      const name = object.cardName ?? object.name ?? null;
      if (!name) continue;
      const key = object.controllerId + '|' + name;
      const group = seen.get(key) ?? { playerId: object.controllerId, name, candidateIds: [] };
      group.candidateIds.push(objectId);
      seen.set(key, group);
      if (group.candidateIds.length >= 2 && !pendingGroup) pendingGroup = group;
    }
    if (pendingGroup) {
      state.pendingLegendChoice = {
        playerId: pendingGroup.playerId,
        name: pendingGroup.name,
        candidateIds: [...pendingGroup.candidateIds],
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.turn.priorityPlayerId = pendingGroup.playerId;
      const started = event('legend_rule_choice_started', {
        playerId: pendingGroup.playerId,
        name: pendingGroup.name,
        candidateIds: [...pendingGroup.candidateIds],
      });
      state.events.push(started); events.push(started);
    }
  }
  // „Start your engines!" (DFT: Glitch Ghost Surveyor, Leonin Surveyor) —
  // prędkość startuje do 1 JAKO AKCJA STANOWA, nie z triggera wejścia. Ruling
  // WotC 2025-02-07 (w repo: docs/cards/scryfall-leonin-surveyor.json, pole
  // `rulings`): „isn't a triggered ability … as soon as you control a permanent
  // with the ability. Notably, this includes gaining control of a permanent with
  // the ability that another player controls". Konsekwencje modelu:
  //  (a) brak nazw kart (ADR 0002) — liczy się deklaracja zdolności z efektem
  //      `start_engines`;
  //  (b) czytamy `effectiveAbilities`, więc zdolność NADANA działa tak samo jak
  //      wydrukowana;
  //  (c) działa po zmianie kontrolera, gdy żadne ETB już nie zachodzi;
  //  (d) nigdy nie cofa prędkości — brak gałęzi „ktoś stracił silnik", bo
  //      prędkość jest cechą gracza (ten sam ruling: „losing control … doesn't
  //      affect your speed").
  const playersWithoutSpeed = new Set(state.players
    .filter((pl) => (pl.speed ?? 0) < 1).map((pl) => pl.id));
  if (playersWithoutSpeed.size > 0) {
    const engineControllers = new Set();
    for (const id of state.zones.battlefield) {
      const object = state.objects.get(id);
      if (!object || object.zone !== 'battlefield' || !object.controllerId) continue;
      if (!playersWithoutSpeed.has(object.controllerId)) continue;
      const hasEngines = effectiveAbilities(object).some((ability) => [ability?.effect].flat()
        .some((entry) => entry?.type === 'start_engines'));
      if (hasEngines) engineControllers.add(object.controllerId);
    }
    for (const playerId of engineControllers) events.push(...startEnginesFor(state, playerId));
  }
  return events;
}

