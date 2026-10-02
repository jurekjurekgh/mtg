// Batch 62 (2026-10-02) — karty właściciela: 176 FIN, 178 EOE, 192 OGW,
// 194 GPT, 196 THS, 198 SOS, 203 2XM, 205 DTK, 208 RIX, 210 2X2 — razem 10 kart.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-10-02,
// ADR 0010 §2a, ADR 0028 — rulingi „przy kartce", także puste listy).
// Katalog: `src/cards/card-data.js`; artId z numerów wierszy arkusza właściciela
// (`<nr><SET>` w `tools/collection-art-ids.csv`). Plan batcha:
// `docs/plans/PLAN_2026-10-02-batch62-kolekcja-176-210.md`.
//
// Podział na sekcje = transze batcha (B62/<nr arkusza>). Każda sekcja ma
// sanity danych Oracle/druku, scenariusz legalny i nielegalny (maszynowo
// rozpoznawalny brak oferty) oraz interakcje z rulingów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 62, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 6; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
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

/**
 * Rozstrzyga stos i decyzje „resolve_*" do końca, ale zatrzymuje się, gdy
 * `stopWhen(s)` zwróci prawdę (np. oczekiwana decyzja gracza).
 */
function settle(s, stopWhen = () => false, max = 60) {
  for (let i = 0; i < max; i++) {
    if (stopWhen(s)) return;
    const idle = s.zones.stack.length === 0 && s.pendingTriggerTargets.length === 0
      && !(s.pendingExploits?.length);
    const choices = commands(s);
    if (idle && !choices.some((c) => c.type.startsWith('resolve_'))) return;
    const pick = choices.find((c) => c.type === 'pass_priority' && s.zones.stack.length)
      ?? choices.find((c) => c.type.startsWith('resolve_'))
      ?? choices.find((c) => c.type === 'pass_priority');
    if (!pick) return;
    run(s, pick);
  }
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);
const inHand = (s, cardId, ownerId) => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === 'hand' && o.ownerId === ownerId);

/** Snapshot Scryfall jest źródłem prawdy o Oracle: definicja musi się z nim zgadzać. */
function snapshotOf(slug) {
  return JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));
}

function sanity(id, { set, plan, artId, snapshot = id }) {
  const def = registry.get(id);
  const snap = snapshotOf(snapshot);
  assert.equal(def.oracleText, snap.oracle_text, 'Oracle 1:1 ze snapshotem Scryfalla');
  assert.equal(def.set, set);
  assert.equal(def.plan, plan, 'Plan z listy właściciela wiążący');
  assert.equal(def.artId, artId);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(MANA_COSTS[id], snap.mana_cost, 'koszt many w tabeli = Scryfall');
  assert.equal(snap.print, set.toLowerCase(), 'druk właściciela (set=)');
  assert.ok(Array.isArray(snap.rulings), 'rulingi pobrane (także pusta lista, ADR 0028)');
  assert.ok(def.imageUri.includes(snap.image_uris.large.split('/').pop().split('.')[0]), 'imageUri z druku właściciela');
  return def;
}

// ---- B62/194: Lionheart Maverick (GPT #11, plan Warhammer Fantasy) ----------

test('B62/194: Lionheart Maverick — dane Oracle, 1/1 Human Knight z czujnością i druk GPT', () => {
  const def = sanity('lionheart-maverick', { set: 'GPT', plan: 'Warhammer Fantasy', artId: 194 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Knight']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 1);
  assert.deepEqual(def.keywords, ['vigilance']);
});

test('B62/194: Lionheart Maverick — {4}{W}: +1/+2 do końca tury, a vigilance zostaje', () => {
  const state = game();
  put(state, 'maverick', 'lionheart-maverick', 'p1', 'battlefield');
  addMana(state, 'p1', 5, { colors: ['W'] });
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'maverick');
  assert.ok(act, 'aktywacja za {4}{W} jest oferowana');
  run(state, act);
  settle(state);
  const live = state.objects.get('maverick');
  assert.equal(effectivePower(live, state), 2, 'siła 1 → 2');
  assert.equal(effectiveToughness(live, state), 3, 'wytrzymałość 1 → 3');
  assert.ok(effectiveKeywords(live, state).includes('vigilance'), 'czujność');
});

test('B62/194: Lionheart Maverick — pięć many bezbarwnych NIE opłaca {W} (brak oferty), cztery białe to za mało', () => {
  const state = game();
  put(state, 'maverick', 'lionheart-maverick', 'p1', 'battlefield');
  addMana(state, 'p1', 5, { colors: [] }); // JAWNIE bezbarwna (default addMana = dowolny kolor)
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'maverick'),
    'bezbarwna mana nie opłaca białego pipu');
  const state2 = game();
  put(state2, 'maverick', 'lionheart-maverick', 'p1', 'battlefield');
  addMana(state2, 'p1', 4, { colors: ['W'] });
  assert.ok(!commands(state2).some((c) => c.type === 'activate_ability' && c.objectId === 'maverick'),
    'cztery many to za mało na {4}{W}');
});

// ---- B62/196: Mnemonic Wall (THS #55, plan Theros) --------------------------

test('B62/196: Mnemonic Wall — dane Oracle, 0/4 Wall z defender i druk THS', () => {
  const def = sanity('mnemonic-wall', { set: 'THS', plan: 'Theros', artId: 196 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Wall']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.power, 0);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 5);
  assert.deepEqual(def.keywords, ['defender']);
  const etb = def.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.equal(etb.trigger.mayFire, true, 'Oracle: „you may return\" — decyzja przy rozstrzyganiu');
});

test('B62/196: Mnemonic Wall — ETB zwraca instant/sorcery z własnego grobu do ręki', () => {
  const state = game();
  put(state, 'wall', 'mnemonic-wall');
  put(state, 'boon', 'dragonscale-boon', 'p1', 'graveyard'); // instant
  put(state, 'ritual', 'fireball', 'p1', 'graveyard');       // sorcery
  addMana(state, 'p1', 5, { colors: ['U'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'wall'));
  settle(state, (s) => commands(s).some((c) => c.type === 'resolve_trigger_target'));
  const pick = commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'boon');
  assert.ok(pick, 'instant z własnego grobu jest legalnym celem');
  assert.ok(commands(state).some((c) => c.type === 'resolve_trigger_target' && c.targetId === 'ritual'),
    'sorcery z własnego grobu też');
  run(state, pick);
  settle(state);
  assert.ok(inHand(state, 'dragonscale-boon', 'p1'), 'instant wrócił do ręki');
  assert.ok(find(state, 'fireball', 'graveyard'), 'drugi czar został w grobie');
});

test('B62/196: Mnemonic Wall — cel nielegalny: stwór w grobie i grób przeciwnika', () => {
  const state = game();
  put(state, 'wall', 'mnemonic-wall');
  put(state, 'bear', 'razorfoot-griffin', 'p1', 'graveyard');        // stwór — nie instant/sorcery
  put(state, 'enemy-boon', 'dragonscale-boon', 'p2', 'graveyard');   // grób przeciwnika
  addMana(state, 'p1', 5, { colors: ['U'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'wall'));
  settle(state);
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target' && c.targetId),
    'brak legalnych celów — trigger nie prosi o cel');
  assert.ok(!inHand(state, 'dragonscale-boon', 'p2'), 'karta przeciwnika nietknięta');
  assert.ok(find(state, 'razorfoot-griffin', 'graveyard'), 'stwór został w grobie');
});

test('B62/196: Mnemonic Wall — „you may\": rezygnacja zostawia kartę w grobie', () => {
  const state = game();
  put(state, 'wall', 'mnemonic-wall');
  put(state, 'boon', 'dragonscale-boon', 'p1', 'graveyard');
  addMana(state, 'p1', 5, { colors: ['U'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'wall'));
  settle(state, (s) => commands(s).some((c) => c.type === 'resolve_trigger_target'));
  run(state, commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'boon'));
  settle(state, (s) => commands(s).some((c) => c.type === 'resolve_optional_trigger_choice'));
  const choice = commands(state);
  assert.ok(choice.some((c) => c.type === 'resolve_optional_trigger_choice' && c.fire === true), 'oferta „zwróć\"');
  // F1 (2026-09-23c): odmowa „you may\" to zwykły pass, nie osobna komenda.
  const decline = choice.find((c) => c.type === 'pass_priority');
  assert.ok(decline, 'oferta rezygnacji — Oracle ma „you may\"');
  run(state, decline);
  settle(state);
  assert.ok(find(state, 'dragonscale-boon', 'graveyard'), 'karta została w grobie');
  assert.ok(!inHand(state, 'dragonscale-boon', 'p1'), 'nic nie wróciło do ręki');
});

// ---- B62/205: Vulturous Aven (DTK #126, plan Tarkir) ------------------------

test('B62/205: Vulturous Aven — dane Oracle, 2/3 Bird Shaman z lataniem i exploit', () => {
  const def = sanity('vulturous-aven', { set: 'DTK', plan: 'Tarkir', artId: 205 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Bird', 'Shaman']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 4);
  assert.deepEqual(def.keywords, ['flying']);
  assert.ok(def.exploit, 'Exploit (CR 702.110)');
});

const exploitPending = (s) => commands(s).some((c) => c.type === 'resolve_exploit_choice');

test('B62/205: Vulturous Aven — poświęcenie stwora: dobierz dwie karty i strać 2 życia', () => {
  const state = game();
  put(state, 'food', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'aven', 'vulturous-aven');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'aven'));
  settle(state, exploitPending);
  const offers = commands(state).filter((c) => c.type === 'resolve_exploit_choice');
  assert.ok(offers.some((c) => c.skip === true), 'można odmówić');
  assert.ok(offers.some((c) => c.targetId === 'food'), 'można poświęcić innego stwora');
  const avenId = find(state, 'vulturous-aven').id;
  assert.ok(offers.some((c) => c.targetId === avenId), 'ruling DTK: można poświęcić także samego Avena');
  run(state, offers.find((c) => c.targetId === 'food'));
  settle(state);
  assert.equal(player(state, 'p1').life, 18, 'strata 2 życia');
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter - handBefore, 2 - 1 /* Aven opuścił rękę */, 'dobrano dwie karty');
  assert.ok(find(state, 'goblin-piker', 'graveyard') || [...state.objects.values()].some((o) => o.cardId === 'goblin-piker' && o.zone === 'graveyard'), 'ofiara w grobie');
  assert.ok(find(state, 'vulturous-aven'), 'Aven zostaje na polu');
});

test('B62/205: Vulturous Aven — rezygnacja z exploit NIE odpala zdolności (brak dobierania i utraty życia)', () => {
  const state = game();
  put(state, 'food', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'aven', 'vulturous-aven');
  addMana(state, 'p1', 4, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'aven'));
  settle(state, exploitPending);
  run(state, commands(state).find((c) => c.type === 'resolve_exploit_choice' && c.skip === true));
  settle(state);
  assert.equal(player(state, 'p1').life, 20, 'życie bez zmian');
  assert.equal(state.objects.get('food').zone, 'battlefield', 'nikogo nie poświęcono');
});

test('B62/205: Vulturous Aven — poświęcenie samego siebie też odpala zdolność (ruling 2015-02-25)', () => {
  const state = game();
  put(state, 'aven', 'vulturous-aven');
  addMana(state, 'p1', 4, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'aven'));
  settle(state, exploitPending);
  run(state, commands(state).find((c) => c.type === 'resolve_exploit_choice' && c.targetId === find(state, 'vulturous-aven').id));
  settle(state);
  assert.equal(player(state, 'p1').life, 18, 'trigger „exploits a creature\" odpalił mimo ofiary-Avena');
  assert.ok(find(state, 'vulturous-aven', 'graveyard'), 'Aven w grobie');
});

// ---- B62/208: Jade Bearer (RIX #134, plan Ixalan) ---------------------------

test('B62/208: Jade Bearer — dane Oracle, 1/1 Merfolk Shaman i druk RIX', () => {
  const def = sanity('jade-bearer', { set: 'RIX', plan: 'Ixalan', artId: 208 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Merfolk', 'Shaman']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 1);
});

test('B62/208: Jade Bearer — ETB kładzie licznik +1/+1 na jedynym innym Merfolku (cel automatyczny)', () => {
  const state = game();
  put(state, 'guard', 'maritime-guard', 'p1', 'battlefield'); // Merfolk Soldier 1/3
  put(state, 'bearer', 'jade-bearer');
  addMana(state, 'p1', 1, { colors: ['G'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bearer'));
  settle(state);
  assert.equal(state.objects.get('guard').counters['+1/+1'], 1, 'licznik na Merfolku');
  assert.ok(!find(state, 'jade-bearer').counters?.['+1/+1'], 'Jade Bearer sam nie dostaje licznika (another)');
});

test('B62/208: Jade Bearer — przy dwóch Merfolkach gracz wybiera cel (Bearer nie jest kandydatem)', () => {
  const state = game();
  put(state, 'guard', 'maritime-guard', 'p1', 'battlefield');
  put(state, 'thief', 'scroll-thief', 'p1', 'battlefield'); // Merfolk Rogue 1/3
  put(state, 'bearer', 'jade-bearer');
  addMana(state, 'p1', 1, { colors: ['G'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bearer'));
  settle(state, (s) => commands(s).some((c) => c.type === 'resolve_trigger_target'));
  const targets = commands(state).filter((c) => c.type === 'resolve_trigger_target' && c.targetId);
  assert.deepEqual(targets.map((c) => c.targetId).sort(), ['guard', 'thief']);
  run(state, targets.find((c) => c.targetId === 'thief'));
  settle(state);
  assert.equal(state.objects.get('thief').counters['+1/+1'], 1, 'licznik na wybranym Merfolku');
  assert.ok(!state.objects.get('guard').counters?.['+1/+1'], 'drugi Merfolk bez licznika');
});

test('B62/208: Jade Bearer — cel nielegalny: sam Bearer, nie-Merfolk i Merfolk przeciwnika', () => {
  const state = game();
  put(state, 'goblin', 'goblin-piker', 'p1', 'battlefield');        // nie Merfolk
  put(state, 'enemy-guard', 'maritime-guard', 'p2', 'battlefield'); // Merfolk przeciwnika
  put(state, 'bearer', 'jade-bearer');
  addMana(state, 'p1', 1, { colors: ['G'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bearer'));
  settle(state);
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target' && c.targetId),
    'brak legalnego celu — trigger nic nie robi (Bearer to „another\" nie ma siebie na celu)');
  for (const cardId of ['goblin-piker', 'maritime-guard', 'jade-bearer']) {
    for (const o of [...state.objects.values()].filter((x) => x.cardId === cardId && x.zone === 'battlefield')) {
      assert.ok(!o.counters?.['+1/+1'], `${cardId} bez licznika`);
    }
  }
});
