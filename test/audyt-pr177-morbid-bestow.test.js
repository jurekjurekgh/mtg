// PR #177 rozszerzył tracker Morbid na zniszczenie permanenta. Bestowed Aura
// to nie stwór w chwili odejścia, mimo że karta w grobie jest stworem.
// CR 702.103b, 700.4, 603.10a: https://ancestral.vision/additional-rules/keyword-abilities.html
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { eventIsCreatureDeath } from '../src/engine/triggers.js';

const registry = createCardRegistry();
function game() {
  const s = createGameState({ seed: 177, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  return s;
}
function card(s, id, cardId, zone) {
  const def = registry.get(cardId);
  assert.ok(def, cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def), types: def.types ?? [], colors: def.colors ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], abilities: def.abilities ?? [] });
}
function run(s, command) {
  const result = execute(s, command);
  assert.ok(result.ok, `${command.type}: ${result.events?.[0]?.reason}`);
  return result;
}
function drain(s) {
  for (let i = 0; i < 40 && s.zones.stack.length && !s.pendingSearchChoice && !s.pendingOptionalPay && !s.pendingTriggerTargets?.length; i++) {
    const order = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'resolve_trigger_order');
    if (order) { run(s, order); continue; }
    run(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  assert.ok(s.zones.stack.length === 0 || s.pendingSearchChoice || s.pendingOptionalPay || s.pendingTriggerTargets?.length, 'stos rozstrzygnięty lub czeka decyzja');
}
function scene(bestow, observers = false) {
  const s = game();
  card(s, 'host', 'highland-game', 'battlefield');
  card(s, 'dryad', 'leafcrown-dryad', 'hand');
  addMana(s, 'p1', 4, ['G']);
  run(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', ...(bestow ? { bestow: true, targets: ['host'] } : {}) });
  drain(s);
  const permanent = [...s.objects.values()].find(o => o.cardId === 'leafcrown-dryad' && o.zone === 'battlefield');
  assert.ok(permanent);
  assert.equal(permanent.kind, bestow ? 'aura' : 'creature');
  if (observers) {
    card(s, 'occultist', 'selhoff-occultist', 'battlefield');
    card(s, 'forebear', 'furious-forebear', 'graveyard');
  }
  card(s, 'keep', 'keep-out', 'hand');
  addMana(s, 'p1', 2, ['W']);
  const cmd = playerView(s, 'p1').legalCommands.find(c => c.type === 'cast_spell' && c.objectId === 'keep' && c.modeIndex === 1 && c.targets?.[0] === permanent.id);
  assert.ok(cmd, 'Keep Out może zniszczyć zaklęcie');
  run(s, cmd);
  drain(s);
  assert.ok([...s.objects.values()].some(o => o.cardId === 'leafcrown-dryad' && o.zone === 'graveyard'));
  return s;
}

test('Morbid: zniszczenie aury Leafcrown Dryad nie jest śmiercią stwora', () => {
  const s = scene(true);
  assert.equal(s.creatureDiedThisTurn, false, 'z pola bitwy zeszła aura, nie stwór');
  card(s, 'vigil', 'caravan-vigil', 'hand');
  card(s, 'forest', 'basic-forest', 'library');
  addMana(s, 'p1', 1, ['G']);
  run(s, { type: 'cast_spell', playerId: 'p1', objectId: 'vigil' });
  drain(s);
  assert.equal(s.pendingSearchChoice.destination, 'hand');
  assert.equal(s.pendingSearchChoice.destinations, null, 'nie ma alternatywy pola bitwy');
});

test('Morbid: ta sama karta rzucona jako stwór liczy się po zniszczeniu', () => {
  const s = scene(false);
  assert.equal(s.creatureDiedThisTurn, true);
});


test('Aura nie wyzwala zdolności obserwujących śmierć stwora', () => {
  const s = scene(true, true);
  const fired = s.events.filter(e => e.type === 'ability_triggered' && (e.cardId === 'selhoff-occultist' || e.cardId === 'furious-forebear'));
  assert.deepEqual(fired, [], 'ani Occultist, ani Forebear nie widzą śmierci stwora');
  assert.equal(s.pendingOptionalPay, null);
});


test('Stwór Leafcrown Dryad wyzwala obie zdolności obserwujące jego śmierć', () => {
  const s = scene(false, true);
  for (const cardId of ['selhoff-occultist', 'furious-forebear']) {
    assert.ok(s.events.some(e => e.type === 'ability_triggered' && e.cardId === cardId), cardId);
  }
});


test('Klasyfikacja śmierci czyta LKI, nie typ karty po ruchu', () => {
  const s = game();
  const event = { type: 'permanent_destroyed', toId: 'moved', toZone: 'graveyard' };
  s.objects.set('moved', { id: 'moved', zone: 'graveyard', kind: 'creature', types: ['Creature'],
    formerZone: 'battlefield', formerKind: 'artifact', formerTypes: ['Artifact'] });
  assert.equal(eventIsCreatureDeath(s, event), false, 'karta jest stworem, ale odchodził artefakt');
  s.objects.set('moved', { id: 'moved', zone: 'graveyard', kind: 'artifact', types: ['Artifact'],
    formerZone: 'battlefield', formerKind: 'creature', formerTypes: ['Artifact', 'Creature'] });
  assert.equal(eventIsCreatureDeath(s, event), true, 'ożywiony artefakt odchodził jako stwór');
});
