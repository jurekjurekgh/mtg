// Audyt Batch53, C-R4 (zlecenie właściciela 2026-09-05): symulacja walki w
// declare_attackers ignorowała pumpy z triggera „whenever this creature
// becomes blocked" (Ichorclaw Myr 1/1 — zablokowany staje się 3/3). Bot
// widział 1/1 w 2/2 (chump, −10) i chował stwora, który realnie WYGRYWA
// blok: zabija 2/2 i przeżywa (3 obrażenia < 3 wytrzymałości).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'declare_attackers', pid = 'p1') {
  const s = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, pid);
  s.turn.activePlayerId = pid;
  s.turn.priorityPlayerId = pid;
  return s;
}

function addCard(s, id, cardId, pid, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  return s.objects.get(id);
}

function addVanilla(s, id, pid, { power = 2, toughness = 2 } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  return s.objects.get(id);
}

function pickAttack(s, pid = 'p1', seed = 7) {
  const b = createHeuristicBot({ seed });
  const cmd = b.chooseCommand(playerView(s, pid));
  return cmd;
}

test('C-R4: Ichorclaw Myr atakuje przez 2/2 — zablokowany pumpuje się do 3/3', () => {
  const s = game();
  addCard(s, 'ich', 'ichorclaw-myr', 'p1');
  addVanilla(s, 'bloker', 'p2', { power: 2, toughness: 2 });
  const cmd = pickAttack(s);
  assert.equal(cmd.type, 'declare_attackers');
  assert.ok((cmd.attackerIds ?? []).includes('ich'),
    'blokowany 1/1→3/3 zabija 2/2 i przeżywa — sim musi liczyć pump becomes_blocked');
});

test('C-R4 anti-over-fix: pump nie ratuje przed chumpem w większego blokera (3/3 w 4/4)', () => {
  const s = game();
  addCard(s, 'ich', 'ichorclaw-myr', 'p1');
  addVanilla(s, 'wieza', 'p2', { power: 4, toughness: 4 });
  const cmd = pickAttack(s);
  assert.equal(cmd.type, 'declare_attackers');
  assert.ok(!(cmd.attackerIds ?? []).includes('ich'),
    'nawet z pumpem 3/3 ginie w 4/4 bez zabicia blokera — atak pozostaje jałowy');
});
