// M90 — crash nr 2 ujawniony pełnym benchmarkiem B0 (obecny w main 10fe8b7,
// odsłonięty po naprawie craftu na tokenie-kopii DFC):
//   „Błąd benchmarku: Nieprawidłowy cel obrażeń"
//   at markDamage (permanents.js) ← dealNonCombatDamage(targetId = undefined)
//   at applyEffect ← effect { type: 'damage', amount: 1 }, targets: []
//   źródło: ballista-wielder ({2}{R}: deals 1 damage to any target)
//
// Scenariusz: zdolność aktywowana CELOWANA (`ability.targets`) czeka na stosie,
// a jej jedyny cel przestaje być legalny w oknie odpowiedzi (stwór ginie,
// dostaje hexproof/protection). Rewalidacja w `resolveActivatedAbilityEntry`
// (CR 608.2b) słusznie usuwa cel z listy — ale potem efekty i tak były
// wykonywane z PUSTĄ listą celów, więc `damage` szło w `undefined`
// i engine rzucał wyjątkiem, przerywając partię.
//
// CR 608.2b: „If all its targets, for every instance of the word 'target',
// are now illegal, the spell or ability doesn't resolve." Zdolność, która
// straciła wszystkie cele, MUSI fizzlować — bez wykonywania efektów.
//
// Fix u root cause: `resolveActivatedAbilityEntry` przerywa rozstrzyganie
// (fizzle + zdarzenie `ability_resolved{fizzled:true}`), gdy zdolność
// wymagała celów, a po rewalidacji nie został żaden legalny.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const REGISTRY = createCardRegistry();

/** Dane obiektu gry z rejestru (Ballista Wielder to tylna strona DFC —
 *  `limited`, więc nie przechodzi przez walidację talii). */
function deckData(cardId) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  return {
    ...gameObjectDataOf(card),
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
  };
}

function put(state, { id, cardId, controllerId, zone, kind }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...deckData(cardId),
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Rozstrzyga stos pełnymi rundami passów. */
function resolveStack(state) {
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

test('zdolność celowana bez legalnego celu fizzluje zamiast wywalać partię (CR 608.2b)', () => {
  const state = createGameState({ seed: 1234, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  addMana(state, 'p2', 10);

  // Ballista Wielder: „{2}{R}: This creature deals 1 damage to any target."
  const wielder = put(state, { id: 'wielder', cardId: 'ballista-wielder', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  const victim = put(state, { id: 'victim', cardId: 'goblin-piker', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });

  const abilityIndex = (wielder.abilities ?? []).findIndex((a) => a?.type === 'activated');
  assert.ok(abilityIndex >= 0, 'Ballista Wielder ma zdolność aktywowaną (kontrola założeń testu)');

  const activate = { type: 'activate_ability', playerId: 'p1', objectId: 'wielder', abilityIndex, targets: [victim.id] };
  const activated = execute(state, activate);
  assert.ok(activated.ok, `aktywacja odrzucona: ${activated.events?.[0]?.reason}`);
  assert.equal(state.zones.stack.length, 1, 'zdolność czeka na stosie');

  // W oknie odpowiedzi cel znika z pola bitwy (CR 608.2b — cel nielegalny).
  moveObjectDirectly(state, victim.id, 'graveyard', `grave-${state.objectSequence++}`);

  // Rozstrzygnięcie NIE MOŻE rzucić wyjątkiem — zdolność po prostu fizzluje.
  assert.doesNotThrow(() => resolveStack(state),
    'zdolność bez legalnego celu nie może przerywać partii wyjątkiem');
  assert.equal(state.zones.stack.length, 0, 'zdolność musi zejść ze stosu');

  const resolved = state.events.filter((e) => e.type === 'ability_resolved');
  assert.ok(resolved.length > 0, 'engine musi zaraportować rozstrzygnięcie zdolności');
  assert.equal(resolved[resolved.length - 1].fizzled, true,
    'zdolność bez legalnego celu MUSI być oznaczona jako fizzled (CR 608.2b)');
});

test('zdolność celowana z żywym celem nadal działa (brak nadgorliwego fizzle)', () => {
  const state = createGameState({ seed: 1234, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  addMana(state, 'p2', 10);

  const wielder = put(state, { id: 'wielder', cardId: 'ballista-wielder', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'victim', cardId: 'goblin-piker', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  const abilityIndex = (wielder.abilities ?? []).findIndex((a) => a?.type === 'activated');

  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'wielder', abilityIndex, targets: ['victim'] }).ok);
  resolveStack(state);

  const damage = state.events.filter((e) => e.type === 'damage_dealt' && e.target === 'victim');
  assert.equal(damage.length, 1, 'żywy cel musi dostać obrażenia');
  assert.equal(damage[0].amount, 1);
});

test('zdolność celowana w gracza nie fizzluje (gracz zawsze legalnym celem)', () => {
  const state = createGameState({ seed: 1234, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  addMana(state, 'p2', 10);

  const wielder = put(state, { id: 'wielder', cardId: 'ballista-wielder', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  const abilityIndex = (wielder.abilities ?? []).findIndex((a) => a?.type === 'activated');
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'wielder', abilityIndex, targets: ['p2'] }).ok);
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 1,
    'obrażenia w gracza muszą przejść');
});
