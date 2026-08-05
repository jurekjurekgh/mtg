import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Test stołu „przez kliknięcia": uruchamia src/table/main.js na minimalnym
 * DOM-u w pamięci i prowadzi gracza przez pełną partię, klikając przyciski
 * akcji. Sprawdzamy granicę UI↔protokół: UI nigdy nie mutuje stanu poza
 * komendami, każda akcja przechodzi przez sesję, a ekran kończy partię
 * banerem zwycięzcy. Test jest headless — bez przeglądarki.
 */

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.text = '';
    this.value = '';
    this.disabled = false;
  }

  set textContent(v) {
    this.text = String(v);
    this.children = [];
  }

  get textContent() {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  click() { for (const fn of this.listeners.click ?? []) fn({}); }
}

function installMiniDom() {
  const ids = ['selftest', 'seed', 'deck-human', 'deck-bot', 'new-game', 'table-note',
    'banner', 'status', 'stack-zone', 'bf-enemy', 'bf-own', 'grave-enemy', 'grave-own',
    'exile-zone', 'hand', 'actions', 'actions-count', 'log', 'card-preview', 'card-preview-body',
    'card-preview-close', 'hover-preview', 'context-menu', 'context-menu-body', 'context-menu-close',
    'export-replay', 'import-replay', 'resume-replay', 'resume-save', 'autosave-info',
    'life-own', 'life-enemy', 'library-own', 'library-enemy',
    'library-menu-btn', 'library-menu-panel', 'library-preview', 'zone-inspector-close',
    'replay-out', 'replay-summary', 'replay-download', 'replay-file', 'image-mode',
    'actions-drawer', 'actions-drawer-close', 'actions-fab', 'actions-fab-count',
    'bot-reasoning', 'bot-reasoning-count',
    // M25: sekcja „Przebieg tur (dla AI)" — tekst, licznik, przełącznik i kopiowanie.
    'turn-history', 'turn-history-count', 'turn-history-copy', 'turn-history-1', 'turn-history-2',
    // M24: loch Undercity — karta specjalna na stole z zaznaczeniem pokoju.
    'undercity',
    // M18: pełny ekran karty (dwuklik / karta bez akcji) i modal ruchu bota.
    'card-fullscreen', 'card-fullscreen-body', 'card-fullscreen-close',
    'choice-request', 'choice-request-body', 'choice-request-close',
    'bot-move', 'bot-move-body', 'bot-move-close', 'bot-move-ok',
    // ADR 0012: kreator talii (bez localStorage, tekst + download).
    'deck-builder', 'deck-builder-name', 'deck-builder-plan', 'deck-builder-set', 'deck-builder-color',
    'deck-builder-filter', 'deck-builder-card-list', 'deck-builder-summary', 'deck-builder-errors',
    'deck-builder-output', 'deck-builder-copy',
    'deck-builder-download', 'deck-builder-status',
    // Batch 15: pasek narzędzi + biblioteka talii (IndexedDB).
    'deck-builder-add-filtered', 'deck-builder-clear', 'deck-builder-library-select',
    'deck-builder-load', 'deck-builder-save', 'deck-builder-save-as', 'deck-builder-delete'];
  const registry = new Map(ids.map((id) => [id, new MiniEl(`#${id}`)]));
  registry.get('seed').value = '13';
  const documentListeners = {};
  globalThis.document = {
    listeners: documentListeners,
    getElementById(id) {
      if (!registry.has(id)) throw new Error(`Mini-DOM: nieznane id ${id}`);
      return registry.get(id);
    },
    createElement: (tag) => new MiniEl(tag),
    addEventListener(type, fn) { (documentListeners[type] ??= []).push(fn); },
  };
  globalThis.window = { confirm: () => false };
  return registry;
}

function textOf(root) {
  return root.textContent;
}

/** Polityka klikania jak w teście sesji: rozwój planszy przed passem. */
function pickActionButton(actions) {
  const choicePanel = dom.get('choice-request');
  if (choicePanel.className === 'modal active') {
    const choiceButtons = dom.get('choice-request-body').children
      .flatMap((child) => child.children ?? [])
      .filter((child) => (child.listeners.click ?? []).length > 0);
    return choiceButtons[0] ?? null;
  }
  const buttons = actions.children.filter((c) => (c.listeners.click ?? []).length > 0);
  const byPrefix = (prefix) => buttons.filter((b) => b.text.startsWith(prefix));
  const ordered = [
    byPrefix('Dobierz kartę')[0],
    byPrefix('Zagraj ląd')[0],
    byPrefix('Przygotuj manę')[0],
    byPrefix('Zagraj:')[0],
    // Czar: preferuj cel wroga (Bot w nazwie strefy nie jest dostępny, więc heurystyka po treści stała j.w.)
    byPrefix('Rzuć:')[0],
    ...byPrefix('Atak:').sort((a, b) => b.text.length - a.text.length),
    byPrefix('Blok:')[0],
    byPrefix('Bez bloków')[0],
    byPrefix('Rozstrzygnij')[0],
    byPrefix('Bez ataku')[0],
    byPrefix('Dalej (pass)')[0],
  ].filter(Boolean);
  return ordered[0] ?? buttons.find((b) => !b.text.includes('Poddaj') && !b.text.includes('Koncesja')) ?? null;
}

// Jeden wspólny boot na plik: main.js wykonuje bootstrap przy imporcie,
// a kolejne testy restartują partię przyciskiem „Rozpocznij partię"
// (seed wejściowy jest stały, więc każdy restart jest deterministyczny).
const dom = installMiniDom();
globalThis.REPO_DECKS = {
  green: fs.readFileSync('decks/green.txt', 'utf8'),
  red: fs.readFileSync('decks/red.txt', 'utf8'),
};
await import('../src/table/main.js');

function restart(seed = '13') {
  dom.get('seed').value = seed;
  dom.get('new-game').click();
}

test('strona stołu przechodzi self-test i startuje partię na pierwszej decyzji', () => {
  restart();
  assert.match(textOf(dom.get('selftest')), /✓ Headless engine/, 'self-test nie przeszedł');
  assert.equal(textOf(dom.get('table-note')), '', 'błąd startu partii');
  const first = pickActionButton(dom.get('actions'));
  assert.ok(first, 'brak przycisków akcji po starcie');
  assert.match(textOf(dom.get('status')), /Tura 1/);
  assert.match(textOf(dom.get('status')), /ręka 7/);
  // Ręka gracza rysuje nazwy kart z registry.
  assert.match(textOf(dom.get('hand')), /Highland|Forest|Woolly|Snarling|Lyre|Panic/);
});

test('kreator talii pokazuje supported, liczy kopie i egzekwuje min. 15 nielandowych', () => {
  restart();
  assert.match(textOf(dom.get('deck-builder-summary')), /0 kart/);
  assert.match(textOf(dom.get('deck-builder-card-list')), /Highland|Plains|Forest/);

  dom.get('deck-builder-name').value = 'Talia UI';
  for (const listener of dom.get('deck-builder-name').listeners.input ?? []) listener({});
  // 1 karta (< 15 nielandowych) → brak eksportu (nowa zasada singleton + min 15).
  const firstRow = dom.get('deck-builder-card-list').children[0];
  const controls = firstRow.children[1];
  controls.children[controls.children.length - 1].click();
  assert.match(textOf(dom.get('deck-builder-summary')), /1 kart/);
  assert.equal(dom.get('deck-builder-output').value, '', 'talia < 15 nielandowych nie ma eksportu');

  // „Dodaj po 1 (z filtrów)" → ≥15 nielandowych → eksport dostępny.
  dom.get('deck-builder-add-filtered').click();
  assert.match(dom.get('deck-builder-output').value, /^# Talia UI\n\n\d+x /);
});

test('gracz klika się przez całą partię do baneru końca gry', () => {
  restart();
  const log = dom.get('log');
  let botPauses = 0;
  for (let i = 0; i < 1200; i += 1) {
    if (textOf(dom.get('banner')).includes('Koniec gry')) break;
    // Pauza po istotnym zagraniu bota (decyzja właściciela 2026-08-05):
    // modal „Ruch bota" czeka na klik; „Rozumiem" wznawia grę.
    if (dom.get('bot-move').className === 'modal active') {
      botPauses += 1;
      assert.ok(textOf(dom.get('bot-move-body')).length > 0, 'modal ruchu bota jest pusty');
      dom.get('bot-move-ok').click();
      continue;
    }
    const button = pickActionButton(dom.get('actions'));
    assert.ok(button, `brak akcji dla gracza przy kliku ${i}: ${textOf(dom.get('actions'))}`);
    button.click();
  }
  assert.match(textOf(dom.get('banner')), /Koniec gry — wygrywa: (Ty|Bot)/, `brak baneru końca gry: ${textOf(dom.get('banner'))}`);
  assert.match(textOf(log), /Tura gracza/, 'log nie opisuje tur');
  assert.ok(botPauses > 0, 'partia z botem powinna mieć pauzy po istotnych zagraniach bota');
  assert.ok(!textOf(dom.get('table-note')), textOf(dom.get('table-note')));
});

test('eksport i import zapisu partii działają przez przyciski strony', () => {
  restart();
  // Kilka kliknięć, żeby zapis nie był pusty.
  for (let i = 0; i < 12; i += 1) {
    const button = pickActionButton(dom.get('actions'));
    if (!button) break;
    button.click();
  }
  dom.get('export-replay').click();
  const out = dom.get('replay-out').value;
  assert.match(out, /^\{"version":1,/);
  dom.get('import-replay').click();
  const summary = textOf(dom.get('replay-summary'));
  assert.match(summary, /Odtworzono \d+ komend/, summary);
  assert.match(summary, /odrzuconych: 0/, summary);
});

test('mirror match: obaj gracze mogą grać tą samą talię repo', () => {
  // Właściciel 2026-08-05: „aplikacja nie pozwala mi wybrać dwóch takich
  // samych talii" — dawny sztywny zakaz w startGame jest zbędny
  // (egzemplarze obiektów mają prefiksy graczy).
  dom.get('seed').value = '13';
  dom.get('deck-human').value = 'green';
  dom.get('deck-bot').value = 'green';
  dom.get('new-game').click();
  assert.equal(textOf(dom.get('table-note')), '', `start mirror nie powinien zgłaszać błędu: ${textOf(dom.get('table-note'))}`);
  assert.match(textOf(dom.get('status')), /Tura 1/);
});

/** Symulacja dotyku: touchstart (x0) → touchend (x1) na warstwie. */
function fireTouch(el, x0, x1, y0 = 300, y1 = 312) {
  for (const fn of el.listeners.touchstart ?? []) fn({ changedTouches: [{ clientX: x0, clientY: y0 }] });
  for (const fn of el.listeners.touchend ?? []) fn({ changedTouches: [{ clientX: x1, clientY: y1 }] });
}

test('pełny ekran karty: swipe w lewo/prawo karuzeluje kartami strefy, strzałki też', () => {
  restart();
  const draw = pickActionButton(dom.get('actions'));
  assert.ok(draw?.text.startsWith('Dobierz'), `pierwsza akcja to nie dobranie: ${draw?.text}`);
  draw.click();
  // Kafle ręki z gestem double-tap (pełny ekran).
  const tiles = dom.get('hand').children.filter((c) => (c.listeners.dblclick ?? []).length > 0);
  const n = tiles.length;
  assert.ok(n >= 2, `za mało kart w ręce do karuzeli: ${n}`);
  const fullscreen = dom.get('card-fullscreen');
  const body = dom.get('card-fullscreen-body');
  tiles[0].listeners.dblclick[0]({ preventDefault() {} });
  assert.equal(fullscreen.className, 'fullscreen active', 'double-tap nie otworzył pełnego ekranu');
  assert.ok(textOf(body).includes(`1 / ${n}`), `brak pozycji karuzeli 1/${n}: ${textOf(body)}`);
  // Swipe w lewo = KOLEJNA karta strefy; warstwa zostaje otwarta.
  fireTouch(fullscreen, 220, 40);
  assert.ok(textOf(body).includes(`2 / ${n}`), `swipe w lewo nie przeszedł do kolejnej: ${textOf(body)}`);
  assert.equal(fullscreen.className, 'fullscreen active', 'swipe zamknął pełny ekran');
  // Swipe w prawo = POPRZEDNIA; z pierwszej zapętla na koniec strefy.
  fireTouch(fullscreen, 40, 220);
  assert.ok(textOf(body).includes(`1 / ${n}`), `swipe w prawo nie wrócił do poprzedniej: ${textOf(body)}`);
  fireTouch(fullscreen, 40, 220);
  assert.ok(textOf(body).includes(`${n} / ${n}`), `swipe w prawo z pierwszej nie zawinął na koniec: ${textOf(body)}`);
  // Mikro-ruch (utknięcie palca) nie jest swipem.
  fireTouch(fullscreen, 100, 88);
  assert.ok(textOf(body).includes(`${n} / ${n}`), 'mikro-ruch omyłkowo zmienił kartę');
  // Strzałki klawiatury (desktop): → kolejna (zawija na początek), Esc zamyka.
  for (const fn of document.listeners.keydown ?? []) fn({ key: 'ArrowRight' });
  assert.ok(textOf(body).includes(`1 / ${n}`), '→ nie przeszła do kolejnej karty');
  for (const fn of document.listeners.keydown ?? []) fn({ key: 'ArrowLeft' });
  assert.ok(textOf(body).includes(`${n} / ${n}`), '← nie wróciła do poprzedniej karty');
  for (const fn of document.listeners.keydown ?? []) fn({ key: 'Escape' });
  assert.equal(fullscreen.className, 'fullscreen', 'Esc nie zamknął pełnego ekranu');
});
