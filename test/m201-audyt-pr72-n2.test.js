// M201/N2 (audyt PR #72, CR 603.2 + ruling WotC 2023-11-10):
// „Whenever you're dealt combat damage” odpala się RAZ na zdarzenie zadania
// obrażeń, niezależnie od tego, ILE stworów zadało je jednocześnie.
//
// Ruling Scryfall (Contested Game Ball, 2023-11-10, zweryfikowany u źródła
// przed wdrożeniem — L57): „Contested Game Ball's triggered ability triggers
// only once whenever you're dealt combat damage, no matter how many creatures
// deal combat damage to you at the same time.”
//
// Silnik emituje `damage_dealt` PER STWÓR (CR 510.2: obrażenia bojowe są
// zadawane jednocześnie, ale strumień zdarzeń jest per źródło), a gałąź
// dodana w PR #72 odpalała trigger na KAŻDYM takim zdarzeniu — dwóch
// niezablokowanych atakujących = dwa triggery na stosie. Wzorzec naprawy
// istnieje już w tym samym pliku: „one or more creatures … deal combat damage”
// (Disa the Restless) grupuje po kontrolerze zbiorem `anyCombatDamage…`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function beast(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness,
    types: ['Creature'], subtypes: ['Giant'], abilities: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function combatState(attacker) {
  const state = createGameState({ seed: 777, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep({ ...initialTurn(attacker) }, 'declare_attackers', attacker);
  state.turn.activePlayerId = attacker;
  state.turn.priorityPlayerId = attacker;
  return state;
}

function drainStack(state, limit = 16) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const owner = state.turn.priorityPlayerId;
    const pass = playerView(state, owner).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    assert.ok(execute(state, pass).ok);
  }
}

function ballTriggers(state) {
  return state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'contested-game-ball').length;
}

test('M201/N2: dwóch atakujących jednocześnie — trigger piłki odpala DOKŁADNIE raz', () => {
  const state = combatState('p2');
  beast(state, 'atk1', 'p2', 2, 2);
  beast(state, 'atk2', 'p2', 3, 3);
  put(state, 'ball', 'contested-game-ball', 'p1', { tapped: true });
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk1', 'atk2'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} }).ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok, true);
  assert.equal(ballTriggers(state), 1,
    'ruling WotC: trigger odpala się raz, niezależnie od liczby stworów zadających obrażenia jednocześnie');
  drainStack(state);
  assert.equal(state.objects.get('ball').controllerId, 'p2', 'skutek bez zmian: piłka u atakującego');
  assert.equal(state.objects.get('ball').tapped, false, '…i odkręcona');
});

test('M201/N2: anty-over-fix — jeden atakujący nadal odpala trigger', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 3, 3);
  put(state, 'ball', 'contested-game-ball', 'p1', { tapped: true });
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} }).ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok, true);
  assert.equal(ballTriggers(state), 1, 'pojedyncze obrażenia = jeden trigger');
});

test('M201/N2: anty-over-fix — trigger odpala się PONOWNIE w kolejnej walce', () => {
  // Grupowanie jest per KOMENDA (jak Disa the Restless), nie „raz na partię”:
  // w następnym starciu piłka znów zmienia właściciela.
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 3, 3);
  put(state, 'ball', 'contested-game-ball', 'p1', { tapped: true });
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} }).ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok, true);
  drainStack(state);
  assert.equal(state.objects.get('ball').controllerId, 'p2');

  // Druga walka: teraz p1 atakuje p2 (kontroler piłki), więc piłka wraca.
  const state2 = combatState('p1');
  beast(state2, 'atk', 'p1', 3, 3);
  put(state2, 'ball', 'contested-game-ball', 'p2', { tapped: true });
  assert.equal(execute(state2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok, true);
  assert.equal(execute(state2, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok, true);
  execute(state2, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(execute(state2, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok, true);
  assert.equal(ballTriggers(state2), 1, 'nowa walka = nowy trigger');
});
