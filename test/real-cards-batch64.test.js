// Batch 64 (2026-10-08) — karty właściciela: 261 CMR, 263 MH1, 266 M19, 269 CLB,
// 280 KTK, 323 STX, 324 DSK, 325 TDM, 327 BLB, 328 LRW — razem 10 kart.
//
// Ten plik: CAŁY batch (10 kart). Większość to kompozycja istniejących
// deskryptorów; nowy kod silnika potrzebny był do: Scouting Hawk (warunek
// statyczny `opponentControlsMoreLands` — Keen Sight), Bog Hoodlums
// (deskryptor `clash` z nagrodą licznikiem `counterOnWin` + kartowy
// `cantBlock` → `cantBlockPrinted`), Spineseeker Centipede (delirium jako
// warunek statyczny — nowy liść `src/engine/graveyard-types.js`) i Quandrix
// Campus (wpis `MANA_SOURCE_MAP`).
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-10-08,
// `set=` obowiązkowy — ADR 0010 §2a; rulingi przy kartce, także puste listy —
// ADR 0028; niepuste tylko MH1/55 = 1 i KTK/91 = 3). artId z wiersza arkusza
// właściciela (`<nr><SET>` w `tools/collection-art-ids.csv`). Plan batcha:
// `docs/plans/PLAN_2026-10-08-batch64-kolekcja-261-328.md`.
//
// Każda karta ma sanity danych Oracle/druku/planu, scenariusz legalny
// (efekt działa) oraz nielegalny (brak oferty — maszynowo rozpoznawalny).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 64, players: players.map((id) => ({ id })) });
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

/** Karta na WIERZCHU biblioteki właściciela (clash odsłania pierwszy wpis). */
function wierzch(state, id, cardId, playerId) {
  put(state, id, cardId, playerId, 'library');
  state.zones.library = [id, ...state.zones.library.filter((entry) => entry !== id)];
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
const player = (s, id) => s.players.find((p) => p.id === id);

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

/** Rozstrzyga stos i decyzje `resolve_*` do końca (wzorzec real-cards-batch62). */
function settle(s, max = 60) {
  for (let i = 0; i < max; i++) {
    const idle = s.zones.stack.length === 0 && s.pendingTriggerTargets.length === 0
      && !(s.pendingExploits?.length);
    const choices = commands(s);
    if (idle && !choices.some((c) => c.type.startsWith('resolve_'))) return;
    const pick = choices.find((c) => c.type === 'pass_priority' && s.zones.stack.length)
      ?? choices.find((c) => c.type.startsWith('resolve_'))
      ?? choices.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'rozstrzyganie ma dostępną komendę');
    run(s, pick);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

/** Passy aż do decyzji o celu triggera (ETB czeka na stosie PO rozstrzygnięciu czaru). */
function doDecyzjiTriggera(s, max = 20) {
  for (let i = 0; i < max; i += 1) {
    if (commands(s).some((c) => c.type === 'resolve_trigger_target')) return;
    const pass = commands(s).find((c) => c.type === 'pass_priority');
    if (!pass) return;
    run(s, pass);
  }
}

/**
 * Passy aż do stanu `pred` (np. pojawienie się pendingScry/pendingClash).
 * NIE dotyka decyzji `resolve_*` — te rozstrzyga test jawnie, żeby móc
 * sprawdzić ich kształt (szukanie, skrut, clash).
 */
function passAzzdo(s, pred, max = 10) {
  for (let i = 0; i < max; i += 1) {
    if (pred(s)) return true;
    const pass = commands(s).find((c) => c.type === 'pass_priority');
    if (!pass) return false;
    run(s, pass);
  }
  return pred(s);
}

/** Passy aż stos będzie pusty (czar rozstrzygnięty) — bez przekręcania tury. */
function doKoncaStosu(s, max = 10) {
  for (let i = 0; i < max; i += 1) {
    if (s.zones.stack.length === 0 && !s.pendingSpell) return;
    const pass = commands(s).find((c) => c.type === 'pass_priority');
    if (!pass) return;
    run(s, pass);
  }
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

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

/** Cztery różne typy kart w grobie — próg delirium (CR 207.2c). */
function deliriumWGrobie(s, playerId = 'p1') {
  put(s, 'gy-twór', 'rustvine-cultivator', playerId, 'graveyard'); // Creature
  put(s, 'gy-czar', 'negate', playerId, 'graveyard');              // Instant
  put(s, 'gy-land', 'basic-swamp', playerId, 'graveyard');         // Land
  put(s, 'gy-art', 'universal-solvent', playerId, 'graveyard');    // Artifact
}

// ---- B64/261: Universal Solvent (CMR #347, plan Kaladesh) --------------------

test('B64/261: Universal Solvent — dane Oracle: artefakt {1} z aktywacją {7},{T},Sac', () => {
  const def = sanity('universal-solvent', { set: 'CMR', plan: 'Kaladesh', artId: 261 });
  assert.deepEqual(def.types, ['Artifact']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.manaCost, 1);
  assert.equal(def.abilities.length, 1);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'activated');
  assert.deepEqual(ab.cost, { mana: 7, tap: true, sacrificeSelf: true });
  assert.deepEqual(ab.targets, [{ type: 'permanent' }], 'cel to DOWOLNY permanent, nie tylko stwór');
  assert.deepEqual(ab.effect, [{ type: 'destroy_permanent' }]);
});

test('B64/261: Universal Solvent — aktywacja niszczy celowy permanent i poświęca źródło', () => {
  const state = game();
  put(state, 'solv', 'universal-solvent', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield');
  addMana(state, 'p1', 7);
  // Oferta enumeruje legalne cele (M203/2) — bierzemy wariant na cel przeciwnika.
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'solv'
    && c.targets?.[0] === 'cel');
  assert.ok(act, 'aktywacja za {7} z celem na permanente przeciwnika jest oferowana');
  run(state, act);
  settle(state);
  assert.ok(find(state, 'rustvine-cultivator', 'graveyard'), 'celowy permanent zniszczony (nowy obiekt w grobie, CR 400.7)');
  assert.equal(find(state, 'universal-solvent'), undefined, 'źródło poświęcone (zeszło z pola bitwy)');
  assert.ok(find(state, 'universal-solvent', 'graveyard'), 'poświęcony artefakt w grobie');
});

test('B64/261: Universal Solvent — bez 7 many NIE MA oferty aktywacji', () => {
  const state = game();
  put(state, 'solv', 'universal-solvent', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield');
  addMana(state, 'p1', 6);
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'solv'),
    '{6} nie opłaca {7} — brak oferty (L48: oferta = walidacja)');
});

// ---- B64/263: Man-o'-War (MH1 #55, plan Dominaria) ---------------------------

test('B64/263: Man-o-War — dane Oracle: 2/2 jellyfish za {2}{U} z ETB bounce', () => {
  const def = sanity('man-o-war', { set: 'MH1', plan: 'Dominaria', artId: 263 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Jellyfish']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.keywords, ['flying'], 'lot');
  assert.deepEqual(def.abilities[0].trigger.requiresTarget, { type: 'creature' });
  assert.deepEqual(def.abilities[0].effect, [{ type: 'bounce_permanent' }]);
});

test('B64/263: Man-o-War — ETB zwraca celowanego stwora do ręki WŁAŚCICIELA', () => {
  const state = game();
  put(state, 'wilk', 'man-o-war', 'p1', 'hand');
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['U'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'wilk'));
  doDecyzjiTriggera(state);
  // Dwa legalne cele (stwór przeciwnika i sam Man-o'-War) — wybór należy do gracza.
  const oferta = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  assert.deepEqual(oferta.map((c) => c.targetId).sort(), ['cel', 'permanent-1'],
    'enumeracja celów: stwór przeciwnika oraz sam Man-o-War');
  run(state, oferta.find((c) => c.targetId === 'cel'));
  settle(state);
  assert.ok(find(state, 'rustvine-cultivator', 'hand'), 'stwór przeciwnika wraca do ręki');
  assert.equal(find(state, 'rustvine-cultivator', 'hand').controllerId, 'p2',
    'do ręki WŁAŚCICIELA, nie kontrolera');
  assert.ok(find(state, 'man-o-war', 'battlefield'), 'Man-o-War zostaje na polu bitwy');
});

test('B64/263: Man-o-War — ruling MH1: jedyny stwór na polu = celuje w SIEBIE', () => {
  // Ruling 2019-06-14 (docs/cards/scryfall-man-o-war.json): gdy nie ma innego
  // stworu, zdolność MUSI celować w samego Man-o-Wara — Oracle nie zawiera
  // zastrzeżenia „you don't control". Jeden legalny cel = decyzja rozstrzyga
  // się automatycznie (brak pytań gracza), a efekt odbija źródło.
  const state = game();
  put(state, 'wilk', 'man-o-war', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['U'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'wilk'));
  doDecyzjiTriggera(state);
  assert.equal(commands(state).some((c) => c.type === 'resolve_trigger_target'), false,
    'jedyny legalny cel = brak decyzji (auto-wybór)');
  settle(state);
  assert.ok(find(state, 'man-o-war', 'hand'), 'Man-o-War odbija sam siebie (ruling)');
  assert.equal(find(state, 'man-o-war', 'hand').controllerId, 'p1');
});

test('B64/263: Man-o-War — bez {2}{U} NIE MA oferty rzutu', () => {
  const state = game();
  put(state, 'wilk', 'man-o-war', 'p1', 'hand');
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['U'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'wilk'),
    '{2} nie opłaca {2}{U} — brak oferty');
});

// ---- B64/266: Druid of the Cowl (M19 #177, plan Kaladesh) --------------------

test('B64/266: Druid of the Cowl — dane Oracle: 1/3 elf druid za {1}{G} z {T}: Add {G}', () => {
  const def = sanity('druid-of-the-cowl', { set: 'M19', plan: 'Kaladesh', artId: 266 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Elf', 'Druid']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 2);
  assert.equal(def.abilities.length, 1);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'activated');
  assert.deepEqual(ab.cost, { tap: true });
  assert.deepEqual(ab.effect, { type: 'add_mana', amount: 1, colors: ['G'] },
    'mana z DESKRYPTORA karty (M193/A), nie z MANA_SOURCE_MAP');
});

test('B64/266: Druid of the Cowl — {T} daje ZIELONĄ manę (opłaca pip {G})', () => {
  const state = game();
  put(state, 'druid', 'druid-of-the-cowl', 'p1', 'battlefield', { tapped: false });
  // Zdolność many (CR 605.1a) jest oferowana jako activate_ability i rozstrzyga
  // się od razu — bez stosu.
  const tap = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'druid');
  assert.ok(tap, 'nietapnięty stwór oferuje zdolność many');
  run(state, tap);
  assert.equal(player(state, 'p1').mana, 1, 'jedna jednostka many w puli');
  assert.equal(state.objects.get('druid').tapped, true, 'źródło tapnięte');
  put(state, 'cent', 'spineseeker-centipede', 'p1', 'hand'); // {2}{G}
  addMana(state, 'p1', 2); // reszta kosztu generyczna
  assert.ok(commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'cent'),
    'mana z deskryptora opłaca kolorowy pip {G}');
});

test('B64/266: Druid of the Cowl — tapnięty stwór nie daje drugiej many', () => {
  const state = game();
  put(state, 'druid', 'druid-of-the-cowl', 'p1', 'battlefield', { tapped: true });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'druid'),
    'tapnięte źródło nie jest oferowane');
  assert.equal(player(state, 'p1').mana, 0);
});

// ---- B64/269: Scouting Hawk (CLB #41, plan Kaldheim) -------------------------

test('B64/269: Scouting Hawk — dane Oracle: 1/1 bird za {2}{W} z Keen Sight', () => {
  const def = sanity('scouting-hawk', { set: 'CLB', plan: 'Kaldheim', artId: 269 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Bird']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.keywords, ['flying']);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'triggered');
  assert.equal(ab.trigger.event, 'enter_battlefield');
  assert.deepEqual(ab.trigger.condition, { opponentControlsMoreLands: true },
    'Keen Sight = warunek intervening-if liczony ze stanu');
  assert.equal(ab.trigger.requiresTarget, undefined, 'brak słowa target — zdolność nie wybiera celu');
  assert.deepEqual(ab.effect, {
    type: 'search_library_to_battlefield',
    qualifier: { types: ['Basic', 'Land'], subtypes: ['Plains'] },
    entersTapped: true,
  });
});

test('B64/269: Scouting Hawk — przeciwnik z więcej lądów: trigger szuka basic Plains TAPNIĘTEGO', () => {
  const state = game();
  put(state, 'hawk', 'scouting-hawk', 'p1', 'hand');
  put(state, 'wrog-l1', 'basic-swamp', 'p2', 'battlefield');
  put(state, 'wrog-l2', 'basic-swamp', 'p2', 'battlefield');
  put(state, 'lib-plains', 'basic-plains', 'p1', 'library');
  put(state, 'lib-swamp', 'basic-swamp', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['W'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'hawk'));
  assert.ok(passAzzdo(state, (s) => s.pendingSearchChoice),
    'Keen Sight szuka tylko gdy przeciwnik ma więcej lądów');
  assert.deepEqual(state.pendingSearchChoice.qualifier,
    { types: ['Basic', 'Land'], subtypes: ['Plains'] }, 'kwalifikator: basic Plains');
  assert.equal(state.pendingSearchChoice.destination, 'battlefield');
  assert.equal(state.pendingSearchChoice.entersTapped, true, 'ląd wchodzi tapnięty');
  const szukaj = commands(state).find((c) => c.type === 'resolve_search_choice');
  assert.equal(szukaj.found, 'lib-plains', 'jedyny kandydat to basic Plains');
  run(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-plains', destination: 'battlefield' });
  const plains = find(state, 'basic-plains', 'battlefield');
  assert.ok(plains, 'Plains na polu bitwy');
  assert.equal(plains.tapped, true, 'wchodzi TAPNIĘTY (Oracle „put it onto the battlefield tapped")');
});

test('B64/269: Scouting Hawk — równa liczba lądów: trigger NIE odpala', () => {
  const state = game();
  put(state, 'hawk', 'scouting-hawk', 'p1', 'hand');
  put(state, 'mój-ląd', 'basic-plains', 'p1', 'battlefield');
  put(state, 'wrog-l1', 'basic-swamp', 'p2', 'battlefield');
  put(state, 'lib-plains', 'basic-plains', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['W'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'hawk'));
  settle(state);
  assert.equal(state.pendingSearchChoice ?? null, null, '1 : 1 — warunek fałszywy, nic się nie szuka');
  assert.equal([...state.objects.values()].filter((o) => o.cardId === 'basic-plains' && o.zone === 'battlefield').length, 1,
    'własny Plains dalej na polu, ale ŻADEN nowy nie wszedł');
  assert.ok(find(state, 'scouting-hawk', 'battlefield'), 'sam ptak na polu bitwy');
});

// ---- B64/280: Sultai Scavenger (KTK #91, plan Tarkir) ------------------------

test('B64/280: Sultai Scavenger — dane Oracle: 3/3 bird warrior za {5}{B} z delve', () => {
  const def = sanity('sultai-scavenger', { set: 'KTK', plan: 'Tarkir', artId: 280 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Bird', 'Warrior']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 6);
  assert.deepEqual(def.keywords, ['flying']);
  assert.equal(def.delve, true, 'delve: deklaracja kosztu w trakcie rzucania (CR 601.2h)');
});

test('B64/280: Sultai Scavenger — delve 2 płaci {4}, karty w exile, mana value bez zmian', () => {
  const state = game();
  const fodder = [];
  for (let i = 0; i < 2; i += 1) {
    put(state, `fodder-${i}`, 'basic-swamp', 'p1', 'graveyard');
    fodder.push(`fodder-${i}`);
  }
  put(state, 'sul', 'sultai-scavenger', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] }); // {5}{B} − 2 z delve
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'sul'));
  assert.ok(state.pendingDelveExile, 'deklaracja rzutu otwiera decyzję kosztu');
  run(state, { type: 'resolve_delve_exile', playerId: 'p1', exileIds: fodder });
  settle(state);
  const sul = find(state, 'sultai-scavenger', 'battlefield');
  assert.ok(sul, 'stwór na polu bitwy');
  assert.ok(effectiveKeywords(sul, state).includes('flying'), 'lot działa');
  assert.equal(state.zones.exile.length, 2, 'dwie karty z grobu wygnane (koszt, CR 601.2h)');
  assert.equal(player(state, 'p1').mana, 0, 'zapłacone {4} z {5}{B}');
  assert.equal(sul.manaCost, 6, 'mana value bez zmian (rulingi KTK 2021-03-19)');
});

test('B64/280: Sultai Scavenger — bez many i bez kart w grobie NIE MA oferty rzutu', () => {
  const state = game();
  put(state, 'sul', 'sultai-scavenger', 'p1', 'hand');
  assert.ok(!commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'sul'),
    '{5}{B} bez many i bez fodderu — brak oferty');
});

// ---- B64/323: Quandrix Campus (STX #271, plan Arcavios) ----------------------

test('B64/323: Quandrix Campus — dane Oracle: land wchodzi tapped, {G} lub {U}, {4},{T}: skrut 1', () => {
  const def = sanity('quandrix-campus', { set: 'STX', plan: 'Arcavios', artId: 323 });
  assert.deepEqual(def.types, ['Land']);
  assert.equal(def.entersTapped, true);
  assert.equal(def.manaCost ?? 0, 0);
  assert.equal(def.abilities.length, 1, 'jedna zdolność w deskryptorze — skrut 1');
  const ab = def.abilities[0];
  assert.equal(ab.type, 'activated');
  assert.deepEqual(ab.cost, { mana: 4, tap: true });
  assert.deepEqual(ab.effect, { type: 'scry', amount: 1 });
});

test('B64/323: Quandrix Campus — wpis MANA_SOURCE_MAP: auto-tap daje {G}/{U} i opłaca pip {G}', () => {
  const state = game();
  put(state, 'cam', 'quandrix-campus', 'p1', 'hand');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'cam'));
  const cam = find(state, 'quandrix-campus');
  assert.equal(cam.tapped, true, 'wchodzi tapnięty');
  // Mana lądu NIE jest zdolnością w deskryptorze — źródło liczy się w
  // auto-tapie przy płaceniu (jak basic land), więc sprawdzamy ją rzutem.
  state.objects.set(cam.id, Object.freeze({ ...cam, tapped: false }));
  put(state, 'cent', 'spineseeker-centipede', 'p1', 'hand'); // {2}{G}
  addMana(state, 'p1', 2);
  assert.ok(commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'cent'),
    'jednostka {G}/{U} z mapy źródeł opłaca pip {G} czaru');
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'cent'));
  doKoncaStosu(state);
  assert.equal(find(state, 'quandrix-campus').tapped, true, 'ląd tapnięty przez auto-tap');
  assert.ok(find(state, 'spineseeker-centipede', 'battlefield'), 'czar wyszedł');
});

test('B64/323: Quandrix Campus — {4},{T}: skrut 1 to blokująca decyzja', () => {
  const state = game();
  put(state, 'cam', 'quandrix-campus', 'p1', 'battlefield', { tapped: false });
  put(state, 'lib-gora', 'basic-swamp', 'p1', 'library');
  addMana(state, 'p1', 4);
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'cam'));
  assert.ok(passAzzdo(state, (s) => s.pendingScry), 'skrut 1 kolejkuje decyzję po rozstrzygnięciu zdolności');
  assert.equal(state.pendingScry.objectIds.length, 1, 'skrut 1 = jedna karta');
  run(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: [] });
  assert.equal(state.pendingScry, null, 'po decyzji skrut zamknięty');
  assert.equal(find(state, 'quandrix-campus').tapped, true, 'zdolność tapnie źródło');
});

// ---- B64/324: Spineseeker Centipede (DSK #199, plan Duskmourn) ---------------

test('B64/324: Spineseeker Centipede — dane Oracle: ETB szuka basic landu + delirium +1/+2 i vigilance', () => {
  const def = sanity('spineseeker-centipede', { set: 'DSK', plan: 'Duskmourn', artId: 324 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Insect']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 3);
  assert.equal(def.abilities.length, 2, 'trigger szukania + zdolność statyczna');
  assert.deepEqual(def.abilities[0].effect, [{ type: 'search_library_to_hand', qualifier: { types: ['Basic', 'Land'] } }]);
  assert.equal(def.abilities[1].type, 'static');
  assert.deepEqual(def.abilities[1].condition, { delirium: true }, 'delirium jako warunek statyczny (CR 207.2c)');
  assert.deepEqual(def.abilities[1].pump, { power: 1, toughness: 2 });
  assert.deepEqual(def.abilities[1].keywords, ['vigilance']);
});

test('B64/324: Spineseeker Centipede — ETB daje basic land do ręki', () => {
  const state = game();
  put(state, 'cent', 'spineseeker-centipede', 'p1', 'hand');
  put(state, 'lib-forest', 'basic-forest', 'p1', 'library');
  put(state, 'lib-swamp', 'basic-swamp', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'cent'));
  assert.ok(passAzzdo(state, (s) => s.pendingSearchChoice), 'ETB szuka basic landu');
  assert.equal(state.pendingSearchChoice.destination, 'hand', 'cel to RĘKA (nie pole bitwy)');
  run(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-forest', destination: 'hand' });
  assert.ok(find(state, 'basic-forest', 'hand'), 'basic ląd trafia do ręki');
  assert.ok(find(state, 'spineseeker-centipede', 'battlefield'), 'centypede na polu bitwy');
});

test('B64/324: Spineseeker Centipede — przy 4 typach kart w grobie +1/+2 i czujność', () => {
  const state = game();
  put(state, 'cent', 'spineseeker-centipede', 'p1', 'battlefield');
  const przed = state.objects.get('cent');
  assert.equal(effectivePower(przed, state), 2, 'bez delirium: bazowe 2/1');
  assert.equal(effectiveToughness(przed, state), 1);
  assert.ok(!effectiveKeywords(przed, state).includes('vigilance'), 'bez delirium brak czujności');
  deliriumWGrobie(state, 'p1');
  const po = state.objects.get('cent');
  assert.equal(effectivePower(po, state), 3, 'delirium: +1 siły');
  assert.equal(effectiveToughness(po, state), 3, 'delirium: +2 wytrzymałości');
  assert.ok(effectiveKeywords(po, state).includes('vigilance'), 'delirium: czujność');
});

test('B64/324: Spineseeker Centipede — trzy typy kart w grobie to za mało', () => {
  const state = game();
  put(state, 'cent', 'spineseeker-centipede', 'p1', 'battlefield');
  put(state, 'gy-twór', 'rustvine-cultivator', 'p1', 'graveyard'); // Creature
  put(state, 'gy-czar', 'negate', 'p1', 'graveyard');              // Instant
  put(state, 'gy-land', 'basic-swamp', 'p1', 'graveyard');         // Land
  const cent = state.objects.get('cent');
  assert.equal(effectivePower(cent, state), 2, '3 typy < progu 4 — brak bonusu');
  assert.equal(effectiveToughness(cent, state), 1);
  assert.ok(!effectiveKeywords(cent, state).includes('vigilance'));
});

// ---- B64/325: Narset's Rebuke (TDM #114, plan Tarkir) ------------------------

test('B64/325: Narset\'s Rebuke — dane Oracle: instant {4}{R}, 5 obrażeń + {U}{R}{W} + exile', () => {
  const def = sanity('narsets-rebuke', { set: 'TDM', plan: 'Tarkir', artId: 325 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 5);
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.targets, [{ type: 'creature' }]);
  assert.deepEqual(def.spell.effects.map((e) => e.type),
    ['exile_if_dies_this_turn', 'damage', 'add_mana', 'add_mana', 'add_mana'],
    'znacznik exile, obrażenia i trzy OSOBNE jednostki many (ADR 0015)');
  assert.deepEqual(def.spell.effects.filter((e) => e.type === 'add_mana').map((e) => e.colors),
    [['U'], ['R'], ['W']], '„Add {U}{R}{W}" = {U} + {R} + {W}, nie jedna trójkolorowa');
});

test('B64/325: Narset\'s Rebuke — 5 obrażeń, trzy kolory many i wygnanie zamiast grobu', () => {
  const state = game();
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield');
  put(state, 'reb', 'narsets-rebuke', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['R'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'reb');
  assert.ok(cast, 'rzut za {4}{R} jest oferowany');
  assert.deepEqual(cast.targets, ['cel'], 'cel: stwór przeciwnika');
  run(state, cast);
  doKoncaStosu(state);
  assert.ok(find(state, 'rustvine-cultivator', 'exile'), 'zabity stwór idzie na wygnanie, nie do grobu');
  assert.ok(!find(state, 'rustvine-cultivator', 'graveyard'), 'grób pusty');
  const pool = player(state, 'p1').manaPool ?? {};
  assert.equal(player(state, 'p1').mana, 3, 'trzy jednostki many w puli');
  assert.deepEqual(
    { U: pool.U ?? 0, R: pool.R ?? 0, W: pool.W ?? 0 },
    { U: 1, R: 1, W: 1 },
    'każdy kolor osobno — „Add {U}{R}{W}" to trzy jednostki',
  );
});

test('B64/325: Narset\'s Rebuke — bez stwora na polu NIE MA oferty rzutu', () => {
  const state = game();
  put(state, 'reb', 'narsets-rebuke', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['R'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'reb'),
    'brak legalnego celu („target creature") = brak oferty');
});

// ---- B64/327: Brave-Kin Duo (BLB #3, plan Bloomburrow) -----------------------

test('B64/327: Brave-Kin Duo — dane Oracle: 1/1 za {W}, {1},{T}: +1/+1 do EOT, tylko sorcery', () => {
  const def = sanity('brave-kin-duo', { set: 'BLB', plan: 'Bloomburrow', artId: 327 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Rabbit', 'Mouse']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 1);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'activated');
  assert.equal(ab.timing, 'sorcery', '„Activate only as a sorcery" — timing w definicji');
  assert.deepEqual(ab.cost, { mana: 1, tap: true });
  assert.deepEqual(ab.targets, [{ type: 'creature' }]);
  assert.deepEqual(ab.effect, { type: 'buff_creature_until_end_of_turn', power: 1, toughness: 1 });
});

test('B64/327: Brave-Kin Duo — aktywacja daje +1/+1 do końca tury', () => {
  const state = game();
  put(state, 'duo', 'brave-kin-duo', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p1', 'battlefield');
  addMana(state, 'p1', 1);
  // Oferta enumeruje cele — bierzemy wariant na stworze „cel", nie na sobie.
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'duo'
    && c.targets?.[0] === 'cel');
  assert.ok(act, 'własna main phase: aktywacja z celem na „cel" jest oferowana');
  const silaPrzed = effectivePower(state.objects.get('cel'), state);
  const wytrPrzed = effectiveToughness(state.objects.get('cel'), state);
  run(state, act);
  settle(state);
  assert.equal(effectivePower(state.objects.get('cel'), state), silaPrzed + 1, '+1 siły');
  assert.equal(effectiveToughness(state.objects.get('cel'), state), wytrPrzed + 1, '+1 wytrzymałości');
  assert.equal(state.objects.get('duo').tapped, true, 'źródło tapnięte kosztem {T}');
});

test('B64/327: Brave-Kin Duo — timing sorcery: w turze PRZECIWNIKA nie ma oferty', () => {
  const state = game();
  put(state, 'duo', 'brave-kin-duo', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p1', 'battlefield');
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p1', 1);
  assert.ok(!commands(state, 'p1').some((c) => c.type === 'activate_ability' && c.objectId === 'duo'),
    '„Activate only as a sorcery" — w cudzej turze zdolność nie jest oferowana');
});

// ---- B64/328: Bog Hoodlums (LRW #100, plan Lorwyn) ---------------------------

test('B64/328: Bog Hoodlums — dane Oracle: 4/1 za {5}{B}, nie może blokować, ETB clash', () => {
  const def = sanity('bog-hoodlums', { set: 'LRW', plan: 'Lorwyn', artId: 328 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Goblin', 'Warrior']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 4);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 6);
  assert.equal(def.cantBlock, true, 'stała flaga karty („This creature can\'t block")');
  const ab = def.abilities[0];
  assert.equal(ab.type, 'triggered');
  assert.equal(ab.trigger.event, 'enter_battlefield');
  assert.deepEqual(ab.effect, [{ type: 'clash', counterOnWin: '+1/+1' }],
    'clash z nagrodą licznikiem (CR 701.30)');
});

test('B64/328: Bog Hoodlums — wydrukowany zakaz blokowania trafia na obiekt jako cantBlockPrinted', () => {
  const state = game();
  put(state, 'hood', 'bog-hoodlums', 'p1', 'battlefield');
  const hood = state.objects.get('hood');
  assert.equal(hood.cantBlockPrinted, true, 'trwały znacznik na obiekcie (wzorzec tokenów)');
  assert.equal(hood.cantBlock, false, 'to NIE jest efekt „can\'t block this turn"');
});

test('B64/328: Bog Hoodlums — wygrany clash kładzie licznik +1/+1 na źródle', () => {
  const state = game();
  put(state, 'hood', 'bog-hoodlums', 'p1', 'hand');
  // Clash odsłania WIERZCH biblioteki: Snarespinner ({2}{G}, MV 3) vs Swamp (MV 0).
  wierzch(state, 'lib-moja', 'snarespinner', 'p1');
  wierzch(state, 'lib-wroga', 'basic-swamp', 'p2');
  addMana(state, 'p1', 6, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'hood'));
  doDecyzjiTriggera(state);
  assert.ok(passAzzdo(state, (s) => s.pendingClash), 'clash kolejkuje decyzje obu graczy');
  assert.deepEqual(state.pendingClash.choices, ['p1', 'p2'], 'oba gracze odkładają swoją kartę');
  assert.equal(state.pendingClash.counterOnWin, '+1/+1', 'nagroda licznikiem jedzie z decyzją');
  run(state, { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false });
  assert.ok(state.pendingClash, 'po jednej decyzji clash wciąż czeka na drugą');
  run(state, { type: 'resolve_clash_choice', playerId: 'p2', putOnBottom: false });
  assert.equal(state.pendingClash, null, 'po obu decyzjach clash zamknięty');
  const hood = find(state, 'bog-hoodlums', 'battlefield');
  assert.equal(hood.counters['+1/+1'], 1, 'wygrana = licznik +1/+1 na źródle');
  assert.equal(effectivePower(hood, state), 5, '4/1 + 1/+1 = 5/2');
  assert.equal(effectiveToughness(hood, state), 2);
});

test('B64/328: Bog Hoodlums — przegrany clash nie kładzie licznika', () => {
  const state = game();
  put(state, 'hood', 'bog-hoodlums', 'p1', 'hand');
  // Wierzch p1 = Swamp (MV 0), wierzch p2 = Snarespinner (MV 3) — p1 przegrywa.
  wierzch(state, 'lib-moja', 'basic-swamp', 'p1');
  wierzch(state, 'lib-wroga', 'snarespinner', 'p2');
  addMana(state, 'p1', 6, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'hood'));
  doDecyzjiTriggera(state);
  assert.ok(passAzzdo(state, (s) => s.pendingClash));
  run(state, { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false });
  run(state, { type: 'resolve_clash_choice', playerId: 'p2', putOnBottom: false });
  const hood = find(state, 'bog-hoodlums', 'battlefield');
  assert.equal(hood.counters['+1/+1'] ?? 0, 0, 'przegrana = brak licznika');
  assert.equal(effectivePower(hood, state), 4, 'zostaje 4/1');
  assert.equal(effectiveToughness(hood, state), 1);
});

test('B64/328: Bog Hoodlums — nie występuje wśród legalnych blokerów', () => {
  const state = game();
  put(state, 'hood', 'bog-hoodlums', 'p1', 'battlefield');
  put(state, 'wrog', 'rustvine-cultivator', 'p2', 'battlefield');
  // Stwór przeciwnika wszedł tej samej tury — zdejmujemy chorobę przywołania,
  // żeby sam atak (a nie zakaz blokowania) był jedyną zmienną scenariusza.
  state.objects.set('wrog', Object.freeze({ ...state.objects.get('wrog'), enteredOnTurn: null }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  const declare = commands(state, 'p2').find((c) => c.type === 'declare_attackers'
    && c.attackerIds?.includes('wrog'));
  assert.ok(declare, 'przeciwnik może atakować stworem „wrog”');
  run(state, declare);
  run(state, commands(state, 'p2').find((c) => c.type === 'pass_priority'));
  run(state, commands(state, 'p1').find((c) => c.type === 'pass_priority'));
  assert.equal(state.turn.step, 'declare_blockers', 'silnik prowadzi do kroku bloków');
  const blockOffer = commands(state, 'p1').find((c) => c.type === 'declare_blockers');
  assert.ok(blockOffer, 'faza bloków');
  const legalniBlokerzy = (blockOffer.blockers ?? []).map((b) => b.blockerId ?? b.objectId);
  assert.ok(!legalniBlokerzy.includes('hood'),
    `Bog Hoodlums nie jest legalnym blokerem („can't block"): ${JSON.stringify(legalniBlokerzy)}`);
});
