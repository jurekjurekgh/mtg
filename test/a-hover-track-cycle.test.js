// A — znalezisko właściciela z testów (tor hovera): rotacja
// scryfall → FOT → KON bywała nieprzewidywalna — „czasem nic nie robi,
// czasem przeskakuje o dwa tryby, czasem rotuje FOT → KON → FOT → KON".
// Dwie przyczyny w kodzie:
// (1) Karty BEZ artId (landy, tokeny) cyklowały przez DWA puste, nieetykietowane
//     stany (M148) — RMB „nie robił nic", a globalny tor przesuwał się
//     w niewidoczny sposób. Naprawa: kreator używa ZAWĘŻONEJ listy trybów
//     (nextHoverMode od dawna przyjmuje availableModes — nikt nie przekazywał).
// (2) Pojedynczy gest PPM bywał dostarczany wielokrotnie (odbicie styku,
//     podwójne contextmenu) — +2/+3 na gest dawało „przeskoki" i oscylacje
//     FOT → KON → FOT (podwójny krok z KON ląduje w FOT, omijając Scryfall).
//     Naprawa: strażnik 250 ms (jak MODAL_OPEN_GUARD_MS w main.js).
//
// M349/A (znalezisko właściciela z testów, 2026-09-14): wyzwalacz PPM wymieniony
// na ŚRODKOWY przycisk (MMB) — przeglądarka dostarcza `contextmenu` raz przy
// wciśnięciu, raz przy zwolnieniu, czasem wcale, więc tor był
// nieprzewidywalny (a czasem łapało menu kontekstowe). Kontrakt: jedno
// WCIŚNIĘCIE MMB (`mousedown`, button === 1) = jeden krok; ZWOLNIENIE nie
// zmienia nic; PPM (contextmenu / prawy przycisk) nie robi NIC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { addObject } from '../src/engine/game-state.js';
import { renderTableView } from '../src/table/render.js';

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
    this.hidden = false;
  }
  set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n.flat(); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  findAll(p) { return this.descendants().filter(p); }
}

globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
};

function sessionWithHand(cardIds) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText('# A\n20x Forest\n20x Island', registry).cardIds],
    [BOT_ID, parseDeckText('# B\n20x Mountain\n20x Swamp', registry).cardIds],
  ]);
  const session = createSession({ registry, decks, seed: 21 });
  cardIds.forEach((cardId, i) => addObject(session.state, {
    id: `h${i}`, instanceId: `i-h${i}`, cardId, controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'hand',
  }));
  return session;
}

function makeEls() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'handEnemy', 'actions', 'log', 'turnHistory', 'turnHistoryCount',
    'metaFoe', 'metaOwn', 'daynight', 'undercity', 'poison', 'speed', 'hoverPreview']) {
    els[key] = new MiniEl(`#${key}`);
  }
  return els;
}

function handTile(els) {
  // Nasza karta (addObject) ląduje na KOŃCU strefy — kafle [0..6] to dobrane
  // landy sesji (bez artId).
  const tiles = els.hand.findAll((el) => String(el.className).split(/\s+/).includes('tile'));
  assert.ok(tiles.length > 0, 'ręka ma kafle');
  return tiles[tiles.length - 1];
}

function previewLabel(els) {
  const node = els.hoverPreview.findAll((el) => String(el.className).split(/\s+/).includes('hover-mode'))[0];
  return node ? node.textContent : null;
}

// MMB = środkowy przycisk myszy: `button === 1` (numer przycisku) i
// `buttons === 4` (MASKą bitowa UI Events: 1 = lewy, 2 = prawy, 4 = środkowy —
// sam `button === 1` przepuszczałby mousedown dociskany przy trzymanym już
// innym przycisku).
const mmb = () => ({ clientX: 120, clientY: 120, button: 1, buttons: 4, preventDefault() {} });
// PPM (prawy) i LPM — nie mogą ruszyć toru (dawne wyzwalacze / zwykły klik).
const rmb = () => ({ clientX: 120, clientY: 120, button: 2, buttons: 2, preventDefault() {} });
const lmb = () => ({ clientX: 120, clientY: 120, button: 0, buttons: 1, preventDefault() {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('A/1: karta Z artId rotuje scryfall → FOT → KON → scryfall (jeden krok na wciśnięcie MMB)', async () => {
  const els = makeEls();
  const modes = [];
  renderTableView({
    els, session: sessionWithHand(['coralhelm-guide']), play: () => {}, onCardClick: () => {},
    hoverMode: 'scryfall', onHoverModeChange: (m) => modes.push(m),
  });
  const tile = handTile(els);
  tile.emit('mouseenter', { clientX: 120, clientY: 120 });
  assert.match(previewLabel(els) ?? '', /pełna karta \(Scryfall\)/, 'start: tor Scryfall');
  tile.emit('mousedown', mmb());
  assert.match(previewLabel(els) ?? '', /ilustracja panoramiczna \(FOT\)/, 'MMB 1: FOT');
  tile.emit('mouseup', mmb()); // zwolnienie NIE zmienia toru (A2)
  assert.match(previewLabel(els) ?? '', /ilustracja panoramiczna \(FOT\)/, 'zwolnienie MMB: bez zmiany');
  await sleep(300); // gesty gracza dzieli czas — strażnik 250 ms puszcza kolejny krok
  tile.emit('mousedown', mmb());
  assert.match(previewLabel(els) ?? '', /bestiariusz \(KON\)/, 'MMB 2: KON');
  await sleep(300);
  tile.emit('mousedown', mmb());
  assert.match(previewLabel(els) ?? '', /pełna karta \(Scryfall\)/, 'MMB 3: z powrotem Scryfall');
  // PPM i LPM nie są już wyzwalaczem toru (PPM zawiódł na różnych platformach).
  tile.emit('mousedown', rmb());
  tile.emit('mousedown', lmb());
  tile.emit('contextmenu', rmb());
  assert.match(previewLabel(els) ?? '', /pełna karta \(Scryfall\)/, 'PPM/LPM nie ruszają toru');
  assert.deepEqual(modes, ['fot', 'kon', 'scryfall'], 'globalny tor idzie w krok z podglądem');
});

test('A/2: karta BEZ artId (land) nie pokazuje pustych torów — zawsze Scryfall', async () => {
  const els = makeEls();
  const modes = [];
  renderTableView({
    els, session: sessionWithHand(['basic-island']), play: () => {}, onCardClick: () => {},
    hoverMode: 'fot', onHoverModeChange: (m) => modes.push(m),
  });
  const tile = handTile(els);
  tile.emit('mouseenter', { clientX: 120, clientY: 120 });
  assert.match(previewLabel(els) ?? '', /pełna karta \(Scryfall\)/,
    'nawet przy globalnym FOT karta bez ilustracji pokazuje Scryfall');
  await sleep(300); // strażnik jest modułowy — czyścimy okno po teście A/1
  for (let i = 0; i < 3; i++) {
    tile.emit('mousedown', mmb());
    await sleep(300);
    assert.match(previewLabel(els) ?? '', /pełna karta \(Scryfall\)/, `MMB ${i + 1}: nadal Scryfall`);
  }
});

test('A/3: podwójny mousedown w tym samym geście (odbicie) = JEDEN krok na torze', async () => {
  const els = makeEls();
  const modes = [];
  renderTableView({
    els, session: sessionWithHand(['coralhelm-guide']), play: () => {}, onCardClick: () => {},
    hoverMode: 'scryfall', onHoverModeChange: (m) => modes.push(m),
  });
  const tile = handTile(els);
  tile.emit('mouseenter', { clientX: 120, clientY: 120 });
  await sleep(300); // strażnik jest modułowy — czyścimy okno po teście A/2
  tile.emit('mousedown', mmb());
  tile.emit('mousedown', mmb()); // to samo „kliknięcie", drugi event w tym samym ticku
  assert.match(previewLabel(els) ?? '', /ilustracja panoramiczna \(FOT\)/,
    'odbicie nie przeskakuje do KON');
  await sleep(300); // strażnik uzbraja się ponownie
  tile.emit('mousedown', mmb());
  assert.match(previewLabel(els) ?? '', /bestiariusz \(KON\)/, 'po przerwie kolejny gest idzie dalej');
});
