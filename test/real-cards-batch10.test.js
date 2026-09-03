import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { clearStatModifiers, effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Batch 10 realnych kart (ADR 0010):
 * - Goblin Piker (M11): vanilla 2/1;
 * - Angel of the Dawn (M19): flying + globalny ETB pump/vigilance;
 * - Armored Skaab (ISD): ETB mill four;
 * - Tumbleweed Rising (OTJ): X/X Elemental wg największej mocy + plot;
 * - Dawntreader Elk (DKA): sacrifice + search basic land tapped.
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
    morph: data.morph ?? null, plot: data.plot ?? null, plotted: data.plotted ?? false,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addBasicLand(state, id, cardId = 'basic-forest', controllerId = 'p1', zone = 'battlefield') {
  return addRealCard(state, id, cardId, controllerId, zone);
}

function addLibraryCard(state, id, cardId = 'basic-forest', controllerId = 'p1') {
  return addRealCard(state, id, cardId, controllerId, 'library');
}

function addSimpleCreature(state, id, controllerId = 'p1', power = 2, toughness = 2) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
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

function passBoth(state, first) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Szanuje już naliczone passy (passes) — pełna runda kończy się, gdy
  // licznik wróci do 0 (rozstrzygnięcie stosu albo przejście kroku).
  // Zwraca ostatni wynik rundy (kompatybilność z testami clash).
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let last = null;
  let guard = 0;
  for (;;) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return last;
      assert.ok(r1.ok, r1.events[0]?.reason);
      last = r1;
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
    if (state.zones.stack.length === 0 || guard > 12) break;
  }
  return last;
}



// --- Dane i proste permanenty ----------------------------------------------

test('Batch 10: pięć kart ma właściwe dane i status supported', () => {
  const expected = [
    ['goblin-piker', 2, 1, 2],
    ['angel-of-the-dawn', 3, 3, 5],
    ['armored-skaab', 1, 4, 3],
    ['tumbleweed-rising', null, null, 2],
    ['dawntreader-elk', 2, 2, 2],
  ];
  for (const [id, power, toughness, manaCost] of expected) {
    const card = REGISTRY.get(id);
    assert.ok(card, `${id} istnieje w registry`);
    assert.equal(card.support.status, 'supported');
    assert.equal(card.power, power);
    assert.equal(card.toughness, toughness);
    assert.equal(card.manaCost, manaCost);
    assert.notEqual(card.oracleText, null, `${id} ma dane Oracle`);
    assert.ok(card.imageUri, `${id} ma imageUri`);
  }
  assert.equal(REGISTRY.get('tumbleweed-rising').plot.cost, 3);
  assert.equal(REGISTRY.get('token_elemental').support.status, 'limited');
});

test('Goblin Piker: materializacja vanilla 2/1 nie ma ukrytej zdolności', () => {
  const state = mainPhase(game());
  const piker = addRealCard(state, 'piker', 'goblin-piker', 'p1', 'battlefield');
  assert.deepEqual(piker.abilities, []);
  assert.equal(piker.power, 2);
  assert.equal(piker.toughness, 1);
});

// --- Angel of the Dawn ------------------------------------------------------

test('Angel of the Dawn ETB: własne stwory dostają +1/+1 i vigilance, cudze nie', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'own', 'p1', 2, 2);
  addSimpleCreature(state, 'enemy', 'p2', 2, 2);
  addRealCard(state, 'angel', 'angel-of-the-dawn', 'p1', 'hand');
  const result = castPermanent(state, 'angel', 5);
  assert.equal(effectivePower(state.objects.get('own'), state), 3);
  assert.equal(effectiveToughness(state.objects.get('own'), state), 3);
  assert.ok(effectiveKeywords(state.objects.get('own'), state).includes('vigilance'));
  assert.equal(effectivePower(state.objects.get('enemy'), state), 2);
  assert.equal(effectiveKeywords(state.objects.get('enemy'), state).includes('vigilance'), false);
  // Buff „do końca tury" jest teraz EFEKTEM CIĄGŁYM (CR 611.2c — złota
  // odznaka): czytany przy każdym odczycie statystyk, obejmuje też stwory
  // wchodzące później; brak per-obiektowego zdarzenia keyword_granted.
  clearStatModifiers(state);
  assert.equal(effectivePower(state.objects.get('own'), state), 2, 'globalny buff kończy się w cleanup');
  assert.equal(effectiveKeywords(state.objects.get('own'), state).includes('vigilance'), false);
});

test('Angel of the Dawn NIELEGALNE: brak many nie tworzy globalnego buffa', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'own');
  addRealCard(state, 'angel', 'angel-of-the-dawn', 'p1', 'hand');
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'angel' });
  resolveStack(state);

  assert.equal(result.ok, false);
  assert.equal(effectivePower(state.objects.get('own'), state), 2);
});

// --- Armored Skaab / mill ---------------------------------------------------

test('Armored Skaab ETB: mieli cztery karty do własnego grobu', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 5; i += 1) addLibraryCard(state, `lib-${i}`, i === 0 ? 'basic-forest' : 'basic-island');
  addRealCard(state, 'skaab', 'armored-skaab', 'p1', 'hand');
  const result = castPermanent(state, 'skaab', 3);
  // T1: mill ETB ląduje w zdarzeniach rozstrzygnięcia stosu.
  assert.equal(state.events.filter((event) => event.type === 'card_milled').length, 4);
  assert.equal(state.zones.library.length, 1);
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id).controllerId === 'p1').length, 4);
  assert.equal(state.players[1].life, 20);
});

test('Armored Skaab: pusta biblioteka oznacza mniej kart, nie przegraną poza draw stepem', () => {
  const state = mainPhase(game());
  addRealCard(state, 'skaab', 'armored-skaab', 'p1', 'hand');
  const result = castPermanent(state, 'skaab', 3);
  assert.equal(result.ok, true);
  assert.equal(result.events.some((event) => event.type === 'card_milled'), false);
  assert.equal(state.status, 'active');
});

// --- Tumbleweed Rising / plot ----------------------------------------------

test('Tumbleweed Rising: token ma X równe największej mocy własnego stwora', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'big', 'p1', 5, 5);
  addRealCard(state, 'tumble', 'tumbleweed-rising', 'p1', 'hand');
  const cast = castPermanent; // tylko żeby utrzymać wspólny helper poza ścieżką czaru
  void cast;
  addMana(state, 'p1', 2);
  const spell = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'tumble', targets: [] });
  assert.ok(spell.ok, JSON.stringify(spell.events[0]));
  passBoth(state);
  const token = [...state.objects.values()].find((object) => object.cardId === 'token_elemental');
  assert.ok(token);
  assert.equal(effectivePower(token, state), 5);
  assert.equal(effectiveToughness(token, state), 5);
});

test('Tumbleweed Rising: plot przenosi kartę do exile, a późniejszy cast nie płaci many', () => {
  const state = mainPhase(game());
  addRealCard(state, 'tumble', 'tumbleweed-rising', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const plot = playerView(state, 'p1').legalCommands.find((command) => command.type === 'plot_card');
  assert.ok(plot, 'plot jest oferowany w main');
  const plotted = execute(state, plot);
  assert.ok(plotted.ok);
  const exileObject = [...state.objects.values()].find((object) => object.cardId === 'tumbleweed-rising' && object.zone === 'exile');
  assert.ok(exileObject?.plotted);
  assert.equal(state.players[0].mana, 0);
  // Audyt PR #93 / znalezisko I (CR 702.170d): „during any turn AFTER the turn
  // in which it became plotted" — w turze zaplonowania czar jest niemy, tak
  // jak zaplotowany stwór (Spinewoods Paladin). Dawniej rzucało się go od razu.
  const sameTurn = playerView(state, 'p1').legalCommands.find((command) => command.type === 'cast_spell' && command.objectId === exileObject.id);
  assert.equal(sameTurn, undefined, 'zaplotowany czar czeka do późniejszej tury (CR 702.170d)');
  state.turn.number += 1; // „on a later turn"
  state.players[0].mana = 0;
  const cast = playerView(state, 'p1').legalCommands.find((command) => command.type === 'cast_spell' && command.objectId === exileObject.id);
  assert.ok(cast, 'zaplotowany czar można rzucić z exile w późniejszej turze');
  assert.ok(execute(state, cast).ok);
  assert.equal(state.players[0].mana, 0, 'cast po plot nie pobiera many');
});

test('Tumbleweed Rising NIELEGALNE: plot poza main i bez many nie mutuje karty', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  addRealCard(state, 'tumble', 'tumbleweed-rising', 'p1', 'hand');
  const wrongTiming = execute(state, { type: 'plot_card', playerId: 'p1', objectId: 'tumble' });
  assert.equal(wrongTiming.ok, false);
  assert.equal(state.objects.get('tumble').zone, 'hand');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const noMana = execute(state, { type: 'plot_card', playerId: 'p1', objectId: 'tumble' });
  assert.equal(noMana.ok, false);
  assert.equal(state.objects.get('tumble').zone, 'hand');
});

// --- Dawntreader Elk --------------------------------------------------------

test('Dawntreader Elk: sacrifice + search basic land tapped', () => {
  const state = mainPhase(game());
  addRealCard(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield');
  addLibraryCard(state, 'forest', 'basic-forest');
  addMana(state, 'p1', 2);
  const command = playerView(state, 'p1').legalCommands.find((entry) => entry.type === 'activate_ability' && entry.objectId === 'elk');
  assert.ok(command);
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.ok([...state.objects.values()].some((object) => object.cardId === 'dawntreader-elk' && object.zone === 'graveyard'));
  resolveStack(state); // D: zdolność na stosie → szukanie po rozstrzygnięciu
  // Temat 6: wybór karty z biblioteki.
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'forest' });
  assert.ok(pick.ok, pick.events[0]?.reason);
  const forest = [...state.objects.values()].find((object) => object.cardId === 'basic-forest' && object.zone === 'battlefield');
  assert.ok(forest);
  assert.equal(forest.tapped, true);
  assert.ok(pick.events.some((event) => event.type === 'library_searched'));
});

test('Dawntreader Elk NIELEGALNE: bez many nie poświęca źródła', () => {
  const state = mainPhase(game());
  addRealCard(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield');
  addLibraryCard(state, 'forest', 'basic-forest');
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'elk', abilityIndex: 0 });
  assert.equal(result.ok, false);
  assert.equal(state.objects.get('elk').zone, 'battlefield');
});

test('Dawntreader Elk: sacrifice w combat usuwa obiekt z atakujących bez wiszącego ID', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  addRealCard(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield');
  addLibraryCard(state, 'forest', 'basic-forest');
  addMana(state, 'p1', 2);
  state.combat = { attackingPlayerId: 'p1', attackers: ['elk'], blockers: new Map([['elk', []]]) };
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'elk', abilityIndex: 0 });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.deepEqual(state.combat.attackers, []);
  assert.equal(state.combat.blockers.has('elk'), false);
});

// --- Interakcje, determinizm i talia ----------------------------------------

test('interakcja: Angel wzmacnia wcześniej zagrane stworzenie, a Skaab mieli po nim', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'own', 'p1', 3, 3);
  for (let i = 0; i < 4; i += 1) addLibraryCard(state, `lib-${i}`, 'basic-island');
  addRealCard(state, 'angel', 'angel-of-the-dawn', 'p1', 'hand');
  addRealCard(state, 'skaab', 'armored-skaab', 'p1', 'hand');
  addMana(state, 'p1', 5);
  const rCast1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'angel' });
  assert.ok(rCast1.ok);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('own'), state), 4);
  addMana(state, 'p1', 3);
  const rCast2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'skaab' });
  assert.ok(rCast2.ok);
  resolveStack(state);
  assert.equal(state.zones.library.length, 0);
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id).cardId.startsWith('basic-')).length, 4);
});

test('determinizm Batch 10: plot, mill i search dają identyczny fingerprint', () => {
  const run = () => {
    const state = mainPhase(game());
    addRealCard(state, 'tumble', 'tumbleweed-rising', 'p1', 'hand');
    addRealCard(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield');
    addLibraryCard(state, 'forest', 'basic-forest');
    for (let i = 0; i < 4; i += 1) addLibraryCard(state, `mill-${i}`, 'basic-island');
    addMana(state, 'p1', 3);
    execute(state, { type: 'plot_card', playerId: 'p1', objectId: 'tumble' });
    addMana(state, 'p1', 2);
    execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'elk', abilityIndex: 0 });
    return stateFingerprint(state);
  };
  assert.equal(run(), run());
});

