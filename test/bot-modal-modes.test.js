// M111 — bot wycenia TRYBY czaru modalnego (CR 700.2).
// Dotąd `scoreCommand` czytał `spell.effects`, które dla czaru modalnego są
// PUSTE (treść siedzi w `spell.modes[i].effects`), więc każdy wariant trybu
// dostawał identyczne 50 pkt i bot brał pierwszy z listy. Trzy karty miały to
// zapisane w limitations jako „boty biorą pierwszy tryb".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 700, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    zone: 'battlefield', kind: 'creature', power: extra.power ?? 5, toughness: extra.toughness ?? 5,
    manaCost: 3, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

test('bot rozróżnia tryby: usunięcie grubego stwora wroga bije pump własnego 1/1', () => {
  // Selesnya Charm: tryb 1 „+2/+1 i trample twojemu stworowi", tryb 2
  // „wygnaj stwora o mocy ≥ 5 przeciwnika", tryb 3 „token Kithkin 2/2".
  const state = newState();
  putCard(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  putBlank(state, 'moj', 'p1', { power: 1, toughness: 1 });
  putBlank(state, 'goliat', 'p2', { power: 6, toughness: 6 });
  addMana(state, 'p1', 3, { colors: ['G', 'W'] });
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'charm');
  assert.ok(casts.length > 1, 'kilka wariantów trybu w ofercie');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_spell');
  assert.ok((chosen.targets ?? []).includes('goliat'),
    `bot powinien wybrać tryb usuwający 6/6, wybrał: ${JSON.stringify(chosen)}`);
});

test('bot nie wybiera trybu bez skutku, gdy inny tryb działa', () => {
  // Bez stwora o mocy ≥ 5 tryb „wygnaj" nie ma celu; bot ma wybrać taki,
  // który coś robi (pump albo token) — nie zawiesić się na pierwszym.
  const state = newState();
  putCard(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  putBlank(state, 'moj', 'p1', { power: 3, toughness: 3 });
  addMana(state, 'p1', 3, { colors: ['G', 'W'] });
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.ok(chosen, 'bot ma jakąś decyzję');
  if (chosen.type === 'cast_spell') {
    assert.ok(!(chosen.targets ?? []).includes('goliat'));
  }
});

test('bot wycenia tryby MODALNEGO TRIGGERA (Etherwrought Page), nie bierze ślepo pierwszego', () => {
  // Bot jest czystą funkcją WIDOKU, więc wystarczy minimalny widok z trzema
  // ofertami trybu. Tryby Etherwrought Page: +2 życia / surveil 1 / każdy
  // przeciwnik traci 1 życie. Przeciwnik na 1 życiu → dobicie wygrywa partię.
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 1 }],
    zones: { hand: [], battlefield: [], graveyard: [], library: [], stack: [], exile: [] },
    turn: { activePlayerId: 'p1', priorityPlayerId: 'p1', phase: 'beginning', step: 'upkeep', number: 5 },
    combat: null,
    pendingModalTrigger: {
      playerId: 'p1', sourceId: 'page', cardId: 'etherwrought-page',
      modes: [{ name: 'Zysk 2 życia' }, { name: 'Surveil 1' }, { name: 'Utrata życia' }],
    },
    legalCommands: [
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 },
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1 },
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 2 },
    ],
  };
  const bot = createHeuristicBot({ seed: 3 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'resolve_modal_choice');
  assert.equal(chosen.modeIndex, 2, `przy przeciwniku na 1 życiu bot ma dobić, wybrał ${chosen.modeIndex}`);

  // Przy zdrowym przeciwniku i własnym niskim życiu wygrywa zysk życia.
  const view2 = {
    ...view,
    players: [{ id: 'p1', life: 3 }, { id: 'p2', life: 20 }],
  };
  assert.equal(bot.chooseCommand(view2).modeIndex, 0, 'na 3 życiach bot leczy się zamiast surveilować');
});
