// =============================================================================
// Zgłoszenie G, etap 2 (2026-11-05): triggery wielocelowe i podział obrażeń
// w architekturze „konstruuj + waliduj".
//
// Po co: etap 1 przeniósł walkę z enumeracji kombinacji na deskryptor +
// ziarna + walidację przy execute. Etap 2 robi to samo dla dwóch ostatnich
// enumeracji decyzyjnych silnika:
//   - `resolve_trigger_target` wielocelowy (requiresTarget.count > 1):
//     silnik enumerował WSZYSTKIE podzbiory kandydatów (po F bez limitu);
//   - `resolve_damage_division`: silnik enumerował wszystkie kompozycje
//     budżetu na cele.
// Teraz: legalCommands niesie ZIARNA (zestaw zachłanny + singletony +
// pusty przy upTo; koncentracje + podział równy), widok niesie deskryptor
// problemu (pendingTriggerTarget: kandydaci/maxTargets/upTo;
// pendingDamageDivision: cele/budżet), kontroler konstruuje własną
// kombinację, a silnik waliduje ją przy execute. Żadna legalna kombinacja
// nie jest ucięta — nie ma listy, którą można uciąć (polecenie F).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function mainState(seed = 71) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Otwarta decyzja ETB Weftblade Enhancera (do 2 celów — licznik +1/+1). */
function weftbladeDecision() {
  const state = mainState();
  for (const [id, cid, ctrl] of [
    ['a', 'highland-game', 'p1'], ['b', 'thornhide-wolves', 'p1'],
    ['c', 'colossodon-yearling', 'p1'], ['d', 'highland-game', 'p1'],
    ['e', 'thornhide-wolves', 'p1'], ['foe', 'segmented-krotiq', 'p2'],
  ]) putCard(state, id, cid, ctrl);
  putCard(state, 'w', 'weftblade-enhancer', 'p1', 'hand');
  addMana(state, 'p1', 10);
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'w');
  assert.ok(cast, 'oferta rzutu Weftblade');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingTriggerTargets.length > 0, 'decyzja celów otwarta');
  return state;
}

const targetOffers = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_trigger_target');

test('G2/1: oferty wielocelowe to ziarna (zachłanny zestaw + singletony + pusty), nie podzbiory', () => {
  const state = weftbladeDecision();
  const view = playerView(state, 'p1');
  const descriptor = view.pendingTriggerTarget;
  assert.equal(descriptor.maxTargets, 2, 'deskryptor: limit slotów');
  assert.equal(descriptor.upTo, true, 'deskryptor: flaga upTo');
  assert.equal(descriptor.candidateIds.length, 7, 'deskryptor: 6 stworów + sam Weftblade');
  const offers = targetOffers(state);
  const pairs = offers.filter((c) => c.targetIds.length === 2);
  const singles = offers.filter((c) => c.targetIds.length === 1);
  const empty = offers.filter((c) => c.targetIds.length === 0);
  assert.equal(pairs.length, 1, 'jedno ziarno pełnego zestawu');
  assert.deepEqual([...pairs[0].targetIds], descriptor.candidateIds.slice(0, 2),
    'ziarno = najwcześniejsi kandydaci (konwencja pierwszej oferty)');
  assert.equal(singles.length, 7, 'singleton na każdego kandydata');
  assert.equal(empty.length, 1, 'pusty zestaw przy upTo');
  assert.equal(offers.length, 9, 'liczba ofert wielomianowa, nie C(7,2)+7+1=29');
  for (const offer of offers) {
    assert.ok(offer.targetIds.every((id) => descriptor.candidateIds.includes(id)),
      'każde ziarno zbudowane z legalnych kandydatów');
    assert.ok(offer.targetIds.length <= descriptor.maxTargets, 'każde ziarno w limicie slotów');
  }
});

test('G2/2: zestaw spoza ziaren przechodzi walidację i działa na KAŻDYM celu', () => {
  const state = weftbladeDecision();
  const seedKeys = new Set(targetOffers(state).map((c) => [...c.targetIds].sort().join('|')));
  assert.ok(!seedKeys.has('d|e'), 'para d+e nie jest ziarnem — konstruuje ją kontroler');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['d', 'e'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal((state.objects.get('d').counters ?? {})['+1/+1'], 1, 'licznik na d');
  assert.equal((state.objects.get('e').counters ?? {})['+1/+1'], 1, 'licznik na e');
  assert.equal((state.objects.get('a').counters ?? {})['+1/+1'] ?? 0, 0, 'bez licznika na a');
});

test('G2/3: walidacja odrzuca nadmiar slotów i kandydata spoza deskryptora', () => {
  const state = weftbladeDecision();
  const tooMany = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['a', 'b', 'c'] });
  assert.equal(tooMany.ok, false, '3 cele przy maxTargets=2 odrzucone');
  const alien = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['a', 'nie-ma'] });
  assert.equal(alien.ok, false, 'kandydat spoza puli odrzucony');
  assert.ok(state.pendingTriggerTargets.length > 0, 'odrzucenia nie zamykają decyzji');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: [] }).ok,
    'pusty zestaw legalny przy upTo');
});

test('G2/4: bot dokłada własny zestaw celów z deskryptora (dwa własne, nie zestaw zachłanny silnika)', () => {
  const state = mainState(72);
  for (const [id, cid, ctrl] of [
    ['small', 'highland-game', 'p1'], ['mid', 'thornhide-wolves', 'p1'],
    ['big', 'colossodon-yearling', 'p1'], ['foe', 'segmented-krotiq', 'p2'],
  ]) putCard(state, id, cid, ctrl);
  const ability = REGISTRY.get('weftblade-enhancer').abilities[0];
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: 'small', cardId: 'weftblade-enhancer',
    ability: Object.freeze(JSON.parse(JSON.stringify(ability))), candidates: [],
    allowNone: false, fixedTargetIds: [], extra: {},
  });
  const view = playerView(state, 'p1');
  assert.equal(view.pendingTriggerTarget.maxTargets, 2);
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_trigger_target');
  const ids = choice.targetIds ?? [];
  assert.equal(ids.length, 2, `bot wybiera pełny zestaw: ${JSON.stringify(choice)}`);
  assert.ok(ids.every((id) => ['small', 'mid', 'big'].includes(id)),
    `bot wzmacnia własne stwory, nie wroga: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('big'), 'największe własne ciało w zestawie bota');
});

/** Otwarta decyzja kwot po wyborze 2 celów Inferno Titana. */
function titanDivision() {
  const state = mainState(73);
  putCard(state, 'foe1', 'highland-game', 'p2');
  putCard(state, 'foe2', 'segmented-krotiq', 'p2');
  putCard(state, 'titan', 'inferno-titan', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(cast, 'oferta rzutu Tytana');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12 && !state.pendingTriggerTargets?.[0]; i += 1) {
    if (state.zones.stack.length > 0) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    else break;
  }
  assert.ok(state.pendingTriggerTargets?.[0], 'decyzja celów otwarta');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe1', 'foe2'] }).ok);
  assert.ok(state.pendingDamageDivision, 'decyzja kwot otwarta');
  return state;
}

test('G2/5: podział obrażeń — ziarna zamiast kompozycji, deskryptor niesie cele i budżet', () => {
  const state = titanDivision();
  const view = playerView(state, 'p1');
  assert.deepEqual([...view.pendingDamageDivision.targetIds], ['foe1', 'foe2']);
  assert.equal(view.pendingDamageDivision.total, 3);
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_damage_division');
  const keys = offers.map((c) => c.amounts.join(',')).sort();
  assert.deepEqual(keys, ['1,2', '2,1'],
    'ziarna: koncentracje na każdym celu (podział równy duplikuje koncentrację)');
  for (const offer of offers) {
    assert.equal(offer.amounts.reduce((a, b) => a + b, 0), 3, 'ziarno sumuje się do budżetu');
    assert.ok(offer.amounts.every((n) => n >= 1), 'ziarno: każdy cel >= 1');
  }
});

test('G2/6: podział spoza ziaren przechodzi walidację; zła suma i zero na celu odrzucone', () => {
  const state = titanDivision();
  // Ręczny pending o większym budżecie: ziarna to [4,1,1],[1,4,1],[1,1,4],[2,2,2].
  state.pendingDamageDivision = {
    playerId: 'p1', sourceId: 'titan', cardId: 'inferno-titan',
    targetIds: ['foe1', 'foe2', 'titan'],
    targetCardIds: ['highland-game', 'segmented-krotiq', 'inferno-titan'],
    targetNames: ['foe1', 'foe2', 'titan'], total: 6, restorePriorityTo: 'p1',
  };
  const bad = execute(state, { type: 'resolve_damage_division', playerId: 'p1', amounts: [3, 2, 0] });
  assert.equal(bad.ok, false, 'kwota 0 na celu odrzucona');
  const badSum = execute(state, { type: 'resolve_damage_division', playerId: 'p1', amounts: [2, 2, 1] });
  assert.equal(badSum.ok, false, 'suma != budżet odrzucona');
  const ok = execute(state, { type: 'resolve_damage_division', playerId: 'p1', amounts: [3, 2, 1] });
  assert.ok(ok.ok, 'podział [3,2,1] spoza ziaren przyjęty — konstruuj + waliduj');
  assert.equal(state.pendingDamageDivision, null, 'decyzja zamknięta');
});
