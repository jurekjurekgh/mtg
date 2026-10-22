// Uwaga B właściciela z testów (2026-09-18): „Bot rzuca [Epic Experiment]
// za UR i X=0. To bez sensu kompletnie. Ta karta ma jakikolwiek sens jeśli
// X>0, im większe X tym lepiej (chyba że bot ma wyczerpaną talię). W momencie
// gdy bot rzucał ten czar mógł wydać many na X=5 i rzucić kilka czarów za
// darmo, a że ma w library 22 karty to nie grozi mu śmierć z braku kart
// w bibliotece. Scoring do naprawy.”
//
// Źródła (ADR 0030 — pobrane, nie z pamięci):
//  • Oracle (snapshot docs/cards/scryfall-epic-experiment.json): „Exile the
//    top X cards of your library. You may cast instant and sorcery spells
//    with mana value X or less from among them without paying their mana
//    costs. Then put all cards exiled this way that weren't cast into your
//    graveyard.” — przy X=0 efekt jest pusty.
//  • Rulingi WotC 2021-03-19 (api.scryfall.com/cards/otc/222/rulings)
//    dotyczą darmowych rzutów Z wygnanych kart (tam X=0 wymuszony), nie
//    wyboru X samego eksperymentu — wybór X zostaje po stronie rzucającego
//    (CR 107.3: wartość X wybiera się przy rzucie).
//
// Root cause: efekt `epic_experiment` nie miał ŻADNEJ wyceny
// w heuristic-bot (klasa L50) → wszystkie warianty X dostawały identyczne
// P.spellBase (50), a ogólna drobna kara za xValue (linia 5582) dawała
// przewagę X=0. Silnik oferuje każdy X osobno (legalXCostCasts) — wybór
// należał wyłącznie do wyceny.
//
// Kształt naprawy: wycena skaluje się z X (szansa darmowych rzutów rośnie),
// a ryzyko deck-outu liczy istniejący drawDeckingPenalty (CR 121.4/704.5b) —
// „chyba że bot ma wyczerpaną talię” (anty-over-fix B/4).
//
// Kolejna uwaga z testów (2026-10-22): nie rzucać, gdy X<3, i odłożyć tę
// sorcery do własnej Main 2, by Main 1 pozostała na inne sensowne zagrania.
// CR 307.1 pozwala rzucać sorcery w dowolnej własnej fazie głównej, gdy mamy
// priorytet i stos jest pusty; Main 2 jest więc polityką bota, nie regułą
// legalności. Ten próg dotyczy efektu `epic_experiment`, bez sprawdzania nazwy karty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function stan({ manaUR = 8, kartyBiblioteki = 22, step = 'main1' } = {}) {
  const state = createGameState({ seed: 23, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // Biblioteka p1 — wypełniacze (rozmiar jest informacją jawną, ADR 0017).
  for (let i = 0; i < kartyBiblioteki; i += 1) {
    const id = `lib${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
      zone: 'library', kind: 'creature', power: 2, toughness: 2,
      abilities: [], subtypes: [], types: ['Creature'], keywords: [],
    });
  }
  // Epic Experiment w ręce p1.
  const ee = gameObjectDataOf(REGISTRY.get('epic-experiment'));
  addObject(state, {
    id: 'ee', instanceId: 'i-ee', cardId: 'epic-experiment', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...ee,
  });
  // Pula {U}{R} + X generic (jednostki UR pokrywają pipy i resztę).
  if (manaUR > 0) addMana(state, 'p1', manaUR, { colors: ['U', 'R'] });
  return state;
}

function wybierzBota(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 23 });
  const chosen = bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const passScore = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? Number.NEGATIVE_INFINITY;
  return { view, chosen, passScore };
}

test('B/1: oferta niesie warianty X od 0 do maksimum (kontrakt silnika)', () => {
  const state = stan();
  const { view } = wybierzBota(state);
  const oferty = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'ee');
  assert.ok(oferty.length >= 7, `oferty X dla Epic Experiment: ${oferty.map((o) => o.xValue).join(',')}`);
  assert.deepEqual(oferty.map((o) => o.xValue), [0, 1, 2, 3, 4, 5, 6], 'X = 0..maxKoszt');
});

test('B/2: w Main 2 bot rzuca Epic Experiment z MAKSYMALNYM opłacalnym X', () => {
  const state = stan({ step: 'main2' }); // 8 UR → max X=6, biblioteka 22 (bezpieczna)
  const { chosen } = wybierzBota(state);
  assert.equal(chosen?.type, 'cast_spell', 'bot wybiera rzut, nie pass');
  assert.equal(chosen.objectId, 'ee');
  assert.equal(chosen.xValue, 6, 'bot wydaje całą dostępną manę na X');
});

test('B/3: Main 2, mana tylko na bazę {U}{R} → bot NIE rzuca za X=0 (pasuje)', () => {
  const state = stan({ manaUR: 2, step: 'main2' }); // oferta: wyłącznie X=0
  const { chosen, passScore } = wybierzBota(state);
  assert.notEqual(chosen?.type, 'cast_spell',
    `rzut za X=0 jest bezwartościowy — wybrano ${chosen?.type} (pass=${passScore})`);
});

test('B/4 (anty-over-fix): Main 2 + wyczerpująca biblioteka → bot nie ryzykuje deck-outu', () => {
  // 3 karty w bibliotece: każdy X>=3 dobija do dna (CR 121.4),
  // a X<3 jest poniżej progu użyteczności — bot pasuje.
  const state = stan({ kartyBiblioteki: 3, step: 'main2' });
  const { chosen } = wybierzBota(state);
  assert.notEqual(chosen?.type, 'cast_spell',
    'przy 3 kartach biblioteki Epic Experiment nie może się opłacać');
});

test('B/5: w Main 1 bot odkłada Epic Experiment, nawet gdy ma X>=3', () => {
  const state = stan({ step: 'main1' });
  const { chosen } = wybierzBota(state);
  assert.equal(chosen?.type, 'pass_priority',
    `Main 1 ma zostać na inne zagrania; wybrano ${chosen?.type} (${chosen?.objectId ?? ''})`);
});

test('B/6: w Main 2 bot nie rzuca Epic Experiment dla X<3', () => {
  const state = stan({ manaUR: 4, step: 'main2' }); // koszt {U}{R} + X; maksymalnie X=2
  const { chosen } = wybierzBota(state);
  assert.equal(chosen?.type, 'pass_priority',
    `bez X>=3 nie rzucamy; wybrano ${chosen?.type} (${chosen?.objectId ?? ''})`);
});

test('B/7: Main 1 nadal wykorzystuje manę na inną sensowną kartę', () => {
  const state = stan({ step: 'main1' });
  const shock = gameObjectDataOf(REGISTRY.get('shock'));
  addObject(state, {
    id: 'shock-card', instanceId: 'i-shock-card', cardId: 'shock',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...shock,
  });
  const { chosen } = wybierzBota(state);
  assert.equal(chosen?.objectId, 'shock-card',
    `bot powinien użyć Main 1 na Shock, a nie Epic Experiment (${chosen?.type}/${chosen?.objectId})`);
});
