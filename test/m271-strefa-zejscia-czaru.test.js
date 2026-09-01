import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { resolveTopOfStack } from '../src/engine/spells.js';

/**
 * M271 (błąd #14, CR 118.9) — „If that spell would be put into a graveyard
 * this turn, exile it instead" (Halo Forager, znacznik
 * `exileInsteadOfGraveyard`). Regułę „gdzie ląduje czar po zejściu ze stosu"
 * liczyły RÓWNOLEGLE cztery miejsca w spells.js; dwie ścieżki modalne szły
 * na sztywno do grobu, więc czar rzucony z grobu Foragerem WRACAŁ do grobu
 * i dawał się rzucić ponownie.
 *
 * Strażnik KLASOWY: pilnuje RÓWNOWAŻNOŚCI wszystkich ścieżek zejścia,
 * a nie zachowania jednej karty.
 */
const registry = createCardRegistry();

function rozstrzygnij(cardId, extra) {
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
    ...state.objects.get('sp'), spell: descriptor.spell, ...extra,
  }));
  state.events.length = 0;
  resolveTopOfStack(state);
  const resolved = state.events.find((e) => e.type === 'spell_resolved');
  return { resolved, zone: resolved?.toId ? state.objects.get(resolved.toId)?.zone : null };
}

// Ścieżki zejścia czaru ze stosu, po jednej reprezentatywnej sytuacji.
const sciezki = [
  ['zwykły czar', 'twiddle', { chosenTargets: ['brak-celu'] }],
  ['tryb modalny (rozstrzygnięty)', 'your-temple-is-under-attack', { chosenMode: 0, chosenTargets: [] }],
  ['tryb modalny (fizzle)', 'vandalize', { chosenMode: 0, chosenTargets: ['brak-celu'] }],
];

test('KLASA: każda ścieżka zejścia honoruje exileInsteadOfGraveyard', () => {
  for (const [nazwa, cardId, extra] of sciezki) {
    const { zone } = rozstrzygnij(cardId, { ...extra, exileInsteadOfGraveyard: true });
    assert.equal(zone, 'exile', `${nazwa}: czar Foragera musi iść na wygnanie`);
  }
});

test('kontrola negatywna: bez znacznika każda ścieżka idzie do grobu', () => {
  for (const [nazwa, cardId, extra] of sciezki) {
    const { zone } = rozstrzygnij(cardId, extra);
    assert.equal(zone, 'graveyard', `${nazwa}: normalnie grób`);
  }
});

test('CR 702.34b: flashback wysyła czar modalny na wygnanie', () => {
  const { zone } = rozstrzygnij('your-temple-is-under-attack', {
    chosenMode: 0, chosenTargets: [], flashedBack: true,
  });
  assert.equal(zone, 'exile');
});

test('znacznik nie zmienia treści rozstrzygnięcia, tylko strefę', () => {
  const bez = rozstrzygnij('vandalize', { chosenMode: 0, chosenTargets: ['brak-celu'] });
  const ze = rozstrzygnij('vandalize', { chosenMode: 0, chosenTargets: ['brak-celu'], exileInsteadOfGraveyard: true });
  assert.equal(bez.resolved.fizzled, ze.resolved.fizzled, 'fizzle bez zmian');
  assert.equal(bez.resolved.modeIndex, ze.resolved.modeIndex, 'tryb bez zmian');
  assert.notEqual(bez.zone, ze.zone, 'różni je wyłącznie strefa docelowa');
});
