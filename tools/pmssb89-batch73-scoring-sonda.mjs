// PMSSB-89 — Batch 73 card-scoring cross-check and probes for uncovered paths.
// Run with: node tools/pmssb89-batch73-scoring-sonda.mjs
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function stateAt(step = 'main') {
  const state = createGameState({ seed: 89, players: [{ id: 'p1' }, { id: 'p2' }] });
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
  const bot = createHeuristicBot({ seed: 89, randomness: 0, lookahead: 0, registry: REGISTRY,
    ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, playerId), {});
  return { choice, options: bot.trace().at(-1)?.options ?? [] };
}

function optionScore(options, predicate) {
  const values = options.filter((option) => predicate(option.cmd)).map((option) => option.score);
  return values.length ? Math.max(...values) : null;
}

function cmdKey(cmd) {
  if (typeof cmd === 'string') return cmd;
  if (cmd && typeof cmd === 'object') {
    return `${cmd.type}(${cmd.objectId || cmd.id || '?'})`;
  }
  return String(cmd);
}

function richMana(state, playerId) {
  for (const c of ['W', 'U', 'B', 'R', 'G']) addMana(state, playerId, 10, { colors: [c] });
}

export function probePlummet(setup = () => {}) {
  const state = stateAt();
  put(state, 'plummet-hand', 'plummet', 'p1', 'hand');
  richMana(state, 'p1');
  setup(state);
  put(state, 'target', 'illusory-demon', 'p2', 'battlefield'); // flying target
  const view = playerView(state, 'p1');
  const castOffer = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'plummet-hand');
  const result = trace(state);
  const castScore = optionScore(result.options, (o) => cmdKey(o.cmd).startsWith('cast_spell(plummet-hand'));
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'plummet', hasCastOffer: Boolean(castOffer), castScore, chosen };
}

export function probeGetThePoint(setup = () => {}) {
  const state = stateAt();
  put(state, 'gtp-hand', 'get-the-point', 'p1', 'hand');
  richMana(state, 'p1');
  setup(state);
  put(state, 'target', 'leonin-lightbringer', 'p2', 'battlefield');
  const view = playerView(state, 'p1');
  const castOffer = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'gtp-hand');
  const result = trace(state);
  const castScore = optionScore(result.options, (o) => cmdKey(o.cmd).startsWith('cast_spell(gtp-hand'));
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'get-the-point', hasCastOffer: Boolean(castOffer), castScore, chosen };
}

export function probeMessengersSpeed(setup = () => {}) {
  const state = stateAt();
  put(state, 'ms-hand', "messengers-speed", 'p1', 'hand');
  richMana(state, 'p1');
  setup(state);
  put(state, 'target', 'leonin-lightbringer', 'p1', 'battlefield');
  const result = trace(state);
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: "messengers-speed", chosen };
}

export function probeMightBeyondReason(setup = () => {}) {
  const state = stateAt();
  put(state, 'mbr-hand', 'might-beyond-reason', 'p1', 'hand');
  richMana(state, 'p1');
  setup(state);
  put(state, 'body', 'leonin-lightbringer', 'p1', 'battlefield'); // 3/2 body
  put(state, 'target', 'kessig-flamebreather', 'p1', 'battlefield'); // target to pump
  const view = playerView(state, 'p1');
  const castOffer = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'mbr-hand');
  const result = trace(state);
  const castScore = optionScore(result.options, (o) => cmdKey(o.cmd).startsWith('cast_spell(mbr-hand'));
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'might-beyond-reason', hasCastOffer: Boolean(castOffer), castScore, chosen };
}

export function probeRiverHeraldGuide(setup = () => {}) {
  const state = stateAt();
  put(state, 'rhg-hand', 'river-herald-guide', 'p1', 'hand');
  richMana(state, 'p1');
  setup(state);
  for (let i = 0; i < 5; i += 1) put(state, `lib-${i}`, 'basic-forest', 'p1', 'library');
  const result = trace(state);
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'river-herald-guide', chosen };
}

export function probeSetonsDesire(setup = () => {}) {
  const state = stateAt();
  put(state, 'sd-hand', 'setons-desire', 'p1', 'hand');
  richMana(state, 'p1');
  setup(state);
  put(state, 'target', 'leonin-lightbringer', 'p1', 'battlefield');
  const result = trace(state);
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'setons-desire', chosen };
}

export function probeSpringLoadedSawblades(setup = () => {}) {
  const state = stateAt();
  put(state, 'sls-hand', 'spring-loaded-sawblades', 'p1', 'hand');
  richMana(state, 'p1');
  setup(state);
  const view = playerView(state, 'p1');
  const castOffer = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'sls-hand');
  const result = trace(state);
  const castScore = optionScore(result.options, (o) => cmdKey(o.cmd).startsWith('cast_spell(sls-hand'));
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'spring-loaded-sawblades', hasCastOffer: Boolean(castOffer), castScore, chosen };
}

export function probeLeoninLightbringer(setup = () => {}) {
  const state = stateAt();
  put(state, 'll-bf', 'leonin-lightbringer', 'p1', 'battlefield');
  richMana(state, 'p1');
  setup(state);
  put(state, 'target', 'kessig-flamebreather', 'p2', 'battlefield');
  const result = trace(state);
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'leonin-lightbringer', chosen };
}

export function probeNecrosavant(setup = () => {}) {
  const state = stateAt();
  put(state, 'necro-bf', 'necrosavant', 'p1', 'battlefield');
  richMana(state, 'p1');
  setup(state);
  put(state, 'target', 'leonin-lightbringer', 'p1', 'graveyard');
  const result = trace(state);
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'necrosavant', chosen };
}

export function probeKessigFlamebreather(setup = () => {}) {
  const state = stateAt();
  put(state, 'kf-bf', 'kessig-flamebreather', 'p1', 'battlefield');
  richMana(state, 'p1');
  setup(state);
  put(state, 'target', 'leonin-lightbringer', 'p2', 'battlefield');
  const result = trace(state);
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId: 'kessig-flamebreather', chosen };
}

if (import.meta.url === process.argv[1]) {
  console.log('=== PMSSB-89 — Batch 73 scoring probe ===\n');

  console.log('Plummet (destroy flying):', JSON.stringify(probePlummet()));
  console.log('Get the Point (destroy any creature + scry):', JSON.stringify(probeGetThePoint()));
  console.log("Messenger's Speed (aura +1/+1 haste/trample):", JSON.stringify(probeMessengersSpeed()));
  console.log('Might Beyond Reason (+X/+X board pump):', JSON.stringify(probeMightBeyondReason()));
  console.log('River Herald Guide (explore):', JSON.stringify(probeRiverHeraldGuide()));
  console.log("Seton's Desire (aura +2/+2 ward {2}):", JSON.stringify(probeSetonsDesire()));
  console.log('Spring-Loaded Sawblades (craft DFC):', JSON.stringify(probeSpringLoadedSawblades()));
  console.log('Leonin Lightbringer ({W},{T} tap target):', JSON.stringify(probeLeoninLightbringer()));
  console.log('Necrosavant (reanimate minGraveyardCards):', JSON.stringify(probeNecrosavant()));
  console.log('Kessig Flamebreather ({1}{R},{T} damage 2):', JSON.stringify(probeKessigFlamebreather()));
  console.log('\n=== Probe complete ===');
}
