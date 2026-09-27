/**
 * AI-OpenRouter (Etap-2): prawdziwy transport do OpenRouter.
 *
 * Kontrakt transportu (jak w `ai-queue.js`):
 *   transport({ prompt, messages, modelId, meta, signal }) -> { ok, text?, error? }
 * AI-R7: `messages` (niepusta tablica `{ role, content }`) jedzie verbatim
 * (ciągłość czatu); pusty/brak = legacy: pojedyncza wiadomość z `prompt`.
 *
 * Zasady (plan §1): `fetch` wstrzykiwany (testy bez sieci), timeout 180 s
 * przez `AbortController`, głębokie parsowanie błędów (wzorzec z apki
 * referencyjnej: `error.metadata.raw`). Klucz NIE jest tu przechowywany —
 * `getApiKey()` wołane przy KAŻDYM zapytaniu, więc wklejenie klucza
 * naprawia „Ponów” bez przeładowania (live setup jak w Etapie-1).
 */

/** Endpoint czatu OpenRouter (ten sam, co w apce referencyjnej). */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Domyślny timeout zapytania. Plan §1 mówił 60 s, ale AI-R6 (2026-09-27,
 * zgłoszenie właściciela): inference-net i Space Bunny Alpha odpowiadają
 * POPRAWNIE w 60–90 s (panel OpenRoutera: sukces), więc 60 s ucinało
 * dobre odpowiedzi. 180 s = pełna odpowiedź + zapas na wolny start.
 */
export const AI_CLIENT_TIMEOUT_MS = 180_000;

/**
 * Splaszcza „głęboki” błąd OpenRouter do czytelnego tekstu.
 * Kształty na wolności: `{ error: { message, metadata: { raw } } }`,
 * `{ error: 'tekst' }`, `{ message }`, czasem sam string.
 */
/**
 * Obcięcie detalu błędu, żeby odpowiedź serwera nie zalała panelu.
 * AI-R6 (prośba właściciela): DOKŁADNA treść błędu — limit 2000 znaków
 * (prawdziwe błędy API są krótsze i przechodzą verbatim; ucina tylko
 * śmieci typu strony HTML od pośredników).
 */
function clipDetail(text) {
  const s = String(text ?? '').trim();
  return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
}

export function aiClientErrorText(status, data) {
  const detail = (() => {
    if (data == null) return '';
    if (typeof data === 'string') return clipDetail(data);
    const err = data.error ?? data;
    if (typeof err === 'string') return clipDetail(err);
    if (err && typeof err === 'object') {
      const raw = err.metadata?.raw ?? err.raw ?? err.message ?? err.msg;
      if (typeof raw === 'string' && raw.trim()) return clipDetail(raw);
      if (raw != null && typeof raw === 'object') {
        try { return clipDetail(JSON.stringify(raw)); } catch { return ''; }
      }
      // Ostatnia deska: cały obiekt.
      try { return clipDetail(JSON.stringify(err)); } catch { return ''; }
    }
    return '';
  })();
  const suffix = detail ? `: ${detail}` : '';
  if (status === 401) return `Nieprawidłowy klucz API (HTTP 401) — sprawdź klucz w „Konfiguracji AI”${suffix}`;
  if (status === 402) return `Brak środków na koncie OpenRouter (HTTP 402)${suffix}`;
  if (status === 404) return `Nie znaleziono modelu albo endpointu (HTTP 404)${suffix}`;
  if (status === 429) return `Limit zapytań OpenRouter (HTTP 429) — odczekaj chwilę i użyj „Ponów”${suffix}`;
  if (status >= 500) return `Błąd serwera OpenRouter (HTTP ${status}) — spróbuj „Ponów”${suffix}`;
  if (status) return `Błąd OpenRouter (HTTP ${status})${suffix}`;
  return detail || 'Nieznany błąd OpenRouter.';
}

function resolveFetch(fetchImpl) {
  if (fetchImpl === undefined) {
    return typeof fetch !== 'undefined' ? fetch : null;
  }
  return typeof fetchImpl === 'function' ? fetchImpl : null;
}

/**
 * Fabryka transportu.
 * @param {() => string} getApiKey — klucz API (wołany na każde zapytanie).
 * @param {(modelId: string) => string[]|null} [providerOnlyFor] — przypięcie
 *   modelu do providerów (AI-R3); zwraca allowlistę albo `null` = domyślny
 *   routing. Przypięty model dostaje `provider: { order, only,
 *   allow_fallbacks: false }` (żadnego cichego fallbacku).
 * @param {Function|null} [fetchImpl] — wstrzyknięty fetch; `undefined` =
 *   globalny (przeglądarka), `null` = brak (zgłaszany jako błąd).
 * @param {string} [url] — nadpisanie endpointu (testy).
 * @param {number} [timeoutMs] — timeout; `<= 0` = bez limitu.
 */
export function createOpenRouterTransport({ getApiKey, providerOnlyFor, fetchImpl, url, timeoutMs } = {}) {
  const endpoint = typeof url === 'string' && url ? url : OPENROUTER_CHAT_URL;
  const limit = Number.isFinite(timeoutMs) ? timeoutMs : AI_CLIENT_TIMEOUT_MS;

  return async function openRouterTransport({ prompt, messages, modelId, signal } = {}) {
    const apiKey = typeof getApiKey === 'function' ? String(getApiKey() ?? '').trim() : '';
    if (!apiKey) {
      return { ok: false, error: 'Brak klucza API — wklej go w „Konfiguracji AI” (klucz nie zapisuje się nigdzie poza tą przeglądarką).' };
    }
    const fetchFn = resolveFetch(fetchImpl);
    if (!fetchFn) {
      return { ok: false, error: 'Brak `fetch` w tym środowisku — zapytanie do OpenRouter niemożliwe.' };
    }
    if (signal?.aborted) {
      return { ok: false, error: 'Przerwano zapytanie do AI.' };
    }
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const onAbort = () => ctrl?.abort();
    if (ctrl && typeof signal?.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    let timedOut = false;
    const timer = ctrl && limit > 0
      ? setTimeout(() => { timedOut = true; ctrl.abort(); }, limit)
      : null;
    try {
      // AI-R3: przypięty model = TYLKO wskazany provider (order+only, zero fallbacku).
      const pinned = typeof providerOnlyFor === 'function' ? providerOnlyFor(modelId) : null;
      const allowlist = Array.isArray(pinned) ? pinned.filter((p) => typeof p === 'string' && p) : [];
      // AI-R7: pełna rozmowa jedzie verbatim (role user/assistant na zmianę);
      // brak = dotychczasowy pojedynczy prompt (mocki/stare wołania).
      const chat = Array.isArray(messages) && messages.length > 0 ? messages : null;
      const body = {
        model: modelId,
        messages: chat ?? [{ role: 'user', content: String(prompt ?? '') }],
      };
      if (allowlist.length > 0) {
        body.provider = { order: [...allowlist], only: [...allowlist], allow_fallbacks: false };
      }
      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
      const timeoutError = () => ({
        ok: false,
        error: `Przekroczono czas oczekiwania (${Math.round(limit / 1000)} s, model ${modelId}) — model nie odpowiedział. Użyj „Ponów”.`,
      });
      // AI-R6 (C): abort w trakcie schodzenia ciała odpowiedzi (nagłówki
      // zdążyły przyjść, treść nie) wpadał w parsowanie JSON i wychodził
      // jako „pusta odpowiedź” zamiast timeoutu — stąd mylący błąd przy
      // wolnych providerach (60–90 s). Sprawdzamy przerwanie PO odczycie.
      if (timedOut || ctrl?.signal.aborted) return timeoutError();
      // AI-R6 (B): ciało czytamy jako TEKST i parsujemy sami — żeby błąd
      // JSON i nie-JSON-owe ciała błędów (HTML pośrednika) pokazać
      // DOSŁOWNIE, a nie połykać (`res.json()` nie zostawia surowizny).
      // Fallback na `res.json()` dla starszych stubów w testach.
      let rawText = '';
      let data = null;
      let jsonError = '';
      if (typeof res.text === 'function') {
        try {
          rawText = await res.text();
        } catch (error) {
          rawText = '';
        }
        if (timedOut || ctrl?.signal.aborted) return timeoutError();
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch (error) {
            jsonError = error instanceof Error ? error.message : String(error);
          }
        }
      } else if (typeof res.json === 'function') {
        try {
          data = await res.json();
        } catch (error) {
          jsonError = error instanceof Error ? error.message : String(error);
        }
        if (timedOut || ctrl?.signal.aborted) return timeoutError();
      }
      if (!res.ok) {
        // Nie-JSON-owe ciało błędu (np. HTML pośrednika): dokładna treść
        // zamiast generyka (B) + przyczyna parsowania.
        let message = aiClientErrorText(res.status, data);
        if (jsonError) message += ` (ciało nie jest JSON: ${jsonError})`;
        if (data == null && rawText && jsonError) message += ` Surowo: ${clipDetail(rawText)}`;
        return { ok: false, error: message };
      }
      if (jsonError) {
        const suffix = rawText ? ` Surowo: ${clipDetail(rawText)}` : '';
        return { ok: false, error: `Błąd JSON w odpowiedzi OpenRouter (HTTP 200): ${jsonError}.${suffix}` };
      }
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        // AI-R6 (B/C): „pusta odpowiedź” z DIAGNOZĄ — co faktycznie wróciło
        // (finish_reason, kształt choices, surowe ciało), żeby dało się
        // odróżnić kaprys modelu od ucięcia po drodze.
        const choice = data?.choices?.[0] ?? null;
        const diag = choice && typeof choice === 'object'
          ? `finish_reason: ${choice.finish_reason ?? '(brak)'}`
          : `choices: ${Array.isArray(data?.choices) ? data.choices.length : '(brak tablicy)'}`;
        let rawDump = '';
        try {
          rawDump = data == null ? '(puste ciało)' : clipDetail(JSON.stringify(data));
        } catch {
          rawDump = '(ciała nie da się pokazać)';
        }
        return { ok: false, error: `Model zwrócił pustą odpowiedź (${diag}) — użyj „Ponów” albo zmień model. Surowo: ${rawDump}` };
      }
      return { ok: true, text };
    } catch (error) {
      if (timedOut) {
        return {
          ok: false,
          error: `Przekroczono czas oczekiwania (${Math.round(limit / 1000)} s, model ${modelId}) — model nie odpowiedział. Użyj „Ponów”.`,
        };
      }
      if (ctrl?.signal.aborted || signal?.aborted) {
        return { ok: false, error: 'Przerwano zapytanie do AI.' };
      }
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Błąd sieci przy zapytaniu do OpenRouter: ${msg}` };
    } finally {
      if (timer) clearTimeout(timer);
      if (ctrl && typeof signal?.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    }
  };
}
