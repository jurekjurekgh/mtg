// =============================================================================
// M292 (2026-09-03, decyzja właściciela „1+2+3 i przerobienie testu")
//
// Prośba z tury 8 brzmiała: „każda zdolność wielocelowa ma korzystać z JEDNEGO
// elastycznego helpera wyglądu; logika efektu może zostać własna". M288/A
// objął rodziny „który" (walka, cele wielokrotne, koszt escape). Rodzina „ile"
// (steppery przydziału obrażeń i podziału) oraz wiersze jednodotykowe (źródła
// many) były nadal rysowane osobno, a ptaszek „ignoruj tę opcję" istniał w dwóch
// ręcznie lepionych kopiach. Ten plik pinuje nowe kształty tego samego
// komponentu i — po raz pierwszy — JEDNO miejsce, które je wszystkie produkuje.
//
// Testy liczą Model (nie wygląd): asercje dotyczą tego, co wywołujący dostaje
// od helpera i co trafia do DOM-u. Wygląd wiersza pilnuje `m129-*` (styl
// efektywny z REALNEJ listy klas), a etykiet parametrów `m138-*` Z5.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { renderPickerRow, renderPickerSection } = await import('../src/table/picker.js');

/** Stub DOM-u wystarczający dla picker.js (bez jsdom — jak w reszcie testów UI). */
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

  fire(t, ev = { stopPropagation() {}, preventDefault() {} }) {
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

  findAll(pred) { return this.descendants().filter(pred); }
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

// ---------------------------------------------------------------------------
// rodzina „ile": stepper
// ---------------------------------------------------------------------------

test('M292/1: stepper trzyma model wywołującego — `setValue` maluje, nie klik', () => {
  const h = zDocumentem((host) => {
    let n = 0;
    const handle = renderPickerRow(host, {
      kind: 'stepper', id: 'b1', label: 'Blokujący', max: 3,
      onStep: (delta, id) => { n += delta; handle.setValue(n); assert.equal(id, 'b1'); },
    });
    const plus = handle.row.find((e) => String(e.className).includes('picker-step-inc'));
    const minus = handle.row.find((e) => String(e.className).includes('picker-step-dec'));
    assert.ok(plus && minus, 'stepper ma przyciski −/+');
    assert.equal(minus.disabled, true, 'przy zerze „−" jest wyłączony (stan z modelu, nie z kliknięcia)');
    plus.click(); plus.click();
    assert.equal(handle.valueEl.textContent, '2');
    assert.equal(n, 2, 'logikę liczby robi wywołujący — helper tylko pyta');
    handle.setValue(0);
    assert.equal(minus.disabled, true, 'po setValue stan wiersza zgadza się z modelem');
    assert.equal(plus.disabled, false);
    return handle.row;
  });
  assert.match(h.className, /(^| )picker-row( |$)/, 'stepper jest w TEJ SAMEJ rodzinie wierszy co ptaszki');
  assert.match(h.className, /picker-stepper/);
});

test('M292/2: `canIncrement`/`canDecrement` sterują przyciskami, a klik ponad limit nic nie robi', () => {
  zDocumentem((host) => {
    let n = 0;
    const handle = renderPickerRow(host, {
      kind: 'stepper', id: 'x', label: 'L', max: 2, value: 0,
      canIncrement: () => false, // np. suma przydziału już wyczerpana (CR 510.1c)
      onStep: (d) => { n += d; },
    });
    const plus = handle.row.find((e) => String(e.className).includes('picker-step-inc'));
    assert.equal(plus.disabled, true, 'predykat wywołującego trafia na przycisk');
    plus.click();
    assert.equal(n, 0, 'handler i tak pilnuje warunku — klik w wyłączony przycisk nie zmienia modelu');
    handle.setValue(2);
    assert.equal(handle.row.find((e) => String(e.className).includes('picker-step-inc')).disabled, true,
      'na suficie `max` też wyłączony (bez pytania predykatu)');
  });
});

test('M292/3: `format` i hak kreatora na licznik trafiają na TEN SAM element', () => {
  zDocumentem((host) => {
    const handle = renderPickerRow(host, {
      kind: 'stepper', id: 'x', label: 'L', value: 2,
      valueClassName: 'damage-wizard-count', format: (v) => `${v} obrażeń`,
    });
    assert.equal(handle.valueEl.textContent, '2 obrażeń');
    assert.match(handle.valueEl.className, /damage-wizard-count/,
      'hak kreatora (na niego patrzy m172 i sonda Testera) jest na liczniku');
    assert.match(handle.valueEl.className, /(^| )picker-value( |$)/);
  });
});

test('M292/4: `actions` to haczyk wywołującego na własne kontrolki wiersza', () => {
  zDocumentem((host) => {
    const handle = renderPickerRow(host, { kind: 'stepper', id: 'x', label: 'L' });
    assert.ok(handle.actions, 'picker oddaje pojemnik na dodatkowe przyciski');
    const extra = new MiniEl('button');
    extra.className = 'ghost-btn damage-wizard-up';
    handle.actions.appendChild(extra);
    assert.deepEqual(handle.row.children.filter((c) => c !== handle.actions).map((c) => c.tagName),
      ['span', 'button', 'span', 'button'],
      'nazwa, −, licznik, + w wierszu; własne kontrolki wywołującego w `actions`');
    assert.ok(handle.actions.children.includes(extra));
  });
});

// ---------------------------------------------------------------------------
// wiersz-przycisk (listy jednodotykowe)
// ---------------------------------------------------------------------------

test('M292/5: `kind: button` = jeden cel dotyku, jedna akcja, bez ptaszka', () => {
  const out = zDocumentem((host) => {
    const taps = [];
    renderPickerRow(host, {
      kind: 'button', id: 's1', html: 'Tapnij: Island (<i class="ms-u"></i>)',
      rowClassName: 'action choice-request-option mana-wizard-source',
      onActivate: (id) => taps.push(id),
    });
    return { host, taps };
  });
  const row = out.host.children[0];
  assert.equal(row.tagName, 'button');
  assert.equal(row.type, 'button', 'bez tego klik w formularzu wysyłałby submit');
  assert.match(row.className, /mana-wizard-source/, 'hak Testera (`$$(#mana-wizard .mana-wizard-source)`) zostaje');
  assert.match(row.className, /picker-row/);
  assert.equal(row.find((e) => e.tagName === 'input'), undefined, 'wiersz-przycisk nie ma ptaszka');
  row.click();
  assert.deepEqual(out.taps, ['s1'], 'cały wiersz jest jedną akcją');
});

test('M292/6: nazwa z `label` idzie przez textContent, więc karta o nazwie z <b> nie wstrzykuje marku', () => {
  zDocumentem((host) => {
    const handle = renderPickerRow(host, { kind: 'button', id: 'x', label: '<img src=x onerror=alert(1)>' });
    const name = handle.label;
    assert.equal(name.html, undefined, 'bez jawnego `html` nie ruszamy innerHTML');
    assert.equal(name.textContent, '<img src=x onerror=alert(1)>');
  });
});

test('M292/7: `disabled` w wierszu-przycisku blokuje akcję (np. źródło tapnięte w międzyczasie)', () => {
  const out = zDocumentem((host) => {
    const taps = [];
    const handle = renderPickerRow(host, { kind: 'button', id: 's', label: 'L', disabled: true, onActivate: () => taps.push(1) });
    handle.row.click();
    return taps;
  });
  assert.deepEqual(out, [], 'wyłączony wiersz nie wysyła ruchu');
});

// ---------------------------------------------------------------------------
// wariant inline: ptaszek wyciszenia (punkt 3 decyzji)
// ---------------------------------------------------------------------------

test('M292/8: `variant: inline` bierze OBSŁUGĘ z pickera, a wygląd z rodziny wywołującego', () => {
  const out = zDocumentem((host) => {
    const keys = [];
    const handle = renderPickerRow(host, {
      kind: 'checkbox', variant: 'inline',
      rowClassName: 'action-ignore', toggleClassName: 'action-ignore-input',
      label: null, title: 'Zaznacz: ta opcja nie przerywa auto-passu',
      checked: true, stopRowPropagation: true,
      onToggle: (on) => keys.push(on),
    });
    handle.input.fire('change');
    return { host, handle, keys };
  });
  const row = out.host.children[0];
  assert.equal(row.className, 'action-ignore',
    'żadnych klas `picker-*`: ptaszek siedzi WEWNĄTRZ przycisku opcji i nie może dostać wyglądu wiersza (na ten dokładny łańcuch patrzą table-ui i choice-group-ignore)');
  assert.equal(out.handle.input.className, 'action-ignore-input');
  assert.equal(out.handle.input.checked, true, 'stan startowy z modelu');
  assert.equal(row.title, 'Zaznacz: ta opcja nie przerywa auto-passu');
  assert.deepEqual(out.keys, [true], 'zmiana ptaszka zgłasza się wywołującemu');
  let propagacja = true;
  row.fire('click', { stopPropagation: () => { propagacja = false; } });
  assert.equal(propagacja, false, 'klik w ptaszka nie może zagrać opcji, która go niesie');
});

test('M292/9: bez nazwy helper NIE wstawia pustego spana (ptaszek w przycisku jest goły)', () => {
  zDocumentem((host) => {
    const handle = renderPickerRow(host, { kind: 'checkbox', variant: 'inline', rowClassName: 'action-ignore', toggleClassName: 'action-ignore-input', label: null });
    assert.equal(handle.label, null);
    assert.deepEqual(handle.row.children.map((c) => c.tagName), ['input']);
  });
});

// ---------------------------------------------------------------------------
// jedno źródło dla wszystkich wierszy stołu
// ---------------------------------------------------------------------------

test('M292/10: sekcje nagłówkowe też pochodzą z helpera (sloty „1. twój stwór:")', () => {
  const out = zDocumentem((host) => {
    renderPickerSection(host, '1. twój stwór:', { className: 'multi-target-slot-label' });
    return host.children[0];
  });
  assert.equal(out.textContent, '1. twój stwór:');
  assert.match(out.className, /(^| )picker-section( |$)multi-target-slot-label$|picker-section/);
  assert.match(out.className, /multi-target-slot-label/, 'hak kreatora zostaje obok rodzinnego');
});

test('M292/11: żaden kreator nie rysuje wiersza własnoręcznie — wszyscy idą przez picker', () => {
  // Kontrapunkt dla prośby „nie każdy efekt na innej, równoległej funkcji
  // wizualizującej wybory": sprawdzone po plikach, nie po pamięci.
  const plik = fs.readFileSync('src/table/choice-request.js', 'utf8');
  const body = plik.slice(plik.indexOf('export function renderDamageWizard('));
  const forZone = body.slice(0, body.indexOf('export function renderEscapeExileWizard'));
  assert.match(forZone, /renderPickerRow\(/, 'kreator przydziału obrażeń buduje wiersz pickerem');
  const division = plik.slice(plik.indexOf('export function renderDamageDivisionWizard('), plik.indexOf('export function renderMultiTargetWizard('));
  assert.match(division, /renderPickerRow\(/, 'kreator podziału obrażeń buduje wiersz pickerem');
  const mana = fs.readFileSync('src/table/mana-wizard.js', 'utf8');
  assert.match(mana, /renderPickerRow\(/, 'kreator płatności many buduje wiersz pickerem');
  for (const [nazwa, sciezka] of [['choice-request', 'src/table/choice-request.js'], ['render', 'src/table/render.js']]) {
    const s = fs.readFileSync(sciezka, 'utf8');
    const wiersze = s.match(/choiceNode\([^)]*'div', '[\w-]*-row'/g) ?? [];
    assert.deepEqual(wiersze, [], `${nazwa}: nie może samo składać wierszy z klasy „*-row”`);
  }
});
