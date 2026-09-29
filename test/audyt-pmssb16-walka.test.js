import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

// PMSSB-16 (metoda M429) — walka bez fazy walki: `fight` (3) +
// `damage_from_target_power` (bite, 3) + `damage_creatures_with_keyword` (1).
// Semantyka engine = CR 701.14a–d (cytaty dosłowne w helperze
// fightExchangeValue): damage NIE-bojowe → deathtouch (704.5h) i lifelink
// działają, first strike/trample nie.
//
// Findingi (pomiar PRZED: /tmp/pmssb16-walka-przed.mjs — ranking był
// ODWRÓCONY: wymiana w dół 119 > kill-only 103 > wygrana DT 47!):
//   R1 — ridery czaru (pump/add_counter) muszą liczyć się w mocy walczącego
//     PRZED damage (bite liczył tylko pump — Knockout Maneuver; fight tylko
//     counter warunkowy — Hunt the Weak).
//   R2 — deathtouch w progach zabicia/śmierci w obu kierunkach.
//   R3 — lifelink (CR 701.14d): bite/fight moim lifelinkiem = zysk życia.
//   R4 — wymiana (oba giną) = różnica ciał ×2 − koszt dodatkowej karty;
//     wymiana w dół musi PRZEBIĆ bazę czaru (konwencja M167/F).
//   R5 — guard kierunku bite we własnego stwora (defence-in-depth jak M231;
//     targety typowane w kartach blokują zły kierunek — guard niedosięgalny
//     przez legalCommands obecnych kart, dlatego bez testu scenariuszowego).
//   R6 — okno walki: zabicie ich napastnika z lethalem PRZED obrażeniami =
//     reuse skali fog (fogWindowLethalSaveValue 40).
//
// Anty-over-fix (M429): kill-only (25+2·p) i bite (8+2·p+(15)) = dawne
// wartości Batch 45 — S01=103 i S05b=94 to kotwice historyczne.

const REGISTRY = createCardRegistry();

function putSpell(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
    ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function base() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (let i = 0; i < 8; i++) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function decide(state, params = undefined) {
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(view, {});
  const last = bot.trace().at(-1) ?? {};
  return { choice, options: last.options ?? [] };
}

function optionScore(options, cmd) {
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak opcji ${cmd} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

function fightBoard({ myCard, myP, myT, foeP, foeT, myExtra = {}, foeExtra = {} }) {
  const state = base();
  putSpell(state, 'w', myCard, 'p2', 'hand');
  putCreature(state, 'mine', 'p2', myP, myT, myExtra);
  putCreature(state, 'foe', 'p1', foeP, foeT, foeExtra);
  return state;
}

// ---------------------------------------------------------------------------
// Anty-over-fix — kotwice historyczne (Batch 45 nietknięte w swoich oknach).
// ---------------------------------------------------------------------------

test('PMSSB-16/anty-over-fix: fight kill-only 3/3 vs 2/2 = wartość historyczna (103)', () => {
  const state = fightBoard({ myCard: 'hunt-the-weak', myP: 3, myT: 3, foeP: 2, foeT: 2 });
  const { choice, options } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'w', targets: ['mine', 'foe'] });
  assert.equal(optionScore(options, 'cast_spell(w->mine+foe)'), 103);
});

test('PMSSB-16/anty-over-fix: bite 3/3 vs 2/2 bez riderów = wartość historyczna (94)', () => {
  const state = fightBoard({ myCard: 'assert-perfection', myP: 3, myT: 3, foeP: 2, foeT: 2 });
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(w->mine+foe)'), 94);
});

// ---------------------------------------------------------------------------
// R2 — deathtouch w obu kierunkach.
// ---------------------------------------------------------------------------

test('PMSSB-16/R2: mój 1/1 DEATHTOUCH zjada 6/6 — DT w progu zabicia', () => {
  const state = fightBoard({
    myCard: 'hunt-the-weak', myP: 1, myT: 1, foeP: 6, foeT: 6,
    myExtra: { keywords: ['deathtouch'] },
  });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'cast_spell', 'wygrana DT ma być wzięta');
  const score = optionScore(options, 'cast_spell(w->mine+foe)');
  // Dawniej 47 (DT niewidoczne = „nic + mój ginie"); dziś wymiana w górę.
  assert.equal(score, 49);
});

test('PMSSB-16/R2+R4: ich 1/1 DEATHTOUCH = realna wymiana w dół — NIE rzucać', () => {
  const state = fightBoard({
    myCard: 'hunt-the-weak', myP: 6, myT: 6, foeP: 1, foeT: 1,
    foeExtra: { keywords: ['deathtouch'] },
  });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'pass_priority', 'wymiana 6/6 w ich 1/1-DT ma przegrywać z passem');
  // R4: wymiana = różnica ciał ×2 − koszt karty; kara musi przebić bazę (50).
  assert.equal(optionScore(options, 'cast_spell(w->mine+foe)'), -11);
});

// ---------------------------------------------------------------------------
// R1 — ridery czaru w mocy walczącego PRZED damage.
// ---------------------------------------------------------------------------

test('PMSSB-16/R1: bite liczy add_counter (Knockout Maneuver 2/2→3/3 zabija 3/3)', () => {
  const state = fightBoard({ myCard: 'knockout-maneuver', myP: 2, myT: 2, foeP: 3, foeT: 3 });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'cast_spell');
  // 50 + (8 + 2·3 + 15 lethal z countera) + wartość trwałego licznika.
  assert.equal(optionScore(options, 'cast_spell(w->mine+foe)'), 97);
});

test('PMSSB-16/R1: fight liczy bezwarunkowy counter (Hunt the Weak 3/3+1 vs 4/4)', () => {
  const state = fightBoard({ myCard: 'hunt-the-weak', myP: 3, myT: 3, foeP: 4, foeT: 4 });
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'cast_spell', 'wymiana równa z riderem bywa marginalnie warta');
  // Wymiana równa (4/4 vs 4/4): 50 − 25 koszt karty + licznik − oddany licznik.
  assert.equal(optionScore(options, 'cast_spell(w->mine+foe)'), 25);
});

// ---------------------------------------------------------------------------
// R3 — lifelink (CR 701.14d: damage nie-bojowe).
// ---------------------------------------------------------------------------

test('PMSSB-16/R3: bite moim lifelinkiem dolicza zysk życia (97 vs 94 bez)', () => {
  const withLink = fightBoard({
    myCard: 'assert-perfection', myP: 3, myT: 3, foeP: 2, foeT: 2,
    myExtra: { keywords: ['lifelink'] },
  });
  const without = fightBoard({ myCard: 'assert-perfection', myP: 3, myT: 3, foeP: 2, foeT: 2 });
  const a = optionScore(decide(withLink).options, 'cast_spell(w->mine+foe)');
  const b = optionScore(decide(without).options, 'cast_spell(w->mine+foe)');
  assert.equal(a - b, 3, 'lifelink 3 mocy = +3 życia (gainLifeValue)');
});

// ---------------------------------------------------------------------------
// R6 — okno walki (reuse skali fog L41).
// ---------------------------------------------------------------------------

test('PMSSB-16/R6: instant-bite ich napastnika z lethalem na twarz = ratunek', () => {
  const state = base();
  putSpell(state, 'w', 'diplomatic-relations', 'p2', 'hand');
  putCreature(state, 'mine', 'p2', 4, 4);
  putCreature(state, 'foe', 'p1', 4, 4);
  state.players.find((p) => p.id === 'p2').life = 4;
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = { attackingPlayerId: 'p1', attackers: ['foe'], blockers: new Map(), blockedAttackers: new Set() };
  const { choice, options } = decide(state);
  assert.equal(choice.type, 'cast_spell', 'ratunek z lethalem ma wygrywać');
  // Bite (8+2·4+15=31) + pump(15) + baza 50 = bez ratunku 2; +40 lethal-save.
  assert.equal(optionScore(options, 'cast_spell(w->mine+foe)'), 42);
});

// ---------------------------------------------------------------------------
// Pokrętła — parametr = jedyne miejsce z wartością.
// ---------------------------------------------------------------------------

test('PMSSB-16/pokrętła: fightTradeCardCost = 0 zdejmuje karę wymiany (jedyne miejsce)', () => {
  const build = () => fightBoard({
    myCard: 'hunt-the-weak', myP: 6, myT: 6, foeP: 1, foeT: 1,
    foeExtra: { keywords: ['deathtouch'] },
  });
  const base1 = decide(build());
  assert.equal(optionScore(base1.options, 'cast_spell(w->mine+foe)'), -11);
  const tweaked = decide(build(), { ...DEFAULT_HEURISTIC_PARAMS, fightTradeCardCost: 0 });
  assert.equal(optionScore(tweaked.options, 'cast_spell(w->mine+foe)'), 14);
});

// ---------------------------------------------------------------------------
// Drabina wartości — kolejność okien wg taktyki (kill-only > wymiana w górę
// > wymiana równa > wymiana w dół).
// ---------------------------------------------------------------------------

test('PMSSB-16/drabina: kill-only > wymiana w górę > wymiana równa > wymiana w dół', () => {
  const killOnly = optionScore(decide(fightBoard({
    myCard: 'hunt-the-weak', myP: 3, myT: 3, foeP: 2, foeT: 2,
  })).options, 'cast_spell(w->mine+foe)');
  const upTrade = optionScore(decide(fightBoard({
    myCard: 'hunt-the-weak', myP: 1, myT: 1, foeP: 6, foeT: 6,
    myExtra: { keywords: ['deathtouch'] },
  })).options, 'cast_spell(w->mine+foe)');
  const evenTrade = optionScore(decide(fightBoard({
    myCard: 'hunt-the-weak', myP: 3, myT: 3, foeP: 4, foeT: 4,
  })).options, 'cast_spell(w->mine+foe)');
  const downTrade = optionScore(decide(fightBoard({
    myCard: 'hunt-the-weak', myP: 6, myT: 6, foeP: 1, foeT: 1,
    foeExtra: { keywords: ['deathtouch'] },
  })).options, 'cast_spell(w->mine+foe)');
  assert.ok(killOnly > upTrade, `kill-only ${killOnly} > up-trade ${upTrade}`);
  assert.ok(upTrade > evenTrade, `up-trade ${upTrade} > even ${evenTrade}`);
  assert.ok(evenTrade > downTrade, `even ${evenTrade} > down ${downTrade}`);
});
