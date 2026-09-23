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
 * `ignoreClick` pozwala odrzucić kliknięcia (i dwukliki) „odpryskowe” po
 * otwarciu pełnego ekranu, `ignoreTouch` pomija touchend będący swipe'em
 * albo odpryskiem gestu otwierającego (okno po otwarciu warstwy).
 *
 * Poprawka 2026-08-06 (zgłoszenie właściciela z iPhone'a „swipe = tap"):
 * `touchstart` zapisuje współrzędne palca, `touchmove` z ruchem > 10 px
 * albo `touchcancel` (iOS przejmuje gest — scroll) oznaczają `moved`:
 * kasują wiszący timer pojedynczego tapa i `lastTap`, a `touchend` takiego
 * gestu wychodzi bez uzbrajania timera i bez liczenia do lastTap — swipe
 * zakończony na kaflu nie otwiera już menu jak single-tap.
 *
 * Poprawka 2026-08-06 (zgłoszenie „double-tap nigdy nie działa"): stan gestu
 * (`lastTap`, `tapTimer`) NIE może mieszkać w domknięciu per-element, bo
 * `renderTableView` czyści strefy i odbudowuje kafle przy każdym rerenderze —
 * drugie tapnięcie trafiałoby na nowy węzeł z pustym stanem i było liczone
 * jako pierwsze. Z opcjonalnym `stateKey` (objectId karty) stan jest
 * współdzielony przez wszystkie wcielenia tego samego kafla (modułowa mapa
 * `tapStates`); dodatkowo timer single-tapa sprawdza przed odpaleniem
 * `element.isConnected` — timer po przebudowie z odłączonym węzłem nie
 * strzela (koniec „duchów tapnięć").
 */
const tapStates = new Map();

export function installTapGesture(element, { stateKey = null, onTap = null, onDoubleTap = null, ignoreClick = null, ignoreTouch = null } = {}) {
  if (!element) return null;
  const DOUBLE_TAP_WINDOW = 400;
  const SINGLE_TAP_DELAY = 420;
  const SLOP_PX = 10;
  // Stan gestu: bez stateKey — per element (stałe warstwy, np. pełny ekran);
  // ze stateKey — wspólny dla wszystkich wcieleń obiektu gry (kafle, kafle
  // stosu) — double-tap przeżywa przebudowę DOM między tapnięciami.
  const state = stateKey != null
    ? (tapStates.get(stateKey) ?? (tapStates.set(stateKey, { lastTap: 0, tapTimer: null }), tapStates.get(stateKey)))
    : { lastTap: 0, tapTimer: null };
  let suppressClick = false;
  let touchSeen = false;
  let startX = 0;
  let startY = 0;
  let moved = false;
  const cancelPendingTap = () => {
    if (state.tapTimer) {
      clearTimeout(state.tapTimer);
      state.tapTimer = null;
    }
  };
  const fireTap = () => {
    state.tapTimer = null;
    if (stateKey != null) tapStates.delete(stateKey);
    // Duch po przebudowie DOM: węzeł, na którym siedział timer, został
    // zastąpiony nowym — nie strzelamy (zgłoszenie „duchy tapnięć").
    if (element.isConnected === false) return;
    if (onTap) onTap();
  };
  // Śledzenie ruchu palca: ponad 10 px to swipe/scroll, nie tap. Handlery
  // są pasywne — nie blokują przewijania stołu, gdy gest zaczyna się na kaflu.
  element.addEventListener('touchstart', (e) => {
    const touch = e?.touches?.[0] ?? e?.changedTouches?.[0];
    startX = touch?.clientX ?? 0;
    startY = touch?.clientY ?? 0;
    moved = false;
    // Nowy dotyk = poprzedni gest już się zakończył (jego syntetyczny click
    // został dostarczony lub porzucony) — okno tłumienia nie sięga dalej.
    suppressClick = false;
  }, { passive: true });
  element.addEventListener('touchmove', (e) => {
    if (moved) return;
    const touch = e?.touches?.[0] ?? e?.changedTouches?.[0];
    if (!touch) return;
    if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > SLOP_PX) {
      moved = true;
      cancelPendingTap();
      state.lastTap = 0;
    }
  }, { passive: true });
  element.addEventListener('touchcancel', () => {
    // iOS przejął gest (scroll) — touchend może nie nadejść wcale: wiszący
    // timer single-tapa musi zostać anulowany, inaczej menu strzeli „z ducha".
    moved = true;
    cancelPendingTap();
    state.lastTap = 0;
    suppressClick = false;
  });
  if (onDoubleTap) {
    element.addEventListener('dblclick', (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      // „Odprysk” gestu otwierającego też przez mysz: dwuklik, który OTWORZYŁ
      // warstwę (np. pełny ekran z karty bez akcji), dociera jako dblclick
      // już do jej tła — bez bramki warstwa zamknęłaby się w ułamku sekundy
      // po otwarciu. Ta sama reguła co dla `click` (okno `ignoreClick`).
      if (ignoreClick && ignoreClick()) { cancelPendingTap(); return; }
      cancelPendingTap();
      onDoubleTap();
    });
  }
  element.addEventListener('touchend', (e) => {
    touchSeen = true;
    if (ignoreTouch && ignoreTouch(e)) return;
    // `moved` dotyczy WYŁĄCZNIE bieżącego gestu — kolejny touchend (nowy
    // gest bez touchstart na tym węźle) nie może odziedziczyć cudzego swipe'a.
    const wasMoved = moved;
    moved = false;
    if (wasMoved) {
      // Swipe zakończony na kaflu: to NIE jest tap — nie uzbrajamy timera
      // i nie liczymy do `lastTap`. Ewentualny syntetyczny click po swipe
      // (iOS zwykle go nie wysyła po ruchu) jest tłumiony.
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 500);
      return;
    }
    if (!onDoubleTap) return; // bez dyskryminacji double-tapa decyduje click
    const now = Date.now();
    if (now - state.lastTap < DOUBLE_TAP_WINDOW) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      cancelPendingTap();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 500);
      onDoubleTap();
      state.lastTap = 0;
      return;
    }
    state.lastTap = now;
    cancelPendingTap();
    state.tapTimer = setTimeout(fireTap, SINGLE_TAP_DELAY);
  });
  element.addEventListener('click', () => {
    if (ignoreClick && ignoreClick()) return;
    if (suppressClick) { suppressClick = false; return; }
    if (touchSeen) {
      if (onDoubleTap) return;
      cancelPendingTap();
      state.tapTimer = setTimeout(fireTap, SINGLE_TAP_DELAY);
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

/**
 * K (uwaga właściciela 2026-09-23): aktywacja OPCJI AKCJI odporna na
 * przebudowę layoutu między press-down a release.
 *
 * Zgłoszenie: „klik w »Wybierz: deklaracja blokujących« czasem nie działa —
 * press-down przebudowuje layout i release mija przycisk”. Przy natywnym
 * `click` aktywacja wymaga, by press i release trafiły w TEN SAM węzeł: gdy
 * w trakcie wciśnięcia lista akcji zmieni układ (pasek przewijania zwęża
 * kolumnę opisu, długa etykieta łamie się inaczej, węzeł jest odbudowany przy
 * rerenderze), release ląduje gdzie indziej i `click` nie powstaje WCALE.
 *
 * Kontrakt: wciśnięcie PRZECHWYTUJE wskaźnik na elemencie opcji
 * (`setPointerCapture`), więc release zawsze wraca do opcji, która była
 * wciśnięta; aktywacja następuje, gdy palec/kursor nie odjechał dalej niż
 * `slopPx` (gest przewijania rodzi `pointercancel` albo przekracza próg, więc
 * nie aktywuje). Klawiatura (Enter/Spacja) idzie ścieżką `click` z
 * `detail === 0` — działa jak dotąd.
 */
export const PRESS_SLOP_PX = 12;

export function installPressActivation(element, activate, { slopPx = PRESS_SLOP_PX } = {}) {
  if (!element || typeof activate !== 'function') return null;
  let start = null;
  let handled = false;
  element.addEventListener('pointerdown', (event) => {
    if ((event?.button ?? 0) > 0) return; // prawy/środkowy przycisk myszy
    handled = false;
    start = { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
    // Bez tego release po przebudowie layoutu trafia w INNY węzeł i click nie
    // powstaje. Capture może rzucić (wskaźnik już nieaktywny) — wtedy zostaje
    // ścieżka natywnego clicka niżej.
    if (typeof element.setPointerCapture === 'function' && event?.pointerId != null) {
      try { element.setPointerCapture(event.pointerId); } catch { /* bez capture */ }
    }
  });
  element.addEventListener('pointercancel', () => { start = null; });
  element.addEventListener('pointerup', (event) => {
    if (!start) return;
    const { x, y } = start;
    start = null;
    const ruch = Math.hypot((event?.clientX ?? 0) - x, (event?.clientY ?? 0) - y);
    if (ruch > slopPx) return; // przesunięcie = gest (scroll/swipe), nie klik
    handled = true;
    activate();
  });
  element.addEventListener('click', (event) => {
    if (event?.detail === 0) { handled = false; activate(); return; } // klawiatura
    if (handled) { handled = false; return; } // pointerup już aktywował
    activate();
  });
  return { release() { start = null; } };
}
