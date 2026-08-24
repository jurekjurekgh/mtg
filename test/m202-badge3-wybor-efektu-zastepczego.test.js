// M202 — brązowa odznaka, znalezisko #3: CR 616.1 (kolejność efektów zastępczych).
//
// CR 616.1: „If two or more replacement and/or prevention effects are
// attempting to modify the way an event affects an object or player, the
// affected object's controller ... chooses one to apply.”
//
// Stan przed fixem: gdy stworowi z LICZNIKIEM TARCZY (CR 122.1b, np. Swooping
// Protector) groziło zniszczenie z obrażeń, a miał też TARCZĘ REGENERACJI
// (CR 701.12, np. {1}{B}{G}: Regenerate this creature), SBA zawsze konsumowało
// licznik tarczy — gracz tracił licznik nawet wtedy, gdy wolał regenerację
// (która dodatkowo zdejmuje obrażenia i odpina od walki). Reguła wymaga
// WYBORU kontrolera, więc silnik odbierał mu decyzję.
//
// Obie mechaniki są w katalogu (entersWithCounters: { shield: 1 } oraz karty
// z regenerate), więc kombinacja jest osiągalna w realnej partii.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { runStateBasedActions, addRegenerationShield } from '../src/engine/state-based.js';
import { addCounter } from '../src/engine/counters.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function stateWith({ shield = 0, regeneration = false, damage = 5, toughness = 3, controller = 'p1' } = {}) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, number: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const def = REGISTRY.get('hill-giant');
  addObject(state, {
    id: 'c1', instanceId: 'i-c1', cardId: 'hill-giant', controllerId: controller, ownerId: controller,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], keywords: [], subtypes: [],
    power: 3, toughness,
  });
  state.objects.set('c1', Object.freeze({ ...state.objects.get('c1'), summoningSickness: false, damage }));
  if (shield > 0) addCounter(state, 'c1', 'shield', shield);
  if (regeneration) addRegenerationShield(state, 'c1');
  return state;
}

const offers = (state, playerId = 'p1') => playerView(state, playerId).legalCommands
  .filter((c) => c.type === 'resolve_replacement_choice');

test('M202/#3 (CR 616.1): tarcza + regeneracja = WYBÓR kontrolera, nie automatyczna tarcza', () => {
  const state = stateWith({ shield: 1, regeneration: true });
  runStateBasedActions(state);
  assert.equal(state.status, 'active', 'partia czeka na decyzję gracza');
  assert.equal(state.pendingReplacementChoice?.playerId, 'p1', 'decyduje kontroler permanenta');
  assert.equal(state.objects.get('c1').zone, 'battlefield', 'stwór jeszcze żyje');
  assert.equal((state.objects.get('c1').counters?.shield ?? 0), 1, 'tarcza NIE została skonsumowana bez pytania');
  const choices = offers(state);
  assert.deepEqual(choices.map((c) => c.choice).sort(), ['regenerate', 'shield'], 'dwie opcje w panelu');
});

test('M202/#3: wybór „tarcza” zużywa licznik, a CR 704.3 powtarza SBA — dobija regeneracja', () => {
  // CR 122.1b zastępuje ZNISZCZENIE, ale obrażenia zostają oznaczone, więc
  // CR 704.3 („Then the process repeats”) sprawdza akcje stanowe jeszcze raz:
  // stwór nadal ma śmiertelne obrażenia, a jedynym dostępnym efektem
  // zastępczym jest teraz tarcza regeneracji. Wybór „tarcza” kosztuje więc
  // OBA zabezpieczenia — i właśnie dlatego reguła oddaje wybór graczowi.
  const state = stateWith({ shield: 1, regeneration: true });
  runStateBasedActions(state);
  const pick = offers(state).find((c) => c.choice === 'shield');
  assert.equal(execute(state, pick).ok, true);
  const creature = state.objects.get('c1');
  assert.equal(creature.zone, 'battlefield', 'stwór przeżył');
  assert.equal(creature.counters?.shield ?? 0, 0, 'licznik tarczy zużyty');
  assert.equal(creature.damage, 0, 'regeneracja zdjęła obrażenia (CR 701.12a)');
  assert.deepEqual(state.regenerationShields ?? [], [], 'tarcza regeneracji też zużyta');
});

test('M202/#3: wybór „regeneracja” tapuje, zdejmuje obrażenia i zostawia licznik tarczy', () => {
  const state = stateWith({ shield: 1, regeneration: true });
  runStateBasedActions(state);
  const pick = offers(state).find((c) => c.choice === 'regenerate');
  assert.equal(execute(state, pick).ok, true);
  const creature = state.objects.get('c1');
  assert.equal(creature.zone, 'battlefield');
  assert.equal(creature.tapped, true, 'CR 701.12a: regeneracja tapuje');
  assert.equal(creature.damage, 0, 'CR 701.12a: obrażenia zdjęte');
  assert.equal(creature.counters?.shield ?? 0, 1, 'licznik tarczy nietknięty');
  assert.deepEqual(state.regenerationShields ?? [], [], 'tarcza regeneracji zużyta');
});

test('M202/#3 (anty-over-fix): sama tarcza — bez pytania, licznik spada (CR 122.1b)', () => {
  const state = stateWith({ shield: 1, regeneration: false });
  runStateBasedActions(state);
  assert.equal(state.pendingReplacementChoice, null, 'nie ma drugiego efektu, więc nie ma wyboru');
  assert.equal(state.objects.get('c1').zone, 'battlefield');
  assert.equal(state.objects.get('c1').counters?.shield ?? 0, 0);
});

test('M202/#3 (anty-over-fix): sama regeneracja — bez pytania, stwór przeżywa (CR 701.12)', () => {
  const state = stateWith({ shield: 0, regeneration: true });
  runStateBasedActions(state);
  assert.equal(state.pendingReplacementChoice, null);
  assert.equal(state.objects.get('c1').zone, 'battlefield');
  assert.equal(state.objects.get('c1').tapped, true);
});

test('M202/#3 (anty-over-fix): wytrzymałość <= 0 to nie zniszczenie — wyboru nie ma (CR 704.5c)', () => {
  const state = stateWith({ shield: 1, regeneration: true, damage: 0 });
  state.objects.set('c1', Object.freeze({ ...state.objects.get('c1'), toughnessModifier: -5 }));
  runStateBasedActions(state);
  assert.equal(state.pendingReplacementChoice, null, 'ani tarcza, ani regeneracja nie chronią przed 0 wytrzymałości');
  assert.notEqual(state.objects.get('c1')?.zone, 'battlefield', 'stwór idzie do grobu');
});

test('M202/#3 (CR 616.1): decyduje KONTROLER, nie gracz aktywny ani właściciel', () => {
  const state = stateWith({ shield: 1, regeneration: true, controller: 'p2' });
  runStateBasedActions(state);
  assert.equal(state.pendingReplacementChoice?.playerId, 'p2');
  assert.equal(offers(state, 'p2').length, 2, 'p2 ma decyzję');
  assert.equal(offers(state, 'p1').length, 0, 'p1 jej nie ma');
  const foreign = execute(state, { type: 'resolve_replacement_choice', playerId: 'p1', choice: 'shield' });
  assert.equal(foreign.ok, false, 'cudza decyzja jest odrzucana');
});

test('M202/#3: dopóki trwa decyzja, inne komendy są zablokowane (brak martwego okna)', () => {
  const state = stateWith({ shield: 1, regeneration: true });
  runStateBasedActions(state);
  const view = playerView(state, 'p1');
  const types = view.legalCommands.map((c) => c.type);
  assert.ok(types.includes('resolve_replacement_choice'), 'decyzja jest oferowana');
  const actionable = [...new Set(types)].filter((type) => type !== 'concede');
  assert.deepEqual(actionable, ['resolve_replacement_choice'],
    `okno priorytetu musi zawierać wyłącznie decyzję (concede zawsze dostępne), jest: ${actionable.join(',')}`);
});
