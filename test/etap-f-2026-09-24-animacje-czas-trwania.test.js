// Etap F/5 (PR #135, W-10/W-11 — znalezione przy przeglądzie komentarzy W-9):
// każda animacja to OSOBNY efekt z własnym czasem trwania (CR 611.2):
// „until end of turn” (crew — CR 702.122a, Silvanus's Invoker) albo „for as
// long as [źródło] remains on the battlefield” (Skilled Animator). Silnik
// trzymał jedną scaloną warstwę i koniec DOWOLNEGO efektu cofał wszystkie:
//   W-10: obsadzony (crew) pojazd, animowany wcześniej przez Skilled Animatora,
//         po śmierci Animatora przestawał być stworem (i wypadał z walki),
//         choć crew trwa do końca tury;
//   W-11: drugi Skilled Animator na tym samym artefakcie wypierał wpis
//         pierwszego — zejście drugiego cofało animację mimo trwającego
//         pierwszego.
// Karty z katalogu: Irontread Crusher (Vehicle 6/6, Crew 3), Skilled Animator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { clearStatModifiers } from '../src/engine/permanents.js';

const R = createCardRegistry();
const SA_EFFECT = R.get('skilled-animator').abilities[0].effect[0];
const CREW_EFFECT = R.get('irontread-crusher').abilities.find((a) => a.cost?.crewPower).effect;

function game() {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  put(state, 'veh', 'irontread-crusher');
  return state;
}

function put(state, id, cardId) {
  const def = R.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
  });
}

const animate = (state, sourceId) => applyEffect(state, SA_EFFECT, state.objects.get(sourceId), ['veh']);
const crew = (state) => applyEffect(state, CREW_EFFECT, state.objects.get('veh'), []);
const veh = (state) => state.objects.get('veh');
const shape = (o) => ({ kind: o.kind, creature: (o.types ?? []).includes('Creature'), power: o.power, toughness: o.toughness });

test('W-10: Animator → crew → Animator ginie: pojazd zostaje stworem 6/6 do końca tury, potem artefakt', () => {
  const state = game();
  put(state, 'sa', 'skilled-animator');
  animate(state, 'sa');
  crew(state);
  assert.deepEqual(shape(veh(state)), { kind: 'creature', creature: true, power: 5, toughness: 5 });
  moveObjectDirectly(state, 'sa', 'graveyard', 'g-sa');
  assert.deepEqual(shape(veh(state)), { kind: 'creature', creature: true, power: 6, toughness: 6 },
    'crew trwa (artifact creature), P/T wydrukowane (W-6)');
  clearStatModifiers(state);
  assert.deepEqual(shape(veh(state)), { kind: 'artifact', creature: false, power: 6, toughness: 6 }, 'cleanup kończy crew');
  assert.equal(veh(state).originalBeforeAnimation, null);
});

test('W-10: crew → Animator → cleanup: animacja z linkiem trwa (5/5), znacznik crew gaśnie', () => {
  const state = game();
  put(state, 'sa', 'skilled-animator');
  crew(state);
  animate(state, 'sa');
  clearStatModifiers(state);
  assert.deepEqual(shape(veh(state)), { kind: 'creature', creature: true, power: 5, toughness: 5 });
  assert.notEqual(veh(state).crewed, true, 'crew („until end of turn”) skończył się');
  moveObjectDirectly(state, 'sa', 'graveyard', 'g-sa');
  assert.deepEqual(shape(veh(state)), { kind: 'artifact', creature: false, power: 6, toughness: 6 });
});

test('W-10: P/T ustawione do końca tury nad animacją z linkiem wygasa w cleanup (CR 613.7b)', () => {
  const state = game();
  put(state, 'sa', 'skilled-animator');
  animate(state, 'sa');
  applyEffect(state, { type: 'animate_permanent_until_end_of_turn', power: 8, toughness: 8, typesAdd: ['Creature'] },
    state.objects.get('veh'), ['veh']);
  assert.equal(veh(state).power, 8, 'późniejszy znacznik wygrywa');
  clearStatModifiers(state);
  assert.deepEqual(shape(veh(state)), { kind: 'creature', creature: true, power: 5, toughness: 5 }, 'wraca 5/5 z linku');
});

test('W-11: dwa Skilled Animatory — zejście jednego nie cofa animacji drugiego', () => {
  const state = game();
  put(state, 'sa', 'skilled-animator');
  put(state, 'sb', 'skilled-animator');
  animate(state, 'sa');
  animate(state, 'sb');
  moveObjectDirectly(state, 'sb', 'graveyard', 'g-sb');
  assert.deepEqual(shape(veh(state)), { kind: 'creature', creature: true, power: 5, toughness: 5 }, 'pierwszy trwa');
  clearStatModifiers(state);
  assert.equal(veh(state).power, 5, 'cleanup nie rusza animacji z linkiem');
  moveObjectDirectly(state, 'sa', 'graveyard', 'g-sa');
  assert.deepEqual(shape(veh(state)), { kind: 'artifact', creature: false, power: 6, toughness: 6 }, 'oba zeszły — koniec');
  assert.equal((state.linkedAnimations ?? []).length, 0);
});
