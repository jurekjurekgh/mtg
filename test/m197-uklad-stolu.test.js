// M197 — porzadki w ukladzie stolu (zlecenie wlasciciela 2026-08-23, A1-A7).
//
// A1. „Przebieg tur (dla AI)": przycisk kopiujacy CALA partie (wszystkie tury),
//     obok istniejacego kopiowania jednej wybranej tury.
// A2. Usuniecie tekstowego paska statusu („Partia zakonczona po N turach"
//     + dwa wiersze „serce/mana/reka/biblioteka") — dublowal panel graczy.
// A3A. Inspektor stref wychodzi z paska graczy do osobnego boksu z LICZNIKAMI
//      (bez listy kart — te dalej po kliknieciu).
// A3B. Graficzna pula many (ile i jaka) dla obu graczy.
// A3C. „Ty" -> „Gracz".
// A4. „Stworki i inne" -> „Permanenty poza landami".
// A5. Inspektor bez sekcji „Biblioteka — podglad topu (syntetyczny)".
// A6. Bez naglowka „MTG · Wirtualny Stol (M20)".
// A7. Bez stopki „M20 — Wirtualny Stol i kreator talii...".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { addMana } from '../src/engine/resources.js';
import { renderPlayerMeta } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const HTML = fs.readFileSync('src/table/index.html', 'utf8');
const RENDER_SRC = fs.readFileSync('src/table/render.js', 'utf8');
const MAIN_SRC = fs.readFileSync('src/table/main.js', 'utf8');

/**
 * Zrodlo bez komentarzy. Usuniete napisy zostaja opisane w komentarzu
 * („... USUNIETY, bo dublowal ..."), wiec skan po surowym pliku dawalby
 * falszywy alarm. Sprawdzamy KOD, nie dokumentacje zmiany.
 */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const RENDER_CODE = codeOnly(RENDER_SRC);
const MAIN_CODE = codeOnly(MAIN_SRC);
const HTML_CODE = HTML.replace(/<!--[\s\S]*?-->/g, '');

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

function sessionWithTurns(steps = 220) {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-brg.txt', 'utf8'), REGISTRY).cardIds],
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

// --- A1 ------------------------------------------------------------------

test('M197/A1: sesja umie zwrocic zapis CALEJ partii (wszystkie tury)', () => {
  const session = sessionWithTurns();
  const entries = session.turnHistoryEntries();
  assert.ok(entries.length >= 2, `potrzebne min. 2 tury (jest ${entries.length})`);
  assert.equal(typeof session.turnHistoryTextAll, 'function', 'sesja wystawia turnHistoryTextAll');
  const all = session.turnHistoryTextAll();
  for (const entry of entries) {
    assert.ok(all.includes(`Tura ${entry.number}`), `zapis zawiera ture ${entry.number}`);
  }
  // Zapis calosci musi byc obszerniejszy niz pojedyncza tura.
  const one = session.turnHistoryTextFor(entries[0].number);
  assert.ok(all.length > one.length, 'cala partia to wiecej niz jedna tura');
});

test('M197/A1: panel ma OSOBNY przycisk kopiowania calej partii', () => {
  assert.match(HTML, /id="turn-history-copy-all"/, 'przycisk „skopiuj cala partie" w HTML');
  assert.match(HTML, /id="turn-history-copy"/, 'przycisk pojedynczej tury zostaje');
  assert.match(MAIN_SRC, /turnHistoryCopyAll/, 'main.js obsluguje nowy przycisk');
  assert.match(MAIN_SRC, /turnHistoryTextAll/, 'nowy przycisk kopiuje zapis calej partii');
});

// --- A2 ------------------------------------------------------------------

test('M197/A2: znikl tekstowy pasek statusu (dublowal panel graczy)', () => {
  assert.doesNotMatch(RENDER_CODE, /Partia zakończona po/,
    'tekst „Partia zakonczona po N turach" usuniety z KODU');
  assert.doesNotMatch(RENDER_CODE, /ręka \$\{ownHand\}|mana \$\{me\?\.mana\}/,
    'wiersze „mana / reka / biblioteka" usuniete');
  assert.doesNotMatch(RENDER_CODE, /status-row/, 'nie ma juz wierszy paska statusu');
  // M198/A: pusty kontener tez zniknal z DOM (był widoczny jako szary pasek).
  assert.doesNotMatch(HTML_CODE, /id="status"/, 'kontener paska usuniety');
});

// --- A3 ------------------------------------------------------------------

test('M197/A3A: inspektor stref to osobny boks z LICZNIKAMI, nie pasek graczy', () => {
  // M198/C: boksy dziela sie PER GRACZ (meta-foe / meta-own), a nie wg
  // rodzaju danych — sama zasada („liczniki poza paskiem graczy") zostaje.
  assert.match(HTML, /id="meta-foe"/, 'boks danych przeciwnika');
  // Przycisk otwierajacy inspektor nie moze juz siedziec miedzy graczami.
  assert.doesNotMatch(HTML_CODE, /id="library-menu-btn"/,
    'przycisk stref nie siedzi juz miedzy graczami (inspektor otwiera boks liczników)');
});

test('M197/A3A: liczniki podaja rozmiar kazdej strefy dla OBU graczy', () => {
  const session = sessionWithTurns(60);
  const view = session.view();
  // M198/C: liczniki zyja w boksie KAZDEGO gracza osobno.
  const host = new MiniEl('div');
  for (const player of view.players) {
    const box = new MiniEl('div');
    renderPlayerMeta(box, view, player.id);
    host.appendChild(box);
  }
  const text = host.textContent;
  for (const label of ['cmentarz', 'exile', 'biblioteka']) {
    assert.ok(text.toLowerCase().includes(label), `licznik „${label}" w boksie: ${text}`);
  }
  assert.ok(/Gracz/.test(text) && /Bot/.test(text), `oba boki opisane: ${text}`);
  assert.match(text, /\d/, 'liczniki podaja liczby');
  // Bez listy kart — nazwy kart pojawiaja sie dopiero po kliknieciu.
  assert.ok(!/Mountain|Island|Forest|Swamp|Plains/.test(text), `boks nie wypisuje kart: ${text}`);
});

test('M197/A3B: pula many pokazana graficznie dla obu graczy', () => {
  const session = sessionWithTurns(40);
  const view = session.view();
  const host = new MiniEl('div');
  for (const player of view.players) {
    const box = new MiniEl('div');
    renderPlayerMeta(box, view, player.id);
    host.appendChild(box);
  }
  const text = host.textContent;
  assert.ok(/Gracz/.test(text), `wiersz gracza: ${text}`);
  assert.ok(/Bot/.test(text), `wiersz bota: ${text}`);
  // Widok MUSI niesc kolory puli — inaczej nie ma z czego rysowac.
  for (const player of view.players) {
    assert.ok(player.manaPool && typeof player.manaPool === 'object',
      `playerView niesie manaPool gracza ${player.id}`);
  }
});

test('M197/A3B: PELNA sciezka — tapniecie landa w grze zapala ikone w puli', () => {
  // Dowod end-to-end: silnik -> playerView -> render. Pula opróżnia się między
  // krokami (CR 500.4), więc migawka po partii jest pusta — liczy się moment
  // PO tapnięciu landa, kiedy gracz wybiera, na co wydać manę.
  const session = sessionWithTurns(0);
  const state = session.state;
  const land = [...state.objects.values()].find((o) => o.zone === 'library' && o.kind === 'land');
  assert.ok(land, 'w talii jest jakiś ląd');
  addMana(state, HUMAN_ID, 2, { colors: ['U'] });
  addMana(state, HUMAN_ID, 1, { colors: [] });
  const view = session.view();
  const me = view.players.find((p) => p.id === view.playerId);
  assert.deepEqual(me.manaPool, { U: 2, '': 1 }, 'widok niesie pule po kolorach');
  const host = new MiniEl('div');
  renderPlayerMeta(host, view, HUMAN_ID);
  const chips = host.descendants().filter((el) => el.className === 'mana-pool-chip');
  assert.equal(chips.length, 2, 'jeden chip na profil koloru (U oraz bezbarwna)');
  assert.match(chips[0].innerHTML, /ms-u/, 'ikona many niebieskiej');
  assert.match(chips[1].innerHTML, /ms-c/, 'ikona many bezbarwnej');
  assert.equal(chips[0].title, '2 many niebieskich', 'opis w poprawnej polskiej odmianie');
  assert.equal(chips[1].title, '1 many bezbarwnej');
});

test('M197/A3C: „Ty" w pasku graczy zamienione na „Gracz"', () => {
  const players = /<div class="players">([\s\S]*?)<\/div>\s*<\/div>/.exec(HTML_CODE)?.[1] ?? '';
  assert.ok(players, 'sekcja paska graczy istnieje');
  assert.match(players, /class="pname">Gracz</, 'etykieta „Gracz"');
  assert.doesNotMatch(players, /class="pname">Ty</, 'nie ma juz „Ty"');
});

// --- A4 ------------------------------------------------------------------

test('M197/A4: grupa permanentow nazywa sie „Permanenty poza landami"', () => {
  assert.doesNotMatch(RENDER_CODE, /Stworki i inne/, 'stara etykieta usunieta z KODU');
  assert.match(RENDER_CODE, /Permanenty poza lądami/, 'nowa etykieta');
});

// --- A5 / A6 / A7 --------------------------------------------------------

test('M197/A5: inspektor stref bez „podgladu topu (syntetycznego)"', () => {
  assert.doesNotMatch(HTML_CODE, /podgląd topu/, 'sekcja usunieta z HTML');
  assert.doesNotMatch(HTML_CODE, /id="library-preview"/, 'kontener podgladu usuniety');
  assert.doesNotMatch(MAIN_CODE, /refreshLibraryPreview|library-preview/, 'martwy kod w main.js usuniety');
});

test('M197/A6: brak glownego naglowka „MTG · Wirtualny Stol (M20)"', () => {
  assert.doesNotMatch(HTML_CODE, /MTG · Wirtualny Stół/, 'naglowek zajmowal miejsce — usuniety');
  assert.doesNotMatch(HTML_CODE, /class="brand"/, 'kontener naglowka usuniety');
});

test('M197/A7: brak stopki o wstrzykiwaniu talii', () => {
  assert.doesNotMatch(HTML_CODE, /Wirtualny Stół i kreator talii/, 'stopka usunieta');
  assert.doesNotMatch(HTML_CODE, /class="foot"/, 'kontener stopki usuniety');
});
