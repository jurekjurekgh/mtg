/**
 * 2026-09-14f — boty uczą się mulliganować (zgłoszenie właściciela).
 *
 * Kontekst: „Kilka talii podejrzanie często startuje bez lądów". Pomiar
 * tools/deck-land-ratio.mjs (commit 31f51a7) wykazał, że wszystkie talie
 * trzymają regułę 1:2 (M132), a tasowanie/rozdanie jest uczciwe. Winny był
 * BOT: heuristic trzymał ZAWSZE pierwszą ofertę mulligana (keep), aggro —
 * pierwszą ofertę listy (też keep), więc ręka 0-1 lądów była grana do końca.
 *
 * Polityka (plan 2026-09-14f): keep ⇔ ≥2 lądy w ręce ∨ cap 2 mulliganów;
 * przy odłożeniu N kart na spód bot trzyma lądy i oddaje najdroższe czary.
 * Licznik mulliganów silnik wystawia w payloadzie komendy `mulligans`
 * (informacja publiczna — ta sama, którą UI pokazuje graczowi).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';

/** Stan z otwartą decyzją mulligana (keep/mulligan) dla p1. */
function stoMulligan({ reka = [], mulligansTaken = 0, bottom = null } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.pendingMulligans = bottom ? [] : ['p1'];
  state.mulliganCounts = { p1: mulligansTaken };
  if (bottom) state.pendingMulliganBottom = { playerId: 'p1', count: bottom.count, handIds: bottom.handIds };
  for (const [id, cardId, kind, extras = {}] of reka) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
      kind, manaCost: 0, subtypes: [], types: [], abilities: [], keywords: [], colors: [],
      ...extras,
    });
  }
  return state;
}

const reka = (cards) => stoMulligan({ reka: cards });
const LAND = 'basic-forest';
const land = (id) => [id, LAND, 'land'];
const creature = (id, cost, power, toughness) => [
  id, `stwor-${id}`, 'creature', { manaCost: cost, power, toughness, types: ['Creature'] },
];
const spell = (id, cost) => [id, `czar-${id}`, 'sorcery', { manaCost: cost }];

test('silnik: warianty mulligana niosą jawny licznik (informacja publiczna)', () => {
  const state = stoMulligan({ reka: [land('l1'), land('l2')] });
  const view = playerView(state, 'p1');
  const variants = view.legalCommands.filter((c) => c.type === 'resolve_mulligan_choice');
  assert.equal(variants.length, 2, 'keep + mulligan w ofercie');
  for (const v of variants) assert.equal(v.mulligans, 0, 'pierwsza decyzja: licznik 0');
  const mull = variants.find((v) => !v.keep);
  assert.ok(mull, 'wariant mulligana istnieje');
});

test('silnik: po jednym mulliganie kolejna decyzja widzi licznik 1', () => {
  const state = stoMulligan({ reka: [land('l1'), land('l2')], mulligansTaken: 1 });
  const view = playerView(state, 'p1');
  const variants = view.legalCommands.filter((c) => c.type === 'resolve_mulligan_choice');
  for (const v of variants) assert.equal(v.mulligans, 1, 'licznik idzie za stanem, nie za ofertą');
});

test('heuristic: ręka 0 lądów → mulligan (a nie wieczne granie bez many)', () => {
  const { cmd } = decyzjaHeuristic(reka([spell('s1', 3), spell('s2', 4), creature('c1', 2, 2, 2)]));
  assert.equal(cmd.type, 'resolve_mulligan_choice');
  assert.equal(cmd.keep, false, '0 lądów = mulligan');
});

test('heuristic: ręka 1 ląd → mulligan', () => {
  const { cmd } = decyzjaHeuristic(reka([land('l1'), spell('s1', 3), spell('s2', 4)]));
  assert.equal(cmd.keep, false, '1 ląd = mulligan');
});

test('heuristic: ręka 2 lądy → keep', () => {
  const { cmd } = decyzjaHeuristic(reka([land('l1'), land('l2'), spell('s1', 3)]));
  assert.equal(cmd.keep, true, '2 lądy = keep');
});

test('heuristic: cap — po 2 mulliganach bot trzyma nawet rękę 0-lądową', () => {
  const { cmd } = decyzjaHeuristic(stoMulligan({
    reka: [spell('s1', 3), spell('s2', 4), creature('c1', 2, 2, 2)],
    mulligansTaken: 2,
  }));
  assert.equal(cmd.keep, true, 'cap 2: keep za wszelką cenę');
});

test('heuristic: odłożenie na spód nie zabiera lądów — oddaje najdroższe czary', () => {
  const hand = [land('l1'), land('l2'), spell('s-drogi', 6), creature('c-tani', 1, 2, 2)];
  const state = stoMulligan({
    reka: hand,
    bottom: { count: 2, handIds: hand.map(([id]) => id) },
  });
  const { cmd } = decyzjaHeuristic(state);
  assert.equal(cmd.type, 'resolve_mulligan_bottom_choice');
  assert.deepEqual(cmd.cardIds.toSorted(), ['s-drogi', 'c-tani'].toSorted(),
    'na spód idą oba czary, lądy zostają (bez nich mulligan był na darmo)');
});

test('heuristic: wariant ze spodem lądu przegrywa z wariantem bez lądu', () => {
  const hand = [land('l1'), land('l2'), creature('c1', 2, 2, 2)];
  const state = stoMulligan({
    reka: hand,
    bottom: { count: 1, handIds: hand.map(([id]) => id) },
  });
  const { cmd } = decyzjaHeuristic(state);
  assert.ok(cmd.cardIds.includes('c1'), `oddajemy stwora, nie ląd: ${JSON.stringify(cmd.cardIds)}`);
});

test('heuristic: tańszy czar zostaje, droższy idzie na spód (krzywa many)', () => {
  const hand = [land('l1'), land('l2'), land('l3'), spell('s-drogi', 6), spell('s-sredni', 4), spell('s-tani', 1)];
  const state = stoMulligan({
    reka: hand,
    bottom: { count: 2, handIds: hand.map(([id]) => id) },
  });
  const { cmd } = decyzjaHeuristic(state);
  assert.ok(cmd.cardIds.includes('s-drogi'), 'najdroższy czar na spód');
  assert.ok(cmd.cardIds.includes('s-sredni'), 'średni czar na spód');
  assert.ok(!cmd.cardIds.includes('s-tani'), 'tani czar zostaje');
  assert.ok(!cmd.cardIds.some((id) => id.startsWith('l')), 'lądy zostają');
});

test('aggro: ten sam wyzwalacz (0 lądów → mulligan, 2 lądy → keep, cap 2)', () => {
  const bot = createAggroBot();
  const bezLadow = playerView(reka([spell('s1', 3), spell('s2', 4)]), 'p1');
  assert.equal(bot.chooseCommand(bezLadow).keep, false, '0 lądów = mulligan');
  const zLadami = playerView(reka([land('l1'), land('l2'), spell('s1', 3)]), 'p1');
  assert.equal(bot.chooseCommand(zLadami).keep, true, '2 lądy = keep');
  const cap = playerView(stoMulligan({
    reka: [spell('s1', 3), spell('s2', 4)],
    mulligansTaken: 2,
  }), 'p1');
  assert.equal(bot.chooseCommand(cap).keep, true, 'cap 2 = keep');
});

test('aggro: odłożenie na spód trzyma lądy i oddaje najdroższy czar', () => {
  const bot = createAggroBot();
  const hand = [land('l1'), land('l2'), spell('s-drogi', 6), creature('c-tani', 1, 2, 2)];
  const state = stoMulligan({ reka: hand, bottom: { count: 2, handIds: hand.map(([id]) => id) } });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd.type, 'resolve_mulligan_bottom_choice');
  assert.ok(!cmd.cardIds.some((id) => id.startsWith('l')), 'lądy zostają');
  assert.ok(cmd.cardIds.includes('s-drogi'), 'najdroższy czar na spód');
});

/** Ślad decyzji heurysty na danym stanie (ten sam wzorzec co audyt-bot-*). */
function decyzjaHeuristic(state) {
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  return { cmd };
}
