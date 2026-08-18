import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addPlayerMana(state, playerId, amount, colors = []) {
  addMana(state, playerId, amount, { colors });
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
  });
}

function assertScryfall(id) {
  const raw = fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8');
  const j = JSON.parse(raw);
  const def = REGISTRY.get(id);
  assert.equal(j.name, def.name, `${id}: nazwa Scryfall != definicja`);
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length && state.zones.stack.length > 0) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (r?.events?.[0]?.reason?.endsWith('_unresolved')) return;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
}

test('Raise the Alarm: 2× token Soldier 1/1 W', () => {
  assertScryfall('raise-the-alarm');
  const state = newState();
  addCardFromRegistry(state, 'rta', 'raise-the-alarm', 'p1', 'hand');
  addPlayerMana(state, 'p1', 2, ['W']);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rta' });
  assert.equal(r.ok, true, 'cast_spell: ' + JSON.stringify(r));
  resolveStack(state);
  const tokens = [...state.objects.values()].filter((o) =>
    o.zone === 'battlefield' && o.cardId === 'token_soldier'
  );
  assert.equal(tokens.length, 2, '2 tokeny Soldier');
  for (const tok of tokens) {
    assert.equal(tok.power, 1, 'Soldier 1/1');
    assert.equal(tok.toughness, 1, 'Soldier 1/1');
    assert.ok((tok.colors ?? []).includes('W'), 'token white');
  }
});

test('Cellar Door: {3},{T} mill bottom + Zombie token gdy creature', () => {
  assertScryfall('cellar-door');
  const state = newState();
  addCardFromRegistry(state, 'door', 'cellar-door', 'p1', 'battlefield');
  addObject(state, {
    id: 'p1lib-creature', instanceId: 'i-p1lib-cr', cardId: 'x-test', controllerId: 'p1',
    zone: 'library', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['B'],
  });
  // Cellar Door aktywuje się na p1 (cel = gracz; obaj są legalni)
  addObject(state, {
    id: 'p1lib-noncreature', instanceId: 'i-p1lib-nc', cardId: 'x-test', controllerId: 'p1',
    zone: 'library', kind: 'instant', power: null, toughness: null, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['B'],
  });
  // Konwencja biblioteki: [0]=wierzch, [last]=spód. DOLNA karta (do zmillowania
  // przez Cellar Door) = ostatni element = creature.
  state.zones.library = ['p1lib-noncreature', 'p1lib-creature'];
  // Mana do aktywacji {3} + tap
  addPlayerMana(state, 'p1', 4, []);
  const r = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'door', abilityIndex: 0,
    targets: ['p1'],
  });
  assert.equal(r.ok, true, 'activate_ability: ' + JSON.stringify(r));
  resolveStack(state); // D: zdolność na stosie → mill+token po rozstrzygnięciu
  // Stwor creature powinien być w grobie (zmilled)
  const creatureInGrave = [...state.objects.values()].find((o) =>
    o.zone === 'graveyard' && o.id === 'p1lib-creature' || o.zone === 'graveyard' && o.cardId === 'x-test' && o.kind === 'creature'
  );
  assert.ok(creatureInGrave, 'creature zmilled do graveyard');
  // Token Zombie powinien być stworzony (bo creature)
  const zombies = [...state.objects.values()].filter((o) =>
    o.zone === 'battlefield' && o.cardId === 'token_zombie'
  );
  assert.equal(zombies.length, 1, '1 token Zombie (bo creature zmilled)');
  const z = zombies[0];
  assert.equal(z.power, 2, 'Zombie 2/2');
  assert.equal(z.toughness, 2, 'Zombie 2/2');
  assert.ok((z.colors ?? []).includes('B'), 'Zombie black');
});

test('Healer of the Glade: ETB gain 3 life', () => {
  assertScryfall('healer-of-the-glade');
  const state = newState();
  addCardFromRegistry(state, 'healer', 'healer-of-the-glade', 'p1', 'hand');
  const p1Before = state.players.find((p) => p.id === 'p1').life;
  addPlayerMana(state, 'p1', 1, ['G']);
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'healer' });
  assert.equal(r.ok, true, 'cast_permanent: ' + JSON.stringify(r));
  resolveStack(state);
  const p1After = state.players.find((p) => p.id === 'p1').life;
  assert.equal(p1After - p1Before, 3, 'p1 +3 życia');
});

test('Enter the Enigma: cant_be_blocked + draw 1', () => {
  assertScryfall('enter-the-enigma');
  const state = newState();
  addCardFromRegistry(state, 'enigma', 'enter-the-enigma', 'p1', 'hand');
  addObject(state, {
    id: 'cr', instanceId: 'i-cr', cardId: 'x-test', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['U'],
  });
  state.objects.set('cr', Object.freeze({ ...state.objects.get('cr'), summoningSickness: false }));
  // Pusta biblioteka p1 → draw_cards nie dobierze (brak kart w bibliotece).
  // Dodaję 1 kartę do biblioteki, żeby draw dostał co wziąć.
  addObject(state, {
    id: 'lib1', instanceId: 'i-lib1', cardId: 'x-test', controllerId: 'p1',
    zone: 'library', kind: 'instant', power: null, toughness: null, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
  });
  addPlayerMana(state, 'p1', 2, ['U']);
  // enigma w ręce (-1 po cast). Po resolve enigma → grob (-1), draw +1.
  // Netto 0.
  const handBefore = state.zones.hand.length;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'enigma', targets: ['cr'] });
  assert.equal(r.ok, true, 'cast_spell: ' + JSON.stringify(r));
  resolveStack(state);
  const handAfter = state.zones.hand.length;
  assert.equal(handAfter, handBefore, 'hand wraca do baseline (enigma→grobu, draw +1)');
  // cr ma cantBeBlocked ustawiony
  const cr = state.objects.get('cr');
  assert.equal(cr.cantBeBlocked, true, 'cr.cantBeBlocked = true');
});
