// Audyt PR #168/A-4: wycena maksimum obrażeń pochłoniętych przez obronę
// nie może zaniżać wyniku przy kilku tramplerach (fałszywa wygrana bota).
// CR 509.1a: bloker wybiera jednego atakującego; 702.19b: trample przypisuje
// lethal blokerom, a resztę może zadać graczowi; 510.1: przydział w walce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockAbsorbedDamageOf, blockersAbsorbedDamageOf, createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

const attacker = (id, power, keywords = []) => ({ id, power, toughness: power, keywords });
const blocker = (id, toughness, damage = 0) => ({ id, power: 1, toughness, damage, keywords: [] });

// Niezależne wyliczenie wszystkich przydziałów: każdy bloker do jednego
// atakującego albo bez bloku. Nie wykorzystywać algorytmu optymalizacyjnego.
function oracle(attackers, blockers) {
  let maximum = 0;
  const assignments = Array.from({ length: attackers.length }, () => []);
  function visit(index) {
    if (index === blockers.length) {
      maximum = Math.max(maximum, attackers.reduce((sum, a, i) =>
        sum + (assignments[i].length ? blockAbsorbedDamageOf(a, assignments[i]) : 0), 0));
      return;
    }
    visit(index + 1);
    for (let a = 0; a < attackers.length; a += 1) {
      assignments[a].push(blockers[index]);
      visit(index + 1);
      assignments[a].pop();
    }
  }
  visit(0);
  return maximum;
}

test('A-4: 4/4 trample + 3/3 trample, blokery 2/2/3: optimum 7, a nie zachłanne 6', () => {
  const attackers = [attacker('a', 4, ['trample']), attacker('b', 3, ['trample'])];
  const blockers = [blocker('x', 2), blocker('y', 2), blocker('z', 3)];
  assert.equal(oracle(attackers, blockers), 7);
  assert.equal(blockersAbsorbedDamageOf(attackers, blockers), 7);
  assert.equal(blockersAbsorbedDamageOf([...attackers].reverse(), [...blockers].reverse()), 7,
    'kolejność tablic nie może zmieniać minimum obrażeń przechodzących na gracza');
});

test('A-4: wybór obrońcy = niezależny brute force (normalne/trample/deathtouch, rany)', () => {
  let seed = 64917;
  const rnd = (n) => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 160; trial += 1) {
    const attackers = Array.from({ length: 2 + rnd(3) }, (_, i) => {
      const keywords = rnd(3) === 0 ? [] : ['trample'];
      if (keywords.length && rnd(4) === 0) keywords.push('deathtouch');
      return attacker(`a${i}`, 1 + rnd(7), keywords);
    });
    const blockers = Array.from({ length: 1 + rnd(5) }, (_, i) => {
      const toughness = 1 + rnd(6);
      return blocker(`b${i}`, toughness, rnd(toughness));
    });
    assert.equal(blockersAbsorbedDamageOf(attackers, blockers), oracle(attackers, blockers),
      `przypadek ${trial}: ataki ${JSON.stringify(attackers)} blokery ${JSON.stringify(blockers)}`);
  }
});

test('A-4: bez trample szybki wynik jest dokładny nawet dla 100 blokerów', () => {
  const attackers = Array.from({ length: 100 }, (_, i) => attacker(`a${i}`, 1 + i));
  const blockers = Array.from({ length: 50 }, (_, i) => blocker(`b${i}`, 1));
  assert.equal(blockersAbsorbedDamageOf(attackers, blockers),
    attackers.slice(-50).reduce((sum, a) => sum + a.power, 0));
});

test('A-4: budżet dużej planszy zwraca górną granicę, nie zachłanny fałszywy lethal', () => {
  // 11 blokerów po 3 toughness: 4 tramplerów po 8 mocy wymaga po TRZECH
  // blokerów, by wchłonąć 8. Rozkład 3+3+3+2 daje dokładnie 8+8+8+6=30.
  // Relaksacja (ignoruje niewykorzystany jeden punkt na każdej ósemce) to 32.
  const attackers = Array.from({ length: 4 }, (_, i) => attacker(`a${i}`, 8, ['trample']));
  const blockers = Array.from({ length: 11 }, (_, i) => blocker(`b${i}`, 3));
  assert.equal(blockersAbsorbedDamageOf(attackers, blockers), 32,
    'fallback może przeoczyć lethal, ale nie wolno mu przypisać mniej niż możliwy blok (30)');
});

function allInScore(zToughness) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players.find((p) => p.id === 'p1').life = 1;
  for (const [id, ownerId, power, toughness, keywords] of [
    ['a', 'p2', 4, 4, ['trample']], ['b', 'p2', 3, 3, ['trample']],
    ['x', 'p1', 2, 2, []], ['y', 'p1', 2, 2, []], ['z', 'p1', zToughness, zToughness, []],
  ]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'test-creature', controllerId: ownerId, ownerId,
      zone: 'battlefield', kind: 'creature', types: ['Creature'], subtypes: [],
      abilities: [], keywords, colors: [], power, toughness,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2'; state.turn.priorityPlayerId = 'p2';
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const option = (bot.trace().at(-1)?.options ?? []).find((o) => o.cmd === 'attack[a,b]');
  assert.ok(option, 'oferta ataku oboma tramplerami');
  return option.score;
}

test('A-4: bot nie deklaruje fałszywego lethal; w sąsiednim stanie rozpoznaje realny lethal', () => {
  assert.ok(allInScore(3) < 500, 'blok 2+2+3 pochłania wszystkie 7 obrażeń — bez premii lethal');
  assert.ok(allInScore(2) >= 1000, 'blok 2+2+2 zatrzymuje tylko 6/7 — premia za wygraną');
});
