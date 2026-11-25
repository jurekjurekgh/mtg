// J (zgłoszenie właściciela 2026-11-23, „uwagi z testów"): Moldgraf Millipede
// — „When this creature enters, mill three cards, then put a +1/+1 counter on
// this creature for each creature card in your graveyard."
//
// > Bot rzucą tą kartę mając 5 kart w bibliotece. To jak samobójstwo. Ta
// > karta działa jak auto-mill i powinna być brana pod uwagę przy self-mill
// > blokadzie.
//
// Root cause (zmierzone): ETB `mill_cards` wyceniał `ETB_EFFECT_BONUS` jak
// mill WROGA (+20+3n = +29), a podatek `libraryDrainTax` traktował jednorazowy
// drenaż ETB tylko progiem deck-outu (`oneShotDeckOutPenalty` — zapas < 0).
// Przy 5 kartach (zapas 2) obie strony milczały: score 99.9 przy KAŻDEJ
// wielkości biblioteki (5/10/30 — identycznie).
//
// Kontrakt:
// 1. Wartość ETB-millu (niecelowanego = własna biblioteka, CR 701.17) idzie
//    wspólną skalą `selfMillValue` — ta sama co czar/aktywacja (L41);
// 2. Jednorazowy drenaż MILL z ETB wchodzi do pełnej drabiny
//    `libraryLossPenalty` w `libraryDrainTax` (rodzina self-mill blokady);
//    jednorazowe DOBRANIE z ETB (Rager/CR1) zostaje przy dawnym progu
//    deck-outu (świadoma decyzja E2/K2/CR1 z 2026-09-15 — nie ruszamy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function scene({ myLib = 5, graveCreatures = 2 } = {}) {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const put = (id, cardId, zone, pid) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w rejestrze`);
    addObject(state, {
      ...gameObjectDataOf(def),
      id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
      types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
      spell: def.spell,
    });
  };
  put('mg', 'moldgraf-millipede', 'hand', 'p1');
  for (let i = 0; i < myLib; i += 1) put(`lib${i}`, 'basic-forest', 'library', 'p1');
  for (let i = 0; i < graveCreatures; i += 1) put(`gc${i}`, 'goblin-piker', 'graveyard', 'p1');
  for (let i = 0; i < 6; i += 1) put(`land${i}`, 'basic-forest', 'battlefield', 'p1');
  const player = state.players.find((p) => p.id === 'p1');
  player.mana = 6;
  player.manaPool = { G: 6 };
  return state;
}

function pick(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 7, ...(params ? { params } : {}) });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  const t = bot.trace().at(-1);
  return { cmd, options: (t?.options ?? []).map((o) => ({ cmd: o.cmd, score: o.score })) };
}

const isMoldgrafCast = (cmd) => cmd.type === 'cast_permanent' && cmd.objectId === 'mg';

test('J/1: przy 5 kartach w bibliotece bot NIE rzuca auto-millu (samobójstwo)', () => {
  const { cmd, options } = pick(scene({ myLib: 5 }));
  assert.ok(!isMoldgrafCast(cmd),
    `5 kart − 3 zmielone = 2 zapasu; rzut = auto-mill pod przepaścią; bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});

test('J/2: przy 10 kartach (zapas 7 < librarySafeMargin 20) bot też nie rzuca — drabina cienkiej biblioteki', () => {
  const { cmd, options } = pick(scene({ myLib: 10 }));
  assert.ok(!isMoldgrafCast(cmd),
    `zapas 7 < 20 = rodzina cienkiej biblioteki; bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});

test('J/3: przy zdrowej bibliotece (30 kart, zapas 27 ≥ 20) bot rzuca — brak over-blocku', () => {
  const { cmd, options } = pick(scene({ myLib: 30 }));
  assert.ok(isMoldgrafCast(cmd),
    `zdrowa biblioteka: mill nie blokuje rzutu; bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});
