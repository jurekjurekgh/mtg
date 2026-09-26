/**
 * AI-OpenRouter (Etap-1): transport atrapa (?ai-mock=1).
 *
 * Udaje model z opóźnieniem — do weryfikacji kolejki/panelu/triggera
 * BEZ klucza i sieci. Flagi w query stringu (parsuje main.js):
 *   ?ai-mock=1          — sukces po `delayMs`,
 *   ?ai-mock=error      — zawsze błąd (ścieżka błędu + „ponów"),
 *   ?ai-mock-delay=3000 — własne opóźnienie w ms.
 * Zero śladów w UI (flaga niewidoczna); w kodzie tylko ten moduł.
 */
export function createMockTransport({ delayMs = 800, alwaysFail = false } = {}) {
  const delay = Math.max(0, Number(delayMs) || 0);
  return async ({ prompt, modelId, signal } = {}) => {
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
    if (signal?.aborted) return { ok: false, text: '', error: 'przerwano' };
    if (alwaysFail) return { ok: false, text: '', error: 'mock: wymuszony błąd (?ai-mock=error)' };
    const size = String(prompt ?? '').length;
    return {
      ok: true,
      text: `[MOCK ${modelId || '?'}] Komentarz lore stand-in (prompt ${size} znaków). Prawdziwy model od Etapu-2.`,
      error: '',
    };
  };
}

/** Parsuje flagi mocka z `location.search` (pusty obiekt = brak mocka). */
export function parseMockFlags(search) {
  const out = { enabled: false, alwaysFail: false, delayMs: 800 };
  try {
    const params = new URLSearchParams(String(search ?? ''));
    if (!params.has('ai-mock')) return out;
    out.enabled = true;
    out.alwaysFail = params.get('ai-mock') === 'error';
    const delay = Number.parseInt(params.get('ai-mock-delay') ?? '', 10);
    if (Number.isInteger(delay) && delay >= 0) out.delayMs = delay;
  } catch {
    /* brak URLSearchParams (stare stuby) = brak mocka */
  }
  return out;
}
