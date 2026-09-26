import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
function setup(setupFn) {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14);
  for (let i = 0; i < 30; i++) addObject(s, { id: 'lb' + i, instanceId: 'i-lb' + i, cardId: 'x', controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: 'lb' });
  if (setupFn) setupFn(s);
  return s;
}
function castScore(cardId, setupFn) {
  const s = setup(setupFn);
  const d = REG.get(cardId);
  addObject(s, { id: 'c1', instanceId: 'i-c1', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(d) });
  const b = createHeuristicBot({ seed: 9 });
  b.chooseCommand(playerView(s, 'p1'));
  const o = b.trace().at(-1).options.find((x) => x.cmd.includes('cast_permanent(c1'));
  return o ? o.score.toFixed(2) : 'no-offer';
}
function tapAlly(s, id) {
  addObject(s, { id, instanceId: 'i-' + id, cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'tap' });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), tapped: true }));
}
function foeVanilla(s, id) {
  addObject(s, { id, instanceId: 'i-' + id, cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'foe' });
}

// PMSSB-10 Wave-B2 (F-O3): end-conditional + singletons-conditional.
// FIRES:
test('PMSSB10-B2: nefarious-imp leaves-scry +1.08 (67.68)', () => {
  assert.equal(castScore('nefarious-imp'), '67.68');
});
test('PMSSB10-B2: selhoff-occultist any_dies-mill +14.49 (80.19)', () => {
  assert.equal(castScore('selhoff-occultist'), '80.19');
});
test('PMSSB10-B2: battle-rattle-shaman may-pump +1.8 (65.70)', () => {
  assert.equal(castScore('battle-rattle-shaman'), '65.70');
});
test('PMSSB10-B2: willbender redirect +2.16 (66.06)', () => {
  assert.equal(castScore('willbender'), '66.06');
});
test('PMSSB10-B2: wavecrash-triton heroic-tap gate: empty-SAME, foe +1.62', () => {
  assert.equal(castScore('wavecrash-triton'), '64.80');
  assert.equal(castScore('wavecrash-triton', (s) => foeVanilla(s, 'f1')), '70.02');
});
test('PMSSB10-B2: veiled-ascension cloak +4.5 (63.00)', () => {
  assert.equal(castScore('veiled-ascension'), '63.00');
});
test('PMSSB10-B2: necrosquito dies-growth +1.35 (62.55)', () => {
  assert.equal(castScore('necrosquito'), '62.55');
});
test('PMSSB10-B2: frontline-war-rager tapped-gate: empty-SAME, 2tap +2.25', () => {
  assert.equal(castScore('frontline-war-rager'), '65.70');
  assert.equal(castScore('frontline-war-rager', (s) => { tapAlly(s, 't1'); tapAlly(s, 't2'); }), '67.95');
});
test('PMSSB10-B2: plague-reaver wrath: empty-SAME, foe3 +13.5', () => {
  assert.equal(castScore('plague-reaver'), '74.71');
  assert.equal(castScore('plague-reaver', (s) => { foeVanilla(s, 'f1'); foeVanilla(s, 'f2'); foeVanilla(s, 'f3'); }), '91.81');
});
// SAME (SKIP-proofs):
test('PMSSB10-B2: SKIP-proofs SAME (canonized/trostani/silumgar/fear/jyoti/sword/challenger/disa/brute)', () => {
  assert.equal(castScore('canonized-in-blood'), '60.30');
  assert.equal(castScore('trostani-discordant'), '87.30');
  assert.equal(castScore('silumgar-butcher'), '65.70');
  assert.equal(castScore('gurmag-drowner'), '65.70');
  assert.equal(castScore('fear-of-burning-alive'), '70.20');
  assert.equal(castScore('jyoti-moag-ancient'), '64.80');
  assert.equal(castScore('greatsword-of-tyr'), '-7.20');
  assert.equal(castScore('boros-challenger'), '65.70');
  assert.equal(castScore('disa-the-restless'), '70.21');
  assert.equal(castScore('homicidal-brute'), '72.91');
});
