/**
 * M254/C (zgłoszenie właściciela) — kolejka warstwy wysoko-graficznej
 * (FOT / KON / Scryfall pokazywane przy rzuceniu czaru).
 *
 * **Problem.** Warstwa otwierała się w trakcie pętli `advance()` sesji, która
 * w jednej komendzie rozgrywa nieraz kilka rzutów (człowiek → bot → następna
 * tura). Każdy kolejny rzut nadpisywał warstwę, więc gracz widział wyłącznie
 * OSTATNI: „Rzuciłem czar, a akcja poszła dalej i zaczęła się następna tura i
 * nieprzyjaciel rzucił czar i pokazał się ekran z grafikami tego ostatniego
 * czaru nieprzyjaciela, a mojego w ogóle nie było pokazanego."
 *
 * **Rozwiązanie.** Rozdzielamy dwa fakty, które wcześniej były jednym:
 * „rzut się zdarzył" (dokładamy do kolejki) i „warstwa jest wolna" (otwieramy).
 * Zamknięcie warstwy otwiera następny rzut; dopiero pusta kolejka wznawia grę
 * (`session.continueArtPlay()`). Pauzę zgłasza obserwator `onCast` (zwraca
 * `true`), a sesja zatrzymuje `advance()` po bieżącej komendzie.
 *
 * Moduł jest CZYSTY — bez DOM-u i bez sesji. Właścicielem warstwy jest
 * `src/table/main.js`, który podaje `isOpen` i `open` (ADR 0011: testy core
 * działają headless).
 */

/**
 * @param {object} deps
 * @param {() => boolean} deps.isOpen czy warstwa jest teraz widoczna
 * @param {(entry: object) => boolean} deps.open pokaż pozycję; `false` = karta
 *   bez ilustracji (odrzucamy i bierzemy następną z kolejki)
 */
export function createArtShowcaseQueue({ isOpen, open }) {
  if (typeof isOpen !== 'function' || typeof open !== 'function') {
    throw new TypeError('Kolejka wymaga funkcji isOpen i open');
  }
  /** @type {object[]} rzuty czekające na pokazanie (FIFO). */
  const queue = [];
  return Object.freeze({
    /**
     * Dokłada rzut. Zwraca 'opened' (pokazany od razu) albo 'queued'
     * (czeka — warstwa zajęta). Oba wyniki znaczą „GRA MA STANĄĆ".
     */
    push(entry) {
      queue.push(entry);
      if (isOpen()) return 'queued';
      return this.next() ? 'opened' : 'queued';
    },
    /** Otwiera kolejny rzut z kolejki. `true` = warstwa znów jest zajęta. */
    next() {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (open(entry)) return true;
      }
      return false;
    },
    /** Ile rzutów jeszcze czeka (do logów i testów). */
    get pending() { return queue.length; },
  });
}
