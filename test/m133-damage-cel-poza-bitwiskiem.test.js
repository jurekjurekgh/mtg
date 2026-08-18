// =============================================================================
// M133 (CR 608.2b) — obrażenia w cel, którego JUŻ NIE MA na bitwisku, to
// FIZZLE, a nie awaria silnika.
//
// OBJAW: `Error: Nieprawidłowy cel obrażeń` przerywał CAŁY proces benchmarku
// (crash, nie przegrana partia): `node tools/benchmark.mjs --seeds 16` kończył
// się komunikatem „Błąd benchmarku" zamiast macierzą wyników.
//
// JAK SIĘ UJAWNIŁ: przy zmianie składu talii w M132 (dosypanie lądów wg reguły
// 2:1). Sam błąd był w kodzie od dawna — talie tylko zmieniły rozdania i trafiły
// w scenariusz. Warto to zapamiętać: „benchmark przechodził wcześniej" nie
// znaczy „kod był poprawny", tylko „próbka nie trafiła w tę ścieżkę".
//
// ROOT CAUSE: `dealNonCombatDamage` przekazywał cel prosto do `markDamage`,
// które wymaga obiektu NA BITWISKU i rzuca wyjątek. Gdy cel zginął, zanim
// zdolność zeszła ze stosu (inne obrażenia, SBA, poświęcenie), engine wywracał
// się zamiast zastosować regułę „jeśli wszystkie cele są nielegalne, czar lub
// zdolność nie rozstrzyga się".
//
// NAPRAWA: brak celu na bitwisku → 0 zadanych obrażeń + zdarzenie
// `damage_fizzled` z powodem (L24 — skutek bez zdarzenia jest niewidoczny dla
// reszty systemu i wygląda jak zawieszona gra).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { dealNonCombatDamage } from '../src/engine/effects.js';
import { describeGameEvent } from '../src/table/session.js';
import { EVENT_TYPES } from '../src/protocol/types.js';

function board() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, types: ['Creature'],
  });
  addObject(state, {
    id: 'victim', instanceId: 'i-victim', cardId: 'highland-game', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, types: ['Creature'],
  });
  return state;
}

test('M133: cel, który opuścił bitwisko, NIE wywala silnika (CR 608.2b)', () => {
  const state = board();
  const source = state.objects.get('src');
  // Cel trafia do grobu, zanim zdolność się rozstrzygnie.
  state.objects.set('victim', Object.freeze({ ...state.objects.get('victim'), zone: 'graveyard' }));
  let dealt;
  assert.doesNotThrow(() => { dealt = dealNonCombatDamage(state, source, 'victim', 3); },
    'obrażenia w nieistniejący cel mają fizzlować, nie rzucać wyjątkiem');
  assert.equal(dealt, 0, 'nic nie zostaje zadane');
});

test('M133: cel usunięty ze stanu w całości (token) też fizzluje', () => {
  const state = board();
  const source = state.objects.get('src');
  state.objects.delete('victim');
  let dealt;
  assert.doesNotThrow(() => { dealt = dealNonCombatDamage(state, source, 'victim', 2); });
  assert.equal(dealt, 0);
});

test('M133: fizzle zostawia ŚLAD w strumieniu zdarzeń (L24)', () => {
  const state = board();
  const source = state.objects.get('src');
  state.objects.set('victim', Object.freeze({ ...state.objects.get('victim'), zone: 'exile' }));
  const before = state.events.length;
  dealNonCombatDamage(state, source, 'victim', 4);
  const fresh = state.events.slice(before);
  const fizzle = fresh.find((e) => e.type === 'damage_fizzled');
  assert.ok(fizzle, `brak zdarzenia damage_fizzled: ${JSON.stringify(fresh.map((e) => e.type))}`);
  assert.equal(fizzle.reason, 'target_left_battlefield', 'zdarzenie niesie POWÓD');
  assert.equal(fizzle.target, 'victim');
  // Nie może udawać, że obrażenia doszły.
  assert.ok(!fresh.some((e) => e.type === 'damage_dealt' && e.amount > 0),
    'żadnych „zadanych" obrażeń przy fizzlu');
});

test('M133: typ zdarzenia jest zarejestrowany w protokole', () => {
  // Strażnik protokołu wyłapał to od razu („Nieznany typ zdarzenia") — test
  // pilnuje, żeby rejestracja nie zniknęła przy sprzątaniu.
  assert.ok(EVENT_TYPES.includes('damage_fizzled'), 'damage_fizzled w EVENT_TYPES');
});

test('M133: log opisuje fizzle po ludzku, bez surowego typu zdarzenia', () => {
  const text = describeGameEvent(
    { type: 'damage_fizzled', source: 'src', sourceCardId: 'goblin-piker', target: 'victim', amount: 3, reason: 'target_left_battlefield' },
    {
      nameOf: (id) => (id === 'goblin-piker' ? 'Goblin Piker' : String(id)),
      nameOfObject: () => '?',
      isPlayer: () => false,
    },
    { p1: 'Ty', p2: 'Nieprzyjaciel' },
  );
  assert.ok(text, 'zdarzenie ma opis w logu');
  assert.match(text, /Goblin Piker/, `opis nazywa źródło: ${text}`);
  assert.match(text, /cel opuścił bitwisko/, `opis podaje powód: ${text}`);
  assert.doesNotMatch(text, /damage_fizzled/, 'żadnego surowego typu zdarzenia w UI');
});

test('M133 (anty-over-fix): normalne obrażenia w żywy cel działają bez zmian', () => {
  const state = board();
  const source = state.objects.get('src');
  const dealt = dealNonCombatDamage(state, source, 'victim', 2);
  assert.equal(dealt, 2, 'cel na bitwisku dostaje pełne obrażenia');
  assert.ok(state.events.some((e) => e.type === 'damage_dealt' && e.amount === 2),
    'zdarzenie damage_dealt powstaje normalnie');
  assert.ok(!state.events.some((e) => e.type === 'damage_fizzled'),
    'żywy cel nie może generować fizzla');
});

test('M133 (anty-over-fix): obrażenia w GRACZA nie przechodzą przez bramkę bitwiska', () => {
  const state = board();
  const source = state.objects.get('src');
  const before = state.players.find((p) => p.id === 'p2').life;
  const dealt = dealNonCombatDamage(state, source, 'p2', 3);
  assert.equal(dealt, 3, 'gracz nie jest permanentem — obrażenia dochodzą');
  assert.equal(state.players.find((p) => p.id === 'p2').life, before - 3);
});
