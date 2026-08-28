// M110 — Willbender wg Oracle: „change the target of target spell OR ABILITY
// with a single target". Silnik ma dziś zdolności na stosie (aktywowane
// i triggerowane rozstrzygają się po rundzie passów), więc ograniczenie
// „tylko czary" przestało być prawdą o silniku — było prawdą o implementacji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 24, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

// Stwór z celowaną zdolnością aktywowaną („{T}: 2 obrażenia stworowi").
const PING = [Object.freeze({
  type: 'activated', timing: 'instant', keyword: null,
  cost: Object.freeze({ tap: true }),
  effect: Object.freeze({ type: 'damage', amount: 2 }),
  targets: Object.freeze([Object.freeze({ type: 'creature' })]),
  trigger: null, cycling: null, condition: null, pump: null,
  keywords: null, oncePerTurn: false, mustAttack: false,
})];

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: extra.toughness ?? 3, manaCost: 1,
    abilities: extra.abilities ?? [], keywords: [], subtypes: [], types: ['Creature'],
    colors: [], cardName: extra.cardName ?? 'Testowy stwór',
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

test('Willbender: kandydatem jest ZDOLNOŚĆ na stosie z jednym celem (CR 115.7)', () => {
  const state = newState();
  putBlank(state, 'ping', 'p2', { abilities: PING, cardId: 'x-ping' });
  putBlank(state, 'moj', 'p1', { cardId: 'x-moj' });
  putBlank(state, 'inny', 'p1', { cardId: 'x-inny' });
  state.turn.priorityPlayerId = 'p2';
  const act = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'ping' && (c.targets ?? []).includes('moj'));
  assert.ok(act, 'zdolność z celem jest oferowana');
  execute(state, act);
  assert.equal(state.zones.stack.length, 1, 'zdolność czeka na stosie');
  const entry = state.objects.get(state.zones.stack[0]);
  assert.ok(entry.activatedEntry, 'to wpis zdolności aktywowanej');
});

test('Willbender: przekierowuje cel ZDOLNOŚCI ze stosu (Oracle: „spell or ability")', () => {
  const state = newState();
  putBlank(state, 'ping', 'p2', { abilities: PING, cardId: 'x-ping' });
  putBlank(state, 'moj', 'p1', { cardId: 'x-moj' });
  putBlank(state, 'inny', 'p1', { cardId: 'x-inny' });
  // Willbender zakryty (morph) na polu bitwy p1 — obracamy go twarzą do góry
  // w oknie odpowiedzi na zdolność przeciwnika.
  addObject(state, {
    id: 'wb', instanceId: 'i-wb', cardId: 'willbender', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 0,
    abilities: REGISTRY.get('willbender').abilities, keywords: ['morph'],
    subtypes: [], types: ['Creature'], colors: [], cardName: 'Willbender',
    morph: REGISTRY.get('willbender').morph,
  });
  // Stan jak po zagraniu zakrytym (resources.castPermanent): zdolności karty
  // schowane w originalAbilities, na wierzchu tylko akcja „obróć za morph".
  state.objects.set('wb', Object.freeze({
    ...state.objects.get('wb'), faceDown: true, summoningSickness: false,
    originalAbilities: REGISTRY.get('willbender').abilities,
    abilities: [Object.freeze({
      type: 'activated', keyword: 'morph',
      cost: Object.freeze({ mana: 2, colors: ['U'] }),
      effect: Object.freeze({ type: 'turn_face_up' }), trigger: null,
    })],
  }));
  state.turn.priorityPlayerId = 'p2';
  const act = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'ping' && (c.targets ?? []).includes('moj'));
  execute(state, act);
  const stackId = state.zones.stack[0];

  // p1 obraca Willbendera twarzą do góry (akcja specjalna morph, koszt {1}{U}).
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 2, { colors: ['U'] });
  const p1 = playerView(state, 'p1');
  const turnUp = p1.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'wb');
  assert.ok(turnUp, `oferta obrócenia morpha: ${p1.legalCommands.map((c) => c.type).join(',')}`);
  execute(state, turnUp);

  // Trigger Willbendera wymaga celu — zdolność na stosie jest legalnym
  // kandydatem. M242/H: jest JEDYNYM kandydatem (jedyny wpis na stosie) → cel
  // wybiera się automatycznie, trigger idzie na stos bez pytania.
  const autoEvt = state.events.filter((e) => e.type === 'trigger_target_resolved' && e.cardId === 'willbender').at(-1);
  assert.ok(autoEvt && autoEvt.auto === true && autoEvt.targetId === stackId,
    'auto cel: zdolność na stosie (jedyny kandydat): ' + JSON.stringify(autoEvt));
  // Trigger rozstrzyga się i pyta o nowy cel.
  for (let i = 0; i < 6 && !state.pendingRedirectChoice; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
  const redirect = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_redirect_choice');
  assert.ok(redirect.some((c) => c.targetId === 'inny'), 'można przekierować na innego stwora');
  execute(state, redirect.find((c) => c.targetId === 'inny'));

  // Rozstrzygamy stos — obrażenia mają trafić w NOWY cel.
  for (let i = 0; i < 10 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
  assert.equal(state.objects.get('inny').damage, 2, 'obrażenia poszły w nowy cel');
  assert.equal(state.objects.get('moj').damage ?? 0, 0, 'pierwotny cel nietknięty');
});

test('Willbender: karta bez ograniczeń (pełne Oracle)', () => {
  assert.deepEqual(REGISTRY.get('willbender').support.limitations, []);
});
