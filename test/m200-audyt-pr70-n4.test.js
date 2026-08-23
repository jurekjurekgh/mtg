// M200/N4 (audyt PR #70, klasa L41/L15): Steelclaw Lance — etykieta equipu
// pokazywała ZAWSZE bazowy koszt („Equip {3}"), choć dla celu z podtypem
// Knight realny koszt to {1} („Equip Knight {1}"). Engine (oferta i
// walidacja) liczył koszt dla konkretnego celu poprawnie — kłamała warstwa
// prezentacji: gracz „płacił" 1 many, a przycisk obiecywał 3.
//
// Fix (jedno źródło reguły kosztu, jak w engine): etykieta i linia kaftla
// czytają `equipment.equipFor` i podtyp CELU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandLabel } from '../src/table/render.js';
import { manaCostHtml } from '../src/table/mana-icons.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name,
    aura: data.aura ?? null, equipment: data.equipment ?? null, spell: data.spell ?? null,
  });
  return state.objects.get(id);
}

function game() {
  const state = createGameState({ seed: 704, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const p1 = state.players.find((p) => p.id === 'p1');
  p1.mana = 5;
  p1.manaPool = { '': 5 };
  return state;
}

function labelFor(state, cmd) {
  const view = playerView(state, 'p1');
  const session = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (objectId) => {
      const o = state.objects.get(objectId);
      return o ? (REGISTRY.get(o.cardId)?.name ?? o.cardId) : '?';
    },
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
  return commandLabel(cmd, session, view);
}

test('M200/N4: etykieta „Wyposaż" — Knight kosztuje {1}, inny stwór {3}', () => {
  const state = game();
  put(state, 'lance', 'steelclaw-lance');
  put(state, 'paladin', 'spinewoods-paladin');
  put(state, 'game', 'highland-game');
  const view = playerView(state, 'p1');
  const cmds = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'lance');
  assert.equal(cmds.length, 2, 'oferta equipu na oba stwory (CR 702.6a/702.6e)');
  const toPaladin = cmds.find((c) => c.targets?.[0] === 'paladin');
  const toGame = cmds.find((c) => c.targets?.[0] === 'game');
  assert.ok(toPaladin && toGame, 'oba cele w ofercie');

  const labelPaladin = labelFor(state, toPaladin);
  const labelGame = labelFor(state, toGame);
  assert.ok(labelPaladin.includes(`(koszt ${manaCostHtml('{1}')})`),
    `Knight: realny koszt {1} — etykieta: ${labelPaladin}`);
  assert.ok(labelGame.includes(`(koszt ${manaCostHtml('{3}')})`),
    `Highland Game: realny koszt {3} — etykieta: ${labelGame}`);
});

test('M200/N4: anty-over-fix — sprzęt BEZ wariantu (jeden koszt) bez zmian w etykiecie', () => {
  // Blazing Torch? — bierzemy zwykły sprzęt z pojedynczym kosztem (np.
  // lodestone-needle nie ma equipu... używamy sprzetu z katalogu).
  const state = game();
  const def = REGISTRY.get('blazing-torch');
  assert.ok(def?.equipment, 'Blazing Torch w rejestrze z equipment');
  put(state, 'torch', 'blazing-torch');
  put(state, 'paladin', 'spinewoods-paladin');
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'torch' && c.targets?.[0] === 'paladin');
  assert.ok(cmd, 'oferta equipu Blazing Torch');
  const label = labelFor(state, cmd);
  assert.ok(label.includes(`(koszt ${manaCostHtml(`{${def.equipment.equip}}`)})`),
    `pojedynczy koszt bez zmian — etykieta: ${label}`);
  assert.ok(!label.includes('·'), 'brak wariantu — brak kropek');
});
