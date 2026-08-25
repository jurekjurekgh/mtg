// M198 — poprawki ukladu stolu po screenshocie wlasciciela (2026-08-23, A-G).
//
// A. Szary prostokat nad licznikami zycia (pusty `.statusbar`) — do usuniecia.
// B. Biala przestrzen na komunikaty systemowe (`#table-note`) znika; komunikaty
//    ida do MODALA z guzikiem „Rozumiem".
// C. Boksy rozlozone per GRACZ, nie per RODZAJ danych: po stronie Bota strefy
//    I pula many Bota, po stronie Gracza — jego wlasne.
// D. „Pokaz karty w strefach" jako osobny, WYCENTROWANY element pod boksami.
// E. Odstep miedzy boksami a sekcja „PRZECIWNIK (Bot)".
// F. Stopka (wersja artefaktu) justowana do LEWEJ — po prawej chowa sie pod FAB.
// G. Panel „Rozumowanie bota" usuniety calkowicie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { renderPlayerMeta } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const HTML = fs.readFileSync('src/table/index.html', 'utf8');
const MAIN_SRC = fs.readFileSync('src/table/main.js', 'utf8');
const RENDER_SRC = fs.readFileSync('src/table/render.js', 'utf8');
const HTML_CODE = HTML.replace(/<!--[\s\S]*?-->/g, '');
/** Zrodlo bez komentarzy — komentarz opisujacy usuniecie nie jest kodem (L56). */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const MAIN_CODE = codeOnly(MAIN_SRC);
const RENDER_CODE = codeOnly(RENDER_SRC);

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; this.style = {}; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

function sessionAfterSteps(steps = 60) {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 3, registry: REGISTRY, decks });
  for (let i = 0; i < steps; i += 1) {
    const view = session.view();
    if (view.status !== 'active') break;
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands[0];
    if (!cmd) break;
    session.apply(cmd);
  }
  return session;
}

// --- A ------------------------------------------------------------------

test('M198/A: pusty szary pasek statusu zniknal z DOM', () => {
  assert.doesNotMatch(HTML_CODE, /id="status"/, 'kontener .statusbar usuniety z HTML');
  assert.doesNotMatch(HTML_CODE, /class="statusbar"/, 'klasa paska usunieta');
  assert.doesNotMatch(RENDER_CODE, /els\.status\b/, 'render nie odwoluje sie juz do paska');
});

// --- B ------------------------------------------------------------------

test('M198/B: komunikaty systemowe ida do modala, bez pasa bialej przestrzeni', () => {
  assert.doesNotMatch(HTML_CODE, /id="table-note"/, 'pas na komunikaty usuniety z ukladu');
  assert.match(HTML_CODE, /id="notice"/, 'jest warstwa modala komunikatow');
  assert.match(HTML_CODE, /id="notice-ok"/, 'modal ma guzik zamykajacy');
  assert.match(MAIN_SRC, /showNotice/, 'main.js ma jedno wejscie do komunikatow');
  // Zaden komunikat nie moze juz isc do usunietego elementu.
  assert.doesNotMatch(MAIN_CODE, /statusNote/, 'brak zapisow do starego pasa');
});

// --- C ------------------------------------------------------------------

test('M198/C: boks danych gracza laczy JEGO strefy i JEGO pule many', () => {
  const session = sessionAfterSteps();
  const view = session.view();
  const me = view.players.find((p) => p.id === view.playerId);
  const foe = view.players.find((p) => p.id !== view.playerId);

  const botBox = new MiniEl('div');
  renderPlayerMeta(botBox, view, foe.id);
  const botText = botBox.textContent;
  const playerBox = new MiniEl('div');
  renderPlayerMeta(playerBox, view, me.id);
  const playerText = playerBox.textContent;

  // Kazdy boks niesie OBA rodzaje danych — dla swojego gracza.
  for (const [label, text] of [['Bot', botText], ['Gracz', playerText]]) {
    assert.ok(/cmentarz/.test(text), `${label}: strefy w boksie`);
    assert.ok(/[Mm]ana/.test(text), `${label}: pula many w boksie`);
  }
  // Boks jednego gracza NIE opisuje drugiego.
  assert.doesNotMatch(botText, /Gracz/, 'boks Bota nie zawiera danych Gracza');
  assert.doesNotMatch(playerText, /Bot/, 'boks Gracza nie zawiera danych Bota');

  // Liczby sa rozdzielone poprawnie (biblioteki obu graczy sie roznia).
  const libOf = (id) => view.zones.library.filter((o) => o.controllerId === id).length;
  assert.match(botText, new RegExp(`biblioteka \\[${libOf(foe.id)}\\]`), 'biblioteka Bota');
  assert.match(playerText, new RegExp(`biblioteka \\[${libOf(me.id)}\\]`), 'biblioteka Gracza');
});

// M203/A (zlecenie wlasciciela 2026-08-24): uklad odwrocony — GRACZ po lewej,
// BOT po prawej, a sekcje stref ida od Gracza (reka, stol) przez wspolny Stos
// do Bota (stol, zakryta reka). Straznik M198/C pilnowal starej kolejnosci,
// wiec zostaje przepisany na NOWA (wymaganie zmienil wlasciciel, nie „obrocenie
// asercji, zeby przeszlo") i rozszerzony o kolejnosc sekcji, ktorej wczesniej
// nikt nie pilnowal — a to wlasnie ona byla trescia tego zlecenia.
test('M203/A: HTML ma po jednym boksie na gracza, w kolejnosci Gracz, Bot', () => {
  assert.match(HTML_CODE, /id="meta-foe"/, 'boks przeciwnika');
  assert.match(HTML_CODE, /id="meta-own"/, 'boks gracza');
  assert.ok(HTML_CODE.indexOf('id="meta-own"') < HTML_CODE.indexOf('id="meta-foe"'),
    'Gracz po lewej (jak licznik zycia), Bot po prawej');
  // Pasek zycia/biblioteki w tej samej kolejnosci co boksy (M198/C: boksy sa
  // per gracz POD paskiem).
  assert.ok(HTML_CODE.indexOf('id="life-own"') < HTML_CODE.indexOf('id="life-enemy"'),
    'licznik Gracza przed licznikiem Bota');
  // Kolejnosc sekcji stref: reka Gracza -> stol Gracza -> Stos -> stol Bota
  // -> zakryta reka Bota.
  const order = [
    ['id="hand"', 'reka Gracza'],
    ['id="bf-own"', 'stol Gracza'],
    ['id="stack-zone"', 'Stos'],
    ['id="bf-enemy"', 'stol Bota'],
    ['id="hand-enemy"', 'reka Bota'],
  ];
  let prev = -1;
  for (const [needle, label] of order) {
    const at = HTML_CODE.indexOf(needle);
    assert.ok(at > 0, `sekcja ${label} istnieje w HTML`);
    assert.ok(at > prev, `sekcja ${label} jest PO poprzedniej (kolejnosc od Gracza do Bota)`);
    prev = at;
  }
  // Ręka Gracza jest JEDNA (sekcja nie zostala zduplikowana przy przeprowadzce).
  assert.equal(HTML_CODE.split('id="hand"').length - 1, 1, 'jedna sekcja reki Gracza');
  // Stare boksy „wg rodzaju danych" znikaja.
  assert.doesNotMatch(HTML_CODE, /id="zone-counters"/, 'stary wspolny boks stref usuniety');
  assert.doesNotMatch(HTML_CODE, /id="mana-pools"/, 'stary wspolny boks puli usuniety');
});

// --- D ------------------------------------------------------------------

test('M198/D: „Pokaz karty w strefach" to osobny, wycentrowany element', () => {
  assert.match(HTML_CODE, /id="zone-inspector-open"/, 'przycisk ma wlasne miejsce w HTML');
  assert.match(HTML, /\.zone-inspector-bar\s*\{[^}]*justify-content:\s*center/,
    'pasek przycisku wycentrowany w CSS');
  // Nie moze juz byc doklejany do boksu danych gracza.
  const session = sessionAfterSteps(10);
  const view = session.view();
  const box = new MiniEl('div');
  renderPlayerMeta(box, view, view.playerId);
  assert.doesNotMatch(box.textContent, /Pokaż karty/, 'przycisk nie siedzi w boksie gracza');
});

// --- E ------------------------------------------------------------------

test('M198/E: jest odstep miedzy boksami graczy a plansza', () => {
  assert.match(HTML, /\.table-meta\s*\{[^}]*margin-bottom:/, 'boksy maja dolny odstep');
});

// --- F ------------------------------------------------------------------

test('M198/F: stopka z wersja artefaktu justowana do LEWEJ', () => {
  const stamp = /\.build-stamp\s*\{([^}]*)\}/.exec(HTML)?.[1] ?? '';
  assert.ok(stamp, 'regula .build-stamp istnieje');
  assert.match(stamp, /text-align:\s*left/, 'do lewej — po prawej chowala sie pod FAB');
  assert.doesNotMatch(stamp, /text-align:\s*right/, 'nie ma juz justowania w prawo');
});

// --- G ------------------------------------------------------------------

test('M198/G: panel „Rozumowanie bota" usuniety w calosci', () => {
  assert.doesNotMatch(HTML_CODE, /Rozumowanie bota/, 'panel zniknal z HTML');
  assert.doesNotMatch(HTML_CODE, /id="bot-reasoning"/, 'kontener usuniety');
  assert.doesNotMatch(HTML_CODE, /id="bot-reasoning-count"/, 'licznik usuniety');
  assert.doesNotMatch(MAIN_CODE, /botReasoning/, 'main.js nie podpina panelu');
  assert.doesNotMatch(RENDER_CODE, /botReasoning/, 'render nie buduje panelu');
});
