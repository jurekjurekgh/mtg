// =============================================================================
// Zgłoszenie D właściciela (2026-11-05): Dragonscale Boon ({3}{G} Instant —
// dwa liczniki +1/+1 na celu i odkręcenie go) bot rzucał „jak tylko ma manę”
// (własne podtrzymanie), marnując combat trick. Instant z trwałym licznikiem
// statystyk to trik bojowy: wartość ma w walce (po deklaracji blokujących
// przy własnym ataku / po deklaracji atakujących przy ataku wroga), gdy
// licznik zmienia wynik albo odkręcenie dokłada nieoczekiwanego blokującego.
//
// Reguła jest po deskryptorze efektu (ADR 0002): instant + korzystny licznik
// statystyk na własnego stwora. Sorcery i zdolności zostają przy dawnej
// wycenie (M429). Wyjątki bramki: licznik domykający grę i ratunek stwora,
// który ginie w trwającej walce.
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
  const state = createGameState({ seed: 60, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, kicker: def.kicker,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function creature(state, id, controllerId, power, toughness, patch = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...READY, ...patch }));
}

function forests(state, pid = 'p1', n = 4) {
  for (let i = 0; i < n; i += 1) put(state, `forest-${pid}-${i}`, 'basic-forest', pid);
}

function choose(state, pid = 'p1') {
  return createHeuristicBot({ seed: 9 }).chooseCommand(playerView(state, pid));
}

function passTo(state, pid, maxSteps = 8) {
  for (let i = 0; i < maxSteps && state.turn.priorityPlayerId !== pid; i += 1) {
    execute(state, playerView(state, state.turn.priorityPlayerId)
      .legalCommands.find((c) => c.type === 'pass_priority'));
  }
}

test('D/1: podtrzymanie własnej tury — bot NIE rzuca Dragonscale Boon (trzyma trik na walkę)', () => {
  const s = game('p1', 'upkeep', 'p1');
  put(s, 'boon', 'dragonscale-boon', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  forests(s);
  const chosen = choose(s);
  assert.notEqual(chosen?.type, 'cast_spell',
    `w podtrzymaniu bot ma pasować, wybrał: ${JSON.stringify(chosen)}`);
});

test('D/2: główna faza bez walki — bot nadal trzyma instant-liczniki (nie rzuca „bo ma manę”)', () => {
  const s = game('p1', 'main1', 'p1');
  put(s, 'boon', 'dragonscale-boon', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  forests(s);
  const chosen = choose(s);
  assert.notEqual(chosen?.type, 'cast_spell',
    `w głównej bez walki bot ma trzymać trik, wybrał: ${JSON.stringify(chosen)}`);
});

test('D/3: własny atak po deklaracji blokujących — liczniki zmieniają wynik, bot rzuca', () => {
  const s = game('p1', 'declare_attackers', 'p1');
  put(s, 'boon', 'dragonscale-boon', 'p1', 'hand');
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
    `po blokach 2/2 vs 3/3 liczniki +2/+2 zabijają i ratują atakującego — bot ma rzucić, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['moj']);
});

test('D/4: atak przeciwnika — odkręcenie robi nieoczekiwanego blokującego, bot rzuca po deklaracji atakujących', () => {
  const s = game('p2', 'declare_attackers', 'p2');
  put(s, 'boon', 'dragonscale-boon', 'p1', 'hand');
  creature(s, 'moj', 'p1', 3, 3, { tapped: true });
  creature(s, 'wrog', 'p2', 4, 4);
  forests(s);
  execute(s, playerView(s, 'p2').legalCommands
    .find((c) => c.type === 'declare_attackers' && c.attackerIds.includes('wrog')));
  passTo(s, 'p1');
  const view = playerView(s, 'p1');
  assert.ok(view.combat, 'walka trwa');
  const chosen = createHeuristicBot({ seed: 9 }).chooseCommand(view);
  assert.equal(chosen?.type, 'cast_spell',
    `tapnięty 3/3 po odkręceniu i +2/+2 blokuje i zabija 4/4 — bot ma rzucić, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['moj']);
});

test('D/5: wyjątek zegara — liczniki domykają grę w tej turze, wolno rzucić przed atakiem', () => {
  const s = game('p1', 'main1', 'p1');
  put(s, 'boon', 'dragonscale-boon', 'p1', 'hand');
  creature(s, 'moj', 'p1', 2, 2);
  forests(s);
  const foe = s.players.find((p) => p.id === 'p2');
  s.players = s.players.map((p) => (p.id === 'p2' ? Object.freeze({ ...foe, life: 4 }) : p));
  const chosen = choose(s);
  assert.equal(chosen?.type, 'cast_spell',
    `2/2 z licznikami to 4 obrażeń przy życiu wroga 4 — rzut przed atakiem wygrywa, wybrał: ${JSON.stringify(chosen)}`);
});
