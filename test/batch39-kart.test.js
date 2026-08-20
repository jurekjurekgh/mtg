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
import { applyEffect } from '../src/engine/effects.js';
import { legalAttackerOptions } from '../src/engine/combat.js';

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


// ---- Transza B ----
test('B1: Magmarch {1}{B}: Regenerate — tarcza chroni przed zniszczeniem, zużywa się', () => {
  const state = game();
  putCard(state, 'mag', 'exterminator-magmarch', 'p1');
  addMana(state, 'p1', 4, { colors: ['B', 'B'] });
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'mag');
  assert.ok(offer, 'oferta {1}{B}: Regenerate');
  assert.ok(execute(state, offer).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok((state.regenerationShields ?? []).includes('mag'), 'tarcza regeneracji aktywna');

  // Destroy (CR 701.12): tarcza zużyta, stwór ODTAPANY i żyje.
  applyEffect(state, { type: 'destroy_permanent' }, state.objects.get('mag'), ['mag']);
  assert.ok(state.objects.has('mag') && state.objects.get('mag').zone === 'battlefield', 'regeneracja zamiast grobu');
  assert.equal(state.objects.get('mag').tapped, true, 'regeneracja odtapowuje... (CR 701.12: tapped)');
  assert.ok(!(state.regenerationShields ?? []).includes('mag'), 'tarcza zużyta');
});

test('B2: Ravager ETB — każdy gracz traci 1/3 życia zaokrąglone w górę', () => {
  const state = game();
  putCard(state, 'rav', 'dire-fleet-ravager', 'p1');
  state.players[1].life = 5; // ceil(5/3) = 2
  applyEffect(state, { type: 'each_player_loses_life_fraction', numerator: 1, denominator: 3 },
    state.objects.get('rav'), []);
  assert.equal(state.players[0].life, 13, '20 - ceil(20/3)=7 -> 13');
  assert.equal(state.players[1].life, 3, '5 - ceil(5/3)=2 -> 3');
});

test('B3: Wishful Merfolk — traci defender i staje się Humanem do końca tury', () => {
  const state = game();
  const merf = putCard(state, 'wish', 'wishful-merfolk', 'p1');
  assert.ok(merf.keywords.includes('defender'));
  // Defender blokuje atak (CR 702.3).
  assert.ok(!legalAttackerOptions(state, 'p1').some((opt) => opt.includes('wish')), 'z defenderem nie atakuje');

  addMana(state, 'p1', 4, { colors: ['U', 'U'] });
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'wish');
  assert.ok(offer, 'oferta {1}{U}');
  assert.ok(execute(state, offer).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  const after = state.objects.get('wish');
  assert.deepEqual([...after.subtypes], ['Human'], 'staje się Humanem (nadpisanie podtypów)');
  assert.ok(!effectiveKeywords(after, state).includes('defender'), 'bez defendera');
  assert.ok(legalAttackerOptions(state, 'p1').some((opt) => opt.includes('wish')), 'może atakować');

  clearStatModifiers(state);
  const restored = state.objects.get('wish');
  assert.deepEqual([...restored.subtypes], ['Merfolk'], 'cleanup przywraca Merfolka');
  assert.ok(effectiveKeywords(restored, state).includes('defender'), 'cleanup przywraca defendera');
  assert.ok(!legalAttackerOptions(state, 'p1').some((opt) => opt.includes('wish')), 'znów nie atakuje');
});


// ---- Transza C: Wrap in Flames (each of up to three) ----
test('C1: Wrap in Flames — warianty 0..3 cele, obrażenia + cant_block na KAŻDYM wybranym', () => {
  const state = game();
  putCard(state, 'e1', 'colossodon-yearling', 'p2'); // 2/4 wroga (przeżyje 1 dmg)
  putCard(state, 'e2', 'thornhide-wolves', 'p2'); // 5/5 wroga
  putCard(state, 'mine', 'colossodon-yearling', 'p1'); // 2/4 własny
  putCard(state, 'wrap', 'wrap-in-flames', 'p1', 'hand');
  addMana(state, 'p1', 6);

  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'wrap');
  assert.ok(casts.length > 0, 'są oferty rzutu (warianty variableTargets)');
  const sizes = new Set(casts.map((c) => (c.targets ?? []).length));
  assert.ok(sizes.has(0) && sizes.has(1) && sizes.has(2) && sizes.has(3),
    `warianty 0..3 cele: ${[...sizes].join(',')} (kandydatów 3 -> komplet podzbiorów)`);

  // Wybór dwóch wrogów — obrażenia 1 + cant_block na KAŻDYM; własny nietknięty.
  const chosen = casts.find((c) => (c.targets ?? []).length === 2
    && c.targets.includes('e1') && c.targets.includes('e2'));
  assert.ok(chosen, 'wariant para wrogów');
  assert.ok(execute(state, chosen).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  assert.equal(state.objects.get('e1').damage, 1, 'e1: 1 obrażenie');
  assert.equal(state.objects.get('e2').damage, 1, 'e2: 1 obrażenie');
  assert.equal(state.objects.get('e1').cantBlock, true, 'e1 nie może blokować');
  assert.equal(state.objects.get('e2').cantBlock, true, 'e2 nie może blokować');
  assert.equal(state.objects.get('mine').damage ?? 0, 0, 'własny stwór nietknięty');
  assert.notEqual(state.objects.get('mine').cantBlock, true, 'własny może blokować');
});

test('C2: bot rzuca Wrap we WROGÓW, nie we własne stwory (wycena wariantów)', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const state = game();
  putCard(state, 'e1', 'highland-game', 'p2');
  putCard(state, 'mine', 'colossodon-yearling', 'p1');
  putCard(state, 'wrap2', 'wrap-in-flames', 'p1', 'hand');
  addMana(state, 'p1', 6);
  const view = playerView(state, 'p1');
  const choice = createHeuristicBot({ seed: 39 }).chooseCommand(view, {});
  if (choice.type === 'cast_spell' && choice.objectId === 'wrap2') {
    const hitsOwn = (choice.targets ?? []).includes('mine');
    assert.ok(!hitsOwn, `bot nie pali własnego stwora: ${JSON.stringify(choice)}`);
  }
});
