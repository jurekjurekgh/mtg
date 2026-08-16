// M103/A2 — wzorzec „oferta bez skutku" (L15, analog U9): nadanie keywordów
// „do końca tury" celowi, który JUŻ je wszystkie ma, jest no-opem — engine
// deduplikuje granty (keywordGrants jako Set), więc stan po aktywacji jest
// identyczny, a gracz płaci koszt za nic (Bladed Sentinel klikał się tak
// 3× w jednej turze, azorius vs black, seed 42, profil random).
//
// Naprawa (root cause, wzorzec U9): legalActivatedAbilities chowa oferty
// no-opów; execute nadal przyjmuje komendę (legalna wg CR 602.2b).
// Testy RED→GREEN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { grantKeywordsUntilEndOfTurn } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function newState({ turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    equipment: def.equipment, morph: def.morph, aura: def.aura, bestow: def.bestow,
    summoningSickness: false,
  });
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], summoningSickness: false, ...extra,
  });
  return state.objects.get(id);
}

function offersOf(state, objectId) {
  return playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === objectId);
}

test('A2: Bladed Sentinel BEZ czujności oferuje aktywację {W}', () => {
  const state = newState();
  addRealCard(state, 'sentinel', 'bladed-sentinel', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['W'] });
  assert.equal(offersOf(state, 'sentinel').length, 1, 'oferta zdobycia czujności istnieje');
});

test('A2: Bladed Sentinel z już nadaną czujnością NIE oferuje no-opu (RED)', () => {
  const state = newState();
  addRealCard(state, 'sentinel', 'bladed-sentinel', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['W'] });
  grantKeywordsUntilEndOfTurn(state, 'sentinel', ['vigilance']);
  assert.equal(offersOf(state, 'sentinel').length, 0, 're-nadanie czujności nic nie zmienia — oferta chowana');
});

test('A2: anty-over-fix — inny keyword nie gasi oferty (latanie ≠ czujność)', () => {
  const state = newState();
  addRealCard(state, 'sentinel', 'bladed-sentinel', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['W'] });
  grantKeywordsUntilEndOfTurn(state, 'sentinel', ['flying']);
  assert.equal(offersOf(state, 'sentinel').length, 1, 'czujności nadal można nadać');
});

test('A2: Death-Hood Cobra — jedna z dwóch zdolności gaśnie po nadaniu keyworda, druga zostaje', () => {
  const state = newState();
  addRealCard(state, 'cobra', 'death-hood-cobra', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['G'] });
  assert.equal(offersOf(state, 'cobra').length, 2, 'reach i deathtouch — dwie oferty');
  grantKeywordsUntilEndOfTurn(state, 'cobra', ['reach']);
  const left = offersOf(state, 'cobra');
  assert.equal(left.length, 1, 'tylko deathtouch zostaje');
  // legalCommands niesie abilityIndex, NIE obiekt ability (M102) — deskryptor
  // bierzemy wprost ze stanu.
  const ability = state.objects.get('cobra').abilities[left[0].abilityIndex];
  assert.ok(ability.effect.keywords.includes('deathtouch'));
});

test('A2: Stirring Bard — cel z haste+menace nie jest oferowany, cel bez keywordów tak', () => {
  const state = newState();
  addRealCard(state, 'bard', 'stirring-bard', 'p1', 'battlefield');
  addCreature(state, 'fast', 'p1', 1, 1);
  addCreature(state, 'plain', 'p1', 1, 1);
  grantKeywordsUntilEndOfTurn(state, 'fast', ['haste', 'menace']);
  const offered = offersOf(state, 'bard');
  assert.ok(offered.some((c) => c.targets?.[0] === 'plain'), 'cel bez keywordów oferowany');
  assert.ok(!offered.some((c) => c.targets?.[0] === 'fast'), 'cel z haste+menace — wariant no-opu chowany');
});

test('A2: anty-over-fix — Soulbright Flamekin z onNthResolve zostaje oferowany mimo trample', () => {
  // „If this is the third time this ability has resolved this turn, add
  // {R}{R}{R}{R}{R}{R}{R}{R}" — dołożony skutek (onNthResolve) sprawia,
  // że re-aktywacja NIE jest no-opem, choć cel już ma trample.
  const state = newState();
  addRealCard(state, 'flamekin', 'soulbright-flamekin', 'p1', 'battlefield');
  addCreature(state, 'target', 'p1', 2, 2);
  addMana(state, 'p1', 6, { colors: ['R'] });
  grantKeywordsUntilEndOfTurn(state, 'target', ['trample']);
  const offered = offersOf(state, 'flamekin');
  assert.ok(offered.some((c) => c.targets?.[0] === 'target'), 'trzecie rozstrzygnięcie daje {R}×8 — oferta musi zostać');
});

test('A2: execute nadal przyjmuje no-opową aktywację (legalna wg CR — spójność jak U9)', () => {
  const state = newState();
  addRealCard(state, 'sentinel', 'bladed-sentinel', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['W'] });
  grantKeywordsUntilEndOfTurn(state, 'sentinel', ['vigilance']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'sentinel', abilityIndex: 0 });
  assert.ok(r.ok, `aktywacja no-opu jest legalna wg CR: ${r.events?.[0]?.reason ?? ''}`);
});
