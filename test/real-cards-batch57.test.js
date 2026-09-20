import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, tapObject } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addCounter } from '../src/engine/counters.js';
import { isImpulseWindowLive } from '../src/engine/impulse-window.js';
import { landSplit, coloredPips } from '../tools/generate-plan-decks.mjs';

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
/**
 * Oddaje priorytet, aż `gotowe()` zwróci true (albo minie limit). Potrzebne
 * przy decyzjach tworzonych PRZEZ trigger: `resolve()` z góry pliku rozstrzyga
 * pierwszą komendę `resolve_*`, więc zamiatałoby też samą decyzję.
 */
function passUntil(s, gotowe, limit = 8) {
  for (let i = 0; i < limit && !gotowe(); i += 1) {
    const pass = commands(s).find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'jest komenda pass_priority');
    run(s, pass);
  }
  assert.ok(gotowe(), `warunek osiągnięty w ${limit} passach`);
}

/** Rozstrzyga CAŁY stos bez dotykania decyzji `resolve_hand_free_cast`. */
function resolveIgnoringHandFreeCast(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i += 1) {
    const choices = commands(s);
    const pick = choices.find((c) => c.type.startsWith('resolve_') && c.type !== 'resolve_hand_free_cast')
      ?? choices.find((c) => c.type === 'pass_priority');
    assert.ok(pick, 'jest czym rozstrzygnąć stos');
    run(s, pick);
  }
}

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
    // Snapshot zapisuje kolory w porządku ALFABETYCZNYM, katalog — w kolejności
    // wydrukowanego kosztu (precedens spoza batcha: Zoraline katalog `W,B`
    // vs snapshot `B,W`). Zgodność ZBIORU kolorów to reguła, kolejność — nie.
    assert.deepEqual([...def.colors].sort(), [...src.colors].sort());
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

// ---------------------------------------------------------------------------
// B2 (M389) — 82 Messenger Falcons: pip hybrydowy {G/U} w rozkładzie landów
// (narzędzie) + koszt płacony jednym z pary + ETB dobranie karty.
// ---------------------------------------------------------------------------
sanity('messenger-falcons', 82, 'ARB', 'Alara');

test('B57/82 coloredPips: hybryda {G/U} liczona do PIERWSZEGO koloru pary w WUBRG (M389)', () => {
  const falcons = coloredPips(registry.get('messenger-falcons'));
  assert.deepEqual(falcons, { W: 1, U: 1, B: 0, R: 0, G: 0 },
    '{2}{G/U}{W} → {W} + hybryda do U (U przed G w WUBRG); G NIE znika z pary, ale nie wymaga osobnego źródła');
  // Usterka naprawiana w M389: stary regex `\{([WUBRG])\}` gubił CAŁY symbol
  // hybrydowy, więc `{W/B}{U}` dawało wyłącznie {U} i talia nie miała wymogu
  // źródła W/B dla Esper Stormblade (decks/alara.txt).
  assert.deepEqual(coloredPips(registry.get('esper-stormblade')), { W: 1, U: 1, B: 0, R: 0, G: 0 },
    '{W/B}{U} → hybryda do W (W przed B w WUBRG) + {U}');
  // Świadomy zakres: `{W/P}` (Phyrexian) i `{2/W}` (dwubrid) płatne bez koloru
  // (2 życia / 2 generyczne), więc NIE wymagają źródła — nie liczą się jak pip.
  assert.deepEqual(coloredPips(registry.get('porcelain-legionnaire')), { W: 0, U: 0, B: 0, R: 0, G: 0 },
    '{2}{W/P} nie zawyża proporcji W (alternatywa: 2 życia)');
});

test('B57/82 landSplit: talia z samą hybrydą dostaje źródło wybranego koloru pary', () => {
  // Przed M389: pip `{W/B}` był niewidoczny → landSplit([stormblade]) dawał
  // tylko wyspę ({U}), bez żadnego źródła W/B. Po naprawie: {W} i {U}.
  const lands = landSplit([registry.get('esper-stormblade')]);
  assert.deepEqual(lands, { W: 1, U: 1 },
    'hybryda wnosi wymóg min. 1 źródła z pary (deterministycznie W), obok {U}');
  const falconsDeck = landSplit([registry.get('messenger-falcons')]);
  assert.ok(falconsDeck.U >= 1 && falconsDeck.W >= 1, JSON.stringify(falconsDeck));
});

test('B57/82 Messenger Falcons: koszt {2}{G/U}{W} płacony {G} albo {U}; flying + ETB dobranie', () => {
  for (const hybridColor of ['G', 'U']) {
    const s = game();
    put(s, 'falcons', 'messenger-falcons');
    const libBefore = s.zones.library.length;
    addMana(s, 'p1', 4, { colors: [hybridColor, 'W'] });
    const cast = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'falcons');
    assert.ok(cast, `hybrydę {G/U} pokrywa pula {${hybridColor}}+{W}`);
    run(s, cast);
    resolve(s);
    const bf = find(s, 'messenger-falcons');
    assert.ok(bf, 'ptak na polu bitwy');
    assert.ok(effectiveKeywords(bf, s).includes('flying'), 'flying z danych karty');
    assert.equal(s.zones.library.length, libBefore - 1, 'ETB: dobrana karta z biblioteki');
    assert.equal(s.zones.hand.length, 1, 'dobrana karta trafia do ręki');
  }
});

test('B57/82 Messenger Falcons: ani G, ani U → brak oferty (hybryda nie jest „dowolna mana")', () => {
  const s = game();
  put(s, 'falcons', 'messenger-falcons');
  addMana(s, 'p1', 4, { colors: ['B'] });
  assert.equal(commands(s).filter((c) => c.objectId === 'falcons').length, 0, 'cztery czarne many nie pokrywają {G/U}');
  const s2 = game();
  put(s2, 'falcons', 'messenger-falcons');
  addMana(s2, 'p1', 4, { colors: ['G'] });
  assert.equal(commands(s2).filter((c) => c.objectId === 'falcons').length, 0, 'sama hybryda nie pokrywa {W}');
});

test('B57/82 Messenger Falcons: dobranie z pustej biblioteki kończy grę, nie wywraca stanu', () => {
  // Biblioteka pusta od startu (scenariusz graniczny z planu B2).
  const s = createGameState({ seed: 82, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  const def = registry.get('messenger-falcons');
  addObject(s, {
    id: 'falcons', instanceId: 'i-falcons', cardId: 'messenger-falcons',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  addMana(s, 'p1', 4, { colors: ['G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'falcons'));
  resolve(s);
  assert.equal(find(s, 'messenger-falcons')?.zone, 'battlefield', 'stwór wszedł na pole bitwy');
  assert.equal(s.zones.library.length, 0, 'biblioteka nadal pusta');
  assert.equal(s.status, 'finished', 'próba dobrania z pustej biblioteki = przegrana (CR 104.3c), bez wyjątku');
});

// ---------------------------------------------------------------------------
// B3 (M390) — 80 Merciless Repurposing: exile + inkubacja 3 (bliźniak
// Tillera of Flesh). Ruling MOM 2023-04-14: nielegalny cel przy rozstrzyganiu
// → czar nie robi NIC (CR 608.2b), inkubacja NIE biegnie.
// ---------------------------------------------------------------------------
sanity('merciless-repurposing', 80, 'MOM', 'Mirrodin');

const incubatorsOf = (s, controllerId) => [...s.objects.values()]
  .filter((o) => o.zone === 'battlefield' && o.cardId === 'token_incubator' && o.controllerId === controllerId);

test('B57/80 Merciless Repurposing: wygania cel i inkubuje 3 (token z trzema licznikami)', () => {
  const s = game();
  put(s, 'bear', 'ordinary-bear', 'p2', 'battlefield');
  put(s, 'repro', 'merciless-repurposing');
  addMana(s, 'p1', 6, { colors: ['B'] });
  const cast = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'repro' && c.targets?.includes('bear'));
  assert.ok(cast, 'oferta rzutu z celem-stworem');
  run(s, cast);
  resolve(s);
  assert.ok(find(s, 'ordinary-bear', 'exile'), 'cel wygnany (nie w grobie; po przenosinach obiekt ma nowe id)');
  const tokens = incubatorsOf(s, 'p1');
  assert.equal(tokens.length, 1, 'jeden Incubator (CR 701.47)');
  assert.equal((tokens[0].counters ?? {})['+1/+1'], 3, 'inkubuj 3 → trzy liczniki +1/+1');
  assert.ok(find(s, 'merciless-repurposing', 'graveyard'), 'czar rozstrzygnięty idzie do grobu');
  // {2}: transformacja tokenu w 0/0 Phyrexian — liczniki ZOSTAJĄ na tylnej
  // stronie (stąd 3/3), a zdolność należy do TOKENU, nie do czaru.
  addMana(s, 'p1', 2);
  const act = commands(s).find((c) => c.type === 'activate_ability' && c.objectId === tokens[0].id);
  assert.ok(act, 'oferta {2}: transformuj Incubator');
  run(s, act);
  resolve(s);
  const phyrexian = [...s.objects.values()].find((o) => o.cardId === 'token_phyrexian' && o.zone === 'battlefield');
  assert.ok(phyrexian, 'token transformował się w 0/0 Phyrexian (CR 701.51)');
  assert.equal((phyrexian.counters ?? {})['+1/+1'], 3, 'trzy liczniki zostają → 3/3');
});

test('B57/80: nielegalny cel przy rozstrzyganiu → czar nic nie robi, brak inkubacji (CR 608.2b)', () => {
  // Nośnik martwego celu jak w audycie PR #105: Servant of the Scale w fabryce
  // testu jest 0/0, więc SBA na granicy komendy rzutu zabija go ZANIM czar
  // zdąży się rozstrzygnąć.
  const s = game();
  put(s, 'victim', 'servant-of-the-scale', 'p2', 'battlefield');
  put(s, 'repro', 'merciless-repurposing');
  addMana(s, 'p1', 6, { colors: ['B'] });
  const cast = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'repro' && c.targets?.includes('victim'));
  assert.ok(cast, 'rzut wybrany w 0/0 cel');
  run(s, cast);
  assert.ok(find(s, 'servant-of-the-scale', 'graveyard'), 'cel padł od SBA przy rzucie');
  resolve(s);
  const resolved = s.events.find((e) => e.type === 'spell_resolved' && e.cardId === 'merciless-repurposing');
  assert.equal(resolved?.fizzled, true, 'jedyny cel nielegalny = fizzl (ruling MOM 2023-04-14)');
  assert.equal(incubatorsOf(s, 'p1').length, 0, 'ruling: NIE inkubuj, gdy cel nielegalny');
  assert.equal(s.zones.stack.length, 0, 'czar zszedł ze stosu');
});

// ---------------------------------------------------------------------------
// B4 (M391) — Delve: 66 Hooting Mandrills ({5}{G}, Ape 4/4 trample).
// CR 702.66: podczas rzucania można wygnać DOWOLNĄ liczbę kart z własnego
// grobu; każda pokrywa `{1}` części GENERICZNEJ. Rulingi KTK (2021-03-19):
// delve to NIE koszt alternatywny — koszt i mana value czaru są bez zmian,
// nie wolno wygnać więcej kart niż część generyczna, a wygnanie jest kosztem
// (CR 601.2h), więc karty zostają w exile także po skontrowaniu czaru.
// ---------------------------------------------------------------------------
sanity('hooting-mandrills', 66, 'KTK', 'Tarkir');

/** Karty własnego grobu — kandydaci kosztu delve. */
function delveFodder(s, count, playerId = 'p1') {
  const ids = [];
  for (let i = 0; i < count; i++) {
    put(s, `fodder-${i}`, 'basic-swamp', playerId, 'graveyard');
    ids.push(`fodder-${i}`);
  }
  return ids;
}

const delveOffer = (s) => commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'mandrills');
const delveResolve = (exileIds) => ({ type: 'resolve_delve_exile', playerId: 'p1', exileIds });

test('B57/66: rzut bez delve płaci pełne {5}{G} i nie rusza grobu', () => {
  const s = game();
  delveFodder(s, 2);
  put(s, 'mandrills', 'hooting-mandrills');
  addMana(s, 'p1', 6, { colors: ['G'] });
  run(s, delveOffer(s));
  assert.ok(s.pendingDelveExile, 'deklaracja rzutu otwiera decyzję kosztu („you may")');
  run(s, delveResolve([])); // 0 kart = pełny koszt wydrukowany
  resolve(s);
  const ape = find(s, 'hooting-mandrills');
  assert.ok(ape, 'Hooting Mandrills na polu bitwy');
  assert.equal(effectiveKeywords(ape, s).includes('trample'), true, 'Trample działa');
  assert.equal(s.zones.exile.length, 0, 'bez delve nic nie idzie do exile');
  assert.equal(player(s, 'p1').mana, 0, 'zapłacone pełne 6 many');
  assert.equal(ape.manaCost, 6, 'mana value bez zmian (ruling KTK 2021-03-19)');
});

test('B57/66: delve 1/2/5 — koszt maleje, karty w exile, mana value bez zmian', () => {
  for (const k of [1, 2, 5]) {
    const s = game();
    const fodder = delveFodder(s, k);
    put(s, 'mandrills', 'hooting-mandrills');
    addMana(s, 'p1', 6 - k, { colors: ['G'] });
    const offer = delveOffer(s);
    assert.ok(offer, `oferta rzutu istnieje, gdy mana starcza tylko na wariant z delve (k=${k})`);
    run(s, offer);
    const pending = playerView(s, 'p1').pendingDelveExile;
    assert.equal(pending.maxExile, k, `limit wygnania = min(część generyczna {5}, karty w grobie = ${k})`);
    run(s, delveResolve(fodder));
    resolve(s);
    const ape = find(s, 'hooting-mandrills');
    assert.ok(ape, `stwór wchodzi (delve ${k})`);
    assert.equal(s.zones.exile.length, k, 'wygnane karty kosztu leżą w exile');
    assert.equal(fodder.filter((id) => s.objects.get(id)?.zone === 'graveyard').length, 0, 'koszt zniknął z grobu');
    assert.equal(player(s, 'p1').mana, 0, `zapłacone ${6 - k} many (6 − ${k} wygnanych)`);
    assert.equal(ape.manaCost, 6, 'mana value nadal 6 — obniżka dotyczy tylko ZAPŁACONEJ many');
  }
});

test('B57/66: wielkość kosztu jest ograniczona (część generyczna, własny grób, opłacalność)', () => {
  const s = game();
  const fodder = delveFodder(s, 7); // więcej niż część generyczna
  put(s, 'foe', 'basic-swamp', 'p2', 'graveyard');
  put(s, 'mandrills', 'hooting-mandrills');
  addMana(s, 'p1', 1, { colors: ['G'] }); // wariant opłacalny tylko z 5 wygnanymi
  run(s, delveOffer(s));
  const pending = playerView(s, 'p1').pendingDelveExile;
  assert.equal(pending.maxExile, 5, 'limit = część generyczna {5} (ruling: nigdy więcej)');
  assert.equal(pending.candidateIds.length, 7, 'kandydaci to WYŁĄCZNIE własny grób');
  assert.deepEqual(pending.affordableCounts, [5], 'przy 1 manie opłacalne jest tylko k=5 (L48)');
  assert.equal(execute(s, delveResolve(fodder.slice(0, 6))).ok, false, '6 kart > część generyczna → nielegalne');
  assert.equal(execute(s, delveResolve([...fodder.slice(0, 4), 'foe'])).ok, false, 'cudza karta z grobu → nielegalne (CR 702.66a)');
  assert.equal(execute(s, delveResolve([fodder[0], fodder[0]])).ok, false, 'duplikat obiektu → nielegalne');
  assert.equal(execute(s, delveResolve(fodder.slice(0, 4))).ok, false, 'k=4 nieopłacalne przy 1 manie → nielegalne (oferta = protokół)');
  assert.ok(s.pendingDelveExile, 'po odrzuceniach decyzja nadal czeka (gracz może wybrać legalnie)');
  assert.ok(execute(s, delveResolve(fodder.slice(0, 5))).ok, 'k=5 przyjęte');
  resolve(s);
  assert.ok(find(s, 'hooting-mandrills'), 'rzut domknięty legalnym kosztem');
  assert.equal(s.objects.get('foe')?.zone, 'graveyard', 'cudzy grób nietknięty (karta przeciwnika nie jest kandydatem)');
});

test('B57/66: delve dokłada się do obniżki kosztu (nie jest kosztem alternatywnym)', () => {
  const s = game();
  // Syntetyczny reduktor (wzorzec test/cost-reduction-alt-costs.test.js):
  // „czary stworów kosztują {1} mniej" — reguła po deskryptorze, nie po nazwie.
  addObject(s, {
    id: 'reducer', instanceId: 'i-reducer', cardId: 'x-reducer', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact', manaCost: 2, keywords: [], subtypes: [],
    types: ['Artifact'], colors: [], cardName: 'Reduktor',
    abilities: [Object.freeze({
      type: 'static', costModifier: Object.freeze({ spellTypes: ['Creature'], amount: 1 }),
      cost: null, effect: null, trigger: null,
    })],
  });
  const fodder = delveFodder(s, 2);
  put(s, 'mandrills', 'hooting-mandrills');
  addMana(s, 'p1', 3, { colors: ['G'] }); // 6 − 1 (obniżka) − 2 (delve) = 3
  run(s, delveOffer(s));
  run(s, delveResolve(fodder));
  resolve(s);
  assert.ok(find(s, 'hooting-mandrills'), 'rzut z obniżką i delve domknięty');
  assert.equal(player(s, 'p1').mana, 0, 'zapłacono dokładnie 3 many');
  assert.equal(s.zones.exile.length, 2, 'delve działa OBOK obniżki (koszt niealternatywny)');
});

test('B57/66: ścieżka CZARU (instant) z delve — ta sama obniżka części generycznej', () => {
  const s = game();
  const fodder = delveFodder(s, 3);
  // Żadna karta katalogu nie jest czarem z delve — reguła jest generyczna
  // (ADR 0002), a bez wpisu w MANA_COSTS limit bierze się z manaCost (CR 202.3).
  addObject(s, {
    id: 'bolt', instanceId: 'i-bolt', cardId: 'x-delve-bolt', controllerId: 'p1', zone: 'hand',
    kind: 'spell', manaCost: 5, keywords: [], subtypes: [], types: ['Instant'], colors: ['R'],
    cardName: 'Delve Bolt', delve: true,
    spell: Object.freeze({ timing: 'instant', targets: [], effects: Object.freeze([{ type: 'draw_cards', amount: 1 }]) }),
  });
  addMana(s, 'p1', 2);
  const cast = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'bolt');
  assert.ok(cast, 'oferta rzutu czaru z delve przy manie na koszt PO obniżce (L48)');
  run(s, cast);
  assert.ok(s.pendingDelveExile, 'ścieżka czaru też otwiera decyzję kosztu');
  run(s, delveResolve(fodder));
  resolve(s);
  assert.equal(s.zones.exile.length, 3, 'karty kosztu w exile');
  assert.equal(player(s, 'p1').mana, 0, 'zapłacone 2 many (5 − 3 wygnane)');
  assert.ok(find(s, 'x-delve-bolt', 'graveyard'), 'czar rozstrzygnięty → grób');
});

test('B57/66: prawdziwa talia — obiekt gry niesie deskryptor delve (L21/M379)', () => {
  // Helpery `...gameObjectDataOf` nie wystarczą: deskryptor musi przejść przez
  // jawną listę pól `deck.js`, inaczej mechanika jest martwa w prawdziwych
  // partiach przy zielonych testach (klasa L21/M379 — offspring).
  const state = setupCardMatch({
    seed: 66,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([
      ['p1', [...Array.from({ length: 10 }, () => 'hooting-mandrills'), ...Array.from({ length: 14 }, () => 'basic-forest')]],
      ['p2', [...Array.from({ length: 10 }, () => 'hooting-mandrills'), ...Array.from({ length: 14 }, () => 'basic-forest')]],
    ]),
    registry,
  });
  state.pendingMulligans = [];
  const inLibrary = [...state.objects.values()].find((o) => o.cardId === 'hooting-mandrills' && o.controllerId === 'p1');
  assert.ok(inLibrary, 'Hooting Mandrills w partii');
  assert.equal(inLibrary.delve, true, 'obiekt gry z prawdziwej talii niesie `delve` (inaczej oferta nie istnieje)');
  // Ta sama ścieżka co w grze: karta z biblioteki do ręki, mana i rzut z delve.
  const handId = moveObjectDirectly(state, inLibrary.id, 'hand', `hand-b57-${inLibrary.id}`).id;
  for (let i = 0; i < 3; i++) put(state, `grave-real-${i}`, 'hooting-mandrills', 'p1', 'graveyard');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  addMana(state, 'p1', 3, { colors: ['G'] });
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === handId);
  assert.ok(offer, 'oferta rzutu z delve w prawdziwej partii');
  assert.ok(execute(state, offer).ok, 'deklaracja przyjęta');
  assert.ok(execute(state, { type: 'resolve_delve_exile', playerId: 'p1', exileIds: ['grave-real-0', 'grave-real-1', 'grave-real-2'] }).ok, 'koszt Delve domknięty');
  for (let i = 0; i < 40 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass && execute(state, pass).ok, 'stos rozstrzygnięty');
  }
  assert.ok(find(state, 'hooting-mandrills', 'battlefield'), 'stwór z prawdziwej talii na polu bitwy');
  assert.equal(player(state, 'p1').mana, 0, 'zapłacone 3 many (6 − 3 wygnane karty)');
});

// ---------------------------------------------------------------------------
// B5 (M392) — 77 Annie Flash, the Veteran: powrót permanentu MV≤3 z grobu
// (tapnięty, land też — ruling OTJ 2024-04-12), trigger tapnięcia → wygnanie
// DWÓCH wierzchnich kart grywalnych do końca TURY, Flash.
// ---------------------------------------------------------------------------
sanity('annie-flash-the-veteran', 77, 'OTJ', 'Thunder Junction');

test('B57/77: ETB po rzuceniu wraca permanent MV≤3 z grobu TAPNIĘTY', () => {
  const s = game();
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-lightwalker', 'lightwalker', 'p1', 'graveyard');
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  const offer = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie');
  run(s, offer);
  resolve(s);
  assert.ok(find(s, 'annie-flash-the-veteran', 'battlefield'), 'Annie na polu bitwy');
  const wrocil = find(s, 'lightwalker', 'battlefield');
  assert.ok(wrocil, 'Lightwalker wrócił z grobu');
  assert.equal(wrocil.tapped, true, 'wraca TAPNIĘTY (ruling OTJ)');
  assert.equal(find(s, 'lightwalker', 'graveyard'), undefined, 'grób opuszczony');
});

test('B57/77: wejście BEZ rzutu nie odpala ETB (ruling: reanimacja/token)', () => {
  const s = game();
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-lightwalker', 'lightwalker', 'p1', 'graveyard');
  // Ruling OTJ 2024-04-12: „It doesn't trigger if you put Annie Flash onto the
  // battlefield without casting it." — wejście wprost z ręki (bez stosu).
  moveObjectDirectly(s, 'annie', 'battlefield', 'annie-bf');
  run(s, commands(s).find((c) => c.type === 'pass_priority'));
  assert.equal(
    commands(s).some((c) => c.type === 'resolve_trigger_target'),
    false,
    'brak decyzji celu — trigger „if you cast it" nie odpalił',
  );
  assert.ok(find(s, 'lightwalker', 'graveyard'), 'karta została w grobie');
});

test('B57/77: land (MV 0) jest „permanent card" — wraca tapnięty', () => {
  const s = game();
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-forest', 'basic-forest', 'p1', 'graveyard');
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  resolve(s);
  const land = find(s, 'basic-forest', 'battlefield');
  assert.ok(land, 'land wrócił z grobu (ruling: permanent card obejmuje land)');
  assert.equal(land.tapped, true, 'wraca tapnięty');
});

test('B57/77: MV 4 nie jest legalnym celem — brak triggera i grób bez zmian', () => {
  const s = game();
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-falcons', 'messenger-falcons', 'p1', 'graveyard'); // MV 4
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  resolve(s);
  assert.ok(find(s, 'annie-flash-the-veteran', 'battlefield'));
  assert.equal(commands(s).some((c) => c.type === 'resolve_trigger_target'), false, 'brak celu → brak triggera');
  assert.ok(find(s, 'messenger-falcons', 'graveyard'), 'MV 4 zostaje w grobie');
});

test('B57/77: aura bez gospodarza zostaje w grobie (ruling OTJ 2024-04-12)', () => {
  const s = game();
  put(s, 'annie', 'annie-flash-the-veteran');
  // Chronic Flooding = „Enchant land", a na polu bitwy stoi tylko Annie
  // (stwór) — aura nie ma żadnego legalnego gospodarza, więc NIE wchodzi
  // (CR 303.4f: wybór zaczarowanego obiektu następuje przed wejściem).
  put(s, 'gy-flood', 'chronic-flooding', 'p1', 'graveyard'); // aura MV 2
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  resolve(s);
  assert.ok(find(s, 'annie-flash-the-veteran', 'battlefield'));
  assert.equal(find(s, 'chronic-flooding', 'battlefield'), undefined, 'aura bez gospodarza nie wchodzi');
  assert.ok(
    [...s.objects.values()].some((o) => o.cardId === 'chronic-flooding' && o.zone === 'graveyard'),
    'zostaje w grobie',
  );
  assert.ok(s.events.some((e) => e.type === 'aura_returned_without_host'), 'zdarzenie mówi, co się stało');
});

test('B57/77: aura z legalnym gospodarzem wchodzi ZAŁĄCZONA (wybór przed wejściem, nie cel)', () => {
  const s = game();
  put(s, 'annie', 'annie-flash-the-veteran');
  put(s, 'gy-membrane', 'containment-membrane', 'p1', 'graveyard'); // „Enchant creature", MV 3
  addMana(s, 'p1', 6, { colors: ['R', 'G', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'annie'));
  resolve(s);
  const annieBf = find(s, 'annie-flash-the-veteran', 'battlefield');
  const aura = find(s, 'containment-membrane', 'battlefield');
  assert.ok(aura, 'aura wróciła na pole bitwy');
  assert.equal(aura.attachedTo, annieBf.id, 'załączona do Annie (jedynego legalnego gospodarza)');
});

test('B57/77: tapnięcie wygania DOKŁADNIE dwie wierzchnie karty i pozwala zagrać je w tej turze', () => {
  const s = game();
  put(s, 'annie-bf', 'annie-flash-the-veteran', 'p1', 'battlefield');
  const wygnanePrzed = [...s.objects.values()].filter((o) => o.zone === 'exile').length;
  // Tapnięcie przez ATAK (tapObject to helper testowy — nie przechodzi przez
  // komendę, więc nie odpalałby triggera); atak = zwykłe tapnięcie, CR 508.1f.
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.turn.passes = 0;
  run(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['annie-bf'] });
  resolve(s);
  const wygnane = [...s.objects.values()].filter((o) => o.zone === 'exile');
  assert.equal(wygnane.length - wygnanePrzed, 2, 'DOKŁADNIE dwie karty wygnane');
  for (const o of wygnane) {
    assert.equal(o.playableUntilTurn, s.turn.number, 'okno kończy się w TEJ turze (nie następnej)');
    assert.equal(isImpulseWindowLive(o, s), true, 'okno żywe');
  }
  // Normalne zasady zagrania (ruling OTJ): land z okna w kroku atakujących
  // NIE jest oferowany…
  const landZTalie = wygnane.find((o) => o.kind === 'land');
  assert.ok(landZTalie, 'wśród wygnanych jest land (harness)');
  assert.equal(
    commands(s).some((c) => c.type === 'play_land' && c.objectId === landZTalie.id),
    false,
    'poza main land z exile nie jest oferowany',
  );
  // …a w main można go położyć prosto z exile (CR 305.1, M361).
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  assert.ok(
    commands(s).find((c) => c.type === 'play_land' && c.objectId === landZTalie.id),
    'land z okna impulsu jest grywalny w main',
  );
  // W następnej turze uprawnienie wygasa samo (stempel = numer tury).
  s.turn.number += 1;
  for (const o of wygnane) assert.equal(isImpulseWindowLive(o, s), false, 'okno wygasło');
});

// ---------------------------------------------------------------------------
// B6a (M393a) — 88 Baral and Kari Zev: licznik „pierwszy instant/sorcery w
// turze" + darmowy rzut czaru z ręki o MNIEJSZEJ MV i wspólnym typie
// (ruling TDC 2023-04-14). Karta zostaje `in-development` do B6b (ścieżka
// „If you don't" → token First Mate Ragavan).
// ---------------------------------------------------------------------------
test('B57/88: trigger odpala się tylko przy PIERWSZYM instant/sorcery w turze', () => {
  const s = game();
  put(s, 'baral', 'baral-and-kari-zev', 'p1', 'battlefield');
  put(s, 'i1', 'brute-force', 'p1', 'hand');   // instant MV1
  put(s, 'i2', 'brute-force', 'p1', 'hand');
  put(s, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['R', 'G'] });
  assert.ok(commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i1'), 'oferta rzutu pierwszego instanta');
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i1'));
  passUntil(s, () => s.pendingHandFreeCast != null);
  assert.ok(s.events.some((e) => e.type === 'hand_free_cast_required'), 'pierwszy instant odpala trigger');
  assert.equal(s.pendingHandFreeCast.playerId, 'p1', 'decyzja należy do kontrolera Barala');
  run(s, commands(s).find((c) => c.type === 'resolve_hand_free_cast' && c.decline));
  resolveIgnoringHandFreeCast(s);
  // Drugi instant w tej samej turze NIE odpala triggera (ruling: „first … each turn").
  const przed = s.events.filter((e) => e.type === 'hand_free_cast_required').length;
  assert.ok(commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i2'), 'drugi instant rzucalny');
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i2'));
  resolveIgnoringHandFreeCast(s);
  assert.equal(
    s.events.filter((e) => e.type === 'hand_free_cast_required').length, przed,
    'drugi instant/sorcery w turze nie odpala triggera',
  );
});

test('B57/88: czar zagrany przed wejściem Barala liczy się do licznika (ruling)', () => {
  const s = game();
  put(s, 'i1', 'brute-force', 'p1', 'hand');
  put(s, 'i2', 'brute-force', 'p1', 'hand');
  put(s, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['R', 'G', 'G'] });
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i1'));
  resolveIgnoringHandFreeCast(s);
  // Baral wchodzi PO pierwszym instancie (tu: wprost na pole bitwy).
  put(s, 'baral', 'baral-and-kari-zev', 'p1', 'battlefield');
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'i2'));
  resolveIgnoringHandFreeCast(s);
  // Ruling TDC: „It counts spells cast earlier in the turn even if Baral and
  // Kari Zev wasn't on the battlefield then" — to był DRUGI czar, więc trigger
  // nie odpala.
  assert.equal(commands(s).some((c) => c.type === 'resolve_hand_free_cast'), false, 'brak decyzji (drugi czar w turze)');
});

test('B57/88: oferta zawiera TYLKO czary o mniejszej MV i wspólnym typie', () => {
  const s = game();
  put(s, 'baral', 'baral-and-kari-zev', 'p1', 'battlefield');
  put(s, 'trig', 'raise-the-alarm', 'p1', 'hand');     // instant MV2
  put(s, 'mniejsze', 'brute-force', 'p1', 'hand');      // instant MV1 — w ofercie
  put(s, 'rowne-mv', 'negate', 'p1', 'hand');           // instant MV2 — „lesser" wyklucza
  put(s, 'inny-typ', 'tome-scour', 'p1', 'hand');       // sorcery MV1 — inny typ
  put(s, 'wieksze', 'merciless-repurposing', 'p1', 'hand'); // instant MV6
  put(s, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['R', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'trig'));
  passUntil(s, () => s.pendingHandFreeCast != null);
  const oferty = commands(s).filter((c) => c.type === 'resolve_hand_free_cast' && !c.decline);
  assert.ok(oferty.length > 0, 'są oferty darmowego rzutu');
  assert.deepEqual(
    [...new Set(oferty.map((c) => c.cardId))].sort(), ['brute-force'],
    'tylko instant o mniejszej MV (nie: równa MV, inny typ, większa MV)',
  );
  // Darmowy rzut nie pobiera many i kładzie czar na stos NAD triggerem.
  const celBaral = oferty.find((c) => (c.targets ?? [])[0] === 'baral');
  assert.ok(celBaral, 'wariant z celem własnego stwora istnieje (oferta = walidacja)');
  const manaPrzed = player(s, 'p1').mana;
  run(s, celBaral);
  assert.equal(player(s, 'p1').mana, manaPrzed, 'koszt many = 0 (CR 118.9a)');
  assert.equal(find(s, 'brute-force', 'battlefield'), undefined, 'czar poszedł na stos, nie na pole');
  assert.ok(s.zones.stack.length >= 1, 'czar na stosie (nad triggerem)');
  assert.ok(
    [...s.objects.values()].some((o) => o.cardId === 'brute-force' && o.zone === 'stack'),
    'obiekt stosu to rzucony czar',
  );
});

test('B57/88: komenda spoza oferty jest odrzucana (oferta = walidacja, L48)', () => {
  const s = game();
  put(s, 'baral', 'baral-and-kari-zev', 'p1', 'battlefield');
  put(s, 'trig', 'raise-the-alarm', 'p1', 'hand');
  put(s, 'mniejsze', 'brute-force', 'p1', 'hand');
  put(s, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['R', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'trig'));
  passUntil(s, () => s.pendingHandFreeCast != null);
  // Równa MV (negate) nie jest oferowana — celowo nie ma jej w ręce; próbujemy
  // rzucić kartę SPOZA zakresu (sorcery) przez tę samą komendę.
  put(s, 'inny-typ', 'tome-scour', 'p1', 'hand');
  const zly = execute(s, {
    type: 'resolve_hand_free_cast', playerId: 'p1', objectId: 'inny-typ', cardId: 'tome-scour', targets: [],
  });
  assert.equal(zly.ok, false, 'rzut karty spoza oferty odrzucony');
  assert.match(String(zly.events?.[0]?.reason ?? zly.events?.[0]), /illegal_hand_free_cast/);
  // Nie nasza decyzja też jest odrzucana.
  const nieNasza = execute(s, { type: 'resolve_hand_free_cast', playerId: 'p2', decline: true });
  assert.equal(nieNasza.ok, false, 'decyzja innego gracza odrzucona');
});

test('B57/88: rezygnacja domyka decyzję i przywraca priorytet', () => {
  const s = game();
  put(s, 'baral', 'baral-and-kari-zev', 'p1', 'battlefield');
  put(s, 'trig', 'raise-the-alarm', 'p1', 'hand');
  put(s, 'mniejsze', 'brute-force', 'p1', 'hand');
  put(s, 'foe', 'lightwalker', 'p2', 'battlefield');
  addMana(s, 'p1', 2, { colors: ['R', 'W'] });
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'trig'));
  passUntil(s, () => s.pendingHandFreeCast != null);
  assert.equal(commands(s).filter((c) => c.type === 'cast_spell').length, 0, 'w trakcie decyzji brak zwykłych ofert rzutu');
  assert.equal(commands(s).find((c) => c.type === 'pass_priority'), undefined, 'pass też jest zablokowany');
  run(s, commands(s).find((c) => c.type === 'resolve_hand_free_cast' && c.decline));
  assert.equal(s.pendingHandFreeCast, null, 'decyzja domknięta');
  assert.ok(commands(s).find((c) => c.type === 'pass_priority'), 'pass wrócił po decyzji');
  assert.ok(
    [...s.objects.values()].some((o) => o.cardId === 'brute-force' && o.zone === 'hand'),
    'karta została w ręce',
  );
});
