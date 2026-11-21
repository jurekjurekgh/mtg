// Zgłoszenie właściciela F3 (2026-11-21, Lash of the Balrog):
//   „Po zaznaczeniu auto-pass dla tej karty gra wisi przez kilkanaście
//    sekund. Właściciel podejrzewa, że silnik buduje ZABRONIONY zbiór
//    permutacji wszystkich kombinacji kart/stworów."
//
// USTALONE (repro /tmp + instrumentacja): wisiał `matchColorRequirements`
// (mana-cost.js) — stary backtracking przy NIEDOPASOWANIU (liczba pipów
// kolorowych > jednostek kryjących) enumerował PERMUTACJE jednostek
// (silnia: 13! ≈ 6×10^9 kroków). Wywoływala go pętla `feasibleX`
// w legalXCostCasts: co pyta canPayColoredCost o rosnący X, aż wymagania
// przekroczą jednostki i backtrack ruszał w silnię. Karta-katalizator:
// Consume Spirit {X}{1}{B} (jedyne z 175 czarów z problemem; talia
// decks/mirrodin-brg.txt). Przy X≤11 (wymagania ≤12 jednostek) 0,2 ms;
// X=12 → zawieszka; playerView nie wracał >100 s.
//
// Zasada właściciela: legalność sprawdzamy TYLKO pytaniem „czy dopasowanie
// ISTNIEJE" (algorytm Kuhna, O(wymagania × jednostki × krawędzie)) —
// NIGDY przez budowanie zbioru permutacji. Testy są RED na starym kodzie
// (timeout) i GREEN po poprawce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchColorRequirements } from '../src/engine/mana-cost.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { legalSpellCasts } from '../src/engine/spells.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

test('F3/1: niedopuszczalne dopasowanie (wymagania > jednostek) zwraca false w czasie wielomianowym', { timeout: 2000 }, () => {
  // 12 jednostek wielokolorowych, 20 pipów {B} — dopasowanie NIEMOŻLIWE.
  // Stary kod: 12! permutacji → timeout (RED). Nowy: Kuhn → false od razu.
  const units = Array.from({ length: 12 }, () => ['W', 'U', 'B', 'R', 'G']);
  const requirements = Array.from({ length: 20 }, () => ['B']);
  const t0 = performance.now();
  const ok = matchColorRequirements(units, requirements);
  const elapsed = performance.now() - t0;
  assert.equal(ok, false, 'brak pełnego dopasowania');
  assert.ok(elapsed < 500, `matchColorRequirements powinien być wielomianowy, było ${elapsed.toFixed(1)} ms`);
});

test('F3/2: dopasowanie MOŻLIWE nadal zwraca true (semantyka bez zmian)', { timeout: 2000 }, () => {
  const units = [['W'], ['U'], ['B'], ['B'], ['R'], ['G'], ['B']];
  const requirements = [['B'], ['B'], ['B'], ['W']];
  assert.equal(matchColorRequirements(units, requirements), true);
  // Hybryda: jednostka dwukolorowa pokrywa jeden ze swoich pipów (CR 107.4e).
  assert.equal(matchColorRequirements([['U', 'R'], ['B']], [['R'], ['B']]), true);
  assert.equal(matchColorRequirements([['U', 'R']], [['G']]), false);
  // Pusta lista wymagań = zawsze true.
  assert.equal(matchColorRequirements([], []), true);
  // {C} (jednostka bezbarwna) pokrywa pip {C} (CR 107.4c); pusta lista
  // wymagań jako pip nie istnieje (kryje ją wyłącznie ['C']).
  assert.equal(matchColorRequirements([[]], [['C']]), true);
});

test('F3/3: REGRESJA właściciela — playerView z Consume Spirit w ręce wraca szybko', { timeout: 3000 }, () => {
  // Scena jak w repro: pula 12 many, 4 stwory, 6 lądów, czar X w ręce.
  // Stary kod: legalXCostCasts → canPayColoredCost → matchColorRequirements
  // w silni → playerView nie wracał (RED po timeout). Nowy: <50 ms.
  const REG = createCardRegistry();
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 12, { colors: ['W', 'U', 'B', 'R', 'G'] });
  const cre = (id, ctrl) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: ctrl, ownerId: ctrl,
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, manaCost: 1,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    });
    const obj = state.objects.get(id);
    state.objects.set(id, { ...obj, summoningSickness: false });
  };
  cre('m0', 'p1'); cre('f0', 'p2');
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `l${i}`, instanceId: `i-l${i}`, cardId: `test-l${i}`, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [],
      subtypes: [], types: ['Land'], colors: [],
    });
  }
  const def = REG.get('consume-spirit');
  addObject(state, {
    id: 'h0', instanceId: 'i-h0', cardId: 'consume-spirit', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(def), types: def.types ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], spell: def.spell,
  });
  const t0 = performance.now();
  const offers = legalSpellCasts(state, 'p1', { amount: 0, units: [] });
  const elapsed = performance.now() - t0;
  assert.ok(Array.isArray(offers), 'oferta jest tablicą');
  assert.ok(elapsed < 500, `legalSpellCasts z czarem X powinien wracać w <500 ms, było ${elapsed.toFixed(1)} ms`);
});
