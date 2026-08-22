import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, TURN_NAMES, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { renderTurnHistory, renderUndercity } from '../src/table/render.js';

/**
 * M25 — UX sekcji „Przebieg tur (dla AI)" (decyzja właściciela 2026-08-03):
 * blok analogiczny do „Rozumowania bota" opisujący, co robili gracz
 * (Czarodziejka) i bot (Nieprzyjaciel) w poprzedniej pełnej turze albo
 * w dwóch ostatnich — gotowy tekst do zasilenia AI fabularnym opisem,
 * z przełącznikiem 1/2 tur i guzikiem kopiowania do schowka.
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
    this.checked = false;
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
}

// RenderUndercity buduje DOM przez document.createElement — instalacja
// minimalnego DOM-u (jak w pozostałych testach warstwy UI).
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

function playSome(session, maxCommands = 300) {
  for (let i = 0; i < maxCommands && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    session.apply(cmd);
  }
}

test('TURN_NAMES: człowiek to Czarodziejka, bot to Nieprzyjaciel', () => {
  assert.equal(TURN_NAMES[HUMAN_ID], 'Czarodziejka');
  assert.equal(TURN_NAMES[BOT_ID], 'Nieprzyjaciel');
});

test('turnHistoryText: nagłówek tury z imieniem, akcje po polsku', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 5, registry, decks });
  playSome(session);
  const text = session.turnHistoryText(1);
  assert.match(text, /\*\*Tura \d+ — (Czarodziejka|Nieprzyjaciel)\*\*/);
  assert.match(text, /• /, 'akcje są wypunktowane');
  assert.ok(session.turnHistory.length >= 1, 'sesja zebrała przynajmniej jedną pełną turę');
});

test('turnHistoryText: 1 vs 2 ostatnie tury dają różną liczbę nagłówków', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 6, registry, decks });
  playSome(session);
  const one = session.turnHistoryText(1);
  const two = session.turnHistoryText(2);
  assert.equal((one.match(/\*\*Tura/g) ?? []).length, 1);
  assert.equal((two.match(/\*\*Tura/g) ?? []).length, Math.min(2, session.turnHistory.length));
  // Dwie tury nie mogą być kopią jednej — zawierają różne nagłówki numerów.
  if (session.turnHistory.length >= 2) {
    const numbers = [...two.matchAll(/\*\*Tura (\d+)/g)].map((m) => m[1]);
    assert.equal(new Set(numbers).size, 2, 'nagłówki dotyczą dwóch różnych tur');
  }
});

test('imiona Czarodziejka/Nieprzyjaciel pojawiają się w liniach akcji', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 8, registry, decks });
  playSome(session, 80);
  const text = session.turnHistoryText(2);
  assert.ok(text.length > 0);
  assert.match(text, /Czarodziejka/);
  assert.match(text, /Nieprzyjaciel/);
});

test('renderTurnHistory: pusta historia pokazuje podpowiedź, po ruchach tekst tur', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 9, registry, decks });
  const els = {
    turnHistory: new MiniEl('pre'),
    turnHistoryCount: new MiniEl('span'),
    turnHistorySelect: new MiniEl('select'),
  };
  renderTurnHistory(els, session, null);
  assert.match(els.turnHistory.textContent, /Brak ukończonych tur/);
  assert.equal(els.turnHistoryCount.textContent, '');

  playSome(session, 60);
  renderTurnHistory(els, session, null); // null = domyślnie ostatnia tura
  assert.match(els.turnHistory.textContent, /\*\*Tura \d+ — (Czarodziejka|Nieprzyjaciel)\*\*/);
  assert.ok(els.turnHistoryCount.textContent.length > 0, 'licznik pokazuje liczbę pełnych tur');
});

// M188/K (zlecenie właściciela 2026-08-22): przełącznik „1 albo 2 ostatnie
// tury" zastąpiony listą WSZYSTKICH tur — render pokazuje JEDNĄ wybraną.
test('render pokazuje dokładnie JEDNĄ wybraną turę z listy (M188/K)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 10, registry, decks });
  playSome(session, 120);
  const els = {
    turnHistory: new MiniEl('pre'),
    turnHistoryCount: new MiniEl('span'),
    turnHistorySelect: new MiniEl('select'),
  };
  const entries = session.turnHistoryEntries();
  assert.ok(entries.length >= 2, 'scenariusz ma co najmniej dwie ukończone tury');
  renderTurnHistory(els, session, entries[0].number);
  assert.equal((els.turnHistory.textContent.match(/\*\*Tura/g) ?? []).length, 1,
    'panel pokazuje jedną turę (dwie naraz są zbędne — zlecenie właściciela)');
  assert.match(els.turnHistory.textContent, new RegExp(`\\*\\*Tura ${entries[0].number} `),
    'i jest to tura wybrana w liście');
  assert.equal(els.turnHistorySelect.children.length, entries.length,
    'lista zawiera WSZYSTKIE tury od początku gry');
});

test('renderUndercity: karta lochu z inicjatywą i zaznaczeniem pokoju gracza (M24)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 11, registry, decks });
  // Wymuszamy stan lochu (mechaniki testuje real-cards-batch11) — tutaj render.
  session.state.initiativePlayerId = HUMAN_ID;
  session.state.undercityProgress = { [HUMAN_ID]: 2 };
  const els = { undercity: new MiniEl('div') };
  renderUndercity(els, session, session.view());
  assert.equal(els.undercity.hidden, false, 'panel widoczny, gdy ktoś wszedł do lochu');
  // Karta lochu: <img> z drukiem ze Scryfalla (legacy: api.scryfall.com/cards/tclb/20).
  const cardEl = els.undercity.children[0];
  assert.equal(cardEl.children[0].tagName, 'img');
  assert.equal(cardEl.children[0].alt, 'The Undercity');
  assert.match(cardEl.children[0].src, /tclb\/20/);
  assert.match(els.undercity.textContent, /Inicjatywa: Ty/, 'imię ze stołu (Ty/Bot), nie z sekcji AI');
  // M190/B: loch to graf — panel pokazuje NAZWĘ pokoju i dostępne drogi
  // („pokój 2/9" sugerowało liniowy przemarsz przez wszystkie dziewięć).
  assert.match(els.undercity.textContent, /pokój: Forge/, 'zaznaczony bieżący pokój gracza');
  assert.match(els.undercity.textContent, /Dalsza droga: Trap! albo Arena/, 'drogi z Forge wg Oracle');
  assert.match(els.undercity.textContent, /Secret Entrance/, 'chipy pokoi zawierają nazwy wszystkich pokoi');
  // Brak inicjatywy i postępu → panel ukryty.
  const els2 = { undercity: new MiniEl('div') };
  session.state.initiativePlayerId = null;
  session.state.undercityProgress = {};
  renderUndercity(els2, session, session.view());
  assert.equal(els2.undercity.hidden, true);
});
