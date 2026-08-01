import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';

const SHOCK = { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] };

function stateWithSpell() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addMana(state, 'p1', 2);
  addObject(state, { id: 'shock', instanceId: 'is', cardId: 'Shock', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1, spell: SHOCK });
  addObject(state, { id: 'bear', instanceId: 'ib', cardId: 'Bear', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2 });
  return state;
}

test('cast_spell płaci koszt i kładzie czar na stos z celami', () => {
  const state = stateWithSpell();
  const result = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['bear'] });
  assert.equal(result.ok, true);
  assert.equal(result.events[0].type, 'spell_cast');
  assert.equal(state.players[0].mana, 1);
  assert.deepEqual(state.zones.stack, ['spell-0']);
  assert.deepEqual(state.objects.get('spell-0').chosenTargets, ['bear']);
  assert.equal(state.zones.hand.length, 0);
});

test('czar rozstrzyga się dopiero po rundzie passów i trafia do graveyard (LIFO)', () => {
  const state = stateWithSpell();
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['bear'] });
  // Czar jeszcze nie zadziałał; krok nie przechodzi dalej, bo stos nie jest pusty.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(state.objects.get('bear').damage, 0);
  assert.equal(state.zones.battlefield.length, 1);
  const round = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(round.ok, true);
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.zones.graveyard.length, 2); // czar + zabity stworek
  assert.equal(round.events.some((e) => e.type === 'spell_resolved'), true);
  assert.equal(round.events.some((e) => e.type === 'creature_destroyed'), true);
  // Priorytet po rozstrzygnięciu wraca do aktywnego gracza, krok się nie zmienił.
  assert.equal(state.turn.priorityPlayerId, state.turn.activePlayerId);
  assert.equal(state.turn.step, 'untap');
});

test('stos widoczny publicznie w PlayerView ze wszystkimi danymi czaru', () => {
  const state = stateWithSpell();
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['bear'] });
  const view = playerView(state, 'p2');
  assert.equal(view.zones.stack.length, 1);
  assert.deepEqual(view.zones.stack[0].targets, ['bear']);
  assert.equal(view.zones.stack[0].spell.effects[0].amount, 2);
  assert.equal(view.zones.stack[0].controllerId, 'p1');
});

test('nielegalne cele i warunki rzucania są odrzucane maszynowo', () => {
  const state = stateWithSpell();
  // Niecel: land.
  addObject(state, { id: 'land', instanceId: 'il', cardId: 'L', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  const landTarget = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['land'] });
  assert.match(landTarget.events[0].reason, /^illegal_spell:/);
  // Zła liczba celów.
  const noTarget = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: [] });
  assert.match(noTarget.events[0].reason, /^illegal_spell:/);
  // Brak many.
  const empty = stateWithSpell();
  empty.players[0].mana = 0;
  const broke = execute(empty, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['bear'] });
  assert.match(broke.events[0].reason, /^illegal_spell:/);
  assert.equal(empty.zones.stack.length, 0);
  assert.equal(empty.commands.length, 0);
});

test('instant można rzucić w oknie priorytetu przeciwnika, sorcery nie', () => {
  const state = stateWithSpell();
  // Okno przeciwnika: declare_blockers po deklaracji ataku p2.
  addObject(state, { id: 'atk', instanceId: 'ia', cardId: 'A', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });
  state.turn.phase = 'combat'; state.turn.step = 'declare_attackers'; state.turn.activePlayerId = 'p2'; state.turn.priorityPlayerId = 'p2';
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] });
  assert.equal(state.turn.priorityPlayerId, 'p1');
  const instant = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['bear'] });
  assert.equal(instant.ok, true);
  // Sorcery odrzuca okno combat nawet przy priorytecie.
  addObject(state, { id: 'ritual', instanceId: 'ir', cardId: 'Ritual', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 0, spell: { timing: 'sorcery', targets: [{ type: 'creature' }], effects: [{ type: 'pump', power: 1, toughness: 1 }] } });
  const sorcery = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ritual', targets: ['bear'] });
  assert.match(sorcery.events[0].reason, /^illegal_spell:/);
});

test('kolejne passy rozstrzygają kolejne czary i dopiero potem przechodzą krok', () => {
  const state = stateWithSpell();
  addObject(state, { id: 'shock2', instanceId: 'is2', cardId: 'Shock2', controllerId: 'p1', zone: 'hand', kind: 'spell', manaCost: 1, spell: SHOCK });
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['bear'] });
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock2', targets: ['bear'] });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  // Rozstrzygnięty pierwszy (LIFO — shock2): 2 obrażenia vs 2 wytrzymałości → SBA zabija.
  assert.equal(state.zones.stack.length, 1);
  assert.equal(state.zones.battlefield.includes('bear'), false);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const last = execute(state, { type: 'pass_priority', playerId: 'p2' });
  // Drugi czar nie ma już żywego celu — efekt nie zadziała (fizzle),
  // ale sam czar nadal się rozstrzyga i schodzi ze stosu.
  assert.equal(state.zones.stack.length, 0);
  const resolved = last.events.find((e) => e.type === 'spell_resolved');
  assert.equal(resolved.fizzled, true);
});
