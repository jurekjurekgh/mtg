// M202/H + M202/N — zgłoszenia właściciela (ataki bez szans):
//
//   H. „Bot atakuje mnie kreaturą 4/4 gdy ja mam nietapowaną kreaturę 5/5.
//       Jego kreatura ginie, ja nic nie tracę. PO CO? Ok, mam mało życia 1.
//       Ale to nie upoważnia bota do tak kretyńskich zagrań. Miał 0% szans.”
//   N. „Bot atakuje mnie kreaturą 2/1, gdy ja mam na stole odtapowaną kreaturę
//       3/1 z First Strike. Kreatura bota ginie, ja nic nie tracę.”
//
// Dwie różne przyczyny, jedna funkcja wyceny ataku:
//   H — kara „chump” (-10) ISTNIAŁA, ale przy życiu wroga <= 5 premia wyścigu
//       wynosiła +20 i przebijała karę (klasa L3: kara musi być liczona
//       względem premii, inaczej jest martwa). Zgodnie z L3 pomijamy premię
//       dla ataku jałowego — tak jak M188/C dla gałęzi „przeżyje, ale nie
//       zabije”.
//   N — wycena w ogóle nie znała first strike (CR 702.7/510.4): 2/1 vs 3/1
//       z first strike było liczone jako „wymiana” (+1), a w rzeczywistości
//       bloker zadaje obrażenia w wcześniejszym kroku i atakujący ginie,
//       nie zadając nic.
// Dodatkowo: latający atakujący przy zwykłym blokerze był karany jak chump,
// choć nie może zostać zablokowany (CR 509.1b) — na plus wyciągała go dopiero
// premia wyścigu. Teraz nieblokowalność jest liczona wprost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

/** Stan w kroku deklaracji atakujących z zadanymi stworami. */
function combatState({ mine, theirs, enemyLife = 20, myLife = 20, seed = 5 }) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[5], stepIndex: 5, number: 4, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const add = (id, controllerId, { power, toughness, keywords = [] }) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'creature', power, toughness, types: ['Creature'],
      subtypes: [], colors: [], manaCost: 0, keywords: Object.freeze(keywords), abilities: [],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  for (const [i, spec] of mine.entries()) add(`m${i}`, 'p1', spec);
  for (const [i, spec] of theirs.entries()) add(`t${i}`, 'p2', spec);
  // biblioteki — bez nich bot wchodzi w tryb wyścigu deck-outowego
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 20; i += 1) {
      const id = `lib-${pid}-${i}`;
      addObject(state, { id, instanceId: `i-${id}`, cardId: 'filler', controllerId: pid, ownerId: pid, zone: 'library', kind: 'card', types: [], subtypes: [], colors: [], manaCost: 0, abilities: [] });
    }
  }
  state.players[0].life = myLife;
  state.players[1].life = enemyLife;
  return state;
}

const attackChoice = (state) => {
  const bot = createHeuristicBot({ seed: 11 });
  const view = playerView(state, 'p1');
  const cmd = bot.chooseCommand(view, { simulate: null });
  return cmd;
};

test('M202/H: 4/4 NIE atakuje nietapowanej 5/5, nawet przy życiu wroga 1', () => {
  const state = combatState({
    mine: [{ power: 4, toughness: 4 }],
    theirs: [{ power: 5, toughness: 5 }],
    enemyLife: 1,
  });
  const cmd = attackChoice(state);
  const attacks = cmd?.type === 'declare_attackers' ? (cmd.attackerIds ?? []) : [];
  assert.deepEqual(attacks, [], `bot wybrał: ${JSON.stringify(cmd)} — atak ma 0% szans (4/4 ginie, 0 obrażeń)`);
});

test('M202/N: 2/1 NIE atakuje nietapowanej 3/1 z first strike', () => {
  const state = combatState({
    mine: [{ power: 2, toughness: 1 }],
    theirs: [{ power: 3, toughness: 1, keywords: ['first_strike'] }],
    enemyLife: 3,
  });
  const cmd = attackChoice(state);
  const attacks = cmd?.type === 'declare_attackers' ? (cmd.attackerIds ?? []) : [];
  assert.deepEqual(attacks, [], `bot wybrał: ${JSON.stringify(cmd)} — bloker z first strike zabija pierwszy (CR 510.4)`);
});

test('M202/H+N (anty-over-fix): latający 4/4 ATAKUJE zwykłą 5/5 (nie może być zablokowany)', () => {
  const state = combatState({
    mine: [{ power: 4, toughness: 4, keywords: ['flying'] }],
    theirs: [{ power: 5, toughness: 5 }],
  });
  const cmd = attackChoice(state);
  assert.equal(cmd?.type, 'declare_attackers', `bot wybrał: ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.attackerIds, ['m0'], 'CR 509.1b: bez flying/reach nie zablokuje');
});

test('M202/N (anty-over-fix): 2/1 z first strike ATAKUJE 3/1 (zabija i przeżywa)', () => {
  const state = combatState({
    mine: [{ power: 2, toughness: 1, keywords: ['first_strike'] }],
    theirs: [{ power: 3, toughness: 1 }],
  });
  const cmd = attackChoice(state);
  assert.equal(cmd?.type, 'declare_attackers', `bot wybrał: ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.attackerIds, ['m0'], 'first strike atakującego zabija blokera, zanim ten odpowie');
});

test('M202/H+N (anty-over-fix): korzystna wymiana nadal jest atakowana', () => {
  const state = combatState({
    mine: [{ power: 4, toughness: 4 }],
    theirs: [{ power: 2, toughness: 2 }],
  });
  const cmd = attackChoice(state);
  assert.equal(cmd?.type, 'declare_attackers', `bot wybrał: ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.attackerIds, ['m0'], '4/4 zabija 2/2 i przeżywa — realny zysk');
});

test('M202/H (anty-over-fix): atak w otwartego nadal jest atakowany', () => {
  const state = combatState({
    mine: [{ power: 3, toughness: 3 }],
    theirs: [],
  });
  const cmd = attackChoice(state);
  assert.equal(cmd?.type, 'declare_attackers', `bot wybrał: ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.attackerIds, ['m0']);
});
