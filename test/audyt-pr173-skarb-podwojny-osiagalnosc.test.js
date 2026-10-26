/**
 * Audyt PR #173 (F-1, 2026-10-26): `paymentReachableMana` musi liczyć manę
 * osiągalną dla decyzji płatniczych BEZ podwójnego zliczenia Skarbu.
 *
 * Kontrakt: `producibleMana` już liczy nietapnięte tokeny Skarbów
 * (M179/E — `fromTreasureBoard`), a auto-tap `spendMana` je wydaje, więc
 * „osiągalne teraz" = producible + netto zdolności o KOSZCIE RĘCZNYM
 * (CR 608.2g: „…they may activate mana abilities before taking that
 * action", dosłownie z cr-raw.txt wyd. 2026-09-25, ADR 0030). Pętla
 * ręcznych zdolności w `paymentReachableMana` dokładała jednak KAŻDY
 * `add_mana`, łącznie z `fromTreasure` — drugi raz. Bliźniacza
 * `manualManaOfferUnits` świadomie pomija `fromTreasure` („policzylibyśmy
 * je podwójnie").
 *
 * Skutek sprzed naprawy (sonda `.arena/probe-f1.mjs`): przy 1 Skarbie
 * i decyzji „zapłać {2}" oferta `pay:true` POWSTAWAŁA (1 producible +
 * 1 Skarb z pętli = 2), a `execute` zwracał
 * `counter_pay_insufficient_mana` — przycisk zbudowany w zgłoszeniu K
 * (właściciel: „Zapłać {1}" → kreator) okazał się w takim oknie pułapką.
 *
 * Piny:
 *   F1/1 — 1 Skarb + kwota 2: NIE ma „Zapłać" (RED przed naprawą);
 *   F1/2 — kontrola pozytywna: 1 Skarb + kwota 1: „Zapłać" jest
 *          (auto-tap Skarba go pokrywa — producible = 1);
 *   F1/3 — anty-over-fix K: Mountain + Scion (zdolność ręczna, bez
 *          Skarba) + kwota 2: „Zapłać" NADAL jest (osiągalne = 1 + 1);
 *   F1/4 — ta sama reguła przy dopłacie ward (drugi konsument
 *          `paymentReachableMana`): 1 Skarb + kwota 2 brak, kwota 1 jest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone = 'battlefield', playerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function fresh() {
  const state = createGameState({ seed: 91, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  return state;
}

const counterPay = (amount) => ({
  playerId: 'p1', amount, sourceId: 'src', targetId: 'tgt',
  sourceCardId: 'abstruse-interference', restorePriorityTo: 'p1',
});
const wardPay = (amount) => ({
  playerId: 'p1', amount, wardSourceId: 'src', wardCardId: 'abstruse-interference',
  targetingStackId: 'tgt', restorePriorityTo: 'p1',
});
const payOffer = (state) => playerView(state, 'p1').legalCommands
  .find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true);
const wardOffer = (state) => playerView(state, 'p1').legalCommands
  .find((c) => c.type === 'resolve_ward_pay_choice' && c.pay === true);

test('F1/1: 1 Skarb + „zapłać {2}" — oferta NIE powstaje (bez podwójnego zliczenia skarbu)', () => {
  const state = fresh();
  put(state, 'treasure', 'token_treasure');
  state.pendingCounterPay = counterPay(2);
  assert.equal(payOffer(state), undefined,
    'bramka osiągalności widzi 1 skarb (producible) — {2} jest poza zasięgiem');
});

test('F1/2: kontrola pozytywna — 1 Skarb + „zapłać {1}": oferta jest (auto-tap skarba pokrywa)', () => {
  const state = fresh();
  put(state, 'treasure', 'token_treasure');
  state.pendingCounterPay = counterPay(1);
  const offer = payOffer(state);
  assert.ok(offer, 'kwota 1 ≤ producible (1 skarb) — przycisk zostaje');
  assert.equal(offer.cost, 1);
});

test('F1/3: anty-over-fix K — Mountain + Scion (ręczne ŹRÓDŁO, nie skarb): oferta {2} jest', () => {
  const state = fresh();
  put(state, 'mtn', 'basic-mountain');
  put(state, 'scion', 'token_eldrazi_scion');
  state.pendingCounterPay = counterPay(2);
  assert.ok(payOffer(state),
    'osiągalne = producible (góra 1) + netto ręczne (scion 1) — CR 608.2g');
});

test('F1/4: ta sama reguła przy dopłacie ward — 1 Skarb: {2} brak, {1} jest', () => {
  const withTreasure = fresh();
  put(withTreasure, 'treasure', 'token_treasure');
  withTreasure.pendingWardPay = wardPay(2);
  assert.equal(wardOffer(withTreasure), undefined,
    'ward korzysta z tej samej `paymentReachableMana` — bez fantomu');

  const one = fresh();
  put(one, 'treasure', 'token_treasure');
  one.pendingWardPay = wardPay(1);
  assert.ok(wardOffer(one), 'kwota 1 przy jednym skarbie pozostaje oferowana');
});
