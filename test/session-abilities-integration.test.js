import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_ID, BOT_ID, describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * Integracja Etapu 5: log sesji tłumaczy zdarzenia ability_activated /
 * token_created na polski — bez wycieku surowych typów zdarzeń.
 *
 * M238 (rewizja testów, decyzja właściciela): ten plik był ZAMROŻONYM SEEDEM
 * pełnej partii (28+ wpisów „hunterów" — każda zmiana wyceny bota zmuszała do
 * losowania nowego seeda, który akurat produkuje aktywację/token w logu). To
 * NIE był guard tłumaczenia, tylko losowej rozgrywki. Przepisane
 * DETERMINISTYCZNIE: te same zdarzenia engine przechodzą przez
 * `describeGameEvent` — DOKŁADNIE ten sam czytelnik, którego używa `session.log`
 * (session.js woła describeGameEvent w apply()/streamAutoEvents) — bez talii,
 * seeda i emergentnej partii. Wzorzec skopiowany z M178 (table-session.test.js).
 */

const REGISTRY = createCardRegistry();

// Helpery jak w sesji (nameOf/nameOfObject po rejestrze); mapa imion p1/p2.
const NAMES = { [HUMAN_ID]: 'Ty', [BOT_ID]: 'Bot' };
function helpers(objects = {}) {
  return {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: (id) => {
      const o = objects[id];
      return o ? (REGISTRY.get(o.cardId)?.name ?? o.name ?? String(id)) : String(id);
    },
    isPlayer: (id) => id === HUMAN_ID || id === BOT_ID,
  };
}
const describe = (e, objects) => describeGameEvent(e, helpers(objects), NAMES, { drugaOsoba: false });

test('ability_activated → polski opis „aktywuje zdolność: <karta>"', () => {
  // Highland Game jest w rejestrze (nazwa źródła z e.cardId).
  const text = describe({ type: 'ability_activated', playerId: BOT_ID, cardId: 'highland-game', objectId: 'o1', targets: [] });
  assert.match(text, /aktywuje zdolność: Highland Game/);
  assert.ok(!text.includes('ability_activated'), 'surowy typ zdarzenia nie może wyciec do opisu');
});

test('ability_activated z produkcją many → polski opis efektu (bez surowego typu)', () => {
  const text = describe({
    type: 'ability_activated', playerId: HUMAN_ID, cardId: 'highland-game', objectId: 'o1',
    effectTypes: ['add_mana'], manaColors: ['U', 'B'], manaAmount: 1, targets: [],
  });
  assert.match(text, /aktywuje zdolność/);
  assert.ok(!text.includes('add_mana'), 'surowy typ efektu nie może wyciec');
});

test('token_created (stwór) → polski opis „tworzy token <nazwa> (P/T)"', () => {
  const text = describe({ type: 'token_created', controllerId: BOT_ID, name: 'Soldier', power: 1, toughness: 1 });
  assert.match(text, /Bot tworzy token Soldier \(1\/1\)/);
  assert.ok(!text.includes('token_created'), 'surowy typ zdarzenia nie może wyciec');
});

test('token_created (człowiek) → odmiana „tworzysz"', () => {
  const text = describeGameEvent(
    { type: 'token_created', controllerId: HUMAN_ID, name: 'Soldier', power: 1, toughness: 1 },
    helpers(), NAMES, { drugaOsoba: true },
  );
  assert.match(text, /tworzysz token Soldier/);
});

test('token_created (niestworowy) → bez „(null/null)" (M100/E6)', () => {
  const text = describe({ type: 'token_created', controllerId: BOT_ID, name: 'Treasure' });
  assert.match(text, /tworzy token Treasure/);
  assert.ok(!text.includes('null'), 'token niestworowy nie może pokazywać (null/null)');
});

test('surowe typy zdarzeń NIGDY nie są własnym opisem (guard wycieku)', () => {
  for (const type of ['ability_activated', 'token_created']) {
    const text = describe({ type, playerId: BOT_ID, controllerId: BOT_ID, cardId: 'highland-game', name: 'Soldier', power: 1, toughness: 1, targets: [] });
    assert.notStrictEqual(text, type, `opis ${type} nie może być surowym typem zdarzenia`);
  }
});
