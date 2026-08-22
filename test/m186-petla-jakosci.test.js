// M186 — pętla jakości Żywym Testerem po Batchu 45 (2026-08-22).
// Z1: wizard bloków oferował samotny blok stworem z „can't block alone"
// (Ember Beast, g1-ravnica-innistrad-s9) — walidacja wizarda czytała
// entry.abilities, których playerView nie wysyła (martwa od urodzenia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, ctrl) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
}

test('M186/Z1: widok niesie JAWNE flagi cantAttackAlone/cantBlockAlone (Ember Beast)', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  put(state, 'beast', 'ember-beast', 'p1');
  put(state, 'deer', 'highland-game', 'p1');
  for (const observer of ['p1', 'p2']) {
    const view = playerView(state, observer);
    const beast = view.zones.battlefield.find((o) => o.id === 'beast');
    assert.equal(beast.cantAttackAlone, true, `${observer}: flaga cantAttackAlone w widoku`);
    assert.equal(beast.cantBlockAlone, true, `${observer}: flaga cantBlockAlone w widoku`);
    const deer = view.zones.battlefield.find((o) => o.id === 'deer');
    assert.ok(!deer.cantBlockAlone, `${observer}: zwykły stwór bez flagi`);
  }
});

test('M186/Z2: etykieta Assert Perfection bez drugiego celu nie pokazuje pytajnika', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const MOCK = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: (id) => (id === 'mine' ? 'Highland Game' : String(id)),
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    view: () => ({ zones: { battlefield: [] } }),
  };
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const label = commandLabel(
    { type: 'cast_spell', playerId: 'p1', objectId: 'x', targets: ['mine', null] },
    MOCK,
    playerView(state, 'p1'),
  );
  const celPart = String(label).split('cel:')[1] ?? '';
  assert.ok(!celPart.includes('?'), `bez pytajnika w części celów: ${label}`);
  assert.ok(celPart.includes('Highland Game'), 'nazwa pierwszego celu zostaje');
});

test('M186/Z3: grupa Epic Experiment jest wyciszalna, a „zakończ" (done) nie jest realną decyzją', async () => {
  // Żywy Tester (g7 ravnica vs innistrad s37): darmowe rzuty z Epic
  // Experiment („you may cast") to pętla OPCJONALNA z wariantem
  // { done: true } — grupa musi być wyciszalna (OPTION_IGNORABLE_TYPES),
  // a wyciszona decyzja auto-wykonuje „zakończ" (klasa M180/Z4 — Halo
  // Forager). Strażnik źródłowy: lista + semantyka done w session.
  const { OPTION_IGNORABLE_TYPES } = await import('../src/table/render.js');
  assert.ok(OPTION_IGNORABLE_TYPES.includes('resolve_epic_choice'),
    'resolve_epic_choice na liście wyciszalnych');
  const sessionSrc = (await import('node:fs')).readFileSync('src/table/session.js', 'utf8');
  assert.ok(/cmd\.done === true/.test(sessionSrc),
    'session traktuje done: true jak rezygnację (auto-decline + hasMeaningfulDecision)');
});

test('M186/Z4: opis triggera Ivy Lane Denizen niesie filtry (zielony, pod twoją kontrolą)', async () => {
  // Żywy Tester (g7): kafel mówił „Gdy inny stwór wchodzi..." — obiecywał
  // trigger od KAŻDEGO stwora, a Oracle filtruje kolor i kontrolę.
  const { cardInfo, rulesText } = await import('../src/table/render.js');
  const MOCK = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: (id) => String(id),
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    view: () => ({ zones: { battlefield: [] } }),
  };
  const text = rulesText(cardInfo(MOCK, { cardId: 'ivy-lane-denizen', id: 'x' }));
  assert.ok(text.includes('zielony'), `filtr koloru w opisie: ${text}`);
  assert.ok(text.includes('pod twoją kontrolą'), `filtr kontroli w opisie: ${text}`);
});
