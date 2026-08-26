// M221/A — zgłoszenie właściciela z realnej gry: bot wystawiał Panic Spellbomb
// i w tej samej głównej fazie (bez ani jednego atakującego) poświęcał go,
// nadając mojemu stworowi „nie może blokować do końca tury". Zdolność jest
// combat trickiem OFENSYWNYM: ma sens tylko, gdy bot realnie atakuje w tej
// turze, a cel mógłby zablokować któregoś z jego atakujących (CR 509.1b).
//
// Oś 1 audytu (bezsensowne działania bota). Reguła generyczna po TYPIE efektu
// `cant_block` i STANIE walki z PlayerView (ADR 0002/0017), bez nazw kart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function baseState(step, active = 'p1') {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  addMana(state, 'p1', 10);
  return state;
}

function addSpellbomb(state) {
  const ps = gameObjectDataOf(REGISTRY.get('panic-spellbomb'));
  addObject(state, {
    id: 'ps', instanceId: 'i-ps', cardId: 'panic-spellbomb', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: ps.kind, abilities: ps.abilities ?? [], types: ps.types ?? ['Artifact'],
  });
}

function addCreature(state, id, controllerId, { power = 2, toughness = 2, tapped = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'goblin-piker', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['R'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped }));
  return state.objects.get(id);
}

const isPanic = (c) => c.type === 'activate_ability' && c.objectId === 'ps';

function scoreFor(state, predicate) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const hits = trace.options.filter((o) => predicate(o.cmd)).map((o) => o.score);
  return { pass, hits, view };
}

test('M221/A: bot NIE poświęca Panic Spellbomb bez własnego ataku (main1)', () => {
  const state = baseState('main1', 'p1');
  addSpellbomb(state);
  addCreature(state, 'foe', 'p2'); // wrogi bloker, ale bot nie atakuje
  const { pass, hits } = scoreFor(state, (cmd) => cmd.startsWith('activate_ability(ps'));
  assert.ok(hits.length > 0, 'zdolność Panic Spellbomb musi być w ofercie (koszt opłacalny)');
  for (const s of hits) {
    assert.ok(s < pass, `bez ataku cant_block musi być poniżej passu (${pass}), było ${s}`);
  }
});

test('M221/A: bot UŻYWA Panic Spellbomb, gdy atakuje, a cel może zablokować atakującego', () => {
  const state = baseState('declare_blockers', 'p1');
  addSpellbomb(state);
  const attacker = addCreature(state, 'atk', 'p1', { power: 3, toughness: 3 });
  const blocker = addCreature(state, 'foe', 'p2', { power: 2, toughness: 2 });
  state.combat = {
    attackers: [attacker.id],
    attackingPlayerId: 'p1',
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  const view = playerView(state, 'p1');
  const panicOnBlocker = view.legalCommands.find((c) => isPanic(c) && c.targets?.[0] === blocker.id);
  assert.ok(panicOnBlocker, 'oferta Panic Spellbomb na wrogiego blokera musi istnieć');
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const onBlocker = trace.options.find((o) => o.cmd.includes(`->${blocker.id}`) && o.cmd.startsWith('activate_ability(ps'));
  assert.ok(onBlocker, 'wariant na blokera obecny w ocenie');
  assert.ok(onBlocker.score > pass, `atakując, cant_block na realnego blokera > pass (${pass}), było ${onBlocker.score}`);
});
