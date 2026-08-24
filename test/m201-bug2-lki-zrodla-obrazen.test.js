// M201 — polowanie na błędy (odznaka), znalezisko #2:
// TRIGGERY OBRAŻEŃ BOJOWYCH GINĄ, GDY ŹRÓDŁO UMRZE W TEJ SAMEJ KOMENDZIE.
//
// W skanie triggerów stała bramka opisana w kodzie jako „Uproszczenie: źródło
// musi wciąż być na polu bitwy” — z instrukcją `return`, która przerywała
// przetwarzanie CAŁEGO zdarzenia. Skutki (wszystkie w jednym miejscu):
//  • „Whenever you're dealt combat damage” OBROŃCY (Contested Game Ball) —
//    nie odpalało, choć obrażenia padły;
//  • „Whenever this creature deals combat damage to a player” samego źródła
//    (Scroll Thief) — nie odpalało, mimo że zdarzenie zaszło, gdy stwór jeszcze
//    istniał (CR 603.10a — zdolność wyzwala się z ostatniej znanej informacji);
//  • „one or more creatures you control deal combat damage” (Disa) i przejęcie
//    inicjatywy (CR 725) — tak samo.
//
// Realny scenariusz: atakujący z TRAMPLE ginie od blokera, a nadwyżka i tak
// idzie w gracza (CR 702.19b). Obrażenia są jednoczesne, więc w chwili
// przetwarzania triggerów źródła już nie ma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

function beast(state, id, controllerId, power, toughness, keywords = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, types: ['Creature'], subtypes: [], abilities: [], keywords,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function combatState(attacker) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn(attacker), ...TURN_STEPS[5], stepIndex: 5, activePlayerId: attacker, priorityPlayerId: attacker, passes: 0 };
  return state;
}

function fight(state, attacker, defender, attackerIds, assignments) {
  assert.equal(execute(state, { type: 'declare_attackers', playerId: attacker, attackerIds }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: defender, assignments }).ok, true);
  execute(state, { type: 'pass_priority', playerId: defender });
  assert.equal(execute(state, { type: 'resolve_combat', playerId: attacker, defendingPlayerId: defender }).ok, true);
  if (state.pendingDamageAssignment) {
    const cmd = playerView(state, state.pendingDamageAssignment.playerId).legalCommands
      .find((c) => c.type === 'resolve_damage_assignment');
    if (cmd) execute(state, cmd);
  }
  // Triggery idą na stos (CR 603.3) — rozstrzygamy je passami, inaczej test
  // mierzyłby samo zakolejkowanie, a nie skutek.
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const prio = state.turn.priorityPlayerId;
    const view = playerView(state, prio);
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!cmd || !execute(state, cmd).ok) break;
  }
}

test('BUG2: trigger OBROŃCY odpala, choć źródło obrażeń zginęło jednocześnie', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 4, 2, ['trample']); // ginie od blokera, ale przebija 1 w gracza
  beast(state, 'blk', 'p1', 3, 3);
  put(state, 'ball', 'contested-game-ball', 'p1', { tapped: true });
  fight(state, 'p2', 'p1', ['atk'], { atk: ['blk'] });

  assert.equal(state.objects.get('atk'), undefined, 'scenariusz: atakujący zginął');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 19, 'scenariusz: nadwyżka trample trafiła gracza');
  const fired = state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'contested-game-ball');
  assert.equal(fired.length, 1,
    'CR 603.10: śmierć źródła nie kasuje triggera permanentu OBROŃCY („whenever you\'re dealt combat damage”)');
});

test('BUG2: trigger SAMEGO źródła odpala z LKI (CR 603.10a)', () => {
  // Scroll Thief: „Whenever this creature deals combat damage to a player,
  // draw a card.” Stwór ginie w tej samej wymianie (bloker o 2 mocy przy
  // wytrzymałości 1 po obrażeniach) — zdarzenie zaszło, gdy jeszcze istniał.
  const state = combatState('p2');
  const thief = put(state, 'thief', 'scroll-thief', 'p2');
  assert.ok((thief.keywords ?? []).length >= 0);
  // dokładamy trample, żeby obrażenia poszły w gracza mimo bloku
  state.objects.set('thief', Object.freeze({ ...state.objects.get('thief'), keywords: [...(thief.keywords ?? []), 'trample'], power: 4, toughness: 2 }));
  beast(state, 'blk', 'p1', 3, 3);
  fight(state, 'p2', 'p1', ['thief'], { thief: ['blk'] });
  assert.equal(state.objects.get('thief'), undefined, 'scenariusz: Scroll Thief zginął');
  const fired = state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'scroll-thief');
  assert.equal(fired.length, 1,
    'CR 603.10a: zdolność „deals combat damage to a player” odpala, choć stwór już nie żyje');
});

test('BUG2 (anty-over-fix): brak obrażeń w gracza = brak triggera', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 2, 2); // bez trample: wszystko idzie w blokera
  beast(state, 'blk', 'p1', 3, 3);
  put(state, 'ball', 'contested-game-ball', 'p1', { tapped: true });
  fight(state, 'p2', 'p1', ['atk'], { atk: ['blk'] });
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20);
  assert.equal(state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'contested-game-ball').length, 0);
});

test('BUG2 (anty-over-fix): żywe źródło działa jak dotąd', () => {
  const state = combatState('p2');
  put(state, 'thief', 'scroll-thief', 'p2');
  fight(state, 'p2', 'p1', ['thief'], {});
  assert.ok(state.objects.get('thief'), 'Scroll Thief przeżył');
  assert.equal(state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'scroll-thief').length, 1,
    'trigger niezablokowanego ataku bez zmian');
});
