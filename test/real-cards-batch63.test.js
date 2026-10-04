// Batch 63 (2026-10-04) — karty właściciela: 212 VOW, 239 SOS, 241 SPM, 244 BFZ,
// 247 ORI, 250 MRD, 254 DMU, 255 APC, 259 2XM, 260 MOM — razem 10 kart.
//
// Ten plik: **transza T2** (239 Dig Site Inventory, 241 News Helicopter,
// 244 Natural Connection, 250 Loxodon Mender) — karty, które nie wymagają
// nowych mechanik silnika; kolejne transze dokładają swoje sekcje.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-10-04,
// `set=` obowiązkowy — ADR 0010 §2a; rulingi przy kartce, także puste listy —
// ADR 0028). artId z wiersza arkusza właściciela (`<nr><SET>` w
// `tools/collection-art-ids.csv`). Plan batcha:
// `docs/plans/PLAN_2026-10-04g-batch63-kolekcja-212-260.md`.
//
// Każda karta ma sanity danych Oracle/druku/planu, scenariusz legalny
// (efekt działa) oraz nielegalny (brak oferty — maszynowo rozpoznawalny).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 63, players: players.map((id) => ({ id })) });
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
    if (!pick) return;
    run(s, pick);
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

// ---- B63/239: Dig Site Inventory (SOS #10, plan Arcavios) -------------------

test('B63/239: Dig Site Inventory — dane Oracle, sorcery {W} z flashbackiem {W}', () => {
  const def = sanity('dig-site-inventory', { set: 'SOS', plan: 'Arcavios', artId: 239 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 1);
  assert.deepEqual(def.spell.flashback, { cost: 1, colors: ['W'] }, 'flashback {W} (CR 702.34)');
  assert.deepEqual(def.spell.targets, [{ type: 'creature_you_control' }]);
});

test('B63/239: Dig Site Inventory — licznik +1/+1 i vigilance na własnym stworze', () => {
  const state = game();
  put(state, 'wonny', 'rustvine-cultivator', 'p1', 'battlefield'); // 1/2 bez vigilance
  put(state, 'inw', 'dig-site-inventory', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'inw');
  assert.ok(cast, 'rzut za {W} jest oferowany');
  assert.deepEqual(cast.targets, ['wonny'], 'cel: własny stwór');
  run(state, cast);
  settle(state);
  const live = state.objects.get('wonny');
  assert.equal(live.counters['+1/+1'], 1, 'licznik +1/+1');
  assert.ok(effectiveKeywords(live, state).includes('vigilance'), 'czujność do końca tury');
});

test('B63/239: Dig Site Inventory — flashback {W} z grobu, po rozstrzygnięciu karta na wygnaniu', () => {
  const state = game();
  put(state, 'wonny', 'rustvine-cultivator', 'p1', 'battlefield');
  put(state, 'inw', 'dig-site-inventory', 'p1', 'graveyard');
  addMana(state, 'p1', 1, { colors: ['W'] });
  const fb = commands(state).find((c) => c.type === 'cast_flashback' && c.objectId === 'inw');
  assert.ok(fb, 'flashback z grobu jest oferowany');
  run(state, fb);
  settle(state);
  const wygnana = [...state.objects.values()].find((o) => o.cardId === 'dig-site-inventory');
  assert.equal(wygnana.zone, 'exile', 'flashback wygania kartę (ruling 2026-03-20)');
});

test('B63/239: Dig Site Inventory — bez własnego stwora NIE MA oferty rzutu', () => {
  const state = game();
  put(state, 'inw', 'dig-site-inventory', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'inw'),
    'brak legalnego celu („target creature you control") = brak oferty');
});

// ---- B63/241: News Helicopter (SPM #169, plan Marvel) -----------------------

test('B63/241: News Helicopter — dane Oracle, 1/1 Construct z lataniem za {3}', () => {
  const def = sanity('news-helicopter', { set: 'SPM', plan: 'Marvel', artId: 241 });
  assert.deepEqual(def.types, ['Artifact', 'Creature']);
  assert.deepEqual(def.subtypes, ['Construct']);
  assert.deepEqual(def.colors, []);
  assert.deepEqual(def.keywords, ['flying']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 3);
});

test('B63/241: News Helicopter — wejście tworzy token 1/1 zielono-biały Human Citizen', () => {
  const state = game();
  put(state, 'helikopter', 'news-helicopter', 'p1', 'hand');
  addMana(state, 'p1', 3);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'helikopter'));
  settle(state);
  const token = find(state, 'token_human_citizen');
  assert.ok(token, 'token Human Citizen na polu bitwy');
  assert.equal(token.controllerId, 'p1');
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  assert.deepEqual([...token.colors].sort(), ['G', 'W']);
  assert.ok(token.subtypes.includes('Human') && token.subtypes.includes('Citizen'));
});

// ---- B63/244: Natural Connection (BFZ #179, plan Zendikar) ------------------

test('B63/244: Natural Connection — dane Oracle, instant {2}{G} szukający basic landu', () => {
  const def = sanity('natural-connection', { set: 'BFZ', plan: 'Zendikar', artId: 244 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.spell.effects, [{ type: 'search_library_to_battlefield', qualifier: { types: ['Basic', 'Land'] }, entersTapped: true }],
    'kontrakt silnika: istniejący efekt + entersTapped (audyt 2026-10-04)');
});

test('B63/244: Natural Connection — basic land wchodzi TAPNIĘTY, biblioteka maleje', () => {
  const state = game();
  put(state, 'natura', 'natural-connection', 'p1', 'hand');
  const libraryBefore = playerView(state, 'p1').zones.library.length;
  addMana(state, 'p1', 3, { colors: ['G'] });
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'natura'));
  settle(state);
  const land = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.kind === 'land' && o.controllerId === 'p1');
  assert.ok(land, 'wyszukany land trafił na pole bitwy');
  assert.equal(land.tapped, true, '„put it onto the battlefield tapped"');
  assert.equal(playerView(state, 'p1').zones.library.length, libraryBefore - 1, 'biblioteka pomniejszona o wyszukaną kartę');
});

// ---- B63/250: Loxodon Mender (MRD #12, plan Mirrodin) ----------------------

test('B63/250: Loxodon Mender — dane Oracle, 3/3 za {5}{W} z regeneracją artefaktu', () => {
  const def = sanity('loxodon-mender', { set: 'MRD', plan: 'Mirrodin', artId: 250 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Elephant', 'Cleric']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 6);
});

test('B63/250: Loxodon Mender — {W}, {T}: tarcza regeneracji na artefakcie', () => {
  const state = game();
  put(state, 'mender', 'loxodon-mender', 'p1', 'battlefield');
  put(state, 'artefakt', 'oreplate-pangolin', 'p1', 'battlefield'); // Artifact Creature
  addMana(state, 'p1', 1, { colors: ['W'] });
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'mender');
  assert.ok(act, 'aktywacja {W}, {T} jest oferowana');
  assert.deepEqual(act.targets, ['artefakt'], 'cel: artefakt');
  run(state, act);
  settle(state);
  assert.ok((state.regenerationShields ?? []).includes('artefakt'), 'tarcza regeneracji (CR 701.19)');
  assert.equal(state.objects.get('mender').tapped, true, 'koszt {T} — źródło tapnięte');
});

test('B63/250: Loxodon Mender — bez artefaktu i bez białej many brak oferty', () => {
  const bezArtefaktu = game();
  put(bezArtefaktu, 'mender', 'loxodon-mender', 'p1', 'battlefield');
  addMana(bezArtefaktu, 'p1', 1, { colors: ['W'] });
  assert.ok(!commands(bezArtefaktu).some((c) => c.type === 'activate_ability' && c.objectId === 'mender'),
    '„target artifact" bez artefaktu = brak oferty');

  const bezMana = game();
  put(bezMana, 'mender', 'loxodon-mender', 'p1', 'battlefield');
  put(bezMana, 'artefakt', 'oreplate-pangolin', 'p1', 'battlefield');
  addMana(bezMana, 'p1', 1, { colors: [] }); // jawnie bezbarwna
  assert.ok(!commands(bezMana).some((c) => c.type === 'activate_ability' && c.objectId === 'mender'),
    'bezbarwna mana nie opłaca białego pipu');
});
