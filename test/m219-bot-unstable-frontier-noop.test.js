// M219 — pętla jakości Żywym Testerem (2026-08-26), partia g9 (zendikar-gracz
// vs alara-bot, seed 8): bot aktywował Unstable Frontier CO TURĘ
// ({T}: cel — twój ląd staje się podstawowym typem do końca tury), marnując
// tap na efekt bez skutku, którego nie potrafi spożytkować.
//
// Oś 1 audytu (bezsensowne działania bota — „powtarzanie tej samej akcji
// w kółko … znak, że wycena nie ma progu nasycenia"). Przyczyna (L3): baza
// +2 za „legalne zagranie rozwijające planszę" i kara −2 za become_basic_land_type
// znosiły się do 0 — zdolność remisowała z passem (0) i wygrywała po
// kolejności sortowania. Kara musi PRZEBIĆ premię, żeby wariant spadł poniżej
// passu.
//
// Naprawa: kara become_basic_land_type z −2 na −8 (baza 2 − 8 = −6 < 0).
// Zero nazw kart (ADR 0002) — reguła po TYPIE efektu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function frontierState() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  const ufData = gameObjectDataOf(REGISTRY.get('unstable-frontier'));
  addObject(state, {
    id: 'uf', instanceId: 'i-uf', cardId: 'unstable-frontier', controllerId: 'p1', zone: 'battlefield',
    kind: ufData.kind, abilities: ufData.abilities ?? [], types: ['Land'], subtypes: [],
  });
  addObject(state, {
    id: 'l1', instanceId: 'i-l1', cardId: 'basic-swamp', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', abilities: [], subtypes: ['Swamp'], types: ['Basic', 'Land'],
  });
  return state;
}

test('M219: bot NIE marnuje tapu Unstable Frontier na jałową zmianę typu — woli pass', () => {
  const state = frontierState();
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const pick = bot.chooseCommand(view, {});
  assert.equal(pick.type, 'pass_priority',
    `bot powinien spasować zamiast marnować {T} na become_basic_land_type, wybrał: ${JSON.stringify(pick)}`);
});

test('M219: become_basic_land_type wyceniane PONIŻEJ passu (kara przebija bazę, L3)', () => {
  const state = frontierState();
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const passScore = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const activateScores = trace.options
    .filter((o) => o.cmd.startsWith('activate_ability(uf'))
    .map((o) => o.score);
  assert.ok(activateScores.length > 0, 'zdolność Unstable Frontier musi być w ofercie');
  for (const s of activateScores) {
    assert.ok(s < passScore, `aktywacja (${s}) musi być poniżej passu (${passScore})`);
  }
});
