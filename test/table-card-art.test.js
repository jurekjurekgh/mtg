import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { CARD_BACK_URL } from '../src/table/card-images.js';
import { renderCardPreview, renderHoverPreview, renderMiniFace, renderTableView } from '../src/table/render.js';

/**
 * Ilustracje realnych kart na stole (poz. 10.1 PROJECT_STATE).
 *
 * Kontrakt renderu:
 *  - kafel karty z realnym drukiem tworzy `<img class="card-img">` z adresem
 *    `imageUri` przeskalowanym do rozmiaru `normal`, ładowanym leniwie;
 *  - syntetyczna twarz zostaje w DOM jako fallback i to ona jest widoczna,
 *    dopóki obraz się nie wczyta (a po błędzie 404/sieci — na stałe);
 *  - obraz w trakcie ładowania NIE jest ukryty przez `display: none`
 *    (przeglądarka nie pobiera wtedy pliku, a przy `loading="lazy"` nie
 *    pobiera go nigdy) — leży warstwą na twarzy z klasą `is-loading`;
 *  - karta zakryta pokazuje wspólny rewers, nie swoją ilustrację (FoW);
 *  - DFC po transformacji pokazuje ilustrację tyłu;
 *  - hover używa TEGO SAMEGO obrazu w rozmiarze `large`, a scroll rotuje tory.
 *
 * Test jest headless: mini-DOM w pamięci, żadnego pobierania obrazów
 * (`load`/`error` odpalamy ręcznie).
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
    this.src = '';
    this.alt = '';
    this.value = '';
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }

  /** Wszystkie elementy w poddrzewie (do wyszukiwania po klasie/tagu). */
  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }

  find(predicate) { return this.descendants().find(predicate) ?? null; }

  findAll(predicate) { return this.descendants().filter(predicate); }
}

function installMiniDom() {
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  globalThis.window = { innerWidth: 1400, innerHeight: 900, matchMedia: () => ({ matches: false }) };
}

installMiniDom();

const isImg = (el) => el.tagName === 'img';
const imagesIn = (host) => host.findAll(isImg);
const facesIn = (host) => host.findAll((el) => el.className.startsWith('face '));

function buildSession(humanDeck, botDeck = 'red.txt', seed = 7) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanDeck}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botDeck}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, session: createSession({ seed, registry, decks }) };
}

/** Minimalny zestaw kontenerów, jakiego oczekuje renderTableView. */
function makeEls() {
  const keys = ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'actions', 'actionsCount', 'log', 'hoverPreview'];
  return Object.fromEntries(keys.map((key) => [key, new MiniEl(`#${key}`)]));
}

/** Sztuczny obiekt gry (bez pełnej partii) do renderu pojedynczego kafla. */
function fakeSession(registry, object) {
  return {
    view: () => ({ zones: { hand: [], battlefield: [object], stack: [], graveyard: [], exile: [], library: [] } }),
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
}

function battlefieldObject(cardId, extra = {}) {
  return {
    id: `permanent-1`, cardId, controllerId: HUMAN_ID, zone: 'battlefield', kind: 'creature',
    tapped: false, summoningSickness: false, damage: 0, ...extra,
  };
}

test('kafel realnej karty renderuje ilustrację druku w rozmiarze normal, leniwie', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  const session = fakeSession(registry, battlefieldObject('highland-game'));
  renderMiniFace(host, session, 'permanent-1');

  const img = imagesIn(host)[0];
  assert.ok(img, 'kafel realnej karty musi mieć element <img>');
  assert.match(img.className, /^card-img\b/);
  assert.ok(img.className.includes('is-loading'), 'obraz startuje jako przezroczysta warstwa, nie display:none');
  assert.notEqual(img.style.display, 'none', 'display:none blokuje pobranie obrazu przez przeglądarkę');
  assert.equal(img.loading, 'lazy', 'obrazy ładują się leniwie (dziesiątki kart na stole)');
  assert.equal(img.decoding, 'async');
  assert.match(img.src, /^https:\/\/cards\.scryfall\.io\/normal\/front\//);
  assert.equal(img.alt, 'Highland Game');
});

test('do czasu wczytania widać syntetyczną twarz; po wczytaniu ustępuje ilustracji', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  renderMiniFace(host, fakeSession(registry, battlefieldObject('highland-game')), 'permanent-1');

  const img = imagesIn(host)[0];
  const face = facesIn(host)[0];
  const visual = host.find((el) => el.className.startsWith('cardvis'));
  assert.ok(face, 'twarz musi istnieć jako fallback');
  assert.notEqual(img.style.display, 'none', 'obraz musi być pobieralny, więc nie może mieć display:none');
  assert.ok(img.className.includes('is-loading'), 'do czasu wczytania obraz jest przezroczystą warstwą');
  assert.notEqual(face.style.display, 'none');
  assert.equal(visual.className.includes('has-img'), false);

  img.emit('load');
  assert.equal(img.style.display, '');
  assert.equal(img.className.includes('is-loading'), false, 'po wczytaniu obraz przestaje być przezroczysty');
  assert.equal(face.style.display, 'none', 'wczytana ilustracja zastępuje twarz');
  assert.ok(visual.className.includes('has-img'), 'kontener oznacza tryb ilustracji dla nakładek CSS');
});

test('błąd ładowania wraca do syntetycznej twarzy (fallback), bez pustego kafla', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  renderMiniFace(host, fakeSession(registry, battlefieldObject('highland-game')), 'permanent-1');

  const img = imagesIn(host)[0];
  const face = facesIn(host)[0];
  img.emit('error'); // jedyny kandydat przepadł
  assert.equal(img.style.display, 'none');
  assert.notEqual(face.style.display, 'none');
  assert.match(host.textContent, /Highland Game/, 'twarz nadal opisuje kartę tekstem');
});

test('REGRESJA: żaden kafel ze skanem nie startuje z display:none (lazy + none = brak pobrania)', () => {
  const registry = createCardRegistry();
  // Realna karta, wirtualny land podstawowy i karta z Batcha 7 — wszystkie
  // muszą realnie pobrać obraz, a nie utknąć na syntetycznej twarzy.
  for (const cardId of ['highland-game', 'basic-swamp', 'puppeteer-clique']) {
    const host = new MiniEl('#host');
    renderMiniFace(host, fakeSession(registry, battlefieldObject(cardId)), 'permanent-1');
    const img = imagesIn(host)[0];
    assert.ok(img, `${cardId}: kafel musi mieć <img> ze skanem`);
    assert.notEqual(
      img.style.display, 'none',
      `${cardId}: obraz z display:none nie zostanie pobrany przez przeglądarkę (przy loading=lazy nigdy)`,
    );
    assert.ok(img.src.startsWith('https://'), `${cardId}: kafel celuje w Scryfall`);
  }
});

test('wirtualny land podstawowy dostaje skan Scryfalla, nie kolorową twarz', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  const land = { ...battlefieldObject('basic-swamp'), kind: 'land', power: null, toughness: null };
  renderMiniFace(host, fakeSession(registry, land), 'permanent-1');
  const img = imagesIn(host)[0];
  assert.ok(img, 'land podstawowy też pokazuje skan karty');
  assert.match(img.src, /api\.scryfall\.com\/cards\/named\?exact=Swamp/);
  assert.notEqual(img.style.display, 'none');
});

test('token z imageUri renderuje się ze skanem (zestaw tokenowy)', () => {
  // Od B23 tokeny mają imageUri ze Scryfalla (zestaw tokenowy karty tworzącej,
  // np. tm10 dla Howl of the Night Pack → Wolf). Kafel w renderze tworzy
  // <img> z tym adresem, a syntetyczna twarz zostaje fallbackiem do czasu
  // wczytania (jak realna karta). Sprawdzamy oba fakty naraz.
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  renderMiniFace(host, fakeSession(registry, battlefieldObject('token_wolf')), 'permanent-1');
  const imgs = imagesIn(host);
  assert.equal(imgs.length, 1, 'token z imageUri generuje dokładnie jeden <img>');
  assert.match(imgs[0].src, /^https:\/\/cards\.scryfall\.io\/normal\/front\//);
  assert.match(host.textContent, /Wolf/);
});

test('karta zakryta pokazuje wspólny rewers, nie swoją ilustrację (FoW)', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  const object = battlefieldObject('kappa-tech-wrecker', { faceDown: true, power: 2, toughness: 2 });
  renderMiniFace(host, fakeSession(registry, object), 'permanent-1');

  const img = imagesIn(host)[0];
  assert.equal(img.src, CARD_BACK_URL);
  assert.equal(img.alt, 'Karta zakryta');
  assert.equal(host.textContent.includes('Kappa'), false, 'nazwa zakrytej karty nie może wyciec do DOM-u');
});

test('DFC: po transformacji kafel pokazuje ilustrację tyłu', () => {
  const registry = createCardRegistry();
  const front = new MiniEl('#front');
  const back = new MiniEl('#back');
  renderMiniFace(front, fakeSession(registry, battlefieldObject('grizzled-outcasts')), 'permanent-1');
  renderMiniFace(back, fakeSession(registry, battlefieldObject('krallenhorde-wantons')), 'permanent-1');

  assert.match(imagesIn(front)[0].src, /cards\.scryfall\.io\/normal\/front\/4\/b\//);
  assert.match(imagesIn(back)[0].src, /cards\.scryfall\.io\/normal\/back\/4\/b\//);
});

test('wirtualny land podstawowy ma stały druk ilustracji ze Scryfall', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  const land = battlefieldObject('basic-swamp', { kind: 'land', power: null, toughness: null });
  renderMiniFace(host, fakeSession(registry, land), 'permanent-1');
  assert.equal(imagesIn(host)[0].src, 'https://api.scryfall.com/cards/named?exact=Swamp&format=image&version=normal');
});

test('nakładka stanu opisuje to, czego nie widać na druku (obrażenia, choroba, P/T)', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  const object = battlefieldObject('highland-game', {
    damage: 1, summoningSickness: true, power: 3, toughness: 1, powerModifier: 1, toughnessModifier: 0,
  });
  renderMiniFace(host, fakeSession(registry, object), 'permanent-1');

  const overlay = host.find((el) => el.className === 'ovl');
  assert.ok(overlay, 'kafel z ilustracją musi mieć nakładkę stanu');
  assert.match(overlay.textContent, /−1/);
  assert.match(overlay.textContent, /choroba/);
  assert.match(overlay.textContent, /3\/1/);
  assert.ok(overlay.find((el) => el.className.includes('mod')), 'zmodyfikowane P/T jest wyróżnione');
});

test('tapnięta karta dostaje klasę obracającą CAŁY kafel (obraz razem z ramką)', () => {
  const { session } = buildSession('green.txt');
  const els = makeEls();
  // Pierwszy render: sprawdzamy strukturę, nie przebieg partii.
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const handTiles = els.hand.findAll((el) => el.className.startsWith('tile'));
  assert.ok(handTiles.length > 0, 'ręka gracza nie może być pusta na starcie');
  for (const tileEl of handTiles) {
    assert.ok(tileEl.find((el) => el.className.startsWith('cardvis')), 'kafel opakowuje wizualizację karty');
  }
  // Klasa `tapped` jest na kaflu; CSS obraca `.tile.tapped .cardvis`.
  const css = fs.readFileSync('src/table/index.html', 'utf8');
  assert.match(css, /\.tile\.tapped \.cardvis \{ transform: rotate\(90deg\); \}/);
});

test('hover pokazuje ten sam obraz w rozmiarze large i rotuje tory scrollem', () => {
  const registry = createCardRegistry();
  const info = {
    objectId: 'permanent-1', cardId: 'highland-game', name: 'Highland Game', colors: ['G'],
    kind: 'creature', types: ['Creature'], subtypes: [], keywords: [], manaCost: 2,
    livePower: 2, liveToughness: 1, abilities: [], set: 'KTK',
    imageUri: registry.get('highland-game').imageUri, artId: null,
  };
  const host = new MiniEl('#hover');
  renderHoverPreview(host, info, 'scryfall');
  const img = imagesIn(host)[0];
  assert.match(img.src, /cards\.scryfall\.io\/large\/front\//);
  assert.equal(img.style.width, '320px');
  assert.match(host.textContent, /Scryfall/, 'okno podpowiada aktualny tor podglądu');

  // Tor FOT bez artId spada na tę samą kartę ze Scryfalla, ale ma kształt 21:9.
  const fot = new MiniEl('#hover-fot');
  renderHoverPreview(fot, info, 'fot');
  assert.equal(imagesIn(fot)[0].style.width, '900px');
  assert.match(fot.textContent, /panoramiczna/);

  // Z artId (uzupełnianym przez tools/fetch-art-ids.mjs) tor lokalny wygrywa.
  const local = new MiniEl('#hover-local');
  renderHoverPreview(local, { ...info, artId: 512 }, 'kon');
  assert.equal(imagesIn(local)[0].src, 'img/512KON.png');
});

test('scroll nad kartą na stole przełącza tor podglądu (kopia zachowania legacy)', () => {
  const { session } = buildSession('green.txt');
  const els = makeEls();
  const seen = [];
  renderTableView({
    els, session, play: () => {}, onCardClick: () => {},
    hoverMode: 'scryfall', onHoverModeChange: (mode) => seen.push(mode),
  });
  // Kafel realnej karty (z ilustracją) — na nim etykieta toru ma sens.
  const tileEl = els.hand.findAll((el) => el.className.startsWith('tile'))
    .find((el) => el.find(isImg));
  assert.ok(tileEl, 'ręka musi zawierać co najmniej jedną realną kartę z ilustracją');

  tileEl.emit('mouseenter', { clientX: 100, clientY: 100 });
  assert.equal(els.hoverPreview.className, 'hover-preview active');
  assert.match(els.hoverPreview.textContent, /Scryfall/);

  let prevented = 0;
  tileEl.emit('wheel', { clientX: 100, clientY: 100, deltaY: 1, preventDefault: () => { prevented += 1; } });
  assert.equal(prevented, 1, 'scroll nad kartą nie przewija strony');
  assert.deepEqual(seen, ['fot'], 'tor zmienia się scryfall → fot');
  assert.match(els.hoverPreview.textContent, /panoramiczna/);

  tileEl.emit('wheel', { clientX: 100, clientY: 100, deltaY: -1, preventDefault: () => {} });
  assert.deepEqual(seen, ['fot', 'scryfall'], 'scroll w drugą stronę cofa tor');

  tileEl.emit('mouseleave', {});
  assert.equal(els.hoverPreview.className, 'hover-preview');
});

test('okno podglądu nie wychodzi poza ekran (odbicie przy krawędzi, jak w legacy)', () => {
  const { session } = buildSession('green.txt');
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const tileEl = els.hand.findAll((el) => el.className.startsWith('tile'))[0];

  tileEl.emit('mouseenter', { clientX: 100, clientY: 100 });
  assert.equal(els.hoverPreview.style.left, '115px');
  assert.equal(els.hoverPreview.style.top, '115px');

  // Przy prawej/dolnej krawędzi okno przeskakuje na drugą stronę kursora.
  tileEl.emit('mouseenter', { clientX: 1390, clientY: 890 });
  assert.equal(els.hoverPreview.style.left, `${1390 - 15 - 320}px`);
  assert.equal(els.hoverPreview.style.top, `${890 - 15 - 448}px`);
});

test('pełny podgląd karty pokazuje duży obraz druku', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#preview');
  renderCardPreview(host, registry.get('serras-embrace'), { imageMode: 'remote-first' });
  const big = host.find((el) => String(el.className).startsWith('card-img'));
  assert.ok(big, 'podgląd ma pokazywać ilustrację, a nie tylko syntetyczną twarz');
  assert.match(big.src, /cards\.scryfall\.io\/large\/front\//);
});

test('karta w exile: dwuklik/double-tap otwiera pełny ekran (onCardDoubleClick z renderExile)', () => {
  const registry = createCardRegistry();
  const els = makeEls();
  const exiled = {
    id: 'exiled-1', cardId: 'highland-game', controllerId: HUMAN_ID, zone: 'exile',
    kind: 'creature', tapped: false, summoningSickness: false, damage: 0,
  };
  // Minimalna sesja renderTableView: aktywna partia, jedna karta w exile.
  const session = {
    state: { seed: 7 },
    view: () => ({
      status: 'active',
      turn: { number: 1, activePlayerId: HUMAN_ID },
      players: [
        { id: HUMAN_ID, name: 'Czarodziejka', life: 20 },
        { id: BOT_ID, name: 'Nieprzyjaciel', life: 20 },
      ],
      zones: { hand: [], battlefield: [], stack: [], graveyard: [], exile: [exiled], library: [] },
      legalCommands: [],
    }),
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    nameOfObject: () => '?',
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
    log: [],
    reasoning: [],
  };
  const opened = [];
  renderTableView({
    els, session, play: () => {}, onCardClick: () => {},
    onCardDoubleClick: (objectId) => opened.push(objectId),
  });
  const tiles = els.exileZone.findAll((el) => el.className.startsWith('tile'));
  assert.equal(tiles.length, 1, 'exile renderuje kafel karty');
  tiles[0].emit('dblclick', { preventDefault() {} });
  assert.deepEqual(opened, ['exiled-1'], 'dwuklik z exile otwiera pełny ekran (bug „poboczne" 2026-08-06)');
});
