// PMSSB-89 — manual bot-scoring audit of every Batch 73 card, not engine-only tests.
// These pins are RED until the scoring gaps from the measurement-before probe
// (tools/pmssb89-batch73-scoring-sonda.mjs) are closed. Each gap below corresponds
// to a "measurement-before finding" in docs/plans/PLAN_2026-11-11-pmssb89-batch73-scoring-audit.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  probePlummet, probeGetThePoint, probeMessengersSpeed, probeMightBeyondReason,
  probeRiverHeraldGuide, probeSetonsDesire, probeSpringLoadedSawblades,
  probeLeoninLightbringer, probeNecrosavant, probeKessigFlamebreather,
} from '../tools/pmssb89-batch73-scoring-sonda.mjs';

const close = (actual, expected, label) => {
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: ${actual} ≠ ${expected} ±0.01`);
};

// ---------------------------------------------------------------------------
// Wave A — cast/permanent offers for the 7 castable cards
// ---------------------------------------------------------------------------

test('PMSSB-89/A1: Plummet is offered and chosen over pass (flying target)', () => {
  const r = probePlummet();
  assert.equal(r.hasCastOffer, true, 'Plummet must be offered to cast');
  assert.equal(r.chosen, 'cast_spell(plummet-hand)', 'Plummet must be chosen, not passed');
});

test('PMSSB-89/A2: Get the Point is offered and chosen over pass', () => {
  const r = probeGetThePoint();
  assert.equal(r.hasCastOffer, true, 'Get the Point must be offered to cast');
  assert.equal(r.chosen, 'cast_spell(gtp-hand)', 'Get the Point must be chosen, not passed');
});

test("PMSSB-89/A3: Messenger's Speed aura is offered and chosen as cast_permanent", () => {
  const r = probeMessengersSpeed();
  assert.equal(r.chosen, "cast_permanent(ms-hand)", "Messenger's Speed must be chosen as aura cast");
});

test('PMSSB-89/A4: Might Beyond Reason is offered AND chosen (not passed)', () => {
  const r = probeMightBeyondReason();
  assert.equal(r.hasCastOffer, true, 'Might Beyond Reason must be offered to cast');
  assert.equal(r.chosen, 'cast_spell(mbr-hand)', 'Might Beyond Reason must be chosen, not passed');
  assert.ok(r.castScore != null && r.castScore > 0, 'Might Beyond Reason castScore must be positive');
});

test('PMSSB-89/A5: River Herald Guide creature is offered and chosen as cast_permanent', () => {
  const r = probeRiverHeraldGuide();
  assert.equal(r.chosen, "cast_permanent(rhg-hand)", 'River Herald Guide must be chosen as creature cast');
});

test('PMSSB-89/A6: Seton\'s Desire aura is offered and chosen as cast_permanent', () => {
  const r = probeSetonsDesire();
  assert.equal(r.chosen, "cast_permanent(sd-hand)", "Seton's Desire must be chosen as aura cast");
});

test('PMSSB-89/A7: Spring-Loaded Sawblades DFC is offered and chosen', () => {
  const r = probeSpringLoadedSawblades();
  assert.ok(r.chosen.startsWith('cast_'), `Spring-Loaded Sawblades must be castable, got: ${r.chosen}`);
});

// ---------------------------------------------------------------------------
// Wave B — activated abilities on battlefield permanents
// ---------------------------------------------------------------------------

test('PMSSB-89/B1: Leonin Lightbringer tap ability is used (not pass)', () => {
  const r = probeLeoninLightbringer();
  assert.ok(r.chosen.startsWith('activate_ability'), `Leonin Lightbringer must use tap ability, got: ${r.chosen}`);
});

test('PMSSB-89/B2: Necrosavant reanimate ability is used (not pass)', () => {
  const r = probeNecrosavant();
  assert.ok(r.chosen.startsWith('activate_ability'), `Necrosavant must use reanimate ability, got: ${r.chosen}`);
});

test('PMSSB-89/B3: Kessig Flamebreather tap-damage ability is used (not pass)', () => {
  const r = probeKessigFlamebreather();
  assert.ok(r.chosen.startsWith('activate_ability'), `Kessig Flamebreather must use tap-damage ability, got: ${r.chosen}`);
});

// ---------------------------------------------------------------------------
// Wave C — scoring sanity (no zero/infinite scores)
// ---------------------------------------------------------------------------

test('PMSSB-89/C1: Plummet castScore is positive and finite', () => {
  const r = probePlummet();
  assert.ok(r.castScore != null && r.castScore > 0 && r.castScore < Infinity, `Plummet castScore must be positive finite, got: ${r.castScore}`);
});

test('PMSSB-89/C2: Get the Point castScore is positive and finite', () => {
  const r = probeGetThePoint();
  assert.ok(r.castScore != null && r.castScore > 0 && r.castScore < Infinity, `Get the Point castScore must be positive finite, got: ${r.castScore}`);
});
