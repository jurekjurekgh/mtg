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
export function populateDeckSelects(selects, repoDecks, { labelOf = null } = {}) {
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
      option.textContent = labelOf ? labelOf(key, repoDecks[key]) : deckTitle(repoDecks[key], key);
      select.appendChild(option);
    }
  }
  return keys;
}

/**
 * K1 (decyzja właściciela 2026-08-21): talie WŁASNE. Źródła:
 * (1) repo decks/*.txt (wbudowane, przez CI/Pages), (2) import z pliku
 * w danej przeglądarce ( IndexedDB). Klucze importowane mają prefiks
 * 'custom:', etykieta z sufiksem „(własna)". Zwraca połączoną mapę
 * tekstów talii (dla startGame) i etykiety (dla selectów).
 */
export function combineDeckSources(repoDecks, importedDecks) {
  const combined = { ...(repoDecks ?? {}) };
  for (const [name, text] of (importedDecks ?? new Map())) {
    combined[`custom:${name}`] = text;
  }
  const labelOf = (key, text) => `${deckTitle(text, key)}${key.startsWith('custom:') ? ' (własna)' : ''}`;
  return { decks: combined, labelOf };
}
