/**
 * Pin D4b — warstwa 4 (W-7), reguła „as though” (W-8) i nowy obiekt po
 * zmianie strefy (W-9). Plan 2026-09-24, audyt
 * docs/audits/AUDYT_PR134_2026-09-24.md §9.
 *
 * CR 205.1a (CR 2026-09-25, dosłownie, fragment): „when an effect sets one or
 * more of an object's subtypes, the new subtype(s) replaces any existing
 * subtypes from the appropriate set (creature types, land types, artifact
 * types, enchantment types, planeswalker types, or spell types)”.
 * CR 613.7e: „An Aura, Equipment, or Fortification receives a new timestamp
 * each time it becomes attached to an object or player.”
 * CR 702.122a: „Crew N” means „Tap any number of other untapped creatures you
 * control with total power N or greater: This permanent becomes an artifact
 * creature until end of turn.”
 *
 * Stan przed naprawą (sonda na prawdziwych kartach):
 *  W-7 Warrior's Sword na Wishful Merfolk, potem „becomes a Human” →
 *      Human Warrior (typ z załącznika ignorował znacznik); CR: Human.
 *  W-8 Krotiq Nestguard „can attack this turn as though it didn't have
 *      defender” → modelowane jako UTRATA defendera (kafel bez defendera).
 *  W-9 obsadzony pojazd odbity na rękę → w ręce STWÓR (animacja przeżyła
 *      zmianę strefy); Wishful Merfolk po aktywacji odbity → w ręce Human bez
 *      defendera (cleanup przywracał tylko na polu bitwy).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { clearStatModifiers, effectiveKeywords, effectiveSubtypesOnBattlefield } from '../src/engine/permanents.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { staticAttackPrevented } from '../src/engine/combat.js';
import { moveObject } from '../src/engine/mover.js';
import { destroyPermanents } from '../src/engine/destruction.js';
import { processTriggers } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const R = createCardRegistry();
const gra = () => createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });

function karta(state, id, cardId) {
  const def = R.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}
const aktywuj = (state, id, cardId) => {
  for (const effect of [R.get(cardId).abilities[0].effect].flat()) applyEffect(state, effect, state.objects.get(id), []);
};
const crew = (state, id) => {
  const ability = R.get(state.objects.get(id).cardId).abilities.find((a) => a.cost?.crewPower);
  applyEffect(state, ability.effect, state.objects.get(id), []);
};
const podtypy = (state, id) => effectiveSubtypesOnBattlefield(state, state.objects.get(id));

// ── W-7: warstwa 4 w kolejności znaczników ──────────────────────────────────

test('W-7/1: Warrior\'s Sword, POTEM „becomes a Human” → tylko Human (205.1a zastępuje typy stworów)', () => {
  const state = gra();
  karta(state, 'wm', 'wishful-merfolk');
  karta(state, 'sw', 'warriors-sword');
  attachEquipmentToCreature(state, 'sw', 'wm');
  assert.deepEqual(podtypy(state, 'wm').sort(), ['Merfolk', 'Warrior']);
  aktywuj(state, 'wm', 'wishful-merfolk');
  assert.deepEqual(podtypy(state, 'wm'), ['Human']);
});

test('W-7/2: „becomes a Human”, POTEM Warrior\'s Sword → Human Warrior (załącznik późniejszy, 613.7e)', () => {
  const state = gra();
  karta(state, 'wm', 'wishful-merfolk');
  karta(state, 'sw', 'warriors-sword');
  aktywuj(state, 'wm', 'wishful-merfolk');
  attachEquipmentToCreature(state, 'sw', 'wm');
  assert.deepEqual(podtypy(state, 'wm').sort(), ['Human', 'Warrior']);
});

test('W-7/3: cleanup kończy nadpisanie — wracają Merfolk i Warrior z miecza', () => {
  const state = gra();
  karta(state, 'wm', 'wishful-merfolk');
  karta(state, 'sw', 'warriors-sword');
  attachEquipmentToCreature(state, 'sw', 'wm');
  aktywuj(state, 'wm', 'wishful-merfolk');
  clearStatModifiers(state);
  assert.deepEqual(podtypy(state, 'wm').sort(), ['Merfolk', 'Warrior']);
});

// ── W-8: „as though it didn't have defender” to reguła, nie utrata ─────────

test('W-8/1: Krotiq po aktywacji MA defendera, ale może atakować; cleanup przywraca zakaz', () => {
  const state = gra();
  karta(state, 'k', 'krotiq-nestguard');
  assert.equal(staticAttackPrevented(state, state.objects.get('k')), true, 'defender blokuje atak');
  aktywuj(state, 'k', 'krotiq-nestguard');
  assert.ok(effectiveKeywords(state.objects.get('k'), state).includes('defender'), 'defender ZOSTAJE');
  assert.equal(staticAttackPrevented(state, state.objects.get('k')), false, 'atak legalny do końca tury');
  clearStatModifiers(state);
  assert.equal(staticAttackPrevented(state, state.objects.get('k')), true, 'następna tura — znów nie atakuje');
});

test('W-8/2: deskryptor Krotiq nie używa utraty keywordu (warstwa 6) do reguły ataku', () => {
  const effects = [R.get('krotiq-nestguard').abilities[0].effect].flat();
  assert.deepEqual(effects.map((e) => e.type), ['attack_as_though_no_defender_until_end_of_turn']);
  assert.ok(effects.every((e) => !e.losesKeywords));
});

// ── W-9: CR 400.7 — nowy obiekt nie pamięta efektów „do końca tury” ─────────

test('W-9/1: obsadzony pojazd odbity na rękę jest w ręce ARTEFAKTEM, nie stworem', () => {
  const state = gra();
  karta(state, 'v', 'irontread-crusher');
  crew(state, 'v');
  assert.equal(state.objects.get('v').kind, 'creature');
  moveObject(state, 'v', 'hand', 'v-reka');
  const wReku = state.objects.get('v-reka');
  assert.equal(wReku.kind, 'artifact');
  assert.deepEqual(wReku.types, ['Artifact']);
  assert.equal(wReku.originalBeforeAnimation, null);
});

test('W-9/2: Wishful Merfolk po aktywacji odbity → w ręce Merfolk z defenderem', () => {
  const state = gra();
  karta(state, 'wm', 'wishful-merfolk');
  aktywuj(state, 'wm', 'wishful-merfolk');
  moveObject(state, 'wm', 'hand', 'wm-reka');
  const wReku = state.objects.get('wm-reka');
  assert.deepEqual(wReku.subtypes, R.get('wishful-merfolk').subtypes);
  assert.deepEqual(wReku.lostKeywordsUntilEOT, []);
  assert.equal(wReku.subtypesBeforeOverride, null);
});

test('W-9/3: Krotiq po aktywacji odbity i zagrany ponownie — flaga ataku nie przechodzi', () => {
  const state = gra();
  karta(state, 'k', 'krotiq-nestguard');
  aktywuj(state, 'k', 'krotiq-nestguard');
  moveObject(state, 'k', 'hand', 'k-reka');
  moveObject(state, 'k-reka', 'battlefield', 'k-znow');
  assert.equal(state.objects.get('k-znow').attacksAsThoughNoDefenderUntilEOT, false);
});

test('W-9/4: obsadzony pojazd UMIERA jako stwór (LKI) — „whenever another creature dies” odpala', () => {
  for (const [obsadzony, oczekiwane] of [[true, 1], [false, 0]]) {
    const state = gra();
    karta(state, 'so', 'selhoff-occultist');
    karta(state, 'v', 'irontread-crusher');
    if (obsadzony) crew(state, 'v');
    const przed = state.events.length;
    destroyPermanents(state, ['v']);
    processTriggers(state, state.events.slice(przed));
    assert.equal(state.pendingTriggerTargets.length, oczekiwane,
      obsadzony ? 'obsadzony pojazd był stworem w chwili śmierci' : 'nieobsadzony pojazd nie „umiera” (CR 700.4)');
    const wGrobie = [...state.objects.values()].find((o) => o.cardId === 'irontread-crusher');
    assert.equal(wGrobie.kind, 'artifact', 'karta w grobie ma cechy karty (CR 400.7)');
  }
});
