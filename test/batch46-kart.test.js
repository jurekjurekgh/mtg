// M191 — Batch 46 (lista właściciela 2026-08-22).
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';
import { isProtectedFromSource } from '../src/engine/attachments.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function resolveStack(state, max = 16) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

// ---- Transza 1: mechaniki w pełni istniejące -----------------------------

test('B46/1: Infectious Horror — atak odbiera przeciwnikowi 2 życia', () => {
  const state = game('p1');
  putCard(state, 'horror', 'infectious-horror', 'p1', 'battlefield', {});
  state.objects.set('horror', Object.freeze({ ...state.objects.get('horror'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  const myLifeBefore = state.players.find((p) => p.id === 'p1').life;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['horror'] }).ok);
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 2,
    'każdy przeciwnik traci 2 życia');
  assert.equal(state.players.find((p) => p.id === 'p1').life, myLifeBefore,
    'kontroler nie traci życia (scope: each_opponent)');
});

test('B46/2: Roiling Regrowth — poświęcenie lądu jest OBOWIĄZKOWE', () => {
  const state = game('p1');
  putCard(state, 'spell', 'roiling-regrowth', 'p1', 'hand');
  putCard(state, 'forest', 'basic-forest', 'p1');
  putCard(state, 'l1', 'basic-forest', 'p1');
  putCard(state, 'l2', 'basic-forest', 'p1');
  for (let i = 0; i < 3; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(state.pendingSpringbloom, 'decyzja: który ląd poświęcić');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_springbloom');
  assert.ok(offers.length > 0, 'są oferty poświęcenia');
  assert.ok(!offers.some((c) => c.skip),
    'brak opcji „nie poświęcaj" — Oracle mówi „Sacrifice a land.", nie „you may"');
  const sac = offers.find((c) => c.sacrificeLandId === 'l1');
  assert.ok(sac, 'można wskazać konkretny ląd');
  assert.ok(execute(state, sac).ok);
  // Poświęcony obiekt dostaje NOWE id w grobie (moveObjectDirectly) — liczymy
  // lądy na polu bitwy zamiast pytać o stare id.
  const landsLeft = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o?.kind === 'land' || (o?.types ?? []).includes('Land'));
  assert.equal(landsLeft.length, 2, 'jeden z trzech lądów został poświęcony');
});

test('B46/2b: Springbloom Druid NADAL pozwala odmówić („you may") — kontrola', () => {
  const state = game('p1');
  putCard(state, 'druid', 'springbloom-druid', 'p1', 'hand');
  putCard(state, 'l1', 'basic-forest', 'p1');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'druid');
  assert.ok(cast, 'oferta rzutu druida');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(state.pendingSpringbloom, 'decyzja druida');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_springbloom');
  assert.ok(offers.some((c) => c.skip),
    'opcjonalne poświęcenie zachowuje rezygnację (anty-over-fix)');
});

test('B46/2c: Roiling Regrowth znajduje DO DWÓCH podstawowych lądów tapniętych', () => {
  const state = game('p1');
  putCard(state, 'spell', 'roiling-regrowth', 'p1', 'hand');
  putCard(state, 'l1', 'basic-forest', 'p1');
  for (let i = 0; i < 3; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const sac = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_springbloom' && c.sacrificeLandId === 'l1');
  assert.ok(execute(state, sac).ok);
  // Dwie decyzje szukania (po jednej karcie), obie z możliwością rezygnacji.
  for (let i = 0; i < 2; i += 1) {
    const pick = playerView(state, 'p1').legalCommands
      .find((c) => c.type === 'resolve_search_choice' && c.found != null);
    if (!pick) break;
    assert.ok(execute(state, pick).ok);
  }
  const onBattlefield = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o?.cardId === 'basic-island');
  assert.equal(onBattlefield.length, 2, 'dwa podstawowe lądy weszły na pole bitwy');
  assert.ok(onBattlefield.every((o) => o.tapped), 'oba wchodzą TAPNIĘTE');
});

// ---- Transza 2: proste nowe mechaniki ------------------------------------

test('B46/3: Bring Low — 3 obrażenia, ale 5 gdy cel ma licznik +1/+1', () => {
  const state = game('p1');
  putCard(state, 'spell', 'bring-low', 'p1', 'hand');
  putCard(state, 'plain', 'giant-spider', 'p2');          // 2/4 bez liczników
  addMana(state, 'p1', 4, { colors: ['R', 'R', 'R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && (c.targets ?? []).includes('plain'));
  assert.ok(cast, 'oferta rzutu w stwora');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(state.objects.get('plain')?.damage, 3, 'bez licznika: 3 obrażenia');
});

test('B46/3b: Bring Low — cel z licznikiem +1/+1 dostaje 5', () => {
  const state = game('p1');
  putCard(state, 'spell', 'bring-low', 'p1', 'hand');
  putCard(state, 'buffed', 'giant-spider', 'p2');
  // L21: addObject IGNORUJE pole `counters` — liczniki wyłącznie addCounter.
  addCounter(state, 'buffed', '+1/+1', 1);
  addMana(state, 'p1', 4, { colors: ['R', 'R', 'R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && (c.targets ?? []).includes('buffed'));
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  // 2/4 + licznik = 3/5, 5 obrażeń zabija (SBA).
  const target = state.objects.get('buffed');
  assert.ok(!target || target.zone === 'graveyard', 'stwór 3/5 ginie od 5 obrażeń');
});

test('B46/4: Cathartic Reunion — odrzucenie 2 kart to KOSZT, potem dobierasz 3', () => {
  const state = game('p1');
  putCard(state, 'spell', 'cathartic-reunion', 'p1', 'hand');
  putCard(state, 'h1', 'giant-spider', 'p1', 'hand');
  putCard(state, 'h2', 'highland-game', 'p1', 'hand');
  for (let i = 0; i < 5; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu (są dwie karty do odrzucenia)');
  assert.ok(execute(state, cast).ok);
  // Wybór odrzucanych kart należy do gracza (CR 601.2h).
  for (let i = 0; i < 4 && state.pendingDiscardChoice; i += 1) {
    const pick = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_discard_choice');
    if (!pick) break;
    assert.ok(execute(state, pick).ok);
  }
  const graveCount = state.zones.graveyard
    .map((id) => state.objects.get(id))
    .filter((o) => o?.controllerId === 'p1' && o.cardId !== 'cathartic-reunion').length;
  assert.equal(graveCount, 2, 'dwie karty odrzucone jako koszt');
  resolveStack(state);
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length, 3,
    'po zapłacie kosztu i rozstrzygnięciu gracz ma 3 dobrane karty');
});

test('B46/4b: bez dwóch kart w ręce Cathartic Reunion NIE jest oferowany', () => {
  const state = game('p1');
  putCard(state, 'spell', 'cathartic-reunion', 'p1', 'hand');
  putCard(state, 'h1', 'giant-spider', 'p1', 'hand');   // tylko JEDNA inna karta
  addMana(state, 'p1', 2, { colors: ['R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(!cast, 'kosztu nie da się zapłacić — czar nierzucalny (CR 601.2h)');
});

test('B46/5: Guildscorn Ward — ochrona przed WIELOKOLOROWYMI', () => {
  const state = game('p1');
  putCard(state, 'host', 'highland-game', 'p1');
  putCard(state, 'ward', 'guildscorn-ward', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => (c.type === 'cast_aura' || c.type === 'cast_permanent') && c.objectId === 'ward');
  assert.ok(cast, 'oferta rzutu aury');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const host = state.objects.get('host');
  const mono = { id: 'src-mono', colors: ['R'], kind: 'creature', types: ['Creature'] };
  const multi = { id: 'src-multi', colors: ['R', 'W'], kind: 'creature', types: ['Creature'] };
  assert.equal(isProtectedFromSource(state, host, multi), true, 'chroniony przed wielokolorowym źródłem');
  assert.equal(isProtectedFromSource(state, host, mono), false, 'jednokolorowe źródło przechodzi');
});

test('B46/5b: odpięcie aury natychmiast znosi ochronę (kontrola)', () => {
  const state = game('p1');
  putCard(state, 'host', 'highland-game', 'p1');
  putCard(state, 'ward', 'guildscorn-ward', 'p1');
  // L21: `attachedTo` w addObject jest ignorowane — załączenie ustawiamy
  // wprost na obiekcie (deskryptor `aura` przychodzi już z gameObjectDataOf).
  state.objects.set('ward', Object.freeze({ ...state.objects.get('ward'), attachedTo: 'host' }));
  const multi = { id: 'src-multi', colors: ['R', 'W'], kind: 'creature', types: ['Creature'] };
  assert.equal(isProtectedFromSource(state, state.objects.get('host'), multi), true, 'z aurą: ochrona');
  state.objects.set('ward', Object.freeze({ ...state.objects.get('ward'), attachedTo: null }));
  assert.equal(isProtectedFromSource(state, state.objects.get('host'), multi), false,
    'ochrona liczona przy odczycie — bez aury znika');
});

// ---- Transza 3: keywordy (fabricate, echo) -------------------------------

test('B46/6: Glint-Sleeve Artisan — fabricate 1: licznik ALBO token Servo', () => {
  const state = game('p1');
  putCard(state, 'art', 'glint-sleeve-artisan', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W', 'W', 'W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_fabricate');
  assert.equal(offers.length, 2, 'dokładnie dwa warianty: licznik albo token');
  assert.ok(offers.some((c) => c.mode === 'counters'), 'wariant „+1/+1"');
  assert.ok(offers.some((c) => c.mode === 'tokens'), 'wariant „token Servo"');
});

test('B46/6b: fabricate — wariant liczników daje +1/+1 na stworze', () => {
  const state = game('p1');
  putCard(state, 'art', 'glint-sleeve-artisan', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W', 'W', 'W'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art'));
  resolveStack(state);
  const counters = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_fabricate' && c.mode === 'counters');
  assert.ok(execute(state, counters).ok);
  const artisan = [...state.objects.values()]
    .find((o) => o.cardId === 'glint-sleeve-artisan' && o.zone === 'battlefield');
  assert.equal(artisan.counters?.['+1/+1'], 1, 'jeden licznik +1/+1');
  assert.equal(effectivePower(artisan, state), 3, '2/2 + licznik = 3/3');
});

test('B46/6c: fabricate — wariant tokenów tworzy 1/1 Servo (artefaktowy stwór)', () => {
  const state = game('p1');
  putCard(state, 'art', 'glint-sleeve-artisan', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W', 'W', 'W'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art'));
  resolveStack(state);
  const tokens = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_fabricate' && c.mode === 'tokens');
  assert.ok(execute(state, tokens).ok);
  const servo = [...state.objects.values()].find((o) => o.cardId === 'token_servo');
  assert.ok(servo, 'token Servo powstał');
  assert.equal(servo.power, 1);
  assert.equal(servo.toughness, 1);
  assert.ok((servo.types ?? []).includes('Artifact'), 'artefaktowy stwór');
  const artisan = [...state.objects.values()]
    .find((o) => o.cardId === 'glint-sleeve-artisan' && o.zone === 'battlefield');
  assert.ok(!artisan.counters?.['+1/+1'], 'bez licznika przy wariancie tokenu');
});

test('B46/7: Bone Shredder — ETB niszczy stwora nieartefaktowego i nieczarnego', () => {
  const state = game('p1');
  putCard(state, 'shredder', 'bone-shredder', 'p1', 'hand');
  putCard(state, 'green', 'highland-game', 'p2');       // zielony 2/1 — legalny cel
  addMana(state, 'p1', 3, { colors: ['B', 'B', 'B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'shredder');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const pick = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'green');
  if (pick) assert.ok(execute(state, pick).ok);
  resolveStack(state);
  const target = state.objects.get('green');
  assert.ok(!target || target.zone === 'graveyard', 'zielony stwór zniszczony');
});

test('B46/7b: Bone Shredder — CZARNY stwór nie jest legalnym celem (L48)', () => {
  const state = game('p1');
  putCard(state, 'shredder', 'bone-shredder', 'p1', 'hand');
  putCard(state, 'black', 'dread-warlock', 'p2');       // czarny
  addMana(state, 'p1', 3, { colors: ['B', 'B', 'B'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'shredder'));
  resolveStack(state);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(!offers.some((c) => c.targetId === 'black'),
    'czarny stwór poza ofertą („nonblack" — CR 702.16 nie dotyczy, to filtr celu)');
});

test('B46/7c: Bone Shredder — echo: w swoim upkeepie płacisz albo poświęcasz', () => {
  const state = game('p1');
  putCard(state, 'shredder', 'bone-shredder', 'p1');
  // Bez źródeł many silnik POŚWIĘCA od razu (nie ma czym zapłacić) — dajemy
  // lądy, żeby sprawdzić samą DECYZJĘ „zapłać albo poświęć".
  for (let i = 0; i < 4; i += 1) putCard(state, `sw${i}`, 'basic-swamp', 'p1');
  // Stwór wszedł w tej turze — echo odpala się w jego pierwszym upkeepie.
  state.objects.set('shredder', Object.freeze({
    ...state.objects.get('shredder'), enteredOnTurn: state.turn.number, echoUnpaid: true,
  }));
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const events = [{ type: 'step_advanced', step: 'upkeep', playerId: 'p1' }];
  processTriggers(state, events);
  resolveStack(state);
  assert.ok(state.pendingPayOrSacrifice,
    'echo pyta: zapłać {2}{B} albo poświęć (CR 702.29)');
  assert.equal(state.pendingPayOrSacrifice.amount, 3, 'koszt echa = {2}{B} (3 many)');
});

test('B46/7d: echo — bez many stwór jest POŚWIĘCANY (CR 702.29)', () => {
  const state = game('p1');
  putCard(state, 'shredder', 'bone-shredder', 'p1');   // brak źródeł many
  state.objects.set('shredder', Object.freeze({
    ...state.objects.get('shredder'), enteredOnTurn: state.turn.number, echoUnpaid: true,
  }));
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', playerId: 'p1' }]);
  const shredder = state.objects.get('shredder');
  assert.ok(!shredder || shredder.zone !== 'battlefield', 'nieopłacone echo = poświęcenie');
});

test('B46/7e: echo płaci się RAZ — w kolejnym upkeepie nie pyta ponownie', () => {
  const state = game('p1');
  putCard(state, 'shredder', 'bone-shredder', 'p1');
  for (let i = 0; i < 4; i += 1) putCard(state, `sw${i}`, 'basic-swamp', 'p1');
  state.objects.set('shredder', Object.freeze({
    ...state.objects.get('shredder'), enteredOnTurn: state.turn.number, echoUnpaid: true,
  }));
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', playerId: 'p1' }]);
  assert.ok(state.pendingPayOrSacrifice, 'pierwszy upkeep: decyzja');
  const pay = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_pay_or_sacrifice' && c.pay === true);
  assert.ok(pay, 'oferta zapłaty');
  assert.ok(execute(state, pay).ok);
  // Kolejny upkeep — echo już opłacone, brak nowej decyzji.
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', playerId: 'p1' }]);
  assert.ok(!state.pendingPayOrSacrifice, 'echo płaci się dokładnie raz');
  assert.equal(state.objects.get('shredder').zone, 'battlefield', 'stwór zostaje');
});
