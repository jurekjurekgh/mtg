import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, attachmentRestrictions, untapControlled, tapObject, untapByEffect } from '../src/engine/permanents.js';
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

// ---------------------------------------------------------------------------
// B4 (M365) — 58 Mobile Garrison: pojazd (crew 2) + trigger ataku
//            „untap another target artifact or creature you control"
// ---------------------------------------------------------------------------

sanity('mobile-garrison', 58, 'AER', 'New Capenna');

test('B56/B4: 58 Mobile Garrison — deskryptor: crew 2 + cel „you control" triggera', () => {
  const def = registry.get('mobile-garrison');
  assert.deepEqual(def.types, ['Artifact']);
  assert.deepEqual(def.subtypes, ['Vehicle']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 3);
  const crewAbility = def.abilities.find((a) => a.cost?.crewPower === 2);
  assert.ok(crewAbility, 'crew 2 w deskryptorze');
  assert.deepEqual(crewAbility.effect,
    { type: 'animate_permanent_until_end_of_turn', power: 3, toughness: 4, typesAdd: ['Creature'] });
  const trigger = def.abilities.find((a) => a.trigger?.event === 'attacks');
  assert.deepEqual(trigger.trigger.requiresTarget,
    { type: 'artifact_or_creature', controlledBy: 'controller' });
  assert.deepEqual(trigger.effect, { type: 'untap_permanent' });
});

/** Deklaracja ataku z oknem priorytetu po deklaracji (CR 508.2). */
function attack(s, attackerIds) {
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok);
  execute(s, { type: 'pass_priority', playerId: 'p1' });
  execute(s, { type: 'pass_priority', playerId: 'p2' });
}

/** Załoga 2: oferta crew z domyślnym podzbiorem stworów (moc ≥ 2). */
function crew(s, vehicleId = 'gar') {
  const offer = commands(s).find((c) => c.type === 'activate_ability' && c.objectId === vehicleId
    && state_object(s, vehicleId).abilities?.[c.abilityIndex]?.cost?.crewPower === 2);
  assert.ok(offer, 'crew 2 jest oferowane');
  run(s, offer);
  resolve(s); // zdolność crew rozstrzyga się ze stosu → pojazd staje się stworem
  return offer;
}

test('B56/B4: 58 Mobile Garrison — trigger ataku odkręca inny WŁASNY artefakt lub stwora', () => {
  const s = game();
  put(s, 'gar', 'mobile-garrison', 'p1', 'battlefield');
  put(s, 'pilot', 'alaborn-trooper', 'p1', 'battlefield'); // 2/3 — pełna załoga
  put(s, 'kilof', 'greatsword-of-tyr', 'p1', 'battlefield'); // artefakt własny
  put(s, 'wrog', 'highland-game', 'p2', 'battlefield'); // cudzy stwór — nie kandydat
  crew(s);
  const gar = state_object(s, 'gar');
  assert.equal(gar.kind, 'creature', 'crew 2 robi z pojazdu artefaktowego stwora');
  assert.deepEqual([...gar.types].sort(), ['Artifact', 'Creature']);
  assert.equal(effectivePower(gar, s), 3);
  assert.equal(effectiveToughness(gar, s), 4);
  assert.equal(state_object(s, 'pilot').tapped, true, 'crew tapnęło stwora');
  tapObject(s, 'kilof', 'p1'); // cel triggera: tapnięty własny artefakt
  attack(s, ['gar']);
  const offers = commands(s).filter((c) => c.type === 'resolve_trigger_target');
  assert.deepEqual(offers.map((c) => c.targetId).sort(), ['kilof', 'pilot'],
    'kandydaci: tylko własne artefakty/stwory poza źródłem („another", „you control")');
  run(s, offers.find((c) => c.targetId === 'kilof'));
  resolve(s);
  assert.equal(state_object(s, 'kilof').tapped, false, 'trigger odkręcił wskazany artefakt');
  assert.equal(state_object(s, 'gar').tapped, true, 'sam pojazd („another") został tapnięty atakiem');
  assert.ok(s.events.some((e) => e.type === 'object_untapped' && e.objectId === 'kilof'));
});

test('B56/B4: 58 Mobile Garrison — bez innego własnego artefaktu/stwora trigger nie robi nic', () => {
  const s = game();
  put(s, 'gar', 'mobile-garrison', 'p1', 'battlefield');
  put(s, 'pilot', 'alaborn-trooper', 'p1', 'battlefield');
  put(s, 'wrog', 'highland-game', 'p2', 'battlefield');
  crew(s);
  // Pilot opuszcza pole bitwy przed deklaracją ataku — „another" nie ma na co
  // wskazać: pojazd jest źródłem (wykluczone), a stwór przeciwnika nie
  // spełnia „you control".
  s.objects.delete('pilot');
  s.zones.battlefield = s.zones.battlefield.filter((id) => id !== 'pilot');
  attack(s, ['gar']);
  assert.equal(['p1', 'p2'].some((p) => commands(s, p).some((c) => c.type === 'resolve_trigger_target')), false,
    'brak kandydatów = brak decyzji celu');
  assert.ok(s.events.some((e) => e.type === 'trigger_resolved' && e.objectId === 'gar'
    && e.noEffect === true && e.reason === 'no_targets'), 'zdarzenie o triggerze bez celu');
  assert.equal(state_object(s, 'gar').tapped, true, 'nikt nie odkręcił atakującego pojazdu');
});

test('B56/B4: 58 Mobile Garrison — załoga z za małą łączną mocą jest odrzucana', () => {
  const s = game();
  put(s, 'gar', 'mobile-garrison', 'p1', 'battlefield');
  put(s, 'maly', 'soulmender', 'p1', 'battlefield'); // 1/1 — moc 1 < 2
  const crewIndex = state_object(s, 'gar').abilities.findIndex((a) => a.cost?.crewPower === 2);
  assert.equal(crewIndex, 1, 'trigger (0) + crew (1)');
  const r = execute(s, { type: 'activate_ability', playerId: 'p1', objectId: 'gar', abilityIndex: crewIndex, crewCreatureIds: ['maly'] });
  assert.equal(r.ok, false, 'crew 2 nie przyjmie łącznej mocy 1');
  assert.equal(state_object(s, 'maly').tapped, false, 'odrzucona załoga nie tapuje stwora');
  assert.equal(state_object(s, 'gar').kind, 'artifact', 'pojazd nie stał się stworem');
  // 1/1 + 1/1 = 2 → załoga legalna (jak w istniejących pojazdach).
  put(s, 'maly2', 'soulmender', 'p1', 'battlefield');
  run(s, { type: 'activate_ability', playerId: 'p1', objectId: 'gar', abilityIndex: crewIndex, crewCreatureIds: ['maly', 'maly2'] });
  resolve(s);
  assert.equal(state_object(s, 'gar').kind, 'creature');
  assert.equal(state_object(s, 'maly').tapped, true);
  assert.equal(state_object(s, 'maly2').tapped, true);
});

// ---------------------------------------------------------------------------
// B5 (M366) — 54 Cautious Survivor: Survival (trigger POCZĄTKU drugiej fazy
//            głównej + intervening-if „if this creature is tapped")
// ---------------------------------------------------------------------------

sanity('cautious-survivor', 54, 'DSK', 'Kamigawa');

/** Pełna runda passów do wskazanego kroku tury. Triggery „na początku kroku"
 *  odpalają się WYŁĄCZNIE przy wejściu w krok — jumpToStep tego nie emituje. */
function walkTo(s, step) {
  for (let i = 0; i < 60 && s.turn.step !== step; i++) {
    const available = commands(s);
    const next = available.find((c) => c.type === 'declare_attackers')
      ?? available.find((c) => c.type === 'declare_blockers')
      ?? available.find((c) => c.type === 'resolve_combat')
      ?? available.find((c) => c.type === 'pass_priority');
    assert.ok(next, `krok ${s.turn.step}: jest komenda do wykonania`);
    run(s, next);
  }
  assert.equal(s.turn.step, step, `dotarto do kroku ${step}`);
}

const triggered = (s, id) => s.events.some((e) => e.type === 'ability_triggered' && e.objectId === id);

test('B56/B5: 54 Cautious Survivor — deskryptor: trigger drugiej fazy głównej + warunek tapnięcia', () => {
  const def = registry.get('cautious-survivor');
  const ability = def.abilities.find((a) => a.trigger?.event === 'beginning_of_second_main');
  assert.ok(ability, 'zdarzenie beginning_of_second_main');
  assert.deepEqual(ability.trigger.condition, { sourceTapped: true });
  assert.deepEqual(ability.effect, [{ type: 'gain_life', amount: 2 }]);
  assert.deepEqual(def.subtypes, ['Elf', 'Survivor']);
});

test('B56/B5: 54 Cautious Survivor — tapnięty na starcie drugiej fazy daje 2 życia', () => {
  const s = game();
  put(s, 'surv', 'cautious-survivor', 'p1', 'battlefield');
  tapObject(s, 'surv', 'p1');
  walkTo(s, 'main2');
  assert.ok(s.events.some((e) => e.type === 'ability_triggered' && e.objectId === 'surv'
    && e.trigger === 'beginning_of_second_main'), 'trigger Survival poszedł na stos');
  resolve(s);
  assert.equal(player(s, 'p1').life, 22, '„you gain 2 life"');
});

test('B56/B5: 54 Cautious Survivor — nietapnięty nie odpala; tapnięcie w main2 nic nie da', () => {
  const s = game();
  put(s, 'surv', 'cautious-survivor', 'p1', 'battlefield');
  walkTo(s, 'main2');
  assert.equal(triggered(s, 'surv'), false,
    'nietapnięty na starcie fazy = brak triggera (ruling 2024-09-20)');
  tapObject(s, 'surv', 'p1'); // już PO starcie drugiej fazy głównej
  resolve(s);
  assert.equal(player(s, 'p1').life, 20, 'tapnięcie w fazie nie łapie triggera');
});

test('B56/B5: 54 Cautious Survivor — odkręcony przed rozstrzygnięciem = brak efektu', () => {
  const s = game();
  put(s, 'surv', 'cautious-survivor', 'p1', 'battlefield');
  tapObject(s, 'surv', 'p1');
  walkTo(s, 'main2');
  assert.ok(triggered(s, 'surv'), 'trigger zaszedł (tapnięty na starcie fazy)');
  untapByEffect(s, 'surv', 'p1'); // CR 603.4: warunek sprawdzany PONOWNIE
  resolve(s);
  assert.equal(player(s, 'p1').life, 20, '„untapped when the ability begins to resolve" → nic');
  assert.ok(s.events.some((e) => e.type === 'trigger_resolved' && e.sourceId === 'surv' && e.noEffect === true),
    'log mówi wprost, że trigger nic nie zrobił');
});

test('B56/B5: 54 Cautious Survivor — zejście z pola bitwy: rozstrzyga stan ostatni (LKI)', () => {
  const s = game();
  put(s, 'surv', 'cautious-survivor', 'p1', 'battlefield');
  tapObject(s, 'surv', 'p1');
  walkTo(s, 'main2');
  // Ruling: „use its tapped or untapped status as it last existed on the
  // battlefield" — stwór znika w oknie odpowiedzi, ale był tapnięty.
  s.objects.delete('surv');
  s.zones.battlefield = s.zones.battlefield.filter((id) => id !== 'surv');
  resolve(s);
  assert.equal(player(s, 'p1').life, 22, 'LKI: ostatni stan na polu bitwy = tapnięty');
});

test('B56/B5: 54 Cautious Survivor — w cudzej turze nie odpala', () => {
  const s = game();
  put(s, 'surv', 'cautious-survivor', 'p1', 'battlefield');
  tapObject(s, 'surv', 'p1');
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  walkTo(s, 'main2');
  assert.equal(triggered(s, 'surv'), false, '„YOUR second main phase" — tylko kontroler');
  resolve(s);
  assert.equal(player(s, 'p1').life, 20);
});

// ---------------------------------------------------------------------------
// B6 (M367) — 63 Dragon Fodder (dwa tokeny 1/1 R Goblin), 60 Thornwood Falls
//            (bliźniak Dismal Backwater) i 28 Kraken's Eye (bliźniak
//            Angel's Feather — domknięcie zaległości planu)
// ---------------------------------------------------------------------------

sanity('dragon-fodder', 63, 'ORI', 'Kamigawa');
sanity('thornwood-falls', 60, 'M20', 'Eldraine');
sanity('krakens-eye', 28, 'M11', 'Ixalan');

test('B56/B6: 63 Dragon Fodder — dwa OSOBNE tokeny 1/1 czerwone Gobliny', () => {
  const s = game();
  put(s, 'fodder', 'dragon-fodder', 'p1', 'hand');
  addMana(s, 'p1', 2, { colors: ['R', 'R'] });
  let cast = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'fodder');
  assert.ok(cast, 'oferta rzucenia sorcery za {1}{R}');
  run(s, cast);
  resolve(s);
  const goblins = [...s.objects.values()]
    .filter((o) => o.cardId === 'token_goblin' && o.zone === 'battlefield');
  assert.equal(goblins.length, 2, 'DOKŁADNIE dwa tokeny (nie jeden 2/2)');
  for (const goblin of goblins) {
    assert.equal(goblin.kind, 'creature');
    assert.equal(effectivePower(goblin, s), 1);
    assert.equal(effectiveToughness(goblin, s), 1);
    assert.deepEqual(goblin.colors, ['R']);
    assert.deepEqual(goblin.subtypes, ['Goblin']);
  }
  // Grafika i typ wpisu katalogowego (kafel czyta imageUri z rejestru, M202/K).
  const def = registry.get('token_goblin');
  assert.match(def.imageUri, /^https:\/\/cards\.scryfall\.io\//, 'grafika ze Scryfalla');
  assert.deepEqual(def.types, ['Creature', 'Token']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.support.status, 'token', 'token — nie taliowalny');
});

test('B56/B6: 63 Dragon Fodder — bez manny brak oferty (scenariusz nielegalny)', () => {
  const s = game();
  put(s, 'fodder', 'dragon-fodder', 'p1', 'hand');
  assert.equal(commands(s).some((c) => c.type === 'cast_spell' && c.objectId === 'fodder'), false,
    'brak dwóch many = brak oferty');
  const r = execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'fodder', targets: [] });
  assert.equal(r.ok, false);
  assert.equal(state_object(s, 'fodder').zone, 'hand', 'odrzucony rzut nie rusza karty');
});

/** Karta katalogu o DOKŁADNIE takim koszcie — permanent bez celu (wzorzec M193). */
function cardWithCost(cost) {
  const card = registry.all().find((c) => MANA_COSTS[c.id] === cost
    && (c.types ?? []).some((t) => ['Creature', 'Artifact', 'Enchantment'].includes(t))
    && !(c.abilities ?? []).some((a) => a?.type === 'triggered' && a?.trigger?.requiresTarget)
    && !c.spell?.targets?.length
    && !c.additionalCost);
  assert.ok(card, `katalog ma permanent bez celu o koszcie ${cost}`);
  return card;
}

const hasCastOffer = (s, id, playerId = 'p1') => commands(s, playerId)
  .some((c) => (c.type === 'cast_spell' || c.type === 'cast_permanent') && c.objectId === id);

test('B56/B6: 60 Thornwood Falls — wchodzi tapnięty, ETB +1 życia, płaci {G} i {U}', () => {
  const s = game();
  put(s, 'falls', 'thornwood-falls', 'p1', 'hand'); // w ręce → play_land
  const life0 = player(s, 'p1').life;
  const play = commands(s).find((c) => c.type === 'play_land' && c.objectId === 'falls');
  assert.ok(play, 'oferta zagrania landa');
  run(s, play);
  resolve(s);
  // play_land przenosi kartę na pole bitwy z NOWYM id (moveObjectDirectly) —
  // szukamy po cardId, jak w testach M193/B44.
  const land = find(s, 'thornwood-falls');
  assert.ok(land, 'land na polu bitwy');
  assert.equal(land.zone, 'battlefield');
  assert.equal(land.tapped, true, 'wchodzi tapnięty');
  assert.equal(player(s, 'p1').life, life0 + 1, 'ETB: +1 życia');

  // {T}: Add {G} or {U} — pip {G} i pip {U} opłacalne (generyk z drugiego landa).
  for (const [cost, pip] of [['{1}{G}', 'G'], ['{1}{U}', 'U']]) {
    const s2 = game();
    put(s2, 'falls', 'thornwood-falls', 'p1', 'battlefield');
    put(s2, 'mtn', 'basic-mountain', 'p1', 'battlefield');
    const spell = cardWithCost(cost);
    put(s2, 'spell', spell.id, 'p1', 'hand');
    assert.ok(hasCastOffer(s2, 'spell'), `Thornwood Falls płaci pip {${pip}} (koszt ${cost})`);
  }
  // Kontrola negatywna: Oracle daje wyłącznie {G} albo {U}.
  const s3 = game();
  put(s3, 'falls', 'thornwood-falls', 'p1', 'battlefield');
  put(s3, 'mtn', 'basic-mountain', 'p1', 'battlefield');
  const black = cardWithCost('{1}{B}');
  put(s3, 'spell', black.id, 'p1', 'hand');
  assert.equal(hasCastOffer(s3, 'spell'), false, 'pip {B} nie ma z czego zapłacić');
});

test("B56/B6: 28 Kraken's Eye — niebieski czar PRZECIWNIKA: „you may gain 1 life”", () => {
  const s = game();
  put(s, 'eye', 'krakens-eye', 'p1', 'battlefield');
  put(s, 'blue', 'maritime-guard', 'p2', 'hand'); // 1/2 za {1}{U}, bez zdolności
  addMana(s, 'p2', 2, { colors: ['U', 'U'] });
  // Tura przeciwnika (stwór = czar sorcery-timing, tylko w swojej fazie main);
  // ruling: trigger Oka łapie czar DOWOLNEGO gracza.
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  const before = player(s, 'p1').life;
  const castBlue = commands(s, 'p2').find((c) => c.type === 'cast_permanent' && c.objectId === 'blue');
  assert.ok(castBlue, 'oferta rzucenia niebieskiego stwora');
  run(s, castBlue);
  const choice = commands(s, 'p1').find((c) => c.type === 'resolve_optional_trigger_choice');
  assert.ok(choice, '„you may” — decyzja kontrolera Oka (ruling: dowolny gracz)');
  run(s, { ...choice, fire: true });
  assert.ok(s.zones.stack.length >= 1, 'trigger rozstrzyga się, gdy czar jest jeszcze na stosie');
  resolve(s);
  assert.equal(player(s, 'p1').life, before + 1, '„you may gain 1 life”');
  // Permanent wchodzi z NOWYM id (moveObjectDirectly) — szukamy po cardId.
  assert.equal(find(s, 'maritime-guard')?.zone, 'battlefield', 'czar przeciwnika rozstrzygnął się normalnie');
});

test("B56/B6: 28 Kraken's Eye — czar czerwony nie odpala (kolor z deskryptora)", () => {
  const s = game();
  put(s, 'eye', 'krakens-eye', 'p1', 'battlefield');
  put(s, 'red', 'dragon-fodder', 'p2', 'hand');
  addMana(s, 'p2', 2, { colors: ['R', 'R'] });
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2'; // sorcery — tura p2
  const before = player(s, 'p1').life;
  run(s, { type: 'cast_spell', playerId: 'p2', objectId: 'red', targets: [] });
  assert.equal(commands(s, 'p1').some((c) => c.type === 'resolve_optional_trigger_choice'), false,
    'czerwony czar nie jest niebieski');
  resolve(s);
  assert.equal(player(s, 'p1').life, before, 'brak triggera = brak życia');
});
