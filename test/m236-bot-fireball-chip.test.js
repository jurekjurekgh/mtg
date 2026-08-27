// M236/4 — audyt Żywym Testerem (2026-08-27), partia innistrad-brg (gracz) vs
// warhammer-brg (bot), seed 91: bot rzucił Fireball (X obrażeń, skalujący) za
// X=1 w twarz gracza (19→18) w 2. turze — spalił potencjalne DOBICIE za chip.
// Fireball rośnie z maną, więc dumpowanie go za 1 obrażenie to strata zasobu.
//
// Oś 1 audytu (nieoptymalny timing/wartość czaru). Root cause: wycena fireball
// w twarz dawała płaskie +25+X niezależnie od tego, jak mały jest cios. Fix:
// dobicie = zawsze; trywialny chip (≤2, daleko od dobicia) schodzi poniżej
// passu (bot trzyma czar); realne cięcie życia wciąż premiowane. Reguła po
// xValue/życiu wroga z widoku (ADR 0017), zero nazw kart (ADR 0002).
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

function fireballChoice(mana, foeLife) {
  const state = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', mana);
  state.players.find((p) => p.id === 'p1').life = foeLife;
  put(state, 'fb', 'fireball', 'p2', 'hand');
  return createHeuristicBot({ seed: 236 }).chooseCommand(playerView(state, 'p2'), {});
}

test('M236/4: bot NIE pali Fireballa za trywialny chip (X=1) w twarz', () => {
  const c = fireballChoice(2, 19); // mana 2 → tylko X=1 w twarz
  assert.notEqual(c.type === 'cast_spell' && c.objectId === 'fb' ? 'cast' : 'inne', 'cast',
    `Fireball X=1 w twarz przy 19 ż. to zmarnowany skalujący zasób — trzymaj: ${JSON.stringify(c)}`);
});

test('M236/4: bot RZUCA Fireballa, gdy X=lethal', () => {
  const c = fireballChoice(6, 5); // mana 6 → X do 5, wróg na 5 = dobicie
  assert.ok(c.type === 'cast_spell' && c.objectId === 'fb',
    `Fireball lethal (X=5 vs 5 ż.) musi zostać rzucony: ${JSON.stringify(c)}`);
  assert.deepEqual(c.targets, ['p1']);
  assert.ok((c.xValue ?? 0) >= 5, `X ma być dobijające (≥5), było ${c.xValue}`);
});
