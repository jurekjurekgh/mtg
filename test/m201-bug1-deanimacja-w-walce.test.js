// M201 — polowanie na błędy (odznaka), znalezisko #1:
// PERMANENT, KTÓRY PRZESTAŁ BYĆ STWOREM, NIE WYCHODZI Z WALKI (CR 506.4c).
//
// CR 506.4c: „A permanent that's removed from combat stops being an attacking,
// blocking, blocked, and/or unblocked creature… A permanent that's no longer
// a creature is removed from combat.”
//
// Scenariusz z prawdziwych kart: Skilled Animator ożywia artefakt („target
// artifact you control becomes an artifact creature … for as long as this
// creature remains on the battlefield”). Ożywiony artefakt atakuje, a w oknie
// walki przeciwnik zabija Animatora. Animacja kończy się poprawnie, ale
// `state.combat` dalej wskazuje obiekt, który NIE jest już stworem.
//
// Skutek jest gorszy niż odchyłka od reguł: inwariant stanu rzuca wyjątkiem
// w środku komendy („Combat odwołuje się do nieistniejącego stwora”), czyli
// stół pada w trakcie partii.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function animatedAttackerState() {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[5], stepIndex: 5, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  put(state, 'animator', 'skilled-animator', 'p1');
  const artifact = REGISTRY.all().find((c) => (c.types ?? []).includes('Artifact')
    && !(c.types ?? []).includes('Creature') && !c.spell);
  assert.ok(artifact, 'w katalogu jest artefakt nie-stwór');
  put(state, 'art', artifact.id, 'p1');
  applyEffect(state, { type: 'animate_linked', power: 5, toughness: 5, typesAdd: ['Artifact', 'Creature'] },
    state.objects.get('animator'), ['art']);
  assert.equal(state.objects.get('art').kind, 'creature', 'artefakt ożywiony');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['art'] }).ok, true);
  return state;
}

test('BUG1: śmierć źródła animacji w trakcie walki nie wywraca silnika', () => {
  const state = animatedAttackerState();
  assert.doesNotThrow(() => {
    applyEffect(state, { type: 'destroy_permanent' }, { id: 'x', controllerId: 'p2', cardId: 'y', zone: 'stack' }, ['animator']);
    runStateBasedActions(state);
  }, 'de-animacja atakującego nie może rzucać wyjątkiem inwariantu');
});

test('BUG1: de-animowany permanent WYCHODZI z walki (CR 506.4c)', () => {
  const state = animatedAttackerState();
  applyEffect(state, { type: 'destroy_permanent' }, { id: 'x', controllerId: 'p2', cardId: 'y', zone: 'stack' }, ['animator']);
  runStateBasedActions(state);
  assert.equal(state.objects.get('art').kind !== 'creature', true, 'animacja skończona (kontrola scenariusza)');
  assert.deepEqual(state.combat?.attackers ?? [], [],
    'CR 506.4c: obiekt, który nie jest już stworem, przestaje być atakującym');
});

test('BUG1: de-animowany permanent nie zadaje obrażeń bojowych', () => {
  const state = animatedAttackerState();
  applyEffect(state, { type: 'destroy_permanent' }, { id: 'x', controllerId: 'p2', cardId: 'y', zone: 'stack' }, ['animator']);
  runStateBasedActions(state);
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const res = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(res.ok, true, JSON.stringify(res.events?.[0] ?? {}));
  assert.equal(state.players.find((p) => p.id === 'p2').life, 20,
    'obiekt poza walką (i nie-stwór) nie zadaje obrażeń');
});

test('BUG1 (anty-over-fix): dopóki źródło animacji żyje, atakujący normalnie bije', () => {
  const state = animatedAttackerState();
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok, true);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 15, 'ożywiony artefakt 5/5 zadaje 5');
});

test('BUG1 (strażnik klasy): SBA usuwa z walki KAŻDY obiekt, który nie jest stworem', () => {
  // Nie tylko de-animacja: dowolna utrata typu stwora w oknie walki.
  const state = createGameState({ seed: 6, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[5], stepIndex: 5, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  addObject(state, {
    id: 'a', instanceId: 'i-a', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, types: ['Creature'], subtypes: [], abilities: [], keywords: [],
  });
  state.objects.set('a', Object.freeze({ ...state.objects.get('a'), summoningSickness: false }));
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a'] }).ok, true);
  state.objects.set('a', Object.freeze({ ...state.objects.get('a'), kind: 'artifact', types: ['Artifact'] }));
  assert.doesNotThrow(() => runStateBasedActions(state));
  assert.deepEqual(state.combat?.attackers ?? [], [], 'CR 506.4c działa niezależnie od przyczyny utraty typu');
});
