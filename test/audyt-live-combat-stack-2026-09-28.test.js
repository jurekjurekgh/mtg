import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { declareAttackers, declareBlockers } from '../src/engine/combat.js';

// F8: żywy przebieg 20260928, kroki 73–76 — Fleeting Distraction na stosie
// i deklaracja ataku PRZED jej rozstrzygnięciem. CR pobrany 2026-09-28:
// CR 508.1 / 509.1: „This turn-based action doesn't use the stack.”
// CR 117.2c: akcje turowe „are dealt with before a player would receive priority”.
// https://github.com/nwgarne/mtg-data/blob/main/rules/cr-raw.txt (2026-09-25).
const registry = createCardRegistry();
function put(s, id, cardId, playerId, zone = 'battlefield') {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (zone === 'battlefield') s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
}
function run(s, cmd) {
  assert.ok(cmd, 'oferta istnieje'); const r = execute(s, cmd);
  assert.equal(r.ok, true, JSON.stringify(r)); return r;
}
function setup(kind, ability = false) {
  const s = createGameState({ seed: 20260928, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const p of ['p1', 'p2']) for (let i = 0; i < 5; i++) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  put(s, 'attacker', 'highland-game', 'p1'); put(s, 'blocker', 'highland-game', 'p2');
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  const player = kind === 'attackers' ? 'p1' : 'p2';
  if (kind === 'blockers') {
    run(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['attacker'] });
    s.turn = jumpToStep(s.turn, 'declare_blockers', 'p2'); s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p2';
  }
  if (ability) {
    put(s, 'source', 'soulmender', player);
    run(s, playerView(s, player).legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'source'));
  } else {
    put(s, 'spell', 'fleeting-distraction', player, 'hand'); addMana(s, player, 1, { colors: ['U'] });
    run(s, playerView(s, player).legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && c.targets?.[0] === 'blocker'));
  }
  assert.equal(s.zones.stack.length, 1);
  return { s, player };
}
function declaration(kind, player, empty = false) {
  return kind === 'attackers'
    ? { type: 'declare_attackers', playerId: player, attackerIds: empty ? [] : ['attacker'] }
    : { type: 'declare_blockers', playerId: player, assignments: empty ? {} : { attacker: ['blocker'] } };
}

for (const kind of ['attackers', 'blockers']) {
  for (const ability of [false, true]) {
    test(`LIVE/F8: ${kind} — zajęty stos (${ability ? 'zdolność' : 'instant'}) blokuje ofertę i wykonanie`, () => {
      const { s, player } = setup(kind, ability);
      const type = declaration(kind, player).type;
      assert.equal(playerView(s, player).legalCommands.some((c) => c.type === type), false);
      for (const empty of [false, true]) {
        const before = structuredClone(s);
        assert.equal(execute(s, declaration(kind, player, empty)).ok, false);
        assert.deepEqual(s, before, 'odmowa przed tapnięciem, combat i eventami');
      }
      const before = structuredClone(s);
      assert.throws(() => kind === 'attackers'
        ? declareAttackers(s, player, ['attacker'])
        : declareBlockers(s, player, { attacker: ['blocker'] }), /stos/i);
      assert.deepEqual(s, before, 'również niskopoziomowy walidator odmawia atomowo');
    });
  }
  test(`LIVE/F8: ${kind} — poprawna deklaracja wraca po rozstrzygnięciu`, () => {
    const { s, player } = setup(kind);
    for (let i = 0; s.zones.stack.length && i < 20; i++) {
      run(s, playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority'));
    }
    assert.equal(s.zones.stack.length, 0);
    if (s.turn.priorityPlayerId !== player) run(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
    const cmd = declaration(kind, player);
    assert.ok(playerView(s, player).legalCommands.some((c) => c.type === cmd.type));
    run(s, cmd);
  });
}

test('LIVE/F8: odpowiedź po zadeklarowaniu ataku pozostaje legalna', () => {
  const { s } = setup('attackers');
  while (s.zones.stack.length) run(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  run(s, declaration('attackers', 'p1'));
  put(s, 'response', 'fleeting-distraction', 'p1', 'hand'); addMana(s, 'p1', 1, { colors: ['U'] });
  run(s, playerView(s, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'response' && c.targets?.[0] === 'blocker'));
  assert.equal(s.zones.stack.length, 1);
});
