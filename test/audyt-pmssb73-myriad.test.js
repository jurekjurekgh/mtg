// PMSSB-73 (2026-10-20) — myriad (Gnoll War Band, CR 702.116) w 1v1.
// Dowód zamknięcia bez zmiany kodu: w 1v1 trigger myriad nie ma żadnego efektu
// (warunek `anotherOpponentExists` = players.length > 2, ADR 0022), więc bot nie
// zmienia decyzji i silnik nie tworzy tokenów. Warunek jest fałszywy, więc trigger nie trafia
// nawet na stos; treść triggera chroni dopiero pin 3 (mutacja efektu łapie tylko on — to
// mutant równoważny w 1v1). Piny chronią ten stan przed cichą zmianą.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

/** Gnoll War Band na polu gracza p1 w deklaracji ataków; `withMyriad=false` zdejmuje słowo kluczowe i trigger. */
function gnollGame(withMyriad = true) {
  const state = createGameState({ seed: 69, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  const data = gameObjectDataOf(registry.get('gnoll-war-band'));
  const extra = withMyriad ? {} : {
    keywords: (data.keywords ?? []).filter((k) => k !== 'myriad'),
    abilities: (data.abilities ?? []).filter((a) => a?.trigger?.event !== 'attacks'),
  };
  addObject(state, { id: 'g', instanceId: 'i-g', cardId: 'gnoll-war-band', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...data, ...extra });
  state.objects.set('g', Object.freeze({ ...state.objects.get('g'), summoningSickness: false }));
  return state;
}

test('PMSSB-73: myriad w 1v1 nie zmienia wyceny ataku bota (ten sam wynik z i bez triggera)', () => {
  const score = (withMyriad) => {
    const bot = createHeuristicBot({ seed: 7 });
    bot.chooseCommand(playerView(gnollGame(withMyriad), 'p1'), {});
    const o = (bot.trace().at(-1)?.options ?? []).find((x) => x?.cmd === 'attack[g]');
    assert.ok(o, 'opcja ataku Gnolla jest w ocenach');
    return o.score;
  };
  assert.equal(score(true), score(false));
});

test('PMSSB-73: atak Gnolla w 1v1 nie tworzy tokenów i nie zostawia triggera na stosie', () => {
  const state = gnollGame(true);
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(cmd.type, 'declare_attackers');
  const before = state.objects.size;
  execute(state, cmd);
  assert.equal(state.objects.size, before, 'brak nowych obiektów (tokenów) w 1v1');
  assert.equal(state.pendingSpellReturnToHand?.length ?? 0, 0);
  assert.equal(state.players.find((x) => x.id === 'p2').life, 20, 'trigger nie zmienia życia wroga w 1v1');
});

test('PMSSB-73: karta niesie myriad jako słowo kluczowe i trigger z warunkiem wieloosobowym', () => {
  const def = registry.get('gnoll-war-band');
  assert.ok(def.keywords.includes('myriad'));
  const trig = def.abilities.find((a) => a?.trigger?.event === 'attacks');
  assert.deepEqual(trig?.trigger?.condition, { anotherOpponentExists: true });
  assert.deepEqual(trig?.effect, []);
});
