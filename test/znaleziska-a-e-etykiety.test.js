// Znaleziska testera A–E (2026-09-09): etykiety oferty.
// A: Dream Twist z flashbackiem wystawiał DWA identyczne wiersze
// „Flashback: Dream Twist (koszt 2)” — dwie RÓŻNE komendy (cel: Ty /
// Nieprzyjaciel), bo etykieta nie doklejała celu. Ta sama luka w
// cast_escape (Sweet Oblivion celuje w gracza) i cast_adventure
// (Ettercap celuje w stwora); wzorzec: „→ cel:” z cast_spell/cleave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { commandLabel } from '../src/table/render.js';

const R = createCardRegistry();
function game() {
  const s = createGameState({ seed: 11, players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  return s;
}
function put(s, id, cardId, c, zone, patch = {}) {
  const d = R.get(cardId); assert.ok(d, cardId);
  addObject(s, { ...gameObjectDataOf(d), id, instanceId: `i-${id}`, cardId, controllerId: c, ownerId: c, zone,
    types: d.types ?? [], keywords: d.keywords ?? [], subtypes: d.subtypes ?? [], spell: d.spell, ...patch });
}
function mana(s, c, n) {
  const lands = ['basic-island', 'basic-plains', 'basic-swamp', 'basic-mountain', 'basic-forest'];
  for (let i = 0; i < n; i++) put(s, `land-${c}-${i}`, lands[i % lands.length], c, 'battlefield');
}
function session() {
  return {
    nameOf: (id) => R.get(id)?.name ?? id,
    nameOfObject: (id) => id,
    cardDetails: (id) => R.get(id) ?? null,
    abilitiesOf: (id) => R.get(id)?.abilities ?? [],
  };
}

test('A: dwie oferty flashback Dream Twist różnią się celem w etykiecie', () => {
  const s = game();
  put(s, 'dt', 'dream-twist', 'p1', 'graveyard');
  mana(s, 'p1', 2);
  const v = playerView(s, 'p1');
  const offers = v.legalCommands.filter((c) => c.type === 'cast_flashback' && c.objectId === 'dt');
  assert.equal(offers.length, 2, 'dwa cele (gracze)');
  const labels = offers.map((c) => commandLabel(c, session(), v));
  assert.notEqual(labels[0], labels[1], `etykiety muszą się różnić: ${labels.join(' | ')}`);
  assert.ok(labels.every((l) => l.includes('→ cel:')), `cel w etykiecie: ${labels.join(' | ')}`);
});

test('A: oferta escape Sweet Oblivion niesie cel w etykiecie', () => {
  const s = game();
  put(s, 'so', 'sweet-oblivion', 'p1', 'graveyard');
  for (let i = 0; i < 4; i++) put(s, `f${i}`, 'goblin-piker', 'p1', 'graveyard');
  mana(s, 'p1', 4);
  const v = playerView(s, 'p1');
  const offers = v.legalCommands.filter((c) => c.type === 'cast_escape' && c.objectId === 'so');
  assert.ok(offers.length >= 2, 'co najmniej dwa cele (gracze)');
  const byExile = new Map();
  for (const o of offers) {
    const k = JSON.stringify(o.escapeExileIds ?? []);
    if (!byExile.has(k)) byExile.set(k, []);
    byExile.get(k).push(o);
  }
  const pair = [...byExile.values()].find((g) => g.length >= 2);
  assert.ok(pair, 'ten sam koszt wygnania, dwa cele');
  const labels = pair.slice(0, 2).map((c) => commandLabel(c, session(), v));
  assert.notEqual(labels[0], labels[1], `etykiety muszą się różnić: ${labels.join(' | ')}`);
  assert.ok(labels.every((l) => l.includes('→ cel:')), `cel w etykiecie: ${labels.join(' | ')}`);
});

test('A: oferta przygody Ettercap niesie cel w etykiecie', () => {
  const s = game();
  put(s, 'et', 'ettercap', 'p1', 'hand');
  put(s, 'a', 'zoraline', 'p1', 'battlefield');
  put(s, 'b', 'illusory-demon', 'p2', 'battlefield');
  mana(s, 'p1', 5); // przygoda {2}{G} — piąty ląd to las
  const v = playerView(s, 'p1');
  const offers = v.legalCommands.filter((c) => c.type === 'cast_adventure' && c.objectId === 'et');
  assert.ok(offers.length >= 2, 'co najmniej dwa cele (stwory)');
  const labels = offers.slice(0, 2).map((c) => commandLabel(c, session(), v));
  assert.notEqual(labels[0], labels[1], `etykiety muszą się różnić: ${labels.join(' | ')}`);
  assert.ok(labels.every((l) => l.includes('→ cel:')), `cel w etykiecie: ${labels.join(' | ')}`);
});
