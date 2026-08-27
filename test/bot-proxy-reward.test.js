import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  materialAdvantage,
  cardAdvantage,
  lifeOf,
  positionalDelta,
  positionalScore,
  createProxySampler,
} from '../tools/proxy-reward.mjs';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';

/**
 * B6 T2 — gęstszy sygnał (proxy reward). Testuje czyste funkcje miernika,
 * akumulator próbek ORAZ że hak onStep symulacji NIE zmienia przebiegu gry
 * (opt-in, ADR 0005).
 */

/** Minimalny sztuczny stan do testów czystych funkcji. */
function fakeState({ p1life = 20, p2life = 20, battlefield = [], hand = [] } = {}) {
  const objects = new Map();
  const zones = { library: [], hand: [], battlefield: [], graveyard: [], exile: [], stack: [] };
  for (const o of battlefield) { objects.set(o.id, o); zones.battlefield.push(o.id); }
  for (const o of hand) { objects.set(o.id, o); zones.hand.push(o.id); }
  return {
    players: [{ id: 'p1', life: p1life }, { id: 'p2', life: p2life }],
    objects,
    zones,
    turn: { number: 1 },
  };
}

test('proxy: materialAdvantage sumuje power+toughness kontrolowanych stworów', () => {
  const state = fakeState({ battlefield: [
    { id: 'a', controllerId: 'p1', kind: 'creature', power: 2, toughness: 3 },
    { id: 'b', controllerId: 'p1', kind: 'creature', power: 1, toughness: 1 },
    { id: 'c', controllerId: 'p2', kind: 'creature', power: 5, toughness: 5 },
    { id: 'l', controllerId: 'p1', kind: 'land' }, // nie-stwór pomijany
  ] });
  assert.equal(materialAdvantage(state, 'p1'), 2 + 3 + 1 + 1);
  assert.equal(materialAdvantage(state, 'p2'), 10);
});

test('proxy: cardAdvantage liczy rękę + pole bitwy', () => {
  const state = fakeState({
    battlefield: [{ id: 'a', controllerId: 'p1', kind: 'creature', power: 1, toughness: 1 }],
    hand: [{ id: 'h1', controllerId: 'p1' }, { id: 'h2', controllerId: 'p1' }, { id: 'h3', controllerId: 'p2' }],
  });
  assert.equal(cardAdvantage(state, 'p1'), 3); // 1 na polu + 2 w ręce
  assert.equal(cardAdvantage(state, 'p2'), 1);
});

test('proxy: lifeOf i positionalDelta liczą różnice gracz − przeciwnik', () => {
  const state = fakeState({ p1life: 18, p2life: 12, battlefield: [
    { id: 'a', controllerId: 'p1', kind: 'creature', power: 3, toughness: 3 },
  ] });
  assert.equal(lifeOf(state, 'p1'), 18);
  const d = positionalDelta(state, 'p1');
  assert.equal(d.material, 6);
  assert.equal(d.life, 6);
});

test('proxy: positionalScore rośnie z przewagą i jest w (0,1)', () => {
  const behind = fakeState({ p1life: 5, p2life: 20, battlefield: [
    { id: 'c', controllerId: 'p2', kind: 'creature', power: 6, toughness: 6 },
  ] });
  const ahead = fakeState({ p1life: 20, p2life: 5, battlefield: [
    { id: 'a', controllerId: 'p1', kind: 'creature', power: 6, toughness: 6 },
  ] });
  const sBehind = positionalScore(behind, 'p1');
  const sAhead = positionalScore(ahead, 'p1');
  assert.ok(sBehind > 0 && sBehind < 1);
  assert.ok(sAhead > 0 && sAhead < 1);
  assert.ok(sAhead > sBehind, `przewaga ma dać wyższy proxy (${sAhead} > ${sBehind})`);
});

test('proxy: symetryczny stan daje ~0.5', () => {
  const even = fakeState({ p1life: 20, p2life: 20 });
  assert.ok(Math.abs(positionalScore(even, 'p1') - 0.5) < 1e-9);
});

test('proxy: sampler próbkuje raz na turę i zwraca średnią w (0,1)', () => {
  const sampler = createProxySampler('p1');
  const s = fakeState({ p1life: 20, p2life: 10 });
  s.turn.number = 1; sampler.sample(s); sampler.sample(s); // ta sama tura → 1 próbka
  s.turn.number = 2; sampler.sample(s);
  assert.equal(sampler.count, 2);
  const m = sampler.mean();
  assert.ok(m > 0.5 && m < 1);
});

test('proxy: pusty sampler zwraca neutralne 0.5', () => {
  assert.equal(createProxySampler('p1').mean(), 0.5);
});

const registry = createCardRegistry();
const deckOf = (n) => parseDeckText(fs.readFileSync(`decks/${n}.txt`, 'utf8'), registry).cardIds;

function runMatch({ onStep = null } = {}) {
  const state = setupCardMatch({
    seed: 3000,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckOf('tarkir')], ['p2', deckOf('warhammer')]]),
    registry,
  });
  const bot = createHeuristicBot({ seed: 3001, opponentDeck: deckOf('warhammer'), registry });
  const { state: finalState, results } = runSimulation({
    state,
    controllers: new Map([['p1', bot], ['p2', createRandomBot({ seed: 3002, allowConcede: false })]]),
    maxCommands: 4000,
    onStep,
  });
  return { finalState, results };
}

test('proxy: hak onStep NIE zmienia przebiegu gry (opt-in, ADR 0005)', () => {
  const noHook = runMatch();
  const withHook = runMatch({ onStep: () => {} });
  // Ten sam seed → identyczna liczba komend, ten sam zwycięzca, ta sama tura.
  assert.equal(withHook.results.length, noHook.results.length);
  assert.equal(withHook.finalState.winnerId, noHook.finalState.winnerId);
  assert.equal(withHook.finalState.turn.number, noHook.finalState.turn.number);
});

test('proxy: sampler przez onStep zbiera sensowną liczbę próbek partii', () => {
  const sampler = createProxySampler('p1');
  const { finalState } = runMatch({ onStep: (state) => sampler.sample(state) });
  // ~1 próbka na turę — więcej niż kilka, mniej niż liczba komend.
  assert.ok(sampler.count >= finalState.turn.number - 1);
  assert.ok(sampler.count <= finalState.turn.number + 1);
  const m = sampler.mean();
  assert.ok(m > 0 && m < 1);
});
