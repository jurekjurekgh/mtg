// Zgłoszenie właściciela F (2026-09-10, sesja arena/01a08d0e) —
// Curse of the Pierced Heart na przeciwniku bez badge'a.
//
// Objaw przy stole: klątwa rzucona na wroga leży na polu bitwy jako zwykły
// enchantment i NIC nie mówi, KOGO dotyczy. Aury na stworach mają badge
// („Aura: <nazwa>" na kaflu gospodarza), a aura na GRACZU (CR 303.4
// „Enchant player") nie ma gospodarza-permanentu, więc tamta ścieżka jej nie
// opisuje wcale.
//
// Przyczyny źródłowe (zmierzone, nie zgadywane):
//  1. `playerView` (src/engine/game-state.js) w ogóle NIE wysyła
//     `enchantPlayer`/`enchantedPlayerId` dla permanentów — sonda na stanie
//     z klątwą zwracała `undefined`, więc UI nie miał z czego zbudować
//     badge'a (ADR 0017: skutek widoczny w grze musi być widoczny w widoku);
//  2. `src/table/render.js` nie ma żadnej gałęzi badge'a dla aury na graczu
//     (ani w `buildFace`, ani w `buildStateOverlay`).
//
// Informacja jest JAWNA: aura leży na stole, a jej cel (gracz) jest częścią
// stanu partii — nie ma tu nic do ukrycia w sensie FoW.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { buildFace, buildStateOverlay, cardInfo } from '../src/table/render.js';

// --- minimalny DOM (bez jsdom w głównej bramce — wzór: m164-saga-etap-badge) ---
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.className = ''; this.text = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document ??= { createElement: (tag) => new MiniEl(tag) };

const REGISTRY = createCardRegistry();

function graZKlatwa({ celKlatwy }) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  const def = REGISTRY.get('curse-of-the-pierced-heart');
  assert.ok(def, 'Curse of the Pierced Heart w katalogu');
  addObject(state, {
    id: 'curse', instanceId: 'i-curse', cardId: 'curse-of-the-pierced-heart',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  // Stan jak po rozstrzygnięciu czaru (spells.js: rodzaj enchantment +
  // `enchantedPlayerId` zamiast `attachedTo`).
  state.objects.set('curse', Object.freeze({
    ...state.objects.get('curse'),
    kind: 'enchantment', enchantPlayer: true, enchantedPlayerId: celKlatwy,
  }));
  return state;
}

/** Sesja-atrapa z tym, czego naprawdę używa `cardInfo`. */
function fakeSession(state) {
  const view = playerView(state, 'p1');
  return {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => REGISTRY.get(state.objects.get(id)?.cardId)?.name ?? '?',
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    view: () => view,
  };
}

function badgeTexts(visual) {
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge'))
    .map((el) => el.textContent);
}

test('F/1: widok pola bitwy niesie zaczarowanego gracza (bez tego UI nie ma z czego rysować)', () => {
  const state = graZKlatwa({ celKlatwy: 'p2' });
  const wpis = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'curse');
  assert.equal(wpis.enchantedPlayerId, 'p2', 'widok musi nieść zaczarowanego gracza');
  assert.equal(wpis.enchantPlayer, true, 'widok musi nieść flagę aury na graczu');
});

test('F/2: kafel klątwy na polu bitwy ma badge z imieniem zaczarowanego gracza', () => {
  const state = graZKlatwa({ celKlatwy: 'p2' });
  const session = fakeSession(state);
  const wpis = session.view().zones.battlefield.find((o) => o.id === 'curse');
  const info = cardInfo(session, wpis);
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  const teksty = badgeTexts(visual);
  assert.ok(teksty.some((t) => /Klątwa: Nieprzyjaciel/.test(t)),
    `badge klątwy musi nazywać zaczarowanego gracza, są: ${JSON.stringify(teksty)}`);
});

test('F/3: klątwa na WŁASNYM graczu czyta się „Klątwa: Ty"', () => {
  const state = graZKlatwa({ celKlatwy: 'p1' });
  const session = fakeSession(state);
  const wpis = session.view().zones.battlefield.find((o) => o.id === 'curse');
  const visual = new MiniEl('div');
  buildStateOverlay(visual, cardInfo(session, wpis));
  const teksty = badgeTexts(visual);
  assert.ok(teksty.some((t) => /Klątwa: Ty/.test(t)),
    `własna klątwa też musi być opisana, są: ${JSON.stringify(teksty)}`);
});

test('F/4 anty-over-fix: zwykła aura na stworze nie dostaje badge klątwy', () => {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  const defStwor = REGISTRY.get('alaborn-trooper');
  const defAura = REGISTRY.get('guildscorn-ward');
  assert.ok(defStwor && defAura, 'karty testowe w katalogu');
  addObject(state, {
    id: 'stwor', instanceId: 'i-stwor', cardId: 'alaborn-trooper', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(defStwor),
    types: defStwor.types ?? [], subtypes: defStwor.subtypes ?? [], keywords: [],
  });
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId: 'guildscorn-ward', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(defAura),
    types: defAura.types ?? [], subtypes: defAura.subtypes ?? [], keywords: [],
  });
  state.objects.set('aura', Object.freeze({ ...state.objects.get('aura'), attachedTo: 'stwor' }));

  const session = fakeSession(state);
  for (const id of ['stwor', 'aura']) {
    const wpis = session.view().zones.battlefield.find((o) => o.id === id);
    const visual = new MiniEl('div');
    buildStateOverlay(visual, cardInfo(session, wpis));
    const teksty = badgeTexts(visual);
    assert.ok(!teksty.some((t) => /Klątwa/.test(t)),
      `${id}: aura na permanencie nie jest klątwą, są: ${JSON.stringify(teksty)}`);
  }
});

test('F/5: twarz karty (tooltip/karta na ręce) niesie ten sam badge klątwy (L100)', () => {
  const state = graZKlatwa({ celKlatwy: 'p2' });
  const session = fakeSession(state);
  const wpis = session.view().zones.battlefield.find((o) => o.id === 'curse');
  const face = new MiniEl('div');
  buildFace(face, cardInfo(session, wpis));
  const teksty = face.descendants()
    .filter((el) => String(el.className).includes('fbadge'))
    .map((el) => el.textContent);
  assert.ok(teksty.some((t) => /Klątwa: Nieprzyjaciel/.test(t)),
    `badge klątwy musi być też na twarzy karty, są: ${JSON.stringify(teksty)}`);
});
