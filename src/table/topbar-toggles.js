/**
 * 15f (zlecenie właściciela) — ikonki-toggle górnej belki: dźwięki czarów
 * i tryb wysoko-graficzny (ten drugi: zamiana ptaszka na ikonkę).
 * Moduł CZYSTY (ADR 0011): DOM dostaje wstrzyknięty, testowany na MiniEl.
 *
 * Stan: `aria-pressed` + podmiana SVG w przycisku jadą ZAWSZE razem (jeden
 * `paint`). Preferencje trwają w pamięci strony (poprzednik: pamięć sesji
 * bez localStorage, tor hover M349/A) — domyślnie dźwięki OFF, hi-gfx ON.
 *
 * AI-OpenRouter (Etap-1): trzeci toggle `#ai-toggle` (domyślnie OFF) —
 * ten sam wzorzec (paint/save/callback `onAiChange`, odczyt `aiOn()`).
 */

/** SVG 18px, `currentColor` — wygląd bierze z CSS belki. */
export const TOGGLE_ICONS = {
  sounds: {
    on: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg>',
    off: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  },
  hiGfx: {
    on: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-4.5-4.5L9 18"/></svg>',
    off: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-4.5-4.5L9 18"/><path d="M3 3l18 18"/></svg>',
  },
  ai: {
    on: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
    off: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M3 3l18 18"/></svg>',
  },
};

export const PREFS_KEY = 'mtg-table-prefs-v1';

/** Domyślne (wymóg właściciela): dźwięki OFF, hi-gfx ON, AI OFF. */
export const DEFAULT_PREFS = Object.freeze({ sounds: false, hiGfx: true, ai: false });

/** Odczyt z tolerancją: brak/uszkodzenie pamięci = domyślne. */
export function loadPrefs(storage) {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      sounds: parsed?.sounds ?? DEFAULT_PREFS.sounds,
      hiGfx: parsed?.hiGfx ?? DEFAULT_PREFS.hiGfx,
      ai: parsed?.ai ?? DEFAULT_PREFS.ai,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Podpina oba przyciski (`#sound-toggle`, `#hi-gfx`), maluje stan startowy
 * z pamięci i zwraca żywe odczyty. Klik: odwróć → zapisz → przemaluj →
 * callback (strona podpina tam m.in. `resume()` audio — klik to gest,
 * więc budzi AudioContext zgodnie z polityką autoplay).
 */
export function createTopbarToggles({ document, storage, onSoundsChange, onHiGfxChange, onAiChange }) {
  const soundBtn = document.getElementById('sound-toggle');
  if (!soundBtn) throw new Error('Brak przycisku #sound-toggle w belce');
  const hiGfxBtn = document.getElementById('hi-gfx');
  if (!hiGfxBtn) throw new Error('Brak przycisku #hi-gfx w belce');
  const aiBtn = document.getElementById('ai-toggle');
  if (!aiBtn) throw new Error('Brak przycisku #ai-toggle w belce');
  const prefs = loadPrefs(storage);
  const save = () => {
    try {
      storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* pamięć niedostępna (prywatny tryb) — stan żyje do przeładowania */
    }
  };
  const paint = (btn, icons, on) => {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.innerHTML = on ? icons.on : icons.off;
  };
  const paintAll = () => {
    paint(soundBtn, TOGGLE_ICONS.sounds, prefs.sounds);
    paint(hiGfxBtn, TOGGLE_ICONS.hiGfx, prefs.hiGfx);
    paint(aiBtn, TOGGLE_ICONS.ai, prefs.ai);
  };
  paintAll();
  soundBtn.addEventListener('click', () => {
    prefs.sounds = !prefs.sounds;
    save();
    paintAll();
    if (typeof onSoundsChange === 'function') onSoundsChange(prefs.sounds);
  });
  hiGfxBtn.addEventListener('click', () => {
    prefs.hiGfx = !prefs.hiGfx;
    save();
    paintAll();
    if (typeof onHiGfxChange === 'function') onHiGfxChange(prefs.hiGfx);
  });
  aiBtn.addEventListener('click', () => {
    prefs.ai = !prefs.ai;
    save();
    paintAll();
    if (typeof onAiChange === 'function') onAiChange(prefs.ai);
  });
  return Object.freeze({
    soundsOn: () => prefs.sounds,
    hiGfxOn: () => prefs.hiGfx,
    aiOn: () => prefs.ai,
  });
}
