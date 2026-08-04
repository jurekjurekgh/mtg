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
 * Ósmy batch realnych kart (ADR 0010):
 * - Phyrexian Rager (DMU) — ETB: dobierz kartę i strać 1 życie;
 * - Nefarious Imp (CLB) — flying + trigger „whenever one or more permanents
 *   you control leave the battlefield” → scry 1 (także w turze przeciwnika);
 * - Gather the Townsfolk (DDQ) — sorcery: dwa tokeny 1/1 Human, a przy życiu
 *   ≤ 5 (fateful hour) pięć tokenów;
 * - Evangel of Synthesis (BRO) — ETB draw+discard oraz zdolność STATYCZNA
 *   „+1/+0 i menace, dopóki dobrałeś ≥2 karty w tej turze”;
 * - Woolly Loxodon (KTK) — zwykły morph (obrót BEZ licznika +1/+1).
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
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
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, zone = 'battlefield', tapped = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-razorback', controllerId, zone, kind: 'creature',
    power, toughness, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness: false }));
  return state.objects.get(id);
}

/** Karta w bibliotece gracza — potrzebna, żeby dobieranie miało co dobrać. */
function addLibraryCard(state, id, controllerId, cardId = 'syn-razorback', manaCost = 1) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'library', kind: 'creature',
    power: 2, toughness: 2, manaCost, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  return state.objects.get(id);
}

function addHandCard(state, id, controllerId, manaCost = 1) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-razorback', controllerId, zone: 'hand', kind: 'creature',
    power: 2, toughness: 2, manaCost, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  return state.objects.get(id);
}

function passBoth(state, first = 'p1') {
  const second = first === 'p1' ? 'p2' : 'p1';
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: second }).ok);
}

// --- Phyrexian Rager --------------------------------------------------------

test('Phyrexian Rager: materializacja — 2/2 {2}{B} z ETB draw + lose life', () => {
  const state = mainPhase(game());
  const rager = addRealCard(state, 'r', 'phyrexian-rager', 'p1', 'battlefield');
  assert.equal(rager.power, 2);
  assert.equal(rager.toughness, 2);
  assert.equal(rager.manaCost, 3);
  const ability = rager.abilities[0];
  assert.equal(ability.trigger.event, 'enter_battlefield');
  assert.deepEqual(ability.effect.map((e) => e.type), ['draw_cards', 'lose_life']);
});

test('Phyrexian Rager ETB: kontroler dobiera kartę i traci 1 życie', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'p1');
  addRealCard(state, 'r', 'phyrexian-rager', 'p1', 'hand');
  addMana(state, 'p1', 3);

  const handBefore = state.zones.hand.length;
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'r' });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.ok(result.events.some((e) => e.type === 'card_drawn' && e.playerId === 'p1'));
  assert.equal(state.players.find((p) => p.id === 'p1').life, 19, 'kontroler traci 1 życie');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 20, 'przeciwnik nietknięty');
  // Rager wyszedł z ręki, dobrana karta weszła — bilans ręki bez zmian.
  assert.equal(state.zones.hand.length, handBefore);
  assert.equal(state.zones.library.length, 0, 'karta zeszła z biblioteki');
});

test('Phyrexian Rager ETB przy pustej bibliotece: traci życie, gra się nie wywraca', () => {
  const state = mainPhase(game());
  addRealCard(state, 'r', 'phyrexian-rager', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'r' });
  assert.ok(result.ok);
  assert.equal(result.events.some((e) => e.type === 'card_drawn'), false, 'nie ma czego dobrać');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 19);
  assert.equal(state.status, 'active', 'pusta biblioteka nie kończy gry poza krokiem draw');
});

// --- Nefarious Imp ----------------------------------------------------------

test('Nefarious Imp: materializacja — 2/1 flying z triggerem odejścia permanentów', () => {
  const state = mainPhase(game());
  const imp = addRealCard(state, 'imp', 'nefarious-imp', 'p1', 'battlefield');
  assert.equal(imp.power, 2);
  assert.equal(imp.toughness, 1);
  assert.ok(imp.keywords.includes('flying'));
  const ability = imp.abilities[0];
  assert.equal(ability.trigger.event, 'permanents_you_control_leave_battlefield');
  assert.deepEqual({ ...ability.effect }, { type: 'scry', amount: 1 });
});

test('Nefarious Imp: śmierć własnego stwora otwiera scry 1', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'p1');
  addRealCard(state, 'imp', 'nefarious-imp', 'p1', 'battlefield');
  const victim = addSimpleCreature(state, 'v', 'p1');
  state.objects.set(victim.id, Object.freeze({ ...state.objects.get(victim.id), damage: 99 }));

  const result = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(result.ok);
  assert.ok(result.events.some((e) => e.type === 'creature_destroyed'));
  assert.ok(result.events.some((e) => e.type === 'scry_started'), 'trigger Impa otworzył scry');
  assert.equal(state.pendingScry?.playerId, 'p1');
});

test('Nefarious Imp NIELEGALNE: odejście permanentu PRZECIWNIKA nie odpala triggera', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'p1');
  addRealCard(state, 'imp', 'nefarious-imp', 'p1', 'battlefield');
  const enemy = addSimpleCreature(state, 'e', 'p2');
  state.objects.set(enemy.id, Object.freeze({ ...state.objects.get(enemy.id), damage: 99 }));

  const result = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(result.ok);
  assert.ok(result.events.some((e) => e.type === 'creature_destroyed'));
  assert.equal(result.events.some((e) => e.type === 'scry_started'), false, '„you control” to warunek');
  assert.equal(state.pendingScry, null);
});

test('Nefarious Imp: kilka permanentów naraz to JEDEN trigger (CR 603.2)', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'p1');
  addRealCard(state, 'imp', 'nefarious-imp', 'p1', 'battlefield');
  for (const id of ['v1', 'v2', 'v3']) {
    addSimpleCreature(state, id, 'p1');
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), damage: 99 }));
  }
  const result = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(result.ok);
  assert.equal(result.events.filter((e) => e.type === 'scry_started').length, 1, 'jeden scry, nie trzy');
});

test('Nefarious Imp: trigger w turze przeciwnika oddaje priorytet i go zwraca', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  addLibraryCard(state, 'lib1', 'p1');
  addRealCard(state, 'imp', 'nefarious-imp', 'p1', 'battlefield');
  const victim = addSimpleCreature(state, 'v', 'p1');
  state.objects.set(victim.id, Object.freeze({ ...state.objects.get(victim.id), damage: 99 }));

  // Zagranie stwora przez p2 (a nie pass) zostawia priorytet u p2 — dzięki
  // temu widać, że scry naprawdę PRZEJMUJE priorytet i potem go oddaje.
  addObject(state, {
    id: 'foe', instanceId: 'i-foe', cardId: 'syn-razorback', controllerId: 'p2',
    zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  addMana(state, 'p2', 1);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'foe' });
  assert.ok(cast.ok, JSON.stringify(cast.events[0]));
  assert.equal(state.pendingScry?.playerId, 'p1', 'decyzja należy do właściciela Impa');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet przechodzi na decydenta');

  const view = playerView(state, 'p1');
  const scryCmd = view.legalCommands.find((c) => c.type === 'resolve_scry');
  assert.ok(scryCmd, 'właściciel ma decyzję scry');
  assert.ok(execute(state, scryCmd).ok);
  assert.equal(state.pendingScry, null);
  assert.equal(state.turn.priorityPlayerId, 'p2', 'priorytet wraca do gracza, który go miał');
});

// --- Gather the Townsfolk ---------------------------------------------------

test('Gather the Townsfolk: materializacja — sorcery {1}{W} bez celów', () => {
  const def = REGISTRY.get('gather-the-townsfolk');
  assert.deepEqual([...def.types], ['Sorcery']);
  const data = gameObjectDataOf(def);
  assert.equal(data.kind, 'spell');
  assert.equal(data.spell.timing, 'sorcery');
  assert.equal(data.spell.targets.length, 0);
  const effect = data.spell.effects[0];
  assert.equal(effect.amount, 2);
  assert.equal(effect.ifLifeAtMost, 5);
  assert.equal(effect.amountIfCondition, 5);
});

test('Gather the Townsfolk: przy pełnym życiu tworzy DWA tokeny 1/1 Human', () => {
  const state = mainPhase(game());
  addRealCard(state, 'g', 'gather-the-townsfolk', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'g', targets: [] }).ok);
  passBoth(state, 'p1');

  const tokens = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o.cardId === 'token_human');
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].power, 1);
  assert.equal(tokens[0].toughness, 1);
  assert.equal(tokens[0].summoningSickness, true, 'tokeny mają chorobę przywołania');
});

test('Gather the Townsfolk (fateful hour): przy życiu ≤5 tworzy PIĘĆ tokenów', () => {
  const state = mainPhase(game());
  state.players.find((p) => p.id === 'p1').life = 5;
  addRealCard(state, 'g', 'gather-the-townsfolk', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'g', targets: [] }).ok);
  passBoth(state, 'p1');
  const tokens = state.zones.battlefield.filter((id) => state.objects.get(id).cardId === 'token_human');
  assert.equal(tokens.length, 5, 'fateful hour przy dokładnie 5 życiach');
});

test('Gather the Townsfolk: przy 6 życiach fateful hour NIE działa (granica)', () => {
  const state = mainPhase(game());
  state.players.find((p) => p.id === 'p1').life = 6;
  addRealCard(state, 'g', 'gather-the-townsfolk', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'g', targets: [] }).ok);
  passBoth(state, 'p1');
  const tokens = state.zones.battlefield.filter((id) => state.objects.get(id).cardId === 'token_human');
  assert.equal(tokens.length, 2);
});

test('Gather the Townsfolk NIELEGALNE: sorcery poza swoją fazą main i bez many', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  addRealCard(state, 'g', 'gather-the-townsfolk', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const badTiming = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'g', targets: [] });
  assert.equal(badTiming.ok, false, 'sorcery tylko w main phase');

  const state2 = mainPhase(game());
  addRealCard(state2, 'g', 'gather-the-townsfolk', 'p1', 'hand');
  const noMana = execute(state2, { type: 'cast_spell', playerId: 'p1', objectId: 'g', targets: [] });
  assert.equal(noMana.ok, false, 'brak many');
});

// --- Evangel of Synthesis ---------------------------------------------------

test('Evangel of Synthesis: materializacja — 2/3 z ETB i zdolnością statyczną', () => {
  const state = mainPhase(game());
  const evangel = addRealCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'battlefield');
  assert.equal(evangel.power, 2);
  assert.equal(evangel.toughness, 3);
  assert.equal(evangel.manaCost, 2);
  const [etb, statik] = evangel.abilities;
  assert.equal(etb.trigger.event, 'enter_battlefield');
  assert.deepEqual(etb.effect.map((e) => e.type), ['draw_cards', 'discard_cards']);
  assert.equal(statik.type, 'static');
  assert.equal(statik.condition.minCardsDrawnThisTurn, 2);
});

test('Evangel ETB: dobiera kartę i odrzuca najdroższą (deterministycznie)', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'p1', 'syn-razorback', 1);
  addHandCard(state, 'cheap', 'p1', 1);
  addHandCard(state, 'expensive', 'p1', 7);
  addRealCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'hand');
  addMana(state, 'p1', 2);

  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ev' });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.ok(result.events.some((e) => e.type === 'card_drawn'));
  const discarded = result.events.find((e) => e.type === 'card_discarded');
  assert.ok(discarded, 'ETB odrzuca kartę');
  assert.equal(discarded.fromId, 'expensive', 'odrzucana jest najdroższa karta w ręce');
  assert.ok(state.zones.hand.includes('cheap'), 'tańsza karta zostaje w ręce');
});

test('Evangel: statyczny buff +1/+0 i menace działa dopiero po 2 dobraniach w turze', () => {
  const state = mainPhase(game());
  const evangel = addRealCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'battlefield');
  assert.equal(effectivePower(evangel, state), 2, 'bez dobrań brak buffa');
  assert.equal(effectiveKeywords(evangel, state).includes('menace'), false);

  state.cardsDrawnThisTurn.p1 = 1;
  assert.equal(effectivePower(state.objects.get('ev'), state), 2, 'jedno dobranie to za mało');

  state.cardsDrawnThisTurn.p1 = 2;
  const buffed = state.objects.get('ev');
  assert.equal(effectivePower(buffed, state), 3, '+1/+0');
  assert.equal(effectiveToughness(buffed, state), 3, 'wytrzymałość bez zmian');
  assert.ok(effectiveKeywords(buffed, state).includes('menace'), 'zyskuje menace');

  // Buff jest ciągły, nie „do końca tury”: zeruje go zmiana tury.
  state.cardsDrawnThisTurn = {};
  assert.equal(effectivePower(state.objects.get('ev'), state), 2, 'nowa tura — brak buffa');
});

test('Evangel z buffem: menace realnie wymusza dwóch blokujących', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  addRealCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'battlefield');
  addSimpleCreature(state, 'b1', 'p2');
  addSimpleCreature(state, 'b2', 'p2');
  state.cardsDrawnThisTurn.p1 = 2;

  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ev'] }).ok);
  const single = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { ev: ['b1'] } });
  assert.equal(single.ok, false, 'menace: pojedynczy blok nielegalny');
  const double = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { ev: ['b1', 'b2'] } });
  assert.ok(double.ok, 'dwóch blokujących jest legalne');
});

// --- Woolly Loxodon ---------------------------------------------------------

test('Woolly Loxodon: materializacja — 6/7 z morph (bez megamorph)', () => {
  const def = REGISTRY.get('woolly-loxodon');
  assert.equal(def.power, 6);
  assert.equal(def.toughness, 7);
  assert.equal(def.manaCost, 7);
  assert.equal(def.morph.cost, 3);
  assert.equal(def.morph.morphCost, 6);
  assert.equal(def.morph.megamorphCost, undefined, 'to zwykły morph, nie megamorph');
});

test('Woolly Loxodon: zagrany twarzą w dół jest 2/2, obrót za morph daje 6/7 BEZ licznika', () => {
  const state = mainPhase(game());
  addRealCard(state, 'wl', 'woolly-loxodon', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wl', faceDown: true }).ok);

  const faceDownId = state.zones.battlefield.find((id) => state.objects.get(id).faceDown);
  const faceDown = state.objects.get(faceDownId);
  assert.equal(effectivePower(faceDown, state), 2, 'face-down to 2/2');
  assert.equal(effectiveToughness(faceDown, state), 2);
  assert.equal(faceDown.abilities[0].keyword, 'morph');

  addMana(state, 'p1', 6);
  const flip = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: faceDownId, abilityIndex: 0 });
  assert.ok(flip.ok, JSON.stringify(flip.events[0]));
  const up = state.objects.get(faceDownId);
  assert.equal(up.faceDown, false);
  assert.equal(effectivePower(up, state), 6, 'po obrocie 6/7');
  assert.equal(effectiveToughness(up, state), 7);
  assert.deepEqual(up.counters, {}, 'zwykły morph NIE kładzie licznika +1/+1');
});

test('Woolly Loxodon NIELEGALNE: obrót bez many i drugi obrót już odkrytej karty', () => {
  const state = mainPhase(game());
  addRealCard(state, 'wl', 'woolly-loxodon', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wl', faceDown: true }).ok);
  const id = state.zones.battlefield.find((o) => state.objects.get(o).faceDown);

  const noMana = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: id, abilityIndex: 0 });
  assert.equal(noMana.ok, false, 'brak many na koszt morph');

  addMana(state, 'p1', 6);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: id, abilityIndex: 0 }).ok);
  addMana(state, 'p1', 6);
  const again = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: id, abilityIndex: 0 });
  assert.equal(again.ok, false, 'karty odkrytej nie da się obrócić ponownie');
});

test('Woolly Loxodon: face-down nie ujawnia tożsamości przeciwnikowi (FoW)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'wl', 'woolly-loxodon', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wl', faceDown: true }).ok);

  const enemyView = playerView(state, 'p2');
  const seen = enemyView.zones.battlefield.find((o) => o.faceDown);
  assert.ok(seen, 'przeciwnik widzi, że coś leży zakryte');
  assert.equal(seen.cardId, null, 'ale nie wie, co to za karta');
  const ownView = playerView(state, 'p1');
  assert.equal(ownView.zones.battlefield.find((o) => o.faceDown).cardId, 'woolly-loxodon');
});

// --- Interakcje i determinizm ----------------------------------------------

test('interakcja: Phyrexian Rager + Evangel — dwa dobrania włączają statyczny buff', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'p1');
  addLibraryCard(state, 'lib2', 'p1');
  addRealCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'battlefield');
  addRealCard(state, 'r', 'phyrexian-rager', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.equal(effectivePower(state.objects.get('ev'), state), 2);

  // Rager dobiera 1 kartę — to wciąż za mało.
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'r' }).ok);
  assert.equal(state.cardsDrawnThisTurn.p1, 1);
  assert.equal(effectivePower(state.objects.get('ev'), state), 2);

  // Drugie dobranie (np. kolejny efekt) włącza buff.
  state.cardsDrawnThisTurn.p1 = 2;
  assert.equal(effectivePower(state.objects.get('ev'), state), 3);
});

test('interakcja: Nefarious Imp widzi tokeny Gather the Townsfolk odchodzące z bitwiska', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'p1');
  addRealCard(state, 'imp', 'nefarious-imp', 'p1', 'battlefield');
  addRealCard(state, 'g', 'gather-the-townsfolk', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'g', targets: [] }).ok);
  passBoth(state, 'p1');
  const tokenId = state.zones.battlefield.find((id) => state.objects.get(id).cardId === 'token_human');
  state.objects.set(tokenId, Object.freeze({ ...state.objects.get(tokenId), damage: 99 }));

  const result = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.ok(result.ok);
  assert.ok(result.events.some((e) => e.type === 'scry_started'), 'token to też permanent');
});

test('determinizm: ta sama sekwencja daje identyczny fingerprint', () => {
  const run = () => {
    const state = mainPhase(game());
    addLibraryCard(state, 'lib1', 'p1');
    addHandCard(state, 'h1', 'p1', 5);
    addRealCard(state, 'ev', 'evangel-of-synthesis', 'p1', 'hand');
    addMana(state, 'p1', 2);
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ev' });
    return stateFingerprint(state);
  };
  assert.equal(run(), run());
});

// --- Talia i probe botów ----------------------------------------------------

