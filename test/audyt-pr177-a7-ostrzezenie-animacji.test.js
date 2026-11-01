// Audyt PR #177 A7: nie mylić animacji z obsadzeniem i nie twierdzić,
// że aktywacja nic nie robi, gdy zawiera jeszcze odtapowanie celu.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { animatePermanentUntilEndOfTurn } from '../src/engine/permanents.js';
import { crewWizardPlanFor } from '../src/table/multi-target.js';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandLabel, activationAlreadyAppliedWarning } from '../src/table/render.js';

const registry = createCardRegistry();
const session = {
  nameOf: id => registry.get(id)?.name ?? id,
  nameOfObject: o => registry.get(o?.cardId)?.name ?? o?.id,
  cardDetails: id => registry.get(id) ?? null,
  abilitiesOf: id => registry.get(id)?.abilities ?? [],
};
function put(s, id, cardId) {
  const def = registry.get(cardId);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
}
function settle(s) {
  for (let i = 0; s.zones.stack.length && i < 12; i++) {
    assert.ok(execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId }).ok);
  }
  assert.equal(s.zones.stack.length, 0);
}

test('A7: Silvanus’s Invoker ponownie odtapowuje już animowany ląd — etykieta nie kłamie', () => {
  const s = createGameState({ seed: 177, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'invoker', 'silvanuss-invoker'); put(s, 'land', 'basic-forest');
  addMana(s, 'p1', 16, { colors: ['G'] });
  const ability = () => playerView(s, 'p1').legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'invoker' && c.targets?.includes('land'));
  assert.ok(execute(s, ability()).ok); settle(s);
  assert.ok(execute(s, { type: 'tap_for_mana', playerId: 'p1', objectId: 'land' }).ok);
  const view = playerView(s, 'p1');
  assert.equal(view.zones.battlefield.find(o => o.id === 'land').animatedUntilEOT, true);
  assert.equal(view.zones.battlefield.find(o => o.id === 'land').tapped, true);
  const cmd = ability(); assert.ok(cmd);
  assert.doesNotMatch(commandLabel(cmd, session, view), /ponowna aktywacja nic nie zmieni|już obsadzony|koszt \(tapnięcie\)/i);
  assert.ok(execute(s, cmd).ok); settle(s);
  assert.equal(s.objects.get('land').tapped, false, 'druga aktywacja rzeczywiście odtapowała ląd');
});

test('A7: nie uznawaj każdej animacji za crew: efekt może zmienić P/T i słowa kluczowe', () => {
  const view = { zones: { battlefield: [{ id: 'land', animatedUntilEOT: true }] } };
  const ability = { cost: { mana: 8 }, effect: { type: 'animate_permanent_until_end_of_turn', power: 8, toughness: 8, keywordsAdd: ['trample'] } };
  assert.equal(activationAlreadyAppliedWarning(ability, view, 'land'), '');
});
test('A7: crew z dodatkowym efektem nie jest w całości jałowe', () => {
  const view = { zones: { battlefield: [{ id: 'vehicle', animatedUntilEOT: true }] } };
  const ability = { cost: { crewPower: 1 }, effect: [{ type: 'animate_permanent_until_end_of_turn', typesAdd: ['Creature'] }, { type: 'draw_cards', amount: 1 }] };
  assert.equal(activationAlreadyAppliedWarning(ability, view, 'vehicle'), '');
});

test('A7: pojazd animowany innym efektem nie jest jeszcze obsadzony', () => {
  const view = { zones: { battlefield: [{ id: 'vehicle', animatedUntilEOT: true }] } };
  const ability = { cost: { crewPower: 1 }, effect: { type: 'animate_permanent_until_end_of_turn', typesAdd: ['Creature'] } };
  assert.equal(activationAlreadyAppliedWarning(ability, view, 'vehicle'), '');
});

test('A7: kreator crew nie twierdzi, że pojazd animowany innym efektem jest już obsadzony', () => {
  const s = createGameState({ seed: 177, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'vehicle', 'irontread-crusher'); put(s, 'crew', 'dread-warlock');
  s.objects.set('crew', Object.freeze({ ...s.objects.get('crew'), power: 3, summoningSickness: false }));
  animatePermanentUntilEndOfTurn(s, 'vehicle', { power: 5, toughness: 5, typesAdd: ['Creature'] });
  const cmd = playerView(s, 'p1').legalCommands.find(c => c.type === 'activate_ability' && c.objectId === 'vehicle');
  assert.ok(cmd, 'rzeczywista oferta crew istnieje');
  const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const from = source.indexOf('  function crewPlanFor(');
  const end = source.indexOf('\n  }', from);
  assert.ok(from >= 0 && end > from);
  const ctx = createContext({ session: { state: s, view: () => playerView(s, 'p1'), nameOf: session.nameOf },
    HUMAN_ID: 'p1', crewWizardPlanFor, activationAlreadyAppliedWarning, activatableAbilities: (_s, o) => o.abilities });
  runInContext(`${source.slice(from, end + 4)}\nthis.crewPlanFor = crewPlanFor;`, ctx);
  const plan = ctx.crewPlanFor(cmd);
  assert.ok(plan, 'kreator ma plan');
  assert.doesNotMatch(plan.intro, /już obsadzony|nic nie zmieni/i);
});
