// M166 — Batch 40 (lista właściciela 2026-08-20). Transza A: karty reuse.
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalAttackerOptions } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 40, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

// ---- Transza A --------------------------------------------------------------

test('A1: Blade-Blizzard Kitsune — dane + ninjutsu {3}{W} + double strike', () => {
  const def = REGISTRY.get('blade-blizzard-kitsune');
  assert.equal(def.manaCost, 3);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.deepEqual(def.keywords, ['double_strike']);
  const ninjutsu = def.abilities.find((a) => a.keyword === 'ninjutsu');
  assert.deepEqual(ninjutsu?.cost, { mana: 4, colors: ['W'] });

  // Przepływ ninjutsu (wzorzec B7.2): nieblokowany atakujący → oferta → wejście
  // zatapione i atakujące.
  const state = game('p1');
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  state.combat = { attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['rat'], blockers: new Map(), declared: true };
  putCard(state, 'rat', 'highland-game', 'p1', 'battlefield');
  putCard(state, 'kitsune', 'blade-blizzard-kitsune', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const cmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'kitsune');
  assert.ok(cmd, 'ninjutsu {3}{W} oferowane w oknie combat');
  assert.ok(execute(state, cmd).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const fox = [...state.objects.values()].find((o) => o.cardId === 'blade-blizzard-kitsune' && o.zone === 'battlefield');
  assert.ok(fox, 'Kitsune na polu bitwy po ninjutsu');
  assert.equal(fox.tapped, true, 'weszła zatapiona');
  assert.ok(state.combat.attackers.includes(fox.id), 'atakująca');
});

test('A2: Knockout Maneuver — licznik NAJPIERW, obrażenia = moc Z licznikiem', () => {
  const state = game('p1');
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield'); // 2/1
  putCard(state, 'foe', 'segmented-krotiq', 'p2', 'battlefield'); // 6/5
  putCard(state, 'km', 'knockout-maneuver', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'km');
  assert.ok(cast, 'oferta rzutu Knockout Maneuver');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const guy = state.objects.get('guy');
  assert.equal((guy.counters ?? {})['+1/+1'], 1, 'licznik +1/+1 na swoim stworze');
  assert.equal(guy.damage, 0, 'własny stwór nieobrażony');
  const foe = state.objects.get('foe');
  assert.equal(foe.damage, 3, 'przeciwnik otrzymał 3 (= moc 2/1 + licznik), nie 2');
  assert.equal(foe.zone, 'battlefield', '6/5 przeżywa 3 obrażenia');
});

test('A3: Krotiq Nestguard — defender blokuje atak; po {2}{G} atakuje; cleanup przywraca', () => {
  const state = game('p1');
  putCard(state, 'nest', 'krotiq-nestguard', 'p1', 'battlefield');
  state.objects.set('nest', Object.freeze({ ...state.objects.get('nest'), summoningSickness: false }));
  const attackStep = () => {
    state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  };
  // legalAttackerOptions zwraca podzbiory (tablice id atakujących).
  const nestAttacks = () => legalAttackerOptions(state, 'p1').some((opt) => opt.includes('nest'));
  attackStep();
  assert.ok(!nestAttacks(), 'z defenderem nie może atakować');

  // Aktywacja {2}{G} — traci defendera do końca tury.
  addMana(state, 'p1', 3, { colors: ['G'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'nest');
  assert.ok(activate, 'oferta aktywacji {2}{G}');
  assert.ok(execute(state, activate).ok);
  // Zdolność przechodzi przez stos (okno odpowiedzi) — rozstrzyga się po passach.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(nestAttacks(), 'po aktywacji atak legalny (jakby bez defendera)');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['nest'] }).ok,
    'deklaracja ataku Nestguarda przechodzi');

  // Cleanup końca tury przywraca defendera (wzorzec Wishful Merfolk).
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.step = 'cleanup';
  state.turn.phase = 'ending';
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const nest = [...state.objects.values()].find((o) => o.cardId === 'krotiq-nestguard' && o.zone === 'battlefield');
  assert.ok(nest, 'Nestguard żyje');
  attackStep();
  assert.ok(!legalAttackerOptions(state, 'p1').some((opt) => opt.includes(nest.id)),
    'w następnej turze znowu nie atakuje (defender przywrócony)');
});
