// Zgłoszenie właściciela E1 (2026-09-10, sesja arena/01a08d0e).
//
// Objaw przy stole: Furious Forebear bota ginie i w „Rozgrywce" pojawia się
// „Furious Forebear — zapłacić {1}{W}? (wybór opcjonalny: Nieprzyjaciel)".
// Zdolność nie powinna się była odpalić W OGÓLE.
//
// Oracle (Scryfall, TDM): „Whenever a creature you control dies **while this
// card is in your graveyard**, you may pay {1}{W}. If you do, return this card
// from your graveyard to your hand."
// Ruling WotC 2025-04-04: „If Furious Forebear dies at the same time as one or
// more creatures you control, its ability won't trigger."
//
// Czyli: warunkiem triggera jest pobyt karty W GROBIE w chwili śmierci stwora.
// Przy własnej śmierci karta dopiero TAM JEDZIE (CR 603.6c: zdolności
// leaves-the-battlefield patrzą wstecz na stół, nie do przodu do grobu), więc
// warunek nie jest spełniony. To samo dotyczy JEDNOCZESNYCH zgonów (jedna partia
// SBA) — w chwili zdarzenia karta jeszcze nie leżała w grobie.
//
// Przyczyna źródłowa (zmierzona): src/engine/triggers.js — skan obiektów
// w grobie po zdarzeniu śmierci (`source.zone !== 'graveyard'`) nie wyklucza
// karty, która właśnie umarła, ani współpoległych z tej samej partii SBA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect, dealNonCombatDamage } from '../src/engine/effects.js';
import { processTriggers } from '../src/engine/triggers.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 909, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // {1}{W} musi być płatne — inaczej `canPayTrigger` (triggers.js:268) gasi
  // trigger z powodu braku many i test mierzyłby płatność, nie warunek grobu.
  addMana(state, 'p1', 2, { colors: ['W'] });
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Czy po przetworzeniu zdarzeń pojawiła się dobrowolna dopłata Forebeara? */
function forebearChcePlacic(state, events) {
  const zdarzenie = events.some((e) => e.type === 'optional_pay_required' && e.cardId === 'furious-forebear');
  const oczekuje = state.pendingOptionalPay != null
    && (state.pendingOptionalPay.cardId === 'furious-forebear'
      || state.objects.get(state.pendingOptionalPay.sourceId ?? '')?.cardId === 'furious-forebear');
  return zdarzenie || oczekuje;
}

test('E1/1: własna śmierć Furious Forebear NIE odpala jego zdolności (nie było go jeszcze w grobie)', () => {
  const state = game();
  const fb = putCard(state, 'fb', 'furious-forebear', 'p1');
  assert.equal(fb.zone, 'battlefield', 'setup: Forebear na polu bitwy');
  const source = putCard(state, 'src', 'shatter', 'p2');

  applyEffect(state, { type: 'destroy_permanent' }, source, ['fb']);
  const events = [...state.events];
  processTriggers(state, events);

  assert.equal(forebearChcePlacic(state, events), false,
    'zdolność odpaliła się na własną śmierć — w chwili zdarzenia karta nie była w grobie');
});

test('E1/2: jednoczesna śmierć Forebeara i innego stwora (jedna partia SBA) też NIE odpala', () => {
  const state = game();
  const fb = putCard(state, 'fb', 'furious-forebear', 'p1');
  const towarzysz = putCard(state, 'tow', 'highland-game', 'p1');
  const source = putCard(state, 'src', 'shock', 'p2');

  // Jedno rozstrzygnięcie obrażeń zabija oba stwory → jedna partia SBA.
  dealNonCombatDamage(state, source, 'fb', 9);
  dealNonCombatDamage(state, source, 'tow', 9);
  const events = runStateBasedActions(state);
  const zebrane = [...(events ?? []), ...state.events];
  processTriggers(state, zebrane);

  const zginely = ['fb', 'tow'].filter((id) => {
    const obiekt = state.objects.get(id);
    return !obiekt || obiekt.zone !== 'battlefield';
  });
  assert.ok(zginely.length >= 1, 'setup: przynajmniej jeden stwór zginął od obrażeń SBA');
  assert.equal(forebearChcePlacic(state, zebrane), false,
    'ruling WotC 2025-04-04: przy jednoczesnych zgonach zdolność nie odpala');
});

test('E1/3 (anty-over-fix): Forebear W GROBIE + śmierć innego stwora → zdolność odpala', () => {
  const state = game();
  putCard(state, 'fb', 'furious-forebear', 'p1', 'graveyard');
  const ofiara = putCard(state, 'ofiara', 'highland-game', 'p1');
  const source = putCard(state, 'src', 'shatter', 'p2');

  applyEffect(state, { type: 'destroy_permanent' }, source, ['ofiara']);
  const events = [...state.events];
  processTriggers(state, events);

  assert.equal(state.objects.get('ofiara')?.zone !== 'battlefield', true, 'setup: ofiara zginęła');
  assert.equal(forebearChcePlacic(state, events), true,
    'zdolność z grobu na śmierć INNEGO stwora musi działać (inaczej karta jest martwa)');
});
