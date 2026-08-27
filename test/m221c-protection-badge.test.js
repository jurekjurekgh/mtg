// M221/C — zgłoszenie właściciela z realnej gry (Benevolent Blessing): po
// nadaniu kreaturze „protection from black" ani na aurze, ani na kreaturze nie
// było widać KOLORU ochrony — samo „zaczarowany: Benevolent Blessing" to za
// mało. Ochrona (CR 702.16) to informacja publiczna; kafel musi mieć osobny
// badge „Ochrona przed: Czarny", a widok musi nieść jakość (żeby także bot ją
// czytał — patrz Etap E).
//
// Reguła po deskryptorze jakości (ADR 0002), bez nazw kart. Odczyt przez
// effectiveProtectionQualities (ADR 0017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { protectionBadges } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

test('M221/C: protectionBadges nazywa kolor po polsku', () => {
  assert.deepEqual(protectionBadges([{ colors: ['B'], kind: 'creature' }]), ['Ochrona przed: Czarny']);
  assert.deepEqual(protectionBadges([{ colors: ['W', 'U'] }]), ['Ochrona przed: Biały/Niebieski']);
  assert.deepEqual(protectionBadges([{ multicolored: true }]), ['Ochrona przed: wielokolorowymi']);
  assert.deepEqual(protectionBadges([{ subtype: 'Goblin' }]), ['Ochrona przed: Goblin']);
  assert.deepEqual(protectionBadges([]), []);
});

test('M221/C: widok kreatury z aurą ochronną niesie jakość ochrony (kolor)', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  addObject(state, {
    id: 'cre', instanceId: 'i-cre', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['R'],
  });
  addObject(state, {
    id: 'bb', instanceId: 'i-bb', cardId: 'benevolent-blessing', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', types: ['Enchantment', 'Aura'],
    aura: { enchant: 'creature', protection: { colors: ['B'] } },
  });
  attachAuraToCreature(state, 'bb', 'cre');
  assert.equal(state.objects.get('bb').attachedTo, 'cre', 'aura przypięta');

  const view = playerView(state, 'p1');
  const cre = view.zones.battlefield.find((o) => o.id === 'cre');
  assert.ok(cre.protection, 'kreatura w widoku musi nieść pole protection');
  assert.equal(cre.protection[0]?.colors?.[0], 'B', 'jakość: ochrona przed czarnym');
  assert.deepEqual(protectionBadges(cre.protection), ['Ochrona przed: Czarny']);
});

test('M221/C: bez ochrony pole protection nie jest wystawiane', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  addObject(state, {
    id: 'cre', instanceId: 'i-cre', cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['R'],
  });
  const cre = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'cre');
  assert.equal(cre.protection, undefined, 'brak ochrony = brak pola (bez szumu)');
});
