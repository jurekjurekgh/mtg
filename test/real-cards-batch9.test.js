import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Batch 9 realnych kart (ADR 0010):
 * - Kor Cartographer (CMR): ETB — wyszukaj Plains i połóż tapped;
 * - Scorpion Sentinel (FIN): statyczne +3/+0 przy co najmniej 7 landach;
 * - Dunland Crebain (LTR): flying + ETB amass Orcs 2;
 * - Dragonbroods' Relic (TDM): tap stwora → mana oraz sorcery-speed
 *   sacrifice → Reliquary Dragon z triggerem 3 damage;
 * - Secluded Steppe (DDO): ETB tapped, mana land i zwykły cycling draw.
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Przy pustym stosie nic nie robi; zatrzymuje się na decyzji blokującej.
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}



function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, { tapped = false, summoningSickness = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    morph: data.morph ?? null, types: def.types ?? [],
    entersTapped: data.entersTapped ?? false, entersWithCounters: data.entersWithCounters ?? null,
    bestow: data.bestow ?? null, aura: data.aura ?? null, equipment: data.equipment ?? null,
    backup: data.backup ?? null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addBasicLand(state, id, cardId = 'basic-plains', controllerId = 'p1', zone = 'battlefield', options = {}) {
  return addRealCard(state, id, cardId, controllerId, zone, options);
}

function addLibraryCard(state, id, cardId = 'basic-plains', controllerId = 'p1') {
  return addRealCard(state, id, cardId, controllerId, 'library');
}

function addSimpleCreature(state, id, controllerId = 'p1', zone = 'battlefield') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone,
    kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function castPermanent(state, id, mana) {
  if (mana) addMana(state, 'p1', mana);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: id });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  // T1: czar idzie na stos — wejście i ETB po rundzie passów.
  resolveStack(state);
  return result;
}

// --- Materializacja ---------------------------------------------------------

test('Batch 9: pięć kart ma właściwe dane, mechaniki i status supported', () => {
  const expected = [
    ['kor-cartographer', 2, 2, 4],
    ['scorpion-sentinel', 1, 4, 2],
    ['dunland-crebain', 1, 1, 3],
    ['dragonbroods-relic', null, null, 2],
    ['secluded-steppe', null, null, 0],
  ];
  for (const [id, power, toughness, manaCost] of expected) {
    const card = REGISTRY.get(id);
    assert.ok(card, `${id} istnieje w registry`);
    assert.equal(card.support.status, 'supported');
    assert.equal(card.power, power);
    assert.equal(card.toughness, toughness);
    assert.equal(card.manaCost, manaCost);
    assert.ok(card.oracleText, `${id} ma Oracle text`);
    assert.ok(card.imageUri, `${id} ma imageUri`);
  }
  assert.ok(REGISTRY.get('token_orc_army').support.status === 'limited');
  assert.ok(REGISTRY.get('token_reliquary_dragon').support.status === 'limited');
});

// --- Kor Cartographer -------------------------------------------------------

test('Kor Cartographer ETB: wyszukuje Plains, kładzie ją tapped i tasuje', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'plains-in-library', 'basic-plains');
  addLibraryCard(state, 'other-card', 'basic-island');
  addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');

  const result = castPermanent(state, 'cartographer', 4);
  // Temat 6: „you may search" — wybór karty należy do gracza.
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'plains-in-library' });
  assert.ok(pick.ok, pick.events[0]?.reason);
  const fetched = [...state.objects.values()].find((object) => object.cardId === 'basic-plains' && object.zone === 'battlefield');
  assert.ok(fetched, 'Plains trafia na pole bitwy');
  assert.equal(fetched.tapped, true, 'wyszukany land wchodzi tapped');
  assert.ok(pick.events.some((event) => event.type === 'library_searched' && event.foundCardId === 'basic-plains'));
  assert.ok(pick.events.some((event) => event.type === 'permanent_entered_battlefield' && event.searched));
  assert.equal(state.zones.library.some((id) => id === 'plains-in-library'), false, 'Plains opuszcza bibliotekę');
});

test('Kor Cartographer: brak Plains jest legalnym fail-to-find, ale trigger nadal się rozstrzyga', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'other-card', 'basic-island');
  addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');
  const result = castPermanent(state, 'cartographer', 4);
  // T1: ETB (fail-to-find) rozstrzyga się po rundzie passów — state.events.
  const searched = state.events.find((event) => event.type === 'library_searched');
  assert.ok(searched);
  assert.equal(searched.foundCardId, null);
  assert.equal(state.zones.library.length, 1);
  assert.equal(state.status, 'active');
});

test('Kor Cartographer NIELEGALNE: brak many nie mutuje ręki ani biblioteki', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'plains-in-library', 'basic-plains');
  addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cartographer' });
  resolveStack(state);

  assert.equal(result.ok, false);
  assert.equal(state.zones.hand.includes('cartographer'), true);
  assert.equal(state.zones.library.includes('plains-in-library'), true);
});

// --- Scorpion Sentinel ------------------------------------------------------

test('Scorpion Sentinel: statyczne +3/+0 włącza się od siódmego landa', () => {
  const state = mainPhase(game());
  const sentinel = addRealCard(state, 'sentinel', 'scorpion-sentinel', 'p1', 'battlefield');
  for (let i = 0; i < 6; i += 1) addBasicLand(state, `land-${i}`);
  assert.equal(effectivePower(sentinel, state), 1, 'sześć landów nie wystarcza');
  assert.equal(effectiveToughness(sentinel, state), 4);
  addBasicLand(state, 'land-6');
  assert.equal(effectivePower(state.objects.get('sentinel'), state), 4, 'siódmy land daje +3/+0');
  assert.equal(effectiveToughness(state.objects.get('sentinel'), state), 4);
  assert.equal(playerView(state, 'p1').zones.battlefield.find((object) => object.id === 'sentinel').power, 4);
});

test('Scorpion Sentinel: zejście poniżej siedmiu landów usuwa buff ciągły', () => {
  const state = mainPhase(game());
  addRealCard(state, 'sentinel', 'scorpion-sentinel', 'p1', 'battlefield');
  for (let i = 0; i < 7; i += 1) addBasicLand(state, `land-${i}`);
  assert.equal(effectivePower(state.objects.get('sentinel'), state), 4);
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'land-6');
  state.objects.delete('land-6');
  assert.equal(effectivePower(state.objects.get('sentinel'), state), 1);
});

// --- Dunland Crebain / amass -----------------------------------------------

test('Dunland Crebain ETB: tworzy Army 0/0 i kładzie dwa liczniki +1/+1', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crebain', 'dunland-crebain', 'p1', 'hand');
  const result = castPermanent(state, 'crebain', 3);
  const army = [...state.objects.values()].find((object) => object.cardId === 'token_orc_army');
  assert.ok(army, 'amass tworzy token Army');
  assert.deepEqual(army.subtypes, ['Orc', 'Army']);
  assert.equal(army.counters['+1/+1'], 2);
  assert.equal(effectivePower(army, state), 2);
  assert.equal(effectiveToughness(army, state), 2);
  // T1: ETB rozstrzyga się po rundzie passów — zdarzenie w state.events.
  assert.ok(state.events.some((event) => event.type === 'counter_added' && event.objectId === army.id));
});

test('Dunland Crebain: kolejny amass wzmacnia istniejącą Army zamiast tworzyć drugą', () => {
  const state = mainPhase(game());
  addRealCard(state, 'first', 'dunland-crebain', 'p1', 'hand');
  addRealCard(state, 'second', 'dunland-crebain', 'p1', 'hand');
  castPermanent(state, 'first', 3);
  addMana(state, 'p1', 3);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'second' });
  resolveStack(state);

  assert.ok(result.ok);
  const armies = [...state.objects.values()].filter((object) => object.cardId === 'token_orc_army');
  assert.equal(armies.length, 1);
  assert.equal(armies[0].counters['+1/+1'], 4);
});

test('Dunland Crebain NIELEGALNE: brak many nie tworzy Army', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crebain', 'dunland-crebain', 'p1', 'hand');
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'crebain' });
  resolveStack(state);

  assert.equal(result.ok, false);
  assert.equal([...state.objects.values()].some((object) => object.cardId === 'token_orc_army'), false);
});

// --- Dragonbroods' Relic ----------------------------------------------------

test('Dragonbroods\' Relic: tapuje źródło i stwora, po czym dodaje manę', () => {
  const state = mainPhase(game());
  addRealCard(state, 'relic', 'dragonbroods-relic', 'p1', 'battlefield');
  addSimpleCreature(state, 'creature');
  const beforeMana = state.players[0].mana;
  const command = playerView(state, 'p1').legalCommands.find((entry) => entry.type === 'activate_ability' && entry.objectId === 'relic' && entry.abilityIndex === 0);
  assert.ok(command, 'zdolność tap + tap creature jest legalna');
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.equal(state.objects.get('relic').tapped, true);
  assert.equal(state.objects.get('creature').tapped, true);
  assert.equal(state.players[0].mana, beforeMana + 1);
});

test('Dragonbroods\' Relic NIELEGALNE: brak stwora nie zostawia relic tapped', () => {
  const state = mainPhase(game());
  addRealCard(state, 'relic', 'dragonbroods-relic', 'p1', 'battlefield');
  addMana(state, 'p1', 0);
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'relic', abilityIndex: 0 });
  assert.equal(result.ok, false);
  assert.equal(state.objects.get('relic').tapped, false, 'atomowy koszt nie mutuje źródła');
});

test('Dragonbroods\' Relic: sorcery ability poświęca artefakt i tworzy Dragon z ETB damage', () => {
  const state = mainPhase(game());
  addRealCard(state, 'relic', 'dragonbroods-relic', 'p1', 'battlefield');
  addMana(state, 'p1', 8);
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'relic', abilityIndex: 1 });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  resolveStack(state); // D: zdolność na stosie → Dragon powstaje, ETB cel czeka
  // Temat 2: ETB Smoka „any target" — kontroler wybiera przeciwnika.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' }).ok);
  resolveStack(state); // T6: trigger ETB Smoka ze stosu
  const relicInGrave = [...state.objects.values()].find((object) => object.cardId === 'dragonbroods-relic' && object.zone === 'graveyard');
  assert.ok(relicInGrave, 'Relic trafia do grobu po koszcie sacrifice');
  const dragon = [...state.objects.values()].find((object) => object.cardId === 'token_reliquary_dragon');
  assert.ok(dragon);
  assert.equal(effectivePower(dragon, state), 4);
  assert.equal(effectiveToughness(dragon, state), 4);
  assert.deepEqual(effectiveKeywords(dragon, state).sort(), ['flying', 'lifelink']);
  assert.ok(state.events.some((event) => event.type === 'damage_dealt' && event.target === 'p2' && event.amount === 3));
  assert.equal(state.players.find((player) => player.id === 'p2').life, 17);
});

test('Dragonbroods\' Relic NIELEGALNE: sacrifice ability nie działa poza sorcery timingiem', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  addRealCard(state, 'relic', 'dragonbroods-relic', 'p1', 'battlefield');
  addMana(state, 'p1', 8);
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'relic', abilityIndex: 1 });
  assert.equal(result.ok, false);
  assert.equal(state.objects.get('relic').zone, 'battlefield');
});

// --- Secluded Steppe --------------------------------------------------------

test('Secluded Steppe: land wchodzi tapped i po odkręceniu produkuje manę', () => {
  const state = mainPhase(game());
  addRealCard(state, 'steppe', 'secluded-steppe', 'p1', 'hand');
  assert.ok(execute(state, { type: 'play_land', playerId: 'p1', objectId: 'steppe' }).ok);
  const landId = state.zones.battlefield.find((id) => state.objects.get(id).cardId === 'secluded-steppe');
  assert.equal(state.objects.get(landId).tapped, true);
  assert.equal(playerView(state, 'p1').legalCommands.some((command) => command.type === 'tap_for_mana' && command.objectId === landId), false);
  state.objects.set(landId, Object.freeze({ ...state.objects.get(landId), tapped: false }));
  assert.ok(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: landId }).ok);
  assert.equal(state.players[0].mana, 1);
});

test('Secluded Steppe: cycling odrzuca Steppe i dobiera kartę', () => {
  const state = mainPhase(game());
  addRealCard(state, 'steppe', 'secluded-steppe', 'p1', 'hand');
  addLibraryCard(state, 'draw-me', 'basic-plains');
  addMana(state, 'p1', 1);
  const command = playerView(state, 'p1').legalCommands.find((entry) => entry.type === 'activate_ability' && entry.objectId === 'steppe');
  assert.ok(command, 'cycling z ręki jest legalny');
  const result = execute(state, command);
  assert.ok(result.ok);
  assert.ok([...state.objects.values()].some((object) => object.cardId === 'secluded-steppe' && object.zone === 'graveyard'));
  // B7.2: cycling to zdolność na stosie — dobranie po rozstrzygnięciu.
  resolveStack(state);
  assert.equal(state.zones.hand.some((id) => state.objects.get(id).cardId === 'basic-plains'), true);
  assert.ok(state.events.some((event) => event.type === 'card_drawn'));
  assert.equal(state.events.some((event) => event.type === 'library_searched'), false, 'zwykły cycling nie jest typecyclingiem');
});

test('Secluded Steppe NIELEGALNE: cycling na polu bitwy nie jest oferowany, brak many nie odrzuca karty', () => {
  const state = mainPhase(game());
  // Steppe na polu bitwy ZATAPNIĘTA — inaczej auto-tap przy płatności pokryłby
  // koszt cyclingu z ręki i założenie „brak many" przestałoby istnieć.
  addRealCard(state, 'steppe', 'secluded-steppe', 'p1', 'battlefield', { tapped: true });
  assert.equal(playerView(state, 'p1').legalCommands.some((command) => command.objectId === 'steppe' && command.type === 'activate_ability'), false);
  addRealCard(state, 'steppe-hand', 'secluded-steppe', 'p1', 'hand');
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'steppe-hand', abilityIndex: 0 });
  assert.equal(result.ok, false);
  assert.equal(state.objects.get('steppe-hand').zone, 'hand');
});

// --- Interakcje, determinizm i talia ----------------------------------------

test('interakcja: Kor Cartographer może znaleźć Plains z black, a Scorpion liczy land creature jako land', () => {
  const state = mainPhase(game());
  addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');
  addLibraryCard(state, 'plains', 'basic-plains');
  addRealCard(state, 'sentinel', 'scorpion-sentinel', 'p1', 'battlefield');
  for (let i = 0; i < 6; i += 1) addBasicLand(state, `land-${i}`);
  assert.equal(effectivePower(state.objects.get('sentinel'), state), 1);
  castPermanent(state, 'cartographer', 4);
  // Temat 6: wybór karty z biblioteki.
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  assert.ok(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'plains' }).ok);
  assert.equal(effectivePower(state.objects.get('sentinel'), state), 4, 'siódmy land znaleziony przez ETB włącza static ability');
});

test('determinizm Batch 9: search, amass i cycling dają identyczny fingerprint', () => {
  const run = () => {
    const state = mainPhase(game());
    addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');
    addLibraryCard(state, 'plains', 'basic-plains');
    addRealCard(state, 'crebain', 'dunland-crebain', 'p1', 'hand');
    addRealCard(state, 'steppe', 'secluded-steppe', 'p1', 'hand');
    addLibraryCard(state, 'draw-me', 'basic-island');
    addMana(state, 'p1', 4);
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cartographer' });
  resolveStack(state);

    // Temat 6: decyzja szukania (bierzemy plains — jak dawny determinizm).
    assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
    execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'plains' });
    addMana(state, 'p1', 3);
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'crebain' });
  resolveStack(state);

    addMana(state, 'p1', 1);
    const cycling = playerView(state, 'p1').legalCommands.find((command) => command.objectId === 'steppe');
    execute(state, cycling);
    return stateFingerprint(state);
  };
  assert.equal(run(), run());
});

