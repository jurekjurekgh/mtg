/**
 * Zgłoszenie Q (uwagi z gry, 2026-10-18): log clash pisze przy REMISIE
 * „Clash: Nieprzyjaciel przegrywa (wartość many 4 vs 4)”. Remis to nie
 * przegrana, tylko brak wygranej: CR 701.30 — gracz wygrywa clash, gdy jego
 * karta ma wyższą mana value niż wszystkie pozostałe odsłonięte karty; przy
 * równej wartości NIKT nie wygrywa. Poprawny tekst: „Nieprzyjaciel nie wygrywa”.
 *
 * Efekt (czar wraca do ręki tylko przy wygranej) jest poprawny od dawna —
 * zmienia się wyłącznie opis. Silnik nie rozróżniał remisu od przegranej w
 * zdarzeniu `clash_resolved`, więc dokłada pole `tie`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

/** Release the Ants: p1 rzuca w p2; `minePut`/`theirsPut` to karty na wierzchu bibliotek. */
function stol({ mine, theirs }) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'ants', 'release-the-ants', 'p1', 'hand');
  put(state, 'lib-mine', mine, 'p1', 'library');
  put(state, 'lib-opp', theirs, 'p2', 'library');
  addMana(state, 'p1', 2);
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] });
  assert.ok(cast.ok, JSON.stringify(cast.events[0]));
  return state;
}

/** Przechodzi priorytetami do rozstrzygnięcia clash; zwraca zdarzenia z tych kroków. */
function doClash(state) {
  const events = [];
  for (let i = 0; i < 12 && !state.pendingClash; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.ok(r.ok, JSON.stringify(r.events[0]));
    events.push(...r.events);
  }
  assert.ok(state.pendingClash, 'clash powinien czekać na decyzje');
  return events;
}

const clashEvent = (events) => events.find((e) => e.type === 'clash_resolved');

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const helpers = {
  nameOf: (cardId) => cardId,
  nameOfObject: () => '?',
  isPlayer: (id) => NAMES[id] != null,
};

test('Q/silnik: remis mana value (3 vs 3) → won=false, tie=true', () => {
  const state = stol({ mine: 'armored-skaab', theirs: 'armored-skaab' });
  const ev = clashEvent(doClash(state));
  assert.ok(ev, 'zdarzenie clash_resolved');
  assert.equal(ev.won, false);
  assert.equal(ev.tie, true, 'remis jest jawny — nie wygląda jak przegrana');
});

test('Q/silnik: niższa mana value (2 vs 3) → przegrana, nie remis', () => {
  const state = stol({ mine: 'goblin-piker', theirs: 'armored-skaab' });
  const ev = clashEvent(doClash(state));
  assert.equal(ev.won, false);
  assert.equal(ev.tie, false);
});

test('Q/log: remis pisze „nie wygrywa”, nie „przegrywa” (przykład z uwag: 4 vs 4)', () => {
  const text = describeGameEvent(
    { type: 'clash_resolved', playerId: 'p2', won: false, tie: true, myManaValue: 4, opponentManaValue: 4 },
    helpers, NAMES,
  );
  assert.equal(text, 'Clash: Nieprzyjaciel nie wygrywa (wartość many 4 vs 4)');
});

test('Q/log: przegrana po niższej wartości nadal „przegrywa”', () => {
  const text = describeGameEvent(
    { type: 'clash_resolved', playerId: 'p2', won: false, tie: false, myManaValue: 2, opponentManaValue: 4 },
    helpers, NAMES,
  );
  assert.equal(text, 'Clash: Nieprzyjaciel przegrywa (wartość many 2 vs 4)');
});

test('Q/log: remis z perspektywy gracza — „nie wygrywasz”', () => {
  const text = describeGameEvent(
    { type: 'clash_resolved', playerId: 'p1', won: false, tie: true, myManaValue: 4, opponentManaValue: 4 },
    helpers, NAMES,
  );
  assert.equal(text, 'Clash: nie wygrywasz (wartość many 4 vs 4)');
});

test('Q/log: wygrana nadal „wygrywa”', () => {
  const text = describeGameEvent(
    { type: 'clash_resolved', playerId: 'p1', won: true, tie: false, myManaValue: 4, opponentManaValue: 2 },
    helpers, NAMES,
  );
  // Perspektywa gracza: „Ty wygrywa” → 2. osoba (odmienNaDrugaOsobe).
  assert.equal(text, 'Clash: wygrywasz (wartość many 4 vs 2)');
});

test('Q/efekt: przy remisie czar NIE wraca do ręki (efekt bez zmian)', () => {
  const state = stol({ mine: 'armored-skaab', theirs: 'armored-skaab' });
  doClash(state);
  for (const playerId of ['p1', 'p2']) {
    const r = execute(state, { type: 'resolve_clash_choice', playerId, putOnBottom: false });
    assert.ok(r.ok, JSON.stringify(r.events[0]));
  }
  const ants = [...state.objects.values()].find((o) => o.cardId === 'release-the-ants');
  assert.equal(ants.zone, 'graveyard', 'remis = nie wygrana, czar idzie na cmentarz');
});
