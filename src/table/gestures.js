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
 */
export function installTapGesture(element, { onTap = null, onDoubleTap = null, ignoreClick = null } = {}) {
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
