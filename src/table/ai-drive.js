/**
 * AI-OpenRouter: dopisywanie odpowiedzi AI do Dokumentu Google przez
 * Web App AppScriptu (kontrakt z planu §6 + Aneks R5: Dokument zamiast
 * Arkusza — wygodniejszy w czytaniu; jedna karta dokumentu na tryb).
 *
 * Zasady twarde:
 * - TYLKO sukcesy (błędy modelu/sieci nigdy tu nie trafiają — pilnuje tego
 *   wołający: main.js woła logger wyłącznie dla `result.ok`).
 * - Fire-and-forget: odpowiedź AppScriptu jest nieprzeczytywalna (`no-cors`
 *   = opaque) i taka ma zostać — tylko dopisujemy, niczego nie odczytujemy.
 * - Logger NIGDY nie rzuca i NIGDY nie odrzuca promisy: niepowodzenie
 *   zapisu to cichy `console.warn`, gra i okno AI działają dalej.
 * - Pusty URL = zapis wyłączony (aplikacja w pełni działa bez Drive).
 * - `Content-Type: text/plain` — jedyny preflight-free czytelny dla
 *   `e.postData.contents` po stronie AppScriptu.
 */

/**
 * Buduje body POST-a (kontrakt z Code.gs): `{ mode, gameId, turn, model,
 * chars, response, tsClient, decks, newGame }`. Czysta, testowalna, toleruje
 * braki pól. `decks` = matchup „X vs Y” do nagłówka partii; `newGame` =
 * pierwszy log tej partii (Code.gs stawia wtedy podział strony + H1).
 * Brak/null newGame zachowuje brak dyspozycji: dopiero logger rozstrzyga
 * automat. Jego body POST zawsze niesie boolean, także dla pustego gameId.
 */
export function buildAiDrivePayload({ mode, gameId, turn, model, response, tsClient, decks, newGame } = {}) {
  const text = String(response ?? '');
  return {
    mode: String(mode ?? 'lore-bot'),
    gameId: String(gameId ?? ''),
    turn: Number.isFinite(Number(turn)) ? Number(turn) : 0,
    model: String(model ?? ''),
    chars: text.length,
    response: text,
    tsClient: String(tsClient ?? ''),
    decks: String(decks ?? ''),
    // Brak nadpisania nie jest jawnym „nie” (F2/PR140, także po JSON round-trip).
    ...(newGame == null ? {} : { newGame: newGame === true }),
  };
}

/**
 * Fabryka loggera.
 * @param {() => string} getUrl — URL Web Appu (wołany na każde dopisanie,
 *   więc wklejenie URL-a działa od razu, bez przeładowania).
 * @param {Function|null} [fetchImpl] — wstrzyknięty fetch; `undefined` =
 *   globalny (przeglądarka), `null` = brak.
 * @returns {(entry) => Promise<{ok, skipped?}>} — nigdy nie odrzuca.
 */
export function createAiDriveLogger({ getUrl, fetchImpl } = {}) {
  // Zlecenie właściciela (łatwe szukanie początków partii): pierwszy log
  // danego gameId niesie `newGame: true` (Code.gs: podział strony + H1
  // z matchupem). Śledzenie po gameId, nie po turze — działa, choćby
  // komentarz z tury 1 był wyłączony, a pierwszy log padł w turze 5.
  // Jawne `newGame` wołającego ma pierwszeństwo (testy, re-emisje).
  const seenGameIds = new Set();
  return async function logAiResponse(entry) {
    try {
      const url = typeof getUrl === 'function' ? String(getUrl() ?? '').trim() : '';
      if (!url) return { ok: false, skipped: true };
      const gameId = String(entry?.gameId ?? '');
      const firstSeen = gameId !== '' && !seenGameIds.has(gameId);
      if (gameId !== '') seenGameIds.add(gameId);
      const payload = buildAiDrivePayload({
        ...entry,
        newGame: entry?.newGame === true || (entry?.newGame == null && firstSeen),
      });
      const fetchFn = fetchImpl === undefined
        ? (typeof fetch !== 'undefined' ? fetch : null)
        : (typeof fetchImpl === 'function' ? fetchImpl : null);
      if (!fetchFn) {
        if (typeof console !== 'undefined') console.warn('[ai-drive] brak `fetch` — pomijam zapis do Dokumentu.');
        return { ok: false, skipped: true };
      }
      await fetchFn(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      return { ok: true };
    } catch (error) {
      if (typeof console !== 'undefined') console.warn('[ai-drive] zapis do Dokumentu nieudany:', error);
      return { ok: false };
    }
  };
}
