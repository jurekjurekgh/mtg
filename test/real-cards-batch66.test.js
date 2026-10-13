// Batch 66 (2026-10-13) — karty właściciela: 351 ELD, 353 OGW,
// 356 OTC, 357 MM2, 359 M19, 361 ZEN, 363 THS, 364 KTK, 365 SNC,
// 368 ZEN. Plan: docs/plans/PLAN_2026-10-13-batch66-kolekcja-351-368.md.
//
// Dane Oracle i rulingi: docs/cards/scryfall-*.json (dokładny druk `set=`,
// pobrane 2026-10-13). Każda karta ma sanity + legalny i nielegalny pin;
// Cazur, Lorescale, Rakish i Scythe mają dodatkową macierz lifetime/granic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView, moveObjectDirectly,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { processTriggers } from '../src/engine/triggers.js';
import {
  clearStatModifiers, effectiveAbilities,
} from '../src/engine/permanents.js';
import { getSourceForObject, isPureManaAbilityCommand } from '../src/engine/mana-sources.js';
import { linkedExileCastPermission } from '../src/engine/linked-exile-cast.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { manaSourcesOf, untappedLandSourcesOf } from '../src/table/mana-wizard.js';
import {
  cardInfo, commandLabel, isManaAbilityCommand, rulesText, waitingExileStatus,
} from '../src/table/render.js';
import { drawPlayerCards, dealNonCombatDamage } from '../src/engine/effects.js';
import { legalBlockerOptions } from '../src/engine/combat.js';
import {
  resolveUntilDecision, optionalTriggerOpen, triggerTargetOpen,
} from './helpers/deferred-trigger.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 66, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) {
    for (let i = 0; i < 8; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  }
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  if (Object.keys(patch).length > 0) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
const find = (state, cardId, zone = 'battlefield') => [...state.objects.values()]
  .find((object) => object.cardId === cardId && object.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));
const player = (state, playerId) => state.players.find((entry) => entry.id === playerId);

function run(state, command) {
  assert.ok(command, 'oferta komendy istnieje');
  const result = execute(state, command);
  assert.ok(result.ok, `${result.reason ?? 'odrzucono'}: ${JSON.stringify(result.events ?? [])}`);
  return result;
}

/** Rozstrzyga stos oraz proste, niekontrowersyjne decyzje (pierwsza oferta). */
function settle(state, max = 80) {
  for (let i = 0; i < max; i += 1) {
    const choices = commands(state);
    const resolving = choices.find((command) => command.type.startsWith('resolve_'));
    if (resolving) {
      run(state, resolving);
      continue;
    }
    if (state.zones.stack.length === 0) return;
    const pass = choices.find((command) => command.type === 'pass_priority');
    assert.ok(pass, 'stos ma legalny pass priority');
    run(state, pass);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

function sanity(id, { set, plan, artId, snapshot = id }) {
  const def = registry.get(id);
  const snap = snapshotOf(snapshot);
  assert.ok(def, `${id} istnieje w rejestrze`);
  assert.equal(def.oracleText, snap.oracle_text, 'Oracle 1:1 ze snapshotem Scryfalla');
  assert.equal(def.set, set);
  assert.equal(def.plan, plan, 'plan właściciela jest wiążący');
  assert.equal(def.artId, artId);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(MANA_COSTS[id], snap.mana_cost, 'koszt w MANA_COSTS = dokładny druk');
  assert.equal(snap.print, set.toLowerCase());
  assert.ok(Array.isArray(snap.rulings), 'rulingi zapisane, także pusta lista');
  assert.ok(def.imageUri.includes(snap.image_uris.large.split('/').pop().split('.')[0]),
    'imageUri pochodzi z dokładnego druku');
  return def;
}

function enterAndScan(state, objectId) {
  const object = state.objects.get(objectId);
  processTriggers(state, [{ type: 'permanent_entered_battlefield', object }]);
}

function castFromHand(state, objectId, type = 'cast_permanent') {
  const command = commands(state).find((entry) => entry.type === type && entry.objectId === objectId);
  run(state, command);
  return command;
}

// ---- B66/351: Sporecap Spider ----------------------------------------------

test('B66/351: Sporecap Spider — dane Oracle ELD, 1/5 Spider z reach', () => {
  const def = sanity('sporecap-spider', { set: 'ELD', plan: 'Eldraine', artId: 351 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Spider']);
  assert.deepEqual(def.colors, ['G']);
  assert.deepEqual(def.keywords, ['reach']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 5);
  assert.equal(def.manaCost, 3);
});

test('B66/351: reach pozwala blokować flying, zwykły naziemny stwór nie może', () => {
  const state = game();
  put(state, 'flyer', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'spider', 'sporecap-spider', 'p2', 'battlefield', { summoningSickness: false });
  put(state, 'ground', 'druid-of-the-cowl', 'p2', 'battlefield', { summoningSickness: false });
  state.combat = { attackers: ['flyer'], assignments: {}, defendingPlayerId: 'p2' };
  const options = legalBlockerOptions(state, 'p2');
  assert.ok(options.some((assignment) => (assignment.flyer ?? []).includes('spider')),
    'reach jest legalnym blokerem flying');
  assert.ok(options.every((assignment) => !(assignment.flyer ?? []).includes('ground')),
    'stwór bez flying/reach nie jest oferowany');
});

// ---- B66/353: Warden of Geometries -----------------------------------------

test('B66/353: Warden of Geometries — vigilance i deskryptor {T}: Add {C}', () => {
  const def = sanity('warden-of-geometries', { set: 'OGW', plan: 'Zendikar', artId: 353 });
  assert.deepEqual(def.subtypes, ['Eldrazi', 'Drone']);
  assert.deepEqual(def.colors, []);
  assert.deepEqual(def.keywords, ['vigilance']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 4);
  assert.equal(def.abilities.length, 1);
  assert.equal(def.abilities[0].type, 'activated');
  assert.deepEqual(def.abilities[0].cost, { tap: true });
  assert.deepEqual(def.abilities[0].effect,
    { type: 'add_mana', amount: 1, colors: [] });
});

test('B66/353: vigilance zachowuje Warden odtapniętego po ataku; potem daje bezbarwną manę', () => {
  const state = game();
  put(state, 'warden', 'warden-of-geometries', 'p1', 'battlefield', {
    summoningSickness: false, tapped: false,
  });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['warden'] });
  assert.equal(state.objects.get('warden').tapped, false, 'vigilance: atak nie tapuje');
  const mana = commands(state).find((command) => command.type === 'activate_ability'
    && command.objectId === 'warden');
  run(state, mana);
  assert.equal(player(state, 'p1').mana, 1);
  assert.equal(player(state, 'p1').manaPool[''] ?? 0, 1, 'jednostka ma profil {C}, nie kolor');
  assert.equal(state.objects.get('warden').tapped, true);
  assert.ok(!commands(state).some((command) => command.type === 'activate_ability'
    && command.objectId === 'warden'), 'tapnięte źródło nie daje drugiej many');
});

// ---- B66/356: Cazur, Ruthless Stalker --------------------------------------

test('B66/356: Cazur — dane, Partner with i per-source combat trigger', () => {
  const def = sanity('cazur-ruthless-stalker', {
    set: 'OTC', plan: 'Thunder Junction', artId: 356,
  });
  assert.deepEqual(def.types, ['Legendary', 'Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Warrior']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.equal(def.abilities.length, 2);
  const partner = def.abilities[0];
  assert.equal(partner.trigger.event, 'enter_battlefield');
  assert.deepEqual(partner.trigger.requiresTarget, { type: 'player' });
  assert.deepEqual(partner.effect, {
    type: 'search_library_to_hand', qualifier: { name: 'Ukkima, Stalking Shadow' },
    playerFromTarget: true,
  });
  const damage = def.abilities[1];
  assert.equal(damage.trigger.event, 'any_combat_damage_to_player');
  assert.equal(damage.trigger.groupPer, undefined, 'bez grupowania „one or more”');
  assert.equal(damage.trigger.perEvent, true, 'jawna deklaracja pojedynczego zdarzenia');
  assert.deepEqual(damage.effect, {
    type: 'add_counter', counter: '+1/+1', amount: 1,
    targetFromContext: 'damageSourceId',
  });
  const rulings = snapshotOf('cazur-ruthless-stalker').rulings;
  assert.equal(rulings.length, 8);
  assert.ok(rulings.some((ruling) => /target another player who might have that card/i.test(ruling.comment)),
    'ruling target-player Partner with zapisany');
});

test('B66/356: Partner — wybrany przeciwnik szuka we WŁASNEJ bibliotece i może znaleźć Ukkimę', () => {
  const state = game();
  put(state, 'cazur', 'cazur-ruthless-stalker', 'p1', 'battlefield');
  put(state, 'ukkima-p1', 'druid-of-the-cowl', 'p1', 'library', {
    cardId: 'synthetic-ukkima-p1', cardName: 'Ukkima, Stalking Shadow', name: 'Ukkima, Stalking Shadow',
  });
  put(state, 'ukkima-p2', 'druid-of-the-cowl', 'p2', 'library', {
    cardId: 'synthetic-ukkima-p2', cardName: 'Ukkima, Stalking Shadow', name: 'Ukkima, Stalking Shadow',
  });
  enterAndScan(state, 'cazur');
  assert.equal(triggerTargetOpen(state), true, 'cel triggera wybierany przy położeniu na stos');
  const targetP2 = commands(state).find((command) => command.type === 'resolve_trigger_target'
    && command.targetId === 'p2');
  run(state, targetP2);
  assert.equal(resolveUntilDecision(state, (s) => Boolean(s.pendingSearchChoice)), true);
  assert.equal(state.pendingSearchChoice.playerId, 'p2', 'decyzję i bibliotekę ma target player');
  const findUkkima = commands(state, 'p2').find((command) => command.type === 'resolve_search_choice'
    && command.found === 'ukkima-p2');
  run(state, findUkkima);
  assert.ok([...state.objects.values()].some((object) => object.zone === 'hand'
    && object.controllerId === 'p2' && object.cardName === 'Ukkima, Stalking Shadow'));
  assert.ok(state.objects.has('ukkima-p1'), 'Ukkima kontrolera Cazura nie została zabrana');
  assert.ok(state.events.some((entry) => entry.type === 'library_searched'
    && entry.playerId === 'p2' && entry.shuffled === true));
});

test('B66/356: combat damage dwóch własnych stworzeń daje dwa liczniki właściwym źródłom', () => {
  const state = game();
  put(state, 'cazur', 'cazur-ruthless-stalker', 'p1', 'battlefield');
  put(state, 'a', 'druid-of-the-cowl', 'p1', 'battlefield');
  put(state, 'b', 'sporecap-spider', 'p1', 'battlefield');
  processTriggers(state, [
    { type: 'damage_dealt', source: 'a', target: 'p2', amount: 1, combat: true },
    { type: 'damage_dealt', source: 'b', target: 'p2', amount: 1, combat: true },
  ]);
  assert.equal(state.zones.stack.length, 2, 'każde źródło tworzy osobny trigger');
  settle(state);
  assert.equal(state.objects.get('a').counters?.['+1/+1'], 1);
  assert.equal(state.objects.get('b').counters?.['+1/+1'], 1);
  assert.equal(state.objects.get('cazur').counters?.['+1/+1'] ?? 0, 0);
});

test('B66/356: noncombat/opponent damage nie triggeruje; zniknięte źródło daje no-op przy resolution', () => {
  const state = game();
  put(state, 'cazur', 'cazur-ruthless-stalker', 'p1', 'battlefield');
  put(state, 'mine', 'druid-of-the-cowl', 'p1', 'battlefield');
  put(state, 'theirs', 'druid-of-the-cowl', 'p2', 'battlefield');
  processTriggers(state, [
    { type: 'damage_dealt', source: 'mine', target: 'p2', amount: 1, combat: false },
    { type: 'damage_dealt', source: 'theirs', target: 'p1', amount: 1, combat: true },
  ]);
  assert.equal(state.zones.stack.length, 0, 'obie negatywne gałęzie bez triggera');
  processTriggers(state, [
    { type: 'damage_dealt', source: 'mine', target: 'p2', amount: 1, combat: true },
  ]);
  assert.equal(state.zones.stack.length, 1);
  moveObjectDirectly(state, 'mine', 'graveyard', 'grave-mine');
  settle(state);
  assert.equal(state.objects.get('grave-mine').counters?.['+1/+1'] ?? 0, 0,
    'nowy obiekt w grobie nie dostaje licznika');
});

// ---- B66/357: Lorescale Coatl ----------------------------------------------

test('B66/357: Lorescale Coatl — dane i trigger za każde własne dobranie', () => {
  const def = sanity('lorescale-coatl', { set: 'MM2', plan: 'Alara', artId: 357 });
  assert.deepEqual(def.colors, ['G', 'U']);
  assert.deepEqual(def.subtypes, ['Snake']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.abilities.length, 1);
  assert.equal(def.abilities[0].trigger.event, 'you_draw_card');
  assert.deepEqual(def.abilities[0].effect,
    { type: 'add_counter', counter: '+1/+1', amount: 1 });
  assert.equal(snapshotOf('lorescale-coatl').rulings.length, 1);
});

test('B66/357: draw two to dwa triggery i dwa liczniki', () => {
  const state = game();
  put(state, 'coatl', 'lorescale-coatl', 'p1', 'battlefield');
  const before = state.events.length;
  drawPlayerCards(state, 'p1', 2, 'test_draw_two');
  processTriggers(state, state.events.slice(before));
  assert.equal(state.zones.stack.length, 2);
  settle(state);
  assert.equal(state.objects.get('coatl').counters?.['+1/+1'], 2);
});

test('B66/357: draw przeciwnika, search-to-hand i techniczne rozdanie/mulligan nie triggerują', () => {
  const state = game();
  put(state, 'coatl', 'lorescale-coatl', 'p1', 'battlefield');
  const before = state.events.length;
  drawPlayerCards(state, 'p2', 1, 'opponent_draw');
  processTriggers(state, state.events.slice(before));
  processTriggers(state, [{
    type: 'object_moved', fromZone: 'library', toZone: 'hand', playerId: 'p1',
  }, {
    type: 'card_drawn', playerId: 'p1', drawNumberThisTurn: null, source: 'mulligan',
  }]);
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.objects.get('coatl').counters?.['+1/+1'] ?? 0, 0);
});

// ---- B66/359: Foul Orchard --------------------------------------------------

test('B66/359: Foul Orchard — tapped dual `{B}` lub `{G}`', () => {
  const def = sanity('foul-orchard', { set: 'M19', plan: 'Arcavios', artId: 359 });
  assert.deepEqual(def.types, ['Land']);
  assert.equal(def.entersTapped, true);
  assert.equal(def.abilities.length, 1);
  assert.equal(def.abilities[0].type, 'activated');
  assert.deepEqual(def.abilities[0].cost, { tap: true });
  assert.deepEqual(def.abilities[0].effect,
    { type: 'add_mana', amount: 1, colors: ['B', 'G'] });
});

test('B66/359: wchodzi tapnięty, po odtapowaniu daje profil B/G, nigdy U', () => {
  const state = game();
  put(state, 'orchard-card', 'foul-orchard', 'p1', 'hand');
  run(state, commands(state).find((command) => command.type === 'play_land'
    && command.objectId === 'orchard-card'));
  const orchard = find(state, 'foul-orchard');
  assert.ok(orchard?.tapped, 'wchodzi tapnięty');
  assert.ok(!commands(state).some((command) => command.type === 'activate_ability'
    && command.objectId === orchard.id), 'brak many w turze wejścia');
  state.objects.set(orchard.id, Object.freeze({ ...orchard, tapped: false }));
  run(state, commands(state).find((command) => command.type === 'activate_ability'
    && command.objectId === orchard.id));
  assert.equal(player(state, 'p1').mana, 1);
  assert.equal(player(state, 'p1').manaPool.BG ?? 0, 1);
  assert.equal(player(state, 'p1').manaPool.U ?? 0, 0);
});

// ---- B66/361: Noble Vestige -------------------------------------------------

test('B66/361: Noble Vestige — flying i tap: shield 1 dla player/planeswalker', () => {
  const def = sanity('noble-vestige', { set: 'ZEN', plan: 'Kamigawa', artId: 361 });
  assert.deepEqual(def.subtypes, ['Spirit']);
  assert.deepEqual(def.keywords, ['flying']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 2);
  assert.deepEqual(def.abilities[0].cost, { tap: true });
  assert.deepEqual(def.abilities[0].targets, [{ type: 'player_or_planeswalker' }]);
  assert.deepEqual(def.abilities[0].effect, { type: 'prevent_next_damage', amount: 1 });
});

test('B66/361: shield gracza zapobiega dokładnie następnemu 1 damage i się zużywa', () => {
  const state = game();
  put(state, 'vestige', 'noble-vestige', 'p1', 'battlefield', { tapped: false });
  put(state, 'damage-source', 'druid-of-the-cowl', 'p2', 'battlefield');
  const activate = commands(state).find((command) => command.type === 'activate_ability'
    && command.objectId === 'vestige' && command.targets?.[0] === 'p2');
  run(state, activate);
  settle(state);
  assert.equal(state.damageShields.length, 1);
  dealNonCombatDamage(state, state.objects.get('damage-source'), 'p2', 2);
  assert.equal(player(state, 'p2').life, 19, '2 pomniejszone o shield 1');
  assert.equal(state.damageShields.length, 0, 'shield zużyty');
  dealNonCombatDamage(state, state.objects.get('damage-source'), 'p2', 1);
  assert.equal(player(state, 'p2').life, 18, 'kolejne damage przechodzi w całości');
});

test('B66/361: planeswalker i player są celami, creature nie; tapnięte źródło bez oferty', () => {
  const state = game();
  put(state, 'vestige', 'noble-vestige', 'p1', 'battlefield', { tapped: false });
  put(state, 'walker', 'universal-solvent', 'p1', 'battlefield', {
    kind: 'planeswalker', types: ['Planeswalker'], counters: { loyalty: 4 },
  });
  put(state, 'creature', 'druid-of-the-cowl', 'p1', 'battlefield');
  const offers = commands(state).filter((command) => command.type === 'activate_ability'
    && command.objectId === 'vestige');
  assert.ok(offers.some((command) => command.targets?.[0] === 'walker'));
  assert.ok(offers.some((command) => command.targets?.[0] === 'p1'));
  assert.ok(offers.every((command) => command.targets?.[0] !== 'creature'));
  state.objects.set('vestige', Object.freeze({ ...state.objects.get('vestige'), tapped: true }));
  assert.ok(!commands(state).some((command) => command.type === 'activate_ability'
    && command.objectId === 'vestige'));
});

// ---- B66/363: Wild Celebrants ----------------------------------------------

test('B66/363: Wild Celebrants — ETB may destroy target artifact', () => {
  const def = sanity('wild-celebrants', {
    set: 'THS', plan: 'Forgotten Realms', artId: 363,
  });
  assert.equal(def.power, 5);
  assert.equal(def.toughness, 3);
  assert.equal(def.abilities.length, 1);
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].trigger.mayFire, true);
  assert.deepEqual(def.abilities[0].trigger.requiresTarget, { type: 'artifact' });
  assert.deepEqual(def.abilities[0].effect, { type: 'destroy_permanent' });
});

function wildChoiceState() {
  const state = game();
  put(state, 'wild', 'wild-celebrants', 'p1', 'battlefield');
  put(state, 'artifact', 'universal-solvent', 'p2', 'battlefield');
  put(state, 'enchantment', 'true-conviction', 'p2', 'battlefield');
  enterAndScan(state, 'wild');
  const target = commands(state).find((command) => command.type === 'resolve_trigger_target'
    && command.targetId === 'artifact');
  assert.ok(target, 'artifact jest legalnym celem');
  assert.ok(!commands(state).some((command) => command.type === 'resolve_trigger_target'
    && command.targetId === 'enchantment'), 'enchantment nie jest celem Celebrants');
  run(state, target);
  assert.equal(resolveUntilDecision(state, optionalTriggerOpen), true,
    'wybór may zapada dopiero przy resolution');
  return state;
}

test('B66/363: potwierdzenie may niszczy wskazany artifact', () => {
  const state = wildChoiceState();
  run(state, commands(state).find((command) => command.type === 'resolve_optional_trigger_choice'
    && command.fire === true));
  assert.ok(find(state, 'universal-solvent', 'graveyard'));
  assert.ok(find(state, 'true-conviction', 'battlefield'));
});

test('B66/363: odmowa may zachowuje artifact; brak artifactu nie tworzy celu', () => {
  const state = wildChoiceState();
  run(state, commands(state).find((command) => command.type === 'pass_priority'));
  assert.ok(find(state, 'universal-solvent', 'battlefield'));
  const empty = game();
  put(empty, 'wild', 'wild-celebrants', 'p1', 'battlefield');
  put(empty, 'enchantment', 'true-conviction', 'p2', 'battlefield');
  enterAndScan(empty, 'wild');
  assert.equal(empty.pendingTriggerTargets.length, 0);
  assert.equal(empty.zones.stack.length, 0, 'obowiązkowy target nie istnieje — trigger bez stosu');
});

// ---- B66/364: Naturalize ----------------------------------------------------

test('B66/364: Naturalize — dokładny instant {1}{G}, artifact_or_enchantment', () => {
  const def = sanity('naturalize', { set: 'KTK', plan: 'Kaldheim', artId: 364 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.targets, [{ type: 'artifact_or_enchantment' }]);
  assert.deepEqual(def.spell.effects, [{ type: 'destroy_permanent' }]);
});

test('B66/364: niszczy artifact; zwykły creature/land nie jest legalnym celem', () => {
  const state = game();
  put(state, 'naturalize', 'naturalize', 'p1', 'hand');
  put(state, 'artifact', 'universal-solvent', 'p2', 'battlefield');
  put(state, 'creature', 'druid-of-the-cowl', 'p2', 'battlefield');
  put(state, 'land', 'basic-forest', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const offers = commands(state).filter((command) => command.type === 'cast_spell'
    && command.objectId === 'naturalize');
  assert.ok(offers.some((command) => command.targets?.[0] === 'artifact'));
  assert.ok(offers.every((command) => command.targets?.[0] !== 'creature'));
  assert.ok(offers.every((command) => command.targets?.[0] !== 'land'));
  run(state, offers.find((command) => command.targets?.[0] === 'artifact'));
  settle(state);
  assert.ok(find(state, 'universal-solvent', 'graveyard'));
  assert.ok(find(state, 'druid-of-the-cowl', 'battlefield'));
});

test('B66/364: zniknięcie jedynego celu przed resolution daje no-op', () => {
  const state = game();
  put(state, 'naturalize', 'naturalize', 'p1', 'hand');
  put(state, 'artifact', 'universal-solvent', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['G'] });
  castFromHand(state, 'naturalize', 'cast_spell');
  moveObjectDirectly(state, 'artifact', 'graveyard', 'grave-artifact');
  settle(state);
  assert.ok(find(state, 'naturalize', 'graveyard'), 'czar schodzi normalnie');
  assert.ok(state.objects.has('grave-artifact'), 'nowy obiekt celu nie został ponownie zniszczony');
});

// ---- B66/365: Rakish Revelers ----------------------------------------------

test('B66/365: Rakish Revelers — dane, ETB Citizen i aktywacja tylko z ręki', () => {
  const def = sanity('rakish-revelers', { set: 'SNC', plan: 'New Capenna', artId: 365 });
  assert.deepEqual(def.subtypes, ['Elf', 'Druid', 'Rogue']);
  assert.deepEqual(def.colors, ['G', 'R', 'W']);
  assert.equal(def.power, 5);
  assert.equal(def.toughness, 3);
  assert.equal(def.abilities.length, 2);
  assert.deepEqual(def.abilities[0].effect, {
    type: 'create_token', cardId: 'token_citizen', name: 'Citizen',
    kind: 'creature', power: 1, toughness: 1, colors: ['G', 'W'],
    types: ['Creature'], subtypes: ['Citizen'],
  });
  const handAbility = def.abilities[1];
  assert.equal(handAbility.type, 'activated');
  assert.equal(handAbility.fromHand, true);
  assert.deepEqual(handAbility.cost, { mana: 2, exileSelfFromHand: true });
  assert.deepEqual(handAbility.targets, [{ type: 'land' }]);
  assert.equal(handAbility.effect.type, 'grant_abilities');
  assert.equal(handAbility.effect.duration, 'until_source_cast_from_exile');
  assert.equal(handAbility.effect.abilities.length, 1);
  const granted = handAbility.effect.abilities[0];
  assert.equal(granted.type, 'activated');
  assert.deepEqual(granted.cost, { tap: true });
  assert.deepEqual(granted.effect,
    { type: 'add_mana', amount: 1, colors: ['R', 'G', 'W'] });
  assert.equal(snapshotOf('rakish-revelers').rulings.length, 2);
});

test('B66/365: token Citizen jest dokładnie 1/1 G/W bez podtypu Human', () => {
  const token = registry.get('token_citizen');
  assert.ok(token);
  assert.deepEqual(token.types, ['Creature', 'Token']);
  assert.deepEqual(token.subtypes, ['Citizen']);
  assert.deepEqual(token.colors, ['G', 'W']);
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  assert.equal(token.support.status, 'token');
  assert.ok(token.imageUri.includes('3f03e9fe-cb71-498e-bf16-5af6af37a192'));

  const state = game();
  put(state, 'revelers', 'rakish-revelers', 'p1', 'battlefield');
  enterAndScan(state, 'revelers');
  settle(state);
  const made = find(state, 'token_citizen');
  assert.ok(made);
  assert.deepEqual(made.subtypes, ['Citizen']);
  assert.equal(made.power, 1);
  assert.equal(made.toughness, 1);
});

function activateRakish(state) {
  put(state, 'land', 'basic-forest', 'p1', 'battlefield', { tapped: false });
  put(state, 'rakish', 'rakish-revelers', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: [] });
  const activation = commands(state).find((command) => command.type === 'activate_ability'
    && command.objectId === 'rakish' && command.targets?.[0] === 'land');
  run(state, activation);
  assert.ok(!state.objects.has('rakish'), 'koszt przenosi stary obiekt z ręki do exile');
  const exiledBeforeResolution = find(state, 'rakish-revelers', 'exile');
  assert.ok(exiledBeforeResolution, 'nowy obiekt źródła czeka w exile');
  settle(state);
  return find(state, 'rakish-revelers', 'exile');
}

function rakishGrant(state) {
  return effectiveAbilities(state.objects.get('land'), state).find((ability) =>
    ability.effect?.type === 'add_mana'
    && JSON.stringify(ability.effect.colors) === JSON.stringify(['R', 'G', 'W']));
}

test('B66/365: {2}, exile z ręki — grant na target land i bezterminowa oferta cast z exile', () => {
  const state = game();
  const exiled = activateRakish(state);
  assert.ok(rakishGrant(state), 'land dostał deskryptor R/G/W');
  addMana(state, 'p1', 5, { colors: ['R', 'G', 'W'] });
  assert.ok(commands(state).some((command) => command.type === 'cast_permanent'
    && command.objectId === exiled.id), 'dokładnie linkowany obiekt można rzucić z exile');

  const noPermission = game();
  put(noPermission, 'other', 'rakish-revelers', 'p1', 'hand');
  const moved = moveObjectDirectly(noPermission, 'other', 'exile', 'exile-other');
  addMana(noPermission, 'p1', 5, { colors: ['R', 'G', 'W'] });
  assert.ok(!commands(noPermission).some((command) => command.type === 'cast_permanent'
    && command.objectId === moved.id), 'zwykły obiekt w exile nie ma pozwolenia');
});

test('B66/365: grant przeżywa cleanup, a jego mana może opłacić samego Revelers', () => {
  const state = game();
  const exiled = activateRakish(state);
  clearStatModifiers(state);
  assert.ok(rakishGrant(state), 'duration linkowana nie znika w cleanup');
  // Cztery jednostki: {R}, {G}, {C}, {C}; brak {W}. Piątą i brakujący pip
  // musi dać właśnie nadana landowi zdolność R/G/W (ruling 2022-04-29).
  addMana(state, 'p1', 1, { colors: ['R'] });
  addMana(state, 'p1', 1, { colors: ['G'] });
  addMana(state, 'p1', 2, { colors: [] });
  const cast = commands(state).find((command) => command.type === 'cast_permanent'
    && command.objectId === exiled.id);
  assert.ok(cast, 'Mana Wizard uwzględnia grant przy ofercie');
  run(state, cast);
  assert.equal(state.objects.get('land').tapped, true, 'auto-tap użył linkowanego landu');
  assert.ok(!rakishGrant(state), 'grant znika dopiero po zaakceptowanym rzucie');
  assert.ok(find(state, 'rakish-revelers', 'stack'), 'Revelers jest czarem na stosie');
});

test('B66/365: nieudany cast nie usuwa grantu; opuszczenie exile usuwa permission, lecz zachowuje grant', () => {
  const state = game();
  const exiled = activateRakish(state);
  const failed = execute(state, {
    type: 'cast_permanent', playerId: 'p1', objectId: exiled.id,
  });
  assert.equal(failed.ok, false, 'brak many odrzuca rzut');
  assert.ok(rakishGrant(state), 'odrzucony rzut nie konsumuje linku');
  const grave = moveObjectDirectly(state, exiled.id, 'graveyard', 'grave-rakish');
  assert.ok(rakishGrant(state), 'ruling: samo opuszczenie exile nie usuwa zdolności landu');
  const returned = moveObjectDirectly(state, grave.id, 'exile', 'exile-rakish-returned');
  addMana(state, 'p1', 5, { colors: ['R', 'G', 'W'] });
  assert.ok(!commands(state).some((command) => command.type === 'cast_permanent'
    && command.objectId === returned.id), 'nowy obiekt po powrocie nie dziedziczy permission');
});

test('B66/365: brak many/celu i źródło poza ręką nie oferują hand ability; odejście landu zeruje grant', () => {
  const noMana = game();
  put(noMana, 'land', 'basic-forest', 'p1', 'battlefield');
  put(noMana, 'rakish', 'rakish-revelers', 'p1', 'hand');
  assert.ok(!commands(noMana).some((command) => command.type === 'activate_ability'
    && command.objectId === 'rakish'), 'brak {2}');

  const noLand = game();
  put(noLand, 'rakish', 'rakish-revelers', 'p1', 'hand');
  addMana(noLand, 'p1', 2, { colors: [] });
  assert.ok(!commands(noLand).some((command) => command.type === 'activate_ability'
    && command.objectId === 'rakish'), 'brak target land');

  const wrongZone = game();
  put(wrongZone, 'land', 'basic-forest', 'p1', 'battlefield');
  put(wrongZone, 'rakish', 'rakish-revelers', 'p1', 'hand');
  addMana(wrongZone, 'p1', 2, { colors: [] });
  const fieldRakish = moveObjectDirectly(wrongZone, 'rakish', 'battlefield', 'rakish-field');
  const illegal = execute(wrongZone, {
    type: 'activate_ability', playerId: 'p1', objectId: fieldRakish.id,
    abilityIndex: 1, targets: ['land'],
  });
  assert.equal(illegal.ok, false, 'fromHand nie daje się aktywować z battlefield');
  assert.equal(find(wrongZone, 'rakish-revelers', 'battlefield')?.id, fieldRakish.id,
    'odrzucona aktywacja nie wygania źródła ani nie płaci kosztu');

  const state = game();
  activateRakish(state);
  assert.ok(rakishGrant(state));
  const oldLand = moveObjectDirectly(state, 'land', 'graveyard', 'grave-land');
  const returned = moveObjectDirectly(state, oldLand.id, 'battlefield', 'land-returned');
  assert.ok(!effectiveAbilities(returned, state).some((ability) => ability.effect?.type === 'add_mana'
    && (ability.effect.colors ?? []).includes('R')), 'nowy obiekt landu nie dziedziczy grantu');
});

test('Audyt PR #163 F-1/F-2: Mana Wizard, getSourceForObject i isPureManaAbilityCommand widzą nadany grant many', () => {
  const state = game();
  activateRakish(state);
  const view = playerView(state, 'p1');
  const untapped = untappedLandSourcesOf(view, 'p1');
  assert.equal(untapped.length, 1);
  assert.deepEqual([...untapped[0].colors].sort(), ['G', 'R', 'W'],
    'untappedLandSourcesOf musi uwzględniać manaSource z playerView (grant R/G/W)');
  const wizardSources = manaSourcesOf(view, 'p1');
  assert.deepEqual([...wizardSources[0].colors].sort(), ['G', 'R', 'W'],
    'manaSourcesOf musi widzieć nadane kolory R/G/W na kolorowym lądzie');

  // F-1b: ląd z kolorami w MANA_SOURCE_MAP (Prismari Campus {U}/{R}) po nadaniu
  // zdolności {T}: Add {R},{G},{W} zachowuje drukowane {U} (CR 611.2c).
  const campusState = game();
  put(campusState, 'campus', 'prismari-campus', 'p1', 'battlefield', { tapped: false });
  put(campusState, 'rakish', 'rakish-revelers', 'p1', 'hand');
  addMana(campusState, 'p1', 2, { colors: [] });
  run(campusState, commands(campusState).find((command) => command.type === 'activate_ability'
    && command.objectId === 'rakish' && command.targets?.[0] === 'campus'));
  settle(campusState);
  const campusSource = getSourceForObject(campusState.objects.get('campus'), campusState);
  assert.deepEqual([...campusSource.colors].sort(), ['G', 'R', 'U', 'W'],
    'Prismari Campus po grancie R/G/W nie może stracić drukowanego {U} z MANA_SOURCE_MAP');

  // F-2: czysta zdolność many nadana lądowi przez state.abilityGrants jest
  // rozpoznawana przez isPureManaAbilityCommand i filtrowana przez isManaAbilityCommand.
  const grantedCmd = view.legalCommands.find((command) => command.type === 'activate_ability'
    && command.objectId === 'land');
  assert.ok(grantedCmd, 'silnik generuje activate_ability dla nadanej zdolności many');
  assert.equal(
    isPureManaAbilityCommand(grantedCmd, state.objects.get('land'), [], state),
    true,
    'isPureManaAbilityCommand musi widzieć nadaną zdolność many przez effectiveAbilities(object, state)',
  );
  const fakeSession = {
    state,
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
  };
  assert.equal(isManaAbilityCommand(grantedCmd, fakeSession), true,
    'panel akcji i auto-pass muszą rozpoznać nadaną czystą zdolność many na lądzie');
});

test('Audyt PR #163 F-3: linkedExileCastPermission ma odznakę w wygnaniu, etykietę rzutu i działa dla Aur', () => {
  const state = game();
  const exiled = activateRakish(state);
  put(state, 'plain-exile', 'druid-of-the-cowl', 'p1', 'exile');
  addMana(state, 'p1', 5, { colors: ['R', 'G', 'W'] });
  const view = playerView(state, 'p1');
  const exileEntry = view.zones.exile.find((entry) => entry.id === exiled.id);
  const plainExileEntry = view.zones.exile.find((entry) => entry.id === 'plain-exile');
  assert.equal(plainExileEntry.linkedExileCastPermission, undefined,
    'zwykła karta w exile bez uprawnienia nie może dostawać pustego linkedExileCastPermission: {}');
  assert.equal(waitingExileStatus(plainExileEntry), '',
    'zwykła karta w exile bez uprawnienia nie może mieć odznaki rzucalności');
  assert.ok(exileEntry, 'Rakish Revelers widoczny w strefie exile');
  assert.match(waitingExileStatus(exileEntry), /Zagrywalna z wygnania/,
    'waitingExileStatus musi opisywać uprawnienie linkedExileCastPermission');
  const castCmd = view.legalCommands.find((command) => command.type === 'cast_permanent'
    && command.objectId === exiled.id);
  assert.ok(castCmd, 'oferta rzutu z wygnania istnieje');
  const fakeSession = {
    state,
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
  };
  assert.match(commandLabel(castCmd, fakeSession, view), /^Zagraj z wygnania: Rakish Revelers/,
    'przycisk rzutu z linkedExileCastPermission musi mówić „Zagraj z wygnania”');

  // F-3b: Aura w exile z linkedExileCastPermission jest oferowana i rzucalna.
  const auraState = game();
  put(auraState, 'host', 'druid-of-the-cowl', 'p1', 'battlefield');
  put(auraState, 'aura-exile', 'benevolent-blessing', 'p1', 'exile', {
    linkedExileCastPermission: linkedExileCastPermission('p1'),
  });
  addMana(auraState, 'p1', 2, { colors: ['W'] });
  const auraCast = commands(auraState, 'p1').find((command) => command.type === 'cast_permanent'
    && command.objectId === 'aura-exile' && command.targets?.[0] === 'host');
  assert.ok(auraCast, 'legalAuraCasts musi uwzględniać kartę Aury z linkedExileCastPermission');
  run(auraState, auraCast);
  assert.ok(find(auraState, 'benevolent-blessing', 'stack'), 'Aura rzucona z wygnania trafia na stos');
});

// ---- B66/368: Scythe Tiger --------------------------------------------------

test('B66/368: Scythe Tiger — 3/2 shroud i generyczne unless-sacrifice Land', () => {
  const def = sanity('scythe-tiger', { set: 'ZEN', plan: 'Wiedźmin', artId: 368 });
  assert.deepEqual(def.subtypes, ['Cat']);
  assert.deepEqual(def.keywords, ['shroud']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.abilities.length, 1);
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.deepEqual(def.abilities[0].effect, {
    type: 'sacrifice_source_unless_sacrifice', qualifier: { types: ['Land'] },
  });
});

test('B66/368: przy własnym landzie gracz poświęca land i zachowuje Tiger', () => {
  const state = game();
  put(state, 'tiger', 'scythe-tiger', 'p1', 'battlefield');
  put(state, 'land', 'basic-forest', 'p1', 'battlefield');
  put(state, 'foreign-land', 'basic-forest', 'p2', 'battlefield');
  enterAndScan(state, 'tiger');
  assert.equal(resolveUntilDecision(state, (s) => Boolean(s.pendingSacrifice)), true);
  const choices = commands(state).filter((command) => command.type === 'resolve_sacrifice_choice');
  assert.ok(choices.some((command) => command.targetId === 'land'));
  assert.ok(!choices.some((command) => command.targetId === 'foreign-land'));
  assert.equal(execute(state, {
    type: 'resolve_sacrifice_choice', playerId: 'p1', targetId: 'foreign-land',
  }).ok, false, 'ręczna próba poświęcenia obcego landu odrzucona');
  assert.ok(choices.some((command) => command.targetId === 'tiger'),
    'źródło jest jawnym wariantem niezapłacenia unless');
  run(state, choices.find((command) => command.targetId === 'land'));
  assert.ok(find(state, 'scythe-tiger', 'battlefield'));
  assert.ok(find(state, 'basic-forest', 'graveyard'));
});

test('B66/368: bez własnego landu Tiger automatycznie poświęca siebie; obcy land nie płaci', () => {
  const state = game();
  put(state, 'tiger', 'scythe-tiger', 'p1', 'battlefield');
  put(state, 'foreign-land', 'basic-forest', 'p2', 'battlefield');
  enterAndScan(state, 'tiger');
  settle(state);
  assert.ok(find(state, 'scythe-tiger', 'graveyard'));
  assert.ok(state.objects.has('foreign-land'), 'nie można poświęcić permanenta przeciwnika');
  assert.equal(state.pendingSacrifice, null);
});

test('B66/368: shroud blokuje celowanie, ale nie bezcelowe poświęcenie z unless', () => {
  const state = game();
  put(state, 'tiger', 'scythe-tiger', 'p1', 'battlefield');
  // Shroud działa również przeciw WŁASNEMU czarowi. Ta ścieżka celu
  // `creature_you_control` nie może polegać na semantyce hexproof (która
  // własne źródło przepuszcza) — wykryte przez pełną symulację talii.
  put(state, 'enemy', 'highland-game', 'p2', 'battlefield');
  put(state, 'feed', 'time-to-feed', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  assert.ok(!commands(state, 'p1').some((command) => command.type === 'cast_spell'
    && command.objectId === 'feed' && command.targets?.[1] === 'tiger'),
  'shroud usuwa Tiger także z własnego slotu creature_you_control');

  put(state, 'shock', 'shock', 'p2', 'hand');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 1, { colors: ['R'] });
  assert.ok(!commands(state, 'p2').some((command) => command.type === 'cast_spell'
    && command.objectId === 'shock' && command.targets?.[0] === 'tiger'),
  'shroud usuwa Tiger z celów Shocka');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  enterAndScan(state, 'tiger');
  settle(state);
  assert.ok(find(state, 'scythe-tiger', 'graveyard'),
    'shroud nie chroni przed nietargetowanym sacrifice');
});

test('Audyt PR #163 F-3/F-4: shroud blokuje Aury i triggery creature_you_control; opis unless-sacrifice po polsku', () => {
  const state = game();
  put(state, 'tiger', 'scythe-tiger', 'p1', 'battlefield');
  put(state, 'aura', 'benevolent-blessing', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });
  assert.ok(!commands(state, 'p1').some((command) => command.type === 'cast_permanent'
    && command.objectId === 'aura' && command.targets?.[0] === 'tiger'),
  'shroud blokuje rzucenie własnej Aury na Scythe Tiger (CR 702.18 + 303.4a)');
  assert.equal(execute(state, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'aura', targets: ['tiger'],
  }).ok, false, 'castAuraSpell odrzuca cel ze shroud');

  // Jeśli cel zyska shroud po rzuceniu Aury, Aura przy rozstrzyganiu nie może
  // się do niego przyczepić (CR 303.4a / 608.2b).
  put(state, 'host2', 'druid-of-the-cowl', 'p1', 'battlefield');
  run(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'aura', targets: ['host2'] });
  state.objects.set('host2', { ...state.objects.get('host2'), keywords: ['shroud'] });
  settle(state);
  assert.ok(find(state, 'benevolent-blessing', 'graveyard'),
    'resolveAuraSpell odrzuca cel, który zyskał shroud przed rozstrzygnięciem');

  // Trigger z requiresTarget: { type: 'creature_you_control' } (Breaching Hippocamp)
  // nie może obrać Scythe Tiger ze shroud.
  put(state, 'hippo', 'breaching-hippocamp', 'p1', 'battlefield');
  enterAndScan(state, 'hippo');
  assert.ok(!commands(state, 'p1').some((command) => command.type === 'resolve_trigger_target'
    && command.targetId === 'tiger'),
  'trigger creature_you_control nie może celować własnego stwora ze shroud');

  // F-4: opis zdolności Scythe Tiger w UI używa polskiego „ląd”, nie angielskiego „Land”.
  const view = playerView(state, 'p1');
  const fakeSession = {
    state,
    view: () => view,
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    keywordsOf: (cardId) => registry.get(cardId)?.keywords ?? [],
    subtypesOf: (cardId) => registry.get(cardId)?.subtypes ?? [],
    typesOf: (cardId) => registry.get(cardId)?.types ?? [],
    statsOf: (cardId) => ({ power: registry.get(cardId)?.power, toughness: registry.get(cardId)?.toughness }),
  };
  const tigerEntry = view.zones.battlefield.find((entry) => entry.id === 'tiger');
  const info = cardInfo(fakeSession, tigerEntry);
  assert.match(rulesText(info), /poświęć źródło, chyba że poświęcisz: ląd/,
    'describeEffect dla sacrifice_source_unless_sacrifice musi tłumaczyć Land -> ląd');
});

test('Audyt PR #163 F-5: pendingSacrifice w stateFingerprint, buildLegalCommands i execute waliduje candidateTypes (L65)', () => {
  const state = game();
  put(state, 'tiger', 'scythe-tiger', 'p1', 'battlefield');
  put(state, 'land', 'basic-forest', 'p1', 'battlefield');
  put(state, 'other-creature', 'druid-of-the-cowl', 'p1', 'battlefield');
  enterAndScan(state, 'tiger');
  assert.equal(resolveUntilDecision(state, (s) => Boolean(s.pendingSacrifice)), true);

  // stateFingerprint musi rozróżniać candidateTypes i alternativeSourceId.
  const fpLand = stateFingerprint(state);
  const mutated = {
    ...state,
    pendingSacrifice: { ...state.pendingSacrifice, candidateTypes: ['Creature'], alternativeSourceId: null },
  };
  assert.notEqual(fpLand, stateFingerprint(mutated),
    'stateFingerprint musi uwzględniać candidateTypes i alternativeSourceId w pendingSacrifice');

  // L65: wstrzykujemy other-creature (nie-Land, ale w candidateIds), żeby ominąć
  // pierwszą straż `!pending.candidateIds.includes(...)` i przetestować straż candidateTypes
  // zarówno w buildLegalCommands, jak i w execute.
  state.pendingSacrifice.candidateIds.push('other-creature');
  const choices = commands(state).filter((command) => command.type === 'resolve_sacrifice_choice');
  assert.ok(!choices.some((command) => command.targetId === 'other-creature'),
    'buildLegalCommands odfiltrowuje kandydata niespełniającego candidateTypes');
  assert.equal(execute(state, {
    type: 'resolve_sacrifice_choice', playerId: 'p1', targetId: 'other-creature',
  }).ok, false, 'execute odrzuca kandydata z candidateIds niespełniającego candidateTypes');
});

// ---- Integracja kolekcji ----------------------------------------------------

test('B66: CSV kolekcji zawiera dokładnie 10 wpisów artId/set/plan', () => {
  const csv = fs.readFileSync('tools/collection-art-ids.csv', 'utf8');
  const expected = [
    '351ELD,Sporecap Spider,Eldraine',
    '353OGW,Warden of Geometries,Zendikar',
    '356OTC,"Cazur, Ruthless Stalker",Thunder Junction',
    '357MM2,Lorescale Coatl,Alara',
    '359M19,Foul Orchard,Arcavios',
    '361ZEN,Noble Vestige,Kamigawa',
    '363THS,Wild Celebrants,Forgotten Realms',
    '364KTK,Naturalize,Kaldheim',
    '365SNC,Rakish Revelers,New Capenna',
    '368ZEN,Scythe Tiger,Wiedźmin',
  ];
  for (const row of expected) assert.ok(csv.includes(`\n${row}\n`) || csv.endsWith(`\n${row}`), row);
});
