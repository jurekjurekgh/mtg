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

function probe(cardId, handId, setup = () => {}) {
  const state = stateAt();
  put(state, handId, cardId, 'p1', 'hand');
  setup(state);
  const view = playerView(state, 'p1');
  const castOffer = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === handId);
  const result = trace(state);
  const castScore = optionScore(result.options, (o) => {
    const k = cmdKey(o.cmd);
    return k.startsWith(`cast_spell(${handId}`);
  });
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId, hasCastOffer: Boolean(castOffer), castScore, chosen };
}

function probeBattlefield(cardId, bfId, setup = () => {}) {
  const state = stateAt();
  put(state, bfId, cardId, 'p1', 'battlefield');
  setup(state);
  const result = trace(state);
  const chosen = result.choice ? cmdKey(result.choice) : '(none)';
  return { cardId, chosen };
}

console.log('=== PMSSB-89 — Batch 73 scoring probe ===\n');

// 1. Plummet — destroy flying creature
const p1 = probe('plummet', 'plummet-hand', (s) => {
  put(s, 'target', 'leonin-lightbringer', 'p2', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['G'] });
});
console.log('Plummet (destroy flying):', JSON.stringify({ hasCastOffer: p1.hasCastOffer, castScore: p1.castScore, chosen: p1.chosen }));

// 2. Get the Point — deal 2 damage to any target
const p2 = probe('get-the-point', 'gtp-hand', (s) => {
  put(s, 'target', 'leonin-lightbringer', 'p2', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['R'] });
});
console.log('Get the Point (damage 2 any target):', JSON.stringify({ hasCastOffer: p2.hasCastOffer, castScore: p2.castScore, chosen: p2.chosen }));

// 3. Messenger's Speed — aura +1/+1 and haste (trample)
const p3 = probe("messengers-speed", 'ms-hand', (s) => {
  put(s, 'target', 'leonin-lightbringer', 'p1', 'battlefield');
  addMana(s, 'p1', 1, { colors: ['R'] });
});
console.log("Messenger's Speed (aura +1/+1 haste/trample):", JSON.stringify({ hasCastOffer: p3.hasCastOffer, castScore: p3.castScore, chosen: p3.chosen }));

// 4. Might Beyond Reason — +X/+X where X = greatest power among creatures you control
const p4 = probe('might-beyond-reason', 'mbr-hand', (s) => {
  put(s, 'body', 'leonin-lightbringer', 'p1', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['G'] });
});
console.log('Might Beyond Reason (+X/+X board pump):', JSON.stringify({ hasCastOffer: p4.hasCastOffer, castScore: p4.castScore, chosen: p4.chosen }));

// 5. River Herald Guide — explore
const p5 = probe('river-herald-guide', 'rhg-hand', (s) => {
  for (let i = 0; i < 5; i += 1) put(s, `lib-${i}`, 'basic-forest', 'p1', 'library');
  addMana(s, 'p1', 1, { colors: ['G'] });
});
console.log('River Herald Guide (explore):', JSON.stringify({ hasCastOffer: p5.hasCastOffer, castScore: p5.castScore, chosen: p5.chosen }));

// 6. Seton's Desire — aura +2/+2 and ward {2}
const p6 = probe('setons-desire', 'sd-hand', (s) => {
  put(s, 'target', 'leonin-lightbringer', 'p1', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['G', 'W'] });
});
console.log('Seton\'s Desire (aura +2/+2 ward {2}):', JSON.stringify({ hasCastOffer: p6.hasCastOffer, castScore: p6.castScore, chosen: p6.chosen }));

// 7. Spring-Loaded Sawblades — DFC craft/transform (front face is artifact creature)
const p7 = probe('spring-loaded-sawblades', 'sls-hand', (s) => {
  addMana(s, 'p1', 4, { colors: ['W'] });
});
console.log('Spring-Loaded Sawblades (craft DFC):', JSON.stringify({ hasCastOffer: p7.hasCastOffer, castScore: p7.castScore, chosen: p7.chosen }));

// 8. Leonin Lightbringer — {W},{T} tap target creature
const p8 = probeBattlefield('leonin-lightbringer', 'll-bf', (s) => {
  put(s, 'target', 'kessig-flamebreather', 'p2', 'battlefield');
  addMana(s, 'p1', 1, { colors: ['W'] });
});
console.log('Leonin Lightbringer ({W},{T} tap target):', JSON.stringify({ chosen: p8.chosen }));

// 9. Necrosavant — reanimate from graveyard with minGraveyardCards
const p9 = probeBattlefield('necrosavant', 'necro-bf', (s) => {
  put(s, 'target', 'leonin-lightbringer', 'p1', 'graveyard');
  addMana(s, 'p1', 5, { colors: ['B'] });
});
console.log('Necrosavant (reanimate minGraveyardCards):', JSON.stringify({ chosen: p9.chosen }));

// 10. Kessig Flamebreather — {1}{R},{T} deal 2 damage
const p10 = probeBattlefield('kessig-flamebreather', 'kf-bf', (s) => {
  put(s, 'target', 'leonin-lightbringer', 'p2', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['R'] });
});
console.log('Kessig Flamebreather ({1}{R},{T} damage 2):', JSON.stringify({ chosen: p10.chosen }));

console.log('\n=== Probe complete ===');
console.log('Interpretation:');
console.log('- castScore null = bot does not offer to cast the card (scoring gap)');
console.log('- chosen not starting with cast_spell = bot passes instead of casting');
console.log('- castScore very low = bot undervalues the card');
