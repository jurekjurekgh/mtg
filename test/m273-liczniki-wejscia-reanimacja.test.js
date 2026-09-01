import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect, applyEnterCounters } from '../src/engine/effects.js';

/**
 * M273 (błąd #24, CR 121.6 + 614.1c) — „enters with a +1/+1 counter on it"
 * to efekt zastępujący samo WEJŚCIE na pole bitwy, więc obowiązuje przy
 * KAŻDYM wejściu: rzucie czaru, reanimacji z cmentarza, wprowadzeniu efektem.
 *
 * Cechę obsługiwała wyłącznie ścieżka rozstrzygnięcia czaru permanentu.
 * Rodzina reanimacji wprowadzała permanent gołym `moveObjectDirectly`, więc
 * Servant of the Scale wracał jako 0/0 i ginął natychmiast (CR 704.5f),
 * Trigon of Corruption tracił trzy liczniki charge, a Kappa Tech-Wrecker
 * deathtouch. Znalezione analizatorem choke pointów (ADR 0027).
 */
const registry = createCardRegistry();

// Karty, których TOŻSAMOŚĆ zależy od liczników wejścia (dane z rejestru,
// nie z nazw w kodzie — ADR 0002).
const KARTY_Z_LICZNIKAMI = ['servant-of-the-scale', 'trigon-of-corruption', 'kappa-tech-wrecker'];

// `reanimate_under_your_control` (Puppeteer Clique) przyjmuje wyłącznie karty
// STWORÓW — artefaktowy Trigon of Corruption nie jest dla niej legalnym celem,
// więc ścieżki testujemy z deklaracją, jakie rodzaje kart obsługują.
const SCIEZKI_REANIMACJI = [
  { typ: 'return_to_battlefield_tapped', tylkoStwory: false },
  { typ: 'return_permanent_from_graveyard', tylkoStwory: false },
  { typ: 'reanimate_under_your_control', tylkoStwory: true },
];

function stanZKarta(cardId) {
  const karta = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'g1', instanceId: 'ig1', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'graveyard', ...gameObjectDataOf(karta), types: karta.types,
  });
  const zrodlo = registry.get('twiddle');
  addObject(state, {
    id: 'src', instanceId: 'isrc', cardId: 'twiddle', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(zrodlo), types: zrodlo.types,
  });
  state.events.length = 0;
  return { state, oczekiwane: karta.entersWithCounters };
}

test('warunek wstępny: rejestr ma karty z licznikami wejścia', () => {
  for (const cardId of KARTY_Z_LICZNIKAMI) {
    const karta = registry.get(cardId);
    assert.ok(karta, `karta ${cardId} istnieje w rejestrze`);
    assert.ok(
      Object.keys(karta.entersWithCounters ?? {}).length > 0,
      `${cardId} ma zdefiniowane entersWithCounters`,
    );
  }
});

test('KLASA: każda ścieżka reanimacji nadaje liczniki wejścia (CR 121.6)', () => {
  for (const cardId of KARTY_Z_LICZNIKAMI) {
    for (const { typ, tylkoStwory } of SCIEZKI_REANIMACJI) {
      const jestStworem = (registry.get(cardId).types ?? []).includes('Creature');
      if (tylkoStwory && !jestStworem) continue;
      const { state, oczekiwane } = stanZKarta(cardId);
      applyEffect(state, { type: typ }, state.objects.get('src'), ['g1']);
      const permanent = [...state.objects.values()]
        .find((o) => o.zone === 'battlefield' && o.cardId === cardId);
      assert.ok(permanent, `${typ}/${cardId}: permanent wszedł na pole bitwy`);
      for (const [nazwa, ile] of Object.entries(oczekiwane)) {
        assert.equal(
          permanent.counters?.[nazwa] ?? 0, ile,
          `${typ}/${cardId}: licznik ${nazwa} nadany przy wejściu`,
        );
      }
    }
  }
});

test('Servant of the Scale po reanimacji nie jest 0/0', () => {
  // Sedno błędu: bez licznika wejścia stwór 0/0 ginie od razu (CR 704.5f),
  // więc reanimacja była bezużyteczna, a gracz nie wiedział dlaczego.
  const { state } = stanZKarta('servant-of-the-scale');
  applyEffect(state, { type: 'reanimate_under_your_control' }, state.objects.get('src'), ['g1']);
  const permanent = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && o.cardId === 'servant-of-the-scale');
  assert.ok((permanent.counters?.['+1/+1'] ?? 0) > 0, 'ma licznik +1/+1, więc przeżyje SBA');
});

test('helper pomija permanent ZAKRYTY (CR 708.2)', () => {
  // Kontrola negatywna dla samego helpera: morph/manifest jest bezimiennym
  // 2/2 bez zdolności, więc liczników wejścia nie dostaje.
  // Uwaga: `faceDown` ustawiamy na permanencie JUŻ NA POLU BITWY — zmiana
  // strefy resetuje to pole (objects.js: CR 400.7, nowy obiekt), więc
  // ustawianie go na karcie w grobie niczego by nie dowiodło.
  const { state } = stanZKarta('servant-of-the-scale');
  applyEffect(state, { type: 'return_permanent_from_graveyard' }, state.objects.get('src'), ['g1']);
  const wszedl = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && o.cardId === 'servant-of-the-scale');
  const czysty = Object.freeze({ ...wszedl, counters: {}, faceDown: true });
  state.objects.set(wszedl.id, czysty);
  applyEnterCounters(state, wszedl.id);
  assert.equal(
    state.objects.get(wszedl.id).counters?.['+1/+1'] ?? 0, 0,
    'zakryty permanent nie dostaje liczników wejścia',
  );
});

test('SKAN ŹRÓDEŁ: każda ścieżka wprowadzająca permanent zna liczniki wejścia', () => {
  // Strażnik klasowy (wariant L107/15): nowa ścieżka ETB dopisana w
  // przyszłości też musi obsłużyć liczniki wejścia — albo przez helper
  // `applyEnterCounters`, albo jawnie przez `entersWithCounters`.
  const zrodlo = fs.readFileSync('src/engine/effects.js', 'utf8');
  const linie = zrodlo.split('\n');
  linie.forEach((linia, index) => {
    if (!/moveObjectDirectly\(state, [^,]+, 'battlefield'/.test(linia)) return;
    const okno = linie.slice(index, index + 16).join('\n');
    // Żeton i kopia nie mają karty źródłowej z licznikami wejścia.
    if (/token|createToken|enterAsCopy|manifest|cloak|faceDown/i.test(okno)) return;
    assert.ok(
      /applyEnterCounters|entersWithCounters/.test(okno),
      `effects.js:${index + 1} — permanent wchodzi na pole bitwy bez obsługi `
      + 'liczników wejścia (CR 121.6). Zawołaj applyEnterCounters(state, id).',
    );
  });
});
