// =============================================================================
// Sesja 2026-10-27c (PR #177) — uwaga B właściciela:
//
//   „Apprentice Wizard i karty produkujące manę wymagające innej many (np.
//    lądy: tap + {1} za kolorową manę) — silnik nie może deterministycznie
//    tapować lądów przy płaceniu za zdolność; powinien otworzyć drugi,
//    niezależny Mana Wizard na opłatę tej zdolności i wrócić do pierwszego,
//    by dokończyć płatność za pierwotny czar."
//
// Bug: `onTapSource` w kreatorze many wysyłał `activate_ability` prosto do
// silnika (playDirect). Silnik opłacał koszt zdolności własnym auto-tapem
// („pierwszy ląd z brzegu", `spendMana`), więc gracz nie miał żadnego wpływu na
// to, KTÓRE źródła płacą {U}/{1} za zdolność, a kreator płatności pierwotnego
// czaru nie wiedział, że trwa druga płatność.
//
// Naprawa: źródło z `activationCost` otwiera KREATOR PODRZĘDNY na koszt
// aktywacji (stos `manaWizardParents`), po jego dokończeniu gra wraca do
// kreatora nadrzędnego. Ten test pinuje (a) plan tapnięcia źródła, (b) model
// kosztu, który kreator podrzędny ma zebrać, (c) semantykę stosu kreatorów.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');

function localFunction(name) {
  const from = source.indexOf(`  function ${name}(`);
  assert.notEqual(from, -1, `${name} w main.js`);
  const end = source.indexOf('\n  }', from);
  assert.ok(end > from, `koniec ${name}`);
  return source.slice(from, end + '\n  }'.length);
}

/** Wyjmuje `manaSourceTapPlan` z main.js (czysta funkcja, konwencja M348). */
function tapPlan(sourceModel) {
  const ctx = createContext({});
  runInContext(`${localFunction('manaSourceTapPlan')}\nthis.plan = manaSourceTapPlan;`, ctx);
  return ctx.plan(sourceModel);
}

test('B: ląd bez kosztu aktywacji → jedna komenda tap_for_mana (bez kreatora podrzędnego)', () => {
  const plan = tapPlan({
    id: 'las', kind: 'land', colors: ['G'], amount: 1,
    command: { type: 'tap_for_mana', playerId: 'p1', objectId: 'las' },
  });
  assert.equal(plan.nested, false);
  assert.deepEqual(plan.command, { type: 'tap_for_mana', playerId: 'p1', objectId: 'las' });
});

test('B: zdolność many z KOSZTEM MANY → kreator podrzędny (nie auto-tap silnika)', () => {
  const plan = tapPlan({
    id: 'wiz', kind: 'ability', colors: ['C'], amount: 3,
    activationCost: { generic: 0, colors: ['U'] },
    command: { type: 'activate_ability', playerId: 'p1', objectId: 'wiz', abilityIndex: 0 },
  });
  assert.equal(plan.nested, true, 'Apprentice Wizard „{U},{T}: Add {C}{C}{C}" musi otworzyć drugi kreator');
  assert.equal(plan.command.type, 'activate_ability');
  // Ląd-konwerter „{1},{T}: Add {G}" — ten sam kontrakt (koszt generyczny).
  const land = tapPlan({
    id: 'grove', kind: 'ability', colors: ['G'], amount: 1,
    activationCost: { generic: 1, colors: [] },
    command: { type: 'activate_ability', playerId: 'p1', objectId: 'grove', abilityIndex: 0 },
  });
  assert.equal(land.nested, true);
});

test('B: model kosztu kreatora podrzędnego = dokładnie koszt aktywacji zdolności', () => {
  // Deskryptor płatności dla activate_ability czyta koszt z deskryptora
  // zdolności (widok nie niesie abilities) — ten sam kontrakt co silnik.
  const view = { zones: { battlefield: [{ id: 'wiz', cardId: 'apprentice-wizard' }] } };
  const descriptor = paymentDescriptorOf(
    { type: 'activate_ability', playerId: 'p1', objectId: 'wiz', abilityIndex: 0 },
    view,
    { ability: { cost: { mana: 1, colors: ['U'], tap: true } } },
  );
  assert.ok(descriptor, 'kreator podrzędny ma co zbierać');
  assert.equal(descriptor.totalNeeded, 1);
  assert.deepEqual(descriptor.requirements, [['U']]);
});

test('B: stos kreatorów — podrzędny wraca do nadrzędnego, zamknięcie czyści cały stos', () => {
  const ctx = createContext({
    el: () => ({ className: '' }), modalOpenedAt: {}, els: { manaWizardBody: {} },
  });
  runInContext(`
    let manaWizardDescriptor = null;
    const manaWizardParents = [];
    let refreshed = 0;
    function showModal() {}
    function hideModal() {}
    function refreshManaWizard() { refreshed += 1; }
    ${localFunction('openNestedManaWizard')}
    ${localFunction('returnToParentManaWizard')}
    ${localFunction('closeManaWizard')}
    this.api = {
      openNestedManaWizard, returnToParentManaWizard, closeManaWizard,
      open: (d) => { manaWizardDescriptor = d; },
      current: () => manaWizardDescriptor,
      depth: () => manaWizardParents.length,
      refreshed: () => refreshed,
    };
  `, ctx);
  const api = ctx.api;
  api.open({ cmd: 'cast_spell' });
  api.openNestedManaWizard({ cmd: 'activate_ability' });
  assert.equal(api.current().cmd, 'activate_ability');
  assert.equal(api.depth(), 1, 'kreator nadrzędny czeka na stosie');

  api.returnToParentManaWizard();
  assert.equal(api.current().cmd, 'cast_spell', 'po opłaceniu zdolności wracamy do pierwotnego czaru');
  assert.equal(api.depth(), 0);
  assert.ok(api.refreshed() >= 2, 'każdy powrót odświeża model kreatora');

  api.openNestedManaWizard({ cmd: 'activate_ability' });
  api.closeManaWizard();
  assert.equal(api.current(), null, 'zamknięcie czyści cały stos');
  assert.equal(api.depth(), 0);
});

test('B: silnik wydaje ZEBRANĄ pulę na koszt zdolności — nie tapuje „pierwszego lądu z brzegu"', () => {
  // Kontrakt, na którym stoi kreator podrzędny: po zebraniu {U} w kreatorze
  // (tap_for_mana wyspy) aktywacja Apprentice Wizarda płaci z PULI, a nie
  // auto-tapem innego lądu (spendMana → pula → dopiero potem auto-tap).
  const registry = createCardRegistry();
  const put = (state, { id, cardId, controllerId, zone, kind }) => {
    const card = registry.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
      ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
      subtypes: card.subtypes ?? [], spell: card.spell,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, { id: 'wiz', cardId: 'apprentice-wizard', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'island', cardId: 'basic-island', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  put(state, { id: 'forest', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  assert.equal(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'island' }).ok, true);
  assert.equal(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'wiz', abilityIndex: 0 }).ok, true);
  assert.equal(state.objects.get('forest').tapped, false, 'las nie może zostać dotknięty — płaci pula');
  assert.equal(state.players[0].mana, 3, '{U} z puli + {C}{C}{C} produkcji');
});
