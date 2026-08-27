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

// =============================================================================
// M229 (audyt nowych talii, Sarkhan's Rage) — efekt `conditional`:
//  1. warunek `controlsNoCreatureSubtype` wyciekał jako surowy identyfikator;
//  2. brak gałęzi `else` dawał urwane „; w przeciwnym razie:" (pusty opis).
// =============================================================================

test('M229: conditional bez else nie zostawia urwanego „w przeciwnym razie"', () => {
  const spell = {
    effects: [
      { type: 'damage', amount: 5 },
      {
        type: 'conditional', condition: 'controlsNoCreatureSubtype', subtype: 'Dragon',
        then: { type: 'damage_to_controller', amount: 2 },
      },
    ],
    targets: [{ type: 'any_target' }],
  };
  const desc = describeSpellEffects(spell);
  assert.doesNotMatch(desc, /controlsNoCreatureSubtype/, 'surowy identyfikator nie może wyciekać');
  assert.match(desc, /nie kontrolujesz stworów typu Dragon/, 'warunek po polsku z podtypem');
  assert.doesNotMatch(desc, /w przeciwnym razie:\s*($|·)/, 'brak urwanej gałęzi else');
});

test('M229: conditional z else opisuje obie gałęzie', () => {
  const spell = {
    effects: [
      {
        type: 'conditional', condition: 'controlsCreatureWithCounter',
        then: { type: 'draw_cards', amount: 1 },
        else: { type: 'damage_to_controller', amount: 1 },
      },
    ],
    targets: [],
  };
  assert.match(describeSpellEffects(spell), /w przeciwnym razie:/);
});

// =============================================================================
// M230 (audyt talii spoza podziału, Severed Strands) — gain_life z DYNAMICZNĄ
// ilością (= wytrzymałość poświęconego stwora): kafel pokazywał „zyskaj
// undefined życia" (brak statycznego `amount`).
// =============================================================================

test('M230: gain_life dynamiczne (amountFromSacrificedToughness) bez „undefined"', () => {
  const spell = {
    effects: [
      { type: 'gain_life', amountFromSacrificedToughness: true },
      { type: 'destroy_permanent' },
    ],
    targets: [{ type: 'creature_opponent_controls' }],
  };
  const desc = describeSpellEffects(spell);
  assert.doesNotMatch(desc, /undefined/, 'brak wycieku undefined');
  assert.match(desc, /wytrzymałość poświęconego stwora/, 'opis dynamicznej ilości życia');
});

test('M230: gain_life ze statyczną ilością działa jak dotąd', () => {
  assert.match(describeSpellEffects({ effects: [{ type: 'gain_life', amount: 3 }], targets: [] }), /zyskaj 3 życia/);
  assert.match(describeSpellEffects({ effects: [{ type: 'gain_life', amount: 1 }], targets: [] }), /zyskaj 1 życie/);
});

test('M230: conditional controlsPlaneswalkerWithSubtype po polsku (Liliana\u2019s Triumph)', () => {
  const spell = {
    effects: [
      { type: 'player_sacrifices_creature' },
      {
        type: 'conditional', condition: 'controlsPlaneswalkerWithSubtype', subtype: 'Liliana',
        then: { type: 'discard_each_opponent', amount: 1 }, else: null,
      },
    ],
    targets: [{ type: 'player' }],
  };
  const desc = describeSpellEffects(spell);
  assert.doesNotMatch(desc, /controlsPlaneswalkerWithSubtype/);
  assert.match(desc, /kontrolujesz planeswalkera Liliana/);
});

// Strażnik klasy (M229/M230): ŻADEN opis czaru wspieranej karty nie wycieka
// surowym identyfikatorem (camelCase warunku/efektu, undefined, [object]).
// Ta rodzina błędów wracała trzykrotnie (landEnteredThisTurn, Sarkhan's Rage,
// Liliana's Triumph, Severed Strands) — mechaniczny przegląd całego katalogu
// łapie kolejne, zanim znajdzie je dopiero Żywy Tester.
test('M230/strażnik: żaden opis czaru katalogu nie wycieka surowym identyfikatorem', async () => {
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const registry = createCardRegistry();
  const offenders = [];
  for (const card of registry.all()) {
    if (card.support?.status !== 'supported' || !card.spell) continue;
    let desc = '';
    try { desc = describeSpellEffects(card.spell) || ''; } catch (e) { offenders.push(`${card.id}: THROW ${e.message}`); continue; }
    if (/undefined|NaN|\[object|amountFrom[A-Z]|controls[A-Z]/.test(desc)) offenders.push(`${card.id}: ${desc.slice(0, 80)}`);
  }
  assert.deepEqual(offenders, [], `opisy z wyciekiem:\n${offenders.join('\n')}`);
});
