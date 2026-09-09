// B (znalezisko testera): Fourth Bridge Prowler ETB (-1/-1) — bot celował
// w NAJWIĘKSZEGO stwora wroga (ślepy 30+wartość), więc -1/-1 na dużej
// kreaturze wygasało bez śladu. Reguła: wrogi debuff TOUGHNESS dobija
// (704.5f: toughness+delta ≤ 0 albo lethal z obrażeniami — działa przez
// indestructible i regenerację, bo to nie destroy); dopiero bez zabójstwa
// celuje największego; własnej nie zabija (Prowler opcjonalny → decline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { replaceObject } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const R = createCardRegistry();
function game() {
  const s = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p2';
  return s;
}
function put(s, id, cardId, c, zone, patch = {}) {
  const d = R.get(cardId); assert.ok(d, cardId);
  addObject(s, { ...gameObjectDataOf(d), id, instanceId: `i-${id}`, cardId, controllerId: c, ownerId: c, zone,
    types: d.types ?? [], keywords: d.keywords ?? [], subtypes: d.subtypes ?? [], spell: d.spell, ...patch });
}
// Rzut Prowlera przez bota (p2) aż do decyzji celu triggera; zwraca wybór bota.
function prowlerChoice(s) {
  put(s, 'prowler', 'fourth-bridge-prowler', 'p2', 'hand');
  put(s, 'sw', 'basic-swamp', 'p2', 'battlefield');
  const cast = playerView(s, 'p2').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'prowler');
  assert.ok(cast, 'oferta rzutu Prowlera');
  assert.ok(execute(s, cast).ok);
  for (let i = 0; i < 8 && !s.pendingTriggerTargets?.[0]; i++) {
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  assert.ok(s.pendingTriggerTargets?.[0], 'decyzja celu triggera');
  const bot = createHeuristicBot({ seed: 1 });
  return bot.chooseCommand(playerView(s, 'p2'), {});
}

test('B: Prowler dobija 2/1 mimo 6/5 na stole', () => {
  const s = game();
  put(s, 'small', 'goblin-piker', 'p1', 'battlefield'); // 2/1 — ginie
  put(s, 'big', 'segmented-krotiq', 'p1', 'battlefield'); // 6/5 — przeżyje
  const cmd = prowlerChoice(s);
  assert.equal(cmd.targetId, 'small', `bot dobija, nie głaszcze: ${cmd.targetId}`);
});

test('B: bez zabójstwa Prowler idzie w największego (fallback)', () => {
  const s = game();
  put(s, 'mid', 'wormfang-newt', 'p1', 'battlefield'); // 2/2 — przeżyje
  put(s, 'big', 'segmented-krotiq', 'p1', 'battlefield'); // 6/5 — przeżyje
  const cmd = prowlerChoice(s);
  assert.equal(cmd.targetId, 'big', `fallback: największy: ${cmd.targetId}`);
});

test('B: Prowler nie zabija własnej 1/1 (decline lub wróg)', () => {
  const s = game();
  put(s, 'mine', 'goblin-piker', 'p2', 'battlefield'); // własna 2/1
  put(s, 'big', 'segmented-krotiq', 'p1', 'battlefield'); // wróg 6/5
  const cmd = prowlerChoice(s);
  assert.equal(cmd.targetId, 'big', `wróg zamiast samobójstwa: ${cmd.targetId}`);
});

test('B: Prowler dobija 3/3 z 2 obrażeniami (lethal z debuffem)', () => {
  const s = game();
  put(s, 'hurt', 'wormfang-newt', 'p1', 'battlefield');
  replaceObject(s, s.objects.get('hurt'), { power: 3, toughness: 3, damage: 2 }); // 2 ≥ 3−1
  put(s, 'big', 'segmented-krotiq', 'p1', 'battlefield');
  const cmd = prowlerChoice(s);
  assert.equal(cmd.targetId, 'hurt', `bot widzi lethala: ${cmd.targetId}`);
});
