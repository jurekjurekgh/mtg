import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { blockerDeclarationViolation } from '../src/engine/combat.js';
import { attackerCanBeBlocked } from '../src/controllers/heuristic-bot.js';
import { jumpToStep } from '../src/engine/turn.js';

function scene(keywords, groups) {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  for (const [id, p, kw, abilities] of [
    ['att', 'p2', keywords, []],
    ['block', 'p1', ['flying'], groups.map(group => ({ type: 'static', canBlockOnlyKeywords: group }))],
  ]) {
    addObject(s, { id, instanceId: `i-${id}`, cardId: `s-${id}`, controllerId: p, ownerId: p,
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, types: ['Creature'], subtypes: [], colors: [], keywords: kw, abilities });
    s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  }
  assert.equal(execute(s, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['att'] }).ok, true);
  for (let i = 0; i < 12 && s.turn.step !== 'declare_blockers'; i++) {
    const pass = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(pass); assert.equal(execute(s, pass).ok, true);
  }
  assert.equal(s.turn.step, 'declare_blockers');
  return s;
}
const groups = [['flying', 'reach'], ['trample', 'lifelink']];
for (const [keywords, allowed] of [
  [['flying'], false], [['trample'], false], [['flying', 'trample'], true],
  [['flying', 'lifelink'], true], [['flying', 'reach'], false],
]) {
  const name = `${keywords.join('+')}: ${allowed ? 'legalny' : 'zakazany'} blok`;
  test(`Widok i bot: ${name}`, () => {
    const view = playerView(scene(keywords, groups), 'p1');
    const attacker = view.zones.battlefield.find(o => o.id === 'att');
    const blocker = view.zones.battlefield.find(o => o.id === 'block');
    assert.deepEqual(blocker.canBlockOnlyKeywordGroups, groups, 'widok zachowuje koniunkcję alternatyw');
    assert.equal(attackerCanBeBlocked(attacker, [blocker]), allowed, 'bot stosuje każdą grupę');
  });
  test(`Oferta: ${name}`, () => {
    const view = playerView(scene(keywords, groups), 'p1');
    assert.equal(view.legalCommands.some(c => c.type === 'declare_blockers' && (c.assignments.att ?? []).includes('block')), allowed);
  });
  test(`Walidacja i wykonanie: ${name}`, () => {
    const s = scene(keywords, groups);
    assert.equal(blockerDeclarationViolation(s, 'p1', { att: ['block'] }) === null, allowed);
    assert.equal(execute(s, { type: 'declare_blockers', playerId: 'p1', assignments: { att: ['block'] } }).ok, allowed);
  });
}
