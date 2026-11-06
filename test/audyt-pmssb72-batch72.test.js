// PMSSB-72 — RED/GREEN decision pins for batch 72's three new generic paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  probeLivingHistory, probeRestrictedMana, probeVortexRunner,
} from '../tools/pmssb72-batch72-sonda.mjs';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

test('PMSSB-72/1: purpose-restricted Peeper mana funds an enchantment, not a sorcery', () => {
  const result = probeRestrictedMana();
  assert.equal(result.enchantment.chosen.type, 'cast_permanent');
  assert.equal(result.enchantment.chosen.objectId, 'living');
  assert.ok(result.enchantment.castScore > result.enchantment.passScore,
    `enchantment is valued above pass (${result.enchantment.castScore} vs ${result.enchantment.passScore})`);
  assert.equal(result.ordinarySpell.castScore, null,
    'the same {U} purpose unit does not create an ordinary sorcery offer');
  assert.ok(result.ordinarySpell.options.some((option) => option.command === 'pass_priority'));
  assert.ok(!Object.keys(DEFAULT_HEURISTIC_PARAMS).some((key) => key.toLowerCase().includes('peeper')
    || key.toLowerCase().includes('purpose')),
  'generic purpose handling reuses the existing score scale; no card-specific knob');
});

test('PMSSB-72/2: Vortex Runner bot valuation crosses at 8 lands and remains live at 9', () => {
  const seven = probeVortexRunner(7);
  const eight = probeVortexRunner(8);
  const nine = probeVortexRunner(9);
  assert.ok(seven.attackScore < seven.passScore,
    `a legal 2/2 block makes the 7-land attack a hold (${seven.attackScore} vs ${seven.passScore})`);
  assert.equal(seven.chosen.attackerIds.length, 0, 'bot holds the runner below threshold');
  assert.ok(eight.attackScore > eight.passScore,
    `active evasion makes the 8-land attack worthwhile (${eight.attackScore} vs ${eight.passScore})`);
  assert.deepEqual(eight.chosen.attackerIds, ['runner']);
  assert.ok(nine.attackScore > nine.passScore, 'the condition remains active above the threshold');
});

test('PMSSB-72/3: Living History uses generic pump scoring after a qualifying departure', () => {
  const negative = probeLivingHistory({ cardLeftGraveyard: false });
  const positive = probeLivingHistory({ cardLeftGraveyard: true });
  assert.equal(negative.triggerQueued, false, 'no graveyard departure means no trigger');
  assert.equal(positive.triggerQueued, true, 'leaving the graveyard queues the attack trigger');
  assert.equal(positive.chosenTarget, 'large-attacker',
    'existing pump valuation chooses the higher-power attacker');
  const large = positive.targetScores.find((option) => option.command.endsWith('(large-attacker)'))?.score;
  const small = positive.targetScores.find((option) => option.command.endsWith('(small-attacker)'))?.score;
  assert.ok(large > small, `larger attacker is preferred (${large} vs ${small})`);
});
