// J (zgłoszenie właściciela 2026-10-09, Fleeting Distraction): bot rzucał
// „-1/-0 do końca tury" w Faceless Butchera (3/2 -> 2/2: tylko -1 obrażeń
// w twarz), zamiast w Simian Simulacrum (2/2 -> 1/2: mój bloker 2/2 zabija
// atakującego i SAM PRZEŻYWA zamiast ginąć w wymianie). Root cause: oba cele
// dostawały równą wartość (oba „zmieniają wynik" przez redukcję face-damage
// przy pustych zadeklarowanych blokerach) — debuff nie miał wymiaru
// „uratowanie blokera przed śmiercią". Fix: negativePumpBlockerSaveValue
// (jedna miara negativePumpValue — cast_spell, activate_ability i modalne
// decyzje, L41). Symulacja 1v1 jak hypotheticalSaves savage-like (CR 510).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();

function build({ withWitch = '2/2', ownAttacker = false } = {}) {
  const state = createGameState({ seed: 42, players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1'); // okno po declare_attackers
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.turn.number = 5;
  const put = (id, cardId, ctl, zone) => {
    const def = REG.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: ctl, ownerId: ctl, zone, ...gameObjectDataOf(def) });
  };
  const blank = (id, ctl, p, t, mv) => {
    addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctl, ownerId: ctl, zone: 'battlefield', kind: 'creature', power: p, toughness: t, manaCost: mv, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  // Atakujący użytkownika (p1) — jak w logu: butcher 3/2, sim 2/2.
  blank('butcher', 'p1', 3, 2, 4);
  blank('sim', ownAttacker ? 'p2' : 'p1', 2, 2, 1);
  if (withWitch) {
    const [p, t] = withWitch.split('/').map(Number);
    blank('witch', 'p2', p, t, 2);
  }
  put('isl', 'basic-island', 'p2', 'battlefield');
  put('fd', 'fleeting-distraction', 'p2', 'hand');
  for (let i = 0; i < 10; i += 1) {
    addObject(state, { id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`, controllerId: 'p2', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}` });
  }
  state.combat = {
    attackers: ['butcher', ownAttacker ? 'sim' : 'sim'],
    attackingPlayerId: ownAttacker ? 'p2' : 'p1',
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  if (ownAttacker) {
    // Własny atakujący — bot go nie debuffuje (kara), kontrolnie.
    state.combat.attackingPlayerId = 'p2';
  }
  addMana(state, 'p2', 9);
  return state;
}

function decide(state) {
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'));
  const opts = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(fd'));
  return { chosen, opts, scoreOf: (t) => opts.find((o) => o.cmd === `cast_spell(fd->${t})`)?.score };
}

test('J: bot debuffuje sima (2/2->1/2 ratuje blokera), nie butchera (tylko -1 w twarz)', () => {
  const { chosen, scoreOf } = decide(build({ withWitch: '2/2' }));
  // sim: 50 baza + 6 draw + 29 debuff + 8 uratowana witch (2p+t+mv = 8) = 93.
  assert.equal(scoreOf('sim'), 93);
  // butcher: 50 + 6 + 29 + 0 (witch ginie i przed, i po debuffie) = 85.
  assert.equal(scoreOf('butcher'), 85);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['sim'], `bot ma debuffować sima: ${JSON.stringify(chosen)}`);
});

test('J kontrola: bez blokera oba cele remisują (czysta redukcja obrażeń)', () => {
  const { chosen, scoreOf } = decide(build({ withWitch: null }));
  assert.equal(scoreOf('sim'), 85);
  assert.equal(scoreOf('butcher'), 85);
  // Remis -> pierwszy z listy ofert (butcher); debuff bez blokera to sama
  // redukcja obrażeń — bot nadal rzuca (85 > pass), cel bez znaczenia.
  assert.equal(chosen.type, 'cast_spell');
});

test('J kontrola: bloker 4/4 przeżywa i przed, i po — save = 0, remis', () => {
  const { scoreOf } = decide(build({ withWitch: '4/4' }));
  // butcher 3/2 vs 4/4: 4/4 żyje przed (3 < 4) i po (2 < 4) — brak save.
  assert.equal(scoreOf('butcher'), 85);
  assert.equal(scoreOf('sim'), 85);
});

test('J kontrola: bloker 3/3 ginie od butchera przed, żyje po — save 11', () => {
  // Wariant: witch 3/3 (2p+t+mv = 6+3+2 = 11) — przed: butcher 3 >= 3 zabija
  // witch; po debuffie (2/2) witch żyje. Dla sima (2/2) 3/3 żyje przed i po.
  const state = build({ withWitch: '3/3' });
  const { scoreOf } = decide(state);
  assert.equal(scoreOf('butcher'), 85 + 11, 'butcher ratuje 3/3: 85 + 11');
  assert.equal(scoreOf('sim'), 85, 'sim nie zmienia wyniku vs 3/3');
});

test('J kontrola: debuff WŁASNEGO atakującego to kara, nie save', () => {
  const { chosen, scoreOf } = decide(build({ withWitch: '2/2', ownAttacker: true }));
  assert.ok(scoreOf('sim') < 0, `debuff własnego sima ma być karą: ${scoreOf('sim')}`);
  assert.notDeepEqual(chosen.targets, ['sim'], 'bot nie debuffuje własnego atakującego');
});

test('J: bez combatu debuff poza walką — kara -75 bez save', () => {
  const state = createGameState({ seed: 42, players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const def = REG.get('fleeting-distraction');
  addObject(state, { id: 'fd', instanceId: 'i-fd', cardId: 'fleeting-distraction', controllerId: 'p2', zone: 'hand', ...gameObjectDataOf(def) });
  addObject(state, { id: 'butcher', instanceId: 'i-butcher', cardId: 'x-butcher', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 3, toughness: 2, manaCost: 4, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'butcher' });
  addObject(state, { id: 'isl', instanceId: 'i-isl', cardId: 'basic-island', controllerId: 'p2', zone: 'battlefield', ...gameObjectDataOf(REG.get('basic-island')) });
  for (let i = 0; i < 10; i += 1) {
    addObject(state, { id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`, controllerId: 'p2', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}` });
  }
  addMana(state, 'p2', 9);
  const { chosen, scoreOf } = decide(state);
  assert.equal(scoreOf('butcher'), -19); // 50 + 6 - 75; brak combatu = brak save
  assert.equal(chosen.type, 'pass_priority');
});
