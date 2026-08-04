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
import { createCardRegistry, UNDERCITY_DUNGEON } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { UNDERCITY_ROOMS } from '../src/engine/effects.js';

/**
 * Batch 11 realnych kart (ADR 0010) — pełne mechaniki (decyzja właściciela
 * 2026-08-03: każda karta w 100% mechanik):
 * - Underdark Explorer (CLB): menace + inicjatywa (ETB) + PEŁNY loch
 *   Undercity — wszystkie 9 pokoi wykonuje swoje efekty, karta lochu na stole;
 * - Angel's Feather (M11): trigger „ktoś rzuca biały czar" → +1 życie;
 * - Release the Ants (MOR): damage any target + clash z REALNYM wyborem
 *   wierzch/spód dla obu graczy (resolve_clash_choice);
 * - Porcelain Legionnaire (NPH): phyrexian mana z WYBOREM gracza
 *   (mana albo 2 życia) + first strike w combat;
 * - Curate (BRO): surveil 2 z wyborem kart do grobu ORAZ kolejności reszty;
 * - Canonized in Blood (LCI): descended w end step + token Vampire Demon.
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
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
    colors: data.colors ?? [], phyrexianManaCost: data.phyrexianManaCost ?? 0,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addLibraryCard(state, id, cardId = 'basic-forest', controllerId = 'p1') {
  return addRealCard(state, id, cardId, controllerId, 'library');
}

function addSimpleCreature(state, id, controllerId = 'p1', power = 2, toughness = 2, keywords = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-razorback', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function castPermanent(state, id, mana, extra = {}) {
  if (mana) addMana(state, 'p1', mana);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: id, ...extra });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  return result;
}

function passBoth(state) {
  const first = state.turn.priorityPlayerId;
  const second = state.players.find((player) => player.id !== first).id;
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  return execute(state, { type: 'pass_priority', playerId: second });
}

/** Ustawia inicjatywę p1 i wchodzi w upkeep przez rundę passów — odpalają się
 *  triggery kroku (venture do następnego pokoju Undercity). */
function ventureToNextRoom(state, roomBefore) {
  state.initiativePlayerId = 'p1';
  state.undercityProgress = { p1: roomBefore };
  state.turn = jumpToStep(state.turn, 'untap', 'p1');
  passBoth(state); // untap -> upkeep (venture + triggery upkeep)
  return state.undercityProgress.p1 ?? 0;
}

/** Rozstrzyga oczekujący wybór celu pokoju lochu (M24 — decyzja gracza). */
function resolveRoomTarget(state, targetId, playerId = 'p1') {
  const result = execute(state, { type: 'resolve_room_target', playerId, targetId });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  return result;
}

function byCard(state, cardId) {
  return [...state.objects.values()].find((object) => object.cardId === cardId);
}

// --- Dane i materializacja -------------------------------------------------

test('Batch 11: sześć kart ma właściwe dane i status supported', () => {
  const expected = [
    ['underdark-explorer', 5, 3, 5],
    ['angels-feather', null, null, 2],
    ['release-the-ants', null, null, 2],
    ['porcelain-legionnaire', 3, 1, 2],
    ['curate', null, null, 2],
    ['canonized-in-blood', null, null, 2],
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
    assert.ok(card.artId != null, `${id} ma artId ze słownika kolekcji`);
  }
  assert.equal(REGISTRY.get('porcelain-legionnaire').phyrexianManaCost, 1);
  assert.equal(REGISTRY.get('underdark-explorer').keywords.includes('menace'), true);
  assert.equal(REGISTRY.get('porcelain-legionnaire').keywords.includes('first_strike'), true);
  assert.equal(REGISTRY.get('token_vampire_demon').support.status, 'limited');
  assert.deepEqual(REGISTRY.get('token_vampire_demon').colors, ['W', 'B']);
  assert.deepEqual(REGISTRY.get('token_vampire_demon').keywords, ['flying']);
  // Token lochu (Catacombs) i karta specjalna Undercity.
  assert.equal(REGISTRY.get('token_skeleton').support.status, 'limited');
  assert.equal(UNDERCITY_DUNGEON.name, 'The Undercity');
  assert.ok(UNDERCITY_DUNGEON.imageUri.includes('tclb/20'), 'druk lochu ze Scryfalla jak w legacy (990006)');
  assert.equal(UNDERCITY_ROOMS.length, 9);
});

test('materializacja przenosi kolory i phyrexian mana na obiekt gry', () => {
  const data = gameObjectDataOf(REGISTRY.get('porcelain-legionnaire'));
  assert.deepEqual(data.colors, ['W']);
  assert.equal(data.phyrexianManaCost, 1);
  assert.deepEqual(gameObjectDataOf(REGISTRY.get('curate')).colors, ['U']);
  assert.deepEqual(gameObjectDataOf(REGISTRY.get('canonized-in-blood')).colors, ['B']);
});

// --- Underdark Explorer / inicjatywa / PEŁNY loch Undercity -----------------

test('Underdark Explorer ETB: obejmuje inicjatywę i wchodzi do pokoju 1 (Secret Entrance)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'explorer', 'underdark-explorer', 'p1', 'hand');
  addLibraryCard(state, 'lib1', 'basic-forest');
  addLibraryCard(state, 'lib2', 'goblin-piker');
  const result = castPermanent(state, 'explorer', 5);
  assert.equal(state.initiativePlayerId, 'p1');
  assert.equal(state.undercityProgress.p1, 1, 'pierwsze objęcie inicjatywy = venture do pierwszego pokoju');
  assert.ok(result.events.some((event) => event.type === 'initiative_taken' && event.playerId === 'p1'));
  assert.ok(result.events.some((event) => event.type === 'ventured_into_undercity' && event.room === 1));
  // Secret Entrance: wyszukanie Basic Land do ręki + reveal + tasowanie.
  assert.equal(state.zones.hand.some((id) => state.objects.get(id).cardId === 'basic-forest'), true, 'Secret Entrance szuka Basic Land do ręki');
  assert.ok(result.events.some((event) => event.type === 'library_searched' && event.foundCardId === 'basic-forest'));
  assert.ok(result.events.some((event) => event.type === 'card_revealed'));
});

test('loch: Forge — gracz WYBIERA cel spośród legalnych stworów (2× +1/+1)', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'own', 'p1', 1, 1);
  addSimpleCreature(state, 'enemy', 'p2', 3, 3);
  const room = ventureToNextRoom(state, 1); // pokój 2 — Forge
  assert.equal(room, 2);
  // Wybór celu jest realną, blokującą decyzją: legalne cele = wszystkie stwory.
  assert.ok(state.pendingRoomTargets.length === 1, 'Forge kolejkuje wybór celu');
  const pending = state.pendingRoomTargets[0];
  assert.equal(pending.kind, 'creature');
  assert.deepEqual([...pending.candidateIds].sort(), ['enemy', 'own'].sort(), 'kandydaci: oba stwory na bitwisku');
  const view = playerView(state, 'p1');
  const choices = view.legalCommands.filter((cmd) => cmd.type === 'resolve_room_target');
  assert.equal(choices.length, 2, 'PlayerView oferuje wybór z legalnych celów');
  assert.equal(view.pendingRoomTarget.roomName, 'Forge');
  // Wszystko poza resolve_room_target zablokowane; cudza decyzja odrzucona.
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, false);
  assert.equal(execute(state, { type: 'resolve_room_target', playerId: 'p2', targetId: 'own' }).ok, false);
  // Gracz wybiera wroga (3/3) — liczniki idą na wskazany cel.
  resolveRoomTarget(state, 'enemy');
  const enemy = state.objects.get('enemy');
  assert.equal(enemy.counters['+1/+1'], 2, 'Forge: 2× +1/+1 na wybranym stworze');
  assert.equal(effectivePower(enemy, state), 5);
  assert.equal(state.pendingRoomTargets.length, 0);
  assert.ok(state.events.some((event) => event.type === 'room_target_resolved' && event.targetId === 'enemy'));
});

test('loch: Forge bez stworów na bitwisku nie kolejkuje wyboru', () => {
  const state = mainPhase(game());
  const room = ventureToNextRoom(state, 1); // pokój 2 — Forge, puste bitwisko
  assert.equal(room, 2);
  assert.equal(state.pendingRoomTargets.length, 0, 'brak legalnych celów = brak wyboru');
});

test('loch: Lost Well daje scry 2 (blokująca decyzja)', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'basic-forest');
  addLibraryCard(state, 'lib2', 'goblin-piker');
  const room = ventureToNextRoom(state, 2); // pokój 3 — Lost Well
  assert.equal(room, 3);
  assert.ok(state.pendingScry, 'Lost Well: scry czeka na decyzję');
  assert.equal(state.pendingScry.playerId, 'p1');
  assert.equal(state.pendingScry.objectIds.length, 2);
  assert.ok(execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: [] }).ok);
  assert.equal(state.pendingScry, null);
});

test('loch: Trap! — gracz WYBIERA docelowego gracza (5 życia)', () => {
  const state = mainPhase(game());
  const room = ventureToNextRoom(state, 3); // pokój 4 — Trap!
  assert.equal(room, 4);
  assert.ok(state.pendingRoomTargets.length === 1, 'Trap! kolejkuje wybór celu');
  assert.equal(state.pendingRoomTargets[0].kind, 'player');
  assert.deepEqual([...state.pendingRoomTargets[0].candidateIds].sort(), ['p1', 'p2'].sort(), 'legalni obaj gracze');
  // Gracz wybiera przeciwnika.
  resolveRoomTarget(state, 'p2');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 15, 'Trap!: 5 życia dla wybranego gracza');
  assert.equal(state.players[0].life, 20);
});

test('loch: Arena — gracz WYBIERA, którego stwora goaduje (musi atakować)', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'own', 'p1', 1, 1);
  addSimpleCreature(state, 'enemy', 'p2', 4, 4);
  const room = ventureToNextRoom(state, 4); // pokój 5 — Arena
  assert.equal(room, 5);
  assert.ok(state.pendingRoomTargets.length === 1, 'Arena kolejkuje wybór celu');
  assert.equal(state.pendingRoomTargets[0].effectType, 'goad');
  // Gracz goaduje stwora wroga.
  resolveRoomTarget(state, 'enemy');
  assert.equal(state.objects.get('enemy').goaded, true, 'Arena: goad na wybranym stworze');
  assert.equal(state.objects.get('own').goaded, false, 'niewybrany stwór nie jest sprowokowany');
  assert.ok(state.events.some((event) => event.type === 'object_goaded' && event.objectId === 'enemy'));
});

test('loch: nielegalny cel pokoju jest odrzucany', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'own', 'p1', 1, 1);
  ventureToNextRoom(state, 1); // pokój 2 — Forge
  assert.ok(state.pendingRoomTargets.length === 1);
  const bad = execute(state, { type: 'resolve_room_target', playerId: 'p1', targetId: 'nieistniejący' });
  assert.equal(bad.ok, false, 'cel spoza listy legalnych odrzucony');
  assert.equal(state.pendingRoomTargets.length, 1, 'zły wybór nie zamyka okna');
  const wrongKind = execute(state, { type: 'resolve_room_target', playerId: 'p1', targetId: 'p2' });
  assert.equal(wrongKind.ok, false, 'gracz nie jest legalnym celem pokoju „target creature"');
});

test('loch: Stash tworzy Treasure, Archives dobiera, Catacombs tworzy Skeleton', () => {
  // Stash (pokój 6)
  const state = mainPhase(game());
  assert.equal(ventureToNextRoom(state, 5), 6);
  assert.ok(byCard(state, 'token_treasure'), 'Stash: token Treasure');
  // Archives (pokój 7)
  const state2 = mainPhase(game());
  addLibraryCard(state2, 'lib1', 'basic-forest');
  const handBefore = state2.zones.hand.length;
  assert.equal(ventureToNextRoom(state2, 6), 7);
  assert.equal(state2.zones.hand.length, handBefore + 1, 'Archives: dobranie');
  // Catacombs (pokój 8)
  const state3 = mainPhase(game());
  assert.equal(ventureToNextRoom(state3, 7), 8);
  const skeleton = byCard(state3, 'token_skeleton');
  assert.ok(skeleton, 'Catacombs: token Skeleton');
  assert.equal(skeleton.power, 4);
  assert.equal(skeleton.toughness, 1);
  assert.ok(effectiveKeywords(skeleton, state3).includes('menace'));
});

test('loch: Throne of the Dead Three — gracz WYBIERA stwora z odsłoniętych (3× +1/+1, hexproof, tasowanie)', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'goblin-piker');
  addLibraryCard(state, 'lib2', 'armored-skaab');
  addLibraryCard(state, 'lib3', 'basic-forest');
  addLibraryCard(state, 'lib4', 'basic-island');
  const room = ventureToNextRoom(state, 8); // pokój 9 — Throne
  assert.equal(room, 9);
  // Odsłonięcie jest jawne, a wybór stwora to decyzja gracza.
  assert.ok(state.events.filter((event) => event.type === 'card_revealed' && event.revealTop).length >= 4, 'odsłonięcie wierzchnich kart');
  assert.ok(state.pendingRoomTargets.length === 1, 'Throne kolejkuje wybór stwora');
  const pending = state.pendingRoomTargets[0];
  assert.equal(pending.kind, 'revealed_creature');
  assert.deepEqual([...pending.candidateIds].sort(), ['lib1', 'lib2'].sort(), 'kandydaci: tylko stwory spośród odsłoniętych');
  const view = playerView(state, 'p1');
  assert.equal(view.pendingRoomTarget.kind, 'revealed_creature');
  assert.ok((view.pendingRoomTarget.cards ?? []).length === 2, 'odsłonięte karty jawne właścicielowi decyzji');
  // Nie można wskazać nie-stwora (landa) spośród odsłoniętych.
  assert.equal(execute(state, { type: 'resolve_room_target', playerId: 'p1', targetId: 'lib3' }).ok, false);
  // Gracz wybiera Armored Skaab (1/4).
  resolveRoomTarget(state, 'lib2');
  const put = [...state.objects.values()].find((o) => o.cardId === 'armored-skaab' && o.zone === 'battlefield');
  assert.ok(put, 'Throne: wybrany stwór wchodzi na bitwisko');
  assert.equal(put.counters['+1/+1'], 3, 'Throne: trzy liczniki +1/+1');
  assert.ok(effectiveKeywords(put, state).includes('hexproof'), 'Throne: hexproof do następnej tury');
  assert.ok(state.events.some((event) => event.type === 'hexproof_granted' && event.objectId === put.id));
  assert.ok(state.events.some((event) => event.type === 'library_searched' && event.shuffled), 'tasowanie po Throne');
  // Hexproof trwa do początku NASTĘPNEJ tury kontrolera (tura 3 przy udzieleniu w turze 1).
  assert.equal(put.hexproofUntilTurn, 3);
  state.turn = jumpToStep(state.turn, 'untap', 'p1');
  state.turn.number = 3;
  assert.ok(!effectiveKeywords(put, state).includes('hexproof'), 'hexproof gaśnie z początkiem następnej tury kontrolera');
});

test('loch: Throne bez stworów wśród odsłoniętych tylko tasuje (bez wyboru)', () => {
  const state = mainPhase(game());
  addLibraryCard(state, 'lib1', 'basic-forest');
  addLibraryCard(state, 'lib2', 'basic-island');
  const room = ventureToNextRoom(state, 8); // pokój 9 — Throne
  assert.equal(room, 9);
  assert.equal(state.pendingRoomTargets.length, 0, 'brak stwora wśród odsłoniętych = brak wyboru');
  assert.ok(state.events.some((event) => event.type === 'library_searched' && event.shuffled));
});

test('loch: po Throne (pokój 9) dalsze venture nic nie robi', () => {
  const state = mainPhase(game());
  const room = ventureToNextRoom(state, 9);
  assert.equal(room, 9, 'koniec lochu — brak postępu');
});

test('loch: sekwencja pokoi jest jawna w PlayerView (karta na stole)', () => {
  const state = mainPhase(game());
  ventureToNextRoom(state, 1); // pokój 2
  const view = playerView(state, 'p1');
  assert.equal(view.initiativePlayerId, 'p1');
  assert.equal(view.undercityProgress.p1, 2);
  assert.equal(UNDERCITY_ROOMS[1].name, 'Forge');
});

// --- Goad w combacie --------------------------------------------------------

test('goad: sprowokowany stwór MUSI atakować do końca tury', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addSimpleCreature(state, 'g1', 'p1', 2, 2);
  addSimpleCreature(state, 'g2', 'p1', 1, 1);
  state.objects.set('g1', Object.freeze({ ...state.objects.get('g1'), goaded: true }));
  // Pominięcie goadowanego stwora jest nielegalne.
  const bad = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['g2'] });
  assert.equal(bad.ok, false, 'deklaracja bez goadowanego = odrzucona');
  const view = playerView(state, 'p1');
  const options = view.legalCommands.filter((cmd) => cmd.type === 'declare_attackers');
  assert.ok(options.length > 0);
  for (const option of options) {
    assert.ok(option.attackerIds.includes('g1'), 'każda legalna opcja zawiera goadowanego');
  }
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['g1', 'g2'] }).ok);
  // Cleanup zdejmuje goad (do końca tury).
  clearStatModifiers(state);
  assert.equal(state.objects.get('g1').goaded, false, 'goad znika w cleanup');
});

// --- Angel's Feather --------------------------------------------------------

test("Angel's Feather: biały czar dowolnego gracza daje +1 życia właścicielowi", () => {
  const state = mainPhase(game(), 'p2');
  addRealCard(state, 'feather', 'angels-feather', 'p1', 'battlefield');
  addRealCard(state, 'white', 'gather-the-townsfolk', 'p2', 'hand');
  addMana(state, 'p2', 2);
  const before = state.players.find((player) => player.id === 'p1').life;
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'white', targets: [] }).ok);
  assert.equal(state.players.find((player) => player.id === 'p1').life, before + 1);
});

test("Angel's Feather: niebieski czar nie daje życia; brak reakcji na własny bezbarwny artefakt", () => {
  const state = mainPhase(game(), 'p2');
  addRealCard(state, 'feather', 'angels-feather', 'p1', 'battlefield');
  addRealCard(state, 'blue', 'curate', 'p2', 'hand');
  addMana(state, 'p2', 2);
  const before = state.players.find((player) => player.id === 'p1').life;
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'blue', targets: [] }).ok);
  assert.equal(state.players.find((player) => player.id === 'p1').life, before, 'niebieski czar nie odpala Pióra');
  // Zagranie bezbarwnego artefaktu (samo Pióro z ręki) też nie daje życia.
  addRealCard(state, 'feather2', 'angels-feather', 'p2', 'hand');
  addMana(state, 'p2', 2);
  const before2 = state.players.find((player) => player.id === 'p1').life;
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'feather2' }).ok);
  assert.equal(state.players.find((player) => player.id === 'p1').life, before2);
});

test("Angel's Feather: białe permanenty (Porcelain Legionnaire) też są białym czarem", () => {
  const state = mainPhase(game(), 'p2');
  addRealCard(state, 'feather', 'angels-feather', 'p1', 'battlefield');
  addRealCard(state, 'porc', 'porcelain-legionnaire', 'p2', 'hand');
  addMana(state, 'p2', 3);
  const before = state.players.find((player) => player.id === 'p1').life;
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'porc' }).ok);
  assert.equal(state.players.find((player) => player.id === 'p1').life, before + 1);
});

// --- Release the Ants / clash (wybór wierzch/spód) --------------------------

function resolveClashBoth(state, { p1Bottom = false, p2Bottom = false } = {}) {
  const first = execute(state, { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: p1Bottom });
  assert.ok(first.ok, JSON.stringify(first.events[0]));
  const second = execute(state, { type: 'resolve_clash_choice', playerId: 'p2', putOnBottom: p2Bottom });
  assert.ok(second.ok, JSON.stringify(second.events[0]));
  return second;
}

test('Release the Ants: damage + wygrany clash — obaj gracze wybierają wierzch/spód, czar wraca do ręki', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ants', 'release-the-ants', 'p1', 'hand');
  addLibraryCard(state, 'lib-mine', 'armored-skaab');          // mv 3
  addLibraryCard(state, 'lib-opp', 'goblin-piker', 'p2');      // mv 2
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] }).ok);
  const resolved = passBoth(state); // rozstrzygnięcie: damage + clash (odsłonięcie)
  assert.equal(state.players.find((player) => player.id === 'p2').life, 19, '1 damage do gracza');
  assert.ok(state.pendingClash, 'clash czeka na decyzje obu graczy');
  assert.equal(state.pendingClash.choices.length, 2);
  assert.ok(resolved.events.some((event) => event.type === 'clash_resolved' && event.won === true));
  assert.ok(resolved.events.some((event) => event.type === 'card_revealed' && event.clash === true));
  assert.equal(byCard(state, 'release-the-ants').zone, 'stack', 'czar wisi na stosie do decyzji');
  // Wszystko poza resolve_clash_choice zablokowane.
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, false);
  assert.equal(execute(state, { type: 'resolve_clash_choice', playerId: 'p2' }).ok, false, 'nie czyja kolej — odrzucone');
  // p1: wierzch; p2: spód.
  const finalEvents = resolveClashBoth(state, { p2Bottom: true });
  const ants = byCard(state, 'release-the-ants');
  assert.equal(ants.zone, 'hand', 'wygrany clash zwraca czar do ręki właściciela');
  assert.equal(state.pendingClash, null);
  assert.equal(state.zones.library[state.zones.library.length - 1], 'lib-opp', 'karta p2 na spodzie biblioteki');
  assert.equal(state.zones.library[0], 'lib-mine', 'karta p1 na wierzchu');
  assert.ok(finalEvents.events.some((event) => event.type === 'spell_resolved' && event.returnToHand === true));
  assert.ok(finalEvents.events.some((event) => event.type === 'clash_choice_resolved'));
});

test('Release the Ants: przegrany clash wysyła czar do grobu; cel-stwór też legalny', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ants', 'release-the-ants', 'p1', 'hand');
  addLibraryCard(state, 'lib-mine', 'goblin-piker');           // mv 2
  addLibraryCard(state, 'lib-opp', 'armored-skaab', 'p2');     // mv 3
  addSimpleCreature(state, 'victim', 'p2', 2, 2);
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['victim'] }).ok);
  const resolved = passBoth(state);
  assert.equal(state.objects.get('victim').damage, 1, '1 damage do stwora');
  assert.ok(state.pendingClash);
  const finalEvents = resolveClashBoth(state);
  const ants = byCard(state, 'release-the-ants');
  assert.equal(ants.zone, 'graveyard', 'przegrany clash = grób');
  assert.ok(resolved.events.some((event) => event.type === 'clash_resolved' && event.won === false));
  assert.ok(finalEvents.events.some((event) => event.type === 'spell_resolved' && event.returnToHand !== true));
});

test('Release the Ants NIELEGALNE: bez celu i bez many nie rzuca', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ants', 'release-the-ants', 'p1', 'hand');
  const noTarget = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: [] });
  assert.equal(noTarget.ok, false, 'any target wymaga celu (gracz albo stwór)');
  addMana(state, 'p1', 1);
  const noMana = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] });
  assert.equal(noMana.ok, false);
  assert.equal(state.objects.get('ants').zone, 'hand');
});

// --- Porcelain Legionnaire / phyrexian mana + first strike -----------------

test('Porcelain Legionnaire: gracz WYBIERA {W/P} — maną albo 2 życiem', () => {
  // 3 many: dwa warianty — {W/P} maną (k=0) albo 2 życiem (k=1); manowy pierwszy.
  const state = mainPhase(game());
  addRealCard(state, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((cmd) => cmd.type === 'cast_permanent' && cmd.objectId === 'porc');
  assert.equal(casts.length, 2, 'przy 3 many oferowane oba warianty płatności');
  assert.equal(casts[0].phyrexianPayWithLife, 0, 'manowy wariant pierwszy (najtańszy)');
  assert.ok(casts.some((cmd) => cmd.phyrexianPayWithLife === 1), 'wariant życiowy też dostępny');
  const byMana = casts.find((cmd) => cmd.phyrexianPayWithLife === 0);
  const withMana = execute(state, byMana);
  assert.ok(withMana.ok);
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.players[0].life, 20, '{W/P} zapłacony maną');
  assert.ok(withMana.events.some((event) => event.type === 'permanent_cast' && event.phyrexianSymbols === 1 && event.phyrexianPaidWithLife === 0));
  // 2 many: tylko wariant życiowy (k=1) — 2 życia.
  const state2 = mainPhase(game());
  addRealCard(state2, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state2, 'p1', 2);
  const casts2 = playerView(state2, 'p1').legalCommands.filter((cmd) => cmd.type === 'cast_permanent' && cmd.objectId === 'porc');
  assert.equal(casts2.length, 1);
  assert.equal(casts2[0].phyrexianPayWithLife, 1);
  const withLife = execute(state2, casts2[0]);
  assert.ok(withLife.ok);
  assert.equal(state2.players[0].mana, 0);
  assert.equal(state2.players[0].life, 18, '2 życia za {W/P}');
  assert.ok(withLife.events.some((event) => event.type === 'permanent_cast' && event.phyrexianPaidWithLife === 1));
  // 1 mana: baza {2} nieopłacalna — brak wariantów.
  const state3 = mainPhase(game());
  addRealCard(state3, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state3, 'p1', 1);
  const casts3 = playerView(state3, 'p1').legalCommands.filter((cmd) => cmd.type === 'cast_permanent' && cmd.objectId === 'porc');
  assert.equal(casts3.length, 0);
  // Nielegalne: k poza zakresem [0..symbols].
  const state4 = mainPhase(game());
  addRealCard(state4, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state4, 'p1', 3);
  const bad = execute(state4, { type: 'cast_permanent', playerId: 'p1', objectId: 'porc', phyrexianPayWithLife: 2 });
  assert.equal(bad.ok, false);
  assert.equal(state4.objects.get('porc').zone, 'hand', 'nieudana płatność nie rusza karty');
});

test('first strike: atakujący z FS zabija blokera, sam nie ponosi obrażeń', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const fs = addRealCard(state, 'fs', 'porcelain-legionnaire', 'p1', 'battlefield');
  state.objects.set('fs', Object.freeze({ ...fs, summoningSickness: false }));
  addSimpleCreature(state, 'blk', 'p2', 2, 2);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['fs'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { fs: ['blk'] } }).ok);
  const resolved = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(state.objects.get('fs').zone, 'battlefield', 'atakujący z first strike przeżywa');
  assert.equal(state.objects.get('fs').damage, 0, 'bloker bez first strike nie odpowiada');
  assert.equal(deadInGraveyard(state, 'syn-razorback'), true, 'bloker ginie w przebiegu first strike');
  assert.ok(resolved.events.some((event) => event.type === 'damage_dealt' && event.target === 'blk'));
});

test('first strike: bloker z FS odpowiada pierwszy i zabija zwykłego atakującego', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addSimpleCreature(state, 'atk', 'p1', 2, 1);
  addSimpleCreature(state, 'blk', 'p2', 2, 2, ['first_strike']);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['blk'] } }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.equal(deadInGraveyard(state, 'syn-razorback'), true, 'atakujący bez FS ginie od first strike blockera');
  assert.equal(state.objects.get('blk').zone, 'battlefield', 'bloker z FS przeżywa (atakujący nie zdążył)');
});

test('first strike nie zmienia walki bez stwora z FS (regresja)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addSimpleCreature(state, 'atk', 'p1', 2, 1);
  addSimpleCreature(state, 'blk', 'p2', 2, 2);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['blk'] } }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.equal(deadInGraveyard(state, 'syn-razorback'), true, 'atakujący ginie');
  const survivors = state.zones.battlefield.filter((id) => state.objects.get(id).kind === 'creature');
  assert.equal(survivors.length, 0, 'wymiana bez first strike jak dotychczas (obaj giną)');
});

/** Czy jakikolwiek obiekt o danym cardId jest w grobie (po zmianie strefy obiekt zmienia id). */
function deadInGraveyard(state, cardId) {
  return state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === cardId);
}

// --- Curate / surveil (wybór kart do grobu + kolejność) ---------------------

test('Curate: surveil 2 blokuje grę, a resolve_surveil mieli wybrane karty i dobiera', () => {
  const state = mainPhase(game());
  addRealCard(state, 'curate', 'curate', 'p1', 'hand');
  addLibraryCard(state, 'lib1', 'basic-forest');
  addLibraryCard(state, 'lib2', 'goblin-piker');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] }).ok);
  passBoth(state);
  assert.ok(state.pendingSurveil, 'surveil czeka na decyzję');
  assert.equal(state.zones.stack.length, 1, 'czar wisi na stosie do decyzji');
  // Wszystko poza resolve_surveil jest zablokowane.
  const blocked = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(blocked.ok, false);
  // Warianty: 2 karty → podzbiory do grobu × permutacje reszty (5 wariantów).
  const view = playerView(state, 'p1');
  const variants = view.legalCommands.filter((cmd) => cmd.type === 'resolve_surveil');
  assert.equal(variants.length, 5);
  // Mielimy landa, Piker zostaje na wierzchu; potem dobranie i rozstrzygnięcie.
  const resolve = execute(state, { type: 'resolve_surveil', playerId: 'p1', millIds: ['lib1'] });
  assert.ok(resolve.ok);
  assert.equal(state.pendingSurveil, null);
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id).cardId === 'basic-forest').length, 1);
  assert.equal(state.zones.library.length, 0, 'Piker został na wierzchu i poszedł do ręki dobraniem');
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id).cardId === 'goblin-piker').length, 1, 'reszta na wierzchu = dobrana karta');
  assert.equal(byCard(state, 'curate').zone, 'graveyard', 'czar rozstrzygnięty po decyzji');
  assert.equal(state.zones.hand.length, 1, 'dobranie po surveil');
  assert.ok(resolve.events.some((event) => event.type === 'card_milled'));
  assert.ok(resolve.events.some((event) => event.type === 'card_drawn'));
  assert.ok(resolve.events.some((event) => event.type === 'spell_resolved'));
});

test('Curate: „in any order" — topOrder steruje kolejnością kart na wierzchu', () => {
  const state = mainPhase(game());
  addRealCard(state, 'curate', 'curate', 'p1', 'hand');
  addLibraryCard(state, 'lib1', 'basic-forest');
  addLibraryCard(state, 'lib2', 'goblin-piker');
  addMana(state, 'p1', 2);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] });
  passBoth(state);
  // Nic do grobu, ale Piker NA WIERZCHU — dobranie bierze Pikera zamiast landa.
  const resolve = execute(state, { type: 'resolve_surveil', playerId: 'p1', millIds: [], topOrder: ['lib2', 'lib1'] });
  assert.ok(resolve.ok);
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id).cardId === 'goblin-piker').length, 1, 'dobrany Piker z wierzchu (kolejność wg wyboru)');
  assert.deepEqual(state.zones.library, ['lib1'], 'po dobraniu wierzchniej karty zostaje reszta biblioteki');
});

test('Curate NIELEGALNE: cudza decyzja, zły podzbiór i zła kolejność są odrzucane', () => {
  const state = mainPhase(game());
  addRealCard(state, 'curate', 'curate', 'p1', 'hand');
  addLibraryCard(state, 'lib1', 'basic-forest');
  addLibraryCard(state, 'lib2', 'goblin-piker');
  addMana(state, 'p1', 2);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] });
  passBoth(state);
  const notYours = execute(state, { type: 'resolve_surveil', playerId: 'p2', millIds: [] });
  assert.equal(notYours.ok, false);
  const wrongSubset = execute(state, { type: 'resolve_surveil', playerId: 'p1', millIds: ['lib-inexistent'] });
  assert.equal(wrongSubset.ok, false);
  const wrongOrder = execute(state, { type: 'resolve_surveil', playerId: 'p1', millIds: ['lib1'], topOrder: ['lib1'] });
  assert.equal(wrongOrder.ok, false, 'topOrder musi być permutacją kart spoza grobu');
  assert.ok(state.pendingSurveil, 'złe decyzje nie zamykają okna');
});

test('surveil bez kart w bibliotece nie blokuje gry', () => {
  const state = mainPhase(game());
  addRealCard(state, 'curate', 'curate', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] }).ok);
  passBoth(state);
  assert.equal(state.pendingSurveil, null);
  assert.equal(byCard(state, 'curate').zone, 'graveyard');
});

// --- Canonized in Blood / descended -----------------------------------------

test('Canonized in Blood: enchantment zagrywa się jako permanent', () => {
  const state = mainPhase(game());
  addRealCard(state, 'canon', 'canonized-in-blood', 'p1', 'hand');
  const result = castPermanent(state, 'canon', 2);
  const canon = byCard(state, 'canonized-in-blood');
  assert.equal(canon.zone, 'battlefield');
  assert.equal(canon.kind, 'enchantment');
  assert.ok(result.events.some((event) => event.type === 'permanent_cast'));
});

test('Canonized in Blood: end step bez descended nie daje licznika', () => {
  const state = mainPhase(game());
  addRealCard(state, 'canon', 'canonized-in-blood', 'p1', 'hand');
  addSimpleCreature(state, 'own', 'p1');
  castPermanent(state, 'canon', 2);
  state.turn = jumpToStep(state.turn, 'end_of_combat', 'p1');
  passBoth(state); // end_of_combat -> postcombat main
  passBoth(state); // main -> end (triggery end step)
  assert.equal(state.objects.get('own').counters['+1/+1'] ?? 0, 0, 'brak descended = brak licznika');
});

test('Canonized in Blood: odrzucenie permanent card = descended; end step kładzie +1/+1', () => {
  const state = mainPhase(game());
  addRealCard(state, 'canon', 'canonized-in-blood', 'p1', 'hand');
  addSimpleCreature(state, 'own', 'p1');
  addRealCard(state, 'to-discard', 'goblin-piker', 'p1', 'hand');
  castPermanent(state, 'canon', 2);
  // Permanent card wpada do grobu z ręki — „descended this turn".
  const handCard = byCard(state, 'goblin-piker');
  assert.ok(execute(state, { type: 'move_object', playerId: 'p1', objectId: handCard.id, toZone: 'graveyard', newObjectId: 'grave-x' }).ok);
  assert.equal(state.descendedThisTurn.p1, true);
  state.turn = jumpToStep(state.turn, 'end_of_combat', 'p1');
  passBoth(state);
  passBoth(state);
  assert.equal(state.objects.get('own').counters['+1/+1'], 1, 'end step z descended kładzie licznik na własnego stwora');
  assert.ok(state.events.some((event) => event.type === 'ability_triggered' && event.trigger === 'end_step'));
});

test('Canonized in Blood: aktywacja {5}{B}{B} + sacrifice tworzy 4/3 Vampire Demon z flying', () => {
  const state = mainPhase(game());
  addRealCard(state, 'canon', 'canonized-in-blood', 'p1', 'hand');
  castPermanent(state, 'canon', 2);
  const canon = byCard(state, 'canonized-in-blood');
  addMana(state, 'p1', 7);
  const view = playerView(state, 'p1');
  const activate = view.legalCommands.find((cmd) => cmd.type === 'activate_ability' && cmd.objectId === canon.id);
  assert.ok(activate, 'aktywacja oferowana po zapłaceniu many');
  const result = execute(state, activate);
  assert.ok(result.ok);
  const token = byCard(state, 'token_vampire_demon');
  assert.ok(token, 'token Vampire Demon powstaje');
  assert.equal(token.power, 4);
  assert.equal(token.toughness, 3);
  assert.ok(effectiveKeywords(token, state).includes('flying'));
  assert.equal(byCard(state, 'canonized-in-blood').zone, 'graveyard', 'sacrifice jest częścią kosztu');
  assert.equal(state.players[0].mana, 0);
});

test('Canonized in Blood NIELEGALNE: bez many zdolność nie poświęca źródła', () => {
  const state = mainPhase(game());
  addRealCard(state, 'canon', 'canonized-in-blood', 'p1', 'hand');
  castPermanent(state, 'canon', 2);
  const canon = byCard(state, 'canonized-in-blood');
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: canon.id, abilityIndex: 1 });
  assert.equal(result.ok, false);
  assert.equal(canon.zone, 'battlefield', 'nieudana aktywacja nie poświęca (atomowe koszty)');
});

// --- Interakcje, determinizm i talia ----------------------------------------

test('interakcja: Curate mieli, a Canonized w tym samym grobie zasila descended', () => {
  const state = mainPhase(game());
  addRealCard(state, 'canon', 'canonized-in-blood', 'p1', 'hand');
  addRealCard(state, 'curate', 'curate', 'p1', 'hand');
  addSimpleCreature(state, 'own', 'p1');
  addLibraryCard(state, 'lib1', 'basic-forest');
  addLibraryCard(state, 'lib2', 'goblin-piker');
  addMana(state, 'p1', 4);
  castPermanent(state, 'canon', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] }).ok);
  passBoth(state);
  execute(state, { type: 'resolve_surveil', playerId: 'p1', millIds: ['lib1'] });
  assert.equal(state.descendedThisTurn.p1, true, 'mill permanent card liczy się jako descended');
});

test('determinizm Batch 11: inicjatywa+loch, clash z wyborami, surveil i phyrexian dają identyczny fingerprint', () => {
  const run = () => {
    const state = mainPhase(game());
    addRealCard(state, 'explorer', 'underdark-explorer', 'p1', 'hand');
    addRealCard(state, 'ants', 'release-the-ants', 'p1', 'hand');
    addRealCard(state, 'curate', 'curate', 'p1', 'hand');
    addRealCard(state, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
    addLibraryCard(state, 'lib1', 'basic-forest');
    addLibraryCard(state, 'lib2', 'goblin-piker');
    addLibraryCard(state, 'lib-opp', 'goblin-piker', 'p2');
    addMana(state, 'p1', 12);
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'explorer' }); // inicjatywa + pokój 1 (szukanie landa)
    execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] });
    passBoth(state);
    execute(state, { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false });
    execute(state, { type: 'resolve_clash_choice', playerId: 'p2', putOnBottom: false });
    execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] });
    passBoth(state);
    execute(state, { type: 'resolve_surveil', playerId: 'p1', millIds: ['lib1'] });
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'porc', phyrexianPayWithLife: 0 });
    return stateFingerprint(state);
  };
  assert.equal(run(), run());
});

