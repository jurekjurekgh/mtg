import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { renderBotMoves, renderCardFullscreen, renderMiniFace } from '../src/table/render.js';
import { lookWizardKindOf, renderLookWizard } from '../src/table/choice-request.js';

/**
 * UX stołu M18 (decyzje właściciela 2026-08-02):
 *  A. dwuklik / double-tap na kaflu otwiera skan karty na pełnym ekranie,
 *     a pojedyncze tapnięcie karty BEZ dostępnych akcji robi to samo
 *     (zamiast pokazywać puste menu kontekstowe);
 *  B. ruchy bota (czary, zdolności, triggery) trafiają do modala
 *     „Rozgrywka” — wcześniej były wyłącznie w logu. Passy
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
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), registry).cardIds],
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

// M157/A (uwaga właściciela, 2026-08-20): pełny ekran BEZ syntetycznej
// „niby-karty" — token z ilustracją Scryfall pokazuje skan; karta bez
// ŻADNEGO obrazu pokazuje pustkę (do czasu uzupełnienia imageUri w danych),
// a nie rysowaną pseudo-kartę z pseudo-tekstem.
test('pełny ekran tokenu pokazuje skan; bez żadnego obrazu — pusto, bez niby-karty', () => {
  const registry = createCardRegistry();
  const details = registry.get('token_wolf');
  assert.ok(details.imageUri, 'token_wolf ma ilustrację Scryfall w danych');
  const host = new MiniEl('#fullscreen');
  renderCardFullscreen(host, {
    name: details.name, colors: details.colors, kind: 'creature',
    types: details.types, subtypes: [], keywords: [], manaCost: details.manaCost,
    power: details.power, toughness: details.toughness,
    livePower: details.power, liveToughness: details.toughness,
    spell: null, abilities: [], morph: null, set: details.set,
    imageUri: details.imageUri, artId: null,
  });
  const img = imagesIn(host)[0];
  assert.ok(img, 'token z imageUri pokazuje <img>');
  assert.match(img.src, /cards\.scryfall\.io/, 'skan tokenu ze Scryfalla');

  const bare = new MiniEl('#fullscreen-bare');
  renderCardFullscreen(bare, {
    name: 'Nic', colors: [], kind: 'artifact', types: ['Artifact'],
    subtypes: [], keywords: [], manaCost: 0, power: null, toughness: null,
    livePower: null, liveToughness: null, spell: null, abilities: [], morph: null,
    set: null, imageUri: null, artId: null,
  });
  assert.equal(imagesIn(bare).length, 0, 'brak druku = brak <img>');
  assert.equal(bare.findAll((el) => String(el.className).startsWith('face')).length, 0,
    'M157/A: bez syntetycznej twarzy na pełnym ekranie');
  assert.doesNotMatch(bare.textContent, /Nic/, 'pseudo-karta z nazwą się nie rysuje');
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

test('bug B: land_played w modalu ruchu bota niesie kartę — ilustracja basic landa (2026-08-06)', () => {
  const { session } = buildSession(11);
  // Rozgrywamy ruchy gracza, aż bot wystawi ląd; wpis musi mieć cardId,
  // bo z niego modal bierze skan (zgłoszenie: „zagrywa Swamp" bez ilustracji).
  let landMove = null;
  for (let i = 0; i < 80 && session.view().status === 'active' && !landMove; i += 1) {
    const view = session.view();
    const cmd = view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    session.apply(cmd);
    landMove = (session.botMoves ?? []).find((m) => m.type === 'land_played') ?? null;
  }
  assert.ok(landMove, 'bot nie zagrał żadnego lądu w próbce — poszerzyć pętlę testu');
  assert.ok(landMove.cardId, `wpis land_played bez cardId — modal nie ma czego pokazać: ${JSON.stringify(landMove)}`);
  const details = session.cardDetails(landMove.cardId);
  assert.ok(details?.imageUri, `ląd ${landMove.cardId} bez imageUri (basic landy mają skan)`);
  const host = new MiniEl('#bot-move-body');
  renderBotMoves(host, [landMove], session);
  const img = imagesIn(host)[0];
  assert.ok(img, 'modal ruchu bota nie pokazuje żadnego obrazka dla zagrania lądu');
  assert.match(img.src, /scryfall/, 'skan basic landa z Scryfalla (imageUri karty)');
});

test('zgłoszenie 2026-08-07: pojedyncze zagranie bota pokazuje DOKŁADNIE JEDNĄ ilustrację (duży skan, bez mini-kafla tej samej karty)', () => {
  const { session } = buildSession(11);
  // Jeden ruch z kartą (np. ląd) — wcześniej modal dublował obraz: duży skan
  // podsumowania + mini-kafel tego samego wpisu na liście.
  const host = new MiniEl('#bot-move-body');
  renderBotMoves(host, [
    { type: 'land_played', text: 'Bot zagrywa Swamp', cardId: 'basic-swamp' },
  ], session);
  const imgs = imagesIn(host);
  assert.equal(imgs.length, 1, `oczekiwano 1 ilustracji, jest ${imgs.length}`);
  assert.match(imgs[0].src, /scryfall/, 'skan z Scryfalla');
  // Wiele zagrań: duży skan OSTATNIEJ karty + mini-kafla pozostałych —
  // każda karta dokładnie raz (brak duplikatu ostatniej na liście).
  const host2 = new MiniEl('#bot-move-body');
  renderBotMoves(host2, [
    { type: 'permanent_cast', text: 'Bot zagrywa Highland Game', cardId: 'highland-game' },
    { type: 'land_played', text: 'Bot zagrywa Swamp', cardId: 'basic-swamp' },
  ], session);
  const imgs2 = imagesIn(host2);
  assert.equal(imgs2.length, 2, `oczekiwano 2 ilustracji (2 różne karty), jest ${imgs2.length}`);
});

test('modal ruchu bota bez zagrań mówi wprost, że nic się nie wydarzyło', () => {
  const { session } = buildSession(3);
  const host = new MiniEl('#bot-move-body');
  renderBotMoves(host, [], session);
  assert.match(host.textContent, /nie wykonał żadnego istotnego ruchu/);
  assert.equal(imagesIn(host).length, 0);
});

// --- Wizard scry/surveil (zgłoszenie 2026-08-06, pkt 4) ----------------------

/** Klika pierwszy przycisk wizardu o danym prefiksie tekstu. */
function clickButton(host, prefix) {
  const button = host.findAll((el) => el.tagName === 'button' && el.textContent.startsWith(prefix))[0];
  assert.ok(button, `brak przycisku „${prefix}…" w: ${host.textContent}`);
  button.emit('click');
}

test('surveil 2: lista obejrzanych kart, potem wybór PO KOLEI dla każdej (regresja „wszystkich kombinacji")', () => {
  const host = new MiniEl('#choice');
  const calls = [];
  renderLookWizard(host, {
    kind: 'surveil',
    cards: [{ id: 'c1', name: 'Swamp' }, { id: 'c2', name: 'Forest' }],
    onComplete: (built) => calls.push(built),
  });
  // M120 (audyt żywym testerem): „przeglądnięte” to forma niepoprawna —
  // modal mówi teraz „obejrzane karty”.
  assert.match(host.textContent, /obejrzane karty/);
  assert.match(host.textContent, /1\. Swamp/, 'nagłówek pokazuje pierwszą kartę przeglądu');
  assert.match(host.textContent, /2\. Forest/, 'nagłówek pokazuje drugą kartę przeglądu');
  assert.match(host.textContent, /Karta 1 z 2: Swamp/, 'pierwszy krok to decyzja dla Swamp');
  clickButton(host, 'Na cmentarz');
  assert.match(host.textContent, /Karta 2 z 2: Forest/, 'drugi krok to decyzja dla Forest');
  assert.match(host.textContent, /Swamp → cmentarz/, 'lista znaczy już podjętą decyzję');
  clickButton(host, 'Na wierzch biblioteki');
  assert.deepEqual(calls, [{ millIds: ['c1'], topOrder: ['c2'] }], 'komenda złożona z kroków po kolei');
});

test('surveil z dwiema kartami na wierzchu pyta jeszcze o kolejność — klikaną od góry', () => {
  const host = new MiniEl('#choice');
  const calls = [];
  renderLookWizard(host, {
    kind: 'surveil',
    cards: [{ id: 'c1', name: 'Alpha' }, { id: 'c2', name: 'Beta' }, { id: 'c3', name: 'Gamma' }],
    onComplete: (built) => calls.push(built),
  });
  clickButton(host, 'Na cmentarz'); // Alpha → grób
  clickButton(host, 'Na wierzch biblioteki'); // Beta → wierzch
  clickButton(host, 'Na wierzch biblioteki'); // Gamma → wierzch
  assert.match(host.textContent, /od najwyższej do najniższej/, 'brak kroku kolejności wierzchu');
  clickButton(host, '1. na wierzchu: Gamma');
  clickButton(host, '2. na wierzchu: Beta');
  assert.deepEqual(calls, [{ millIds: ['c1'], topOrder: ['c3', 'c2'] }], 'topOrder dokładnie w kolejności klikania');
});

test('scry: decyzje wierzch/spód po kolei; przy 1 karcie na wierzchu kolejność jest trywialna (topOrder 1-elementowy)', () => {
  const host = new MiniEl('#choice');
  const calls = [];
  renderLookWizard(host, {
    kind: 'scry',
    cards: [{ id: 'c1', name: 'Mountain' }, { id: 'c2', name: 'Plains' }],
    onComplete: (built) => calls.push(built),
  });
  assert.match(host.textContent, /Scry 2/);
  clickButton(host, 'Na spód biblioteki');
  assert.match(host.textContent, /Mountain → spód/);
  // Ostatnia karta (c2) zostaje na wierzchu; przy 1 karcie krok kolejności
  // jest pomijany, a topOrder to trywialna permutacja jednego elementu.
  clickButton(host, 'Zostaw na wierzchu');
  assert.deepEqual(calls, [{ bottomIds: ['c1'], topOrder: ['c2'] }]);
});

test('lookWizardKindOf rozpoznaje żądanie tylko wtedy, gdy to czyste scry/surveil tego gracza', () => {
  const view = {
    playerId: 'p1',
    pendingSurveil: { playerId: 'p1', cards: [{ id: 'c1' }, { id: 'c2' }] },
    pendingScry: null,
  };
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_surveil' }, { type: 'resolve_surveil' }] }, view), 'surveil');
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_surveil' }, { type: 'resolve_scry' }] }, view), null, 'mieszane typy bez wizardu');
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_scry' }] }, view), null, 'scry bez aktywnego pendingScry');
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_backup' }] }, view), null);
  const wrongPlayer = { ...view, pendingSurveil: { playerId: 'p2', cards: [{ id: 'c1' }] } };
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_surveil' }] }, wrongPlayer), null, 'cudza decyzja nie otwiera wizardu');
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

// Zgłoszenie 2026-08-07 (UX C): własne face-down odsłaniane na pełnym ekranie.
test('pełny ekran własnej karty twarzą w dół pokazuje prawdziwą kartę (CR 708.2); cudza — zakrytą', async () => {
  const { renderCardFullscreen } = await import('../src/table/render.js');
  const host = new MiniEl('#card-fullscreen-body');
  renderCardFullscreen(host, {
    name: 'Monastery Flock', colors: ['U'], kind: 'creature',
    types: ['Creature'], subtypes: ['Bird'], keywords: ['defender', 'flying'],
    manaCost: 2, power: 0, toughness: 5, livePower: 2, liveToughness: 2,
    spell: null, abilities: [], morph: { cost: 3, morphCost: 1, colors: ['U'] },
    set: 'KTK', imageUri: 'https://cards.scryfall.io/large/front/x.jpg', artId: null,
    faceDown: false, // własna odsłonięta (cardInfoForFullscreen przekazuje faceDown=false dla właściciela)
  }, { zoom: true });
  const imgs = imagesIn(host);
  assert.ok(imgs.length > 0 && /scryfall/.test(imgs[0].src), 'własna face-down pokazuje druk');
  // M157/A: pełny ekran nie rysuje już syntetycznej twarzy — tożsamość własnej
  // karty zakrytej niesie alt obrazu (dostępny dla czytników/devtools).
  assert.equal(imgs[0].alt, 'Monastery Flock', 'własna karta face-down rozpoznawalna po alcie');
});
