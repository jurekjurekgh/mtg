// M231 — audyt Żywym Testerem (2026-08-27), partia dominaria-wu (gracz) vs
// mirrodin-brg (bot), seed 33: bot rzucił Awaken the Sleeper
// (gain_control_until_end_of_turn) na WŁASNEGO stwora (Bone Shredder). Przejęcie
// kontroli nad stworem, którego JUŻ się kontroluje, jest jałowe — „kradzież"
// nic nie daje (marginalny haste nie jest wart karty).
//
// Oś 1 audytu (bezsensowne działania bota). Root cause: wycena
// gain_control_until_end_of_turn premiowała TYLKO cel wroga, a cel własny nie
// dostawał żadnej kary → przy braku wrogich stworów remis z bazą 50 wygrywał
// z passem. Naprawa: cel własny karany (−70), poniżej passu; cel wroga nadal
// premiowany. Generycznie po kontrolerze celu (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botTurn() {
  const state = createGameState({ seed: 231, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

function awakenScores(state) {
  const bot = createHeuristicBot({ seed: 231 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const byTarget = (tid) => trace.options
    .filter((o) => o.cmd.startsWith('cast_spell(a') && o.cmd.includes(tid))
    .map((o) => o.score);
  return { pass, own: byTarget('mine'), foe: byTarget('foe') };
}

test('M231: bot NIE rzuca Awaken (gain_control) na WŁASNEGO stwora, gdy brak celu wroga', () => {
  const state = botTurn();
  putCard(state, 'a', 'awaken-the-sleeper', 'p2', 'hand');
  putCard(state, 'mine', 'highland-game', 'p2', 'battlefield'); // jedyny cel = własny
  const choice = createHeuristicBot({ seed: 231 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(
    choice.type === 'cast_spell' && choice.objectId === 'a' ? 'cast-awaken-own' : 'inne',
    'cast-awaken-own',
    `bot nie powinien rzucać Awaken w własnego stwora: ${JSON.stringify(choice)}`,
  );
});

test('M231: wycena Awaken na własny cel < pass; na cel wroga > pass', () => {
  const state = botTurn();
  putCard(state, 'a', 'awaken-the-sleeper', 'p2', 'hand');
  putCard(state, 'mine', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');
  const { pass, own, foe } = awakenScores(state);
  assert.ok(own.length > 0, 'wariant na własny cel powinien istnieć w śladzie');
  for (const s of own) assert.ok(s < pass, `Awaken na własny cel (${s}) musi być poniżej passu (${pass})`);
  assert.ok(foe.some((s) => s > pass), `Awaken na cel wroga powinien przebić pass: ${JSON.stringify(foe)} vs ${pass}`);
});
