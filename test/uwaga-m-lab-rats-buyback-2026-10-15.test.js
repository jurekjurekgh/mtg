// Uwaga M z testów (2026-10-15, tura 14): Lab Rats — Buyback {4}. Oferta
// z buyback i zwykły rzut miały IDENTYCZNĄ etykietę „Rzuć: Lab Rats (koszt B)”,
// więc gracz nie wiedział, który przycisk to który.
//
// Kontrakt po: buyback to dodatkowy koszt płacony PRZY RZUCANIU (CR 702.27a,
// „as you cast”; jak kicker — nie na stosie), więc oferta jest osobnym wariantem
// `cast_spell` z `buyback: true`. Etykieta niesie dopłatę („+ buyback {4}”),
// a klucz grupy rozdziela warianty tak samo jak kicker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildActionEntries, choiceRequestGroupKey, commandLabel } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, '');

function stol({ mana = 5 } = {}) {
  const state = createGameState({ seed: 1401, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const def = REGISTRY.get('lab-rats');
  addObject(state, {
    id: 'rats', instanceId: 'i-rats', cardId: 'lab-rats', controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  addMana(state, 'p1', mana, { colors: ['B', 'B', 'B', 'B', 'B'] });
  const view = playerView(state, 'p1');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    state,
  };
  return { state, view, session };
}

function ratsCasts(view) {
  return view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'rats');
}

test('M/1: Lab Rats — są OBIE oferty rzutu: zwykła i z buyback (oferta przy rzucaniu, nie na stosie)', () => {
  const { view } = stol();
  const casts = ratsCasts(view);
  assert.ok(casts.some((c) => !c.buyback), 'zwykły rzut bez buyback');
  assert.ok(casts.some((c) => c.buyback === true), 'rzut z buyback (dopłata 4 przy rzucaniu)');
});

test('M/2: etykiety obu ofert różnią się i wariant z buyback mówi o buyback', () => {
  const { view, session } = stol();
  const entries = buildActionEntries(view.legalCommands.filter((c) => c.type !== 'concede'), session, view)
    .filter((e) => e.command?.type === 'cast_spell' && e.command.objectId === 'rats');
  assert.equal(entries.length, 2, `dwa przyciski rzutu Lab Rats (jest ${entries.length})`);
  const base = entries.find((e) => !e.command.buyback);
  const withBuyback = entries.find((e) => e.command.buyback);
  assert.ok(base && withBuyback, 'obie oferty w panelu');
  const baseLabel = plain(entries.find((e) => e === base).label ?? commandLabel(base.command, session, view));
  const buybackLabel = plain(withBuyback.label ?? commandLabel(withBuyback.command, session, view));
  assert.notEqual(baseLabel, buybackLabel, `te same etykiety = nie wiadomo który jest który (M): ${baseLabel}`);
  assert.ok(!/buyback/i.test(baseLabel), `zwykły rzut bez dopłaty: ${baseLabel}`);
  assert.ok(/buyback/i.test(buybackLabel), `wariant z buyback nazwany: ${buybackLabel}`);
  assert.ok(/\b4\b/.test(buybackLabel), `dopłata 4 widoczna: ${buybackLabel}`);
});

test('M/3: brak many na buyback → brak oferty z buyback (nic nie obiecujemy)', () => {
  const { view } = stol({ mana: 1 });
  assert.equal(ratsCasts(view).some((c) => c.buyback), false, 'z 1 maną buyback (4) nie jest legalny');
  assert.ok(ratsCasts(view).length >= 1, 'zwykły rzut za 1 manę nadal jest');
});

test('M/4: klucz grupy rozdziela warianty z buyback od zwykłego rzutu (jak kicker)', () => {
  const base = { type: 'cast_spell', playerId: 'p1', objectId: 'x', targets: ['t'] };
  const withBuyback = { ...base, buyback: true };
  assert.notEqual(choiceRequestGroupKey(base), choiceRequestGroupKey(withBuyback),
    'buyback nie może wpaść do tej samej grupy co zwykły rzut celowany');
});

// Uwaga M (tura 15, b): log rozstrzygnięcia buyback mówił „wygrany clash zwraca
// czar do ręki właściciela”. Przyczyna: buyback i clash dzielą flagę
// `returnToHand` na `spell_resolved`, a opis w sesji czytał tylko ją.
// Kontrakt: zdarzenie niesie `returnedByBuyback`; log buyback mówi o buyback,
// a prawdziwy clash (bez buyback) zachowuje swój tekst.
test('M/5: rozstrzygnięcie z buyback nie mówi o clash; zdarzenie niesie returnedByBuyback', () => {
  const { state, view } = stol();
  const cast = ratsCasts(view).find((c) => c.buyback === true);
  assert.ok(cast, 'oferta buyback jest w legalCommands');
  execute(state, cast);
  let guard = 0;
  while (state.zones.stack.length && guard++ < 20) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const resolved = state.events.filter((e) => e.type === 'spell_resolved' && e.cardId === 'lab-rats').at(-1);
  assert.ok(resolved, 'jest spell_resolved dla Lab Rats');
  assert.equal(resolved.returnedByBuyback, true, 'zdarzenie oznacza zwrot przez buyback');
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const helpers = { nameOf: (id) => REGISTRY.get(id)?.name ?? id, nameOfObject: () => 'Lab Rats' };
  const text = describeGameEvent(resolved, helpers, names);
  assert.doesNotMatch(text, /clash/i, `log buyback nie może mówić o clash: ${text}`);
  assert.match(text, /buyback/i, `log buyback wspomina buyback: ${text}`);
});

test('M/6: prawdziwy clash (bez buyback) nadal opisuje się jako clash', () => {
  const text = describeGameEvent(
    { type: 'spell_resolved', fromId: 's', toId: 'h', cardId: 'release-the-ants', controllerId: 'p1', fizzled: false, returnToHand: true },
    { nameOf: () => 'Release the Ants', nameOfObject: () => 'Release the Ants' },
    { p1: 'Ty', p2: 'Nieprzyjaciel' },
  );
  assert.match(text, /clash/, text);
});
