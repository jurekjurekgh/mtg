// Audyt PR #176 (sesja 2026-10-27c), finding F-1: deskryptor prewencji
// zdejmującej liczniki (`preventDamageByRemovingCounter`, batch 70 — Magma
// Pummeler) czyta TYLKO zdolności własne obiektu (`effectiveAbilities`).
//
// Komentarz w `preventDamageByRemovingCounters` (`src/engine/permanents.js`)
// obiecuje to samo, co progi ewazji: „własna zdolność stała albo NADANA
// SPRZĘTEM”. W `combat.js` ten sam kształt deskryptora
// (`cantBeBlockedByTypes`/`cantBeBlockedByKeywords`) ma osobną pętlę po
// `attachmentsAttachedTo → equipment.grantedAbilities` — prewencja licznikowa
// takiej pętli nie miała, więc zdolność nadana sprzętem była martwa: obrażenia
// wchodziły normalnie, a liczniki zostawały.
//
// Klasa L99 (naprawa dopisana w jednej warstwie, pominięta w drugiej): reguła
// CR 615.1a nie zna pojęcia „zdolność własna vs nadana” — efekt zastępujący
// działa, gdy permanent go ma, niezależnie od źródła (CR 613.1f/604.1).
//
// Karta syntetyczna: w katalogu nie ma nośnika (żaden sprzęt nie nadaje tej
// zdolności) — dozwolone przez ADR 0022/0030 (test mechaniki bez karty).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addCounter } from '../src/engine/counters.js';
import { dealNonCombatDamage } from '../src/engine/effects.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';

function game() {
  const state = createGameState({ seed: 176, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

function creature(state, id, data = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', types: ['Creature'], subtypes: [], colors: ['R'],
    keywords: [], power: 2, toughness: 2, abilities: [], ...data,
  });
  return state.objects.get(id);
}

/** Sprzęt na polu bitwy, dołączony do gospodarza, nadający zdolność statyczną. */
function equipment(state, id, hostId, grantedAbilities) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], subtypes: ['Equipment'],
    colors: [], keywords: [], power: null, toughness: null,
    equipment: { grantedAbilities },
  });
  // `attachedTo` NIE jest polem kontraktu addObject (L21) — załączenie idzie
  // ścieżką silnika, dokładnie jak w grze.
  attachEquipmentToCreature(state, id, hostId);
  return state.objects.get(id);
}

const PREVENTION = createAbility({
  type: ABILITY_TYPE.static,
  preventDamageByRemovingCounter: '+1/+1',
});

test('F-1: prewencja zdejmująca liczniki działa też, gdy zdolność nadał SPRZĘT', () => {
  const state = game();
  creature(state, 'host');
  equipment(state, 'gear', 'host', [PREVENTION]);
  addCounter(state, 'host', '+1/+1', 2);
  dealNonCombatDamage(state, state.objects.get('host'), 'host', 2);
  const after = state.objects.get('host');
  assert.equal(after?.counters?.['+1/+1'] ?? 0, 0,
    'efekt zastępujący zdejmuje liczniki także przy zdolności nadanej sprzętem');
  assert.equal(after?.damage ?? 0, 0,
    'całe obrażenia są zapobiegane (ruling VOW 2021-11-19) — nie „tyle, ile się zmieści”');
  const prevented = state.events.filter((e) => e.type === 'damage_prevented' && e.counterRemoval === true);
  assert.equal(prevented.length, 1, 'zdarzenie prewencji niesie przyczynę (liczniki) — log i trigger tego potrzebują');
  assert.equal(prevented[0].countersRemoved, 2);
});

test('F-1 anty-over-fix: bez zdolności (sprzęt bez grantu) obrażenia wchodzą normalnie', () => {
  const state = game();
  creature(state, 'plain');
  equipment(state, 'gear-plain', 'plain', []);
  addCounter(state, 'plain', '+1/+1', 2);
  dealNonCombatDamage(state, state.objects.get('plain'), 'plain', 2);
  const after = state.objects.get('plain');
  assert.equal(after?.counters?.['+1/+1'] ?? 0, 2, 'liczniki zostają — nie ma efektu zastępującego');
  assert.equal(after?.damage, 2, 'obrażenia wchodzą normalnie');
});
