// M202/G — zgłoszenie właściciela:
//
//   „Karta Fleeting Distraction. Bot ma na stole kreatury, gracz nie ma. Bot
//    rzuca ten czar na swoją kreaturę i debuffuje ją. Bez sensu.”
//
// Przyczyna: Fleeting Distraction to „Target creature gets -1/-0 until end of
// turn” = efekt `{ type: 'pump', power: -1 }`. Klasyfikacja przyjazności celów
// patrzyła wyłącznie na TYP efektu (`pump` → przyjazny, +50), więc:
//   - rzucenie debuffu we WŁASNEGO stwora nie dostawało żadnej kary,
//   - rzucenie debuffu we WROGA dostawało karę jak wzmacnianie przeciwnika.
// Czyli wycena była odwrócona dokładnie o 180° (klasa L51: efekt celowany bez
// klasyfikacji → remis wariantów → pierwsza oferta z listy).
//
// Fix: `isNegativePump()` — klasyfikacja po ZNAKU deskryptora (ADR 0002), nie
// po typie ani po nazwie karty. Ujemny pump jest wrogi: kara za własny cel,
// brak kary za cel wrogi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function setup({ enemyCreature }) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, number: 4, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const put = (id, cardId, controllerId, zone = 'battlefield') => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  put('fd', 'fleeting-distraction', 'p1', 'hand');
  put('mine', 'hill-giant', 'p1');
  if (enemyCreature) put('theirs', 'goblin-piker', 'p2');
  addMana(state, 'p1', 4, { colors: ['U', 'U', 'U', 'U'] });
  return state;
}

const pick = (state) => createHeuristicBot({ seed: 17 }).chooseCommand(playerView(state, 'p1'), { simulate: null });

test('M202/G: Fleeting Distraction NIE debuffuje własnego stwora, gdy wróg nie ma stworów', () => {
  const state = setup({ enemyCreature: false });
  const cmd = pick(state);
  const debuffsMine = cmd?.type === 'cast_spell' && cmd.objectId === 'fd'
    && (cmd.targets ?? []).includes('mine');
  assert.ok(!debuffsMine, `bot wybrał ${JSON.stringify(cmd)} — debuff własnego stwora to czysta strata`);
});

test('M202/G: przy wrogim stworze debuff idzie w NIEGO, nie we własnego stwora', () => {
  const state = setup({ enemyCreature: true });
  const cmd = pick(state);
  assert.equal(cmd?.type, 'cast_spell', `bot wybrał ${JSON.stringify(cmd)}`);
  assert.equal(cmd.objectId, 'fd');
  assert.deepEqual(cmd.targets, ['theirs'], 'ujemny pump jest efektem wrogim — cel to stwór przeciwnika');
});
