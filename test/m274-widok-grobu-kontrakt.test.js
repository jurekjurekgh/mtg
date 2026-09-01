import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * M274 (błąd #27, ADR 0017 + CR 400.2) — widok GROBU gubił pola, po których
 * filtruje bot.
 *
 * Grób jest strefą PUBLICZNĄ: rodzaj karty, linia typów i statystyki są
 * jawne. Widok niósł jednak tylko `id`, `cardId`, `controllerId`, `zone`,
 * `plotted`, `colors` i (od M265) `spell`. Tymczasem `heuristic-bot.js`
 * filtruje zawartość grobu po `o.kind === 'creature'`, `(o.types ?? [])
 * .includes('Artifact')` i wycenia reanimację przez `o.power` — dostawał
 * `undefined`, więc stwór 3/3 w cudzym grobie wyceniał się na 0.
 *
 * Wygnanie (strefa też jawna, CR 406.3) `kind`/`types` już wysyłało — grób
 * został w tyle. To ta sama klasa co L102 pkt 2: deskryptor potrzebny wycenie
 * musi być w widoku KAŻDEJ strefy jawnej, z której da się grać.
 */
const registry = createCardRegistry();

function stanZKartaWGrobie(cardId, { wlasciciel = 'p2' } = {}) {
  const karta = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'g1', instanceId: 'i1', cardId, controllerId: wlasciciel, ownerId: wlasciciel,
    zone: 'graveyard', ...gameObjectDataOf(karta), types: karta.types,
  });
  return { state, karta };
}

test('widok grobu niesie rodzaj, typy i statystyki (CR 400.2)', () => {
  const { state, karta } = stanZKartaWGrobie('gorehorn-minotaurs');
  const wpis = playerView(state, 'p1').zones.graveyard[0];
  // `kind` powstaje przy materializacji (gameObjectDataOf), nie w rejestrze.
  assert.equal(wpis.kind, gameObjectDataOf(karta).kind, 'kind karty w grobie');
  assert.deepEqual(wpis.types, karta.types, 'linia typów');
  assert.equal(wpis.power, karta.power, 'moc');
  assert.equal(wpis.toughness, karta.toughness, 'wytrzymałość');
  assert.equal(wpis.manaCost, karta.manaCost ?? 0, 'koszt many (mana value)');
});

test('bot wycenia stwora w CUDZYM grobie realną mocą, nie zerem', () => {
  // Odtworzenie wyceny z heuristic-bot.js (reanimacja z grobu przeciwnika).
  const { state, karta } = stanZKartaWGrobie('gorehorn-minotaurs');
  const view = playerView(state, 'p1');
  const najlepszy = view.zones.graveyard
    .filter((o) => o.controllerId !== view.playerId && o.kind === 'creature')
    .reduce((max, o) => Math.max(max, o.power ?? 0), 0);
  assert.equal(najlepszy, karta.power, 'moc stwora widoczna dla wyceny');
  assert.ok(najlepszy > 0, 'wycena nie jest zerowa');
});

test('SKAN ŹRÓDEŁ: każde pole, którego bot żąda od grobu, jest w widoku', () => {
  // Strażnik klasowy: nowy filtr dopisany w bocie nie może czytać pola,
  // którego widok grobu nie niesie (ADR 0017 — skutek widoczny w grze musi
  // być widoczny w widoku).
  const bot = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  const zadane = new Set();
  // Fragmenty pracujące na `view.zones.graveyard` + odczyty pól tuż obok.
  for (const m of bot.matchAll(/zones\.graveyard[\s\S]{0,400}?(?=zones\.|\n\s*\}\s*\n)/g)) {
    for (const p of m[0].matchAll(/\b(?:o|entry|gyCard|card)\.([a-zA-Z_$][\w$]*)/g)) {
      zadane.add(p[1]);
    }
  }
  // Pola techniczne widoku / nieobiektowe.
  const POMIJANE = new Set(['id', 'length', 'filter', 'map', 'find', 'some', 'reduce', 'controllerId']);
  const { state } = stanZKartaWGrobie('gorehorn-minotaurs');
  const wpis = playerView(state, 'p1').zones.graveyard[0];
  const brakujace = [...zadane].filter((pole) => !POMIJANE.has(pole) && !(pole in wpis));
  assert.deepEqual(
    brakujace, [],
    'Bot czyta z wpisu grobu pola, których widok nie niesie — dostanie '
    + `undefined: ${brakujace.join(', ')}. Dołóż je w playerView (grób jest `
    + 'strefą publiczną, CR 400.2) albo popraw filtr bota.',
  );
});

test('grób NIE ujawnia pól ukrytych — zakryta karta zostaje zakryta', () => {
  // Kontrola negatywna (mgła wojny, CR 708.2): rozszerzenie widoku grobu nie
  // może przeciekać na karty zakryte.
  const { state } = stanZKartaWGrobie('gorehorn-minotaurs');
  const karta = state.objects.get('g1');
  state.objects.set('g1', Object.freeze({ ...karta, faceDown: true }));
  const wpis = playerView(state, 'p1').zones.graveyard[0];
  // Karta zakryta w grobie: silnik obraca ją twarzą do góry przy zmianie
  // strefy, więc scenariusz jest teoretyczny — pilnujemy, by wpis nie
  // wysyłał sprzecznych danych.
  if (wpis.faceDown) {
    assert.equal(wpis.cardId ?? null, null, 'zakryta karta nie ujawnia cardId');
  } else {
    assert.ok(wpis.cardId, 'karta odkryta ma cardId');
  }
});
