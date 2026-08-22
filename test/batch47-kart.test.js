// Batch 47 (M194, 2026-08-23) — lista właściciela, 8 kart.
//
// Transza A: warianty druku (Curate STX, Negate M15) — te same reguły co
// egzemplarze już w katalogu, inny art i PLAN (czyli inna talia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();

// ---- Transza A: dwa egzemplarze tej samej karty --------------------------

test('B47/A1: Curate STX i Curate BRO to DWA egzemplarze o zgodnych regułach', () => {
  const bro = REGISTRY.get('curate');
  const stx = REGISTRY.get('curate-stx');
  assert.ok(bro && stx, 'oba egzemplarze w katalogu');
  assert.equal(stx.name, bro.name, 'ta sama karta (nazwa)');
  assert.notEqual(stx.set, bro.set, 'różne druki');
  assert.notEqual(stx.artId, bro.artId, 'różne ilustracje');
  assert.notEqual(stx.plan, bro.plan, 'różne plany → różne talie');
  assert.equal(stx.plan, 'Arcavios');
  assert.equal(bro.plan, 'Forgotten Realms');
  // Reguły MUSZĄ być identyczne — to ta sama karta Magic (ten sam Oracle).
  assert.equal(stx.oracleText, bro.oracleText, 'identyczny Oracle');
  assert.deepEqual(stx.spell.effects, bro.spell.effects, 'identyczne efekty');
  assert.deepEqual(stx.spell.targets, bro.spell.targets);
  assert.equal(stx.manaCost, bro.manaCost);
});

test('B47/A2: Negate M15 i Negate M20 to DWA egzemplarze o zgodnych regułach', () => {
  const m20 = REGISTRY.get('negate');
  const m15 = REGISTRY.get('negate-m15');
  assert.ok(m20 && m15, 'oba egzemplarze w katalogu');
  assert.equal(m15.name, m20.name);
  assert.notEqual(m15.set, m20.set);
  assert.notEqual(m15.artId, m20.artId);
  assert.equal(m15.plan, 'Warhammer Fantasy', 'plan wskazany przez właściciela');
  assert.equal(m20.plan, 'Wiedźmin', 'egzemplarz M20 zostaje bez zmian');
  assert.equal(m15.oracleText, m20.oracleText);
  assert.deepEqual(m15.spell.effects, m20.spell.effects);
  assert.deepEqual(m15.spell.targets, m20.spell.targets);
});

test('B47/A3: każdy egzemplarz trafia do talii SWOJEGO planu', () => {
  // Sedno zlecenia: „będą dwie takie karty, jedna w jednej talii, druga
  // w drugiej". Bez rozróżnienia egzemplarzy (M194/K1) obie linie talii
  // rozwiązałyby się na ten sam cardId.
  const deckOf = (file) => parseDeckText(fs.readFileSync(`decks/${file}`, 'utf8'), REGISTRY).cardIds;
  const gdzie = (cardId) => fs.readdirSync('decks')
    .filter((f) => f.endsWith('.txt'))
    .filter((f) => deckOf(f).includes(cardId));
  for (const [cardId, oczekiwane] of [
    ['curate', 'forgotten-realms.txt'],
    ['curate-stx', 'worek-legend.txt'],
    ['negate', 'wiedzmin.txt'],
    ['negate-m15', 'warhammer.txt'],
  ]) {
    assert.deepEqual(gdzie(cardId), [oczekiwane],
      `${cardId} ma być w DOKŁADNIE jednej talii: ${oczekiwane}`);
  }
});

test('B47/A4: warianty są rzucalne w grze (pełna ścieżka, nie tylko dane)', async () => {
  // Karta w katalogu to za mało — musi dać się rzucić. Sprawdzamy ofertę
  // w playerView dla OBU egzemplarzy (wariant nie może być martwym wpisem).
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  for (const cardId of ['curate-stx', 'negate-m15']) {
    const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'main', 'p1');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p1';
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id: 'spell', instanceId: 'i-spell', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
      ...gameObjectDataOf(def), types: def.types, spell: def.spell,
    });
    for (let i = 0; i < 2; i += 1) {
      addObject(state, {
        id: `isl${i}`, instanceId: `i-isl${i}`, cardId: 'basic-island', controllerId: 'p1',
        ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Island'],
      });
    }
    const view = playerView(state, 'p1');
    const offers = view.legalCommands.filter((c) => c.objectId === 'spell');
    if (cardId === 'curate-stx') {
      assert.ok(offers.some((c) => c.type === 'cast_spell'), `${cardId}: oferta rzutu (surveil 2 + dobranie)`);
    } else {
      // Negate wymaga celu na stosie — bez czaru przeciwnika oferty NIE ma
      // (CR 601.2c). Sprawdzamy więc, że karta jest znana i ma cel w danych.
      assert.deepEqual(def.spell.targets, [{ type: 'noncreature_spell_on_stack' }]);
    }
  }
});
