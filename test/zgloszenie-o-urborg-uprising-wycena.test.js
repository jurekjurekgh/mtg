/**
 * Zgłoszenie właściciela O (2026-10-25): bot rzucał *Urborg Uprising* {4}{B}
 * („Return up to two target creature cards from your graveyard to your
 * hand. Draw a card.”) także przy grobie BEZ kart stworzeń — płacił cały
 * koszt wyłącznie za dobranie jednej karty.
 *
 * Diagnoza (wycena `cast_spell`, heuristic-bot.js): `graveReturnEffectValue`
 * dawał pustym slotom 0, więc wariant bez celów trzymały `spellBase` 50 +
 * `drawCardValue` 6 (rzut jest LEGALNY bez celów — ruling APC 2022-12-08).
 * Reguła właściciela (po deskryptorach efektów `return_creature_card_to_hand`/
 * `return_card_from_graveyard_to_hand`, ADR 0002 — bez nazwy karty): każdy
 * niezrealizowany slot zwrotu kosztuje `graveReturnEmptySlotPenalty` (40),
 * więc 0 zwróconych < pass < 1 zwrócona < 2 zwrócone. Dobranie utrzymuje
 * własną karę biblioteczną (`drawDeckingPenalty` + `libraryDrainTax`).
 *
 * Scena: bot (p2) w swojej turze, 7 nietapniętych Swampów, ręka = samo
 * Urborg Uprising; Child of Night ({1}{B} 2/1 lifelink) jako karty w grobie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: playerId, ownerId: playerId, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  return state.objects.get(id);
}

function scena({ graveyardCreatures = 0, library = 30, handCardId = 'urborg-uprising', handId = 'uprising' } = {}) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  state.pendingMulligans = [];
  for (let i = 1; i <= 7; i++) put(state, `sw${i}`, 'basic-swamp', 'battlefield', 'p2');
  put(state, handId, handCardId, 'hand', 'p2');
  // Ląd w grobie — grób nie-pusty, ale bez kart STWORA (dokładnie kształt O).
  put(state, 'dead-swamp', 'basic-swamp', 'graveyard', 'p2');
  for (let i = 1; i <= graveyardCreatures; i++) put(state, `dead-creature-${i}`, 'child-of-night', 'graveyard', 'p2');
  for (let i = 0; i < library; i++) put(state, `lib${i}`, 'basic-swamp', 'library', 'p2');
  for (let i = 0; i < 30; i++) put(state, `libp1-${i}`, 'basic-island', 'library', 'p1');
  return state;
}

const botChoice = (state) => createHeuristicBot({ seed: 5 }).chooseCommand(playerView(state, 'p2'), {});

const uprisingOffers = (state) => playerView(state, 'p2').legalCommands
  .filter((c) => c.objectId === 'uprising' && c.type.startsWith('cast'));

test('O: grób bez kart stworzeń — oferta jest legalna, ale bot nie płaci {4}{B} za samo dobranie', () => {
  const state = scena({ graveyardCreatures: 0 });
  const offers = uprisingOffers(state);
  assert.ok(offers.length > 0, 'rzut bez celów dalej LEGALNY (ruling APC) — to wycena, nie oferta');
  assert.ok(offers.every((c) => (c.targets ?? []).filter(Boolean).length === 0), 'jedyny wariant jest bezcelowy (sloty = null)');
  const choice = botChoice(state);
  assert.notEqual(choice.objectId, 'uprising', `bot wybrał ${JSON.stringify(choice)} zamiast passa`);
});

test('O: jedna kreatura w grobie — rzut z tą jedną kartą', () => {
  const state = scena({ graveyardCreatures: 1 });
  const choice = botChoice(state);
  assert.equal(choice.objectId, 'uprising', 'bot rzuca Urborg Uprising');
  assert.deepEqual((choice.targets ?? []).filter(Boolean), ['dead-creature-1']);
});

test('O: dwie kreatury w grobie — rzut z obiema (bez kary pustych slotów)', () => {
  const state = scena({ graveyardCreatures: 2 });
  const choice = botChoice(state);
  assert.equal(choice.objectId, 'uprising', 'bot rzuca Urborg Uprising');
  assert.equal(choice.targets.length, 2);
  assert.deepEqual([...choice.targets].sort(), ['dead-creature-1', 'dead-creature-2']);
});

test('O: dobranie niesie karę biblioteczną — przy 1 karcie w bibliotece nawet pełny zwrot nie ratuje rzutu', () => {
  const state = scena({ graveyardCreatures: 2, library: 1 });
  const choice = botChoice(state);
  assert.notEqual(choice.objectId, 'uprising',
    'dobranie ostatniej karty (deck-out, CR 704.5b) przebija zwrót dwóch kreatur');
});

test('O2: stopniowane pasmo biblioteczne — ≤5 kart bez rzutu, 6–10 tylko podwójny zwrot', () => {
  // Wątpliwość właściciela (2026-10-25): sama drabina drawDeckingPenalty
  // działa tylko do „pozostałe ≤3”, a dobranie przy 5 kartach odbiera
  // 1 z 5 rund życia. Tabela oczekiwana ze sceny (pełny zwrot 89 pkt,
  // jeden zwrot 30 pkt): pasmo graveReturnDrawLibrary* (margines 10,
  // baza 24, 12/karta) trzyma progową krawędź dokładnie w tych pasmach.
  const cases = [
    // [biblioteka, kreatur, rzuca]
    [2, 2, false], [3, 2, false], [4, 2, false],
    [5, 1, false], [5, 2, false],
    [6, 1, false], [6, 2, true],
    [9, 1, false], [9, 2, true],
    [10, 1, false], [10, 2, true],
    [11, 1, true], [11, 2, true],
  ];
  for (const [library, graveyardCreatures, casts] of cases) {
    const choice = botChoice(scena({ graveyardCreatures, library }));
    assert.equal(choice.objectId === 'uprising', casts,
      `biblioteka ${library}, kreatur w grobie ${graveyardCreatures}: oczekiwano ${casts ? 'rzutu' : 'passa'}, bot wybrał ${JSON.stringify(choice)}`);
  }
});

test('O2: kara dotyczy tylko czaru z dobraniem — Cemetery Recruitment bez doboru obojętne na bibliotekę', () => {
  const state = scena({ graveyardCreatures: 1, handCardId: 'cemetery-recruitment', handId: 'recruitment', library: 3 });
  const choice = botChoice(state);
  assert.equal(choice.objectId, 'recruitment', 'czar zwrotu bez ridera doboru nie płaci pasma bibliotecznego');
});

test('O: Cemetery Recruitment (cel WYMAGANY) dalej rzucane — reguła nie rusza zrealizowanych slotów', () => {
  const state = scena({ graveyardCreatures: 1, handCardId: 'cemetery-recruitment', handId: 'recruitment' });
  const choice = botChoice(state);
  assert.equal(choice.objectId, 'recruitment', 'bot dalej odzyskuje kreaturę czarem z wymaganym celem');
  assert.deepEqual((choice.targets ?? []).filter(Boolean), ['dead-creature-1']);
});
