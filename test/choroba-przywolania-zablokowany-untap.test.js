import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { declareAttackers } from '../src/engine/combat.js';
import { untapControlled, untapObject } from '../src/engine/permanents.js';
import { addCounter } from '../src/engine/counters.js';
import { beginTurn } from '../src/engine/resources.js';

/**
 * M101/B5 (CR 302.6): „A creature's activated ability with the tap symbol
 * can't be activated and a creature can't attack unless the creature has
 * been under its controller's control continuously since the start of their
 * most recent turn."
 *
 * Choroba przywołania zależy WYŁĄCZNIE od ciągłości kontroli — nie od tego,
 * czy stwór faktycznie się odkręcił. Silnik kasował flagę tylko w gałęzi
 * realnego odkręcenia (untapControlled), więc każdy stwór, który przeszedł
 * przez untap step ZATAPNIĘTY i z blokadą odkręcania (licznik stun CR 122.1b,
 * untap-lock Entrancing Lyre, „doesn't untap next untap step"), zostawał
 * chory na przywołanie w nieskończoność — nie mógł atakować ani używać {T}
 * także wiele tur później, długo po wygaśnięciu blokady.
 */

/** Stwór na bitwisku p1, opcjonalnie zatapniętny i/lub chory. */
function addBear(state, { id = 'bear', tapped = false, summoningSickness = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-bear', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function newState() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

test('licznik stun zjada odkręcenie, ale choroba przywołania i tak znika (CR 302.6)', () => {
  const state = newState();
  addBear(state, { tapped: true, summoningSickness: true });
  addCounter(state, 'bear', 'stun', 1);

  state.turn = { ...state.turn, number: 5, activePlayerId: 'p1' };
  beginTurn(state, 'p1');

  const bear = state.objects.get('bear');
  // CR 122.1b: licznik stun zjada to odkręcenie — stwór zostaje zatapniętny.
  assert.equal(bear.tapped, true, 'stun zjada odkręcenie');
  assert.equal(bear.counters?.stun ?? 0, 0, 'licznik stun zdjęty');
  // CR 302.6: kontrola trwa od początku tury, więc choroba przywołania mija
  // niezależnie od tego, że permanent się nie odkręcił.
  assert.equal(bear.summoningSickness, false, 'choroba przywołania mija mimo braku odkręcenia');
});

test('stwór pod blokadą odkręcania może atakować po jej wygaśnięciu (CR 302.6)', () => {
  const state = newState();
  addBear(state, { tapped: true, summoningSickness: true });
  addCounter(state, 'bear', 'stun', 1);

  // Tura kontrolera: stun zjada odkręcenie, stwór zostaje zatapniętny.
  state.turn = { ...state.turn, number: 5, activePlayerId: 'p1' };
  beginTurn(state, 'p1');
  assert.equal(state.objects.get('bear').tapped, true);

  // Efekt odkręca stwora jeszcze w tej samej turze („Untap target creature").
  untapObject(state, 'bear', 'p1');
  assert.equal(state.objects.get('bear').tapped, false);

  // Kontrola nieprzerwana od początku tury → atak legalny.
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers' };
  assert.doesNotThrow(() => declareAttackers(state, 'p1', ['bear']));
});

test('stwór zablokowany untap-lockiem traci chorobę przywołania (CR 302.6)', () => {
  const state = newState();
  addBear(state, { tapped: true, summoningSickness: true });
  // Entrancing Lyre: „that permanent doesn't untap during its controller's
  // untap step for as long as ..." — blokada odkręcania, nie kontroli.
  addObject(state, {
    id: 'lyre', instanceId: 'i-lyre', cardId: 'x-lyre', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'],
  });
  // Blokada Liry działa, gdy źródło jest ZATAPNIĘTE (addObject nie przyjmuje
  // pola `tapped` — tylko `entersTapped` — więc ustawiamy je wprost).
  state.objects.set('lyre', Object.freeze({ ...state.objects.get('lyre'), tapped: true }));
  state.objects.set('bear', Object.freeze({ ...state.objects.get('bear'), untapLockedBy: ['lyre'] }));

  state.turn = { ...state.turn, number: 7, activePlayerId: 'p1' };
  beginTurn(state, 'p1');

  const bear = state.objects.get('bear');
  assert.equal(bear.tapped, true, 'untap-lock trzyma permanent zatapniętym');
  assert.equal(bear.summoningSickness, false, 'ale choroba przywołania mija (CR 302.6)');
});

test('stwór, który wszedł w TEJ turze, pozostaje chory mimo untap stepu', () => {
  const state = newState();
  // Świeżo zagrany stwór: nie był kontrolowany od początku tury.
  state.turn = { ...state.turn, number: 5, activePlayerId: 'p1' };
  beginTurn(state, 'p1');
  addBear(state, { summoningSickness: true });

  assert.equal(state.objects.get('bear').summoningSickness, true, 'świeży stwór zostaje chory');
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers' };
  assert.throws(() => declareAttackers(state, 'p1', ['bear']), /Nielegalny/);
});

test('choroba przywołania mija tylko kontrolerowi, którego jest tura (CR 302.6)', () => {
  const state = newState();
  addBear(state, { tapped: true, summoningSickness: true });
  addCounter(state, 'bear', 'stun', 1);

  // Tura PRZECIWNIKA: untap step p2 nie dotyczy stwora p1.
  state.turn = { ...state.turn, number: 4, activePlayerId: 'p2' };
  beginTurn(state, 'p2');

  const bear = state.objects.get('bear');
  assert.equal(bear.summoningSickness, true, 'cudzy untap step nie leczy choroby');
  assert.equal(bear.counters?.stun ?? 0, 1, 'ani nie zdejmuje licznika stun');
});

test('untapControlled nadal czyści chorobę zwykłym, odkręcanym stworom', () => {
  const state = newState();
  addBear(state, { tapped: true, summoningSickness: true });
  untapControlled(state, 'p1');
  const bear = state.objects.get('bear');
  assert.equal(bear.tapped, false);
  assert.equal(bear.summoningSickness, false);
});
