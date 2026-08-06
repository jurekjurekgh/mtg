import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installTapGesture } from '../src/table/gestures.js';

/**
 * Poprawka gestów dotyku (2026-08-03, zgłoszenie właściciela z iPada):
 *  - pojedyncze tapnięcie = menu kontekstowe (onTap), podwójne = pełny ekran
 *    (onDoubleTap);
 *  - na dotyku pojedynczy klik odpala się PO oknie 300 ms, żeby drugie
 *    tapnięcie mogło go anulować; syntetyczny `click` po double-tapie jest
 *    tłumiony (wcześniej zawsze wygrywał pojedynczy i pełny ekran nie miał
 *    szans się utrzymać — modal menu przykrywał warstwę);
 *  - `ignoreClick` odrzuca „odpryski" gestu otwierającego (pełny ekran
 *    zamykany tym samym gestem, którym został otwarty).
 */

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.listeners = {};
  }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }
}

/** Emisja sekwencji dotykowej touchstart → touchmove → touchend. */
function touchSequence(el, { fromX, fromY, toX, toY, cancel = false }) {
  el.emit('touchstart', { touches: [{ clientX: fromX, clientY: fromY }] });
  if (cancel) {
    el.emit('touchcancel');
    return;
  }
  if (toX !== fromX || toY !== fromY) {
    el.emit('touchmove', { touches: [{ clientX: toX, clientY: toY }] });
  }
  el.emit('touchend', { changedTouches: [{ clientX: toX, clientY: toY }], preventDefault() {} });
}

/** Uruchamia mock timers (setTimeout + Date) z zadanym startem zegara. */
function withClock(startMs, run) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.timers.setTime(startMs);
  try {
    return run();
  } finally {
    mock.timers.reset();
  }
}

// --- Mysz (kontrakt bez zmian) ---------------------------------------------

test('mysz: pojedynczy klik odpala onTap od razu, bez double', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    el.emit('click');
    assert.deepEqual(taps, ['tap'], 'click na myszy = natychmiastowy onTap');
  });
});

test('mysz: dblclick odpala onDoubleTap', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    el.emit('dblclick');
    assert.deepEqual(taps, ['double']);
  });
});

// --- Dotyk: pojedyncze tapnięcie -------------------------------------------

test('dotyk: pojedyncze tapnięcie odpala onTap po oknie dyskryminacji (320 ms)', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    el.emit('touchend', { preventDefault() {} });
    // click jest ignorowany w nowym kontraktcie (timer startuje z touchend)
    el.emit('click');
    assert.deepEqual(taps, [], 'jeszcze nic — czekamy na ewentualne drugie tapnięcie');
    mock.timers.tick(420);
    assert.deepEqual(taps, ['tap'], 'pojedynczy klik odpala się po oknie');
    mock.timers.tick(400);
    assert.deepEqual(taps, ['tap'], 'i tylko raz');
  });
});

// --- Dotyk: double-tap ------------------------------------------------------

test('dotyk: double-tap odpala onDoubleTap i TŁUMI kliknięcia (menu nie wygrywa)', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    // Pierwsze tapnięcie.
    el.emit('touchend', { preventDefault() {} });
    el.emit('click'); // click z pierwszego tapnięcia (odroczony)
    mock.timers.tick(100); // drugie tapnięcie w oknie 300 ms
    el.emit('touchend', { preventDefault() {} });
    assert.deepEqual(taps, ['double'], 'drugie tapnięcie = onDoubleTap natychmiast');
    // Syntetyczny click z DRUGIEGO tapnięcia przychodzi po touchend — musi być stłumiony.
    el.emit('click');
    mock.timers.tick(400);
    assert.deepEqual(taps, ['double'], 'żaden onTap nie wycieka po double-tapie');
  });
});

test('dotyk: tapnięcia w odstępie >= 300 ms to dwa pojedyncze', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    el.emit('touchend', { preventDefault() {} });
    mock.timers.tick(420);
    el.emit('touchend', { preventDefault() {} });
    mock.timers.tick(420);
    assert.deepEqual(taps, ['tap', 'tap']);
    assert.equal(taps.filter((t) => t === 'double').length, 0);
  });
});

// --- Pełny ekran: ten sam gest zamyka ---------------------------------------

test('pełny ekran: tap w dowolnym miejscu (także na karcie) zamyka — onTap = close', () => {
  withClock(2000, () => {
    const el = new MiniEl('div');
    const events = [];
    installTapGesture(el, {
      onTap: () => events.push('close'),
      onDoubleTap: () => events.push('close'),
      ignoreClick: () => Date.now() - openedAt < 350,
    });
    let openedAt = Date.now();
    el.emit('click');
    assert.deepEqual(events, [], 'klik w oknie 350 ms po otwarciu jest ignorowany');
    mock.timers.tick(400);
    el.emit('touchend', { preventDefault() {} });
    mock.timers.tick(420);
    assert.deepEqual(events, ['close'], 'pojedyncze tapnięcie zamyka pełny ekran');
    events.length = 0;
    el.emit('touchend', { preventDefault() {} });
    mock.timers.tick(100);
    el.emit('touchend', { preventDefault() {} });
    assert.deepEqual(events, ['close'], 'drugie tapnięcie double-tapa zamyka');
  });
});

test('pełny ekran: cancel() anuluje odroczony pojedynczy klik', () => {
  withClock(3000, () => {
    const el = new MiniEl('div');
    let taps = 0;
    // onDoubleTap jest wymagany do trybu dyskryminacji (bez niego nie ma czego
    // odraczać — click na myszy i dotyku odpala onTap od razu).
    const gesture = installTapGesture(el, {
      onTap: () => { taps += 1; },
      onDoubleTap: () => {},
    });
    el.emit('touchend', { preventDefault() {} });
    gesture.cancel();
    mock.timers.tick(420);
    assert.equal(taps, 0, 'anulowany odroczony klik nie odpala onTap');
  });
});

test('mysz: dblclick w oknie ignoreClick (odprysk otwarcia) NIE odpala onDoubleTap (bug „mrugnięcie")', () => {
  withClock(5000, () => {
    const el = new MiniEl('div');
    const events = [];
    let openedAt = -10000;
    installTapGesture(el, {
      onTap: () => events.push('tap'),
      onDoubleTap: () => events.push('double'),
      ignoreClick: () => Date.now() - openedAt < 350,
    });
    // Warstwa właśnie się otworzyła — dwuklik, który ją OTWORZYŁ, dociera
    // już do jej tła jako dblclick; bez bramki zamknąłby ją natychmiast.
    openedAt = Date.now();
    el.emit('dblclick', { preventDefault() {} });
    assert.deepEqual(events, [], 'dblclick-odprysk nie odpala onDoubleTap na świeżo otwartej warstwie');
    // Po oknie ochronnym celowy dwuklik działa normalnie.
    mock.timers.tick(400);
    el.emit('dblclick', { preventDefault() {} });
    assert.deepEqual(events, ['double'], 'celowy dwuklik po oknie odpala onDoubleTap');
  });
});

test('bez onDoubleTap nie ma dyskryminacji — klik odpala onTap od razu', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    let taps = 0;
    installTapGesture(el, { onTap: () => { taps += 1; } });
    el.emit('click');
    assert.equal(taps, 1, 'sam onTap = natychmiastowy klik (brak okna dyskryminacji)');
  });
});

// --- Swipe ≠ tap (zgłoszenie 2026-08-06: „swipe = tap") ---------------------

test('dotyk: swipe z karty (ruch > 10 px) NIE odpala onTap (bug „swipe = tap")', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    touchSequence(el, { fromX: 100, fromY: 200, toX: 160, toY: 215 });
    el.emit('click'); // defensywnie: syntetyczny click po swipe (iOS zwykle go nie wysyła)
    mock.timers.tick(600);
    assert.deepEqual(taps, [], 'swipe nie uzbraja timera pojedynczego tapa ani nie strzela przez click');
  });
});

test('dotyk: swipe z karty NIE liczy się do lastTap — nie tworzy double-tapa z sąsiednim tapem', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    // Tap (t=0), potem swipe (t=100), potem tap (t=300): swipe kasuje i
    // wiszący timer pierwszego tapa, i lastTap — drugi tap to NOWE pierwsze
    // tapnięcie (odpala się po oknie), a nie drugie z pary (zero double).
    el.emit('touchend', { preventDefault() {} });
    mock.timers.tick(100);
    touchSequence(el, { fromX: 50, fromY: 50, toX: 90, toY: 60 });
    mock.timers.tick(200);
    el.emit('touchend', { preventDefault() {} });
    mock.timers.tick(500);
    assert.deepEqual(taps, ['tap'], 'swipe kasuje timer i lastTap — zostaje tylko nowy single-tap');
    assert.equal(taps.filter((t) => t === 'double').length, 0, 'swipe nie tworzy double-tapa z sąsiednim tapem');
  });
});

test('dotyk: ruch ≤ 10 px to nadal tapnięcie (slop nie łapie drżenia palca)', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    touchSequence(el, { fromX: 100, fromY: 100, toX: 108, toY: 104 });
    mock.timers.tick(420);
    assert.deepEqual(taps, ['tap'], 'ruch w granicach slopu to nadal tap');
  });
});

test('dotyk: touchcancel (iOS przejmuje gest — scroll) nie odpala tapa i kasuje wiszący timer', () => {
  withClock(1000, () => {
    const el = new MiniEl('div');
    const taps = [];
    installTapGesture(el, { onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double') });
    // Tap, a zaraz potem scroll (touchcancel zanim minęło okno pojedynczego tapa):
    // wiszący timer musi zostać anulowany — inaczej menu otworzy się „z ducha".
    el.emit('touchend', { preventDefault() {} });
    mock.timers.tick(50);
    touchSequence(el, { fromX: 10, fromY: 10, toX: 10, toY: 10, cancel: true });
    mock.timers.tick(600);
    assert.deepEqual(taps, [], 'touchcancel anuluje timer pojedynczego tapa');
  });
});

// --- Double-tap przez przebudowę DOM (zgłoszenie 2026-08-06: „nigdy nie działa") ---
// renderTableView czyści strefy i odbudowuje kafle przy każdym rerenderze, więc
// między dwoma tapami węzeł karty jest niemal zawsze wymieniony. Stan gestu musi
// żyć poza elementem — kluczowany `stateKey` (objectId karty), współdzielony
// przez wszystkie wcielenia tego samego kafla.

test('double-tap: przebudowa DOM między tapnięciami (ten sam stateKey) dalej daje onDoubleTap', () => {
  withClock(1000, () => {
    const oldTile = new MiniEl('div');
    const newTile = new MiniEl('div');
    const taps = [];
    installTapGesture(oldTile, {
      stateKey: 'tile:obj-7', onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double'),
    });
    // Pierwsze tapnięcie na starym kaflu.
    oldTile.emit('touchend', { preventDefault() {} });
    mock.timers.tick(100);
    // Rerender: stary węzeł odłączony, na jego miejscu NOWY kafelek tej samej karty.
    oldTile.isConnected = false;
    installTapGesture(newTile, {
      stateKey: 'tile:obj-7', onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double'),
    });
    // Drugie tapnięcie trafia na NOWY węzeł — musi zostać rozpoznane jako
    // drugie z pary, a nie jako pierwsze (inaczej po 420 ms otworzy się menu).
    newTile.emit('touchend', { preventDefault() {} });
    assert.deepEqual(taps, ['double'], 'onDoubleTap natychmiast, mimo podmiany węzła');
    mock.timers.tick(500);
    assert.deepEqual(taps, ['double'], 'i żaden onTap nie wycieka po przebudowie');
  });
});

test('single-tap: timer po przebudowie z odłączonym węzłem nie strzela (koniec „duchów tapnięć")', () => {
  withClock(1000, () => {
    const oldTile = new MiniEl('div');
    const taps = [];
    installTapGesture(oldTile, {
      stateKey: 'tile:obj-9', onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double'),
    });
    oldTile.emit('touchend', { preventDefault() {} });
    // Rerender przed upływem okna 420 ms — węzeł z timerem odłączony.
    oldTile.isConnected = false;
    mock.timers.tick(420);
    assert.deepEqual(taps, [], 'timer odłączonego węzła nie odpala onTap');
    // A nowe wcielenie tej samej karty działa normalnie (stan nie jest skażony).
    const newTile = new MiniEl('div');
    newTile.isConnected = true;
    installTapGesture(newTile, {
      stateKey: 'tile:obj-9', onTap: () => taps.push('tap'), onDoubleTap: () => taps.push('double'),
    });
    newTile.emit('touchend', { preventDefault() {} });
    mock.timers.tick(420);
    assert.deepEqual(taps, ['tap'], 'świeży single-tap na nowym węźle działa');
  });
});

test('double-tap: bez stateKey (warstwy stałe) kontrakt per-element bez zmian', () => {
  withClock(1000, () => {
    const layer = new MiniEl('div');
    const events = [];
    installTapGesture(layer, { onTap: () => events.push('tap'), onDoubleTap: () => events.push('double') });
    layer.emit('touchend', { preventDefault() {} });
    mock.timers.tick(100);
    layer.emit('touchend', { preventDefault() {} });
    assert.deepEqual(events, ['double'], 'dwa tapy na tym samym stałym węźle = double-tap');
  });
});
