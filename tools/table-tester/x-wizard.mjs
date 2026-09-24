/**
 * Polityka Żywego Testera dla kreatora ze stepperem X (`.multi-target-x`).
 *
 * Ten sam stepper mają DWA kształty kreatora:
 *  - „Tap X artefaktów” (tapXMode, Merchant's Dockhand) — Zatwierdź wymaga
 *    zaznaczenia dokładnie X wierszy;
 *  - X + CELE (Fireball: „any number of targets”, {1} za każdy cel ponad
 *    pierwszy) — Zatwierdź wymaga ≥ 1 celu, a każdy dodatkowy cel podnosi koszt.
 *
 * D3 (PR #135, Etap F): dawna polityka „X = max i zaznacz X wierszy” traktowała
 * cele Fireballa jak artefakty do tapnięcia — przy X = 2 zaznaczała dwa cele,
 * koszt przekraczał pulę, Zatwierdź zostawał wyłączony, tester anulował
 * i klikał „Rzuć: Fireball” w kółko aż do limitu kroków (partia bez postępu,
 * detektory milczały). Polityka generyczna, bez wiedzy o trybie: od
 * najwyższego X w dół — wyczyść zaznaczenia i dokładaj wiersze po jednym,
 * aż kreator włączy Zatwierdź (L48: legalność ocenia kreator, nie tester).
 *
 * Moduł nie dotyka DOM bezpośrednio — dostaje akcesory, dzięki czemu test
 * (`test/d3-tester-kreator-x.test.js`) sprawdza go na atrapie kreatora.
 *
 * @param {{
 *   readX: () => number,
 *   plus: { click(): void } | null,
 *   minus: { click(): void } | null,
 *   rows: () => Array<{ click(): void, checked?: boolean, disabled?: boolean }>,
 *   confirmEnabled: () => boolean,
 *   sleep?: (ms: number) => Promise<void>,
 * }} ui
 * @returns {Promise<{ x: number, picked: number, pool: number, ok: boolean }>}
 */
export async function chooseXWizard(ui) {
  const sleep = ui.sleep ?? (async () => {});
  let prevX = ui.readX();
  for (let i = 0; i < 40 && ui.plus; i += 1) {
    ui.plus.click();
    await sleep(15);
    const curX = ui.readX();
    if (curX === prevX) break; // szczyt zakresu — licznik przestał rosnąć
    prevX = curX;
  }
  let picked = 0;
  for (let guard = 0; guard < 41; guard += 1) {
    for (const row of ui.rows()) {
      if (row.checked) { row.click(); await sleep(10); }
    }
    picked = 0;
    for (const row of ui.rows().filter((r) => !r.disabled)) {
      if (ui.confirmEnabled()) break;
      row.click();
      picked += 1;
      await sleep(15);
    }
    if (ui.confirmEnabled() || !ui.minus || ui.readX() <= 0) break;
    const before = ui.readX();
    ui.minus.click();
    await sleep(15);
    if (ui.readX() === before) break; // dół zakresu (xMin)
  }
  return {
    x: ui.readX(),
    picked,
    pool: ui.rows().filter((r) => !r.disabled).length,
    ok: ui.confirmEnabled(),
  };
}
