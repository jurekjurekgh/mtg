/**
 * Wspólny kontrakt gestów tapnięć/kliknięć kafli i warstw (M18 + poprawki
 * dotyku 2026-08-03 oraz 2026-08-05 – podwójny tap na karcie w ręce).
 *
 * Problem z iPadem: iOS nie wysyła `dblclick` dla dotyku, a syntetyczny
 * `click` leci po KAŻDYM tapnięciu. Stary kod rozpoznawał double-tap na
 * `touchend`, ale `click` z drugiego tapnięcia przychodził później i otwierał
 * menu kontekstowe NAD pełnym ekranem — double-tap „zawsze wyglądał jak
 * pojedynczy\". Do tego pojedynczy klik nie był odroczony, więc nie było
 * okna, w którym drugie tapnięcie mogłoby wygrać.
 *
 * Rozwiązanie (jeden kontrakt dla myszy i dotyku):
 * - mysz: `click` → onTap, `dblclick` → onDoubleTap (bez zmian);
 * - dotyk: pojedyncze tapnięcie odpala onTap PO oknie 400 ms (żeby drugie
 *   tapnięcie zdążyło je anulować); drugie tapnięcie w oknie → onDoubleTap
 *   natychmiast; syntetyczne `click` po double-tapie jest tłumione.
 *   Poprawka 2026-08-05: timer single-tapa startuje OD RAZU z touchend,
 *   nie z click – dzięki temu double-tap w ręce (karta z akcją) zawsze
 *   wygrywa z menu kontekstowym, a nie tylko przy bardzo szybkich tapach.
 *
 * `ignoreClick` pozwala odrzucić kliknięcia „odpryskowe\" po otwarciu
 * pełnego ekranu, `ignoreTouch` pomija touchend będący swipe'em.
 */
export function installTapGesture(element, { onTap = null, onDoubleTap = null, ignoreClick = null, ignoreTouch = null } = {}) {
  if (!element) return null;
  const DOUBLE_TAP_WINDOW = 400;
  const SINGLE_TAP_DELAY = 420;
  let lastTap = 0;
  let tapTimer = null;
  let suppressClick = false;
  let touchSeen = false;
  const cancelPendingTap = () => {
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }
  };
  const fireTap = () => {
    tapTimer = null;
    if (onTap) onTap();
  };
  if (onDoubleTap) {
    element.addEventListener('dblclick', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      cancelPendingTap();
      onDoubleTap();
    });
    element.addEventListener('touchend', (e) => {
      touchSeen = true;
      if (ignoreTouch && ignoreTouch(e)) return;
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_WINDOW) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        cancelPendingTap();
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 500);
        onDoubleTap();
        lastTap = 0;
        return;
      }
      lastTap = now;
      cancelPendingTap();
      tapTimer = setTimeout(fireTap, SINGLE_TAP_DELAY);
    });
  }
  element.addEventListener('click', () => {
    if (ignoreClick && ignoreClick()) return;
    if (suppressClick) { suppressClick = false; return; }
    if (touchSeen) {
      if (onDoubleTap) return;
      cancelPendingTap();
      tapTimer = setTimeout(fireTap, SINGLE_TAP_DELAY);
      return;
    }
    fireTap();
  });
  return {
    cancel() { cancelPendingTap(); },
  };
}

/**
 * Przesunięcie poziome (swipe) na warstwie dotykowej — np. karuzela kart
 * w pełnoekranowym podglądu (decyzja właściciela 2026-08-05: swipe w lewo
 * = KOLEJNA karta strefy, swipe w prawo = POPRZEDNIA).
 */
export function installSwipeGesture(element, { onSwipeLeft = null, onSwipeRight = null, threshold = 48 } = {}) {
  if (!element) return null;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  element.addEventListener('touchstart', (e) => {
    const touch = e?.changedTouches?.[0];
    if (!touch) return;
    tracking = true;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  element.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
  element.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const touch = e?.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (dx < 0) { if (onSwipeLeft) onSwipeLeft(); }
    else if (onSwipeRight) onSwipeRight();
  });
  return {
    get tracking() { return tracking; },
  };
}
