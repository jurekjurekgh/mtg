// PMSSB-28 — `resolve_color_choice` czyta CEL wyboru z pending.
//
// Silnik niesie cel w pending: `game-state.js:5762` ustawia purpose:'mana'
// dla lądu z chooseColor (Manor Gate), `spells.js:2655` purpose:'protection'
// dla aury. Wycena tego nie czytała i liczyła jedną płaską sumę
// `5 + needScore*6 + enemyInColor` dla obu.
//
// Pomiar PRZED (sonda scratch/pmssb28-color-przed.mjs): przy ręce wymagającej
// {B} i TRZECH czerwonych stworach wroga oba cele dawały IDENTYCZNE wyniki
// (U=11, B=11, R=8, W=5, G=5) i bot wybierał {U} — kolor, w którym przeciwnik
// nie ma ani jednego stwora. Aura ochrony przed {U} nie chroni przed niczym.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, zone = 'hand', extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId,
    controllerId: extra.owner ?? 'p2', ownerId: extra.owner ?? 'p2', zone,
    kind: data.kind, power: extra.power ?? data.power, toughness: extra.toughness ?? data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: extra.colors ?? data.colors ?? [],
  });
  return id;
}

/**
 * Scenariusz, w którym oba motywy są PRZECIWSTAWNE:
 *  - p2 ma 3 lasy (źródła {G}) i w ręce Delta Bloodflies {1}{B} — potrzebuje {B};
 *  - p1 ma trzy CZERWONE stwory — dla ochrony liczy się {R}.
 */
function base(purpose) {
  const state = createGameState({ seed: 28, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  for (let i = 0; i < 3; i += 1) putCard(state, `b${i}`, 'basic-forest', 'battlefield');
  putCard(state, 'h0', 'delta-bloodflies', 'hand');
  for (let i = 0; i < 3; i += 1) {
    putCard(state, `e${i}`, 'soulmender', 'battlefield', { owner: 'p1', colors: ['R'], power: 2, toughness: 2 });
  }
  state.pendingColorChoice = { playerId: 'p2', purpose, sourceCardId: 'manor-gate' };
  return state;
}

function scoreOf(state, etykieta, params = undefined) {
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const options = bot.trace().at(-1)?.options ?? [];
  const found = options.find((o) => o.cmd === etykieta);
  assert.ok(found, `brak opcji ${etykieta} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

const wybrany = (state) => {
  const bot = createHeuristicBot({ seed: 99 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'), {});
  return chosen?.color;
};

test('PMSSB-28/A1: purpose=protection wybiera kolor wrogich stworów, nie potrzebę many', () => {
  // PRZED: {U} = 11 (pierwszy z remisu), choć wróg nie ma ani jednego stwora {U}.
  // PO: {R} = 5 + 3 × colorProtectionPerCreature(6) = 23; reszta po 5.
  const state = base('protection');
  assert.equal(scoreOf(state, 'resolve_color_choice(R)'), 23);
  assert.equal(scoreOf(state, 'resolve_color_choice(U)'), 5);
  assert.equal(scoreOf(state, 'resolve_color_choice(B)'), 5);
  assert.equal(wybrany(state), 'R', 'ochrona przed kolorem, którego wróg nie ma, nie chroni przed niczym');
});

test('PMSSB-28/A2: purpose=mana wybiera kolor potrzebny w ręce, ignoruje wrogie stwory', () => {
  // Ręka wymaga {B} (Delta Bloodflies {1}{B}), a źródła p2 to same {G}.
  // PO: {B} = 5 + 1 × colorManaNeedPerCard(6) = 11; trzy czerwone stwory wroga
  // nie mają tu nic do rzeczy — PRZED dodawały {R} +3 i mieszały motyw.
  const state = base('mana');
  assert.equal(scoreOf(state, 'resolve_color_choice(B)'), 11);
  assert.equal(scoreOf(state, 'resolve_color_choice(R)'), 5);
  assert.equal(wybrany(state), 'B');
});

test('PMSSB-28/A3: oba cele są ROZDZIELNE — ten sam stan, różne wybory', () => {
  // To jest sedno znaleziska: PRZED obie gałęzie dawały identyczne wyniki
  // (U=11, B=11, R=8, W=5, G=5), więc `purpose` był martwym polem.
  const ochrona = base('protection');
  const mana = base('mana');
  assert.equal(wybrany(ochrona), 'R');
  assert.equal(wybrany(mana), 'B');
  assert.notEqual(wybrany(ochrona), wybrany(mana), 'cel wyboru musi zmieniać decyzję');
});

test('PMSSB-28/A4: przy ochronie wygrywa kolor z WIĘKSZĄ liczbą wrogich stworów', () => {
  const state = base('protection');
  // Domieszka jednego niebieskiego stwora: {R} (3) wciąż przed {U} (1).
  putCard(state, 'e9', 'soulmender', 'battlefield', { owner: 'p1', colors: ['U'], power: 2, toughness: 2 });
  assert.equal(scoreOf(state, 'resolve_color_choice(R)'), 23);
  assert.equal(scoreOf(state, 'resolve_color_choice(U)'), 11);
  assert.equal(wybrany(state), 'R');
});

test('PMSSB-28/B1 (anty-over-fix): nieznany cel zostaje przy dawnej sumie', () => {
  // Bez `purpose` (albo z celem, którego nie zmierzyliśmy) wycena ma być
  // dokładnie taka jak PRZED: 5 + needScore*6 + enemyInColor.
  const state = base(undefined);
  assert.equal(scoreOf(state, 'resolve_color_choice(B)'), 11, '5 + 1*6 + 0');
  assert.equal(scoreOf(state, 'resolve_color_choice(R)'), 8, '5 + 0*6 + 3');
  assert.equal(scoreOf(state, 'resolve_color_choice(U)'), 5);
});

test('PMSSB-28/B2: wagi są pokrętłami, nie stałymi w kodzie', () => {
  const state = base('protection');
  assert.equal(scoreOf(state, 'resolve_color_choice(R)'), 23);
  assert.equal(scoreOf(state, 'resolve_color_choice(R)', { colorProtectionPerCreature: 1 }), 8);
  const mana = base('mana');
  assert.equal(scoreOf(mana, 'resolve_color_choice(B)', { colorManaNeedPerCard: 2 }), 7);
});

test('PMSSB-28/B3: ochrona przy pustym stole wroga nie wymyśla koloru', () => {
  // Brak wrogich stworów ⇒ wszystkie kolory remisują po 5 (bot bierze pierwszy).
  // Uczciwy remis, nie przechył z potrzeby many — PRZED wygrywało {B} (11).
  const state = createGameState({ seed: 28, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  putCard(state, 'b0', 'basic-forest', 'battlefield');
  putCard(state, 'h0', 'delta-bloodflies', 'hand');
  state.pendingColorChoice = { playerId: 'p2', purpose: 'protection', sourceCardId: 'manor-gate' };
  for (const kolor of ['W', 'U', 'B', 'R', 'G']) {
    assert.equal(scoreOf(state, `resolve_color_choice(${kolor})`), 5);
  }
});
