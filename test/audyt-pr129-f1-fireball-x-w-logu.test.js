// Audyt PR #129 — znalezisko F-1 (średnie), domknięcie B1 właściciela dla
// czarów fireballowych.
//
// B1 (2026-09-18): „w Rozgrywce ani w logu nie ma informacji, za ile X bot
// zagrał Epic Experiment” — naprawione w session.js (`spell_cast` → ` (X=N)`,
// czyta `e.xValue`). PR #129 dodał `xValue` do zdarzenia tylko w
// `castXCostSpell`; `castFireball` (spells.js) zapisywał X wyłącznie na
// obiekcie stosu (`stacked.fireballX`, czytany przez resolution), więc
// Fireball — sztandarowy czar X — nie pokazywał X w logu ani w warstwie
// „Rozgrywka”. Komentarz w test/uwagi-z-testow-b1-x-w-logu.test.js twierdził,
// że castFireball tę wartość niesie: rozjazd komentarza z kodem potwierdzony
// u źródła (sed spells.js 905-1000).
//
// Pin jest E2E (nie źródłowy): prawdziwy rzut Fireballa przez `execute`,
// odczyt zdarzenia z logu sesji i opis tej samej funkcji, która buduje log
// stołu, warstwę „Rozgrywka” i modal „Ruch bota” (L41).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (objectId) => objectId,
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
}

/** Fireball w ręce p1, 6 gór, dwa cele p2 — stan jak w pinie C1/1. */
function fireballState() {
  const state = createGameState({ seed: 111, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'fb', 'fireball', 'p1', 'hand', { kind: 'spell' });
  for (let i = 0; i < 6; i += 1) put(state, `m${i}`, 'basic-mountain', 'p1', 'battlefield');
  put(state, 'cre1', 'highland-game', 'p2', 'battlefield');
  put(state, 'cre2', 'highland-game', 'p2', 'battlefield');
  return state;
}

test('F-1/1: rzut Fireballa niesie X w zdarzeniu spell_cast (log + Rozgrywka)', () => {
  const state = fireballState();
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.xValue === 3 && c.targets.length === 1);
  assert.ok(cast, 'setup: oferta rzutu Fireballa za X=3');
  const wynik = execute(state, cast);
  assert.ok(wynik?.ok !== false, `rzut przyjęty: ${JSON.stringify(wynik?.error ?? null)}`);

  const zdarzenie = state.events.filter((e) => e.type === 'spell_cast').at(-1);
  assert.ok(zdarzenie, 'zdarzenie spell_cast istnieje');
  assert.equal(zdarzenie.xValue, 3,
    'spell_cast z castFireball musi nieść xValue jak castXCostSpell (F-1)');
  const tekst = describeGameEvent(zdarzenie, HELPERS, NAMES);
  assert.match(tekst, /Fireball/, `nazwa czaru w opisie: „${tekst}”`);
  assert.match(tekst, /X=3/, `wartość X widoczna w logu/Rozgrywce: „${tekst}”`);
});

test('F-1/2: X na obiekcie stosu nadal steruje rozstrzygnięciem (bez regresji)', () => {
  const state = fireballState();
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.xValue === 2 && c.targets.length === 1);
  assert.ok(cast, 'setup: oferta rzutu za X=2');
  assert.ok(execute(state, cast)?.ok !== false, 'rzut przyjęty');
  const naStosie = state.objects.get(state.zones.stack[0]);
  assert.equal(naStosie.fireballX, 2, 'resolution czyta fireballX (CR 601.2b)');
  // X jest też na zdarzeniu — jedno źródło prawdy dla obu odbiorców (L41).
  const zdarzenie = state.events.filter((e) => e.type === 'spell_cast').at(-1);
  assert.equal(zdarzenie.xValue, naStosie.fireballX);
});
