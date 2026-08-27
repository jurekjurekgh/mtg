// M237/3 — audyt Żywym Testerem (2026-08-27, skan strukturalny innistrad-brg):
// bot aktywował zdolność NADANĄ przez equipment (Blazing Torch: „{T},poświęć:
// 2 obrażenia dowolnemu celowi") celując w TWARZ przeciwnika (chip 2 vs 20 ż.),
// a nawet równo wyceniał uderzenie we WŁASNĄ twarz — zamiast zabić stwora 2/2.
//
// Oś 1 audytu. Root cause: bot czytał zdolność z `def.abilities[index]`, ale
// zdolność nadana equipmentem żyje w `equipment.grantedAbilities[index]`
// (grantedFromEquipment). Ability było undefined → efekty niewyceniane → każdy
// cel dostawał gołe score=2. Fix: rozwiązanie granted-ability + wycena
// obrażeń zdolności w stwora (dobicie = removal) i gracza (jak twarz Fireballa).
// Reguła po deskryptorze (ADR 0002), tylko widok (ADR 0017).
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
    types: def.types ?? [], colors: d.colors ?? [], equipment: d.equipment,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function torchTurn(foeLife, extras = () => {}) {
  const state = createGameState({ seed: 237, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 6);
  state.players.find((p) => p.id === 'p1').life = foeLife;
  put(state, 'wolf', 'thornhide-wolves', 'p2', 'battlefield');
  put(state, 'torch', 'blazing-torch', 'p2', 'battlefield', { attachedTo: 'wolf' });
  extras(state);
  return state;
}

test('M237/3: bot ZABIJA stwora 2/2 zdolnością granted (nie chipuje twarzy)', () => {
  const s = torchTurn(20, (st) => {
    put(st, 'small', 'leafcrown-dryad', 'p1', 'battlefield'); // 2/2 — 2 dmg zabija
    put(st, 'big', 'chained-throatseeker', 'p1', 'battlefield'); // 5/5
  });
  const c = createHeuristicBot({ seed: 237 }).chooseCommand(playerView(s, 'p2'), {});
  assert.ok(c.type === 'activate_ability' && c.objectId === 'torch' && (c.targets ?? [])[0] === 'small',
    `Blazing Torch ma dobić 2/2, nie chipować: ${JSON.stringify(c)}`);
});

test('M237/3: bot NIGDY nie celuje granted-damage we WŁASNĄ twarz/stwora', () => {
  const s = torchTurn(20, (st) => {
    put(st, 'big', 'chained-throatseeker', 'p1', 'battlefield'); // tylko nietrafialny 5/5
  });
  const bot = createHeuristicBot({ seed: 237 });
  bot.chooseCommand(playerView(s, 'p2'), {});
  const opts = bot.trace()[0].options;
  const selfFace = opts.find((o) => o.cmd === 'activate_ability(torch#1->p2)')?.score;
  const ownCreature = opts.find((o) => o.cmd === 'activate_ability(torch#1->wolf)')?.score;
  const pass = opts.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  assert.ok(selfFace < pass, `uderzenie we własną twarz (${selfFace}) musi być < pass (${pass})`);
  assert.ok(ownCreature < pass, `uderzenie we własnego stwora (${ownCreature}) musi być < pass (${pass})`);
});

test('M237/3: granted-damage dobija gracza, gdy lethal', () => {
  const s = torchTurn(2); // 2 dmg = lethal
  const c = createHeuristicBot({ seed: 237 }).chooseCommand(playerView(s, 'p2'), {});
  assert.ok(c.type === 'activate_ability' && c.objectId === 'torch' && (c.targets ?? [])[0] === 'p1',
    `Blazing Torch ma dobić gracza na 2 życia: ${JSON.stringify(c)}`);
});

test('M237/3: bot NIE chipuje granted-damage w zdrowego gracza bez lepszego celu', () => {
  const s = torchTurn(20); // brak stworów wroga, 20 życia
  const c = createHeuristicBot({ seed: 237 }).chooseCommand(playerView(s, 'p2'), {});
  assert.notEqual(c.type === 'activate_ability' && c.objectId === 'torch' ? 'chip' : 'inne', 'chip',
    `2 dmg vs 20 ż. to chip — trzymaj Torch: ${JSON.stringify(c)}`);
});
