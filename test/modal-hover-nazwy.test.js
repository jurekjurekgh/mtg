// =============================================================================
// Zgłoszenie właściciela 2026-11-05: w modalach wyboru nazwa karty NIE otwiera
// już pełnego ekranu kliknięciem — najechanie kursorem pokazuje hover
// z ilustracją (ten sam co na stole/cmentarzu). Klik w nazwę znika.
// Na dotyku (brak kursora) tap w nazwę nadal otwiera pełny ekran.
//
// Kontrakt pinowany tutaj jest JEDNEGO miejsca: wspólny picker
// (`renderPickerRow` / `renderPickerChipList` z picker.js) oraz wspólny
// komponent nazwy-podglądu `renderPeekButton` (choice-request.js). Kreatory
// tylko przekazują callbacki — nie budują własnych ścieżek podglądu.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

const { renderPickerRow, renderPickerChipList } = await import('../src/table/picker.js');
const { renderPeekButton, renderMultiTargetWizard } = await import('../src/table/choice-request.js');

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
    this.text = ''; this.type = ''; this.checked = false; this.disabled = false;
    this.title = ''; this.dataset = {}; this.name = '';
    this.classList = { toggle: () => {}, add: () => {} };
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.html = String(v); this.children = []; }

  get innerHTML() { return this.html ?? this.textContent; }

  appendChild(c) { this.children.push(c); return c; }

  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }

  fire(t, ev = { stopPropagation() {}, preventDefault() {}, clientX: 10, clientY: 20 }) {
    for (const l of this.listeners[t] ?? []) l(ev);
  }

  click() { this.fire('click'); }

  descendants() {
    const out = [];
    const walk = (n) => { for (const c of n.children ?? []) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }

  find(pred) { return this.descendants().find(pred); }
}

function zDocumentem(fn) {
  const old = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    return fn(new MiniEl('div'));
  } finally {
    globalThis.document = old;
  }
}

function hoverSpy() {
  const calls = { start: [], end: 0 };
  return {
    calls,
    onHoverCard: (id, e) => calls.start.push([id, e?.clientX]),
    onHoverCardEnd: () => { calls.end += 1; },
  };
}

test('HOVER/1: wiersz checkbox — najechanie pokazuje hover, klik w nazwę NIE otwiera karty', () => {
  zDocumentem((host) => {
    const hover = hoverSpy();
    const opened = [];
    const handle = renderPickerRow(host, {
      id: 'obj-1', label: 'Karta A', kind: 'checkbox',
      onToggle: () => {},
      onOpenCard: (id) => opened.push(id),
      ...hover,
    });
    const name = handle.label;
    assert.ok(name, 'wiersz ma nazwę');
    assert.ok(!String(name.className).includes('log-card'), 'nazwa w trybie hover nie niesie haka delegacji pełnego ekranu');
    assert.equal(name.dataset?.cardId, undefined, 'nazwa w trybie hover nie niesie dataset.cardId');
    name.fire('mouseenter');
    assert.deepEqual(hover.calls.start, [['obj-1', 10]], 'mouseenter woła hover z identyfikatorem wiersza');
    name.fire('mouseleave');
    assert.equal(hover.calls.end, 1, 'mouseleave chowa hover');
    name.click();
    assert.deepEqual(opened, [], 'klik w nazwę nie otwiera pełnego ekranu');
  });
});

test('HOVER/2: wiersz stepper — hover działa, klik w nazwę nie otwiera; openCardId wygrywa nad id', () => {
  zDocumentem((host) => {
    const hover = hoverSpy();
    const opened = [];
    const handle = renderPickerRow(host, {
      id: 'row-9', openCardId: 'card-9', label: 'Karta B', kind: 'stepper', max: 3,
      onStep: () => {},
      onOpenCard: (id) => opened.push(id),
      ...hover,
    });
    handle.label.fire('mouseenter');
    assert.deepEqual(hover.calls.start, [['card-9', 10]], 'hover dostaje openCardId, nie id wiersza');
    handle.label.click();
    assert.deepEqual(opened, [], 'klik w nazwę steppera nie otwiera karty');
    handle.label.fire('mouseleave');
    assert.equal(hover.calls.end, 1);
  });
});

test('HOVER/3: chip listy przeglądniętej — hover zamiast kliku, bez dataset.cardId', () => {
  zDocumentem((host) => {
    const hover = hoverSpy();
    const opened = [];
    const { nameEls } = renderPickerChipList(host, {
      items: [{ id: 'c1', cardId: 'card-c1', name: 'Karta C' }],
      onOpenCard: (id) => opened.push(id),
      ...hover,
    });
    const name = nameEls[0];
    assert.ok(!String(name.className).includes('log-card'), 'chip w trybie hover bez haka log-card');
    assert.equal(name.dataset?.cardId, undefined, 'chip w trybie hover bez dataset.cardId');
    name.fire('mouseenter');
    assert.deepEqual(hover.calls.start, [['card-c1', 10]], 'hover chipa dostaje cardId');
    name.click();
    assert.deepEqual(opened, [], 'klik w nazwę chipa nie otwiera karty');
    name.fire('mouseleave');
    assert.equal(hover.calls.end, 1);
  });
});

test('HOVER/4: dotyk (brak callbacków hover) — klik w nazwę nadal otwiera pełny ekran', () => {
  zDocumentem((host) => {
    const opened = [];
    const handle = renderPickerRow(host, {
      id: 'obj-2', label: 'Karta D', kind: 'checkbox',
      onToggle: () => {},
      onOpenCard: (id) => opened.push(id),
    });
    handle.label.click();
    assert.deepEqual(opened, ['obj-2'], 'na dotyku tap w nazwę otwiera kartę jak dotąd');
  });
});

test('HOVER/6: nagłówek wyboru trybu — nazwa czaru w zdaniu nagłówka jest hoverowalna i występuje raz', () => {
  zDocumentem((host) => {
    const hover = hoverSpy();
    const opened = [];
    renderMultiTargetWizard(host, {
      view: {
        playerId: 'p1',
        players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
        zones: { battlefield: [], hand: [], stack: [], graveyard: [], library: [] },
      },
      session: { nameOf: (id) => String(id), nameOfObject: (id) => String(id) },
      plan: {
        buttonsMode: true,
        rows: [{ id: 'opt-0', label: 'Tryb A' }, { id: 'opt-1', label: 'Tryb B' }],
        minTargets: 1, maxTargets: 1,
      },
      commands: [{ type: 'cast_spell', playerId: 'p1' }, { type: 'cast_spell', playerId: 'p1' }],
      intro: 'Rzuć: Izzet Charm (koszt {U}{R}) — wybierz tryb:',
      introCard: { cardId: 'izzet-charm', name: 'Izzet Charm' },
      onOpenCardByCardId: (id) => opened.push(id),
      onHoverCardByCardId: hover.onHoverCard,
      onHoverCardEnd: hover.onHoverCardEnd,
      onComplete: () => {},
      onCancel: () => {},
    });
    const peeks = host.descendants().filter((el) => String(el.className).includes('choice-request-peek'));
    assert.equal(peeks.length, 1, 'nagłówek ma dokładnie jedną nazwę-podgląd');
    assert.equal(peeks[0].textContent, 'Izzet Charm');
    const introEl = host.find((el) => String(el.className).includes('choice-request-intro'));
    const occurrences = introEl.textContent.split('Izzet Charm').length - 1;
    assert.equal(occurrences, 1, 'nazwa czaru nie dubluje się w nagłówku');
    peeks[0].fire('mouseenter');
    assert.deepEqual(hover.calls.start, [['izzet-charm', 10]], 'najechanie na nazwę w nagłówku pokazuje hover czaru');
    peeks[0].click();
    assert.deepEqual(opened, [], 'klik w nazwę w nagłówku nie otwiera pełnego ekranu');
    peeks[0].fire('mouseleave');
    assert.equal(hover.calls.end, 1);
  });
});

test('HOVER/5: renderPeekButton — z hoverem: najechanie podgląda, klik nie otwiera; bez hovera: klik otwiera (dotyk)', () => {
  zDocumentem((host) => {
    const hover = hoverSpy();
    const opened = [];
    const peek = renderPeekButton(host, {
      cardId: 'card-p', label: 'Karta P',
      onOpen: (id) => opened.push(id),
      onHover: hover.onHoverCard, onHoverEnd: hover.onHoverCardEnd,
    });
    peek.fire('mouseenter');
    assert.deepEqual(hover.calls.start, [['card-p', 10]]);
    peek.click();
    assert.deepEqual(opened, [], 'klik w nazwę podglądu nie otwiera przy hoverze');
    peek.fire('mouseleave');
    assert.equal(hover.calls.end, 1);
    assert.ok(!String(peek.className).includes('log-card'), 'peek w trybie hover bez haka log-card');
  });
  zDocumentem((host) => {
    const opened = [];
    const peek = renderPeekButton(host, {
      cardId: 'card-q', label: 'Karta Q',
      onOpen: (id) => opened.push(id),
    });
    peek.click();
    assert.deepEqual(opened, ['card-q'], 'na dotyku klik w nazwę podglądu otwiera kartę');
  });
});
