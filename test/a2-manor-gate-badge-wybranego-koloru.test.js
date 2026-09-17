// A2 (znalezisko właściciela z testów, 2026-09-16): po wyborze koloru karta
// Manor Gate na stole nie pokazywała ŻADNEGO śladu wyboru — wybór był widoczny
// wyłącznie w logu. Kolor wybrany przy wejściu („as this enters, choose a
// color") to informacja publiczna — kafel dostaje badge „Wybrany kolor: Czarny"
// (wzorzec protectionBadges M221/C), a playerView niesie pole `chosenColor`
// (ADR 0017: skutek widoczny w grze musi być widoczny w widoku).
//
// chosenColor NIE wchodzi przez kontrakt addObject (stan nadają EFEKTY, nie
// fabryka — patrz ADD_OBJECT_FIELDS) — test idzie realnym przepływem:
// zagrany ląd → resolve_color_choice → widok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { chosenColorBadge } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function playGateAndChooseBlack(state) {
  putCard(state, 'gate', 'manor-gate', 'p1', 'hand');
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.ok(play, 'oferta zagrania lądu');
  assert.ok(execute(state, play).ok);
  const pickBlack = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_color_choice' && c.color === 'B');
  assert.ok(pickBlack, 'można wybrać czarny');
  assert.ok(execute(state, pickBlack).ok);
  return state.zones.battlefield
    .map((id) => state.objects.get(id)).find((o) => o?.cardId === 'manor-gate');
}

test('A2/etykieta: chosenColorBadge — mianownik koloru, null bez wyboru', () => {
  assert.equal(chosenColorBadge('B'), 'Wybrany kolor: Czarny');
  assert.equal(chosenColorBadge('W'), 'Wybrany kolor: Biały');
  assert.equal(chosenColorBadge(null), null, 'bez wyboru nie ma badge’a');
  assert.equal(chosenColorBadge(undefined), null);
});

test('A2/widok: po wyborze playerView wystawia chosenColor lądu na polu bitwy', () => {
  const state = game('p1');
  const gate = playGateAndChooseBlack(state);
  assert.equal(gate.chosenColor, 'B', 'wybór zapisany na permanencie');

  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === gate.id);
  assert.ok(entry, 'obiekt w widoku');
  assert.equal(entry.chosenColor, 'B', 'wybrany kolor jawny w widoku (badge + etykieta many)');

  // Wybór jest publiczny także dla przeciwnika — decyzja przy wejściu
  // publicznego permanentu (jak kolory aury, M209).
  const foe = playerView(state, 'p2').zones.battlefield.find((o) => o.id === gate.id);
  assert.equal(foe.chosenColor, 'B', 'przeciwnik też widzi wybrany kolor');
});

test('A2/widok: przed wyborem pola chosenColor w widoku nie ma', () => {
  const state = game('p1');
  putCard(state, 'gate', 'manor-gate', 'p1', 'hand');
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.ok(execute(state, play).ok);
  const gate = state.zones.battlefield
    .map((id) => state.objects.get(id)).find((o) => o?.cardId === 'manor-gate');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === gate.id);
  assert.equal(entry.chosenColor, undefined, 'bez decyzji pole nie istnieje (brak badge’a)');
});
