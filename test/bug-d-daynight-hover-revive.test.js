import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { attachSpecialCardHover, renderTableView } from '../src/table/render.js';

/**
 * Zgłoszenie właściciela D (2026-09-10): „Kolejna rzecz, którą mam wrażenie
 * już naprawiałem. Panel z kartą specjalną Daybound Day/Night. Najechanie na
 * nią (hover) powinien powiększać tę kartę tak jak każdą inną, a nie
 * powiększa." (Klik działa — pełny ekran się otwiera; nie działa tylko hover.)
 *
 * Rozpoznanie: podpięcie hovera ISTNIEJE (M153/C + Uwaga B) i mouseenter
 * poprawnie otwiera podgląd. Root cause jest w mechanice mouseenter: panel
 * Day/Night jest PRZERYsowywany przy każdej zmianie widoku (noc/dzień =
 * transformacje wilkołaków + pauzy bota = ciągłe przebudowania), a kursor
 * gracza często SPOCZYWA na panelu (tuż obok karty jest tekst opisu
 * dnia/nocy). Gdy renderTableView podmienia element kafla POD kursorem,
 * mouseenter się NIE odzywa (nie było „wejścia" — kursor już był w środku),
 * więc podgląd nie wstaje. Klik nie ma tego problemu (zdarzenie trafia w
 * element pod kursorem w chwili kliknięcia) — stąd objaw „klik działa, hover
 * nie".
 *
 * Fix: hover kart specjalnych dostaje `revive` na mousemove — jeśli podgląd
 * nie jest aktywny, a kursor porusza się po kaflu, podgląd wstaje. To domyka
 * szczelinę po przebudowaniu bez ruszania UX (gdy podgląd już jest —
 * mousemove nic nie robi, zero migotania).
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

function dayNightSession() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText('# A\n20x Forest\n20x Island', registry).cardIds],
    [BOT_ID, parseDeckText('# B\n20x Mountain\n20x Swamp', registry).cardIds],
  ]);
  const session = createSession({ registry, decks, seed: 11 });
  session.state.dayNight = 'day';
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

const active = (els) => String(els.hoverPreview.className).includes('active');

test('D/1: mouseenter dalej otwiera podgląd Day/Night (regresja M153)', () => {
  const els = makeEls();
  renderTableView({ els, session: dayNightSession(), play: () => {}, onCardClick: () => {} });
  const card = els.daynight.findAll((el) => String(el.className).includes('daynight-card'))[0];
  assert.ok(card, 'panel Day/Night widoczny z kaflem');
  assert.equal(active(els), false, 'start: bez podglądu');
  card.emit('mouseenter', { clientX: 100, clientY: 100 });
  assert.equal(active(els), true, 'mouseenter otwiera powiększenie');
});

test('D/2: kafl przerysowany POD kursorem — sam mousemove ma podnieść podgląd', () => {
  const session = dayNightSession();
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  // Gracz czyta opis przy karcie; w tutejszym świecie gry pada noc →
  // renderTableView przebudowuje panel POD kursorem (nowy element kafla).
  session.state.dayNight = 'night';
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const card = els.daynight.findAll((el) => String(el.className).includes('daynight-card'))[0];
  assert.ok(card, 'nowy kafl po przebudowaniu');
  assert.equal(active(els), false, 'podgląd nieaktywny po przebudowaniu');
  // Kursor już jest nad kaflą — mouseenter nie ma prawa się odezwać
  // (nie było wejścia). Drobny ruch myszą musi podnieść podgląd.
  card.emit('mousemove', { clientX: 105, clientY: 102 });
  assert.equal(active(els), true,
    'mousemove nad przerysowanym kaflą ma wznowić powiększenie (lukę mouseenter po re-renderze domyka revive)');
});

test('D/3: revive nie dubluje podglądu i nie rusza aktywnego podglądu', () => {
  const els = makeEls();
  renderTableView({ els, session: dayNightSession(), play: () => {}, onCardClick: () => {} });
  const card = els.daynight.findAll((el) => String(el.className).includes('daynight-card'))[0];
  card.emit('mouseenter', { clientX: 100, clientY: 100 });
  assert.equal(active(els), true, 'setup: podgląd aktywny');
  const imgsBefore = els.hoverPreview.findAll((el) => el.tagName === 'img').length;
  card.emit('mousemove', { clientX: 110, clientY: 110 });
  assert.equal(active(els), true, 'ruch myszy nie gasi podglądu');
  assert.equal(els.hoverPreview.findAll((el) => el.tagName === 'img').length, imgsBefore,
    'mousemove przy aktywnym podglądzie nie przebudowuje go (brak migotania)');
});

test('D/4: attachSpecialCardHover podpina mousemove tylko, gdy hover niesie revive', () => {
  const card = new MiniEl('div');
  let revives = 0;
  const withRevive = attachSpecialCardHover(card, {
    start: () => {}, end: () => {}, cycle: () => {}, revive: () => { revives += 1; },
  }, { name: 'X' });
  assert.equal(withRevive, true);
  card.emit('mousemove', {});
  assert.equal(revives, 1, 'mousemove woła revive');

  const bare = new MiniEl('div');
  const bareHover = { start: () => {}, end: () => {}, cycle: () => {} };
  attachSpecialCardHover(bare, bareHover, { name: 'Y' });
  assert.equal((bare.listeners.mousemove ?? []).length, 0,
    'hover bez revive nie dostaje mousemove (stare ścieżki bez zmian)');
});
