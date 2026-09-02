// Audyt rulingów WotC (ściągniętych 2026-09-02, patrz
// `docs/cards/scryfall-leonin-surveyor.json` → pole `rulings`, oraz
// `tools/fetch-card-rulings.mjs`).
//
// Ruling WotC (Leonin Surveyor, DFT, 2025-02-07), przytoczony w całości:
//   „Start your engines! isn't a triggered ability. Increasing your speed to 1
//    is something that happens as a state-based action as soon as you control a
//    permanent with the ability. Notably, this includes gaining control of a
//    permanent with the ability that another player controls.”
//   oraz: „losing control of permanents with start your engines! doesn't affect
//    your speed.”
//
// Model z batchy 24/52 wkładał to w trigger `enter_battlefield` z efektem
// `start_engines`. Skutek: przejęcie cudzego permanentu z „Start your
// engines!” nie dawało prędkości w ogóle, a zdolność nadana (grants) nie była
// liczona. Naprawa: akcja stanowa (`runStateBasedActions`) czytająca
// `effectiveAbilities` — bez nazw kart (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { ABILITY_TYPE } from '../src/engine/abilities.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 92, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
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

/** Popycha priorytet, aż stos się rozstrzygnie (jak harness batchy 52). */
function resolveStack(state, limit = 8) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
}

const speedOf = (state, playerId) => state.players.find((p) => p.id === playerId).speed ?? 0;

test('A-rulingi: przejęcie permanentu z „Start your engines!” podnosi prędkość (akcja stanowa)', () => {
  const state = game('p1');
  addMana(state, 'p1', 2, { colors: ['W'] });
  put(state, 'leonin', 'leonin-surveyor', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'leonin' }).ok);
  resolveStack(state);
  assert.equal(speedOf(state, 'p1'), 1, 'wejście: prędkość startuje do 1');

  // Kradzież kontroli (np. Awaken the Sleeper) — permanent JEST na polu bitwy,
  // żadne ETB już nie zachodzi. Ruling: nowy kontroler też dostaje prędkość.
  // Rzucony permanent ma po przejściu przez stos INNY identyfikator, więc
  // celujemy w obiekt leżący na polu bitwy (jak w batchu 24).
  const onField = [...state.objects.values()]
    .find((o) => o.cardId === 'leonin-surveyor' && o.zone === 'battlefield');
  assert.ok(onField, 'Leonin na polu bitwy');
  state.objects.set(onField.id, Object.freeze({ ...onField, controllerId: 'p2' }));
  runStateBasedActions(state);
  assert.equal(speedOf(state, 'p2'), 1,
    'przejęcie permanentu z „Start your engines!” musi dać prędkość 1 — to akcja'
    + ' stanowa (ruling WotC 2025-02-07), nie trigger wejścia');
});

test('A-rulingi: karta deklaruje silniki jako zdolność statyczną, nie wyzwalaną', () => {
  // Same źródło prawdy co wyżej: jeśli model wróci do triggera, akcja stanowa
  // przestanie istnieć i przejęcie kontroli znowu będzie nieme.
  for (const cardId of ['leonin-surveyor', 'glitch-ghost-surveyor']) {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    const engines = def.abilities.find((ability) => [ability.effect].flat()
      .some((entry) => entry?.type === 'start_engines'));
    assert.ok(engines, `${cardId}: brak zdolności ze start_engines`);
    assert.equal(engines.type, ABILITY_TYPE.static,
      `${cardId}: „Start your engines!” jest zdolnością statyczną — ruling WotC:`
      + ' „isn’t a triggered ability” (docs/cards/' + `scryfall-${cardId}` + '.json → rulings)');
    assert.equal(engines.trigger, null, `${cardId}: zdolność nie może mieć triggera`);
  }
});

test('A-rulingi: dwa silniki = prędkość 1 (start to ustawienie, nie +1)', () => {
  const state = game('p1');
  put(state, 'l1', 'leonin-surveyor', 'p1');
  put(state, 'l2', 'leonin-surveyor', 'p1');
  runStateBasedActions(state);
  assert.equal(speedOf(state, 'p1'), 1,
    'prędkość STARTUJE do 1, gdy jej nie masz; drugi silnik nic nie dokłada');
});

test('A-rulingi: silnik NADANY zdolnością liczy się tak samo jak wydrukowany', () => {
  // Zdolność czytamy przez `effectiveAbilities`, więc gracz, który dostał
  // „Start your engines!” od cudzej zdolności statycznej, startuje tak samo.
  const state = game('p1');
  addObject(state, {
    id: 'nosiciel', instanceId: 'i-nosiciel', cardId: 'test-nosiciel', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1,
    manaCost: 1, types: ['Creature'], subtypes: [], colors: [], abilities: [],
  });
  state.objects.set('nosiciel', Object.freeze({
    ...state.objects.get('nosiciel'),
    abilityGrants: [Object.freeze({
      type: ABILITY_TYPE.static, timing: 'instant',
      effect: [Object.freeze({ type: 'start_engines' })],
    })],
  }));
  runStateBasedActions(state);
  assert.equal(speedOf(state, 'p1'), 1, 'nadana zdolność też uruchamia akcję stanową');
});

test('A-rulingi: utrata permanentu nie cofa prędkości', () => {
  const state = game('p1');
  put(state, 'leonin', 'leonin-surveyor', 'p1');
  runStateBasedActions(state);
  assert.equal(speedOf(state, 'p1'), 1, 'start przez akcję stanową');
  moveObjectDirectly(state, 'leonin', 'graveyard', 'leonin-g');
  const przed = state.events.length;
  runStateBasedActions(state);
  assert.equal(speedOf(state, 'p1'), 1,
    'prędkość jest cechą gracza — nie spada, gdy źródło znika (ruling WotC)');
  assert.equal(state.events.length, przed, 'bez zdarzeń, skoro nic się nie zmieniło');
});
