// Zgłoszenie właściciela F2 (2026-11-21, Lash of the Balrog):
//   „Wybieram opcję zapłacenia {4} zamiast poświęcenia, nie dostaję mana
//    wizarda — tylko engine tapuje losowo moje lądy.”
//
// USTALONE: wariant `payAltCost` przechodzi `play()` → `manaWizardFor` →
// `paymentDescriptorOf`, który liczy TYLKO koszt bazowy karty (dla Lash {B}
// = 1) i nie zna `additionalCost.orPayMana` ({4}). Bramka
// `shouldOpenManaWizard` dostaje złą kwotę (1 zamiast 5): przy jednym
// kształcie płatności dla {B} zamyka kreator → `playDirect` → `castSpell`
// pobiera bazę + {4} auto-tapem silnika (kolejność lądów = „losowa”).
//
// Kontrakt (L48: oferta = walidacja; reguła właściciela M195/A): kreator
// many MA się otworzyć przy niejednoznacznej płatności i zebrać PEŁNĄ
// kwotę (baza + {4}), a nie tylko bazę.
//
// Testy są RED na starym kodzie (totalNeeded = 1, bramka = false).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { producibleMana, canPayColoredCost, addMana, expandManaPool } from '../src/engine/resources.js';
import {
  paymentDescriptorOf, shouldOpenManaWizard, wizardProgress, countPaymentVariants,
} from '../src/table/mana-wizard.js';

const REG = createCardRegistry();

/** Scena właściciela: mieszane lądy (wiele kształtów płatności), cel wroga,
 *  Lash w ręce, pusta pula. Oferta zawiera wariant payAltCost. */
function ownerScene() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const put = (id, cardId, ctrl, zone) => {
    const def = REG.get(cardId);
    assert.ok(def, `karta ${cardId} w rejestrze`);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
    return state.objects.get(id);
  };
  const cre = (id, ctrl) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `t-${id}`, controllerId: ctrl, ownerId: ctrl,
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    });
    const obj = state.objects.get(id);
    state.objects.set(id, { ...obj, summoningSickness: false });
  };
  // 8 lądów 4 profili → wiele kształtów płatności dla kwoty 5 z pipem {B}.
  put('sw1', 'basic-swamp', 'p1', 'battlefield');
  put('sw2', 'basic-swamp', 'p1', 'battlefield');
  put('fo1', 'basic-forest', 'p1', 'battlefield');
  put('fo2', 'basic-forest', 'p1', 'battlefield');
  put('mt1', 'basic-mountain', 'p1', 'battlefield');
  put('mt2', 'basic-mountain', 'p1', 'battlefield');
  put('is1', 'basic-island', 'p1', 'battlefield');
  put('is2', 'basic-island', 'p1', 'battlefield');
  cre('foe', 'p2'); // cel czaru (bez celu oferta by nie powstała)
  cre('m1', 'p1'); // własny stwór → warianty poświęcenia (nie tylko payAlt)
  put('lash', 'lash-of-the-balrog', 'p1', 'hand');
  return state;
}

/** Źródła many jak w main.js (lądy z pełnego stanu). */
function landSources(state) {
  const sources = [];
  for (const id of state.zones.battlefield) {
    const o = state.objects.get(id);
    if (o.controllerId !== 'p1') continue;
    if (o.kind !== 'land' && !(o.types ?? []).includes('Land')) continue;
    const colors = o.cardId.includes('swamp') ? ['B']
      : o.cardId.includes('forest') ? ['G']
        : o.cardId.includes('mountain') ? ['R']
          : o.cardId.includes('island') ? ['U'] : [];
    sources.push({
      id, kind: 'land', colors, amount: 1,
      command: { type: 'tap_for_mana', playerId: 'p1', objectId: id },
    });
  }
  return sources;
}

test('F2/1: wariant payAltCost jest w ofercie silnika', () => {
  const state = ownerScene();
  const view = playerView(state, 'p1');
  const payAlt = view.legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'lash' && c.payAltCost === true);
  assert.ok(payAlt, 'oferta zawiera „Zapłać {4}”');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell'
    && c.objectId === 'lash' && c.sacrificeTargetId != null), 'i warianty poświęcenia');
});

test('F2/2: deskryptor płatności wariantu payAlt zna PEŁNĄ kwotę (baza + {4})', () => {
  const state = ownerScene();
  const view = playerView(state, 'p1');
  const payAlt = view.legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'lash' && c.payAltCost === true);
  assert.ok(payAlt);
  const base = paymentDescriptorOf(
    view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'lash'
      && c.sacrificeTargetId != null), view);
  const desc = paymentDescriptorOf(payAlt, view, {});
  assert.ok(desc, 'deskryptor istnieje');
  const orPay = 4; // additionalCost.orPayMana z definicji karty
  assert.equal(desc.totalNeeded, base.totalNeeded + orPay,
    `payAlt płaci bazę (${base.totalNeeded}) + {${orPay}} = ${base.totalNeeded + orPay}; `
    + `stary kod dawał ${desc.totalNeeded}`);
  assert.match(desc.costStr, /4/, 'etykieta kosztu pokazuje dopłatę {4}');
  // Wariant poświęcenia (bez dopłaty) zostaje przy samej bazie.
  assert.equal(base.totalNeeded, base.totalNeeded, 'sanity');
});

test('F2/3: bramka otwiera kreator dla payAlt przy niejednoznacznej płatności', () => {
  const state = ownerScene();
  const view = playerView(state, 'p1');
  const payAlt = view.legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'lash' && c.payAltCost === true);
  const desc = paymentDescriptorOf(payAlt, view, {});
  const sources = landSources(state);
  const input = {
    sources,
    poolMana: 0,
    poolUnits: [],
    totalNeeded: desc.totalNeeded,
    requirements: desc.requirements,
    autoPayableMana: producibleMana(state, 'p1', null, {}, []),
    autoPayableColors: canPayColoredCost(state, 'p1', desc.requirements),
  };
  // Stary kod (totalNeeded = 1): variants({B}) = 1 (same bagna) i auto-tap
  // pokrywa 1 → bramka ZAMYKA kreator → playDirect → auto-tap silnika.
  assert.ok(shouldOpenManaWizard(input),
    `kreator MUSI się otworzyć dla kwoty ${desc.totalNeeded} (stary kod: kwota `
    + `${paymentDescriptorOf(payAlt, view, {}).totalNeeded} zamykała kreator)`);
  // Wiele kształtów dla pełnej kwoty (nie tylko same bagna).
  assert.ok(countPaymentVariants(sources, 0, desc.totalNeeded, desc.requirements, 2, []) >= 2,
    'mieszane lądy dają ≥2 kształty płatności dla pełnej kwoty');
});

test('F2/4: kreator zbiera PEŁNĄ kwotę — progress nie domyka się na bazie', () => {
  const state = ownerScene();
  let view = playerView(state, 'p1');
  const payAlt = view.legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'lash' && c.payAltCost === true);
  const desc = paymentDescriptorOf(payAlt, view, {});
  const sources = landSources(state);
  // Po tapnięciu samej bazy (1 many w puli z bagna) kreator NIE jest gotowy.
  addMana(state, 'p1', 1, { colors: ['B'] });
  view = playerView(state, 'p1');
  let poolUnits = expandManaPool(state.players.find((p) => p.id === 'p1').manaPool);
  let progress = wizardProgress(view, 'p1', desc, sources, poolUnits);
  assert.equal(progress.done, false,
    `przy puli 1 (baza bez {4}) kreator czeka na resztę — stare totalNeeded=${desc.totalNeeded} `
    + 'zamykało się tutaj');
  // Pełna kwota (baza + 4) w puli z kolorem {B} → gotowy.
  addMana(state, 'p1', desc.totalNeeded - 1, { colors: ['C'] });
  view = playerView(state, 'p1');
  poolUnits = expandManaPool(state.players.find((p) => p.id === 'p1').manaPool);
  progress = wizardProgress(view, 'p1', desc, sources, poolUnits);
  assert.equal(progress.done, true, `przy puli ${desc.totalNeeded} (z {B}) kreator zamyka płatność`);
});
