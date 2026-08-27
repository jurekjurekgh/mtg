// M239/1 — audyt PR #83, znalezisko Z2: fix M221/E był za szeroki dla
// trample. `attackerNeutralizedByProtection` traktowało KAŻDEGO atakującego
// wobec nietapniętego blokera z ochroną od jego koloru jako w pełni
// zneutralizowanego (atak jałowy → −2). Ale z Trample blok z protekcją NIE
// zatrzymuje nadmiaru obrażeń: podział obrażeń wymaga tylko lethal na
// blokerach, a test lethal IGNORUJE prewencję (CR 702.19b); prewencja
// protekcji kasuje jedynie obrażenia w samego blokera, nie w gracza
// (CR 702.16c — gracz protekcji nie ma). Czyli 7/7 trample trafiony blokiem
// 1/1 pro-black zadaje obrońcy 6.
//
// Silnik dowiedziony poprawny (sonda: życie obrońcy 20→14). Dziura była
// wyłącznie w wycenie bota — bot nie atakował tramplerem.
//
// Reguła po deskryptorach PlayerView (keywords/power/toughness/protection),
// bez nazw kart (ADR 0002/0017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function setup({ power, toughness, keywords = [], blockerToughness = 1, protColor = 'B' }) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  addObject(state, {
    id: 'big', instanceId: 'i-big', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power, toughness, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['B'], keywords,
  });
  state.objects.set('big', Object.freeze({ ...state.objects.get('big'), summoningSickness: false }));
  addObject(state, {
    id: 'tok', instanceId: 'i-tok', cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: blockerToughness, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['W'],
  });
  if (protColor) {
    addObject(state, {
      id: 'bb', instanceId: 'i-bb', cardId: 'benevolent-blessing', controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'enchantment', types: ['Enchantment', 'Aura'],
      aura: { enchant: 'creature', protection: { colors: [protColor] } },
    });
    attachAuraToCreature(state, 'bb', 'tok');
  }
  return state;
}

function attackScores(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority' || o.cmd === 'attack[]')?.score ?? 0;
  const attackBig = trace.options.find((o) => o.cmd === 'attack[big]')?.score ?? null;
  return { pass, attackBig };
}

test('M239/1: trample bije PRZEZ blok z protekcją — bot atakuje 7/7 w 1/1 pro-black', () => {
  const { pass, attackBig } = attackScores(setup({ power: 7, toughness: 7, keywords: ['trample'] }));
  assert.ok(attackBig != null, 'wariant ataku big musi istnieć');
  assert.ok(attackBig > pass, `CR 702.19b: trample 7/7 przez bloka 1/1 pro-black = 6 w gracza (${attackBig} > ${pass})`);
});

test('M239/1: ochrona przed NADMIAREM — mały trampler (2/2) w dużego bloka pro (2/5) pozostaje jałowy', () => {
  const { pass, attackBig } = attackScores(setup({ power: 2, toughness: 2, keywords: ['trample'], blockerToughness: 5 }));
  assert.ok(attackBig != null, 'wariant ataku big musi istnieć');
  assert.ok(attackBig < pass, `bez nadmiaru trample nic nie przebija: ${attackBig} < ${pass}`);
});

test('M239/1: trample + deathtouch — lethal to 1, nadmiar przechodzi przy mocy ≥2', () => {
  const { pass, attackBig } = attackScores(setup({ power: 3, toughness: 3, keywords: ['trample', 'deathtouch'] }));
  assert.ok(attackBig != null, 'wariant ataku big musi istnieć');
  assert.ok(attackBig > pass, `trample+DT 3/3 przez 1/1 pro-black = 2 w gracza (${attackBig} > ${pass})`);
});

test('M239/1: bez trample atak w protekcję koloru nadal jałowy (strażnik M221/E)', () => {
  const { pass, attackBig } = attackScores(setup({ power: 7, toughness: 7 }));
  assert.ok(attackBig < pass, `bez trample 7/7 w pro-black 1/1: ${attackBig} < ${pass}`);
});
