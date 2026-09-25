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
 *
 * UWAGA C (zgłoszenie właściciela 2026-09-25b, KRYTYCZNE): press zjadł
 * ptaszka „ta opcja nie przerywa auto-passu". Root cause: `stopPropagation`
 * wiesza się wyłącznie na `click` (patrz `picker.js`), a press aktywuje na
 * `pointerup`, więc wskaźnik startujący w checkboxie/labelu DOBIZAŁ do
 * przycisku i odpalił `play(cmd)` — zamiast tylko zaznaczyć. Naprawa jest
 * GESTEM, nie CSS-em: element może się jawnie wyłączyć z aktywacji pressem
 * marką `data-press-exempt` (stała niżej), a `installPressActivation` pyta o
 * nią cel zdarzenia ZANIM cokolwiek zapamięta (pointerdown), przy release (pointerup)
 * i w ścieżce `click` (także klawiatura: spacja na ptaszku nie ma prawa
 * zagrać opcji). Znacznik nadaje WYWOŁUJĄCY (tu: wiersz ptaszka z
 * `stopRowPropagation` w `picker.js`), więc reguła jest generyczna: każdy
 * węzeł wewnątrz przycisku, który ma przejąć gest, oznacza siebie, a przycisk
 * nic nie wie o rodzinie `.action-ignore`.
 *
 * UWAGA C2 (zgłoszenie właściciela 2026-09-25f — testy C1–C7 z samego dnia
 * przechodziły, a błąd żył w przeglądarce; zmierzone na Chromium 153 na
 * realnych modułach, testy `uwaga-z-gry-C2-*`): cel zdarzenia to NIE to samo
 * co fizyczne miejsce gestu. Dwa zmierzone przypadki:
 *  (1) retarget `setPointerCapture` — press zaczęty na etykiecie opcji
 *      przechwytuje wskaźnik na przycisku, więc `pointerup`/`click` mają
 *      `target = BUTTON` nawet gdy kursor jest nad ptaszkiem;
 *  (2) click na WSPÓLNYM PRZODKU — press zaczęty na ptaszku, zwolnienie poza
 *      wąskim wierszem (mierzony realny CSS: 40×28 px przy ~865 px tekstu)
 *      daje `click` na `button`, który omija `stopPropagation` wiersza.
 * Naprawa: (a) release oceniamy przez `elementFromPoint` (uczciwe trafienie,
 * nie `event.target`) — zwolnienie nad wyspą ZAWSZE przekazujemy wyspie
 * (`hit.click()`), nigdy opcji; (b) press zaczęty na wyspie NIGDY nie
 * aktywuje opcji — nadchodzący click na wspólnym przodku połykamy
 * (`handled`), a ślizg ≤ `slopPx` w stronę opcji wraca na wyspę.
 */
export const PRESS_SLOP_PX = 12;

/** Marka wyłączenia z aktywacji pressem (patrzy na nią `isPressExemptTarget`). */
export const PRESS_EXEMPT_ATTRIBUTE = 'data-press-exempt';

/** Znacznik dla wywołującego: ten węzeł (i jego dzieci) nie obsługuje pressu. */
export function markPressExempt(element) {
  if (element?.setAttribute) element.setAttribute(PRESS_EXEMPT_ATTRIBUTE, '1');
  return element;
}

/**
 * Czy cel zdarzenia siedzi w wyspie wyłączonej z pressu? Czysta funkcja na
 * jedynym, czego potrzebuje (odporność: stuby DOM bez `closest`, zdarzenia
 * bez `target` — wtedy NIE wyłączamy, bo zgubiona aktywacja przycisku to
 * większa szkoda niż nadmiarowy gest, L24).
 */
export function isPressExemptTarget(target) {
  const node = target?.closest ? target : (target?.element ?? null);
  if (!node || typeof node.closest !== 'function') return false;
  try {
    return Boolean(node.closest(`[${PRESS_EXEMPT_ATTRIBUTE}]`));
  } catch {
    return false;
  }
}

/**
 * Uczciwe trafienie gestu: przy aktywnym `setPointerCapture` `event.target`
 * KŁAMIE (wskazuje element przechwytujący), a fizyczne miejsce zwolnienia to
 * element POD kursorem — jedyne źródło prawdy w przeglądarce to
 * `elementFromPoint`. Poza przeglądarką (stuby bez pomiaru) zostaje
 * `event.target` — dotychczasowa semantyka (L24: brak oceny = nie tłumimy).
 */
function honestHitTarget(event, element) {
  const doc = element?.ownerDocument
    ?? (typeof globalThis !== 'undefined' ? globalThis.document : null);
  if (event?.clientX != null && event?.clientY != null
    && typeof doc?.elementFromPoint === 'function') {
    try {
      const hit = doc.elementFromPoint(event.clientX, event.clientY);
      if (hit) return hit;
    } catch { /* brak pomiaru — cofamy się do targetu */ }
  }
  return event?.target ?? element;
}

/**
 * Przekazuje tap wyspie: programatyczny klik w WĘZEŁ WYSPY (najblipszy
 * `data-press-exempt` od miejsca gestu), żeby natywne zachowanie —
 * przełączenie checkboxa, aktywacja `label`, −/+ steppera — wykonało się tam,
 * gdzie użytkownik fizycznie zwolnił. Stuby bez `click()` przechodzą ciszą
 * (kontrakt C5: liczy się brak aktywacji przycisku).
 */
function forwardTapToIsland(node) {
  let island = node;
  if (typeof node?.closest === 'function') {
    try { island = node.closest(`[${PRESS_EXEMPT_ATTRIBUTE}]`) ?? node; } catch { island = node; }
  }
  try { island?.click?.(); } catch { /* brak natywnego click() */ }
}

export function installPressActivation(element, activate, { slopPx = PRESS_SLOP_PX } = {}) {
  if (!element || typeof activate !== 'function') return null;
  let start = null;
  let handled = false;
  /** Press zaczęty NA wyspie: {x, y, node} albo null — nigdy nie gra opcji (UWAGA C2). */
  let islandStart = null;
  element.addEventListener('pointerdown', (event) => {
    if ((event?.button ?? 0) > 0) return; // prawy/środkowy przycisk myszy
    // UWAGA C/C2: press startujący w wyspie `data-press-exempt` (ptaszek
    // wyciszenia) nie wchodzi w gest aktywacji — kasujemy też `start`:
    // leżący press z innego miejsca nie może doliczyć się do zwolnienia nad
    // wyspą (podwójne przełączenie: nasze przekazanie + natywne click).
    if (isPressExemptTarget(event?.target)) {
      islandStart = { x: event?.clientX ?? 0, y: event?.clientY ?? 0, node: event?.target ?? null };
      start = null;
      return;
    }
    islandStart = null;
    handled = false;
    start = { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
    // Bez tego release po przebudowie layoutu trafia w INNY węzeł i click nie
    // powstaje. Capture może rzucić (wskaźnik już nieaktywny) — wtedy zostaje
    // ścieżka natywnego clicka niżej.
    if (typeof element.setPointerCapture === 'function' && event?.pointerId != null) {
      try { element.setPointerCapture(event.pointerId); } catch { /* bez capture */ }
    }
  });
  element.addEventListener('pointercancel', () => { start = null; islandStart = null; });
  element.addEventListener('pointerup', (event) => {
    const hit = honestHitTarget(event, element);
    if (islandStart) {
      // UWAGA C2 (2): press zaczął się NA ptaszku, a zwolnienie wypadło poza
      // wąskim wierszem — przeglądarka generuje `click` na wspólnym przodku
      // (= ten przycisk), co omija `stopPropagation` wiersza. Nigdy nie
      // grajmy: połykamy ten click (`handled`), a tap w granicach slop
      // przekazujemy wyspie, żeby wycelowane zaznaczenie doszło do skutku.
      const ruch = Math.hypot((event?.clientX ?? 0) - islandStart.x, (event?.clientY ?? 0) - islandStart.y);
      const node = islandStart.node;
      islandStart = null;
      if (isPressExemptTarget(hit)) {
        // Zwolnienie wciąż na wyspie: natywny click trafi w input/label
        // i przełączy — bez naszej ingerencji.
        handled = false;
        return;
      }
      const wPrzycisku = typeof element.contains === 'function' ? element.contains(hit) : true;
      // Poza przyciskiem click powstanie nad nim — nie nasza ścieżka.
      if (!wPrzycisku) { handled = false; return; }
      handled = true;
      if (ruch <= slopPx) forwardTapToIsland(node);
      return;
    }
    if (!start) return;
    const { x, y } = start;
    start = null;
    if (isPressExemptTarget(hit)) {
      // UWAGA C2 (1): zwolnienie FIZYCZNIE nad wyspą, choć `event.target`
      // przez `setPointerCapture` wskazuje przechwytujący przycisk. Nie
      // grajmy; click z capture i tak trafi w przycisk — połykamy (`handled`).
      // Zwolnienie nad polem = zawsze interakcja wyspy (bez progu slop):
      // użytkownik zwolnił NA ptaszku, więc ptaszek się zaznacza. Scroll na
      // dotyku kończy się `pointercancel` i tu nie dociera.
      handled = true;
      forwardTapToIsland(hit);
      return;
    }
    const ruch = Math.hypot((event?.clientX ?? 0) - x, (event?.clientY ?? 0) - y);
    if (ruch > slopPx) return; // przesunięcie = gest (scroll/swipe), nie klik
    handled = true;
    activate();
  });
  element.addEventListener('click', (event) => {
    // UWAGA C: ta sama wyspa zamyka ścieżkę `click` — w tym klawiaturę
    // (spacja/enter na ptaszku: `detail === 0`), gdzie press w ogóle nie
    // startował. Bez tego znacznika zaznaczenie opcji kosztowałoby jej zagranie.
    if (isPressExemptTarget(event?.target ?? element)) { handled = false; return; }
    if (event?.detail === 0) { handled = false; activate(); return; } // klawiatura
    if (handled) { handled = false; return; } // pointerup już aktywował albo zwolnienie nad wyspą
    activate();
  });
  return { release() { start = null; islandStart = null; } };
}
