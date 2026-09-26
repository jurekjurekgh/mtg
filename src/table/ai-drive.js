/**
 * AI-OpenRouter (Etap-3): dopisywanie odpowiedzi AI do Arkusza Google
 * przez Web App AppScriptu (kontrakt z planu §6).
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
 * Buduje body POST-a (plan §6): `{ mode, gameId, turn, model, chars,
 * response, tsClient }`. Czysta, testowalna, toleruje braki pól.
 */
export function buildAiDrivePayload({ mode, gameId, turn, model, response, tsClient } = {}) {
  const text = String(response ?? '');
  return {
    mode: String(mode ?? 'lore-bot'),
    gameId: String(gameId ?? ''),
    turn: Number.isFinite(Number(turn)) ? Number(turn) : 0,
    model: String(model ?? ''),
    chars: text.length,
    response: text,
    tsClient: String(tsClient ?? ''),
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
  return async function logAiResponse(entry) {
    try {
      const url = typeof getUrl === 'function' ? String(getUrl() ?? '').trim() : '';
      if (!url) return { ok: false, skipped: true };
      const fetchFn = fetchImpl === undefined
        ? (typeof fetch !== 'undefined' ? fetch : null)
        : (typeof fetchImpl === 'function' ? fetchImpl : null);
      if (!fetchFn) {
        if (typeof console !== 'undefined') console.warn('[ai-drive] brak `fetch` — pomijam zapis do Arkusza.');
        return { ok: false, skipped: true };
      }
      await fetchFn(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(buildAiDrivePayload(entry)),
      });
      return { ok: true };
    } catch (error) {
      if (typeof console !== 'undefined') console.warn('[ai-drive] zapis do Arkusza nieudany:', error);
      return { ok: false };
    }
  };
}
