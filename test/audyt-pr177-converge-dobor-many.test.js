// Ruling MH2 2021-06-18: „The maximum number of colors of mana you can spend
// to cast a spell is five. Colorless is not a color. Note that the cost of a
// spell with converge may limit how many colors of mana you can spend.”
// https://api.scryfall.com/cards/mh2/133/rulings
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { matchColorRequirements } from '../src/engine/mana-cost.js';
import { addMana, consumeManaPool, countColorsOfManaSpent } from '../src/engine/resources.js';

function payment(pool, amount, requirements, restrictedPool = {}) {
  const player = { manaPool: { ...pool }, restrictedPool: { ...restrictedPool } };
  const colors = consumeManaPool(player, amount, requirements, true, [], { maximizeColors: true });
  return { player, colors, count: countColorsOfManaSpent(colors) };
}

test('flashback Kaleidoscorch: każdy kolor z puli może zasilić koszt {4}{R}', () => {
  const s = createGameState({ seed: 177, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  const def = createCardRegistry().get('kaleidoscorch');
  addObject(s, { id: 'k', instanceId: 'ik', cardId: def.id, ownerId: 'p1', controllerId: 'p1', zone: 'graveyard', ...gameObjectDataOf(def), types: def.types });
  for (const [color, n] of [['R', 1], ['G', 3], ['B', 1], ['U', 1]]) addMana(s, 'p1', n, { colors: [color] });
  const cmd = playerView(s, 'p1').legalCommands.find(c => c.type === 'cast_flashback' && c.objectId === 'k' && c.targets?.[0] === 'p2');
  assert.ok(cmd);
  assert.equal(execute(s, cmd).ok, true);
  for (let i = 0; i < 8 && s.zones.stack.length; i++) {
    const pass = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(pass);
    assert.equal(execute(s, pass).ok, true);
  }
  assert.equal(s.players.find(p => p.id === 'p2').life, 16, 'cztery kolory = cztery obrażenia');
});

test('wybór pipa zachowuje elastyczną manę na inny kolor', () => {
  const p = payment({ RG: 1, R: 1 }, 2, [['R']]);
  assert.equal(p.count, 2, '{R} płaci pip, {R/G} płaci generic jako {G}');
});

test('mana ograniczona nie obniża liczby kolorów legalnej płatności', () => {
  const p = payment({ R: 1, G: 1 }, 2, [['R']], { '': 1 });
  assert.equal(p.count, 2, 'wybór bezbarwnej zamiast zielonej dałby tylko jeden kolor');
});

test('dobór nie nadpłaca i respektuje bezbarwny pip {C}', () => {
  const { player, colors, count } = payment({ '': 1, R: 1, G: 1, B: 1 }, 3, [['C'], ['R']]);
  assert.equal(count, 2);
  assert.equal(colors.length, 2, 'bezbarwna jednostka nie jest kolorem');
  assert.equal(Object.values(player.manaPool).reduce((a, n) => a + n, 0), 1);
  assert.equal(player.manaPool[''] ?? 0, 0, 'jedyny {C} opłacił pip');
});

test('gdy kolorów tyle samo, priorytetem pozostaje ograniczona mana', () => {
  const p = payment({ R: 2, G: 1 }, 2, [['R']], { G: 1 });
  assert.equal(p.count, 2);
  assert.equal(p.player.restrictedPool.G ?? 0, 0);
  assert.equal(p.player.manaPool.G, 1);
});

test('maksimum kolorów zgadza się z wyczerpującą enumeracją małych pul', () => {
  // Niezależny, mały brute force: każdej jednostce wybiera rolę (pip albo
  // generic) i kolor. Sprawdza także alternatywne przypisania hybryd/pipów.
  const optimum = (units, amount, reqs) => {
    let best = -1;
    const dfs = (idx, remaining, unmet, seen) => {
      if (remaining === 0) { if (unmet.length === 0) best = Math.max(best, seen.size); return; }
      if (idx === units.length || units.length - idx < remaining) return;
      dfs(idx + 1, remaining, unmet, seen);
      const colors = units[idx].length ? units[idx] : ['C'];
      for (const color of colors) {
        const next = new Set(seen); if (color !== 'C') next.add(color);
        if (remaining > unmet.length) dfs(idx + 1, remaining - 1, unmet, next);
        unmet.forEach((req, j) => {
          const legal = req.includes('C') ? color === 'C' : req.includes(color);
          if (legal) dfs(idx + 1, remaining - 1, unmet.filter((_, k) => k !== j), next);
        });
      }
    };
    dfs(0, amount, reqs, new Set());
    return best;
  };
  const profiles = ['', 'R', 'G', 'U', 'RG', 'RU', 'GU'];
  let random = 13;
  for (let sample = 0; sample < 150; sample++) {
    const next = (n) => { random = (random * 1664525 + 1013904223) >>> 0; return random % n; };
    const units = Array.from({ length: 3 + next(4) }, () => profiles[next(profiles.length)]);
    const amount = 1 + next(units.length);
    const reqs = Array.from({ length: next(Math.min(amount, 2) + 1) }, () => [['R'], ['G'], ['U'], ['R', 'G'], ['C']][next(5)]);
    const expected = optimum(units.map(u => [...u]), amount, reqs);
    if (expected < 0) continue;
    const pool = {}; for (const unit of units) pool[unit] = (pool[unit] ?? 0) + 1;
    const actual = payment(pool, amount, reqs);
    assert.equal(actual.count, expected, `pula ${units}, koszt ${amount}, pipy ${JSON.stringify(reqs)}`);
    const paid = actual.colors.map(color => [...color]);
    while (paid.length < amount) paid.push([]);
    assert.ok(matchColorRequirements(paid, reqs), 'zapłacone jednostki pokrywają wszystkie pipy');
    assert.equal(Object.values(actual.player.manaPool).reduce((a, n) => a + n, 0), units.length - amount, 'dokładny koszt');
  }
});
