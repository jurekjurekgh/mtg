// B5 (audyt stołu 2026-09-09, partie G1–G4 żywym testerem) — regresje LOGU:
// A: satyr_look_resolved (Prowler wroga: „bierze żadnego lądu"),
// C: perspektywa mass_stats_modified (buff wroga: „twoje stwory"),
// D: przyczyna zakrycia w LKI (martwy manifest: „Morph"),
// E: liczba mnoga („3 many bezbarwną"), clash/manifest nazwy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeGameEvent, manaEffectLabel, faceDownLabel, faceDownCauseTag, FACE_DOWN_LABEL,
} from '../src/table/session.js';
import { rememberLastKnownObject } from '../src/engine/objects.js';

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const RECAP_NAMES = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
const CARD_NAMES = { forest: 'Forest', 'manifest-dread': 'Manifest Dread' };
const helpers = {
  nameOf: (cardId) => CARD_NAMES[cardId] ?? cardId,
  nameOfObject: () => '?',
  isPlayer: (id) => NAMES[id] != null,
};

// A: rezygnacja (pickId null) — silnik daje wtedy licznik źródłu (Prowler).
test('B5/A: satyr declined — „nie bierze żadnego lądu" (z „nie")', () => {
  const text = describeGameEvent(
    { type: 'satyr_look_resolved', playerId: 'p2', count: 4, pickId: null, pickCardId: null },
    helpers, NAMES,
  );
  assert.equal(text, 'Nieprzyjaciel nie bierze żadnego lądu z wierzchu do ręki (wszystkie do grobu)');
});

// A: ukryty wybór wroga — landIds w silniku gwarantuje ląd, nazwy nie widać.
test('B5/A: satyr wroga (ukryty) — „bierze ląd", bez fallbacku „żadnego"', () => {
  const text = describeGameEvent(
    { type: 'satyr_look_resolved', playerId: 'p2', count: 4, pickId: 'hand-5', pickCardId: 'forest' },
    helpers, NAMES,
  );
  assert.equal(text, 'Nieprzyjaciel bierze ląd z wierzchu do ręki (reszta do grobu)');
});

// A: własny wybór — nazwa widoczna (druga osoba wyłączona, żeby piąć mechanizm).
test('B5/A: satyr własny — nazwa lądu dla właściciela', () => {
  const text = describeGameEvent(
    { type: 'satyr_look_resolved', playerId: 'p1', count: 4, pickId: 'hand-5', pickCardId: 'forest' },
    helpers, NAMES, { drugaOsoba: false },
  );
  assert.equal(text, 'Ty bierze Forest z wierzchu do ręki (reszta do grobu)');
});

// A: rekapitulacja dla AI (FoW) — ukryte także własne, bez przecieku nazwy.
test('B5/A: satyr w rekapitulacji (FoW) — „ląd" dla obu stron', () => {
  for (const pid of ['p1', 'p2']) {
    const text = describeGameEvent(
      { type: 'satyr_look_resolved', playerId: pid, count: 4, pickId: 'hand-5', pickCardId: 'forest' },
      helpers, RECAP_NAMES, { drugaOsoba: false, fogOfWar: true },
    );
    assert.match(text, /bierze ląd z wierzchu/);
    assert.doesNotMatch(text, /Forest/);
  }
});

// C: macierz perspektywy — fraza zależy od kontrolera źródła.
test('B5/C: mass buff własny (yours) — „twoje stwory"', () => {
  const text = describeGameEvent(
    { type: 'mass_stats_modified', playerId: 'p1', scope: 'yours', objectIds: ['a', 'b'], powerModifier: 2, toughnessModifier: 1, keywords: [] },
    helpers, NAMES,
  );
  assert.equal(text, 'twoje stwory (2 stwory): +2/+1 do końca tury');
});

test('B5/C: mass buff wroga (yours) — „stwory Nieprzyjaciela"', () => {
  const text = describeGameEvent(
    { type: 'mass_stats_modified', playerId: 'p2', scope: 'yours', objectIds: ['a', 'b'], powerModifier: 2, toughnessModifier: 0, keywords: [] },
    helpers, NAMES,
  );
  assert.equal(text, 'stwory Nieprzyjaciela (2 stwory): +2/+0 do końca tury');
});

test('B5/C: mass buff — scope opponents odwraca perspektywę', () => {
  const mine = describeGameEvent(
    { type: 'mass_stats_modified', playerId: 'p1', scope: 'opponents', objectIds: ['a'], powerModifier: -4, toughnessModifier: 0, keywords: [] },
    helpers, NAMES,
  );
  assert.match(mine, /^stwory Nieprzyjaciela \(1 stwór\): -4\/-0 do końca tury$/);
  const foe = describeGameEvent(
    { type: 'mass_stats_modified', playerId: 'p2', scope: 'opponents', objectIds: ['a'], powerModifier: -4, toughnessModifier: 0, keywords: [] },
    helpers, NAMES,
  );
  assert.match(foe, /^twoje stwory \(1 stwór\): -4\/-0 do końca tury$/);
});

test('B5/C: mass buff — your_lands wroga + attacking neutralne', () => {
  const lands = describeGameEvent(
    { type: 'mass_stats_modified', playerId: 'p2', scope: 'your_lands', objectIds: ['a'], powerModifier: 1, toughnessModifier: 1, keywords: [] },
    helpers, NAMES,
  );
  assert.match(lands, /^stwory-lądy Nieprzyjaciela \(1 stwór\): \+1\/\+1 do końca tury$/);
  const atk = describeGameEvent(
    { type: 'mass_stats_modified', playerId: 'p2', scope: 'attacking', objectIds: ['a'], powerModifier: 2, toughnessModifier: 0, keywords: [] },
    helpers, NAMES,
  );
  assert.match(atk, /^atakujące stwory \(1 stwór\): \+2\/\+0 do końca tury$/);
});

// D: LKI niesie przyczynę zakrycia — etykieta czyta ją ze snapshotu.
test('B5/D: LKI zachowuje faceDownCause — martwy manifest to „Manifest"', () => {
  const state = { lastKnownObjects: new Map() };
  rememberLastKnownObject(state, {
    id: 'o1', cardId: 'grizzly-bears', faceDown: true, faceDownCause: 'manifest', controllerId: 'p2',
  });
  const entry = state.lastKnownObjects.get('o1');
  assert.equal(entry.faceDownCause, 'manifest');
  assert.equal(faceDownCauseTag(entry), 'Manifest');
  assert.equal(faceDownLabel(entry, () => 'Grizzly Bears'), 'Grizzly Bears (Manifest)');
});

test('B5/D: brak przyczyny w LKI — fallback „Morph" bez zmian', () => {
  const state = { lastKnownObjects: new Map() };
  rememberLastKnownObject(state, { id: 'o2', cardId: null, faceDown: true, controllerId: 'p2' });
  const entry = state.lastKnownObjects.get('o2');
  assert.equal(entry.faceDownCause, null);
  assert.equal(faceDownCauseTag(entry), FACE_DOWN_LABEL);
});

// E: odmiana przymiotnika przy liczbie mnogiej.
test('B5/E: „dodaj 3 many bezbarwne" (mnoga), pojedyncza bez zmian', () => {
  assert.equal(manaEffectLabel({ amount: 1, colors: [] }), 'dodaj 1 manę bezbarwną');
  assert.equal(manaEffectLabel({ amount: 3, colors: [] }), 'dodaj 3 many bezbarwne');
});

// Clash: terminologia polska zamiast żargonu reguł.
test('B5: clash — „wartość many", nie „mana value"', () => {
  const text = describeGameEvent(
    { type: 'clash_resolved', playerId: 'p1', won: true, myManaValue: 4, opponentManaValue: 2 },
    helpers, NAMES,
  );
  assert.match(text, /wartość many 4 vs 2/);
  assert.doesNotMatch(text, /mana value/);
});

// Manifest Dread: nazwa źródła ze zdarzenia (klasa M162/C).
test('B5: manifest_dread_required — nazwa karty, nie slug „manifest dread"', () => {
  const text = describeGameEvent(
    { type: 'manifest_dread_required', playerId: 'p1', sourceCardId: 'manifest-dread' },
    helpers, NAMES,
  );
  assert.equal(text, 'Ty — Manifest Dread: wybór, którą z 2 kart z wierzchu zmanifestować');
});

test('B5: manifest_dread_required bez źródła — degradacja bez sluga', () => {
  const text = describeGameEvent(
    { type: 'manifest_dread_required', playerId: 'p1' },
    helpers, NAMES,
  );
  assert.equal(text, 'Ty — wybór, którą z 2 kart z wierzchu zmanifestować');
});
