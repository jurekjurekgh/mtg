// M111 — kopie czarów WIELOCELOWYCH (storm, CR 702.40a + 706.10c).
// M110 obsłużył wybór nowych celów tylko dla czarów o JEDNYM celu; przy
// wielu celach kopie milcząco zachowywały cele oryginału. To ograniczenie
// infrastruktury — Oracle mówi „you may choose new targets", bez wyjątku dla
// czarów wielocelowych. Test używa syntetycznego czaru z DWOMA celami, więc
// mechanika jest gotowa na przyszłe karty (dziś Spreading Insurrection ma
// jeden cel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

function newState() {
  const state = createGameState({ seed: 706, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 4;
  return state;
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 4, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Syntetyczny czar ze STORMEM i dwoma celami (po 1 obrażeniu każdemu). */
function putStormBolt(state) {
  addObject(state, {
    id: 'bolt', instanceId: 'i-bolt', cardId: 'x-storm-bolt', controllerId: 'p1', zone: 'hand',
    kind: 'spell', manaCost: 1, keywords: [], subtypes: [], types: ['Instant'], colors: ['R'],
    cardName: 'Testowy storm', spell: Object.freeze({
      timing: 'instant',
      storm: true,
      targets: Object.freeze([
        Object.freeze({ type: 'creature' }),
        Object.freeze({ type: 'creature' }),
      ]),
      effects: Object.freeze([
        Object.freeze({ type: 'damage', amount: 1, targetIndex: 0 }),
        Object.freeze({ type: 'damage', amount: 1, targetIndex: 1 }),
      ]),
    }),
  });
}

test('Storm: kopia czaru DWUCELOWEGO pyta o cel dla KAŻDEGO slotu', () => {
  const state = newState();
  putStormBolt(state);
  putBlank(state, 'a', 'p2');
  putBlank(state, 'b', 'p2');
  putBlank(state, 'c', 'p2');
  state.spellsCastThisTurn = 1; // jeden wcześniejszy czar → jedna kopia
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'bolt'
      && (c.targets ?? [])[0] === 'a' && (c.targets ?? [])[1] === 'b');
  assert.ok(cast, 'rzut z parą celów');
  execute(state, cast);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });

  // Slot 0 kopii: domyślnie cel oryginału („a"), ale można wskazać „c".
  let offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_copy_targets');
  assert.ok(offers.length > 0, 'kopia wielocelowa pyta o cele');
  assert.equal(offers[0].targetIndex, 0, 'najpierw slot 0');
  assert.equal(offers[0].targetId, 'a', 'pierwsza oferta = cel oryginału (a więc „may")');
  execute(state, offers.find((c) => c.targetId === 'c'));

  // Slot 1 kopii.
  offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_copy_targets');
  assert.ok(offers.length > 0, 'drugi slot też ma decyzję');
  assert.equal(offers[0].targetIndex, 1);
  execute(state, offers.find((c) => c.targetId === 'c'));

  // Rozstrzygamy stos: kopia trafia dwa razy w „c", oryginał w „a" i „b".
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
  assert.equal(state.objects.get('c').damage, 2, 'kopia zadała oba obrażenia nowemu celowi');
  assert.equal(state.objects.get('a').damage, 1, 'oryginał trafił w swój cel');
  assert.equal(state.objects.get('b').damage, 1);
});
