// M110 — storm (CR 702.40) w pełnym brzmieniu Oracle.
// M109 dał uproszczenie: kopie lądowały na stosie od razu przy rzucie
// i zawsze z celem oryginału. Oracle mówi co innego:
//   „When you cast this spell, copy it for each spell cast before it this
//    turn. You may choose new targets for the copies.\"
// czyli (a) to ZDOLNOŚĆ TRIGGEROWANA — idzie na stos i można na nią
// odpowiedzieć, a liczba kopii liczy się przy JEJ rozstrzygnięciu,
// (b) kontroler może wskazać kopiom nowe cele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 702, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
  });
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    cardName: extra.cardName ?? 'Testowy stwór',
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function castStorm(state, targetId) {
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ins' && (c.targets ?? [])[0] === targetId);
  assert.ok(cast, 'rzut Spreading Insurrection z celem');
  return execute(state, cast);
}

/** Przewija stos: rozstrzygnięcia i decyzje, aż stos będzie pusty. */
function resolveAll(state, max = 30) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
}

test('Storm: przy rzucie na stos idzie CZAR i TRIGGER (okno odpowiedzi), nie kopie', () => {
  const state = newState();
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2');
  state.spellsCastThisTurn = 2;
  addMana(state, 'p1', 5, { colors: ['R'] });
  const result = castStorm(state, 'wrog');
  assert.equal(state.zones.stack.length, 2, 'czar + zdolność storma');
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'storm'),
    'storm odpala się jako zdolność triggerowana (CR 702.40a)');
  assert.equal(result.events.filter((e) => e.type === 'spell_copied').length, 0,
    'kopie powstają dopiero przy ROZSTRZYGNIĘCIU triggera');
});

test('Storm: liczba kopii = czary rzucone WCZEŚNIEJ w tej turze', () => {
  const state = newState();
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2');
  state.spellsCastThisTurn = 2;
  addMana(state, 'p1', 5, { colors: ['R'] });
  castStorm(state, 'wrog');
  // rozstrzygnięcie samego triggera: obaj gracze pasują
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const copies = state.zones.stack.filter((id) => state.objects.get(id)?.isSpellCopy);
  assert.equal(copies.length, 2, 'dwie kopie po dwóch wcześniejszych czarach');
  assert.ok(state.events.some((e) => e.type === 'spell_copied'));
});

test('Storm: kontroler może wskazać kopii NOWY cel (Oracle: „you may choose new targets")', () => {
  const state = newState();
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putBlank(state, 'wrog-a', 'p2', { cardId: 'x-a' });
  putBlank(state, 'wrog-b', 'p2', { cardId: 'x-b' });
  state.spellsCastThisTurn = 2; // jedna kopia... nie: dwie
  addMana(state, 'p1', 5, { colors: ['R'] });
  castStorm(state, 'wrog-a');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_copy_targets');
  assert.ok(offers.length >= 2, `kopia dostaje wybór celu: ${view.legalCommands.map((c) => c.type).join(',')}`);
  assert.ok(offers.some((c) => c.targetId === 'wrog-a'), 'można zostawić cel oryginału');
  assert.ok(offers.some((c) => c.targetId === 'wrog-b'), 'można wskazać nowy cel');
  execute(state, offers.find((c) => c.targetId === 'wrog-b'));
  resolveAll(state);
  assert.equal(state.objects.get('wrog-b').controllerId, 'p1', 'kopia z nowym celem zadziałała');
  assert.equal(state.objects.get('wrog-a').controllerId, 'p1', 'oryginał przejął swój cel');
});

test('Storm: bez wcześniejszych czarów trigger rozstrzyga się bez kopii', () => {
  const state = newState();
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2');
  addMana(state, 'p1', 5, { colors: ['R'] });
  castStorm(state, 'wrog');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.zones.stack.filter((id) => state.objects.get(id)?.isSpellCopy).length, 0);
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.storm && e.noEffect),
    'trigger mówi wprost, że nie było czego kopiować (M106/Z2)');
});

test('Spreading Insurrection: karta bez ograniczeń (pełne Oracle)', () => {
  assert.deepEqual(REGISTRY.get('spreading-insurrection').support.limitations, []);
});
