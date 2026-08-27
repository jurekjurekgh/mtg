// M236/2 — audyt Żywym Testerem (2026-08-27), partia forgotten-realms (gracz)
// vs final-fantasy (bot), seed 73: bot aktywował Instant Ramen
// ({2},{T},poświęć: zyskaj 3 życia) przy 22 życia i PRZEWADZE (przeciwnik na
// 13) — wyrzucił permanent-Food za marginalne, niepotrzebne życie.
//
// Oś 1 audytu (nieoptymalne użycie zdolności). Root cause: wycena aktywowanego
// `gain_life` była PŁASKA (2 + amount), bez progu życia i bez kary za koszt
// poświęcenia siebie. Fix: wartość życia zależy od sytuacji (nisko/pod
// naciskiem = ratunek, wysoko i bezpiecznie = ~0), a sacrificeSelf bez korzyści
// życiowej schodzi poniżej passu. Reguła po myLife/enemyAttackPower i koszcie
// (ADR 0017), zero nazw kart (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function ramenState(botLife) {
  const state = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  state.players.find((p) => p.id === 'p2').life = botLife;
  put(state, 'ramen', 'instant-ramen', 'p2', 'battlefield');
  return state;
}

function ramenScore(state) {
  const bot = createHeuristicBot({ seed: 236 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const opts = bot.trace()[0].options;
  return {
    ramen: opts.find((o) => o.cmd.startsWith('activate_ability(ramen'))?.score,
    pass: opts.find((o) => o.cmd === 'pass_priority')?.score ?? 0,
  };
}

test('M236/2: bot NIE poświęca Food za życie przy zdrowym życiu (22)', () => {
  const choice = createHeuristicBot({ seed: 236 }).chooseCommand(playerView(ramenState(22), 'p2'), {});
  assert.notEqual(choice.type === 'activate_ability' && choice.objectId === 'ramen' ? 'act' : 'inne', 'act',
    `przy 22 życia bot nie powinien poświęcać Food za 3 życia: ${JSON.stringify(choice)}`);
});

test('M236/2: zysk życia z poświęcenia przy zdrowym życiu < pass', () => {
  const { ramen, pass } = ramenScore(ramenState(22));
  assert.ok(ramen < pass, `sac-za-życie przy 22 ż. (${ramen}) musi być < pass (${pass})`);
});

test('M236/2: przy KRYTYCZNYM życiu (4) zysk życia jest wart aktywacji (> pass)', () => {
  const { ramen, pass } = ramenScore(ramenState(4));
  assert.ok(ramen > pass, `sac-za-życie przy 4 ż. (${ramen}) ma być > pass (${pass}) — ratunek`);
});
