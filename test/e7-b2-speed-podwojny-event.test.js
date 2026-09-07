// E7/B2 (zgłoszenie właściciela z testów żywej gry): przy zwiększeniu prędkości
// z triggera obrażeń bojowych (klasa „whenever one or more creatures you control
// deal combat damage to a player" — tor Start Your Engines) modal „Rozgrywka"
// pokazywał PODWÓJNY komunikat „Zwiększasz prędkość (speed: 2)".
//
// Przyczyna (root-cause): `setPlayerSpeed` (players.js) SAM pushuje zdarzenie
// `speed_changed` do `state.events` i dopiero potem je zwraca — dokumentacja
// sygnatury: „wołający nie dubluje pusha". `bumpSpeedIfOpponentDamaged`
// (triggers.js) wołało `state.events.push(...setPlayerSpeed(...))` — ten sam
// event lądował w dzienniku DWUKROTNIE (stąd zdublowany komunikat w UI).
// Pozostałe ścieżki (`startEnginesFor` w state-based.js i effects.js) wołają
// poprawnie, bez re-pusha.
//
// Pin: jeden wzrost prędkości = DOKŁADNIE jedno zdarzenie `speed_changed`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { putStartEnginesCreature, attackWithCreatureForLifeLoss } from './helpers/e7-speed-harness.js';

const REGISTRY = createCardRegistry();

test('E7/B2: wzrost prędkości z obrażeń bojowych emituje JEDNO zdarzenie speed_changed', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  const ghost = putStartEnginesCreature(state, REGISTRY, 'p1');
  // Trigger wymaga prędkości > 0 (silnik startuje ścieżką stanową — tu ją
  // symulujemy wprost, jak w żywej grze po wejściu silnika).
  state.players.find((p) => p.id === 'p1').speed = 1;
  assert.equal(attackWithCreatureForLifeLoss(state, ghost.id, 'p2'), true,
    'nieblokowany atak doprowadził do obrażeń bojowych');
  assert.ok(state.players.find((p) => p.id === 'p2').life < 20, 'obrońca stracił życie');
  const bumps = state.events.filter((e) => e.type === 'speed_changed' && e.speed === 2);
  assert.equal(bumps.length, 1,
    `dokładnie jedno speed_changed(2), jest ${bumps.length} — podwójny push w bumpSpeedIfOpponentDamaged`);
  assert.equal(state.players.find((p) => p.id === 'p1').speed, 2, 'prędkość faktycznie wzrosła 1 → 2');
});
