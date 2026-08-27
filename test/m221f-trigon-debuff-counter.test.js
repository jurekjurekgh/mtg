// M221/F — zgłoszenie właściciela z realnej gry (Trigon of Corruption): bot ma
// wolną manę i charge, mógłby zdolnością „{2},{T},usuń charge: -1/-1 na cel"
// zabić mojego tokena 1/1, a przez dwie kolejki w ogóle jej nie używa.
//
// Przyczyna: licznik `-1/-1` nie był ani „statystyczny" (BENEFICIAL), ani
// `charge`, więc wpadał w gałąź liczników ZASOBOWYCH bez konsumenta → kara −25.
// Licznik DEBUFF na wrogim stworze to czysty zysk (osłabienie/zabicie).
//
// Reguła po deskryptorze (minus w nazwie licznika, CR 122), bez nazw kart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function setup({ enemyToughness = 1, charge = 3 } = {}) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main2', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  const tr = gameObjectDataOf(REGISTRY.get('trigon-of-corruption'));
  addObject(state, {
    id: 'trig', instanceId: 'i-trig', cardId: 'trigon-of-corruption', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: tr.kind, abilities: tr.abilities ?? [], types: tr.types ?? ['Artifact'],
    entersWithCounters: tr.entersWithCounters,
  });
  state.objects.set('trig', Object.freeze({ ...state.objects.get('trig'), counters: { charge } }));
  addObject(state, {
    id: 'tok', instanceId: 'i-tok', cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: enemyToughness, abilities: [],
    subtypes: [], types: ['Creature'], colors: ['W'],
  });
  return state;
}

function trace(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view, {});
  const t = bot.trace()[0];
  const pass = t.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const debuff = t.options.find((o) => o.cmd.startsWith('activate_ability(trig') && o.cmd.includes('->tok'));
  return { chosen, pass, debuff };
}

test('M221/F: bot UŻYWA -1/-1 na wrogim stworze (nad passem, wybiera ją)', () => {
  const { chosen, pass, debuff } = trace(setup({ enemyToughness: 1 }));
  assert.ok(debuff, 'zdolność -1/-1 na wroga musi być w ocenie');
  assert.ok(debuff.score > pass, `-1/-1 na wroga > pass (${pass}), było ${debuff.score}`);
  assert.equal(chosen.type, 'activate_ability', `bot powinien aktywować, wybrał: ${JSON.stringify(chosen)}`);
  assert.ok((chosen.targets ?? []).includes('tok'), 'cel to wrogi stwór');
});

test('M221/F: wartość rośnie, gdy -1/-1 ZABIJA cel (toughness ≤ amount)', () => {
  const kill = trace(setup({ enemyToughness: 1 }));
  const weaken = trace(setup({ enemyToughness: 5 }));
  assert.ok(kill.debuff.score > weaken.debuff.score,
    `zabicie (${kill.debuff.score}) cenniejsze niż samo osłabienie (${weaken.debuff.score})`);
});
