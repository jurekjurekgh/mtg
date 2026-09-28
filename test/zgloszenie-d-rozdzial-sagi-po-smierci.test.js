import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { queueTriggerToStack, resolveTriggerEntry } from '../src/engine/triggers.js';
import { destroyPermanents } from '../src/engine/destruction.js';

// Zgłoszenie właściciela D (2026-09-28e): „Gdy przeciwnik odpowiedział
// niszcząc Sagę (Expose to Daylight) w oknie odpowiedzi na trigger,
// rozstrzygnięcie rozbilo się na nic. […] trigger się rozstrzyga (rozdział 1)
// […] Efekt nigdzie się nie zrealizował, mimo że był na stosie i powinien
// zadziałać."
//
// Reguły (ADR 0030, CR z 2026-09-25, pin repo):
// — CR 714.2: „A chapter symbol is a keyword ability that represents a
//   triggered ability referred to as a chapter ability.”
// — CR 113.7a: „Once activated or triggered, an ability exists on the stack
//   independently of its source. Destruction or removal of the source after
//   that time won't affect the ability. […] its last known information is
//   used. The source can still perform the action even though it no longer
//   exists.”
//
// Root cause: `resolveTriggerEntry` buduje stub LKI zaginionego źródła
// (CR 603.10) BEZ deskryptora `saga` na wierzchu (jest uwięziony wewnątrz
// `lkiPrint`). `fireSagaChapter` czyta `source.saga?.chapters` → pusta lista
// → cichy no-op efektu (zdarzenie saga_chapter_fired i trigger_resolved
// lecą, ale rozdział NIC nie robi).

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addSaga(state, id = 'saga-1') {
  const def = REGISTRY.get('rediscover-the-way');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'rediscover-the-way', controllerId: 'p1', zone: 'battlefield',
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], saga: data.saga ?? null,
    counters: { lore: 1 }, summoningSickness: false,
  });
  return state.objects.get(id);
}

function addLibraryCards(state, n) {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `lib-${i}`, instanceId: `i-lib-${i}`, cardId: `x-lib-${i}`, controllerId: 'p1',
      zone: 'library', kind: 'card', power: 0, toughness: 0, manaCost: 1,
      types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
    });
  }
}

test('D: rozdział I rozstrzyga się po zniszczeniu Sagi (CR 113.7a) — look 3 działa z LKI', () => {
  const state = game();
  const saga = addSaga(state, 'saga-1');
  addLibraryCards(state, 3);
  assert.ok(saga.saga?.chapters?.length === 3, 'setup: karta niesie rozdziały');
  // Rozdział I na STOSIE dokładnie jak queueSagaChapter (bezcelowy rozdział).
  const local = [];
  queueTriggerToStack(state, {
    type: 'triggered',
    trigger: { event: 'saga_chapter' },
    effect: [],
  }, saga, [], local, { sagaChapter: 1 });
  const triggerId = state.zones.stack.find((id) => state.objects.get(id)?.kind === 'trigger');
  assert.ok(triggerId, 'setup: rozdział I jest na stosie');
  // Wróg niszczy Sagę w oknie odpowiedzi (Expose to Daylight) — tak jak
  // destroyPermanents z niszczenia enchantmentów; karta dostaje NOWY id
  // w grobie (jak w logu właściciela: „saga-9 ląduje na cmentarzysku”).
  destroyPermanents(state, ['saga-1'], { cause: 'effect' });
  const inGrave = [...state.objects.values()]
    .some((o) => o.cardId === 'rediscover-the-way' && o.zone === 'graveyard');
  assert.ok(inGrave, 'setup: karta jest w grobie');
  assert.ok(!state.objects.has('saga-1'), 'setup: dawny obiekt nie żyje (nowy id w grobie)');
  // Rozstrzygnięcie triggera ze stosu (ścieżka T6).
  const entry = state.objects.get(triggerId);
  assert.ok(entry?.triggerEntry?.extra?.sagaChapter === 1, 'setup: wpis niesie sagaChapter=1');
  resolveTriggerEntry(state, entry);
  // CR 113.7a: zdolność rozstrzyga się NIEZALEŻNIE od źródła — efekt
  // rozdziału I (look 3, jedna do ręki, reszta na spód) musi się wydarzyć.
  const resolved = state.events.some((e) => e.type === 'trigger_resolved'
    && e.saga === true && e.chapter === 1);
  assert.ok(resolved, 'trigger rozdziału rozstrzyga się');
  assert.ok(state.events.some((e) => e.type === 'saga_chapter_fired' && e.chapter === 1),
    'rozdział I odpalony');
  assert.ok(state.events.some((e) => e.type === 'look_top_started' && e.count === 3),
    `efekt rozdziału (look 3) zrealizowany mimo śmierci Sagi; zdarzenia: ${state.events.map((e) => e.type).join(', ')}`);
  assert.ok(state.pendingLookTopN && state.pendingLookTopN.playerId === 'p1'
    && state.pendingLookTopN.objectIds.length === 3,
    `decyzja „put one into your hand” oczekuje gracza p1; pending=${JSON.stringify(state.pendingLookTopN)}`);
});

test('D/anty-over-fix: trigger rozdziału bez zaginionego źródła rozstrzyga się normalnie (ścieżka żywa)', () => {
  const state = game();
  const saga = addSaga(state, 'saga-1');
  addLibraryCards(state, 3);
  const local = [];
  queueTriggerToStack(state, {
    type: 'triggered', trigger: { event: 'saga_chapter' }, effect: [],
  }, saga, [], local, { sagaChapter: 1 });
  const triggerId = state.zones.stack.find((id) => state.objects.get(id)?.kind === 'trigger');
  resolveTriggerEntry(state, state.objects.get(triggerId));
  assert.ok(state.pendingLookTopN?.objectIds.length === 3, 'żywe źródło: rozdział działa');
  assert.ok(!state.events.some((e) => e.type === 'permanent_sacrificed'),
    'rozdział I nie poświęca Sagi (dopiero III + SBA, CR 714.4)');
});
