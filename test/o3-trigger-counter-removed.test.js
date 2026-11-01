// O-3 z audytu PR #176 (domknięcie w sesji 2026-10-27c, PR #177).
//
// Znalezisko: skan triggerów dla `counter_removed` był bramkowany flagą
// `ev.damagePrevention === true` (wprowadzoną dla Magma Pummelera: „When one or
// more counters are removed from this creature THIS WAY…”). Skutek: generyczna
// zdolność „Whenever a counter is removed from this creature” (bez „this way”)
// nie odpalała NIGDY — żadna droga zdejmowania liczników (efekt, koszt
// zdolności, anihilacja +1/+1 vs −1/−1 w regule stanu) nie była skanowana.
//
// CR 603.2: „Whenever a game event or game state matches a triggered ability's
// trigger event, that ability automatically triggers.” Droga zdejmowania
// liczników nie jest częścią zdarzenia — jest nią tylko wtedy, gdy karta
// mówi „this way”, i to karta deklaruje deskryptorem
// (`trigger.damagePreventionOnly`), a nie rdzeń silnika (ADR 0002).
//
// Karta syntetyczna: w katalogu nie ma nośnika tej mechaniki (żadna wspierana
// karta nie ma triggera bez „this way”) — dozwolone przez ADR 0022/0030
// (test mechaniki bez karty; katalog rośnie wyłącznie z batchy właściciela,
// ADR 0029). Wariant z RODZAJEM licznika („a +1/+1 counter”) świadomie czeka
// na nośnik — filtr `trigger.counter` dokładamy razem z pierwszą taką kartą.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addCounter, removeCounter } from '../src/engine/counters.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { dealNonCombatDamage } from '../src/engine/effects.js';
import { processTriggers } from '../src/engine/triggers.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

function game() {
  const state = createGameState({ seed: 903, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 5);
  return state;
}

function creature(state, id, data = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', types: ['Creature'], subtypes: [], colors: ['R'],
    keywords: [], power: 2, toughness: 2, abilities: [], ...data,
  });
  return state.objects.get(id);
}

/** Generyczny trigger „Whenever a counter is removed from this creature”. */
const GENERIC_TRIGGER = createAbility({
  type: ABILITY_TYPE.triggered,
  trigger: { event: 'counter_removed' },
  effect: [{ type: 'gain_life', amount: 2 }],
});

/** Ten sam kształt, ale z „this way” (Magma Pummeler). */
const THIS_WAY_TRIGGER = createAbility({
  type: ABILITY_TYPE.triggered,
  trigger: { event: 'counter_removed', damagePreventionOnly: true },
  effect: [{ type: 'gain_life', amount: 2 }],
});

const stackTriggers = (state) => (state.zones.stack ?? [])
  .map((id) => state.objects.get(id))
  .filter((entry) => entry && (entry.triggerEntry || entry.kind === 'trigger'));

const triggeredEvents = (state) => state.events.filter((e) => e.type === 'ability_triggered');

test('O-3: generyczny trigger odpala, gdy licznik zdejmuje EFEKT (droga bez prewencji)', () => {
  const state = game();
  creature(state, 'host', { abilities: [GENERIC_TRIGGER] });
  addCounter(state, 'host', '+1/+1', 2);
  const before = state.events.length;
  removeCounter(state, 'host', '+1/+1', 1);
  processTriggers(state, state.events.slice(before));
  assert.equal(stackTriggers(state).length, 1,
    'trigger „whenever a counter is removed” musi wejść na stos przy zwykłym zdjęciu licznika');
  assert.equal(state.turn.priorityPlayerId, 'p1');
});

test('O-3: ten sam trigger odpala przy ANIHILACJI +1/+1 vs −1/−1 (SBA, CR 122.3)', () => {
  const state = game();
  creature(state, 'host', { abilities: [GENERIC_TRIGGER] });
  addCounter(state, 'host', '+1/+1', 1);
  addCounter(state, 'host', '-1/-1', 1);
  const eventos = runStateBasedActions(state);
  processTriggers(state, eventos);
  assert.equal(stackTriggers(state).length, 1,
    'anihilacja zdejmuje liczniki — generyczny trigger ją widzi');
});

test('O-3: ani jeden trigger nie odpala, gdy licznik jest DOKŁADANY', () => {
  const state = game();
  creature(state, 'host', { abilities: [GENERIC_TRIGGER] });
  const before = state.events.length;
  addCounter(state, 'host', '+1/+1', 1);
  processTriggers(state, state.events.slice(before));
  assert.equal(stackTriggers(state).length, 0, 'dołożenie licznika to nie zdjęcie');
});

test('O-3 anty-over-fix: „this way” (Magma Pummeler) NIE odpala przy zwykłym zdjęciu licznika', () => {
  const state = game();
  creature(state, 'host', { abilities: [THIS_WAY_TRIGGER] });
  addCounter(state, 'host', '+1/+1', 2);
  const before = state.events.length;
  removeCounter(state, 'host', '+1/+1', 1);
  processTriggers(state, state.events.slice(before));
  assert.equal(stackTriggers(state).length, 0,
    'trigger z „this way” widzi wyłącznie drogę prewencji obrażeń (deskryptor karty, ADR 0002)');
});

test('O-3 regresja: „this way” NADAL odpala przy prewencji obrażeń (Magma Pummeler)', () => {
  // Karta z katalogu — źródło prawdy o kształcie deskryptora; pin batcha 70
  // pilnuje pełnej ścieżki, tutaj sprawdzamy, że domknięcie O-3 jej nie zepsuło.
  const registry = createCardRegistry();
  const card = registry.get('magma-pummeler');
  assert.ok(card, 'Magma Pummeler w katalogu');
  const state = game();
  addObject(state, {
    id: 'pummeler', instanceId: 'i-pummeler', cardId: 'magma-pummeler',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature',
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], abilities: card.abilities ?? [],
  });
  addCounter(state, 'pummeler', '+1/+1', 3);
  const before = state.events.length;
  dealNonCombatDamage(state, state.objects.get('pummeler'), 'pummeler', 2);
  processTriggers(state, state.events.slice(before));
  // Pummeler ma cel („to any target”) — trigger czeka na decyzję celu
  // (`resolve_trigger_target`), więc dowodem odpalenia jest zdarzenie
  // `ability_triggered` albo wpis na stosie (kolejność zależy od kolejki decyzji).
  assert.ok(triggeredEvents(state).length + stackTriggers(state).length >= 1,
    `prewencja zdejmująca liczniki nadal odpala trigger Pummelera `
    + `(zdarzenia: ${JSON.stringify(state.events.slice(before).map((e) => e.type))})`);
  assert.equal(state.objects.get('pummeler').counters['+1/+1'], 1, 'zdjęto 2 liczniki');
});

test('O-3 (LKI, CR 603.10): trigger odpala, gdy zdjęcie licznika zabija własne źródło', () => {
  // 0/0 z jednym +1/+1: koszt zdolności zdejmuje licznik → wytrzymałość 0 →
  // reguła stanu (CR 704.5f) zabija stwór. Zdarzenie licznika powstało, GDY
  // permanent jeszcze był na polu bitwy, więc trigger musi wejść na stos —
  // źródło bierzemy z migawki (obiekt w grobie niesie deskryptor zdolności).
  const state = game();
  const HOST = createAbility({
    type: ABILITY_TYPE.activated,
    cost: { removeCounter: { name: '+1/+1', amount: 1 } },
    effect: [{ type: 'gain_life', amount: 1 }],
  });
  creature(state, 'host', { power: 0, toughness: 0, abilities: [HOST, GENERIC_TRIGGER] });
  addCounter(state, 'host', '+1/+1', 1);

  const before = state.events.length;
  const res = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'host', abilityIndex: 0 });
  assert.equal(res.ok, true, `aktywacja przeszła (${res.reason ?? 'ok'})`);
  const dead = [...state.objects.values()]
    .find((o) => o.cardId === 'synthetic-host' && o.zone === 'graveyard');
  assert.ok(dead, 'stwór 0/0 zginął od SBA (CR 704.5f) — nowy obiekt w grobie (CR 400.7)');
  const fired = triggeredEvents(state).filter((e) => e.trigger === 'counter_removed');
  assert.equal(fired.length, 1,
    `trigger widzi zdarzenie mimo śmierci źródła: ${JSON.stringify(state.events.slice(before).map((e) => e.type))}`);
  assert.equal(fired[0].playerId, 'p1', 'kontroler z migawki LKI, nie z obiektu w grobie');
});
