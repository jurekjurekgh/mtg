// M221/E — zgłoszenie właściciela z realnej gry: bot ma 7/7 czarnego stwora,
// blokowanego co turę przez mój token 1/1 z protection from black. Mimo to bot
// atakuje nim co turę (0 obrażeń, tylko się tapie) oraz buffuje/equippuje tego
// stwora — jałowo, bo obrażenia i tak nie przejdą (CR 702.16c).
//
// Mądry bot widząc blokera z ochroną od koloru atakującego: nie atakuje nim
// i nie inwestuje w jego siłę ofensywną, dopóki protekcja żyje.
//
// Reguła po deskryptorach z PlayerView (kolory atakującego + qualities ochrony
// blokera), bez nazw kart (ADR 0002/0017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function setup(protColor) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  addObject(state, {
    id: 'big', instanceId: 'i-big', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 7, toughness: 7, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['B'],
  });
  state.objects.set('big', Object.freeze({ ...state.objects.get('big'), summoningSickness: false }));
  addObject(state, {
    id: 'tok', instanceId: 'i-tok', cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, abilities: [], subtypes: [],
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

test('M221/E: bot NIE atakuje w blokera z protekcją od koloru atakującego', () => {
  const { pass, attackBig } = attackScores(setup('B'));
  assert.ok(attackBig != null, 'wariant ataku big musi istnieć');
  assert.ok(attackBig < pass, `atak w protekcję koloru < brak ataku (${pass}), było ${attackBig}`);
});

test('M221/E: bot NADAL atakuje, gdy bloker ma protekcję od INNEGO koloru', () => {
  const { pass, attackBig } = attackScores(setup('R'));
  assert.ok(attackBig > pass, `protekcja od innego koloru nie blokuje ataku: ${attackBig} vs ${pass}`);
});

test('M221/E: bot atakuje normalnie, gdy bloker nie ma protekcji', () => {
  const { pass, attackBig } = attackScores(setup(null));
  assert.ok(attackBig > pass, `bez protekcji bot atakuje 7/7 w 1/1: ${attackBig} vs ${pass}`);
});
