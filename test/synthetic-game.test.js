import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execute } from '../src/engine/game-state.js';
import { runSimulation } from '../src/engine/simulation.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * Pełna partia syntetyczna: talie z plików repozytorium (ADR 0012),
 * obiekty zmaterializowane z definicji, kontrolery grające wyłącznie
 * komendami z PlayerView, aż do zakończenia w engine.
 */

const registry = createCardRegistry();
const deckLists = new Map([
  ['p1', parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), registry).cardIds],
  ['p2', parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), registry).cardIds],
]);

function createMatch(seed) {
  return setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }], decks: deckLists, registry });
}

function playMatch(seed) {
  const state = createMatch(seed);
  return runSimulation({
    state,
    controllers: new Map([['p1', createAggroBot()], ['p2', createAggroBot()]]),
    maxCommands: 2500,
  });
}

test('partia syntetyczna kończy się rozstrzygnięciem w engine', () => {
  const { state } = playMatch(13);
  assert.equal(state.status, 'finished', 'partia nie zakończyła się w limicie komend');
  assert.ok(state.winnerId, 'brak zwycięzcy');
  assert.ok(
    state.events.some((e) => e.type === 'attackers_declared' && e.attackerIds.length > 0),
    'w partii nie odbył się żaden atak',
  );
  assert.ok(
    state.events.some((e) => e.type === 'card_drawn'),
    'partia nie przeszła przez dobieranie',
  );
  const terminal = state.events.filter((e) => e.type === 'player_lost').at(-1);
  assert.ok(terminal, 'brak zdarzenia przegranej');
  assert.ok(['life_zero', 'empty_library'].includes(terminal.reason), `nieoczekiwany powód końca: ${terminal.reason}`);
});

test('partia syntetyczna korzysta z combat jako źródła obrażeń', () => {
  const { state } = playMatch(29);
  assert.equal(state.status, 'finished');
  assert.ok(state.events.some((e) => e.type === 'damage_dealt'), 'brak obrażeń w partii');
  assert.ok(state.events.some((e) => e.type === 'life_changed'), 'brak zmian życia w partii');
});

test('partia syntetyczna jest w pełni odtwarzalna z zapisu komend', () => {
  const { state } = playMatch(13);
  const verification = verifyReplay(replayFromState(state), createMatch, execute);
  assert.equal(verification.deterministic, true);
  assert.equal(verification.state.winnerId, state.winnerId);
  assert.equal(verification.results.length, state.commands.length);
});

function createSpellMatch(seed) {
  const decks = new Map([
    ['p1', parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry).cardIds],
    ['p2', parseDeckText(fs.readFileSync('decks/wiedzmin.txt', 'utf8'), registry).cardIds],
  ]);
  return setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }], decks, registry });
}

test('partia z czarami przechodzi przez stos i kończy się w engine', () => {
  const state = createSpellMatch(41);
  runSimulation({
    state,
    controllers: new Map([['p1', createHeuristicBot({ seed: 41 })], ['p2', createHeuristicBot({ seed: 42 })]]),
    maxCommands: 2500,
  });
  assert.equal(state.status, 'finished', 'partia nie zakończyła się w limicie komend');
  // Kolorowa pula many (cz. 7): czary wymagają nietapniętych KOLOROWYCH źródeł
  // (MtG). Bot heurystyczny tapuje lądy pod stwory, więc w danej partii może
  // nie rzucić instantów/sorcery'ów — nie wymagamy tu spell_cast (stos i czary
  // są pokryte w test/stack.test.js i test/colored-mana-pool.test.js). Gdy czar
  // padnie — musi się rozstrzygnąć.
  const casts = state.events.filter((e) => e.type === 'spell_cast').length;
  const resolved = state.events.filter((e) => e.type === 'spell_resolved').length;
  assert.ok(resolved >= casts, 'czar rzucony, ale nie rozstrzygnięty');
  const verification = verifyReplay(replayFromState(state), createSpellMatch, execute);
  assert.equal(verification.deterministic, true);
});
