// A4-4 (handoff 2026-09-08k, kolejność ryzyka #4): triage Slabs / Inspiration
// (pre-existing z sesji #106 — „potwierdzić lub zamknąć").
//
// WYNIKI SOND (2026-09-09, createHeuristicBot.chooseCommand na playerView):
//
// 1. Stomping Slabs (MOR) — „Reveal top 7 … If a card named Stomping Slabs
//    was revealed this way, deals 7 damage to any target". Sonda: bot w main1
//    BEZ landa w ręce RZUCAŁ Slabsy za 3 many (score = spellBase 50 > pass) —
//    czyste przetasowanie, a thenDamage jest NIEDOSTĘPNE dla singletona
//    (rzucana kopia leży na stosie; druga kopia nie istnieje w talii, a
//    biblioteka jest dla bota ZASŁONIONA — view: {hidden: true} — więc
//    warunek obrażeń nie da się nawet zweryfikować). BŁĄD POTWIERDZONY.
//    Fix: reveal_top_to_bottom_order → DECK_ARRANGING_EFFECTS (ta sama klasa
//    co scry/surveil: w main1 kara −60, w main2 +6 — przetasowanie przed
//    dobieraniem jest neutralne/lekko korzystne).
//
// 2. Inspiration (8ED) — „Target player draws two cards" (draw_cards
//    applyTo: 'target'). Sonda: wycena czaru dawała +2·drawCardValue
//    NIEZALEŻNIE od odbiorcy (i nakładała WŁASNY deck-out guard na dobór
//    przeciwnika). W 1v1 zachowanie jest ZACHOWAWCZO poprawne, bo oferty
//    idą w kolejności [własny, przeciwnik] i remis wygrywa własny cel —
//    sonda: 15/15 → bot celuje w siebie; 5/15 (strefa kary) → pass.
//    Wada wyceny zostaje NAPRAWIONA u root cause (odbiorca-zależny znak:
//    +własny / −przeciwnik, guard deck-outu tylko dla własnego doboru) —
//    strzeże to wyceny przed przyszłą zmianą kolejności ofert. Piny poniżej
//    są GREEN przed i po fixie (zachowanie nie zmienia się w 1v1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords, subtypes: def.subtypes ?? [],
    id, instanceId: `i-${id}`, cardId, ownerId: controllerId, controllerId, zone,
  });
  return state.objects.get(id);
}

function mainGame(seed, step = 'main') {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

// --- 1. Stomping Slabs: czyste przetasowanie nie jest wart 3 many w main1 ---
test('A4-4/1: Slabsy w main1 bez landa — bot HOLDUJE (RED przed fixem: rzucał za 50 pkt)', () => {
  const state = mainGame(448);
  put(state, 'slabs', 'stomping-slabs', 'p1', 'hand');
  for (let i = 0; i < 20; i++) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  for (let i = 0; i < 15; i++) put(state, `lib2${i}`, 'basic-swamp', 'p2', 'library');
  addMana(state, 'p1', 3);

  const choice = createHeuristicBot({ seed: 448 }).chooseCommand(playerView(state, 'p1'), {});
  assert.notEqual(choice.type, 'cast_spell',
    `bot nie powinien rzucać Slabsów (czyste shuffle; singleton — thenDamage niedostępne): ${JSON.stringify(choice)}`);
});

test('A4-4/2: Slabsy w main2 — przetasowanie przed dobieraniem jest akceptowalne', () => {
  const state = mainGame(449, 'main2');
  assert.equal(state.turn.step, 'main2');
  put(state, 'slabs', 'stomping-slabs', 'p1', 'hand');
  for (let i = 0; i < 20; i++) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  for (let i = 0; i < 15; i++) put(state, `lib2${i}`, 'basic-swamp', 'p2', 'library');
  addMana(state, 'p1', 3);

  const choice = createHeuristicBot({ seed: 449 }).chooseCommand(playerView(state, 'p1'), {});
  // W main2 kara nie obowiązuje (+6 dla deck-arranging) — rzut legalnym wyborem.
  assert.ok(choice.type === 'cast_spell' || choice.type === 'pass_priority',
    `spodziewany rzut albo pass: ${JSON.stringify(choice)}`);
  if (choice.type === 'cast_spell') assert.equal(choice.objectId, 'slabs');
});

// --- 2. Inspiration: odbiorca ma znaczenie (piny zachowania 1v1) ---
test('A4-4/3: Inspiration 15/15 — bot celuje w SIEBIE (card advantage własny)', () => {
  const state = mainGame(446);
  put(state, 'ins', 'inspiration', 'p1', 'hand');
  for (let i = 0; i < 15; i++) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  for (let i = 0; i < 15; i++) put(state, `lib2${i}`, 'basic-swamp', 'p2', 'library');
  addMana(state, 'p1', 4, { colors: ['U'] });

  const choice = createHeuristicBot({ seed: 446 }).chooseCommand(playerView(state, 'p1'), {});
  assert.equal(choice.type, 'cast_spell', `Inspiration opłaca się (dobrań +2): ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'ins');
  assert.equal(choice.targets?.[0], 'p1', 'dobrań idą do SIEBIE, nie do przeciwnika');
});

test('A4-4/4: Inspiration przy 5 kartach w bibliotece (5→3, strefa kary) — pass', () => {
  const state = mainGame(447);
  put(state, 'ins', 'inspiration', 'p1', 'hand');
  for (let i = 0; i < 5; i++) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  for (let i = 0; i < 15; i++) put(state, `lib2${i}`, 'basic-swamp', 'p2', 'library');
  addMana(state, 'p1', 4, { colors: ['U'] });

  const choice = createHeuristicBot({ seed: 447 }).chooseCommand(playerView(state, 'p1'), {});
  assert.notEqual(choice.type, 'cast_spell',
    `dobieranie w strefę deck-outu (5→3) nie opłaca się: ${JSON.stringify(choice)}`);
});
