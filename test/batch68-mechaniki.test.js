// Batch 68 (kolekcja 400–411): mechaniki silnika dokodowane generycznie (ADR 0002).
// Wszystkie testy na KARTACH SYNTETYCZNYCH (ADR 0029): katalog nie rośnie z testów.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { blockAssignmentViolation } from '../src/engine/combat.js';

function game() {
  const s = createGameState({ seed: 68, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  return s;
}
function creature(s, id, playerId, { abilities = [], power = 2, toughness = 2 } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: playerId,
    zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['U'],
    subtypes: ['Wizard'], keywords: [], power, toughness, abilities,
  });
}

// --- M1: stały „can't be blocked" (statyczna zdolność na permanencie) -------
test('B68/M1: stwór z „can\'t be blocked” nie może być blokowany; zwykły — może', () => {
  const s = game();
  creature(s, 'nb', 'p1', { abilities: [{ type: 'static', cantBeBlocked: true }] });
  creature(s, 'plain', 'p1');
  creature(s, 'blk', 'p2');
  assert.ok(blockAssignmentViolation(s, s.objects.get('nb'), ['blk']), 'stały can\'t be blocked: blok odrzucony');
  assert.equal(blockAssignmentViolation(s, s.objects.get('plain'), ['blk']), null, 'zwykły stwór: blok dozwolony');
});

// --- M2: czar „can't be countered” (flaga na czarze) ----------
import { counterStackObject } from '../src/engine/effects.js';
function spellOnStack(s, id, spell) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: 'p1',
    zone: 'stack', kind: 'spell', types: ['Sorcery'], colors: ['R'], spell,
  });
}
test('B68/M2: czar z „can\'t be countered” nie jest kontrowany; zwykły — jest', () => {
  const s = game();
  spellOnStack(s, 'uncounterable', { timing: 'sorcery', cantBeCountered: true, effects: [] });
  spellOnStack(s, 'plain', { timing: 'sorcery', effects: [] });
  assert.equal(counterStackObject(s, 'uncounterable', { counteredBy: 'x' }), null, 'flaga: kontra bez skutku');
  assert.equal(s.objects.get('uncounterable')?.zone, 'stack', 'czar nadal na stosie');
  assert.ok(counterStackObject(s, 'plain', { counteredBy: 'x' }), 'kontrola dodatnia: zwykły czar skontrowany');
});

// --- M3: zniszczenie + dobranie, gdy WARTOŚĆ MANA celu była ≤ N (CR 608.2c, „was”) ---
import { applyEffect } from '../src/engine/effects.js';
function artifact(s, id, manaCost) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: 'p2',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], colors: [], manaCost, abilities: [],
  });
}
function library(s, owner, n) {
  for (let i = 0; i < n; i += 1) {
    addObject(s, { id: `lib-${owner}-${i}`, instanceId: `i-lib-${owner}-${i}`, cardId: 'test-lib', controllerId: owner, zone: 'library', kind: 'card', types: ['Sorcery'], colors: [], abilities: [] });
  }
}
const handOf = (s, playerId) => s.zones.hand.filter((id) => s.objects.get(id)?.controllerId === playerId).length;
test('B68/M3: destroy + draw gdy MV celu ≤ N; brak dobrania gdy MV > N', () => {
  for (const [mv, drawn] of [[1, 1], [0, 1], [2, 0]]) {
    const s = game();
    library(s, 'p1', 3);
    artifact(s, 'art', mv);
    const source = { id: 'src', cardId: 'test-src', controllerId: 'p1', zone: 'stack', kind: 'spell', types: ['Sorcery'], abilities: [] };
    const before = handOf(s, 'p1');
    applyEffect(s, { type: 'destroy_permanent', drawIfManaValueAtMost: 1 }, source, ['art'], {});
    assert.equal(s.objects.get('art')?.zone ?? 'graveyard', 'graveyard', `MV ${mv}: artefakt zniszczony`);
    assert.equal(handOf(s, 'p1') - before, drawn, `MV ${mv}: dobrane ${drawn}`);
  }
});

// --- M4: token dla KONTROLERA CELU zapisanego PRZED exile (Secure the Scene, CR 608.2b/c) ---
function tokensOf(s, playerId) {
  return [...s.objects.values()].filter((o) => o.zone === 'battlefield' && o.controllerId === playerId && o.kind === 'creature');
}
test('B68/M4: exile celu + token dla JEGO kontrolera (przechwycony przed exile); cel zniknął → brak tokena', () => {
  const s = game();
  addObject(s, { id: 'perm', instanceId: 'i-perm', cardId: 'test-perm', controllerId: 'p2', zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['G'], abilities: [] });
  const source = { id: 'src', cardId: 'test-src', controllerId: 'p1', zone: 'stack', kind: 'spell', types: ['Sorcery'], abilities: [] };
  applyEffect(s, { type: 'exile_permanent', captureControllerAs: 'targetController' }, source, ['perm'], {});
  applyEffect(s, { type: 'create_token', controllerFromCapture: 'targetController', cardId: 'token-soldier', name: 'Soldier', kind: 'creature', power: 1, toughness: 1, colors: ['W'], types: ['Creature'], subtypes: ['Soldier'] }, source, [], {});
  assert.equal(s.objects.get('perm')?.zone, undefined, 'cel wygnany');
  assert.equal(tokensOf(s, 'p2').length, 1, 'token dla kontrolera celu (p2)');
  assert.equal(tokensOf(s, 'p1').length, 0, 'nie dla kontrolera czaru (p1)');
  // cel zniknął przed rozstrzygnięciem → exile nic nie robi, token nie powstaje
  const s2 = game();
  applyEffect(s2, { type: 'exile_permanent', captureControllerAs: 'targetController' }, source, ['ghost'], {});
  applyEffect(s2, { type: 'create_token', controllerFromCapture: 'targetController', cardId: 'token-soldier', name: 'Soldier', kind: 'creature', power: 1, toughness: 1, colors: ['W'], types: ['Creature'], subtypes: ['Soldier'] }, source, [], {});
  assert.equal(tokensOf(s2, 'p1').length + tokensOf(s2, 'p2').length, 0, 'brak tokena przy zniknięciu celu');
});

// --- M5: masowe zniszczenie z filtrem (Austere Command, CR 701.8 + 608.2b) ---
test('B68/M5: destroy_all z filtrem typ + MV ≤/≥; indestructible zostaje', () => {
  const s = game();
  addObject(s, { id: 'c-small', instanceId: 'i1', cardId: 'c1', controllerId: 'p2', zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['G'], manaCost: 3, abilities: [] });
  addObject(s, { id: 'c-big', instanceId: 'i2', cardId: 'c2', controllerId: 'p2', zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['G'], manaCost: 5, abilities: [] });
  addObject(s, { id: 'c-indes', instanceId: 'i3', cardId: 'c3', controllerId: 'p2', zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['G'], manaCost: 1, keywords: ['indestructible'], abilities: [] });
  addObject(s, { id: 'art', instanceId: 'i4', cardId: 'c4', controllerId: 'p1', zone: 'battlefield', kind: 'artifact', types: ['Artifact'], colors: [], manaCost: 1, abilities: [] });
  const source = { id: 'src', cardId: 'test-src', controllerId: 'p1', zone: 'stack', kind: 'spell', types: ['Sorcery'], abilities: [] };
  applyEffect(s, { type: 'destroy_all', filter: { types: ['Creature'], manaValueAtMost: 3 } }, source, [], {});
  const onBf = (cardId) => [...s.zones.battlefield].some((id) => s.objects.get(id)?.cardId === cardId);
  const inGy = (cardId) => s.zones.graveyard.some((id) => s.objects.get(id)?.cardId === cardId);
  assert.ok(!onBf('c1') && inGy('c1'), 'MV 3 creature zniszczony (→ cmentarz)');
  assert.ok(onBf('c2'), 'MV 5 nie pasuje do filtra');
  assert.ok(onBf('c3'), 'indestructible zostaje');
  assert.ok(onBf('c4'), 'artefakt nie pasuje do typu');
  // MV ≥ 4 (drugi tryb Austere Command)
  applyEffect(s, { type: 'destroy_all', filter: { types: ['Creature'], manaValueAtLeast: 4 } }, source, [], {});
  assert.ok(!onBf('c2') && inGy('c2'), 'MV ≥4 zniszczony');
});

// --- M6: „Choose two —\" (CR 700.2): dwa RÓŻNE tryby, efekty w kolejności drukowanej ---
import { chooseTwoModes } from '../src/cards/card-data.js';
test('B68/M6: choose two — 6 par, kolejność drukowana, oba tryby rozstrzygane', () => {
  const modes = [
    { name: 'A', effects: [{ type: 'destroy_all', filter: { types: ['Artifact'] } }] },
    { name: 'B', effects: [{ type: 'destroy_all', filter: { types: ['Enchantment'] } }] },
    { name: 'C', effects: [{ type: 'destroy_all', filter: { types: ['Creature'], manaValueAtMost: 3 } }] },
    { name: 'D', effects: [{ type: 'destroy_all', filter: { types: ['Creature'], manaValueAtLeast: 4 } }] },
  ];
  const pairs = chooseTwoModes(modes);
  assert.equal(pairs.length, 6, 'C(4,2) = 6 par różnych trybów');
  assert.deepEqual(pairs.map((p) => p.effects.length), [2, 2, 2, 2, 2, 2]);
  // para (A,D) = indeks 2: artefakty, potem kreatury MV ≥4 — kolejność drukowana
  assert.equal(pairs[2].name, 'A + D');
  assert.deepEqual(pairs[2].effects[0].filter.types, ['Artifact']);
  assert.equal(pairs[2].effects[1].filter.manaValueAtLeast, 4);
  // rozstrzygnięcie pary (A,D) na stole: artefakt + kreatura MV 5 giną, kreatura MV 3 zostaje
  const s = game();
  addObject(s, { id: 'art', instanceId: 'x1', cardId: 'k-art', controllerId: 'p2', zone: 'battlefield', kind: 'artifact', types: ['Artifact'], colors: [], manaCost: 2, abilities: [] });
  addObject(s, { id: 'big', instanceId: 'x2', cardId: 'k-big', controllerId: 'p2', zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['G'], manaCost: 5, abilities: [] });
  addObject(s, { id: 'small', instanceId: 'x3', cardId: 'k-small', controllerId: 'p2', zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['G'], manaCost: 3, abilities: [] });
  const source = { id: 'src', cardId: 'test-src', controllerId: 'p1', zone: 'stack', kind: 'spell', types: ['Sorcery'], abilities: [] };
  for (const effect of pairs[2].effects) applyEffect(s, effect, source, [], {});
  const onBf = (cardId) => [...s.zones.battlefield].some((id) => s.objects.get(id)?.cardId === cardId);
  assert.ok(!onBf('k-art') && !onBf('k-big'), 'obie zniszczone');
  assert.ok(onBf('k-small'), 'kreatura MV 3 poza trybem D');
});
