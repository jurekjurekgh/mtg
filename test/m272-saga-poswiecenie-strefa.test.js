import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { processTriggers } from '../src/engine/triggers.js';
import { resolveTopOfStack } from '../src/engine/spells.js';
import { event } from '../src/protocol/types.js';

/**
 * M272 (błąd #17, CR 704.5s + 122.1e) — po ostatnim rozdziale kontroler
 * POŚWIĘCA Sagę. Poświęcenie to śmierć permanenta, więc obowiązuje
 * zastąpienie strefy (`deathZoneFor`: licznik finality / „exile it instead").
 * M269 (błąd #5) sprowadził cztery ścieżki poświęcenia do wspólnego helpera,
 * ale ścieżka Sagi w `triggers.js` została na sztywnym grobie — Saga
 * z finality dawała się odzyskać z cmentarza.
 *
 * Strażnik KLASOWY: sprawdza regułę dla WSZYSTKICH Sag w katalogu oraz
 * pilnuje, by żaden emiter `permanent_sacrificed` nie wracał do sztywnego grobu.
 */
const registry = createCardRegistry();
const sagi = registry.all().filter((d) => d.saga != null);

function dobijSage(cardId, { finality = false } = {}) {
  const descriptor = registry.get(cardId);
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 's', instanceId: 'is', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(descriptor),
    types: descriptor.types, subtypes: descriptor.subtypes,
  });
  const chapters = descriptor.saga.chapters.length;
  state.objects.set('s', Object.freeze({
    ...state.objects.get('s'), saga: descriptor.saga,
    counters: Object.freeze({ lore: chapters - 1 }),
  }));
  if (finality) addCounter(state, 's', 'finality', 1);
  state.turn.activePlayerId = 'p1';
  state.events.length = 0;
  processTriggers(state, [event('step_advanced', { step: 'main1', phase: 'precombat_main' })]);
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 20) { resolveTopOfStack(state); guard += 1; }
  const sacrificed = state.events.find((e) => e.type === 'permanent_sacrificed');
  return { state, sacrificed, zone: sacrificed ? state.objects.get(sacrificed.objectId)?.zone : null };
}

test('katalog zawiera Sagi (sanity)', () => {
  assert.ok(sagi.length >= 3, `znaleziono ${sagi.length} Sag`);
});

test('KLASA: Saga z licznikiem finality idzie na WYGNANIE (CR 122.1e)', () => {
  for (const descriptor of sagi) {
    const { sacrificed, zone } = dobijSage(descriptor.id, { finality: true });
    assert.ok(sacrificed, `${descriptor.id}: Saga została poświęcona (CR 704.5s)`);
    assert.equal(zone, 'exile', `${descriptor.id}: finality przekierowuje na wygnanie`);
  }
});

test('KLASA: kontrola negatywna — bez finality Saga idzie do grobu', () => {
  for (const descriptor of sagi) {
    const { sacrificed, zone } = dobijSage(descriptor.id);
    assert.ok(sacrificed, `${descriptor.id}: poświęcona`);
    assert.equal(zone, 'graveyard', `${descriptor.id}: normalnie cmentarz`);
  }
});

test('zdarzenie poświęcenia niesie strefę zgodną ze stanem', () => {
  for (const finality of [false, true]) {
    const { state, sacrificed, zone } = dobijSage(sagi[0].id, { finality });
    assert.equal(sacrificed.toZone, zone, 'log zgodny ze stanem');
    assert.ok(state.zones[zone].includes(sacrificed.objectId), 'obiekt wpisany do strefy');
    assert.ok(!state.zones.battlefield.includes('s'), 'zdjęty z pola bitwy');
  }
});

test('KLASA: żaden emiter permanent_sacrificed nie przenosi na sztywno do grobu', () => {
  for (const plik of ['src/engine/triggers.js', 'src/engine/effects.js', 'src/engine/spells.js',
    'src/engine/abilities.js', 'src/engine/game-state.js']) {
    const linie = fs.readFileSync(plik, 'utf8').split('\n');
    linie.forEach((linia, index) => {
      if (!linia.includes("event('permanent_sacrificed'")) return;
      const kontekst = linie.slice(Math.max(0, index - 12), index).join('\n');
      if (!kontekst.includes('moveObjectDirectly')) return;
      assert.ok(
        kontekst.includes('deathZoneFor') || !kontekst.includes("'graveyard'"),
        `${plik}:${index + 1} — poświęcenie omija deathZoneFor (CR 122.1e)`,
      );
    });
  }
});
