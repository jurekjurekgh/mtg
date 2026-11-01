// Zgłoszenie O: kosztowny grant latania jest trikiem bojowym.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'main1', active = 'p1') {
  const s = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, active);
  s.turn.activePlayerId = active;
  s.turn.priorityPlayerId = active;
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(s, {
        id: `lib-${p}-${i}`, instanceId: `i-lib-${p}-${i}`, cardId: 'basic-plains',
        controllerId: p, ownerId: p, zone: 'library', kind: 'spell', manaCost: 0,
      });
    }
  }
  return s;
}

function put(s, id, cardId, playerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

/** Lądy bota (p1): 8 sztuk, w tym 3 Mountains — wystarczy na Brute Force. */
function lands(s) {
  const colors = ['mountain', 'plains', 'swamp'];
  for (let i = 0; i < 8; i += 1) {
    const color = colors[i % colors.length];
    addObject(s, {
      id: `l${i}`, instanceId: `i-l${i}`, cardId: `basic-${color}`,
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land',
      manaSource: { colors: [color], amount: 1 },
      types: ['Basic', 'Land'], subtypes: [color], keywords: [], colors: [],
    });
  }
}

function creature(s, id, pid, power, toughness, patch = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2, abilities: [],
    keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

/** Scena bota (p1): imp na stole, 8 lądów, karty w ręce, stół wroga (p2). */
function scena({ step = 'main1', mana = 8, hand = ['brute-force'], foe = [] } = {}) {
  const s = game(step);
  put(s, 'imp', 'fledgling-imp', 'p1');
  lands(s);
  addMana(s, 'p1', mana);
  hand.forEach((cardId, i) => put(s, `h${i}`, cardId, 'p1', 'hand'));
  foe.forEach(([id, power, toughness, patch]) => creature(s, id, 'p2', power, toughness, patch ?? {}));
  return s;
}

/** Decyzja bota + noty wszystkich wariantów (etykieta śladu nosi źródło). */
function decyzja(s, seed = 5) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}
const impScore = (scores) => scores['activate_ability(imp#0)'];
const passScore = (scores) => scores.pass_priority ?? 0;


test('O/1: Main 1 nawet w obliczu 2/4 — czekaj do początku walki', () => {
  const s = scena({ hand: ['enter-the-enigma'], foe: [['e', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'imp', true);
  assert.ok(impScore(scores) < passScore(scores));
});

test('O/2: początek walki, jedyny naziemny 1/1 — latanie jest zbyt kosztowne', () => {
  const s = scena({ step: 'beginning_of_combat', hand: ['enter-the-enigma'], foe: [['e', 1, 1]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'imp', true);
  assert.ok(impScore(scores) < passScore(scores));
});

test('O/3: początek walki, ziemny 2/4 i nierzuçalna karta — latanie ma sens', () => {
  const s = scena({ step: 'beginning_of_combat', hand: ['enter-the-enigma'], foe: [['e', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'activate_ability'); assert.equal(cmd.objectId, 'imp');
  assert.ok(impScore(scores) > passScore(scores));
});

test('O/4: rzuçalna karta w ręce nie może zostać kosztem latania', () => {
  const s = scena({ step: 'beginning_of_combat', hand: ['brute-force'], foe: [['e', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'imp', true);
  assert.ok(impScore(scores) < passScore(scores));
});

test('O/5: koszt wybiera nierzuçalną kartę, a nie kartę możliwą do rzucenia', () => {
  const s = scena({ step: 'beginning_of_combat', hand: ['brute-force', 'enter-the-enigma'], foe: [['e', 2, 4]] });
  const view = playerView(s, 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand({ ...view, legalCommands: view.legalCommands.filter(c => c.type === 'activate_ability' || c.type === 'pass_priority') });
  assert.equal(cmd.type, 'activate_ability');
  assert.ok(execute(s, cmd).ok);
  const discard = bot.chooseCommand(playerView(s, 'p1'));
  assert.equal(discard.type, 'resolve_discard_choice');
  assert.equal(discard.cardId, 'h1');
  assert.ok(execute(s, discard).ok);
  assert.ok([...s.objects.values()].some(o => o.zone === 'graveyard' && o.cardId === 'enter-the-enigma'));
});

test('O/6: przeciwnik lata 2/3 — Imp 2/2 go nie zabija, nie płaci karty', () => {
  const s = game('declare_attackers', 'p2');
  put(s, 'imp', 'fledgling-imp', 'p1'); lands(s); addMana(s, 'p1', 8);
  put(s, 'h0', 'enter-the-enigma', 'p1', 'hand');
  creature(s, 'atk', 'p2', 2, 3, { keywords: ['flying'], summoningSickness: false });
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'imp', true);
  assert.ok(impScore(scores) < passScore(scores));
});

test('O/7: tylko jeden czarny ląd — karta za {1}{B}{B} jest nierzuçalna mimo dostępnego koloru', () => {
  const s = scena({ step: 'beginning_of_combat', hand: ['dread-warlock'], foe: [['e', 2, 4]] });
  for (let i = 1; i < 8; i++) s.objects.set(`l${i}`, Object.freeze({ ...s.objects.get(`l${i}`), controllerId: 'p2' }));
  const { cmd, scores } = decyzja(s);
  assert.equal(cmd.type, 'activate_ability');
  assert.ok(impScore(scores) > passScore(scores));
});

test('O/8: reach lub flying po stronie wroga nie pozwalają na ofensywny grant', () => {
  for (const keyword of ['flying', 'reach']) {
    const s = scena({ step: 'beginning_of_combat', hand: ['enter-the-enigma'], foe: [['e', 2, 4], ['air', 1, 2, { keywords: [keyword] }]] });
    const { cmd, scores } = decyzja(s);
    assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'imp', true, keyword);
    assert.ok(impScore(scores) < passScore(scores), keyword);
  }
});

test('O/9: gdy w ręce jest tylko ląd, nie poświęcaj go dla latania', () => {
  const s = scena({ step: 'beginning_of_combat', hand: ['basic-swamp'], foe: [['e', 2, 4]] });
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'imp', true);
  assert.ok(impScore(scores) < passScore(scores));
});

test('O/10: przeciwnik 3/2 z first strike zabije Impa przed jego obrażeniami', () => {
  const s = game('declare_attackers', 'p2');
  put(s, 'imp', 'fledgling-imp', 'p1'); lands(s); addMana(s, 'p1', 8);
  put(s, 'h0', 'enter-the-enigma', 'p1', 'hand');
  creature(s, 'atk', 'p2', 3, 2, { keywords: ['flying', 'first_strike'], summoningSickness: false });
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  const { cmd, scores } = decyzja(s);
  assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'imp', true);
  assert.ok(impScore(scores) < passScore(scores));
});
