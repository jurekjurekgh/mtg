// M156 — pętla jakości (ADR 0021 pkt 4): sonda inwentaryzująca typy efektów
// w kontekstach CELOWANYCH (skan card-data vs klasyfikacje bota) wyłapała
// dwa kolejne wystąpienia klasy L50 (efekt bez wyceny = remis wariantów =
// pierwszy cel z listy):
//
//   Q1 — Withstand („Prevent the next 3 damage that would be dealt to ANY
//        TARGET this turn. Draw a card."): prewencja bez wyceny → bot rzucał
//        czar w STWORA PRZECIWNIKA (chronił wroga, żeby dobrać kartę).
//   Q2 — Servant of the Scale („When this creature dies, put X +1/+1 counters
//        on target creature you control"): transfer_counters_on_dies nie był
//        klasyfikowany jako przyjazny → friendly=false → bot obdarzał
//        NAJSŁABSZEGO własnego stwora (kara −20−wartość zamiast premii).
//
// Sonda: /tmp/sonda-target-effects.mjs (jednorazowa; wnioski w LESSONS L51).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botTurn() {
  const state = createGameState({ seed: 156, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

// --- Q1: prewencja nie idzie na stronę przeciwnika ---
test('Q1: bot NIE rzuca Withstand w stwora/gracza przeciwnika', () => {
  const state = botTurn();
  putCard(state, 'w', 'withstand', 'p2', 'hand');
  putCard(state, 'mine', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');

  const choice = createHeuristicBot({ seed: 156 }).chooseCommand(playerView(state, 'p2'), {});
  if (choice.type === 'cast_spell' && choice.objectId === 'w') {
    const t = choice.targets?.[0];
    assert.ok(t === 'mine' || t === 'p2',
      `prewencja ma chronić WŁASNĄ stronę (stwór gracza bota), nie ${t}: ${JSON.stringify(choice)}`);
  } else {
    // pass też acceptable — byle nie bezsensowne rzucenie we wroga
    assert.ok(true);
  }
});

test('Q1b: Withstand na własnej stronie jest dozwolonym wyborem (cantrip)', () => {
  const state = botTurn();
  putCard(state, 'w', 'withstand', 'p2', 'hand');
  putCard(state, 'mine', 'highland-game', 'p2', 'battlefield');
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');

  const choice = createHeuristicBot({ seed: 156 }).chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'cast_spell',
    `cantrip za {1}{W} z tarczą na własnym stworze > pass: ${JSON.stringify(choice)}`);
  assert.ok(choice.targets?.[0] === 'mine' || choice.targets?.[0] === 'p2',
    `cel prewencji po własnej stronie: ${JSON.stringify(choice)}`);
});

// --- Q2: liczniki ze zmarłego Slugi trafiają do najcenniejszego własnego stwora ---
test('Q2: transfer_counters_on_dies jest przyjazny i celuje w najcenniejszego własnego stwora', () => {
  const state = botTurn();
  putCard(state, 'big', 'thornhide-wolves', 'p2', 'battlefield'); // 5/5
  putCard(state, 'small', 'highland-game', 'p2', 'battlefield'); // 2/2 (słabszy)
  const servant = putCard(state, 'servant', 'servant-of-the-scale', 'p2', 'battlefield');
  const ability = REGISTRY.get('servant-of-the-scale').abilities[0];
  state.pendingTriggerTargets.push({
    playerId: 'p2', sourceId: servant.id, cardId: servant.cardId,
    ability: Object.freeze(JSON.parse(JSON.stringify(ability))), candidates: [],
    allowNone: false, fixedTargetIds: [], extra: {},
  });

  const view = playerView(state, 'p2');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.length > 0, 'są oferty celu triggera');
  assert.ok(offers.every((o) => o.friendly === true),
    `transfer +1/+1 = przyjazny: ${JSON.stringify(offers)}`);

  const choice = createHeuristicBot({ seed: 156 }).chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_trigger_target');
  assert.equal(choice.targetId, 'big',
    `liczniki mają iść do NAJCENNIEJSZEGO własnego stwora: ${JSON.stringify(choice)}`);
});
