/**
 * AI-OpenRouter (Etap-1): konfiguracja AI stołu.
 *
 * Moduł CZYSTY (ADR 0011): pamięć wstrzykiwana, zero DOM-u, zero sieci.
 * Klucz API, modele lokalne i URL AppScriptu żyją TYLKO w localStorage
 * (klucz `mtg-table-ai-v1`) — w repo/bundle nie ma żadnych sekretów
 * (wniosek z AUDIT_LEGACY_APP: klucz w kodzie klienta był wadą).
 *
 * Uwaga Safari/ITP: localStorage może zostać wyczyszczone po ~7 dniach —
 * wtedy konfigurację wpisuje się ponownie (kategoria: jawnie ulotna,
 * odtwarzalna — NIE stan kreatora spod ADR 0012).
 */

/** Predefiniowana lista modeli (same id; decyzja właściciela: bez `name`). */
export const AI_MODELS = Object.freeze([
  'stealth/space-bunny-alpha',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'inclusionai/ling-3.0-flash-fin:free',
  'poolside/laguna-s-2.1:free',
  'dots-studio/dots-3-note-preview:free',
  'thinkingmachines/inkling:free',
  'google/gemini-3.8-flash:floor',
  'google/gemini-3.7-flash:floor',
  'google/gemini-3.6-flash:floor',
  'google/gemini-3.5-flash:floor',
  'google/gemini-3-flash-preview:floor',
  'google/gemini-2.5-flash:floor',
  'google/gemini-3.5-flash-lite:floor',
  'google/gemini-3.1-flash-lite:floor',
  'google/gemini-2.5-flash-lite:floor',
  // AI-R3 (prośba właściciela): modele z PRZYPIĘTYM providerem (patrz
  // AI_PROVIDER_ONLY) — odpytują TYLKO wskazany endpoint.
  'deepseek/deepseek-v4-pro-0813',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v4-flash-0731',
  'z-ai/glm-5.3-flash',
  'meta/muse-spark-1.3-contributor',
]);

/**
 * Przypięcie modeli do konkretnych providerów OpenRouter (sluge jak na
 * stronie modelu, z wariantem po `/` gdy podany). Klient wysyła wtedy
 * `provider: { order, only, allow_fallbacks: false }` — zapytanie idzie
 * TYLKO tam, bez cichego fallbacku na innych providerów. Modele spoza
 * mapy (i dopisane ręcznie) jadą domyślnym routingiem OpenRoutera.
 */
export const AI_PROVIDER_ONLY = Object.freeze({
  'deepseek/deepseek-v4-pro-0813': Object.freeze(['baidu/fp8']),
  'deepseek/deepseek-v4.1-flash': Object.freeze(['inference-net']),
  'deepseek/deepseek-v4-flash-0731': Object.freeze(['streamlake/fp8']),
  'z-ai/glm-5.3-flash': Object.freeze(['inference-net']),
  'meta/muse-spark-1.3-contributor': Object.freeze(['meta']),
});

/** Tryby AI (rejestr — nowe tryby dopisują wpis, reszta jedzie sama). */
export const AI_MODES = Object.freeze([
  Object.freeze({ id: 'lore-bot', label: 'Lore komentarzy Bota', tabName: 'lore-bot' }),
  Object.freeze({ id: 'player-bot', label: 'Komentarze Bota-gracza', tabName: 'player-bot' }),
  Object.freeze({ id: 'observer', label: 'Zewnętrzny obserwator', tabName: 'observer' }),
  Object.freeze({ id: 'lore-observer', label: 'Komentarze lore obserwatora', tabName: 'lore-observer' }),
  Object.freeze({ id: 'skit', label: 'Skity', tabName: 'skit' }),
]);

export const AI_STORAGE_KEY = 'mtg-table-ai-v1';

/**
 * Etykieta modelu do selecta: część po `/`, bez sufiksu `:…`.
 * `google/gemini-3.5-flash:floor` → `gemini-3.5-flash`.
 */
export function aiModelLabel(id) {
  const afterSlash = String(id ?? '').split('/').pop() ?? '';
  return afterSlash.split(':')[0] || String(id ?? '');
}

/**
 * Przypięci providerzy modelu (`AI_PROVIDER_ONLY`) albo `null` = domyślny
 * routing OpenRoutera. Zwraca KOPIĘ tablicy (mapa jest zamrożona).
 */
export function aiProviderOnly(modelId) {
  const pinned = AI_PROVIDER_ONLY[String(modelId ?? '')];
  return Array.isArray(pinned) ? [...pinned] : null;
}

/** Pełna lista wyboru = predefiniowane + lokalne (bez duplikatów). */
export function aiAllModels(customModels) {
  const seen = new Set();
  const out = [];
  for (const id of [...AI_MODELS, ...(customModels ?? [])]) {
    const clean = String(id ?? '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function aiDefaultConfig() {
  return { apiKey: '', modelId: AI_MODELS[0], customModels: [], mode: AI_MODES[0].id, appScriptUrl: '' };
}

/** Odczyt z tolerancją: brak/uszkodzenie pamięci = domyślne. */
export function loadAiConfig(storage) {
  const fallback = aiDefaultConfig();
  try {
    const raw = storage?.getItem(AI_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const customModels = Array.isArray(parsed.customModels)
      ? parsed.customModels.map((m) => String(m ?? '').trim()).filter(Boolean)
      : [];
    const all = aiAllModels(customModels);
    const modelId = all.includes(parsed.modelId) ? parsed.modelId : AI_MODELS[0];
    const mode = AI_MODES.some((m) => m.id === parsed.mode) ? parsed.mode : AI_MODES[0].id;
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      modelId,
      customModels,
      mode,
      appScriptUrl: typeof parsed.appScriptUrl === 'string' ? parsed.appScriptUrl.trim() : '',
    };
  } catch {
    return fallback;
  }
}

/** Zapis całości (wywoływany przy każdej zmianie pola w panelu). */
export function saveAiConfig(storage, config) {
  try {
    storage?.setItem(AI_STORAGE_KEY, JSON.stringify({
      apiKey: config?.apiKey ?? '',
      modelId: config?.modelId ?? AI_MODELS[0],
      customModels: config?.customModels ?? [],
      mode: config?.mode ?? AI_MODES[0].id,
      appScriptUrl: config?.appScriptUrl ?? '',
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Miękka walidacja klucza: pusty = brak; bez prefiksu `sk-or-` = podejrzany
 * (ostrzeżenie, nie blokada — format kluczy może się zmienić).
 */
export function aiKeyStatus(apiKey) {
  const key = String(apiKey ?? '').trim();
  if (!key) return 'missing';
  return key.startsWith('sk-or-') ? 'ok' : 'suspicious';
}
