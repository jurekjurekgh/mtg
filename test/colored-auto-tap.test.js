import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { addMana, expandManaPool, consumeManaPool, spendMana, producibleMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * T3 — auto-tap płaci pipy kolorów WYŁĄCZNIE maną tego koloru (CR 106.4/
 * 601.2h). Root cause M40/M41: gdy suma many w puli wystarczała na koszt,
 * spendMana nie tapowała źródeł i consumeManaPool cicho płaciła pip koloru
 * jednostką innego koloru ({U} z {W} przy nietapniętej Wyspie).
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addLand(state, id, controllerId, subtype, tapped = false) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `basic-${subtype.toLowerCase()}`, controllerId,
    zone: 'battlefield', kind: 'land', tapped, types: ['Basic', 'Land'], subtypes: [subtype], colors: [],
  });
  return state.objects.get(id);
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

test('pip {U} z puli {W}×2 — Wyspa tapowana mimo wystarczającej sumy (brak cichej złej płatności)', () => {
  const state = game();
  addLand(state, 'island', 'p1', 'Island');
  addMana(state, 'p1', 2, { colors: ['W'] }); // pula {W}{W} — suma 2 >= koszt 2
  // Koszt {1}{U} (2 many) z pipem {U}: pula pokrywa SUMĘ, ale nie pip.
  spendMana(state, 'p1', 2, [['U']]);
  assert.equal(state.objects.get('island').tapped, true, 'Wyspa musi być tapnięta dla pipa {U}');
  // Do-tapnięta Wyspa dodała manę do puli: 3 w puli, wydane 2 → 1 zostaje.
  assert.equal(state.players[0].mana, 1);
  assert.deepEqual(expandManaPool(state.players[0].manaPool), [['W']]);
});

test('koszt {1}{U} z puli {W} + Wyspa i Równina — pip U z Wyspy, generic z Równiny', () => {
  const state = game();
  addLand(state, 'island', 'p1', 'Island');
  addLand(state, 'plains', 'p1', 'Plains');
  addMana(state, 'p1', 1, { colors: ['W'] }); // pula {W}
  spendMana(state, 'p1', 2, [['U']]);
  assert.equal(state.objects.get('island').tapped, true, 'Wyspa tapnięta za pip {U}');
  // Część generyczna płaci się z PULI ({W}) — Równina zostaje nietknięta.
  assert.equal(state.objects.get('plains').tapped, false);
  assert.equal(state.players[0].mana, 0);
});

test('podwójny pip {U}{U} z puli {W} + dwie Wyspy — obie tapowane', () => {
  const state = game();
  addLand(state, 'island1', 'p1', 'Island');
  addLand(state, 'island2', 'p1', 'Island');
  addMana(state, 'p1', 1, { colors: ['W'] });
  spendMana(state, 'p1', 2, [['U'], ['U']]);
  assert.equal(state.objects.get('island1').tapped, true);
  assert.equal(state.objects.get('island2').tapped, true);
  assert.equal(state.players[0].mana, 1, 'pula {W} zostaje — wydano tylko pipy');
  assert.deepEqual(expandManaPool(state.players[0].manaPool), [['W']]);
});

test('hybryda {W/U} pokryta przez W; niepokrywalne wymaganie = twardy błąd bez mutacji', () => {
  const state = game();
  // consumeManaPool: niepokrywalne wymaganie rzuca zamiast cicho zapłacić.
  const player = state.players[0];
  addMana(state, 'p1', 2, { colors: ['W'] });
  assert.throws(() => consumeManaPool(player, 2, [['U']]), /Brak kolorowej many w puli/);
  assert.equal(player.mana, 2, 'stan puli nietknięty po błędzie');
  assert.deepEqual(expandManaPool(player.manaPool), [['W'], ['W']]);
  // Hybryda {W/U} pokryta przez W (przez publiczne spendMana).
  addMana(state, 'p2', 1, { colors: ['W'] });
  spendMana(state, 'p2', 1, [['W', 'U']]);
  assert.equal(state.players[1].mana, 0);
});

test('spendMana: pip bez pokrycia w źródłach = twardy błąd (nie płaci {W} za {U})', () => {
  const state = game();
  addLand(state, 'plains', 'p1', 'Plains');
  addMana(state, 'p1', 1, { colors: ['W'] });
  assert.throws(() => spendMana(state, 'p1', 1, [['U']]), /Brak kolorowej many/);
  // Żadna mutacja: land nietknięty, pula nietknięta.
  assert.equal(state.objects.get('plains').tapped, false);
  assert.equal(state.players[0].mana, 1);
});

test('integracja: rzut Curate {1}{U} z puli {W}{W} + Wyspa — Wyspa tapowana', () => {
  const state = game();
  addLand(state, 'island', 'p1', 'Island');
  addMana(state, 'p1', 2, { colors: ['W'] }); // suma wystarcza, pip {U} nie
  addRealCard(state, 'curate', 'curate', 'p1', 'hand');
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'curate', targets: [] });
  assert.ok(r.ok, r.events[0]?.reason);
  assert.equal(state.objects.get('island').tapped, true, 'Wyspa tapnięta za pip {U} Curate');
  assert.equal(state.players[0].mana, 1, 'pula {W}{W} + U z Wyspy − koszt 2 = 1');
});

test('integracja: rzut stwora {1}{G} (Gorehorn) z puli {R}{R} + Las — Las tapowany', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addLand(state, 'forest', 'p1', 'Forest');
  addMana(state, 'p1', 3, { colors: ['R'] });
  addRealCard(state, 'gore', 'gorehorn-minotaurs', 'p1', 'hand'); // {2}{R}{R} — 4 many
  // {R}{R} + Las = 3 < 4 — brak many; ale pip {R}{R} z puli — suma się nie zgadza.
  assert.equal(producibleMana(state, 'p1'), 4);
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gore' });
  assert.ok(r.ok, r.events[0]?.reason);
  assert.equal(state.objects.get('forest').tapped, true, 'Las tapowany za część generyczną');
  assert.equal(state.players[0].mana, 0);
  // Rozstrzygnij stos (T1) — stwór na polu bitwy.
  const first = state.turn.priorityPlayerId;
  const other = state.players.find((p) => p.id !== first).id;
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: other }).ok);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'gorehorn-minotaurs' && o.zone === 'battlefield'));
});
