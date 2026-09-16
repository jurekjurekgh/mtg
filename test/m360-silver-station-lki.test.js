import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

// M360/Srebro B4 (Release Notes Edge of Eternities 2025-07-21, cyt. za
// mtg.wiki/Station, pobrane 2026-09-16): „Use the tapped creature's power as
// the station ability resolves to determine how many charge counters to put
// on the permanent with station. If that creature isn't on the battlefield
// at that time, use its power as it last existed on the battlefield."
// Silnik czytał moc NA ŻYWO i dawał 0 po usunięciu stwora w odpowiedzi
// (błędne powołanie CR 608.2b — stwór nie jest CELEM, więc obowiązuje LKI).

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], colors: def.colors ?? [],
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
  return state.objects.get(id);
}

function main1() {
  const state = createGameState({ seed: 16, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  putCard(state, 'ram', 'wedgelight-rammer', 'p1', 'battlefield');
  putCard(state, 'sarge', 'akroan-sergeant', 'p1', 'battlefield'); // 2/2
  return state;
}

function activateStation(state) {
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability');
  assert.ok(cmd, 'oferta station');
  assert.ok(execute(state, cmd).ok, 'aktywacja station');
  assert.equal(state.zones.stack.length, 1, 'zdolność czeka na stosie');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
}

function passBoth(state, first = 'p2') {
  const second = first === 'p2' ? 'p1' : 'p2';
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok, `pass ${first}`);
  assert.ok(execute(state, { type: 'pass_priority', playerId: second }).ok, `pass ${second}`);
}

const chargeOf = (state) => state.objects.get('ram')?.counters?.charge ?? 0;

test('M360/B4a: stwór usunięty w odpowiedzi — liczniki z LKI (2), nie 0', () => {
  const state = main1();
  putCard(state, 'shock', 'shock', 'p2', 'hand');
  activateStation(state); // priorytet ma p2
  addMana(state, 'p2', 1, { colors: ['R'] });
  const shock = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'shock');
  assert.ok(shock, 'Shock grywalny w odpowiedzi na station');
  assert.ok(execute(state, { ...shock, targets: ['sarge'] }).ok);
  passBoth(state, 'p2'); // Shock rozstrzyga się pierwszy (LIFO)
  assert.notEqual(state.objects.get('sarge')?.zone, 'battlefield', 'sierżant zginął');
  passBoth(state, 'p1'); // teraz station
  assert.equal(chargeOf(state), 2, 'LKI: ostatnia moc sierżanta na polu bitwy');
});

test('M360/B4b (pin): stacja bez odpowiedzi — liczniki z żywej mocy (2)', () => {
  const state = main1();
  activateStation(state);
  passBoth(state, 'p2');
  assert.equal(chargeOf(state), 2, 'żywy stwór 2/2 daje 2 liczniki');
});

test('M360/B4c (pin): pompa w odpowiedzi — liczniki z mocy W CHWILI rozstrzygnięcia (5)', () => {
  const state = main1();
  putCard(state, 'pump', 'brute-force', 'p1', 'hand');
  const station = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability');
  assert.ok(station, 'oferta station');
  assert.ok(execute(state, station).ok, 'aktywacja station');
  // Priorytet ma p1 — pompa wchodzi na wierzch stacji (LIFO).
  addMana(state, 'p1', 1, { colors: ['R'] });
  const pump = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'pump');
  assert.ok(pump, 'pompa grywalna w odpowiedzi na własną stację');
  assert.ok(execute(state, { ...pump, targets: ['sarge'] }).ok);
  passBoth(state, 'p1'); // pompa pierwsza (LIFO)
  assert.equal(state.objects.get('sarge')?.zone, 'battlefield', 'sierżant żyje');
  passBoth(state, 'p1'); // potem station
  assert.equal(chargeOf(state), 5, 'moc 2+3 w chwili rozstrzygnięcia');
});
