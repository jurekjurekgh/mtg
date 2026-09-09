// C (znalezisko testera): Cathartic Reunion przy 6 kartach w bibliotece —
// bot dobierał 3 (6→3), biegnąc w deck-out. Guard drawDeckingPenalty veto
// tylko przy remaining ≤ 0 — i to za słabo na czary (50+18−58=+10 > pass;
// sonda: biblioteka 3 → cast +10!). Reguła: dobieranie w OSTATNIE karty to
// wyrok (remaining ≤ 0: magnituda M162/B), a dobieranie w strefę krytyczną
// (remaining 1–3, ~2 tury do deck-outu) schodzi pod pass. Próg 3 zgodny
// z pinem Denisena (5→4 = bezpieczne, test A–F/D).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const R = createCardRegistry();
function scenario(libCount) {
  const s = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p2';
  const put = (id, cardId, c, zone) => {
    const d = R.get(cardId); assert.ok(d, cardId);
    addObject(s, { ...gameObjectDataOf(d), id, instanceId: `i-${id}`, cardId, controllerId: c, ownerId: c, zone,
      types: d.types ?? [], keywords: d.keywords ?? [], subtypes: d.subtypes ?? [], spell: d.spell });
  };
  put('re', 'cathartic-reunion', 'p2', 'hand');
  put('d1', 'goblin-piker', 'p2', 'hand'); put('d2', 'goblin-piker', 'p2', 'hand');
  for (let i = 0; i < libCount; i++) put(`L${i}`, 'goblin-piker', 'p2', 'library');
  for (let i = 0; i < 30; i++) put(`E${i}`, 'goblin-piker', 'p1', 'library');
  put('m1', 'basic-mountain', 'p2', 'battlefield'); put('m2', 'basic-mountain', 'p2', 'battlefield');
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(playerView(s, 'p2'), {});
  const options = bot.trace()[0].options;
  const cast = options.find((o) => o.cmd.startsWith('cast_spell'));
  return { cmd, castScore: cast?.score };
}

test('C: Reunion przy 6 kartach (6→3) nie jest rzucany', () => {
  const { cmd, castScore } = scenario(6);
  assert.ok(castScore < 0, `wycena pod passem: ${castScore}`);
  assert.notEqual(cmd.objectId, 're', `bot nie biegnie w deck-out: ${cmd.type}`);
});

test('C: Reunion przy 3 kartach (dobranie do zera) ma wycenę samobójstwa', () => {
  const { cmd, castScore } = scenario(3);
  assert.ok(castScore < 0, `wycena pod passem (było +10): ${castScore}`);
  assert.notEqual(cmd.objectId, 're', `bot nie deck-outuje się czarem: ${cmd.type}`);
});

test('C: Reunion przy 7 kartach (7→4) nadal rzucany (granica strefy)', () => {
  const { cmd, castScore } = scenario(7);
  assert.ok(castScore > 0, `poza strefą krytyczną dodatnie: ${castScore}`);
  assert.equal(cmd.objectId, 're', 'bot rzuca przy bezpiecznej bibliotece');
});

test('C: Reunion przy 20 kartach rzucany (kontrola)', () => {
  const { cmd } = scenario(20);
  assert.equal(cmd.objectId, 're', 'bot rzuca przy pełnej bibliotece');
});
