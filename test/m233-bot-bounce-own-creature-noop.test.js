// M233/2 — audyt Żywym Testerem (2026-08-27), sonda z partii worek-legend vs
// theros (seed 5): Sea God's Scorn („odbij max 3 stwory/enchantmenty na ręce
// właścicieli") ma tę samą strukturę co Wrap in Flames — wrapper
// apply_to_each_target z variableTargets min:0. Wycena celów (M158) obsługiwała
// tylko damage/cant_block, więc gdy jedynym legalnym celem był WŁASNY stwór, bot
// odbijał SWOJEGO stwora na rękę (6 many, czysta strata tempa) — wariant miał
// bazę 50 > pass.
//
// Oś 1 audytu. Fix: per-cel dla efektów usuwających (bounce/destroy/exile)
// wewnątrz wrappera — cel własny karany, wroga premiowany (jak górny
// REMOVAL_EFFECTS, ADR 0002 — generycznie po typie efektu i kontrolerze celu).
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
  const state = createGameState({ seed: 233, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

function scornScores(state) {
  const bot = createHeuristicBot({ seed: 233 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const byTarget = (tid) => trace.options
    .filter((o) => o.cmd.startsWith('cast_spell(s') && o.cmd.includes(tid))
    .map((o) => o.score);
  return { pass, own: byTarget('mine'), foe: byTarget('foe') };
}

test('M233/2: bot NIE odbija WŁASNEGO stwora (Sea God\'s Scorn), gdy brak celu wroga', () => {
  const state = botTurn();
  putCard(state, 's', 'sea-gods-scorn', 'p2', 'hand');
  putCard(state, 'mine', 'thornhide-wolves', 'p2', 'battlefield'); // jedyny cel = własny
  const choice = createHeuristicBot({ seed: 233 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(
    choice.type === 'cast_spell' && choice.objectId === 's' ? 'cast-bounce-own' : 'inne',
    'cast-bounce-own',
    `bot nie powinien odbijać własnego stwora: ${JSON.stringify(choice)}`,
  );
});

test('M233/2: wycena odbicia własnego celu < pass; wrogiego > pass', () => {
  const state = botTurn();
  putCard(state, 's', 'sea-gods-scorn', 'p2', 'hand');
  putCard(state, 'mine', 'thornhide-wolves', 'p2', 'battlefield');
  putCard(state, 'foe', 'breaching-hippocamp', 'p1', 'battlefield');
  const { pass, own, foe } = scornScores(state);
  assert.ok(own.length > 0, 'wariant na własny cel powinien istnieć w śladzie');
  for (const s of own) assert.ok(s < pass, `odbicie własnego celu (${s}) musi być < pass (${pass})`);
  assert.ok(foe.some((s) => s > pass), `odbicie wrogiego celu powinno przebić pass: ${JSON.stringify(foe)} vs ${pass}`);
});
