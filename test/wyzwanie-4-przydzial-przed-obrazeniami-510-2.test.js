// W4 (PLAN_2026-09-11b, wyzwanie 4/5) — przydziały obrażeń ogłaszane PRZED
// zadaniem czegokolwiek, obrażenia zadawane równocześnie. CR pobrane 2026-09-12:
//   510.1  „First, the active player announces how each attacking creature assigns
//           its combat damage, then the defending player announces how each
//           blocking creature assigns its combat damage."
//   510.1a „Each attacking creature and each blocking creature assigns combat
//           damage equal to its power."
//   510.2  „Second, all combat damage that's been assigned is dealt simultaneously.
//           This turn-based action doesn't use the stack. No player has the chance
//           to cast spells or activate abilities between the time combat damage is
//           assigned and the time it's dealt."
//   510.3  „Third, the active player gets priority." (czyli SBA — 704.3
//           „Whenever a player would get priority ... performs all applicable
//           state-based actions simultaneously" i 704.5g o śmiertelnych
//           obrażeniach — biegną DOPIERO po zadaniu obrażeń kroku).
//   702.3  infect: obrażenia w formie znaczników −1/−1 (na stworach).
//   510.4  drugi przebieg (first strike) to OSOBNY krok — tam moc liczy się już
//           po znacznikach z pierwszego przebiegu.
// Stan sprzed W4 (zmierzony sondą tools/probe-w4-infect-przydzial.mjs): faza
// atakujących zadawała obrażenia, potem kolejkowała się decyzja BLOKERA, SBA po
// komendzie niszczyło blokera i ten nie zadawał NIC; jego moc była liczona już po
// znacznikach −1/−1 (7/6 → 2), a widok decyzji miał puste `entries`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

// jumpToStep ustawia tylko priorytet (turn.js:48) — aktywnego gracza dopisujemy.
function atStep(state, step, priorityId, activeId = priorityId) {
  state.turn = { ...jumpToStep(state.turn, step, priorityId), activePlayerId: activeId };
  return state;
}

function putCard(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

/** Stwór syntetyczny (jak w testach CR 510.1c — audyt-pr105). */
function putCreature(state, id, controllerId, power, toughness, keywords = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], colors: [], abilities: [], subtypes: [], keywords,
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
  return object;
}

const alive = (state, id) => state.objects.get(id)?.zone === 'battlefield';
const offeredAssignment = (state, playerId) => playerView(state, playerId).legalCommands
  .find((c) => c.type === 'resolve_damage_assignment');

/**
 * Scenariusz z sondy: p2 atakuje Chained Throatseeker 5/5 (infect; wymaga
 * zatrutego obrońcy) i Gurmag Drowner 2/4, p1 blokuje OBA jednym Segmented
 * Krotiq 6/5 z licznikiem +1/+1 (7/6) — podwójny blok dzięki statyce
 * Cenn's Tactician (M166/E).
 */
function infectDoubleBlock() {
  const state = createGameState({ seed: 116, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players = state.players.map((player) => (player.id === 'p1' ? { ...player, poison: 1 } : player));
  atStep(state, 'declare_attackers', 'p2');
  putCard(state, 'tact', 'cenns-tactician', 'p1');
  putCard(state, 'wall', 'segmented-krotiq', 'p1', { counters: { '+1/+1': 1 } });
  putCard(state, 'a1', 'chained-throatseeker', 'p2');
  putCard(state, 'a2', 'gurmag-drowner', 'p2');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['wall'], a2: ['wall'] } }).ok);
  atStep(state, 'combat_damage', 'p2');
  return state;
}

test('W4/1: przydział blokera ogłoszony PRZED zadaniem obrażeń, z mocą z początku kroku (CR 510.1/510.2)', () => {
  const state = infectDoubleBlock();
  const before = state.events.length;
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  const types = state.events.slice(before).map((entry) => entry.type);
  const decision = types.indexOf('damage_assignment_required');
  assert.ok(decision >= 0, 'decyzja podziału zakolejkowana');
  const dealtBefore = types.slice(0, decision)
    .filter((type) => ['damage_dealt', 'damage_marked', 'counter_added', 'creature_destroyed'].includes(type));
  assert.deepEqual(dealtBefore, [], `nic nie zostało zadane przed ogłoszeniem przydziału (było: ${dealtBefore})`);
  assert.ok(alive(state, 'wall'), 'bloker żyje, gdy ogłasza przydział (SBA dopiero po zadaniu — CR 704.3)');
  const view = playerView(state, 'p1').pendingDamageAssignment;
  assert.equal(view.entries[0].power, 7, 'moc z początku kroku, nie po znacznikach −1/−1 z infect');
  assert.deepEqual(view.entries[0].attackers.map((target) => target.lethal), [5, 4], 'lethal liczony przed obrażeniami');
});

test('W4/2: bloker zadaje CAŁĄ przydzieloną moc i ginie dopiero potem (CR 510.2 + 704.5g)', () => {
  const state = infectDoubleBlock();
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  const offered = offeredAssignment(state, 'p1');
  assert.deepEqual(offered.assignments.wall, [{ attackerId: 'a1', amount: 5 }, { attackerId: 'a2', amount: 2 }],
    'lethal-first z mocy 7: 5 zabija Throatseekera, 2 na Drownera');
  assert.ok(execute(state, offered).ok);
  assert.ok(!alive(state, 'a1'), 'Throatseeker 5/5 zginął od 5 obrażeń blokera');
  assert.equal(state.objects.get('a2').damage, 2, 'Drowner dostał przydzielone 2');
  assert.ok(!alive(state, 'wall'), 'bloker zginął od 5 znaczników −1/−1 i 2 obrażeń — ale DOPIERO po zadaniu swoich');
  const dealt = state.events.filter((entry) => entry.type === 'damage_dealt' && entry.source === 'wall');
  assert.equal(dealt.reduce((sum, entry) => sum + entry.amount, 0), 7, 'suma obrażeń blokera = moc z początku kroku');
});

test('W4/3: gracz wybiera podział inaczej niż domyślny i oba stwory przeżywają (CR 510.1d)', () => {
  const state = infectDoubleBlock();
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  const res = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { wall: [{ attackerId: 'a1', amount: 3 }, { attackerId: 'a2', amount: 4 }] },
  });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(state.objects.get('a1').damage, 3, 'Throatseeker przeżył (3 z 5)');
  assert.ok(alive(state, 'a1'));
  assert.ok(!alive(state, 'a2'), 'Drowner zginął od 4 obrażeń');
  assert.ok(!alive(state, 'wall'), 'bloker i tak ginie od infect tego samego kroku');
});

test('W4/4: drugi przebieg (first strike) to OSOBNY krok — moc liczona po znacznikach (CR 510.4)', () => {
  const state = createGameState({ seed: 117, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  putCreature(state, 'att', 'p2', 3, 3);
  putCreature(state, 'fs', 'p1', 1, 1, ['first_strike', 'infect']);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['att'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { att: ['fs'] } }).ok);
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  assert.ok(alive(state, 'att'), 'atakujący przeżył pierwszy przebieg');
  assert.equal(state.objects.get('att').counters['-1/-1'], 1, 'infect z pierwszego przebiegu dał znacznik −1/−1');
  assert.ok(!alive(state, 'fs'), 'bloker z first strike zginął w drugim przebiegu');
  const toBlocker = state.events.filter((entry) => entry.type === 'damage_dealt' && entry.target === 'fs');
  assert.equal(toBlocker.reduce((sum, entry) => sum + entry.amount, 0), 2,
    'w drugim przebiegu atakujący zadaje 2 (3 − znacznik), nie 3 — CR 510.4: osobny krok');
});

test('W4/5: dwóch atakujących z decyzją = JEDNA runda ogłoszeń, oba wybory gracza honorowane (CR 510.1/510.1e)', () => {
  const state = createGameState({ seed: 118, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p1');
  putCreature(state, 'x1', 'p1', 4, 4, ['trample']);
  putCreature(state, 'x2', 'p1', 4, 4, ['trample']);
  putCreature(state, 'b1', 'p2', 2, 2);
  putCreature(state, 'b2', 'p2', 2, 2);
  putCreature(state, 'b3', 'p2', 2, 2);
  putCreature(state, 'b4', 'p2', 2, 2);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['x1', 'x2'] }).ok);
  atStep(state, 'declare_blockers', 'p2', 'p1');
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p2', assignments: { x1: ['b1', 'b2'], x2: ['b3', 'b4'] },
  }).ok);
  atStep(state, 'combat_damage', 'p1');
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  const pending = state.pendingDamageAssignment;
  assert.ok(pending, 'decyzja atakującego zakolejkowana');
  const view = playerView(state, 'p1').pendingDamageAssignment;
  assert.deepEqual(view.entries.map((entry) => entry.attackerId), ['x1', 'x2'], 'widok niesie OBU atakujących');
  const res = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: {
      x1: [{ blockerId: 'b1', amount: 4 }, { blockerId: 'b2', amount: 0 }],
      x2: [{ blockerId: 'b3', amount: 0 }, { blockerId: 'b4', amount: 4 }],
    },
  });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(state.pendingDamageAssignment, null, 'jedna runda ogłoszeń zamyka fazę');
  assert.ok(!alive(state, 'b1'), 'b1 dostał 4 (wybór gracza, nie domyślne 2)');
  assert.equal(state.objects.get('b2').damage, 0, 'b2 nietknięty');
  assert.equal(state.objects.get('b3').damage, 0, 'b3 nietknięty — przed W4 drugi atakujący dostawał default');
  assert.ok(!alive(state, 'b4'), 'b4 dostał 4');
  assert.equal(state.players.find((player) => player.id === 'p2').life, 20, 'trample bez nadwyżki — nic na gracza');
});

test('W4/6: decyzja atakującego i blokera w jednym przebiegu — oba wybory zebrane przed zadaniem', () => {
  const state = createGameState({ seed: 119, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  putCard(state, 'tact', 'cenns-tactician', 'p1');
  putCard(state, 'wall', 'segmented-krotiq', 'p1', { counters: { '+1/+1': 1 } }); // 7/6
  putCard(state, 'help', 'gurmag-drowner', 'p1'); // 2/4
  putCard(state, 'a1', 'segmented-krotiq', 'p2'); // 6/5
  putCard(state, 'a2', 'gurmag-drowner', 'p2'); // 2/4
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['wall', 'help'], a2: ['wall'] },
  }).ok);
  atStep(state, 'combat_damage', 'p2');
  const before = state.events.length;
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  const types = state.events.slice(before).map((entry) => entry.type);
  assert.equal(types.filter((type) => type === 'damage_dealt').length, 0, 'nic nie zadane przed ogłoszeniami');
  assert.equal(state.pendingDamageAssignment.role, 'attacker');
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2',
    assignments: { a1: [{ blockerId: 'wall', amount: 2 }, { blockerId: 'help', amount: 4 }] },
  }).ok, 'atakujący ogłosił 2 na wall i 4 na help (zabija 2/4)');
  assert.ok(state.pendingDamageAssignment, 'teraz kolej obrońcy (CR 510.1)');
  assert.equal(state.pendingDamageAssignment.role, 'blocker');
  const blockerView = playerView(state, 'p1').pendingDamageAssignment;
  assert.equal(blockerView.entries[0].power, 7, 'moc wall bez obrażeń — te padną dopiero po ogłoszeniach');
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { wall: [{ attackerId: 'a1', amount: 4 }, { attackerId: 'a2', amount: 3 }] },
  }).ok);
  assert.equal(state.pendingDamageAssignment, null);
  // Oba wybory dosłownie w zdarzeniach (domyślne lethal-first dałoby 6 na wall
  // i 0 na help po stronie atakującego oraz 5 na a1 po stronie blokera).
  const dealt = Object.fromEntries(state.events
    .filter((entry) => entry.type === 'damage_dealt')
    .map((entry) => [`${entry.source}->${entry.target}`, entry.amount]));
  assert.equal(dealt['a1->wall'], 2, 'wybór atakującego honorowany');
  assert.equal(dealt['a1->help'], 4, 'help dostał 4 (domyślnie dostałby 0)');
  assert.equal(dealt['wall->a1'], 4, 'wybór obrońcy honorowany');
  assert.equal(dealt['wall->a2'], 3);
  assert.equal(dealt['help->a1'], 2, 'help też zadaje — a1 dostaje 4+2 = 6 na 6/5');
  assert.ok(!alive(state, 'a1'), 'a1 zginął od łącznych obrażeń obu blokerów');
  assert.equal(state.objects.get('a2').damage, 3, 'a2 przeżył z 3 obrażeniami');
  assert.equal(state.objects.get('wall').damage, 4, 'wall dostał 2 od a1 i 2 od a2 (7/6 — przeżył)');
  assert.ok(alive(state, 'wall'));
  assert.ok(!alive(state, 'help'), 'help zginął od 4 obrażeń');
});

test('W4/7: bloker bez decyzji też zadaje moc z początku kroku (infect nie zmniejsza jego obrażeń)', () => {
  const state = createGameState({ seed: 120, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players = state.players.map((player) => (player.id === 'p1' ? { ...player, poison: 1 } : player));
  atStep(state, 'declare_attackers', 'p2');
  putCard(state, 'att', 'chained-throatseeker', 'p2'); // 5/5 infect
  putCard(state, 'wall', 'segmented-krotiq', 'p1'); // 6/5, blokuje sam
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['att'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { att: ['wall'] } }).ok);
  atStep(state, 'combat_damage', 'p2');
  const res = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(state.pendingDamageAssignment, null, 'jeden atakujący = brak decyzji (CR 510.1d)');
  const fromWall = state.events.filter((entry) => entry.type === 'damage_dealt' && entry.source === 'wall');
  assert.equal(fromWall.length, 1);
  assert.equal(fromWall[0].amount, 6, 'bloker zadaje 6 (moc z początku kroku), nie 1 po pięciu −1/−1');
  assert.equal((state.objects.get('wall')?.counters ?? {})['-1/-1'] ?? 0, 0, 'znaczniki lądują dopiero przy zadaniu');
  assert.ok(!alive(state, 'wall'), 'bloker ginie po kroku (5 × −1/−1 na 6/5 → wytrzymałość 0, CR 704.5f)');
  assert.ok(!alive(state, 'att'), 'atakujący ginie od 6 obrażeń (CR 704.5g)');
});

test('W4/8: double strike — drugi przebieg ogłasza przydziały OD NOWA (CR 510.4)', () => {
  const state = createGameState({ seed: 121, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p1');
  putCreature(state, 'ds', 'p1', 4, 4, ['double_strike']);
  putCreature(state, 'b1', 'p2', 3, 3);
  putCreature(state, 'b2', 'p2', 3, 3);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ds'] }).ok);
  atStep(state, 'declare_blockers', 'p2', 'p1');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { ds: ['b1', 'b2'] } }).ok);
  atStep(state, 'combat_damage', 'p1');
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(state.pendingDamageAssignment, 'decyzja pierwszego przebiegu (dwóch blokerów)');
  assert.equal(state.pendingDamageAssignment.pass, true, 'przebieg first strike');
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { ds: [{ blockerId: 'b1', amount: 4 }, { blockerId: 'b2', amount: 0 }] },
  }).ok, 'gracz kładzie całe 4 na b1');
  assert.ok(!alive(state, 'b1'), 'b1 zginął między przebiegami (SBA, CR 510.4)');
  assert.equal(state.pendingDamageAssignment, null, 'drugi przebieg: jeden żywy bloker = brak decyzji');
  // Drugi przebieg jedzie w tej samej komendzie (po SBA), więc b2 jest już po.
  const toB2 = state.events.filter((entry) => entry.type === 'damage_dealt' && entry.target === 'b2' && entry.amount > 0);
  assert.deepEqual(toB2.map((entry) => entry.amount), [4],
    'b2 dostaje dokładnie raz 4 (drugi przebieg) — przydział 4/0 z pierwszego przebiegu NIE może zostać przeniesiony (CR 510.4)');
  assert.ok(!alive(state, 'b2'), 'b2 ginie od 4 obrażeń w drugim przebiegu');
});
