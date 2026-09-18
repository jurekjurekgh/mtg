// M376 (pętla jakości ADR 0021 §4a — Żywy Tester; worek-dziki vs ixalan,
// seed 2031): bot aktywował „Pay {E}: +2/-2 do końca tury" (Shipwreck Moray)
// CZTERY razy pod rząd w jednym kroku walki, aż jego 0/5 bloker zginął z SBA
// (CR 704.5f) po trzecim rozstrzygnięciu — czwarta aktywacja opłacona
// licznikiem, który nie zrobił już nic (liczniki 4 → 0).
//
// Root cause: aktywacja była wyceniana TAK SAMO jak czar jednorazowy
// (`pumpChangesOutcome` — „czy cokolwiek się zmieni w wyniku walki"), a stan
// planszy w tym oknie jeszcze się nie zmienił (kopia wisi na stosie, nie
// rozstrzygnęła się), więc KAŻDA kolejna aktywacja wyglądała identycznie jak
// pierwsza. Zdolność z POWTARZALNYM kosztem można powtórzyć później, więc
// wymaganie jest mocniejsze: kopia musi POPRAWIĆ wymianę, nie tylko ją
// zmienić — a oczekujące kopie wchodzą do modelu (cele i źródło wpisu na
// stosie są publiczne, ADR 0017).
//
// Piny:
//  1. kontrola pozytywna: pierwsza aktywacja (0/5 → 2/3 blokujące 2/2)
//     zamienia śmierć blokera w wygraną wymianę — bot MA ją wybrać,
//  2. druga kopia przy wiszącej pierwszej (plansza wciąż 0/5): 2/3 → 4/1
//     zabija blokera bez nowego zysku — bot NIE ma jej wybrać,
//  3. po rozstrzygnięciu pierwszej (2/3 na stole): kolejna aktywacja
//     (2/3 → 4/1) też tylko zabija blokera — bot NIE ma jej wybrać,
//  4. kontrola pozytywna dla oczekującej kopii: gdy druga aktywacja
//     DOBIJA większego atakującego (3/3), bot MA ją wybrać.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addEnergyCounters, payEnergyCounters } from '../src/engine/players.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
  return state.objects.get(id);
}

/** Zmiana pola poza kontraktem addObject (L21) — np. efekt rozstrzygniętego pumpu. */
function setField(state, id, patch) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

/**
 * Wpis aktywacji NA STOSIE — ten sam kształt, który tworzy silnik
 * (`queueActivatedAbilityToStack`): widok czyta z niego `sourceId`,
 * `abilityIndex` i `abilityEffects` (game-state.js, zone === 'stack').
 */
function pushPendingActivation(state, { sourceId = 'moray', abilityIndex = 1, controllerId = 'p1' } = {}) {
  const id = `ability-test-${state.objectSequence++}`;
  const entry = Object.freeze({
    id, zone: 'stack', controllerId, cardId: 'shipwreck-moray', kind: 'activated',
    activatedEntry: Object.freeze({
      playerId: controllerId, objectId: sourceId, abilityIndex,
      ability: Object.freeze({ effect: { type: 'pump', power: 2, toughness: -2 } }),
      sourceId, targets: [], sourceLki: Object.freeze({}),
    }),
  });
  state.objects.set(id, entry);
  state.zones.stack.push(id);
  return entry;
}

/**
 * Scena z transkryptu: tura p2 (przeciwnika), krok obrażeń w walce, mój (p1)
 * Shipwreck Moray BLOKUJE atakującego; priorytet ma p1 (bot decyduje).
 * `energy` = liczniki pozostałe botowi na aktywacje.
 */
function blockingScene({ seed = 2031, attackerPower = 2, attackerToughness = 2, energy = 4 } = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.phase = 'combat';
  state.turn.step = 'combat_damage';
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  addObject(state, {
    id: 'grunt', instanceId: 'i-grunt', cardId: 'syntetyczny-atakujacy',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    kind: 'creature', types: ['Creature'], name: 'Syntetyczny Atakujący',
    power: attackerPower, toughness: attackerToughness,
  });
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['grunt'], blockers: new Map([['grunt', ['moray']]]), declared: true,
  };
  if (energy > 0) addEnergyCounters(state, 'p1', energy);
  return state;
}

const botDecision = (state) => createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p1'));

test('M376/1 (kontrola pozytywna): pierwsza aktywacja, która odwraca wymianę, jest wybierana', () => {
  const state = blockingScene();
  const chosen = botDecision(state);
  assert.equal(chosen.type, 'activate_ability', `bot ma aktywować pump, wybrał ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, 'moray');
});

test('M376/2: druga kopia przy WISZĄCEJ pierwszej jest odrzucana (śmierć blokera bez zysku)', () => {
  const state = blockingScene({ energy: 1 });
  pushPendingActivation(state);           // pierwsza kopia jeszcze się nie rozstrzygnęła
  const chosen = botDecision(state);
  assert.notEqual(chosen.type, 'activate_ability',
    `druga kopia (2/3 → 4/1) zabija własnego blokera — bot ma spasować, wybrał ${JSON.stringify(chosen)}`);
});

test('M376/3: po rozstrzygnięciu pierwszej (bloker 2/3) kolejna aktywacja też jest odrzucana', () => {
  const state = blockingScene({ energy: 1 });
  setField(state, 'moray', { power: 2, toughness: 3 });   // stan po pierwszym pumpie
  const chosen = botDecision(state);
  assert.notEqual(chosen.type, 'activate_ability',
    `2/3 → 4/1 to śmierć blokera (2 obrażenia od 2/2) bez nowego zysku — bot ma spasować, wybrał ${JSON.stringify(chosen)}`);
});

test('M376/4 (kontrola pozytywna): druga kopia DOBIJAJĄCA większego atakującego jest wybierana', () => {
  const state = blockingScene({ attackerPower: 3, attackerToughness: 3, energy: 1 });
  pushPendingActivation(state);           // 0/5 → 2/3 (2/3 ginie od 3/3, atakujący przeżywa)
  const chosen = botDecision(state);
  assert.equal(chosen.type, 'activate_ability',
    `2/3 → 4/1 zabija atakującego 3/3 — bot ma dobić, wybrał ${JSON.stringify(chosen)}`);
});
