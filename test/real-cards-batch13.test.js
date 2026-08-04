import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Batch 13 realnych kart (ADR 0010 §2a) — pełne mechaniki (decyzja właściciela
 * 2026-08-03: każda karta w 100% mechanik):
 * - Scorned Villager (DKA): transform DFC (Moonscarred Werewolf) — zdolność
 *   many {T}: Add {G} + trigger upkeep „if no spells were cast last turn";
 * - Curse of the Pierced Heart (ISD): ENCHANT PLAYER aura — zaczarowany gracz
 *   wybierany przy rzucaniu, upkeep zaczarowanego gracza → 1 obrażeń;
 * - Emissary Escort (EOE): statyczne +X/+0, X = największa mana value wśród
 *   INNYCH artefaktów kontrolera (CR 604.3, przeliczane przy odczycie);
 * - Snarling Wolf (VOW): aktywowane {1}{G}: +2/+2 do końca tury, „activate
 *   only once each turn";
 * - Negate (M20): „Counter target noncreature spell" — cel czaru na stosie
 *   (nie-stwór), kontrujący czar jest usuwany bez rozstrzygania.
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, { tapped = false, summoningSickness = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  let transformTo = null;
  if (def.transformTo) {
    const back = REGISTRY.get(def.transformTo);
    transformTo = { cardId: back.id, power: back.power, toughness: back.toughness, abilities: back.abilities ?? [], keywords: back.keywords ?? [], subtypes: back.subtypes ?? [] };
  }
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, plot: data.plot ?? null, plotted: data.plotted ?? false,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], bestow: data.bestow ?? null, aura: data.aura ?? null,
    enchantPlayer: data.enchantPlayer ?? false, transformTo,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, keywords = [], manaCost = 1, types = ['Creature']) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-razorback', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords, subtypes: [], types,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addArtifact(state, id, controllerId, manaCost) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-artifact', controllerId, zone: 'battlefield',
    kind: 'artifact', manaCost, abilities: [], keywords: [], subtypes: [], types: ['Artifact'],
  });
  return state.objects.get(id);
}

function passBoth(state) {
  const first = state.turn.priorityPlayerId;
  const second = state.players.find((player) => player.id !== first).id;
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  return execute(state, { type: 'pass_priority', playerId: second });
}

function byCard(state, cardId, zone) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
}

/** Ustawia aktywną turę danego gracza i przechodzi untap→upkeep (triggery upkeep). */
function advanceToUpkeep(state, playerId) {
  state.turn = jumpToStep({ ...initialTurn(playerId) }, 'untap', playerId);
  passBoth(state); // untap -> upkeep
}

// --- Dane i materializacja -------------------------------------------------

test('Batch 13: pięć kart ma właściwe dane i status supported', () => {
  const expected = [
    ['scorned-villager', 1, 1, 2],
    ['curse-of-the-pierced-heart', null, null, 2],
    ['emissary-escort', 0, 4, 2],
    ['snarling-wolf', 1, 1, 1],
    ['negate', null, null, 2],
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
  // Scorned Villager: transform DFC; tył (Moonscarred Werewolf) limited.
  assert.deepEqual(REGISTRY.get('scorned-villager').transformTo, 'moonscarred-werewolf');
  assert.equal(REGISTRY.get('scorned-villager').keywords.includes('transform'), true);
  const back = REGISTRY.get('moonscarred-werewolf');
  assert.equal(back.support.status, 'limited');
  assert.equal(back.artId, 485, 'tył ma własny artId ze słownika');
  // Curse: aura Enchant player; Negate: instant; Emissary: artifact creature.
  assert.equal(REGISTRY.get('curse-of-the-pierced-heart').aura.enchant, 'player');
  assert.deepEqual(REGISTRY.get('emissary-escort').types, ['Artifact', 'Creature']);
  assert.equal(REGISTRY.get('negate').spell.targets[0].type, 'noncreature_spell_on_stack');
  // Snarling Wolf: raz na turę.
  assert.equal(REGISTRY.get('snarling-wolf').abilities[0].oncePerTurn, true);
});

test('materializacja przenosi enchantPlayer i aurę curse na obiekt gry', () => {
  const data = gameObjectDataOf(REGISTRY.get('curse-of-the-pierced-heart'));
  assert.equal(data.enchantPlayer, true);
  assert.equal(data.aura.enchant, 'player');
  assert.deepEqual(gameObjectDataOf(REGISTRY.get('negate')).colors, ['U']);
  // transformTo (deskryptor drugiej strony) buduje createCardDeck z registry.
  const state = game();
  addRealCard(state, 'vill', 'scorned-villager', 'p1', 'battlefield');
  assert.equal(state.objects.get('vill').transformTo.cardId, 'moonscarred-werewolf');
  assert.equal(state.objects.get('vill').transformTo.power, 2);
});

// --- Negate (counter noncreature spell) ------------------------------------

test('Negate: kontruje czar sorcery na stosie (target noncreature spell)', () => {
  const state = mainPhase(game(), 'p2');
  addRealCard(state, 'negate', 'negate', 'p1', 'hand');
  addMana(state, 'p1', 2);
  addRealCard(state, 'rage', 'rage-of-purphoros', 'p2', 'hand');
  addMana(state, 'p2', 5);
  addCreature(state, 'en', 'p2', 3, 3);
  // p2 rzuca Rage of Purphoros (sorcery, cel: stwór).
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'rage', targets: ['en'] }).ok);
  const rageStack = byCard(state, 'rage-of-purphoros', 'stack');
  // p2 przekazuje priorytet; p1 odpowiada Negate.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const view = playerView(state, 'p1');
  const negateCasts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'negate');
  assert.ok(negateCasts.some((c) => c.targets[0] === rageStack.id), 'Negate oferuje cel: czar na stosie');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'negate', targets: [rageStack.id] }).ok);
  passBoth(state);
  // Rage skontrowany: nie rozstrzyga się, cel nie ginie, czar w grobie.
  assert.ok(!byCard(state, 'rage-of-purphoros', 'stack'), 'Rage zniknął ze stosu');
  assert.ok(state.events.some((e) => e.type === 'spell_countered' && e.cardId === 'rage-of-purphoros'));
  assert.ok(state.objects.get('en'), 'cel Rage (3/3) przetrwał — czar nie rozstrzygnął się');
  assert.equal(state.zones.stack.length, 0, 'stos pusty po rozstrzygnięciu Negate');
  assert.ok(byCard(state, 'negate', 'graveyard'), 'Negate rozstrzygnął się i poszedł do grobu');
});

test('Negate: bez czaru na stosie nie ma legalnego celu (instant bez celu)', () => {
  const state = mainPhase(game(), 'p2');
  addRealCard(state, 'negate', 'negate', 'p1', 'hand');
  addMana(state, 'p1', 2);
  addCreature(state, 'en', 'p2', 3, 3);
  const view = playerView(state, 'p1');
  const negateCasts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'negate');
  assert.equal(negateCasts.length, 0, 'bez czaru na stosie Negate nie ma celu');
});

test('Negate: czar-stwór (bestow) nie jest celem „noncreature spell"', () => {
  const state = mainPhase(game(), 'p1');
  addRealCard(state, 'negate', 'negate', 'p2', 'hand');
  addMana(state, 'p2', 2);
  // Leafcrown Dryad z bestow — na stosie jako czar stwora (kind 'creature').
  addCreature(state, 'host', 'p1', 2, 2);
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  addMana(state, 'p1', 4); // bestow {3}{G} = 4
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] }).ok, 'bestow cast idzie na stos');
  const view = playerView(state, 'p2');
  const negateCasts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'negate');
  assert.equal(negateCasts.length, 0, 'Negate nie kontruje czaru-stwora');
});

// --- Curse of the Pierced Heart (Enchant player) ---------------------------

test('Curse: zaczarowuje gracza (wybór celu) i zadaje 1 obrażeń w jego upkeep', () => {
  const state = mainPhase(game(), 'p1');
  addRealCard(state, 'curse', 'curse-of-the-pierced-heart', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const view = playerView(state, 'p1');
  const curseCasts = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'curse');
  assert.deepEqual([...curseCasts.map((c) => c.targets[0])].sort(), ['p1', 'p2'], 'wybór celu gracza (oba gracze)');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'curse', targets: ['p2'] }).ok);
  passBoth(state);
  const curse = byCard(state, 'curse-of-the-pierced-heart', 'battlefield');
  assert.ok(curse, 'curse na bitwisku');
  assert.equal(curse.enchantedPlayerId, 'p2');
  // Upkeep p2 (zaczarowany) — 1 obrażeń.
  const p2before = state.players.find((p) => p.id === 'p2').life;
  advanceToUpkeep(state, 'p2');
  assert.equal(state.players.find((p) => p.id === 'p2').life, p2before - 1, 'zaczarowany gracz traci 1 w upkeep');
});

test('Curse: nie zadaje obrażeń w upkeep NIEZACZAROWANEGO gracza', () => {
  const state = mainPhase(game(), 'p1');
  addRealCard(state, 'curse', 'curse-of-the-pierced-heart', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'curse', targets: ['p2'] }).ok);
  passBoth(state);
  // Upkeep p1 (kontrolera, NIE zaczarowanego) — bez obrażeń.
  const p1before = state.players.find((p) => p.id === 'p1').life;
  advanceToUpkeep(state, 'p1');
  assert.equal(state.players.find((p) => p.id === 'p1').life, p1before, 'kontroler nie traci życia w swój upkeep');
});

// --- Emissary Escort (static power z mana value artefaktów) ----------------

test('Emissary Escort: +X/+0, X = największa mana value innych artefaktów kontrolera', () => {
  const state = mainPhase(game(), 'p1');
  addRealCard(state, 'esc', 'emissary-escort', 'p1', 'battlefield');
  addArtifact(state, 'a3', 'p1', 3);
  addArtifact(state, 'a5', 'p2', 5);
  // Tylko własny artefakt (mana 3); artefakt przeciwnika (mana 5) ignorowany.
  assert.equal(effectivePower(state.objects.get('esc'), state), 3);
  // Dodanie większego artefaktu podnosi X.
  addArtifact(state, 'a6', 'p1', 6);
  assert.equal(effectivePower(state.objects.get('esc'), state), 6);
  assert.equal(effectiveToughness(state.objects.get('esc'), state), 4, 'wytrzymałość bez zmian');
});

test('Emissary Escort: bez innych artefaktów dostaje +0/+0', () => {
  const state = mainPhase(game(), 'p1');
  addRealCard(state, 'esc', 'emissary-escort', 'p1', 'battlefield');
  assert.equal(effectivePower(state.objects.get('esc'), state), 0);
});

// --- Snarling Wolf (activate only once each turn) --------------------------

test('Snarling Wolf: {1}{G}: +2/+2 do końca tury, tylko raz na turę', () => {
  const state = mainPhase(game(), 'p1');
  addRealCard(state, 'wolf', 'snarling-wolf', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  const before = effectivePower(state.objects.get('wolf'), state);
  assert.equal(before, 1);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'wolf', abilityIndex: 0 }).ok);
  assert.equal(effectivePower(state.objects.get('wolf'), state), 3, '+2/+2 po aktywacji');
  // Druga aktywacja nie jest oferowana (once per turn).
  const view = playerView(state, 'p1');
  const wolfActs = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'wolf');
  assert.equal(wolfActs.length, 0, '„activate only once each turn" — druga aktywacja niedostępna');
  assert.equal(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'wolf', abilityIndex: 0 }).ok, false);
});

// --- Scorned Villager (transform + mana) -----------------------------------

test('Scorned Villager: {T}: Add {G} produkuje manę', () => {
  const state = mainPhase(game(), 'p1');
  addRealCard(state, 'vill', 'scorned-villager', 'p1', 'battlefield');
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'vill', abilityIndex: 0 }).ok);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, manaBefore + 1, '{T}: Add {G} → +1 mana');
});

test('Scorned Villager: transform do Moonscarred Werewolf po upkeepu bez czarów', () => {
  const state = game();
  addRealCard(state, 'vill', 'scorned-villager', 'p1', 'battlefield');
  // Poprzednia tura: żaden czar nie został rzucony.
  state.lastTurnSpellsCast = 0;
  advanceToUpkeep(state, 'p1');
  assert.equal(state.objects.get('vill').cardId, 'moonscarred-werewolf', 'transform do tyłu');
  const back = state.objects.get('vill');
  assert.equal(back.power, 2);
  assert.equal(back.toughness, 2);
  assert.equal(back.keywords.includes('vigilance'), true, 'tył ma vigilance');
  assert.ok(state.events.some((e) => e.type === 'object_transformed'));
  // Mana tyłu: {T}: Add {G}{G} → +2.
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'vill', abilityIndex: 0 }).ok);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, manaBefore + 2, 'tył: {T}: Add {G}{G} → +2 mana');
});

test('Scorned Villager: transform wstecz po upkeepie z 2+ czarami', () => {
  const state = game();
  addRealCard(state, 'vill', 'moonscarred-werewolf', 'p1', 'battlefield');
  state.lastTurnSpellsCast = 2;
  advanceToUpkeep(state, 'p1');
  assert.equal(state.objects.get('vill').cardId, 'scorned-villager', 'transform z powrotem na przód');
});
