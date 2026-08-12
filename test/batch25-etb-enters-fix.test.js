import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

// =============================================================================
// Batch 25 — fix ETB „enters"→„enter_battlefield" + entersTapped
// (uwaga właściciela C, 2026-08-10; sonda poszerzona o cały batch).
// 1) idyllic-grange: entersTappedCondition bez entersTapped → land wchodził
//    nietapnięty; requiresTarget poza triggerem (dropowane) i event 'enters'
//    (nigdy nie obsługiwany) → trigger countera martwy.
// 2) fertile-thicket / springbloom-druid: ten sam event 'enters' → ETB martwe.
// Testy BEHAWIORALNE (nie asercje definicji — lekcja M54/M55/M65).
// =============================================================================

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
    entersTapped: data.entersTapped ?? false, entersTappedCondition: data.entersTappedCondition ?? null,
  });
}


function addPlains(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-plains', controllerId, zone: 'battlefield',
    kind: 'land', power: null, toughness: null, manaCost: 0, abilities: [],
    keywords: [], subtypes: ['Plains'], types: ['Land'], colors: ['W'],
  });
}

function giveMana(state, playerId, amount, colors = {}) {
  const player = state.players.find((pl) => pl.id === playerId);
  player.mana = amount;
  player.manaPool = { ...(player.manaPool ?? {}), ...colors };
}

function addCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], summoningSickness: false,
  });
}

function byCard(state, cardId, zone) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
}

function passRounds(state, rounds = 6) {
  for (let g = 0; g < rounds; g += 1) {
    let passes = state.turn.passes;
    let guard = 0;
    while (passes < 2 && guard < 20) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) return r;
      passes = state.turn.passes;
      guard += 1;
      if (passes === 0) break;
    }
    if (state.zones.stack.length === 0) break;
  }
  return null;
}

test('Idyllic Grange: mniej niż 3 INNE Plains → wchodzi TAPPED, trigger countera nie odpala', () => {
  const state = newState();
  addPlains(state, 'pl1', 'p1');
  addPlains(state, 'pl2', 'p1');
  addCardFromRegistry(state, 'grange', 'idyllic-grange', 'p1', 'hand');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'grange' });
  assert.ok(r.ok, 'land drop: ' + (r.events?.[0]?.reason ?? ''));
  const grange = byCard(state, 'idyllic-grange', 'battlefield');
  assert.ok(grange, 'grange na bitwisku');
  assert.equal(grange.tapped, true, 'wchodzi tapped przy 2 innych Plains (bug C)');
  passRounds(state, 2);
  assert.equal(state.pendingTriggerTargets.length, 0, 'brak decyzji celu countera');
  assert.equal(state.zones.stack.length, 0, 'brak triggera na stosie');
});

test('Idyllic Grange: 3 INNE Plains → wchodzi UNTAPPED, ETB counter na wskazanym stworze', () => {
  const state = newState();
  addPlains(state, 'pl1', 'p1');
  addPlains(state, 'pl2', 'p1');
  addPlains(state, 'pl3', 'p1');
  addCreature(state, 'bear', 'p1', 2, 2);
  addCardFromRegistry(state, 'grange', 'idyllic-grange', 'p1', 'hand');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'grange' });
  assert.ok(r.ok, 'land drop: ' + (r.events?.[0]?.reason ?? ''));
  const grange = byCard(state, 'idyllic-grange', 'battlefield');
  assert.equal(grange.tapped, false, 'wchodzi untapped przy 3 innych Plains');
  assert.ok(state.pendingTriggerTargets.length >= 1, 'ETB trigger czeka na cel');
  const pending = state.pendingTriggerTargets[0];
  const rr = execute(state, { type: 'resolve_trigger_target', playerId: pending.playerId, targetId: 'bear' });
  assert.ok(rr.ok, 'cel wybrany: ' + (rr.events?.[0]?.reason ?? ''));
  passRounds(state, 3);
  const bear = state.objects.get('bear');
  assert.equal((bear.counters ?? {})['+1/+1'] ?? 0, 1, 'counter +1/+1 na wybranym stworze');
});

test('Idyllic Grange: sama grange (Plains) NIE liczy się jako „other Plains"', () => {
  // Gracz ma 2 Plains + wchodzącą Grange = 3 Plains łącznie ze wchodzącym —
  // „three or more OTHER Plains" wyklucza wchodzący land → tapped.
  const state = newState();
  addPlains(state, 'pl1', 'p1');
  addPlains(state, 'pl2', 'p1');
  addCardFromRegistry(state, 'grange', 'idyllic-grange', 'p1', 'hand');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'grange' });
  assert.ok(r.ok);
  const grange = byCard(state, 'idyllic-grange', 'battlefield');
  assert.equal(grange.tapped, true, 'wchodzący Grange się nie liczy (other) — tapped');
});

test('strażnik: każda karta registry z entersTappedCondition ma entersTapped: true', () => {
  const registry = REGISTRY;
  const bad = [];
  for (const card of registry.all ? registry.all() : []) {
    if (card.entersTappedCondition && card.entersTapped !== true) bad.push(card.id);
  }
  assert.deepEqual(bad, [], `karty z entersTappedCondition bez entersTapped: ${bad.join(', ')}`);
});

test('Fertile Thicket: ETB odpala się — pendingFertileThicket po rozstrzygnięciu triggera', () => {
  const state = newState();
  // biblioteka z basic landem na wierzchu, żeby był realny wybór
  addCardFromRegistry(state, 'lib1', 'goldmeadow-nomad', 'p1', 'library');
  addCardFromRegistry(state, 'thicket', 'fertile-thicket', 'p1', 'hand');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'thicket' });
  assert.ok(r.ok, 'land drop: ' + (r.events?.[0]?.reason ?? ''));
  const thicket = byCard(state, 'fertile-thicket', 'battlefield');
  assert.equal(thicket.tapped, true, 'Fertile Thicket zawsze wchodzi tapped');
  assert.ok(state.zones.stack.length >= 1, 'trigger ETB na stosie (fix enters→enter_battlefield)');
  passRounds(state, 2);
  assert.ok(state.pendingFertileThicket, 'pendingFertileThicket ustawione (you may look)');
  assert.equal(state.pendingFertileThicket.allowSkip, true, 'you may = można zrezygnować');
  const skip = execute(state, { type: 'resolve_fertile_thicket', playerId: 'p1', skip: true });
  assert.ok(skip.ok, 'rezygnacja dozwolona: ' + (skip.events?.[0]?.reason ?? ''));
  assert.equal(state.pendingFertileThicket, null, 'pending zamknięte po decyzji');
});

test('Springbloom Druid: ETB odpala się — pendingSpringbloom (you may sacrifice) po rozstrzygnięciu', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addPlains(state, 'pl1', 'p1');
  addCardFromRegistry(state, 'druid', 'springbloom-druid', 'p1', 'hand');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'druid' });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(state, 2); // czar na stosie → wejście → ETB trigger na stosie
  passRounds(state, 2); // trigger rozstrzygnięty → decyzja
  assert.ok(state.pendingSpringbloom, 'pendingSpringbloom ustawione (fix enters→enter_battlefield)');
  assert.equal(state.pendingSpringbloom.controllerId, 'p1');
  const skip = execute(state, { type: 'resolve_springbloom', playerId: 'p1', skip: true });
  assert.ok(skip.ok, 'rezygnacja dozwolona: ' + (skip.events?.[0]?.reason ?? ''));
  assert.equal(state.pendingSpringbloom, null, 'pending zamknięte');
});

test('Fertile Thicket: ogląda wierzch WŁASNEJ biblioteki — karty przeciwnika pomijane (CR 401.4)', () => {
  const state = newState();
  // Wspólna przeplatana biblioteka — karta PRZECIWNIKA na samym wierzchu listy.
  addCardFromRegistry(state, 'p2top', 'goldmeadow-nomad', 'p2', 'library');
  addCardFromRegistry(state, 'fa', 'basic-forest', 'p1', 'library');
  addCardFromRegistry(state, 'p2mid', 'goldmeadow-nomad', 'p2', 'library');
  addCardFromRegistry(state, 'fb', 'goldmeadow-nomad', 'p1', 'library');
  addCardFromRegistry(state, 'fc', 'basic-plains', 'p1', 'library');
  state.zones.library = ['p2top', 'fa', 'p2mid', 'fb', 'fc'];
  addCardFromRegistry(state, 'thicket', 'fertile-thicket', 'p1', 'hand');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'thicket' });
  assert.ok(r.ok, 'land drop: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(state, 2);
  assert.ok(state.pendingFertileThicket, 'pendingFertileThicket ustawione');
  assert.deepEqual(state.pendingFertileThicket.topCardIds, ['fa', 'fb', 'fc'],
    'tylko własne karty z wierzchu (karta p2 pominięta, CR 401.4)');
  assert.deepEqual(state.pendingFertileThicket.basicLandIds, ['fa', 'fc'],
    'do wyboru forest i plains (nomad nie jest Basic Land)');
  // Gracz wybiera plains na wierzch; reszta (domyślna kolejność oglądania) na spód.
  const rr = execute(state, { type: 'resolve_fertile_thicket', playerId: 'p1', chosenCardId: 'fc' });
  assert.ok(rr.ok, 'resolve: ' + (rr.events?.[0]?.reason ?? ''));
  assert.equal(state.pendingFertileThicket, null, 'pending zamknięte');
  assert.deepEqual(state.zones.library, ['fc', 'p2top', 'p2mid', 'fa', 'fb'],
    'wybrany na wierzch, karty p2 w niezmienionym przeplocie, reszta na spód');
});

test('Springbloom Druid: sacrifice → gracz wybiera DWA basic landy → oba TAPPED na bitwisku', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addPlains(state, 'pl1', 'p1');
  addCardFromRegistry(state, 'lf1', 'basic-forest', 'p1', 'library');
  addCardFromRegistry(state, 'lf2', 'basic-plains', 'p1', 'library');
  addCardFromRegistry(state, 'ln', 'goldmeadow-nomad', 'p1', 'library');
  addCardFromRegistry(state, 'druid', 'springbloom-druid', 'p1', 'hand');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'druid' });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(state, 2); // rozstrzygnięcie czaru → wejście → ETB trigger na stos
  passRounds(state, 2); // trigger rozstrzygnięty → decyzja o poświęceniu
  assert.ok(state.pendingSpringbloom, 'pendingSpringbloom ustawione');
  const sac = execute(state, { type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'pl1' });
  assert.ok(sac.ok, 'poświęcenie: ' + (sac.events?.[0]?.reason ?? ''));
  assert.ok(!state.objects.get('pl1') || state.objects.get('pl1').zone !== 'battlefield',
    'pl1 odszedł z bitwiska');
  assert.ok(byCard(state, 'basic-plains', 'graveyard'), 'poświęcony land trafił do grobu (nowy obiekt strefy)');
  // Decyzja nr 1: wybieram forest → wchodzi TAPPED, „up to two" otwiera decyzję nr 2.
  assert.ok(state.pendingSearchChoice, 'pierwsza decyzja szukania');
  const s1 = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lf1' });
  assert.ok(s1.ok, '1. wybór: ' + (s1.events?.[0]?.reason ?? ''));
  const forest = byCard(state, 'basic-forest', 'battlefield');
  assert.ok(forest, 'forest na bitwisku');
  assert.equal(forest.tapped, true, 'forest wchodzi tapped');
  assert.ok(state.pendingSearchChoice, '„up to two" → druga decyzja szukania');
  // Decyzja nr 2: wybieram plains → też tapped.
  const s2 = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lf2' });
  assert.ok(s2.ok, '2. wybór: ' + (s2.events?.[0]?.reason ?? ''));
  const plains = byCard(state, 'basic-plains', 'battlefield');
  assert.ok(plains && plains.tapped === true, 'plains też tapped na bitwisku');
  assert.equal(state.pendingSearchChoice, null, 'łańcuch domknięty po 2 znalezieniach');
});

test('Springbloom Druid: „up to two" — rezygnacja na drugim kroku kończy szukanie (1 land)', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addPlains(state, 'pl1', 'p1');
  addCardFromRegistry(state, 'lf1', 'basic-forest', 'p1', 'library');
  addCardFromRegistry(state, 'lf2', 'basic-plains', 'p1', 'library');
  addCardFromRegistry(state, 'druid', 'springbloom-druid', 'p1', 'hand');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'druid' });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(state, 2);
  passRounds(state, 2);
  assert.ok(state.pendingSpringbloom, 'pendingSpringbloom ustawione');
  const sac = execute(state, { type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'pl1' });
  assert.ok(sac.ok, 'poświęcenie: ' + (sac.events?.[0]?.reason ?? ''));
  assert.ok(state.pendingSearchChoice, 'pierwsza decyzja szukania');
  const s1 = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lf1' });
  assert.ok(s1.ok, '1. wybór: ' + (s1.events?.[0]?.reason ?? ''));
  assert.ok(state.pendingSearchChoice, 'druga decyzja nadal dostępna (lf2 w bibliotece)');
  const s2 = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: null });
  assert.ok(s2.ok, 'rezygnacja dozwolna (up to two)');
  assert.equal(state.pendingSearchChoice, null, 'łańcuch domknięty po rezygnacji');
  const landsOnBattlefield = [...state.objects.values()].filter((o) => o.zone === 'battlefield'
    && o.controllerId === 'p1' && (o.types ?? []).includes('Land'));
  assert.equal(landsOnBattlefield.length, 1, 'dokładnie jeden znaleziony land (lf2 odrzucony, został w bibliotece)');
});

// Wydarzenia triggerów faktycznie obsługiwane przez engine (trigger?.event
// porównania w src/engine). Nowa mechanika dopisuje swoje zdarzenie DO listy.
const HANDLED_TRIGGER_EVENTS = new Set([
  'another_creature_enters', 'any_combat_damage_to_player', 'any_creature_dies',
  'attacks', 'attacks_alone', 'aura_host_targeted_by_spell', 'bat_attacks', 'beginning_of_combat',
  'card_put_into_graveyard_from_nonbattlefield', 'combat_damage_to_player',
  'dies', 'enchanted_creature_damage_to_opponent', 'end_step', 'enter_battlefield', 'equipped_creature_attacks',
  'exploits', 'land_entered_under_opponent_control',
  'land_entered_under_your_control', 'leaves_battlefield', 'mentor_attacks',
  'noncombat_damage_to_opponent', 'other_permanent_you_control_dies',
  'permanents_you_control_leave_battlefield',
  'player_casts_spell', 'turned_face_up', 'upkeep', 'when_you_cast_spell',
  'you_cast_noncreature_spell', 'you_cast_second_spell_each_turn',
  'spell_targets_this_creature',
]);

test('strażnik: każdy trigger w registry używa zdarzenia obsługiwanego przez engine', () => {
  const bad = [];
  for (const card of REGISTRY.all()) {
    for (const ability of card.abilities ?? []) {
      const ev = ability?.trigger?.event;
      if (ev && !HANDLED_TRIGGER_EVENTS.has(ev)) bad.push(`${card.id}:${ev}`);
    }
  }
  assert.deepEqual(bad, [], `nieobsługiwane zdarzenia triggerów: ${bad.join(', ')}`);
});
