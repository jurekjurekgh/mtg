// AUDYT PR #100 (sesja arena/01a07682) — A3 (litera operatora) i A5 (obiecanie
// rzeczy, której kod nie robi).
//
// A3: w `tieProjection` grupującej wybory z jednym celem stało
//   const types = obj.types ?? obj.cardId ? cardDef(obj.cardId)?.types : [];
// Operator `?:` wiąże słabiej niż `??`, więc liczony był warunek
// `(obj.types ?? obj.cardId)`, a WYNIKIEM zawsze typy z katalogu — ŻYWE typy
// obiektu (ożywiony ląd, karta skopiowana `enter_as_copy`) nie były użyte ani
// razu. Naprawa: wyodrębniony `effectiveTypesOf` (ten sam wzorzec co
// „wspólny helper" z PR #100: jedno miejsce na regułę, testowalne bez
// kombinowania stanu gry).
//
// A5: komentarz w `isNonePickCommand` obiecywał sprawdzenie `mandatory` przy
// odmowie szukania. Sprawdzamy to po stronie SILNIKA, bo tam leży gwarancja:
// oferta `found: null` istnieje tylko w gałęzi `if (!pending.mandatory)`
// (game-state ~6210) — dodawanie testu na tę flagę w UI byłoby warunkiem
// martwym (L5). Test poniżej pinie właśnie tę gwarancję strukturalną.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectiveTypesOf } from '../src/controllers/heuristic-bot.js';

test('A3: żywe typy obiektu wygrywają z wydrukowanymi, druk jest fallbackiem', () => {
  // Ożywiony las: w widoku `types` z Creature, w katalogu — sam ląd.
  const ozywiony = { id: 'las', cardId: 'basic-forest', kind: 'land', types: ['Basic', 'Land', 'Creature'] };
  assert.deepEqual(effectiveTypesOf(ozywiony, { types: ['Basic', 'Land'] }), ['Basic', 'Land', 'Creature'],
    'żywe typy nie mogą być nadpisywane drukiem (inaczej projekcja nie widzi, że ląd jest stworem)');
  // Brak żywych typów (np. wpis z payloadu decyzji bez `types`) — fallback druk.
  assert.deepEqual(effectiveTypesOf({ id: 'x', cardId: 'goblin-piker' }, { types: ['Creature'] }), ['Creature']);
  // Ani żywych, ani definicji — pusto, bez wyjątku.
  assert.deepEqual(effectiveTypesOf({ id: 'x' }, null), []);
  assert.deepEqual(effectiveTypesOf(null, null), []);
});

test('A5: szukanie OBOWIĄZKOWE nie oferuje odmowy (gwarancja po stronie silnika)', () => {
  const stan = (mandatory) => {
    const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'main1', 'p1');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p1';
    addObject(state, {
      id: 'las', instanceId: 'i-las', cardId: 'basic-forest', controllerId: 'p1', ownerId: 'p1',
      zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'], colors: [],
      manaCost: 0, abilities: [], keywords: [],
    });
    state.pendingSearchChoice = {
      playerId: 'p1', qualifier: {}, destination: 'hand', mandatory,
      candidateIds: ['las'], sourceCardId: 'final-parting', restorePriorityTo: 'p1',
    };
    return playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_search_choice');
  };
  const dobrowolne = stan(false);
  assert.ok(dobrowolne.some((c) => c.found == null), 'przy „you may search" odmowa JEST oferowana');
  const przymusowe = stan(true);
  assert.ok(przymusowe.length > 0, 'szukanie obowiązkowe ma kandydatów');
  assert.ok(!przymusowe.some((c) => c.found == null),
    'CR 701.19c: przy obowiązkowym szukaniu NIE MA wariantu „nie znajduję" — dlatego UI nie musi sprawdzać `mandatory`');
});
