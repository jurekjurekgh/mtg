// M237/2 — audyt Żywym Testerem (2026-08-27, skan strukturalny): bot kontrował
// TRYWIALNE czary 1-many (Twiddle — samotny tap, Dream Twist — self-mill) tak
// samo chętnie jak Fireball czy removal — marnował kontrę, którą mógłby
// zatrzymać realne zagrożenie.
//
// Oś 1 audytu. Root cause: wycena counter_spell premiowała KAŻDY wrogi czar
// bazą (50), bez oglądania CO kontruje. Fix: kontra niskiego-wpływu czaru
// (brak groźnych efektów wg deskryptora, TMC < 3) schodzi poniżej passu —
// trzymaj kontrę. Deskryptor z widoku stosu (spell.effects/modes), zero nazw
// kart (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function counterChoice(targetCard) {
  const state = createGameState({ seed: 237, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1'); // tura przeciwnika
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 6);
  put(state, 'neg', 'negate', 'p2', 'hand');
  put(state, 'spell', targetCard, 'p1', 'stack');
  return createHeuristicBot({ seed: 237 }).chooseCommand(playerView(state, 'p2'), {});
}

test('M237/2: bot NIE kontruje trywialnego 1-many czaru (Twiddle — samotny tap)', () => {
  const c = counterChoice('twiddle');
  assert.notEqual(c.type === 'cast_spell' && c.objectId === 'neg' ? 'counter' : 'inne', 'counter',
    `Negate na Twiddle to zmarnowana kontra — trzymaj: ${JSON.stringify(c)}`);
});

test('M237/2: bot NIE kontruje self-milla przeciwnika (Dream Twist)', () => {
  const c = counterChoice('dream-twist');
  assert.notEqual(c.type === 'cast_spell' && c.objectId === 'neg' ? 'counter' : 'inne', 'counter',
    `Negate na Dream Twist (self-mill) to zmarnowana kontra: ${JSON.stringify(c)}`);
});

test('M237/2: bot KONTRUJE groźny czar spalający (Fireball)', () => {
  const c = counterChoice('fireball');
  assert.ok(c.type === 'cast_spell' && c.objectId === 'neg',
    `Fireball to realne zagrożenie — kontruj: ${JSON.stringify(c)}`);
});

test('M237/2: bot KONTRUJE duży czar przewagi kartowej (Feed the Infection, draw 3)', () => {
  const c = counterChoice('feed-the-infection');
  assert.ok(c.type === 'cast_spell' && c.objectId === 'neg',
    `Feed the Infection (draw 3) warte kontry: ${JSON.stringify(c)}`);
});
