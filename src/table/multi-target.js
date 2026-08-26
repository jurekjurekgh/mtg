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
  const list = (commands ?? []).filter((cmd) => cmd && Array.isArray(cmd.targets));
  if (list.length < 2) return null;

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
