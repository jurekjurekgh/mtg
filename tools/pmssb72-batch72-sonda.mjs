// PMSSB-72 (batch 72) — focused probes for the three newly shared rule paths.
// Run with: node tools/pmssb72-batch72-sonda.mjs
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function baseState(step = 'main') {
  const state = createGameState({ seed: 72, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield', overrides = {}) {
  const def = REGISTRY.get(cardId);
  if (!def) throw new Error(`unknown card definition: ${cardId}`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], ...overrides,
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  return state.objects.get(id);
}

function botTrace(state, playerId = 'p1') {
  const bot = createHeuristicBot({ seed: 72, randomness: 0, lookahead: 0, registry: REGISTRY });
  const command = bot.chooseCommand(playerView(state, playerId), {});
  const options = (bot.trace().at(-1)?.options ?? []).map((option) => ({
    command: option.cmd, score: option.score,
  }));
  return { bot, command, options };
}

function maxScore(options, predicate) {
  const scores = options.filter((option) => predicate(option.command)).map((option) => option.score);
  return scores.length ? Math.max(...scores) : null;
}

export function probeRestrictedMana() {
  const enchantment = baseState();
  put(enchantment, 'peeper', 'creeping-peeper');
  put(enchantment, 'living', 'living-history', 'p1', 'hand');
  addMana(enchantment, 'p1', 1, { colors: ['R'] });
  const enchantmentTrace = botTrace(enchantment);

  const ordinary = baseState();
  put(ordinary, 'peeper', 'creeping-peeper');
  const ordinarySorcery = {
    id: 'pmssb72-ordinary-sorcery', name: 'Ordinary Sorcery', set: 'TST',
    types: ['Sorcery'], colors: ['R'], manaCost: 2,
    spell: { timing: 'sorcery', targets: [], effects: [{ type: 'gain_life', amount: 1 }] },
  };
  addObject(ordinary, {
    id: 'ordinary', instanceId: 'i-ordinary', cardId: ordinarySorcery.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'hand', kind: 'spell',
    ...gameObjectDataOf(ordinarySorcery), types: ordinarySorcery.types, spell: ordinarySorcery.spell,
  });
  addMana(ordinary, 'p1', 1, { colors: ['R'] });
  const ordinaryTrace = botTrace(ordinary);
  return {
    enchantment: {
      chosen: enchantmentTrace.command,
      castScore: maxScore(enchantmentTrace.options, (command) => command.startsWith('cast_permanent(living')),
      passScore: maxScore(enchantmentTrace.options, (command) => command === 'pass_priority'),
      options: enchantmentTrace.options,
    },
    ordinarySpell: {
      castScore: maxScore(ordinaryTrace.options,
        (command) => command.includes('ordinary') && command.startsWith('cast_')),
      options: ordinaryTrace.options,
    },
  };
}

export function probeVortexRunner(landCount) {
  const state = baseState('declare_attackers');
  for (let index = 0; index < landCount; index += 1) put(state, `land-${index}`, 'basic-island');
  put(state, 'runner', 'vortex-runner');
  put(state, 'blocker', 'hill-giant', 'p2');
  const trace = botTrace(state);
  return {
    landCount,
    chosen: trace.command,
    attackScore: maxScore(trace.options, (command) => command === 'attack[runner]'),
    passScore: maxScore(trace.options, (command) => command === 'attack[]' || command === 'pass_priority'),
    options: trace.options,
  };
}

export function probeLivingHistory({ cardLeftGraveyard = true } = {}) {
  const state = baseState('declare_attackers');
  put(state, 'history', 'living-history');
  put(state, 'small-attacker', 'kraken-hatchling');
  put(state, 'large-attacker', 'hill-giant');
  if (cardLeftGraveyard) {
    put(state, 'grave-card', 'basic-forest', 'p1', 'graveyard');
    moveObjectDirectly(state, 'grave-card', 'exile', 'exiled-card');
  }
  const attack = execute(state, {
    type: 'declare_attackers', playerId: 'p1', attackerIds: ['small-attacker', 'large-attacker'],
  });
  if (!attack.ok) throw new Error(`attack declaration failed: ${JSON.stringify(attack)}`);
  const initialView = playerView(state, 'p1');
  // Audyt PR #179/A-1 (CR 508.3d): „Whenever you attack" odpala się RAZ na
  // deklarację, więc pojedynczy trigger nie potrzebuje partii
  // resolve_trigger_order — jego decyzja celu otwiera się wprost. Kolejność
  // rozstrzygamy tylko, gdy checkpoint ją oferuje.
  const order = initialView.legalCommands.find((command) => command.type === 'resolve_trigger_order');
  if (order) {
    const resolvedOrder = execute(state, order);
    if (!resolvedOrder.ok) throw new Error(`trigger order failed: ${JSON.stringify(resolvedOrder)}`);
  }
  const trace = botTrace(state);
  const targetScores = trace.options.filter((option) => option.command.startsWith('resolve_trigger_target('));
  const pending = playerView(state, 'p1').pendingTriggerTarget;
  return {
    cardLeftGraveyard,
    triggerQueued: targetScores.length > 0 || pending != null,
    targetScores,
    chosenTarget: trace.command.targetId ?? null,
  };
}

if (process.argv[1]?.endsWith('pmssb72-batch72-sonda.mjs')) {
  console.log(JSON.stringify({
    restrictedMana: probeRestrictedMana(),
    vortexRunner: [7, 8, 9].map(probeVortexRunner),
    livingHistory: [
      probeLivingHistory({ cardLeftGraveyard: false }),
      probeLivingHistory({ cardLeftGraveyard: true }),
    ],
  }, null, 2));
}
