// M201/A2+B (zgłoszenia właściciela 2026-08-23):
//
// A2. „Karty zawieszone (suspend/plot) trafiają do ukrytego worka Exile i nic
//     o nich nie wiadomo — chcę je widzieć na stole z licznikami.”
// B.  „Powyżej lądów przeciwnika brakuje sekcji z ręką Bota — tyłów kart (FoW),
//     żebym wiedział, ILE kart ma bot; lustrzanie do mojej odkrytej ręki.”
//
// Reguły: CR 406.3 — wygnanie jest domyślnie odkryte (suspend/plot nie wyganiają
// zakrytych), więc „poczekalnia” pokazuje karty OBU graczy jawnie. Ręka
// przeciwnika pozostaje ukryta (CR 402.2) — pokazujemy wyłącznie LICZBĘ
// i rewersy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { renderEnemyHand, renderWaitingExile, renderTableView } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; this.style = {}; this.dataset = {}; this.hidden = false; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  setAttribute(name, value) { this.dataset[name] = value; }
  createTextNode(v) { return new MiniEl('#text'); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
const doc = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: () => new MiniEl('#text'),
};
globalThis.document = globalThis.document ?? doc;

function session2() {
  const decks = new Map([
    [HUMAN_ID, [...Array(10).fill('basic-swamp'), ...Array(10).fill('mindstab')]],
    [BOT_ID, [...Array(10).fill('basic-mountain'), ...Array(10).fill('goblin-piker')]],
  ]);
  return createSession({ seed: 11, registry: REGISTRY, decks, pauseOnBotMoves: false });
}

test('M201/B: sekcja ręki bota pokazuje LICZBĘ kart i tyle samo rewersów', () => {
  const session = session2();
  const view = session.view();
  const host = new MiniEl('div');
  const label = new MiniEl('div');
  const botCards = view.zones.hand.filter((o) => o.controllerId === BOT_ID).length;
  assert.ok(botCards > 0, 'bot ma karty w ręce');
  renderEnemyHand(host, label, view, session, BOT_ID);
  const backs = host.descendants().filter((n) => /card-back/.test(n.className));
  assert.equal(backs.length, botCards, 'jeden rewers na kartę w ręce bota');
  assert.match(label.textContent, new RegExp(`${botCards}`), 'etykieta podaje liczbę kart');
});

test('M201/B: rewersy nie zdradzają tożsamości kart bota (CR 402.2)', () => {
  const session = session2();
  const view = session.view();
  const host = new MiniEl('div');
  renderEnemyHand(host, new MiniEl('div'), view, session, BOT_ID);
  const text = host.textContent;
  for (const cardId of ['goblin-piker', 'Goblin Piker', 'Mountain']) {
    assert.ok(!text.includes(cardId), `rewers nie może zdradzać „${cardId}”`);
  }
});

test('M201/B: pusta ręka bota = brak rewersów i uczciwa etykieta', () => {
  const session = session2();
  const view = session.view();
  const emptyView = { ...view, zones: { ...view.zones, hand: view.zones.hand.filter((o) => o.controllerId !== BOT_ID) } };
  const host = new MiniEl('div');
  const label = new MiniEl('div');
  renderEnemyHand(host, label, emptyView, session, BOT_ID);
  assert.equal(host.descendants().filter((n) => /card-back/.test(n.className)).length, 0);
  assert.match(label.textContent, /0/);
});

test('M201/A2: poczekalnia pokazuje zawieszoną kartę z licznikami czasu', () => {
  const session = session2();
  const view = session.view();
  const waitingView = {
    ...view,
    zones: {
      ...view.zones,
      exile: [
        { id: 'x1', cardId: 'mindstab', controllerId: HUMAN_ID, zone: 'exile', suspended: true, timeCounters: 3 },
      ],
    },
  };
  const host = new MiniEl('div');
  const wrap = new MiniEl('div');
  wrap.hidden = true;
  renderWaitingExile(host, wrap, waitingView, session, {});
  assert.equal(wrap.hidden, false, 'sekcja odsłania się, gdy jest co pokazać');
  const text = host.textContent;
  assert.match(text, /Mindstab/, 'nazwa karty (CR 406.3 — wygnanie jest jawne)');
  assert.match(text, /3/, 'liczba liczników czasu');
  assert.match(text, /[Zz]awiesz/, 'status „zawieszona”');
});

test('M201/A2: poczekalnia rozróżnia właściciela i status plot', () => {
  const session = session2();
  const view = session.view();
  const waitingView = {
    ...view,
    zones: {
      ...view.zones,
      exile: [
        { id: 'x2', cardId: 'mindstab', controllerId: BOT_ID, zone: 'exile', plotted: true, plottedAtTurn: 2 },
      ],
    },
  };
  const host = new MiniEl('div');
  const wrap = new MiniEl('div');
  renderWaitingExile(host, wrap, waitingView, session, {});
  const text = host.textContent;
  assert.match(text, /Nieprzyjaciel/, 'kafel mówi, czyja to karta');
  assert.match(text, /[Pp]lot/, 'status plot');
});

test('M201/A2: zwykła karta w wygnaniu NIE trafia do poczekalni (sekcja zostaje ukryta)', () => {
  const session = session2();
  const view = session.view();
  const waitingView = {
    ...view,
    zones: { ...view.zones, exile: [{ id: 'x3', cardId: 'mindstab', controllerId: HUMAN_ID, zone: 'exile' }] },
  };
  const host = new MiniEl('div');
  const wrap = new MiniEl('div');
  wrap.hidden = false;
  renderWaitingExile(host, wrap, waitingView, session, {});
  assert.equal(wrap.hidden, true, 'poczekalnia to karty CZEKAJĄCE, nie całe wygnanie');
  assert.equal(host.children.length, 0);
});

// --- WIRING (L5: test funkcji ≠ test produktu) ----------------------------
// Sekcje muszą być podpięte do renderTableView i do elementów z index.html,
// inaczej powtórzyłaby się historia M200/B (mechanizm istniał, ale nikt go
// nie wywoływał — linki w logu były martwe od urodzenia).

test('M201/A2+B: renderTableView zapełnia rękę bota i poczekalnię na PRAWDZIWEJ partii', () => {
  const session = session2();
  let suspended = false;
  for (let i = 0; i < 200 && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmds = view.legalCommands;
    const pick = cmds.find((c) => c.type === 'resolve_mulligan_choice' && c.keep)
      ?? cmds.find((c) => c.type === 'play_land')
      ?? (!suspended ? cmds.find((c) => c.type === 'suspend_card') : null)
      ?? cmds.find((c) => c.type === 'draw_card')
      ?? cmds.find((c) => c.type === 'pass_priority') ?? cmds[0];
    if (!pick) break;
    if (pick.type === 'suspend_card') suspended = true;
    if (!session.apply(pick).ok) break;
    if (suspended && session.state.zones.exile.length > 0) break;
  }
  assert.equal(suspended, true, 'scenariusz: karta zawieszona');

  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'handEnemy', 'handEnemyLabel', 'waitingZone', 'waitingWrap', 'actions', 'log',
    'turnIndicator', 'metaFoe', 'metaOwn', 'daynight', 'poison', 'undercity', 'turnHistory']) {
    els[key] = new MiniEl('div');
  }
  renderTableView({ els, session, play: () => {}, onCardClick: null });

  const backs = els.handEnemy.descendants().filter((n) => /card-back/.test(n.className));
  assert.ok(backs.length > 0, 'ręka bota narysowana rewersami przez renderTableView');
  assert.match(els.handEnemyLabel.textContent, /Ręka przeciwnika: \d+/, 'etykieta z liczbą kart');
  assert.equal(els.waitingWrap.hidden, false, 'poczekalnia odsłonięta, bo karta czeka');
  assert.match(els.waitingZone.textContent, /Mindstab/, 'zawieszona karta na stole');
  assert.match(els.waitingZone.textContent, /licznik/, 'z licznikami czasu');
});
