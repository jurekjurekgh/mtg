import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';

/**
 * M228/2 — pre-istniejący błąd silnika ODKRYTY przez rotującą próbkę benchmarku
 * (ADR 0024): gdy trwa OBOWIĄZKOWA decyzja „trasa lochu" (pendingUndercityRoute)
 * albo „fabricate" (pendingFabricate), silnik NADAL oferował `pass_priority`
 * w legalCommands. Bot losowy (albo dowolny kontroler) mógł go legalnie wybrać,
 * a wtedy execute odrzucał komendę `undercity_route_unresolved` i partia padała.
 *
 * Root cause: strażnik `pass_priority` (game-state.js ~4982) wymienia wszystkie
 * blokujące decyzje, ale pominięto `pendingUndercityRoute` i `pendingFabricate`.
 * Fix: dopisane do warunku — pass jest niedostępny, dopóki trwa taka decyzja.
 *
 * Determinizm (ADR 0005): seed 1002, alara vs forgotten-realms — powtarzalny.
 */

const registry = createCardRegistry();
const deckOf = (n) => parseDeckText(fs.readFileSync(`decks/${n}.txt`, 'utf8'), registry).cardIds;

test('undercity/fabricate: partia z forgotten-realms nie pada na nielegalnym pass', () => {
  // Przed fixem: „Bot wybrał nielegalną komendę: undercity_route_unresolved".
  const seeds = [1002, 1008];
  for (const seed of seeds) {
    for (const [a, b] of [['alara', 'forgotten-realms'], ['forgotten-realms', 'alara']]) {
      const state = setupCardMatch({
        seed,
        players: [{ id: 'p1' }, { id: 'p2' }],
        decks: new Map([['p1', deckOf(a)], ['p2', deckOf(b)]]),
        registry,
      });
      assert.doesNotThrow(() => runSimulation({
        state,
        controllers: new Map([
          ['p1', createHeuristicBot({ seed: seed + 1, opponentDeck: deckOf(b), registry })],
          ['p2', createRandomBot({ seed: seed + 2, allowConcede: false })],
        ]),
        maxCommands: 8000,
      }), `seed ${seed} (${a} vs ${b}) nie powinien rzucać`);
    }
  }
});
