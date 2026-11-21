import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { applyEffect } from '../src/engine/effects.js';
import { defineCard, createRegistry } from '../src/cards/registry.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { rulesText } from '../src/table/render.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

function goToStep(state, step, activeId) {
  state.turn = jumpToStep({ ...state.turn, activePlayerId: activeId }, step, activeId);
}

const synRaidBolt = defineCard({
  id: 'syn-raid-bolt',
  name: 'Synthetic Arrow Storm',
  set: 'SYN',
  types: ['Sorcery'],
  colors: ['R'],
  manaCost: 5,
  spell: {
    timing: 'sorcery',
    targets: [{ type: 'any_target' }],
    effects: [{ type: 'damage', amount: 4, amountIfRaid: 5, cantBePreventedIfRaid: true }],
  },
  support: { status: 'supported', limitations: [] },
});

function baseState() {
  const s = createGameState({ seed: 22, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (let i = 1; i <= 15; i += 1) {
    addObject(s, { id: `lib-p1-${i}`, instanceId: `il-1-${i}`, cardId: 'basic-mountain', controllerId: 'p1', zone: 'library', kind: 'land' });
    addObject(s, { id: `lib-p2-${i}`, instanceId: `il-2-${i}`, cardId: 'basic-mountain', controllerId: 'p2', zone: 'library', kind: 'land' });
  }
  return s;
}

function addFromDef(state, id, controllerId, def, { zone = 'hand', tapped = false, summoningSickness = false } = {}) {
  const data = gameObjectDataOf(def);
  addObject(state, { ...data, id, instanceId: `inst-${id}`, cardId: def.id, controllerId, zone });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  }
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power = 2, toughness = 2, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
}

test('2B-1 (bez Raid): zadaje 4 obrażenia i respektuje tarczę prewencji', () => {
  const state = baseState();
  addFromDef(state, 'bolt', 'p1', synRaidBolt, { zone: 'hand' });
  addMana(state, 'p1', 5, { colors: ['R', 'R'] });
  // Tarcza prewencji na p2: prevent next 3 damage
  applyEffect(state, { type: 'prevent_next_damage', amount: 3 }, { id: 'shield-src', controllerId: 'p2' }, ['p2']);

  goToStep(state, 'main1', 'p1');
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bolt', targets: ['p2'] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  assert.equal(state.players.find((p) => p.id === 'p2').life, 19, 'bez Raid tarcza 3 pochłania 3 z 4 obrażeń (zostaje 1)');
  assert.equal(state.damageShields.length, 0, 'tarcza prewencji bez Raid została zużyta');
});

test('2B-2 (Raid aktywny nawet po śmierci atakującego + reset w nowej turze, ruling 2024-11-08)', () => {
  const state = baseState();
  addFromDef(state, 'bolt', 'p1', synRaidBolt, { zone: 'hand' });
  addCreature(state, 'raider', 'p1', 1, 1);
  addCreature(state, 'blocker', 'p2', 4, 4);
  addMana(state, 'p1', 5, { colors: ['R', 'R'] });

  goToStep(state, 'declare_attackers', 'p1');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['raider'] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { raider: ['blocker'] } }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok, true);

  // Raider zginął w walce — w main2 Raid nadal pamięta atak!
  assert.equal(state.objects.get('raider'), undefined, 'raider powinien zginąć w walce');
  goToStep(state, 'main2', 'p1');
  addMana(state, 'p1', 5, { colors: ['R', 'R'] });
  assert.equal(playerView(state, 'p1').playersAttackedThisTurn?.p1, true, 'PlayerView wystawia playersAttackedThisTurn');

  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bolt', targets: ['p2'] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 15, 'z Raid w main2 po śmierci atakującego zadaje pełne 5 obrażeń');

  // Przejście do kolejnej tury resetuje playersAttackedThisTurn
  goToStep(state, 'cleanup', 'p1');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(Boolean(playerView(state, 'p1').playersAttackedThisTurn?.p1), false, 'nowa tura resetuje flagę ataku');
});

test('2B-3 (Raid cantBePrevented, CR 615.1): przebija tarczę, filtr prewencji, shield counter i protection bez zużywania tarcz', () => {
  const state = baseState();
  addCreature(state, 'raider', 'p1', 2, 2);
  addCreature(state, 'target_shield', 'p2', 5, 6);
  addCounter(state, 'target_shield', 'shield', 1);
  addCreature(state, 'target_lethal', 'p2', 5, 5);
  addCounter(state, 'target_lethal', 'shield', 1);
  addFromDef(state, 'bolt1', 'p1', synRaidBolt, { zone: 'hand' });
  addFromDef(state, 'bolt2', 'p1', synRaidBolt, { zone: 'hand' });
  addFromDef(state, 'bolt3', 'p1', synRaidBolt, { zone: 'hand' });

  // Tarcza prewencji na p2 + filtr prevent_damage_this_turn + shield counter na obu stworach
  applyEffect(state, { type: 'prevent_next_damage', amount: 10 }, { id: 's1', controllerId: 'p2' }, ['p2']);
  applyEffect(state, { type: 'prevent_damage_this_turn', typesInclude: ['Creature'] }, { id: 's2', controllerId: 'p2' }, []);

  goToStep(state, 'declare_attackers', 'p1');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['raider'] }).ok, true);
  state.combat = null;
  goToStep(state, 'main2', 'p1');
  addMana(state, 'p1', 15, { colors: ['R', 'R', 'R', 'R', 'R', 'R'] });

  // 1) W gracza p2 z tarczą 10 — przebija pełne 5, tarcza 10 zostaje nienaruszona!
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bolt1', targets: ['p2'] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 15);
  assert.equal(state.damageShields[0]?.remaining, 10, 'CR 615.1: tarcza nie zostaje zużyta, gdy obrażenia nie mogą być zapobiegnięte');

  // 2) W stwora 5/6 z filtrem prewencji i shield counterem — zadaje 5 i NIE zużywa shield countera!
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bolt2', targets: ['target_shield'] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(state.objects.get('target_shield')?.damage, 5, 'stwór 5/6 z filtrem prewencji i shieldem dostaje 5 obrażeń');
  assert.equal(state.objects.get('target_shield')?.counters?.shield, 1, 'CR 615.1: shield counter nie zostaje zużyty');

  // 3) W stwora 5/5 ze shield counterem — zabija go przez wszystko!
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bolt3', targets: ['target_lethal'] }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  assert.equal(state.objects.get('target_lethal'), undefined, 'stwór 5/5 ze shield counterem i filtrem ginie od 5 nie zapobieżonych obrażeń');
});

test('2B-4 (pusta deklaracja ataku + fingerprint): attackerIds=[] NIE aktywuje Raid; fingerprint zawiera playersAttackedThisTurn', () => {
  const s1 = baseState();
  const s2 = baseState();
  addCreature(s1, 'c1', 'p1', 2, 2);
  addCreature(s2, 'c1', 'p1', 2, 2);

  goToStep(s1, 'declare_attackers', 'p1');
  goToStep(s2, 'declare_attackers', 'p1');
  assert.equal(execute(s1, { type: 'declare_attackers', playerId: 'p1', attackerIds: [] }).ok, true);
  assert.equal(Boolean(s1.playersAttackedThisTurn?.p1), false, 'pusty atak nie może ustawiać Raid');

  assert.equal(execute(s2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['c1'] }).ok, true);
  assert.equal(s2.playersAttackedThisTurn?.p1, true);
  assert.notEqual(stateFingerprint(s1), stateFingerprint(s2), 'fingerprint rozróżnia stan z Raid i bez Raid');
});

test('2B-5 (render + bot): polskie etykiety Raid oraz wycena bota dla 5 nie zapobieżonych obrażeń', () => {
  const txt = rulesText(synRaidBolt);
  assert.doesNotMatch(txt, /undefined/);
  assert.match(txt, /Raid|zaatakował/i);
  assert.match(txt, /zapobie/i);

  const registry = createRegistry([...createCardRegistry().all(), synRaidBolt]);
  const bot = createHeuristicBot({ seed: 1, registry });

  // Wróg ma 5 życia i tarczę prewencji 10 — po ataku (Raid!) czar przebija tarczę i daje LETHAL!
  const state = baseState();
  addFromDef(state, 'bolt', 'p1', synRaidBolt, { zone: 'hand' });
  addCreature(state, 'raider', 'p1', 1, 1);
  state.players[1].life = 5;
  applyEffect(state, { type: 'prevent_next_damage', amount: 10 }, { id: 's1', controllerId: 'p2' }, ['p2']);
  goToStep(state, 'declare_attackers', 'p1');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['raider'] }).ok, true);
  state.combat = null;
  goToStep(state, 'main2', 'p1');
  addMana(state, 'p1', 5, { colors: ['R', 'R'] });

  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd.type, 'cast_spell', 'bot po Raidzie powinien rzucić Arrow Storm jako lethal mimo tarczy prewencji');
  assert.deepEqual(cmd.targets, ['p2']);

  // Wróg ma 20 życia oraz stwora 5/5 (TMC=4) z tarczą 10 — bot z Raid zabija stwora mimo tarczy!
  const state2 = baseState();
  addFromDef(state2, 'bolt', 'p1', synRaidBolt, { zone: 'hand' });
  addCreature(state2, 'raider', 'p1', 1, 1);
  addCreature(state2, 'shielded_55', 'p2', 5, 5, { manaCost: 4 });
  applyEffect(state2, { type: 'prevent_next_damage', amount: 10 }, { id: 's1', controllerId: 'p2' }, ['shielded_55']);
  goToStep(state2, 'declare_attackers', 'p1');
  assert.equal(execute(state2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['raider'] }).ok, true);
  state2.combat = null;
  goToStep(state2, 'main2', 'p1');
  addMana(state2, 'p1', 5, { colors: ['R', 'R'] });

  const cmd2 = bot.chooseCommand(playerView(state2, 'p1'));
  assert.equal(cmd2.type, 'cast_spell', 'bot po Raidzie zabija 5/5 z tarczą prewencji (unpreventable)');
  assert.deepEqual(cmd2.targets, ['shielded_55']);
});
