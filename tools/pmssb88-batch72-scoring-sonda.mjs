// PMSSB-88 — full Batch 72 card-scoring cross-check and probes for uncovered paths.
// Run with: node tools/pmssb88-batch72-scoring-sonda.mjs
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect, manifestCardFaceDown } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function stateAt(step = 'main') {
  const state = createGameState({ seed: 88, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function trace(state, { playerId = 'p1', params = undefined } = {}) {
  const bot = createHeuristicBot({ seed: 88, randomness: 0, lookahead: 0, registry: REGISTRY,
    ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, playerId), {});
  return { choice, options: bot.trace().at(-1)?.options ?? [] };
}

function optionScore(options, predicate) {
  const values = options.filter((option) => predicate(option.cmd)).map((option) => option.score);
  return values.length ? Math.max(...values) : null;
}

export function probeOpenTheGates({ searchLandScrewBonus } = {}) {
  const state = stateAt();
  put(state, 'gates', 'open-the-gates', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['G'] });
  for (let index = 0; index < 24; index += 1) {
    put(state, `lib-${index}`, index % 2 ? 'dimir-guildgate' : 'basic-forest', 'p1', 'library');
  }
  const result = trace(state, { params: searchLandScrewBonus == null ? undefined : { searchLandScrewBonus } });
  return {
    castScore: optionScore(result.options, (cmd) => cmd.startsWith('cast_spell(gates')),
    passScore: optionScore(result.options, (cmd) => cmd === 'pass_priority'),
    chosen: result.choice,
  };
}

export function probePeeperFaceUp({ peeper = true } = {}) {
  const state = stateAt();
  if (peeper) put(state, 'peeper', 'creeping-peeper');
  put(state, 'library-top', 'shiva-warden-of-ice', 'p1', 'library');
  const faceDownId = manifestCardFaceDown(state, 'library-top', 'p1');
  // The manifested card is 4/5 for {2}{U}; the Peeper's restricted {U} plus
  // two generic units can legally pay. Without the Peeper, the offer is absent.
  addMana(state, 'p1', 2, { colors: [] });
  const before = playerView(state, 'p1');
  const flipOffer = before.legalCommands.find((cmd) => cmd.type === 'turn_manifest_face_up'
    && cmd.objectId === faceDownId);
  const result = trace(state);
  const turnScore = optionScore(result.options, (cmd) => cmd.startsWith('turn_manifest_face_up'));
  let executed = null;
  if (result.choice?.type === 'turn_manifest_face_up') executed = execute(state, result.choice);
  return {
    hasPeeper: peeper,
    flipOffered: Boolean(flipOffer),
    turnScore,
    passScore: optionScore(result.options, (cmd) => cmd === 'pass_priority'),
    chosen: result.choice,
    executed: executed?.ok ?? null,
    peeperTapped: state.objects.get('peeper')?.tapped ?? null,
    faceUp: state.objects.get(faceDownId)?.faceDown === false,
  };
}

export function probeLinkedExileTargets() {
  const state = stateAt();
  const source = put(state, 'light', 'banishing-light');
  put(state, 'small', 'kraken-hatchling', 'p2');
  put(state, 'large', 'thornhide-wolves', 'p2');
  const ability = REGISTRY.get('banishing-light').abilities[0];
  state.pendingTriggerTargets.push({ playerId: 'p1', sourceId: source.id, cardId: source.cardId,
    ability, candidates: [], allowNone: false, fixedTargetIds: [], extra: {} });
  const result = trace(state);
  return {
    choice: result.choice,
    targetScores: result.options.filter((option) => option.cmd.startsWith('resolve_trigger_target(')),
  };
}

export function probeLinkedExileRemoval({ linked = true, sourceController = 'p2' } = {}) {
  const state = stateAt();
  const source = put(state, 'light', 'banishing-light', sourceController);
  const targetController = sourceController === 'p2' ? 'p1' : 'p2';
  if (linked) {
    put(state, 'exiled-target', 'thornhide-wolves', targetController);
    // This is the actual shared linked-exile effect; the LTB return is
    // observable in PlayerView through the public `temporaryExile` LKI.
    applyEffect(state, { type: 'exile_nonland_permanent_linked' }, source, ['exiled-target']);
  }
  put(state, 'naturalize', 'naturalize', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const result = trace(state);
  const targetCmd = result.options.find((option) => option.cmd.includes('naturalize->light'));
  return { linked, sourceController, score: targetCmd?.score ?? null, chosen: result.choice };
}

export function probeLinkedExileActivation({ linked = true } = {}) {
  const state = stateAt();
  const light = put(state, 'light', 'banishing-light', 'p2');
  if (linked) {
    put(state, 'exiled-target', 'thornhide-wolves', 'p1');
    applyEffect(state, { type: 'exile_nonland_permanent_linked' }, light, ['exiled-target']);
  }
  put(state, 'capsule', 'dispellers-capsule');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const result = trace(state);
  return {
    linked,
    activationScore: optionScore(result.options, (cmd) => cmd.startsWith('activate_ability(capsule')),
    passScore: optionScore(result.options, (cmd) => cmd === 'pass_priority'),
    chosen: result.choice,
  };
}

export function probeLichsCaressTargets() {
  const state = stateAt();
  put(state, 'caress', 'lichs-caress', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  put(state, 'small', 'kraken-hatchling', 'p2');
  put(state, 'large', 'thornhide-wolves', 'p2');
  const result = trace(state);

  // Composition control: same sorcery speed, mana cost and destroy effect,
  // but no 3-life rider. The delta isolates gain_life scoring (not target P/T).
  const control = stateAt();
  const destroyOnly = { id: 'pmssb88-destroy-only', name: 'Destroy only', types: ['Sorcery'],
    colors: ['B'], manaCost: 5,
    spell: { timing: 'sorcery', targets: [{ type: 'creature' }], effects: [{ type: 'destroy_permanent' }] } };
  addObject(control, { id: 'control-caress', instanceId: 'i-control-caress', cardId: destroyOnly.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(destroyOnly),
    types: destroyOnly.types, spell: destroyOnly.spell });
  addMana(control, 'p1', 5, { colors: ['B'] });
  put(control, 'small-control', 'kraken-hatchling', 'p2');
  put(control, 'large-control', 'thornhide-wolves', 'p2');
  const controlResult = trace(control);
  return {
    choice: result.choice,
    castScores: result.options.filter((option) => option.cmd.startsWith('cast_spell(caress')),
    passScore: optionScore(result.options, (cmd) => cmd === 'pass_priority'),
    noLifeLargeScore: optionScore(controlResult.options,
      (cmd) => cmd.startsWith('cast_spell(control-caress') && cmd.endsWith('->large-control)')),
  };
}

export function probeLivingHistoryToken() {
  const state = stateAt();
  put(state, 'history', 'living-history', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const result = trace(state);
  return {
    chosen: result.choice,
    castScore: optionScore(result.options, (cmd) => cmd.startsWith('cast_permanent(history')),
    passScore: optionScore(result.options, (cmd) => cmd === 'pass_priority'),
  };
}

export function probeCreatureBaseline(cardId) {
  const state = stateAt();
  put(state, 'creature', cardId, 'p1', 'hand');
  const def = REGISTRY.get(cardId);
  const color = def.colors?.[0];
  addMana(state, 'p1', def.manaCost, { colors: color ? [color] : [] });
  const result = trace(state);
  return {
    cardId,
    chosen: result.choice,
    castScore: optionScore(result.options, (cmd) => cmd.startsWith('cast_permanent(creature')),
    passScore: optionScore(result.options, (cmd) => cmd === 'pass_priority'),
  };
}

export function probeRidgewolfPump({ combat = true } = {}) {
  const state = stateAt(combat ? 'declare_blockers' : 'main');
  const wolf = put(state, 'wolf', 'feral-ridgewolf');
  if (combat) {
    state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
    state.turn.activePlayerId = 'p2';
    state.turn.priorityPlayerId = 'p1';
    put(state, 'attacker', 'hill-giant', 'p2', 'battlefield', { power: 2, toughness: 2 });
    state.combat = { attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers: ['attacker'],
      blockers: new Map([['attacker', ['wolf']]]) };
  }
  addMana(state, 'p1', 2, { colors: ['R'] });
  const result = trace(state);
  return {
    chosen: result.choice,
    activationScore: optionScore(result.options, (cmd) => cmd.startsWith('activate_ability(wolf')),
    passScore: optionScore(result.options, (cmd) => cmd === 'pass_priority'),
    ability: REGISTRY.get(wolf.cardId).abilities[0],
  };
}

if (process.argv[1]?.endsWith('pmssb88-batch72-scoring-sonda.mjs')) {
  console.log(JSON.stringify({
    openTheGates: { measured: probeOpenTheGates(), control: probeOpenTheGates({ searchLandScrewBonus: 0 }) },
    peeperFaceUp: { withPeeper: probePeeperFaceUp(), withoutPeeper: probePeeperFaceUp({ peeper: false }) },
    linkedExile: probeLinkedExileTargets(),
    linkedExileRemoval: [
      probeLinkedExileRemoval({ linked: false, sourceController: 'p2' }),
      probeLinkedExileRemoval({ linked: true, sourceController: 'p2' }),
      probeLinkedExileRemoval({ linked: false, sourceController: 'p1' }),
      probeLinkedExileRemoval({ linked: true, sourceController: 'p1' }),
    ],
    linkedExileActivation: [probeLinkedExileActivation({ linked: false }), probeLinkedExileActivation()],
    lichsCaress: probeLichsCaressTargets(),
    livingHistoryToken: probeLivingHistoryToken(),
    vanillaBodies: ['kraken-hatchling', 'pheres-band-centaurs'].map(probeCreatureBaseline),
    ridgewolfBody: probeCreatureBaseline('feral-ridgewolf'),
    ridgewolfPump: { usefulCombat: probeRidgewolfPump(), idle: probeRidgewolfPump({ combat: false }) },
    flyingBody: probeCreatureBaseline('shining-aerosaur'),
  }, null, 2));
}
