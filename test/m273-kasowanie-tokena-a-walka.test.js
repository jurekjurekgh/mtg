import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';

/**
 * M273 (błąd #25) — token skasowany BEZPOŚREDNIO z pola bitwy zostawiał
 * wiszące odwołanie w `state.combat`.
 *
 * Choke point zmian stref (`moveObjectDirectly`) woła `removeFromCombat`,
 * bo permanent opuszczający pole bitwy nie może zostać atakującym ani
 * blokerem (CR 506.4). Dwie ścieżki kasujące token (bounce na spód biblioteki
 * i jego bliźniaczka w game-state) omijały choke point — kasowały obiekt
 * i czyściły strefę ręcznie — więc `state.combat.attackers` trzymał id
 * obiektu, którego nie ma już w `state.objects`.
 *
 * Ten sam rodzaj niespójności (wskaźnik na nieistniejący obiekt) wywrócił
 * partię wyjątkiem w M271 (błąd #16), tyle że dla załączników.
 *
 * Znalezione analizatorem (ADR 0027), wymiar: ręczne mutacje stref.
 */
const registry = createCardRegistry();

function stanZTokenemWWalce({ jakoBloker = false } = {}) {
  const karta = registry.get('highland-game');
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'tok', instanceId: 'itok', cardId: 'highland-game', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(karta), types: karta.types,
  });
  state.objects.set('tok', Object.freeze({
    ...state.objects.get('tok'), isToken: true, name: 'Zombie',
  }));
  addObject(state, {
    id: 'src', instanceId: 'isrc', cardId: 'twiddle', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(registry.get('twiddle')), types: ['Instant'],
  });
  if (jakoBloker) {
    addObject(state, {
      id: 'atk', instanceId: 'iatk', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', ...gameObjectDataOf(karta), types: karta.types,
    });
    state.combat = {
      attackingPlayerId: 'p1', attackers: ['atk'],
      blockers: new Map([['atk', ['tok']]]), blockedAttackers: new Set(['atk']),
    };
  } else {
    state.combat = {
      attackingPlayerId: 'p2', attackers: ['tok'],
      blockers: new Map(), blockedAttackers: new Set(),
    };
  }
  state.events.length = 0;
  return state;
}

/** Czy w strukturze walki został id obiektu, którego nie ma w stanie gry? */
function wiszaceOdwolania(state) {
  const wiszace = state.combat.attackers.filter((id) => !state.objects.has(id));
  for (const [attackerId, blockerIds] of state.combat.blockers) {
    if (!state.objects.has(attackerId)) wiszace.push(attackerId);
    for (const id of blockerIds) if (!state.objects.has(id)) wiszace.push(id);
  }
  return wiszace;
}

test('token ATAKUJĄCY skasowany z pola bitwy znika z listy atakujących (CR 506.4)', () => {
  const state = stanZTokenemWWalce();
  assert.deepEqual(state.combat.attackers, ['tok'], 'warunek początkowy: token atakuje');
  applyEffect(state, { type: 'bounce_to_library_bottom' }, state.objects.get('src'), ['tok']);
  assert.equal(state.objects.has('tok'), false, 'token przestał istnieć (CR 111.7)');
  assert.deepEqual(wiszaceOdwolania(state), [], 'brak wiszących odwołań w state.combat');
});

test('token BLOKUJĄCY skasowany z pola bitwy znika z przypisań bloków', () => {
  const state = stanZTokenemWWalce({ jakoBloker: true });
  applyEffect(state, { type: 'bounce_to_library_bottom' }, state.objects.get('src'), ['tok']);
  assert.equal(state.objects.has('tok'), false, 'token przestał istnieć');
  assert.deepEqual(wiszaceOdwolania(state), [], 'brak wiszących odwołań w blokach');
});

test('kasowanie tokena POZA walką nie wywraca się na braku state.combat', () => {
  // Kontrola negatywna: ta sama ścieżka poza krokiem walki (state.combat null).
  const state = stanZTokenemWWalce();
  state.combat = null;
  applyEffect(state, { type: 'bounce_to_library_bottom' }, state.objects.get('src'), ['tok']);
  assert.equal(state.objects.has('tok'), false, 'token skasowany bez wyjątku');
});

test('SKAN ŹRÓDEŁ: kasowanie obiektu z POLA BITWY przechodzi przez removeFromCombat', () => {
  // Strażnik klasowy: każda przyszła ścieżka kasująca permanent z pola bitwy
  // musi przejść tę samą listę konsumentów co choke point (L43).
  for (const plik of ['src/engine/effects.js', 'src/engine/game-state.js']) {
    const linie = fs.readFileSync(plik, 'utf8').split('\n');
    linie.forEach((linia, index) => {
      if (!/state\.objects\.delete\(/.test(linia)) return;
      const okno = linie.slice(Math.max(0, index - 12), index + 8).join('\n');
      // Interesuje nas wyłącznie USUNIĘCIE obiektu z pola bitwy. Sam ciąg
      // `zones.battlefield` nie wystarcza: ścieżka transform-return kasuje
      // obiekt z WYGNANIA i w tym samym oknie DOPISUJE nowy permanent na pole
      // (`zones.battlefield.push`) — to nie jest wyjście z walki.
      const kasowanyId = linia.match(/state\.objects\.delete\(([^)]+)\)/)?.[1]?.trim();
      const usuwaZPola = new RegExp(
        `zones\\.battlefield = state\\.zones\\.battlefield\\.filter\\(\\(id\\) => id !== ${
          kasowanyId?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
      );
      if (!kasowanyId || !usuwaZPola.test(okno)) return;
      assert.ok(
        /removeFromCombat/.test(okno),
        `${plik}:${index + 1} — obiekt kasowany z pola bitwy bez removeFromCombat: `
        + 'w state.combat zostanie wiszące id (CR 506.4).',
      );
    });
  }
});
