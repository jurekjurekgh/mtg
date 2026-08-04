import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower } from '../src/engine/permanents.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Batch 12 realnych kart (ADR 0010 §2a) — pełne mechaniki (decyzja właściciela
 * 2026-08-03: każda karta w 100% mechanik):
 * - Grave Exchange (AVR): sorcery — powrót stwora-karty z własnego grobu do
 *   ręki + docelowy gracz poświęca stwora WŁASNEGO wyboru (blokująca decyzja
 *   resolve_sacrifice_choice, jak scry/surveil);
 * - Hysterical Blindness (ISD): instant — stwory przeciwnika dostają -4/-0
 *   do końca tury (globalny modyfikator);
 * - Barkform Harvester (BLB): artifact creature — changeling, reach,
 *   aktywowana zdolność {2}: karta z własnego grobu na spód biblioteki;
 * - Undead Servant (ORI): ETB tworzy 2/2 Zombie token za każdą inną kopię
 *   Undead Servant w grobie kontrolera;
 * - Rage of Purphoros (THS): sorcery — 4 obrażeń do docelowego stwora,
 *   „can't be regenerated\" (bez efektu — regeneracji nie ma w engine),
 *   Scry 1 (blokująca decyzja).
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
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, plot: data.plot ?? null, plotted: data.plotted ?? false,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, keywords = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-razorback', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
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

// --- Dane i materializacja -------------------------------------------------

test('Batch 12: pięć kart ma właściwe dane i status supported', () => {
  const expected = [
    ['grave-exchange', null, null, 6],
    ['hysterical-blindness', null, null, 3],
    ['barkform-harvester', 2, 3, 3],
    ['undead-servant', 3, 2, 4],
    ['rage-of-purphoros', null, null, 5],
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
  // Barkform: changeling + reach; Undead Servant z setem ORI (druk Origins).
  assert.deepEqual(REGISTRY.get('barkform-harvester').keywords, ['reach', 'changeling']);
  assert.equal(REGISTRY.get('undead-servant').set, 'ORI');
  assert.deepEqual(REGISTRY.get('barkform-harvester').types, ['Artifact', 'Creature']);
  // Token Zombie Undead Servanta — nie taliowalny.
  assert.equal(REGISTRY.get('token_zombie').support.status, 'limited');
  assert.deepEqual(REGISTRY.get('token_zombie').colors, ['B']);
  assert.equal(REGISTRY.get('token_zombie').power, 2);
  assert.equal(REGISTRY.get('token_zombie').toughness, 2);
});

test('materializacja przenosi dane nowych kart na obiekt gry', () => {
  const spell = gameObjectDataOf(REGISTRY.get('grave-exchange'));
  assert.equal(spell.kind, 'spell');
  assert.equal(spell.spell.targets.length, 2);
  assert.equal(spell.spell.targets[0].type, 'creature_card_in_graveyard');
  assert.equal(spell.spell.targets[1].type, 'player');
  assert.deepEqual(gameObjectDataOf(REGISTRY.get('hysterical-blindness')).colors, ['U']);
  const bark = gameObjectDataOf(REGISTRY.get('barkform-harvester'));
  assert.equal(bark.kind, 'creature');
  assert.equal(bark.abilities[0].targets[0].type, 'card_in_graveyard');
});

// --- Hysterical Blindness --------------------------------------------------

test('Hysterical Blindness: stwory przeciwnika dostają -4/-0 do końca tury', () => {
  const state = mainPhase(game());
  addCreature(state, 'own', 'p1', 3, 3);
  addCreature(state, 'en', 'p2', 4, 4);
  addRealCard(state, 'hb', 'hysterical-blindness', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'hb', targets: [] }).ok);
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('own'), state), 3, 'własny stwór bez zmian');
  assert.equal(effectivePower(state.objects.get('en'), state), 0, 'przeciwnik 4 - 4 = 0');
  // Ujemna moc nie zabija stwora — wciąż na bitwisku.
  assert.equal(state.objects.get('en').zone, 'battlefield');
});

test('Hysterical Blindness: stwór o ujemnej mocy zadaje 0 obrażeń w combat', () => {
  const state = game();
  // p2 ma 2/2 (po -4/-0 ma moc -2); p1 rzuca Hysterical Blindness.
  addCreature(state, 'att', 'p2', 2, 2);
  addRealCard(state, 'hb', 'hysterical-blindness', 'p1', 'hand');
  addMana(state, 'p1', 3);
  mainPhase(state, 'p1');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'hb', targets: [] }).ok);
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('att'), state), -2, '2/2 po -4/-0 ma moc -2');
  // Ustawiamy combat: p2 atakuje stworami o ujemnej mocy.
  state.turn = jumpToStep({ ...initialTurn('p2') }, 'declare_attackers', 'p2');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['att'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} }).ok);
  const result = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(result.ok, true, JSON.stringify(result.events));
  // Regresja (CR 510.1): ujemna moc zadaje 0 obrażeń, nie ujemne — p1 nic nie traci.
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.life, 20, 'atak mocy -2 nie zadaje obrażeń');
  assert.ok(!result.events.some((e) => e.type === 'damage_dealt' && e.amount < 0), 'brak ujemnych obrażeń');
});

// --- Rage of Purphoros -----------------------------------------------------

test('Rage of Purphoros: 4 obrażeń do stwora + Scry 1 (blokująca decyzja)', () => {
  const state = mainPhase(game());
  addCreature(state, 'en', 'p2', 3, 3);
  addRealCard(state, 'rage', 'rage-of-purphoros', 'p1', 'hand');
  addMana(state, 'p1', 5);
  addRealCard(state, 'lib1', 'basic-forest', 'p1', 'library');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rage', targets: ['en'] }).ok);
  const res = passBoth(state);
  // 3/3 stwór bierze 4 obrażenia → ginie (SBA po komendzie).
  assert.ok(state.events.some((event) => event.type === 'damage_dealt' && event.target === 'en' && event.amount === 4));
  assert.equal(state.objects.get('en'), undefined, '3/3 po 4 obrażeniach ginie');
  // Scry 1 jest ostatnim efektem — blokuje grę do resolve_scry.
  assert.ok(state.pendingScry, 'scry czeka na decyzję');
  assert.equal(state.pendingScry.objectIds.length, 1);
  assert.ok(execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: [] }).ok);
  assert.equal(state.pendingScry, null);
  assert.ok(res.events.some((event) => event.type === 'scry_started'));
  // Regresja: scry jako OSTATNI efekt czaru musi dokończyć czar po decyzji —
  // inaczej sorcery zostaje na stosie z pendingSpell na zawsze (Rage jest
  // pierwszym czarem, którego ostatnim efektem jest blokujący scry).
  assert.equal(state.pendingSpell, null, 'po resolve_scry czar jest dokończony');
  assert.ok(byCard(state, 'rage-of-purphoros', 'graveyard'), 'Rage of Purphoros trafia do grobu po scry');
  assert.equal(state.zones.stack.length, 0, 'stos pusty po dokończeniu czaru');
});

test('Rage of Purphoros: nielegalny cel (brak stwora) odrzuca rzucenie', () => {
  const state = mainPhase(game());
  addRealCard(state, 'rage', 'rage-of-purphoros', 'p1', 'hand');
  addMana(state, 'p1', 5);
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rage', targets: [] }).ok, false);
});

// --- Barkform Harvester ----------------------------------------------------

test('Barkform Harvester: {2}: karta z własnego grobu na spód biblioteki', () => {
  const state = mainPhase(game());
  addRealCard(state, 'bark', 'barkform-harvester', 'p1', 'battlefield');
  addRealCard(state, 'gcard', 'goblin-piker', 'p1', 'graveyard');
  addRealCard(state, 'libTop', 'basic-forest', 'p1', 'library');
  addMana(state, 'p1', 2);
  const view = playerView(state, 'p1');
  const acts = view.legalCommands.filter((cmd) => cmd.type === 'activate_ability');
  assert.ok(acts.some((cmd) => cmd.targets?.includes('gcard')), 'zdolność oferuje cel z grobu');
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bark', abilityIndex: 0, targets: ['gcard'] });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  const inLib = byCard(state, 'goblin-piker', 'library');
  assert.ok(inLib, 'karta trafiła do biblioteki');
  assert.equal(state.zones.library[state.zones.library.length - 1], inLib.id, 'na samym spodzie');
});

test('Barkform Harvester: cel spoza własnego grobu jest nielegalny', () => {
  const state = mainPhase(game());
  addRealCard(state, 'bark', 'barkform-harvester', 'p1', 'battlefield');
  addRealCard(state, 'enemyGrave', 'goblin-piker', 'p2', 'graveyard');
  addMana(state, 'p1', 2);
  // Karta w grobie PRZECIWNIKA nie jest legalnym celem zdolności.
  assert.equal(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bark', abilityIndex: 0, targets: ['enemyGrave'] }).ok, false);
});

// --- Undead Servant --------------------------------------------------------

test('Undead Servant: ETB tworzy 2/2 Zombie za każdą inną kopię w grobie', () => {
  const state = mainPhase(game());
  addRealCard(state, 'serv', 'undead-servant', 'p1', 'hand');
  addMana(state, 'p1', 4);
  addRealCard(state, 'g1', 'undead-servant', 'p1', 'graveyard');
  addRealCard(state, 'g2', 'undead-servant', 'p1', 'graveyard');
  // Token Zombie w grobie NIE jest liczony (inny cardId).
  addRealCard(state, 'g3', 'token_zombie', 'p1', 'graveyard');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'serv' }).ok);
  const zombies = [...state.objects.values()].filter((o) => o.cardId === 'token_zombie' && o.zone === 'battlefield');
  assert.equal(zombies.length, 2, 'dokładnie 2 Zombie (2 kopie w grobie, token nie liczony)');
  for (const zombie of zombies) {
    assert.equal(zombie.power, 2);
    assert.equal(zombie.toughness, 2);
  }
  assert.deepEqual(REGISTRY.get('token_zombie').colors, ['B'], 'token jest czarny wg definicji');
  assert.ok(state.events.some((event) => event.type === 'token_created'));
});

test('Undead Servant bez kopii w grobie nie tworzy tokenów', () => {
  const state = mainPhase(game());
  addRealCard(state, 'serv', 'undead-servant', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'serv' }).ok);
  const zombies = [...state.objects.values()].filter((o) => o.cardId === 'token_zombie' && o.zone === 'battlefield');
  assert.equal(zombies.length, 0);
});

// --- Grave Exchange --------------------------------------------------------

test('Grave Exchange: powrót stwora do ręki + docelowy gracz poświęca stwora', () => {
  const state = mainPhase(game());
  addRealCard(state, 'grave', 'grave-exchange', 'p1', 'hand');
  addMana(state, 'p1', 6);
  addRealCard(state, 'graveCard', 'goblin-piker', 'p1', 'graveyard');
  addCreature(state, 'own', 'p1', 5, 5);
  addCreature(state, 'foe', 'p2', 3, 3);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'grave', targets: ['graveCard', 'p2'] }).ok);
  const res = passBoth(state);
  // Pierwszy efekt: stwór-karta z grobu wraca do ręki rzucającego.
  assert.ok(byCard(state, 'goblin-piker', 'hand'), 'stwór z grobu wraca do ręki');
  assert.ok(res.events.some((event) => event.type === 'object_moved' && event.fromZone === 'graveyard' && event.toZone === 'hand'));
  // Drugi efekt: docelowy gracz (p2) musi poświęcić stwora — blokująca decyzja.
  assert.ok(state.pendingSacrifice, 'decyzja poświęcenia czeka');
  assert.equal(state.pendingSacrifice.playerId, 'p2');
  assert.deepEqual([...state.pendingSacrifice.candidateIds].sort(), ['foe'].sort(), 'kandydaci = stwory p2');
  // Pass zablokowany; decyzja należy do p2.
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, false);
  assert.equal(execute(state, { type: 'resolve_sacrifice_choice', playerId: 'p1', targetId: 'foe' }).ok, false);
  const view = playerView(state, 'p2');
  const choices = view.legalCommands.filter((cmd) => cmd.type === 'resolve_sacrifice_choice');
  assert.equal(choices.length, 1, 'PlayerView oferuje wybór poświęcanego stwora');
  assert.ok(execute(state, { type: 'resolve_sacrifice_choice', playerId: 'p2', targetId: 'foe' }).ok);
  assert.equal(state.objects.get('foe'), undefined, 'p2 poświęcił stwora');
  assert.equal(state.pendingSacrifice, null);
  // Czar (sorcery) po decyzji trafia do grobu.
  assert.ok(byCard(state, 'grave-exchange', 'graveyard'));
});

test('Grave Exchange: cel spoza własnego grobu nielegalny', () => {
  const state = mainPhase(game());
  addRealCard(state, 'grave', 'grave-exchange', 'p1', 'hand');
  addMana(state, 'p1', 6);
  // Stwór w grobie PRZECIWNIKA nie jest celem „from your graveyard".
  addRealCard(state, 'enemyGrave', 'goblin-piker', 'p2', 'graveyard');
  addCreature(state, 'foe', 'p2', 3, 3);
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'grave', targets: ['enemyGrave', 'p2'] }).ok, false);
});

test('Grave Exchange: docelowy gracz bez stworów nie poświęca niczego', () => {
  const state = mainPhase(game());
  addRealCard(state, 'grave', 'grave-exchange', 'p1', 'hand');
  addMana(state, 'p1', 6);
  addRealCard(state, 'graveCard', 'goblin-piker', 'p1', 'graveyard');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'grave', targets: ['graveCard', 'p2'] }).ok);
  passBoth(state);
  assert.equal(state.pendingSacrifice, null, 'brak stworów = brak decyzji');
  assert.ok(byCard(state, 'goblin-piker', 'hand'), 'powrót do ręki nadal działa');
});

