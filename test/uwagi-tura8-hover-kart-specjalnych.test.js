// Uwaga B (2026-09-02, uwagi właściciela z żywej gry):
//   „Karty specjalne (Undercity, Day/Night, Poison) powinny powiększać się po
//    najechaniu (hover) jak zwykłe karty. Teraz działa tylko klik, a chciałbym
//    żeby poza nim działał też hover."
//
// Rozpoznanie: sam `renderDayNight` UMIAŁ hover (M153/C), `renderUndercity`
// też przyjmował opcję `hover` — ale `renderTableView` przekazywał obiekt hoveru
// tylko Day/Night. `renderPoisonPanel` nie przyjmował go w ogóle. Dodatkowo
// żadna z trzech kart nie miała reguły CSS na `:hover`, więc nawet podpięty
// podgląd nie dawał sygnału zwrotnego na samym druku.
//
// Dlatego test jest w dwu warstwach (L16: pilnuj drutu, nie żarówki):
//  1. komponent — `attachSpecialCardHover` faktycznie podłącza zdarzenia,
//     a panel trucizny (nowy) też je dostaje;
//  2. PRZEKAZANIE — wywołania w `renderTableView` podają `hover` każdemu z
//     trzech paneli, oraz CSS ma regułę najechania. To jest dokładnie to, co
//     przeczyło przez rok, bo test jednostkowy podawał `hover` sam.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachSpecialCardHover, renderPoisonPanel } from '../src/table/render.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.src = '';
    this.alt = '';
    this.hidden = false;
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  findAll(p) { return this.descendants().filter(p); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const noop = () => {};
function hoverSpy() {
  const seen = [];
  return {
    seen,
    start: (info, e) => seen.push({ at: 'start', info, e }),
    end: () => seen.push({ at: 'end' }),
    cycle: (info, e) => seen.push({ at: 'cycle', info, e }),
  };
}
function cardEl(host, cls) { return host.findAll((el) => (el.className || '').includes(cls))[0]; }

test('B: helper podłącza mouseenter/mouseleave/wheel i zwraca informację o karcie', () => {
  const card = new MiniEl('div');
  const hover = hoverSpy();
  const info = { name: 'Undercity', imageUri: 'https://x/undercity.jpg' };
  assert.equal(attachSpecialCardHover(card, hover, info), true, 'hover podpięty');
  card.emit('mouseenter', { clientX: 1, clientY: 2 });
  card.emit('mouseleave');
  card.emit('wheel', { deltaY: -1, preventDefault: noop });
  assert.deepEqual(hover.seen.map((s) => s.at), ['start', 'end', 'cycle'],
    `kolejność zdarzeń: ${hover.seen.map((s) => s.at).join(',')}`);
  assert.equal(hover.seen[0].info.imageUri, info.imageUri,
    'start dostaje obraz KARTY SPECJALNEJ, nie kafla');
});

test('B: brak hovera (dotyk) = żadnych słuchaczy i false — klik zostaje jedyną ścieżką', () => {
  const card = new MiniEl('div');
  assert.equal(attachSpecialCardHover(card, null, { name: 'X' }), false, 'null hover = false');
  assert.equal(card.listeners.mouseenter, undefined, 'na dotyku nie ma mouseenter');
});

test('B: panel liczników trucizny ma hover i klik', () => {
  const els = { poison: new MiniEl('div') };
  const hover = hoverSpy();
  let opened = 0;
  const view = { playerId: 'p1', players: [{ id: 'p1', poison: 3 }, { id: 'p2', poison: 0 }] };
  renderPoisonPanel(els, view, { onOpenCard: () => { opened += 1; }, hover });
  assert.equal(els.poison.hidden, false, 'panel widoczny, gdy ktoś ma truciznę');
  const card = cardEl(els.poison, 'poison-card');
  assert.ok(card, 'poison-card');
  assert.ok((card.className || '').includes('clickable'), 'klikalny druk');
  card.emit('click');
  assert.equal(opened, 1, 'klik otwiera pełny ekran karty znacznika');
  card.emit('mouseenter', { clientX: 5, clientY: 5 });
  assert.equal(hover.seen.length, 1, 'najechanie daje powiększenie');
  assert.match(String(hover.seen[0].info.imageUri), /^https:\/\/cards\.scryfall\.io\//,
    'podgląd pokazuje druk ze Scryfalla');
});

test('B: renderTableView PODAJE hover wszystkim trzem kartom specjalnym (drut, nie żarówka)', () => {
  const src = fs.readFileSync('src/table/render.js', 'utf8');
  const start = src.indexOf('export function renderTableView(');
  assert.ok(start > 0, 'funkcja renderTableView znaleziona');
  // Ciało: do końca pliku (renderTableView jest ostatni w sekcji stołu) —
  // tniemy po następnym `export function`, żeby nie złapać cudzych wywołań.
  const next = src.indexOf('\nexport function', start + 10);
  const body = src.slice(start, next === -1 ? src.length : next);
  for (const call of ['renderDayNight(', 'renderUndercity(', 'renderPoisonPanel(']) {
    const line = body.split('\n').find((l) => l.includes(call));
    assert.ok(line, `wywołanie ${call} jest w renderTableView`);
    assert.match(line, /\bhover\b/, `${call} musi dostawać obiekt hover — bez niego `
      + 'karta specjalna na stole reaguje tylko na klik (uwaga B)');
  }
});

test('B: CSS kart specjalnych ma regułę najechania (infografika, nie tylko podgląd)', () => {
  const css = fs.readFileSync('src/table/index.html', 'utf8');
  for (const cls of ['undercity-card', 'daynight-card', 'poison-card']) {
    assert.match(css, new RegExp(`\\.${cls}:hover\\s+img`),
      `.${cls}:hover img musi istnieć — inaczej najechanie niczego nie rysuje na karcie`);
    assert.match(css, new RegExp(`\\.${cls}\\.clickable[^{]*\\{[^}]*cursor:\\s*pointer`),
      `.${cls}.clickable ma kursor wskazujący (sygnał, że klik otwiera)`);
  }
});
