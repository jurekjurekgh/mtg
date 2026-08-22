// M184 — pętla jakości Żywym Testerem po Batchach 43–44 (2026-08-22).
// Zgłoszenia Z1–Z4 z transkryptów tools/table-tester/audyt-m184/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { cardInfo, commandLabel, rulesText } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { battlefield: [] } }),
};

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

// Pełny opis kafla karty (jak w UI) — cardInfo z mock-sesją.
function infoTextOf(cardId) {
  const info = cardInfo(SESSION_MOCK, { cardId, id: `x-${cardId}` });
  return rulesText(info);
}

test('M184/Z1: opis Sea Gods Scorn mowi o powrocie do reki, bez frazy o wyborze trybu', () => {
  const text = infoTextOf('sea-gods-scorn');
  assert.ok(!text.includes('wybierz jedno'), 'jeden tryb to nie wybór');
  assert.ok(/ręki|rękę|ręka/.test(text), `opis mówi o powrocie do ręki: ${text}`);
});

test('M184/Z2: opis Blanchwood Prowlera niesie liczbę kart i licznik za odmowę', () => {
  const text = infoTextOf('blanchwood-prowler');
  assert.ok(text.includes('3 karty'), `liczba kart z deskryptora: ${text}`);
  assert.ok(text.includes('+1/+1'), `nagroda za odmowę: ${text}`);
});

test('M184/Z3: opcja odmowy przy Blanchwood Prowlerze ostrzega o liczniku', () => {
  const state = game('p1');
  putCard(state, 'prowler', 'blanchwood-prowler', 'p1', 'hand');
  putCard(state, 'lib1', 'basic-forest', 'p1', 'library');
  putCard(state, 'lib2', 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'prowler');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_satyr_look_choice' && c.pickId == null);
  assert.ok(decline, 'oferta odmowy');
  assert.equal(decline.counterIfNone, true, 'komenda niesie flagę counterIfNone');
  const label = commandLabel(decline, SESSION_MOCK, playerView(state, 'p1'));
  assert.ok(String(label).includes('+1/+1'), `etykieta mówi o liczniku: ${label}`);
});

test('M184/Z3b: Satyr Wayfinder (bez counterIfNone) — odmowa bez wzmianki o liczniku', () => {
  const state = game('p1');
  putCard(state, 'satyr', 'satyr-wayfinder', 'p1', 'hand');
  putCard(state, 'lib1', 'basic-forest', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'satyr');
  assert.ok(cast, 'Satyr w rejestrze i rzucalny');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_satyr_look_choice' && c.pickId == null);
  assert.ok(decline, 'oferta odmowy Satyra');
  assert.ok(!decline.counterIfNone, 'Satyr bez flagi');
  const label = commandLabel(decline, SESSION_MOCK, playerView(state, 'p1'));
  assert.ok(!String(label).includes('+1/+1'), `Satyr bez licznika w etykiecie: ${label}`);
});

test('M184/Z4: opis Thieves Tools mowi o nieblokowalnosci nosiciela o mocy <=3', () => {
  const text = infoTextOf('thieves-tools');
  assert.ok(text.includes('nie może być blokowany'), `próg nieblokowalności w opisie: ${text}`);
});
