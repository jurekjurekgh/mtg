import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { resolveTopOfStack } from '../src/engine/spells.js';

/**
 * M271 (błąd #13, CR 608.2b) — „If all its targets are illegal when it tries
 * to resolve, it doesn't resolve." Ścieżka ZDOLNOŚCI miała ten test od M90,
 * bliźniacza ścieżka CZARU MODALNEGO go nie miała: tryb, który stracił jedyny
 * cel, szedł dalej z pustą listą i wykonywał efekty NIECELOWANE.
 *
 * Strażnik KLASOWY: sprawdza regułę dla WSZYSTKICH trybów celowanych
 * w katalogu, nie dla jednej karty.
 */
const registry = createCardRegistry();

function naStosie(cardId, modeIndex, targets) {
  const descriptor = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 3; i += 1) {
      const filler = registry.get('highland-game');
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `il-${playerId}-${i}`, cardId: 'highland-game',
        controllerId: playerId, ownerId: playerId, zone: 'library',
        ...gameObjectDataOf(filler), types: filler.types,
      });
    }
  }
  addObject(state, {
    id: 'sp', instanceId: 'is', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'stack', ...gameObjectDataOf(descriptor), types: descriptor.types,
  });
  state.objects.set('sp', Object.freeze({
    ...state.objects.get('sp'),
    spell: descriptor.spell, chosenMode: modeIndex, chosenTargets: targets,
  }));
  state.events.length = 0;
  return state;
}

// Wszystkie tryby modalne w katalogu, które WYMAGAJĄ celu.
const tryby = [];
for (const descriptor of registry.all()) {
  if (!descriptor.spell?.modes) continue;
  descriptor.spell.modes.forEach((mode, index) => {
    const targets = mode.targets ?? descriptor.spell.targets ?? [];
    if (targets.length > 0) tryby.push({ cardId: descriptor.id, index, mode });
  });
}

test('katalog zawiera tryby modalne z celami (sanity)', () => {
  assert.ok(tryby.length >= 8, `znaleziono ${tryby.length} trybów celowanych`);
});

test('KLASA: każdy celowany tryb bez legalnego celu fizzluje (CR 608.2b)', () => {
  for (const { cardId, index } of tryby) {
    const state = naStosie(cardId, index, ['obiekt-ktory-zniknal']);
    resolveTopOfStack(state);
    const resolved = state.events.find((e) => e.type === 'spell_resolved');
    assert.ok(resolved, `${cardId}/${index}: czar zszedł ze stosu`);
    assert.equal(resolved.fizzled, true, `${cardId}/${index}: powinien fizzlować`);
    assert.equal(resolved.reason, 'no_legal_targets', `${cardId}/${index}: powód w logu`);
  }
});

test('KLASA: fizzle nie wykonuje ŻADNEGO efektu trybu (także niecelowanego)', () => {
  // „Your Temple Is Under Attack" tryb 1: cel = przeciwnik, efekt = obaj
  // gracze dobierają. Bez legalnego celu nikt nie może dobrać.
  const state = naStosie('your-temple-is-under-attack', 1, ['gracz-ktorego-nie-ma']);
  const przed = state.zones.hand.length;
  resolveTopOfStack(state);
  assert.equal(state.zones.hand.length, przed, 'żadnych dobrań przy fizzlu');
  assert.equal(state.events.filter((e) => e.type === 'card_drawn').length, 0);
});

test('kontrola negatywna: tryb BEZ celów rozstrzyga się normalnie', () => {
  const state = naStosie('your-temple-is-under-attack', 0, []);
  resolveTopOfStack(state);
  const resolved = state.events.find((e) => e.type === 'spell_resolved');
  assert.equal(resolved.fizzled, false, 'tryb bezcelowy nie fizzluje');
});

test('kontrola negatywna: tryb z LEGALNYM celem rozstrzyga się i działa', () => {
  const descriptor = registry.get('twiddle');
  const state = naStosie('twiddle', 0, ['stwor']);
  const bear = registry.get('highland-game');
  addObject(state, {
    id: 'stwor', instanceId: 'ic', cardId: 'highland-game', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(bear), types: bear.types,
  });
  assert.ok(descriptor.spell.modes[0].targets.length > 0);
  resolveTopOfStack(state);
  const resolved = state.events.find((e) => e.type === 'spell_resolved');
  assert.equal(resolved.fizzled, false, 'legalny cel => brak fizzla');
  assert.equal(state.objects.get('stwor').tapped, true, 'efekt trybu zaszedł');
});
