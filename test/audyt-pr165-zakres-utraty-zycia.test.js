import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * Audyt PR #165, finding B-1 (`docs/audits/AUDYT_PR165_2026-10-15.md`).
 *
 * Silnik (`effects.js`, gałąź `lose_life`) i log (`abilities.js`,
 * `effectTypeLabelsForLog`) traktują brak `scope` jak `each_opponent`
 * („each opponent loses N life” — domyślny zakres utraty życia). Bot liczył
 * wartość utraty życia TYLKO przy jawnym zakresie, więc ta sama zdolność bez
 * pola `scope` była warta 0 pkt, a z `scope: 'each_opponent'` — 2 pkt na życie.
 * L41: jedna reguła zakresu na wszystkich ścieżkach.
 *
 * Kontrfakt: ta sama zdolność z JAWNYM `each_opponent` ma dokładnie tę samą
 * wycenę co wariant bez pola (test czerwieni się przed naprawą).
 */

const REG = createCardRegistry();
const SEED = 165;
const allDefs = () => [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS];

function registryWith(id, mutate) {
  return createRegistry(allDefs().map((card) => (card.id === id ? mutate({ ...card }) : card)));
}

function butcherScene(registry) {
  const state = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 14);
  const def = registry.get('battlefield-butcher');
  addObject(state, {
    id: 'but', instanceId: 'i-but', cardId: 'battlefield-butcher', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  const current = state.objects.get('but');
  state.objects.set('but', Object.freeze({ ...current, summoningSickness: false }));
  return state;
}

function activationScore(registry) {
  const state = butcherScene(registry);
  const bot = createHeuristicBot({ seed: SEED + 1, randomness: 0, lookahead: 0, registry });
  bot.chooseCommand(playerView(state, 'p1'));
  const rows = bot.trace().at(-1)?.options ?? [];
  const row = rows.find((entry) => entry.cmd.startsWith('activate_ability') && entry.cmd.includes('(but'));
  assert.ok(row, `brak aktywacji Butchera wśród: ${rows.map((x) => x.cmd).join(', ')}`);
  return row.score;
}

const bezZakresu = registryWith('battlefield-butcher', (card) => ({
  ...card,
  abilities: card.abilities.map((ability) => ({ ...ability, effect: { type: 'lose_life', amount: 2 } })),
}));
const jawnyZakres = registryWith('battlefield-butcher', (card) => ({
  ...card,
  abilities: card.abilities.map((ability) => ({ ...ability, effect: { type: 'lose_life', amount: 2, scope: 'each_opponent' } })),
}));

test('B-1: utrata życia bez pola scope = każdy przeciwnik (jak silnik i log)', () => {
  const domyslny = activationScore(bezZakresu);
  const jawny = activationScore(jawnyZakres);
  assert.equal(domyslny, jawny,
    `brak scope musi wyceniać się jak each_opponent: ${domyslny} vs ${jawny}`);
});

test('B-1 kontrola dodatnia: utrata życia każdego przeciwnika ma wartość > 0 względem bazy', () => {
  const bazowy = registryWith('battlefield-butcher', (card) => ({
    ...card,
    abilities: card.abilities.map((ability) => ({ ...ability, effect: { type: 'gain_life', amount: 0 } })),
  }));
  const jawny = activationScore(jawnyZakres);
  const bez = activationScore(bazowy);
  assert.ok(jawny > bez, `utrata 2 życia przeciwnika musi coś znaczyć: ${jawny} vs ${bez}`);
});
