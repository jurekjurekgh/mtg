// W5 (PLAN_2026-09-11b, wyzwanie 5/5) — trample: lethal blokera liczy się razem
// z obrażeniami, które przydzielają mu w TYM SAMYM kroku inne stwory.
// CR pobrane 2026-09-12 (tappedout.net/mtg-questions/deathtouch-and-trample/,
// reddit.com/r/askajudge — cytaty dosłowne):
//   702.19b „The controller of an attacking creature with trample first assigns
//     damage to the creature(s) blocking it. Once all those blocking creatures are
//     assigned lethal damage, any excess damage is assigned as its controller
//     chooses among those blocking creatures and the player, planeswalker, or
//     battle the creature is attacking. **When checking for assigned lethal damage,
//     take into account damage already marked on the creature and damage from other
//     creatures that's being assigned during the same combat damage step**, but not
//     any abilities or effects that might change the amount of damage that's
//     actually dealt."
//   702.2b  „Any nonzero amount of combat damage assigned to a creature by a source
//     with deathtouch is considered to be lethal damage, regardless of that
//     creature's toughness." (z tym samym zdaniem o obrażeniach z tego samego kroku)
//   510.1e  „Once a player has assigned combat damage from each attacking or
//     blocking creature they control, the **total** damage assignment ... is checked
//     to see if it complies with the above rules."
// Pomiar sprzed W5 (tools/probe-w5-trample-lethal-w-kroku.mjs): przydział 0 na
// blokera + całość na gracza był odrzucany jako `trample_blocker_below_lethal`,
// choć bloker miał lethal przydzielony przez drugiego atakującego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { validateDamageAssignment } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function atStep(state, step, priorityId, activeId = priorityId) {
  state.turn = { ...jumpToStep(state.turn, step, priorityId), activePlayerId: activeId };
  return state;
}

function creature(state, id, controllerId, power, toughness, { keywords = [], counters = {} } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], colors: [], abilities: [], subtypes: [], keywords,
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false, counters }));
  return state.objects.get(id);
}

function tactician(state, controllerId = 'p1') {
  const def = REGISTRY.get('cenns-tactician');
  addObject(state, {
    id: 'tact', instanceId: 'i-tact', cardId: 'cenns-tactician', controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  const object = state.objects.get('tact');
  state.objects.set('tact', Object.freeze({ ...object, summoningSickness: false }));
}

/**
 * p2 atakuje `x` (trample 5/5) i `y`; p1 blokuje OBA jednym `w` (2/2 z licznikiem
 * +1/+1 = 3/3; drugi slot bloku ze statyki Cenn's Tactician).
 */
function combat({ yKeywords = [], yPower = 3, yToughness = 3, wToughness = 2, twoAttackers = true } = {}) {
  const state = createGameState({ seed: 122, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  tactician(state, 'p1');
  creature(state, 'w', 'p1', 2, wToughness, { counters: { '+1/+1': 1 } });
  creature(state, 'x', 'p2', 5, 5, { keywords: ['trample'] });
  const attackerIds = ['x'];
  if (twoAttackers) {
    creature(state, 'y', 'p2', yPower, yToughness, { keywords: yKeywords });
    attackerIds.push('y');
  }
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  const assignments = twoAttackers ? { x: ['w'], y: ['w'] } : { x: ['w'] };
  const blocks = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments });
  assert.ok(blocks.ok, `podwójny blok legalny (statyka): ${blocks.events?.[0]?.reason}`);
  atStep(state, 'combat_damage', 'p2');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  assert.ok(state.pendingDamageAssignment, 'decyzja trample zakolejkowana');
  return state;
}

const life = (state, id) => state.players.find((player) => player.id === id).life;
const alive = (state, id) => state.objects.get(id)?.zone === 'battlefield';

test('W5/1: bloker ma lethal od drugiego atakującego → trample może dać 0 blokerowi i całość graczowi', () => {
  const state = combat();
  const res = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 0 }] },
  });
  assert.ok(res.ok, `przydział legalny wg CR 702.19b: ${JSON.stringify(res)}`);
  // Po decyzji atakującego przebieg zbiera jeszcze decyzję BLOKERA (w blokuje
  // dwóch — CR 510.1: najpierw wszystkie przydziały, potem zadanie obrażeń).
  assert.equal(state.pendingDamageAssignment.role, 'blocker');
  const second = execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} });
  assert.ok(second.ok);
  assert.equal(life(state, 'p1'), 15, 'całe 5 obrażeń x trafiło obrońcę');
  const toW = (second.events ?? []).filter((e) => e.type === 'damage_dealt' && e.target === 'w')
    .reduce((total, e) => total + e.amount, 0);
  assert.equal(toW, 3, 'w dostał tylko 3 od y (x przydzielił 0) — lethal, ginie');
  assert.ok(!alive(state, 'w'), 'w zginął od obrażeń y');
  assert.equal(state.objects.get('x').damage, 3, 'w zadał 3 w x (moc z początku kroku)');
  assert.ok(alive(state, 'x'), 'x przeżył (5/5 z 3 obrażeniami)');
});

test('W5/2: bez drugiego atakującego ten sam przydział jest NADAL nielegalny (CR 702.19b)', () => {
  const state = combat({ twoAttackers: false });
  const zero = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 0 }] },
  });
  assert.ok(!zero.ok, '0 na jedynego blokera + całość na gracza = nielegalne');
  assert.equal(zero.events?.[0]?.reason ?? zero.reason, 'illegal_damage_assignment:trample_blocker_below_lethal');
  assert.equal(life(state, 'p1'), 20, 'odrzucona komenda nic nie zadała');
  assert.ok(state.pendingDamageAssignment, 'decyzja nadal wisi');
  const ok = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 3 }] },
  });
  assert.ok(ok.ok, '3 (lethal) na blokera + 2 na gracza — legalne');
  assert.equal(life(state, 'p1'), 18);
});

test('W5/3: lethal pokrywa też niezerowy przydział od źródła z deathtouch (CR 702.2b)', () => {
  const state = combat({ yKeywords: ['deathtouch'], yPower: 1, yToughness: 1 });
  const res = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 0 }] },
  });
  assert.ok(res.ok, `1 obrażenie z deathtouch = lethal (CR 702.2b): ${JSON.stringify(res)}`);
  assert.ok(execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} }).ok,
    'druga decyzja przebiegu (bloker) domknięta');
  assert.equal(life(state, 'p1'), 15, 'całe 5 x na obrońcę');
  assert.ok(!alive(state, 'w'), 'w ginie od 1 obrażenia źródła z deathtouch (CR 702.4)');
  assert.equal(state.objects.get('y').damage, 0, 'y (1/1 deathtouch) nie dostał nic — bloker wybrał x');
});

test('W5/4: drugi przebieg (first strike) to OSOBNY krok — przydziały z pierwszego nie liczą się (CR 510.4)', () => {
  // y (3/1 first strike) przydziela w pierwszym przebiegu 3 na w (3/6); x (trample
  // 5/5, bez first strike) przydziela w DRUGIM, gdzie y już nie przydziela — więc
  // pokrycie lethal musi dojść z x (oznaczone obrażenia liczą się, CR 702.19b).
  const state = combat({ yKeywords: ['first_strike'], yPower: 3, yToughness: 1, wToughness: 6 });
  // W pierwszym przebiegu nikt nie potrzebuje decyzji (y ma jednego blokera,
  // x nie należy do przebiegu) → obrażenia zadane od razu.
  assert.equal(state.pendingDamageAssignment.pass, false, 'decyzja czeka w DRUGIM przebiegu');
  assert.equal(state.pendingDamageAssignment.role, 'attacker');
  assert.equal(state.objects.get('w').damage, 3, 'y zadał 3 w pierwszym przebiegu');
  const entry = playerView(state, 'p2').pendingDamageAssignment.entries[0];
  assert.equal(entry.blockers[0].lethal, 4, 'lethal = (6+1 z licznika) − 3 oznaczone (CR 702.19b)');
  assert.equal(entry.blockers[0].assignedByOthers, 0, 'y nie przydziela w drugim przebiegu (CR 510.4)');
  assert.equal(entry.blockers[0].lethalByOthers, false);
  const zero = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 0 }] },
  });
  assert.ok(!zero.ok, '0 na blokera w drugim przebiegu = nielegalne');
  assert.equal(zero.events?.[0]?.reason ?? zero.reason, 'illegal_damage_assignment:trample_blocker_below_lethal');
  const ok = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 4 }] },
  });
  assert.ok(ok.ok, '4 (lethal po oznaczonych obrażeniach) + 1 na gracza — legalne');
});

test('W5/5: widok niesie assignedByOthers/lethalByOthers dla bramki trample w wizardzie', () => {
  const state = combat();
  const entry = playerView(state, 'p2').pendingDamageAssignment.entries[0];
  assert.equal(entry.attackerId, 'x');
  assert.equal(entry.blockers.length, 1);
  assert.equal(entry.blockers[0].lethal, 3);
  assert.equal(entry.blockers[0].assignedByOthers, 3, 'y przydziela w całe 3 w tym samym kroku');
  assert.equal(entry.blockers[0].lethalByOthers, true, 'lethal pokryty przez innego atakującego');
  const deathtouch = combat({ yKeywords: ['deathtouch'], yPower: 1, yToughness: 1 });
  const dtEntry = playerView(deathtouch, 'p2').pendingDamageAssignment.entries[0];
  assert.equal(dtEntry.blockers[0].assignedByOthers, 1);
  assert.equal(dtEntry.blockers[0].lethalByOthers, true, 'CR 702.2b: niezerowe obrażenia z deathtouch = lethal');
});

test('W5/6: walidator z kontekstem całego przydziału (CR 510.1e) i bez kontekstu (wstecznie)', () => {
  const state = combat();
  const assignment = [{ blockerId: 'w', amount: 0 }];
  assert.equal(validateDamageAssignment(state, 'x', assignment), 'trample_blocker_below_lethal',
    'bez kontekstu walidator nie wie o przydziale y (wołania jednostkowe jak dawniej)');
  assert.equal(validateDamageAssignment(state, 'x', assignment, { assignments: {}, pass: false }), null,
    'z kontekstem: y przydziela w lethal domyślnie (jeden bloker = pełna moc, CR 510.1c)');
  const single = combat({ twoAttackers: false });
  assert.equal(validateDamageAssignment(single, 'x', assignment, { assignments: {}, pass: false }),
    'trample_blocker_below_lethal', 'bez drugiego atakującego nadal nielegalne');
});

test('W5/7: komenda bez wpisu dla źródła decyzji = akceptacja defaultu, nie ponowne pytanie', () => {
  const state = combat();
  assert.ok(execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 0 }] },
  }).ok);
  assert.equal(state.pendingDamageAssignment.role, 'blocker');
  const second = execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} });
  assert.ok(second.ok, 'pusta mapa jest legalną komendą protokołu');
  assert.equal(state.pendingDamageAssignment, null, 'przebieg domknięty — żadnego ponownego pytania');
  const dealt = (second.events ?? []).filter((e) => e.type === 'damage_dealt');
  assert.ok(dealt.length >= 4, `obrażenia zadane: ${dealt.length}`);
  assert.equal(life(state, 'p1'), 15, 'default blokera nie zmienia przydziału x (0 na w, 5 na gracza)');
  assert.equal(state.objects.get('x').damage, 3, 'default blokera = lethal-first: 3 w x');
});

test('W5/8: pokrycie CZĘŚCIOWE — trample musi dopłacić różnicę do lethal (CR 702.19b)', () => {
  // y (1/1) przydziela w całe 1 na w (3/3, lethal 3) — brakuje 2, więc x musi
  // dołożyć co najmniej 2; dopiero wtedy nadmiar może iść na gracza.
  const state = combat({ yPower: 1, yToughness: 1 });
  const entry = playerView(state, 'p2').pendingDamageAssignment.entries[0];
  assert.equal(entry.blockers[0].assignedByOthers, 1, 'y przydziela 1 w tym samym kroku');
  assert.equal(entry.blockers[0].lethalByOthers, false, '1 < lethal 3 — nie pokryte');
  const short = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 1 }] },
  });
  assert.ok(!short.ok, '1 + 1 = 2 < lethal 3 → nielegalne');
  assert.equal(short.events?.[0]?.reason ?? short.reason, 'illegal_damage_assignment:trample_blocker_below_lethal');
  const exact = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p2', assignments: { x: [{ blockerId: 'w', amount: 2 }] },
  });
  assert.ok(exact.ok, '2 + 1 = 3 = lethal → legalne (suma z całego kroku, CR 510.1e)');
  assert.ok(execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} }).ok);
  assert.equal(life(state, 'p1'), 17, 'nadmiar 3 (5 − 2) trafił obrońcę');
});
