// Regresje z audytu Żywym Testerem Batch 38 (2026-08-20):
//   Z1 — damage_dealt z resolve_delirium_target niesie targetCardId/sourceCardId
//        (log pokazywał „(?)" gdy cel ginął w SBA tego samego rozstrzygnięcia)
//   Z2 — log „zawiesza ... (N liczników czasu)" używa poprawnej odmiany
//        (polishPlural zamiast sztywnego „liczników" — zgodnie z render.js/M151)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 38, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: over.kind ?? data.kind, power: over.power ?? data.power, toughness: over.toughness ?? data.toughness,
    manaCost: over.manaCost ?? data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [], subtypes: over.subtypes ?? def.subtypes ?? [],
    types: over.types ?? def.types ?? [], colors: data.colors ?? [], cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// --- Z1: delirium damage_dealt niesie targetCardId ---
// Ustawia decyzję delirium identycznie jak trigger Fear of Burning Alive
// (źródło zadaje obrażenia niecombatowe → kolejkuje wybór celu), potem
// rozstrzyga. Cel 1/1 ginie w SBA tego samego rozstrzygnięcia — bez LKI
// cardId log pokazywałby „(?)" (transkrypt green-red-30).
test('Batch38/Z1: damage_dealt z resolve_delirium_target niesie targetCardId', () => {
  const state = newState();
  // Źródło delirium na polu bitwy + 4 typy kart w grobie kontrolera.
  putCard(state, 'src', 'fear-of-burning-alive', 'p1');
  for (const [i, cid] of ['shatter', 'bone-splinters', 'ainok-artillerist', 'basic-forest'].entries()) {
    putCard(state, `gy-${i}`, cid, 'p1', 'graveyard');
  }
  putCard(state, 'victim', 'highland-game', 'p2', 'battlefield', { power: 1, toughness: 1 });
  // Ręcznie zakolejkuj decyzję delirium (jak po niecombat damage triggera).
  state.pendingDeliriumTargets.push({
    playerId: 'p1', sourceId: 'src', amount: 4, opponentId: 'p2',
    candidateIds: ['victim'], restorePriorityTo: 'p1',
  });
  state.turn.priorityPlayerId = 'p1';
  const before = state.events.length;
  const r = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  const dd = state.events.slice(before).find((e) => e.type === 'damage_dealt');
  assert.ok(dd, 'jest damage_dealt');
  assert.equal(dd.target, 'victim');
  assert.equal(dd.targetCardId, 'highland-game', 'targetCardId obecny (log pokaże nazwę, nie „?")');
  assert.equal(dd.sourceCardId, 'fear-of-burning-alive', 'sourceCardId obecny');
});

// --- Z2: log odmiany liczników czasu ---
test('Batch38/Z2: log zawieszenia używa poprawnej odmiany „liczniki czasu"', () => {
  const NAMES = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
  const helpers = { nameOf: (cardId) => cardId, nameOfObject: () => '?', isPlayer: (id) => NAMES[id] != null };
  const e = { type: 'card_suspended', playerId: 'p1', cardId: 'mindstab', timeCounters: 4 };
  const text = describeGameEvent(e, helpers, NAMES);
  assert.ok(text, 'jest opis');
  assert.match(text, /4 liczniki czasu/, `poprawna odmiana: ${text}`);
  assert.doesNotMatch(text, /liczników czasu/, 'nie sztywna odmiana');
});

// --- Z5: modalne tryby w kolejności Oracle (mode 0 pierwszy) ---
test('Batch38/Z5: tryby modalne oferowane w kolejności Oracle (Fortify: Ofensywa przed Obroną)', () => {
  const state = newState();
  state.players.find((p) => p.id === 'p1').mana = 3;
  state.players.find((p) => p.id === 'p1').manaPool = { W: 3 };
  putCard(state, 'f', 'fortify', 'p1', 'hand');
  putCard(state, 'c', 'highland-game', 'p1', 'battlefield');
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'f');
  assert.ok(casts.length >= 2, 'oba tryby oferowane');
  const modes = casts.map((c) => REGISTRY.get('fortify').spell.modes[c.modeIndex].name);
  assert.equal(modes[0], 'Ofensywa (+2/+0)', `mode 0 pierwszy (domyślna sugestia): ${modes.join(', ')}`);
  assert.equal(modes[1], 'Obrona (+0/+2)', `mode 1 drugi: ${modes.join(', ')}`);
});
