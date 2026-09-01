import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
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
  //
  // M274: pierwsza wersja tego skanu miała DWIE dziury i przepuściła dwie
  // realne ścieżki (Pyxis of Pandemonium, opóźniony powrót Plague Reavera):
  //  1. skanowała tylko `effects.js`, a ścieżki ETB są też w `triggers.js`
  //     i `game-state.js`;
  //  2. filtr wykluczał okno zawierające `faceDown` (żeby pominąć morph),
  //     ale Pyxis ustawia `faceDown: false`, czyli ODKRYWA kartę — wykluczenie
  //     złapało ścieżkę, która liczniki dostać powinna.
  // Wniosek (L12): filtr wyciszający musi opisywać INTENCJĘ (wejście zakryte),
  // nie przypadkowy ciąg znaków.
  const PLIKI = ['src/engine/effects.js', 'src/engine/triggers.js', 'src/engine/game-state.js'];
  for (const plik of PLIKI) {
    const linie = fs.readFileSync(plik, 'utf8').split('\n');
    linie.forEach((linia, index) => {
      if (!/moveObjectDirectly\(state, [^,]+, 'battlefield'/.test(linia)) return;
      const okno = linie.slice(index, index + 16).join('\n');
      // Żeton i kopia nie mają karty źródłowej z licznikami wejścia; permanent
      // wchodzący ZAKRYTY ich nie dostaje (CR 708.2) — ale `faceDown: false`
      // to jawne odkrycie, więc nie wycisza.
      if (/token|createToken|enterAsCopy|manifest|cloak/i.test(okno)) return;
      if (/faceDown:\s*(true|Boolean\()/.test(okno)) return;
      assert.ok(
        /applyEnterCounters|entersWithCounters/.test(okno),
        `${plik}:${index + 1} — permanent wchodzi na pole bitwy bez obsługi `
        + 'liczników wejścia (CR 121.6). Zawołaj applyEnterCounters(state, id).',
      );
    });
  }
});

test('M274: Pyxis wprowadza permanent z wygnania Z licznikami wejścia', () => {
  // „Turns face up all cards they own exiled with this artifact, then puts all
  // permanent cards among them onto the battlefield" — karta jest ODKRYWANA
  // przed wejściem, więc liczniki wejścia jej przysługują (CR 121.6).
  const cardId = 'servant-of-the-scale';
  const karta = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'ex1', instanceId: 'iex1', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'exile', ...gameObjectDataOf(karta), types: karta.types,
  });
  state.objects.set('ex1', Object.freeze({ ...state.objects.get('ex1'), faceDown: true }));
  const zrodlo = registry.get('twiddle');
  addObject(state, {
    id: 'pyx', instanceId: 'ipyx', cardId: 'twiddle', controllerId: 'p1', ownerId: 'p1',
    zone: 'graveyard', ...gameObjectDataOf(zrodlo), types: zrodlo.types,
  });
  state.objects.set('pyx', Object.freeze({ ...state.objects.get('pyx'), exiledCardIds: ['ex1'] }));

  applyEffect(state, { type: 'turn_up_exiled_and_put_permanents' }, state.objects.get('pyx'), []);

  const permanent = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && o.cardId === cardId);
  assert.ok(permanent, 'permanent wszedł na pole bitwy');
  assert.equal(permanent.faceDown, false, 'karta została odkryta przed wejściem');
  assert.equal(permanent.counters?.['+1/+1'] ?? 0, 1, 'licznik wejścia nadany');
});

test('M274: wprowadzenie stwora z RĘKI (Dragon Arch) nadaje liczniki wejścia', () => {
  const cardId = 'servant-of-the-scale';
  const karta = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'h1', instanceId: 'ih1', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(karta), types: karta.types,
  });
  state.pendingHandCreature = { playerId: 'p1', candidateIds: ['h1'], sourceCardId: null };

  const wynik = execute(state, { type: 'resolve_hand_creature', playerId: 'p1', targetId: 'h1' });
  assert.equal(wynik.ok, true, `komenda przyjęta (${wynik.error ?? ''})`);

  const permanent = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && o.cardId === cardId);
  assert.ok(permanent, 'stwór wszedł na pole bitwy');
  assert.equal(permanent.counters?.['+1/+1'] ?? 0, 1, 'licznik wejścia nadany');
});

test('M274 (#26, CR 702.54a): BLOODTHIRST działa przy reanimacji, nie tylko przy rzucie', () => {
  // „Bloodthirst N (If an opponent was dealt damage this turn, this creature
  // enters with N +1/+1 counters on it)" — słowo kluczowe WYDRUKOWANE na
  // karcie jest efektem zastępującym WEJŚCIE, więc obowiązuje także wtedy,
  // gdy permanent trafia na pole bitwy bez rzucania.
  // (Ruling Bloodghasta: rzutu wymaga tylko bloodthirst NADANY czarom przez
  // inny permanent — takiego efektu silnik nie zna.)
  const cardId = 'gorehorn-minotaurs';
  const karta = registry.get(cardId);
  assert.ok(karta.bloodthirst > 0, 'warunek wstępny: karta ma bloodthirst');

  for (const typ of ['return_permanent_from_graveyard', 'return_to_battlefield_tapped']) {
    const { state } = stanZKarta(cardId);
    // Warunek bloodthirst SPEŁNIONY: przeciwnik dostał obrażenia w tej turze.
    state.dealtDamageToOpponentThisTurn = { p1: true };
    applyEffect(state, { type: typ }, state.objects.get('src'), ['g1']);
    const permanent = [...state.objects.values()]
      .find((o) => o.zone === 'battlefield' && o.cardId === cardId);
    assert.equal(
      permanent.counters?.['+1/+1'] ?? 0, karta.bloodthirst,
      `${typ}: bloodthirst ${karta.bloodthirst} nadany przy wejściu`,
    );
  }
});

test('M274: bloodthirst NIE działa, gdy przeciwnik nie oberwał w tej turze', () => {
  // Kontrola negatywna — inaczej test wyżej byłby zielony także wtedy, gdyby
  // liczniki nadawano bezwarunkowo.
  const { state } = stanZKarta('gorehorn-minotaurs');
  state.dealtDamageToOpponentThisTurn = {};
  applyEffect(state, { type: 'return_permanent_from_graveyard' }, state.objects.get('src'), ['g1']);
  const permanent = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && o.cardId === 'gorehorn-minotaurs');
  assert.equal(permanent.counters?.['+1/+1'] ?? 0, 0, 'brak liczników bez spełnionego warunku');
});
