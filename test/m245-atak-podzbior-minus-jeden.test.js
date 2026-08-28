// M245 — zgłoszenie M właściciela (2026-08-27): „bot atakuje 3/2 w mojego
// gotowego 2/5 — atak bez sensu, inni jego stwory latają".
//
// Root cause (engine, COMBAT_OPTION_CAP): gdy gracz ma ≥6 opcjonalnych
// atakujących, legalAttackerOptions/boundedSubsets obcinało ofertę do
// [[], singletony, ZBIÓR PEŁNY] — podzbiór „zaatakuj WSZYSTKIMI poza tym
// jednym, który niczego nie osiągnie" (najczęstsza sensowna deklaracja przy
// dużej armii!) w ogóle nie istniał w ofercie. Bot więc wybierał między
// „pass" a „atak wszystkich" i — przy latającej reszce wartej ataku —
// brał „wszystkich": 3/2 szedł na pewną śmierć w 2/5.
//
// Fix: w trybie ograniczonym dojezdchają podzbiory „wszystkie minus jeden"
// (deterministycznie, obciętych cap 32 mieści do n=15 armii). Ta sama
// funkcja zasila opcje blokerów (legalBlockerOptions) — tam brakowało
// „blokuj wszystkimi poza najbardziej wartościowym".
//
// Scenariusz zgłoszenia odtworzony: 5 latających 2/2 + jeden 3/2 naziemny,
// obrońca z nietapniętym 2/5 bez reach. Ręka celowo pusta, żadnych innych
// akcji — jedyny ruch to deklaracja ataku albo pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { legalAttackerOptions } from '../src/engine/combat.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addFlyer(state, id, controllerId) {
  // Rustwing Falcon 1/2 flying — „inni atakujący latają".
  const def = REGISTRY.get('rustwing-falcon');
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'rustwing-falcon', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power: def.power, toughness: def.toughness,
    manaCost: def.manaCost, types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [], colors: def.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped: false }));
}

function addGround(state, id, controllerId, cardId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power: def.power, toughness: def.toughness,
    manaCost: def.manaCost, types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [], colors: def.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped: false }));
}

function scenario(state) {
  for (let i = 0; i < 5; i += 1) addFlyer(state, `fly${i}`, 'p1');
  // 3/2 naziemny BEZ ewazji — czysta „jałowa sztuka" (gdyby miał menace,
  // atak przechodziłby nad jednym blokerem i zgłoszenie by nie zaistniało).
  addGround(state, 'chump', 'p1', 'undead-servant'); // 3/2 bez keywordów
  addGround(state, 'wall', 'p2', 'cacophodon'); // 2/5 bez reach/flying
  return state;
}

test('M245/1: przy ≥6 atakujących oferta NIESIE „wszyscy bez jałowej sztuki", nie tylko pełne/pusty', () => {
  const state = scenario(game());
  const options = legalAttackerOptions(state, 'p1');
  const all = ['fly0', 'fly1', 'fly2', 'fly3', 'fly4', 'chump'];
  const flyersOnly = ['fly0', 'fly1', 'fly2', 'fly3', 'fly4'];
  assert.ok(options.some((set) => JSON.stringify([...set].sort()) === JSON.stringify([...all].sort())),
    'pełny atak nadal oferowany');
  assert.ok(options.some((set) => JSON.stringify([...set].sort()) === JSON.stringify([...flyersOnly].sort())),
    '„latający bez 3/2" (wszystkie-minus-jeden) MUSI być w ofercie — dotąd go nie było');
  assert.ok(options.length <= 32, 'cap 32 dotrzymany');
});

test('M245/2: bot wybiera atak SAMYMI latającymi — 3/2 zostaje w tyle (zgłoszenie M)', () => {
  const state = scenario(game());
  const bot = createHeuristicBot({ seed: 2026 });
  const pick = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(pick.type, 'declare_attackers', 'atak się opłaca (5 latających nieblokowalnych)');
  assert.ok(!pick.attackerIds.includes('chump'),
    `3/2 NIE atakuje w gotowego 2/5 (atak bez sensu); zadeklarowani: ${pick.attackerIds.join(',')}`);
  assert.equal(pick.attackerIds.length, 5, 'tylko pięciu latających');
});

test('M245/3: opcje blokerów też mają „wszyscy minus jeden" (ta sama funkcja, ten sam regres)', () => {
  // legalBlockerOptions dzieli boundedSubsets — sprawdzamy kształt przez atak
  // przeciwnika: p2 ma 7 opcjonalnych blokerów, p1 atakuje jednym stworem.
  const state = game();
  addGround(state, 'att', 'p1', 'cacophodon'); // 2/5 atakuje
  for (let i = 0; i < 7; i += 1) addGround(state, `blk${i}`, 'p2', 'highland-game'); // 7× 2/1
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  const view2 = playerView(state, 'p2');
  const blockerCmds = view2.legalCommands.filter((c) => c.type === 'declare_blockers');
  const full = { att: ['blk0', 'blk1', 'blk2', 'blk3', 'blk4', 'blk5', 'blk6'] };
  const sixMinusOne = { att: ['blk0', 'blk1', 'blk2', 'blk3', 'blk4', 'blk5'] };
  assert.ok(blockerCmds.some((c) => JSON.stringify(c.assignments) === JSON.stringify(full)), 'pełny gang oferowany');
  assert.ok(blockerCmds.some((c) => JSON.stringify(c.assignments) === JSON.stringify(sixMinusOne)),
    '„6 z 7 blokerów" oferowane (wcześniej nie istniało)');
});
