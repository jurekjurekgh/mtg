// Pętla jakości E2 (2026-11-27, PR #190): KOMPLETNOŚĆ księgowości
// `commandSelfDrain` wobec katalogu rodzin drenażu biblioteki.
//
// J2 (zgłoszenie 2026-11-23): „po wykonaniu czarów library nie powinna spaść
// poniżej 10 … wszędzie powinno to być respektowane". Audyt rodzinny
// (przegląd WSZYSTKICH typów efektów w src/cards/card-data.js) wykazał pewne,
// natychmiastowe drenaże WŁASNEJ biblioteki, które dotąd omijały podłogę10,
// bo nie były w żadnym ze zbiorów księgowości (LIBRARY_DRAIN_EFFECTS,
// SYMMETRIC_DRAIN_EFFECTS, FACE_DOWN_LIBRARY_EFFECT_TYPES, LIBRARY_SEARCH_EFFECTS):
//   • manifest_dread — wierzch 2: jeden manifest na pole, drugi do grobu
//     (CR 701.62a) — MOJA biblioteka maleje o 2, decyzji brak;
//   • look_top_put_one_hand_rest_grave — jedna do ręki, reszta do grobu:
//     wszystkie n kart opuszczają bibliotekę (Orazca Puzzle-Door);
//   • reveal_top_pick_land_rest_grave — reszta do grobu ZAWSZE, a pick także
//     opuszcza bibliotekę → kwota = n (Satyr Wayfinder).
// Kontrakt: podłoga10 PO drenażu działa dla nich DOKŁADNIE tak samo jak dla
// mill/draw (J2). Rodziny decyzji zależnych od wyboru (surveil,
// ferocious_draw_discard, warianty „rest bottom") i triggery z warunkiem
// zewnętrznym (Gila Courser: attacks+saddled — spójnie z
// externalTriggerDrainScale ×0, M466) świadomie poza tą księgowością.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();

function put(state, id, cardId, pid, zone) {
  const def = REG.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: pid, ownerId: pid, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  return state.objects.get(id);
}

function scene({ myLib, cardId, id, zone = 'hand', manaPool = { C: 4 } }) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  for (let i = 0; i < myLib; i += 1) put(state, `mylib${i}`, 'highland-game', 'p1', 'library');
  for (let i = 0; i < 20; i += 1) put(state, `foelib${i}`, 'highland-game', 'p2', 'library');
  for (let i = 0; i < 4; i += 1) put(state, `land${i}`, 'basic-forest', 'p1', 'battlefield');
  const player = state.players.find((pl) => pl.id === 'p1');
  player.mana = Object.values(manaPool).reduce((a, b) => a + b, 0);
  player.manaPool = { ...manaPool };
  put(state, id, cardId, 'p1', zone);
  return state;
}

function pick(state) {
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  return { cmd };
}

test('K/1 (cast): Manifest Dread drenuje 2 (wierzch 2: manifest + grób) — lib10 weto, lib12 rzut', () => {
  const cienka = pick(scene({ myLib: 10, cardId: 'manifest-dread', id: 'md', manaPool: { G: 4 } }));
  assert.ok(!(cienka.cmd.type === 'cast_spell' && cienka.cmd.objectId === 'md'),
    `10 − 2 = 8 < 10 — weto; bot castował — ${JSON.stringify(cienka.cmd)}`);
  const granica = pick(scene({ myLib: 12, cardId: 'manifest-dread', id: 'md', manaPool: { G: 4 } }));
  assert.ok(granica.cmd.type === 'cast_spell' && granica.cmd.objectId === 'md',
    `12 − 2 = 10 — granica przechodzi; bot wybrał ${granica.cmd.type}(${granica.cmd.objectId ?? ''})`);
});

test('K/2 (aktywacja): Orazca Puzzle-Door zabiera 2 z biblioteki — lib11 weto, lib12 aktywacja', () => {
  const cienka = pick(scene({ myLib: 11, cardId: 'orazca-puzzle-door', id: 'drzwi', zone: 'battlefield' }));
  assert.ok(!(cienka.cmd.type === 'activate_ability' && cienka.cmd.objectId === 'drzwi'),
    `11 − 2 = 9 < 10 — weto; bot aktywował — ${JSON.stringify(cienka.cmd)}`);
  const granica = pick(scene({ myLib: 12, cardId: 'orazca-puzzle-door', id: 'drzwi', zone: 'battlefield' }));
  assert.ok(granica.cmd.type === 'activate_ability' && granica.cmd.objectId === 'drzwi',
    `12 − 2 = 10 — granica przechodzi; bot wybrał ${granica.cmd.type}(${granica.cmd.objectId ?? ''})`);
});

test('K/3 (ETB one-shot): Satyr Wayfinder — reveal 4, reszta do grobu ZAWSZE — lib13 weto, lib14 rzut', () => {
  const cienka = pick(scene({ myLib: 13, cardId: 'satyr-wayfinder', id: 'satyr', manaPool: { G: 4 } }));
  assert.ok(!(cienka.cmd.type === 'cast_permanent' && cienka.cmd.objectId === 'satyr'),
    `13 − 4 = 9 < 10 — weto; bot castował — ${JSON.stringify(cienka.cmd)}`);
  const granica = pick(scene({ myLib: 14, cardId: 'satyr-wayfinder', id: 'satyr', manaPool: { G: 4 } }));
  assert.ok(granica.cmd.type === 'cast_permanent' && granica.cmd.objectId === 'satyr',
    `14 − 4 = 10 — granica przechodzi; bot wybrał ${granica.cmd.type}(${granica.cmd.objectId ?? ''})`);
});
