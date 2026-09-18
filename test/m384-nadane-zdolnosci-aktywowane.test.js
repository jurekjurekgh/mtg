// M384 (znalezisko #2 wyzwania „srebrna odznaka", ADR 0030): zdolność
// aktywowana NADANA cudzą zdolnością statyczną — oferta bez wykonania.
//
// Źródła online (dostęp 2026-09-18):
//  • Oracle Enduring Sliver (MH1):
//    https://api.scryfall.com/cards/named?exact=Enduring%20Sliver
//    „Outlast {2} ({2}, {T}: Put a +1/+1 counter on this creature. Outlast
//     only as a sorcery.) / Other Sliver creatures you control have outlast {2}."
//    https://api.scryfall.com/cards/6ed0f6a5-ed40-44fc-a5e1-3f8bb968d1d9/rulings
//    — lista rulings WotC PUSTA (brak dodatkowych rozstrzygnięć karty).
//  • CR 702.107a (cytat za https://mtg.wiki/page/Outlast, wydanie CR
//    2026-08-07): „Outlast is an activated ability. »Outlast [cost]« means
//    »[Cost], {T}: Put a +1/+1 counter on this creature. Activate only as a
//    sorcery.«"
//  • CR 604.2 (MagicCompRules 2026-08-19, efektywne 2026-08-07; chunk 41):
//    „Static abilities create continuous effects ... These effects are active
//     as long as the permanent with the ability remains on the battlefield and
//     has the ability" — nadanie jest efektem CIĄGŁYM, nie jednorazowym.
//  • CR 602.2a + 602.2b (ten sam dokument, chunk 38): „Only an object's
//    controller ... can activate its activated ability"; aktywacja idzie
//    krokami 601.2b–i.
//  • Khans of Tarkir Release Notes (2014-09-18, cytowane na
//    https://mtg.wiki/page/Outlast): „The cost to activate a creature's
//    outlast ability includes the tap symbol. A creature's outlast ability
//    can't be activated unless that creature has been under your control
//    continuously since the beginning of your turn."
//
// Stan przed M384: oferta (`legalActivatedAbilities`) i walidacja
// (`activateAbility`) enumerowały `activatableAbilities` (zdolności własne +
// nadane cudzą statyką), ale WYKONANIE (`performActivation`) czytało
// `object.abilities[abilityIndex]`. Dla zdolności nadanej indeks leży poza
// listą własną, więc silnik publikował komendę `activate_ability`, a potem
// odrzucał JĄ SAMĄ: „Nieznana zdolność aktywowana" (klasa L48 — oferta ≠
// wykonanie; CR 604.2 + 602.2a mówią, że ta zdolność jest aktywowalna).
//
// Piny: (A) oferta nadanego outlastu istnieje (kontrola), (B) wykonanie
// oferty jest PRZYJMOWANE, płaci {2} i {T} oraz po rozstrzygnięciu daje
// +1/+1, (C) zdolność WŁASNA changelinga (indeks 0) nadal działa (regresja
// indeksów po zmianie źródła zdolności), (D) choroba przywołania blokuje
// nadany outlast (koszt {T}), (E) „Other Sliver creatures" nie nadaje
// outlastu samemu Enduring Sliverowi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { activatableAbilities } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();
const SLIVER = 'enduring-sliver';       // „Other Sliver creatures you control have outlast {2}"
const CHANGELING = 'barkform-harvester'; // changeling (CR 702.73a) → jest Sliverem; własna zdolność {2}

/** Partia: Enduring Sliver + changeling-Sliver u p1, mana w puli. */
function scenario({ summoningSickness = false, graveyardCard = false } = {}) {
  const state = createGameState({ seed: 384, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 13;
  state.pendingMulligans = [];
  const put = (id, cardId, playerId, zone) => {
    const card = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
      cardName: card.name, ...gameObjectDataOf(card),
    });
    return state.objects.get(id);
  };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 8; i += 1) put(`lib-${pid}-${i}`, 'basic-forest', pid, 'library');
  }
  for (let i = 0; i < 6; i += 1) put(`forest-${i}`, 'basic-forest', 'p1', 'battlefield');
  put('sliver', SLIVER, 'p1', 'battlefield');
  const changeling = put('changeling', CHANGELING, 'p1', 'battlefield');
  if (summoningSickness) {
    state.objects.set('changeling', Object.freeze({ ...state.objects.get('changeling'), summoningSickness: true }));
  }
  if (graveyardCard) put('gy-1', 'shock', 'p1', 'graveyard');
  state.players = state.players.map((player) => (player.id === 'p1'
    ? { ...player, mana: 20, manaPool: { G: 4 } } : player));
  return { state, changeling };
}

/** Przewija stos (passy do skutku) — aktywowane zdolności idą na stos (CR 602.2a). */
function resolveStack(state) {
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((command) => command.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

const outlastOffer = (state) => playerView(state, 'p1').legalCommands
  .filter((command) => command.type === 'activate_ability' && command.objectId === 'changeling')
  .find((command) => activatableAbilities(state, state.objects.get('changeling'))[command.abilityIndex]?.keyword === 'outlast');

test('M384/A: oferta zawiera outlast NADANY changelingowi przez Enduring Sliver', () => {
  const { state } = scenario();
  // Barkform Harvester ma changeling → jest każdym typem stworów, więc
  // podlega statyce „Other Sliver creatures you control have outlast {2}".
  const activatable = activatableAbilities(state, state.objects.get('changeling'));
  assert.equal(activatable.length, 2, 'własna zdolność + nadany outlast');
  assert.equal(activatable[1].keyword, 'outlast', 'nadany outlast z deskryptora statyki');
  const offer = outlastOffer(state);
  assert.ok(offer, 'oferta aktywacji nadanego outlastu istnieje w playerView');
  assert.equal(offer.abilityIndex, 1, 'indeks liczy się względem listy aktywowalnych');
});

test('M384/B: wykonanie oferty nadanego outlastu jest PRZYJMOWANE (CR 604.2 + 602.2a)', () => {
  const { state } = scenario();
  const offer = outlastOffer(state);
  assert.ok(offer, 'oferta istnieje');
  const result = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: offer.objectId, abilityIndex: offer.abilityIndex,
  });
  assert.equal(result.ok, true, 'komenda z oferty musi być przyjęta (klasa L48)');
  // Koszt: {2} z puli + {T} źródła (CR 702.107a).
  assert.equal(state.players.find((player) => player.id === 'p1').manaPool.G, 2, 'zapłacono {2}');
  assert.equal(state.objects.get('changeling').tapped, true, 'outlast tapuje źródło ({T})');
  resolveStack(state);
  assert.equal(state.objects.get('changeling').counters['+1/+1'], 1, 'efekt: +1/+1 po rozstrzygnięciu');
});

test('M384/C: zdolność WŁASNA nosiciela (indeks 0) nadal działa — brak przesunięcia indeksów', () => {
  const { state } = scenario({ graveyardCard: true });
  const own = playerView(state, 'p1').legalCommands
    .find((command) => command.type === 'activate_ability' && command.objectId === 'changeling' && command.abilityIndex === 0);
  assert.ok(own, 'własna zdolność {2} nadal oferowana z indeksem 0');
  const result = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'changeling', abilityIndex: 0, targets: ['gy-1'],
  });
  assert.equal(result.ok, true, 'własna zdolność działa po zmianie źródła zdolności w performActivation');
  resolveStack(state);
  const onBottom = state.zones.library.some((id) => state.objects.get(id)?.cardId === 'shock');
  assert.ok(onBottom, 'karta z grobu wróciła na spód biblioteki');
});

test('M384/D: choroba przywołania blokuje nadany outlast (koszt {T}, CR 302.6)', () => {
  const { state } = scenario({ summoningSickness: true });
  assert.equal(outlastOffer(state), undefined, 'bez haste nadany outlast z {T} nie jest oferowany w turze wejścia');
  // Kontrola: własna zdolność bez {T} zostaje (koszt {2}, instant).
  const own = playerView(state, 'p1').legalCommands
    .find((command) => command.type === 'activate_ability' && command.objectId === 'changeling' && command.abilityIndex === 0);
  assert.equal(own, undefined, 'własna zdolność wymaga celu — brak karty w grobie');
});

test('M384/E: „Other Sliver" nie nadaje outlastu samemu Enduring Sliverowi', () => {
  const { state } = scenario();
  const sliver = state.objects.get('sliver');
  // Uwaga: `activatableAbilities` zwraca CAŁĄ listę zdolności obiektu (także
  // statyczną, która nadaje outlast) — liczymy tylko aktywowane.
  const activated = activatableAbilities(state, sliver).filter((ability) => ability.type === 'activated');
  assert.equal(activated.length, 1, 'tylko WYDRUKOWANE outlast, bez kopii z własnej statyki („Other Sliver")');
  assert.equal(activated.filter((ability) => ability.keyword === 'outlast').length, 1, 'statyka nie nadaje zdolności samemu źródłu');
  const offers = playerView(state, 'p1').legalCommands
    .filter((command) => command.type === 'activate_ability' && command.objectId === 'sliver');
  assert.equal(offers.length, 1, 'jedna oferta (własny outlast)');
  assert.equal(offers[0].abilityIndex, 0);
});
