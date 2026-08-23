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
    // Wspólne pola komendy — UI potrzebuje ich do opisu (nazwa karty, tryb).
    objectId: list[0].objectId,
    type: list[0].type,
    modeIndex: list[0].modeIndex ?? null,
  };
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
