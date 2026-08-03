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
 * Batch 11 realnych kart (ADR 0010):
 * - Underdark Explorer (CLB): menace + inicjatywa (ETB) i loch Undercity;
 * - Angel's Feather (M11): trigger „ktoś rzuca biały czar" → +1 życie;
 * - Release the Ants (MOR): damage any target + clash (powrót do ręki);
 * - Porcelain Legionnaire (NPH): phyrexian mana + first strike w combat;
 * - Curate (BRO): surveil 2 z blokującą decyzją, potem dobranie;
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

function castPermanent(state, id, mana) {
  if (mana) addMana(state, 'p1', mana);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: id });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  return result;
}

function passBoth(state) {
  const first = state.turn.priorityPlayerId;
  const second = state.players.find((player) => player.id !== first).id;
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  return execute(state, { type: 'pass_priority', playerId: second });
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
});

test('materializacja przenosi kolory i phyrexian mana na obiekt gry', () => {
  const data = gameObjectDataOf(REGISTRY.get('porcelain-legionnaire'));
  assert.deepEqual(data.colors, ['W']);
  assert.equal(data.phyrexianManaCost, 1);
  assert.deepEqual(gameObjectDataOf(REGISTRY.get('curate')).colors, ['U']);
  assert.deepEqual(gameObjectDataOf(REGISTRY.get('canonized-in-blood')).colors, ['B']);
});

// --- Underdark Explorer / inicjatywa ---------------------------------------

test('Underdark Explorer ETB: obejmuje inicjatywę i zagłębia się w loch (pokój 1)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'explorer', 'underdark-explorer', 'p1', 'hand');
  const result = castPermanent(state, 'explorer', 5);
  assert.equal(state.initiativePlayerId, 'p1');
  assert.equal(state.undercityProgress.p1, 1, 'pierwsze objęcie inicjatywy = venture do pierwszego pokoju');
  assert.ok(result.events.some((event) => event.type === 'initiative_taken' && event.playerId === 'p1'));
  assert.ok(result.events.some((event) => event.type === 'ventured_into_undercity' && event.room === 1));
});

test('inicjatywa: upkeep posiadacza przesuwa go o pokój dalej (do 9 pokoi)', () => {
  const state = mainPhase(game());
  state.initiativePlayerId = 'p1';
  state.undercityProgress = { p1: 1 };
  // Wejście w upkeep przez pełną rundę passów (skok bezpośredni nie emituje
  // step_advanced — triggery kroku odpalają się tylko na zdarzeniu).
  state.turn = jumpToStep(state.turn, 'untap', 'p1');
  passBoth(state); // untap -> upkeep
  assert.equal(state.undercityProgress.p1, 2, 'upkeep posiadacza inicjatywy = venture');
  // Po Throne of the Dead Three (9. pokój) loch się kończy — dalsze venture
  // nic nie robi.
  state.undercityProgress = { p1: 9 };
  state.turn = jumpToStep(state.turn, 'untap', 'p1');
  passBoth(state);
  assert.equal(state.undercityProgress.p1, 9);
});

test('inicjatywa: combat damage przejmuje ją od posiadacza (The Initiative)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.initiativePlayerId = 'p1';
  addSimpleCreature(state, 'raider', 'p2', 2, 2);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['raider'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  assert.equal(state.initiativePlayerId, 'p2', 'obrażenia combat odbierają inicjatywę');
  assert.equal(state.undercityProgress.p2, 1, 'przejęcie inicjatywy = venture');
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

// --- Release the Ants / clash ----------------------------------------------

test('Release the Ants: damage + wygrany clash zwraca czar do ręki', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ants', 'release-the-ants', 'p1', 'hand');
  addLibraryCard(state, 'lib-mine', 'armored-skaab');          // mv 3
  addLibraryCard(state, 'lib-opp', 'goblin-piker', 'p2');      // mv 2
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] }).ok);
  const resolved = passBoth(state);
  const ants = byCard(state, 'release-the-ants');
  assert.equal(ants.zone, 'hand', 'wygrany clash zwraca czar do ręki właściciela');
  assert.equal(state.players.find((player) => player.id === 'p2').life, 19, '1 damage do gracza');
  assert.ok(resolved.events.some((event) => event.type === 'clash_resolved' && event.won === true));
  assert.ok(resolved.events.some((event) => event.type === 'card_revealed' && event.clash === true));
  assert.ok(resolved.events.some((event) => event.type === 'spell_resolved' && event.returnToHand === true));
  assert.equal(state.undercityProgress.p1 ?? 0, 0);
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
  const ants = byCard(state, 'release-the-ants');
  assert.equal(ants.zone, 'graveyard', 'przegrany clash = grób');
  assert.ok(resolved.events.some((event) => event.type === 'clash_resolved' && event.won === false));
  assert.equal(state.objects.get('victim').damage, 1, '1 damage do stwora');
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

test('Porcelain Legionnaire: {W/P} płacony maną, gdy jest; inaczej 2 życiem', () => {
  // 3 many: {2} + 1 za {W/P} — zero utraty życia.
  const state = mainPhase(game());
  addRealCard(state, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const withMana = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'porc' });
  assert.ok(withMana.ok);
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.players[0].life, 20, 'phyrexian zapłacony maną');
  assert.ok(withMana.events.some((event) => event.type === 'permanent_cast' && event.phyrexianSymbols === 1 && event.phyrexianPaidWithLife === false));
  // Dokładnie 2 many: {W/P} schodzi z życia (2 życia).
  const state2 = mainPhase(game());
  addRealCard(state2, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state2, 'p1', 2);
  const withLife = execute(state2, { type: 'cast_permanent', playerId: 'p1', objectId: 'porc' });
  assert.ok(withLife.ok);
  assert.equal(state2.players[0].mana, 0);
  assert.equal(state2.players[0].life, 18, '2 życia za {W/P}');
  // 1 mana nie wystarcza (baza {2} musi iść z many).
  const state3 = mainPhase(game());
  addRealCard(state3, 'porc', 'porcelain-legionnaire', 'p1', 'hand');
  addMana(state3, 'p1', 1);
  const noMana = execute(state3, { type: 'cast_permanent', playerId: 'p1', objectId: 'porc' });
  assert.equal(noMana.ok, false);
  assert.equal(state3.objects.get('porc').zone, 'hand');
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

// --- Curate / surveil -------------------------------------------------------

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
  // Warianty w PlayerView: 2 karty → 4 podzbiory do grobu.
  const view = playerView(state, 'p1');
  const variants = view.legalCommands.filter((cmd) => cmd.type === 'resolve_surveil');
  assert.equal(variants.length, 4);
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

test('Curate NIELEGALNE: cudza decyzja i zły podzbiór są odrzucane', () => {
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

test('determinizm Batch 11: inicjatywa, clash, surveil i first strike dają identyczny fingerprint', () => {
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
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'explorer' });
    execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] });
    passBoth(state);
    execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] });
    passBoth(state);
    execute(state, { type: 'resolve_surveil', playerId: 'p1', millIds: ['lib1'] });
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'porc' });
    return stateFingerprint(state);
  };
  assert.equal(run(), run());
});

test('decks/real-batch11.txt: parsuje się, wszystkie karty supported i każda nowa karta występuje cztery razy', () => {
  const { cardIds } = parseDeckText(fs.readFileSync('decks/real-batch11.txt', 'utf8'), REGISTRY);
  assert.equal(cardIds.length, 44);
  for (const id of ['underdark-explorer', 'angels-feather', 'release-the-ants', 'porcelain-legionnaire', 'curate', 'canonized-in-blood']) {
    assert.equal(cardIds.filter((cardId) => cardId === id).length, 4, `${id} ma 4 kopie`);
    assert.equal(REGISTRY.get(id).support.status, 'supported');
  }
});

test('decks/real-batch11 smoke: boty kończą partie i uruchamiają mechaniki batcha', () => {
  const deck = parseDeckText(fs.readFileSync('decks/real-batch11.txt', 'utf8'), REGISTRY);
  const seen = { initiative: 0, whiteLife: 0, clash: 0, surveil: 0, descendedCounter: 0, vampire: 0 };
  for (const seed of [10, 20, 30, 40, 50, 60]) {
    const state = setupCardMatch({
      seed, players: [{ id: 'p1' }, { id: 'p2' }],
      decks: new Map([['p1', deck.cardIds], ['p2', deck.cardIds]]), registry: REGISTRY,
    });
    const controllers = new Map([
      ['p1', createHeuristicBot({ seed: seed + 1 })],
      ['p2', createAggroBot()],
    ]);
    let commands = 0;
    while (state.status === 'active' && commands < 3000) {
      const playerId = state.turn.priorityPlayerId;
      const command = controllers.get(playerId).chooseCommand(playerView(state, playerId));
      const result = execute(state, command);
      assert.ok(result.ok, `seed ${seed}, cmd ${commands}: ${JSON.stringify(result.events[0])}`);
      for (const event of result.events) {
        if (event.type === 'initiative_taken') seen.initiative += 1;
        if (event.type === 'life_changed' && event.after === event.before + 1) seen.whiteLife += 1;
        if (event.type === 'clash_resolved') seen.clash += 1;
        if (event.type === 'surveil_started') seen.surveil += 1;
        if (event.type === 'ability_triggered' && event.trigger === 'end_step') seen.descendedCounter += 1;
        if (event.type === 'token_created' && event.cardId === 'token_vampire_demon') seen.vampire += 1;
      }
      commands += 1;
    }
    assert.notEqual(state.status, 'active', `partia seed ${seed} nie kończy się`);
  }
  assert.ok(seen.initiative > 0, 'Underdark Explorer nie objął inicjatywy');
  assert.ok(seen.whiteLife > 0, "Angel's Feather nie dał życia za biały czar");
  assert.ok(seen.clash > 0, 'Release the Ants nie przeprowadził clash');
  assert.ok(seen.surveil > 0, 'Curate nie wykonał surveil');
  assert.ok(seen.descendedCounter > 0, 'Canonized in Blood nie odpalil end step');
  assert.ok(seen.vampire > 0, 'Canonized in Blood nie stworzył Vampire Demon');
});
