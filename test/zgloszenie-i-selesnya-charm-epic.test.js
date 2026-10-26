// I — zgłoszenie właściciela z gry (2026-10-24, Selesnya Charm):
//
//   „Bot nie umie rzucać tego czaru. Rzucił go przez Epic Experiment.
//    Zamiast stworzyć tokena 2/2 Knight, który zostałby na stole bot
//    wzmocnił swoją kreaturę z Defenderem (więc nawet zaatakować ją nie
//    mógł) i zmarnował ten czar. Ten czar jest sens używać w opcji
//    wzmacnianie+trample TYLKO jeśli użyty jest jako combat trick w fazie
//    walki i w taki sposób, żeby zadać lethal kreaturze przeciwnika albo
//    zadać obrażenia przeciwnikowi przez trample. Inaczej inne opcje są
//    wprost lepsze."
//
// Selesnya Charm (modalny): A „+2/+2 i trample do końca tury”, B „wygnaj
// stwora o mocy 5+”, C „token 2/2 Knight z vigilance”.
//
// Root cause: okna darmowego rzutu o bazie flat (resolve_epic_choice /
// resolve_suspend_cast / resolve_rebound_cast) wyceniały warianty wyłącznie
// bazą 70 + premiami +15/+5 za kilka typów efektów. Tryby czaru modalnego
// REMISOWAŁY (pump 70 = token 70), więc wygrywał pierwszy wariant z listy —
// pump na pierwszego własnego stwora, choć pump czasowy poza walką jest
// jałowy, a token zostaje na stole.
//
// Fix (L41 — te same helpery co reszta bota, wspólny `freeCastEffectsScore`
// dla całej trójki okien):
//   - create_token: `tokenBodyValue` (stałe ciało),
//   - pump czasowy: `temporaryPumpPayoff` (okna walki; defender i gra poza
//     walką = 0, prawdziwy combat trick potrafi wygrać z tokenem),
//   - destroy/exile: dotychczasowe +15 + materiał wrogiego celu
//     (`permanentMaterialValue`), żeby zdjęcie dużego zagrożenia nie
//     przegrywało z małym tokenem; exile_permanent dopisany do rodziny.
//
//   I/1 — scena zgłoszenia: defender bota, Epic z Selesnya Charm → bot
//         tworzy tokena Knight (tryb C), nie pumpuje defendera;
//   I/2 — wróg 6/6 na stole → bot wybiera wygnanie (tryb B) przed tokenem.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function epicCharmScene({ foePatch = {} } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  state.pendingMulligans = [];
  const wall = put(state, 'wall', 'goblin-piker', 'battlefield', 'p2');
  state.objects.set('wall', Object.freeze({
    ...wall, keywords: Object.freeze(['defender']), power: 0, toughness: 4, summoningSickness: false,
  }));
  const foe = put(state, 'foe', 'hill-giant', 'battlefield', 'p1');
  if (Object.keys(foePatch).length) {
    state.objects.set('foe', Object.freeze({ ...foe, summoningSickness: false, ...foePatch }));
  }
  put(state, 'charm-ex', 'selesnya-charm', 'exile', 'p2');
  state.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic-experiment', exileIds: ['charm-ex'], maxMV: 2, restorePriorityTo: 'p2',
  };
  return state;
}

test('I/1: Epic Experiment — bot tworzy tokena Knight zamiast pompować własnego defendera', () => {
  const state = epicCharmScene();
  const view = playerView(state, 'p2');
  const variants = view.legalCommands.filter((c) => c.type === 'resolve_epic_choice' && !c.done);
  assert.ok(variants.some((c) => c.modeIndex === 0), 'tryb wzmocnienia jest w ofercie (pin niepusty)');
  assert.ok(variants.some((c) => c.modeIndex === 2), 'tryb tokena jest w ofercie');
  const bot = createHeuristicBot({ seed: 5 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_epic_choice');
  assert.equal(choice.modeIndex, 2, `token zostający na stole wygrywa z pumpem na defenderze: ${JSON.stringify(choice)}`);
  const r = execute(state, choice);
  assert.equal(r.ok, true, JSON.stringify(r.events?.slice(-1)));
  // Czar jest na stosie — przepuszczamy priorytet do rozstrzygnięcia
  // (po drodze okno Epic może domknąć się komendą `done`).
  for (let i = 0; i < 20; i += 1) {
    const v = playerView(state, 'p2');
    const done = v.legalCommands.find((c) => c.type === 'resolve_epic_choice' && c.done);
    if (done) { execute(state, done); continue; }
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const knight = [...state.objects.values()]
    .find((o) => o.cardId === 'token_knight' && o.zone === 'battlefield' && o.controllerId === 'p2');
  assert.ok(knight, 'Knight 2/2 stoi na stole bota po rozstrzygnięciu wyboru');
});

test('I/2: z wrogim 6/6 bot wybiera wygnanie (materiał celu) przed tokenem', () => {
  const state = epicCharmScene({ foePatch: { power: 6, toughness: 6 } });
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_epic_choice' && c.modeIndex === 1),
    'tryb wygnania oferowany przy celu o mocy 6');
  const bot = createHeuristicBot({ seed: 5 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_epic_choice');
  assert.equal(choice.modeIndex, 1, `zdjęcie 6/6 wygrywa z tokenem 2/2: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['foe']);
});
