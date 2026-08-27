import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';

/**
 * M228/3 — błąd silnika ODKRYTY przez rotującą próbkę benchmarku (ADR 0024).
 *
 * Rozjazd oferty i wykonania (L48/L41): `legalSpellCasts` enumerował TRYBY
 * czaru MODALNEGO rzucanego IMPULSEM z exile (Your Temple Is Under Attack,
 * grywalny „without paying" po ukończonym lochu Undercity), ale `castModalSpell`
 * przyjmował z exile wyłącznie karty `plotted` — i odrzucał komendę
 * (`illegal_spell:To nie jest rzucalny czar…`). Bot brał ofertę silnika i
 * partia padała „Bot wybrał nielegalną komendę".
 *
 * Fix: castModalSpell akceptuje z exile także suspend-ready i impulse
 * (playableUntilTurn), a rzut „without paying" liczy koszt 0 — mirror
 * requireSpell (jedna reguła rzucalności, jeden odczyt).
 *
 * Determinizm (ADR 0005): seed 2031, dominaria-brg (aggro) vs forgotten-realms
 * (heuristic) — powtarzalny.
 */

const registry = createCardRegistry();
const deckOf = (n) => parseDeckText(fs.readFileSync(`decks/${n}.txt`, 'utf8'), registry).cardIds;

test('modal-impulse: partia z forgotten-realms nie pada na rzucie modala z exile', () => {
  const state = setupCardMatch({
    seed: 2031,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckOf('dominaria-brg')], ['p2', deckOf('forgotten-realms')]]),
    registry,
  });
  let finalState;
  assert.doesNotThrow(() => {
    ({ state: finalState } = runSimulation({
      state,
      controllers: new Map([
        ['p1', createAggroBot(2032)],
        ['p2', createHeuristicBot({ seed: 2033, opponentDeck: deckOf('dominaria-brg'), registry })],
      ]),
      maxCommands: 8000,
    }));
  }, 'rzut modala impulsem z exile nie może wywalać partii');
  assert.equal(finalState.status, 'finished', 'partia powinna się rozstrzygnąć');
});
