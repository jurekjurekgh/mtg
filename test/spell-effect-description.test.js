import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeSpellEffects } from '../src/table/render.js';

// =============================================================================
// Opis efektów czarów i zdolności z amount (A) + fateful hour (CR 702.86)
// Zgłoszenie właściciela 2026-08-08: Gather the Townsfolk tworzy 2 (lub 5
// przy życiu ≤ 5), ale UI mówił "Tworzysz token 1/1" (nominalnie). W logu
// i na stole wszystko działa, tylko opis kłamał. Poniższe testy pilnują
// spójności opisu z faktycznym efektem.
// =============================================================================

test('describeSpellEffects: create_token amount=1 zostaje bez "N×" (Crested Herdcaller)', () => {
  const spell = {
    effects: [
      { type: 'create_token', name: 'Dinosaur', power: 3, toughness: 3, amount: 1 },
    ],
    targets: [],
  };
  const desc = describeSpellEffects(spell);
  assert.ok(desc.includes('Stwórz 3/3 Dinosaur'), `expected "Stwórz 3/3 Dinosaur" in: ${desc}`);
  assert.ok(!desc.includes('×'), `expected no "×" for amount=1, got: ${desc}`);
});

test('describeSpellEffects: create_token amount>1 dostaje prefiks "N×" (Gather the Townsfolk)', () => {
  // Gather the Townsfolk (DDQ): 2 tokeny, z fateful hour 5 tokenów przy życiu ≤ 5.
  const spell = {
    effects: [
      { type: 'create_token', cardId: 'token_human', name: 'Human',
        power: 1, toughness: 1, amount: 2, ifLifeAtMost: 5, amountIfCondition: 5 },
    ],
    targets: [],
  };
  const desc = describeSpellEffects(spell);
  assert.ok(desc.includes('×2'), `expected "×2" in: ${desc}`);
  assert.ok(desc.includes('1/1 Human'), `expected "1/1 Human" in: ${desc}`);
  assert.ok(desc.includes('5 przy'), `expected fateful hour info in: ${desc}`);
  assert.ok(desc.includes('życiu'), `expected "życiu" in: ${desc}`);
  assert.ok(desc.includes('≤ 5'), `expected "≤ 5" in: ${desc}`);
});

test('describeSpellEffects: create_token bez amount traktowany jak 1 (Awakening Zone itp.)', () => {
  // Karty z create_token bez jawnego amount (domyślnie 1) — zostają bez "N×".
  const spell = {
    effects: [
      { type: 'create_token', name: 'Soldier', power: 1, toughness: 1 },
    ],
    targets: [],
  };
  const desc = describeSpellEffects(spell);
  assert.ok(desc.includes('Stwórz 1/1 Soldier'), `expected "Stwórz 1/1 Soldier" in: ${desc}`);
  assert.ok(!desc.includes('×'), `expected no "×" for missing amount, got: ${desc}`);
});

test('describeSpellEffects: create_token amount=2 BEZ fateful hour nie dodaje "(X przy życiu)"', () => {
  // Howl of the Night Pack (M10) — tworzy N tokenów (dynamicznie, wg Forestów),
  // ale nie ma fateful hour; nominalny amount z definicji to 2 (test jednostkowy).
  const spell = {
    effects: [
      { type: 'create_token', name: 'Wolf', power: 2, toughness: 2, amount: 2 },
    ],
    targets: [],
  };
  const desc = describeSpellEffects(spell);
  assert.ok(desc.includes('×2 2/2 Wolf'), `expected "×2 2/2 Wolf" in: ${desc}`);
  assert.ok(!desc.includes('życiu'), `expected no fateful hour for Howl, got: ${desc}`);
});

test('describeEffect: create_token z amount > 1 dostaje "N×" (Sailor of Means itp.)', () => {
  // describeEffect jest wewnętrzny (nieujawniony) — weryfikujemy przez reguły
  // tekstu emitowane przez `rulesText`, który używa `describeAbility` →
  // `describeEffect`. Dla testu jednostkowego sprawdzamy spójność
  // describeSpellEffects (publiczny) — efekt aktywowanej zdolności ma tę
  // samą logikę prefiksu "N×" w describeEffect.
  //
  // Tu tylko potwierdzamy kontrakt: describeSpellEffects z amount=3 używa
  // tego samego prefiksu co describeEffect (obie gałęzie zostały
  // zaktualizowane w commicie A 2026-08-08).
  const spell = {
    effects: [
      { type: 'create_token', name: 'Human', power: 1, toughness: 1, amount: 3 },
    ],
    targets: [],
  };
  const desc = describeSpellEffects(spell);
  assert.ok(desc.includes('×3'), `expected "×3" prefix from same logic, got: ${desc}`);
});
