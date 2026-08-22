// M188 — uwagi właściciela z testów (2026-08-22, po audycie PR #69):
// A: badge +1/+0 dla statyki warunkowej (Evangel of Synthesis),
// B: surowe „token_squirrel" w logu Rozgrywki,
// C: bot atakuje 2/2 w nietapnięte 1/5 (atak jałowy ratowany premią),
// K: „Przebieg tur (dla AI)" — select ze WSZYSTKIMI turami.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower } from '../src/engine/permanents.js';
import { buildStateOverlay, cardInfo } from '../src/table/render.js';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import fs from 'node:fs';

const REGISTRY = createCardRegistry();

/** Sesja stołu na taliach jednoplanowych (ADR 0023 §5) — do warstwy opisu. */
function tableSession() {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  return createSession({ seed: 3, registry: REGISTRY, decks });
}

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

// ---- A: badge P/T ze statyki warunkowej -----------------------------------

test('M188/A: Evangel of Synthesis — widok niesie NADANĄ moc (+1/+0) po drugim dobraniu', () => {
  const state = game('p1');
  for (let i = 0; i < 5; i += 1) putCard(state, `lib${i}`, 'highland-game', 'p1', 'library');
  putCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'hand');
  // Jedno dobranie z kroku dobierania tej tury; drugie doda ETB karty.
  state.cardsDrawnThisTurn = { p1: 1 };
  addMana(state, 'p1', 2, { colors: ['U', 'B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'ev');
  assert.ok(cast, 'oferta rzutu Evangela');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 20 && (state.zones.stack.length > 0 || state.pendingDiscardChoice); i += 1) {
    const pid = state.turn.priorityPlayerId;
    const choice = playerView(state, pid).legalCommands.find((c) => c.type.startsWith('resolve_'));
    execute(state, choice ?? { type: 'pass_priority', playerId: pid });
  }
  const ev = [...state.objects.values()]
    .find((o) => o.cardId === 'evangel-of-synthesis' && o.zone === 'battlefield');
  assert.ok(ev, 'Evangel na polu bitwy');
  assert.equal(state.cardsDrawnThisTurn.p1, 2, 'dwa dobrania w tej turze (draw step + ETB)');
  assert.equal(effectivePower(ev, state), 3, 'silnik liczy 3 (2 bazowe +1 ze statyki)');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === ev.id);
  assert.equal(entry.power, 3, 'widok niesie moc efektywną');
  // Sedno zgłoszenia A: kafel liczył badge z powerModifier (licznikowy
  // modyfikator „until EOT"), a statyka warunkowa jest read-time — badge
  // nigdy nie powstawał. Widok musi nieść RÓŻNICĘ jawnie (wzorzec M175/A3).
  assert.equal(entry.grantedPower, 1, 'nadana moc jawnie w widoku (+1)');
  assert.equal(entry.grantedToughness ?? 0, 0, 'wytrzymałość bez zmian');
  assert.ok((entry.grantedKeywords ?? []).includes('menace'), 'menace jako nadany keyword');
});

test('M188/A2: bez drugiego dobrania statyka nie działa — brak nadanej mocy (kontrola)', () => {
  const state = game('p1');
  putCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'battlefield');
  state.cardsDrawnThisTurn = { p1: 1 };
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'ev');
  assert.equal(entry.power, 2, 'moc bazowa');
  assert.ok(!entry.grantedPower, 'brak nadanej mocy przy jednym dobraniu');
  assert.ok(!(entry.grantedKeywords ?? []).includes('menace'), 'brak menace');
});

test('M188/A3: licznik +1/+1 nie dubluje się z nadaną mocą (kontrola regresji)', () => {
  const state = game('p1');
  putCard(state, 'deer', 'highland-game', 'p1', 'battlefield', { counters: { '+1/+1': 1 } });
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'deer');
  // Licznik ma własny badge („1x +1/+1"), więc nie może wchodzić do
  // grantedPower — inaczej gracz zobaczyłby ten sam bonus dwa razy.
  assert.ok(!entry.grantedPower, 'licznik nie jest „nadaną mocą\"');
});

// ---- A4: badge na KAFLU (pełna ścieżka widok → cardInfo → overlay) --------
// L5: test UI sprawdza WYNIK (drzewo badge'ów), nie obecność kodu. Pułapka
// M175/A3: budowanie `info` ręcznie omija cardInfo i utrwala martwy badge —
// dlatego info powstaje z prawdziwego playerView.

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { battlefield: [] } }),
};

function badgesOf(info) {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge'))
    .map((el) => el.textContent);
}

test('M188/A4: kafel Evangela pokazuje badge „+1/+0\" obok „menace\"', () => {
  const state = game('p1');
  putCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'battlefield');
  state.cardsDrawnThisTurn = { p1: 2 };
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'ev');
  const badges = badgesOf(cardInfo(SESSION_MOCK, entry, null));
  assert.ok(badges.some((b) => b.includes('+1/+0')),
    `badge nadanej mocy na kaflu (badge: ${JSON.stringify(badges)})`);
  // KEYWORD_LABELS tłumaczy menace na „Postrach\" — badge keywordu bez zmian.
  assert.ok(badges.some((b) => b === 'Postrach'),
    `badge menace (Postrach) nadal obecny (badge: ${JSON.stringify(badges)})`);
});

test('M188/A5: bez warunku kafel nie pokazuje badge\'a mocy (kontrola)', () => {
  const state = game('p1');
  putCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'battlefield');
  state.cardsDrawnThisTurn = { p1: 1 };
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'ev');
  const badges = badgesOf(cardInfo(SESSION_MOCK, entry, null));
  assert.ok(!badges.some((b) => b.includes('+1/+0')),
    `brak badge'a przy niespełnionym warunku (badge: ${JSON.stringify(badges)})`);
});

// ---- B: log nie pokazuje surowego „token_squirrel\" ----------------------
// Zgłoszenie właściciela z Rozgrywki:
//   „token_squirrel zadaje 1 obrażenie (Ethersworn Shieldmage)\"
//   „token_squirrel ginie\"
// nameOfObject zna nazwę z `object.name`, ale gdy token zginął (CR 111.7 —
// token poza polem bitwy przestaje istnieć, obiekt znika ze stanu), opis
// spada do nameOf(cardId), a `token_*` nie ma wpisu w rejestrze kart.

test('M188/B: nameOf tłumaczy cardId tokenu na czytelną nazwę', () => {
  const session = tableSession();
  assert.equal(session.nameOf('token_squirrel'), 'Squirrel',
    'token z definicji karty ma nazwę, nie surowy identyfikator');
  assert.equal(session.nameOf('token_phyrexian_mite'), 'Phyrexian Mite', 'nazwa wieloczłonowa');
  assert.equal(session.nameOf('token_treasure'), 'Treasure', 'token nietworzony przez stwora');
  assert.equal(session.nameOf('highland-game'), 'Highland Game', 'zwykłe karty bez zmian');
});

test('M188/B2: opis zdarzeń o martwym tokenie nie pokazuje token_*', () => {
  const session = tableSession();
  const helpers = {
    nameOf: session.nameOf,
    // Token zginął — obiektu nie ma już w stanie (CR 111.7), więc warstwa
    // opisu ma tylko cardId ze zdarzenia.
    nameOfObject: () => '?',
  };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const damage = describeGameEvent(
    { type: 'damage_dealt', source: 'gone-1', target: 'p1', amount: 1, sourceCardId: 'token_squirrel' },
    helpers, names,
  );
  const died = describeGameEvent(
    { type: 'object_died', objectId: 'gone-1', cardId: 'token_squirrel', controllerId: 'p2' },
    helpers, names,
  );
  for (const line of [damage, died]) {
    if (line == null) continue;
    assert.ok(!String(line).includes('token_'),
      `opis bez surowego identyfikatora tokenu: ${JSON.stringify(line)}`);
  }
});

// ---- B3: STRAŻNIK — każdy token z katalogu ma nazwę -----------------------
test('M188/B3: STRAŻNIK — nameOf zna KAŻDY token tworzony przez karty katalogu', () => {
  const session = tableSession();
  const tokenIds = new Set();
  const scan = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) scan(item); return; }
    if (typeof node.cardId === 'string' && node.cardId.startsWith('token_')) tokenIds.add(node.cardId);
    for (const value of Object.values(node)) scan(value);
  };
  for (const card of REGISTRY.all()) scan(card);
  assert.ok(tokenIds.size >= 20, `sonda znalazła tokeny w katalogu (${tokenIds.size})`);
  const raw = [...tokenIds].filter((id) => session.nameOf(id) === id);
  assert.deepEqual(raw, [],
    `każdy token ma czytelną nazwę — bez wpisu log pokaże surowe id: ${JSON.stringify(raw)}`);
});
