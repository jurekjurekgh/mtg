// M221/G — zgłoszenie właściciela z realnej gry (token Phyrexian Mite z
// Crawling Chorus, „This token can't block"): bot ma więcej stworów niż
// przeciwnik, ale NIE atakuje Mitem, choć ten dołożyłby obrażenia (i toxic).
// Stwór, który nie może blokować, nie ma wartości obronnej — trzymanie go
// w tyle to strata potencjału.
//
// Reguła: w ataku liczniejszym niż blokerzy przeciwnika (obrońca blokuje
// większe zagrożenia) cantBlock przechodzi i dokłada obrażenia; brak kosztu
// alternatywy (i tak nie zablokuje). Po deskryptorze cantBlock z PlayerView
// (ADR 0002/0017), nie po nazwie karty. Anty-over-fix: solo chump 1/1 w blokera
// dalej odradzany.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function addCreature(state, id, controllerId, { power, toughness, cantBlock = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'goblin-piker', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, abilities: [], subtypes: [],
    types: ['Creature'], colors: ['R'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, cantBlock }));
  return state.objects.get(id);
}

function base() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function chosenAttack(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view, {});
  return { chosen, trace: bot.trace()[0] };
}

test('M221/G: bot DOKŁADA cantBlock token do alfa-strajku liczniejszego niż blokerzy', () => {
  const state = base();
  addCreature(state, 'a1', 'p1', { power: 3, toughness: 3 });
  addCreature(state, 'a2', 'p1', { power: 3, toughness: 3 });
  addCreature(state, 'mite', 'p1', { power: 1, toughness: 1, cantBlock: true });
  addCreature(state, 'foe', 'p2', { power: 3, toughness: 3 });

  const { chosen } = chosenAttack(state);
  assert.equal(chosen.type, 'declare_attackers', `bot powinien atakować: ${JSON.stringify(chosen)}`);
  assert.ok((chosen.attackerIds ?? []).includes('mite'),
    `cantBlock token musi wejść do ataku (więcej atakujących niż blokerów): ${JSON.stringify(chosen.attackerIds)}`);
});

test('M221/G: cantBlock w ataku vs BRAK blokerów też atakuje (czysta presja)', () => {
  const state = base();
  addCreature(state, 'mite', 'p1', { power: 1, toughness: 1, cantBlock: true });
  // brak wrogich stworów
  const { chosen } = chosenAttack(state);
  assert.equal(chosen.type, 'declare_attackers', 'atak w otwartego');
  assert.ok((chosen.attackerIds ?? []).includes('mite'), 'cantBlock atakuje otwartego przeciwnika');
});

test('M221/G (anty-over-fix): SOLO cantBlock 1/1 w większego blokera NIE chumpuje', () => {
  const state = base();
  addCreature(state, 'mite', 'p1', { power: 1, toughness: 1, cantBlock: true });
  addCreature(state, 'foe', 'p2', { power: 3, toughness: 3 });
  const { trace } = chosenAttack(state);
  const withMite = trace.options.find((o) => o.cmd === 'attack[mite]')?.score ?? 0;
  const pass = trace.options.find((o) => o.cmd === 'attack[]' || o.cmd === 'pass_priority')?.score ?? 0;
  assert.ok(withMite < pass, `solo 1/1 cantBlock w 3/3 to chump — poniżej passu (${pass}), było ${withMite}`);
});
