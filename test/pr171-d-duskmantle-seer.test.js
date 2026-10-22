import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const SEER = REGISTRY.get('duskmantle-seer');

/** Creates a legal main-phase Seer cast with public life/library counts. */
function castScore({ botLife = 20, opponentLife = 20, botLibrary = 40, opponentLibrary = 40 } = {}) {
  const state = createGameState({ seed: 171, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.players.find((player) => player.id === 'p1').life = botLife;
  state.players.find((player) => player.id === 'p2').life = opponentLife;

  // {2}{U}{B}: colored sources plus two generic sources, so this is a real,
  // legal cast rather than a synthetic command-score-only probe.
  addMana(state, 'p1', 1, { colors: ['U'] });
  addMana(state, 'p1', 1, { colors: ['B'] });
  addMana(state, 'p1', 2);

  addObject(state, {
    id: 'seer', instanceId: 'i-seer', cardId: 'duskmantle-seer',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(SEER), types: SEER.types, subtypes: SEER.subtypes,
    keywords: SEER.keywords,
  });
  for (const [playerId, count] of [['p1', botLibrary], ['p2', opponentLibrary]]) {
    for (let i = 0; i < count; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'basic-swamp', controllerId: playerId, ownerId: playerId,
        zone: 'library', ...gameObjectDataOf(REGISTRY.get('basic-swamp')),
      });
    }
  }

  const bot = createHeuristicBot({ seed: 171 });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  const cast = bot.trace().at(-1).options.find((option) => option.cmd === 'cast_permanent(seer)');
  assert.ok(cast, 'legal Duskmantle Seer cast is present in the scored choices');
  return { score: cast.score, chosen };
}

function assertRejectedByGuard(scene, why) {
  const { score, chosen } = castScore(scene);
  assert.equal(score, Number.NEGATIVE_INFINITY, `${why}: cast is a hard veto`);
  assert.notEqual(chosen.type, 'cast_permanent', `${why}: bot chooses a different legal action`);
}

function assertAllowed(scene, why) {
  const { score, chosen } = castScore(scene);
  assert.ok(Number.isFinite(score), `${why}: cast remains available to the scorer`);
  assert.equal(chosen.type, 'cast_permanent', `${why}: Seer is the best available action`);
  assert.equal(chosen.objectId, 'seer');
}

test('PR171/D — life guard is exactly botLife > opponentLife OR botLife > 15', () => {
  assertRejectedByGuard({ botLife: 14, opponentLife: 15 }, 'bot behind at 14');
  assertRejectedByGuard({ botLife: 15, opponentLife: 15 }, 'equal at the strict 15 boundary');
  assertAllowed({ botLife: 15, opponentLife: 14 }, 'bot leads even at 15');
  assertAllowed({ botLife: 16, opponentLife: 20 }, 'buffer above 15 overrides a life deficit');
  assertAllowed({ botLife: 16, opponentLife: 15 }, 'bot leads above 15');
});

test('PR171/D — library guard is the strict <10 AND behind condition', () => {
  assertRejectedByGuard({ botLibrary: 9, opponentLibrary: 10 }, '9 behind 10');
  assertAllowed({ botLibrary: 10, opponentLibrary: 11 }, 'exactly 10 is outside the <10 cutoff');
  assertAllowed({ botLibrary: 9, opponentLibrary: 9 }, '9 tied with 9 is not behind');
  assertAllowed({ botLibrary: 9, opponentLibrary: 8 }, '9 ahead of 8 is not behind');
});

test('PR171/D — draw-step safety covers Seer taking the last card before bot draws', () => {
  // CR 503.1/504.1: the Seer trigger resolves in upkeep before the active
  // player’s draw step. CR 121.5: moving the top card to hand is NOT a draw,
  // so with one card in each library the opponent draws its last card first,
  // then Seer moves the bot’s last card, and the bot loses on its draw step
  // (CR 121.4). This immediate loss is not covered by the relative <10 rule
  // when the libraries are tied.
  assertRejectedByGuard({ botLibrary: 1, opponentLibrary: 1 }, 'one card each: Seer empties bot library before its draw');

  // At 10 cards, the upcoming Seer reveal plus the normal draw leaves eight;
  // there is no immediate draw-step loss, so do not shift the strategic <10
  // cutoff to 11 or 12.
  assertAllowed({ botLibrary: 10, opponentLibrary: 11 }, '10 cards survive Seer plus the next normal draw');
});
