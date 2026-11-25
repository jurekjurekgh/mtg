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
// Kontrakt (korekta właściciela 2026-11-23 — próg 20 był za ostry):
// > „&lt;20 kart to nie jest zbyt duży bloker? 5 kart oczywiście nie powinien
// > rzucać, 10 też nie, ale przy 15 już bym się zastanawiał, a przy 20 bym
// > na pewno rzucał. Ten bloker powinien raczej pilnować IMO czy po rzuceniu
// > tej karty nie zejdziemy poniżej 10 kart."
// 1. Wartość ETB-millu (niecelowanego = własna biblioteka, CR 701.17) idzie
//    wspólną skalą `selfMillValue` — ta sama co czar/aktywacja (L41);
// 2. TWARDE WETO jednorazowego millu z ETB: mill po drenażu zostaje < 10
//    kart → rzut nigdy (jak `springbloomDrainVeto`/`lootCastVeto`, ale
//    liczymy ZAPAS PO millu, nie stan przed); przy ≥ 10 po millu podatek z
//    jednorazowego millu wynosi 0 (drabina `libraryLossPenalty` z marginesem
//    20 została przy powtarzalnych drenażach — za ostra dla jednorazówki);
// 3. Jednorazowe DOBRANIE z ETB (Rager/CR1) zostaje przy dawnym progu
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

test('J/2: przy 10 kartach bot nie rzuca — PO millu zostałoby 7 < 10 (weto właściciela)', () => {
  const { cmd, options } = pick(scene({ myLib: 10 }));
  assert.ok(!isMoldgrafCast(cmd),
    `10 − 3 = 7 < 10; bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});

test('J/3: przy zdrowej bibliotece (30 kart, zapas 27 ≥ 20) bot rzuca — brak over-blocku', () => {
  const { cmd, options } = pick(scene({ myLib: 30 }));
  assert.ok(isMoldgrafCast(cmd),
    `zdrowa biblioteka: mill nie blokuje rzutu; bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});

test('J/4: przy 15 kartach bot rzuca — PO millu 12 ≥ 10 (właściciel: „przy 15 bym się zastanawiał", reguła = nie schodzimy poniżej 10)', () => {
  const { cmd, options } = pick(scene({ myLib: 15 }));
  assert.ok(isMoldgrafCast(cmd),
    `15 − 3 = 12 ≥ 10 → brak weta; bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});

test('J/5 (granica dół): 12 kart → PO millu 9 < 10 → weto', () => {
  const { cmd, options } = pick(scene({ myLib: 12 }));
  assert.ok(!isMoldgrafCast(cmd),
    `12 − 3 = 9 < 10; bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});

test('J/6 (granica góra): 13 kart → PO millu dokładnie 10 → rzut przechodzi', () => {
  const { cmd, options } = pick(scene({ myLib: 13 }));
  assert.ok(isMoldgrafCast(cmd),
    `13 − 3 = 10 (>= 10, nie „poniżej 10"); bot wybrał ${cmd.type}(${cmd.objectId ?? ''}) — ${JSON.stringify(options)}`);
});
