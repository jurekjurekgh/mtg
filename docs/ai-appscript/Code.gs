/**
 * MTG Table — AI log do Arkusza Google (OpenRouter, Etap-3).
 *
 * CO TO ROBI: odbiera POST-y z aplikacji (komentarze lore AI po turach)
 * i dopisuje je jako wiersze do karty o nazwie trybu (`lore-bot`, …).
 * Karta tworzy się sama z nagłówkiem, gdy jej nie ma.
 *
 * WDROŻENIE (raz, ~10 minut, pełna instrukcja: plan §6
 * `docs/plans/PLAN_2026-09-26-ai-openrouter.md`):
 * 1. Utwórz Arkusz Google (np. „MTG AI log"), skopiuj jego ID z adresu
 *    (fragment między `/d/` a `/edit`) i wklej niżej do SHEET_ID.
 * 2. W arkuszu: Rozszerzenia → Aplikacje Apps Script → wklej TEN plik.
 * 3. Wdróż → Nowe wdrożenie → „Aplikacja internetowa”, „Uruchom jako: Ja”,
 *    „Dostęp: Każdy” → skopiuj URL (`…/exec`).
 * 4. URL wklej w aplikacji: „Konfiguracja AI” → „AppScript URL”.
 * 5. Test: włącz AI, dograj turę — wiersz ląduje w karcie `lore-bot`.
 */

// ⬇️⬇️⬇️ WSTAW TU ID SWOJEGO ARKUSZA (krok 1) ⬇️⬇️⬇️
const SHEET_ID = 'WSTAW-ID-ARKUSZA';

const HEADER = ['ts', 'game_id', 'turn', 'model', 'chars', 'response'];

/** Nazwa karty = tryb; czyścimy znaki zabronione w kartach Arkuszy. */
function sheetNameFor(mode) {
  const clean = String(mode || 'lore-bot').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 60);
  return clean || 'lore-bot';
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const name = sheetNameFor(p.mode);
      let sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(HEADER);
      }
      sheet.appendRow([
        new Date(),
        String(p.gameId ?? ''),
        Number(p.turn ?? 0),
        String(p.model ?? ''),
        Number(p.chars ?? 0),
        String(p.response ?? ''),
      ]);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('[mtg-ai] doPost nieudany: ' + err);
  }
  return ContentService.createTextOutput('ok');
}
