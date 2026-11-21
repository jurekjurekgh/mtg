// Audyt PR #186 — F-186/3 (CR 509.1c + 702.111b): `mustBlockEnchantedValue`
// filtrował kandydatów przez `attackerCanBeBlocked(atakujacy, [b])`. Gdy
// gospodarz aury miał `menace`, wywołanie z jednoelementową tablicą zwracało
// zawsze `false`, więc wymóg znikał nawet wtedy, gdy wróg miał ≥2 zdolne
// blokery zmuszone zablokować razem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function payload(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  const { id, instanceId, cardId: _cardId, ownerId: _ownerId, controllerId, zone, objectId, ...rest } = entry;
  return rest;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  addObject(state, {
    id, instanceId: `inst-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...payload(cardId, controllerId), ...patch,
  });
  return state.objects.get(id);
}

function scoreSeton({ gyCount, hostKeywords, enemyBlockers }) {
  const state = createGameState({ seed: 1863, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10, { colors: ['G'] });
  for (let i = 0; i < 15; i += 1) put(state, `lib-${i}`, 'leafcrown-dryad', 'p1', 'library');
  for (let i = 0; i < gyCount; i += 1) put(state, `gy-${i}`, 'plummet', 'p1', 'graveyard');
  put(state, 'sd', 'setons-desire', 'p1', 'hand');
  put(state, 'host', 'leafcrown-dryad', 'p1', 'battlefield', {
    power: 3, toughness: 3, keywords: hostKeywords,
  });
  enemyBlockers.forEach((b, idx) => put(state, `b-${idx}`, 'leafcrown-dryad', 'p2', 'battlefield', b));
  const bot = createHeuristicBot({ seed: 1, registry });
  bot.chooseCommand(playerView(state, 'p1'));
  return bot.trace().at(-1)?.options?.find((o) => o.cmd.startsWith('cast_'))?.score;
}

test('F-186/3a: menace + Seton\'s Desire z ≥2 zdolnymi blokerami wymusza ich blok (wynik > bez progu)', () => {
  const twoBlockers = [{ power: 2, toughness: 2 }, { power: 2, toughness: 2 }];
  const noThreshold = scoreSeton({ gyCount: 0, hostKeywords: ['menace'], enemyBlockers: twoBlockers });
  const withThreshold = scoreSeton({ gyCount: 7, hostKeywords: ['menace'], enemyBlockers: twoBlockers });
  assert.ok(withThreshold > noThreshold,
    `menace z 2 wrogimi 2/2 przy Threshold 7+ ma być warty więcej niż bez progu (${withThreshold} vs ${noThreshold})`);
});

test('F-186/3b: menace z 1 zdolnym blokerem nie daje wymogu (CR 702.111b)', () => {
  const oneBlocker = [{ power: 2, toughness: 2 }];
  const noThreshold = scoreSeton({ gyCount: 0, hostKeywords: ['menace'], enemyBlockers: oneBlocker });
  const withThreshold = scoreSeton({ gyCount: 7, hostKeywords: ['menace'], enemyBlockers: oneBlocker });
  assert.equal(withThreshold, noThreshold,
    `jeden bloker nie może zablokować menace — wymóg daje 0 (${withThreshold} vs ${noThreshold})`);

  // Latanie + menace z 1 lotnikiem i 1 nielotem: tylko 1 zdolny bloker < 2 → nadal 0.
  const mixed = [{ power: 2, toughness: 2, keywords: ['flying'] }, { power: 2, toughness: 2, keywords: [] }];
  const flyNoThr = scoreSeton({ gyCount: 0, hostKeywords: ['menace', 'flying'], enemyBlockers: mixed });
  const flyThr = scoreSeton({ gyCount: 7, hostKeywords: ['menace', 'flying'], enemyBlockers: mixed });
  assert.equal(flyThr, flyNoThr,
    `tylko 1 lotnik może blokować menace+flying — bez pary nadal brak wymogu (${flyThr} vs ${flyNoThr})`);
});
