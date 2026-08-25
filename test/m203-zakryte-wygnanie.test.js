// M203 (pętla jakości Żywym Testerem — srodziemie vs theros, seed 29):
// w modalu „Rozgrywka" pojawiło się „? zostaje wygnany" ×2. Detektor testera
// zgłosił to jako placeholder w tekście dla gracza.
//
// Źródło: Pyxis of Pandemonium — „{T}: Each player exiles the top card of
// their library face down." Zdarzenie `object_exiled` jest emitowane BEZ
// `cardId` i z `faceDown: true`, bo zakryta karta nie jest informacją publiczną
// (CR 708 — nie zna jej nawet właściciel; ADR 0003, lekcja L45). Czyli brak
// nazwy jest TU TREŚCIĄ reguły, a log i tak renderował `nameOf(undefined)`
// jako „?" — placeholder, który wygląda jak brak danych (klasa L29/M200-M2).
//
// Reguła: gdy reguła gry ukrywa informację, interfejs ma to NAZWAĆ
// („zakryta karta"), a nie wyświetlać pustego znacznika.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HELPERS = { nameOf: (c) => c ?? '?', nameOfObject: () => '?', isPlayer: (id) => id === 'human' };

test('M203: zakryte wygnanie jest nazwane wprost, bez „?" i bez zdradzania karty', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const line = String(describeGameEvent({
    type: 'object_exiled', playerId: 'foe', objectId: 'exile-9', faceDown: true,
  }, HELPERS, { human: 'Ty', foe: 'Nieprzyjaciel' }));
  assert.ok(line.length > 0, 'opis istnieje');
  assert.ok(!line.includes('?'), `brak placeholdera w tekście dla gracza: ${line}`);
  assert.match(line, /[Zz]akryt/, `opis mówi, że karta jest zakryta: ${line}`);
});

test('M203 (anty-over-fix): zwykłe wygnanie dalej nazywa kartę', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const line = String(describeGameEvent({
    type: 'object_exiled', playerId: 'human', objectId: 'o1', cardId: 'Rust',
  }, HELPERS, { human: 'Ty', foe: 'Nieprzyjaciel' }));
  assert.match(line, /Rust/, `nazwa karty zostaje w logu: ${line}`);
  assert.doesNotMatch(line, /\?/, 'bez placeholdera');
});

test('M203: opóźnione wygnanie (delayed trigger) zachowuje swoją adnotację', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const line = String(describeGameEvent({
    type: 'object_exiled', playerId: 'human', objectId: 'o1', cardId: 'Rust', delayed: true,
  }, HELPERS, { human: 'Ty', foe: 'Nieprzyjaciel' }));
  assert.match(line, /opóźniony trigger/, `adnotacja zostaje: ${line}`);
});
