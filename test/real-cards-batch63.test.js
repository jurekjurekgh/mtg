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
import { createAbility } from '../src/engine/abilities.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectiveKeywords, effectivePower } from '../src/engine/permanents.js';
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

// ---- B63/255: Urborg Uprising (APC #53, plan Dominaria) ---------------------

test('B63/255: Urborg Uprising — dane Oracle, sorcery {4}{B} z dwoma opcjonalnymi celami', () => {
  const def = sanity('urborg-uprising', { set: 'APC', plan: 'Dominaria', artId: 255 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.manaCost, 5);
  assert.deepEqual(def.spell.targets, [
    { type: 'creature_card_in_graveyard', optional: true, targetWord: 'cards' },
    { type: 'creature_card_in_graveyard', optional: true, targetWord: 'cards' },
  ], 'dwa sloty opcjonalne z jednym słowem „target" („up to two")');
  assert.deepEqual(def.spell.effects.at(-1), { type: 'draw_cards', amount: 1 });
});

test('B63/255: Urborg Uprising — dwa stwory z grobu wracają do ręki, dobierasz kartę', () => {
  const state = game();
  put(state, 'gr1', 'rustvine-cultivator', 'p1', 'graveyard');
  put(state, 'gr2', 'loxodon-mender', 'p1', 'graveyard');
  put(state, 'urborg', 'urborg-uprising', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  const libraryBefore = playerView(state, 'p1').zones.library.length;
  const offer = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'urborg'
    && (c.targets ?? []).filter(Boolean).length === 2);
  assert.ok(offer, 'oferta rzutu z dwoma celami istnieje');
  run(state, offer);
  settle(state);
  const reka = playerView(state, 'p1').zones.hand;
  assert.equal(reka.length, 3, 'dwie wrócone karty + dobrana');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'rustvine-cultivator' && o.zone === 'hand'));
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'loxodon-mender' && o.zone === 'hand'));
  assert.equal(playerView(state, 'p1').zones.library.length, libraryBefore - 1, 'dokładnie jedno dobranie');
});

test('B63/255: Urborg Uprising — rzut BEZ celów jest legalny i daje tylko dobranie (ruling 2022-12-08)', () => {
  const state = game();
  put(state, 'urborg', 'urborg-uprising', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  const libraryBefore = playerView(state, 'p1').zones.library.length;
  const offer = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'urborg'
    && (c.targets ?? []).every((t) => t == null));
  assert.ok(offer, '„up to two" — oferta bez celów istnieje także przy pustym grobie');
  run(state, offer);
  settle(state);
  assert.equal(playerView(state, 'p1').zones.hand.length, 1, 'dobrana karta');
  assert.equal(playerView(state, 'p1').zones.library.length, libraryBefore - 1);
});

test('B63/255: Urborg Uprising — sam stwór w grobie wystarcza (jeden cel), cudzy grób nie jest pulem', () => {
  const state = game();
  put(state, 'gr1', 'rustvine-cultivator', 'p1', 'graveyard');
  put(state, 'gr2', 'loxodon-mender', 'p2', 'graveyard'); // grób PRZECIWNIKA
  put(state, 'urborg', 'urborg-uprising', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  const offer = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'urborg'
    && (c.targets ?? []).filter(Boolean).length === 1);
  assert.ok(offer, 'oferta z jednym (własnym) celem istnieje');
  assert.ok(!(offer.targets ?? []).includes('gr2'), 'karta z grobu przeciwnika nie jest legalnym celem');
  run(state, offer);
  settle(state);
  // Przeniesienie do ręki tworzy NOWY obiekt (nowe id) — szukamy po cardId.
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'rustvine-cultivator' && o.zone === 'hand'),
    'własna karta wróciła do ręki');
  assert.equal(state.objects.get('gr2').zone, 'graveyard', 'cudzy grób nietknięty');
});

test('B63/255: Urborg Uprising — brak many = brak oferty (sorcery bez okna)', () => {
  const state = game();
  put(state, 'urborg', 'urborg-uprising', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'urborg'),
    'cztery many to za mało na {4}{B}');
});

// ---- B63/247: Subterranean Scout (ORI #164, plan Lorwyn) --------------------

test('B63/247: Subterranean Scout — dane Oracle, 2/1 Goblin Scout za {1}{R}', () => {
  const def = sanity('subterranean-scout', { set: 'ORI', plan: 'Lorwyn', artId: 247 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Goblin', 'Scout']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 2);
  assert.deepEqual(def.abilities[0].trigger.requiresTarget,
    { type: 'creature_with_power_at_most', max: 2 }, 'nowy deskryptor górnej granicy mocy');
});

test('B63/247: Subterranean Scout — ETB: cel o sile ≤ 2 dostaje „can\'t be blocked" do końca tury', () => {
  const state = game();
  put(state, 'scout', 'subterranean-scout', 'p1', 'hand');
  put(state, 'maly', 'rustvine-cultivator', 'p1', 'battlefield'); // 1/2
  put(state, 'duzy', 'loxodon-mender', 'p1', 'battlefield'); // 3/3 — moc 3 > 2
  addMana(state, 'p1', 2, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scout'));
  doDecyzjiTriggera(state);
  const oferty = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(oferty.length > 0, 'trigger ETB czeka na cel (decyzja gracza)');
  assert.ok(oferty.some((c) => c.targetId === 'maly'), 'stwór o sile 1 jest legalnym celem');
  assert.ok(oferty.every((c) => c.targetId !== 'duzy'), 'stwór o sile 3 NIE jest legalnym celem');
  run(state, oferty.find((c) => c.targetId === 'maly'));
  settle(state);
  assert.equal(state.objects.get('maly').cantBeBlockedUntilTurn, state.turn.number + 1,
    'dar ewazji do końca tury (M407)');
});

test('B63/247: Subterranean Scout — sam jest jedynym legalnym celem ETB', () => {
  const state = game();
  put(state, 'scout', 'subterranean-scout', 'p1', 'hand');
  put(state, 'duzy', 'loxodon-mender', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scout'));
  settle(state);
  const scout = find(state, 'subterranean-scout');
  assert.equal(scout.cantBeBlockedUntilTurn, state.turn.number + 1,
    'jedyny cel może być obsłużony automatycznie, ale EFEKT musi nastąpić (CR 603.6a)');
  assert.ok(!state.objects.get('duzy').cantBeBlockedUntilTurn);
});

test('B63/247: Subterranean Scout — anthem podnosi także jego moc, naprawdę brak celu', () => {
  const state = game();
  put(state, 'anthem', 'anthem-of-champions', 'p1', 'battlefield');
  put(state, 'scout', 'subterranean-scout', 'p1', 'hand');
  put(state, 'duzy', 'loxodon-mender', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scout'));
  settle(state);
  const scout = find(state, 'subterranean-scout');
  assert.equal(effectivePower(scout, state), 3, 'stały efekt działa od chwili wejścia (CR 603.6b)');
  assert.ok(!scout.cantBeBlockedUntilTurn, 'samocelowanie też nielegalne');
  assert.ok(!state.objects.get('duzy').cantBeBlockedUntilTurn);
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.pendingTriggerTargets.length, 0, 'brak oczekującej decyzji (CR 603.3d)');
});

test('B63/247: Subterranean Scout — wzrost mocy po wyborze celu unieważnia go przy rezolucji', () => {
  const state = game();
  put(state, 'scout', 'subterranean-scout', 'p1', 'hand');
  put(state, 'cel', 'rustvine-cultivator', 'p1', 'battlefield');
  put(state, 'surge', 'savage-surge', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R', 'G'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scout'));
  doDecyzjiTriggera(state);
  run(state, commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'cel'));
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'surge' && c.targets?.[0] === 'cel'));
  settle(state);
  assert.equal(effectivePower(state.objects.get('cel'), state), 3);
  assert.ok(!state.objects.get('cel').cantBeBlockedUntilTurn, 'moc >2 w rezolucji: dar nie następuje (CR 608.2b)');
});

test('B63/247: Subterranean Scout — granica mocy z buforami (moc EFEKTYWNA, CR 613)', () => {
  const zLicznikiem = (ile) => {
    const state = game();
    put(state, 'scout', 'subterranean-scout', 'p1', 'hand');
    put(state, 'cel', 'rustvine-cultivator', 'p1', 'battlefield');
    state.objects.set('cel', Object.freeze({ ...state.objects.get('cel'), counters: { '+1/+1': ile } }));
    addMana(state, 'p1', 2, { colors: ['R'] });
    run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scout'));
    doDecyzjiTriggera(state);
    const oferty = commands(state).filter((c) => c.type === 'resolve_trigger_target');
    return { oferty, state };
  };
  // 1/2 + jeden licznik = moc 2 → legalny; + dwa liczniki = moc 3 → nielegalny.
  assert.ok(zLicznikiem(1).oferty.some((c) => c.targetId === 'cel'), 'moc 2 (1/2 + licznik) jest legalna');
  assert.ok(zLicznikiem(2).oferty.every((c) => c.targetId !== 'cel'), 'moc 3 (1/2 + dwa liczniki) nie jest legalna');
});

// ---- BATCH 63 / silnik: zdarzenie triggera `blocks` (karta 254 wstrzymana) --
// 254 Snarespinner (DMU, plan Dominaria) jest WSTRZYMANA do decyzji o migracji
// podziału talii Dominaria (re-balans M228/ADR 0024 zmienia nazwy plików
// dominaria-ub/brg → dominaria-ub/wrg i unieważnia ~600 referencji: fixture'y
// sesji, BENCH_DECKS, domyślne talie testera). Silnikowe wsparcie karty jest
// gotowe i pokryte pinem syntetycznym poniżej; po migracji wystarczy definicja
// danych + snapshot `scryfall-snarespinner.json.pending`.

/** Wstawia stwora z DOWOLNYMI zdolnościami (pin silnikowy bez wpisu w katalogu). */
function putZAbilities(state, id, cardId, controllerId, abilities, extra = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords, abilities, ...extra,
  });
  return state.objects.get(id);
}

/** Deklaruje atak p1 i blok p2 (pary: atakujący → [blokerzy]). */
function zablokuj(state, attackerIds, assignments) {
  for (const id of [...attackerIds, ...Object.values(assignments).flat()]) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok, 'atak zadeklarowany');
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments }).ok, 'blok zadeklarowany');
}

const TRIGGER_BLOKS = createAbility({
  type: 'triggered',
  trigger: { event: 'blocks', blockedHasKeyword: 'flying' },
  effect: { type: 'pump', power: 2, toughness: 0 },
});

test('B63/ENG: `blocks` + `blockedHasKeyword` — blok lotnika daje +2/+0 (silnik gotowy dla 254)', () => {
  const state = game(['p1', 'p2']);
  // `reach` (CR 702.17b) jest niezbędny, by pinowany stwór mógł zablokować lotnika.
  putZAbilities(state, 'pajak', 'rustvine-cultivator', 'p2', [TRIGGER_BLOKS], { keywords: ['reach'] }); // 1/2
  put(state, 'lotnik', 'delta-bloodflies', 'p1', 'battlefield'); // 1/2 z flying (bloker przeżyje 1 obrażenie)
  zablokuj(state, ['lotnik'], { lotnik: ['pajak'] });
  settle(state);
  assert.equal(effectivePower(state.objects.get('pajak'), state), 3, '1 + 2 = 3 (pump +2/+0)');
  assert.equal(state.objects.get('pajak').toughness, 2, 'wytrzymałość bez zmian (+0)');
});

test('B63/ENG: `blocks` — blok stwora BEZ cechy nie odpala triggera (filtr deskryptora)', () => {
  const state = game(['p1', 'p2']);
  putZAbilities(state, 'pajak', 'rustvine-cultivator', 'p2', [TRIGGER_BLOKS]);
  put(state, 'naziemny', 'loxodon-mender', 'p1', 'battlefield'); // 3/3 bez flying
  zablokuj(state, ['naziemny'], { naziemny: ['pajak'] });
  settle(state);
  assert.equal(effectivePower(state.objects.get('pajak'), state), 1, 'brak pompy bez cechy flying');
});

// Audyt PR #154/F3: „zero wybranych” != „wybrane cele zniknęły”.
for (const [chosen, exiled] of [[1, 1], [2, 1], [2, 2]]) {
  test(`B63/255: Urborg — ${chosen} wybrane, ${exiled} wygnane w odpowiedzi`, () => {
    const state = game();
    for (let i = 0; i < chosen; i++) put(state, `survivor${i}`, 'survivor-of-korlis', 'p1', 'graveyard');
    put(state, 'urborg', 'urborg-uprising', 'p1', 'hand');
    addMana(state, 'p1', 9, { colors: ['B', 'W', 'W'] });
    const before = playerView(state, 'p1').zones.library.length;
    const targetIds = Array.from({ length: chosen }, (_, i) => `survivor${i}`);
    run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'urborg'
      && c.targets?.filter(Boolean).length === chosen && targetIds.every((id) => c.targets.includes(id))));
    for (let i = 0; i < exiled; i++) {
      run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === `survivor${i}`));
    }
    settle(state);
    const anyLegal = chosen > exiled;
    assert.equal(playerView(state, 'p1').zones.library.length, before - (anyLegal ? 1 : 0),
      'dobranie tylko gdy został legalny cel; bez legalnych całość się nie rozstrzyga');
    assert.equal(playerView(state, 'p1').zones.hand.filter((c) => c.cardId === 'survivor-of-korlis').length, chosen - exiled);
  });
}
