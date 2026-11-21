import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { ABILITY_TYPE, createAbility } from '../src/engine/abilities.js';
import { applyEffect } from '../src/engine/effects.js';
import { effectiveKeywords, effectivePower, effectiveToughness, wardAmountOf } from '../src/engine/permanents.js';
import { defineCard, createRegistry } from '../src/cards/registry.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { rulesText } from '../src/table/render.js';

function goToStep(state, step, activeId) {
  state.turn = jumpToStep({ ...state.turn, activePlayerId: activeId }, step, activeId);
}

const royalRoleTokenEffect = {
  type: 'create_token',
  cardId: 'token_royal_role',
  name: 'Royal Role',
  kind: 'aura',
  colors: [],
  types: ['Enchantment', 'Token'],
  subtypes: ['Aura', 'Role'],
  attachToContext: 'enteredCreatureId',
  aura: {
    target: 'creature',
    pump: { power: 1, toughness: 1 },
    keywords: ['ward'],
    ward: 1,
  },
};

const sorcererRoleTokenEffect = {
  type: 'create_token',
  cardId: 'token_sorcerer_role',
  name: 'Sorcerer Role',
  kind: 'aura',
  colors: [],
  types: ['Enchantment', 'Token'],
  subtypes: ['Aura', 'Role'],
  attachToContext: 'enteredCreatureId',
  aura: {
    target: 'creature',
    pump: { power: 1, toughness: 1 },
    grantAbilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks' },
        effect: { type: 'scry', amount: 1 },
      }),
    ],
  },
};

const monsterRoleTokenEffect = {
  type: 'create_token',
  cardId: 'token_monster_role',
  name: 'Monster Role',
  kind: 'aura',
  colors: [],
  types: ['Enchantment', 'Token'],
  subtypes: ['Aura', 'Role'],
  attachToContext: 'enteredCreatureId',
  aura: {
    target: 'creature',
    pump: { power: 1, toughness: 1 },
    keywords: ['trample'],
  },
};

const synGylwain = defineCard({
  id: 'syn-gylwain',
  name: 'Synthetic Gylwain',
  set: 'SYN',
  types: ['Legendary', 'Creature'],
  subtypes: ['Human', 'Bard'],
  colors: ['G', 'W'],
  power: 2,
  toughness: 3,
  manaCost: 3,
  abilities: [
    createAbility({
      type: ABILITY_TYPE.triggered,
      trigger: {
        event: 'self_or_another_creature_you_control_enters',
        nontokenOnly: true,
        modes: [
          { name: 'Royal Role (+1/+1, Ward {1})', effects: [royalRoleTokenEffect] },
          { name: 'Sorcerer Role (+1/+1, Attack: Scry 1)', effects: [sorcererRoleTokenEffect] },
          { name: 'Monster Role (+1/+1, Trample)', effects: [monsterRoleTokenEffect] },
        ],
      },
    }),
  ],
  support: { status: 'supported', limitations: [] },
});

const synBear = defineCard({
  id: 'syn-bear',
  name: 'Synthetic Bear',
  set: 'SYN',
  types: ['Creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  power: 2,
  toughness: 2,
  manaCost: 2,
  support: { status: 'supported', limitations: [] },
});

const synHexBear = defineCard({
  id: 'syn-hex-bear',
  name: 'Synthetic Hexproof Bear',
  set: 'SYN',
  types: ['Creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  keywords: ['hexproof'],
  power: 4,
  toughness: 4,
  manaCost: 4,
  support: { status: 'supported', limitations: [] },
});

const synBolt = defineCard({
  id: 'syn-bolt',
  name: 'Synthetic Bolt',
  set: 'SYN',
  types: ['Instant'],
  colors: ['R'],
  manaCost: 1,
  spell: {
    timing: 'instant',
    targets: [{ type: 'any_target' }],
    effects: [{ type: 'damage', amount: 3 }],
  },
  support: { status: 'supported', limitations: [] },
});

function baseState() {
  const s = createGameState({ seed: 33, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (let i = 1; i <= 15; i += 1) {
    addObject(s, { id: `lib-p1-${i}`, instanceId: `il-1-${i}`, cardId: 'basic-forest', controllerId: 'p1', zone: 'library', kind: 'land' });
    addObject(s, { id: `lib-p2-${i}`, instanceId: `il-2-${i}`, cardId: 'basic-forest', controllerId: 'p2', zone: 'library', kind: 'land' });
  }
  return s;
}

function addFromDef(state, id, controllerId, def, { zone = 'hand', tapped = false, summoningSickness = false } = {}) {
  const data = gameObjectDataOf(def);
  addObject(state, {
    ...data,
    types: [...(def.types ?? [])],
    subtypes: [...(def.subtypes ?? [])],
    keywords: [...(def.keywords ?? [])],
    id, instanceId: `inst-${id}`, cardId: def.id, controllerId, zone,
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  }
  return state.objects.get(id);
}

function findBattlefieldId(state, cardId, controllerId) {
  return [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === cardId && (!controllerId || o.controllerId === controllerId))?.id;
}

test('2C-1 (ETB self + another nontoken creature + pominięcie tokenów i wroga)', () => {
  const state = baseState();
  addFromDef(state, 'gyl', 'p1', synGylwain, { zone: 'hand' });
  addFromDef(state, 'bear', 'p1', synBear, { zone: 'hand' });
  addFromDef(state, 'foe-bear', 'p2', synBear, { zone: 'hand' });
  addMana(state, 'p1', 5, { colors: ['G', 'W', 'G'] });
  goToStep(state, 'main1', 'p1');

  // 1) Wejście Gylwaina odpala modalny wybór -> Monster Role (modeIndex 2)
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gyl' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.ok(state.pendingModalTrigger, 'wejście Gylwaina powinno otworzyć modalny wybór Role');
  assert.equal(execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 2 }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  const gylId = findBattlefieldId(state, 'syn-gylwain', 'p1');
  const gylObj = state.objects.get(gylId);
  assert.equal(effectivePower(gylObj, state), 3, 'Gylwain z Monster Role ma 2+1=3 mocy');
  assert.equal(effectiveToughness(gylObj, state), 4, 'Gylwain z Monster Role ma 3+1=4 wytrzymałości');
  assert.equal(effectiveKeywords(gylObj, state).includes('trample'), true, 'Monster Role nadaje trample');

  // 2) Wejście innego nietokenowego stwora p1 odpala modalny wybór -> Royal Role (modeIndex 0)
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'bear' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.ok(state.pendingModalTrigger, 'wejście innego nietokenowego stwora powinno odpalić Gylwaina');
  assert.equal(execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  const bearId = findBattlefieldId(state, 'syn-bear', 'p1');
  const bearObj = state.objects.get(bearId);
  assert.equal(effectivePower(bearObj, state), 3);
  assert.equal(wardAmountOf(bearObj, state), 1, 'Royal Role nadaje Ward {1}');

  // 3) Wejście tokenu stwora p1 NIE odpala Gylwaina
  applyEffect(state, {
    type: 'create_token', cardId: 'token_saproling', name: 'Saproling',
    kind: 'creature', power: 1, toughness: 1, types: ['Creature', 'Token'], subtypes: ['Saproling'],
  }, { id: 'tok-src', controllerId: 'p1' }, []);
  assert.equal(state.pendingModalTrigger, null, 'token stwora NIE może odpalić triggera nontokenOnly');

  // 4) Wejście nietokenowego stwora przeciwnika NIE odpala Gylwaina
  goToStep(state, 'main1', 'p2');
  addMana(state, 'p2', 2, { colors: ['G'] });
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'foe-bear' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(state.pendingModalTrigger, null, 'stwór przeciwnika NIE odpala triggera Gylwaina');
});

test('2C-2 (SBA Role, ruling WOC 2023-09-01): tylko jedna własna Role na permanencie (zostaje najnowsza), Role różnych graczy zostają obie', () => {
  const state = baseState();
  const bear = addFromDef(state, 'bear', 'p1', synBear, { zone: 'battlefield' });
  const srcP1 = { id: 'src-p1', controllerId: 'p1' };
  const srcP2 = { id: 'src-p2', controllerId: 'p2' };

  // P1 tworzy Monster Role na bear, potem P1 tworzy Royal Role na bear
  applyEffect(state, monsterRoleTokenEffect, srcP1, [], { enteredCreatureId: bear.id });
  assert.equal(effectiveKeywords(state.objects.get(bear.id), state).includes('trample'), true);

  applyEffect(state, royalRoleTokenEffect, srcP1, [], { enteredCreatureId: bear.id });
  // Uruchamiamy komendę z SBA (np. pass_priority) żeby zweryfikować SBA Role
  goToStep(state, 'main1', 'p1');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);

  const p1RolesOnBear = [...state.objects.values()].filter(
    (o) => o.zone === 'battlefield' && o.attachedTo === bear.id && o.controllerId === 'p1' && (o.subtypes ?? []).includes('Role'),
  );
  assert.equal(p1RolesOnBear.length, 1, 'SBA Role: ten sam gracz może mieć najwyżej 1 Role na tym stworze');
  assert.equal(p1RolesOnBear[0].name, 'Royal Role', 'zostaje najnowsza Role (Royal), starsza (Monster) znika');
  assert.equal(effectiveKeywords(state.objects.get(bear.id), state).includes('trample'), false, 'utracono trample ze starej Monster Role');
  assert.equal(wardAmountOf(state.objects.get(bear.id), state), 1, 'nowa Royal Role daje Ward {1}');
  assert.equal(effectivePower(state.objects.get(bear.id), state), 3, 'tylko +1/+1 zamiast +2/+2');

  // P2 dokłada WŁASNĄ Monster Role na tego samego stwora p1 — obie Role (p1 i p2) zostają!
  applyEffect(state, monsterRoleTokenEffect, srcP2, [], { enteredCreatureId: bear.id });
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  const allRolesOnBear = [...state.objects.values()].filter(
    (o) => o.zone === 'battlefield' && o.attachedTo === bear.id && (o.subtypes ?? []).includes('Role'),
  );
  assert.equal(allRolesOnBear.length, 2, 'ruling 2023-09-01: Role różnych graczy współistnieją na jednym permanencie');
  assert.equal(effectivePower(state.objects.get(bear.id), state), 4, '2 + 1 (Royal p1) + 1 (Monster p2) = 4');
  assert.equal(effectiveKeywords(state.objects.get(bear.id), state).includes('trample'), true);
  assert.equal(wardAmountOf(state.objects.get(bear.id), state), 1);
});

test('2C-3 (mechaniki Ról): Royal Ward {1} kontruje bez dopłaty, Sorcerer attack trigger robi Scry 1', () => {
  const state = baseState();
  const bearRoyal = addFromDef(state, 'bear-royal', 'p1', synBear, { zone: 'battlefield' });
  const bearSorcerer = addFromDef(state, 'bear-sorc', 'p1', synBear, { zone: 'battlefield' });
  applyEffect(state, royalRoleTokenEffect, { id: 's1', controllerId: 'p1' }, [], { enteredCreatureId: bearRoyal.id });
  applyEffect(state, sorcererRoleTokenEffect, { id: 's2', controllerId: 'p1' }, [], { enteredCreatureId: bearSorcerer.id });

  // 1) Royal Role: playerView wystawia ward: 1, a czar wroga bez dopłaty jest kontrowany przez Ward {1}
  const pv = playerView(state, 'p2');
  const viewBearRoyal = pv.zones.battlefield.find((o) => o.id === bearRoyal.id);
  assert.equal(viewBearRoyal.ward, 1, 'playerView wystawia ward: 1 nadane przez Royal Role');

  addFromDef(state, 'bolt', 'p2', synBolt, { zone: 'hand' });
  addMana(state, 'p2', 2, { colors: ['R'] }); // 1 na bolt + 1 potencjalnie na dopłatę Ward {1}
  goToStep(state, 'main1', 'p2');
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'bolt', targets: [bearRoyal.id] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.ok(state.pendingWardPay, 'Ward {1} z Royal Role powinien wymusić dopłatę');
  assert.equal(state.pendingWardPay.amount, 1);
  assert.equal(execute(state, { type: 'resolve_ward_pay_choice', playerId: 'p2', pay: false }).ok, true);
  assert.equal(state.zones.stack.length, 0, 'nieopłacony Ward {1} skontrował czar ze stosu');
  assert.equal(state.objects.get(bearRoyal.id)?.zone, 'battlefield', 'stwór przeżywa po odmowie Ward {1}');

  // 2) Sorcerer Role: atak stworem z Sorcerer Role odpala trigger Scry 1
  goToStep(state, 'declare_attackers', 'p1');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [bearSorcerer.id] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.ok(state.pendingScry, 'atak stworem z Sorcerer Role powinien wywołać Scry 1');
});

test('2C-4 (brzegowe CR 303.4 / ruling WOC #4): zniknięcie celu, protection from enchantments, ale hexproof nie blokuje', () => {
  const state = baseState();
  const hexBear = addFromDef(state, 'hex-bear', 'p1', synHexBear, { zone: 'battlefield' });
  const protBear = addFromDef(state, 'prot-bear', 'p1', synBear, { zone: 'battlefield' });

  // Hexproof nie blokuje (zdolność Gylwaina nie celuje!)
  applyEffect(state, monsterRoleTokenEffect, { id: 'g', controllerId: 'p1' }, [], { enteredCreatureId: hexBear.id });
  assert.equal(effectivePower(state.objects.get(hexBear.id), state), 5, 'hexproof nie blokuje przypięcia Role bez celowania');

  // Protection from enchantments blokuje utworzenie Role tokenu (ruling 2023-09-01)
  applyEffect(state, { type: 'grant_protection_until_end_of_turn', quality: { kind: 'enchantment' } }, { id: 'p-src', controllerId: 'p1' }, []);
  const rolesBefore = [...state.objects.values()].filter((o) => (o.subtypes ?? []).includes('Role')).length;
  applyEffect(state, royalRoleTokenEffect, { id: 'g', controllerId: 'p1' }, [], { enteredCreatureId: protBear.id });
  const rolesAfter = [...state.objects.values()].filter((o) => (o.subtypes ?? []).includes('Role')).length;
  assert.equal(rolesAfter, rolesBefore, 'protection from enchantments blokuje utworzenie Role tokenu');

  // Brakujący host (opuszczone pole bitwy) też nie tworzy osieroconej aury
  applyEffect(state, royalRoleTokenEffect, { id: 'g', controllerId: 'p1' }, [], { enteredCreatureId: 'non-existent-id' });
  const rolesAfterMissing = [...state.objects.values()].filter((o) => (o.subtypes ?? []).includes('Role')).length;
  assert.equal(rolesAfterMissing, rolesBefore);
});

test('2C-5 (render + bot): polskie opisy Role i Gylwaina + zróżnicowana wycena trybów przez bota', () => {
  const txt = rulesText(synGylwain);
  assert.doesNotMatch(txt, /undefined/);
  assert.match(txt, /Royal Role|Sorcerer Role|Monster Role/);

  const registry = createRegistry([...createCardRegistry().all(), synGylwain, synHexBear]);
  const bot = createHeuristicBot({ seed: 1, registry });

  // Sytuacja z hexproof 4/4 i wrogim 1/1 blokerem: bot powinien wybierać świadomie (nie 0/0/0)
  const state = baseState();
  addFromDef(state, 'gyl', 'p1', synGylwain, { zone: 'hand' });
  addFromDef(state, 'blocker', 'p2', synBear, { zone: 'battlefield' });
  addMana(state, 'p1', 3, { colors: ['G', 'W', 'G'] });
  goToStep(state, 'main1', 'p1');
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gyl' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  const view = playerView(state, 'p1');
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'resolve_modal_choice');
  const last = bot.trace().at(-1);
  const modeOptions = last.options.filter((o) => o.cmd !== 'concede');
  assert.equal(modeOptions.length, 3, 'bot ocenił wszystkie 3 tryby Role');
  const scores = modeOptions.map((o) => o.score);
  assert.ok(scores.every((sc) => sc > 10), `wszystkie tryby Role powinny mieć wycenę powyżej bazy 10 (dostałem ${scores})`);
  assert.ok(new Set(scores).size >= 2, `bot powinien odróżniać tryby Role zamiast remisować identycznie (dostałem ${scores})`);
});
