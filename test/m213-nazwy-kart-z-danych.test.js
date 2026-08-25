// =============================================================================
// M213 — spłata długu ZAMROZONE: nazwa karty znika z KODU, ale NIE z ekranu.
//
// Strażnik `m212-brak-hardcodowanych-kart` pilnuje tylko jednej połowy umowy:
// że w `src/` nie ma literału z nazwą karty. Sam w sobie jest spełnialny
// najgorszym możliwym sposobem — wystarczy usunąć nazwę z opisu i gracz
// dostaje anonimowe „Wybierz kartę”, nie wiedząc, co pyta.
//
// Ten plik pilnuje drugiej połowy: nazwa nadal DOCIERA DO GRACZA, tylko
// pochodzi z danych zdarzenia (`sourceCardId` → helper `srcName`), a nie
// z literału w kodzie. Bez tego „czyszczenie” byłoby regresją UX udającą
// porządek (ADR 0002 zabrania rozgałęzień po karcie, nie informowania gracza).
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  isPlayer: (id) => id === 'p1' || id === 'p2',
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const opis = (event) => describeGameEvent(event, HELPERS, NAMES);

// Zdarzenia, w których UI miało dotąd ZASZYTĄ nazwę karty. Każde musi teraz
// wziąć ją z `sourceCardId`. Para: [zdarzenie, oczekiwana nazwa w tekście].
const PRZYPADKI = [
  ['fertile_thicket_reveal_started',
    { type: 'fertile_thicket_reveal_started', controllerId: 'p1', cardCount: 5, basicLandCount: 2, sourceCardId: 'fertile-thicket' },
    'Fertile Thicket'],
  ['fertile_thicket_resolved',
    { type: 'fertile_thicket_resolved', controllerId: 'p1', chosenCardId: 'basic-forest', sourceCardId: 'fertile-thicket' },
    'Fertile Thicket'],
  ['epic_experiment_started',
    { type: 'epic_experiment_started', playerId: 'p1', count: 3, cardIds: [], sourceCardId: 'epic-experiment' },
    'Epic Experiment'],
  ['epic_experiment_resolved',
    { type: 'epic_experiment_resolved', playerId: 'p1', count: 3, restToGrave: 2, sourceCardId: 'epic-experiment' },
    'Epic Experiment'],
  ['index_started',
    { type: 'index_started', playerId: 'p1', count: 3, sourceCardId: 'index' },
    'Index'],
  ['index_resolved',
    { type: 'index_resolved', playerId: 'p1', count: 3, order: [], sourceCardId: 'index' },
    'Index'],
  ['graveyard_top_choice_required',
    { type: 'graveyard_top_choice_required', playerId: 'p1', candidateIds: ['a'], sourceCardId: 'forever-young' },
    'Forever Young'],
  ['optional_draw_required',
    { type: 'optional_draw_required', playerId: 'p1', sourceCardId: 'force-away' },
    'Force Away'],
  ['hand_creature_choice_required',
    { type: 'hand_creature_choice_required', playerId: 'p1', candidates: ['a'], sourceCardId: 'dragon-arch' },
    'Dragon Arch'],
  ['reveal_order_resolved',
    { type: 'reveal_order_resolved', playerId: 'p1', total: 3, order: [], sourceCardId: 'stomping-slabs' },
    'Stomping Slabs'],
];

for (const [nazwaZdarzenia, event, oczekiwanaNazwa] of PRZYPADKI) {
  test(`M213: ${nazwaZdarzenia} bierze nazwę karty z danych zdarzenia`, () => {
    const tekst = opis(event);
    assert.ok(typeof tekst === 'string' && tekst.length > 0, `brak opisu dla ${nazwaZdarzenia}`);
    assert.ok(tekst.includes(oczekiwanaNazwa),
      `gracz musi wiedzieć, która karta pyta — „${oczekiwanaNazwa}” zniknęło z opisu: ${tekst}`);
  });
}

test('M213: bez sourceCardId opis nie pokazuje „undefined” ani pustego prefiksu', () => {
  // Źródło bywa nieznane (LKI, token, stary zapis partii). Wtedy opis ma być
  // po prostu bezimienny — nigdy „undefined: ” albo osierocony dwukropek.
  for (const [nazwaZdarzenia, event] of PRZYPADKI) {
    const bezZrodla = { ...event };
    delete bezZrodla.sourceCardId;
    const tekst = opis(bezZrodla);
    assert.ok(typeof tekst === 'string' && tekst.length > 0, `brak opisu dla ${nazwaZdarzenia}`);
    assert.ok(!/undefined|null/.test(tekst), `wyciek wartości pustej (${nazwaZdarzenia}): ${tekst}`);
    assert.ok(!tekst.startsWith(':'), `osierocony dwukropek (${nazwaZdarzenia}): ${tekst}`);
  }
});

test('M213: opis NIE nazywa karty, gdy źródłem jest INNA karta niż zaszyta dawniej', () => {
  // Sedno ADR 0002: mechanika bywa ochrzczona po pierwszej karcie, ale używa
  // jej potem kilka. Zaszyta nazwa kłamałaby — z danych ma wyjść ta właściwa.
  const tekst = opis({
    type: 'fertile_thicket_reveal_started',
    controllerId: 'p1', cardCount: 5, basicLandCount: 1,
    sourceCardId: 'roiling-regrowth',
  });
  assert.ok(!tekst.includes('Fertile Thicket'),
    `opis nazywa kartę, która NIE jest źródłem: ${tekst}`);
  assert.ok(tekst.includes('Roiling Regrowth'), `brak właściwego źródła: ${tekst}`);
});
