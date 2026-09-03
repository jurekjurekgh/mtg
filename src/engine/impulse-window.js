/**
 * Okno impulsu — jedno miejsce prawdy o polach `playableUntilTurn` i
 * `playableWithoutPaying` (audyt PR #93, tura 3, wątek 4 z HANDOFF).
 *
 * Mechanika (Batch 46/47, CR 601.2b i 701.51b): efekt wygnania kładzie kartę
 * do exile ze STEMPLEM „graj ją do końca tury N" (`playableUntilTurn`), a
 * czasem dodatkowo z flagą „bez płacenia kosztu many" (`playableWithoutPaying`).
 * Do tego jedna kopia karty (permanent na stosie) dziedziczy oba pola.
 *
 * Przed tym modułem regułę przepisywano ręcznie w siedemnastu miejscach:
 *  - SIEDEM zapisów w dwóch plikach: `effects.js` (lokalna liczba + stempel na
 *    obiekcie + payload zdarzenia `object_exiled` + dwie klejone flagi „bez
 *    płacenia") i `game-state.js` (dwa niezależne `if`-y przenoszące pola na
 *    obiekt stosu). Dwa sposoby sklejania tej samej pary — wystarczy zgubić
 *    jeden `if`, żeby rzut stracił zwolnienie z kosztu,
 *  - TRZYNAŚCIE odczytów w czterech plikach: `spells.js` ×7, `resources.js` ×2,
 *    `game-state.js` ×2, `render.js` ×2. Siedem wersji warunku „okno żyje"
 *    (`playableUntilTurn != null && state.turn.number <= playableUntilTurn`) i
 *    sześć wersji „rzut darmowy" (`zone === 'exile' && playableWithoutPaying`).
 * Żadna z nich nie musiała się zgadzać; rozjazd oferty i walidacji to klasyka
 * L48, a rozjazd warunku w jedną stronę = okno, które przeżywa swoją turę albo
 * umiera za wcześnie. Stąd choke point: jedyny pisarz tych pól, jedna para
 * czytaczy.
 *
 * Moduł nie zna żadnych kart (ADR 0002) i niczego nie importuje — pola są
 * stemplami na obiekcie, a nie nazwami mechanik.
 */

/** Stempel okna jako gotowy fragment obiektu (używany i przy zapisie, i w zdarzeniu). */
export function impulseWindowFields({ untilTurn = null, withoutPaying = false } = {}) {
  return withoutPaying
    ? { playableUntilTurn: untilTurn, playableWithoutPaying: true }
    : { playableUntilTurn: untilTurn };
}

/** Zamrożona kopia obiektu ze stemplem okna (to samo co dawniej `Object.freeze({ ...moved, playableUntilTurn, ... })`). */
export function stampImpulseWindow(object, window) {
  return Object.freeze({ ...object, ...impulseWindowFields(window) });
}

/**
 * Przeniesienie stempla na inny obiekt (karta → obiekt stosu). Wartość JEDZIE,
 * nigdzie nie jest wymyślana: bez źródła w oknie target dostaje zero pól, więc
 * nie da się „przedłużyć" impulsu przez rzut.
 */
export function carryImpulseWindow(source, target) {
  const until = source?.playableUntilTurn;
  if (until != null) target.playableUntilTurn = until;
  if (source?.playableWithoutPaying === true) target.playableWithoutPaying = true;
  return target;
}

/** Czy stempel okna w ogóle jest (bez sprawdzania, czy jeszcze działa). */
export function impulseWindowOf(object) {
  return object?.playableUntilTurn ?? null;
}

/**
 * Okno żyje: stempel istnieje i numery tur jeszcze go nie przeoczyły.
 * JEDYNA forma tego warunku w rdzeniu (CR 601.2b — „until the end of your next
 * turn" liczymy jako numer tury, o który wolno zagrać).
 */
export function isImpulseWindowLive(object, state) {
  const until = object?.playableUntilTurn;
  return until != null && state.turn.number <= until;
}

/** Okno żywe KARTY LEŻĄCEJ W EXILE — bramka ofert i walidacji rzutu z exile. */
export function canPlayByImpulseFromExile(object, state) {
  return object?.zone === 'exile' && isImpulseWindowLive(object, state);
}

/**
 * CR 702.170d (plot, audyt PR #93 — znalezisko I): karta zaplonowana jest
 * rzucalna „during any turn AFTER the turn in which it became plotted".
 * Stempel `plottedAtTurn` kładzie wyłącznie `plotCard` (spells.js), a czytają
 * go DWIE ścieżki rzutu — czary (`plottedCastAllowed`) i permanenty
 * (`castPermanent`). Przed tym modułem każda ścieżka miała własną kopię
 * reguły (albo żadnej: czary nie miały jej wcale, więc zaplotowany czar
 * można było rzucić w tej samej turze, w której go zaplonowano — CR
 * 702.170d naruszone).
 *
 * Brak stempla (`plottedAtTurn == null`) nie blokuje: tak było w starszej
 * ścieżce permanentów i tak zostaje, żeby nie zmieniać zachowania dla
 * obiektów zbudowanych wprost (testy, stare zapisy).
 */
/** Wspólne czytanie stempla: flaga mechaniki + pole z numerem tury. */
function turnStampReached(object, state, flag, stamp) {
  if (!object?.[flag] || object.zone !== 'exile') return true;
  if (object[stamp] == null) return true;
  return state.turn.number > object[stamp];
}

export function plottedTurnReached(object, state) {
  return turnStampReached(object, state, 'plotted', 'plottedAtTurn');
}

/**
 * CR 702.185a (warp, audyt PR #93 — znalezisko J): wygnaną po warp-caście
 * kartę wolno rzucić dopiero „after the current turn has ended". Stempel
 * `warpedAtTurn` kładzie opóźniony trigger wygnania (triggers.js).
 */
export function warpTurnReached(object, state) {
  return turnStampReached(object, state, 'warpReady', 'warpedAtTurn');
}

/** Flaga „bez płacenia kosztu many" na obiekcie (strefa bez znaczenia). */
export function hasFreeCastStamp(object) {
  return object?.playableWithoutPaying === true;
}

/** Darmowy rzut impulsem: flaga + karta wciąż w exile (jak bramka kosztu w `castPermanent`). */
export function isFreeImpulseCast(object) {
  return object?.zone === 'exile' && hasFreeCastStamp(object);
}
