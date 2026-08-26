import { test, mock } from 'node:test';
import { createCardRegistry } from '../src/cards/card-data.js';
import { renderDayNight, renderUndercity, renderTableView } from '../src/table/render.js';
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
    this.html = '';
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

  // Ikony many (2026-08-07): etykiety akcji są HTML-em (innerHTML). Semantyka
  // przeglądarki (M70): innerHTML „parsuje" znaczniki — widoczny tekst
  // (text/.textContent) to treść BEZ tagów, surowy HTML dostępny w .html.
  set innerHTML(v) {
    this.html = String(v);
    this.text = String(v).replace(/<[^>]*>/g, '');
    this.children = [];
  }

  get innerHTML() {
    // Serializacja jak w DOM: własny surowy HTML + dzieci rekurencyjnie.
    return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join('');
  }

  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  click() { for (const fn of this.listeners.click ?? []) fn({}); }
}

function installMiniDom() {
  // M201 (przy okazji zgłoszeń A/B właściciela): lista identyfikatorów była
  // PRZEPISYWANA RĘCZNIE, więc każda nowa sekcja stołu wywracała harness
  // („Mini-DOM: nieznane id hand-enemy”) zamiast testować zmianę — klasa L26
  // (strażnik z ręczną listą). Bazę bierzemy teraz WPROST z `index.html`
  // (jedno źródło prawdy o układzie), a lista niżej zostaje jako dopełnienie
  // dla elementów tworzonych dynamicznie.
  const htmlIds = [...fs.readFileSync('src/table/index.html', 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  // M198/A+B: 'status' (pusty szary pasek) i 'table-note' (pas komunikatow)
  // usuniete z ukladu; komunikaty ida do warstwy 'notice'.
  const ids = ['selftest', 'seed', 'deck-human', 'deck-bot', 'new-game',
    'notice', 'notice-body', 'notice-ok', 'notice-close',
    'banner', 'stack-zone', 'bf-enemy', 'bf-own', 'grave-enemy', 'grave-own',
    'exile-zone', 'hand', 'actions', 'log', 'card-preview', 'card-preview-body',
    'card-preview-close', 'hover-preview', 'context-menu', 'context-menu-body', 'context-menu-close',
    'export-replay', 'import-replay', 'resume-replay', 'resume-save', 'autosave-info',
    // Zgłoszenie 2026-08-07: przycisk losowego ziarna obok „Rozpocznij partię".
    'shuffle-seed',
    // Wskaźnik tury (2026-08-07): stała informacja w lewym górnym rogu.
    'turn-indicator',
    'life-own', 'life-enemy', 'library-own', 'library-enemy',
    // M197/A3A+A5: przycisk inspektora żyje w boksie liczników stref, a sekcja
    // „podgląd topu (syntetyczny)" zniknęła — zostaje sam panel inspektora.
    // M198/C+D: boksy per gracz + osobny przycisk inspektora.
    'library-menu-panel', 'zone-inspector-close', 'zone-inspector-open',
    'meta-foe', 'meta-own',
    'replay-out', 'replay-summary', 'replay-download', 'replay-file',
    'actions-drawer', 'actions-drawer-close', 'actions-fab', 'actions-fab-count',
    // M25: sekcja „Przebieg tur (dla AI)" — tekst, licznik, przełącznik i kopiowanie.
    'turn-history', 'turn-history-count', 'turn-history-copy', 'turn-history-copy-all', 'turn-history-select',
    // M24: loch Undercity — karta specjalna na stole z zaznaczeniem pokoju.
    'daynight',
    'undercity',
    // M157/F: panel liczników trucizny (jak Undercity/Day-Night).
    'poison',
    // M18: pełny ekran karty (dwuklik / karta bez akcji) i modal ruchu bota.
    'card-fullscreen', 'card-fullscreen-body', 'card-fullscreen-close',
    'choice-request', 'choice-request-body', 'choice-request-close',
    'bot-move', 'bot-move-body', 'bot-move-close', 'bot-move-ok',
    'mana-wizard', 'mana-wizard-body', 'mana-wizard-close',
    // ADR 0012: kreator talii (bez localStorage, tekst + download).
    'deck-builder', 'deck-builder-name', 'deck-builder-plan', 'deck-builder-set', 'deck-builder-color',
    'deck-builder-filter', 'deck-builder-basic-lands', 'deck-builder-card-list', 'deck-builder-summary', 'deck-builder-errors',
    'deck-builder-import', 'deck-builder-import-file', 'deck-builder-publish', 'deck-builder-publish-info',
    'deck-builder-output', 'deck-builder-copy',
    'deck-builder-download', 'deck-builder-status',
    // Batch 15: pasek narzędzi + biblioteka talii (IndexedDB).
    'deck-builder-add-filtered', 'deck-builder-clear', 'deck-builder-library-select',
    'deck-builder-load', 'deck-builder-save', 'deck-builder-save-as', 'deck-builder-delete'];
  const registry = new Map([...new Set([...htmlIds, ...ids])].map((id) => [id, new MiniEl(`#${id}`)]));
  registry.get('seed').value = '13';
  const documentListeners = {};
  globalThis.document = {
    listeners: documentListeners,
    getElementById(id) {
      if (!registry.has(id)) throw new Error(`Mini-DOM: nieznane id ${id}`);
      return registry.get(id);
    },
    createElement: (tag) => new MiniEl(tag),
    // M200/B: linki nazw kart w logu (appendLogLineWithCardLinks) tworzą
    // tekstowe węzły — mock Mini-DOM musiał je obsługiwać.
    createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
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
  green: fs.readFileSync('decks/tarkir.txt', 'utf8'),
  red: fs.readFileSync('decks/warhammer.txt', 'utf8'),
  // Dwukolorowa talia pod kreator many (E.3a): 2 kolory lądów + tanie czary
  // z kolorowym wymaganiem (Curate {1}{U}) — gwarantuje niejednoznaczne
  // pokrycie kosztu (Wyspa+Wyspa+Równina, seed 1).
  // M194/K1 (Batch 47): katalog ma DWA egzemplarze Curate (BRO i STX), więc
  // talia wskazuje DRUK — sama nazwa jest odtąd niejednoznaczna i parser
  // odrzuca ją jawnym błędem, zamiast cicho brać pierwszy pasujący wpis.
  'many-wizard': '# Talia many-wizard\n\n26x Island\n6x Plains\n8x Curate (BRO)\n',
};
await import('../src/table/main.js');

function restart(seed = '13') {
  dom.get('seed').value = seed;
  dom.get('new-game').click();
}

test('strona stołu przechodzi self-test i startuje partię na pierwszej decyzji', () => {
  restart();
  assert.match(textOf(dom.get('selftest')), /✓ Headless engine/, 'self-test nie przeszedł');
  // M198/B: brak błędu = warstwa komunikatów nie została otwarta.
  assert.doesNotMatch(dom.get('notice').className, /active/,
    `błąd startu partii: ${textOf(dom.get('notice-body'))}`);
  const first = pickActionButton(dom.get('actions'));
  assert.ok(first, 'brak przycisków akcji po starcie');
  // M197/A2: tekstowy pasek statusu usunięty (dublował panel graczy) —
  // numer tury żyje teraz w stałym wskaźniku „turn-indicator".
  assert.match(textOf(dom.get('turn-indicator')), /T\.\s*1|Tura 1/);
  // Rozmiar ręki sprawdzamy na SAMEJ ręce (niżej: siedem kafli), nie na
  // usuniętym pasku statusu — to ta sama informacja u źródła.
  // Ręka gracza rysuje nazwy kart z registry. Test sprawdza REGUŁĘ („kafle
  // ręki mają nazwy z rejestru, nie surowe id"), więc zamiast listy tytułów
  // zależnej od tasowania (L25/L53 — każda zmiana talii przelosowuje rękę)
  // pytamy o kształt: siedem kafli z nazwą i linią typów.
  const handText = textOf(dom.get('hand'));
  assert.ok(handText.length > 0, 'ręka nie jest pusta');
  assert.match(handText, /Creature|Instant|Sorcery|Land|Artifact|Enchantment/,
    `kafle ręki niosą linię typów: ${JSON.stringify(handText.slice(0, 120))}`);
  assert.ok(!/\bcard-\d|\bhand-\d/.test(handText), 'brak surowych identyfikatorów obiektów');
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
  assert.match(textOf(dom.get('banner')), /Koniec gry — wygrywa: (Gracz|Bot)/, `brak baneru końca gry: ${textOf(dom.get('banner'))}`);
  assert.match(textOf(log), /Tura gracza/, 'log nie opisuje tur');
  assert.ok(botPauses > 0, 'partia z botem powinna mieć pauzy po istotnych zagraniach bota');
  assert.doesNotMatch(dom.get('notice').className, /active/, textOf(dom.get('notice-body')));
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
  assert.doesNotMatch(dom.get('notice').className, /active/, `start mirror nie powinien zgłaszać błędu: ${textOf(dom.get('notice-body'))}`);
  // M197/A2: tekstowy pasek statusu usunięty (dublował panel graczy) —
  // numer tury żyje teraz w stałym wskaźniku „turn-indicator".
  assert.match(textOf(dom.get('turn-indicator')), /T\.\s*1|Tura 1/);
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
    // M198/D: inspektor otwiera osobny, wycentrowany przycisk pod boksami.
    dom.get('zone-inspector-open').click();
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

test('uwagi A+D (2026-08-10): etykiety akcji w jednym span.action-label, grupa aury pokazuje CO wybieramy', () => {
  const realNow = Date.now();
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.timers.setTime(realNow);
  try {
    const registry = createCardRegistry();
    const mkNomad = (id, controllerId) => ({
      id, cardId: 'goldmeadow-nomad', controllerId, kind: 'creature', power: 1,
      toughness: 1, abilities: [], keywords: [], subtypes: [], tapped: false,
    });
    const view = {
      status: 'active', winnerId: null, playerId: 'p1',
      players: [
        { id: 'p1', name: 'Ty', life: 20, mana: 2 },
        { id: 'p2', name: 'Nieprzyjaciel', life: 20, mana: 0 },
      ],
      zones: {
        stack: [], graveyard: [], exile: [], library: [],
        hand: [{ id: 'aura-1', cardId: 'benevolent-blessing', controllerId: 'p1', kind: 'aura', aura: true }],
        battlefield: [mkNomad('nomad-1', 'p1'), mkNomad('nomad-2', 'p2')],
      },
      turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
      legalCommands: [
        { type: 'cast_permanent', playerId: 'p1', objectId: 'aura-1', targets: ['nomad-1'] },
        { type: 'cast_permanent', playerId: 'p1', objectId: 'aura-1', targets: ['nomad-2'] },
        { type: 'pass_priority', playerId: 'p1' },
      ],
    };
    const session = {
      view: () => view, log: [], reasoning: [], state: { seed: 13 },
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
    renderTableView({ els, session, play: () => {}, onCardClick: () => {}, onChoiceRequest: () => {} });

    const buttons = els.actions.children.filter((c) => (c.className ?? '').split(' ').includes('action'));
    assert.ok(buttons.length >= 2, 'widoczne przyciski akcji');
    // Uwaga D: żaden przycisk akcji nie ma węzłów obok jednego span.action-label
    // (flex-itemami są WYŁĄCZNIE ::before-diament i span — brak „kolumn").
    for (const btn of buttons) {
      assert.match(btn.innerHTML, /^<span class="action-label">[\s\S]*<\/span>$/,
        `etykieta poza span.action-label: ${btn.innerHTML}`);
    }
    // Uwaga A (grupa celów aury): opis CO wybieramy + odmieniona liczba.
    const auraBtn = buttons.find((b) => b.textContent.includes('Aura: Benevolent Blessing'));
    assert.ok(auraBtn, `brak grupy „Aura: Benevolent Blessing": ${els.actions.textContent}`);
    assert.match(auraBtn.textContent, /Aura: Benevolent Blessing \(2 opcje\)$/);
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
  // Ikona many to HTML (ms-u) — asercja na surowym innerHTML, nie na tekście
  // (MiniEl od M70 symuluje semantykę przeglądarki: textContent bez tagów).
  assert.match(dom.get('mana-wizard-body').innerHTML, /ms-u/, 'ikona niebieskiej many w kreatorze');
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
  assert.doesNotMatch(dom.get('notice').className, /active/);
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
  assert.doesNotMatch(dom.get('notice').className, /active/);
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
  // M197/A2: tekstowy pasek statusu usunięty (dublował panel graczy) —
  // numer tury żyje teraz w stałym wskaźniku „turn-indicator".
  assert.match(textOf(dom.get('turn-indicator')), /T\.\s*1|Tura 1/);
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
  assert.match(textOf(dom.get('notice-body')), /Wznowiono partię/);
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
  assert.doesNotMatch(dom.get('notice').className, /active/);
  // M197/A2: tekstowy pasek statusu usunięty (dublował panel graczy) —
  // numer tury żyje teraz w stałym wskaźniku „turn-indicator".
  assert.match(textOf(dom.get('turn-indicator')), /T\.\s*1|Tura 1/);
});

test('wskaźnik tury (2026-08-07): stała informacja „Tura N, gracz, faza" w lewym górnym rogu', () => {
  restart('7');
  const indicator = dom.get('turn-indicator');
  assert.ok(indicator, 'brak wskaźnika tury');
  const text = textOf(indicator);
  // Uwaga A (2026-08-11): skróty „T." / „On" / „ż." — panel ma się mieścić.
  assert.match(text, /T\. 1/, `wskaźnik nie pokazuje numeru tury: ${text}`);
  assert.match(text, /Ty|On|Bot|Czarodziejka|Nieprzyjaciel/, `wskaźnik nie pokazuje gracza: ${text}`);
  assert.match(text, /Główna|Dobieranie|Upkeep|Untap|Koniec|Walka|Atak|Blok|Obrażenia/, `wskaźnik nie pokazuje fazy: ${text}`);
  // Po zagraniu wskaźnik nadal obecny (rerender nie psuje go).
  const first = pickActionButton(dom.get('actions'));
  assert.ok(first, 'brak akcji');
  first.click();
  // Po ruchu sesja może przewinąć do następnego okna (nawet tury bota) —
  // wskaźnik musi pozostać wypełniony (nie znikać).
  const after = textOf(dom.get('turn-indicator'));
  assert.match(after, /T\. \d+/, `wskaźnik znika po ruchu: ${after}`);
  assert.match(after, /Ty|On|Bot|Czarodziejka|Nieprzyjaciel/, `wskaźnik bez gracza po ruchu: ${after}`);
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
  // M127 (uwaga A): nazwa mechaniki wielką literą — „Morph", nie „morph".
  assert.match(label, /Morph/, `flip powinien być Morph: ${label}`);
  assert.ok(!/megamorph/i.test(label), `nie megamorph: ${label}`);
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


// Zgłoszenie właściciela A (2026-08-11): karta Undercity (inicjatywa) na stole
// nie dawała się kliknąć, żeby otworzyć pełny ekran. Teraz miniaturka lochu
// jest klikalna i wywołuje `onUndercityClick` (które w main.js otwiera pełny
// ekran printu przez renderCardFullscreen).
test('renderUndercity: karta lochu jest klikalna i wywołuje onUndercityClick (pełny ekran)', () => {
  const host = dom.get('undercity');
  const els = { undercity: host };
  let clicked = 0;
  // aktywny loch (inicjatywa) — karta ma być widoczna i klikalna
  renderUndercity(els, {}, { initiativePlayerId: 'p1', undercityProgress: { p1: 1 } }, { onClick: () => { clicked += 1; } });
  assert.ok(host.hidden === false, 'karta lochu widoczna, gdy inicjatywa aktywna');
  // znajdź div karty lochu (.undercity-card) z nasłuchiem click
  const walk = (node, acc = []) => { for (const child of node.children ?? []) { acc.push(child); walk(child, acc); } return acc; };
  const card = walk(host).find((el) => String(el.className).includes('undercity-card'));
  assert.ok(card, 'istnieje div .undercity-card');
  assert.ok((card.listeners.click ?? []).length > 0, 'karta lochu ma nasłuch kliknięcia');
  card.click();
  assert.equal(clicked, 1, 'klik na kartę lochu wywołuje onUndercityClick (pełny ekran)');
  // ukryty, gdy nikt nie wszedł
  renderUndercity(els, {}, { initiativePlayerId: null, undercityProgress: {} }, { onClick: () => { clicked += 1; } });
  assert.ok(host.hidden === true, 'ukryty, gdy nikt nie objął inicjatywy');
});


// --- Zgłoszenia 2026-08-11 (przed mergem) A/B/C2/E/F -------------------------

test('C2 (2026-08-11): wskaźnik tury pokazuje życie swoje i przeciwnika', () => {
  restart('7');
  const text = textOf(dom.get('turn-indicator'));
  // M172/A: panel górny nazywa graczy „Gracz"/„Bot" (decyzja właściciela).
  assert.match(text, /Gracz: \d+ ż\./, `brak życia gracza w wskaźniku: ${text}`);
  assert.match(text, /Bot: \d+ ż\./, `brak życia przeciwnika w wskaźniku: ${text}`);
});

test('B (2026-08-11): etykieta aktywacji nie dubluje kosztu zdolności', async () => {
  // commandLabel buduje „Aktywuj: X (koszt …) — <efekt>". Koszt zdolności
  // (abilityCostHtml) i opis efektu (describeAbility z withCost:false) nie mogą
  // się dublować — etykieta ma DOKŁADNIE jeden koszt.
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { commandLabel } = await import('../src/table/render.js');
  const reg = createCardRegistry();
  const soul = reg.get('soulmender');
  assert.ok(soul, 'brak soulmender');
  // Symulujemy widok: source na polu bitwy p1, komenda aktywacji.
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    turn: { number: 1, phase: 'precombat_main', step: 'main' },
    zones: { hand: [], battlefield: [{ id: 'soul', cardId: 'soulmender', controllerId: 'p1', zone: 'battlefield' }] },
    legalCommands: [],
  };
  const session = {
    nameOf: (cardId) => ({ soulmender: 'Soulmender' }[cardId] ?? cardId),
    nameOfObject: (id) => 'Soulmender',
    abilitiesOf: () => soul.abilities,
    cardDetails: () => soul,
  };
  const label = commandLabel({ type: 'activate_ability', objectId: 'soul', abilityIndex: 0 }, session, view);
  // Koszt {T} dokładnie RAZ (ms ms-c T); „koszt" nie może się powtórzyć.
  const costIcons = (label.match(/ms ms-c">T</g) ?? []).length;
  assert.equal(costIcons, 1, `koszt zdublowany w etykiecie: ${label}`);
  const costWords = (label.match(/koszt/g) ?? []).length;
  assert.equal(costWords, 1, `słowo „koszt" zdublowane: ${label}`);
  assert.match(label, /Soulmender/, `brak nazwy karty: ${label}`);
  assert.match(label, /zyskaj 1 życie/, `brak opisu efektu: ${label}`);
});

// --- Feature 2026-08-11: ptaszek wyciszenia opcji (nie przerywaj auto-passu) ---

test('Feature: rzuty/zdolności dostają ptaszek wyciszenia, pass/generyczne nie', () => {
  const registry = createCardRegistry();
  const mkNomad = (id, controllerId) => ({
    id, cardId: 'goldmeadow-nomad', controllerId, kind: 'creature', power: 1,
    toughness: 1, abilities: [], keywords: [], subtypes: [], tapped: false,
  });
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20, mana: 2 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20, mana: 0 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [],
      hand: [{ id: 'nomad-h', cardId: 'goldmeadow-nomad', controllerId: 'p1', kind: 'spell', spell: { timing: 'sorcery' } }],
      battlefield: [mkNomad('nomad-1', 'p1')],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [
      { type: 'cast_permanent', playerId: 'p1', objectId: 'nomad-h' },
      { type: 'pass_priority', playerId: 'p1' },
    ],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
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
  const ignored = new Set();
  const toggled = [];
  renderTableView({
    els, session, play: () => {}, onCardClick: () => {},
    ignoredOptionKeys: ignored, onToggleIgnoredOption: (key) => toggled.push(key),
  });
  const buttons = els.actions.children.filter((c) => (c.className ?? '').split(' ').includes('action'));
  const castBtn = buttons.find((b) => (b.innerHTML ?? '').includes('Goldmeadow'));
  const passBtn = buttons.find((b) => (b.innerHTML ?? '').includes('pass') || (b.innerHTML ?? '').includes('Dalej'));
  assert.ok(castBtn, 'przycisk rzutu');
  // Uwaga B (2026-08-11): ptaszek jest w <label class="action-ignore"> (większy
  // obszar aktywny); sam input to .action-ignore-input wewnątrz labela.
  const cbLabel = castBtn.children.find((c) => c.className === 'action-ignore');
  assert.ok(cbLabel, 'rzut ma ptaszek wyciszenia (label)');
  const cb = cbLabel.children.find((c) => c.tagName === 'input' && c.className === 'action-ignore-input');
  assert.ok(cb, 'rzut ma input ptaszka');
  assert.equal(cb.checked, false, 'startowo odznaczony');
  // Kliknięcie w label ptaszka nie wywołuje play() (stopPropagation) — change woła toggle.
  let played = 0;
  renderTableView({
    els, session, play: () => { played += 1; }, onCardClick: () => {},
    ignoredOptionKeys: ignored, onToggleIgnoredOption: (key) => toggled.push(key),
  });
  const castBtn2 = els.actions.children.filter((c) => (c.className ?? '').split(' ').includes('action'))
    .find((b) => (b.innerHTML ?? '').includes('Goldmeadow'));
  const cbLabel2 = castBtn2.children.find((c) => c.className === 'action-ignore');
  const cb2 = cbLabel2.children.find((c) => c.tagName === 'input' && c.className === 'action-ignore-input');
  // Klik w LABEL (obszar aktywny wokół ptaszka) — stopPropagation, bez play.
  cbLabel2.click();
  assert.equal(played, 0, 'klik w label ptaszka nie gra opcji');
  for (const fn of cb2.listeners.change ?? []) fn();
  assert.equal(toggled.length, 1, 'change przełącza wyciszenie');
  // Pass NIE ma ptaszka.
  const passBtn2 = els.actions.children.filter((c) => (c.className ?? '').split(' ').includes('action'))
    .find((b) => (b.innerHTML ?? '').includes('Dalej') || (b.innerHTML ?? '').includes('pass'));
  assert.ok(passBtn2, 'przycisk pass');
  assert.ok(!passBtn2.children.some((c) => c.className === 'action-ignore'), 'pass bez ptaszka');
});

// --- Bug wykryty żywym testerem stołu (M73b): „Stos — ?" w górnym panelu ----

test('C (bug żywego testera): wskaźnik pokazuje „Stos — <nazwa>", nie „Stos — ?"', () => {
  restart('7');
  let sawName = false;
  for (let i = 0; i < 40; i += 1) {
    const ind = textOf(dom.get('turn-indicator'));
    if (/Stos — \?/.test(ind)) assert.fail(`wskaźnik pokazuje „Stos — ?": ${ind}`);
    if (/Stos — [A-Za-zĄ-Żą-ż]/.test(ind)) { sawName = true; break; }
    const btn = pickActionButton(dom.get('actions'));
    if (!btn) break;
    btn.click();
  }
  assert.ok(sawName, 'wskaźnik nigdy nie pokazał nazwy karty na stosie (bug „Stos — ?")');
});

// --- Morph na stosie: „morph" zamiast „?" (zgłoszenie właściciela, M73b) -------

test('morph na stosie: stack-zone pokazuje „morph", nie „?" (CR 708.2)', () => {
  const registry = createCardRegistry();
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [{ id: 'spell-1', cardId: null, controllerId: 'p2', zone: 'stack', kind: 'spell', faceDown: true, manaCost: 3, spell: { timing: 'sorcery' } }],
      graveyard: [], exile: [], library: [], hand: [], battlefield: [],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const label = textOf(els.stackZone);
  assert.ok(!label.includes('?'), `stack-zone nie może pokazywać „?": ${label}`);
  assert.match(label, /Morph/, `stack-zone ma pokazywać „Morph": ${label}`);
});

// --- Audyt żywym testerem (M73c, brązowa odznaka): 5 błędów ----------------

test('M73c/1: kafel z triggerem pokazuje polski opis, nie „efekt."', () => {
  const registry = createCardRegistry();
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield: [
        {
          id: 'cre-1', cardId: 'springbloom-druid', controllerId: 'p1', zone: 'battlefield', kind: 'creature',
          power: 1, toughness: 1, tapped: false, summoningSickness: true, damage: 0,
          abilities: [{ type: 'triggered', trigger: { event: 'enter_battlefield' }, effect: { type: 'search_library_to_battlefield' } }],
        },
      ],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!bf.includes('efekt'), `kafel nie może pokazywać „efekt": ${bf.slice(0, 200)}`);
  assert.match(bf, /poświęć ląd, szukaj 2 basic landów/, `trigger ma polski opis: ${bf.slice(0, 200)}`);
});

test('M73c/2: opis czaru nie pokazuje surowych slugów (describeSpellEffects)', async () => {
  const { describeSpellEffects } = await import('../src/table/render.js');
  const text = describeSpellEffects({
    effects: [{ type: 'destroy_permanent' }, { type: 'cant_be_regenerated_this_turn' }],
  });
  assert.ok(!text.includes('destroy_permanent'), `surowy slug: ${text}`);
  assert.ok(!text.includes('cant_be_regenerated'), `surowy slug: ${text}`);
  assert.match(text, /zniszcz/, `polski opis zniszczenia: ${text}`);
  assert.match(text, /nie może być regenerowany/, `polski opis regeneracji: ${text}`);
});

test('M73c/3: etykieta celu face-down pokazuje „morph", nie „?" (commandLabel)', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const session = {
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: () => '?',
    cardDetails: () => null, colorsOf: () => [], abilitiesOf: () => [],
  };
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [{ id: 'fd-1', cardId: null, faceDown: true, controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 }],
      stack: [], graveyard: [], library: [], exile: [],
      hand: [{ id: 'spell-1', cardId: 'curate', controllerId: 'p1', zone: 'hand', kind: 'spell', spell: { timing: 'instant' } }],
    },
  };
  const label = commandLabel({ type: 'cast_spell', objectId: 'spell-1', targets: ['fd-1'] }, session, view);
  assert.ok(!label.includes('?'), `etykieta nie może mieć „?": ${label}`);
  assert.match(label, /Curate/, `nazwa czaru: ${label}`);
  assert.match(label, /Morph/, `cel face-down jako „Morph": ${label}`);
});

test('M73c/4: wizard blokujących pokazuje face-down atakującego jako „morph"', async () => {
  const { renderCombatWizard } = await import('../src/table/choice-request.js');
  const MiniHost = class {
    constructor() { this.children = []; this.listeners = {}; this.text = ''; }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
    click() { for (const fn of this.listeners.click ?? []) fn({}); }
  };
  const registry = createCardRegistry();
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [{ id: 'fd-1', cardId: null, faceDown: true, controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 }],
      stack: [], graveyard: [], hand: [], library: [], exile: [],
    },
  };
  const session = {
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: () => '?',
  };
  const host = new MiniHost();
  renderCombatWizard(host, {
    kind: 'blockers', view, session,
    options: [{ assignments: { 'fd-1': [] } }],
    onComplete: () => {}, onCancel: () => {},
  });
  const text = host.textContent;
  assert.ok(!text.includes('?'), `wizard nie może pokazywać „?": ${text.slice(0, 200)}`);
  assert.match(text, /Morph/, `face-down atakujący jako „Morph": ${text.slice(0, 200)}`);
});

test('M73c/5: po zakończeniu partii wskaźnik pokazuje zwycięzcę', () => {
  restart('3');
  const oldConfirm = globalThis.window.confirm;
  globalThis.window.confirm = () => true;
  try {
    // Rozstrzygnij mulligan (jeśli otwarty), żeby odsłonić panel akcji.
    const choice = dom.get('choice-request');
    if (choice.className === 'modal active') {
      const first = dom.get('choice-request-body').children[0];
      if (first) first.click();
    }
    let concede = null;
    for (let i = 0; i < 20 && !concede; i += 1) {
      concede = dom.get('actions').children.find((b) => (b.text ?? '').includes('Poddaj'));
      if (!concede) {
        const btn = pickActionButton(dom.get('actions'));
        if (!btn) break;
        btn.click();
      }
    }
    assert.ok(concede, 'przycisk Poddaj partię');
    concede.click();
    const ind = textOf(dom.get('turn-indicator'));
    assert.match(ind, /Koniec partii — wygrywa/, `wskaźnik pokazuje zwycięzcę: ${ind}`);
    assert.match(ind, /Bot|Gracz/, `wskaźnik wskazuje gracza (M172/A): ${ind}`);
  } finally {
    globalThis.window.confirm = oldConfirm;
  }
});

// --- Audyt żywym testerem (M73d, srebrna odznaka): 10 błędów ---------------

function miniview({ battlefield = [], stack = [], hand = [] } = {}) {
  return {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack, graveyard: [], exile: [], library: [], hand, battlefield },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
}
function minisession(registry, view) {
  return {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
}
function miniels() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) els[key] = new MiniEl(`#${key}`);
  return els;
}

test('M73d/A: kafel artefaktu/enchantmentu NIE pokazuje „choroba" (tylko stwory)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'a1', cardId: 'panics-spellbomb', controllerId: 'p1', zone: 'battlefield', kind: 'artifact', tapped: false, summoningSickness: true, damage: 0 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!bf.includes('choroba'), `artefakt nie może mieć „choroba": ${bf.slice(0, 120)}`);
});

test('M73d/E: log pomija „zadaje 0 obrażeń"', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: (id) => id === 'p1' || id === 'p2' };
  const text = describeGameEvent({ type: 'damage_dealt', source: 's', target: 't', amount: 0 }, helpers, {});
  assert.equal(text, null, `0 obrażeń nie jest logowane: ${text}`);
});

test('M73d/G2: odmiana „mieli 1 kartę" / „2 karty" / „5 kart"', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: (id) => id === 'p1' };
  const one = describeGameEvent({ type: 'cards_milled', playerId: 'p1', amount: 1, fromBottom: false }, helpers, {});
  const two = describeGameEvent({ type: 'cards_milled', playerId: 'p1', amount: 2, fromBottom: false }, helpers, {});
  const five = describeGameEvent({ type: 'cards_milled', playerId: 'p1', amount: 5, fromBottom: false }, helpers, {});
  assert.match(one, /mieli 1 kartę/, one);
  assert.match(two, /mieli 2 karty/, two);
  assert.match(five, /mieli 5 kart/, five);
});

test('M73d/C: cel-gracz w logu czaru to imię, nie „?"', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => '?', isPlayer: (id) => id === 'p1' || id === 'p2' };
  const text = describeGameEvent({ type: 'spell_cast', playerId: 'p1', cardId: 'inspiration', targets: ['p2'] }, helpers, { p1: 'Ty', p2: 'Nieprzyjaciel' });
  assert.ok(!text.includes('cel: ?'), `cel-gracz jako „?": ${text}`);
  assert.match(text, /cel: Nieprzyjaciel/, `imię celu: ${text}`);
});

test('M73d/D: trigger na stosie ma polską nazwę zdarzenia, nie surowy slug', () => {
  const registry = createCardRegistry();
  const view = miniview({ stack: [{ id: 't1', cardId: 'jeskai-devotee', controllerId: 'p2', zone: 'stack', kind: 'trigger', trigger: true, triggerEvent: 'you_cast_second_spell_each_turn' }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const st = textOf(els.stackZone);
  assert.ok(!st.includes('you_cast_second_spell_each_turn'), `surowy event: ${st}`);
  assert.match(st, /drugi czar w turze/, `polska nazwa: ${st}`);
});

test('M73d/F: aktywacja bez celu nie loguje „→ cel:"', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: () => false };
  const text = describeGameEvent({ type: 'ability_activated', playerId: 'p1', cardId: 'soulmender', objectId: 's', abilityIndex: 0, effectTypes: ['gain_life'], targets: [] }, helpers, { p1: 'Ty' });
  assert.ok(!text.includes('→ cel:'), `bezcelowa aktywacja z „cel:": ${text}`);
});

test('M73d/B: opis czaru pokazuje polski typ celu, nie slug', async () => {
  const { describeSpellEffects } = await import('../src/table/render.js');
  const text = describeSpellEffects({ targets: [{ type: 'player' }], effects: [{ type: 'draw_cards', amount: 2 }] });
  assert.ok(!text.includes('cel: player'), `surowy typ celu: ${text}`);
  assert.match(text, /cel: gracz/, `polski typ celu: ${text}`);
});

// =============================================================================
// Diamentowa odznaka (2026-08-11) — audyt UX żywym testerem stołu (15 błędów)
// =============================================================================

test('Diament 1: log skontrowania pokazuje nazwę czaru-kontrującego, nie „(?)"', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const nm = { 'stoic-rebuttal': 'Stoic Rebuttal', 'spread-the-sickness': 'Spread the Sickness' };
  const helpers = { nameOf: (c) => nm[c] ?? c, nameOfObject: () => '?', isPlayer: () => false };
  const text = describeGameEvent({ type: 'spell_countered', cardId: 'spread-the-sickness', counteredByCardId: 'stoic-rebuttal', counteredBy: 'stack-7' }, helpers, {});
  assert.match(text, /Spread the Sickness zostaje skontrowany \(Stoic Rebuttal\)/, text);
  assert.ok(!text.includes('(?)'), `nazwa czaru-kontrującego zgubiona: ${text}`);
});

test('Diament 2: PlayerView clash niesie cardId (nie surowe objectId)', async () => {
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const [id, cardId, ctrl] of [['lib-1', 'highland-game', 'p1'], ['lib-2', 'goblin-piker', 'p2']]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone: 'library',
      kind: 'creature', power: 2, toughness: 1, manaCost: 2, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [],
    });
  }
  state.pendingClash = { choices: ['p1', 'p2'], cards: { p1: 'lib-1', p2: 'lib-2' }, won: false, returnToHandOnWin: false, restorePriorityTo: 'p1' };
  const view = playerView(state, 'p1');
  assert.equal(view.pendingClash.cards.p1, 'highland-game');
  assert.equal(view.pendingClash.cards.p2, 'goblin-piker');
  assert.ok(!String(view.pendingClash.cards.p1).startsWith('lib-'), `surowy objectId: ${view.pendingClash.cards.p1}`);
});

test('Diament 4: etykieta aktywacji nie dubluje celu („cel: <typ>" + „→ cel: <nazwa>")', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'cd', cardId: 'cellar-door', controllerId: 'p1', zone: 'battlefield', kind: 'artifact' }] });
  const session = minisession(registry, view);
  const label = commandLabel({ type: 'activate_ability', objectId: 'cd', abilityIndex: 0, targets: ['p2'] }, session, view);
  assert.ok(!label.includes('cel: gracz:'), `podwójny/techniczny cel: ${label}`);
  assert.match(label, /→ cel: Nieprzyjaciel/, label);
});

test('Diament 5: etykieta wyboru wygnania Dreams jest czytelna', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const view = miniview({});
  const session = minisession(registry, view);
  const label = commandLabel({ type: 'resolve_reveal_exile_hand', playerId: 'p1', cardId: 'h1' }, session, view);
  assert.ok(!label.includes('resolve_reveal_exile_hand'), `surowy slug: ${label}`);
  // M213: etykieta opisuje CZYNNOŚĆ, nie nazywa karty źródłowej (ADR 0002).
  assert.match(label, /Wygnaj z ręki/, label);
});

test('Diament 6: koszt pozamany zdolności (odrzuć/poświęć) nie daje „(koszt )"', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'pr', cardId: 'plague-reaver', controllerId: 'p1', zone: 'battlefield', kind: 'creature' }] });
  const session = minisession(registry, view);
  const label = commandLabel({ type: 'activate_ability', objectId: 'pr', abilityIndex: 1, targets: ['p2'] }, session, view);
  assert.ok(!label.includes('(koszt )'), `pusty koszt: ${label}`);
  assert.match(label, /odrzuć 2 karty, poświęć/, label);
});

test('Diament 7: odmiana obrażeń wg liczby (1/2/5)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: () => false };
  const one = describeGameEvent({ type: 'damage_dealt', source: 's', target: 't', amount: 1 }, helpers, {});
  const two = describeGameEvent({ type: 'damage_dealt', source: 's', target: 't', amount: 2 }, helpers, {});
  const five = describeGameEvent({ type: 'damage_dealt', source: 's', target: 't', amount: 5 }, helpers, {});
  assert.match(one, /zadaje 1 obrażenie/, one);
  assert.match(two, /zadaje 2 obrażenia/, two);
  assert.match(five, /zadaje 5 obrażeń/, five);
});

test('Diament 8: log wyboru odrzucenia jest czytelny (bez „(efekt)")', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: () => false };
  const text = describeGameEvent({ type: 'discard_choice_required', playerId: 'p1', purpose: 'effect', count: 1 }, helpers, { p1: 'Ty' });
  assert.ok(!text.includes('(efekt)'), `techniczny sufiks: ${text}`);
  assert.match(text, /Wybierasz, którą kartę odrzucić efektem/, text);
});

test('Diament 11: token Eldrazi Scion ma nazwę (nie surowy id)', () => {
  const registry = createCardRegistry();
  const tok = registry.get('token_eldrazi_scion');
  assert.ok(tok, 'token_eldrazi_scion zarejestrowany');
  assert.equal(tok.name, 'Eldrazi Scion');
});

test('Diament 12: event triggera „saga_chapter" ma polską etykietę', async () => {
  const { TRIGGER_EVENT_LABELS } = await import('../src/table/session.js');
  assert.equal(TRIGGER_EVENT_LABELS.saga_chapter, 'rozdział sagi');
  // M100/E6: surowy identyfikator triggera w LOGU (audyt Żywym Testerem).
  assert.equal(TRIGGER_EVENT_LABELS.enchantment_you_control_enters, 'wejście enchantmentu pod twoją kontrolę');
});

test('Diament 13: „zyskaj 1 życie" (nie „1 życia")', async () => {
  const { describeSpellEffects } = await import('../src/table/render.js');
  const one = describeSpellEffects({ targets: [], effects: [{ type: 'gain_life', amount: 1 }] });
  const two = describeSpellEffects({ targets: [], effects: [{ type: 'gain_life', amount: 2 }] });
  assert.match(one, /zyskaj 1 życie/, one);
  assert.match(two, /zyskaj 2 życia/, two);
});

test('Diament 14: tryby Etherwrought Page po polsku', () => {
  const registry = createCardRegistry();
  const modes = registry.get('etherwrought-page').abilities[0].trigger.modes.map((m) => m.name);
  assert.ok(!modes.includes('Life Gain'), `angielskie tryby: ${modes.join(', ')}`);
  assert.ok(modes.includes('Zysk 2 życia') && modes.includes('Surveil 1') && modes.includes('Utrata życia'), modes.join(', '));
});

test('Diament 3: zdolność statyczna ma opis (koniec „· ·" — Veiled Ascension)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'v', cardId: 'veiled-ascension', controllerId: 'p1', zone: 'battlefield', kind: 'enchantment' }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!bf.includes('· ·'), `podwójny separator: ${bf.slice(0, 180)}`);
  assert.match(bf, /zakryte stwory wchodzą z licznikiem flying/, bf.slice(0, 220));
});

test('Diament 9: dynamiczna moc źródła (Jyoti) bez surowego „source_power"', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'jyoti', cardId: 'jyoti-moag-ancient', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 4 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!bf.includes('source_power'), `surowy slug: ${bf.slice(0, 220)}`);
  assert.match(bf, /moc źródła/, bf.slice(0, 220));
});

test('Diament 10: keywordy po polsku (Podwójne uderzenie, nie double_strike)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'w', cardId: 'true-conviction', controllerId: 'p1', zone: 'battlefield', kind: 'creature', keywords: ['double_strike', 'lifelink'], power: 2, toughness: 2 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!bf.includes('double_strike'), bf.slice(0, 220));
  assert.match(bf, /Podwójne uderzenie/, bf.slice(0, 220));
});

test('Diament 15: nakładka gospodarza używa „zaczarowana:/wyposażona:" (nie aura:/equip:)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [
    { id: 'host', cardId: 'rustwing-falcon', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 2 },
    { id: 'aura1', cardId: 'hobble', controllerId: 'p1', zone: 'battlefield', kind: 'aura', attachedTo: 'host', aura: true },
    { id: 'eq1', cardId: 'cloak-of-the-bat', controllerId: 'p1', zone: 'battlefield', kind: 'equipment', attachedTo: 'host', equipment: true },
  ] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.match(bf, /zaczarowana:/, bf.slice(0, 260));
  assert.ok(!bf.includes('aura:'), `angielska etykieta aura:: ${bf.slice(0, 260)}`);
  assert.ok(!bf.includes('equip:'), `angielska etykieta equip:: ${bf.slice(0, 260)}`);
});

test('Diament 16: cel czaru w logu używa LKI (koniec „→ cel: ?")', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const nm = { 'bone-splinters': 'Bone Splinters', 'gorger-wurm': 'Gorger Wurm' };
  const helpers = { nameOf: (c) => nm[c] ?? c, nameOfObject: () => '?', isPlayer: () => false };
  const text = describeGameEvent({ type: 'spell_cast', playerId: 'p2', cardId: 'bone-splinters', targets: ['dead-obj'], targetCardIds: ['gorger-wurm'] }, helpers, { p2: 'Nieprzyjaciel' });
  assert.ok(!text.includes('cel: ?'), `cel zgubiony: ${text}`);
  assert.match(text, /→ cel: Gorger Wurm/, text);
});

// =============================================================================
// Uwaga D (2026-08-11): odrzucenie karty przy limicie ręki — czytelny modal
// (nazwy kart), gramatyka i brak „Ruchu przeciwnika\" dla decyzji człowieka.
// =============================================================================
test('Diament/D: opcja odrzucenia pokazuje NAZWĘ karty, nie powtórzony typ', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const view = miniview({ hand: [{ id: 'h1', cardId: 'highland-game', controllerId: 'p1', zone: 'hand', kind: 'creature' }] });
  const session = minisession(registry, view);
  const label = commandLabel({ type: 'resolve_discard_choice', playerId: 'p1', cardId: 'h1' }, session, view);
  assert.ok(!label.includes('resolve_discard_choice'), `surowy slug: ${label}`);
  assert.match(label, /Odrzuć:/, label);
  assert.match(label, /Highland Game/, `brak nazwy karty: ${label}`);
});

test('Diament/D: komunikat odrzucenia przy limicie ręki jest gramatyczny', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => 'x', isPlayer: () => false };
  const cost = describeGameEvent({ type: 'discard_choice_required', playerId: 'p1', purpose: 'cost', count: 1 }, helpers, { p1: 'Ty' });
  const hs = describeGameEvent({ type: 'discard_choice_required', playerId: 'p1', purpose: 'hand_size', count: 2 }, helpers, { p1: 'Ty' });
  assert.match(cost, /Wybierasz, którą kartę odrzucić jako koszt/, cost);
  assert.ok(!cost.includes('(efekt)'), cost);
  assert.match(hs, /Wybierasz, którą kartę odrzucić przy limicie ręki/, hs);
  assert.ok(!hs.includes('efektem'), hs);
});

// ---------------------------------------------------------------------------
// M100/E10 (P12 — Żywy Tester h01): obj nameOfObject za twardo — WŁASNY morph
// pokazywany jako „morph" w etykietach („Rzuć: Village Rites — poświęć morph"),
// choć właściciel zna tożsamość własnej zakrytej karty (CR 708.6). Morf
// PRZECIWNIKA zostaje „morph" (CR 708.2).
// ---------------------------------------------------------------------------

test('M100 P12: etykieta poświęcenia WŁASNEGO morpha nazywa kartę (CR 708.6)', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  const view = miniview({
    battlefield: [{ id: 'mv1', cardId: 'segmented-krotiq', controllerId: 'p1', zone: 'battlefield', kind: 'creature', faceDown: true }],
  });
  const session = minisession(registry, view);
  const label = commandLabel({ type: 'cast_spell', objectId: 'village-rites', sacrificeTargetId: 'mv1' }, session, view);
  assert.match(label, /poświęć Segmented Krotiq/, `własny morph nazwany: ${label}`);
  // M100/E12 (pytanie właściciela): nazwa NIE może ukrywać, że to wciąż
  // morph — inaczej gracz myśli, że to pełna kreatura.
  assert.match(label, /Segmented Krotiq \(Morph/, `nazwa MUSI nieść znacznik Morph: ${label}`);
});

test('M100 E12: sesja — własny morph w logu ma nazwę + „(morph)\", wrogi bez zmian', async () => {
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText('# Talia A\n20x Forest\n20x Island', registry).cardIds],
    [BOT_ID, parseDeckText('# Talia B\n20x Forest\n20x Island', registry).cardIds],
  ]);
  const session = createSession({ registry, decks, seed: 3 });
  // Wstrzykujemy zakryte obiekty (wzór face-down jak w fow-facedown-names).
  session.state.objects.set('mine', Object.freeze({
    id: 'mine', instanceId: 'i-mine', cardId: 'segmented-krotiq', controllerId: HUMAN_ID,
    ownerId: HUMAN_ID, zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    keywords: [], faceDown: true,
  }));
  session.state.objects.set('theirs', Object.freeze({
    id: 'theirs', instanceId: 'i-theirs', cardId: 'segmented-krotiq', controllerId: BOT_ID,
    ownerId: BOT_ID, zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    keywords: [], faceDown: true,
  }));
  const mine = session.nameOfObject('mine');
  const theirs = session.nameOfObject('theirs');
  assert.match(mine, /Segmented Krotiq \(Morph\)/, `własny morph nazwany ZE znacznikiem: ${mine}`);
  assert.equal(theirs, 'Morph', `wrogi morph bez nazwy (FoW): ${theirs}`);
});

test('M100 P12: morph PRZECIWNIKA zostaje „morph" (FoW, CR 708.2)', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const registry = createCardRegistry();
  // playerView maskuje cardId wrogiego face-down → null.
  const view = miniview({
    battlefield: [{ id: 'mv2', cardId: null, controllerId: 'p2', zone: 'battlefield', kind: 'creature', faceDown: true }],
  });
  const session = minisession(registry, view);
  const label = commandLabel({ type: 'cast_spell', objectId: 'village-rites', targets: ['mv2'] }, session, view);
  assert.ok(!label.includes('Segmented Krotiq'), `brak wycieku: ${label}`);
  assert.match(label, /Morph/, `wróg zakryty = „Morph": ${label}`);
});

// ---------------------------------------------------------------------------
// M100/E10 — etykiety i opisy z Żywego Testera (transkrypty w tools/table-tester)
// ---------------------------------------------------------------------------

test('M100 P7: mentor ma opis efektu (koniec pustego „jako mentor: ." — h08/h13)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'bc', cardId: 'boros-challenger', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 3 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!/jako mentor: \./.test(bf), `pusty opis mentora: ${bf.slice(0, 220)}`);
  assert.match(bf, /jako mentor: [^.]*licznik \+1\/\+1\./, `mentor ma zdanie efektu: ${bf.slice(0, 260)}`);
});

test('M100 P8: aura pokazuje efekty statyczne (pump + keywords + grant many) — h09/h13', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [
    { id: 'ne', cardId: 'natures-embrace', controllerId: 'p1', zone: 'battlefield', kind: 'aura' },
    { id: 'se', cardId: 'shivs-embrace', controllerId: 'p1', zone: 'battlefield', kind: 'aura' },
  ] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  // textOf DOM nie ma separatorów „ · " między polami meta karty (te dopisuje
  // ekstraktor testera) — asercje na same klauzule opisu aury.
  assert.match(bf, /Nature's Embrace[\s\S]*?stwór: \+2\/\+2/, `pump aury widoczny: ${bf.slice(0, 300)}`);
  assert.match(bf, /Nature's Embrace[\s\S]*?ląd: „T: dodaj 2 many/, `grant many widoczny: ${bf.slice(0, 300)}`);
  assert.match(bf, /Shiv's Embrace[\s\S]*?stwór: \+2\/\+2 · stwór ma: Latanie/, `pump+keyword aury: ${bf.slice(0, 400)}`);
});

test('M100 P9: ekwipunek bez gołego kosztu „· {4}" na końcu opisu — h09/h13', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'bp', cardId: 'brawlers-plate', controllerId: 'p1', zone: 'battlefield', kind: 'artifact' }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!/· \{4\}\s*(\||$)/.test(bf), `goły „{4}" po opisie equipa: ${bf.slice(0, 260)}`);
  assert.match(bf, /Equip \{4\} — nosiciel: Zadeptywanie \+2\/\+2/, `pełny opis equip zostaje: ${bf.slice(0, 260)}`);
});

test('M100 P11: cel „dowolny" bez pleonazmu „cel: dowolny cel" — h08', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'bw', cardId: 'ballista-watcher', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 4, toughness: 3 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!bf.includes('cel: dowolny cel'), `pleonazm: ${bf.slice(0, 260)}`);
  assert.match(bf, /dowolny cel/, `informacja o celu zostaje: ${bf.slice(0, 260)}`);
});

// ---------------------------------------------------------------------------
// M100/E12 (pytanie właściciela 2026-08-15): kafel WŁASNEGO morpha — nazwa
// NIE może ukrywać, że to wciąż morph. „Zeby gracz wiedzial, ze to jednak
// jest morph a nie pelna kreatura." Wróg bez zmian (FoW, CR 708.2).
// ---------------------------------------------------------------------------

test('M100 E12: kafel własnego morpha — prawdziwa nazwa + znacznik „zakryty", staty 2/2', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'm1', cardId: 'segmented-krotiq', controllerId: 'p1', zone: 'battlefield', kind: 'creature', faceDown: true, power: 2, toughness: 2 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.match(bf, /Segmented Krotiq/, `własny morph nazwany na kaflu: ${bf.slice(0, 260)}`);
  // M127 (uwaga A): znacznik pisany wielką literą — „zakryty (Morph)".
  assert.match(bf, /zakryty \(Morph\)/, `znacznik morpha na kaflu: ${bf.slice(0, 260)}`);
  assert.match(bf, /2\/2/, `staty zakrytego zostają 2/2: ${bf.slice(0, 260)}`);
});

test('M100 E12: kafel morpha PRZECIWNIKA bez zmian — „Face-down creature" (FoW)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'm2', cardId: null, controllerId: 'p2', zone: 'battlefield', kind: 'creature', faceDown: true, power: 2, toughness: 2 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfEnemy);
  assert.match(bf, /Face-down creature/, `wróg zakryty bez nazwy: ${bf.slice(0, 260)}`);
  // M127: badge cudzego zakrytego permanentu też wielką literą.
  assert.match(bf, /Morph/, `badge „Morph" na kaflu wroga: ${bf.slice(0, 260)}`);
  assert.ok(!bf.includes('Segmented Krotiq'), `wyciek nazwy: ${bf.slice(0, 260)}`);
});

// ---------------------------------------------------------------------------
// M100/E14 (zgłoszenie B właściciela): badge „choroba" — stwór z haste nie
// dostaje badge (choroba nie ogranicza go w niczym — CR 302.6 + 702.10).
// Puppeteer Clique wyciąga ze haste, a badge sugerował, że nie może atakować.
// ---------------------------------------------------------------------------

test('M100 E14: stwór z haste NIE dostaje badge „choroba" (Puppeteer Clique)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 'h1', cardId: 'dawntreader-elk', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, summoningSickness: true, keywords: ['haste'], damage: 0 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.ok(!bf.includes('choroba'), `haste wyłącza badge choroby: ${bf.slice(0, 200)}`);
});

test('M100 E14: stwór bez haste z chorobą nadal ma badge (regresja)', () => {
  const registry = createCardRegistry();
  const view = miniview({ battlefield: [{ id: 's1', cardId: 'dawntreader-elk', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, summoningSickness: true, keywords: [], damage: 0 }] });
  const els = miniels();
  renderTableView({ els, session: minisession(registry, view), play: () => {}, onCardClick: () => {} });
  const bf = textOf(els.bfOwn);
  assert.match(bf, /choroba/, `badge choroby zostaje bez haste: ${bf.slice(0, 200)}`);
});

// ---------------------------------------------------------------------------
// M100/E13 (zgłoszenie A właściciela): log equipa — wcześniej 3 linie na
// jedną aktywację („zdolność X rozstrzygnięta" bez nazwy zdolności +
// „X wyposaża Y" + „wyposaża: X → Y"). Teraz: jedna linia intencji z nazwą
// zdolności + jedna linia skutku; rozstrzygnięcie z sukcesem kończy się
// linią attach, fizzle jest opisane z powodem.
// ---------------------------------------------------------------------------

test('M100 E13: aktywacja equipa mówi „aktywuje Equip" z celem (intencja, nie skutek)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = {
    nameOf: (c) => c,
    nameOfObject: (id) => id,
    isPlayer: (id) => id === 'p1' || id === 'p2',
  };
  const text = describeGameEvent({
    type: 'ability_activated', playerId: 'p2', keyword: 'equip',
    objectId: 'hunters-blowgun', targets: ['apprentice-wizard'],
  }, helpers, { p1: 'Ty', p2: 'Nieprzyjaciel' });
  assert.match(text, /aktywuje Equip/, `linia aktywacji nazywa zdolność: ${text}`);
  assert.match(text, /hunters-blowgun/, `sprzęt w linii: ${text}`);
  assert.match(text, /cel: apprentice-wizard/, `cel w linii: ${text}`);
});

test('M100 E13: rozstrzygnięty equip NIE dubluje logu (sukces bez dodatkowej linii rozstrzygnięcia)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: (id) => id, isPlayer: () => false };
  const ok = describeGameEvent({
    type: 'ability_resolved', playerId: 'p2', cardId: 'hunters-blowgun',
    keyword: 'equip', fizzled: false, abilityIndex: 0, sourceId: 'x',
  }, helpers, { p1: 'Ty', p2: 'Nieprzyjaciel' });
  assert.equal(ok, null, `sukces equipa opisuje linia attach, nie osobna linia: ${ok}`);
});

test('M100 E13: equip sfizlowany MUSI być opisany (z etykietą Equip i powodem)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: (id) => id, isPlayer: () => false };
  const text = describeGameEvent({
    type: 'ability_resolved', playerId: 'p2', cardId: 'hunters-blowgun',
    keyword: 'equip', fizzled: true, abilityIndex: 0, sourceId: 'x',
  }, helpers, { p1: 'Ty', p2: 'Nieprzyjaciel' });
  assert.match(text, /Equip/, `fizzle z etykietą zdolności: ${text}`);
  assert.match(text, /bez efektu|nielegaln/, `fizzle z powodem: ${text}`);
});

test('M100 E13: object_attached via equip bez zmian — „X wyposaża Y" (regresja)', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => '?', isPlayer: () => false };
  const text = describeGameEvent({
    type: 'object_attached', cardId: 'hunters-blowgun', hostId: 'stale-id', hostCardId: 'apprentice-wizard', via: 'equip',
  }, helpers, { p1: 'Ty', p2: 'Nieprzyjaciel' });
  assert.equal(text, 'hunters-blowgun wyposaża apprentice-wizard');
});

// --- M112: sekcja `combat` z PlayerView na stole (ADR 0017) -----------------
// Do tej pory kafle pola bitwy NIE pokazywały walki: gracz widział tapnięcie,
// ale nie to, kto atakuje, kto blokuje i kto jest niezablokowany. Dane są
// w widoku od M107 (`view.combat` — informacja publiczna, CR 508/509),
// warstwa stołu po prostu z nich nie korzystała.

test('M112: kafle pokazują walkę z sekcji combat (atakuje / blokuje / niezablokowany)', () => {
  const registry = createCardRegistry();
  const mkCreature = (id, controllerId) => ({
    id, cardId: 'goldmeadow-nomad', controllerId, kind: 'creature', power: 1,
    toughness: 1, abilities: [], keywords: [], subtypes: [], tapped: false,
    zone: 'battlefield',
  });
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20, mana: 0 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20, mana: 0 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [], hand: [],
      battlefield: [
        mkCreature('atak-1', 'p1'), mkCreature('atak-2', 'p1'),
        mkCreature('blok-1', 'p2'),
      ],
    },
    turn: { number: 4, activePlayerId: 'p1', phase: 'combat', step: 'declare_blockers' },
    combat: {
      attackers: ['atak-1', 'atak-2'],
      attackingPlayerId: 'p1',
      defendingPlayerId: 'p2',
      blockers: { 'atak-1': ['blok-1'] },
      blockedAttackers: ['atak-1'],
      unblockedAttackers: ['atak-2'],
      damageAssigned: false,
    },
    legalCommands: [{ type: 'pass_priority', playerId: 'p1' }],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    nameOfObject: (objectId) => ({ 'atak-1': 'Atakujący A', 'atak-2': 'Atakujący B', 'blok-1': 'Blokujący' }[objectId] ?? objectId),
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const own = els.bfOwn.textContent;
  const enemy = els.bfEnemy.textContent;
  assert.match(own, /atakuje/, `kafel atakującego bez znacznika: ${own}`);
  assert.match(own, /niezablokowany/, 'niezablokowany atakujący ma być oznaczony (to on zada obrażenia graczowi)');
  assert.match(enemy, /blokuje/, `kafel blokującego bez znacznika: ${enemy}`);
});
