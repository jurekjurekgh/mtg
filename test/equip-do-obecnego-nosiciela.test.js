// M102/U9 — oferta „Wyposaż X → Y", gdy X JUŻ jest przypięty do Y.
//
// Znalezione Żywym Testerem (partia azorius vs black, seed 202, kroki 88-90):
// panel akcji pokazywał w kółko
//   „Wyposaż: Greatsword of Tyr (Ty) → Expose to Daylight (morph) (koszt 1)"
// mimo że miecz był już przypięty do tego samego stwora. Gracz kliknął to
// dwa razy z rzędu, za każdym razem płacąc {1} i nie zmieniając niczego:
//   „Aktywujesz Equip: Greatsword of Tyr → cel: Expose to Daylight (morph)"
//   „Greatsword of Tyr wyposaża Expose to Daylight (morph)"
//
// Zasady: CR 702.6a — „Equip [cost]" znaczy „Attach this permanent to target
// creature you control". Przypięcie do stwora, do którego sprzęt już jest
// przypięty, jest legalne, ale to całkowity no-op: zdolność nic nie zmienia,
// a gracz traci manę (często cały swój ruch w turze). Silnik już wyklucza
// z kandydatów sam sprzęt (CR 702.6a), ale NIE wyklucza obecnego nosiciela.
//
// Kontrakt: oferta ma zawierać wyłącznie ruchy, które coś zmieniają, czyli
// przepięcia na INNEGO stwora. Gdy sprzęt jest przypięty do jedynego stwora
// gracza, akcja equip nie ma sensu i nie powinna się w ogóle pojawić.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

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

/**
 * Stan: gracz kontroluje sprzęt i `creatures` stworów. `attachedTo` mówi, do
 * którego stwora sprzęt jest już przypięty (null = leży luzem).
 */
function equipState({ creatures = ['c1'], attachedTo = null } = {}) {
  const state = createGameState({ seed: 2024, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  for (const cid of creatures) {
    addRealCard(state, cid, 'midnight-guard', 'p1', 'battlefield', { summoningSickness: false });
  }
  if (attachedTo) {
    const sword = state.objects.get('sword');
    state.objects.set('sword', Object.freeze({ ...sword, attachedTo }));
  }
  addMana(state, 'p1', 6, { colors: ['W'] });
  return state;
}

/**
 * Komendy equip widziane przez gracza. Uwaga na kontrakt: `legalCommands`
 * niesie `abilityIndex` (nie obiekt zdolności), więc keyword sprawdzamy
 * w rejestrze karty — inaczej filtr po `c.ability.keyword` cicho zwraca 0
 * wyników i test przechodzi z fałszywych powodów.
 */
function equipCommands(state) {
  const sword = state.objects.get('sword');
  return playerView(state, 'p1').legalCommands.filter((c) => {
    if (c.type !== 'activate_ability' || c.objectId !== 'sword') return false;
    return sword.abilities?.[c.abilityIndex]?.keyword === 'equip';
  });
}

test('U9: sprzęt przypięty do stwora NIE jest oferowany do przypięcia do TEGO SAMEGO stwora', () => {
  const state = equipState({ creatures: ['c1', 'c2'], attachedTo: 'c1' });
  const offers = equipCommands(state);
  const toCurrentHost = offers.filter((c) => (c.targets ?? []).includes('c1'));
  assert.equal(toCurrentHost.length, 0,
    'przypięcie do obecnego nosiciela to no-op — nie może być w ofercie '
    + `(oferty: ${JSON.stringify(offers.map((o) => o.targets))})`);
});

test('U9: przepięcie na INNEGO stwora pozostaje dostępne', () => {
  const state = equipState({ creatures: ['c1', 'c2'], attachedTo: 'c1' });
  const offers = equipCommands(state);
  const toOther = offers.filter((c) => (c.targets ?? []).includes('c2'));
  assert.equal(toOther.length, 1,
    'przepięcie na innego stwora ma sens i musi zostać w ofercie');
});

test('U9: luźny sprzęt można przypiąć do każdego swojego stwora', () => {
  const state = equipState({ creatures: ['c1', 'c2'], attachedTo: null });
  const offers = equipCommands(state);
  const targets = offers.flatMap((c) => c.targets ?? []).sort();
  assert.deepEqual(targets, ['c1', 'c2'],
    'nieprzypięty sprzęt ma pełną ofertę celów');
});

test('U9: sprzęt na jedynym stworze nie generuje żadnej oferty equip', () => {
  const state = equipState({ creatures: ['c1'], attachedTo: 'c1' });
  const offers = equipCommands(state);
  assert.equal(offers.length, 0,
    'nie ma na co przepiąć — akcja equip byłaby wyłącznie stratą many '
    + `(oferty: ${JSON.stringify(offers.map((o) => o.targets))})`);
});

test('U9: komenda pozostaje LEGALNA w protokole (stare replaye się nie psują)', async () => {
  const { execute } = await import('../src/engine/game-state.js');
  const state = equipState({ creatures: ['c1'], attachedTo: 'c1' });
  const sword = state.objects.get('sword');
  const abilityIndex = sword.abilities.findIndex((a) => a.keyword === 'equip');
  // Oferta jej nie pokazuje (to no-op), ale silnik nadal ją przyjmuje —
  // ten sam kontrakt co tap_for_mana: „nie enumerujemy, ale wykonujemy".
  const result = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'sword', abilityIndex, targets: ['c1'],
  });
  assert.ok(result.ok, 'execute musi nadal przyjmować tę komendę');
  assert.equal(state.objects.get('sword').attachedTo, 'c1', 'nosiciel bez zmian');
});
