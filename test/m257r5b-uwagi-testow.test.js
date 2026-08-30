import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';

/**
 * M257 r5b (uwagi z testów, część 2) — cztery znaleziska właściciela:
 *
 * A — „Tasuj talię” bez komunikatu (test w table-ui.test.js — dom stołu);
 * B — kto zaczyna partię powinien być losowy (starter z seeda, CR 103.7a/
 *     103.4 przymocowane do state.starterId, nie players[0]);
 * C — Awaken the Sleeper: bot po przejęciu stwora nie atakuje (testy w
 *     dalszej części pliku — etap C);
 * D — Ruthless Invasion: płatność życiem bez ataku / atak bez sensu
 *     (etap D).
 *
 * Plan: docs/plans/PLAN_2026-08-30-m257r5b-uwagi-testow.md.
 */

// ---------------------------------------------------------------------------
// B — losowy starter (rzut monetą z seeda)
// ---------------------------------------------------------------------------

function seedsWithStarter(starter, limit = 40) {
  const out = [];
  for (let seed = 1; out.length < limit && seed <= 500; seed += 1) {
    const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
    if (state.starterId === starter) out.push(seed);
  }
  return out;
}

test('r5b/B: starter jest losowany z seeda — deterministycznie i po równo', () => {
  const counts = { p1: 0, p2: 0 };
  for (let seed = 1; seed <= 200; seed += 1) {
    const a = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
    const b = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
    assert.equal(a.starterId, b.starterId, `seed ${seed} deterministyczny`);
    assert.ok(['p1', 'p2'].includes(a.starterId));
    assert.equal(a.turn.activePlayerId, a.starterId, 'tuta 1 aktywny jest starter');
    counts[a.starterId] += 1;
  }
  assert.ok(counts.p1 > 80 && counts.p1 < 120, `p1 ≈ 50% (jest ${counts.p1}/200)`);
  assert.ok(counts.p2 > 80 && counts.p2 < 120, `p2 ≈ 50% (jest ${counts.p2}/200)`);
});

/** Tura 1 do kroku doborania (pętla passów, wzorzec T14). */
function advanceToDraw(state, maxCommands = 40) {
  for (let i = 0; i < maxCommands && state.status === 'active'
    && !(state.turn.step === 'draw' && state.turn.number === 1); i += 1) {
    const result = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.ok(result.ok, `pass: ${result.events[0]?.reason}`);
  }
  return state;
}

test('r5b/B: CR 103.7a — starter (teraz może być p2) pomija dobranie tury 1', () => {
  const seed = seedsWithStarter('p2')[0];
  assert.ok(seed, 'znaleziono seed ze starterem p2');
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Karty w bibliotekach — bez nich nie ma czego dobierać (wzorzec T14).
  for (const [id, controller] of [['lib1', 'p1'], ['lib2', 'p2']]) {
    addObject(state, { id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: controller,
      ownerId: controller, zone: 'library', kind: 'creature', power: 1, toughness: 1,
      manaCost: 2, types: ['Creature'], abilities: [] });
  }
  advanceToDraw(state);
  assert.equal(state.turn.step, 'draw');
  assert.equal(state.turn.activePlayerId, 'p2', 'tura 1 = tura startera (p2)');
  assert.ok(!state.turn.drawnInStep, 'starter NIE dobiera w turze 1 (CR 103.7a)');
  // Drugi gracz (p1) dobiera w SWOJEJ pierwszej turze (tura numer 2).
  for (let i = 0; i < 200 && state.status === 'active'
    && !(state.turn.step === 'draw' && state.turn.activePlayerId === 'p1' && state.turn.number === 2); i += 1) {
    const result = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.ok(result.ok, `pass: ${result.events[0]?.reason}`);
  }
  assert.equal(state.turn.activePlayerId, 'p1', 'tura 2 = tura p1');
  assert.equal(state.turn.number, 2);
  assert.ok(state.turn.drawnInStep, 'p1 (drugi gracz) DOBIERA w swojej pierwszej turze');
});

test('r5b/B: CR 103.7a — starter p1: zachowanie jak dotąd (regresja)', () => {
  const seed = seedsWithStarter('p1')[0];
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  advanceToDraw(state);
  assert.equal(state.turn.activePlayerId, 'p1');
  assert.ok(!state.turn.drawnInStep, 'starter p1 pomija dobranie tury 1');
});

test('r5b/B: kolejność mulliganów zaczyna od startera (CR 103.4)', async () => {
  const seed = seedsWithStarter('p2')[0];
  // setupGame przydzielający ręce — symulujemy mulligan jak w session:
  // pendingMulligans musi być [starter, ...reszta].
  const { setupGame } = await import('../src/engine/setup.js');
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  const libCards = { p1: [], p2: [] };
  for (const id of state.zones.library) {
    libCards[state.objects.get(id).controllerId].push(state.objects.get(id).cardId);
  }
  const decks = new Map([
    ['p1', libCards.p1], ['p2', libCards.p2],
  ]);
  setupGame({ state, decks, seed, openingHandSize: 3 });
  assert.deepEqual(state.pendingMulligans, ['p2', 'p1'],
    `mulligany: starter (p2) najpierw — ${JSON.stringify(state.pendingMulligans)}`);
  assert.equal(state.turn.priorityPlayerId, 'p2', 'priorytet mulligana: starter');
});
