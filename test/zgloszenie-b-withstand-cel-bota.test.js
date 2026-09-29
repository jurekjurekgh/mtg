import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// Zgłoszenie właściciela B (2026-09-28e) — log dosłowny:
//   „Nieprzyjaciel rzuca Withstand → cel: Ty”
// w darmowych rzutach Epic Experiment (X=4). „Czemu ma preventować dmg
// u swojego przeciwnika??? On ma zadawać obrażenia przeciwnikowi, a nie
// preventować je. To jest 100% błędna taktyka.”
//
// Root cause: okna darmowych rzutów (`resolve_epic_choice` i rodzina
// suspend/rebound/madness/exile) wyceniają TYP efektu + `freeCastTargetPenalty`,
// a tam: (a) `prevent_next_damage` nie jest w FRIENDLY_TARGET_EFFECTS
// (jest `prevent_damage_this_turn`, brakuje bliźniaka), (b) `objectOnBoard`
// nie widzi graczy-celów, więc kara za przyjazny efekt we wroga NIE
// naliczała się dla celu-gracza. Wszystkie warianty celów remisowały →
// bot brał PIERWSZY z brzegu („Ty” = przeciwnik).
//
// Taktyka właściciela (kryterium akceptacji):
//  — NIGDY cel we wroga (gracz ani stwór) — osłanianie przeciwnika = błąd;
//  — combat trick PRZED obrażeniami: własny stwór, który dostałby LETHAL
//    (i tarcza 3 go realnie ratuje), albo własny gracz, w którego uderzą
//    kreatury przeciwnika;
//  — odpowiedź na dmg-spell ze stosem z lethalem na bota albo jego kreaturę.

const REGISTRY = createCardRegistry();

function putSpell(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
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
  for (let i = 0; i < 10; i++) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function choose(state) {
  return createHeuristicBot({ seed: 156 }).chooseCommand(playerView(state, 'p2'), {});
}

// --- B1: Epic Experiment (log właściciela) — darmowy Withstand nigdy na wroga ---
test('B1: darmowy rzut z Epic Experiment — Withstand NIGDY na przeciwnika („Ty” = bug z logu)', () => {
  const state = botTurn();
  putCreature(state, 'mine', 'p2', 2, 1);
  putCreature(state, 'foe', 'p1', 3, 3);
  putSpell(state, 'w-ex', 'withstand', 'p2', 'exile');
  state.pendingEpicExperiment = {
    playerId: 'p2', sourceCardId: 'epic', exileIds: ['w-ex'], maxMV: 4, restorePriorityTo: 'p2',
  };
  const view = playerView(state, 'p2');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'resolve_epic_choice' && !c.done);
  assert.ok(offers.some((c) => c.targets?.[0] === 'p1'), 'setup: wariant z celem-graczem przeciwnika jest w ofercie');
  const choice = choose(state);
  if (choice.type === 'resolve_epic_choice' && !choice.done) {
    assert.ok(choice.targets?.[0] === 'mine' || choice.targets?.[0] === 'p2',
      `prewencja idzie na WŁASNĄ stronę, nie na przeciwnika: ${JSON.stringify(choice)}`);
    assert.ok(!['p1', 'foe'].includes(choice.targets?.[0]),
      `osłanianie wroga własną kartą = błąd: ${JSON.stringify(choice)}`);
  } else {
    // Odmowa darmowego rzutu też jest OK — byle nie osłona przeciwnika.
    assert.equal(choice.done, true);
  }
});

// --- B2: combat trick — ratunek własnego stwora z lethalem (przed obrażeniami) ---
test('B2: walka — Withstand na własnego stwora, który dostałby lethal (tarcza 3 go ratuje)', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 2);
  putCreature(state, 'foe', 'p1', 3, 3);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  // Stan silnika: blockers to Map (widok zamienia na obiekt — game-state:9244).
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['foe'],
    blockers: new Map([['foe', ['mine']]]), blockedAttackers: new Set(['foe']),
  };
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `ratunek stwora > pass: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'w');
  assert.equal(choice.targets?.[0], 'mine',
    `combat trick celuje w stwora z lethalem, nie w gracza: ${JSON.stringify(choice)}`);
});

// --- B3: twarz pod atakiem — u siebie, gdy kreatura przeciwnika uderzy ---
test('B3: wróg atakuje nieblokowany — Withstand na siebie (fog), nie na wroga', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'foe', 'p1', 3, 3);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['foe'],
    blockers: new Map(), blockedAttackers: new Set(),
  };
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `fog na twarz > pass: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'w');
  assert.equal(choice.targets?.[0], 'p2',
    `obrażenia idą w bota — tarcza idzie NA BOTA, nie na przeciwnika: ${JSON.stringify(choice)}`);
});

// --- B4: odpowiedź na dmg-spell z lethalem na kreaturę bota ---
test('B4: Shock na stosie w kreaturę bota (lethal) — Withstand w odpowiedzi na nią', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 1);
  putSpell(state, 'shock', 'shock', 'p1', 'stack', { targets: ['mine'] });
  state.zones.stack.push('shock');
  state.turn.priorityPlayerId = 'p2';
  const choice = choose(state);
  assert.equal(choice.type, 'cast_spell', `ratunek przed burnem > pass: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'w');
  assert.equal(choice.targets?.[0], 'mine',
    `tarcza idzie w cel burna z lethalem: ${JSON.stringify(choice)}`);
});

// --- B5: anty-over-fix — cantrip na własnej stronie bez zagrożenia zostaje dozwolony ---
test('B5: bez zagrożenia Withstand na własną stronę jest OK (cantrip, Q1b) — nigdy na wroga', () => {
  const state = botTurn();
  putSpell(state, 'w', 'withstand', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 2, 1);
  putCreature(state, 'foe', 'p1', 3, 3);
  const choice = choose(state);
  if (choice.type === 'cast_spell' && choice.objectId === 'w') {
    assert.ok(['mine', 'p2'].includes(choice.targets?.[0]),
      `cel po własnej stronie: ${JSON.stringify(choice)}`);
  } else {
    assert.equal(choice.type, 'pass', `albo pass, albo własny cel: ${JSON.stringify(choice)}`);
  }
});
