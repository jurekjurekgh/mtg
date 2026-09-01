import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costSymbols } from '../src/table/mana-icons.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { commandLabel } from '../src/table/render.js';

/**
 * M266/E — domknięcie punktu 4 lekcji L100.
 *
 * L100 naprawiła kolorowy koszt dla `optional_pay_required` i zostawiła
 * ostrzeżenie: `pay_or_sacrifice_required`, `counter_pay_required`,
 * `ward_choice_required` oraz komunikat madness renderują koszt jako gołe
 * `{N}`, więc PIERWSZA karta z pipem kolorowym w tych mechanikach powtórzy
 * błąd. Skan katalogu pokazał, że dla madness ta karta już istnieje:
 * Terminal Agony ma koszt madness {B}{R}, a log pisał „za {2}"
 * (dwie many bezbarwne nie zapłacą dwóch pipów kolorowych).
 *
 * Naprawa idzie u root cause wskazanego w L100/3: składanka „generic + pipy"
 * była SKOPIOWANA w dwóch warstwach (session.js i render.js). Trzecia kopia
 * powtórzyłaby klasę, więc powstaje jedna funkcja `costSymbols` w module
 * wspólnym dla obu warstw.
 */

test('costSymbols: pipy kolorów wchodzą w miejsce części generycznej', () => {
  assert.equal(costSymbols(2, ['B', 'R']), '{B}{R}', 'Terminal Agony — madness {B}{R}');
  assert.equal(costSymbols(4, ['R']), '{3}{R}', 'Revolutionist — madness {3}{R}');
  assert.equal(costSymbols(2, ['W']), '{1}{W}', 'Furious Forebear — dopłata {1}{W}');
});

test('costSymbols: koszt bez kolorów zostaje generyczny', () => {
  assert.equal(costSymbols(2, []), '{2}');
  assert.equal(costSymbols(3, null), '{3}');
  assert.equal(costSymbols(0, []), '', 'zerowy koszt nie rysuje symbolu');
});

test('costSymbols: więcej pipów niż kwota nie daje ujemnej części generycznej', () => {
  // Zabezpieczenie przed „{-1}{B}{R}" przy niespójnych danych karty.
  assert.equal(costSymbols(1, ['B', 'R']), '{B}{R}');
});

test('M266/E: komenda madness niesie KOLORY kosztu (nie samą kwotę)', () => {
  const registry = createCardRegistry();
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const card = registry.get('terminal-agony');
  addObject(state, {
    id: 'ta', instanceId: 'i-ta', cardId: 'terminal-agony',
    controllerId: 'p1', ownerId: 'p1', zone: 'exile',
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  const obj = state.objects.get('ta');
  state.objects.set('ta', Object.freeze({ ...obj, madnessReady: true }));
  const spider = registry.get('giant-spider');
  addObject(state, {
    id: 'sp', instanceId: 'i-sp', cardId: 'giant-spider',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    ...gameObjectDataOf(spider), types: spider.types ?? [], keywords: spider.keywords ?? [],
    subtypes: spider.subtypes ?? [], spell: spider.spell,
  });
  state.pendingMadnessCast = {
    playerId: 'p1', objectId: 'ta', cardId: 'terminal-agony', restorePriorityTo: 'p1',
  };
  addMana(state, 'p1', 6, { colors: ['B', 'R'] });
  const view = playerView(state, 'p1');
  const castOffer = view.legalCommands.find((c) => c.type === 'resolve_madness_cast' && c.cast);
  assert.ok(castOffer, 'oferta rzutu z madness istnieje');
  assert.equal(castOffer.cost, 2, 'kwota kosztu madness');
  assert.deepEqual(castOffer.costColors, ['B', 'R'], 'komenda niesie pipy kolorów');
});

test('M266/E: etykieta rzutu z madness pokazuje {B}{R}, nie {2}', () => {
  const session = { nameOf: (id) => (id === 'terminal-agony' ? 'Terminal Agony' : String(id)) };
  const label = commandLabel(
    { type: 'resolve_madness_cast', cast: true, objectId: 'ta', cardId: 'terminal-agony', cost: 2, costColors: ['B', 'R'] },
    session,
    {
      zones: {
        hand: [], battlefield: [], stack: [], graveyard: [], library: [],
        exile: [{ id: 'ta', cardId: 'terminal-agony' }],
      },
      players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    },
  );
  assert.match(label, /B.*R/s, 'etykieta niesie pipy kolorów');
  assert.doesNotMatch(label, /\{2\}/, 'gołe {2} to koszt, którego nie da się zapłacić');
});
