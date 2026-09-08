import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// Polityka, nie zmiana CR: karta już jest dostępna w ręce; odłożenie jej
// nie jest dodatnim doborem. Wartość zależy od zasobów, nie od samego typu.
function setup(lands, expensive = false) {
  const state = createGameState({ seed: 106, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const putLand = (id, zone) => addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId: 'p1',
    zone, kind: 'land', manaCost: 0, types: ['Land'], colors: ['G'],
    abilities: [], keywords: [], subtypes: ['Forest'],
  });
  for (let i = 0; i < lands; i++) putLand(`land-${i}`, 'battlefield');
  putLand('spare', 'hand');
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: 'synthetic-draw', controllerId: 'p1',
    zone: 'hand', kind: 'spell', manaCost: expensive ? 9 : 1, types: ['Instant'],
    colors: [], abilities: [], keywords: [], subtypes: [],
    spell: { timing: 'instant', effects: [{ type: 'draw_cards', amount: 2 }] },
  });
  // Producent decyzji w silniku, potem legalna oferta i wykonanie komendy.
  applyEffect(state, { type: 'opponent_hand_card_to_top' },
    { id: 'source', cardId: 'synthetic-top', controllerId: 'p2' }, ['p1']);
  return state;
}

for (const reverse of [false, true]) {
  test(`B: zachowaj dostępny instant, odłóż nadmiarowy ląd (reverse=${reverse})`, () => {
    const state = setup(8);
    const view = playerView(state, 'p1');
    const commands = reverse ? [...view.legalCommands].reverse() : view.legalCommands;
    const chosen = createHeuristicBot({ seed: 9 }).chooseCommand({ ...view, legalCommands: commands });
    assert.equal(chosen.type, 'resolve_hand_top_choice');
    assert.equal(chosen.cardId, 'spare');
    assert.ok(execute(state, chosen).ok);
    assert.ok(state.zones.hand.includes('spell'), 'użyteczna karta pozostała dostępna');
    assert.equal(state.objects.get(state.zones.library[0]).cardId, 'basic-forest');
    assert.ok(playerView(state, 'p1').legalCommands.some(c => c.type === 'cast_spell' && c.objectId === 'spell'));
  });
}

test('B: nie wyrzucaj automatycznie lądu — przy niedoborze many zachowaj go', () => {
  const state = setup(2, true);
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.cardId, 'spell', '9-mana czar jest poza zasięgiem, trzeci ląd potrzebny');
  assert.ok(execute(state, chosen).ok);
  assert.ok(state.zones.hand.includes('spare'));
});
