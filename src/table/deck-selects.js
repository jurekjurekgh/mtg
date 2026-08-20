/**
 * M162/A (uwaga właściciela): idempotentna populacja selectów talii
 * („Twoja talia" / „Talia bota").
 *
 * Root cause dubli: plik zapisany z przeglądarki przez „Zapisz jako..."
 * niesie w DOM opcje wstrzyknięte runtime'm (serializowany jest STAN
 * strony, nie źródło — selecty w index.html są puste). Po otwarciu takiego
 * pliku lokalnie skrypt uruchamia się ponownie i DOKŁADA drugi komplet
 * opcji — każda talia wystaje podwójnie. Populacja czyści select
 * (replaceChildren) przed wypełnieniem, więc w KAŻDYM scenariuszu
 * (świeży artefakt, plik zapis-any, podwójne wywołanie) ląduje dokładnie
 * jeden komplet opcji.
 */

/** Tytuł talii = pierwszy wiersz „# ..." z tekstowego formatu talii (ADR 0012). */
export function deckTitle(text, fallback) {
  const titleLine = String(text ?? '').split(/\r?\n/).find((row) => row.trim().startsWith('#'));
  return titleLine ? titleLine.trim().slice(1).trim() : fallback;
}

/**
 * Wypełnia podane selecty opcjami talii z repozytorium (REPO_DECKS),
 * po jednym na klucz, posortowane. Zwraca użyte klucze (dla wyznaczenia
 * wartości domyślnych przez wywołującego).
 */
export function populateDeckSelects(selects, repoDecks) {
  const keys = Object.keys(repoDecks).sort();
  for (const select of selects ?? []) {
    if (!select) continue;
    // Idempotencja (M162/A): usuwamy wszystko, co select już niesie —
    // w pliku zapisanym przez przeglądarkę są to opcje z poprzedniego
    // uruchomienia skryptu.
    if (typeof select.replaceChildren === 'function') select.replaceChildren();
    else select.innerHTML = ''; // starsze stuby DOM w testach
    for (const key of keys) {
      const option = globalThis.document.createElement('option');
      option.value = key;
      option.textContent = deckTitle(repoDecks[key], key);
      select.appendChild(option);
    }
  }
  return keys;
}
