import { event } from '../protocol/types.js';
import { assertZone } from './zones.js';
import { assertStateInvariants } from './invariants.js';
import { detachAttachmentsFromHost } from './attachments.js';
import { syncStationKind } from './counters.js';

/**
 * Rejestr LKI nazw (CR 603.10): identyfikator → ostatnia znana tożsamość
 * obiektu, który przestał istnieć w tej strefie. Trzyma WYŁĄCZNIE dane
 * potrzebne warstwie opisu (nazwa karty / tokenu, znacznik zakrycia), więc
 * nie wpływa na reguły ani na odcisk stanu — jest pamięcią prezentacji,
 * nie stanem gry.
 *
 * FoW (CR 708.2): dla obiektu zakrytego zapamiętujemy `faceDown: true`,
 * a tożsamość zostaje przy właścicielu — warstwa opisu decyduje, komu
 * wolno ją pokazać (jak dla żywego obiektu).
 */
export function rememberLastKnownObject(state, object) {
  if (!state || !object?.id) return;
  if (!state.lastKnownObjects) state.lastKnownObjects = new Map();
  state.lastKnownObjects.set(object.id, Object.freeze({
    cardId: object.cardId ?? null,
    name: object.name ?? null,
    faceDown: Boolean(object.faceDown),
    controllerId: object.controllerId ?? null,
    isToken: Boolean(object.isToken),
    copyNumber: object.copyNumber ?? null,
  }));
}

/**
 * Kontrolowana zmiana strefy obiektu gry (CR 400.7): stary obiekt przestaje
 * istnieć, a w docelowej strefie powstaje nowy obiekt z nowym id.
 *
 * To jedyne niskopoziomowe API przenoszenia obiektów. Świadomie nie zna
 * komend, tury ani PlayerView — dzięki temu moduł nie tworzy cykli z
 * game-state.js, które zablokowałyby sklejanie artefaktu (build.mjs).
 */
/**
 * CR 506.4/506.4c: obiekt przestaje być atakującym/blokującym. Jedno miejsce
 * dla WSZYSTKICH przyczyn: zmiana strefy (poświęcenie, zniszczenie, bounce)
 * oraz utrata typu stwora (koniec animacji — M201, znalezisko #1). Combat nie
 * może trzymać wiszącego odwołania: inwariant stanu rzuca wtedy wyjątkiem
 * w środku komendy, czyli wywraca stół w trakcie partii.
 *
 * Klucz mapy bloków i wpis `blockedAttackers` zostają, gdy znika BLOKER —
 * atakujący pozostaje zablokowany (CR 509.1h), mimo że blokera już nie ma.
 */
export function removeFromCombat(state, objectId) {
  if (!state?.combat) return false;
  let changed = false;
  if (state.combat.attackers.includes(objectId)) {
    state.combat.attackers = state.combat.attackers.filter((id) => id !== objectId);
    state.combat.blockers.delete(objectId);
    state.combat.blockedAttackers?.delete(objectId);
    changed = true;
  }
  for (const [attackerId, blockerIds] of state.combat.blockers) {
    if (!blockerIds.includes(objectId)) continue;
    state.combat.blockers.set(attackerId, blockerIds.filter((id) => id !== objectId));
    changed = true;
  }
  return changed;
}

export function moveObjectDirectly(state, objectId, toZone, newObjectId) {
  const object = state.objects.get(objectId);
  assertZone(toZone);
  if (!object || !newObjectId || state.objects.has(newObjectId)) throw new Error('Nieprawidłowy ruch obiektu');
  // M69 (Unearth, CR 702.87b): „Exile it ... if it would leave the battlefield"
  // — permanent z flagą unearthExile opuszczający pole bitwy idzie do exile
  // zamiast docelowej strefy (replacement, jak finality dla dies). Delayed
  // exile na end step też przechodzi tu — cel to już exile, bez zmian.
  if (object.zone === 'battlefield' && object.unearthExile && toZone !== 'exile') {
    toZone = 'exile';
  }
  // Flashback (CR 702.34b): po zapłaceniu flashback karta opuszczająca stos
  // idzie do exile (kontrczar, bounce ze stosu, rozstrzygnięcie).
  if (object.zone === 'stack' && object.flashedBack && toZone !== 'exile') {
    toZone = 'exile';
  }
  // Obiekt może opuścić pole bitwy przez koszt/efekt w oknie combat (np.
  // sacrifice aktywowanego permanenta). Combat nie może zachować wiszącego
  // odwołania do starego obiektu — usuwamy go z atakujących i bloków przed
  // zmianą strefy, bez znajomości konkretnej karty.
  if (object.zone === 'battlefield' && state.combat) removeFromCombat(state, object.id);
  state.zones[object.zone] = state.zones[object.zone].filter((id) => id !== object.id);
  state.zones[toZone].push(newObjectId);
  // CR 400.7: nowy obiekt nie pamięta stanu poprzedniego — modyfikatory
  // statystyk, obrażenia i przypisane cele nie przechodzą przez zmianę strefy.
  // Liczniki również znikają (CR 122.2), a face-down permanent po wyjściu
  // z pola bitwy jest obracany twarzą do góry. Aura bestow opuszczająca pole bitwy
  // przestaje być załączona i wraca do bycia stworem (to wciąż ta sama
  // karta-stwór — kind wraca do baseKind).
  // CR 400.3 + CR 110.2a: kontrola istnieje wyłącznie na polu bitwy i na stosie.
  // Obiekt w grobie / exile / ręce / bibliotece jest kontrolowany przez swojego
  // WŁAŚCICIELA. Bez tego stwór przejęty efektem „gain control" (Puppeteer
  // Clique, Awaken the Sleeper) po śmierci lądował w grobie ZŁODZIEJA i
  // zostawał jego kartą na stałe; właściciel nie widział jej we własnym grobie
  // i nie mógł jej reanimować. `bounce_permanent` miał już własną korektę na
  // ownerId — tu naprawiamy to raz, w jedynym choke poincie zmian stref.
  const controllerAfterMove = (object.zone === 'battlefield' && toZone !== 'battlefield' && toZone !== 'stack')
    ? (object.ownerId ?? object.controllerId)
    : object.controllerId;
  // CR 711.4a (M257/K5, Żywy Tester g1001): DFC poza polem bitwy ma wyłącznie
  // cechy Twarzy PRZEDNIEJ. Obrócony na tył permanent (wilkołak), który
  // opuszcza pole bitwy (bounce, śmierć, wygnanie), odwraca się na przód:
  // w ręce/grobie/bibliotece widnieje przód, a rzut z ręki idzie na stos
  // przodem (CR 711.7) i wchodzi przodem (CR 711.8). Twarzą przednią pary
  // jest `frontFaceId` (snapshot z materializacji); cechy przedniej twarzy
  // przy tylnym obrazku niesie `transformTo` (efekt transform buduje go z
  // cech sprzed obrócenia) — odwracamy go w `transformTo` nowego obiektu,
  // żeby flicker w obie strony dalej działał. LKI (CR 603.10) zachowuje
  // twarz z pola bitwy: `rememberLastKnownObject` dostaje stary obiekt, a
  // żaden z obecnych triggerów `leaves_battlefield` nie czyta P/T odchodzącego.
  let dfcFaceReset = null;
  if (object.zone === 'battlefield' && toZone !== 'battlefield'
    && object.transformTo && object.frontFaceId && object.cardId !== object.frontFaceId) {
    const front = object.transformTo;
    dfcFaceReset = {
      cardId: front.cardId,
      cardName: front.cardName ?? object.cardName,
      power: front.power,
      toughness: front.toughness,
      abilities: front.abilities,
      keywords: front.keywords ?? [],
      subtypes: front.subtypes ?? [],
      ...(front.kind != null ? { kind: front.kind } : {}),
      ...(front.types ? { types: front.types } : {}),
      // Karta poza polem bitwy leży przodem (CR 711.4a) — jej MV to koszt
      // przedni; payload przedniej twarzy niesie go od Etapu 2.3b. Zwykły
      // DFC: spread i tak trzyma ten sam koszt (no-op).
      ...(front.manaCost != null ? { manaCost: front.manaCost } : {}),
      transformTo: Object.freeze({
        cardId: object.cardId,
        cardName: object.cardName,
        power: object.power,
        toughness: object.toughness,
        abilities: object.abilities,
        keywords: object.keywords ?? [],
        subtypes: object.subtypes ?? [],
        ...(object.kind != null ? { kind: object.kind } : {}),
        ...(object.types ? { types: object.types } : {}),
        // MV z tylną twarzą w górę (koszt przedni) — kontrakt symetryczny
        // z transform/craft, żeby powrót na pole i kolejna transformacja
        // czytały właściwą wartość (M258/Etap 2.3b).
        ...(object.manaCost != null ? { manaCost: object.manaCost ?? 0 } : {}),
      }),
    };
  }
  const moved = Object.freeze({
    ...object, ...dfcFaceReset, id: newObjectId, zone: toZone, controllerId: controllerAfterMove,
    // Crew Captain / enteredThisTurn: numer tury WEJŚCIA na pole bitwy.
    // Opuszczenie pola bitwy czyści flagę (nowy obiekt, CR 400.7).
    enteredOnTurn: toZone === 'battlefield' ? state.turn.number : null,
    // M258 (Żywy Tester): ECHO (CR 702.29) — znacznik „nieopłacone echo"
    // stawiało dotąd WYŁĄCZNIE addObject (helpery testowe), a realna ścieżka
    // rzutu (stos → pole bitwy przez ten choke point) go pomijała: Bone
    // Shredder rzucony z ręki nigdy nie pytał o płatność echo. Wchodzący
    // permanent z `echo` wchodzi z echoUnpaid (flicker/reanimacja też —
    // to nowy obiekt, „came under your control since your last upkeep").
    ...(toZone === 'battlefield' && object.echo != null ? { echoUnpaid: true } : {}),
    damage: 0, powerModifier: 0, toughnessModifier: 0, chosenTargets: null,
    // CR 110.6/400.7: tapnięcie to status PERMANENTU — istnieje wyłącznie na
    // polu bitwy. Nowy obiekt nie pamięta poprzedniego istnienia, a permanent
    // wchodzi na pole bitwy nietapnięty (CR 110.6b), chyba że efekt wprost
    // każe inaczej (entersTapped ustawia tapnięcie PO przeniesieniu).
    // Bez tego stwór odbity na rękę wracał na stół tapnięty, a reanimacja
    // tapniętego stwora dawała tapnięty permanent.
    tapped: false,
    counters: {}, faceDown: false, keywordGrants: [], abilityGrants: [], typeGrant: null,
    goaded: false, goadedUntilTurn: null, hexproofUntilTurn: null,
    // CR 400.7: flagi opisujące HISTORIĘ permanentu w tej turze też nie
    // przechodzą na nowy obiekt. Bez tego:
    //  - `damagedThisTurn` czyniło świeży obiekt legalnym celem dla „target
    //    creature that was dealt damage this turn" (Fathom Fleet Cutthroat);
    //  - `attackedThisTurn` sprawiało, że Homicidal Brute („if this creature
    //    didn't attack this turn") nie transformowała się po powrocie na stół.
    // ŚWIADOMY WYJĄTEK: `isBlockingThisCombat`, `formerCounters`, `formerZone`
    // i `formerAbilityGrants` to LKI (CR 603.10) — persist i Guildsworn
    // Prowler („if it wasn't blocking") czytają je PO opuszczeniu pola bitwy.
    damagedThisTurn: false, damagedByDeathtouch: false, attackedThisTurn: false,
    attacking: false, blocking: false, saddled: false, monstrous: false,
    abilityResolvedThisTurn: 0, tempBasePT: null,
    // LKI płatności Skarbem NIE przechodzi przez zmianę strefy (CR 400.7) —
    // permanent wchodzący na pole bitwy inną drogą (reanimacja, token) nie
    // był rzucany za manę ze Skarba (Marut). castPermanent wpisuje wartość
    // na obiekcie PO przeniesieniu, więc rzut z ręki ją zachowuje.
    manaFromTreasureSpent: 0,
    // Last known information (CR 603.10): stan sprzed zmiany strefy, potrzebny
    // triggerom „leave the battlefield" (persist sprawdza liczniki -1/-1,
    // które zmiana strefy już zdjęła).
    formerCounters: Object.freeze({ ...(object.counters ?? {}) }),
    formerZone: object.zone,
    // LKI zdolności nadanych „do końca tury": trigger „when this creature
    // dies" nadany przez czar (Fake Your Own Death) działa z ostatniej znanej
    // informacji, choć sam grant nie przechodzi przez zmianę strefy.
    formerAbilityGrants: Object.freeze([...(object.abilityGrants ?? [])]),
    attachedTo: null,
    // CR 711.2: rodzaj twarzy przedniej przy DFCE (np. Incubator: tył to
    // stwór, przód to artefakt) — reset twarzi (M257/K5) nadaje `kind`
    // przedniej strony, a nie stalej `object.kind` (tylnej).
    kind: object.kind === 'aura' ? (object.baseKind ?? 'creature') : (dfcFaceReset?.kind ?? object.kind),
    baseKind: null,
  });
  state.objects.delete(object.id); state.objects.set(newObjectId, moved);
  // M201/M (zgłoszenie właściciela, CR 603.10 — last known information):
  // stary identyfikator znika ze `state.objects`, a odwołania do niego ŻYJĄ
  // dalej: cele czaru na stosie (Frightful Delusion kontruje cel PRZY
  // rozstrzygnięciu, ale sam zostaje na stosie do czasu odrzucenia karty),
  // wpisy logu, etykiety. Warstwa opisu pytała wtedy o obiekt, którego już
  // nie ma, i pokazywała „cel: ?” (klasa L29: fallback-znak zapytania to
  // wyciek, nie zabezpieczenie). Rejestr LKI jest zapisywany w JEDYNYM
  // choke poincie zmian stref, więc obejmuje każdą ścieżkę (kontra, śmierć,
  // wygnanie, bounce) bez wiedzy o karcie (ADR 0002).
  rememberLastKnownObject(state, object);
  // Załączniki wskazujące odchodzący obiekt rozłączają się od razu —
  // attachedTo nigdy nie wskazuje obiektu spoza pola bitwy (inwariant).
  // Polityki zależą od rodziny: bestow znów jest stworem (CR 702.103b),
  // equipment zostaje odłączony (CR 704.5n), czysta aura idzie do grobu
  // (CR 704.5m) — detale w attachments.js.
  if (object.zone === 'battlefield') detachAttachmentsFromHost(state, objectId);
  // Animacje z linkiem (Skilled Animator: „as long as this creature remains
  // on the battlefield") kończą się, gdy ŹRÓDŁO opuszcza pole bitwy — cofamy
  // animację celu (root cause: trwałość efektu zależy od strefy źródła,
  // więc naprawiamy ją w jedynym choke poincie zmian stref). To samo
  // dotyczy kosztów/efektów wygnań, poświęceń i zniszczeń — wszystkie
  // przechodzą przez moveObjectDirectly.
  if (object.zone === 'battlefield' && toZone !== 'battlefield') {
    const links = state.linkedAnimations ?? [];
    if (links.length > 0) {
      const remaining = links.filter((entry) => entry.sourceId !== objectId);
      const revertedTargets = new Set();
      for (const entry of links) {
        if (entry.sourceId !== objectId) continue;
        revertedTargets.add(entry.targetId);
      }
      state.linkedAnimations = remaining;
      for (const targetId of revertedTargets) {
        const stillTargeted = remaining.some((entry) => entry.targetId === targetId);
        if (stillTargeted) continue;
        const target = state.objects.get(targetId);
        if (!target || target.zone !== 'battlefield' || !target.originalBeforeAnimation) continue;
        const original = target.originalBeforeAnimation;
        const reverted = Object.freeze({
          ...target,
          kind: original.kind,
          types: original.types,
          subtypes: original.subtypes,
          power: original.power,
          toughness: original.toughness,
          originalBeforeAnimation: null,
        });
        state.objects.set(targetId, reverted);
        // M201 (znalezisko #1, CR 506.4c): permanent, który przestał być
        // stworem, jest USUWANY Z WALKI. Bez tego `state.combat` wskazywał
        // nie-stwora i inwariant wywracał komendę wyjątkiem.
        if (reverted.kind !== 'creature') removeFromCombat(state, targetId);
        state.events.push(event('permanent_animation_ended', {
          objectId: targetId, cardId: reverted.cardId,
          sourceId: objectId, kind: reverted.kind,
        }));
        // M157/C3 (L46/M141-A w ścieżce linked): każda ścieżka kończąca
        // animację musi przeliczyć trwały warunek Station — inaczej spacecraft
        // z 9+ charge wraca do artefaktu po zejściu AnimatoRA mimo progu.
        syncStationKind(state, targetId);
      }
    }
  }
  assertStateInvariants(state);
  return moved;
}

/**
 * M110 (Willbender, CR 115.7): jeden cel wpisu stosu — niezależnie od tego,
 * czy to czar (chosenTargets), zdolność aktywowana (activatedEntry.targets)
 * czy triggerowana (triggerEntry.targets). Zwraca { targetId, spec } albo null,
 * gdy wpis nie ma DOKŁADNIE jednego celu.
 */
export function singleTargetOfStackEntry(object) {
  if (!object) return null;
  if (object.activatedEntry) {
    const targets = object.activatedEntry.targets ?? [];
    const spec = (object.activatedEntry.ability?.targets ?? [])[0];
    return targets.length === 1 && spec ? { targetId: targets[0], spec, kind: 'activated' } : null;
  }
  if (object.triggerEntry) {
    const targets = object.triggerEntry.targets ?? [];
    const spec = object.triggerEntry.ability?.trigger?.requiresTarget
      ?? (object.triggerEntry.ability?.targets ?? [])[0];
    return targets.length === 1 && spec ? { targetId: targets[0], spec, kind: 'trigger' } : null;
  }
  const chosen = object.chosenTargets ?? [];
  const spellSpec = (object.spell?.targets ?? [])[0];
  return chosen.length === 1 && spellSpec ? { targetId: chosen[0], spec: spellSpec, kind: 'spell' } : null;
}
