// M236/4 — audyt Żywym Testerem (2026-08-27) + KOREKTA właściciela.
// innistrad-brg vs warhammer-ubr, seed 91: bot rzucił Fireball (skalujący X)
// za X=1 w twarz gracza (19→18) w 2. turze — spalił potencjalne dobicie za chip.
//
// Zasada (jak M236/5): trzymaj Fireball na cel, który DOBIJESZ (stwór ginie /
// gracz umiera), albo na gracza gdy zadasz ISTOTNĄ ilość obrażeń (≥ 1/3 życia).
// Trywialny chip = trzymaj. Wycena per-cel z widoku (ADR 0017).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function fireballChoice(mana, foeLife, enemyCreature) {
  const state = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', mana);
  state.players.find((p) => p.id === 'p1').life = foeLife;
  put(state, 'fb', 'fireball', 'p2', 'hand');
  if (enemyCreature) put(state, 'foe', enemyCreature, 'p1', 'battlefield');
  return createHeuristicBot({ seed: 236 }).chooseCommand(playerView(state, 'p2'), {});
}

test('M236/4: bot NIE pali Fireballa za trywialny chip (X=1) w twarz', () => {
  const c = fireballChoice(2, 19);
  assert.notEqual(c.type === 'cast_spell' && c.objectId === 'fb' ? 'cast' : 'inne', 'cast',
    `Fireball X=1 w twarz przy 19 ż. to zmarnowany zasób — trzymaj: ${JSON.stringify(c)}`);
});

test('M236/4: bot NIE pali skalującego Fireballa w twarz za < 25% życia (X=4 vs 20 ż.)', () => {
  const c = fireballChoice(5, 20); // mana5 → X do 4; 4/20 = 20% < 25%
  assert.notEqual(c.type === 'cast_spell' && c.objectId === 'fb' && (c.targets ?? []).includes('p1') ? 'faceChip' : 'inne', 'faceChip',
    `X=4 vs 20 ż. (<25%) to za mało — trzymaj skalujący zasób: ${JSON.stringify(c)}`);
});

test('M236/4: bot RZUCA skalującego Fireballa w twarz za ≥ 25% życia (X=5 vs 20 ż.)', () => {
  const c = fireballChoice(6, 20); // mana6 → X do 5; 5/20 = 25%
  assert.ok(c.type === 'cast_spell' && c.objectId === 'fb' && (c.targets ?? [])[0] === 'p1',
    `X=5 vs 20 ż. (=25%) to istotny cios — rzuć: ${JSON.stringify(c)}`);
});

test('M236/4: bot RZUCA Fireballa, gdy X=lethal w gracza', () => {
  const c = fireballChoice(6, 5);
  assert.ok(c.type === 'cast_spell' && c.objectId === 'fb' && (c.targets ?? [])[0] === 'p1',
    `Fireball lethal (X=5 vs 5 ż.) musi zostać rzucony w gracza: ${JSON.stringify(c)}`);
});

test('M236/4: bot woli ZABIĆ stwora niż chipować twarz (ad 4)', () => {
  const c = fireballChoice(6, 20, 'chained-throatseeker'); // 5/5 wroga; x=5 zabija
  assert.ok(c.type === 'cast_spell' && c.objectId === 'fb' && (c.targets ?? [])[0] === 'foe',
    `Fireball ma dobić stwora 5/5, nie chipować twarz: ${JSON.stringify(c)}`);
});

test('M236/4: bot RZUCA Fireballa w twarz za ISTOTNY cios (X=5 vs 12 ż., ≥1/3)', () => {
  const c = fireballChoice(6, 12);
  assert.ok(c.type === 'cast_spell' && c.objectId === 'fb' && (c.targets ?? [])[0] === 'p1',
    `X=5 vs 12 ż. (≥1/3) to istotny cios — rzuć: ${JSON.stringify(c)}`);
});
