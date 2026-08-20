// Batch 39 (lista właściciela 2026-08-20) — testy NOWYCH mechanik i zachowań
// (ADR 0019: karty reuse pokrywa generycznie catalog-coverage + strażniki;
// ręczne testy dotyczą nowych mechanik i interakcji).
//
// Transza A: Breaching Hippocamp (notSelf w creature_you_control),
// Squire's Lightblade (attach_self_to_target + first strike EOT),
// Knight of the Skyward Eye (oncePerTurn — wzorzec Snarling Wolf),
// Merfolk Mesmerist ({U},{T}: mill 2 gracza-celu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower } from '../src/engine/permanents.js';
import { clearStatModifiers } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 39, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield', over = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...data, types: def.types ?? [], keywords: over.keywords ?? def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, equipment: def.equipment,
    ...over,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

test('A1: Hippocamp ETB — notSelf: sam siebie nie celuje, INNEGO własnego stwora odkręca', () => {
  const state = game();
  const other = putCard(state, 'other', 'highland-game', 'p1');
  state.objects.set('other', Object.freeze({ ...state.objects.get('other'), tapped: true }));
  const hip = putCard(state, 'hip', 'breaching-hippocamp', 'p1');

  // Ręcznie kolejka decyzji celu triggera (jak processTriggers).
  const ability = REGISTRY.get('breaching-hippocamp').abilities[0];
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: hip.id, cardId: hip.cardId,
    ability: Object.freeze(JSON.parse(JSON.stringify(ability))), candidates: [],
    allowNone: false, fixedTargetIds: [], extra: {},
  });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(offers.length, 1, 'jedyny kandydat: OTHER (hippocamp wykluczony przez notSelf)');
  assert.equal(offers[0].targetId, 'other');
  assert.ok(execute(state, offers[0]).ok);
  // Trigger na stosie (T6/CR 603.3) — rozstrzyga się po rundzie pasów.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.objects.get('other').tapped, false, 'stwór odkręcony');
});

test('A2: Hippocamp sam na polu — brak kandydatów, trigger bez decyzji i bez skutku', () => {
  const state = game();
  putCard(state, 'hip2', 'breaching-hippocamp', 'p1');
  const ability = REGISTRY.get('breaching-hippocamp').abilities[0];
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: 'hip2', cardId: 'breaching-hippocamp',
    ability: Object.freeze(JSON.parse(JSON.stringify(ability))), candidates: [],
    allowNone: false, fixedTargetIds: [], extra: {},
  });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(offers.length, 0, 'notSelf wyklucza jedyne źródło — brak ofert');
});

test('A3: Lightblade — ETB przypina sprzęt do wybranego stwora + first strike do końca tury', () => {
  const state = game();
  putCard(state, 'soldier', 'highland-game', 'p1');
  putCard(state, 'blade', 'squires-lightblade', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W', 'W'] });

  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'blade');
  assert.ok(cast, 'oferta rzutu Lightblade');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  assert.ok(state.pendingTriggerTargets.length > 0, 'decyzja celu ETB-attach');
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'soldier');
  assert.ok(offer, 'własny stwór w kandydatach');
  assert.ok(execute(state, offer).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  const bladeOnBf = [...state.objects.values()].find((o) => o.cardId === 'squires-lightblade' && o.zone === 'battlefield');
  assert.ok(bladeOnBf, 'Lightblade na polu bitwy');
  assert.equal(bladeOnBf.attachedTo, 'soldier', 'sprzęt przypięty do wybranego stwora');
  assert.ok(effectiveKeywords(state.objects.get('soldier'), state).includes('first_strike'),
    'first strike do końca tury');
  assert.equal(effectivePower(state.objects.get('soldier'), state), 3, '+1/+0 z equipmentu (2+1)');

  clearStatModifiers(state);
  assert.ok(!effectiveKeywords(state.objects.get('soldier'), state).includes('first_strike'),
    'first strike wygasa w cleanup');
  assert.equal([...state.objects.values()].find((o) => o.cardId === 'squires-lightblade' && o.zone === 'battlefield')?.attachedTo,
    'soldier', 'przypięcie zostaje');
});

test('A4: Knight — {3}{G}: +3/+3 tylko raz na turę', () => {
  const state = game();
  putCard(state, 'knight', 'knight-of-the-skyward-eye', 'p1');
  addMana(state, 'p1', 12, { colors: ['G', 'G', 'G', 'G'] });
  const view1 = playerView(state, 'p1');
  const offer1 = view1.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'knight');
  assert.ok(offer1, 'pierwsza aktywacja oferowana');
  assert.ok(execute(state, offer1).ok);
  // Zdolność idzie na stos (CR 602.2c/117.4) — rozstrzygnięcie po pasach.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(effectivePower(state.objects.get('knight'), state), 5, '2/2 + 3/3 = 5/5');
  const view2 = playerView(state, 'p1');
  assert.ok(!view2.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'knight'),
    'oncePerTurn: druga aktywacja w tej turze NIE jest oferowana');
});

test('A5: Mesmerist — {U},{T}: gracz-cel mieli 2', () => {
  const state = game();
  putCard(state, 'merf', 'merfolk-mesmerist', 'p1');
  for (const id of ['lib1', 'lib2', 'lib3']) putCard(state, id, 'highland-game', 'p2', 'library');
  addMana(state, 'p1', 4, { colors: ['U', 'U'] });
  const libBefore = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'merf' && c.targets?.[0] === 'p2');
  assert.ok(offer, 'aktywacja z celem gracz-przeciwnik');
  assert.ok(execute(state, offer).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const libAfter = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(libAfter, libBefore - 2, 'przeciwnik mieli 2 karty');
  assert.equal(state.objects.get('merf').tapped, true, 'źródło zatapowane kosztem {T}');
});
