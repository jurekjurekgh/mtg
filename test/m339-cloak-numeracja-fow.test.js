import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { faceDownLabel } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';

const registry = createCardRegistry();
const nameOf = (id) => registry.get(id)?.name ?? id;
function put(state, id, cardId, controllerId, zone) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def),
  });
  return state.objects.get(id);
}
function board(cards = ['basic-plains', 'basic-island']) {
  const state = createGameState({ seed: 339, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  put(state, 'source', 'veiled-ascension', 'p1', 'battlefield');
  cards.forEach((cardId, i) => put(state, `lib-${i}`, cardId, 'p1', 'library'));
  return state;
}
function cloak(state, controllerId = 'p1') {
  // Izolacja tworzenia rewersu; nie sprawdzamy tu rozstrzygania triggera.
  applyEffect(state, { type: 'cloak' }, { id: 'source', controllerId });
  return state.zones.battlefield.map((id) => state.objects.get(id)).filter((o) => o.faceDown).at(-1);
}
const covered = (view) => view.zones.battlefield.filter((o) => o.faceDown);

test('M339/A: pełny widok przeciwnika nie zależy od nazw ani rodzaju kart pod cloakami', () => {
  const variants = [
    ['basic-plains', 'basic-plains'], ['basic-plains', 'basic-island'],
    ['goblin-piker', 'plague-reaver'], ['shock', 'basic-forest'],
  ];
  const views = variants.map((cards) => {
    const state = board(cards);
    cloak(state); cloak(state);
    return playerView(state, 'p2');
  });
  for (const view of views) {
    assert.deepEqual(view, views[0], 'pochodna ukrytego cardId też jest tajna (CR 708.2a)');
    assert.deepEqual(covered(view).map((o) => o.copyNumber), [1, 2]);
    for (const o of covered(view)) {
      assert.equal(o.cardId ?? null, null);
      assert.equal(o.cloakReady ?? null, null);
    }
  }
});

test('M339/B: różne zakryte karty mają różne etykiety celu również dla przeciwnika', () => {
  const state = board();
  cloak(state); cloak(state);
  for (const who of ['p1', 'p2']) {
    const view = playerView(state, who);
    const labels = covered(view).map((o) => faceDownLabel(o, nameOf));
    assert.equal(new Set(labels).size, 2);
    assert.match(labels[0], /Cloak 1/);
    assert.match(labels[1], /Cloak 2/);
    const targets = covered(view).map((o) => commandLabel(
      { type: 'cast_spell', objectId: 'source', targets: [o.id] },
      { nameOf, nameOfObject: () => '?' }, view,
    ));
    assert.notEqual(targets[0], targets[1], 'wizard celu nie przedstawia dwóch takich samych opcji');
    if (who === 'p2') assert.deepEqual(labels, ['Cloak 1', 'Cloak 2']);
    else assert.deepEqual(labels, ['Plains (Cloak 1)', 'Island (Cloak 2)']);
  }
});

test('M339/C: oba pola korzystają z jawnej wspólnej kolejności — przejęcie nie tworzy kolizji', () => {
  const state = board(['goblin-piker']);
  const first = cloak(state);
  put(state, 'foe-lib', 'basic-island', 'p2', 'library');
  const second = cloak(state, 'p2');
  assert.deepEqual([first.copyNumber, second.copyNumber], [1, 2]);
  // Zmiana kontroli zachowuje identyfikator obiektu i jego znacznik.
  state.objects.set(second.id, Object.freeze({ ...second, controllerId: 'p1' }));
  assert.equal(new Set(covered(playerView(state, 'p2')).map((o) => o.copyNumber)).size, 2);
});

test('M339/D: odsłonięcie nie przenumerowuje pozostałych cloaków; nowy numer nie koliduje', () => {
  const state = board(['goblin-piker', 'basic-island', 'basic-plains']);
  const first = cloak(state);
  const second = cloak(state);
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up' && c.objectId === first.id);
  assert.ok(cmd);
  assert.ok(execute(state, cmd).ok);
  assert.equal(state.objects.get(first.id).copyNumber ?? null, null);
  assert.equal(state.objects.get(second.id).copyNumber, 2);
  assert.equal(cloak(state).copyNumber, 3);
  assert.deepEqual(covered(playerView(state, 'p2')).map((o) => o.copyNumber), [2, 3]);
});
