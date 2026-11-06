// =============================================================================
// Zgłoszenie D, etap 7 (2026-11-05): Diplomatic Relations ({2}{G} Instant —
// własny stwór +1/+0 i vigilance, potem zadaje obrażenia równe swojej mocy
// stworowi przeciwnika) to combat trick o kształcie „pump + ugryzienie”.
// Audyt sondą wykazał, że bot rzucał go w podtrzymaniu (oferta 11 > pas),
// bo zabijające ugryzienie było wyceniane jak usunięcie poza walką.
//
// Reguła (ADR 0002): instant łączący pump własnego stwora z ugryzieniem
// z tego stwora trzymamy na okno walki — jak liczniki z K1. Wyjątki:
// cel pumpu już walczy, blokujący-niespodzianka po ataku wroga, pump
// domykający grę w tym ataku.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const READY = { summoningSick: false, summoningSickness: false };

function game(active, step, priority) {
  const state = createGameState({ seed: 61, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = active;
  state.turn = jumpToStep(state.turn, step, priority);
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `ilib-${pid}-${i}`, cardId: `test-lib-${pid}-${i}`,
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'spell', manaCost: 2,
      });
    }
  }
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, kicker: def.kicker,
  });
}

function creature(state, id, controllerId, power, toughness, patch = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...READY, ...patch }));
}

function forests(state, n = 3) {
  for (let i = 0; i < n; i += 1) put(state, `forest-${i}`, 'basic-forest', 'p1');
}

function passTo(state, pid, maxSteps = 8) {
  for (let i = 0; i < maxSteps && state.turn.priorityPlayerId !== pid; i += 1) {
    execute(state, playerView(state, state.turn.priorityPlayerId)
      .legalCommands.find((c) => c.type === 'pass_priority'));
  }
}

function scene(step) {
  const s = game('p1', step, 'p1');
  put(s, 'dip', 'diplomatic-relations', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  creature(s, 'wrog', 'p2', 3, 3);
  forests(s);
  return s;
}

test('DR/1: podtrzymanie — bot NIE rzuca Diplomatic Relations (trzyma trik na walkę)', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('upkeep'), 'p1'));
  assert.notEqual(chosen?.type, 'cast_spell',
    `w podtrzymaniu bot ma pasować, wybrał: ${JSON.stringify(chosen)}`);
});

test('DR/2: główna faza bez walki — bot nadal trzyma pump z ugryzieniem', () => {
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(playerView(scene('main1'), 'p1'));
  assert.notEqual(chosen?.type, 'cast_spell',
    `w głównej bez walki bot ma trzymać trik, wybrał: ${JSON.stringify(chosen)}`);
});

test('DR/3: własny atak po blokach — pump i ugryzienie zmieniają wynik, bot rzuca', () => {
  const s = game('p1', 'declare_attackers', 'p1');
  put(s, 'dip', 'diplomatic-relations', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  creature(s, 'wrog', 'p2', 3, 3);
  forests(s);
  execute(s, playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && c.attackerIds.includes('moj')));
  passTo(s, 'p2');
  execute(s, playerView(s, 'p2').legalCommands
    .find((c) => c.type === 'declare_blockers' && JSON.stringify(c).includes('"wrog"')));
  passTo(s, 'p1');
  const view = playerView(s, 'p1');
  assert.ok(view.combat, 'walka trwa');
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(view);
  assert.equal(chosen?.type, 'cast_spell',
    `2/2 zablokowany przez 3/3: +1/+0 i ugryzienie za 3 zabija blokującego — bot ma rzucić, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['moj', 'wrog']);
});

test('DR/4: atak przeciwnika — pump blokującego i ugryzienie w atakującego po deklaracji ataku', () => {
  const s = game('p2', 'declare_attackers', 'p2');
  put(s, 'dip', 'diplomatic-relations', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  creature(s, 'wrog', 'p2', 3, 3);
  forests(s);
  execute(s, playerView(s, 'p2').legalCommands
    .find((c) => c.type === 'declare_attackers' && c.attackerIds.includes('wrog')));
  passTo(s, 'p1');
  const view = playerView(s, 'p1');
  assert.ok(view.combat, 'walka trwa');
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(view);
  assert.equal(chosen?.type, 'cast_spell',
    `blokujący 2/2 po +1/+0 gryzie atakującego 3/3 na śmierć — bot ma rzucić, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['moj', 'wrog']);
});
