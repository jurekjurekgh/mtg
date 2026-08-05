/**
 * Wspólny kontrakt gestów tapnięć/kliknięć kafli i warstw (M18 + poprawka
 * dotyku 2026-08-03).
 *
 * Problem z iPadem: iOS nie wysyła `dblclick` dla dotyku, a syntetyczny
 * `click` leci po KAŻDYM tapnięciu. Stary kod rozpoznawał double-tap na
 * `touchend`, ale `click` z drugiego tapnięcia przychodził później i otwierał
 * menu kontekstowe NAD pełnym ekranem — double-tap „zawsze wyglądał jak
 * pojedynczy". Do tego pojedynczy klik nie był odroczony, więc nie było
 * okna, w którym drugie tapnięcie mogłoby wygrać.
 *
 * Rozwiązanie (jeden kontrakt dla myszy i dotyku):
 * - mysz: `click` → onTap, `dblclick` → onDoubleTap (bez zmian);
 * - dotyk: pojedyncze tapnięcie odpala onTap PO oknie 300 ms (żeby drugie
 *   tapnięcie zdążyło je anulować); drugie tapnięcie w oknie → onDoubleTap
 *   natychmiast; syntetyczne `click` po double-tapie jest tłumione.
 *
 * `ignoreClick` (opcjonalny predykat) pozwala odrzucić kliknięcia, które są
 * „odpryskiem" gestu otwierającego — np. warstwa pełnego ekranu pojawia się
 * między `touchend` a `click` drugiego tapnięcia i ten `click` nie może jej
 * od razu zamknąć.
 *
 * `ignoreTouch` (opcjonalny predykat, e → bool) pomija CAŁĄ obróbkę danego
 * `touchend`: konkurencyjna warstwa gestów (installSwipeGesture) może nią
 * oznaczyć, że ruch palca był przesunięciem, nie tapnięciem — inaczej dwa
 * szybkie swipe'y (<300 ms) wyglądałyby jak double-tap i np. zamykałyby
 * pełny ekran w środku karuzeli. Warstwę swipe rejestruj PRZED tap, żeby
 * jej timestamp był świeży na czas touchend warstwy tap.
 */
export function installTapGesture(element, { onTap = null, onDoubleTap = null, ignoreClick = null, ignoreTouch = null } = {}) {
  if (!element) return null;
  let lastTap = 0;           // czas ostatniego tapnięcia (dotyk)
  let tapTimer = null;       // odroczony pojedynczy klik (dotyk)
  let suppressClick = false; // tłumienie kliknięcia po double-tapie
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
      // Swipe na tej samej warstwie: ten touchend nie jest tapnięciem
      // (patrz ignoreTouch w nagłówku) — bez rejestracji czasu tapnięcia.
      if (ignoreTouch && ignoreTouch(e)) return;
      const now = Date.now();
      if (now - lastTap < 300) {
        // Drugie tapnięcie w oknie — pełny ekran/dwuklik. Anulujemy odroczony
        // klik z pierwszego tapnięcia i tłumimy kliknięcie z drugiego.
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        cancelPendingTap();
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 400);
        onDoubleTap();
        lastTap = 0;
        return;
      }
      lastTap = now;
    });
  }
  element.addEventListener('click', () => {
    if (ignoreClick && ignoreClick()) return;
    if (suppressClick) { suppressClick = false; return; }
    if (touchSeen) {
      // Dotyk: odraczamy pojedynczy klik, żeby double-tap mógł go anulować.
      cancelPendingTap();
      tapTimer = setTimeout(fireTap, 320);
      return;
    }
    fireTap();
  });
  return {
    /** Anuluje odroczony pojedynczy klik (np. gdy element znika z DOM). */
    cancel() { cancelPendingTap(); },
  };
}

/**
 * Przesunięcie poziome (swipe) na warstwie dotykowej — np. karuzela kart
 * w pełnoekranowym podglądu (decyzja właściciela 2026-08-05: swipe w lewo
 * = KOLEJNA karta strefy, swipe w prawo = POPRZEDNIA).
 *
 * Gesty rozpoznajemy na touchstart/touchend: przesunięcie wygrywa, gdy
 * pozioma składowa ma co najmniej `threshold` px i wyraźnie dominuje nad
 * pionem (×1.5) — lekki skos palca nie anuluje gestu, a przewijanie pionowe
 * nie jest mylone ze swipe'em. Syntetyczny `click` po touchend odróżnia
 * od swipe'a wywołujący (patrz timestamp zwracany przez onSwipe* /
 * jest-ignorowany predykat warstwy tapów).
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
    /** Zwraca aktualny punkt startowy — do diagnostyki/testów. */
    get tracking() { return tracking; },
  };
}
