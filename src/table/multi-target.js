/**
 * M195/C + C1 (uwagi właściciela): WIELOCELOWOŚĆ JAKO LISTA WYBORU.
 *
 * Zgłoszenie:
 *   „Fireball — mam 95 kombinacji obrażeń. Kompletnie bez sensu. To powinno
 *    być zrobione na zasadzie listy legalnych celów do wyboru (ptaszek)
 *    i osobnego licznika +- do określenia obrażeń (X) i kosztu czaru.
 *    Po zatwierdzeniu silnik sprawdza czy wybór jest legalny."
 *   „Wrap in Flames — zamiast 50 kombinacji lista legalnych celów
 *    z możliwością dodania ptaszka i potem sprawdzeniem legalności."
 *
 * Silnik enumeruje KAŻDĄ kombinację celów i wartości X jako osobną legalną
 * komendę (kartezjański iloczyn). To poprawne dla botów — one wybierają
 * z listy — ale dla człowieka panel zamieniał się w ścianę setek przycisków
 * („95 kombinacji", zmierzone 232 przy 4 stworach i 8 lądach).
 *
 * Ten moduł NIE zmienia silnika ani protokołu: czyta gotowe komendy
 * i wyprowadza z nich DWA niezależne wymiary decyzji — zbiór celów i wartość
 * X. Po zaznaczeniu wracamy do TEJ SAMEJ komendy z legalCommands, więc
 * walidacja silnika pozostaje jedynym źródłem prawdy o legalności (L48:
 * UI nie wymyśla ruchów, tylko inaczej je pokazuje).
 */

/** Kanoniczny klucz zbioru celów — kolejność zaznaczania jest nieistotna. */
function targetKey(targets) {
  return [...(targets ?? [])].sort().join('|');
}

/**
 * Plan wyboru dla grupy wariantów tego samego rzutu albo null, gdy grupa nie
 * jest „wielowymiarowa" (zwykły czar celowany radzi sobie listą celów).
 *
 * Zwraca:
 *  - `targets`   — pełna lista celów, jakie da się zaznaczyć (suma wariantów),
 *  - `minTargets`/`maxTargets` — ile celów wolno wskazać („up to three"),
 *  - `hasX`, `xMin`, `xMax` — czy jest licznik X i w jakim zakresie.
 */
export function multiTargetPlanOf(commands) {
  const all = commands ?? [];
  const list = all.filter((cmd) => cmd && Array.isArray(cmd.targets));
  if (list.length < 2) return null;
  // M300 (audyt okien rzutu): plan nie może POWSTAĆ z podzbioru opcji —
  // okno rzutu z odmową (decline/cast:false) i wariantami celowanymi
  // dawało kreator wielocelowy BEZ wiersza odmowy (zmierzone: Vaan + czar
  // z {X}). Jeżeli którakolwiek opcja nie niesie `targets`, ta rodzina ma
  // własny kształt (okna rzutu → castWindowPlanOf, fallback → przyciski).
  if (list.length !== all.length) return null;

  const xValues = [...new Set(list.map((cmd) => cmd.xValue).filter((x) => Number.isInteger(x)))]
    .sort((a, b) => a - b);
  const hasX = xValues.length > 1;

  const sizes = [...new Set(list.map((cmd) => cmd.targets.length))];
  const multiTarget = sizes.some((size) => size !== sizes[0]) || sizes[0] > 1;

  // Bez żadnego z dwóch wymiarów to zwykła lista celów (Shock: jedna komenda
  // na cel) — panel pokazuje ją od dawna poprawnie, nie ma czego zastępować.
  if (!hasX && !multiTarget) return null;

  const targets = [];
  for (const cmd of list) {
    for (const id of cmd.targets) if (!targets.includes(id)) targets.push(id);
  }

  return {
    targets,
    minTargets: Math.min(...sizes),
    maxTargets: Math.max(...sizes),
    hasX,
    xMin: hasX ? xValues[0] : null,
    xMax: hasX ? xValues[xValues.length - 1] : null,
    // M207: rozbicie na POZYCJE CELU (patrz `targetSlotsOf`) albo null, gdy
    // czar bierze jednorodną listę („dowolna liczba celów").
    slots: targetSlotsOf(list, sizes),
    // Wspólne pola komendy — UI potrzebuje ich do opisu (nazwa karty, tryb).
    objectId: list[0].objectId,
    type: list[0].type,
    modeIndex: list[0].modeIndex ?? null,
  };
}

/**
 * M207 (audyt rozgrywek): czar o KILKU RÓŻNYCH pozycjach celu — „target
 * creature you control … target creature an opponent controls" (Knockout
 * Maneuver), „target creature card from your graveyard … target player"
 * (Grave Exchange).
 *
 * Silnik enumeruje iloczyn kartezjański pozycji, więc pozycja jest zapisana
 * w KOLEJNOŚCI tablicy `targets` (indeks = numer pozycji z `spell.targets`).
 * Płaska lista „zaznacz cele (2)" tę informację gubiła: gracz dostawał jeden
 * wór z kartą z grobu i dwoma graczami, w kolejności wynikającej z porządku
 * odkrywania, i mógł zaznaczyć dwie pozycje z tej samej szufladki. Wybór był
 * wtedy nielegalny (`commandForSelection` → null), a jedyną informacją zwrotną
 * pozostawało wyszarzone „Zatwierdź" — bez słowa, CZEGO brakuje.
 *
 * Zwraca tablicę zbiorów kandydatów (po jednym na pozycję) albo null, gdy
 * rozbicie nie ma sensu:
 *  - warianty mają RÓŻNE długości („up to three" — pozycje są wymienne),
 *  - któraś pozycja dzieli kandydatów z inną (lista jednorodna: Fireball
 *    „any number of targets" — tam wór jest poprawną formą).
 */
function targetSlotsOf(list, sizes) {
  if (sizes.length !== 1) return null;          // „up to N" — pozycje wymienne
  const arity = sizes[0];
  if (arity < 2) return null;
  const slots = [];
  for (let i = 0; i < arity; i += 1) {
    const ids = [];
    for (const cmd of list) {
      const id = cmd.targets[i];
      if (id != null && !ids.includes(id)) ids.push(id);
    }
    slots.push(ids);
  }
  // Jednorodne (te same kandydatury na każdej pozycji) = zwykła lista celów.
  const seen = new Set();
  for (const ids of slots) {
    for (const id of ids) {
      if (seen.has(id)) return null;
      seen.add(id);
    }
  }
  return slots;
}

/**
 * Komenda odpowiadająca zaznaczeniu gracza albo null, gdy taki wybór nie jest
 * legalny. Nie budujemy komendy „z palca" — szukamy jej wśród wariantów, które
 * silnik już uznał za legalne (dlatego nielegalny wybór po prostu jej nie ma).
 */
export function commandForSelection(commands, { targets = [], xValue = null } = {}) {
  const key = targetKey(targets);
  return (commands ?? []).find((cmd) => {
    if (!cmd || !Array.isArray(cmd.targets)) return false;
    if (targetKey(cmd.targets) !== key) return false;
    if (xValue == null) return true;
    return cmd.xValue === xValue;
  }) ?? null;
}

// ===========================================================================
// M257-r5/C (uwaga z testów): koszt dodatkowy „poświęć stwora” — OSOBNE
// wybory zamiast iloczynu.
//
// Zgłoszenie: „Bone Splinters — są dwa osobne wybory: cel czaru i stwór do
// poświęcenia. Zamiast tego dostaję listę WSZYSTKICH kombinacji (cel ×
// ofiara).” Silnik NIE zmienia się: bierze z legalCommands (bot + L48), a
// człowiek dostaje DWA wiersze z ptaszkiem — cel czaru oraz stwór do
// poświęcenia (koszt). Zatwierdzenie wraca do tej samej komendy z
// legalCommands, więc walidacja silnika zostaje jedynym źródłem prawdy.
// ===========================================================================

/**
 * Plan „cel + poświęcenie” dla grupy wariantów jednego rzutu albo null, gdy
 * grupa nie pasuje. Wyzwalacz (celowo wąski):
 *  - CAŁA grupa to `cast_spell` z OBOWIĄZKOWYM poświęceniem
 *    (`sacrificeTargetId` zawsze ustawiony) — mieszanina wariantów
 *    `payAltCost` (Lash of the Balrog: „sacrifice a creature OR pay {4}”)
 *    zostaje zwykłą listą, bo kreator ukryłby wariant zapłaty maną;
 *  - czar ma co najmniej JEDEN cel (Village Rites `targets: []` = zwykła
 *    lista ofiar — i tak jest czytelna);
 *  - ≥2 różne ofiary (jedna ofiara = jeden wiersz, kreator zbędny);
 *  - wspólny obiekt rzutu (jedna karta, jeden tryb).
 */
export function sacrificeCastPlanOf(commands) {
  const options = commands ?? [];
  if (options.length < 2) return null;
  const list = options.filter((cmd) => cmd?.type === 'cast_spell'
    && cmd.sacrificeTargetId != null
    && Array.isArray(cmd.targets) && cmd.targets.length >= 1);
  if (list.length !== options.length) return null;
  if (!list.every((cmd) => cmd.objectId === list[0].objectId
    && (cmd.modeIndex ?? null) === (list[0].modeIndex ?? null))) return null;
  const sacrifices = [];
  for (const cmd of list) if (!sacrifices.includes(cmd.sacrificeTargetId)) sacrifices.push(cmd.sacrificeTargetId);
  if (sacrifices.length < 2) return null;
  const targets = [];
  for (const cmd of list) for (const id of cmd.targets) if (!targets.includes(id)) targets.push(id);
  const sizes = [...new Set(list.map((cmd) => cmd.targets.length))];
  return {
    type: 'cast_spell',
    objectId: list[0].objectId,
    modeIndex: list[0].modeIndex ?? null,
    targets,
    sacrifices,
    // Pola w kształcie planu wielocelowego — renderMultiTargetWizard jest
    // wspólny (`sacrificeMode` przełącza drugą sekcję + szukanie komendy).
    minTargets: Math.min(...sizes),
    maxTargets: Math.max(...sizes),
    hasX: false,
    sacrificeMode: true,
  };
}

/**
 * Komenda odpowiadająca parze (cele, ofiara) albo null — szukana wśród
 * wariantów legalnych silnika (L48: UI nie buduje komendy z palca).
 * Fizzle (cel = ofiara, CR 601.2c/608.2b) pozostaje osiągalny: taki wariant
 * jest w legalCommands, więc zatwierdzenie go legalne.
 */
export function commandForSacrificeSelection(commands, { targets = [], sacrifice = null } = {}) {
  const key = targetKey(targets);
  return (commands ?? []).find((cmd) =>
    cmd?.type === 'cast_spell'
    && cmd.sacrificeTargetId === sacrifice
    && Array.isArray(cmd.targets)
    && targetKey(cmd.targets) === key) ?? null;
}

// ===========================================================================
// M200/C (uwaga właściciela 2026-08-23): mulligan — odłożenie N kart na spód.
//
// Zgłoszenie: „zamiast dać wszystkie opcje kart z ptaszkiem do zaznaczania
// tych, które chcę oddać, mam wszystkie możliwe kombinacje — przy 3 kartach
// do odłożenia to będzie 7×7×7 kombinacji!”. Te samy wzorzec co wielocelowość:
// silnik enumeruje podzbiory jako osobne legalne komendy (poprawne dla botów),
// a człowiek dostaje listę kart z ptaszkiem. Zatwierdzenie wraca do komendy
// z legalCommands — silnik pozostaje jedynym źródłem prawdy o legalności.
// ===========================================================================

/**
 * Plan odłożenia kart po mulliganie albo null, gdy grupa nie jest
 * „karty-do-zaznaczenia” (np. pojedyncza komenda po deduplikacji — zwykła
 * lista radzi sobie sama). Wszystkie komendy grupy mają ten sam `count`.
 */
export function mulliganBottomPlanOf(commands) {
  const list = (commands ?? []).filter((cmd) =>
    cmd?.type === 'resolve_mulligan_bottom_choice' && Array.isArray(cmd.cardIds));
  if (list.length < 2) return null;
  const count = list[0].cardIds.length;
  if (!list.every((cmd) => cmd.cardIds.length === count)) return null;
  const cardIds = [];
  for (const cmd of list) {
    for (const id of cmd.cardIds) if (!cardIds.includes(id)) cardIds.push(id);
  }
  return {
    type: 'resolve_mulligan_bottom_choice',
    cardIds,
    count,
    playerId: list[0].playerId ?? null,
    // Pola w kształcie planu wielocelowego — renderMultiTargetWizard jest
    // wspólny (cardIdsMode przełącza szukanie komendy na cardIds).
    targets: cardIds,
    minTargets: count,
    maxTargets: count,
    hasX: false,
    cardIdsMode: true,
    itemLabel: 'karty',
  };
}

// ===========================================================================
// M298/A (uwaga właściciela z żywej gry, 2026-09-03): modale wyboru dla
// proliferate, pojedynczego celu i mulligana wyglądały inaczej niż wybór
// bloków/atakujących, bo multiTargetPlanOf filtrował tylko komendy z polem
// `targets` — te trzy rodziny spadały do awaryjnego renderChoiceRequest
// (ściana przycisków + mylący ptaszek wyciszenia w przycisku). Dostają plany
// i przechodzą przez TEN SAM kreator; zatwierdzenie oddaje komendę
// z legalCommands (L48: UI nie wymyśla ruchów, tylko inaczej je pokazuje).
// ===========================================================================

/**
 * Plan proliferate (CR 701.27, Spread the Sickness): komendy
 * `resolve_proliferate` niosą `targetIds` (podzbiory kandydatów z
 * licznikami), a NIE `targets` — stąd osobny plan zamiast multiTargetPlanOf.
 * Null dla grupy jednoelementowej (pojedyncza oferta nie wymaga kreatora).
 */
export function proliferatePlanOf(commands) {
  const options = commands ?? [];
  const list = options.filter((cmd) => cmd?.type === 'resolve_proliferate');
  if (list.length !== options.length || list.length < 2) return null;
  const sizes = list.map((cmd) => (cmd.targetIds ?? []).length);
  const targets = [];
  for (const cmd of list) {
    for (const id of cmd.targetIds ?? []) if (!targets.includes(id)) targets.push(id);
  }
  return {
    type: 'resolve_proliferate',
    targets,
    minTargets: Math.min(...sizes),
    maxTargets: Math.max(...sizes),
    hasX: false,
    // Wariant z targetIds zamiast targets — przełącza dopasowanie komendy
    // (commandForProliferateSelection) w renderMultiTargetWizard.
    targetIdsMode: true,
    itemLabel: 'obiekty z licznikami',
    playerId: list[0].playerId ?? null,
  };
}

/**
 * Komenda odpowiadająca zaznaczonym obiektom proliferate albo null — szukana
 * wśród wariantów legalnych silnika (porządek kliknięć nieistotny, pusty
 * wybór = komenda bez targetIds).
 */
export function commandForProliferateSelection(commands, targetIds) {
  const key = targetKey(targetIds ?? []);
  return (commands ?? []).find((cmd) =>
    cmd?.type === 'resolve_proliferate'
    && targetKey(cmd.targetIds ?? []) === key) ?? null;
}

/**
 * Pola, którymi komendy jednowyborowe niosą WYBRANEGO kandydata (audyt
 * modali wyboru 2026-09-03, §3a): ~24 typy resolve_* o tym samym kształcie
 * decyzji co resolve_trigger_target. Świadomie NIE ma tu pól okien rzutu
 * (exile/grave-free/madness/rebound/suspend cast) — tam `cardId` oznacza
 * kartę rzutu, nie wybór z listy.
 */
// M301 (zmierzone żywo: Wedgelight Rammer, Makeshift Mauler): pola KOSZTÓW
// „tapnij stwora” i „wygnij kartę” to ten sam kształt „wybierz jednego
// kandydata” — bez nich grupy padały na ścianę przycisków.
const SINGLE_PICK_FIELDS = ['targetId', 'cardId', 'keepId', 'pickId', 'sacrificeLandId', 'armyId',
  'tapCreatureId', 'tapOtherCreatureId', 'exileTargetId'];

/**
 * M301: typy komend „rzuć/aktywuj w JEDEN cel" — wybór niesie `targets[1]`
 * (gospodarz aury, cel equip). Razem z `resolve_trigger_target` i ogólną
 * rodziną pól (SINGLE_PICK_FIELDS) wyczerpują kształt „wskaż cel (1)”.
 */
const SINGLE_TARGET_CAST_TYPES = ['cast_spell', 'cast_permanent', 'activate_ability'];

/**
 * Typy WYKLUCZONE z ogólnej rodziny jednowyborowej: OKNA RZUTU, w których
 * każda opcja to OSOBNY rzut z własnymi celami/X/stun (etykiety K1/K2),
 * a nie wybór jednego kandydata z listy — tam `cardId` oznacza kartę rzutu.
 */
const SINGLE_PICK_EXCLUDED_TYPES = new Set([
  'resolve_exile_cast', 'resolve_grave_free_cast', 'resolve_madness_cast',
  'resolve_rebound_cast', 'resolve_suspend_cast',
]);

/** Czy komenda jest wariantem ODMOWY rodziny jednowyborowej. */
function isNonePickCommand(cmd, field) {
  if (!cmd) return false;
  if (field === 'cardId' && cmd.cardId === null) return true;
  return cmd.done === true || cmd.skip === true;
}

/** Etykieta wiersza odmowy zależy od tego, JAK rodzina odmawia. */
function noneLabelOf(commands, field) {
  if (commands.some((cmd) => cmd?.done === true)) return 'Gotowe — bez wyboru';
  if (commands.some((cmd) => cmd?.skip === true)) return 'Pomiń';
  if (field === 'cardId') return 'Zakończ bez wyboru';
  return 'Nie wskazuj celu';
}

/** Nazwa wybieranego obiektu per pole — intro kreatora („wskaż …”). */
function itemLabelOf(field) {
  if (field === 'cardId' || field === 'pickId') return 'kartę';
  if (field === 'sacrificeLandId') return 'ląd do poświęcenia';
  if (field === 'armyId') return 'armię';
  if (field === 'keepId') return 'legendę do zachowania';
  // M301: koszty „tapnij stwora” / „wygnij kartę” nazywają czynność z Oracle.
  if (field === 'tapCreatureId' || field === 'tapOtherCreatureId') return 'stwora do tapnięcia';
  if (field === 'exileTargetId') return 'kartę do wygnania';
  return 'cel';
}

/**
 * Plan wyboru JEDNEGO celu: grupa, w której KAŻDA komenda wskazuje dokładnie
 * jeden cel — trzy źródła:
 *  - `cast_spell` z `targets[1]` (Spread the Sickness: „zniszcz stwór”),
 *  - `resolve_trigger_target` z `targetId` (ETB Bone Shredder),
 *  - M299 (audyt modali wyboru): każda inna jednorodna grupa, której komendy
 *    wybierają kandydata polem z SINGLE_PICK_FIELDS (resolve_graveyard_top_
 *    choice, resolve_discard_choice, resolve_springbloom, resolve_amass_
 *    choice, resolve_opponent_target itd.); wariant odmowy (`done`/`skip`/
 *    null) daje dodatkowy wiersz (`allowNone`).
 * Wykluczenia: pojedyncza opcja (zwykła lista wystarczy), różne `xValue`
 * (licznik X musi zostać — obsługuje go multiTargetPlanOf).
 */
export function singleTargetPlanOf(commands) {
  const options = commands ?? [];
  if (options.length < 2) return null;
  // M301 (zlecenie właściciela — „podgląd kart targetów itp."): wybór
  // JEDNEGO celu to nie tylko cast_spell — aura castowana na gospodarza
  // (cast_permanent z targets[1]) i aktywacje z jednym celem (equip) mają
  // DOKŁADNIE ten sam kształt, a padały na ścianę przycisków (rozmiar 1 jest
  // poniżej progu multiTargetPlanOf). Typy wprost, nie „dowolny z targets":
  // L48 — plan prowadzi tylko rodziny o znanym sposobie wyboru.
  const spells = options.filter((cmd) => SINGLE_TARGET_CAST_TYPES.includes(cmd?.type)
    && Array.isArray(cmd.targets) && cmd.targets.length === 1);
  if (spells.length === options.length) {
    const xValues = new Set(spells.map((cmd) => cmd.xValue ?? null));
    if (xValues.size > 1) return null; // grupa z {X} → kreator z licznikiem
    if (!spells.every((cmd) => cmd.objectId === spells[0].objectId
      && (cmd.modeIndex ?? null) === (spells[0].modeIndex ?? null))) return null;
    const targets = [];
    for (const cmd of spells) if (!targets.includes(cmd.targets[0])) targets.push(cmd.targets[0]);
    return {
      // M301: typ z komend (cast_spell / cast_permanent aury / activate_ability).
      type: spells[0].type,
      objectId: spells[0].objectId,
      modeIndex: spells[0].modeIndex ?? null,
      targets,
      minTargets: 1,
      maxTargets: 1,
      hasX: false,
      singleMode: 'targets',
      allowNone: false, // rzutu/aktywacji nie „odmawia się” — brak wiersza none
      itemLabel: 'cel',
    };
  }
  const triggers = options.filter((cmd) => cmd?.type === 'resolve_trigger_target' && 'targetId' in cmd);
  if (triggers.length === options.length) {
    const targets = [];
    for (const cmd of triggers) {
      if (cmd.targetId != null && !targets.includes(cmd.targetId)) targets.push(cmd.targetId);
    }
    if (targets.length < 2) return null; // jeden kandydat = zwykła lista
    return {
      type: 'resolve_trigger_target',
      targets,
      minTargets: 1,
      maxTargets: 1,
      hasX: false,
      singleMode: 'targetId',
      allowNone: triggers.some((cmd) => cmd.targetId == null),
      itemLabel: 'cel',
    };
  }
  // M299: ogólna rodzina jednowyborowa — jeden typ komendy, każdy wariant
  // wybiera kandydata tym samym polem albo jest odmową. Okna rzutu mają
  // własne etykiety K1/K2 (każda opcja = osobny rzut), stąd wykluczenie.
  if (SINGLE_PICK_EXCLUDED_TYPES.has(options[0]?.type)) return null;
  if (!options.every((cmd) => cmd?.type === options[0].type)) return null;
  const field = SINGLE_PICK_FIELDS.find((name) => options.some((cmd) => cmd[name] != null));
  if (!field) return null;
  if (!options.every((cmd) => isNonePickCommand(cmd, field) || cmd[field] != null)) return null;
  const targets = [];
  for (const cmd of options) {
    if (!isNonePickCommand(cmd, field) && !targets.includes(cmd[field])) targets.push(cmd[field]);
  }
  if (targets.length < 2) return null; // jeden kandydat = zwykła lista
  return {
    type: options[0].type,
    targets,
    minTargets: 1,
    maxTargets: 1,
    hasX: false,
    singleMode: 'field',
    singleField: field,
    allowNone: options.some((cmd) => isNonePickCommand(cmd, field)),
    noneLabel: noneLabelOf(options, field),
    itemLabel: itemLabelOf(field),
  };
}

/**
 * Komenda odpowiadająca wskazanemu celowi (albo odmowie — `targetId: null`)
 * albo null; szukana wśród wariantów legalnych silnika (L48).
 */
export function commandForSingleTargetSelection(commands, { targetId, field = null }) {
  return (commands ?? []).find((cmd) => {
    if (!cmd) return false;
    if (field) {
      // Ogólna rodzina jednowyborowa (M299): kandydat siedzi w `field`,
      // a pusty wybór = wariant odmowy (done/skip/null). M301: gałąź pola
      // idzie PIERWSZA — pola kosztów (tapCreatureId, exileTargetId…) bywają
      // na komendach typów z SINGLE_TARGET_CAST_TYPES (activate_ability,
      // cast_permanent) i tamten kształt (`targets[1]`) ich nie opisuje.
      if (targetId == null) return isNonePickCommand(cmd, field);
      return cmd[field] === targetId && !isNonePickCommand(cmd, field);
    }
    // M301: wspólny kształt „jeden cel w targets[1]" — cast_spell, aura
    // (cast_permanent) i aktywacje (equip); patrz singleTargetPlanOf.
    if (SINGLE_TARGET_CAST_TYPES.includes(cmd.type)) {
      return Array.isArray(cmd.targets) && cmd.targets.length === 1 && cmd.targets[0] === targetId;
    }
    if (cmd.type === 'resolve_trigger_target') {
      return 'targetId' in cmd && cmd.targetId === targetId;
    }
    return false;
  }) ?? null;
}

/**
 * Plan mulligana „zatrzymaj rękę albo weź mulligan” (`resolve_mulligan_choice`,
 * dwa warianty) — dwa czytelne wiersze zamiast dwóch wielkich przycisków.
 * Przy siódmym mulliganie oferta jest jednoelementowa → zwykła lista.
 * Etykiety wierszy (liczba kart w ręce) dokleja wywołujący (`plan.rows`).
 */
export function mulliganKeepPlanOf(commands) {
  const options = commands ?? [];
  if (options.length !== 2) return null;
  const list = options.filter((cmd) => cmd?.type === 'resolve_mulligan_choice' && typeof cmd.keep === 'boolean');
  if (list.length !== 2) return null;
  return {
    type: 'resolve_mulligan_choice',
    mulliganKeepMode: true,
    targets: [],
    hasX: false,
  };
}

// ===========================================================================
// M300 (zlecenie właściciela 2026-09-03): OKNA RZUTU do wspólnego kreatora.
//
// Okno Vaana (`resolve_exile_cast`), Halo Foragera (`resolve_grave_free_cast`),
// madness, rebound i suspend to grupy, w których KAŻDA opcja jest GOTOWYM
// wariantem rzutu (cele/X/tryb/stun — etykiety K1/K2 z audytu PR #94) albo
// odmową (`cast: false` / `decline: true`). To NIE jest „skomponuj cele”
// (multiTargetPlanOf) ani „wybierz jednego kandydata” (singleTargetPlanOf) —
// to „wybierz jedną z etykietowanych opcji”: jeden wiersz na opcję, radio,
// Zatwierdź oddaje komendę z legalCommands (L48).
// ===========================================================================

/** Typy komend okien rzutu — patrz nagłówek sekcji. */
export const CAST_WINDOW_TYPES = Object.freeze([
  'resolve_exile_cast', 'resolve_grave_free_cast', 'resolve_madness_cast',
  'resolve_rebound_cast', 'resolve_suspend_cast',
]);

/**
 * Plan okna rzutu albo null. Wiersze (`rows`: `{ id, label, cardId }`)
 * wypełnia wywołujący ETYKIETAMI z `labelChoiceOptions` (K1/K2: tryb, stun,
 * numeracja duplikatów) i cardId do podglądu — silnik planu nie zna sesji.
 */
export function castWindowPlanOf(commands) {
  const options = commands ?? [];
  if (options.length < 2) return null;
  const type = options[0]?.type;
  if (!CAST_WINDOW_TYPES.includes(type)) return null;
  if (!options.every((cmd) => cmd?.type === type)) return null;
  return {
    type,
    castWindowMode: true,
    targets: [],
    hasX: false,
    itemLabel: 'wariant',
    rows: options.map((cmd, i) => ({ id: `opt-${i}`, label: null, cardId: cmd.cardId ?? null })),
  };
}

/**
 * Komenda spod wiersza `opt-N` — tożsamościowo z oferty silnika (L48),
 * bo warianty różnią się polami, których plan nie zna (stun, X, tryb…).
 */
export function commandForCastWindowSelection(commands, rowId) {
  const match = /^opt-(\d+)$/.exec(String(rowId ?? ''));
  if (!match) return null;
  return (commands ?? [])[Number(match[1])] ?? null;
}

// ===========================================================================
// M301→M302 (decyzje właściciela 2026-09-03): KAŻDY modal wyboru stoi na tym
// samym helperze — różnią się parametry, podstawa jest jedna („żeby wszelkie
// zmiany — np. czcionki, ikonki podglądu itp. — były w jednym miejscu”).
//
// M301 zaczął od małych enumeracji (2–5 opcji, 18 rodzin §3b). M302 domyka:
// plan przyciskowy jest OGÓLNY — każda grupa ≥2 opcji, której nie wziął
// wcześniejszy dedykowany plan albo wizard typowany (scry/surveil/index,
// walka, podział obrażeń, escape), dostaje wiersze-przyciski we wspólnym
// kreatorze. Odpadają „rodziny odroczone”: search_choice, undercity, grupy
// „1 kandydat + odmowa” (Jill) — wszystko jedzie przez jeden komponent.
//
// Semantyka przyciskowa: JEDEN klik = DOKŁADNA komenda silnika (tożsamość
// z legalCommands — lookup opt-N, L48). Awaryjna ściana renderChoiceRequest
// zostaje wyłącznie jako siatka bezpieczeństwa dla grup pustych.
// ===========================================================================

/**
 * Ogólny plan przyciskowy albo null (grupy <2 opcji nie otwierają modala —
 * panel akcji). Wiersze (`rows`: `{ id, label, cardId }`) wypełnia
 * wywołujący etykietami z `labelChoiceOptions` i cardId do podglądu — jak
 * okna rzutu (M300). Plan nie zna typów komend: przycisk niesie swoją
 * komendę, więc jednorodność typu NIE jest warunkiem (M302).
 */
export function buttonsPlanOf(commands) {
  const options = commands ?? [];
  if (options.length < 2) return null;
  return {
    type: options[0]?.type ?? null,
    buttonsMode: true,
    targets: [],
    hasX: false,
    rows: options.map((_, i) => ({ id: `opt-${i}`, label: null, cardId: null })),
  };
}

/**
 * Komenda odpowiadająca zaznaczonym kartom albo null (wybór nielegalny =
 * brak takiej komendy — UI nie buduje komendy z palca, L48).
 */
export function commandForMulliganSelection(commands, cardIds) {
  const selection = [...(cardIds ?? [])].sort().join('|');
  const cmd = (commands ?? []).find((entry) =>
    entry?.type === 'resolve_mulligan_bottom_choice'
    && Array.isArray(entry.cardIds)
    && entry.cardIds.length === cardIds.length
    && [...entry.cardIds].sort().join('|') === selection);
  return cmd ?? null;
}
