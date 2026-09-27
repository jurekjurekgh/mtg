// Batch 60 (2026-09-27) — karty właściciela: 144 EMN, 145 SOM, 147 CMR,
// 148 EOE, 149 M20, 151 DTK, 152 DMU, 154 SOM, 155 WAR, 156 RNA — razem 10 kart.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-27,
// ADR 0010 §2a, ADR 0028 — rulingi „przy kartce", także puste listy).
// Katalog: `src/cards/card-data.js`; ŻADNA z 10 nie występuje w
// `tools/collection-art-ids.csv` → wszystkie BEZ artId (świadomy brak).
// Plan batcha: `docs/plans/PLAN_2026-09-27-batch60-kolekcja-144-156.md`.
//
// Podział na sekcje = etapy batcha (G1.1 … G1.10). Każda sekcja ma scenariusz
// legalny, nielegalny i interakcje z istniejącym katalogiem (ADR 0010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness, clearStatModifiers } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 60, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);

// ---- G1.1: Blossoming Sands (149 M20, plan Amonkhet) ------------------------

test('B60/G1.1: Blossoming Sands — dane Oracle, gainland G/W i druk M20', () => {
  const def = registry.get('blossoming-sands');
  assert.deepEqual(def.types, ['Land']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.entersTapped, true);
  assert.equal(def.set, 'M20');
  assert.equal(def.plan, 'Amonkhet');
  assert.equal(def.artId, 149);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('31514c67'), 'imageUri z druku M20 (m20/243)');
  assert.equal(MANA_COSTS['blossoming-sands'], '');
});

test('B60/G1.1: Blossoming Sands — land drop wchodzi tapnięty i daje +1 życia', () => {
  const state = game();
  put(state, 'sands', 'blossoming-sands', 'p1', 'hand');
  assert.equal(player(state, 'p1').life, 20, 'startowe 20 życia');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'sands'));
  const land = find(state, 'blossoming-sands');
  assert.ok(land, 'land jest na polu bitwy');
  assert.equal(land.tapped, true, 'wchodzi tapnięty (Oracle l.1)');
  resolve(state);
  assert.equal(player(state, 'p1').life, 21, 'trigger ETB dał +1 życia');
});

test('B60/G1.1: Blossoming Sands — {T}: Add {G} or {W} po odkręceniu', () => {
  const state = game();
  put(state, 'sands', 'blossoming-sands', 'p1', 'hand');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'sands'));
  resolve(state);
  const land = find(state, 'blossoming-sands');
  assert.ok(land, 'land na stole po play_land (obiekt wymieniony na land-N)');
  state.objects.set(land.id, Object.freeze({ ...land, tapped: false }));
  const r = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: land.id });
  assert.ok(r.ok, `tap_for_mana przechodzi: ${JSON.stringify(r.events)}`);
  assert.equal(state.objects.get(land.id).tapped, true, 'land jest tapnięty po {T}');
  assert.ok(r.events.some((e) => e.type === 'mana_produced' && e.source === land.id),
    'zdarzenie mana_produced ze źródłem Sands');
});

test('B60/G1.1: Blossoming Sands — drugi land drop w turze nie istnieje', () => {
  const state = game();
  put(state, 'sands', 'blossoming-sands', 'p1', 'hand');
  put(state, 'sands2', 'blossoming-sands', 'p1', 'hand');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'sands'));
  assert.ok(!commands(state).some((c) => c.type === 'play_land' && c.objectId === 'sands2'),
    'drugi land drop w tej samej turze nie jest oferowany');
});

// ---- G1.2: Demolish (155 WAR, plan Ravnica) --------------------------------

test('B60/G1.2: Demolish — dane Oracle, sorcery {3}{R} i druk WAR', () => {
  const def = registry.get('demolish');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 4);
  assert.equal(def.set, 'WAR');
  assert.equal(def.plan, 'Ravnica');
  assert.equal(def.artId, 155);
  assert.equal(def.spell.targets[0].type, 'artifact_or_land');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('b00211dd'), 'imageUri z druku WAR (war/123)');
  assert.equal(MANA_COSTS.demolish, '{3}{R}');
});

test('B60/G1.2: Demolish — niszczy artefakt przeciwnika', () => {
  const state = game();
  put(state, 'demo', 'demolish', 'p1');
  put(state, 'rock', 'trigon-of-corruption', 'p2', 'battlefield');
  addMana(state, 'p1', 4);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'demo' && c.targets?.[0] === 'rock');
  assert.ok(cast, 'rzut z celem-artefaktem jest oferowany');
  run(state, cast);
  resolve(state);
  assert.ok(![...state.objects.values()].some((o) => o.id === 'rock' && o.zone === 'battlefield'),
    'artefakt zszedł ze stołu');
  assert.ok(find(state, 'demolish', 'graveyard'), 'Demolish poszedł do grobu po rozstrzygnięciu');
});

test('B60/G1.2: Demolish — niszczy land', () => {
  const state = game();
  put(state, 'demo', 'demolish', 'p1');
  put(state, 'land', 'basic-swamp', 'p2', 'battlefield');
  addMana(state, 'p1', 4);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'demo' && c.targets?.[0] === 'land');
  assert.ok(cast, 'rzut z celem-landem jest oferowany');
  run(state, cast);
  resolve(state);
  assert.ok(![...state.objects.values()].some((o) => o.id === 'land' && o.zone === 'battlefield'),
    'land zszedł ze stołu');
});

test('B60/G1.2: Demolish — stwór nie jest legalnym celem', () => {
  const state = game();
  put(state, 'demo', 'demolish', 'p1');
  put(state, 'beast', 'razorfoot-griffin', 'p2', 'battlefield');
  addMana(state, 'p1', 4);
  const casts = commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'demo');
  assert.ok(casts.every((c) => (c.targets?.[0] ?? null) !== 'beast'),
    'żadna oferta rzutu nie celuje w stwora (tylko artifact or land)');
});

// ---- G1.3: Renegade Tactics (147 CMR, plan Kaladesh) ------------------------

test('B60/G1.3: Renegade Tactics — dane Oracle, sorcery {R} i druk CMR', () => {
  const def = registry.get('renegade-tactics');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 1);
  assert.equal(def.set, 'CMR');
  assert.equal(def.plan, 'Kaladesh');
  assert.equal(def.artId, 147);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('7dfa0e65'), 'imageUri z druku CMR (cmr/195)');
  assert.equal(MANA_COSTS['renegade-tactics'], '{R}');
});

test('B60/G1.3: Renegade Tactics — cel nie blokuje + dobór karty', () => {
  const state = game();
  put(state, 'tactics', 'renegade-tactics', 'p1');
  put(state, 'wall', 'razorfoot-griffin', 'p2', 'battlefield');
  addMana(state, 'p1', 1);
  const handBefore = [...state.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'tactics' && c.targets?.[0] === 'wall');
  assert.ok(cast, 'rzut z celem-stworem jest oferowany');
  run(state, cast);
  resolve(state);
  assert.equal(state.objects.get('wall').cantBlock, true, 'cel dostał cantBlock do końca tury');
  const handAfter = [...state.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore, 'cantrip: ręka wraca do rozmiaru sprzed rzutu (czar + dobór)');
  assert.ok(find(state, 'renegade-tactics', 'graveyard'), 'czar w grobie po rozstrzygnięciu');
});

test('B60/G1.3: Renegade Tactics — bez celu-stwora rzut nie jest oferowany', () => {
  const state = game();
  put(state, 'tactics', 'renegade-tactics', 'p1');
  addMana(state, 'p1', 1);
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'tactics'),
    'przy pustym stole brak oferty (cel obowiązkowy)');
});

test('B60/G1.3: Renegade Tactics — bez many rzut nie jest oferowany', () => {
  const state = game();
  put(state, 'tactics', 'renegade-tactics', 'p1');
  put(state, 'wall', 'razorfoot-griffin', 'p2', 'battlefield');
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'tactics'),
    'przy zerowej manie brak oferty rzutu {R}');
});

// ---- G1.4: Trigon of Thought (154 SOM, plan Mirrodin) -----------------------

test('B60/G1.4: Trigon of Thought — dane Oracle, artefakt {5} i druk SOM', () => {
  const def = registry.get('trigon-of-thought');
  assert.deepEqual(def.types, ['Artifact']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.manaCost, 5);
  assert.deepEqual(def.entersWithCounters, { charge: 3 });
  assert.equal(def.set, 'SOM');
  assert.equal(def.plan, 'Mirrodin');
  assert.equal(def.artId, 154);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('f8da37ba'), 'imageUri z druku SOM (som/217)');
  assert.equal(MANA_COSTS['trigon-of-thought'], '{5}');
});

test('B60/G1.4: Trigon of Thought — wchodzi z 3 charge; {2},{T},-counter: dobór', () => {
  const state = game();
  put(state, 'trig', 'trigon-of-thought', 'p1');
  addMana(state, 'p1', 7);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'trig'));
  resolve(state);
  const trig = find(state, 'trigon-of-thought');
  assert.ok(trig, 'Trigon na stole po rzucie');
  assert.equal(trig.counters?.charge, 3, 'ETB z trzema charge counters');
  const handBefore = [...state.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  const draw = commands(state, 'p1').find((c) => c.type === 'activate_ability' && c.objectId === trig.id && c.abilityIndex === 1);
  assert.ok(draw, 'zdolność doboru {2},{T},-counter jest oferowana');
  run(state, draw);
  resolve(state);
  assert.equal(state.objects.get(trig.id).counters?.charge, 2, 'counter zużyty jako koszt');
  assert.equal(state.objects.get(trig.id).tapped, true, 'Trigon tapnięty kosztem');
  const handAfter = [...state.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 1, 'dobrano dokładnie 1 kartę');
});

test('B60/G1.4: Trigon of Thought — {U}{U},{T}: doładowanie countera', () => {
  const state = game();
  put(state, 'trig', 'trigon-of-thought', 'p1');
  addMana(state, 'p1', 7);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'trig'));
  resolve(state);
  const trig = find(state, 'trigon-of-thought');
  const charge = commands(state, 'p1').find((c) => c.type === 'activate_ability' && c.objectId === trig.id && c.abilityIndex === 0);
  assert.ok(charge, 'zdolność doładowania {U}{U},{T} jest oferowana');
  run(state, charge);
  resolve(state);
  assert.equal(state.objects.get(trig.id).counters?.charge, 4, 'przybył czwarty charge counter');
});

test('B60/G1.4: Trigon of Thought — bez counterów dobór nie jest oferowany', () => {
  const state = game();
  put(state, 'trig', 'trigon-of-thought', 'p1', 'battlefield', { counters: {}, tapped: false });
  addMana(state, 'p1', 2);
  const offers = commands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === 'trig');
  assert.ok(!offers.some((c) => c.abilityIndex === 1),
    'zdolność z kosztem removeCounter nie istnieje przy 0 counterów');
});

// ---- G1.5: Stensia Innkeeper (144 EMN, plan Innistrad) ----------------------

test('B60/G1.5: Stensia Innkeeper — dane Oracle, Vampire 3/3 i druk EMN', () => {
  const def = registry.get('stensia-innkeeper');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Vampire']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 4);
  assert.equal(def.set, 'EMN');
  assert.equal(def.plan, 'Innistrad');
  assert.equal(def.artId, 144);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('ee40c471'), 'imageUri z druku EMN (emn/145)');
  assert.equal(MANA_COSTS['stensia-innkeeper'], '{3}{R}');
});

test('B60/G1.5: Stensia Innkeeper — ETB tapuje land przeciwnika + skip untapu', () => {
  const state = game();
  put(state, 'inn', 'stensia-innkeeper', 'p1');
  put(state, 'opp-land', 'basic-swamp', 'p2', 'battlefield');
  put(state, 'my-land', 'basic-swamp', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'inn'));
  resolve(state);
  // Jeden kandydat (land przeciwnika) → engine wybiera automatycznie (CR 115.1d).
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target'),
    'własny land nie kandyduje — jeden cel, brak pytania');
  const opp = state.objects.get('opp-land');
  assert.equal(opp.tapped, true, 'land przeciwnika tapnięty');
  assert.equal(opp.dontUntapNextUntapStep, 'p2', 'jednorazowa blokada następnego untapu');
  assert.equal(state.objects.get('my-land').tapped, false, 'własny land nietknięty');
});

test('B60/G1.5: Stensia Innkeeper — dwa lądy wroga = wybór celu (własny nie kandyduje)', () => {
  const state = game();
  put(state, 'inn', 'stensia-innkeeper', 'p1');
  put(state, 'opp-a', 'basic-swamp', 'p2', 'battlefield');
  put(state, 'opp-b', 'basic-swamp', 'p2', 'battlefield');
  put(state, 'my-land', 'basic-swamp', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'inn'));
  resolve(state);
  const offers = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  assert.deepEqual(offers.map((c) => c.targetId).sort(), ['opp-a', 'opp-b'],
    'kandydaci to WYŁĄCZNIE lądy przeciwnika');
  run(state, offers.find((c) => c.targetId === 'opp-b'));
  resolve(state);
  assert.equal(state.objects.get('opp-b').tapped, true, 'wybrany land tapnięty');
  assert.equal(state.objects.get('opp-a').tapped, false, 'niewybrany land nietknięty');
});

test('B60/G1.5: Stensia Innkeeper — brak landów wroga = trigger bez celu (fizzle)', () => {
  const state = game();
  put(state, 'inn', 'stensia-innkeeper', 'p1');
  put(state, 'my-land', 'basic-swamp', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'inn'));
  resolve(state);
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target'),
    'brak kandydatów = brak pytania o cel');
  assert.equal(state.objects.get('my-land').tapped, false, 'własny land nie może być celem zastępczym');
  assert.ok(find(state, 'stensia-innkeeper'), 'Innkeeper mimo to wchodzi na stół');
});

// ---- G1.6: Summary Judgment (156 RNA, plan Ravnica) -------------------------

test('B60/G1.6: Summary Judgment — dane Oracle, instant {1}{W} i druk RNA', () => {
  const def = registry.get('summary-judgment');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.set, 'RNA');
  assert.equal(def.plan, 'Ravnica');
  assert.equal(def.artId, 156);
  assert.equal(def.spell.targets[0].type, 'tapped_creature');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('c0b20fec'), 'imageUri z druku RNA (rna/24)');
  assert.equal(MANA_COSTS['summary-judgment'], '{1}{W}');
});

test('B60/G1.6: Summary Judgment — rzut we własnej main fazie to 5 obrażeń (Addendum)', () => {
  const state = game();
  put(state, 'judgment', 'summary-judgment', 'p1');
  put(state, 'victim', 'segmented-krotiq', 'p2', 'battlefield', { tapped: true });
  addMana(state, 'p1', 2);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'judgment' && c.targets?.[0] === 'victim');
  assert.ok(cast, 'rzut w cel-tapnięty jest oferowany');
  run(state, cast);
  resolve(state);
  assert.ok(![...state.objects.values()].some((o) => o.id === 'victim' && o.zone === 'battlefield'),
    '6/5 ginie od 5 obrażeń Addendum (3 by przeżył)');
  assert.ok(find(state, 'summary-judgment', 'graveyard'), 'czar w grobie po rozstrzygnięciu');
});

test('B60/G1.6: Summary Judgment — rzut w turze przeciwnika to 3 obrażenia (bez Addendum)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'judgment', 'summary-judgment', 'p1');
  put(state, 'victim', 'segmented-krotiq', 'p2', 'battlefield', { tapped: true });
  addMana(state, 'p1', 2);
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'judgment' && c.targets?.[0] === 'victim');
  assert.ok(cast, 'instant w turze wroga jest oferowany');
  run(state, cast);
  resolve(state);
  const victim = state.objects.get('victim');
  assert.equal(victim.zone, 'battlefield', '6/5 przeżywa 3 obrażenia');
  assert.equal(victim.damage, 3, 'dokładnie 3 obrażenia, bez bonusu Addendum');
});

test('B60/G1.6: Summary Judgment — odkręcony stwór nie jest celem', () => {
  const state = game();
  put(state, 'judgment', 'summary-judgment', 'p1');
  put(state, 'ready', 'segmented-krotiq', 'p2', 'battlefield', { tapped: false });
  addMana(state, 'p1', 2);
  const casts = commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'judgment');
  assert.ok(casts.every((c) => (c.targets?.[0] ?? null) !== 'ready'),
    'żadna oferta nie celuje w odkręconego stwora (tylko tapped)');
});

test('B60/G1.6: Addendum — kopia storma NIE dziedziczy flagi rzutu (ruling RNA)', () => {
  const state = game();
  put(state, 'ins', 'spreading-insurrection', 'p1');
  put(state, 'wrog', 'razorfoot-griffin', 'p2', 'battlefield');
  state.spellsCastThisTurn = 2; // jeden wcześniejszy czar → jedna kopia
  addMana(state, 'p1', 5);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'ins' && c.targets?.[0] === 'wrog');
  assert.ok(cast, 'rzut Insurrection w main fazie');
  run(state, cast);
  const original = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === 'spreading-insurrection' && !o.isSpellCopy);
  assert.equal(original.castDuringMainPhase, true, 'oryginał rzucony w main fazie niesie flagę');
  // Sam trigger storma: obaj pasują → kopie lądują na stosie (jeszcze żywe).
  run(state, { type: 'pass_priority', playerId: 'p1' });
  run(state, { type: 'pass_priority', playerId: 'p2' });
  const copies = state.zones.stack.map((id) => state.objects.get(id)).filter((o) => o?.isSpellCopy);
  assert.equal(copies.length, 2, 'storm stworzył dwie kopie (dwa wcześniejsze czary)');
  assert.ok(copies.every((c) => c.castDuringMainPhase === false),
    'kopia ma wygaszoną flagę (nigdy nie była rzucona — ruling Addendum)');
});

// ---- G1.7: Timely Interference (152 DMU, plan Dominaria) --------------------

test('B60/G1.7: Timely Interference — dane Oracle, instant {U} + kicker i druk DMU', () => {
  const def = registry.get('timely-interference');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.manaCost, 1);
  assert.deepEqual(def.kicker, { cost: 2, colors: ['R'] });
  assert.equal(def.set, 'DMU');
  assert.equal(def.plan, 'Dominaria');
  assert.equal(def.artId, 152);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('017a3c6b'), 'imageUri z druku DMU (dmu/70)');
  assert.equal(MANA_COSTS['timely-interference'], '{U}');
});

test('B60/G1.7: Timely Interference bez kickera — -1/-0 + dobór, bez wymogu bloku', () => {
  const state = game();
  put(state, 'timely', 'timely-interference', 'p1');
  put(state, 'victim', 'segmented-krotiq', 'p2', 'battlefield');
  addMana(state, 'p1', 1);
  const handBefore = [...state.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'timely' && !c.kicked && c.targets?.[0] === 'victim');
  assert.ok(cast, 'wariant bez kickera jest oferowany');
  run(state, cast);
  resolve(state);
  assert.equal(effectivePower(state.objects.get('victim'), state), 5, '6/5 dostał -1/-0 (moc 5)');
  assert.equal(effectiveToughness(state.objects.get('victim'), state), 5, 'wytrzymałość bez zmian');
  assert.equal(state.objects.get('victim').blocksIfAble ?? false, false, 'bez kickera brak wymogu bloku');
  const handAfter = [...state.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore, 'cantrip: ręka wraca do rozmiaru sprzed rzutu');
});

test('B60/G1.7: Timely Interference z kickerem — koszt 3, wasKicked i blocksIfAble', () => {
  const state = game();
  put(state, 'timely', 'timely-interference', 'p1');
  put(state, 'victim', 'segmented-krotiq', 'p2', 'battlefield');
  addMana(state, 'p1', 3);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'timely' && c.kicked === true && c.targets?.[0] === 'victim');
  assert.ok(cast, 'wariant kicked jest oferowany przy 3 manie');
  run(state, cast);
  assert.equal(player(state, 'p1').mana, 0, 'zapłacono bazę {U} + kicker {1}{R} = 3');
  const stacked = state.objects.get(state.zones.stack.at(-1));
  assert.equal(stacked.wasKicked, true, 'fakt kickera na obiekcie stosu (CR 702.33a)');
  resolve(state);
  assert.equal(effectivePower(state.objects.get('victim'), state), 5, '-1/-0 także w wariancie kicked');
  assert.equal(state.objects.get('victim').blocksIfAble, true, 'kicked stawia wymóg bloku');
});

// Pomocnicza walka: p1 atakuje, krok bloków z priorytetem obrońcy.
function fight(state, attackerIds, defender = 'p2') {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  state.turn = jumpToStep(state.turn, 'declare_blockers', defender);
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = defender;
}

function kickTimelyOn(state, targetId) {
  put(state, 'timely', 'timely-interference', 'p1');
  addMana(state, 'p1', 3);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'timely' && c.kicked === true && c.targets?.[0] === targetId);
  assert.ok(cast, 'rzut kicked w cel');
  run(state, cast);
  resolve(state);
}

test('B60/G1.7: blocks if able — deklaracja bez wymuszonego odrzucona, z nim przyjęta', () => {
  const state = game();
  put(state, 'att', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'forced', 'razorfoot-griffin', 'p2', 'battlefield');
  put(state, 'free', 'razorfoot-griffin', 'p2', 'battlefield');
  kickTimelyOn(state, 'forced');
  fight(state, ['att']);
  const empty = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  assert.equal(empty.ok, false, 'pusta deklaracja (pomija wymuszonego) jest nielegalna');
  const emptyReason = empty.reason ?? empty.events?.[0]?.reason ?? '';
  assert.match(emptyReason, /blocks if able/, 'powód nazywa wymóg bloku');
  const freeOnly = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['free'] } });
  assert.equal(freeOnly.ok, false, 'blok samym opcjonalnym (pomija wymuszonego) jest nielegalny');
  const covering = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['forced'] } });
  assert.equal(covering.ok, true, `blok wymuszonym przechodzi: ${covering.reason ?? ''}`);
});

test('B60/G1.7: blocks if able — każda oferta zawiera wymuszonego', () => {
  const state = game();
  put(state, 'att', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'forced', 'razorfoot-griffin', 'p2', 'battlefield');
  put(state, 'free', 'razorfoot-griffin', 'p2', 'battlefield');
  kickTimelyOn(state, 'forced');
  fight(state, ['att']);
  const offers = commands(state, 'p2').filter((c) => c.type === 'declare_blockers');
  assert.ok(offers.length > 0, 'istnieją oferty bloków');
  assert.ok(offers.every((c) => Object.values(c.assignments ?? {}).some((ids) => ids.includes('forced'))),
    'każda oferta zawiera wymuszonego blokera (lustro mandatoryAttackerIds)');
});

test('B60/G1.7: blocks if able — runda passów auto-deklaruje minimalny blok (znalezisko J)', () => {
  const state = game();
  put(state, 'att', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'forced', 'razorfoot-griffin', 'p2', 'battlefield');
  put(state, 'free', 'razorfoot-griffin', 'p2', 'battlefield');
  kickTimelyOn(state, 'forced');
  fight(state, ['att']);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true, 'pass obrońcy');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true, 'pass atakującego (domyka rundę)');
  const used = [...(state.combat?.blockers?.values?.() ?? [])].flat();
  assert.deepEqual(used, ['forced'], 'auto-deklaracja: SAM wymuszony (opcjonalny przepada, jak u atakujących)');
  assert.ok(state.events.some((e) => e.type === 'blockers_declared'), 'zdarzenie blockers_declared wyemitowane');
});

test('B60/G1.7: blocks if able — tapnięty wymuszony nie blokuje („if able" zwalnia)', () => {
  const state = game();
  put(state, 'att', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'forced', 'razorfoot-griffin', 'p2', 'battlefield', { tapped: true });
  kickTimelyOn(state, 'forced');
  fight(state, ['att']);
  const empty = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  assert.equal(empty.ok, true, `tapnięty „wymuszony" nie może blokować — pusta deklaracja legalna: ${empty.reason ?? ''}`);
});

test('B60/G1.7: blocks if able — lądowy wymuszony vs latacz („if able" zwalnia)', () => {
  const state = game();
  put(state, 'flyer', 'razorfoot-griffin', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'forced', 'segmented-krotiq', 'p2', 'battlefield');
  kickTimelyOn(state, 'forced');
  fight(state, ['flyer']);
  const empty = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  assert.equal(empty.ok, true, `bezreachowy „wymuszony" nie sięga latacza — pusta deklaracja legalna: ${empty.reason ?? ''}`);
});

test('B60/G1.7: blocksIfAble znika w cleanup (CR 514.2)', () => {
  const state = game();
  put(state, 'victim', 'segmented-krotiq', 'p2', 'battlefield');
  kickTimelyOn(state, 'victim');
  assert.equal(state.objects.get('victim').blocksIfAble, true, 'flaga postawiona');
  clearStatModifiers(state);
  assert.equal(state.objects.get('victim').blocksIfAble, false, 'cleanup zdejmuje wymóg bloku');
});
