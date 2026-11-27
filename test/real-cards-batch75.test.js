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
import { effectivePower, effectiveKeywords } from '../src/engine/permanents.js';

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

test('Batch 75/B1+B2: siedem wpisów zgadza się ze snapshotami Oracle i arkuszem kolekcji', () => {
  const expected = [
    ['undersea-invader', 666, 'KHM', 'Kaldheim'],
    ['gysahl-greens', 667, 'FIN', 'Final Fantasy'],
    ['battle-hurda', 668, 'WWK', 'Zendikar'],
    ['hired-blade', 673, 'M19', 'New Capenna'],
    ['vaporkin', 670, 'THS', 'Theros'],
    ['coordinated-maneuver', 671, 'TDM', 'Tarkir'],
    ['kozileks-translator', 675, 'OGW', 'Zendikar'],
  ];
  assert.equal(expected.length, 7, 'fala B1 (4) + grupa B (3)');
  for (const [id, artId, set, plan] of expected) {
    const card = definition(id);
    assert.ok(card, `${id}: wpis w katalogu`);
    assert.equal(card.artId, artId, `${id}: artId z arkusza kolekcji`);
    assert.equal(card.set, set, `${id}: set`);
    assert.equal(card.plan, plan, `${id}: plan (fabularne przyporządkowanie właściciela)`);
    assert.equal(card.support?.status, 'supported', `${id}: status wsparcia`);
    if (id === 'coordinated-maneuver') {
      // ADR 0022: limitation = fakt strukturalny (planeswalkery nie istnieją
      // w silniku — patrz ALLOWED_REASONS limitations-guard).
      assert.equal(card.support?.limitations.length, 1, `${id}: jedno limitation strukturalne`);
      assert.match(card.support?.limitations[0], /planeswalker/, `${id}: limitation o planeswalkerze`);
    } else {
      assert.deepEqual(card.support?.limitations, [], `${id}: supported = bez limitations (ADR 0022)`);
    }

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

test('Batch 75/B1+B2+C: koszty many w mana-costs-data są 1:1 ze snapshotami', async () => {
  const { MANA_COSTS } = await import('../src/cards/mana-costs-data.js');
  const expected = {
    'undersea-invader': '{4}{U}{U}',
    'gysahl-greens': '{1}{G}',
    'battle-hurda': '{4}{W}',
    'hired-blade': '{2}{B}',
    'vaporkin': '{1}{U}',
    'coordinated-maneuver': '{1}{W}',
    'kozileks-translator': '{4}{B}',
    'lightning-spear': '{1}{R}',
    'malevolent-noble': '{1}{B}',
    'mister-gutsy': '{2}',
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

// ---------------------------------------------------------------------------
// 670. Vaporkin — restrykcja strony BLOKERA (canBlockOnlyKeywords, ADR 0002)
// ---------------------------------------------------------------------------

test('Vaporkin: blokuje atakującego z lataniem, ODRZUCANY na nierojącym (M380)', () => {
  const state = game(75, 'declare_attackers', 'p2');
  library(state, 'p1'); library(state, 'p2');
  put(state, 'flyer', 'vaporkin', 'p2');
  state.objects.set('flyer', Object.freeze({ ...state.objects.get('flyer'), summoningSickness: false }));
  put(state, 'ground', 'battle-hurda', 'p2');
  state.objects.set('ground', Object.freeze({ ...state.objects.get('ground'), summoningSickness: false }));
  put(state, 'vap', 'vaporkin', 'p1');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['flyer', 'ground'] }).ok, true);
  passUntilStep(state, 'declare_blockers');

  // Widok: restrykcja publiczna (ADR 0017 — bot czyta z widoku).
  const vapView = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'vap');
  assert.deepEqual(vapView.canBlockOnlyKeywords, ['flying'], 'PlayerView niesie canBlockOnlyKeywords');

  // Ziarna oferty (M387: oferta=walidacja): Vaporkin kandyduje WYŁĄCZNIE na flyer.
  const seeds = commands(state, 'p1').filter((c) => c.type === 'declare_blockers'
    && Object.values(c.assignments ?? {}).flat().includes('vap'));
  assert.ok(seeds.length > 0, 'ziarno z Vaporkinem istnieje');
  for (const seed of seeds) {
    assert.ok(!seed.assignments.ground?.includes('vap'), 'ziarna nie oferują Vaporkina na nierojącego');
    assert.ok(seed.assignments.flyer?.includes('vap'), 'ziarno oferuje Vaporkina na rojącego');
  }

  // Walidacja: blok na rojącego ACCEPT, na nierojącego REJECT z komunikatem M380.
  const dobry = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { flyer: ['vap'] } });
  assert.equal(dobry.ok, true, `blok rojącego legalny: ${dobry.reason ?? 'OK'}`);
  const state2 = game(75, 'declare_attackers', 'p2');
  library(state2, 'p1'); library(state2, 'p2');
  put(state2, 'ground', 'battle-hurda', 'p2');
  state2.objects.set('ground', Object.freeze({ ...state2.objects.get('ground'), summoningSickness: false }));
  put(state2, 'vap', 'vaporkin', 'p1');
  assert.equal(execute(state2, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['ground'] }).ok, true);
  passUntilStep(state2, 'declare_blockers');
  const zly = execute(state2, { type: 'declare_blockers', playerId: 'p1', assignments: { ground: ['vap'] } });
  assert.equal(zly.ok, false, 'blok nierojącego ODRZUCANY');
  assert.match(String(zly.reason), /can block only creatures/, 'komunikat M380 z nazwą reguły');
});

// ---------------------------------------------------------------------------
// 671. Coordinated Maneuver — modalność (tryb A: kwota ze stworów, B: destroy)
// ---------------------------------------------------------------------------

test('Coordinated Maneuver: tryb A — obrażenia równe liczbie twoich stworów (3 → zabija 3/3)', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'plains', 'basic-plains', 'p1');
  put(state, 'c1', 'grollub', 'p1');
  put(state, 'c2', 'battle-hurda', 'p1');
  put(state, 'c3', 'vaporkin', 'p1'); // 3 stworów kontrolera czaru
  put(state, 'of', 'grollub', 'p2'); // 3/3 — zginie od 3 obrażeń
  put(state, 'cm', 'coordinated-maneuver', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });

  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'cm' && c.modeIndex === 0);
  assert.ok(cast, 'tryb A oferowany');
  assert.equal(execute(state, { ...cast, targets: ['of'] }).ok, true, 'rzut trybu A');
  resolveStack(state);
  const ofPo = [...state.objects.values()].find((o) => o.cardId === 'grollub' && o.controllerId === 'p2');
  assert.equal(ofPo?.zone, 'graveyard', '3 stworów → 3 obrażenia → 3/3 w grobie');
});

test('Coordinated Maneuver: tryb B — destroy target enchantment', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'plains', 'basic-plains', 'p1');
  put(state, 'enc', 'canonized-in-blood', 'p2'); // zwykły Enchantment (nie aura)
  put(state, 'cm', 'coordinated-maneuver', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });

  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'cm' && c.modeIndex === 1);
  assert.ok(cast, 'tryb B oferowany');
  assert.equal(execute(state, { ...cast, targets: ['enc'] }).ok, true, 'rzut trybu B');
  resolveStack(state);
  const encPo = [...state.objects.values()].find((o) => o.cardId === 'canonized-in-blood');
  assert.equal(encPo?.zone, 'graveyard', 'enchantment zniszczony (destroy)');
});

// ---------------------------------------------------------------------------
// 675. Kozilek's Translator — STAŁY koszt życia w aktywacji + Add {C} + raz/turę
// ---------------------------------------------------------------------------

test("Kozilek's Translator: Pay 1 life → Add {C}; druga aktywacja NIEOFEROWANA (oncePerTurn)", () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'trans', 'kozileks-translator', 'p1');
  const lifePrzed = lifeOf(state, 'p1');
  const act = commands(state, 'p1').find((c) => c.type === 'activate_ability' && c.objectId === 'trans');
  assert.ok(act, 'aktywacja oferowana (koszt 1 życia, bez {T})');
  assert.equal(execute(state, act).ok, true, 'aktywacja OK');
  assert.equal(lifeOf(state, 'p1'), lifePrzed - 1, 'koszt 1 życia zapłacony');
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.mana, 1, '1 mana w puli');
  assert.equal(p1.manaPool?.[''], 1, 'JEDNOSTKA BEZBARWNA ({C}) — pula bezbarwna');
  const druga = commands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === 'trans');
  assert.equal(druga.length, 0, 'oncePerTurn: druga aktywacja znika z oferty do końca tury');
});

test("Kozilek's Translator: aktywacja finansuje rzut {1}{B} (CR 605.3a) — Devoid: kolory puste", () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'swamp', 'basic-swamp', 'p1'); // jedyne kolorowe źródło ({B})
  put(state, 'trans', 'kozileks-translator', 'p1'); // jedyna druga mana (1 × {C})
  put(state, 'fod', 'fake-your-own-death', 'p1', 'hand'); // {1}{B} — 2 many, pip B

  // CR 605.3a: jednostka RĘCZNA (koszt życia) rozszerza ofertę rzutu już
  // PRZED aktywacją — wykonanie wymaga sekwencji aktywuj→rzuć (silnik nigdy
  // nie płaci kosztów ręcznych sam; kreator many/bot je sekwencjonuje).
  const bez = commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'fod');
  assert.equal(bez.length, 1, 'oferta rzutu widzi jednostkę ręczną Translatora (CR 605.3a)');

  // Sekwencja: aktywacja (życie −1, pula {C}) → rzut (pula płaci {C}, swamp {B}).
  const act = commands(state, 'p1').find((c) => c.type === 'activate_ability' && c.objectId === 'trans');
  assert.ok(act, 'aktywacja oferowana');
  assert.equal(execute(state, act).ok, true, 'aktywacja OK');
  assert.equal(lifeOf(state, 'p1'), 19, 'koszt życia przy aktywacji');
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'fod');
  assert.ok(cast, 'rzut {1}{B} po aktywacji');
  assert.equal(execute(state, { ...cast, targets: ['trans'] }).ok, true, 'rzut OK (pula {C} + {B})');
  resolveStack(state);
  assert.ok(state.events.some((e) => e.type === 'ability_activated' && e.cardId === 'kozileks-translator'),
    'event aktywacji zdolności many w logu');
  const fodPo = [...state.objects.values()].find((o) => o.cardId === 'fake-your-own-death');
  assert.equal(fodPo?.zone, 'graveyard', 'czar rozstrzygnięty i poszedł do grobu');

  // Devoid: kolory druku PUSTE (guard snapshotów pinuje front bezbarwny).
  const def = definition('kozileks-translator');
  assert.deepEqual(def.colors, [], 'Devoid = colors: []');
});

// ---------------------------------------------------------------------------
// 669. Lightning Spear — equipment (+1/+0 trample) i {2}{R}, sac → 3 obrażenia
// ---------------------------------------------------------------------------

test('Lightning Spear: equip {1} daje +1/+0 i trample; {2}{R} sac → 3 obrażenia any target', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'ls', 'lightning-spear', 'p1');
  put(state, 'sol', 'grollub', 'p1'); // gospodarz 3/3
  state.objects.set('sol', Object.freeze({ ...state.objects.get('sol'), summoningSickness: false }));
  addMana(state, 'p1', 1, { colors: ['R'] });

  const eq = commands(state, 'p1').find((c) => c.type === 'activate_ability' && c.objectId === 'ls' && c.targets?.[0] === 'sol');
  assert.ok(eq, 'equip {1} oferowany');
  assert.equal(execute(state, eq).ok, true, 'equip OK');
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('sol'), state), 4, '+1/+0 na wyposażonym');
  assert.ok(effectiveKeywords(state.objects.get('sol'), state).includes('trample'), 'trample na wyposażonym');

  // {2}{R}, Sacrifice: 3 obrażenia any target (gracz).
  addMana(state, 'p1', 3, { colors: ['R', 'R'] });
  const sac = commands(state, 'p1').find((c) => c.type === 'activate_ability' && c.objectId === 'ls' && c.targets?.includes('p2'));
  assert.ok(sac, 'aktywacja sac oferowana (cel: gracz)');
  assert.equal(execute(state, sac).ok, true, 'aktywacja OK');
  resolveStack(state);
  assert.equal(lifeOf(state, 'p2'), 17, '3 obrażenia do gracza (20−3)');
  const lsPo = [...state.objects.values()].find((o) => o.cardId === 'lightning-spear');
  assert.equal(lsPo?.zone, 'graveyard', 'sprzęt poświęcony (koszt)');
});

// ---------------------------------------------------------------------------
// 672. Malevolent Noble — koszt „Sacrifice an artifact or another creature"
// ---------------------------------------------------------------------------

test('Malevolent Noble: {2} + poświęcenie artefaktu → licznik; SAM nie kandyduje (another)', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'noble', 'malevolent-noble', 'p1');
  put(state, 'art', 'panic-spellbomb', 'p1'); // artefakt-kandydat
  addMana(state, 'p1', 2);

  const acts = commands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === 'noble');
  assert.ok(acts.length >= 1, 'aktywacja oferowana');
  assert.ok(acts.some((c) => c.sacrificeCreatureId === 'art'), 'artefakt jest kandydatem kosztu');
  assert.ok(!acts.some((c) => c.sacrificeCreatureId === 'noble'), '„another creature" — źródło nie kandyduje');

  const act = acts.find((c) => c.sacrificeCreatureId === 'art');
  assert.equal(execute(state, act).ok, true, 'aktywacja z poświęceniem artefaktu OK');
  resolveStack(state);
  assert.equal(state.objects.get('noble')?.counters?.['+1/+1'], 1, '+1/+1 counter na samym Noblu');
  const artPo = [...state.objects.values()].find((o) => o.cardId === 'panic-spellbomb');
  assert.equal(artPo?.zone, 'graveyard', 'artefakt poświęcony (koszt, CR 601.2h)');
});

// ---------------------------------------------------------------------------
// 674. Mister Gutsy — wyzwalacz Aura/Equipment + X Junk po śmierci
// ---------------------------------------------------------------------------

test('Mister Gutsy: cast Equipment i Aurę → 2 liczniki; zwykły artefakt NIE liczy (warunek)', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'gutsy', 'mister-gutsy', 'p1');
  put(state, 'host', 'grollub', 'p1'); // gospodarz aury
  put(state, 'pl', 'basic-plains', 'p1');
  put(state, 'sw', 'basic-swamp', 'p1');
  put(state, 'mt', 'basic-mountain', 'p1');
  put(state, 'ls', 'lightning-spear', 'p1', 'hand'); // Equipment {1}{R}
  addMana(state, 'p1', 2, { colors: ['R'] });

  const castEq = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'ls');
  assert.ok(castEq, 'Equipment rzucalny');
  assert.equal(execute(state, castEq).ok, true, 'rzut Equipment OK');
  resolveStack(state);
  assert.equal(state.objects.get('gutsy')?.counters?.['+1/+1'], 1, 'licznik za Equipment spell');

  put(state, 'au', 'hobble', 'p1', 'hand'); // Aura {2}{W}... koszt {W}{W}? hobble = {3}
  addMana(state, 'p1', 4, { colors: ['W', 'W'] });
  const castAu = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'au' && c.targets?.[0] === 'host');
  assert.ok(castAu, 'Aura rzucalna (cel: gospodarz)');
  assert.equal(execute(state, castAu).ok, true, 'rzut Aury OK');
  resolveStack(state);
  assert.equal(state.objects.get('gutsy')?.counters?.['+1/+1'], 2, 'drugi licznik za Aura spell');
});

test('Mister Gutsy: śmierć z 2 licznikami → 2 Junki; Junk: sac → exile top „may play this turn"', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'gutsy', 'mister-gutsy', 'p1');
  put(state, 'pl', 'basic-plains', 'p1');
  put(state, 'mt', 'basic-mountain', 'p1');
  // Dwa liczniki: cast Lightning Spear (Equipment).
  put(state, 'ls', 'lightning-spear', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const castEq = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'ls');
  assert.ok(castEq, 'Equipment rzucalny');
  assert.equal(execute(state, castEq).ok, true);
  resolveStack(state);
  // Drugi licznik: sac spear → 3 obrażenia w Gutsy (1/1) — umiera z 1 licznikiem.
  // Za mało: potrzebujemy DWA liczniki przed śmiercią — sac Spear oddaje 3
  // obrażenia, ale to tylko jeden cast. Dodatkowy licznik przez drugi Equipment
  // nie jest potrzebny — wystarczy sprawdzić X = liczba LICZNIKÓW: zdejmujemy
  // więc drugi licznik castem aury z ręki? Za ciężkie — używamy dodatku bezpośrednio
  // przez patch stanu (test liczy MECHANIKĘ kwoty, nie triggery — te są wyżej).
  state.objects.set('gutsy', Object.freeze({
    ...state.objects.get('gutsy'),
    counters: { '+1/+1': 2 },
  }));
  // Sac spear → 3 obrażenia na Gutsy → umiera → trigger dies.
  addMana(state, 'p1', 3, { colors: ['R', 'R'] });
  const lsId = [...state.objects.values()].find((o) => o.cardId === 'lightning-spear' && o.zone === 'battlefield')?.id;
  assert.ok(lsId, 'spear na polu bitwy');
  // Index zdolności sac w definicji (equip = 0, sac = 1) — oferta equip też
  // celuje w stworów, więc filtrujemy po INDEKSIE zdolności sacrificeSelf.
  const sacIndex = definition('lightning-spear').abilities.findIndex((a) => a.cost?.sacrificeSelf);
  const sac = commands(state, 'p1').find((c) => c.type === 'activate_ability'
    && c.objectId === lsId && c.abilityIndex === sacIndex && c.targets?.includes('gutsy'));
  assert.ok(sac, 'sac spear → 3 dmg any target oferowany');
  assert.equal(execute(state, sac).ok, true, 'sac OK');
  resolveStack(state);
  const gutsyPo = [...state.objects.values()].find((o) => o.cardId === 'mister-gutsy');
  assert.equal(gutsyPo?.zone, 'graveyard', 'Gutsy umiera od 3 obrażeń');
  const junk = [...state.objects.values()].filter((o) => o.cardId === 'token_junk');
  assert.equal(junk.length, 2, 'X = 2 liczniki → DWA tokeny Junk');
  assert.ok(junk.every((j) => j.zone === 'battlefield' && j.kind === 'artifact'), 'Junki to artefakty na polu bitwy');

  // Junk: {T}, Sacrifice → exile top, „you may play that card this turn".
  const act = commands(state, 'p1').find((c) => c.type === 'activate_ability' && junk.some((j) => j.id === c.objectId));
  assert.ok(act, 'aktywacja Junka oferowana (sorcery timing, własna main)');
  assert.equal(execute(state, act).ok, true, 'aktywacja Junka OK');
  resolveStack(state);
  const exiled = [...state.objects.values()].find((o) => o.zone === 'exile' && o.playableUntilTurn != null);
  assert.ok(exiled, 'wierzch biblioteki wygnany z oknem grywalności');
  assert.equal(exiled.playableUntilTurn, state.turn.number, 'okno THIS turn (window: this_turn)');
  const canPlay = commands(state, 'p1').some((c) => c.objectId === exiled.id && c.type === 'play_land');
  assert.ok(canPlay, 'wygnany ląd jest zagrywalny w tej turze (may play)');
});

test('Mister Gutsy: kontrola ujemna — cast zwykłego artefaktu NIE daje licznika (warunek typów)', () => {
  const state = game(75);
  library(state, 'p1'); library(state, 'p2');
  put(state, 'gutsy', 'mister-gutsy', 'p1');
  put(state, 'pl', 'basic-plains', 'p1');
  // Panic Spellbomb = zwykły artefakt (nie Equipment, nie Aura).
  put(state, 'bomb', 'panic-spellbomb', 'p1', 'hand');
  addMana(state, 'p1', 1);
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'bomb');
  assert.ok(cast, 'zwykły artefakt rzucalny');
  assert.equal(execute(state, cast).ok, true, 'rzut OK');
  resolveStack(state);
  const gutsyPo = state.objects.get('gutsy');
  assert.equal(gutsyPo?.counters?.['+1/+1'] ?? 0, 0, 'spellTypesInclude: brak licznika od zwykłego artefaktu');
});
