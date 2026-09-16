// M361/B4 (złoto): Speed rośnie przy UTRACIE ŻYCIA przeciwnika, nie tylko przy
// obrażeniach. Dowód online: mtg.wiki/page/Speed — „That player's speed then
// increases by 1 during their turn when an opponent loses life" oraz pełny
// tekst triggera: „Whenever one or more opponents lose life during your turn,
// if your speed is less than 4, increase your speed by 1. This ability
// triggers only once each turn." Silnik podpinał wzrost TYLKO pod zdarzenia
// damage_dealt (combat + niecombat), więc czysta utrata życia (lose_life —
// Delta Bloodflies, Etherwrought Page, dreny) nie podnosiła prędkości.
// Naprawa: hook na life_changed (amount < 0) zamiast hooków damage (ADR 0030:
//
//	refaktoryzacja bez zmiany zachowań pokrytych testami — bramki „tylko
//	własna tura / raz na turę / max 4" bez zmian).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

const REGISTRY = createCardRegistry();

function game(active = 'p1', step = 'main') {
  const state = createGameState({ seed: 361, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
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
  const extra = zone === 'battlefield' ? { summoningSickness: false } : {};
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...extra, ...patch }));
  return state.objects.get(id);
}

function speedOf(state, playerId) {
  return state.players.find((p) => p.id === playerId).speed ?? 0;
}

function lifeOf(state, playerId) {
  return state.players.find((p) => p.id === playerId).life;
}

function resolveStack(state, limit = 10) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
}

function passBoth(state, first = 'p1', second = 'p2') {
  execute(state, { type: 'pass_priority', playerId: first });
  execute(state, { type: 'pass_priority', playerId: second });
}

/** Silnik startowy + SBA → prędkość 1 (wspólny początek scenariuszy p1). */
function withEngineRunning(state) {
  put(state, 'survey', 'glitch-ghost-surveyor', 'p1');
  runStateBasedActions(state);
  assert.equal(speedOf(state, 'p1'), 1, 'start_engines (SBA) ustawia prędkość 1');
}

test('M361/B4: czysta utrata życia przeciwnika (atak-Bloodflies, blok — brak obrażeń w gracza) podnosi speed 1→2', () => {
  const state = game('p1', 'declare_attackers');
  withEngineRunning(state);
  // Warunek ataku Bloodflies: kontrolujesz stwora z licznikiem.
  state.objects.set('survey', Object.freeze({ ...state.objects.get('survey'), counters: { '+1/+1': 1 } }));
  put(state, 'flies', 'delta-bloodflies', 'p1');
  put(state, 'bat', 'dementia-bat', 'p2'); // bloker 2/2 z lataniem — brak obrażeń w p2

  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flies'] }).ok);
  resolveStack(state); // trigger ataku: each opponent loses 1 life (bez obrażeń)
  assert.equal(lifeOf(state, 'p2'), 19, 'p2 traci 1 życie z triggera');
  const dealtToP2 = state.events.filter((e) => e.type === 'damage_dealt' && e.target === 'p2');
  assert.equal(dealtToP2.length, 0, 'żadnych obrażeń w p2 — tylko utrata życia');
  assert.equal(speedOf(state, 'p1'), 2, 'speed rośnie przy utracie życia (nie tylko damage)');

  passBoth(state); // pusta runda po rezolucji → krok declare_blockers
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { flies: ['bat'] } }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.equal(speedOf(state, 'p1'), 2, 'blok nie zmienia prędkości');
});

test('M361/B4 (strażnik): zwykłe obrażenia bojowe nadal podnoszą speed (ścieżka damage żyje)', () => {
  const state = game('p1', 'declare_attackers');
  withEngineRunning(state);
  put(state, 'flies', 'delta-bloodflies', 'p1'); // bez liczników nigdzie: trigger nie odpala
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flies'] }).ok);
  passBoth(state);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.equal(lifeOf(state, 'p2'), 19, 'nieblokowane 1/2 zadaje 1');
  assert.equal(speedOf(state, 'p1'), 2, 'obrażenia bojowe podnoszą speed');
});

test('M361/B4 (strażnik): obrażenia + utrata życia w tej samej turze = +1 (trigger raz na turę)', () => {
  const state = game('p1', 'declare_attackers');
  withEngineRunning(state);
  state.objects.set('survey', Object.freeze({ ...state.objects.get('survey'), counters: { '+1/+1': 1 } }));
  put(state, 'flies', 'delta-bloodflies', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flies'] }).ok);
  resolveStack(state); // trigger: p2 traci 1 (speed 1→2 już tutaj)
  assert.equal(speedOf(state, 'p1'), 2, 'utrata życia podnosi do 2');
  passBoth(state);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok); // +1 obrażeń bojowych — drugi wzrost zabroniony
  assert.equal(lifeOf(state, 'p2'), 18, '1 (trigger) + 1 (combat) = 18 życia');
  assert.equal(speedOf(state, 'p1'), 2, 'drugi wzrost w tej samej turze nie zachodzi');
});

test('M361/B4 (strażnik): utrata życia przeciwnika w JEGO turze nie podnosi mojego speed', () => {
  const state = game('p2', 'main');
  withEngineRunning(state); // p1 ma speed 1 z poprzedniej tury
  put(state, 'feed', 'feed-the-infection', 'p2', 'hand');
  addMana(state, 'p2', 4);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', cardId: 'feed-the-infection', objectId: 'feed' }).ok);
  passBoth(state, 'p2', 'p1');
  assert.equal(lifeOf(state, 'p2'), 17, 'p2 traci 3 z własnego Feed the Infection');
  assert.equal(speedOf(state, 'p1'), 1, 'cudza tura: brak wzrostu (bramka „during your turn”)');
});

test('M361/B4 (strażnik): własna utrata życia we własnej turze nie podnosi mojego speed', () => {
  const state = game('p1', 'main');
  withEngineRunning(state);
  put(state, 'feed', 'feed-the-infection', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'feed-the-infection', objectId: 'feed' }).ok);
  passBoth(state);
  assert.equal(lifeOf(state, 'p1'), 17, 'p1 traci 3 z własnego Feeda');
  assert.equal(speedOf(state, 'p1'), 1, 'tracący to nie „opponent” — brak wzrostu');
});
