// M89 (audyt cd.) — właściciel: „Bot atakuje bez sensu - mam na stole
// kreaturę ⅚, a on atakuje kreaturą ⅔. To nie ma sensu. Jego kreatura
// ginie, ja nic nie tracę" (2026-08-14).
//
// Scenariusz właściciela: bot ma TYLKO stwora 2/3 na stole, ja mam
// TYLKO stwora 5/6, tura się kończy. Żadnych innych stworów, żadnych
// efektów. Bot NIE powinien atakować ⅔ w ⅚ — to czysta strata (⅔ ginie
// w bloku z ⅚ za 0 obrażeń zadanych graczowi).
//
// Atak ⅔ na 5/6 nigdy nie jest wartościowy:
// - wróg zawsze zablokuje swoim 5/6 (lub czymś silniejszym),
// - ⅔ ginie w bloku (otrzymuje 5-6 obrażeń),
// - gracz (p1) NIE otrzymuje żadnych obrażeń (blok absorbuje).
// To nie ma żadnej wartości taktycznej, niezależnie od life wroga
// czy stanu biblioteki. Nawet jeśli gracz ma 1 życia, atak ⅔ na
// 5/6 zadaje 0 obrażeń graczowi — bot przegrywa stwora za darmo.
//
// Root cause: heurystyka bota w `declare_attackers` dawała
// `perAttacker = power - 3` (chump) i w wyścigu doliczała +8
// (racing bonus), co dawało wynik +5 (np. -3 + 8) — bot wolał atak
// ⅔ w ⅚ zamiast pass (0). Po fixie chump = -10, więc nawet z bonusem
// wyścigu wynik = -2, niższy niż pass.

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function newState({ enemyLife, libraryCount } = {}) {
  const state = createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  if (enemyLife !== undefined) state.players[0].life = enemyLife;
  if (libraryCount !== undefined) state.zones.library = state.zones.library.slice(0, libraryCount);
  return state;
}

function addCreature(state, id, controllerId, { power, toughness }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 0, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: ['R'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

test('bot NIE atakuje ⅔ w ⅚ (chump atak) — tylko te dwa stwory na stole', () => {
  // Dokładnie scenariusz właściciela: bot ma ⅔, ja mam ⅚, nic więcej.
  const state = newState();
  addCreature(state, 'bot-attacker', 'p2', { power: 2, toughness: 3 });
  addCreature(state, 'player-blocker', 'p1', { power: 5, toughness: 6 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.priorityPlayerId = 'p2';

  const bot = createHeuristicBot({ seed: 99 });
  const view = playerView(state, 'p2');
  const choice = bot.chooseCommand(view, {});
  // Bot nie powinien atakować (⅔ ginie w bloku z ⅚ za 0 obrażeń).
  if (choice.type === 'declare_attackers') {
    assert.equal(choice.attackerIds.length, 0,
      'bot NIE powinien atakować ⅔ w ⅚ (chump atak — strata stwora za 0 obrażeń)');
  } else {
    assert.equal(choice.type, 'pass_priority',
      `bot powinien pass, nie atak — dostał ${choice.type}`);
  }
});

test('bot NIE atakuje ⅔ w ⅚ nawet w wyścigu (racing przez niskie życie wroga, ale nie lethal)', () => {
  // Wcześniej: racing = (enemyLife<=10 || ...) dawał botowi bonus +8,
  // który wyrównywał stratę chumpa (-3 → +5) i bot atakował. Po fixie
  // chump=-10, więc nawet z +8 wynik=-2 (niższy niż pass=0).
  // enemyLife=8 = racing (≤10), ale atak ⅔ zada 0 obrażeń (blok
  // absorbuje 5+) — bot nie ma szans zabić wroga tym atakiem, więc
  // nie powinien atakować.
  const state = newState({ enemyLife: 8 });
  addCreature(state, 'bot-attacker', 'p2', { power: 2, toughness: 3 });
  addCreature(state, 'player-blocker', 'p1', { power: 5, toughness: 6 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.priorityPlayerId = 'p2';

  const bot = createHeuristicBot({ seed: 99 });
  const view = playerView(state, 'p2');
  const choice = bot.chooseCommand(view, {});
  if (choice.type === 'declare_attackers') {
    assert.equal(choice.attackerIds.length, 0,
      'bot NIE powinien atakować ⅔ w ⅚ nawet w wyścigu (chump bez efektu)');
  } else {
    assert.equal(choice.type, 'pass_priority',
      `bot powinien pass, nie atak — dostał ${choice.type}`);
  }
});

test('bot ATAKUJE w puste pole (atak otwarty = presja na wroga)', () => {
  // Bot ma ⅔, ja NIE mam blokera — bot powinien atakować (otwarty atak
  // to realna presja na życie wroga, nie chump).
  const state = newState();
  addCreature(state, 'bot-attacker', 'p2', { power: 2, toughness: 3 });
  // brak blockerów
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.priorityPlayerId = 'p2';

  const bot = createHeuristicBot({ seed: 99 });
  const view = playerView(state, 'p2');
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'declare_attackers');
  assert.equal(choice.attackerIds.length, 1,
    'bot powinien atakować w puste pole (presja na wroga)');
});
