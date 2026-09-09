// F-D (znalezisko właściciela 2026-09-09): bot rozpraszał 3 obrażenia Inferno
// Titana 1/1/1 na trzy cele (toughness ≥ 2) — nikt nie ginął. Root cause:
// `resolve_trigger_target` wielocelowy (requiresTarget upTo 3, efekt
// `damage_divided`) wyceniał KAŻDY cel osobno (~30+wartość) i nie znał
// STAŁEGO budżetu obrażeń (`divisionTotal`). Brał więc max celów, a
// `resolve_damage_division` (każdy cel ≥ 1, suma = budżet; CR 603.3d/601.2d)
// potem był zmuszony do minimalnego 1/1/1.
//
// Fix: w wyborze celów bot koryguje wynik o liczbę WROGICH stworów dających
// się zabić w tym budżecie (przy obowiązkowym ≥1 na cel) — premiuje skupiony
// lethal (60/zabójstwo), więc zamiast 1/1/1 dobiera mniej celów i rozkłada
// 2+1 (albo 3 w jednego), żeby ktoś zginął.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putReal(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

function setPT(state, id, power, toughness) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), power, toughness }));
}

/** p1 rzuca Inferno Titana; p2 ma `n` stworów o toughness 2. */
function stolTitan(n) {
  const state = createGameState({ seed: 701, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < n; i += 1) {
    putReal(state, `foe${i}`, 'highland-game', 'p2');
    setPT(state, `foe${i}`, 1, 2);
  }
  putReal(state, 'titan', 'inferno-titan', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(cast, 'oferta rzutu Tytana');
  assert.ok(execute(state, cast).ok);
  // Pasuje, aż trigger ETB otworzy decyzję celów.
  for (let i = 0; i < 20 && !state.pendingTriggerTargets?.[0]; i += 1) {
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    } else break;
  }
  assert.ok(state.pendingTriggerTargets?.[0], 'decyzja celów triggera otwarta');
  return state;
}

function enemyBattlefieldCount(state) {
  return playerView(state, 'p2').zones.battlefield.filter((o) => o.controllerId === 'p2').length;
}

/** Puszcza robota przez wybór celów + ewentualny podział + rozstrzygnięcie. */
function botRozegrajInferno(state, seed = 701) {
  const before = enemyBattlefieldCount(state);
  const bot = createHeuristicBot({ seed, randomness: 0 });
  const view = playerView(state, 'p1');
  const targetCmd = bot.chooseCommand(view, {});
  assert.equal(targetCmd.type, 'resolve_trigger_target', `bot wybiera cele: ${targetCmd.type}`);
  const targetIds = Array.isArray(targetCmd.targetIds) ? targetCmd.targetIds : [targetCmd.targetId];
  assert.ok(execute(state, targetCmd).ok);
  if (state.pendingDamageDivision) {
    const divView = playerView(state, 'p1');
    const divCmd = bot.chooseCommand(divView, {});
    assert.equal(divCmd.type, 'resolve_damage_division', `bot decyduje o podziale: ${divCmd.type}`);
    assert.ok(execute(state, divCmd).ok);
  }
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i += 1) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  return { targetIds, before, after: enemyBattlefieldCount(state) };
}

test('F-D: oferta i widok niosą budżet podziału oraz warianty < 3 celów', () => {
  const state = stolTitan(3);
  const view = playerView(state, 'p1');
  // Widok niesie budżet podziału dla wielocelowego damage_divided.
  assert.equal(view.pendingTriggerTarget.divisionTotal, 3);
  assert.equal(view.pendingTriggerTarget.maxTargets, 3);
  // Oprócz pełnych trójek są oferty mniejszo-celowe (upTo) — inaczej podział
  // 1/1/1 byłby jedyną opcją.
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.some((c) => (c.targetIds ?? []).length <= 2),
    'oferta z ≤ 2 celami');
});

test('F-D: bot NIE rozprasza 1/1/1 — ginie przynajmniej jeden z 2-toughness', () => {
  const { targetIds, before, after } = botRozegrajInferno(stolTitan(3));
  assert.equal(before, 3);
  // Bot nie bierze max celów (trójka wymuszałaby 1/1/1 bez zabójstwa).
  assert.ok(targetIds.length <= 2, `bot wybiera ≤2 cele (nie 3): ${JSON.stringify(targetIds)}`);
  assert.ok(after < before, `pole bitwy wroga zmalało: ${before} -> ${after} (ktoś zginął)`);
});

test('F-D (siatka odporności): 3× toughness 2 — bot zawsze kogoś zabija', () => {
  for (const seed of [2, 42, 909, 5, 701]) {
    const { before, after } = botRozegrajInferno(stolTitan(3), seed);
    assert.ok(after < before, `seed ${seed}: pole bitwy wroga zmalało (${before} -> ${after})`);
  }
});
