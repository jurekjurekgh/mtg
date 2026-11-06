// PMSSB-88 — manual bot-scoring audit of every Batch 72 card, not engine-only tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  probeCreatureBaseline, probeLinkedExileActivation, probeLinkedExileRemoval,
  probeLinkedExileTargets, probeLivingHistoryToken, probeLichsCaressTargets, probeOpenTheGates,
  probePeeperFaceUp, probeRidgewolfPump,
} from '../tools/pmssb88-batch72-scoring-sonda.mjs';

const close = (actual, expected, label) => {
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: ${actual} ≠ ${expected} ±0.01`);
};

test('PMSSB-88/A: Open the Gates (Basic Land OR Gate) receives PMSSB-19 land-screw payoff', () => {
  const measured = probeOpenTheGates();
  const control = probeOpenTheGates({ searchLandScrewBonus: 0 });
  close(measured.castScore, 64, '0-land Open the Gates: 50 cast + 9 tutor + 5 land-screw');
  close(control.castScore, 59, 'zero-weight control removes exactly the +5 rider');
  assert.equal(measured.chosen.type, 'cast_spell');
  assert.ok(measured.castScore > measured.passScore);
});

test('PMSSB-88/B: Creeping Peeper restricted {U} is scored when it turns up a manifested creature', () => {
  const withPeeper = probePeeperFaceUp();
  const withoutPeeper = probePeeperFaceUp({ peeper: false });
  assert.equal(withPeeper.flipOffered, true, 'engine payment planner permits Peeper mana for turn-face-up');
  assert.ok(withPeeper.turnScore > withPeeper.passScore,
    `legal face-up action is valued (${withPeeper.turnScore} vs ${withPeeper.passScore})`);
  assert.equal(withPeeper.chosen.type, 'turn_manifest_face_up');
  assert.equal(withPeeper.executed, true, 'payment resolves, not only a projected score');
  assert.equal(withPeeper.peeperTapped, true, 'restricted mana source is tapped for the legal cost');
  assert.equal(withPeeper.faceUp, true);
  assert.equal(withoutPeeper.flipOffered, false, 'same generic pool without Peeper cannot pay blue pip');
  assert.equal(withoutPeeper.chosen.type, 'pass_priority');
});

test('PMSSB-88/C: Banishing Light linked-exile target decision values the larger opposing permanent', () => {
  const result = probeLinkedExileTargets();
  const large = result.targetScores.find((option) => option.cmd.endsWith('(large)'))?.score;
  const small = result.targetScores.find((option) => option.cmd.endsWith('(small)'))?.score;
  assert.equal(result.choice.type, 'resolve_trigger_target');
  assert.equal(result.choice.targetId, 'large');
  assert.equal(large, 43);
  assert.equal(small, 34);
  assert.ok(large > small, 'linked exile is not credited only as a rules-engine effect');
});

test('PMSSB-88/D: destroying a linked-exile source scores its own LTB return (both owner directions)', () => {
  const [unlinkedEnemySource, linkedEnemySource, unlinkedOwnSource, linkedOwnSource] = [
    probeLinkedExileRemoval({ linked: false, sourceController: 'p2' }),
    probeLinkedExileRemoval({ linked: true, sourceController: 'p2' }),
    probeLinkedExileRemoval({ linked: false, sourceController: 'p1' }),
    probeLinkedExileRemoval({ linked: true, sourceController: 'p1' }),
  ];
  assert.equal(unlinkedEnemySource.score, 78);
  assert.equal(linkedEnemySource.score, 96,
    'Naturalize returns our 4/5 (2P+T+MV = 18), adding +18');
  assert.equal(linkedEnemySource.score - unlinkedEnemySource.score, 18);
  assert.equal(unlinkedOwnSource.score, -130);
  assert.equal(linkedOwnSource.score, -148,
    'destroying our own Light would return the opponent’s 4/5, adding −18');
  assert.equal(linkedOwnSource.chosen.type, 'pass_priority');

  const unlinkedActivation = probeLinkedExileActivation({ linked: false });
  const linkedActivation = probeLinkedExileActivation();
  assert.equal(unlinkedActivation.activationScore, 27);
  assert.equal(linkedActivation.activationScore, 45,
    'activated destroy uses the same +18 linked-return adjustment as cast removal');
  assert.equal(linkedActivation.activationScore - unlinkedActivation.activationScore, 18);
  assert.equal(linkedActivation.chosen.type, 'activate_ability');
});

test('PMSSB-88/E: Lich’s Caress scores destroy plus 3 life and chooses the higher-value target', () => {
  const result = probeLichsCaressTargets();
  const large = result.castScores.find((option) => option.cmd.endsWith('->large)'))?.score;
  const small = result.castScores.find((option) => option.cmd.endsWith('->small)'))?.score;
  assert.equal(result.choice.type, 'cast_spell');
  assert.deepEqual(result.choice.targets, ['large']);
  assert.equal(large, 102);
  assert.equal(small, 84);
  assert.equal(result.noLifeLargeScore, 100);
  assert.equal(large - result.noLifeLargeScore, 2,
    'the 3-life effect contributes +2 at this state; destroy-only control isolates the rider');
  assert.ok(large > result.passScore && small > result.passScore);
});

test('PMSSB-88/F: Living History’s 2/2 token ETB adds to its card-cast value', () => {
  const result = probeLivingHistoryToken();
  assert.equal(result.chosen.type, 'cast_permanent');
  close(result.castScore, 78.2973, 'Living History cast with its 2/2 Spirit ETB');
  assert.ok(result.castScore > result.passScore);
});

test('PMSSB-88/G: baseline body valuation chooses both vanilla bodies over passing', () => {
  const hatchling = probeCreatureBaseline('kraken-hatchling');
  const centaurs = probeCreatureBaseline('pheres-band-centaurs');
  assert.equal(hatchling.chosen.type, 'cast_permanent');
  assert.equal(centaurs.chosen.type, 'cast_permanent');
  close(hatchling.castScore, 64.8018, 'Kraken Hatchling 0/4');
  close(centaurs.castScore, 69.3063, 'Pheres-Band Centaurs 3/7');
  assert.ok(hatchling.castScore > hatchling.passScore);
  assert.ok(centaurs.castScore > centaurs.passScore);
});

test('PMSSB-88/H: Ridgewolf’s paid +2/+0 activation is useful in a real block, not idle', () => {
  const body = probeCreatureBaseline('feral-ridgewolf');
  close(body.castScore, 63.3, 'Ridgewolf creature cast including trample keyword value');
  assert.ok(body.castScore > body.passScore);
  const useful = probeRidgewolfPump();
  const idle = probeRidgewolfPump({ combat: false });
  assert.equal(useful.chosen.type, 'activate_ability');
  assert.equal(useful.chosen.objectId, 'wolf');
  assert.equal(useful.activationScore, 6);
  assert.equal(idle.chosen.type, 'pass_priority');
  assert.equal(idle.activationScore, -24);
  assert.equal(idle.passScore, 0);
});

test('PMSSB-88/I: Shining Aerosaur flying body uses the keyword/body score and beats pass', () => {
  const flier = probeCreatureBaseline('shining-aerosaur');
  assert.equal(flier.chosen.type, 'cast_permanent');
  close(flier.castScore, 73.8036, 'Shining Aerosaur flying 3/4');
  assert.ok(flier.castScore > flier.passScore);
});
