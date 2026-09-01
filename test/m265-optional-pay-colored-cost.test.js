// M265 (Żywy Tester, partia worek-basni vs final-fantasy, seed 303):
// modal „Rozgrywka" pokazał linię
//   „Zoraline, Cosmos Caller — zapłacić {2} i 2 życia?"
// a przycisk decyzji tuż pod nią
//   „Zapłać {W}{B} + 2 życia — efekt odpali".
//
// Realny koszt Oracle to {W}{B} (Zoraline: „you may pay {W}{B} and 2 life").
// Renderer PRZYCISKU (`render.js`, `resolve_optional_pay_choice`) rozbija
// koszt na pipy z `costColors`, bo `playerView` niesie `payColors` triggera.
// Warstwa OPISU ZDARZEŃ (`describeGameEvent`) dostawała samo `payMana`, więc
// pisała generyczne „{2}" — koszt, którego w grze nie ma (za {2} bezbarwne
// nie da się zapłacić {W}{B}). Gracz czytający log/modal widział inną cenę
// niż ta, którą płaci.
//
// Root cause: zdarzenie `optional_pay_required` nie niosło `payColors`.
// Naprawa u źródła (nie w rendererze): trigger dokłada kolory do zdarzenia,
// a opis składa symbole tak samo jak przycisk (generyk + pipy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const PLAYER_NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?'),
  nameOfObject: (id) => (PLAYER_NAMES[id] ?? String(id)),
  isPlayer: (id) => id === 'p1' || id === 'p2',
};

function addRealCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}

/** Zoraline wchodzi na pole bitwy z celem w grobie → decyzja dopłaty {W}{B}. */
function zoralineEnters() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'grave-1', 'highland-game', 'p1', 'graveyard');
  addRealCard(state, 'zora', 'zoraline', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['W', 'B', 'U'] });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', cardId: 'zoraline', objectId: 'zora' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: holder });
    if (!r.ok) break;
  }
  return state;
}

test('M265: zdarzenie optional_pay_required niesie kolory kosztu (payColors)', () => {
  const state = zoralineEnters();
  assert.ok(state.pendingOptionalPay, 'decyzja dopłaty czeka');
  const required = state.events.filter((e) => e.type === 'optional_pay_required').at(-1);
  assert.ok(required, 'zdarzenie optional_pay_required wyemitowane');
  assert.equal(required.payMana, 2);
  assert.deepEqual(required.payColors ?? null, ['W', 'B'],
    'zdarzenie musi nieść kolory pipów — inaczej opis pisze generyczne {2}');
});

test('M265: opis decyzji pokazuje {W}{B}, nie generyczne {2} (koszt Oracle)', () => {
  const state = zoralineEnters();
  const required = state.events.filter((e) => e.type === 'optional_pay_required').at(-1);
  const text = describeGameEvent(required, HELPERS, PLAYER_NAMES);
  assert.ok(text.includes('{W}{B}'), `opis musi pokazać pipy kolorów, jest: ${text}`);
  assert.ok(!/\{2\}/.test(text), `generyczne {2} to koszt, którego w grze nie ma: ${text}`);
  assert.ok(text.includes('2 życia'), `część życiowa kosztu zostaje: ${text}`);
});

test('M265: koszt mieszany (generyk + pip) — {1}{W} dla Furious Forebear', () => {
  // Ta sama składanka co w przycisku: payMana 2, payColors ['W'] ⇒ {1}{W}.
  const e = {
    type: 'optional_pay_required', playerId: 'p1', sourceId: 'ff',
    cardId: 'furious-forebear', payMana: 2, payColors: ['W'], payLife: 0,
  };
  const text = describeGameEvent(e, HELPERS, PLAYER_NAMES);
  assert.ok(text.includes('{1}{W}'), `koszt mieszany 2 many z jednym pipem W ⇒ {1}{W}, jest: ${text}`);
});

test('M265: koszt czysto generyczny nadal jako {N}', () => {
  const e = {
    type: 'optional_pay_required', playerId: 'p1', sourceId: 'x',
    cardId: 'highland-game', payMana: 3, payColors: [], payLife: 0,
  };
  const text = describeGameEvent(e, HELPERS, PLAYER_NAMES);
  assert.ok(text.includes('{3}'), `bez kolorów zostaje {3}, jest: ${text}`);
});

test('M265: widok decyzji (playerView) i opis zdarzenia mówią o tym samym koszcie', () => {
  // Kontrakt spójności warstw: to rozjazd między nimi był zgłoszeniem.
  const state = zoralineEnters();
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'resolve_optional_pay_choice' && c.pay);
  assert.ok(cmd, 'oferta zapłaty istnieje');
  const required = state.events.filter((e) => e.type === 'optional_pay_required').at(-1);
  assert.deepEqual(required.payColors ?? [], cmd.costColors ?? [],
    'kolory kosztu w zdarzeniu i w komendzie muszą być identyczne');
  assert.equal(required.payMana, cmd.cost, 'kwota many identyczna w obu warstwach');
});
