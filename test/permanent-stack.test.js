import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';

/**
 * T1 — Permanenty na stosie (CR 601/608): rzut stwora/artefaktu/enchantmentu
 * kładzie CZAR na stosie; na bitwisko obiekt wchodzi dopiero po pełnej rundzie
 * passów (rozstrzygnięcie LIFO). Przeciwnik może odpowiedzieć instanitem,
 * kontrczary celują w czary-stwory, ETB/liczniki/bloodthirst rozstrzygają się
 * przy WEJŚCIU, nie przy rzucie. Timing sorcery wymaga pustego stosu.
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function giveMana(state, playerId, amount, colors = ['W', 'U', 'B', 'R', 'G']) {
  addMana(state, playerId, amount, { colors });
}

/** Rozstrzyga stos: pełne rundy passów, aż stos będzie pusty (LIFO). */
function resolveStack(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Przy pustym stosie nic nie robi; zatrzymuje się na decyzji blokującej.
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}



/** Rzuca permanent i rozstrzyga stos (pomocnik dla testów skupionych na ETB). */
function castAndResolve(state, playerId, objectId, extra = {}) {
  const cast = execute(state, { type: 'cast_permanent', playerId, objectId, ...extra });
  assert.ok(cast.ok, cast.events[0]?.reason);
  const events = resolveStack(state);
  return { cast, events };
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, bloodthirst: data.bloodthirst ?? null,
    kicker: data.kicker ?? null, adventure: data.adventure ?? null,
    entersWithCounters: data.entersWithCounters ?? null,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

test('rzut stwora kładzie czar na STOSIE; wejście dopiero po rundzie passów', () => {
  const state = game();
  giveMana(state, 'p1', 2);
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [{ type: 'triggered', trigger: { event: 'enter_battlefield' }, effect: { type: 'gain_life', amount: 3 } }] });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  // Czar na stosie, nie na bitwisku; mana zapłacona; ETB NIE odpalił przy rzucie.
  assert.equal(state.zones.stack.length, 1);
  assert.equal(state.zones.battlefield.length, 0);
  assert.equal(state.objects.get(state.zones.stack[0]).cardId, 'Bear');
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.players[0].life, 20);
  assert.ok(cast.events.some((e) => e.type === 'permanent_cast'));
  assert.ok(!cast.events.some((e) => e.type === 'permanent_entered_battlefield'));
  // Widok stosu pokazuje czar-permanent publicznie.
  const view = playerView(state, 'p2');
  assert.equal(view.zones.stack.length, 1);
  assert.equal(view.zones.stack[0].cardId, 'Bear');
  // Runda passów → wejście na bitwisko + ETB.
  const events = resolveStack(state);
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.zones.battlefield.length, 1);
  assert.equal(state.players[0].life, 23);
  assert.ok(events.some((e) => e.type === 'permanent_entered_battlefield'));
  assert.ok(events.some((e) => e.type === 'spell_resolved' && e.permanent === true));
  assert.ok(events.some((e) => e.type === 'ability_triggered'));
});

test('przeciwnik odpowiada instanitem na rzut stwora; LIFO', () => {
  const state = game();
  giveMana(state, 'p1', 2);
  giveMana(state, 'p2', 1);
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
  addObject(state, { id: 's', instanceId: 'i2', cardId: 'Bolt', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1, spell: { timing: 'instant', targets: [{ type: 'player' }], effects: [{ type: 'damage', amount: 2 }] } });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  // Po rzucie priorytet ma rzucający — pass, dopiero wtedy przeciwnik.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const instant = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 's', targets: ['p1'] });
  assert.ok(instant.ok, instant.events[0]?.reason);
  assert.deepEqual(state.zones.stack.map((id) => state.objects.get(id).cardId), ['Bear', 'Bolt']);
  // Pełne rundy passów: najpierw rozstrzyga się Bolt (LIFO), potem Bear.
  resolveStack(state);
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.players[0].life, 18); // 20 - 2 z Bolta; Bear wszedł bez obrażeń
  assert.equal(state.zones.battlefield.length, 1);
  assert.equal(state.objects.get(state.zones.battlefield[0]).cardId, 'Bear');
});

test('kontrczar (Stoic Rebuttal — counter target spell) kontruje czar-stwora', () => {
  const state = game();
  giveMana(state, 'p1', 2);
  giveMana(state, 'p2', 2);
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [{ type: 'triggered', trigger: { event: 'enter_battlefield' }, effect: { type: 'gain_life', amount: 3 } }] });
  addObject(state, { id: 'counter', instanceId: 'i2', cardId: 'Counter', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 2, spell: { timing: 'instant', targets: [{ type: 'spell_on_stack' }], effects: [{ type: 'counter_spell' }] } });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const countered = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'counter', targets: [state.zones.stack[0]] });
  assert.ok(countered.ok, countered.events[0]?.reason);
  resolveStack(state);
  // Skontrowany czar idzie do grobu — bez wejścia, bez ETB.
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.zones.battlefield.length, 0);
  assert.equal(state.players[0].life, 20);
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id).cardId === 'Bear').length, 1);
  assert.ok(state.events.some((e) => e.type === 'spell_countered'));
});

test('Negate (noncreature) NIE kontruje czaru-stwora, ale kontruje artefakt', () => {
  const state = game();
  giveMana(state, 'p1', 3);
  giveMana(state, 'p2', 2);
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
  addObject(state, { id: 'a', instanceId: 'i2', cardId: 'Relic', controllerId: 'p1', zone: 'hand', kind: 'artifact', manaCost: 1 });
  addObject(state, { id: 'negate', instanceId: 'i3', cardId: 'Negate', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 2, spell: { timing: 'instant', targets: [{ type: 'noncreature_spell_on_stack' }], effects: [{ type: 'counter_spell' }] } });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  // Czar-stwór nie jest legalnym celem Negate — brak oferty i odrzucenie.
  const view = playerView(state, 'p2');
  const negateCasts = view.legalCommands.filter((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'negate');
  assert.equal(negateCasts.length, 0);
  const rejected = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'negate', targets: [state.zones.stack[0]] });
  assert.equal(rejected.ok, false);
  // Artefakt (noncreature) jest legalnym celem Negate.
  resolveStack(state);
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'a' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const okCast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'negate', targets: [state.zones.stack[0]] });
  assert.ok(okCast.ok, okCast.events[0]?.reason);
});

test('timing sorcery: cast_permanent i play_land odrzucane przy niepustym stosie', () => {
  const state = game();
  giveMana(state, 'p1', 3);
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
  addObject(state, { id: 'c2', instanceId: 'i2', cardId: 'Bear2', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 1, toughness: 1, manaCost: 1 });
  addObject(state, { id: 'l', instanceId: 'i3', cardId: 'Plains', controllerId: 'p1', zone: 'hand', kind: 'land' });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  // Przy niepustym stosie: oferty cast_permanent/play_land znikają.
  let view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((cmd) => cmd.type === 'cast_permanent'), false);
  assert.equal(view.legalCommands.some((cmd) => cmd.type === 'play_land'), false);
  // Ręczne komendy odrzucane.
  const r1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c2' });
  assert.equal(r1.ok, false);
  assert.match(r1.events[0].reason, /niepustym stosie/);
  const r2 = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'l' });
  assert.equal(r2.ok, false);
  assert.match(r2.events[0].reason, /niepustym stosie/);
  // Po rozstrzygnięciu — sorcery wracają do oferty.
  resolveStack(state);
  view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((cmd) => cmd.type === 'cast_permanent'), true);
  assert.equal(view.legalCommands.some((cmd) => cmd.type === 'play_land'), true);
});

test('liczniki ETB i bloodthirst rozstrzygają się przy WEJŚCIU, nie przy rzucie', () => {
  const state = game();
  giveMana(state, 'p1', 2);
  giveMana(state, 'p1', 0);
  addRealCard(state, 'servant', 'servant-of-the-scale', 'p1', 'hand'); // {G}, ETB +1/+1
  giveMana(state, 'p1', 2, ['G']);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'servant' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  // Przy rzucie NIE ma licznika (obiekt na stosie).
  assert.ok(!cast.events.some((e) => e.type === 'counter_added'));
  resolveStack(state);
  const servant = [...state.objects.values()].find((o) => o.cardId === 'servant-of-the-scale' && o.zone === 'battlefield');
  assert.ok(servant);
  assert.equal((servant.counters ?? {})['+1/+1'], 1);

  // Bloodthirst (Gorehorn Minotaurs {2}{R}{R}): przeciwnik obrażony w tej turze.
  const state2 = game();
  state2.dealtDamageToOpponentThisTurn = { p1: true };
  giveMana(state2, 'p1', 4, ['R']);
  addRealCard(state2, 'gore', 'gorehorn-minotaurs', 'p1', 'hand');
  const cast2 = execute(state2, { type: 'cast_permanent', playerId: 'p1', objectId: 'gore' });
  assert.ok(cast2.ok, cast2.events[0]?.reason);
  assert.ok(!cast2.events.some((e) => e.type === 'counter_added'));
  resolveStack(state2);
  const gore = [...state2.objects.values()].find((o) => o.cardId === 'gorehorn-minotaurs' && o.zone === 'battlefield');
  assert.equal((gore.counters ?? {})['+1/+1'], 2); // bloodthirst 2
});

test('cast trigger odpala się przy RZUCENIU (kicker Kor Sanctifiers na stosie)', () => {
  const state = game();
  giveMana(state, 'p1', 4, ['W']);
  addRealCard(state, 'kor', 'kor-sanctifiers', 'p1', 'hand'); // {2}{W} + kicker {W} = 4
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kor', kicked: true });
  assert.ok(cast.ok, cast.events[0]?.reason);
  const stacked = state.objects.get(state.zones.stack[0]);
  assert.equal(stacked.wasKicked, true);
  assert.equal(state.zones.battlefield.length, 0);
  resolveStack(state);
  const kor = [...state.objects.values()].find((o) => o.cardId === 'kor-sanctifiers' && o.zone === 'battlefield');
  assert.equal(kor.wasKicked, true);
});

test('morph face-down: na stosie ukryty dla przeciwnika, wchodzi jako 2/2', () => {
  const state = game();
  giveMana(state, 'p1', 3);
  addRealCard(state, 'flock', 'monastery-flock', 'p1', 'hand'); // morph {3}
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock', faceDown: true });
  assert.ok(cast.ok, cast.events[0]?.reason);
  assert.equal(state.objects.get(state.zones.stack[0]).faceDown, true);
  // Przeciwnik nie widzi tożsamości karty na stosie; kontroler widzi.
  const foeView = playerView(state, 'p2');
  assert.equal(foeView.zones.stack[0].cardId, null);
  assert.equal(foeView.zones.stack[0].faceDown, true);
  const ownView = playerView(state, 'p1');
  assert.equal(ownView.zones.stack[0].cardId, 'monastery-flock');
  resolveStack(state);
  const flock = [...state.objects.values()].find((o) => o.cardId === 'monastery-flock' && o.zone === 'battlefield');
  assert.equal(flock.faceDown, true);
  assert.equal(effectivePower(flock, state), 2);
  assert.equal(effectiveToughness(flock, state), 2);
});

test('cast_adventure_creature (Gray Slaad) idzie na stos i wchodzi po rozstrzygnięciu', () => {
  const state = game();
  giveMana(state, 'p1', 3, ['B']);
  addRealCard(state, 'slaad', 'gray-slaad', 'p1', 'exile', { adventureDone: true });
  const cast = execute(state, { type: 'cast_adventure_creature', playerId: 'p1', objectId: 'slaad' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  assert.equal(state.zones.stack.length, 1);
  assert.equal(state.zones.battlefield.length, 0);
  resolveStack(state);
  const slaad = [...state.objects.values()].find((o) => o.cardId === 'gray-slaad' && o.zone === 'battlefield');
  assert.ok(slaad);
  assert.equal(slaad.adventureDone, true);
  assert.equal(slaad.summoningSickness, true);
});

test('po rozstrzygnięciu cast_permanent oferta wraca (regresja bramki stosu)', () => {
  const state = game();
  giveMana(state, 'p1', 3);
  addRealCard(state, 'servant', 'servant-of-the-scale', 'p1', 'hand');
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'servant' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  let view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((cmd) => cmd.type === 'cast_permanent'), false);
  resolveStack(state);
  view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((cmd) => cmd.type === 'cast_permanent'), false); // brak many — nie ma oferty
  addRealCard(state, 'servant2', 'servant-of-the-scale', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['G']);
  view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((cmd) => cmd.type === 'cast_permanent'), true);
});

test('odpowiedź na rzut stwora NIE zależy od fazy (instant w main przeciwnika)', () => {
  const state = game();
  giveMana(state, 'p1', 2);
  giveMana(state, 'p2', 1);
  addObject(state, { id: 'c', instanceId: 'i', cardId: 'Bear', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
  addObject(state, { id: 's', instanceId: 'i2', cardId: 'Bolt', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1, spell: { timing: 'instant', targets: [{ type: 'player' }], effects: [{ type: 'damage', amount: 2 }] } });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  // p2 ma priorytet z instanitem w ofercie — mimo że to faza main p1.
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 's'));
});
