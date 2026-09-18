// Uwaga C2 właściciela z testów (2026-09-19, Merchant's Dockhand): „Gdy
// tapnąłem 1 artefakt to oznacza, że odsłaniam 1 kartę i nie ma żadnego
// wyboru — tą jedną biorę do ręki. […] Pewnie gdybym kliknął »Dalej (Pass)«
// to tej jednej też bym nie wziął do ręki, co jest niezgodne z zasadami.
// Reasumując: przy 1 karcie automatycznie powinien sam ją brać. Przy X>1
// powinienem dostać normalny modal wyboru.”
//
// Root cause: efekty `look_top_put_one_hand_*` kolejkowały `pendingLookTopN`
// (blokująca decyzja + modal) NAWET przy jednej odsłanianej karcie, choć
// „put one of them into your hand” przy jednej karcie nie zostawia wyboru.
// L144: decyzja z jedną opcją to nie decyzja — silnik rozstrzyga sam w chwili
// kolejkowania (wspólnym helperem, bez pending i bez eventu wymagania).
// Anty-over-fix: ≥2 karty = modal jak dotąd; 0 kart = pusty efekt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

function stan(seed = 1) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function kartaBiblioteki(state, id, cardId = 'basic-mountain') {
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'land' });
}

test('C2/1: dokładnie 1 odsłaniana karta → SILNIK bierze ją do ręki sam (bez modala)', () => {
  const state = stan();
  kartaBiblioteki(state, 'lib0');
  const source = { id: 'src', controllerId: 'p1', cardId: 'merchants-dockhand', zone: 'battlefield' };
  const blocked = applyEffect(state, { type: 'look_top_put_one_hand_rest_bottom', amount: 1 }, source, []);
  assert.ok(!blocked, 'ścieżka bez decyzji nie może zgłaszać blokady (L138)');
  assert.equal(state.pendingLookTopN, null, 'jedna karta = brak decyzji (L144)');
  const reka = state.zones.hand.map((id) => state.objects.get(id));
  assert.equal(reka.length, 1, 'karta weszła do ręki');
  assert.equal(reka[0].cardId, 'basic-mountain', 'to ta jedyna karta (L71: nowy obiekt strefy)');
  const resolved = state.events.filter((e) => e.type === 'look_top_resolved');
  assert.equal(resolved.length, 1, 'zdarzenie rozstrzygnięcia niesie skutek do logu');
  assert.equal(resolved[0].pickId, 'lib0');
  assert.equal(resolved[0].restTo, 'library_bottom', 'wariant Dockhand: reszta na spód');
});

test('C2/2 (anty-over-fix): 2+ karty → normalny modal wyboru zostaje', () => {
  const state = stan();
  kartaBiblioteki(state, 'lib0');
  kartaBiblioteki(state, 'lib1', 'basic-island');
  const source = { id: 'src', controllerId: 'p1', cardId: 'merchants-dockhand', zone: 'battlefield' };
  const blocked = applyEffect(state, { type: 'look_top_put_one_hand_rest_bottom', amount: 2 }, source, []);
  assert.equal(blocked, true, 'decyzja przy 2 kartach blokuje rozstrzygnięcie');
  assert.ok(state.pendingLookTopN, 'modal wyboru zostaje przy 2 kartach');
  assert.equal(state.pendingLookTopN.objectIds.length, 2);
});

test('C2/3: wariant grobowy (Gurmag Drowner) też bierze jedyną kartę sam', () => {
  const state = stan();
  kartaBiblioteki(state, 'lib0');
  const source = { id: 'src', controllerId: 'p1', cardId: 'gurmag-drowner', zone: 'battlefield' };
  const blocked = applyEffect(state, { type: 'look_top_put_one_hand_rest_grave', amount: 1 }, source, []);
  assert.ok(!blocked, 'jedna karta = brak decyzji');
  assert.equal(state.pendingLookTopN, null);
  const reka = state.zones.hand.map((id) => state.objects.get(id));
  assert.equal(reka.length, 1, 'jedyna karta do ręki automatycznie');
  const resolved = state.events.find((e) => e.type === 'look_top_resolved');
  assert.equal(resolved?.restTo, 'graveyard', 'wariant grobowy zachowany');
});

test('C2/4: 0 kart (pusta biblioteka) → pusty efekt bez decyzji i bez zdarzeń wyboru', () => {
  const state = stan();
  const source = { id: 'src', controllerId: 'p1', cardId: 'merchants-dockhand', zone: 'battlefield' };
  const blocked = applyEffect(state, { type: 'look_top_put_one_hand_rest_bottom', amount: 3 }, source, []);
  assert.ok(!blocked);
  assert.equal(state.pendingLookTopN, null);
  assert.ok(!state.events.some((e) => e.type === 'look_top_started'));
});

test('C2/5 (E2E przez aktywację): tap 1 artefakt → 1 karta biblioteki do ręki bez komendy resolve', () => {
  const state = stan(11);
  const registry = createCardRegistry();
  // Biblioteka p1: dokładnie 1 karta.
  kartaBiblioteki(state, 'lib0');
  // Dockhand + drugi artefakt do kosztu „Tap X untapped artifacts”.
  addObject(state, { id: 'dh', instanceId: 'i-dh', cardId: 'merchants-dockhand', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(registry.get('merchants-dockhand')) });
  addObject(state, { id: 'art1', instanceId: 'i-art1', cardId: 'angels-feather', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(registry.get('angels-feather')) });
  // Mana {3}{U} w puli.
  addMana(state, 'p1', 4, { colors: ['U'] });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';

  const res = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 1, tapArtifactIds: ['art1'], targets: [],
  });
  assert.ok(res.ok, `aktywacja przyjęta: ${JSON.stringify(res.reason ?? res.events?.[0])}`);
  // Zdolność niemanowa idzie NA STOS (CR 602.2a) — rozstrzyga ją runda passów.
  for (let i = 0; i < 2 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.zones.stack.length, 0, 'stos rozstrzygnięty');
  assert.equal(state.pendingLookTopN, null, 'X=1: jedyna karta brana automatycznie — bez decyzji');
  const reka = state.zones.hand.map((id) => state.objects.get(id)).filter((o) => o.controllerId === 'p1');
  assert.equal(reka.length, 1, 'karta z biblioteki w ręce');
  assert.equal(reka[0].cardId, 'basic-mountain', 'jedyna karta biblioteki wzięta automatycznie');
});
