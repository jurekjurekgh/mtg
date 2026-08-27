// M236/5 — audyt Żywym Testerem (2026-08-27, skan strukturalny worek-dziki
// seed 9000/9003): bot rzucał Shock (2 obrażenia) w Cogwork Assembler (2/3) —
// cel NIE ginie, obrażenia znikną w kroku sprzątania (CR 514.2), a karta
// przepada. Spalanie nieletalne poza walką to zmarnowany zasób.
//
// Oś 1 audytu. Root cause: wycena `damage` w stwora wroga dawała bazę+premię
// mocy niezależnie od tego, czy cel GINIE. Fix: gdy obrażenia NIE są letalne
// i cel nie bierze udziału w walce, wariant schodzi poniżej passu (trzymaj
// spalenie na cel, którego dobijesz, albo na twarz). Letalne trafienie i chip
// w walce (osobna logika) bez zmian. Reguła po wytrzymałości celu i view.combat
// (ADR 0017), zero nazw kart (ADR 0002).
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

function shockState(enemyCardId) {
  const state = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 5);
  put(state, 'shock', 'shock', 'p2', 'hand');
  put(state, 'foe', enemyCardId, 'p1', 'battlefield');
  return state;
}

test('M236/5: bot NIE rzuca Shock w stwora, którego NIE zabija (2/3), poza walką', () => {
  const choice = createHeuristicBot({ seed: 236 }).chooseCommand(playerView(shockState('cogwork-assembler'), 'p2'), {});
  assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'shock' ? 'cast' : 'inne', 'cast',
    `Shock 2 w 2/3 nie zabija — bot ma trzymać spalenie: ${JSON.stringify(choice)}`);
});

test('M236/5: bot RZUCA Shock w stwora, którego zabija (2/2)', () => {
  const choice = createHeuristicBot({ seed: 236 }).chooseCommand(playerView(shockState('leafcrown-dryad'), 'p2'), {});
  assert.ok(choice.type === 'cast_spell' && choice.objectId === 'shock' && choice.targets?.[0] === 'foe',
    `Shock 2 w 2/2 zabija — bot powinien go rzucić: ${JSON.stringify(choice)}`);
});
