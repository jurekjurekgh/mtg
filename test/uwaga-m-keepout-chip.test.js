// M (zgłoszenie właściciela 2026-10-09, Keep Out): bot rzucał modalny czar
// czysto-ofensywny („4 damage to target tapped creature” / „destroy target
// enchantment”) w atakującą 4/5 mimo że nie miał czym dobić — chip 4 w 4/5
// wyceniał się na 0, a baza spellBase 50 sama niosła rzut ponad pass.
// Czar i mana zmarnowane, kreatura nic nie straciła.
//
// Fix (dwie części, jedna klasa):
//  1. isDamageOnly (cast_spell, jak M146/A4-4): czar, którego CAŁA treść to
//     obrażenia celowe, startuje poniżej passu — wartość efektów sama decyduje.
//  2. damageChipEnablesKill (damageTargetValue, L41 — czary + zdolności):
//     nieletalny chip w stwora w oknie walki ma wartość TYLKO gdy razem z moim
//     blokiem dobija atakującego (symulacja 1v1, CR 510 — jak J).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();

function build({ attacker = [4, 5], blocker = null, foeEnchant = false } = {}) {
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
  blank('big', 'p1', attacker[0], attacker[1], 5);
  state.objects.set('big', Object.freeze({ ...state.objects.get('big'), tapped: true })); // atakujący = tapnięty
  if (blocker) blank('blk', 'p2', blocker[0], blocker[1], 1);
  if (foeEnchant) {
    addObject(state, { id: 'enc', instanceId: 'i-enc', cardId: 'x-enc', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'enchantment', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Enchantment'], colors: [], cardName: 'enc' });
  }
  put('plains1', 'basic-plains', 'p2', 'battlefield');
  put('plains2', 'basic-plains', 'p2', 'battlefield');
  put('ko', 'keep-out', 'p2', 'hand');
  for (let i = 0; i < 10; i += 1) {
    addObject(state, { id: `lib${i}`, instanceId: `i-lib${i}`, cardId: `x-lib${i}`, controllerId: 'p2', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `lib${i}` });
  }
  state.combat = {
    attackers: ['big'],
    attackingPlayerId: 'p1',
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  addMana(state, 'p2', 9);
  return state;
}

function decide(state) {
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'));
  const opts = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(ko'));
  return { chosen, opts, scoreOf: (t) => opts.find((o) => o.cmd === `cast_spell(ko->${t})`)?.score };
}

test('M: bez blokerów bot TRZYMA Keep Out (chip 4 w 4/5 nic nie daje)', () => {
  const { chosen, scoreOf } = decide(build({ attacker: [4, 5] }));
  // isDamageOnly: start −1; chip bez możliwości dobicia = 0 → −1 poniżej passu.
  assert.equal(scoreOf('big'), -1);
  assert.notEqual(chosen.type, 'cast_spell', `bot ma pasować, wybrał: ${JSON.stringify(chosen)}`);
});

test('M anti-over-fix: z blokerem 1/1 chip 4 + blok 1 = kill 4/5 — bot rzuca', () => {
  const { chosen, scoreOf } = decide(build({ attacker: [4, 5], blocker: [1, 1] }));
  // −1 + lethalEnemyCreatureValue(4/5): 22 + 2×9 + 2×5(TMC) = 50 → 49.
  assert.equal(scoreOf('big'), 49);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['big']);
});

test('M: wróg ma enchantment — bot wybiera tryb „destroy”, nie chip', () => {
  const { chosen, scoreOf } = decide(build({ attacker: [4, 5], foeEnchant: true }));
  assert.equal(scoreOf('enc'), 76);
  assert.equal(scoreOf('big'), -1);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['enc']);
});

test('M: lethal (4 dmg w 4/4) — bot rzuca czysto-ofensywny czar mimo startu −1', () => {
  const { chosen, scoreOf } = decide(build({ attacker: [4, 4] }));
  // −1 + lethalEnemyCreatureValue(4/4 MV5): 22 + 2×8 + 2×5 = 48 → 47.
  assert.equal(scoreOf('big'), 47);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['big']);
});

test('M kontrola: czysto-ofensywny czar w TWARZ (Shock, 2/20 życia) — bot rzuca', () => {
  // Wartość twarzy sama w sobie uzasadnia rzut: −1 + (6 + 40×0,1) = 9 > 0.
  const state = createGameState({ seed: 42, players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const put = (id, cardId, ctl, zone) => {
    const def = REG.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: ctl, ownerId: ctl, zone, ...gameObjectDataOf(def) });
  };
  put('mnt', 'basic-mountain', 'p2', 'battlefield');
  put('sh', 'shock', 'p2', 'hand');
  addMana(state, 'p2', 9);
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'));
  const opts = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(sh'));
  const face = opts.find((o) => o.cmd === 'cast_spell(sh->p1)');
  assert.equal(face?.score, 9);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['p1']);
});

test('M kontrola: chip poza walką — zakaz bez zmian (Keep Out w main vs 4/5)', () => {
  const state = createGameState({ seed: 42, players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 20 }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const put = (id, cardId, ctl, zone) => {
    const def = REG.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: ctl, ownerId: ctl, zone, ...gameObjectDataOf(def) });
  };
  put('plains1', 'basic-plains', 'p2', 'battlefield');
  put('ko', 'keep-out', 'p2', 'hand');
  addObject(state, { id: 'big', instanceId: 'i-big', cardId: 'x-big', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 4, toughness: 5, manaCost: 5, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'big' });
  state.objects.set('big', Object.freeze({ ...state.objects.get('big'), tapped: true }));
  addMana(state, 'p2', 9);
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'));
  const opts = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(ko'));
  // −1 (isDamageOnly) − 80 (chip poza walką) = −81 — trzymaj.
  assert.equal(opts.find((o) => o.cmd === 'cast_spell(ko->big)')?.score, -81);
  assert.notEqual(chosen.type, 'cast_spell');
});
