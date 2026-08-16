import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { botReasoningText, renderTableView } from '../src/table/render.js';

/**
 * B5 — UX rozumowania bota (docs/BOT_ROADMAP.md, decyzja właściciela
 * 2026-08-01): ślad decyzji bota (trace) jest widoczny w OSOBNYM okienku
 * stołu „Rozumowanie bota", DOMYŚLNIE ZWINIĘTYM; po rozwinięciu pokazuje
 * „dlaczego bot zagrał X" (wybrana opcja, ocena, alternatywy).
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
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }

  find(predicate) { return this.descendants().find(predicate) ?? null; }

  findAll(predicate) { return this.descendants().filter(predicate); }
}

function installMiniDom() {
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
}

function buildDecks(botFile = 'green.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

function makeEls() {
  const keys = ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'actions', 'log', 'hoverPreview',
    'botReasoning', 'botReasoningCount'];
  return Object.fromEntries(keys.map((key) => [key, new MiniEl(`#${key}`)]));
}

// --- formatowanie śladu -----------------------------------------------------

test('botReasoningText: opisuje wybór, ocenę i alternatywy po polsku', () => {
  const text = botReasoningText({
    turn: 3, step: 'main', chosen: 'play_land', score: 90,
    options: [
      { cmd: 'play_land', score: 90 },
      { cmd: 'cast_permanent(x)', score: 70 },
      { cmd: 'pass_priority', score: 0 },
    ],
  });
  assert.match(text, /T3 · Faza główna — Zagranie landa \(ocena 90\)/);
  assert.match(text, /najlepsza z 3 opcji/);
  assert.match(text, /Zagranie permanentu \(70\)/);
  assert.match(text, /Pass priorytetu \(0\)/);
});

test('botReasoningText: ataki i puste ataki mają czytelne etykiety', () => {
  const attack = botReasoningText({
    turn: 5, step: 'declare_attackers', chosen: 'attack[permanent-1,permanent-2]', score: 12, options: [],
  });
  assert.match(attack, /Atak \(2 stworów\)/);
  const empty = botReasoningText({ turn: 6, step: 'declare_attackers', chosen: 'attack[]', score: 0, options: [] });
  assert.match(empty, /Brak ataku/);
});

// --- sesja: ślad decyzji jest zbierany -------------------------------------

test('sesja zbiera ślad decyzji bota (reasoning rośnie po ruchach bota)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 9, registry, decks });
  assert.ok(Array.isArray(session.reasoning));
  const moves = 40;
  for (let i = 0; i < moves && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    session.apply(cmd);
  }
  assert.ok(session.reasoning.length > 0, 'bot zostawił ślad decyzji');
  for (const entry of session.reasoning) {
    assert.ok(Number.isInteger(entry.turn), 'wpis ma turę');
    assert.ok(typeof entry.chosen === 'string' && entry.chosen.length > 0, 'wpis ma wybraną komendę');
    assert.ok(Number.isFinite(entry.score), 'wpis ma ocenę');
  }
  // Kolejność: najstarsze z przodu, najnowsze na końcu.
  for (let i = 1; i < session.reasoning.length; i += 1) {
    assert.ok(session.reasoning[i].turn >= session.reasoning[i - 1].turn);
  }
});

test('bot bez trace() (np. aggro) nie psuje sesji — reasoning pusty', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 4, registry, decks, botFactory: (s) => ({ chooseCommand: (v) => v.legalCommands[0] }) });
  const view = session.view();
  const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type)) ?? view.legalCommands[0];
  session.apply(cmd);
  assert.ok(Array.isArray(session.reasoning));
});

// --- render panelu ----------------------------------------------------------

test('render: panel rozumowania pokazuje wpisy i licznik; bez śladu — komunikat', () => {
  installMiniDom();
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 9, registry, decks });
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  // T4 (mulligan): pierwsza decyzja człowieka to ręka startowa (keep) —
  // bot jeszcze nie grał, ślad pojawia się po zatrzymaniu ręki.
  if (session.view().legalCommands.some((c) => c.type === 'resolve_mulligan_choice')) {
    assert.ok(session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice')).ok);
    renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  }
  // Sesja już rozegrała ruchy bota (auto-pass w pustych oknach) — wpisy są.
  assert.ok(session.reasoning.length > 0, 'bot zostawił ślad jeszcze przed ruchem człowieka');
  assert.equal(els.botReasoningCount.textContent, String(session.reasoning.length));
  assert.match(els.botReasoning.textContent, /T\d+ · /);
  assert.match(els.botReasoning.textContent, /ocena/);

  // Po kolejnych ruchach wpisy przybywają.
  const before = session.reasoning.length;
  for (let i = 0; i < 30 && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    session.apply(cmd);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  assert.ok(session.reasoning.length >= before, 'ślad rośnie z partią');
  assert.equal(els.botReasoningCount.textContent, String(session.reasoning.length));
});

test('render: sesja bez śladu (bot bez trace) pokazuje komunikat „Brak danych"', () => {
  installMiniDom();
  const els = makeEls();
  const fake = {
    view: () => ({ zones: { hand: [], battlefield: [], stack: [], graveyard: [], exile: [], library: [] }, legalCommands: [], players: [], status: 'active', turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'main' }, playerId: 'p1' }),
    log: [], reasoning: [],
  };
  renderTableView({ els, session: fake, play: () => {}, onCardClick: () => {} });
  assert.match(els.botReasoning.textContent, /Brak danych/);
  assert.equal(els.botReasoningCount.textContent, '');
});

test('render: brak kontenera botReasoning w els nie psuje renderu (kompatybilność)', () => {
  installMiniDom();
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 9, registry, decks });
  const keys = ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'actions', 'log', 'hoverPreview'];
  const els = Object.fromEntries(keys.map((key) => [key, new MiniEl(`#${key}`)]));
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
});

test('index.html: panel „Rozumowanie bota" jest domyślnie zwinięty (bez open)', () => {
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const panel = html.match(/<details class="panel">\s*<summary>Rozumowanie bota[\s\S]*?<\/details>/);
  assert.ok(panel, 'panel rozumowania istnieje');
  assert.ok(!/Rozumowanie bota[^<]*<\/summary>[\s\S]{0,200}?open/.test(html), 'domyślnie zwinięty (brak atrybutu open)');
  assert.match(html, /id="bot-reasoning"/);
  assert.match(html, /id="bot-reasoning-count"/);
  // W przeciwieństwie do Logu partii, który jest otwarty.
  assert.match(html, /<details class="panel" open>\s*<summary>Log partii/);
});
