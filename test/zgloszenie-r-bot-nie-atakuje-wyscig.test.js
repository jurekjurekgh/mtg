// Zgłoszenie R (uwagi z testów, 2026-10-18): bot nie atakuje mimo przewagi.
//
// Ja: 5 życia, stwory 2/4, 2/4, 5/5, biblioteka 9 kart. Bot: 19 życia, stwory
// 1/1, 1/2, 2/1, 2/1, 2/2, 2/4, 3/2 (łącznie 13 mocy), biblioteka 1 karta.
//
// Rachunek: bot atakuje wszystkim (13 mocy), ja mam 3 blokery. Każdy bloker
// zatrzymuje obrażenia JEDNEGO atakującego (CR 509.1h — zablokowany bez trample
// nie rani gracza), więc najlepszy blok zatrzymuje 3+2+2 = 7, przechodzi 6 >= 5.
// Atak jest śmiertelny — bot powinien go zadeklarować.
//
// Przyczyna: wycena ataku (`penetratingPower`) odejmowała od mocy atakujących
// SUMĘ WYTRZYMAŁOŚCI blokerów (4+4+5 = 13), zamiast mocy zatrzymanych
// atakujących. Przy wytrzymałości równej sile ataku przechodziło 0 obrażeń,
// lethal nie wchodził, a pusta deklaracja wygrywała.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot, blockAbsorbedDamageOf, blockersAbsorbedDamageOf } from '../src/controllers/heuristic-bot.js';

const creature = (id, power, toughness, keywords = []) => ({
  id, power, toughness, damage: 0, keywords, kind: 'creature', types: ['Creature'],
});

function addCreature(s, id, pid, power, toughness) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
}

function addLibrary(s, pid, count) {
  for (let i = 0; i < count; i += 1) {
    const id = `lib-${pid}-${i}`;
    addObject(s, {
      id, instanceId: `i-${id}`, cardId: 'basic-swamp', controllerId: pid, ownerId: pid, zone: 'library',
      kind: 'land', types: ['Land'], abilities: [], keywords: [], subtypes: [], colors: [],
    });
  }
}

/** Stół R: bot (p2) w swojej turze, w kroku ataku; `botLibrary` kart w bibliotece bota. */
function stolR({ botLibrary = 1 } = {}) {
  const s = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.players.find((p) => p.id === 'p1').life = 5;
  s.players.find((p) => p.id === 'p2').life = 19;
  [[2, 4], [2, 4], [5, 5]].forEach(([p, t], i) => addCreature(s, `ja-${i}`, 'p1', p, t));
  [[1, 1], [1, 2], [2, 1], [2, 1], [2, 2], [2, 4], [3, 2]].forEach(([p, t], i) => addCreature(s, `bot-${i}`, 'p2', p, t));
  addLibrary(s, 'p1', 9);
  addLibrary(s, 'p2', botLibrary);
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p2';
  return s;
}

const wybor = (s) => createHeuristicBot({ seed: 7 }).chooseCommand(playerView(s, 'p2'), {});

test('R: pochłanianie blokerów = moc zatrzymanych atakujących, nie ich wytrzymałość', () => {
  const atakujacy = [creature('a1', 3, 2), creature('a2', 2, 1), creature('a3', 2, 1), creature('a4', 2, 2),
    creature('a5', 2, 4), creature('a6', 1, 1), creature('a7', 1, 2)];
  const blokery = [creature('b1', 2, 4), creature('b2', 2, 4), creature('b3', 5, 5)];
  // Trzech blokerów zatrzymuje trzy najsilniejsze ataki: 3 + 2 + 2.
  assert.equal(blockersAbsorbedDamageOf(atakujacy, blokery), 7);
});

test('R: blokujący bez trample zatrzymuje cały atak, nawet przy wielkiej wytrzymałości', () => {
  assert.equal(blockersAbsorbedDamageOf([creature('a', 2, 2)], [creature('b', 1, 9)]), 2);
  assert.equal(blockersAbsorbedDamageOf([creature('a', 2, 2)], []), 0, 'bez blokerów nic nie zatrzymuje');
});

test('R: trample zatrzymuje tylko obrażenia śmiertelne blokera (CR 702.19b)', () => {
  // 4/4 trample zablokowany tokenem 1/1 zatrzymuje 1, a nie 4.
  assert.equal(blockersAbsorbedDamageOf([creature('a', 4, 4, ['trample'])], [creature('b', 1, 1)]), 1);
});

test('R: bot z przewagą ATAKUJE, gdy atak całym składem jest śmiertelny (lethal przez blokerów)', () => {
  const cmd = wybor(stolR());
  assert.equal(cmd.type, 'declare_attackers', `bot wybrał ${cmd.type}`);
  assert.ok(cmd.attackerIds.length >= 4, `za mało atakujących: ${cmd.attackerIds.length}`);
});

test('R: ten sam wynik przy dłuższej bibliotece bota — lethal nie zależy od zegara talii', () => {
  const cmd = wybor(stolR({ botLibrary: 20 }));
  assert.equal(cmd.type, 'declare_attackers');
  assert.ok(cmd.attackerIds.length >= 4, `za mało atakujących: ${cmd.attackerIds.length}`);
});

// Pin wzorcowy A-4: przydział `blockersAbsorbedDamageOf` na małych planszach
// jest dokładny także dla trample (nie wystarcza zachłanny). Porównanie z
// brute force (bloker nie blokuje albo blokuje jednego atakującego) na stałym
// ziarnie — bez `Math.random`, deterministycznie (ADR 0005).
test('R: pochłanianie blokerów = optymalny przydział (brute force, ziarno stałe)', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const brute = (atk, blk) => {
    let best = 0;
    const n = atk.length;
    const total = (n + 1) ** blk.length;
    for (let code = 0; code < total; code += 1) {
      let c = code;
      const groups = atk.map(() => []);
      blk.forEach((b) => {
        const d = c % (n + 1);
        c = Math.floor(c / (n + 1));
        if (d < n) groups[d].push(b);
      });
      let sum = 0;
      atk.forEach((a, i) => { if (groups[i].length) sum += blockAbsorbedDamageOf(a, groups[i]); });
      best = Math.max(best, sum);
    }
    return best;
  };
  for (let t = 0; t < 300; t += 1) {
    const atk = Array.from({ length: 1 + rnd(4) }, (_, i) => ({
      id: `a${i}`, power: 1 + rnd(6), toughness: 1, damage: 0,
      keywords: rnd(3) === 0 ? ['trample'] : [], kind: 'creature', types: ['Creature'],
    }));
    const blk = Array.from({ length: 1 + rnd(4) }, (_, i) => ({
      id: `b${i}`, power: 1 + rnd(5), toughness: 1 + rnd(5), damage: 0,
      keywords: [], kind: 'creature', types: ['Creature'],
    }));
    assert.equal(blockersAbsorbedDamageOf(atk, blk), brute(atk, blk), `przypadek ${t}`);
  }
});
