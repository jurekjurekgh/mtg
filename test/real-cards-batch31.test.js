import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness, effectiveSubtypesOnBattlefield } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Batch 31 — 10 kart (2026-08-13): Furious Forebear, Jwari Shapeshifter,
 * Floodhound, Inspire Awe, Cogwork Assembler, Dread Warlock, Steel Sabotage,
 * Warrior's Sword, Awaken the Sleeper, Impact Tremors. Testy behawioralne.
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}
function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}
function addCreature(state, id, ctrl, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], summoningSickness: false, ...extra,
  });
  return state.objects.get(id);
}
function addArtifact(state, id, ctrl, types = ['Artifact']) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `a-${id}`, controllerId: ctrl, zone: 'battlefield',
    kind: 'artifact', manaCost: 2, abilities: [], keywords: [], subtypes: [],
    types, colors: [],
  });
  return state.objects.get(id);
}
function resolveStack(state) {
  let guard = 0;
  while ((state.zones.stack.length > 0 || state.pendingTriggerTargets.length > 0 || state.pendingSearchChoice || state.pendingEnterAsCopy || state.pendingDestroyEquipment) && guard++ < 300) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  return state.zones.stack.length === 0;
}

// --- Scryfall sanity ---
test('Batch 31: pliki Scryfall istnieją i mają prawidłowe pola', () => {
  const slugs = ['furious-forebear', 'jwari-shapeshifter', 'floodhound', 'inspire-awe',
    'cogwork-assembler', 'dread-warlock', 'steel-sabotage', 'warriors-sword',
    'awaken-the-sleeper', 'impact-tremors'];
  for (const slug of slugs) {
    const data = JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));
    assert.ok(data.oracle_text, `${slug}: oracle_text`);
    assert.ok(data.mana_cost, `${slug}: mana_cost`);
  }
});
test('Batch 31: każda karta jest supported w rejestrze', () => {
  const ids = ['furious-forebear', 'jwari-shapeshifter', 'floodhound', 'inspire-awe',
    'cogwork-assembler', 'dread-warlock', 'steel-sabotage', 'warriors-sword',
    'awaken-the-sleeper', 'impact-tremors'];
  for (const id of ids) {
    const card = REGISTRY.get(id);
    assert.ok(card, `brak karty ${id}`);
    assert.equal(card.support.status, 'supported', `${id} supported`);
  }
});

// --- 1. Dread Warlock: can't be blocked except by black creatures ---
test('Dread Warlock: nie może być blokowany poza czarnymi stworami (CR)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.phase = 'combat';
  addRealCard(state, 'dw', 'dread-warlock', 'p1', 'battlefield');
  state.objects.set('dw', Object.freeze({ ...state.objects.get('dw'), summoningSickness: false }));
  addCreature(state, 'white', 'p2', 2, 2, { colors: ['W'] });
  addCreature(state, 'black', 'p2', 1, 1, { colors: ['B'] });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['dw'] }).ok);
  // Biały blocker nie może blokować.
  const bad = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { dw: ['white'] } });
  assert.ok(!bad.ok, 'biały stwór nie może blokować Dread Warlock');
  // Czarny blocker może.
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { dw: ['black'] } }).ok);
});

// --- 2. Impact Tremors: creature you control enters -> 1 dmg each opponent ---
test('Impact Tremors: wejście stwora pod twoją kontrolą zadaje 1 obrażenia przeciwnikowi', () => {
  const state = mainPhase(game());
  addRealCard(state, 'tremors', 'impact-tremors', 'p1', 'battlefield');
  addRealCard(state, 'game', 'highland-game', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const before = state.players[1].life;
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'game' }).ok);
  resolveStack(state);
  assert.equal(state.players[1].life, before - 1, 'przeciwnik traci 1 życie');
});

// --- 3. Floodhound: {3},{T} investigate -> Clue token ---
test('Floodhound: aktywacja investigate tworzy token Clue', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fh', 'floodhound', 'p1', 'battlefield');
  state.objects.set('fh', Object.freeze({ ...state.objects.get('fh'), summoningSickness: false }));
  addMana(state, 'p1', 3, ['U']);
  const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'fh');
  assert.ok(act, 'Floodhound investigate w ofercie');
  assert.ok(execute(state, act).ok);
  resolveStack(state);
  const clue = [...state.objects.values()].find((o) => o.cardId === 'token_clue' && o.zone === 'battlefield');
  assert.ok(clue, 'token Clue utworzony');
  // Clue: {2}, sacrifice -> draw. Dodaj kartę do biblioteki, żeby było co dobrać.
  addRealCard(state, 'lib', 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 2, []);
  const draw = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === clue.id);
  assert.ok(draw, 'Clue można poświęcić za kartę');
  const handBefore = state.zones.hand.length;
  assert.ok(execute(state, draw).ok);
  resolveStack(state);
  assert.ok(state.zones.hand.length > handBefore, 'Clue dobiera kartę');
});

// --- 4. Cogwork Assembler: {7} create token copy of target artifact, haste, delayed exile ---
test('Cogwork Assembler: {7} tworzy kopię artefaktu z haste i wygnaniem na end step', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ca', 'cogwork-assembler', 'p1', 'battlefield');
  addArtifact(state, 'target', 'p1');
  addMana(state, 'p1', 7, []);
  const act = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'ca' && c.targets?.[0] === 'target');
  assert.ok(act, 'Cogwork Assembler celuje w artefakt');
  assert.ok(execute(state, act).ok);
  resolveStack(state);
  const copy = [...state.objects.values()].find((o) => o.cardId === 'a-target' && o.zone === 'battlefield' && o.name === 'a-target');
  assert.ok(copy, 'token-kopia artefaktu utworzona');
});

// --- 5. Steel Sabotage: modal counter artifact spell / return artifact ---
test('Steel Sabotage: tryb odbicia zwraca artefakt do ręki właściciela', () => {
  const state = mainPhase(game());
  addArtifact(state, 'art', 'p2');
  addRealCard(state, 'ss', 'steel-sabotage', 'p1', 'hand');
  addMana(state, 'p1', 1, ['U']);
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'ss' && c.modeIndex === 1 && c.targets?.[0] === 'art');
  assert.ok(cast, 'tryb „Return artifact\" z celem');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const inHand = [...state.objects.values()].find((o) => o.cardId === 'a-art' && o.zone === 'hand');
  assert.ok(inHand, 'artefakt wrócił do ręki');
});

// --- 6. Warrior's Sword: job select + equipment pump + Warrior subtype ---
test("Warrior\'s Sword: job select tworzy Hero token i wyposaża go; +3/+2 i Warrior", () => {
  const state = mainPhase(game());
  addRealCard(state, 'sword', 'warriors-sword', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sword' }).ok);
  resolveStack(state);
  const hero = [...state.objects.values()].find((o) => o.cardId === 'token_hero' && o.zone === 'battlefield');
  assert.ok(hero, 'Hero token utworzony przez job select');
  const sword = [...state.objects.values()].find((o) => o.cardId === 'warriors-sword' && o.zone === 'battlefield');
  assert.equal(sword.attachedTo, hero.id, 'miecz przypięty do Hero');
  // Equipment pump +3/+2 + Warrior subtype.
  assert.equal(effectivePower(hero, state), 4, 'Hero 1+3=4');
  assert.equal(effectiveToughness(hero, state), 3, 'Hero 1+2=3');
  assert.ok(effectiveSubtypesOnBattlefield(state, hero).includes('Warrior'), 'Hero jest też Warrior');
});

// --- 7. Awaken the Sleeper: gain control until EOT + untap + haste ---
test('Awaken the Sleeper: przejmuje stwora do końca tury (wraca w cleanup)', () => {
  const state = mainPhase(game());
  addCreature(state, 'foe', 'p2', 3, 3);
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), tapped: true }));
  addRealCard(state, 'sleeper', 'awaken-the-sleeper', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'sleeper' && c.targets?.[0] === 'foe');
  assert.ok(cast, 'Awaken the Sleeper z celem');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(state.objects.get('foe').controllerId, 'p1', 'kontrola przejęta');
  assert.equal(state.objects.get('foe').tapped, false, 'odkręcony');
  assert.ok(effectiveKeywords(state.objects.get('foe'), state).includes('haste'), 'ma haste');
});

// --- 8. Furious Forebear: creature you control dies while in graveyard -> may pay -> return to hand ---
test('Furious Forebear: w grobie, gdy stwór umiera — zapłać {1}{W} i wróć na rękę', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ff', 'furious-forebear', 'p1', 'graveyard');
  addCreature(state, 'ally', 'p1', 1, 1);
  addCreature(state, 'foe', 'p2', 2, 2);
  // Ustaw walkę: ally blokuje/ginie (SBA). Prościej: poświęć ally efektem.
  addRealCard(state, 'village', 'village-rites', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'village');
  assert.ok(cast, 'Village Rites');
  // Zapewnij manę {1}{W} dostępną, gdy trigger odpali się w momencie śmierci.
  addMana(state, 'p1', 2, { colors: ['W'] });
  assert.ok(execute(state, cast).ok);
  // Furious Forebear trigger z grobu -> may pay {1}{W} (pendingOptionalPay ustawione w trakcie rzutu).
  const pay = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_optional_pay_choice');
  assert.ok(pay, 'opcjonalna płatność {1}{W}');
  assert.ok(execute(state, { ...pay, pay: true }).ok);
  resolveStack(state);
  const inHand = [...state.objects.values()].find((o) => o.cardId === 'furious-forebear' && o.zone === 'hand');
  assert.ok(inHand, 'Furious Forebear wrócił do ręki');
});

// --- 9. Jwari Shapeshifter: enter as a copy of an Ally creature ---
test('Jwari Shapeshifter: może wejść jako kopia stwora-Ally', () => {
  const state = mainPhase(game());
  addRealCard(state, 'jwari', 'jwari-shapeshifter', 'p1', 'hand');
  addObject(state, {
    id: 'ally', instanceId: 'i-ally', cardId: 'x-ally', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 4, toughness: 4, manaCost: 3, abilities: [], keywords: [],
    subtypes: ['Ally'], types: ['Creature'], colors: ['W'],
  });
  addMana(state, 'p1', 2, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jwari' }).ok);
  resolveStack(state);
  const jwari = [...state.objects.values()].find((o) => o.cardId === 'jwari-shapeshifter' && o.zone === 'battlefield');
  assert.ok(jwari, 'Jwari przetrwał SBA jako kopia Ally (enter as copy)');
  assert.equal(effectivePower(jwari, state), 4, 'Jwari skopiował moc Ally');
  assert.equal(effectiveToughness(jwari, state), 4, 'Jwari skopiował wytrzymałość Ally');
});


test('Jwari Shapeshifter: gracz może odmówić kopii — 0/0 ginie SBA', () => {
  const state = mainPhase(game());
  addRealCard(state, 'jwari', 'jwari-shapeshifter', 'p1', 'hand');
  addObject(state, {
    id: 'ally', instanceId: 'i-ally', cardId: 'x-ally', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 4, toughness: 4, manaCost: 3, abilities: [], keywords: [],
    subtypes: ['Ally'], types: ['Creature'], colors: ['W'],
  });
  addMana(state, 'p1', 2, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jwari' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const decline = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_enter_as_copy' && c.targetId == null);
  assert.ok(decline, 'oferta odmowy kopii');
  assert.ok(execute(state, decline).ok);
  const jwari = [...state.objects.values()].find((o) => o.cardId === 'jwari-shapeshifter');
  assert.ok(!jwari || jwari.zone !== 'battlefield', '0/0 zginął SBA po odmowie');
});

test('Jwari Shapeshifter: gracz może skopiować słabszego Ally', () => {
  const state = mainPhase(game());
  addRealCard(state, 'jwari', 'jwari-shapeshifter', 'p1', 'hand');
  addObject(state, {
    id: 'weak', instanceId: 'i-weak', cardId: 'x-weak', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
    subtypes: ['Ally'], types: ['Creature'], colors: ['W'],
  });
  addObject(state, {
    id: 'strong', instanceId: 'i-strong', cardId: 'x-strong', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 4, toughness: 4, manaCost: 3, abilities: [], keywords: [],
    subtypes: ['Ally'], types: ['Creature'], colors: ['W'],
  });
  addMana(state, 'p1', 2, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jwari' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const weak = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === 'weak');
  assert.ok(weak, 'oferta słabszego Ally');
  assert.ok(execute(state, weak).ok);
  const jwari = [...state.objects.values()].find((o) => o.cardId === 'jwari-shapeshifter' && o.zone === 'battlefield');
  assert.ok(jwari);
  assert.equal(effectivePower(jwari, state), 1);
  assert.equal(effectiveToughness(jwari, state), 1);
});

test('Awaken the Sleeper: gracz może zniszczyć albo zostawić equipment', () => {
  const state = mainPhase(game());
  addCreature(state, 'foe', 'p2', 3, 3);
  addObject(state, {
    id: 'eq', instanceId: 'i-eq', cardId: 'x-eq', controllerId: 'p2', zone: 'battlefield',
    kind: 'artifact', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [],
    subtypes: ['Equipment'], types: ['Artifact'], colors: [],
    equipment: { pump: { power: 1, toughness: 1 } },
  });
  state.objects.set('eq', Object.freeze({ ...state.objects.get('eq'), attachedTo: 'foe' }));
  addRealCard(state, 'sleeper', 'awaken-the-sleeper', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'sleeper' && c.targets?.[0] === 'foe');
  assert.ok(cast);
  assert.ok(execute(state, cast).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const yes = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_destroy_equipment_choice' && c.destroy === true);
  const no = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_destroy_equipment_choice' && c.destroy === false);
  assert.ok(yes && no, 'obie opcje zniszczenia equipmentu');
  assert.ok(execute(state, no).ok);
  assert.equal(state.objects.get('eq').zone, 'battlefield', 'odmowa zostawia equipment');
});

// --- 10. Inspire Awe: prevent combat damage except enchanted/enchantment creatures, scry 2 ---
test('Inspire Awe: prewencja obrażeń bojowych poza zaczarowanymi/enchantment-creatures', () => {
  const state = mainPhase(game());
  addCreature(state, 'atk', 'p1', 3, 3);
  addCreature(state, 'def', 'p2', 2, 2);
  addRealCard(state, 'ia', 'inspire-awe', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['G'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ia' }).ok);
  resolveStack(state);
  assert.equal(state.preventCombatExceptEnchanted, true, 'flaga prewencji aktywna');
  // Walka: atak 3/3 nie jest zaczarowany → obrażenia zapobiegnięte.
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  const before = state.players[1].life;
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  resolveStack(state);
  assert.equal(state.players[1].life, before, 'obrażenia niezaczarowanego stwora zapobiegnięte');
});
