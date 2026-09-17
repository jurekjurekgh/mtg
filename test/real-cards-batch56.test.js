import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, attachmentRestrictions, untapControlled } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { addEnergyCounters } from '../src/engine/players.js';

/**
 * Batch 56 (2026-09-17) — karty właściciela: 25, 27, 28, 30, 32, 34, 54, 58,
 * 60, 63.
 *
 * Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-17,
 * ADR 0030). Katalog: `src/cards/card-data.js`; artId/plan:
 * `tools/collection-art-ids.csv`.
 *
 * Podział na sekcje = etapy batcha (B1: 32 energia, B2: 27/34, B3: 25/30,
 * B4: 58, B5: 54, B6: 63/60). Każda sekcja ma scenariusz legalny, nielegalny
 * i interakcje z istniejącym katalogiem (ADR 0010).
 */
const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 56, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 3; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

/** Obiekt gry po id (nazwa `object` kolidowałaby z globalnym konstruktorem). */
const state_object = (s, id) => s.objects.get(id);
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);

/** Sanity danych karty: snapshot ↔ katalog ↔ arkusz (jedna reguła dla sekcji). */
function sanity(id, artId, set, plan) {
  test(`B56: ${id} — druk, Oracle, artId, plan, pełne wsparcie`, () => {
    const def = registry.get(id);
    const src = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${id}.json`, import.meta.url)));
    assert.ok(def);
    assert.equal(def.artId, artId); assert.equal(def.set, set); assert.equal(def.plan, plan);
    assert.equal(def.oracleText, src.oracle_text);
    assert.equal(def.imageUri, src.image_uris.large);
    assert.equal(def.manaCost, src.cmc); assert.equal(MANA_COSTS[id], src.mana_cost);
    assert.deepEqual(def.colors, src.colors);
    assert.equal(def.support.status, 'supported'); assert.deepEqual(def.support.limitations, []);
    assert.ok(Array.isArray(src.rulings));
    assert.equal(src.rulingsPobrano, '2026-09-17');
  });
}

// ---------------------------------------------------------------------------
// B1 (M362) — 32 Shipwreck Moray: energia ({E}, CR 122.1)
// ---------------------------------------------------------------------------

sanity('shipwreck-moray', 32, 'AER', 'Ixalan');

test('B56/B1: 32 Shipwreck Moray — wejście daje DOKŁADNIE 4 liczniki energii', () => {
  const s = game();
  put(s, 'moray', 'shipwreck-moray');
  addMana(s, 'p1', 4, { colors: ['U'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'moray'));
  resolve(s);
  assert.equal(find(s, 'shipwreck-moray')?.zone, 'battlefield');
  assert.equal(player(s, 'p1').energy, 4, '„you get {E}{E}{E}{E}" = cztery liczniki (ruling 2024-06-07)');
  assert.equal(player(s, 'p2').energy ?? 0, 0, 'tylko kontroler dostaje energię');
  assert.ok(s.events.some((e) => e.type === 'energy_counters_added' && e.after === 4));
});

test('B56/B1: 32 Shipwreck Moray — „Pay {E}: +2/-2" płaci licznik i trwa do końca tury', () => {
  const s = game();
  put(s, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  addEnergyCounters(s, 'p1', 2);
  const offer = commands(s).find((c) => c.type === 'activate_ability' && c.objectId === 'moray');
  assert.ok(offer, 'oferta aktywacji przy dostępnej energii');
  run(s, offer);
  resolve(s);
  const moray = find(s, 'shipwreck-moray');
  assert.equal(player(s, 'p1').energy, 1, 'koszt {E} zdjął dokładnie jeden licznik');
  assert.equal(effectivePower(moray, s), 2, '+2 do końca tury');
  assert.equal(effectiveToughness(moray, s), 3, '-2 do końca tury');
  assert.ok(s.events.some((e) => e.type === 'energy_counters_paid' && e.amount === 1));
});

test('B56/B1: 32 Shipwreck Moray — bez energii brak oferty i odrzucona komenda, stan nietknięty', () => {
  const s = game();
  put(s, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  assert.equal(player(s, 'p1').energy ?? 0, 0);
  assert.equal(commands(s).some((c) => c.type === 'activate_ability' && c.objectId === 'moray'), false,
    '„You can\'t pay more energy counters than you have" (ruling) — oferta milczy');
  const r = execute(s, { type: 'activate_ability', playerId: 'p1', objectId: 'moray', abilityIndex: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.events.some((e) => typeof e.reason === 'string'), 'maszynowy powód odrzucenia');
  assert.equal(effectivePower(find(s, 'shipwreck-moray'), s), 0, 'odrzucona aktywacja nie zmienia stanu');
});

test('B56/B1: energia jest licznikiem GRACZA — nie znika z końcem tury i wchodzi do odcisku stanu', () => {
  const s = game();
  put(s, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  addEnergyCounters(s, 'p1', 3);
  // Ruling AER 2024-06-07: „Energy counters aren't mana. They don't go away as
  // steps, phases, and turns end…"
  for (let i = 0; i < 60 && s.turn.number < 2; i += 1) {
    const holder = s.turn.priorityPlayerId;
    const view = playerView(s, holder);
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('declare_'))
      ?? view.legalCommands[0];
    if (!cmd || !execute(s, cmd).ok) break;
  }
  assert.ok(s.turn.number >= 2, 'tura przeszła do końca');
  assert.equal(player(s, 'p1').energy, 3, 'energia przeżywa koniec tury');

  // Odcisk stanu (klasa L16): dwa identyczne stany różniące się WYŁĄCZNIE
  // energią nie mogą mieć tego samego odcisku — inaczej replay i sonda no-op
  // są ślepe na zapłatę {E}.
  const a = game(); const b = game();
  put(a, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  put(b, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  addEnergyCounters(a, 'p1', 1);
  addEnergyCounters(b, 'p1', 2);
  assert.notEqual(stateFingerprint(a), stateFingerprint(b), 'energia jest częścią stanu gry');
});

test('B56/B1: 32 Shipwreck Moray — bot nie pali energii bez sensu, ale zna jej wartość', () => {
  const bot = createHeuristicBot({ seed: 11 });
  const s = game();
  put(s, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  addEnergyCounters(s, 'p1', 1);
  const full = playerView(s, 'p1');
  const activation = full.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'moray');
  assert.ok(activation, 'aktywacja jest w ofercie');
  bot.chooseCommand({ ...full, legalCommands: [activation] });
  const entry = bot.trace().at(-1);
  assert.ok(typeof entry.score === 'number', 'aktywacja ma wycenę (nie „bez wyceny")');
  // Kontrola: ten sam stan bez energii nie ma oferty — bot nie zgłasza ruchu,
  // którego nie da się opłacić (L48: oferta = płatność).
  const bez = game();
  put(bez, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
  assert.equal(playerView(bez, 'p1').legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'moray'), false);
});

// ---------------------------------------------------------------------------
// B2 (M363) — 27 Erase (exile enchantment) i 34 Volcanic Submersion
//             (cel „artifact or land" + cycling {2})
// ---------------------------------------------------------------------------

sanity('erase', 27, 'KTK', 'Tarkir');
sanity('volcanic-submersion', 34, 'ALA', 'Kaldheim');

test('B56/B2: 27 Erase — wygnanie aury; karta NIE dotyka grobu (ruling 2004-10-04)', () => {
  const s = game();
  put(s, 'erase', 'erase');
  // Cel: aura z KATALOGU (supported) — karta bez mechaniki (`in-development`)
  // nie ma deskryptora `aura`, więc nie jest jeszcze aurą dla silnika.
  put(s, 'aura', 'containment-membrane', 'p2', 'battlefield');
  put(s, 'host', 'typhoid-rats', 'p2', 'battlefield');
  // Załączona aura na polu bitwy ma kind 'aura' (inwariant: attachedTo tylko
  // dla aury/equipmentu) — tak samo ustawia to castAuraSpell.
  s.objects.set('aura', Object.freeze({ ...s.objects.get('aura'), kind: 'aura', attachedTo: 'host' }));
  addMana(s, 'p1', 1, { colors: ['W'] });
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'erase' && c.targets?.[0] === 'aura'));
  resolve(s);
  const wygnana = [...s.objects.values()].find((o) => o.cardId === 'containment-membrane' && o.zone === 'exile');
  assert.ok(wygnana, 'aura jest w exile');
  assert.equal([...s.objects.values()].some((o) => o.cardId === 'containment-membrane' && o.zone === 'graveyard'), false,
    'ruling: „The card does not go to the graveyard first" — brak tranzytu przez grób');
  assert.equal(find(s, 'typhoid-rats')?.zone, 'battlefield', 'gospodarz aury zostaje na polu bitwy');
});

test('B56/B2: 27 Erase — cel nie-enchantment nie jest oferowany ani akceptowany', () => {
  const s = game();
  put(s, 'erase', 'erase');
  put(s, 'tgt', 'typhoid-rats', 'p2', 'battlefield');
  addMana(s, 'p1', 1, { colors: ['W'] });
  assert.equal(commands(s).some((c) => c.type === 'cast_spell' && c.objectId === 'erase'), false,
    'stwór nie jest legalnym celem (oferta milczy)');
  const r = execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'erase', targets: ['tgt'] });
  assert.equal(r.ok, false);
  assert.ok(r.events.some((e) => typeof e.reason === 'string'));
  assert.equal(s.objects.get('erase').zone, 'hand', 'odrzucony czar zostaje w ręce');
});

test('B56/B2: 34 Volcanic Submersion — niszczy artefakt ALBO land, ale nie stwora', () => {
  for (const [cel, cardId] of [['art', 'bomat-bazaar-barge'], ['land', 'basic-mountain']]) {
    const s = game();
    put(s, 'sub', 'volcanic-submersion');
    put(s, cel, cardId, 'p2', 'battlefield');
    addMana(s, 'p1', 5, { colors: ['R'] });
    const offer = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'sub' && c.targets?.[0] === cel);
    assert.ok(offer, `${cardId} jest legalnym celem (artifact or land)`);
    run(s, offer);
    resolve(s);
    assert.equal([...s.objects.values()].some((o) => o.cardId === cardId && o.zone === 'graveyard'), true,
      `${cardId} trafia do grobu`);
  }
  const s2 = game();
  put(s2, 'sub', 'volcanic-submersion');
  put(s2, 'stwór', 'typhoid-rats', 'p2', 'battlefield');
  addMana(s2, 'p1', 5, { colors: ['R'] });
  assert.equal(commands(s2).some((c) => c.type === 'cast_spell' && c.objectId === 'sub'), false,
    'stwór nie jest celem „artifact or land"');
  const r = execute(s2, { type: 'cast_spell', playerId: 'p1', objectId: 'sub', targets: ['stwór'] });
  assert.equal(r.ok, false);
  assert.equal(s2.objects.get('sub').zone, 'hand');
});

test('B56/B2: 34 Volcanic Submersion — cycling {2} z ręki: odrzucenie i dobranie; bez many brak oferty', () => {
  const s = game();
  put(s, 'sub', 'volcanic-submersion');
  put(s, 'góra', 'basic-mountain', 'p1', 'library');
  put(s, 'dół', 'basic-island', 'p1', 'library');
  // Szczyt biblioteki = POCZĄTEK tablicy (konwencja `setLibraryTop` z batcha 55).
  s.zones.library = ['góra', 'dół', ...s.zones.library.filter((id) => !['góra', 'dół'].includes(id))];
  addMana(s, 'p1', 2, { colors: ['R', 'R'] });
  const cycling = commands(s).find((c) => c.type === 'activate_ability' && c.objectId === 'sub');
  assert.ok(cycling, 'cycling {2} jest w ofercie z ręki');
  run(s, cycling);
  resolve(s);
  assert.equal([...s.objects.values()].some((o) => o.cardId === 'volcanic-submersion' && o.zone === 'graveyard'), true,
    'karta po cyclingu trafia do grobu');
  assert.equal([...s.objects.values()].some((o) => o.cardId === 'basic-mountain' && o.zone === 'hand'), true,
    'cycling dobiera kartę (CR 702.29a)');

  const bezMany = game();
  put(bezMany, 'sub', 'volcanic-submersion');
  assert.equal(commands(bezMany).some((c) => c.type === 'activate_ability' && c.objectId === 'sub'), false,
    'brak dwóch many = brak oferty cyclingu');
  const r = execute(bezMany, { type: 'activate_ability', playerId: 'p1', objectId: 'sub', abilityIndex: 0 });
  assert.equal(r.ok, false);
  assert.equal(bezMany.objects.get('sub').zone, 'hand', 'odrzucony cycling nie odrzuca karty');
});

// ---------------------------------------------------------------------------
// B3 (M364) — 25 Bonds of Faith (warunkowy pump po podtypie + „otherwise"
//             blokada) i 30 Containment Protocol (ETB tap + brak odkręcania)
// ---------------------------------------------------------------------------

sanity('bonds-of-faith', 25, 'ISD', 'Innistrad');
sanity('containment-protocol', 30, 'TMC', 'Teenage Mutant Ninja Turtles');

/** Rzut aury na wskazanego stwora (cast_permanent/cast_spell) i rozstrzygnięcie. */
function castAura(s, auraId, hostId) {
  const cmd = commands(s).find((c) => (c.type === 'cast_permanent' || c.type === 'cast_spell')
    && c.objectId === auraId && c.targets?.[0] === hostId);
  assert.ok(cmd, `rzut aury ${auraId} na ${hostId}`);
  run(s, cmd);
  resolve(s);
}

test('B56/B3: 25 Bonds of Faith — Human dostaje +2/+2, nie-Human nie atakuje i nie blokuje', () => {
  const s = game();
  put(s, 'aura', 'bonds-of-faith');
  put(s, 'human', 'alaborn-trooper', 'p1', 'battlefield'); // Human 2/3
  put(s, 'zwierz', 'highland-game', 'p1', 'battlefield'); // Elk 2/1 (nie-Human)
  addMana(s, 'p1', 2, { colors: ['W', 'W'] });
  castAura(s, 'aura', 'human');
  const human = state_object(s, 'human');
  assert.equal(effectivePower(human, s), 4, 'Human: +2 mocy');
  assert.equal(effectiveToughness(human, s), 5, 'Human: +2 wytrzymałości');
  const rHuman = attachmentRestrictions(s, human);
  assert.equal(rHuman.cantAttack, false, 'Human może atakować');
  assert.equal(rHuman.cantBlock, false, 'Human może blokować');

  // Druga aura na nie-Humana: bez pompa, ale z blokadą ataku i bloku.
  const s2 = game();
  put(s2, 'aura', 'bonds-of-faith');
  put(s2, 'zwierz', 'highland-game', 'p1', 'battlefield');
  addMana(s2, 'p1', 2, { colors: ['W', 'W'] });
  castAura(s2, 'aura', 'zwierz');
  const zwierz = state_object(s2, 'zwierz');
  assert.equal(effectivePower(zwierz, s2), 2, 'nie-Human BEZ pompa');
  assert.equal(effectiveToughness(zwierz, s2), 1, 'nie-Human BEZ pompa');
  const rZwierz = attachmentRestrictions(s2, zwierz);
  assert.equal(rZwierz.cantAttack, true, '„Otherwise, it can\'t attack"');
  assert.equal(rZwierz.cantBlock, true, '„Otherwise, it can\'t block"');
});

test('B56/B3: 25 Bonds of Faith — warunek czytany NA BIEŻĄCO (ruling 2011-09-22)', () => {
  const s = game();
  put(s, 'aura', 'bonds-of-faith');
  put(s, 'host', 'alaborn-trooper', 'p1', 'battlefield'); // start: Human
  addMana(s, 'p1', 2, { colors: ['W', 'W'] });
  castAura(s, 'aura', 'host');
  assert.equal(effectivePower(state_object(s, 'host'), s), 4, 'Human → pump działa');
  // Ruling: „causing it to stop being a Human … will lose the +2/+2 bonus".
  const host = state_object(s, 'host');
  s.objects.set('host', Object.freeze({ ...host, subtypes: ['Soldier'] }));
  const po = state_object(s, 'host');
  assert.equal(effectivePower(po, s), 2, 'po utracie podtypu pump znika (odczyt bieżący)');
  assert.equal(attachmentRestrictions(s, po).cantAttack, true, 'i pojawia się blokada ataku');
});

test('B56/B3: 30 Containment Protocol — ETB tapnij, potem brak odkręcania w untapie', () => {
  const s = game();
  put(s, 'aura', 'containment-protocol');
  put(s, 'host', 'highland-game', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['U', 'U', 'U'] });
  castAura(s, 'aura', 'host');
  const host = state_object(s, 'host');
  assert.equal(host.tapped, true, '„When this Aura enters, tap enchanted creature"');
  assert.equal(attachmentRestrictions(s, host).cantAttack, false, 'sama blokada odkręcania nie zakazuje ataku');
  // Kolejny untap step kontrolera gospodarza nie odkręca go (CR 502.3).
  untapControlled(s, 'p2');
  assert.equal(state_object(s, 'host').tapped, true, '„doesn\'t untap during its controller\'s untap step"');
});

test('B56/B3: 30 Containment Protocol — aura odłączona oddaje odkręcanie (odczyt bieżący)', () => {
  const s = game();
  put(s, 'aura', 'containment-protocol');
  put(s, 'host', 'highland-game', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['U', 'U', 'U'] });
  castAura(s, 'aura', 'host');
  const aura = [...s.objects.values()].find((o) => o.cardId === 'containment-protocol' && o.zone === 'battlefield');
  s.objects.delete(aura.id);
  s.zones.battlefield = s.zones.battlefield.filter((id) => id !== aura.id);
  untapControlled(s, 'p2');
  assert.equal(state_object(s, 'host').tapped, false, 'bez aury stwór odkręca się normalnie');
});
