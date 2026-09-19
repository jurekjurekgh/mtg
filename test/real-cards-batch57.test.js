import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, tapObject } from '../src/engine/permanents.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * Batch 57 (2026-09-19) — karty właściciela: 64, 66, 70, 77, 80, 82, 85,
 * 88, 90, 125.
 *
 * Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-19,
 * ADR 0030). Katalog: `src/cards/card-data.js`; artId/plan:
 * `tools/collection-art-ids.csv`.
 *
 * Podział na sekcje = etapy batcha (B1: 64/70/85/90/125, B2: 82, B3: 80,
 * B4: 66, B5: 77, B6: 88). Każda sekcja ma scenariusz legalny, nielegalny
 * i interakcje z istniejącym katalogiem (ADR 0010).
 *
 * Uwaga o drukach: Phyrexian Rager występuje w kolekcji DWUKROTNIE (75DMU
 * Dominaria i 85APC Mirrodin) — katalog ma dwa wpisy (`phyrexian-rager`
 * i `phyrexian-rager-apc`), każdy z własnym snapshotem `scryfall-<id>.json`.
 */
const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 57, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
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

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);

/** Sanity danych karty: snapshot ↔ katalog ↔ arkusz (jedna reguła dla sekcji). */
function sanity(id, artId, set, plan) {
  test(`B57: ${id} — druk, Oracle, artId, plan, pełne wsparcie`, () => {
    const def = registry.get(id);
    const src = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${id}.json`, import.meta.url)));
    assert.ok(def);
    assert.equal(def.artId, artId); assert.equal(def.set, set); assert.equal(def.plan, plan);
    assert.equal(def.oracleText, src.oracle_text);
    assert.equal(def.imageUri, src.image_uris.large);
    assert.equal(def.manaCost, src.cmc); assert.equal(MANA_COSTS[id], src.mana_cost);
    assert.deepEqual(def.colors, src.colors);
    assert.equal(def.support.status, 'supported'); assert.deepEqual(def.support.limitations, []);
  });
}

// ---------------------------------------------------------------------------
// B1 (M388) — proste bliźniaki: 64 Lightwalker, 90 Tranquil Cove,
// 125 Ordinary Bear, 70 Capture Sphere, 85 Phyrexian Rager (APC).
// ---------------------------------------------------------------------------
sanity('lightwalker', 64, 'DTK', 'Tarkir');
sanity('capture-sphere', 70, 'GRN', 'Arcavios');
sanity('phyrexian-rager-apc', 85, 'APC', 'Mirrodin');
sanity('tranquil-cove', 90, 'M20', 'Kamigawa');
sanity('ordinary-bear', 125, 'HOB', 'Śródziemie');

test('B57/64 Lightwalker: flying tylko z licznikiem +1/+1 (CR 611.3a)', () => {
  const s = game();
  const walker = put(s, 'walker', 'lightwalker', 'p1', 'battlefield');
  assert.ok(!effectiveKeywords(walker, s).includes('flying'), 'bez licznika nie lata (bliźniak Ainok Artillerist)');
  addCounter(s, 'walker', '+1/+1', 1);
  assert.ok(effectiveKeywords(s.objects.get('walker'), s).includes('flying'), 'z licznikiem lata');
  addCounter(s, 'walker', '+1/+1', 1);
  assert.ok(effectiveKeywords(s.objects.get('walker'), s).includes('flying'), 'dwa liczniki — nadal lata');
});

test('B57/64 Lightwalker: zdjęcie licznika odbiera flying (przeliczanie przy odczycie)', () => {
  const s = game();
  put(s, 'walker', 'lightwalker', 'p1', 'battlefield');
  addCounter(s, 'walker', '+1/+1', 1);
  assert.ok(effectiveKeywords(s.objects.get('walker'), s).includes('flying'));
  // Symulacja „licznik zdjęty" (np. przez wither/infect): stan obiektu z zerem.
  s.objects.set('walker', Object.freeze({ ...s.objects.get('walker'), counters: Object.freeze({ ...s.objects.get('walker').counters, '+1/+1': 0 }) }));
  assert.ok(!effectiveKeywords(s.objects.get('walker'), s).includes('flying'), 'brak liczników = brak flying');
});

test('B57/125 Ordinary Bear: vanilla 4/5 bez zdolności i bez tekstu Oracle', () => {
  const def = registry.get('ordinary-bear');
  assert.equal(def.oracleText, '', 'brak tekstu Oracle (karta vanilla)');
  assert.equal(def.abilities.length, 0, 'karta nie ma żadnych zdolności');
  assert.deepEqual(def.keywords, [], 'brak keywordów');
  const s = game();
  const bear = put(s, 'bear', 'ordinary-bear');
  assert.equal(bear.power ?? def.power, 4);
  assert.equal(bear.toughness ?? def.toughness, 5);
});

test('B57/90 Tranquil Cove: wchodzi tapnięty, daje 1 życie i produkuje {W} albo {U}', () => {
  const s2 = game();
  put(s2, 'cove', 'tranquil-cove', 'p1', 'hand');
  const cast = commands(s2).find((c) => (c.objectId === 'cove'));
  assert.ok(cast, 'ląd ma ofertę zagrania z ręki');
  run(s2, cast);
  resolve(s2);
  const land = find(s2, 'tranquil-cove');
  assert.ok(land, 'ląd na polu bitwy');
  assert.equal(land.tapped, true, 'wchodzi TAPNIĘTY');
  assert.equal(player(s2, 'p1').life, 20 + 1, 'ETB: +1 życie');
  // Produkcja many: zdolność {T} — po odkręceniu (albo przez deskryptor).
  const def = registry.get('tranquil-cove');
  assert.equal(def.entersTapped, true);
  const ability = def.abilities.find((a) => a.effect?.type === 'add_mana');
  assert.deepEqual([...ability.effect.colors].sort(), ['U', 'W'], 'produkuje {W} albo {U}, nie {B}');
});

test('B57/70 Capture Sphere: flash + ETB tapnij zaczarowanego + nie odkręca', () => {
  const s = game();
  put(s, 'host', 'ordinary-bear', 'p2', 'battlefield');
  put(s, 'sphere', 'capture-sphere', 'p1', 'hand');
  addMana(s, 'p1', 4, { colors: ['U'] });
  const def = registry.get('capture-sphere');
  assert.deepEqual(def.keywords, ['flash'], 'flash w danych karty (CR 702.8)');
  assert.equal(def.aura.doesntUntap, true, '„doesn\'t untap" w deskryptorze aury');
  assert.equal(def.abilities[0].effect[0].type, 'tap_enchanted_permanent');
  const cast = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'sphere');
  assert.ok(cast, 'oferta rzutu aury z ręki');
  run(s, cast);
  resolve(s);
  const aura = find(s, 'capture-sphere');
  assert.ok(aura, 'aura na polu bitwy');
  assert.equal(s.objects.get('host').tapped, true, 'ETB tapnął zaczarowanego stwora');
});

test('B57/70 Capture Sphere: flash pozwala rzucić w turze przeciwnika', () => {
  const s = game();
  put(s, 'host', 'ordinary-bear', 'p2', 'battlefield');
  put(s, 'sphere', 'capture-sphere', 'p1', 'hand');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 4, { colors: ['U'] });
  const offers = commands(s, 'p1').filter((c) => c.type === 'cast_permanent' && c.objectId === 'sphere');
  assert.ok(offers.length > 0, 'flash daje ofertę rzutu w cudzej turze (CR 702.8)');
  // Kontrola negatywna: bez flash oferty w cudzej turze nie ma (bliźniak
  // Containment Membrane — ten sam koszt, bez flash).
  put(s, 'slow', 'containment-membrane', 'p1', 'hand');
  addMana(s, 'p1', 2, { colors: ['U'] });
  const slowOffers = commands(s, 'p1').filter((c) => c.type === 'cast_permanent' && c.objectId === 'slow');
  assert.equal(slowOffers.length, 0, 'aura BEZ flash nie jest oferowana w cudzej turze');
});

test('B57/85 Phyrexian Rager (APC): ETB dobiera kartę i traci 1 życie', () => {
  const s = game();
  put(s, 'rager', 'phyrexian-rager-apc', 'p1', 'hand');
  const handBefore = player(s, 'p1').hand?.length ?? 0;
  const libBefore = s.zones.library.filter((id) => s.objects.get(id)?.controllerId === 'p1').length;
  addMana(s, 'p1', 3, { colors: ['B'] });
  const cast = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'rager');
  assert.ok(cast, 'oferta rzutu za {B} + 2 generyczne');
  run(s, cast);
  resolve(s);
  assert.equal(player(s, 'p1').life, 20 - 1, 'tracisz 1 życie');
  const libAfter = s.zones.library.filter((id) => s.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(libAfter, libBefore - 1, 'dobrana karta z biblioteki');
});

test('B57/85: drugi druk ma własny wpis i nie koliduje z DMU', () => {
  const apc = registry.get('phyrexian-rager-apc');
  const dmu = registry.get('phyrexian-rager');
  assert.equal(apc.set, 'APC'); assert.equal(apc.artId, 85); assert.equal(apc.plan, 'Mirrodin');
  assert.equal(dmu.set, 'DMU'); assert.equal(dmu.artId, 75); assert.equal(dmu.plan, 'Dominaria',
    'pierwszy druk zostaje na planie Dominaria (zgłoszenie właściciela 15)');
  assert.notEqual(apc.imageUri, dmu.imageUri, 'każdy druk ma własny adres obrazu');
});
