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
    el.emit('click'); // syntetyczny click po pierwszym tapnięciu
    assert.deepEqual(taps, [], 'jeszcze nic — czekamy na ewentualne drugie tapnięcie');
    mock.timers.tick(320);
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
    el.emit('click');
    mock.timers.tick(320);
    el.emit('touchend', { preventDefault() {} });
    el.emit('click');
    mock.timers.tick(320);
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
    let openedAt = Date.now(); // „otwarcie" pełnego ekranu
    // Odprysk gestu otwierającego (click tuż po otwarciu) nie zamyka.
    el.emit('click');
    assert.deepEqual(events, [], 'klik w oknie 350 ms po otwarciu jest ignorowany');
    // Zwykłe tapnięcie zamyka (odroczone o okno double-tapa).
    mock.timers.tick(400);
    el.emit('touchend', { preventDefault() {} });
    el.emit('click');
    mock.timers.tick(320);
    assert.deepEqual(events, ['close'], 'pojedyncze tapnięcie zamyka pełny ekran');
    // Double-tap też zamyka (na drugim tapnięciu).
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
    el.emit('click');
    gesture.cancel();
    mock.timers.tick(320);
    assert.equal(taps, 0, 'anulowany odroczony klik nie odpala onTap');
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
