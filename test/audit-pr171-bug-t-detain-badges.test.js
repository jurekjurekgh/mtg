// Audyt PR #171 (2026-10-21d), zgłoszenie właściciela T:
//   „Na kreaturach detained nie ma badge'ów 'nie może blokować' oraz
//    'nie może używać zdolności aktywowanych', a powinny."
//
// Pin H/4: generic, nie spec-case dla Azorius Justiciar. Każdy stwór z
// `object.detained === true` MUSI emitować dwa badge'e: jeden o blokadzie
// ataku, jeden o blokadzie zdolności (CR 701.35). Silnik REALNIE blokuje
// (combat.js:316 → legalBlockerOptions 'cant block'; abilities.js:1444 →
// throw „Zatrzymany permanent nie aktywuje zdolności") — widok MUSI to
// odzwierciedlać, bo klasa L1/ADR 0017: skutek widoczny w grze musi być
// widoczny na stole.
//
// Reprodukcja: gracz wrzuca Azorius Justiciar z enchant-selectorem
// → wybiera stwora przeciwnika → trigger firing → ten stwór ma
// `detained = true`. Jego playerView MUSI zawierać `cantBlockNow: true`
// i nowe pole `cantActivateAbilities` (lub równoważne) → renderowane
// do badge'y „nie może blokować" i „nie może używać zdolności".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { detainUntilYourNextTurn } from '../src/engine/permanents.js';

const registry = createCardRegistry();

function game() {
  const s = createGameState({ seed: 67, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  return s;
}

function put(state, id, cardId, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [], ...patch,
  });
  return state.objects.get(id);
}

function enemyCreature(state, id, cardId, sub) {
  return put(state, id, cardId, 'battlefield', {
    controllerId: 'p2', ownerId: 'p2', summoningSickness: false,
    kind: 'creature', types: ['Creature'], subtypes: [sub], colors: ['G'],
    power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
  });
}

// Detain stwora przeciwnika bezpośrednio (bez ETB Justiciar — chcemy
// skupić się na playerView badges, nie na ścieżce całej karty).
test('T/A ⭐ RED: playerView stwora detained MUSI mieć cantBlockNow: true (badge „nie może blokować")', () => {
  const s = game();
  const victim = enemyCreature(s, 'v1', 'basic-forest', 'Bear');
  detainUntilYourNextTurn(s, victim.id, 'p1');
  // zamroź obiekt — playerView czyta ze state.objects
  const v = playerView(s, 'p2').zones.battlefield.find((o) => o.id === 'v1');
  console.log('  view entries:', JSON.stringify({ cantBlockNow: v.cantBlockNow, cantBlock: v.cantBlock, detained: v.detained, cantAttackExternal: v.cantAttackExternal, cantActivateAbilities: v.cantActivateAbilities ?? null }));
  assert.equal(v.detained, true, 'detained=true przechodzi z engine do view');
  assert.equal(v.cantBlockNow, true,
    'PO FIXIE: stwór detained MUSI mieć cantBlockNow=true (CR 701.35: nie może blokować). '
    + 'Obecnie: false (silnik blokadę zna, ale view nie ma flagi).');
});

test('T/B ⭐ RED: playerView stwora detained MUSI mieć pole mówiące UI o zablokowanych zdolnościach aktywowanych', () => {
  const s = game();
  const victim = enemyCreature(s, 'v1', 'basic-forest', 'Bear');
  // dodaj zdolność aktywowaną do zweryfikowania blokady
  s.objects.set('v1', Object.freeze({
    ...s.objects.get('v1'),
    abilities: [
      { type: 'activated', cost: { generic: 0 }, effect: { type: 'tap_creature' } },
    ],
  }));
  detainUntilYourNextTurn(s, victim.id, 'p1');
  const v = playerView(s, 'p2').zones.battlefield.find((o) => o.id === 'v1');
  // Musi być jakieś pole mówiące UI „nie aktywuje" (np. cantActivateAbilities, cantUseActivatedAbilitiesNow, itp.)
  // Nazwa pola jest do ustalenia przy fixie — na razie akceptujemy KAŻDE pole niosące tę informację.
  const hasSignal = v.cantActivateAbilities === true
    || v.cantActivateAbilitiesNow === true
    || v.cantUseActivatedAbilities === true
    || v.cantUseAbilitiesNow === true;
  assert.equal(hasSignal, true,
    'PO FIXIE: stwór detained MUSI mieć jawne pole w playerView '
    + '(np. cantActivateAbilities) mówiące renderowi, że zdolności aktywowane są zablokowane (CR 701.35).');
});
