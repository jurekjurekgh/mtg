// =============================================================================
// PMSSB-66 / L48 — crash symulacji „Brak kolorowej many” (worek-mroczny, seed 3035).
//
// Przyczyna (potwierdzona na stanie): wyspa z NADANĄ zdolnością `{T}: add {R}{G}{W}`
// (efekt karty z New Capenna) ma kolory [U,R,G,W]. Planner (`planGrantManaColors`)
// liczy ją jako jednostkę wyboru, a Skarb (dowolny kolor) dostaje grantColor z
// `firstUncoveredPipColor`. Ten wybór był licznikiem PER KOLOR: jednostka [W,U,R,G]
// wyglądała jak pokrywająca W, R i G naraz, więc deficyt R/G był niewidoczny, a
// Skarb szedł na W. Płatność rzucała PO tapnięciu i poświęceniu źródeł (łamie
// atomowość, CR 601.2h).
//
// Poprawka: wybór koloru patrzy na DOPASOWANIE (maksymalne pokrycie pipów).
// Test 1 — scenariusz jednostkowy (ta sama bramka co oferta: canPayColoredCost).
// Test 2 — dokładnie ta partia, która crashowała (lustro, jeden seed, obie nogi).
// Lekki test: jedna partia, bez 167k komend.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { canPayColoredCost, spendMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { mirrorEval } from '../tools/mirror-eval.mjs';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();
const PURPOSE = Object.freeze({ castingSpell: true, artifactSpell: false });

function put(state, id, cardId, extra = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(def), ...extra,
  });
  return state.objects.get(id);
}

test('L48 seed 3035: wyspa z nadanym {T}: R/G/W + Skarb + równina — zapłata RGW nie rzuca i zużywa Skarb na R lub G', () => {
  const state = createGameState({ seed: 3035, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  // Nadana zdolność (jak w karcie New Capenna: grant na ląd do czasu rzucenia).
  const granted = Object.freeze({
    type: 'activated', cost: Object.freeze({ tap: true }),
    effect: Object.freeze({ type: 'add_mana', amount: 1, colors: Object.freeze(['R', 'G', 'W']) }),
  });
  // Grant na ląd (linkowany, jak w karcie): addObject gubi pole abilityGrants (L21),
  // więc ustawiamy je na obiekcie na polu bitwy — tyle robi silnik przy rozstrzygnięciu.
  const isl = put(state, 'isl', 'basic-island');
  state.objects.set('isl', { ...isl, abilityGrants: Object.freeze([granted]) });
  put(state, 'pla', 'basic-plains');
  put(state, 'swa', 'basic-swamp');
  put(state, 'tre', 'token_treasure');
  const requirements = [['R'], ['G'], ['W']];

  assert.equal(canPayColoredCost(state, 'p2', requirements, null, PURPOSE), true,
    'planner (oferta) musi widzieć płatność RGW ze Skarbem na R/G');
  assert.doesNotThrow(() => spendMana(state, 'p2', 3, requirements, PURPOSE));
  assert.equal(state.players.find((p) => p.id === 'p2').mana, 0, 'pula po zapłacie RGW pusta');
});

test('L48 seed 3035: partia worek-mroczny (lustro, obie nogi) kończy się bez wyjątku', () => {
  // Dokładnie ustawienia `tools/pmssb66-mirror.mjs` (A = domyślne, B = okno wyłączone).
  const r = mirrorEval({
    paramsA: normalizeHeuristicParams(),
    paramsB: normalizeHeuristicParams({ lastingManaWindowOn: 0 }),
    decks: ['worek-mroczny'],
    seedsCount: 1,
    seedBase: 3035,
    maxCommands: 8000,
  });
  assert.equal(r.unfinished, 0, `nieukończone partie: ${r.unfinished}`);
});
