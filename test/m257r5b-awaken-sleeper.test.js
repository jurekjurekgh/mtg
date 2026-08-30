// M257 r5b/C (uwaga z testów, właściciel): Awaken the Sleeper.
//
// „Ta karta służy do tego, żeby przejąć kreaturę przeciwnika i zaatakować
// właściciela. Może też zniszczyć equipmenty które ma założone. Na koniec
// tury wraca do właściciela. Bot nie umie z niej korzystać. Przejął moją
// kreaturę, nic nie zrobił i zakończył turę. To bez sensu. Po co ją
// przejmował? Jak już przejął to powinien zaatakować właściciela. A
// najlepiej jakby przejął moją kreaturę z założonym equipmentem jeśli taki
// mam i go zniszczył. Ale jeśli nie ma takiej możliwości to przynajmniej
// powinien mnie zaatakować.”
//
// Root causes (docs/plans/PLAN_2026-08-30-m257r5b-uwagi-testow.md):
// 1. Wycena celu `cast_spell` nie miała gałęzi
//    `gain_control_until_end_of_turn` — wszystkie warianty celu dostawały
//    bazę 50 i wygrywał pierwszy z enumeracji (C3).
// 2. Wycena `declare_attackers` karała „śmierć” atakującego jak stratę
//    bota — a stwór pożyczony (generyczna flaga `tempControlUntilEOT`)
//    wraca do właściciela albo ginie JAKO STRATA WŁAŚCICIELA (C-chump).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

/** Karta z rejestru do strefy (deskryptor z `gameObjectDataOf`). */
function putCard(state, { id, cardId, controllerId, zone, kind }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Plain stwór z danymi (bez karty — jak wzorzec bot-combat-prevention). */
function vanilla(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Ekwipunek przypięty do `hostId` (kontrakt attach po dodaniu obiektu). */
function attachSword(state, hostId) {
  const sword = REGISTRY.get('warriors-sword');
  addObject(state, {
    id: 'sword', instanceId: 'i-sword', cardId: sword.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: sword.kind,
    ...gameObjectDataOf(sword), types: sword.types ?? [], keywords: sword.keywords ?? [],
    subtypes: sword.subtypes ?? [], spell: sword.spell,
  });
  state.objects.set('sword', Object.freeze({ ...state.objects.get('sword'), attachedTo: hostId, tapped: false }));
}

/**
 * Tura bota (p2) w main fazie: Awaken the Sleeper w ręce, mana {3}{R}+,
 * plansza do wstrzyknięcia przez `setup(state)`.
 */
function botTurnWithAwaken(setup) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  putCard(state, { id: 'awaken', cardId: 'awaken-the-sleeper', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  addMana(state, 'p2', 6, { colors: ['R', 'R', 'R', 'R', 'R', 'R'] });
  setup(state);
  return state;
}

/**
 * Pętla partii: bot (p2) gra heurystyką, p1 — pasuje (albo pierwsza legalna
 * komenda, gdy pass zablokowany decyzją). Zatrzymanie: koniec tury bota
 * (turn.number > 1) albo brak komendy.
 */
function runBotTurn(state, maxSteps = 60) {
  const bot = createHeuristicBot({ seed: 7 });
  const log = [];
  for (let i = 0; i < maxSteps; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const cmd = holder === 'p2'
      ? bot.chooseCommand(view, {})
      : (view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands[0]);
    if (!cmd) break;
    const result = execute(state, cmd);
    log.push({ holder, type: cmd.type, attackerIds: cmd.attackerIds, objectId: cmd.objectId, destroy: cmd.destroy, ok: result.ok });
    if (!result.ok) break;
    if (state.status !== 'active') break;
    if (state.turn.number > 1) break;
  }
  return { state, log };
}

/** Atakujący zadeklarowani w kroku declare_attackers pętli. */
function declaredAttackers(log) {
  const step = log.find((entry) => entry.type === 'declare_attackers');
  return step?.attackerIds ?? [];
}

// --- C1: otwarte pole — przejęty stwór ATAKUJE (obrażenia na właściciela) --

test('C1: otwarte pole — bot przejmuję i atakuje przejętym stworem (obrażenia na p1)', () => {
  const { state, log } = runBotTurn(botTurnWithAwaken((s) => {
    vanilla(s, 'victim', 'p1', 4, 4);
  }));
  const cast = log.find((entry) => entry.type === 'cast_spell' && entry.objectId === 'awaken');
  assert.ok(cast?.ok, 'bot rzuca Awaken the Sleeper');
  const attackers = declaredAttackers(log);
  assert.ok(attackers.includes('victim'),
    `bot MUSI zaatakować przejętym stworem (właściciel: „przynajmniej powinien mnie zaatakować"); atakujący: ${JSON.stringify(attackers)}`);
  const ownerLife = state.players.find((p) => p.id === 'p1').life;
  assert.ok(ownerLife < 20, `otwarty atak 4/4 rani właściciela (życie p1: ${ownerLife})`);
});

// --- C2: scenariusz właściciela — 5/5 z equipmentem + 5/5 bloker ----------
// Bot: przejmuję 5/5, NISZCZY equipment, atakuje. Bloker 5/5 go blokuje →
// wymiana — oba stworы WŁAŚCICIELA giną, bot nie traci niczego. Przed fixem
// atak był opłacalny i tak (wymiana power-1), ale test pilnuje całości:
// przejęcie + destroy + atak w jednym przebiegu.

test('C2: 5/5 z equipmentem + bloker 5/5 — bot niszczy equipment i atakuje (wymiana kosztuje p1 DWA stwory)', () => {
  const { state, log } = runBotTurn(botTurnWithAwaken((s) => {
    vanilla(s, 'victim', 'p1', 5, 5);
    vanilla(s, 'blocker', 'p1', 5, 5);
    attachSword(s, 'victim');
  }));
  const cast = log.find((entry) => entry.type === 'cast_spell' && entry.objectId === 'awaken');
  assert.ok(cast?.ok, 'bot rzuca Awaken the Sleeper');
  const destroy = log.find((entry) => entry.type === 'resolve_destroy_equipment_choice');
  assert.equal(destroy?.ok, true, 'decyzja o zniszczeniu equipmentu rozstrzygnięta');
  assert.equal(destroy?.destroy, true, 'equipment ZNISZCZONY (właściciel: „i go zniszczył”)');
  assert.ok(state.zones.battlefield.filter((id) => state.objects.get(id)?.cardId === 'warriors-sword').length === 0,
    'sword z pola bitwy');
  const attackers = declaredAttackers(log);
  assert.ok(attackers.includes('victim'),
    `bot atakuje przejętym 5/5 mimo 5/5 blokera (strata to koszt WŁAŚCICIELA); atakujący: ${JSON.stringify(attackers)}`);
});

// --- C-chump: przejęty SŁABSZY od blokera — atak i tak (RED przed fixem) --
// Przed fixem: wycena celu nie istniała (bot przejmował pierwszą kreaturę z
// enumeracji — blokera 5/5, nie wyposażoną ofiarę) i gałąź „chump” karała
// atakujący jak stratę własną (-10) → atak=[] i tura kończyła się.

test('C-chump: 2/2 z equipmentem + bloker 5/5 — bot przejmuję WYPOSAŻONEGO i atakuje mimo chumpu', () => {
  const { log } = runBotTurn(botTurnWithAwaken((s) => {
    vanilla(s, 'victim', 'p1', 2, 2);
    vanilla(s, 'blocker', 'p1', 5, 5);
    attachSword(s, 'victim');
  }));
  const cast = log.find((entry) => entry.type === 'cast_spell' && entry.objectId === 'awaken');
  assert.ok(cast?.ok, 'bot rzuca Awaken the Sleeper');
  const attackers = declaredAttackers(log);
  assert.ok(attackers.includes('victim'),
    `bot MUSI zaatakować przejętym 2/2 (chump = strata WŁAŚCICIELA, nie bota); atakujący: ${JSON.stringify(attackers)}`);
  assert.ok(!attackers.includes('blocker'),
    'bot nie przejmął blokera 5/5 (cel z equipmentem ma pierwszeństwo)');
});

// --- C3: wybór celu — cel z equipmentem wygrywa z większym bez (RED fix) --

test('C3: wybór celu — 1/1 z equipmentem pokonuje 4/4 bez (wycena celu cast_spell)', () => {
  const state = botTurnWithAwaken((s) => {
    vanilla(s, 'small-eq', 'p1', 1, 1);
    attachSword(s, 'small-eq');
    vanilla(s, 'big', 'p1', 4, 4);
  });
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  assert.equal(choice.type, 'cast_spell', `bot rzuca Awaken: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'awaken');
  assert.equal(choice.targets?.[0], 'small-eq',
    `cel z equipmentem ma pierwszeństwo (właściciel: „najlepiej… z założonym equipmentem”); cel: ${JSON.stringify(choice.targets)}`);
});

// --- C4 (anty-overfix): przejęty stwór WRACA do właściciela po turze ------
// Fix bota nie rusza reguł silnika: czasowa kontrola kończy się z turą
// (inwariant engine — cleanup rewersuje kontrolera).

test('C4 (anty-overfix): czasowa kontrola wraca do właściciela po końcu tury (reguły silnika bez zmian)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const victim = vanilla(state, 'victim', 'p1', 4, 4);
  // Symulacja rozstrzygnięcia gain_control_until_end_of_turn (efekty.js).
  state.objects.set('victim', Object.freeze({
    ...victim, controllerId: 'p2', summoningSickness: false,
    keywordGrants: ['haste'], tempControlUntilTurn: state.turn.number, tempControlOwner: 'p1',
  }));
  assert.equal(state.objects.get('victim').controllerId, 'p2', 'kontrola przejęta');
  // Prowadźmy turę bota do końca (same passy — nikt nic nie robi).
  for (let i = 0; i < 80 && state.turn.number < 2; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('declare_'))
      ?? view.legalCommands[0];
    if (!cmd) break;
    const result = execute(state, cmd);
    if (!result.ok) break;
  }
  assert.ok(state.turn.number >= 2, 'tura bota zakończona');
  const after = state.objects.get('victim');
  assert.equal(after.controllerId, 'p1', 'stwór wrócił do WŁAŚCICIELA (CR: czasowa kontrola do końca tury)');
  assert.equal(after.tempControlUntilTurn, null, 'flaga czasowej kontroli wyczyszczona');
});

// --- C5 (anty-overfix): bez wrogiej kreatury czar NIE jest rzucany ---------

test('C5 (anty-overfix): bot nie rzuca Awaken na WŁASNY stwór (brak wrogiego celu = kara)', () => {
  const state = botTurnWithAwaken((s) => {
    // Tylko własny stwór bota + ląd — wroga stwór NIE MA.
    vanilla(s, 'own', 'p2', 4, 4);
  });
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'awaken', true,
    `brak wrogiej kreatury — Awaken to marnotrawstwo: ${JSON.stringify(choice)}`);
});
