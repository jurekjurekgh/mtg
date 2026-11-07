// =============================================================================
// Zgłoszenie H1 (2026-11-07): „bot zawiesza Mindstab w podtrzymaniu".
//
// Rozpoznanie (odczyt źródeł + partia t3, seed 4242): akt zawieszenia jest
// w silniku niemożliwy poza własną fazą main przy pustym stosie —
// `suspendCard` (spells.js) rzuca, a bramka OFERTY (game-state.js, rodzina
// plot/suspend/warp) podaje tę samą warunkowość. Linia logu widziana przez
// właściciela — „Mindstab — trigger (suspend — zdjęcie licznika czasu
// w podtrzymaniu)" — to LEGALNY trigger upkeep (CR 702.62a, drugie zdanie:
// upkeep zdejmuje licznik, a zdjęcie ostatniego otwiera decyzję rzutu);
// sam akt zawieszenia w t3 nastąpił w T8 MAIN1, przed deklaracją ataku.
//
// Ten plik to PINY GWARANCYJNE (CR 702.62a: „if you could begin to cast this
// card by putting it onto the stack from your hand…" + CR 307.1 — timing
// zawieszenia sorceryka = timing jego rzutu): bramka oferty i odrzucenie
// execute w upkeep mają zostać na zawsze, więc klasa L48 (oferta = walidacja)
// dostaje tu dowód, zanim ktokolwiek „uprości" bramkę pod przyszłe karty
// instant-speed z suspend (dzisiaj w katalogu JEDYNA karta z suspend to
// Mindstab — sorcery).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function game(step, active) {
  const state = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  return state;
}

/** Mindstab ({1}{B}, Suspend 4—{B}) w ręce p1 + bagno na produkcję {B}. */
function scene(step, active = 'p1') {
  const state = game(step, active);
  const def = REGISTRY.get('mindstab');
  assert.ok(def, 'mindstab w rejestrze');
  assert.ok(def.suspend, 'mindstab ma deskryptor suspend (sorcery, CR 702.62)');
  addObject(state, {
    id: 'ms', instanceId: 'i-ms', cardId: 'mindstab', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  for (let i = 0; i < 3; i += 1) {
    addObject(state, {
      id: `sw${i}`, instanceId: `i-sw${i}`, cardId: 'basic-swamp', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', ...gameObjectDataOf(REGISTRY.get('basic-swamp')),
    });
  }
  return state;
}

const suspendOffers = (state, pid = 'p1') =>
  (playerView(state, pid).legalCommands ?? []).filter((c) => c?.type === 'suspend_card');

test('H1/1: własne podtrzymanie — oferta suspend NIE ISTNIEJE (CR 702.62a + 307.1)', () => {
  const s = scene('upkeep', 'p1');
  assert.equal(suspendOffers(s).length, 0,
    'akt zawieszenia to timing rzutu sorceryka — upkeep może co najwyżej zdjąć licznik (trigger)');
});

test('H1/2: własne podtrzymanie — execute suspend_card ODRZUCONE, karta zostaje w ręce', () => {
  const s = scene('upkeep', 'p1');
  const result = execute(s, { type: 'suspend_card', playerId: 'p1', objectId: 'ms' });
  assert.equal(result.ok, false, 'walidacja i oferta to jedna reguła (L48)');
  assert.match(String(result.reason ?? ''), /illegal_suspend/,
    `odrzucenie z przyczyny bramki, jest: ${JSON.stringify(result)}`);
  assert.equal(s.objects.get('ms').zone, 'hand', 'kara za próbę poza main: nic się nie dzieje');
  assert.equal(s.zones.exile.length, 0, 'nic nie ląduje w wygnaniu');
});

test('H1/3: własna Główna 1 i Główna 2 — oferta suspend ISTNIEJE', () => {
  for (const step of ['main1', 'main2']) {
    const s = scene(step, 'p1');
    assert.equal(suspendOffers(s).length, 1, `krok ${step}: specjalna akcja sorcery-speed jest legalna`);
  }
});

test('H1/4: własna main z NIEPUSTYM stosem — oferta suspend NIE ISTNIEJE', () => {
  const s = scene('main1', 'p1');
  const def = REGISTRY.get('hill-giant');
  addObject(s, {
    id: 'stack-spell', instanceId: 'i-stack-spell', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'stack', kind: 'spell', ...gameObjectDataOf(def),
  });
  assert.ok(s.zones.stack.length > 0, 'scena: coś czeka na stosie');
  assert.equal(suspendOffers(s).length, 0,
    'specjalna akcja wymaga pustego stosu (jak rzut sorceryka, CR 307.1)');
});

test('H1/5: main fazę gra PRZECIWNIK — oferta suspend NIE ISTNIEJE', () => {
  const s = scene('main1', 'p2');
  assert.equal(suspendOffers(s).length, 0,
    'tylko aktywny gracz może zawieszać (jak rzut sorceryka we własnej turze)');
});
