import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { renderBotMoves, renderCardFullscreen, renderMiniFace } from '../src/table/render.js';

/**
 * UX stołu M18 (decyzje właściciela 2026-08-02):
 *  A. dwuklik / double-tap na kaflu otwiera skan karty na pełnym ekranie,
 *     a pojedyncze tapnięcie karty BEZ dostępnych akcji robi to samo
 *     (zamiast pokazywać puste menu kontekstowe);
 *  B. ruchy bota (czary, zdolności, triggery) trafiają do modala
 *     „Ruch przeciwnika” — wcześniej były wyłącznie w logu. Passy
 *     i tapowanie many są świadomie pomijane jako szum.
 *
 * Testy są headless: mini-DOM w pamięci, bez pobierania obrazów.
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
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }

  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }

  find(predicate) { return this.descendants().find(predicate) ?? null; }

  findAll(predicate) { return this.descendants().filter(predicate); }
}

globalThis.document = { createElement: (tag) => new MiniEl(tag) };
globalThis.window = { innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: false }) };

const imagesIn = (host) => host.findAll((el) => el.tagName === 'img');

function buildSession(seed = 7) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, session: createSession({ seed, registry, decks }) };
}

// --- A. Pełny ekran karty ---------------------------------------------------

test('pełny ekran realnej karty pokazuje skan ze Scryfalla w rozmiarze large', () => {
  const registry = createCardRegistry();
  const details = registry.get('highland-game');
  const host = new MiniEl('#fullscreen');
  renderCardFullscreen(host, {
    name: details.name, colors: details.colors, kind: 'creature',
    types: details.types, subtypes: details.subtypes, keywords: details.keywords,
    manaCost: details.manaCost, power: details.power, toughness: details.toughness,
    livePower: details.power, liveToughness: details.toughness,
    spell: null, abilities: details.abilities, morph: null,
    set: details.set, imageUri: details.imageUri, artId: details.artId,
  });

  const img = imagesIn(host)[0];
  assert.ok(img, 'pełny ekran musi pokazywać obraz karty');
  assert.match(img.src, /cards\.scryfall\.io\/large\/front\//, 'na pełnym ekranie używamy dużego skanu');
  assert.notEqual(img.style.display, 'none', 'obraz nie może startować ukryty (nie zostałby pobrany)');
  assert.match(host.textContent, /Dotknij ✕/, 'jest podpowiedź, jak zamknąć');
});

test('pełny ekran karty syntetycznej (bez druku) pokazuje twarz, nie pustkę', () => {
  const registry = createCardRegistry();
  const details = registry.get('token_wolf');
  const host = new MiniEl('#fullscreen');
  renderCardFullscreen(host, {
    name: details.name, colors: details.colors, kind: 'creature',
    types: details.types, subtypes: [], keywords: [], manaCost: details.manaCost,
    power: details.power, toughness: details.toughness,
    livePower: details.power, liveToughness: details.toughness,
    spell: null, abilities: [], morph: null, set: details.set,
    imageUri: null, artId: null,
  });
  assert.equal(imagesIn(host).length, 0, 'brak druku = brak <img>');
  assert.match(host.textContent, /Wolf/, 'zostaje syntetyczna twarz z nazwą');
});

test('karta zakryta na pełnym ekranie pokazuje rewers, nie swoją tożsamość (FoW)', () => {
  const host = new MiniEl('#fullscreen');
  renderCardFullscreen(host, {
    name: 'Karta zakryta', colors: [], kind: 'creature', types: ['Creature'],
    subtypes: [], keywords: [], manaCost: null, power: 2, toughness: 2,
    livePower: 2, liveToughness: 2, spell: null, abilities: [], morph: null,
    set: null, imageUri: null, artId: null, faceDown: true,
  });
  const img = imagesIn(host)[0];
  assert.ok(img, 'rewers jest obrazem');
  assert.match(img.src, /backs\.scryfall\.io/, 'wspólny rewers dla wszystkich zakrytych kart');
});

// --- B. Modal ruchu bota ----------------------------------------------------

test('sesja zbiera istotne ruchy bota, pomijając passy i tapowanie many', () => {
  const { session } = buildSession(11);
  // Rozegraj kilka realnych ruchów gracza, żeby bot zdążył odpowiedzieć.
  for (let i = 0; i < 12 && session.view().status === 'active'; i += 1) {
    const view = session.view();
    const cmd = view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    session.apply(cmd);
  }
  const moves = session.botMoves ?? [];
  // Bufor może być pusty (bot mógł tylko passować) — ale jeśli coś zebrał,
  // to nie może być szumem.
  for (const move of moves) {
    assert.ok(move.text && move.text.length > 0, 'każdy wpis ma czytelny opis');
    assert.equal(move.type === 'priority_passed', false, 'passy są pomijane');
    assert.equal(move.type === 'mana_produced', false, 'tapowanie many jest pomijane');
    assert.equal(move.type === 'mana_changed', false, 'zmiany puli many są pomijane');
  }
});

test('bufor ruchów bota czyści się przy kolejnym ruchu gracza (pokazujemy odpowiedź, nie historię)', () => {
  const { session } = buildSession(5);
  const firstCmd = session.view().legalCommands.find((c) => c.type !== 'concede');
  session.apply(firstCmd);
  const afterFirst = [...(session.botMoves ?? [])];
  const secondCmd = session.view().legalCommands.find((c) => c.type !== 'concede');
  if (secondCmd) {
    session.apply(secondCmd);
    const afterSecond = session.botMoves ?? [];
    // Bufor po drugim ruchu nie może zawierać wpisów z pierwszego.
    for (const entry of afterSecond) {
      assert.equal(
        afterFirst.length > 0 && afterFirst[0] === entry, false,
        'bufor nie kumuluje wpisów między ruchami gracza',
      );
    }
  }
  session.clearBotMoves();
  assert.equal(session.botMoves.length, 0, 'clearBotMoves opróżnia bufor');
});

test('modal ruchu bota renderuje listę zagrań i skan ostatniej karty', () => {
  const { registry, session } = buildSession(3);
  const host = new MiniEl('#bot-move-body');
  renderBotMoves(host, [
    { type: 'permanent_cast', text: 'Bot zagrywa Grizzled Outcasts', cardId: 'grizzled-outcasts' },
    { type: 'ability_triggered', text: 'Zoraline — trigger (atak)', cardId: 'zoraline' },
  ], session);

  assert.match(host.textContent, /Grizzled Outcasts/);
  assert.match(host.textContent, /Zoraline/);
  const img = imagesIn(host)[0];
  assert.ok(img, 'modal pokazuje ilustrację zagranej karty');
  assert.match(img.src, /cards\.scryfall\.io/, 'to skan ze Scryfalla, nie twarz');
  assert.ok(registry.get('zoraline'), 'karta użyta w teście istnieje w katalogu');
});

test('modal ruchu bota bez zagrań mówi wprost, że nic się nie wydarzyło', () => {
  const { session } = buildSession(3);
  const host = new MiniEl('#bot-move-body');
  renderBotMoves(host, [], session);
  assert.match(host.textContent, /nie wykonał żadnego istotnego ruchu/);
  assert.equal(imagesIn(host).length, 0);
});

test('mini-twarz w menu kontekstowym nadal działa (regresja M7c)', () => {
  const registry = createCardRegistry();
  const host = new MiniEl('#host');
  const fakeSession = {
    view: () => ({
      zones: {
        battlefield: [{
          id: 'permanent-1', cardId: 'highland-game', controllerId: HUMAN_ID,
          zone: 'battlefield', kind: 'creature', tapped: false, damage: 0,
        }],
        hand: [], stack: [], graveyard: [], exile: [], library: [],
      },
    }),
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
  renderMiniFace(host, fakeSession, 'permanent-1');
  assert.ok(imagesIn(host)[0], 'mini-twarz realnej karty też pokazuje skan');
});
