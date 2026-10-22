// M235 — Benevolent Blessing is a lethal-damage protection trick, not a
// generic flash Aura to cast just because combat or the main phase is open.
// The bot may spend it only when its creature faces lethal combat damage in
// either described combat window, or lethal damage from the top direct-damage
// spell on the stack. Color choice must follow that exact damage source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();
const BOT_SEED = 235;

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], aura: d.aura, bestow: d.bestow,
    equipment: d.equipment,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function patchObject(state, id, patch) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

// Bot (p2) has Benevolent Blessing in hand, a 2/2 creature it controls, and
// an irrelevant tapped opposing creature. Per-test combat and stack state is
// public to the bot through playerView.
function scenario({
  step = 'main1', phase = 'precombat_main', activePlayer = 'p2',
  mineCardId = 'soulmender', mineStats = { power: 2, toughness: 2 },
} = {}) {
  const state = createGameState({ seed: BOT_SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, phase === 'upkeep' ? 'upkeep' : 'main', activePlayer);
  state.turn.activePlayerId = activePlayer;
  state.turn.priorityPlayerId = activePlayer;
  state.turn.step = step;
  state.turn.phase = phase;
  addMana(state, 'p2', 10);
  put(state, 'aura', 'benevolent-blessing', 'p2', 'hand');
  put(state, 'mine', mineCardId, 'p2', 'battlefield', mineStats);
  put(state, 'foe', 'trostani-discordant', 'p1', 'battlefield', { tapped: true });
  return state;
}

function choose(state, playerId = 'p2') {
  return createHeuristicBot({ seed: BOT_SEED }).chooseCommand(playerView(state, playerId), {});
}

function auraScores(state, targetId = 'mine') {
  const bot = createHeuristicBot({ seed: BOT_SEED });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const options = bot.trace()[0]?.options ?? [];
  return {
    aura: options.find((o) => o.cmd === `cast_permanent(aura->${targetId})`)?.score,
    pass: options.find((o) => o.cmd === 'pass_priority')?.score ?? 0,
  };
}

function isBlessingCast(command, targetId = 'mine') {
  return command?.type === 'cast_permanent'
    && command.objectId === 'aura'
    && (command.targets ?? []).includes(targetId);
}

function setCombat(state, { attackingPlayerId, attackers, blockers = new Map() }) {
  state.combat = {
    attackingPlayerId,
    attackers: [...attackers],
    blockers,
    blockedAttackers: new Set([...blockers.keys()]),
  };
  return state;
}

function lethalDirectSpellScenario({ cardId = 'fireball', xValue = 2, toughness = 2, mineCardId = 'soulmender' } = {}) {
  const state = scenario({
    step: 'main1', phase: 'precombat_main', activePlayer: 'p1', mineCardId,
    mineStats: { power: 2, toughness, damage: 0 },
  });
  put(state, 'damage-spell', cardId, 'p1', 'hand');
  addMana(state, 'p1', 10, { colors: ['R'] });
  const command = {
    type: 'cast_spell', playerId: 'p1', objectId: 'damage-spell', targets: ['mine'],
    ...(cardId === 'fireball' ? { xValue } : {}),
  };
  const result = execute(state, command);
  assert.ok(result.ok, `opponent casts ${cardId}: ${result.events?.[0]?.reason ?? 'rejected'}`);
  state.turn.priorityPlayerId = 'p2';
  return state;
}

function graveyardScaledDamageScenario() {
  const state = scenario({
    step: 'main1', phase: 'precombat_main', activePlayer: 'p1',
    mineStats: { power: 2, toughness: 2, damage: 0 },
  });
  put(state, 'grave-instant', 'shock', 'p1', 'graveyard');
  put(state, 'grave-sorcery', 'fiery-justice', 'p1', 'graveyard');
  put(state, 'damage-spell', 'blitz-of-the-thunder-raptor', 'p1', 'hand');
  addMana(state, 'p1', 10, { colors: ['R'] });
  const result = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'damage-spell', targets: ['mine'],
  });
  assert.ok(result.ok, `opponent casts Blitz of the Thunder-Raptor: ${result.events?.[0]?.reason ?? 'rejected'}`);
  state.turn.priorityPlayerId = 'p2';
  return state;
}

function creatureSourceDamageScenario() {
  const state = scenario({
    step: 'main1', phase: 'precombat_main', activePlayer: 'p1',
    mineStats: { power: 2, toughness: 4, damage: 0 },
  });
  put(state, 'damage-source', 'typhoid-rats', 'p1', 'battlefield', { power: 1, toughness: 1 });
  put(state, 'damage-spell', 'chocobo-kick', 'p1', 'hand');
  addMana(state, 'p1', 10, { colors: ['G'] });
  const result = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'damage-spell',
    targets: ['damage-source', 'mine'],
  });
  assert.ok(result.ok, `opponent casts Chocobo Kick: ${result.events?.[0]?.reason ?? 'rejected'}`);
  state.turn.priorityPlayerId = 'p2';
  return state;
}

function nonDamageModalScenario() {
  const state = scenario({
    step: 'main1', phase: 'precombat_main', activePlayer: 'p1',
    mineCardId: 'myr-scrapling', mineStats: { power: 1, toughness: 1, damage: 0 },
  });
  put(state, 'modal-spell', 'agate-assault', 'p1', 'hand');
  addMana(state, 'p1', 10, { colors: ['R'] });
  const result = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'modal-spell', modeIndex: 1, targets: ['mine'],
  });
  assert.ok(result.ok, `opponent chooses Agate Assault's artifact-exile mode: ${result.events?.[0]?.reason ?? 'rejected'}`);
  state.turn.priorityPlayerId = 'p2';
  return state;
}

function dividedDamageScenario() {
  const state = scenario({
    step: 'main1', phase: 'precombat_main', activePlayer: 'p1',
    mineStats: { power: 2, toughness: 2, damage: 0 },
  });
  put(state, 'damage-spell', 'fiery-justice', 'p1', 'hand');
  addMana(state, 'p1', 10, { colors: ['R', 'G', 'W'] });
  const result = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'damage-spell', targets: ['p2'],
    damageDivision: [{ id: 'mine', amount: 2 }, { id: 'p2', amount: 3 }],
  });
  assert.ok(result.ok, `opponent assigns lethal damage to mine: ${result.events?.[0]?.reason ?? 'rejected'}`);
  state.turn.priorityPlayerId = 'p2';
  return state;
}

function passP2ThenP1(state) {
  state.turn.priorityPlayerId = 'p2';
  const first = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(first.ok, `p2 passes: ${first.events?.[0]?.reason ?? 'rejected'}`);
  const second = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(second.ok, `p1 passes: ${second.events?.[0]?.reason ?? 'rejected'}`);
}

function resolveBlessingAndChooseColor(state, expectedColor) {
  const cast = choose(state);
  assert.ok(isBlessingCast(cast), `expected Benevolent Blessing, got ${JSON.stringify(cast)}`);
  const castResult = execute(state, cast);
  assert.ok(castResult.ok, `Blessing cast: ${castResult.events?.[0]?.reason ?? 'rejected'}`);
  passP2ThenP1(state);

  const colorChoice = choose(state);
  assert.equal(colorChoice.type, 'resolve_color_choice', `color decision: ${JSON.stringify(colorChoice)}`);
  assert.equal(colorChoice.color, expectedColor, `choose the lethal source's color, not a color-count heuristic`);
  const colorResult = execute(state, colorChoice);
  assert.ok(colorResult.ok, `color choice: ${colorResult.events?.[0]?.reason ?? 'rejected'}`);
  return colorChoice;
}

test('M235 params: the protection-Aura hold penalty remains enabled', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.flashProtectionAuraOffWindowPenalty, 120);
});

test('M235: hold Benevolent Blessing in upkeep and in an unthreatened precombat main', () => {
  for (const state of [
    scenario({ step: 'upkeep', phase: 'upkeep' }),
    scenario({ step: 'main1', phase: 'precombat_main' }),
  ]) {
    const { aura, pass } = auraScores(state);
    assert.ok(aura < pass, `without a lethal source aura (${aura}) must lose to pass (${pass})`);
    assert.ok(!isBlessingCast(choose(state)), 'do not spend the Aura without an imminent lethal-damage threat');
  }
});

test('M235: an attack declaration by the bot is not enough; wait for lethal blocks', () => {
  const state = scenario({ step: 'declare_attackers', phase: 'combat' });
  setCombat(state, { attackingPlayerId: 'p2', attackers: ['mine'] });
  const { aura, pass } = auraScores(state);
  assert.ok(aura < pass, `unassigned blockers are not yet a lethal threat (${aura} vs ${pass})`);
  assert.ok(!isBlessingCast(choose(state)));
});

test('M235: after an opponent attacks, offer the Aura in declare_blockers when a legal blocker would die', () => {
  const state = scenario({ step: 'declare_blockers', phase: 'combat', activePlayer: 'p1' });
  put(state, 'attacker', 'goblin-piker', 'p1', 'battlefield', {
    power: 3, toughness: 3, tapped: true,
  });
  setCombat(state, { attackingPlayerId: 'p1', attackers: ['attacker'] });
  state.turn.priorityPlayerId = 'p2';

  const view = playerView(state, 'p2');
  assert.ok(view.blockCandidates?.attacker?.includes('mine'), 'the threatened creature is a legal blocker');
  assert.ok(isBlessingCast(choose(state)), 'protect the potential blocker before blockers are declared');
});

test('M235: a combat damage shield prevents a false lethal-block window', () => {
  const state = scenario({ step: 'declare_blockers', phase: 'combat', activePlayer: 'p1' });
  put(state, 'attacker', 'goblin-piker', 'p1', 'battlefield', {
    power: 3, toughness: 3, tapped: true,
  });
  setCombat(state, { attackingPlayerId: 'p1', attackers: ['attacker'] });
  state.damageShields = [{ targetId: 'mine', remaining: 3 }];
  state.turn.priorityPlayerId = 'p2';

  assert.ok(!isBlessingCast(choose(state)), 'the existing shield already prevents all combat damage');
});

test('M235: a shield counter prevents a false lethal-block window', () => {
  const state = scenario({ step: 'declare_blockers', phase: 'combat', activePlayer: 'p1' });
  put(state, 'attacker', 'goblin-piker', 'p1', 'battlefield', {
    power: 3, toughness: 3, tapped: true,
  });
  patchObject(state, 'mine', { counters: { shield: 1 } });
  setCombat(state, { attackingPlayerId: 'p1', attackers: ['attacker'] });
  state.turn.priorityPlayerId = 'p2';

  assert.ok(!isBlessingCast(choose(state)), 'the shield counter already prevents the lethal damage event');
});

test('M235: after blocks, protect the bot attacker from lethal damage by its blocker', () => {
  const state = scenario({ step: 'combat_damage', phase: 'combat', activePlayer: 'p2' });
  patchObject(state, 'mine', { tapped: true, power: 2, toughness: 2 });
  put(state, 'blocker', 'goblin-piker', 'p1', 'battlefield', { power: 2, toughness: 2 });
  setCombat(state, {
    attackingPlayerId: 'p2', attackers: ['mine'],
    blockers: new Map([['mine', ['blocker']]]),
  });
  state.turn.priorityPlayerId = 'p2';

  resolveBlessingAndChooseColor(state, 'R');
});

test('M235: a nonlethal block is not a reason to spend Benevolent Blessing', () => {
  const state = scenario({ step: 'combat_damage', phase: 'combat', activePlayer: 'p2' });
  patchObject(state, 'mine', { tapped: true, power: 3, toughness: 3 });
  put(state, 'blocker', 'goblin-piker', 'p1', 'battlefield', { power: 1, toughness: 1 });
  setCombat(state, {
    attackingPlayerId: 'p2', attackers: ['mine'],
    blockers: new Map([['mine', ['blocker']]]),
  });
  state.turn.priorityPlayerId = 'p2';

  const { aura, pass } = auraScores(state);
  assert.ok(aura < pass, `combat alone is insufficient when damage is nonlethal (${aura} vs ${pass})`);
  assert.ok(!isBlessingCast(choose(state)));
});

test('M235: respond to lethal Fireball damage, choose red, and prevent the spell damage', () => {
  const state = lethalDirectSpellScenario({ cardId: 'fireball', xValue: 2, toughness: 2 });
  const view = playerView(state, 'p2');
  const fireball = view.zones.stack.at(-1);
  assert.equal(fireball.xValue, 2, 'public stack view carries the announced X value');
  assert.deepEqual(fireball.targets, ['mine']);

  resolveBlessingAndChooseColor(state, 'R');
  passP2ThenP1(state);
  assert.equal(state.objects.get('mine').zone, 'battlefield', 'the threatened creature survives');
  assert.equal(state.objects.get('mine').damage, 0, 'protection prevents Fireball damage');
});

test('M235: evaluate graveyard-scaled direct damage from its public stack state', () => {
  const state = graveyardScaledDamageScenario();
  const view = playerView(state, 'p2');
  assert.equal(view.zones.graveyard.filter((card) => card.controllerId === 'p1').length, 2);

  resolveBlessingAndChooseColor(state, 'R');
  passP2ThenP1(state);
  assert.equal(state.objects.get('mine').zone, 'battlefield');
  assert.equal(state.objects.get('mine').damage, 0);
});

test('M235: protect from the lethal creature source of a spell, not the spell color', () => {
  const state = creatureSourceDamageScenario();
  const spell = playerView(state, 'p2').zones.stack.at(-1);
  assert.equal(spell.colors[0], 'G', 'Chocobo Kick itself is green');

  resolveBlessingAndChooseColor(state, 'B');
  passP2ThenP1(state);
  assert.equal(state.objects.get('mine').zone, 'battlefield', 'deathtouch damage is prevented');
  assert.equal(state.objects.get('mine').damage, 0);
});

test('M235: protect against lethal divided damage from a multicolored spell source', () => {
  const state = dividedDamageScenario();
  const view = playerView(state, 'p2');
  assert.deepEqual(view.zones.stack.at(-1).damageDivision,
    [{ id: 'mine', amount: 2 }, { id: 'p2', amount: 3 }],
    'the public stack entry exposes the announced damage assignment');
  resolveBlessingAndChooseColor(state, 'W');
});

test('M235: do not spend the Aura on a direct-damage spell that is not lethal', () => {
  const state = lethalDirectSpellScenario({ cardId: 'shock', toughness: 3 });
  const { aura, pass } = auraScores(state);
  assert.ok(aura < pass, `nonlethal direct damage is not a protection-trick window (${aura} vs ${pass})`);
  assert.ok(!isBlessingCast(choose(state)));
});

test('M235: existing prevention shields stop a false lethal-damage window', () => {
  const state = lethalDirectSpellScenario({ cardId: 'shock', toughness: 2 });
  state.damageShields = [{ targetId: 'mine', remaining: 2 }];
  const { aura, pass } = auraScores(state);
  assert.ok(aura < pass, `the shield absorbs all damage, so hold the Aura (${aura} vs ${pass})`);
  assert.ok(!isBlessingCast(choose(state)));
});

test('M235: a shield counter prevents a false direct-damage window', () => {
  const state = lethalDirectSpellScenario({ cardId: 'shock', toughness: 2 });
  patchObject(state, 'mine', { counters: { shield: 1 } });

  assert.ok(!isBlessingCast(choose(state)), 'the shield counter prevents the full Shock damage event');
});

test('M235: an unselected modal damage effect is not an imminent lethal-damage source', () => {
  const state = nonDamageModalScenario();
  const view = playerView(state, 'p2');
  const spell = view.zones.stack.at(-1);
  assert.equal(spell.chosenMode, 1, 'the public stack entry exposes the selected non-damage mode');
  assert.ok(!isBlessingCast(choose(state)), 'artifact exile is not a lethal-damage trick window');
});

test('M235: choose the blocker source color after the opponent declares attackers', () => {
  const state = scenario({ step: 'declare_blockers', phase: 'combat', activePlayer: 'p1' });
  put(state, 'attacker', 'goblin-piker', 'p1', 'battlefield', {
    power: 3, toughness: 3, tapped: true,
  });
  setCombat(state, { attackingPlayerId: 'p1', attackers: ['attacker'] });
  state.turn.priorityPlayerId = 'p2';

  resolveBlessingAndChooseColor(state, 'R');
});
