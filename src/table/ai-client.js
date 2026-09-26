/**
 * AI-OpenRouter (Etap-2): prawdziwy transport do OpenRouter.
 *
 * Kontrakt transportu (jak w `ai-queue.js`):
 *   transport({ prompt, modelId, meta, signal }) -> { ok, text?, error? }
 *
 * Zasady (plan §1): `fetch` wstrzykiwany (testy bez sieci), timeout 60 s
 * przez `AbortController`, głębokie parsowanie błędów (wzorzec z apki
 * referencyjnej: `error.metadata.raw`). Klucz NIE jest tu przechowywany —
 * `getApiKey()` wołane przy KAŻDYM zapytaniu, więc wklejenie klucza
 * naprawia „Ponów” bez przeładowania (live setup jak w Etapie-1).
 */

/** Endpoint czatu OpenRouter (ten sam, co w apce referencyjnej). */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Domyślny timeout zapytania (plan §1: 60 s; darmowe modele wolno startują). */
export const AI_CLIENT_TIMEOUT_MS = 60_000;

/**
 * Splaszcza „głęboki” błąd OpenRouter do czytelnego tekstu.
 * Kształty na wolności: `{ error: { message, metadata: { raw } } }`,
 * `{ error: 'tekst' }`, `{ message }`, czasem sam string.
 */
/** Obcięcie detalu błędu, żeby odpowiedź serwera nie zalała panelu. */
function clipDetail(text) {
  const s = String(text ?? '').trim();
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
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
 * @param {Function|null} [fetchImpl] — wstrzyknięty fetch; `undefined` =
 *   globalny (przeglądarka), `null` = brak (zgłaszany jako błąd).
 * @param {string} [url] — nadpisanie endpointu (testy).
 * @param {number} [timeoutMs] — timeout; `<= 0` = bez limitu.
 */
export function createOpenRouterTransport({ getApiKey, fetchImpl, url, timeoutMs } = {}) {
  const endpoint = typeof url === 'string' && url ? url : OPENROUTER_CHAT_URL;
  const limit = Number.isFinite(timeoutMs) ? timeoutMs : AI_CLIENT_TIMEOUT_MS;

  return async function openRouterTransport({ prompt, modelId, signal } = {}) {
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
      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: String(prompt ?? '') }] }),
        ...(ctrl ? { signal: ctrl.signal } : {}),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        return { ok: false, error: aiClientErrorText(res.status, data) };
      }
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        return { ok: false, error: 'Model zwrócił pustą odpowiedź — użyj „Ponów” albo zmień model.' };
      }
      return { ok: true, text };
    } catch (error) {
      if (timedOut) {
        return { ok: false, error: `Przekroczono czas oczekiwania (${Math.round(limit / 1000)} s) — model nie odpowiedział. Użyj „Ponów”.` };
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
