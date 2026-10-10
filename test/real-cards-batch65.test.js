// Batch 65 (2026-10-10) — karty właściciela: 329 OGW, 332 IKO, 333 RNA,
// 334 ONE, 336 APC, 338 THB, 340 ONE, 341 DTK, 348 DMU, 350 BLC — razem
// 10 kart. Plan: docs/plans/PLAN_2026-10-10-batch65-kolekcja-329-350.md.
//
// L184: poprzedni agent stracił cały niezacommitowany batch w resetcie
// sandboxa — ten batch dochodzi KARTA PO KARCIE, commit + push natychmiast.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-10-10,
// `set=` obowiązkowe — ADR 0010 §2a; rulingi przy kartce, także puste listy —
// ADR 0028). artId z wiersza arkusza właściciela (`<nr><SET>` w
// `tools/collection-art-ids.csv`).
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
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { resolveUntilDecision, optionalPayOpen } from './helpers/deferred-trigger.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 65, players: players.map((id) => ({ id })) });
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

/** Rozstrzyga stos do końca (wzorzec real-cards-batch64). */
function settle(s, max = 60) {
  for (let i = 0; i < max; i++) {
    const idle = s.zones.stack.length === 0 && s.pendingTriggerTargets.length === 0;
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

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));
const lifeOf = (s, id) => s.players.find((p) => p.id === id).life;

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

// ---- B65/329: Blinding Drone (OGW #41, plan Zendikar) -----------------------

test('B65/329: Blinding Drone — dane Oracle: devoid 1/3 za {1}{U}, zdolność {C},{T}: tap celu', () => {
  const def = sanity('blinding-drone', { set: 'OGW', plan: 'Zendikar', artId: 329 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Eldrazi', 'Drone']);
  assert.deepEqual(def.colors, [], 'Devoid — karta bez koloru (CR 702.114)');
  assert.deepEqual(def.keywords, ['devoid']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 3);
  assert.equal(def.abilities.length, 1);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'activated');
  // {C}, {T}: Tap target creature. — pip bezbarwny w koszcie zdolności
  // (CR 107.4c: {C} opłaca WYŁĄCZNIE mana bezbarwna; cost.colors: ['C']).
  assert.deepEqual(ab.cost, { mana: 1, colors: ['C'], tap: true });
  assert.deepEqual(ab.targets, [{ type: 'creature' }], 'cel to DOWOLNY stwór');
  assert.deepEqual(ab.effect, { type: 'tap_permanent' });
});

test('B65/329: Blinding Drone — aktywacja za {C} tapuje celowego stwora (i sam się tapuje)', () => {
  const state = game();
  put(state, 'drone', 'blinding-drone', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { tapped: false });
  put(state, 'wlasny', 'rustvine-cultivator', 'p1', 'battlefield', { tapped: false });
  addMana(state, 'p1', 1, { colors: [] }); // {C} — tylko mana bezbarwna (CR 107.4c)
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'drone'
    && c.targets?.[0] === 'cel');
  assert.ok(act, 'aktywacja z celem na stwora przeciwnika jest oferowana');
  run(state, act);
  settle(state);
  const po = state.objects.get('cel');
  assert.equal(po.tapped, true, 'celowy stwór tapnięty');
  assert.equal(state.objects.get('drone').tapped, true, 'źródło opłaciło {T}');
  assert.equal(state.objects.get('wlasny').tapped, false, 'własny stwór nietknięty');
});

test('B65/329: Blinding Drone — {C} nie opłaca się maną kolorową (CR 107.4c)', () => {
  const state = game();
  put(state, 'drone', 'blinding-drone', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { tapped: false });
  addMana(state, 'p1', 1, { colors: ['U'] }); // {U} w puli — NIE opłaca pipa {C}
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'drone'),
    'brak oferty: pip bezbarwny wymaga many bezbarwnej');
});

test('B65/329: Blinding Drone — bez many / bez stworów na stole NIE MA oferty', () => {
  const state = game();
  put(state, 'drone', 'blinding-drone', 'p1', 'battlefield', { tapped: false });
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { tapped: false });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'drone'),
    'brak many = brak oferty (L48: oferta = walidacja)');
  addMana(state, 'p1', 1, { colors: [] });
  // Zdejmijmy cel — brak legalnego celu = brak okazji (CR 601.2c w ofercie).
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'cel');
  state.objects.delete('cel');
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'drone'),
    'brak legalnego celu = brak oferty');
  // Stan tapnięty też zamyka ofertę ({T} w koszcie).
  const st = game();
  put(st, 'drone2', 'blinding-drone', 'p1', 'battlefield', { tapped: true });
  put(st, 'cel2', 'rustvine-cultivator', 'p2', 'battlefield');
  addMana(st, 'p1', 1, { colors: [] });
  assert.ok(!commands(st).some((c) => c.type === 'activate_ability' && c.objectId === 'drone2'),
    'tapnięte źródło nie aktywuje zdolności z kosztem {T}');
});

// ---- B65/332: Blitz of the Thunder-Raptor (IKO #109, plan Thunder Junction) ----

test('B65/332: Blitz of the Thunder-Raptor — dane Oracle: {1}{R} instant, damage = inst/sorc w grobie + exile zamiast śmierci', () => {
  const def = sanity('blitz-of-the-thunder-raptor', { set: 'IKO', plan: 'Thunder Junction', artId: 332 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.targets, [{ type: 'creature_or_planeswalker' }],
    'cel: stwór LUB planeswalker — gracz NIE jest legalny (węższy od any_target)');
  assert.deepEqual(def.spell.effects.map((e) => e.type), ['damage', 'exile_if_dies_this_turn'],
    'obrażenia + znacznik „gdyby zginął w tej turze, wygnaj zamiast tego” (M177/A)');
  assert.equal(def.spell.effects[0].amount, 'instants_and_sorceries_in_your_graveyard');
  const snap = snapshotOf('blitz-of-the-thunder-raptor');
  assert.equal(snap.rulings.length, 2, '2 rulingi WotC 2020-04-17 (timing kwoty + zasięg efektu zastępczego)');
  assert.match(snap.rulings[0].comment, /still on the stack/, 'ruling 1: Blitz nie liczy się do własnej kwoty');
  assert.match(snap.rulings[1].comment, /deals no damage to it/, 'ruling 2: znacznik działa także przy 0 obrażeniach');
});

test('B65/332: Blitz — obrażenia = 3 (2 inst + 1 sorc; land NIE liczy się), zabity idzie na wygnanie', () => {
  // Kierunek „>= 3”: ofiara 3/3 ginie od Blitz przy 3 kartach w grobie.
  const state = game();
  put(state, 'gy-i1', 'negate', 'p1', 'graveyard');        // Instant
  put(state, 'gy-i2', 'negate', 'p1', 'graveyard');        // Instant
  put(state, 'gy-s1', 'act-of-treason', 'p1', 'graveyard'); // Sorcery
  put(state, 'gy-land', 'basic-swamp', 'p1', 'graveyard');  // Land — nie liczy się
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { power: 1, toughness: 3 });
  put(state, 'blitz', 'blitz-of-the-thunder-raptor', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'blitz');
  assert.ok(cast, 'rzut za {1}{R} jest oferowany');
  assert.deepEqual(cast.targets, ['cel'], 'cel: stwór przeciwnika');
  run(state, cast);
  settle(state);
  assert.ok(find(state, 'rustvine-cultivator', 'exile'), 'ofiara śmiertelnie trafiona — wygnana zamiast grobu');
  assert.ok(!find(state, 'rustvine-cultivator', 'graveyard'), 'grób pusty — efekt zastępczy zadziałał');
});

test('B65/332: Blitz — przy 4 kartach ofiara 3/3 też ginie, ale 4/4 przeżywa (kwota = dokładnie 3)', () => {
  // Kierunek „<= 3”: land w grobie NIE podbija kwoty (gdyby liczył — 4/4 padłaby),
  // a sam Blitz na stosie się nie liczy (ruling 2020-04-17 — gdyby liczył, 4/4 też).
  const state = game();
  put(state, 'gy-i1', 'negate', 'p1', 'graveyard');
  put(state, 'gy-i2', 'negate', 'p1', 'graveyard');
  put(state, 'gy-s1', 'act-of-treason', 'p1', 'graveyard');
  put(state, 'gy-land', 'basic-swamp', 'p1', 'graveyard');
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { power: 1, toughness: 4 });
  put(state, 'blitz', 'blitz-of-the-thunder-raptor', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'blitz');
  run(state, cast);
  settle(state);
  assert.ok(find(state, 'rustvine-cultivator', 'battlefield'), '4/4 przeżyła dokładnie 3 obrażenia');
  assert.ok(!find(state, 'rustvine-cultivator', 'graveyard'), 'ofiara żyje — bez grobu');
});

test('B65/332: Blitz — pusty grób: 0 obrażeń, ale znacznik wygnania działa i przy 0 (ruling 2)', () => {
  const state = game();
  put(state, 'cel', 'rustvine-cultivator', 'p2', 'battlefield', { power: 1, toughness: 1 });
  put(state, 'blitz', 'blitz-of-the-thunder-raptor', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'blitz');
  run(state, cast);
  settle(state);
  assert.ok(find(state, 'rustvine-cultivator', 'battlefield'), '0 obrażeń (pusty grób — Blitz na stosie się nie liczy)');
  // Ofiara ginie w tej samej turze z INNEGO powodu (Shock) — mimo 0 obrażeń z Blitza idzie na wygnanie.
  put(state, 'shk', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast2 = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'shk'
    && c.targets?.[0] === 'cel');
  assert.ok(cast2, 'Shock z celem na ranną ofiarę jest oferowany (wariant cel=cel)');
  run(state, cast2);
  settle(state);
  assert.ok(find(state, 'rustvine-cultivator', 'exile'),
    'śmierć z innego źródła w tej turze → wygnanie (znacznik z Blitza, ruling 2)');
  assert.ok(!find(state, 'rustvine-cultivator', 'graveyard'), 'grób pusty');
});

test('B65/332: Blitz — gracz NIE jest legalnym celem („creature or planeswalker” ≠ any_target)', () => {
  const state = game();
  put(state, 'blitz', 'blitz-of-the-thunder-raptor', 'p1', 'hand');
  put(state, 'shk', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['R'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'blitz'),
    'brak oferty Blitza: jedynym potencjalnym celem jest gracz (nielegalny)');
  assert.ok(commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'shk'
    && c.targets?.length === 1 && state.players.some((p) => p.id === c.targets[0])),
    'kontrola: Shock (any_target) w tej samej sytuacji celuje w gracza');
});

// ---- B65/333: Bring to Trial (RNA #5, plan New Capenna) -----------------------

test('B65/333: Bring to Trial — dane Oracle: {2}{W} sorcery, exile stwora mocy 4+', () => {
  const def = sanity('bring-to-trial', { set: 'RNA', plan: 'New Capenna', artId: 333 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 3);
  assert.equal(def.spell.timing, 'sorcery');
  assert.deepEqual(def.spell.targets, [{ type: 'creature_with_power_at_least', min: 4 }],
    'cel: stwór z mocą efektywną ≥ 4 (CR 613; jak tryb Wygnanie Selesnya Charm)');
  assert.deepEqual(def.spell.effects, [{ type: 'exile_permanent' }]);
  const snap = snapshotOf('bring-to-trial');
  assert.deepEqual(snap.rulings, [], 'rulingi pobrane 2026-10-10 — brak orzeczeń (ADR 0028)');
  assert.equal(snap.rulingsSource, 'https://api.scryfall.com/cards/rna/5/rulings');
});

test('B65/333: Bring to Trial — wygania stwora mocy 4+ (bez grobu)', () => {
  const state = game();
  put(state, 'duzy', 'rustvine-cultivator', 'p2', 'battlefield', { power: 4, toughness: 4 });
  put(state, 'trial', 'bring-to-trial', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'trial');
  assert.ok(cast, 'rzut za {2}{W} jest oferowany');
  assert.deepEqual(cast.targets, ['duzy'], 'cel: duży stwór przeciwnika');
  run(state, cast);
  settle(state);
  assert.ok(find(state, 'rustvine-cultivator', 'exile'), 'stwór mocy 4 wygnany');
  assert.ok(!find(state, 'rustvine-cultivator', 'graveyard'), 'nie zginął — poszedł prosto na wygnanie');
});

test('B65/333: Bring to Trial — stwór mocy < 4 nie jest legalnym celem (brak oferty)', () => {
  const state = game();
  put(state, 'maly', 'rustvine-cultivator', 'p2', 'battlefield', { power: 3, toughness: 3 });
  put(state, 'trial', 'bring-to-trial', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'trial'),
    'moc 3 < 4 — brak oferty (CR 601.2c)');
  // Kontrola: ten sam stwór z buforem do 4 mocy wchodzi w zakres (moc efektywna).
  state.objects.set('maly', Object.freeze({ ...state.objects.get('maly'), power: 4 }));
  assert.ok(commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'trial'
    && c.targets?.[0] === 'maly'), 'po podbiciu mocy do 4 ten sam cel jest oferowany');
});

// ---- B65/334: Skyscythe Engulfer (ONE #183, plan Mirrodin) --------------------

/** Stan tuż przed deklaracją bloków (wzorzec m380): p1 atakuje, p2 blokuje. */
function combatState65() {
  const st = game();
  st.turn = jumpToStep(st.turn, 'declare_attackers', 'p1');
  st.turn.activePlayerId = 'p1';
  st.turn.priorityPlayerId = 'p1';
  st.pendingMulligans = [];
  return st;
}

function pairOffered65(st, attackerId, blockerId) {
  const wanted = JSON.stringify({ [attackerId]: [blockerId] });
  return commands(st, 'p2').some((c) => c.type === 'declare_blockers'
    && JSON.stringify(c.assignments) === wanted);
}

function pairVerdict65(base, attackerId, blockerId) {
  const clone = structuredClone(base);
  return execute(clone, { type: 'declare_blockers', playerId: 'p2', assignments: { [attackerId]: [blockerId] } });
}

function enterBlocks65(st, attackerIds) {
  const declared = execute(st, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  assert.ok(declared.ok, `deklaracja atakujących: ${JSON.stringify(declared.events ?? declared.reason ?? null)}`);
  st.turn = jumpToStep(st.turn, 'declare_blockers', 'p2');
  st.turn.activePlayerId = 'p1';
  st.turn.priorityPlayerId = 'p2';
  return st;
}

test('B65/334: Skyscythe Engulfer — dane Oracle: 6/5 reach+trample, „can\'t be blocked by creatures with flying\"', () => {
  const def = sanity('skyscythe-engulfer', { set: 'ONE', plan: 'Mirrodin', artId: 334 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Phyrexian', 'Beast']);
  assert.deepEqual(def.colors, ['G']);
  assert.deepEqual(def.keywords, ['reach', 'trample']);
  assert.equal(def.power, 6);
  assert.equal(def.toughness, 5);
  assert.equal(def.manaCost, 6);
  assert.equal(def.abilities.length, 1);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'static');
  assert.deepEqual(ab.cantBeBlockedByKeywords, ['flying'],
    'restrykcja blokowania po keywordzie blokera (CR 509.1b)');
  const snap = snapshotOf('skyscythe-engulfer');
  assert.deepEqual(snap.rulings, [], 'rulingi pobrane 2026-10-10 — brak orzeczeń (ADR 0028)');
});

test('B65/334: Skyscythe Engulfer — stwory z lataniem NIE blokują; naziemny blokuje (oferta = walidacja)', () => {
  const st = combatState65();
  put(st, 'atk', 'skyscythe-engulfer', 'p1', 'battlefield', { summoningSickness: false });
  put(st, 'fly', 'skyscythe-engulfer', 'p2', 'battlefield', { summoningSickness: false, power: 1, toughness: 1, keywords: ['flying'] });
  put(st, 'ground', 'rustvine-cultivator', 'p2', 'battlefield', { summoningSickness: false, power: 2, toughness: 2 });
  enterBlocks65(st, ['atk']);
  // Bloker Z lataniem: brak oferty i odrzucenie komendy (CR 509.1b).
  assert.equal(pairOffered65(st, 'atk', 'fly'), false, 'bloker z lataniem nie jest oferowany');
  const zly = pairVerdict65(st, 'atk', 'fly');
  assert.equal(zly.ok, false, 'komenda z blokerem-lataniem odrzucona');
  assert.match(String(zly.reason ?? zly.events?.[0]?.reason ?? ''), /illegal_blockers/);
  // Bloker bez latania: oferta i przyjęcie.
  assert.equal(pairOffered65(st, 'atk', 'ground'), true, 'naziemny bloker jest oferowany');
  assert.equal(pairVerdict65(st, 'atk', 'ground').ok, true, 'naziemny bloker przyjęty');
});

test('B65/334: Skyscythe Engulfer — reach u blokera nie znosi restrykcji (liczy się sam keyword latania)', () => {
  const st = combatState65();
  put(st, 'atk', 'skyscythe-engulfer', 'p1', 'battlefield', { summoningSickness: false });
  // Bloker z lataniem I zasięgiem — restrykcja mówi „creatures with flying",
  // reach nie ma tu znaczenia (w odróżnieniu od bloku latającego atakującego).
  put(st, 'flyreach', 'skyscythe-engulfer', 'p2', 'battlefield', { summoningSickness: false, power: 1, toughness: 1, keywords: ['flying', 'reach'] });
  enterBlocks65(st, ['atk']);
  assert.equal(pairOffered65(st, 'atk', 'flyreach'), false, 'flying+reach NIE blokuje');
  assert.equal(pairVerdict65(st, 'atk', 'flyreach').ok, false);
});

// ---- B65/336: Zombie Boa (APC #54, plan Amonkhet) ----------------------------

/** Aktywacja „choose a color" do końca (wzorzec pendingColorChoice).
 * Niemana aktywacja idzie NA STOS (queueActivatedAbilityToStack) — najpierw
 * rozstrzygamy zdolność, POTEM wisi decyzja wyboru koloru. */
function wybierzKolor(st, objectId, color, playerId = 'p1') {
  const act = commands(st, playerId).find((c) => c.type === 'activate_ability' && c.objectId === objectId);
  assert.ok(act, 'aktywacja zdolności jest oferowana');
  run(st, act);
  for (let i = 0; i < 20; i++) {
    if (commands(st, playerId).some((c) => c.type === 'resolve_color_choice')) break;
    const p = st.turn.priorityPlayerId;
    const cmds = commands(st, p);
    const roz = cmds.find((c) => c.type.startsWith('resolve_') && c.type !== 'resolve_color_choice');
    if (roz) { run(st, roz); continue; }
    const pass = cmds.find((c) => c.type === 'pass_priority');
    if (pass && st.zones.stack.length) { run(st, pass); continue; }
    break;
  }
  const wybor = commands(st, playerId).find((c) => c.type === 'resolve_color_choice');
  assert.ok(wybor, 'po rozstrzygnięciu zdolności wisi decyzja wyboru koloru');
  run(st, { type: 'resolve_color_choice', playerId, color });
  return st;
}

test('B65/336: Zombie Boa — dane Oracle: 3/3 za {4}{B}, „choose a color" + destroy przy bloku tego koloru', () => {
  const def = sanity('zombie-boa', { set: 'APC', plan: 'Amonkhet', artId: 336 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Zombie', 'Snake']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 5);
  assert.equal(def.abilities.length, 2);
  const act = def.abilities[0];
  assert.equal(act.type, 'activated');
  assert.equal(act.timing, 'sorcery', '„Activate only as a sorcery"');
  assert.deepEqual(act.cost, { mana: 2, colors: ['B'] }, '{1}{B}');
  assert.deepEqual(act.effect, { type: 'choose_color_grant_block_destroy' });
  const trg = def.abilities[1];
  assert.equal(trg.type, 'triggered');
  assert.deepEqual(trg.trigger, { event: 'becomes_blocked_by_color' });
  assert.deepEqual(trg.effect, [{ type: 'destroy_permanent' }], 'cel = bloker („that creature”)');
  const snap = snapshotOf('zombie-boa');
  assert.deepEqual(snap.rulings, [], 'rulingi pobrane 2026-10-10 — brak orzeczeń (ADR 0028)');
});

test('B65/336: Zombie Boa — wybrany kolor: bloker tego koloru jest NISZCZONY przy bloku', () => {
  const st = game();
  put(st, 'boa', 'zombie-boa', 'p1', 'battlefield', { summoningSickness: false });
  put(st, 'blok', 'rustvine-cultivator', 'p2', 'battlefield', { summoningSickness: false, colors: ['R'] });
  addMana(st, 'p1', 2, { colors: ['B'] });
  wybierzKolor(st, 'boa', 'R'); // aktywacja TYLKO jako sorcery — więc w main
  assert.deepEqual(st.objects.get('boa').blockDestroyColorsThisTurn, ['R'], 'znacznik na turę zapisany');
  st.turn = jumpToStep(st.turn, 'declare_attackers', 'p1');
  st.turn.activePlayerId = st.turn.priorityPlayerId = 'p1';
  enterBlocks65(st, ['boa']);
  assert.equal(pairOffered65(st, 'boa', 'blok'), true, 'blok jest legalny — trigger zniszczy blokera');
  assert.equal(pairVerdict65(st, 'boa', 'blok').ok, true);
  // Tym razem ZAPISUJEMY deklarację w stanie bazowym, żeby trigger się rozstrzygnął.
  const decl = execute(st, { type: 'declare_blockers', playerId: 'p2', assignments: { boa: ['blok'] } });
  assert.ok(decl.ok);
  settle(st);
  assert.ok(find(st, 'rustvine-cultivator', 'graveyard'), 'bloker koloru R zniszczony („destroy that creature”)');
});

test('B65/336: Zombie Boa — filtr koloru: bloker innego koloru przeżywa; bez aktywacji też', () => {
  // (a) wybrany R, bloker U — przeżywa.
  const st = game();
  put(st, 'boa', 'zombie-boa', 'p1', 'battlefield', { summoningSickness: false });
  put(st, 'blok', 'rustvine-cultivator', 'p2', 'battlefield', { summoningSickness: false, colors: ['U'] });
  addMana(st, 'p1', 2, { colors: ['B'] });
  wybierzKolor(st, 'boa', 'R');
  st.turn = jumpToStep(st.turn, 'declare_attackers', 'p1');
  st.turn.activePlayerId = st.turn.priorityPlayerId = 'p1';
  enterBlocks65(st, ['boa']);
  const decl = execute(st, { type: 'declare_blockers', playerId: 'p2', assignments: { boa: ['blok'] } });
  assert.ok(decl.ok);
  settle(st);
  assert.ok(find(st, 'rustvine-cultivator', 'battlefield'), 'bloker koloru U przeżywa (filtr koloru)');
  // (b) bez aktywacji (brak znacznika) — czerwony bloker też przeżywa.
  const st2 = combatState65();
  put(st2, 'boa2', 'zombie-boa', 'p1', 'battlefield', { summoningSickness: false });
  put(st2, 'blok2', 'rustvine-cultivator', 'p2', 'battlefield', { summoningSickness: false, colors: ['R'] });
  enterBlocks65(st2, ['boa2']);
  const decl2 = execute(st2, { type: 'declare_blockers', playerId: 'p2', assignments: { boa2: ['blok2'] } });
  assert.ok(decl2.ok);
  settle(st2);
  assert.ok(find(st2, 'rustvine-cultivator', 'battlefield'), 'bez aktywacji trigger nie działa („this turn”)');
});

test('B65/336: Zombie Boa — aktywacja tylko jako sorcery (brak oferty poza główną fazą)', () => {
  const st = game();
  put(st, 'boa', 'zombie-boa', 'p1', 'battlefield', { summoningSickness: false });
  addMana(st, 'p1', 2, { colors: ['B'] });
  assert.ok(commands(st).some((c) => c.type === 'activate_ability' && c.objectId === 'boa'),
    'w głównej fazie aktywacja jest oferowana');
  st.turn = jumpToStep(st.turn, 'declare_attackers', 'p1');
  st.turn.activePlayerId = 'p1';
  st.turn.priorityPlayerId = 'p1';
  assert.ok(!commands(st).some((c) => c.type === 'activate_ability' && c.objectId === 'boa'),
    'poza główną fazą brak oferty (timing: sorcery)');
});

// ---- B65/338: Brine Giant (THB #44, plan Theros) -----------------------------

test('B65/338: Brine Giant — dane Oracle: 5/6 za {6}{U}, Affinity for enchantments', () => {
  const def = sanity('brine-giant', { set: 'THB', plan: 'Theros', artId: 338 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Giant']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.power, 5);
  assert.equal(def.toughness, 6);
  assert.equal(def.manaCost, 7);
  assert.deepEqual(def.costReduction, { amount: 1, condition: { affinityToEnchantments: true } },
    'CR 702.41 wariant: obniżka {1} za KAŻDY enchantment (bliźniak Steelfin Whale)');
  const snap = snapshotOf('brine-giant');
  assert.equal(snap.rulings.length, 3, '3 rulingi WotC 2020-01-24 (kolejność kosztów, tylko generic, brak okna odpowiedzi)');
  assert.match(snap.rulings[1].comment, /only the generic mana/, 'ruling 2: rabat tylko część generyczną');
});

test('B65/338: Brine Giant — affinity: koszt spada o liczbę enchantmentów (także enchantment creatures)', () => {
  const st = game();
  // 2 enchantmenty: zwykły + enchantment creature (typ Enchantment w types).
  put(st, 'e1', 'curse-of-the-pierced-heart', 'p1', 'battlefield');
  put(st, 'e2', 'rustvine-cultivator', 'p1', 'battlefield', { types: ['Creature', 'Enchantment'] });
  put(st, 'giant', 'brine-giant', 'p1', 'hand');
  // Koszt {6}{U} = 7; affinity −2 → 5 many z {U} wystarczy (colored pips zostają).
  addMana(st, 'p1', 5, { colors: ['U'] });
  const cast = commands(st).find((c) => c.type === 'cast_permanent' && c.objectId === 'giant');
  assert.ok(cast, `rzut przy 5 manach z 2 enchantmentami oferowany (koszt 7−2=5)`);
  run(st, cast);
  settle(st);
  assert.ok(find(st, 'brine-giant', 'battlefield'), 'giant wszedł za 5 many');
});

test('B65/338: Brine Giant — bez enchantmentów pełny koszt 7 many (5+{U} nie wystarcza)', () => {
  const st = game();
  put(st, 'giant', 'brine-giant', 'p1', 'hand');
  addMana(st, 'p1', 6, { colors: ['U'] });
  assert.ok(!commands(st).some((c) => c.type === 'cast_permanent' && c.objectId === 'giant'),
    '6 many < 7 — bez affinity brak oferty');
  put(st, 'e1', 'curse-of-the-pierced-heart', 'p1', 'battlefield');
  assert.ok(commands(st).some((c) => c.type === 'cast_permanent' && c.objectId === 'giant'),
    'po jednym enchantmencie koszt 6 → oferta jest (CR 702.41)');
});

// ---- B65/340: Ambulatory Edifice (ONE #79, plan Mirrodin) -------------------

test('B65/340: Ambulatory Edifice — dane Oracle: 3/2 Artifact Creature, ETB you may pay 2 life, reflex -1/-1', () => {
  const def = sanity('ambulatory-edifice', { set: 'ONE', plan: 'Mirrodin', artId: 340 });
  assert.deepEqual(def.types, ['Artifact', 'Creature']);
  assert.deepEqual(def.subtypes, ['Phyrexian', 'Construct']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.abilities.length, 1);
  const ab = def.abilities[0];
  assert.equal(ab.type, 'triggered');
  assert.equal(ab.trigger.event, 'enter_battlefield');
  assert.equal(ab.trigger.payLife, 2, 'you may pay 2 life (optionalPay, Etap F)');
  assert.deepEqual(ab.trigger.requiresTarget, { type: 'creature' }, 'cel refleksu: dowolny stwor');
  assert.deepEqual(ab.effect, { type: 'pump', power: -1, toughness: -1 }, '-1/-1 do konca tury');
  const snap = snapshotOf('ambulatory-edifice');
  assert.equal(snap.rulings.length, 1, 'ruling WotC 2023-02-04');
  assert.ok(/reflexive/.test(snap.rulings[0].comment), 'cel wybierany przy wejsciu refleksu na stos');
  assert.ok(/don't choose a target/.test(snap.rulings[0].comment), 'rodzic bez celu w chwili wyzwolenia');
});

test('B65/340: Ambulatory Edifice — zaplac 2 zycia, cel PO zaplacie: stwor -1/-1 do konca tury', () => {
  const st = game();
  put(st, 'edifice', 'ambulatory-edifice', 'p1', 'hand');
  put(st, 'theirs', 'alaborn-trooper', 'p2', 'battlefield');
  addMana(st, 'p1', 3, { colors: ['B'] });
  run(st, commands(st).find((c) => c.type === 'cast_permanent' && c.objectId === 'edifice'));
  assert.ok(resolveUntilDecision(st, optionalPayOpen), 'Etap F: decyzja you may pay przy rozstrzyganiu');
  const life0 = lifeOf(st, 'p1');
  const t0 = st.objects.get('theirs');
  const pow0 = effectivePower(t0, st);
  const tough0 = effectiveToughness(t0, st);
  const pay = commands(st).find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true);
  assert.ok(pay, 'oferta zaplaty 2 zycia');
  assert.equal(pay.lifeCost, 2);
  assert.equal(pay.reflexiveTargetCount >= 1, true, 'przed zaplata wiadomo ile celow (CR 603.12)');
  run(st, pay);
  assert.equal(lifeOf(st, 'p1'), life0 - 2, 'zaplcone 2 zycia');
  const trg = commands(st).find((c) => c.type === 'resolve_trigger_target');
  assert.ok(trg, 'cel refleksu wybierany PO zaplacie (ruling 2023-02-04)');
  run(st, { ...trg, targetId: 'theirs' });
  settle(st);
  const t = st.objects.get('theirs');
  assert.equal(effectivePower(t, st), pow0 - 1, 'moc -1');
  assert.equal(effectiveToughness(t, st), tough0 - 1, 'wytrzymalosc -1 do konca tury');
});

test('B65/340: Ambulatory Edifice — odmowa zaplaty: zycie nietkniete, bez -1/-1', () => {
  const st = game();
  put(st, 'edifice', 'ambulatory-edifice', 'p1', 'hand');
  put(st, 'theirs', 'alaborn-trooper', 'p2', 'battlefield');
  addMana(st, 'p1', 3, { colors: ['B'] });
  run(st, commands(st).find((c) => c.type === 'cast_permanent' && c.objectId === 'edifice'));
  assert.ok(resolveUntilDecision(st, optionalPayOpen));
  const life0 = lifeOf(st, 'p1');
  const t0 = st.objects.get('theirs');
  const pow0 = effectivePower(t0, st);
  const tough0 = effectiveToughness(t0, st);
  const decline = commands(st).find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === false);
  assert.ok(decline, 'oferta odmowy (you may)');
  run(st, decline);
  settle(st);
  assert.equal(lifeOf(st, 'p1'), life0, 'zycie nietkniete');
  const t = st.objects.get('theirs');
  assert.equal(effectivePower(t, st), pow0, 'bez -1/-1');
  assert.equal(effectiveToughness(t, st), tough0);
});

// ---- B65/341: Pacifism (DTK #29, plan Tarkir) -------------------------------

test('B65/341: Pacifism — dane Oracle: aura za {1}{W}, zaczarowany stwor nie atakuje ani nie blokuje', () => {
  const def = sanity('pacifism', { set: 'DTK', plan: 'Tarkir', artId: 341 });
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.aura.cantAttack, true, 'attachmentRestrictions: cantAttack');
  assert.equal(def.aura.cantBlock, true, 'attachmentRestrictions: cantBlock');
  assert.equal(def.aura.pump, null, 'bez modyfikacji P/T');
  assert.equal(def.abilities.length, 0, 'czysta aura bez zdolnosci wlasnych');
  const snap = snapshotOf('pacifism');
  assert.deepEqual(snap.rulings, [], 'brak rulingow — pusta lista (ADR 0028)');
});

test('B65/341: Pacifism — zaczarowany stwor nie atakuje (brak oferty, deklaracja odrzucona)', () => {
  const st = game();
  put(st, 'mine', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  put(st, 'pac', 'pacifism', 'p1', 'hand');
  addMana(st, 'p1', 2, { colors: ['W'] });
  run(st, commands(st).find((c) => c.type === 'cast_permanent' && c.objectId === 'pac' && (c.targets ?? [])[0] === 'mine'));
  settle(st);
  st.turn = jumpToStep(st.turn, 'declare_attackers', 'p1');
  st.turn.activePlayerId = 'p1';
  st.turn.priorityPlayerId = 'p1';
  st.pendingMulligans = [];
  assert.ok(!commands(st).some((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('mine')),
    'brak oferty ataku zaczarowanym stworem');
  const r = execute(st, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['mine'] });
  assert.equal(r.ok, false, 'deklaracja ataku odrzucona (cantAttack)');
});

test('B65/341: Pacifism — zaczarowany stwor nie blokuje (brak oferty, deklaracja odrzucona)', () => {
  const st = game();
  put(st, 'mine', 'highland-game', 'p1', 'battlefield');
  put(st, 'theirs', 'alaborn-trooper', 'p2', 'battlefield', { summoningSickness: false });
  put(st, 'pac', 'pacifism', 'p1', 'hand');
  addMana(st, 'p1', 2, { colors: ['W'] });
  run(st, commands(st).find((c) => c.type === 'cast_permanent' && c.objectId === 'pac' && (c.targets ?? [])[0] === 'mine'));
  settle(st);
  st.turn = jumpToStep(st.turn, 'declare_attackers', 'p2');
  st.turn.activePlayerId = 'p2';
  st.turn.priorityPlayerId = 'p2';
  st.pendingMulligans = [];
  run(st, commands(st, 'p2').find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('theirs')));
  st.turn = jumpToStep(st.turn, 'declare_blockers', 'p1');
  st.turn.activePlayerId = 'p2';
  st.turn.priorityPlayerId = 'p1';
  const wanted = JSON.stringify({ theirs: ['mine'] });
  assert.ok(!commands(st, 'p1').some((c) => c.type === 'declare_blockers' && JSON.stringify(c.assignments) === wanted),
    'brak oferty bloku zaczarowanym stworem');
  const r = execute(st, { type: 'declare_blockers', playerId: 'p1', assignments: { theirs: ['mine'] } });
  assert.equal(r.ok, false, 'deklaracja bloku odrzucona (cantBlock)');
});

// ---- B65/348: Impulse (DMU #55, plan Dominaria) ------------------------------

test('B65/348: Impulse — dane Oracle: {1}{U} instant, look 4, jedna do reki, reszta na spod', () => {
  const def = sanity('impulse', { set: 'DMU', plan: 'Dominaria', artId: 348 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.effects, [{ type: 'look_top_put_one_hand_rest_bottom', amount: 4 }]);
  const snap = snapshotOf('impulse');
  assert.equal(snap.rulings.length, 2, 'rulingi WotC 2004-10-04');
  assert.ok(snap.rulings.some((r) => /not a draw/.test(r.comment)), 'to nie jest dobieranie');
  assert.ok(snap.rulings.some((r) => /no longer shuffle/.test(r.comment)), 'bez tasowania po erracie');
});

test('B65/348: Impulse — look 4: wybrana do reki, reszta na spod wg bottomOrder, bez card_drawn', () => {
  const st = game();
  put(st, 'imp', 'impulse', 'p1', 'hand');
  addMana(st, 'p1', 2, { colors: ['U'] });
  run(st, commands(st).find((c) => c.type === 'cast_spell' && c.objectId === 'imp'));
  for (let i = 0; i < 12 && !st.pendingLookTopN; i++) run(st, commands(st).find((c) => c.type === 'pass_priority'));
  assert.ok(st.pendingLookTopN, 'decyzja look_top otwarta');
  assert.equal(st.pendingLookTopN.objectIds.length, 4, 'cztery karty odsłonięte');
  const looked = [...st.pendingLookTopN.objectIds];
  const pick = looked[1];
  const rest = [looked[3], looked[2], looked[0]];
  run(st, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: pick, bottomOrder: rest });
  const handIds = st.zones.hand.filter((id) => st.objects.get(id)?.controllerId === 'p1');
  assert.equal(handIds.length, 1, 'w ręce tylko wybrana karta (impulse poszedł do grobu)');
  assert.ok(st.events.some((e) => e.type === 'object_moved' && e.fromId === pick && e.toZone === 'hand'),
    'wybrana karta w ręce (object_moved z looked)');
  const libP1 = st.zones.library.filter((id) => st.objects.get(id)?.controllerId === 'p1');
  assert.deepEqual(libP1.slice(-3), rest, 'reszta na spodzie w kolejności bottomOrder');
  assert.deepEqual(libP1.slice(0, 2), ['lib-p1-4', 'lib-p1-5'], 'brak tasowania — wierzch zachowany');
  assert.ok(!st.events.some((e) => e.type === 'card_drawn'), 'ruling: to nie jest dobieranie');
});

test('B65/348: Impulse — nielegalny wybór i zła kolejność odrzucone', () => {
  const st = game();
  put(st, 'imp', 'impulse', 'p1', 'hand');
  addMana(st, 'p1', 2, { colors: ['U'] });
  run(st, commands(st).find((c) => c.type === 'cast_spell' && c.objectId === 'imp'));
  for (let i = 0; i < 12 && !st.pendingLookTopN; i++) run(st, commands(st).find((c) => c.type === 'pass_priority'));
  assert.ok(st.pendingLookTopN);
  const looked = [...st.pendingLookTopN.objectIds];
  const pick = looked[0];
  const rest = looked.slice(1);
  const poza = st.zones.library.find((id) => st.objects.get(id)?.controllerId === 'p1' && !looked.includes(id));
  const r1 = execute(st, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: poza });
  assert.equal(r1.ok, false, 'karta spoza odsłoniętych odrzucona (illegal_look_top_choice)');
  const r2 = execute(st, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: pick, bottomOrder: [...rest, poza] });
  assert.equal(r2.ok, false, 'bottomOrder z obcą kartą odrzucony');
  const r3 = execute(st, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: pick, bottomOrder: rest });
  assert.ok(r3.ok, 'poprawna decyzja przechodzi');
});
