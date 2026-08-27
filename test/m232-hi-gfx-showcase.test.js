import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { renderCardArtShowcase, cardHasShowcaseArt } from '../src/table/render.js';
import { localArtUrl } from '../src/table/card-images.js';

/**
 * M232 — tryb wysoko-graficzny (zlecenie właściciela): przy RZUCENIU czaru /
 * wystawieniu non-basic lądu pełnoekranowa warstwa z dwiema ilustracjami
 * (FOT nad KON). Testy headless: render (mini-DOM) + obserwator `onCast` sesji.
 */

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.style = {};
    this.className = ''; this.text = ''; this.src = ''; this.alt = '';
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }

  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }

  findAll(predicate) { return this.descendants().filter(predicate); }
}

globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const REGISTRY = createCardRegistry();
const imagesIn = (host) => [host, ...host.descendants()].filter((el) => el.tagName === 'img');

test('renderCardArtShowcase: buduje DWA obrazy — FOT nad KON — z lokalnymi adresami', () => {
  const host = new MiniEl('#art-showcase');
  const card = REGISTRY.get('dimir-guildgate'); // ma artId 570
  renderCardArtShowcase(host, card);
  const imgs = imagesIn(host);
  assert.equal(imgs.length, 2, 'dwie ilustracje');
  // Kolejność: FOT pierwszy (u góry), KON drugi (pod spodem).
  assert.ok(imgs[0].className.includes('showcase-fot'), 'pierwszy = FOT');
  assert.ok(imgs[1].className.includes('showcase-kon'), 'drugi = KON');
  assert.equal(imgs[0].src, localArtUrl(card, 'fot'));
  assert.equal(imgs[1].src, localArtUrl(card, 'kon'));
});

test('renderCardArtShowcase: obraz, który się nie wczyta (404), jest chowany', () => {
  const host = new MiniEl('#art-showcase');
  renderCardArtShowcase(host, REGISTRY.get('shatter'));
  const imgs = imagesIn(host);
  assert.equal(imgs.length, 2);
  imgs[0].emit('error');
  assert.equal(imgs[0].style.display, 'none', 'obraz z błędem znika (bez pustej ramki)');
  imgs[1].emit('load');
  assert.ok(!imgs[1].className.includes('is-loading'), 'wczytany traci is-loading');
});

test('cardHasShowcaseArt: true dla karty z artId, false bez', () => {
  assert.equal(cardHasShowcaseArt(REGISTRY.get('dimir-guildgate')), true);
  assert.equal(cardHasShowcaseArt(REGISTRY.get('basic-forest')), false); // brak artId
  assert.equal(cardHasShowcaseArt(null), false);
});

// --- Obserwator onCast sesji ---------------------------------------------

function buildSession(onCast, { seed = 7 } = {}) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-brg.txt', 'utf8'), registry).cardIds],
  ]);
  return createSession({ seed, registry, decks, onCast });
}

test('onCast: sesja bez callbacka działa (opcjonalny obserwator)', () => {
  assert.doesNotThrow(() => buildSession(undefined));
  assert.doesNotThrow(() => buildSession(null));
});

test('onCast: pełna partia woła callback dla rzutów, NIGDY dla basic-lądów', () => {
  // Odgrywamy realną partię (jak Żywy Tester: pierwsza znacząca akcja gracza,
  // wznawianie bota) i sprawdzamy DWA warunki:
  //  1. callback W OGÓLE się odpala (inaczej test byłby pusty — L27),
  //  2. żadne wywołanie nie dotyczy basic-lądu (filtr non-basic).
  const calls = [];
  const session = buildSession((p) => calls.push(p), { seed: 7 });
  const registry = createCardRegistry();
  for (let i = 0; i < 600 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) { session.continueBotPlay(); continue; }
    const view = session.view();
    const meaningful = view.legalCommands.filter(
      (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
  }
  assert.ok(calls.length > 0, 'callback musi się odpalić dla rzutów w realnej partii (inaczej test pusty)');
  for (const { cardId, eventType } of calls) {
    assert.ok(['spell_cast', 'permanent_cast', 'aura_spell_cast', 'land_played'].includes(eventType),
      `nieoczekiwany typ zdarzenia: ${eventType}`);
    assert.ok(!cardId.startsWith('basic-'), `basic-land nie może wołać onCast: ${cardId}`);
    const card = registry.get(cardId);
    assert.ok(!(card?.types ?? []).includes('Basic'), `karta Basic nie może wołać onCast: ${cardId}`);
  }
});

