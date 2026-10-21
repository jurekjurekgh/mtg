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
test('PMSSB10-B2: nefarious-imp leaves-scry +1.08 (69.78; PMSSB-64 latanie 2-mocy +2.1)', () => {
  assert.equal(castScore('nefarious-imp'), '69.78');
});
test('PMSSB10-B2: selhoff-occultist any_dies-mill +14.49 (80.19)', () => {
  assert.equal(castScore('selhoff-occultist'), '80.19');
});
test('PMSSB10-B2: battle-rattle-shaman may-pump +1.8 (65.70)', () => {
  assert.equal(castScore('battle-rattle-shaman'), '65.70');
});
// Zgłoszenie G (2026-10-14): wynik to teraz wariant ZAKRYTY (morph) — oferta
// „twarzą w dół” jest pierwsza, a od zmiany polityki morpha warianty mają
// OSOBNĄ arytmetykę: ciało 2/2 (CR 708.2), koszt morpha bezbarwny {3}
// (CR 702.37a) i premia za ambush; trafienie przekierowania po obrocie liczy
// `anticipatedTailValue` (+2.16) — jak przed zmianą. Wariant twarzą do góry
// schodzi pod zero karą `morphFaceUpHoldPenalty` (morph jest oferowany).
// 75.06 = 0.9 × 83.4, gdzie 83.4 = 70 (baza ciała) + 2×2 (siła 2/2) + 2×1
// (wytrzymałość 2/2) − 3 (koszt morpha) + 8 (premia ambush) + 2.4 (ogon
// przekierowania; po wadze rodziny komend 0.9 daje +2.16 — tyle, ile pinował
// tytuł testu). Waga 0.9 to `scoreWeights` rodziny `cast_permanent`.
test('PMSSB10-B2: willbender redirect +2.16 (75.06 — wariant zakryty/morph)', () => {
  assert.equal(castScore('willbender'), '75.06');
});
test('PMSSB10-B2: wavecrash-triton heroic-tap gate: empty-SAME, foe +1.62', () => {
  assert.equal(castScore('wavecrash-triton'), '64.80');
  assert.equal(castScore('wavecrash-triton', (s) => foeVanilla(s, 'f1')), '70.02');
});
test('PMSSB10-B2: veiled-ascension cloak +4.5 (63.00)', () => {
  assert.equal(castScore('veiled-ascension'), '63.00');
});
// PMSSB-67/F2: re-pin 62.55 → 70.05. Stara wartość liczyła ciało 0/0; Necrosquito wchodzi z 2 oil
// (= +2/+2 jak w karcie). Pin kodował defekt, nie tor wzrostu. Patrz test/audyt-pmssb67-necrosquito.test.js.
test('PMSSB10-B2: necrosquito 2 oil (PMSSB-67/F2: 70.05, było 62.55 przy 0/0)', () => {
  assert.equal(castScore('necrosquito'), '70.05');
});
test('PMSSB10-B2: frontline-war-rager tapped-gate: empty-SAME, 2tap +2.25', () => {
  assert.equal(castScore('frontline-war-rager'), '65.70');
  // PMSSB-71 v3: licznik na sobie w end_step bez celu = wartość kontekstowa (neutralnie 3): +2.25 → +1.35.
  assert.equal(castScore('frontline-war-rager', (s) => { tapAlly(s, 't1'); tapAlly(s, 't2'); }), '67.05');
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
