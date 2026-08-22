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

const REGISTRY = createCardRegistry();

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
