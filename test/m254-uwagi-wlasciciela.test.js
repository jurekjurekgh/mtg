// M254 (2026-08-28) — uwagi właściciela z testów A–E.
//
// A. Tryb wysoko-graficzny (warstwa FOT/KON/Scryfall przy rzuceniu czaru)
//    ładował druk DOMYŚLNY Scryfalla zamiast druku z kolekcji (Willbender).
// B. Karty zagrane zakryte (Morph) — właściciel powinien widzieć prawdziwą
//    kartę na podglądzie (FoW dotyczy bota, nie gracza-właściciela).
// C. Warstwa grafik powinna PAUZOWAĆ grę (kolejka rzutów), nie pokazywać
//    tylko ostatniego czaru z sekwencji.
// D. Karta wygnana przez Wormfang Newt powinna leżeć w strefie „wygnania
//    tymczasowego" na stole (ta sama co Suspend/Plot) z badge'em.
// E. Altar of the Goyf: „attacks alone → it gets +X/+X" nie działało
//    (trigger bez efektu) — zdolność siedzi na artefakcie, nie na atakującym.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { scryfallCardUrl, scryfallImageUrl, hasPrintImage } from '../src/table/card-images.js';
import { waitingExileStatus, cardInfo, renderHoverPreview } from '../src/table/render.js';
import { createArtShowcaseQueue } from '../src/table/art-showcase.js';
import { CARD_BACK_URL } from '../src/table/card-images.js';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import fs from 'node:fs';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 254, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function resolveStack(state, limit = 20) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

// =============================================================================
// E — Altar of the Goyf („attacks alone → that creature gets +X/+X")
// =============================================================================

test('M254/E1: Altar of the Goyf — samotny atak daje +X/+X wg typów kart w grobach', () => {
  const state = game('p1', 'declare_attackers');
  put(state, 'altar', 'altar-of-the-goyf', 'p1', 'battlefield');
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  // Dwa typy kart w grobach: Creature (goblin-piker) + Instant (shock).
  put(state, 'g-creature', 'goblin-piker', 'p1', 'graveyard');
  put(state, 'g-instant', 'shock', 'p2', 'graveyard');
  assert.equal(effectivePower(state.objects.get('atk'), state), 2, 'bazowa moc 2/1');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(r.ok, `deklaracja ataku: ${r.events?.[0]?.reason ?? ''}`);
  resolveStack(state);
  const attacker = state.objects.get('atk');
  assert.equal(effectivePower(attacker, state), 4,
    '2 typy kart w grobach → +2/+2 (log właściciela: „trigger bez efektu")');
  assert.equal(effectiveToughness(attacker, state), 3);
});

test('M254/E2 (anty-over-fix): atak NIE samotny — trigger się nie odpala', () => {
  const state = game('p1', 'declare_attackers');
  put(state, 'altar', 'altar-of-the-goyf', 'p1', 'battlefield');
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'atk2', 'dromoka-warrior', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'g-creature', 'goblin-piker', 'p1', 'graveyard');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk', 'atk2'] });
  assert.ok(r.ok, `deklaracja ataku: ${r.events?.[0]?.reason ?? ''}`);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('atk'), state), 2, 'dwóch atakujących = brak buffa');
  assert.equal(effectivePower(state.objects.get('atk2'), state), 3);
});

test('M254/E3: X liczy typy kart w OBU grobach (0 typów → +0/+0)', () => {
  const state = game('p1', 'declare_attackers');
  put(state, 'altar', 'altar-of-the-goyf', 'p1', 'battlefield');
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(r.ok);
  resolveStack(state);
  const attacker = state.objects.get('atk');
  assert.equal(effectivePower(attacker, state), 2, 'puste groby → +0/+0');
  assert.equal(effectiveToughness(attacker, state), 1);
});

// =============================================================================
// A — tryb wysoko-graficzny: druk z kolekcji, nie domyślny Scryfalla
// =============================================================================

test('M254/A1: warstwa GFX bierze druk z definicji (imageUri), nie redirect po nazwie', () => {
  // Willbender (zgłoszenie właściciela) — definicja niesie konkretny druk.
  const card = REGISTRY.get('willbender');
  assert.ok(card, 'Willbender w katalogu');
  assert.ok(hasPrintImage(card), 'karta ma własny druk (imageUri)');
  const used = scryfallCardUrl(card, { size: 'large' });
  assert.match(used, /cards\.scryfall\.io\/large\//, 'adres druku z definicji (ten sam co na stole)');
  assert.ok(!used.includes('/cards/named?'),
    'adres NIE może być redirectem po nazwie — Scryfall zwraca wtedy druk domyślny, nie ten z kolekcji');
  const byName = scryfallImageUrl(card, { version: 'large' });
  assert.match(byName, /\/cards\/named\?/, 'stary wariant (po nazwie) — dowód, że to on był winowajcą');
});

test('M254/A2: karty bez druku (landy wirtualne) dostają redirect po nazwie', () => {
  const virtual = { name: 'Forest', set: null };
  const url = scryfallCardUrl(virtual, { size: 'large' });
  assert.match(url, /\/cards\/named\?exact=Forest/, 'fallback jak w legacy');
});

// =============================================================================
// D — Wormfang Newt: wygnanie tymczasowe widać na stole (strefa jak Suspend/Plot)
// =============================================================================

/** Rzuca Wormfang Newt z ręki i rozwiązuje ETB (wybór lądu — auto lub decyzja). */
function castNewtAndExileLand(state) {
  addMana(state, 'p1', 4, { colors: ['U'] });
  put(state, 'newt', 'wormfang-newt', 'p1', 'hand');
  put(state, 'land', 'basic-forest', 'p1', 'battlefield');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'newt');
  assert.ok(cast, 'oferta rzutu Wormfang Newt');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  // Jeden kandydat (jedyny ląd) → silnik wybiera cel sam (M242).
  const pick = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_trigger_target');
  if (pick) assert.ok(execute(state, pick).ok);
  resolveStack(state);
}

test('M254/D1: wygnany ląd leży w strefie wygnania tymczasowego z badge\'em źródła', () => {
  const state = game('p1', 'main');
  castNewtAndExileLand(state);
  const exiled = [...state.objects.values()].find((o) => o.zone === 'exile' && o.cardId === 'basic-forest');
  assert.ok(exiled, 'ląd wygnany przez ETB Newta');
  assert.equal(exiled.temporaryExile?.byCardId, 'wormfang-newt', 'znacznik niesie źródło wygnania');
  // Stół (widok) — M262: całe wygnanie jest boksem na stole; badge źródła
  // niesie kartę, która wygnała (wormfang-newt przez nameOf → Wormfang Newt).
  for (const who of ['p1', 'p2']) {
    const view = playerView(state, who);
    const entries = view.zones.exile;
    const land = entries.find((o) => o.cardId === 'basic-forest');
    assert.ok(land, `${who}: wygnany ląd musi być widoczny w boksie wygnania`);
    assert.equal(land.exiledBy, 'wormfang-newt', `${who}: badge źródła wygnania`);
    const status = waitingExileStatus(land);
    assert.match(status, /Wormfang Newt/, `status nazywa źródło: ${status}`);
  }
});

test('M254/D2 (anty-over-fix): po śmierci Newta ląd wraca i znika ze strefy tymczasowej', () => {
  const state = game('p1', 'main');
  castNewtAndExileLand(state);
  // Gracz (p1) niszczy WŁASNEGO Newta instantem — po zniknięciu źródła
  // LTB przywraca wygnany ląd (CR 610.3 — efekt połączony jednorazowy).
  put(state, 'kill', 'spin-out', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const newtId = [...state.objects.values()].find((o) => o.cardId === 'wormfang-newt' && o.zone === 'battlefield').id;
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'kill' && (c.targets ?? [])[0] === newtId);
  assert.ok(cast, 'oferta zniszczenia Newta');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const back = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'basic-forest');
  assert.ok(back, 'ląd wrócił na pole bitwy pod kontrolą właściciela');
  assert.equal(back.temporaryExile ?? null, null, 'znacznik wyczyszczony po powrocie');
  const view = playerView(state, 'p1');
  assert.ok(!(view.zones.exile ?? []).some((o) => o.cardId === 'basic-forest'),
    'po powrocie karty nie ma już w boksie wygnania');
});

test('M254/D3: ta sama strefa dla Faceless Butchera (reguła po treści efektu, ADR 0002)', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 6, { colors: ['B'] });
  put(state, 'butcher', 'faceless-butcher', 'p1', 'hand');
  put(state, 'victim', 'goblin-piker', 'p2', 'battlefield');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'butcher');
  assert.ok(cast, 'oferta rzutu Faceless Butcher');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const pick = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target');
  if (pick) assert.ok(execute(state, pick).ok);
  resolveStack(state);
  const exiled = [...state.objects.values()].find((o) => o.zone === 'exile' && o.cardId === 'goblin-piker');
  assert.ok(exiled, 'stwór wygnany przez Butchera');
  assert.equal(exiled.temporaryExile?.byCardId, 'faceless-butcher');
  const view = playerView(state, 'p1');
  const butchered = (view.zones.exile ?? []).find((o) => o.cardId === 'goblin-piker');
  assert.ok(butchered, 'wygnanie „until ~ leaves" korzysta z tej samej strefy co Wormfang Newt');
  assert.equal(butchered.exiledBy, 'faceless-butcher', 'badge źródła: Faceless Butcher');
});

// =============================================================================
// B — karty zagrane zakryte (Morph): właściciel widzi prawdziwą kartę
// =============================================================================

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.style = {};
    this.className = ''; this.text = ''; this.src = ''; this.alt = '';
  }

  set textContent(v) { this.text = String(v); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}

if (!globalThis.document) {
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
}

/** Sesja z talią, w której Willbender (morph) leży w ręce człowieka. */
function sessionWithMorph() {
  const registry = createCardRegistry();
  const deck = ['willbender', 'willbender', 'willbender', 'willbender',
    ...Array.from({ length: 36 }, () => 'basic-island')];
  const botDeck = ['dromoka-warrior', 'dromoka-warrior',
    ...Array.from({ length: 38 }, () => 'basic-plains')];
  return createSession({
    seed: 254, registry,
    decks: new Map([[HUMAN_ID, deck], [BOT_ID, botDeck]]),
    pauseOnBotMoves: false,
  });
}

/**
 * Wystawia Willbendera zakrytego (Morph {3}) i zwraca obiekt z pola bitwy.
 * Partia startuje od mulliganu, a morph wymaga trzech lądów — więc gramy
 * „po ludzku": zatrzymujemy rękę, kładziemy ląd i pasujemy do trzeciej tury.
 */
function playFaceDownWillbender(session) {
  for (let i = 0; i < 200 && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const mulligan = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
    const morph = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.faceDown);
    const land = view.legalCommands.find((c) => c.type === 'play_land');
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const cmd = morph ?? mulligan ?? land ?? pass;
    if (!cmd) break;
    if (morph) {
      if (!session.apply(cmd).ok) return null;
      break;
    }
    session.apply(cmd);
  }
  return session.view().zones.battlefield.find((o) => o.faceDown && o.cardId === 'willbender') ?? null;
}

test('M254/B1: własna karta zakryta — podgląd pokazuje PRAWDZIWĄ ilustrację', () => {
  const session = sessionWithMorph();
  const object = playFaceDownWillbender(session);
  assert.ok(object, 'Willbender leży zakryty na polu bitwy');
  const info = cardInfo(session, object);
  assert.equal(info.faceDown, true, 'kafel na stole pozostaje zakryty');
  assert.equal(info.imageUri, null, 'kafel NIE dostaje ilustracji (FoW dla stołu)');
  const def = REGISTRY.get('willbender');
  assert.equal(info.hiddenArt?.imageUri, def.imageUri, 'znacznik niesie druk prawdziwej karty');
  const host = new MiniEl('#hover');
  renderHoverPreview(host, info, 'scryfall');
  const img = [host, ...host.descendants()].find((el) => el.tagName === 'img');
  assert.ok(img, 'podgląd rysuje obraz');
  assert.equal(img.src, def.imageUri, 'hover pokazuje prawdziwą kartę, nie rewers');
  assert.notEqual(img.src, CARD_BACK_URL);
});

test('M254/B2 (anty-over-fix): zakryta karta PRZECIWNIKA dalej pokazuje rewers (FoW)', () => {
  const session = sessionWithMorph();
  const object = playFaceDownWillbender(session);
  assert.ok(object, 'Willbender zakryty');
  // Ten sam obiekt, ale pod kontrolą przeciwnika — tożsamość jest ukryta.
  const enemyInfo = cardInfo(session, { ...object, controllerId: BOT_ID });
  assert.equal(enemyInfo.hiddenArt, null, 'FoW: cudza karta zakryta nie niesie ilustracji');
  assert.equal(enemyInfo.imageUri, null);
  const host = new MiniEl('#hover-enemy');
  renderHoverPreview(host, enemyInfo, 'scryfall');
  const img = [host, ...host.descendants()].find((el) => el.tagName === 'img');
  assert.equal(img.src, CARD_BACK_URL, 'cudza karta zakryta = rewers (CR 708.2)');
});

// =============================================================================
// C — warstwa grafik PAUZUJE grę i pokazuje KAŻDY rzut (kolejka)
// =============================================================================

test('M254/C1: kolejka — drugi rzut czeka, aż zamkniemy pierwszy', () => {
  const shown = [];
  let open = false;
  const queue = createArtShowcaseQueue({
    isOpen: () => open,
    open: (entry) => {
      if (entry.skip) return false;
      shown.push(entry.cardId);
      open = true;
      return true;
    },
  });
  assert.equal(queue.push({ cardId: 'moj-czar' }), 'opened', 'pierwszy rzut otwiera warstwę');
  assert.equal(queue.push({ cardId: 'czar-bota' }), 'queued', 'drugi czeka — nie nadpisuje pierwszego');
  assert.deepEqual(shown, ['moj-czar'], 'na ekranie jest mój czar, nie ostatni z sekwencji');
  // Zamknięcie warstwy otwiera następny z kolejki.
  open = false;
  assert.equal(queue.next(), true, 'po zamknięciu pokazuje się kolejny rzut');
  assert.deepEqual(shown, ['moj-czar', 'czar-bota']);
  assert.equal(queue.pending, 0);
  // Pusta kolejka = nic się nie otwiera (gra rusza dalej).
  open = false;
  assert.equal(queue.next(), false);
  assert.deepEqual(shown, ['moj-czar', 'czar-bota']);
});

test('M254/C2: kolejka pomija rzuty bez ilustracji (nie blokuje gry)', () => {
  const shown = [];
  let open = false;
  const queue = createArtShowcaseQueue({
    isOpen: () => open,
    open: (entry) => {
      if (!entry.art) return false;
      shown.push(entry.cardId);
      open = true;
      return true;
    },
  });
  queue.push({ cardId: 'bez-artu', art: false });
  queue.push({ cardId: 'z-artem', art: true });
  assert.deepEqual(shown, ['z-artem'], 'rzut bez ilustracji nie zajmuje warstwy');
  assert.equal(queue.pending, 0, 'odrzucony rzut nie zostaje w kolejce');
});

test('M254/C3: sesja staje, gdy obserwator poprosi o pauzę (i rusza po continueArtPlay)', () => {
  const registry = createCardRegistry();
  const human = parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds;
  const bot = parseDeckText(fs.readFileSync('decks/warhammer-ubr.txt', 'utf8'), registry).cardIds;
  const session = createSession({
    seed: 254, registry, decks: new Map([[HUMAN_ID, human], [BOT_ID, bot]]),
    pauseOnBotMoves: true,
    // Zgłoszenie: każdy rzut ma stanąć na ekranie — obserwator zawsze prosi
    // o pauzę (warstwa jest włączona i karta ma ilustracje).
    onCast: () => true,
  });
  assert.equal(session.artPausePending, false, 'start bez pauzy prezentacyjnej');
  let paused = false;
  for (let i = 0; i < 300 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) { session.continueBotPlay(); continue; }
    if (session.artPausePending) { paused = true; break; }
    const view = session.view();
    const meaningful = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type));
    const cmd = meaningful ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    const res = session.apply(cmd);
    if (res?.artPause) { paused = true; break; }
  }
  assert.ok(paused, 'pierwszy rzut wstrzymuje grę (gracz widzi swój czar)');
  assert.equal(session.artPausePending, true);
  // Gra stoi: liczba zdarzeń nie rośnie bez wznowienia.
  const before = session.state.events.length;
  session.view();
  assert.equal(session.state.events.length, before, 'pauza naprawdę wstrzymuje partię');
  // Wznowienie prowadzi grę dalej.
  const resumed = session.continueArtPlay();
  assert.equal(resumed.ok, true);
  assert.ok(session.state.events.length > before, 'continueArtPlay rozgrywa kolejne komendy');
});
