// M102/U1 — audyt żywym testerem (rola gracza, 2026-08-16).
//
// OBJAW (transkrypt /tmp/g1.txt, krok 54): wskaźnik tury pokazuje „T. 15 Ty …
// Untap", a panel akcji wystawia realne akcje gracza:
//     AKCJE: Channel: Greater Tanuki (koszt 2G) …
//            Aktywuj: Moonscarred Werewolf (Ty) (koszt T) — dodaj manę
//            Dalej (pass)
// i kliknięcie „Aktywuj" faktycznie tapuje stwora o manę W KROKU ODKRĘCANIA.
// Profil greedy Żywego Testera złapał 5 takich aktywacji w jednej partii.
//
// CR 502.4: „No player receives priority during the untap step, so no spells
// can be cast or resolve and no abilities can be activated or resolve."
// Krok odkręcania ma się przetoczyć SAM: po akcjach turowych (odkręcenie —
// CR 502.1/502.2) gra przechodzi od razu do upkeepu, gdzie priorytet dostaje
// aktywny gracz (CR 503.1).
//
// ROOT CAUSE: pełna runda passów w `pass_priority` woła `nextTurnStep`, które
// przy zawinięciu tury ustawia `priorityPlayerId = nextPlayer` i zatrzymuje się
// na TURN_STEPS[0] = untap. Krok dobierania miał już swoją akcję turową
// (drawStepTurnBasedAction, M101/A), ale untap nie miał odpowiednika „i jedź
// dalej" — silnik siadał w untapie i rozdawał priorytet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const cardRegistry = createCardRegistry();

function makeState() {
  const state = createGameState({ players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Bot' }], seed: 7 });
  for (let i = 0; i < 6; i += 1) {
    for (const p of ['p1', 'p2']) {
      addObject(state, {
        id: `lib-${p}-${i}`, instanceId: `i-${p}-${i}`, cardId: 'forest', controllerId: p, ownerId: p,
        zone: 'library', kind: 'land', power: null, toughness: null, manaCost: 0,
        abilities: [], keywords: [], subtypes: ['Forest'], types: ['Land', 'Basic'], colors: [],
      });
    }
  }
  return state;
}

/**
 * Dokłada na pole bitwy odkręconego dorka many (Scorned Villager, „{T}: Add {G}")
 * bez choroby przywołania — czyli stwora, którego zdolność JEST aktywowalna,
 * gdy tylko gracz dostanie priorytet. Dokładnie taki stwór (Moonscarred
 * Werewolf) dał się aktywować w untapie w transkrypcie /tmp/g1.txt.
 */
function addManaDork(state, playerId, id, { tapped = false } = {}) {
  const card = cardRegistry.get('scorned-villager');
  addObject(state, {
    id, instanceId: `inst-${id}`, cardId: card.id, controllerId: playerId, ownerId: playerId,
    zone: 'battlefield', kind: 'creature', power: card.power, toughness: card.toughness,
    manaCost: card.manaCost, abilities: card.abilities, keywords: card.keywords,
    subtypes: card.subtypes, types: card.types, colors: card.colors,
  });
  // addObject ignoruje `tapped`/`summoningSickness` — nadpisujemy obiekt wprost.
  const obj = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...obj, tapped, summoningSickness: false }));
}

/** Przepycha grę passami aż do zmiany numeru tury; zwraca ślad kroków. */
function passUntilNextTurn(state, { maxPasses = 40 } = {}) {
  const startTurn = state.turn.number;
  const seen = [];
  for (let i = 0; i < maxPasses && state.turn.number === startTurn; i += 1) {
    seen.push({ phase: state.turn.phase, step: state.turn.step, priority: state.turn.priorityPlayerId });
    const result = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!result.ok) break;
  }
  seen.push({ phase: state.turn.phase, step: state.turn.step, priority: state.turn.priorityPlayerId });
  return seen;
}

test('M102/U1: po zawinięciu tury gra nie zatrzymuje się w kroku odkręcania (CR 502.4)', () => {
  const state = makeState();
  addManaDork(state, 'p2', 'dork-p2', { tapped: true });
  // Stoimy w cleanupie tury 1 (p1) — kolejny pass zawija turę na p2.
  state.turn = jumpToStep(state.turn, 'cleanup');
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });

  assert.equal(state.turn.number, 2, 'tura powinna się przewinąć na gracza p2');
  // CR 502.4 + 503.1: pierwszym krokiem, w którym KTOKOLWIEK ma priorytet,
  // jest upkeep — nie untap.
  assert.notEqual(state.turn.step, 'untap',
    'silnik zatrzymał się w kroku odkręcania i rozdał priorytet (CR 502.4)');
  assert.equal(state.turn.step, 'upkeep');
  // Akcja turowa untapu (CR 502.2) i tak musi się wykonać.
  assert.equal(state.objects.get('dork-p2').tapped, false,
    'odkręcenie w untap stepie musi się wykonać mimo pominięcia priorytetu');
});

test('M102/U1: w kroku odkręcania nikt nie dostaje legalnych akcji', () => {
  const state = makeState();
  addManaDork(state, 'p1', 'dork-p1');
  // Ustawiamy grę ręcznie w untap (tak jak zastawał ją Żywy Tester).
  state.turn = jumpToStep(state.turn, 'untap');

  for (const playerId of ['p1', 'p2']) {
    const commands = playerView(state, playerId).legalCommands ?? [];
    const forbidden = commands.filter((c) => c.type === 'activate_ability' || c.type === 'cast_spell');
    assert.deepEqual(forbidden, [],
      `w untap stepie ${playerId} nie może aktywować zdolności ani rzucać czarów (CR 502.4), a dostał: ${forbidden.map((c) => c.type).join(', ')}`);
  }
});

test('M102/U1: żadna tura nie oferuje okna priorytetu w untapie (przebieg pełnej tury)', () => {
  const state = makeState();
  addManaDork(state, 'p2', 'dork-p2', { tapped: true });
  state.turn = jumpToStep(state.turn, 'cleanup');
  const trace = passUntilNextTurn(state);
  const untapWindows = trace.filter((t) => t.step === 'untap');
  assert.deepEqual(untapWindows, [],
    `gracz dostał priorytet w kroku odkręcania ${untapWindows.length}× (CR 502.4)`);
});
