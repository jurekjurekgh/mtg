import { test, mock } from 'node:test';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderDayNight, renderTableView } from '../src/table/render.js';
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

  // Ikony many (2026-08-07): etykiety akcji są HTML-em (innerHTML); MiniEl
  // przechowuje surowy string, żeby asercje tekstowe dalej działały.
  set innerHTML(v) {
    this.text = String(v);
    this.children = [];
  }

  get innerHTML() {
    return this.text;
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
    // Zgłoszenie 2026-08-07: przycisk losowego ziarna obok „Rozpocznij partię".
    'shuffle-seed',
    // Wskaźnik tury (2026-08-07): stała informacja w lewym górnym rogu.
    'turn-indicator',
    'life-own', 'life-enemy', 'library-own', 'library-enemy',
    'library-menu-btn', 'library-menu-panel', 'library-preview', 'zone-inspector-close',
    'replay-out', 'replay-summary', 'replay-download', 'replay-file', 'image-mode',
    'actions-drawer', 'actions-drawer-close', 'actions-fab', 'actions-fab-count',
    'bot-reasoning', 'bot-reasoning-count',
    // M25: sekcja „Przebieg tur (dla AI)" — tekst, licznik, przełącznik i kopiowanie.
    'turn-history', 'turn-history-count', 'turn-history-copy', 'turn-history-1', 'turn-history-2',
    // M24: loch Undercity — karta specjalna na stole z zaznaczeniem pokoju.
    'daynight',
    'undercity',
    // M18: pełny ekran karty (dwuklik / karta bez akcji) i modal ruchu bota.
    'card-fullscreen', 'card-fullscreen-body', 'card-fullscreen-close',
    'choice-request', 'choice-request-body', 'choice-request-close',
    'bot-move', 'bot-move-body', 'bot-move-close', 'bot-move-ok',
    'mana-wizard', 'mana-wizard-body', 'mana-wizard-close',
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
  // Zgłoszenie 2026-08-07 (A): autosave partii w localStorage — mock pamięci,
  // żeby ścieżki autosave/wznawiania były testowalne headless.
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => { mem.set(key, String(value)); },
    removeItem: (key) => { mem.delete(key); },
    clear: () => mem.clear(),
    _mem: mem,
  };
  return registry;
}

function textOf(root) {
  return root.textContent;
}

/** Polityka klikania jak w teście sesji: rozwój planszy przed passem. */
function pickActionButton(actions) {
  // Kreator many (E.3a): otwarty modal płatności — tapuj źródła po jednym,
  // aż rzut sam się dokłada (sterowanie jak gracz w pętli głównej). Brak źródeł
  // → Anuluj (kreator się zamyka, gra toczy się dalej).
  if (dom.get('mana-wizard').className === 'modal active') {
    const walk = (el, acc = []) => { for (const c of el.children ?? []) { acc.push(c); walk(c, acc); } return acc; };
    const wiz = walk(dom.get('mana-wizard-body'));
    const source = wiz.find((el) => /^Tapnij:/.test(el.text ?? '') && (el.listeners.click ?? []).length > 0);
    if (source) return source;
    return wiz.find((el) => /Anuluj płatność/.test(el.text ?? '')) ?? null;
  }
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
  // Dwukolorowa talia pod kreator many (E.3a): 2 kolory lądów + tanie czary
  // z kolorowym wymaganiem (Curate {1}{U}) — gwarantuje niejednoznaczne
  // pokrycie kosztu (Wyspa+Wyspa+Równina, seed 1).
  'many-wizard': '# Talia many-wizard\n\n26x Island\n6x Plains\n8x Curate\n',
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
  const first = pickActionButton(dom.get('actions'));
  assert.ok(first, 'brak pierwszej akcji (tura 1: zagranie lądu — CR 103.7a bez draw)');
  first.click();
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

// --- Bug A/C (zgłoszenia 2026-08-06): odprysk gestu i klikalny stos ---------

test('bug A (iOS): touchend tuż po otwarciu pełnego ekranu (powolny double-tap) go nie zamyka', () => {
  // UWAGA: epokę bierzemy PRZED włączeniem mocka (po nim Date.now() = 0),
  // bo stan modułu (fullscreenOpenedAt/SwipedAt) był zapisywany realnym
  // czasem w wcześniejszych testach — ujemna różnica aliasingowałaby
  // okna ochronne („odprysk” zawsze aktywny).
  const realNow = Date.now();
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.timers.setTime(realNow);
  try {
    restart();
    const first = pickActionButton(dom.get('actions'));
    assert.ok(first, 'brak pierwszej akcji (tura 1: bez draw — CR 103.7a)');
    first.click();
    const tiles = dom.get('hand').children.filter((c) => (c.listeners.dblclick ?? []).length > 0);
    assert.ok(tiles.length >= 1, 'brak kafli ręki z gestem');
    const fullscreen = dom.get('card-fullscreen');
    tiles[0].listeners.dblclick[0]({ preventDefault() {} });
    assert.equal(fullscreen.className, 'fullscreen active', 'double-tap nie otworzył pełnego ekranu');
    // iOS powolny double-tap: drugi touchend ląduje na świeżej warstwie —
    // bez bramki uzbrajał timer pojedynczego tapa i warstwa „mrugała".
    for (const fn of fullscreen.listeners.touchend ?? []) fn({ changedTouches: [{ clientX: 100, clientY: 100 }], preventDefault() {} });
    mock.timers.tick(600); // więcej niż timer pojedynczego tapa (420 ms)
    assert.equal(fullscreen.className, 'fullscreen active', 'odprysk iOS zamknął świeży pełny ekran');
    // Celowe zamknięcie działa po oknie ochronnym.
    mock.timers.tick(100);
    for (const fn of fullscreen.listeners.touchend ?? []) fn({ changedTouches: [{ clientX: 100, clientY: 100 }], preventDefault() {} });
    mock.timers.tick(420);
    assert.equal(fullscreen.className, 'fullscreen', 'celowe tapnięcie po oknie nie zamknęło pełnego ekranu');
  } finally {
    mock.timers.reset();
  }
});

test('bug A (iOS): klik w tło świeżo otwartego modala jest ignorowany (odprysk otwarcia menu)', () => {
  const realNow = Date.now();
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.timers.setTime(realNow);
  try {
    restart();
    dom.get('library-menu-btn').click();
    const panel = dom.get('library-menu-panel');
    assert.equal(panel.className, 'modal active', 'panel biblioteki nie otworzył się');
    // Klik dokładnie w tło modala od razu po otwarciu — ignorowany.
    for (const fn of panel.listeners.click ?? []) fn({ target: panel });
    assert.equal(panel.className, 'modal active', 'odprysk zamknął świeży modal');
    // Po oknie ochronnym celowy klik w tło zamyka.
    mock.timers.tick(500);
    for (const fn of panel.listeners.click ?? []) fn({ target: panel });
    assert.equal(panel.className, 'modal', 'celowy klik w tło po oknie nie zamknął modala');
  } finally {
    mock.timers.reset();
  }
});

test('bug C: karta na stosie jest klikalna — tapnięcie nazwy otwiera jej pełny ekran', () => {
  const realNow = Date.now();
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.timers.setTime(realNow);
  try {
    const registry = createCardRegistry();
    // Deterministyczny stan ze stosem (auto-pass rozstrzyga stos przed
    // kolejnym renderem, więc okno e2e jest ulotne — stąd stub widoku).
    const view = {
      status: 'active', winnerId: null, playerId: 'p1',
      players: [
        { id: 'p1', name: 'Ty', life: 20, mana: 0 },
        { id: 'p2', name: 'Nieprzyjaciel', life: 20, mana: 0 },
      ],
      zones: {
        stack: [{ id: 'stack-0', cardId: 'grizzled-outcasts', controllerId: 'p2', targets: [] }],
        hand: [], battlefield: [], graveyard: [], exile: [], library: [],
      },
      turn: { number: 1, activePlayerId: 'p2', phase: 'precombat_main', step: 'precombat_main' },
      legalCommands: [],
    };
    const session = {
      view: () => view,
      log: [], reasoning: [], state: { seed: 13 },
      nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
      nameOfObject: (objectId) => objectId,
      cardDetails: (cardId) => registry.get(cardId) ?? null,
      colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
      abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
    };
    const els = {};
    for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
      els[key] = new MiniEl(`#${key}`);
    }
    const opened = [];
    renderTableView({
      els, session, play: () => {}, onCardClick: () => {},
      onStackClick: (objectId) => opened.push(objectId),
    });
    const item = els.stackZone.children.find((c) => (c.className ?? '').includes('stack-item'));
    assert.ok(item, 'stos nie wyrenderował karty');
    assert.match(item.className, /clickable/, 'karta stosu niesygnowana jako klikalna');
    assert.ok((item.listeners.touchend ?? []).length > 0, 'karta stosu bez gestu tapnięcia');
    for (const fn of item.listeners.touchend ?? []) fn({ preventDefault() {} });
    mock.timers.tick(420); // okno dyskryminacji pojedynczego tapa
    assert.deepEqual(opened, ['stack-0'], 'tapnięcie nazwy karty stosu nie otworzyło jej podglądu');
  } finally {
    mock.timers.reset();
  }
});

// --- Kreator płatności many (E.3a, 2026-08-06) ------------------------------

/** Klika partię talii many-wizard aż do otwarcia kreatora; sterownik jak w pętli głównej. */
function driveToManaWizard(maxClicks = 300) {
  for (let i = 0; i < maxClicks; i += 1) {
    if (dom.get('bot-move').className === 'modal active') {
      dom.get('bot-move-ok').click();
      continue;
    }
    if (dom.get('mana-wizard').className === 'modal active') return 'wizard';
    const buttons = dom.get('actions').children.filter((c) => (c.listeners.click ?? []).length > 0);
    const curate = buttons.find((b) => /Curate/.test(b.text) && /^Rzuć/.test(b.text));
    if (curate) {
      curate.click();
      if (dom.get('mana-wizard').className === 'modal active') return 'wizard';
      // Rzut przeszedł auto-tapiernie (jednoznaczne źródła) — gramy dalej.
    }
    const button = pickActionButton(dom.get('actions'));
    if (!button) return null;
    button.click();
  }
  return null;
}

/** Kliki w przyciski źródeł kreatora (po jednym, nie „wszystkie naraz”). */
function wizardSourceButtons() {
  const walk = (el, acc = []) => { for (const c of el.children ?? []) { acc.push(c); walk(c, acc); } return acc; };
  return walk(dom.get('mana-wizard-body')).filter((el) => /^Tapnij:/.test(el.text ?? '') && (el.listeners.click ?? []).length > 0);
}

test('kreator many (E.3a): dwukolorowa płatność Curate otwiera wizard, źródła tapowane po jednym, rzut sam się dokłada', () => {
  dom.get('seed').value = '1';
  dom.get('deck-human').value = 'many-wizard';
  dom.get('deck-bot').value = 'many-wizard';
  dom.get('new-game').click();
  assert.equal(driveToManaWizard(), 'wizard', 'nie dotarto do kreatora many (Curate z 2×Wyspa+Równiną)');
  const body = textOf(dom.get('mana-wizard-body'));
  assert.match(body, /Płatność/);
  assert.match(body, /ms-u/, 'ikona niebieskiej many w kreatorze');
  assert.ok(!body.includes('{1}{U}'), 'koszt bez tekstowych symboli');
  assert.match(body, /pozostało 2 many/);
  let sources = wizardSourceButtons();
  // Układ nietapniętych źródeł zależy od ręki startowej (tura 1 bez draw,
  // CR 103.7a) — istotne: co najmniej 3 źródła, w tym Island i Plains.
  assert.ok(sources.length >= 3, `kreator ma pokazać nietapnięte źródła (Island + Plains): ${body}`);
  assert.match(body, /Island/, 'brak wysp w kreatorze');
  assert.match(body, /Plains/, 'brak równiny w kreatorze');
  // Pierwsze źródło — suma niepełna, kreator zostaje.
  sources[0].click();
  assert.equal(dom.get('mana-wizard').className, 'modal active', 'po jednym źródle kreator ma trwać');
  assert.match(textOf(dom.get('mana-wizard-body')), /pozostało 1 many/);
  assert.ok(!textOf(dom.get('stack-zone')).includes('Curate'), 'rzut bez pełnej sumy nie może odpalić');
  // Drugie źródło — suma zebrana, rzut odpala się automatycznie.
  sources = wizardSourceButtons();
  assert.ok(sources.length >= 1, 'kreator powinien nadal oferować nietapnięte źródła (jedno z 2)');
  sources[0].click();
  assert.equal(dom.get('mana-wizard').className, 'modal', 'po zebraniu sumy kreator ma się zamknąć');
  assert.match(textOf(dom.get('stack-zone')), /Curate/, 'Curate po zebraniu many nie trafił na stos');
  assert.equal(textOf(dom.get('table-note')), '');
});

test('kreator many (E.3a): Anuluj przerywa płatność — rzut nie odpala, mana zostaje w puli', () => {
  dom.get('seed').value = '1';
  dom.get('deck-human').value = 'many-wizard';
  dom.get('deck-bot').value = 'many-wizard';
  dom.get('new-game').click();
  assert.equal(driveToManaWizard(), 'wizard', 'nie dotarto do kreatora many');
  wizardSourceButtons()[0].click();
  assert.equal(dom.get('mana-wizard').className, 'modal active');
  const walk = (el, acc = []) => { for (const c of el.children ?? []) { acc.push(c); walk(c, acc); } return acc; };
  const cancel = walk(dom.get('mana-wizard-body')).find((el) => /Anuluj płatność/.test(el.text ?? ''));
  assert.ok(cancel, 'brak przycisku Anuluj w kreatorze many');
  cancel.click();
  assert.equal(dom.get('mana-wizard').className, 'modal', 'Anuluj ma zamknąć kreator');
  assert.ok(!textOf(dom.get('stack-zone')).includes('Curate'), 'anulowany rzut nie może trafić na stos');
  assert.equal(textOf(dom.get('table-note')), '');
});

// --- Zgłoszenia 2026-08-07 przed scaleniem PR #32 ---------------------------

test('Tasuj talię: przycisk podmienia seed na losowy (nie rusza bieżącej partii)', () => {
  restart('42');
  const before = dom.get('seed').value;
  assert.equal(before, '42');
  dom.get('shuffle-seed').click();
  const after = Number.parseInt(dom.get('seed').value, 10);
  assert.ok(Number.isInteger(after) && after >= 1 && after <= 999999, `seed po tasowaniu: ${after}`);
  // Bieżąca partia (status) pozostaje nietknięta — seed działa przy następnym starcie.
  assert.match(textOf(dom.get('status')), /Tura 1/);
});

test('autosave: po zagraniu zapis trafia do localStorage, a Wznów autosave odtwarza partię', () => {
  localStorage.clear();
  restart('7');
  // Pierwsze okno człowieka: dobierz kartę (p1 zaczyna turę 1).
  const draw = pickActionButton(dom.get('actions'));
  assert.ok(draw, 'brak akcji w pierwszym oknie');
  draw.click();
  const raw = localStorage.getItem('mtg-table-autosave-v1');
  assert.ok(raw, 'brak autosave po pierwszym zagraniu');
  const saved = JSON.parse(raw);
  assert.equal(saved.seed, 7);
  assert.ok(saved.replay.length > 0, 'autosave nie niesie zapisu replay');
  assert.ok(saved.humanDeck && saved.botDeck, 'autosave nie niesie talii');
  // Wznowienie przez przycisk: sesja odtwarza zapis (stan po dobraniu).
  const lifeBefore = textOf(dom.get('life-own'));
  dom.get('resume-save').click();
  assert.match(textOf(dom.get('table-note')), /Wznowiono partię/);
  assert.equal(textOf(dom.get('life-own')), lifeBefore, 'wznowienie zmieniło stan gry');
  // Po wznowieniu autosave NIE jest świeżą grą — wciąż niesie ten sam replay.
  const raw2 = localStorage.getItem('mtg-table-autosave-v1');
  assert.ok(raw2, 'brak autosave po wznowieniu');
  // Wznowiony replay zachowuje historię (może urosnąć o dograne ruchy bota —
  // nowa gałąź losowania bota), ale NIE może być świeżą grą (0 komend).
  const replay2 = JSON.parse(raw2).replay;
  assert.ok(replay2.length > 0, 'wznowienie nadpisało autosave świeżą grą');
  assert.ok(saved.replay.length <= replay2.length, 'wznowienie skróciło historię');
});

test('auto-start: świeży localStorage startuje nową partię (bez błędu wznowienia)', () => {
  localStorage.clear();
  dom.get('seed').value = '5';
  dom.get('new-game').click();
  assert.equal(textOf(dom.get('table-note')), '');
  assert.match(textOf(dom.get('status')), /Tura 1/);
});

test('wskaźnik tury (2026-08-07): stała informacja „Tura N, gracz, faza" w lewym górnym rogu', () => {
  restart('7');
  const indicator = dom.get('turn-indicator');
  assert.ok(indicator, 'brak wskaźnika tury');
  const text = textOf(indicator);
  assert.match(text, /Tura 1/, `wskaźnik nie pokazuje numeru tury: ${text}`);
  assert.match(text, /Ty|Bot|Czarodziejka|Nieprzyjaciel/, `wskaźnik nie pokazuje gracza: ${text}`);
  assert.match(text, /Główna|Dobieranie|Upkeep|Untap|Koniec|Walka|Atak|Blok|Obrażenia/, `wskaźnik nie pokazuje fazy: ${text}`);
  // Po zagraniu wskaźnik nadal obecny (rerender nie psuje go).
  const first = pickActionButton(dom.get('actions'));
  assert.ok(first, 'brak akcji');
  first.click();
  // Po ruchu sesja może przewinąć do następnego okna (nawet tury bota) —
  // wskaźnik musi pozostać wypełniony (nie znikać).
  const after = textOf(dom.get('turn-indicator'));
  assert.match(after, /Tura \d+/, `wskaźnik znika po ruchu: ${after}`);
  assert.match(after, /Ty|Bot|Czarodziejka|Nieprzyjaciel/, `wskaźnik bez gracza po ruchu: ${after}`);
});

// --- Zgłoszenia 2026-08-07 (brylant): morph label, koszty w akcjach, face-down ---

test('UX A+B: commandLabel — flip morph (nie megamorph), koszt z ikonami', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Bot' }],
    zones: {
      hand: [], battlefield: [
        { id: 'fd', cardId: 'monastery-flock', controllerId: 'p1', faceDown: true, morph: { cost: 3, morphCost: 1, colors: ['U'] }, kind: 'creature' },
      ],
      stack: [], graveyard: [], exile: [], library: [],
    },
    legalCommands: [],
    turn: { number: 1, phase: 'precombat_main', step: 'precombat_main', activePlayerId: 'p1' },
  };
  const session = {
    nameOf: (c) => c ?? '?',
    nameOfObject: () => '?',
    abilitiesOf: () => [],
    cardDetails: () => ({ manaCost: 2, name: 'Monastery Flock' }),
  };
  const label = commandLabel({ type: 'activate_ability', playerId: 'p1', objectId: 'fd', abilityIndex: 0 }, session, view);
  assert.match(label, /morph/, `flip powinien być morph: ${label}`);
  assert.ok(!label.includes('megamorph'), `nie megamorph: ${label}`);
  assert.ok(label.includes('ms-u'), `koszt {U} jako ikona: ${label}`);
  // Koszt czaru z ikonami.
  const spellLabel = commandLabel({ type: 'cast_spell', playerId: 'p1', objectId: 'bolt' }, session, {
    ...view, zones: { ...view.zones, hand: [{ id: 'bolt', cardId: 'brute-force' }] },
  });
  assert.ok(spellLabel.includes('ms-r'), `koszt czaru {R} jako ikona: ${spellLabel}`);
  assert.ok(spellLabel.includes('koszt'), 'etykieta czaru ma koszt');
});


// --- M68: Day/Night — globalny znacznik na stole ---------------------------

test('renderDayNight: ukryty bez designation; dzień/noc z obrazem front/back', () => {
  const host = new MiniEl('#daynight');
  const els = { daynight: host };
  // bez designation — ukryty
  renderDayNight(els, {}, { dayNight: null });
  assert.ok(host.hidden === true, 'ukryty, gdy dayNight null');
  // dzień — obraz front
  renderDayNight(els, {}, { dayNight: 'day' });
  assert.ok(host.hidden === false, 'widoczny przy day');
  const findImg = (el) => {
    const walk = (node, out = []) => {
      if (node.tagName === 'img') out.push(node);
      for (const child of node.children ?? []) walk(child, out);
      return out;
    };
    return walk(el)[0];
  };
  const img = findImg(host);
  assert.ok(img && img.src.includes('front'), `obraz dnia: ${img?.src}`);
  assert.match(host.textContent, /Dzień/);
  // noc — obraz back
  renderDayNight(els, {}, { dayNight: 'night' });
  const img2 = findImg(host);
  assert.ok(img2 && img2.src.includes('back'), `obraz nocy: ${img2?.src}`);
  assert.match(host.textContent, /Noc/);
});
