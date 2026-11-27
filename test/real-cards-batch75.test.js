// Batch 75 (kolekcja 666–675) — zgodność z Oracle i ZACHOWANIE kart.
//
// Plan: `docs/plans/PLAN_2026-11-27-batch75-kart.md`. Snapshoty:
// `docs/cards/scryfall-<slug>.json` (pobrane 2026-11-27, `set=` — ADR 0010/0022/0030).
// Arkusz kolekcji: `tools/collection-art-ids.csv`. Fale: B1 (666/667/668/673),
// B2 (670/671/675), B3 (672/674) — plan batcha.
//
// Strażnik DWÓCH rzeczy (L34, L57 — wzorzec real-cards-batch74):
//   1. DANE: artId/set/plan/status + nazwa, cmc, linia typów i P/T ze snapshotu;
//   2. ZACHOWANIE: karta robi w silniku to, co Oracle — na ścieżce produktu
//      (`createCardDeck` → `addObject`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower } from '../src/engine/permanents.js';

const registry = createCardRegistry();
const definition = (id) => registry.get(id);
const snapshot = (id) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8'));
const commands = (state, playerId = 'p1') => playerView(state, playerId).legalCommands;
const lifeOf = (state, playerId) => state.players.find((p) => p.id === playerId).life;

function game(seed = 75, step = 'main', priority = 'p1') {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, priority);
  state.turn.activePlayerId = state.turn.priorityPlayerId = priority;
  return state;
}

/** Payload karty DOKŁADNIE taki, jaki instaluje `createCardDeck` (produkt, nie helper). */
function deckPayload(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  const { id, instanceId, cardId: _cardId, ownerId: _ownerId, controllerId, zone, objectId, ...rest } = entry;
  return rest;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield', patch = {}) {
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...deckPayload(cardId, controllerId), ...patch,
  });
  return state.objects.get(id);
}

function library(state, ownerId, count = 20) {
  for (let i = 1; i <= count; i += 1) {
    addObject(state, {
      id: `lib-${ownerId}-${i}`, instanceId: `inst-lib-${ownerId}-${i}`,
      cardId: 'basic-forest', controllerId: ownerId, zone: 'library', kind: 'land',
      name: 'Forest', types: ['Land'], subtypes: ['Forest'],
    });
  }
}

function passUntilStep(state, step, limit = 12) {
  for (let i = 0; i < limit && state.turn.step !== step; i += 1) {
    const pv = commands(state, state.turn.priorityPlayerId);
    const pass = pv.find((c) => c.type === 'pass_priority');
    assert.ok(pass, `setup: brak pasa w kroku ${state.turn.step}`);
    assert.equal(execute(state, pass).ok, true);
  }
  assert.equal(state.turn.step, step, `setup: nie osiągnięto kroku ${step}`);
}

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const options = commands(state, holder);
    const pick = options.find((c) => c.type.startsWith('resolve_'))
      ?? options.find((c) => c.type === 'pass_priority');
    if (!pick) return;
    if (!execute(state, pick).ok) return;
  }
}

// ---------------------------------------------------------------------------
// DANE: fala B1 (666/667/668/673) kontra snapshoty Oracle i arkusz kolekcji
// ---------------------------------------------------------------------------

test('Batch 75/B1: cztery wpisy zgadzają się ze snapshotami Oracle i arkuszem kolekcji', () => {
  const expected = [
    ['undersea-invader', 666, 'KHM', 'Kaldheim'],
    ['gysahl-greens', 667, 'FIN', 'Final Fantasy'],
    ['battle-hurda', 668, 'WWK', 'Zendikar'],
    ['hired-blade', 673, 'M19', 'New Capenna'],
  ];
  assert.equal(expected.length, 4, 'fala B1 to cztery pozycje');
  for (const [id, artId, set, plan] of expected) {
    const card = definition(id);
    assert.ok(card, `${id}: wpis w katalogu`);
    assert.equal(card.artId, artId, `${id}: artId z arkusza kolekcji`);
    assert.equal(card.set, set, `${id}: set`);
    assert.equal(card.plan, plan, `${id}: plan (fabularne przyporządkowanie właściciela)`);
    assert.equal(card.support?.status, 'supported', `${id}: status wsparcia`);
    assert.deepEqual(card.support?.limitations, [], `${id}: supported = bez limitations (ADR 0022)`);

    const snap = snapshot(id);
    assert.equal(card.name, snap.name, `${id}: nazwa ze snapshotu`);
    assert.equal(card.manaCost ?? 0, snap.cmc ?? 0, `${id}: wartość many (cmc)`);
    const [supertypes, subtypes] = (snap.type_line ?? '').split(' — ');
    assert.deepEqual(card.types, supertypes.split(' '), `${id}: typy z type_line`);
    assert.deepEqual(card.subtypes ?? [], subtypes ? subtypes.split(' ') : [], `${id}: podtypy z type_line`);
    if (snap.power != null) {
      assert.equal(String(card.power), snap.power, `${id}: power`);
      assert.equal(String(card.toughness), snap.toughness, `${id}: toughness`);
    }
    assert.match(card.oracleText, /\S/, `${id}: oracleText niepusty`);
  }
});

test('Batch 75/B1: koszty many w mana-costs-data są 1:1 ze snapshotami', async () => {
  const { MANA_COSTS } = await import('../src/cards/mana-costs-data.js');
  const expected = {
    'undersea-invader': '{4}{U}{U}',
    'gysahl-greens': '{1}{G}',
    'battle-hurda': '{4}{W}',
    'hired-blade': '{2}{B}',
  };
  for (const [id, cost] of Object.entries(expected)) {
    assert.equal(MANA_COSTS[id], cost, `${id}: koszt rzutu`);
    assert.equal(MANA_COSTS[id], snapshot(id).mana_cost ?? '', `${id}: koszt zgodny ze snapshotem Oracle`);
  }
});

// ---------------------------------------------------------------------------
// 666. Undersea Invader — flash + wchodzi tapnięty
// ---------------------------------------------------------------------------

test('Undersea Invader: flash — rzut w turze PRZECIWNIKA jest legalny, wchodzi TAPNIĘTY', () => {
  const state = game(75, 'main', 'p2');
  state.turn.priorityPlayerId = 'p1'; // p2 zagrywa, priorytet u p1 — okno flash
  library(state, 'p1'); library(state, 'p2');
  for (let i = 1; i <= 4; i += 1) {
    put(state, `isl-${i}`, 'basic-island', 'p1');
    state.objects.set(`isl-${i}`, Object.freeze({ ...state.objects.get(`isl-${i}`), tapped: false }));
  }
  put(state, 'invader', 'undersea-invader', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['U', 'U'] });

  const cast = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'invader');
  assert.ok(cast, 'flash: Undersea Invader rzucalny w oknie przeciwnika');
  const rzut = execute(state, cast);
  assert.equal(rzut.ok, true, rzut.reason);
  resolveStack(state);
  // Id obiektu zmienia się przy przejściu stref (hand→stack→battlefield) —
  // szukamy po cardId (konwencja batch74).
  const invader = [...state.objects.values()].find((o) => o.cardId === 'undersea-invader' && o.zone === 'battlefield');
  assert.ok(invader, 'wchodzi na pole bitwy');
  assert.equal(invader.tapped, true, 'This creature enters tapped — wchodzi TAPNIĘTY');
});

test('Undersea Invader: bez flasha zwykły stwór w tym oknie nie jest rzucalny (kontrola ujemna)', () => {
  const state = game(75, 'main', 'p2');
  state.turn.priorityPlayerId = 'p1';
  library(state, 'p1'); library(state, 'p2');
  for (let i = 1; i <= 3; i += 1) put(state, `isl-${i}`, 'basic-island', 'p1');
  put(state, 'plains', 'basic-plains', 'p1');
  put(state, 'hurda', 'battle-hurda', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['W'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'hurda');
  assert.ok(!cast, 'Battle Hurda bez flasha nie jest rzucalny w oknie przeciwnika');
});

// ---------------------------------------------------------------------------
// 667. Gysahl Greens — token Bird z landfallem + flashback {6}{G}
// ---------------------------------------------------------------------------

test('Gysahl Greens: tworzy token_bird_chocobo 2/2, ląd kontrolera daje mu +1/+0', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'greens', 'gysahl-greens', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'greens');
  assert.ok(cast, 'Gysahl Greens rzucalny za {1}{G}');
  assert.equal(execute(state, cast).ok, true, 'rzut OK');
  resolveStack(state);
  const bird = [...state.objects.values()].find((o) => o.cardId === 'token_bird_chocobo');
  assert.ok(bird, 'token Bird 2/2 na polu bitwy');
  assert.equal(bird.zone, 'battlefield');
  assert.equal(effectivePower(bird, state), 2, 'bazowo 2/2');

  // Landfall: zagranie lądu z ręki pumpuje token do końca tury.
  put(state, 'dodatkowy-land', 'basic-forest', 'p1', 'hand');
  const land = commands(state, 'p1').find((c) => c.type === 'play_land' && c.objectId === 'dodatkowy-land');
  assert.ok(land, 'lądy z ręki zagrywalne');
  assert.equal(execute(state, land).ok, true, 'land drop OK');
  resolveStack(state); // trigger landfall wchodzi na stos — wzorzec batch45/5
  const birdPo = state.objects.get(bird.id);
  assert.equal(effectivePower(birdPo, state), 3, 'landfall: +1/+0 do końca tury');
});

test('Gysahl Greens: flashback {6}{G} z grobu — drugi token, karta wylatuje', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'greens', 'gysahl-greens', 'p1', 'graveyard', { kind: 'spell' });
  addMana(state, 'p1', 7, { colors: ['G', 'G', 'G', 'G', 'G', 'G', 'G'] });
  const fb = commands(state, 'p1').find((c) => c.type === 'cast_flashback' && c.objectId === 'greens');
  assert.ok(fb, 'flashback {6}{G} oferowany z grobu');
  const rzut = execute(state, fb);
  assert.equal(rzut.ok, true, rzut.reason);
  resolveStack(state);
  const birds = [...state.objects.values()].filter((o) => o.cardId === 'token_bird_chocobo');
  assert.equal(birds.length, 1, 'flashback tworzy token Bird');
  const greens = [...state.objects.values()].find((o) => o.cardId === 'gysahl-greens');
  assert.ok(!greens || greens.zone === 'exile', 'po flashbacku karta wylatuje (CR 702.34a)');
});

// ---------------------------------------------------------------------------
// 668. Battle Hurda — first strike
// ---------------------------------------------------------------------------

test('Battle Hurda: first strike — 2/2 bloker ginie od samego first strike, Hurda bez obrażeń', () => {
  const state = game(75, 'declare_attackers', 'p1');
  library(state, 'p1'); library(state, 'p2');
  put(state, 'hurda', 'battle-hurda', 'p1');
  state.objects.set('hurda', Object.freeze({ ...state.objects.get('hurda'), summoningSickness: false }));
  // Bloker SYNTETYCZNY 2/2 bez first strike (wzorzec putCreature audytów
  // PMSSB — karta poza rejestru, sam stwór do walki): 3 obrażeń first strike
  // zabijają go PRZED zwykłym krokiem (CR 702.7b), więc Hurda nie dostaje nic.
  addObject(state, {
    id: 'bloker', instanceId: 'i-bloker', cardId: 'x-bloker', controllerId: 'p2',
    ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    manaCost: 3, types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
  });
  const atak = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['hurda'] });
  assert.equal(atak.ok, true, atak.reason);
  passUntilStep(state, 'declare_blockers');
  const blk = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { hurda: ['bloker'] } });
  assert.equal(blk.ok, true, blk.reason);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);
  const combat = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(combat.ok, true, combat.reason);
  resolveStack(state);
  const blokerPo = [...state.objects.values()].find((o) => o.cardId === 'x-bloker');
  assert.equal(blokerPo?.zone, 'graveyard', 'bloker 2/2 ginie od 3 obrażeń first strike');
  const hurdaPo = [...state.objects.values()].find((o) => o.cardId === 'battle-hurda');
  assert.equal(hurdaPo?.zone, 'battlefield', 'Hurda przeżywa bez obrażeń');
  assert.equal(lifeOf(state, 'p2'), 20, 'obrażenia first strike zabiły blokera przed zwykłym krokiem — gracz nic nie traci');
});

// ---------------------------------------------------------------------------
// 673. Hired Blade — flash
// ---------------------------------------------------------------------------

test('Hired Blade: flash — rzut w turze przeciwnika legalny; 3/2', () => {
  const state = game(75, 'main', 'p2');
  state.turn.priorityPlayerId = 'p1';
  library(state, 'p1'); library(state, 'p2');
  put(state, 'swamp', 'basic-swamp', 'p1');
  put(state, 'blade', 'hired-blade', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['B', 'B'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'blade');
  assert.ok(cast, 'flash: Hired Blade rzucalny w oknie przeciwnika');
  assert.equal(execute(state, cast).ok, true, 'rzut OK');
  resolveStack(state);
  const blade = [...state.objects.values()].find((o) => o.cardId === 'hired-blade' && o.zone === 'battlefield');
  assert.ok(blade, 'wchodzi na pole bitwy');
  assert.equal(`${blade.power}/${blade.toughness}`, '3/2', 'P/T z Oracle');
});
