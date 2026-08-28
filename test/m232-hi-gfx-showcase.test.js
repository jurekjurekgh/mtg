import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { renderCardArtShowcase, cardHasShowcaseArt } from '../src/table/render.js';
import { localArtUrl, scryfallCardUrl, IMAGE_SIZE } from '../src/table/card-images.js';

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

test('renderCardArtShowcase: TRZY obrazy — FOT u góry, pod nim para [KON][Scryfall] (I2)', () => {
  const host = new MiniEl('#art-showcase');
  const card = REGISTRY.get('dimir-guildgate'); // ma artId 570
  renderCardArtShowcase(host, card);
  // FOT zostaje bezpośrednim dzieckiem warstwy (jak dotąd, wielkość bez zmian).
  const fot = host.children.find((el) => el.tagName === 'img' && el.className.includes('showcase-fot'));
  assert.ok(fot, 'FOT zostaje u góry');
  // I2 (zgłoszenie właściciela 2026-08-28): obok KON (po prawej) ilustracja
  // Scryfall — „ta sama, która domyślnie jest prezentowana na stole". Para
  // (KON + Scryfall) siedzi we wspólnym wierszu i jest wycentrowana jak FOT.
  const row = host.children.find((el) => el.tagName !== 'img' && el.className.includes('showcase-row'));
  assert.ok(row, 'wiersz pary KON+Scryfall istnieje');
  const kon = row.children.find((el) => el.tagName === 'img' && el.className.includes('showcase-kon'));
  const sf = row.children.find((el) => el.tagName === 'img' && el.className.includes('showcase-scryfall'));
  assert.ok(kon, 'KON w wierszu');
  assert.ok(sf, 'Scryfall w wierszu — zawsze (brak = błąd, więc łapiemy to asercją)');
  assert.ok(row.children.indexOf(kon) < row.children.indexOf(sf), 'Scryfall jest PO PRAWEJ od KON');
  assert.equal(fot.src, localArtUrl(card, 'fot'));
  assert.equal(kon.src, localArtUrl(card, 'kon'));
  // M254/A (zgłoszenie właściciela, Willbender): warstwa ma pokazywać TEN SAM
  // druk co stół — `imageUri` z definicji (druk z kolekcji), a nie redirect po
  // nazwie (`/cards/named?exact=`), po którym Scryfall oddaje druk DOMYŚLNY.
  // Wcześniej było tu `scryfallImageUrl(card)` i warstwa pokazywała inną
  // edycję niż kafel na stole (pin uaktualniony do poprawnego zachowania).
  assert.equal(sf.src, scryfallCardUrl(card, { size: IMAGE_SIZE.zoom }));
  assert.ok(!sf.src.includes('/cards/named?'),
    'druk z definicji, nie domyślny Scryfalla po nazwie');
  // CSS pilnuje równej wysokości KON i Scryfall oraz niezmienionej wielkości
  // KON — asercja obecności klas, na których „wisi" ta reguła.
  assert.ok(kon.className.includes('showcase-kon') && sf.className.includes('showcase-scryfall'));
});

test('renderCardArtShowcase: FOT/KON z błędem (404) są chowane; Scryfall NIE (I2: brak = błąd)', () => {
  const host = new MiniEl('#art-showcase');
  renderCardArtShowcase(host, REGISTRY.get('shatter'));
  const imgs = imagesIn(host);
  assert.equal(imgs.length, 3, 'FOT + KON + Scryfall');
  const fot = imgs.find((el) => el.className.includes('showcase-fot'));
  const kon = imgs.find((el) => el.className.includes('showcase-kon'));
  const sf = imgs.find((el) => el.className.includes('showcase-scryfall'));
  fot.emit('error');
  assert.equal(fot.style.display, 'none', 'lokalny FOT z błędem znika (bez pustej ramki)');
  kon.emit('error');
  assert.equal(kon.style.display, 'none', 'lokalny KON z błędem znika');
  kon.emit('load');
  assert.ok(!kon.className.includes('is-loading'), 'wczytany traci is-loading');
  // Wg właściciela ilustracja Scryfalla istnieje ZAWSZE — brak jest błędem
  // i NIE ma być cicho maskowany, więc handler error nie chowa tego obrazka.
  sf.emit('error');
  assert.notEqual(sf.style.display, 'none', 'Scryfalla nie chowamy cicho (brak = błąd do zobaczenia)');
  sf.emit('load');
  assert.ok(!sf.className.includes('is-loading'));
});

test('renderCardArtShowcase: I1 — podpis RZUCAJĄCEGO małą czcionką (kto rzucił)', () => {
  const host = new MiniEl('#art-showcase');
  const card = REGISTRY.get('dimir-guildgate');
  renderCardArtShowcase(host, card, { casterName: 'Czarodziejka' });
  const caption = [host, ...host.descendants()].find((el) => el.className === 'showcase-caster');
  assert.ok(caption, 'caption rzucającego istnieje na warstwie');
  assert.equal(caption.textContent, 'Rzuca: Czarodziejka');
  // Bez danych o rzucającym (np. wywołanie legacy) — żadnej pustej ramki.
  const host2 = new MiniEl('#art-showcase');
  renderCardArtShowcase(host2, card);
  assert.ok(![host2, ...host2.descendants()].some((el) => el.className === 'showcase-caster'),
    'bez casterName nie ma captionu');
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
  for (const { cardId, playerId, eventType } of calls) {
    assert.ok([HUMAN_ID, BOT_ID].includes(playerId), `onCast niesie playerId (I1): ${playerId}`);
    assert.ok(['spell_cast', 'permanent_cast', 'aura_spell_cast', 'land_played'].includes(eventType),
      `nieoczekiwany typ zdarzenia: ${eventType}`);
    assert.ok(!cardId.startsWith('basic-'), `basic-land nie może wołać onCast: ${cardId}`);
    const card = registry.get(cardId);
    assert.ok(!(card?.types ?? []).includes('Basic'), `karta Basic nie może wołać onCast: ${cardId}`);
  }
});

