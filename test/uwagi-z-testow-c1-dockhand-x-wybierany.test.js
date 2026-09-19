// Uwaga C1 właściciela z testów (2026-09-19, Merchant's Dockhand): „Brak
// możliwości wybrania X (ile artefaktów tapuję) — aplikacja sama zdecydowała
// o tapnięciu jedynego artefaktu. X=0 musi być dozwolone (jawny błąd),
// a przy wielu artefaktach gracz wybiera KTÓRE tapować.”
//
// E2 (silnik): oferta wariantowa OD X=0 — X=0 to legalna aktywacja (CR 107.3:
// X może być 0; efekt ogląda 0 kart). Walidacja: pusta lista artefaktów
// legalna WYŁĄCZNIE dla X=0; przy X>0 lista musi mieć dokładnie X różnych,
// legalnych artefaktów. Kształt komendy przyrostowy (L135): bot/tester dalej
// widzą warianty, człowiek dostanie kreator (E4) — jeden przycisk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { legalActivatedAbilities } from '../src/engine/abilities.js';
import { tapObject } from '../src/engine/permanents.js';

const registry = createCardRegistry();

function stan(seed = 21) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function put(state, id, cardId, controller = 'p1') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: controller, ownerId: controller,
    zone: 'battlefield', ...gameObjectDataOf(registry.get(cardId)),
  });
}
function dockhandZMana(state, { artefakty = 1 } = {}) {
  put(state, 'dh', 'merchants-dockhand');
  for (let i = 0; i < artefakty; i += 1) put(state, `art${i}`, 'angels-feather');
  addMana(state, 'p1', 4, { colors: ['U'] });
  // jumpToStep: domyślny step stanu to 'untap' — oferta ma tam twardy
  // early-return (CR 502.4), więc badanie oferty wymaga realnego maina.
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
}
function wariantyDockhand(state) {
  return legalActivatedAbilities(state, 'p1').filter((c) => c.objectId === 'dh');
}

test('C1/1: oferta zawiera wariant X=0 oraz X=1..N (N nietapniętych artefaktów)', () => {
  const state = stan();
  dockhandZMana(state, { artefakty: 2 });
  const warianty = wariantyDockhand(state);
  assert.equal(warianty.length, 3, `X=0..2 — dostałem: ${JSON.stringify(warianty.map((w) => w.xValue))}`);
  const x0 = warianty.find((w) => w.xValue === 0);
  assert.ok(x0, 'wariant X=0 istnieje (CR 107.3)');
  assert.deepEqual(x0.tapArtifactIds, [], 'X=0 nie tapuje niczego');
  for (const x of [1, 2]) {
    const w = warianty.find((v) => v.xValue === x);
    assert.ok(w, `wariant X=${x} istnieje`);
    assert.equal(w.tapArtifactIds.length, x, `X=${x} tapuje dokładnie ${x} artefaktów`);
  }
});

test('C1/2: brak innych artefaktów → jedyna oferta to X=0 (wcześniej: brak oferty)', () => {
  const state = stan();
  dockhandZMana(state, { artefakty: 0 });
  const warianty = wariantyDockhand(state);
  assert.equal(warianty.length, 1, 'sam Dockhand = tylko X=0');
  assert.equal(warianty[0].xValue, 0);
  assert.deepEqual(warianty[0].tapArtifactIds, []);
});

test('C1/3: aktywacja X=0 jest legalna E2E (mana zapłacona, nic tapowane, stos rozstrzyga się bez skutku)', () => {
  const state = stan();
  dockhandZMana(state, { artefakty: 1 });
  kartaBiblioteki(state);
  const res = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 0, tapArtifactIds: [], targets: [],
  });
  assert.ok(res.ok, `X=0 przyjęte: ${JSON.stringify(res.reason)}`);
  assert.ok(!state.objects.get('art0').tapped, 'X=0 nie tapuje artefaktów');
  assert.equal(state.zones.hand.length, 0, 'X=0 nie daje kart');
  for (let i = 0; i < 2 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.zones.stack.length, 0, 'jałowa zdolność rozstrzyga się czysto');
  assert.equal(state.pendingLookTopN, null);
});

test('C1/4: walidacja — pusta lista NIELEGALNA przy X>0, niepusta NIELEGALNA przy X=0', () => {
  const state = stan();
  dockhandZMana(state, { artefakty: 1 });
  const pustaPrzyX1 = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 1, tapArtifactIds: [], targets: [],
  });
  assert.ok(!pustaPrzyX1.ok, 'X=1 z pustą listą odrzucone');
  const stan2 = stan(22);
  dockhandZMana(stan2, { artefakty: 1 });
  const niepustaPrzyX0 = execute(stan2, {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 0, tapArtifactIds: ['art0'], targets: [],
  });
  assert.ok(!niepustaPrzyX0.ok, 'X=0 z artefaktem do tapnięcia odrzucone');
  assert.ok(!stan2.objects.get('art0').tapped, 'odrzucona komenda nie tapuje (CR 601.2h)');
});

test('C1/5 (anty-regresja): dotychczasowe odrzuty kosztu Tap X nadal działają', () => {
  const state = stan(23);
  dockhandZMana(state, { artefakty: 2 });
  tapObject(state, 'art0', 'p1');
  const tapniety = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 1, tapArtifactIds: ['art0'], targets: [],
  });
  assert.ok(!tapniety.ok, 'tapnięty artefakt odrzucony');
  const zlyX = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'dh', abilityIndex: 0,
    xValue: 2, tapArtifactIds: ['art1'], targets: [],
  });
  assert.ok(!zlyX.ok, 'X ≠ liczba artefaktów odrzucone');
});

function kartaBiblioteki(state, id = 'lib0', cardId = 'basic-mountain') {
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'land' });
}
