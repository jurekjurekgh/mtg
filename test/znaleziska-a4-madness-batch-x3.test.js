// A4-1 (handoff 2026-09-08k, kolejność ryzyka #1): madness + batch-discard ×3.
//
// Pokrycie dotychczasowe: M258 = odrzucenia SEKWENCYJNE (jedna komenda
// `cardId` na kartę; kolejka decyzji), owner-discard B = batch (`cardIds`)
// na SCIEŻCE KOSZTU (Cathartic Reunion, count 2) i Mindstab z ręką krótszą
// niż 3 (bez madness). NIEPOKRYTE PRZECIĘCIE: batch `cardIds` na SCIEŻCE
// EFEKTU z licznikiem 3 (prawdziwy Mindstab) gdy odrzucane karty mają
// madness — pętla L3999–4050 game-state.js (exile + madnessQueue w środku
// batcha) nigdy nie została otestowana z count 3.
//
// Sonda ×3 (CR 702.35a + ruling DMR: opcja rzutu po dokończeniu efektu odrzucania;
// CR 702.35a: madness trafia do exile):
//  1. batch 3, jeden madness — decyzja otwiera się po batchu, nie w środku;
//  2. batch 3, dwa madness — kolejka: decyzje sekwencyjnie w kolejności
//     odrzuceń, żadna nie ginie;
//  3. batch 3, trzy madness — rzut w ŚRODKU kolejki (stać = cast,
//     nie stać = rezygnacja), potem reszta kolejki;
//  4. pełna droga: cast_spell Mindstab → batch p2 z madness → rezygnacja
//     → rozstrzygnięcie kończy się bez pendingów.
//
// WYNIK SONDY: 1–3 poprawne; 4 ZNALAZISKO — wpis madnessQueue łapał
// priorytet W CHWILI PUSHA (odrzucający), a nie posiadacza z PRZED
// odrzuceniem (pending.restorePriorityTo): ten sam Mindstab kończył
// priorytetem u różnego gracza zależnie od madnessu w ręce (ścieżka
// zwykła = źródło czaru, CR 117.3b). Fix u root cause: restorePriorityTo
// dziedziczone z pending (patrz comment przy pushu w game-state.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, execute, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 441, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'hand', madness = null) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: def.types.includes('Creature') ? 'creature' : 'spell',
    power: def.power, toughness: def.toughness, manaCost: def.manaCost,
    abilities: def.abilities ?? [], colors: def.colors ?? [],
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    spell: def.spell,
    ...(madness ? { madness } : {}),
  });
  return state.objects.get(id);
}

/** pendingDiscardChoice efektu „odrzucić 3” (kształt jak po Mindstab). */
function batch3(state, handIds, playerId = 'p1') {
  state.pendingDiscardChoice = {
    playerId, count: 3, handIds: [...handIds], purpose: 'effect',
    sourceCardId: null, restorePriorityTo: playerId,
  };
  state.turn.priorityPlayerId = playerId;
}

const zonesOf = (state, cardId) =>
  [...state.objects.values()].filter((o) => o.cardId === cardId)
    .map((o) => o.zone).sort();

test('A4-1/1: batch 3 z jednym madness — decyzja po batchu, pętla nie ginie karty', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand', { cost: 4, colors: ['R'] });
  putCard(state, 'v1', 'tenth-district-veteran', 'p1');
  putCard(state, 'v2', 'tenth-district-veteran', 'p1');
  putCard(state, 'v3', 'tenth-district-veteran', 'p1');
  batch3(state, ['rev', 'v1', 'v2', 'v3']);

  const r = execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardIds: ['rev', 'v1', 'v2'] });
  assert.ok(r.ok, `batch przyjęty: ${JSON.stringify(r)}`);
  assert.equal(state.pendingDiscardChoice, null, 'sekwencja zamknięta');
  assert.deepEqual(zonesOf(state, 'revolutionist'), ['exile'], 'madness → exile (702.35a)');
  assert.equal(state.objects.get('v3')?.zone, 'hand', 'nieodrzucona karta zostaje w ręce');
  assert.ok(state.pendingMadnessCast, 'decyzja madness otwarta PO batchu (702.35a)');
  assert.equal(state.madnessQueue.length, 0, 'kolejka pusta po promocji pierwszej');
  // Żadnego podwójnego modala: discard_choice_resolved wcześniej niż madness_ready_required.
  assert.ok(r.events.findIndex((e) => e.type === 'discard_choice_resolved')
    < r.events.findIndex((e) => e.type === 'madness_ready_required'));

  const decline = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(decline, 'oferta rezygnacji');
  assert.ok(execute(state, decline).ok);
  assert.deepEqual(zonesOf(state, 'revolutionist'), ['graveyard'], 'odmowa → cmentarz');
  assert.equal(state.pendingMadnessCast, null);
});

test('A4-1/2: batch 3 z dwoma madness — kolejka: dwie decyzje sekwencyjnie', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand', { cost: 4, colors: ['R'] });
  putCard(state, 'ta', 'terminal-agony', 'p1', 'hand', { cost: 2, colors: ['B', 'R'] });
  putCard(state, 'v1', 'tenth-district-veteran', 'p1');
  batch3(state, ['rev', 'ta', 'v1']);

  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardIds: ['rev', 'ta', 'v1'] }).ok);
  assert.equal(state.zones.exile.length, 2, 'obie karty z madness w exile');
  assert.ok(state.pendingMadnessCast, 'pierwsza decyzja otwarta');
  assert.equal(state.madnessQueue.length, 1, 'druga czeka w kolejce');

  // Kolejność decyzji = kolejność odrzuceń: najpierw rev, potem ta.
  assert.equal(state.pendingMadnessCast.cardId, 'revolutionist');
  const d1 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(d1 && execute(state, d1).ok);
  assert.equal(state.pendingMadnessCast?.cardId, 'terminal-agony', 'druga decyzja po pierwszej');

  const d2 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(d2 && execute(state, d2).ok);
  assert.equal(state.pendingMadnessCast, null, 'kolejka wyczerpana');
  assert.deepEqual(zonesOf(state, 'terminal-agony'), ['graveyard']);
  assert.deepEqual(zonesOf(state, 'revolutionist'), ['graveyard']);
});

test('A4-1/3: batch 3 z trzema madness — rzut w środku kolejki, reszta dalej', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'hand', { cost: 4, colors: ['R'] });
  putCard(state, 'ta', 'terminal-agony', 'p1', 'hand', { cost: 2, colors: ['B', 'R'] });
  putCard(state, 'ta2', 'terminal-agony', 'p1', 'hand', { cost: 2, colors: ['B', 'R'] });
  batch3(state, ['rev', 'ta', 'ta2']);

  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardIds: ['rev', 'ta', 'ta2'] }).ok);

  // Decyzja 1 (revolutionist, permanent): stać → RZUT (castPermanent z exile)
  // — permanent idzie na STOS (ścieżka czaro-podobna, jak rebound) i
  // wchodzi na pole po rundzie passów.
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast1 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && c.cast);
  assert.ok(cast1, 'oferta rzutu (stać na {4}R)');
  assert.ok(execute(state, cast1).ok);
  assert.equal(state.zones.stack.length, 1, 'rzut z madness na stosie');
  assert.equal(state.pendingMadnessCast?.cardId, 'terminal-agony', 'kolejka idzie dalej po rzucie');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'priorytet do posiadacza przed odrzuceniem (fix A4-1)');

  // Decyzja 2 (terminal agony, czar z celem): bez many → TYLKO rezygnacja
  // (oferta=walidacja L48 — cast wymaga pipy {B}{R}).
  const offers2 = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_madness_cast');
  assert.ok(offers2.some((c) => !c.cast), 'rezygnacja dostępna');
  assert.ok(!offers2.some((c) => c.cast), 'cast NIE jest oferowany (brak {B}{R})');
  assert.ok(execute(state, offers2.find((c) => !c.cast)).ok);

  // Decyzja 3 (drugie terminal agony): rezygnacja.
  assert.equal(state.pendingMadnessCast?.cardId, 'terminal-agony');
  const d3 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(d3 && execute(state, d3).ok);
  assert.equal(state.pendingMadnessCast, null);
  assert.equal(state.madnessQueue.length, 0);

  // Runda passów: revolutionist zamyka stos i wchodzi na pole bitwy.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'revolutionist' && o.zone === 'battlefield'),
    'revolutionist po rundzie passów na polu bitwy');
  assert.equal(state.zones.stack.length, 0);
});

test('A4-1/4: pełna droga — cast Mindstab, batch 3 z madness, koniec bez pendingów', () => {
  const state = game('p1');
  putCard(state, 'mind', 'mindstab', 'p1');
  putCard(state, 'rev', 'revolutionist', 'p2', 'hand', { cost: 4, colors: ['R'] });
  putCard(state, 'v1', 'tenth-district-veteran', 'p2');
  putCard(state, 'v2', 'tenth-district-veteran', 'p2');
  addMana(state, 'p1', 6, { colors: ['B'] });

  const cast = playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'mind' && c.targets?.[0] === 'p2');
  assert.ok(cast, 'rzut Mindstab na p2 oferowany');
  assert.ok(execute(state, cast).ok);

  // Czar idzie na stos; efekt odrzucenia otwiera się po rozstrzygnięciu.
  for (let i = 0; i < 8 && !state.pendingDiscardChoice; i++) {
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.ok(state.pendingDiscardChoice, 'decyzja odrzucenia p2 otwarta');
  assert.equal(playerView(state, 'p2').pendingDiscardChoice.count, 3, 'pełna ręka = count 3');

  const batch = execute(state, { type: 'resolve_discard_choice', playerId: 'p2', cardIds: ['rev', 'v1', 'v2'] });
  assert.ok(batch.ok, `batch p2 przyjęty: ${JSON.stringify(batch)}`);
  assert.ok(state.pendingMadnessCast, 'madness p2 czeka na decyzję');
  assert.equal(state.pendingMadnessCast.playerId, 'p2');

  // p2 rezygnuje — po drodze nie wolno blokować innych graczy.
  const decline = playerView(state, 'p2').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(decline && execute(state, decline).ok);

  assert.equal(state.pendingMadnessCast, null);
  assert.equal(state.pendingDiscardChoice, null);
  assert.equal(state.pendingSpell, null);
  assert.equal(state.zones.stack.length, 0, 'stos pusty — Mindstab rozstrzygnięty');
  assert.deepEqual(zonesOf(state, 'revolutionist'), ['graveyard']);
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 0);
  // Priorytet wrócił do źródła efektu (p1) — gra nie stoi.
  assert.equal(state.turn.priorityPlayerId, 'p1');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'p1 dalej może spasować');
});
