// Zgłoszenie D właściciela (2026-10-07): Pain for All nie zadziałało, gdy
// zaczarowany stwór ZGINĄŁ od obrażeń z walki. Scenariusz: aura na moim
// stworze, bot zaatakował, zablokowałem, bot zadał 6 obrażeń, kreatura
// zginęła — bot nie dostał żadnych obrażeń.
//
// CR 603.10 (looks-back): zdolność „Whenever enchanted creature is dealt
// damage" sprawdza się w chwili zdarzenia — aura i host żyli w momencie
// zadania obrażeń, więc trigger odpala, choć SBA tej samej komendy zabiera
// hosta i aurę do grobu. Silnik miał już taki looks-back dla zdolności
// WŁASNYCH stwora (targetLki, dealt_damage), ale trigger AURY wymagał
// `attachment.zone === 'battlefield'` w chwili skanu — po SBA aura jest już
// w grobie i trigger przepadał.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function stan() {
  const state = createGameState({ seed: 13, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

test('D/1: Pain for All — śmiertelny cios w bloku odbija obrażenia w atakującego gracza', () => {
  const state = stan();
  // Bot (p2) atakuje 6/6; ja (p1) blokuję 2/3 z Pain for All.
  put(state, 'atk', 'highland-game', 'p2', 'battlefield', { power: 6, toughness: 6, summoningSickness: false });
  put(state, 'blk', 'giant-spider', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'aura', 'pain-for-all', 'p1', 'battlefield');
  attachAuraToCreature(state, 'aura', 'blk');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['blk'] } }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const before = state.players.find((p) => p.id === 'p2').life;
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  // Host zginął, aura w grobie — a mimo to trigger CR 603.10 odpalił.
  const blk = [...state.objects.values()].find((o) => o.instanceId === 'i-blk');
  assert.equal(blk.zone, 'graveyard', 'bloker zginął (6 > 3)');
  // Rozstrzygnięcie triggera (priorytety).
  for (let i = 0; i < 10 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const after = state.players.find((p) => p.id === 'p2').life;
  assert.equal(before - after, 6,
    `atakujący gracz dostaje 6 (tyle, ile zadał hostowi): before=${before} after=${after}`);
});

test('D/2: Pain for All — NIEśmiertelne obrażenia w bloku nadal odbijają', () => {
  const state = stan();
  put(state, 'atk', 'highland-game', 'p2', 'battlefield', { power: 1, toughness: 6, summoningSickness: false });
  put(state, 'blk', 'giant-spider', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'aura', 'pain-for-all', 'p1', 'battlefield');
  attachAuraToCreature(state, 'aura', 'blk');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['blk'] } }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const before = state.players.find((p) => p.id === 'p2').life;
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  for (let i = 0; i < 10 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const after = state.players.find((p) => p.id === 'p2').life;
  const blk = [...state.objects.values()].find((o) => o.instanceId === 'i-blk');
  assert.equal(blk.zone, 'battlefield', 'bloker przeżył (1 < 3)');
  assert.equal(before - after, 1, 'atakujący gracz dostaje 1');
});
