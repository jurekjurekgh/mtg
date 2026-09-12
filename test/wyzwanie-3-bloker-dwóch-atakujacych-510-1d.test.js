// W3 (PLAN_2026-09-11b, wyzwanie 3/5) — bloker dzielący obrażenia między
// atakujących, których blokuje. CR pobrane 2026-09-12 z
// https://mtg.wiki/page/Combat_damage_step (wydanie 2026-09-02), dosłownie:
//   510.1  „First, the active player announces how each attacking creature
//           assigns its combat damage, then the defending player announces how
//           each blocking creature assigns its combat damage."
//   510.1a „Each attacking creature and each blocking creature assigns combat
//           damage equal to its power. Creatures that would assign 0 or less
//           damage this way don't assign combat damage at all."
//   510.1d „A blocking creature assigns combat damage to the creatures it's
//           blocking. If it isn't currently blocking any creatures (if, for
//           example, they were destroyed or removed from combat), it assigns no
//           combat damage. If it's blocking exactly one creature, it assigns all
//           its combat damage to that creature. If it's blocking two or more
//           creatures, it assigns its combat damage divided as its controller
//           chooses among them."
// Bloker NIE ma warunku lethal (to trample ATAKUJĄCEGO, CR 702.19b) i nigdy nie
// przenosi nadwyżki na gracza — więc suma podziału = jego moc (510.1a), a podział
// jest dowolny (jak 510.1c po stronie atakującego).
// Podwójny blok jest legalny dzięki statyce Cenn's Tactician (M166/E,
// blockSlotsFor: „can block an additional creature each combat").
// Stan sprzed W3: przebieg zadawał pełną moc blokera KAŻDEMU atakującemu z osobna
// (7/6 vs dwóch 2/4 → 7 i 7, suma 14 > moc 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { validateBlockerDamageAssignment } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

// jumpToStep ustawia TYLKO priorytet (turn.js:48) — aktywnego gracza trzeba
// dopisać wprost, inaczej declare_attackers odrzuca „Nieaktywny gracz".
function atStep(state, step, priorityId, activeId = priorityId) {
  state.turn = { ...jumpToStep(state.turn, step, priorityId), activePlayerId: activeId };
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
  return state.objects.get(id);
}

/**
 * p2 atakuje DWOMA stworami (gurmag-drowner 2/4); p1 blokuje OBA jednym
 * 7/6 (segmented-krotiq 6/5 + licznik +1/+1). Licznik daje drugi slot bloku
 * (statyka Cenn's Tactician na stole p1) i podnosi moc do 7.
 */
function doubleBlock() {
  const state = createGameState({ seed: 113, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  putCard(state, 'tact', 'cenns-tactician', 'p1');
  const wall = putCard(state, 'wall', 'segmented-krotiq', 'p1');
  state.objects.set('wall', Object.freeze({ ...wall, counters: { '+1/+1': 1 } }));
  putCard(state, 'a1', 'gurmag-drowner', 'p2');
  putCard(state, 'a2', 'gurmag-drowner', 'p2');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] }).ok);
  // CR 508.2/509.4: okno odpowiedzi po deklaracjach, potem bloki.
  atStep(state, 'declare_blockers', 'p1', 'p2');
  const blocks = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['wall'], a2: ['wall'] } });
  assert.ok(blocks.ok, `podwójny blok legalny (statyka): ${blocks.events?.[0]?.reason}`);
  atStep(state, 'combat_damage', 'p2');
  return state;
}

const split = (a, b) => [{ attackerId: 'a1', amount: a }, { attackerId: 'a2', amount: b }];
const alive = (state, id) => state.objects.get(id)?.zone === 'battlefield';

test('W3/1: bloker dwóch atakujących → decyzja przydziału u KONTROLERA BLOKERA (CR 510.1/510.1d)', () => {
  const state = doubleBlock();
  const res = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.ok(res.ok, JSON.stringify(res));
  const pending = state.pendingDamageAssignment;
  assert.ok(pending, 'przydział blokera zakolejkowany jako decyzja');
  assert.equal(pending.playerId, 'p1', 'decyduje obrońca (kontroler blokera), nie atakujący');
  assert.equal(pending.role, 'blocker');
  assert.equal(pending.blockerId, 'wall');
  assert.deepEqual(pending.attackerIds, ['a1', 'a2'], 'atakujący w kolejności deklaracji');
});

test('W3/2: jeden wariant domyślny (lethal-first), suma = moc, obrażenia zadane RAZ (CR 510.1a)', () => {
  const state = doubleBlock();
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  const offered = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_damage_assignment');
  assert.equal(offered.length, 1, 'dokładnie jeden wariant — jak po stronie atakującego (M66/R)');
  const assignments = offered[0].assignments;
  assert.deepEqual(Object.keys(assignments), ['wall'], 'klucz = bloker');
  assert.deepEqual(assignments.wall, split(4, 3), 'lethal-first: 4 na pierwszego (zabija 2/4), reszta na drugiego');
  assert.equal(assignments.wall.reduce((sum, entry) => sum + entry.amount, 0), 7, 'suma = moc blokera');
  assert.ok(execute(state, offered[0]).ok, 'oferta przechodzi walidację (L48)');
  assert.equal(state.pendingDamageAssignment, null);
  assert.ok(!alive(state, 'a1'), 'pierwszy atakujący zginął (4 obrażenia na 2/4)');
  assert.equal(state.objects.get('a2').damage, 3, 'drugi dostał 3 — przed W3 dostawał pełne 7');
  assert.ok(alive(state, 'a2'), 'drugi atakujący PRZEŻYŁ (przed W3: 7 obrażeń = śmierć)');
  assert.equal(state.objects.get('wall').damage, 4, 'bloker dostał 2+2 od atakujących (faza atakujących bez zmian)');
});

test('W3/3: podział wybrany przez gracza (dowolny, bez lethal-first) jest stosowany dosłownie', () => {
  const state = doubleBlock();
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  const res = execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { wall: split(3, 4) } });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(state.objects.get('a1').damage, 3, '3 na pierwszego');
  assert.ok(alive(state, 'a1'), 'pierwszy przeżył');
  assert.ok(!alive(state, 'a2'), 'drugi zginął (4 na 2/4)');
  const permuted = doubleBlock();
  execute(permuted, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  const perm = execute(permuted, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { wall: [{ attackerId: 'a2', amount: 2 }, { attackerId: 'a1', amount: 5 }] },
  });
  assert.ok(perm.ok, `permutacja kolejności legalna (jak CR 510.1c): ${JSON.stringify(perm)}`);
  assert.ok(!alive(permuted, 'a1'), '5 na 2/4 = śmierć pierwszego');
  assert.equal(permuted.objects.get('a2').damage, 2, 'drugi dostał 2');
  assert.ok(alive(permuted, 'a2'), 'drugi przeżył');
});

test('W3/4: walidacja podziału blokera — pełna suma, sufit mocy, żywe cele (CR 510.1a/d)', () => {
  const state = doubleBlock();
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(validateBlockerDamageAssignment(state, 'wall', split(4, 3)), null, '4+3 = moc → legalne');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', split(0, 7)), null, '0+7 → legalne (brak lethal-first)');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', split(7, 0)), null);
  assert.equal(validateBlockerDamageAssignment(state, 'wall', split(3, 3)), 'damage_must_be_fully_assigned', 'suma < mocy');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', split(4, 4)), 'damage_exceeds_power', 'suma > mocy');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', split(-1, 8)), 'illegal_damage_amount');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', split(1.5, 5.5)), 'illegal_damage_amount');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', [{ attackerId: 'wall', amount: 4 }, { attackerId: 'a2', amount: 3 }]), 'illegal_damage_attacker', 'obcy cel');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', [{ attackerId: 'a1', amount: 4 }, { attackerId: 'a1', amount: 3 }]), 'illegal_damage_attacker', 'duplikat celu');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', [split(4, 3)[0]]), 'illegal_damage_assignment', 'za mało wpisów');
  assert.equal(validateBlockerDamageAssignment(state, 'wall', 'nie-tablica'), 'illegal_damage_assignment');
  // Walidacja musi działać PRZEZ execute (L48: oferta == walidacja) — sama
  // funkcja walidująca nie wystarczy: zła ścieżka (np. walidator atakującego,
  // który dla blokera zwraca null) przepuściłaby nielegalny podział.
  const short = execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { wall: split(3, 3) } });
  assert.ok(!short.ok, 'niepełny podział odrzucony przez execute');
  assert.equal(short.events?.[0]?.reason ?? short.reason, 'illegal_damage_assignment:damage_must_be_fully_assigned');
  const over = execute(state, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { wall: split(4, 4) } });
  assert.ok(!over.ok, 'podział ponad moc odrzucony przez execute');
  assert.equal(over.events?.[0]?.reason ?? over.reason, 'illegal_damage_assignment:damage_exceeds_power');
  assert.ok(state.pendingDamageAssignment, 'odrzucone komendy nie kasują decyzji');
  // Decyzja nie tego gracza → odrzut (jak po stronie atakującego). Priorytet
  // przekładamy na p2, żeby trafić w straż ROLI, a nie w straż priorytetu.
  state.turn = { ...state.turn, priorityPlayerId: 'p2' };
  const wrong = execute(state, { type: 'resolve_damage_assignment', playerId: 'p2', assignments: { wall: split(4, 3) } });
  assert.ok(!wrong.ok, 'atakujący nie rozdziela obrażeń blokera');
  assert.equal(wrong.events?.[0]?.reason ?? wrong.reason, 'damage_assignment_not_your_decision');
  assert.ok(state.pendingDamageAssignment, 'odrzucona komenda nie kasuje decyzji');
});

test('W3/5: bloker jednego atakującego → bez decyzji, pełna moc (CR 510.1d zdanie 3)', () => {
  const state = createGameState({ seed: 114, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  putCard(state, 'wall', 'segmented-krotiq', 'p1');
  putCard(state, 'a1', 'gurmag-drowner', 'p2');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['wall'] } }).ok);
  atStep(state, 'combat_damage', 'p2');
  const res = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(state.pendingDamageAssignment, null, 'jeden atakujący = brak decyzji');
  assert.ok(!alive(state, 'a1'), 'pełne 6 na 2/4');
  assert.equal(state.objects.get('wall').damage, 2);
});

test('W3/6: dwie decyzje w jednym przebiegu — najpierw atakujący, potem bloker (CR 510.1)', () => {
  const state = createGameState({ seed: 115, players: [{ id: 'p1' }, { id: 'p2' }] });
  atStep(state, 'declare_attackers', 'p2');
  putCard(state, 'tact', 'cenns-tactician', 'p1');
  const wall = putCard(state, 'wall', 'segmented-krotiq', 'p1');
  state.objects.set('wall', Object.freeze({ ...wall, counters: { '+1/+1': 1 } }));
  putCard(state, 'help', 'gurmag-drowner', 'p1'); // drugi bloker a1 → decyzja atakującego (p2)
  putCard(state, 'a1', 'segmented-krotiq', 'p2'); // 6/5 zablokowany przez dwa stwory
  putCard(state, 'a2', 'gurmag-drowner', 'p2'); // 2/4 zablokowany tylko przez wall
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a1', 'a2'] }).ok);
  atStep(state, 'declare_blockers', 'p1', 'p2');
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['wall', 'help'], a2: ['wall'] },
  }).ok);
  atStep(state, 'combat_damage', 'p2');
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.ok(state.pendingDamageAssignment, 'pierwsza decyzja (atakujący p2)');
  assert.notEqual(state.pendingDamageAssignment.role, 'blocker', 'faza atakujących pierwsza (CR 510.1)');
  assert.equal(state.pendingDamageAssignment.playerId, 'p2');
  const first = playerView(state, 'p2').legalCommands.find((c) => c.type === 'resolve_damage_assignment');
  assert.ok(execute(state, first).ok, 'atakujący rozdzielił 6 między dwóch blokerów');
  assert.ok(state.pendingDamageAssignment, 'druga decyzja — podział blokera');
  assert.equal(state.pendingDamageAssignment.role, 'blocker');
  assert.equal(state.pendingDamageAssignment.playerId, 'p1', 'teraz decyduje obrońca');
  const second = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_damage_assignment');
  assert.ok(execute(state, second).ok, `obrońca rozdzielił moc blokera: ${JSON.stringify(second)}`);
  assert.equal(state.pendingDamageAssignment, null);
  const total = (state.objects.get('a1')?.damage ?? 0) + (state.objects.get('a2')?.damage ?? 0);
  assert.ok(total <= 7, `suma obrażeń blokera = jego moc (było ${total})`);
});

test('W3/7: widok decyzji niesie dane blokera i jego cele (wizard w UI, ADR 0017)', () => {
  const state = doubleBlock();
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  const view = playerView(state, 'p1');
  const pending = view.pendingDamageAssignment;
  assert.ok(pending, 'PlayerView.pendingDamageAssignment dla decydującego');
  assert.equal(pending.role, 'blocker');
  assert.equal(pending.entries.length, 1);
  const entry = pending.entries[0];
  assert.equal(entry.blockerId, 'wall');
  assert.equal(entry.power, 7);
  assert.equal(entry.cardId, 'segmented-krotiq');
  assert.deepEqual(entry.attackers.map((target) => target.id), ['a1', 'a2']);
  assert.deepEqual(entry.attackers.map((target) => target.lethal), [4, 4], 'lethal celu dla wizarda');
  // Widok jest rzutowany dla obu graczy (jak przy podziale atakującego) — o tym,
  // kto decyduje, mówi playerId widoku i oferta komend (L48).
  assert.equal(playerView(state, 'p2').pendingDamageAssignment.playerId, 'p1', 'widok wskazuje decydującego');
  assert.equal(playerView(state, 'p2').legalCommands.filter((c) => c.type === 'resolve_damage_assignment').length, 0,
    'atakujący nie ma komendy podziału blokera');
  assert.equal(playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_damage_assignment').length, 1);
});
