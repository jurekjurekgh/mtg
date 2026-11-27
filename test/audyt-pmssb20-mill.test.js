// PMSSB-20 (RE-AUDYT MILL) — audyt przyczynowo-skutkowy z nowym dowodem:
// (1) presja deck-outu wroga przy millu ofensywnym (wyścig bibliotek —
// dobranie z pustej biblioteki = przegrana, CR 121.4/704.5b; liczebność
// bibliotek jest jawna i niesiona przez widok mimo zakrycia CR 402.2),
// (2) combo self-mill + reanimacja w ręce (najlepszy moment zdolności),
// (3) jedna skala mill dla cast_spell i aktywacji (L41 — dawniej 4 skale).
// Kotwice: /tmp/pmssb20-mill-przed.mjs (tome-scour; warianty p1/p2).
import test from 'node:test';
import assert from 'node:assert/strict';

import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
function putSpell(state, id, cardId, c, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: c, ownerId: c, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    ...(def.adventure ? { adventure: def.adventure } : {}),
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

function tomeScourScores({ foeLib, myLib, reanimate = false, reanimateCard = null }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (let i = 0; i < myLib; i += 1) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
  for (let i = 0; i < foeLib; i += 1) putSpell(state, `flib${i}`, 'highland-game', 'p1', 'library');
  putSpell(state, 'a', 'tome-scour', 'p2', 'hand');
  if (reanimate || reanimateCard) putSpell(state, 're', reanimateCard ?? 'unbreakable-bond', 'p2', 'hand');
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 99 });
  bot.chooseCommand(view, {});
  const last = bot.trace().at(-1) ?? {};
  const out = {};
  for (const o of last.options ?? []) {
    if (o.cmd === 'cast_spell(a->p1)') out.foe = o.score;
    if (o.cmd === 'cast_spell(a->p2)') out.self = o.score;
  }
  return out;
}

test('S01: mill wroga z tłustą biblioteką — baza 20+3n historyczna (85, bez dryfu)', () => {
  assert.equal(tomeScourScores({ foeLib: 30, myLib: 30 }).foe, 85);
});

test('S02: presja deck-outu — ich 6 kart (po=1) podbija mill (129)', () => {
  // 85 + 4·(12−1) = 129 — wyraźnie cenniejsze niż mill w tłustą bibliotekę.
  assert.equal(tomeScourScores({ foeLib: 6, myLib: 30 }).foe, 129);
});

test('S03: mill do 0 = wygrana przy ich najbliższym dobraniu (485, CR 121.4)', () => {
  // 85 + millFoeDeckOutWinValue(400) — do tej pory warte tyle samo co S01!
  assert.equal(tomeScourScores({ foeLib: 5, myLib: 30 }).foe, 485);
});

test('S04: self-mill bez synergii/reanimacji — guard −80 historyczny (−65)', () => {
  assert.equal(tomeScourScores({ foeLib: 30, myLib: 30 }).self, -65);
});

test('S05: self-mill pod reanimację w ręce — przy ≥25 kartach w bibliotece combo widoczne (−50 = −65+15)', () => {
  assert.equal(tomeScourScores({ foeLib: 30, myLib: 30, reanimate: true }).self, -50);
  // Poniżej 25 kart w bibliotece bot nie wrzuca świadomie kart pod reanimację.
  assert.equal(tomeScourScores({ foeLib: 30, myLib: 24, reanimate: true }).self, -65);
});

test('S06: self-mill przy cienkiej własnej bibliotece — uniwersalna podłoga10 (−∞)', () => {
  // KOREKTA WŁAŚCICIELA 2026-11-23 (unifikacja): 6 kart, mill5 → PO drenażu
  // 1 < 10 → twarde weto `libraryDrainVeto` (−∞). Dawny pin −85 (drabina
  // deck-outu w value) był już niedosiężny przez punktację komendy — strefa
  // ryzyka (zapas ≤ 8) zawsze leży w post < 10, więc podłoga ją poprzedza;
  // drabina pozostaje aktywna dla powtarzalnych drenaży (B/2) i wyceny ETB.
  assert.equal(tomeScourScores({ foeLib: 30, myLib: 6 }).self, Number.NEGATIVE_INFINITY);
});

test('Audyt #144/F3: Grave Exchange (return_creature_card_to_hand) to też reanimacja w ręce przy ≥25 kartach (−50)', () => {
  // L72: ten sam KSZTAŁT efektu (karta z grobu → ręka), inna nazwa typu;
  // enumeracja w bocie pomijała bliźniaka, więc combo z self-millem nie było
  // widoczne dla tej karty (self-mill = −65 zamiast −50).
  assert.equal(tomeScourScores({ foeLib: 30, myLib: 30, reanimateCard: 'grave-exchange' }).self, -50);
});

test('S07: niecelowany self-mill przy karcie czytającej grób (Gray Slaad) działa tylko przy ≥25 kartach w bibliotece', () => {
  const scoreAdventure = (myLib) => {
    const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'main', 'p2');
    state.turn.activePlayerId = 'p2';
    state.turn.priorityPlayerId = 'p2';
    addMana(state, 'p2', 2, { colors: ['B'] });
    for (let i = 0; i < myLib; i += 1) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
    putSpell(state, 'slaad', 'gray-slaad', 'p2', 'hand');
    const bot = createHeuristicBot({ seed: 99, registry: REGISTRY });
    bot.chooseCommand(playerView(state, 'p2'), {});
    return bot.trace().at(-1)?.options?.find((o) => o.cmd.startsWith('cast_adventure(slaad'))?.score;
  };
  // ≥25 kart w bibliotece → synergia +6 działa (50 + 6 = 56).
  assert.equal(scoreAdventure(25), 56);
  // <25 kart w bibliotece → kara bazowa −25, bez synergii (50 − 25 = 25).
  assert.equal(scoreAdventure(24), 25);
});
