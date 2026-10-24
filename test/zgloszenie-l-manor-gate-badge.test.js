/**
 * Zgłoszenie właściciela L (2026-10-24): Manor Gate — „As this land enters,
 * choose a color other than green. {T}: Add {G} or one mana of the chosen
 * color.” Po wystawieniu lądu i wyborze koloru na karcie powinien być
 * badge z informacją, jaki kolor Manor Gate produkuje dodatkowo.
 *
 * Diagnoza: ogniwa istniały osobno od A2 (2026-09-16) — playerView niesie
 * `chosenColor` (pin A2/widok), `chosenColorBadge` daje etykietę (pin
 * A2/etykieta), a `buildStateOverlay` ją wpycha na kafel — ale środkowe
 * ogniwo, `cardInfo`, NIGDY nie kopiowało pola do `info`, więc na stole
 * badge nie powstawał (a linia zdolności kafla A3 milczała o drugim
 * kolorze). Testy A2 pinowały końce łańcucha, nie jego ciągłość — ten
 * plik domyka łańcuch realnym przepływem: zagranie → wybór koloru →
 * widok → cardInfo → badge'e kafla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { cardInfo, buildStateOverlay, rulesText } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [] } }),
};

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };
const badgesOf = (info) => {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge') && el.children.length === 0)
    .map((el) => el.textContent);
};

function game() {
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  return state;
}

function put(state, id, cardId, zone, playerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  return state.objects.get(id);
}

/** Realny przepływ z A2: wystaw Manor Gate i wybierz czarny. */
function zagrajBrameIWybierzCzarny(state) {
  put(state, 'gate', 'manor-gate', 'hand', 'p1');
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.ok(play, 'oferta zagrania lądu');
  assert.equal(execute(state, play).ok, true);
  const pickBlack = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_color_choice' && c.color === 'B');
  assert.ok(pickBlack, 'można wybrać czarny (dowolny poza zielonym)');
  assert.equal(execute(state, pickBlack).ok, true);
  return [...state.objects.values()].find((o) => o.cardId === 'manor-gate');
}

test('L/1: kafel Manor Gate nosi badge „Wybrany kolor: Czarny” — u właściciela i przeciwnika', () => {
  const state = game();
  const gate = zagrajBrameIWybierzCzarny(state);
  for (const widz of ['p1', 'p2']) {
    const entry = playerView(state, widz).zones.battlefield.find((o) => o.id === gate.id);
    assert.ok(entry, `obiekt w widoku ${widz}`);
    const info = cardInfo(SESSION_MOCK, entry);
    assert.equal(info.chosenColor, 'B', `cardInfo niesie wybrany kolor (${widz})`);
    const badges = badgesOf(info);
    assert.ok(badges.includes('Wybrany kolor: Czarny'),
      `badge na kaflu (${widz}), jest: [${badges.join(' | ')}]`);
  }
});

test('L/2: linia zdolności kafla nazywa oba produkowane kolory (baza + wybrany)', () => {
  const state = game();
  const gate = zagrajBrameIWybierzCzarny(state);
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === gate.id);
  const tekst = rulesText(cardInfo(SESSION_MOCK, entry));
  assert.match(tekst, /zielon/i, `baza {G} nazwana: ${tekst}`);
  assert.match(tekst, /czarn/i, `wybrany kolor nazwany: ${tekst}`);
});

test('L/3: bez dokonanego wyboru (i na zwykłym landzie) badge’a nie ma', () => {
  const state = game();
  put(state, 'gate', 'manor-gate', 'hand', 'p1');
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.equal(execute(state, play).ok, true);
  const gate = [...state.objects.values()].find((o) => o.cardId === 'manor-gate');
  const przedWyborem = playerView(state, 'p1').zones.battlefield.find((o) => o.id === gate.id);
  assert.ok(!badgesOf(cardInfo(SESSION_MOCK, przedWyborem)).some((b) => b.includes('Wybrany kolor')),
    'przed wyborem cisza');
  put(state, 'las', 'basic-forest', 'battlefield', 'p1');
  const las = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'las');
  assert.ok(!badgesOf(cardInfo(SESSION_MOCK, las)).some((b) => b.includes('Wybrany kolor')),
    'zwykły land bez badge’a wyboru');
});
