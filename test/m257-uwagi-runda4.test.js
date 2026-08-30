import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * M257 r4 (uwagi z testów, runda 4) — A: „Deklaracja atakujących" bez
 * kreatur.
 *
 * Zgłoszenie właściciela: „Faza Deklaracja Atakujących — jeśli nie mam
 * żadnej kreatury to nie powinienem w ogóle dostawać takiej opcji, a
 * dostaję."
 *
 * Root cause: `legalAttackerOptions` przy zero legalnych atakujących
 * zwraca `[[]]` (boundedSubsets z pustej listy), więc generator
 * legalnych komend wystawiał JEDNĄ komendę `declare_attackers` z pustym
 * zestawem — decyzję, która nie istnieje. CR 508.1: aktywny gracz
 * deklaruje atakujących (jeden lub więcej legalnych, albo ZERO); gdy
 * nie ma ŻADNEGO legalnego atakującego, deklaracja jest pusta i
 * automatyczna — gra przechodzi do kroku blokujących, bez okna decyzji.
 * Naprawa: auto-przejście przy wejściu w krok (wzorzec auto-dobrania
 * kroku, CR 504.1 / drawStepTurnBasedAction).
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function addRealCard(state, id, cardId, playerId, zone) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data,
  });
}

/** Wejście w krok `declare_attackers` REALNĄ ścieżką: pełna runda passów
 * w kroku beginning_of_combat (nextTurnStep w pass_priority). */
function enterCombatDeclaration(state, active = 'p1', defender = 'p2') {
  state.turn = jumpToStep(state.turn, 'beginning_of_combat', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  assert.ok(execute(state, { type: 'pass_priority', playerId: active }).ok, 'pass aktywnego');
  assert.ok(execute(state, { type: 'pass_priority', playerId: defender }).ok, 'pass obrońcy');
}

test('A: zero kreatur u aktywnego gracza — brak opcji „Deklaracja atakujących", silnik przechodzi sam', () => {
  const state = game();
  // p1 (aktywny) ma tylko ląd; p2 (obrońca) ma stwora.
  addRealCard(state, 'land1', 'basic-forest', 'p1', 'battlefield');
  addRealCard(state, 'guard', 'highland-game', 'p2', 'battlefield');
  enterCombatDeclaration(state);

  // Po pełnej rundzie passów: beginning_of_combat → declare_attackers
  // → (fix A) auto-deklaracja pustego zbioru → declare_blockers.
  assert.equal(state.turn.step, 'declare_blockers',
    `oczekiwane automatyczne przejście do declare_blockers, stan: ${state.turn.step}`);
  assert.ok(state.combat, 'stan walki zainicjalizowany');
  assert.equal(state.combat.attackingPlayerId, 'p1');
  assert.deepEqual(state.combat.attackers, [], 'atakujący = pusty zbiór');

  // ŻADEN gracz nie dostaje komendy „Deklaracja atakujących".
  for (const pid of ['p1', 'p2']) {
    const offers = playerView(state, pid).legalCommands.filter((c) => c.type === 'declare_attackers');
    assert.equal(offers.length, 0, `${pid}: wystawiono „Deklaracja atakujących" bez kreatur`);
  }

  // Log: puste zdarzenie deklaracji istnieje (oś 2: kompletność), ale w
  // dobrej kolejności — po passach i przed przejściem do blokujących.
  const declared = state.events.filter((e) => e.type === 'attackers_declared');
  assert.equal(declared.length, 1, 'zdarzenie auto-deklaracji w logu');
  assert.deepEqual(declared[0].attackerIds, [], 'zdarzenie niesie pusty zbiór');
  const firstPassIndex = state.events.findIndex((e) => e.type === 'priority_passed');
  const declaredIndex = state.events.findIndex((e) => e.type === 'attackers_declared');
  assert.ok(declaredIndex > firstPassIndex,
    'kolejność: passy PRZED deklaracją (pass_priority pushuje eventy na końcu)');
});

test('A (wariant): aktywny ma kreatury, ale ŻADNA nie może atakować (choroba) — auto-przejście', () => {
  const state = game();
  addRealCard(state, 'sick', 'highland-game', 'p1', 'battlefield');
  const o = state.objects.get('sick');
  state.objects.set('sick', Object.freeze({ ...o, summoningSickness: true }));
  addRealCard(state, 'land1', 'basic-forest', 'p2', 'battlefield');
  enterCombatDeclaration(state);

  assert.equal(state.turn.step, 'declare_blockers',
    `stwór z chorobą to zero legalnych atakujących — stan: ${state.turn.step}`);
  assert.deepEqual(state.combat?.attackers, [], 'atakujący = pusty zbiór');
});

test('A (anti-overfix): z legalnym atakującym oferta istnieje jak dotąd (wszystkie podzbiory)', () => {
  const state = game();
  // Dwa stwory bez entersWithCounters (addObject ich nie stosuje —
  // materializacja to robi; 0/0 zginęłoby od SBA i zanieczyściłoby test).
  const c1 = addRealCard(state, 'c1', 'highland-game', 'p1', 'battlefield');
  const c2 = addRealCard(state, 'c2', 'colossodon-yearling', 'p1', 'battlefield');
  addRealCard(state, 'land1', 'basic-forest', 'p2', 'battlefield');
  enterCombatDeclaration(state);

  assert.equal(state.turn.step, 'declare_attackers', 'krok oczekuje na decyzję (jest wybór)');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'declare_attackers');
  // Podzbiory 2 opcjonalnych: {}, {c1}, {c2}, {c1, c2} — 4 warianty.
  assert.equal(offers.length, 4, `oczekiwano 4 wariantów ataku, dostałem ${offers.length}`);
  const combos = offers.map((c) => [...(c.attackerIds ?? [])].sort().join(','));
  assert.ok(combos.includes(''), 'wariant bez atakujących nadal istnieje');
  assert.ok(combos.includes(`${c1.id},${c2.id}`), 'wariant „wszyscy" istnieje');
});

test('A (anti-overfix): TYLKO wymuszony atakujący (goad) — pojedyncza oferta z nim', () => {
  const state = game();
  const c1 = addRealCard(state, 'c1', 'highland-game', 'p1', 'battlefield');
  state.objects.set('c1', Object.freeze({ ...state.objects.get('c1'), goaded: true }));
  addRealCard(state, 'land1', 'basic-forest', 'p2', 'battlefield');
  enterCombatDeclaration(state);

  assert.equal(state.turn.step, 'declare_attackers', 'krok oczekuje na decyzję (goad musi być zadeklarowany)');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'declare_attackers');
  assert.equal(offers.length, 1, `oczekiwano 1 wariantu (goad), dostałem ${offers.length}`);
  assert.deepEqual(offers[0].attackerIds, [c1.id], 'goad jest w każdym (jedynym) wariantcie');
});
