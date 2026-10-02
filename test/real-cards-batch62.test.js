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
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

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

// ---- B62/198: Tackle Artist (SOS #133, plan Arcavios) -----------------------

const countersOf = (s, id) => s.objects.get(id).counters?.['+1/+1'] ?? 0;
const castSpell = (s, objectId, targets) => run(s, commands(s).find((c) => c.type === 'cast_spell'
  && c.objectId === objectId && (targets === undefined || JSON.stringify(c.targets) === JSON.stringify(targets))));

test('B62/198: Tackle Artist — dane Oracle, 4/3 Orc Sorcerer z trample i druk SOS', () => {
  const def = sanity('tackle-artist', { set: 'SOS', plan: 'Arcavios', artId: 198 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Orc', 'Sorcerer']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 4);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 4);
  assert.deepEqual(def.keywords, ['trample']);
});

test('B62/198: Tackle Artist — Opus: czar za mniej niż pięć many daje JEDEN licznik', () => {
  const state = game();
  put(state, 'artist', 'tackle-artist', 'p1', 'battlefield');
  put(state, 'ts', 'titans-strength', 'p1', 'hand'); // {R}
  addMana(state, 'p1', 1, { colors: ['R'] });
  castSpell(state, 'ts', ['artist']);
  settle(state);
  assert.equal(countersOf(state, 'artist'), 1);
  // +3/+1 z samego czaru do końca tury + 1 licznik: 4+1+3 = 8
  assert.equal(effectivePower(state.objects.get('artist'), state), 8);
});

test('B62/198: Tackle Artist — granica progu: cztery many → 1 licznik, pięć many → 2 liczniki', () => {
  const four = game();
  put(four, 'artist', 'tackle-artist', 'p1', 'battlefield');
  put(four, 'feed', 'feed-the-infection', 'p1', 'hand'); // {2}{B}{B}
  addMana(four, 'p1', 4, { colors: ['B'] });
  castSpell(four, 'feed');
  settle(four);
  assert.equal(countersOf(four, 'artist'), 1, 'cztery wydane = poniżej progu');

  const five = game();
  put(five, 'artist', 'tackle-artist', 'p1', 'battlefield');
  put(five, 'myst', 'mysteries-of-the-deep', 'p1', 'hand'); // {3}{U}{U}
  addMana(five, 'p1', 5, { colors: ['U'] });
  castSpell(five, 'myst');
  settle(five);
  assert.equal(countersOf(five, 'artist'), 2, 'pięć wydanych = dwa liczniki zamiast jednego (nie 3)');
});

test('B62/198: Tackle Artist — Opus rozstrzyga się PRZED czarem, który go wywołał (ruling 2026-03-20)', () => {
  const state = game();
  put(state, 'artist', 'tackle-artist', 'p1', 'battlefield');
  put(state, 'myst', 'mysteries-of-the-deep', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['U'] });
  castSpell(state, 'myst');
  assert.equal(state.zones.stack.length, 2, 'czar + zdolność Opus na stosie');
  assert.equal(countersOf(state, 'artist'), 0, 'przed rozstrzygnięciem stosu licznika jeszcze nie ma');
  run(state, commands(state).find((c) => c.type === 'pass_priority'));
  if (state.zones.stack.length === 2) run(state, commands(state).find((c) => c.type === 'pass_priority'));
  assert.equal(state.zones.stack.length, 1, 'zdolność zeszła ze stosu pierwsza');
  assert.equal(countersOf(state, 'artist'), 2, 'licznik już leży, czar wciąż czeka na stosie');
});

test('B62/198: Tackle Artist — NIE reaguje na stwora, artefakt ani czar przeciwnika', () => {
  const state = game();
  put(state, 'artist', 'tackle-artist', 'p1', 'battlefield');
  put(state, 'piker', 'goblin-piker', 'p1', 'hand'); // {1}{R} — stwór
  addMana(state, 'p1', 2, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'piker'));
  settle(state);
  assert.equal(countersOf(state, 'artist'), 0, 'czar stwora to nie instant/sorcery');

  put(state, 'theirs', 'titans-strength', 'p2', 'hand');
  addMana(state, 'p2', 1, { colors: ['R'] });
  state.turn = { ...state.turn, priorityPlayerId: 'p2' };
  const enemyCast = commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'theirs');
  if (enemyCast) run(state, enemyCast);
  settle(state);
  assert.equal(countersOf(state, 'artist'), 0, 'czar przeciwnika nie odpala Opus kontrolera Artysty');
});

test('B62/198: Tackle Artist — dwóch Artystów: każdy dostaje własny licznik za jeden czar', () => {
  const state = game();
  put(state, 'a1', 'tackle-artist', 'p1', 'battlefield');
  put(state, 'a2', 'tackle-artist', 'p1', 'battlefield');
  put(state, 'ts', 'titans-strength', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  castSpell(state, 'ts', ['a1']);
  settle(state);
  assert.equal(countersOf(state, 'a1'), 1);
  assert.equal(countersOf(state, 'a2'), 1);
});

// ---- B62/203: Golem-Skin Gauntlets (2XM #259, plan Kaldheim) ----------------

const powerOf = (s, id) => effectivePower(s.objects.get(id), s);
const attach = (s, equipId, hostId) => {
  s.objects.set(equipId, Object.freeze({ ...s.objects.get(equipId), attachedTo: hostId }));
};

test('B62/203: Golem-Skin Gauntlets — dane Oracle, Equipment {1} z equip {2} i druk 2XM', () => {
  const def = sanity('golem-skin-gauntlets', { set: '2XM', plan: 'Kaldheim', artId: 203 });
  assert.deepEqual(def.types, ['Artifact']);
  assert.deepEqual(def.subtypes, ['Equipment']);
  assert.equal(def.manaCost, 1);
  assert.equal(def.equipment.equip, 2);
  assert.deepEqual(def.equipment.pumpPerAttachedEquipment, { power: 1, toughness: 0 });
});

test('B62/203: Golem-Skin Gauntlets — pump przechodzi cały łańcuch deskryptora aż do obiektu gry (L21)', () => {
  const state = game();
  const gauntlets = put(state, 'g', 'golem-skin-gauntlets', 'p1', 'battlefield');
  assert.deepEqual(gauntlets.equipment.pumpPerAttachedEquipment, { power: 1, toughness: 0 });
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield');
  attach(state, 'g', 'bear');
  const view = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'g');
  assert.deepEqual(view.equipment.pumpPerAttachedEquipment, { power: 1, toughness: 0 }, 'widok gracza/bota też go niesie');
});

test('B62/203: Golem-Skin Gauntlets — sam liczy się do własnej zdolności (+1/+0), nieprzyczepiony nic nie daje', () => {
  const state = game();
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield'); // 2/1
  put(state, 'g', 'golem-skin-gauntlets', 'p1', 'battlefield');
  assert.equal(powerOf(state, 'bear'), 2, 'nieprzyczepiony — brak premii');
  attach(state, 'g', 'bear');
  assert.equal(powerOf(state, 'bear'), 3, 'przyczepiony — +1/+0 (ruling 2020-08-07: liczy siebie)');
  assert.equal(effectiveToughness(state.objects.get('bear'), state), 1, 'wytrzymałość bez zmian');
  attach(state, 'g', null);
  assert.equal(powerOf(state, 'bear'), 2, 'po odpięciu premia znika natychmiast');
});

test('B62/203: Golem-Skin Gauntlets — premia jest DODATKOWA do innego Equipmentu (Brawler\'s Plate +2/+2 i +2/+0 za dwa sprzęty)', () => {
  const state = game();
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield'); // 2/1
  put(state, 'g', 'golem-skin-gauntlets', 'p1', 'battlefield');
  put(state, 'plate', 'brawlers-plate', 'p1', 'battlefield');
  attach(state, 'g', 'bear');
  attach(state, 'plate', 'bear');
  assert.equal(powerOf(state, 'bear'), 2 + 2 + 2, 'baza 2 + Plate +2 + Gauntlets 2 sprzęty × 1');
  assert.equal(effectiveToughness(state.objects.get('bear'), state), 1 + 2, 'wytrzymałość tylko z Plate');
});

test('B62/203: Golem-Skin Gauntlets — dwa egzemplarze: każdy liczy oba sprzęty (+4 razem)', () => {
  const state = game();
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'g1', 'golem-skin-gauntlets', 'p1', 'battlefield');
  put(state, 'g2', 'golem-skin-gauntlets', 'p1', 'battlefield');
  attach(state, 'g1', 'bear');
  attach(state, 'g2', 'bear');
  assert.equal(powerOf(state, 'bear'), 2 + 2 + 2);
});

test('B62/203: Golem-Skin Gauntlets — Equipment przeciwnika na tym samym stworze też jest liczony', () => {
  const state = game();
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'g', 'golem-skin-gauntlets', 'p1', 'battlefield');
  put(state, 'theirs', 'brawlers-plate', 'p2', 'battlefield');
  attach(state, 'g', 'bear');
  attach(state, 'theirs', 'bear');
  assert.equal(powerOf(state, 'bear'), 2 + 2 + 2, 'Plate przeciwnika +2 i Gauntlets za dwa sprzęty +2');
});

test('B62/203: Golem-Skin Gauntlets — equip {2} przypina do własnego stworza, a nie do cudzego', () => {
  const state = game();
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'foe', 'goblin-piker', 'p2', 'battlefield');
  put(state, 'g', 'golem-skin-gauntlets', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  const offers = commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'g');
  assert.ok(offers.length >= 1, 'oferta equip istnieje');
  const targets = offers.map((c) => c.targets?.[0] ?? c.targetId).filter(Boolean);
  assert.ok(targets.includes('bear'), 'własny stwór jest celem');
  assert.ok(!targets.includes('foe'), 'cudzy stwór nie jest celem (Equip: target creature you control)');
  run(state, offers.find((c) => (c.targets?.[0] ?? c.targetId) === 'bear'));
  settle(state);
  assert.equal(state.objects.get('g').attachedTo, 'bear');
  assert.equal(powerOf(state, 'bear'), 3);
});

test('B62/203: Golem-Skin Gauntlets — bot wycenia sprzęt jako realną premię, nie „niczego nie dodaje\"', () => {
  const state = game();
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'g', 'golem-skin-gauntlets', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  const bot = createHeuristicBot({ seed: 2026 });
  bot.chooseCommand(playerView(state, 'p1'), {});
  const equip = bot.trace()[0].options.filter((o) => o.cmd.startsWith('activate_ability(g'));
  assert.ok(equip.length >= 1, 'bot widzi ofertę equip');
  const best = Math.max(...equip.map((o) => o.score));
  // Kara „nic nie dodaje\" to −12; realna premia +1 siły to wynik dodatni i
  // wyższy niż kara (przed poprawką pump czytany tylko z `def.pump` = 0).
  assert.ok(best > 0, `wynik equip dla Gauntlets dodatni, jest ${best}`);
});

// ---- B62/176: Chocobo Kick (FIN #178, plan Final Fantasy) -------------------

const kickVariants = (s) => commands(s).filter((c) => c.type === 'cast_spell' && c.objectId === 'kick');
const kickScene = ({ lands = ['basic-forest', 'basic-forest', 'basic-forest'], mine = 'goblin-piker', theirs = 'goblin-piker' } = {}) => {
  const state = game();
  put(state, 'mine', mine, 'p1', 'battlefield');
  put(state, 'foe', theirs, 'p2', 'battlefield');
  lands.forEach((cardId, i) => put(state, `land${i}`, cardId, 'p1', 'battlefield'));
  put(state, 'kick', 'chocobo-kick', 'p1', 'hand');
  return state;
};

test('B62/176: Chocobo Kick — dane Oracle, Sorcery {1}{G} z kickerem „zwróć ląd\" i druk FIN', () => {
  const def = sanity('chocobo-kick', { set: 'FIN', plan: 'Final Fantasy', artId: 176 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.kicker.cost, 0, 'koszt kickera jest NIEMANOWY');
  assert.deepEqual(def.kicker.colors, []);
  assert.equal(def.kicker.returnLand, true);
  assert.equal(def.spell.timing, 'sorcery');
});

test('B62/176: Chocobo Kick — oferta: zwykły rzut oraz wariant kicked na każdy rozróżnialny ląd', () => {
  const state = kickScene({ lands: ['basic-forest', 'basic-forest', 'basic-island'] });
  const all = kickVariants(state);
  const plain = all.filter((c) => !c.kicked);
  const kicked = all.filter((c) => c.kicked);
  assert.ok(plain.length >= 1, 'zwykły rzut jest w ofercie');
  assert.equal(plain[0].kickerLandId, undefined, 'zwykły rzut nie niesie lądu');
  assert.ok(kicked.length >= 2, 'wariant kicked istnieje');
  const landIds = new Set(kicked.map((c) => c.kickerLandId));
  assert.equal(landIds.size, 2, 'dwa Forest to jeden wybór + Island = 2 warianty lądu (dedup po karcie i stanie)');
  assert.ok(kicked.every((c) => c.targets.length === 2), 'dwa cele: własny stwór i stwór przeciwnika');
});

test('B62/176: Chocobo Kick — bez kickera: obrażenia = moc (jednostronnie), ląd zostaje', () => {
  const state = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' }); // 2/1 vs 1/3
  addMana(state, 'p1', 2, { colors: ['G'] });
  run(state, kickVariants(state).find((c) => !c.kicked && c.targets[0] === 'mine' && c.targets[1] === 'foe'));
  settle(state);
  assert.equal(state.objects.get('foe').damage ?? 0, 2, 'moc 2 → 2 obrażenia');
  assert.equal(state.objects.get('mine').damage ?? 0, 0, 'jednostronnie — własny stwór nie dostaje obrażeń (bite, nie fight)');
  assert.ok(['land0', 'land1', 'land2'].every((id) => state.objects.get(id)?.zone === 'battlefield'), 'lądy na polu');
});

test('B62/176: Chocobo Kick — kicked: ×2 obrażeń, ląd wraca na rękę właściciela, mana wydana = {1}{G}', () => {
  const state = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), toughness: 6 })); // przeżyje, więc widać licznik obrażeń
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cmd = kickVariants(state).find((c) => c.kicked && c.targets[0] === 'mine' && c.targets[1] === 'foe');
  const handBefore = state.zones.hand.length;
  const r = run(state, cmd);
  const cast = r.events.find((e) => e.type === 'spell_cast');
  assert.equal(cast.kicked, true);
  assert.equal(cast.manaSpent, 2, 'kicker niemanowy nie zwiększa wydanej many');
  assert.equal(cast.kickerLandId, cmd.kickerLandId, 'log niesie id zwróconego lądu');
  settle(state);
  assert.equal(state.objects.get('foe').damage ?? 0, 4, 'moc 2 ×2 = 4 obrażenia');
  const returned = [...state.objects.values()].find((o) => o.cardId === 'basic-forest' && o.zone === 'hand');
  assert.ok(returned, 'Forest wrócił na rękę');
  assert.equal(returned.controllerId, 'p1');
  assert.equal(state.zones.hand.length, handBefore, 'czar zszedł z ręki, ląd na nią wrócił');
  assert.equal([...state.objects.values()].filter((o) => o.kind === 'land' && o.zone === 'battlefield' && o.controllerId === 'p1').length, 2);
});

test('B62/176: Chocobo Kick — kicked zabija stwora, którego zwykły rzut by nie zabił (3 wytrzymałości)', () => {
  const plain = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
  addMana(plain, 'p1', 2, { colors: ['G'] });
  run(plain, kickVariants(plain).find((c) => !c.kicked && c.targets[1] === 'foe' && c.targets[0] === 'mine'));
  settle(plain);
  assert.equal(plain.objects.get('foe').zone, 'battlefield', 'zwykły: 2 obrażenia nie zabijają 1/3');
  const kicked = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
  addMana(kicked, 'p1', 2, { colors: ['G'] });
  run(kicked, kickVariants(kicked).find((c) => c.kicked && c.targets[1] === 'foe' && c.targets[0] === 'mine'));
  settle(kicked);
  assert.notEqual(find(kicked, 'maritime-guard', 'battlefield')?.id, 'foe', 'kicked: 4 obrażenia zabijają 1/3');
  assert.ok(find(kicked, 'maritime-guard', 'graveyard'), 'Merfolk w grobie');
});

test('B62/176: Chocobo Kick — nielegalny ląd kosztu (cudzy, nie-ląd, brak id) odrzucony BEZ utraty many i czaru', () => {
  const state = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
  put(state, 'theirLand', 'basic-island', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const base = kickVariants(state).find((c) => c.kicked && c.targets[0] === 'mine' && c.targets[1] === 'foe');
  for (const bad of ['theirLand', 'mine', 'nieistnieje', undefined]) {
    const r = execute(state, { ...base, kickerLandId: bad });
    assert.equal(r.ok, false, `ląd „${bad}\" odrzucony`);
  }
  assert.equal(state.objects.get('kick').zone, 'hand', 'czar nadal w ręce');
  assert.equal(state.objects.get('land0').zone, 'battlefield', 'własne lądy nietknięte');
  // Zwykły rzut z podanym lądem to też błąd (karta bez kosztu zwrotu w tym wariancie).
  const plain = kickVariants(state).find((c) => !c.kicked);
  assert.equal(execute(state, { ...plain, kickerLandId: 'land0' }).ok, false);
});

test('B62/176: Chocobo Kick — bez lądu na polu nie ma wariantu kicked (koszt niemożliwy), zwykły rzut zostaje', () => {
  const state = game();
  put(state, 'mine', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'foe', 'maritime-guard', 'p2', 'battlefield');
  put(state, 'kick', 'chocobo-kick', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const all = kickVariants(state);
  assert.ok(all.length >= 1 && all.every((c) => !c.kicked), 'tylko zwykłe rzuty');
});

test('B62/176: Chocobo Kick — ruling 2025-06-06: nielegalny JEDEN cel ⇒ brak obrażeń; ląd mimo to zwrócony (koszt)', () => {
  const state = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
  addMana(state, 'p1', 2, { colors: ['G'] });
  run(state, kickVariants(state).find((c) => c.kicked && c.targets[0] === 'mine' && c.targets[1] === 'foe'));
  // W odpowiedzi własny stwór znika z pola (cel nr 1 nielegalny).
  moveObjectDirectly(state, 'mine', 'graveyard', 'mine-dead');
  settle(state);
  assert.equal(state.objects.get('foe').damage ?? 0, 0, 'jeden cel nielegalny — żadnych obrażeń');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'basic-forest' && o.zone === 'hand'), 'ląd wrócił na rękę (koszt zapłacony)');
});

test('B62/176: Chocobo Kick — kicker nie wchodzi w kolejną zdolność „Whenever you cast a kicked spell\" jako błąd: event niesie kicked', () => {
  const state = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
  addMana(state, 'p1', 2, { colors: ['G'] });
  const r = run(state, kickVariants(state).find((c) => c.kicked && c.targets[0] === 'mine' && c.targets[1] === 'foe'));
  assert.equal(r.events.find((e) => e.type === 'spell_cast').kicked, true);
  const moved = r.events.find((e) => e.type === 'object_moved' && e.additionalCost);
  assert.equal(moved.fromZone, 'battlefield');
  assert.equal(moved.toZone, 'hand');
});

test('B62/176: Chocobo Kick — ruling: OBA cele nielegalne ⇒ czar się nie rozstrzyga, ale koszt (ląd) zapłacony', () => {
  const state = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
  addMana(state, 'p1', 2, { colors: ['G'] });
  run(state, kickVariants(state).find((c) => c.kicked && c.targets[0] === 'mine' && c.targets[1] === 'foe'));
  moveObjectDirectly(state, 'mine', 'graveyard', 'mine-dead');
  moveObjectDirectly(state, 'foe', 'graveyard', 'foe-dead');
  settle(state);
  assert.ok(find(state, 'chocobo-kick', 'graveyard'), 'czar w grobie (fizzle)');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'basic-forest' && o.zone === 'hand'), 'ląd wrócił na rękę');
});

test('B62/176: Chocobo Kick — bot kopie (zwraca ląd) tylko gdy podwojenie daje zabójstwo', () => {
  const pick = ({ toughness }) => {
    const state = kickScene({ mine: 'goblin-piker', theirs: 'maritime-guard' });
    state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), toughness }));
    state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), summoningSickness: false }));
    addMana(state, 'p1', 2, { colors: ['G'] });
    const bot = createHeuristicBot({ seed: 2026 });
    const cmd = bot.chooseCommand(playerView(state, 'p1'), {});
    return { cmd, options: bot.trace()[0].options };
  };
  assert.equal(pick({ toughness: 3 }).cmd.kicked, true, 'moc 2 nie zabija 1/3, ×2 zabija — kopie');
  assert.equal(pick({ toughness: 2 }).cmd.kicked, undefined, 'moc 2 już zabija 1/2 — bez zwrotu lądu');
  assert.equal(pick({ toughness: 6 }).cmd.kicked, undefined, 'nawet ×2 nie zabija 1/6 — bez zwrotu lądu');
});

// ---- B62/210: Fiery Justice (2X2 #212, plan Kaldheim) -----------------------

const fjVariants = (s) => commands(s).filter((c) => c.type === 'cast_spell' && c.objectId === 'fj');
const fjScene = () => {
  const state = game();
  put(state, 'bear', 'goblin-piker', 'p1', 'battlefield');          // 2/1 mój
  put(state, 'g1', 'maritime-guard', 'p2', 'battlefield');          // 1/3
  put(state, 'g2', 'goblin-piker', 'p2', 'battlefield');            // 2/1
  put(state, 'fj', 'fiery-justice', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['R', 'G', 'W'] });
  return state;
};
const cmdOf = (state, division) => fjVariants(state).find((c) => c.targets[0] === 'p2'
  && c.damageDivision.length === division.length
  && division.every(([id, amount]) => c.damageDivision.some((d) => d.id === id && d.amount === amount)));
const lifeOf = (s, id) => player(s, id).life;
const inGrave = (s, cardId, ownerId) => [...s.objects.values()].some((o) => o.cardId === cardId && o.ownerId === ownerId && o.zone === 'graveyard');

test('B62/210: Fiery Justice — dane Oracle: Sorcery {R}{G}{W} z podziałem 5 i celem „target opponent\"', () => {
  const def = sanity('fiery-justice', { set: '2X2', plan: 'Kaldheim', artId: 210 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual([...def.colors].sort(), ['G', 'R', 'W']);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.spell.divided, { total: 5, targetType: 'any_target' });
  assert.deepEqual(def.spell.targets, [{ type: 'opponent' }]);
});

test('B62/210: Fiery Justice — podział 3 + 2: cele dostają swoje porcje, przeciwnik zyskuje 5 życia', () => {
  const state = fjScene();
  run(state, cmdOf(state, [['g1', 3], ['g2', 2]]));
  settle(state);
  assert.equal(find(state, 'maritime-guard', 'graveyard') != null, true, '3 obrażenia zabijają 1/3');
  assert.equal(inGrave(state, 'goblin-piker', 'p2'), true, '2 obrażenia zabijają 2/1');
  assert.equal(lifeOf(state, 'p2'), 25, 'przeciwnik zyskuje 5 życia (20 → 25)');
  assert.equal(lifeOf(state, 'p1'), 20);
});

test('B62/210: Fiery Justice — w jednym rzucie obrażenia idą do gracza i do stwora naraz', () => {
  const state = fjScene();
  run(state, cmdOf(state, [['g1', 3], ['p2', 2]]));
  settle(state);
  assert.equal(lifeOf(state, 'p2'), 20 - 2 + 5, 'przeciwnik: −2 obrażenia, +5 życia');
  assert.ok(find(state, 'maritime-guard', 'graveyard'));
});

test('B62/210: Fiery Justice — oferta: każdy cel ≥1, suma 5, bez powtórzeń, zawiera podział na 5 celów', () => {
  const state = fjScene();
  const all = fjVariants(state);
  assert.ok(all.length > 20, 'wiele podziałów');
  for (const c of all) {
    assert.equal(c.damageDivision.reduce((s, d) => s + d.amount, 0), 5);
    assert.ok(c.damageDivision.every((d) => d.amount >= 1));
    assert.equal(new Set(c.damageDivision.map((d) => d.id)).size, c.damageDivision.length);
    assert.deepEqual(c.targets, ['p2'], 'cel z deskryptora = przeciwnik');
  }
  assert.ok(all.some((c) => c.damageDivision.length === 5), 'pięć celów po 1 (bear, g1, g2, p1, p2)');
});

test('B62/210: Fiery Justice — walidacja: porcja 0, zła suma, powtórzony cel, brak podziału — odrzucone bez utraty many', () => {
  const state = fjScene();
  const base = cmdOf(state, [['g1', 3], ['g2', 2]]);
  const bad = [
    [{ id: 'g1', amount: 5 }, { id: 'g2', amount: 0 }],
    [{ id: 'g1', amount: 3 }, { id: 'g2', amount: 1 }],
    [{ id: 'g1', amount: 3 }, { id: 'g1', amount: 2 }],
    [{ id: 'nieistnieje', amount: 5 }],
  ];
  for (const damageDivision of bad) assert.equal(execute(state, { ...base, damageDivision }).ok, false);
  const { damageDivision, ...bez } = base;
  assert.equal(execute(state, bez).ok, false, 'brak damageDivision');
  assert.equal(state.objects.get('fj').zone, 'hand');
  assert.equal(execute(state, { ...base, damageDivision: [{ id: 'g1', amount: 5 }], targets: ['p1'] }).ok, false, 'cel „opponent\" = ja sam');
});

test('B62/210: Fiery Justice — ruling: część celów nielegalna ⇒ pierwotny podział, nielegalne bez obrażeń; życie i tak rośnie', () => {
  const state = fjScene();
  run(state, cmdOf(state, [['g1', 3], ['g2', 2]]));
  moveObjectDirectly(state, 'g1', 'graveyard', 'g1-dead');
  settle(state);
  assert.ok(inGrave(state, 'goblin-piker', 'p2'), 'g2 dostał swoje 2');
  assert.equal(lifeOf(state, 'p2'), 25);
});

test('B62/210: Fiery Justice — ruling: wszystkie cele obrażeń nielegalne, przeciwnik legalny ⇒ i tak +5 życia', () => {
  const state = fjScene();
  run(state, cmdOf(state, [['g1', 3], ['g2', 2]]));
  moveObjectDirectly(state, 'g1', 'graveyard', 'g1-dead');
  moveObjectDirectly(state, 'g2', 'graveyard', 'g2-dead');
  settle(state);
  assert.equal(lifeOf(state, 'p2'), 25);
  assert.ok(find(state, 'fiery-justice', 'graveyard'));
});

test('B62/210: Fiery Justice — ruling: przeciwnik także celem obrażeń: życie rośnie PRZED sprawdzeniem stanu (SBA)', () => {
  const state = fjScene();
  state.players.find((p) => p.id === 'p2').life = 5;
  run(state, cmdOf(state, [['p2', 5]]));
  settle(state);
  assert.equal(lifeOf(state, 'p2'), 5, '5 − 5 + 5 = 5');
  assert.notEqual(state.status, 'finished', 'gra trwa — przeciwnik nie przegrał na życiu 0');
});

test('B62/210: Fiery Justice — hexproof/protection: cel obrażeń z hexproof nie jest legalny przy rzucie', () => {
  const state = fjScene();
  state.objects.set('g1', Object.freeze({ ...state.objects.get('g1'), keywords: ['hexproof'] }));
  const withG1 = fjVariants(state).filter((c) => c.damageDivision.some((d) => d.id === 'g1'));
  assert.equal(withG1.length, 0, 'oferta nie zawiera celu z hexproof');
  const base = cmdOf(state, [['g2', 5]]);
  assert.equal(execute(state, { ...base, damageDivision: [{ id: 'g1', amount: 5 }] }).ok, false);
});

test('B62/210: Fiery Justice — bot dzieli obrażenia tak, by zabić oba stwory przeciwnika, i nie bije siebie ani własnych', () => {
  const state = fjScene();
  state.turn.activePlayerId = 'p1';
  const bot = createHeuristicBot({ seed: 2026 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(cmd.type, 'cast_spell', 'bot rzuca czar zamiast pasować');
  const byId = Object.fromEntries(cmd.damageDivision.map((d) => [d.id, d.amount]));
  assert.ok((byId.g1 ?? 0) >= 3, `1/3 dostaje ≥3 (zabija): ${JSON.stringify(byId)}`);
  assert.ok((byId.g2 ?? 0) >= 1, '2/1 dostaje ≥1 (zabija)');
  assert.equal(byId.bear, undefined, 'własny stwór bez obrażeń');
  assert.equal(byId.p1, undefined, 'bot nie bije siebie');
});

test('B62/210: Fiery Justice — oferta silnika składa się w jeden kreator podziału (UI), etykieta wymienia porcje', async () => {
  const { dividedCastPlanOf, commandForDivisionSelection } = await import('../src/table/multi-target.js');
  const state = fjScene();
  const offers = fjVariants(state);
  const plan = dividedCastPlanOf(offers);
  assert.ok(plan, 'plan z komend silnika');
  assert.equal(plan.total, 5);
  assert.equal(plan.maxTargets, 5);
  assert.ok(['bear', 'g1', 'g2', 'p1', 'p2'].every((id) => plan.candidateIds.includes(id)));
  const picked = commandForDivisionSelection(offers, { targetIds: ['g1', 'g2'], amounts: [3, 2] });
  assert.ok(picked, 'wybór 3 + 2 daje komendę z oferty');
  assert.equal(commandForDivisionSelection(offers, { targetIds: ['g1'], amounts: [4] }), null, 'suma ≠ 5 — brak komendy');
  const { commandLabel } = await import('../src/table/render.js');
  const label = commandLabel(picked, { nameOf: (id) => id, nameOfObject: (id) => id, cardDetails: () => null }, playerView(state, 'p1'));
  assert.match(label, /3 → .*g1|3 → /);
});

// ---- B62/178: Oreplate Pangolin (EOE #150, plan The Edge) -------------------

/**
 * Rzuca artefakt bez zdolności many (Golem-Skin Gauntlets {1}) — Lantern sam
 * produkowałby manę na zapłatę {1} Pangolina (nowy artefakt można tapnąć).
 */
function castLantern(state, id = 'lantern', playerId = 'p1') {
  put(state, id, 'golem-skin-gauntlets', playerId);
  run(state, commands(state, playerId).find((c) => c.type === 'cast_permanent' && c.objectId === id));
  // czeka stos: trigger Pangolina (jeśli jest) trafia na stos po wejściu artefaktu
  for (let i = 0; i < 6 && !state.pendingOptionalPay; i++) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    if (!pass || state.zones.stack.length === 0) break;
    run(state, pass);
  }
}

test('B62/178: Oreplate Pangolin — dane Oracle: Artifact Creature 2/2 Robot Pangolin {1}{R} i druk EOE', () => {
  const def = sanity('oreplate-pangolin', { set: 'EOE', plan: 'The Edge', artId: 178 });
  assert.deepEqual(def.types, ['Artifact', 'Creature']);
  assert.deepEqual(def.subtypes, ['Robot', 'Pangolin']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 2);
});

test('B62/178: Oreplate Pangolin — inny artefakt pod twoją kontrolą: zapłać {1} ⇒ licznik +1/+1', () => {
  const state = game();
  put(state, 'pang', 'oreplate-pangolin', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: [] });
  castLantern(state);
  assert.ok(state.pendingOptionalPay, 'pytanie „you may pay {1}\"');
  assert.equal(state.pendingOptionalPay.playerId, 'p1');
  run(state, commands(state).find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true));
  settle(state);
  assert.equal(countersOf(state, 'pang'), 1, 'licznik +1/+1 na Pangolinie');
  assert.equal(powerOf(state, 'pang'), 3);
  assert.equal(player(state, 'p1').mana, 0, '1 na Gauntlets + 1 na Pangolina');
});

test('B62/178: Oreplate Pangolin — rezygnacja z płatności: brak licznika, mana zostaje', () => {
  const state = game();
  put(state, 'pang', 'oreplate-pangolin', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: [] });
  castLantern(state);
  run(state, commands(state).find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === false));
  settle(state);
  assert.equal(countersOf(state, 'pang'), 0);
  assert.equal(player(state, 'p1').mana, 1);
});

test('B62/178: Oreplate Pangolin — bez wolnej {1} nie ma pytania o płatność (nic do wyboru)', () => {
  const state = game();
  put(state, 'pang', 'oreplate-pangolin', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: [] });
  castLantern(state);
  settle(state);
  assert.ok(!state.pendingOptionalPay, 'brak pytania');
  assert.equal(countersOf(state, 'pang'), 0);
});

test('B62/178: Oreplate Pangolin — „another\": sam Pangolin (artefakt) nie uruchamia własnej zdolności', () => {
  const state = game();
  put(state, 'pang', 'oreplate-pangolin');
  addMana(state, 'p1', 5, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'pang'));
  settle(state);
  assert.ok(!state.pendingOptionalPay, 'brak triggera na własne wejście');
  assert.equal(countersOf(state, find(state, 'oreplate-pangolin').id), 0);
});

test('B62/178: Oreplate Pangolin — drugi Pangolin (artefakt-stwór) uruchamia pierwszego, nie siebie', () => {
  const state = game();
  put(state, 'first', 'oreplate-pangolin', 'p1', 'battlefield');
  put(state, 'second', 'oreplate-pangolin');
  addMana(state, 'p1', 3, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'second'));
  for (let i = 0; i < 6 && !state.pendingOptionalPay; i++) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    if (!pass || !state.zones.stack.length) break;
    run(state, pass);
  }
  assert.ok(state.pendingOptionalPay, 'pierwszy Pangolin pyta o płatność');
  assert.equal(state.pendingOptionalPay.sourceId, 'first');
  run(state, commands(state).find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true));
  settle(state);
  assert.equal(countersOf(state, 'first'), 1);
  const other = [...state.objects.values()].find((o) => o.cardId === 'oreplate-pangolin' && o.zone === 'battlefield' && o.id !== 'first');
  assert.ok(other, 'drugi Pangolin na polu (nowe id po rzucie)');
  assert.equal(countersOf(state, other.id), 0, 'drugi Pangolin bez licznika');
});

test('B62/178: Oreplate Pangolin — nie reaguje na artefakt przeciwnika ani na nie-artefakt', () => {
  const state = game();
  put(state, 'pang', 'oreplate-pangolin', 'p1', 'battlefield');
  // artefakt przeciwnika (rzucony w jego turze, prawdziwe wejście na pole bitwy)
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 1, { colors: [] });
  addMana(state, 'p1', 1, { colors: [] });
  castLantern(state, 'theirs', 'p2');
  settle(state);
  assert.ok(find(state, 'golem-skin-gauntlets'), 'artefakt przeciwnika wszedł na pole bitwy');
  assert.ok(!state.pendingOptionalPay, 'artefakt przeciwnika nie uruchamia');
  assert.equal(countersOf(state, 'pang'), 0);
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  // stwór niebędący artefaktem pod własną kontrolą
  put(state, 'bear', 'maritime-guard');
  addMana(state, 'p1', 3, { colors: ['W', 'U', 'B', 'R', 'G'] });
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bear');
  if (cast) run(state, cast);
  settle(state);
  assert.ok(!state.pendingOptionalPay, 'zwykły stwór nie uruchamia');
  assert.equal(countersOf(state, 'pang'), 0);
});

test('B62/178: Oreplate Pangolin — opis zdolności na kaflu mówi „inny artefakt\" i o płatności {1}', async () => {
  const { rulesText } = await import('../src/table/render.js');
  const def = registry.get('oreplate-pangolin');
  const text = rulesText({ keywords: [], abilities: def.abilities, controllerId: 'human' });
  assert.match(text, /inny artefakt/, 'opis nie obiecuje triggera na własne wejście');
  assert.match(text, /zapłacić/, 'opis mówi o opcjonalnej płatności');
});

// ---- B62/192: Crumbling Vestige (OGW #170, plan The Edge) -------------------

test('B62/192: Crumbling Vestige — dane Oracle: Land, wchodzi tapped, trigger many + {T}: {C}, druk OGW', () => {
  const def = sanity('crumbling-vestige', { set: 'OGW', plan: 'The Edge', artId: 192 });
  assert.deepEqual(def.types, ['Land']);
  assert.equal(def.entersTapped, true);
  assert.equal(def.manaCost ?? 0, 0);
});

test('B62/192: Crumbling Vestige — wejście: tapped, a trigger daje JEDNĄ manę dowolnego koloru do puli', () => {
  const state = game();
  put(state, 'vest', 'crumbling-vestige');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'vest'));
  assert.equal(find(state, 'crumbling-vestige').tapped, true, 'enters tapped');
  assert.equal(player(state, 'p1').mana, 0, 'trigger idzie przez stos — jeszcze bez many');
  settle(state);
  assert.equal(player(state, 'p1').mana, 1, 'po rozstrzygnięciu triggera: 1 mana');
  // dowolny kolor: opłaca biały {W} (Lionheart Maverick) i czerwony pip
  put(state, 'mav', 'lionheart-maverick');
  assert.ok(commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'mav'),
    'mana z triggera opłaca kolorowy czar');
});

test('B62/192: Crumbling Vestige — mana z triggera NIE pochodzi z {T}: ląd zostaje tapnięty i nie daje drugiej many', () => {
  const state = game();
  put(state, 'vest', 'crumbling-vestige');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'vest'));
  settle(state);
  assert.ok(!commands(state).some((c) => c.type === 'tap_for_mana' && c.objectId === 'vest'), 'tapnięty ląd nie daje many');
  assert.equal(player(state, 'p1').mana, 1);
});

test('B62/192: Crumbling Vestige — {T}: Add {C} daje manę BEZBARWNĄ (nie opłaci pipa koloru)', () => {
  const state = game();
  put(state, 'vest', 'crumbling-vestige', 'p1', 'battlefield', { tapped: false });
  put(state, 'mav', 'lionheart-maverick');
  assert.ok(!commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'mav'),
    'bezbarwna {C} nie opłaca {W}');
  const tap = commands(state).find((c) => (c.type === 'tap_for_mana' || c.type === 'activate_ability') && c.objectId === 'vest');
  assert.ok(tap, 'ląd nietapnięty oferuje zdolność many');
  run(state, tap);
  assert.equal(player(state, 'p1').mana, 1);
  assert.ok(!commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'mav'),
    'po tapnięciu nadal tylko bezbarwna');
});
