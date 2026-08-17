// M107 (ADR 0017, zlecenie właściciela 2026-08-16) — PEŁNA sekcja walki
// w PlayerView. Wcześniej widok nie niósł walki wcale: kontroler musiał
// rekonstruować ją ze znaczników `attacking` na kaflach i nie miał JAK
// sprawdzić przypisań bloków. Deklaracje są jawne (CR 508/509), więc widok
// pokazuje je w całości — obu graczom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

function combatState() {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  const creature = (id, controllerId, power = 2, toughness = 2) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
      kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  creature('a1', 'p1', 3, 3);
  creature('a2', 'p1', 2, 2);
  creature('b1', 'p2', 1, 4);
  return state;
}

test('M107: poza walką sekcja combat jest pusta (null)', () => {
  const state = combatState();
  assert.equal(playerView(state, 'p1').combat, null);
  assert.equal(playerView(state, 'p2').combat, null);
});

test('M107: po deklaracji atakujących widok niesie listę i broniącego się gracza', () => {
  const state = combatState();
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] });
  for (const playerId of ['p1', 'p2']) {
    const combat = playerView(state, playerId).combat;
    assert.ok(combat, `sekcja walki jest w widoku gracza ${playerId}`);
    assert.deepEqual(combat.attackers, ['a1', 'a2']);
    assert.equal(combat.defendingPlayerId, 'p2');
    assert.deepEqual(combat.unblockedAttackers, ['a1', 'a2'], 'przed blokami nikt nie jest zablokowany');
  }
});

test('M107: po deklaracji bloków widok pokazuje przypisania i zablokowanych', () => {
  const state = combatState();
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] });
  const blockOption = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'declare_blockers' && JSON.stringify(c).includes('b1'));
  assert.ok(blockOption, 'jest wariant bloku');
  execute(state, blockOption);
  const combat = playerView(state, 'p1').combat;
  const blockedAttacker = Object.keys(combat.blockers)[0];
  assert.ok(blockedAttacker, 'mapa bloków jest wypełniona');
  assert.deepEqual(combat.blockers[blockedAttacker], ['b1']);
  assert.ok(combat.blockedAttackers.includes(blockedAttacker));
  assert.ok(!combat.unblockedAttackers.includes(blockedAttacker));
  assert.equal(combat.unblockedAttackers.length, 1, 'drugi atakujący pozostał niezablokowany');
});

test('M107: sekcja walki jest serializowalna (bez Map/Set) — przechodzi przez JSON', () => {
  const state = combatState();
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] });
  const combat = playerView(state, 'p1').combat;
  const roundTrip = JSON.parse(JSON.stringify(combat));
  assert.deepEqual(roundTrip, combat, 'widok musi być zwykłym obiektem (protokół/replay/mostek testera)');
});

test('M107: bot liczy atakujących z sekcji walki (a nie ze znaczników kafli)', async () => {
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const state = combatState();
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] });
  const view = playerView(state, 'p1');
  // Znaczniki kafli celowo psujemy — bot ma czytać sekcję walki.
  const brokenView = {
    ...view,
    zones: { ...view.zones, battlefield: view.zones.battlefield.map((o) => ({ ...o, attacking: false })) },
  };
  const bot = createHeuristicBot({ seed: 1 });
  assert.ok(bot, 'bot się tworzy');
  assert.equal(brokenView.combat.attackers.length, 2,
    'sekcja walki pozostaje źródłem prawdy niezależnie od kafli');
});
