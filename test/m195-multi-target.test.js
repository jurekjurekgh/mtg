// M195/C + C1 — wielocelowość jako LISTA WYBORU, nie eksplozja kombinacji.
//
// Zgłoszenie właściciela:
//  C  — „Fireball (i inne tego typu) — mam 95 kombinacji obrażeń. To powinno
//        być zrobione na zasadzie listy legalnych celów do wyboru (ptaszek)
//        i osobnego licznika +- do określenia obrażeń (X) i kosztu czaru.
//        Po zatwierdzeniu silnik sprawdza czy wybór jest legalny."
//  C1 — „Wrap in Flames — zamiast 50 kombinacji powinna być lista legalnych
//        celów z możliwością dodania ptaszka i potem sprawdzeniem legalności."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiTargetPlanOf, commandForSelection } from '../src/table/multi-target.js';

/** Warianty Fireball: 3 cele × X 1..3 (kartezjański iloczyn jak w silniku). */
function fireballCommands() {
  const out = [];
  for (const targets of [['c0'], ['c1'], ['p2'], ['c0', 'c1'], ['c0', 'p2'], ['c1', 'p2'], ['c0', 'c1', 'p2']]) {
    for (const xValue of [1, 2, 3]) {
      out.push({ type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets, xValue });
    }
  }
  return out;
}

/** Warianty Wrap in Flames: podzbiory do 3 celów, bez X. */
function wrapCommands() {
  const out = [];
  for (const targets of [[], ['c0'], ['c1'], ['c2'], ['c0', 'c1'], ['c0', 'c2'], ['c1', 'c2'], ['c0', 'c1', 'c2']]) {
    out.push({ type: 'cast_spell', playerId: 'p1', objectId: 'wf', targets, modeIndex: 0 });
  }
  return out;
}

test('M195/C: plan zwraca LISTĘ CELÓW, nie listę kombinacji', () => {
  const plan = multiTargetPlanOf(fireballCommands());
  assert.ok(plan, 'warianty wielocelowe mają dać plan wyboru');
  assert.deepEqual(plan.targets.slice().sort(), ['c0', 'c1', 'p2'],
    `21 kombinacji → 3 cele do zaznaczenia: ${JSON.stringify(plan.targets)}`);
});

test('M195/C: plan zna zakres X (licznik +/-)', () => {
  const plan = multiTargetPlanOf(fireballCommands());
  assert.deepEqual([plan.xMin, plan.xMax], [1, 3], 'licznik X od 1 do 3');
  assert.equal(plan.hasX, true);
});

test('M195/C: wybór celów + X składa się na JEDNĄ legalną komendę', () => {
  const commands = fireballCommands();
  const cmd = commandForSelection(commands, { targets: ['c0', 'p2'], xValue: 2 });
  assert.ok(cmd, 'zaznaczenie musi dać komendę');
  assert.deepEqual(cmd.targets.slice().sort(), ['c0', 'p2']);
  assert.equal(cmd.xValue, 2);
  assert.ok(commands.includes(cmd), 'komenda pochodzi z legalCommands — silnik ją zna');
});

test('M195/C: NIELEGALNY wybór nie daje komendy (silnik sprawdza legalność)', () => {
  const commands = fireballCommands();
  assert.equal(commandForSelection(commands, { targets: ['c0', 'c1', 'p2'], xValue: 9 }), null,
    'X poza zakresem');
  assert.equal(commandForSelection(commands, { targets: ['nieistniejacy'], xValue: 1 }), null,
    'cel spoza listy');
});

test('M195/C1: Wrap in Flames — lista celów bez licznika X', () => {
  const plan = multiTargetPlanOf(wrapCommands());
  assert.ok(plan, 'plan wyboru istnieje');
  assert.deepEqual(plan.targets.slice().sort(), ['c0', 'c1', 'c2']);
  assert.equal(plan.hasX, false, 'ta karta nie ma X — bez licznika');
  assert.equal(plan.minTargets, 0, '„up to three" — zero celów też jest legalne');
  assert.equal(plan.maxTargets, 3);
});

test('M195/C1: zaznaczenie dwóch celów wybiera właściwą komendę', () => {
  const commands = wrapCommands();
  const cmd = commandForSelection(commands, { targets: ['c1', 'c2'] });
  assert.ok(cmd);
  assert.deepEqual(cmd.targets.slice().sort(), ['c1', 'c2']);
});

test('M195/C1: kolejność zaznaczenia nie ma znaczenia', () => {
  const commands = wrapCommands();
  const a = commandForSelection(commands, { targets: ['c0', 'c2'] });
  const b = commandForSelection(commands, { targets: ['c2', 'c0'] });
  assert.equal(a, b, 'ten sam zbiór celów = ta sama komenda');
});

test('M195/C: pojedynczy cel bez X NIE tworzy planu (anty-over-fix)', () => {
  // Zwykły czar celowany (Shock) ma po jednej komendzie na cel — panel radzi
  // sobie z tym od dawna, nie ma po co pokazywać ekranu zaznaczania.
  const single = [
    { type: 'cast_spell', playerId: 'p1', objectId: 's', targets: ['c0'] },
    { type: 'cast_spell', playerId: 'p1', objectId: 's', targets: ['c1'] },
  ];
  assert.equal(multiTargetPlanOf(single), null,
    'jeden cel na komendę = zwykła lista celów, bez ekranu wyboru');
});

test('M195/C: sam licznik X bez wielu celów TWORZY plan (Fireball w 1 cel)', () => {
  // „i inne tego typu" — czar z X i jednym celem też zasługuje na licznik
  // zamiast N przycisków „X=1, X=2, X=3…".
  const xOnly = [1, 2, 3, 4].map((xValue) => ({
    type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['c0'], xValue,
  }));
  const plan = multiTargetPlanOf(xOnly);
  assert.ok(plan, 'sam wybór X to też licznik, nie lista przycisków');
  assert.deepEqual([plan.xMin, plan.xMax], [1, 4]);
});

// ---- Realne karty z katalogu (nie tylko komendy syntetyczne) -------------

test('M195/C: REALNY Fireball — 232 kombinacje stają się 6 celów + licznik X', async () => {
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const REGISTRY = createCardRegistry();
  const state = createGameState({ seed: 195, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const fireball = REGISTRY.get('fireball');
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: 'fireball', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(fireball), types: fireball.types, spell: fireball.spell,
  });
  const giant = REGISTRY.get('hill-giant');
  for (let i = 0; i < 4; i += 1) {
    const owner = i % 2 === 0 ? 'p1' : 'p2';
    addObject(state, {
      id: `c${i}`, instanceId: `i-c${i}`, cardId: 'hill-giant', controllerId: owner,
      ownerId: owner, zone: 'battlefield', ...gameObjectDataOf(giant), types: giant.types,
    });
  }
  for (let i = 0; i < 8; i += 1) {
    addObject(state, {
      id: `m${i}`, instanceId: `i-m${i}`, cardId: 'basic-mountain', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Mountain'],
    });
  }
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'spell');
  assert.ok(commands.length > 50,
    `to jest właśnie problem ze zgłoszenia — ${commands.length} kombinacji`);
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan, 'Fireball dostaje ekran wyboru');
  assert.ok(plan.targets.length <= 8,
    `zamiast ${commands.length} przycisków — ${plan.targets.length} celów do zaznaczenia`);
  assert.equal(plan.hasX, true, 'i licznik X zamiast osobnego przycisku na każdą wartość');
  // Każdy wybór z ekranu musi wracać do komendy, którą silnik uznał za legalną.
  const chosen = commandForSelection(commands, { targets: [plan.targets[0]], xValue: plan.xMax });
  assert.ok(chosen && commands.includes(chosen), 'zatwierdzenie daje legalną komendę silnika');
});

test('M195/C1: REALNY Wrap in Flames — podzbiory celów zamiast kombinacji', async () => {
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { createCardRegistry } = await import('../src/cards/card-data.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const REGISTRY = createCardRegistry();
  const state = createGameState({ seed: 195, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const wrap = REGISTRY.get('wrap-in-flames');
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: 'wrap-in-flames', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(wrap), types: wrap.types, spell: wrap.spell,
  });
  const giant = REGISTRY.get('hill-giant');
  for (let i = 0; i < 4; i += 1) {
    const owner = i % 2 === 0 ? 'p1' : 'p2';
    addObject(state, {
      id: `c${i}`, instanceId: `i-c${i}`, cardId: 'hill-giant', controllerId: owner,
      ownerId: owner, zone: 'battlefield', ...gameObjectDataOf(giant), types: giant.types,
    });
  }
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `m${i}`, instanceId: `i-m${i}`, cardId: 'basic-mountain', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Mountain'],
    });
  }
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'spell');
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan, 'Wrap in Flames też dostaje ekran wyboru');
  assert.equal(plan.hasX, false, 'ta karta nie ma X — sam ptaszek przy celach');
  assert.equal(plan.maxTargets, 3, 'Oracle: „up to three target creatures"');
  const chosen = commandForSelection(commands, { targets: plan.targets.slice(0, 2) });
  assert.ok(chosen && commands.includes(chosen), 'zatwierdzenie daje legalną komendę silnika');
});
