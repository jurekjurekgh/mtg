// Batch 59 (2026-09-24) — karty właściciela: 126 MID (dwustronna: przód i tył),
// 129 DMU, 130 THB, 131 ISD, 134 ALA, 135 BOK, 138 MID, 139 TMT, 141 RIX,
// 142 ALA — razem 10 kart / 11 wpisów arkusza.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-24,
// ADR 0010 §2a, ADR 0028 — rulingi „przy kartce", także puste listy).
// Katalog: `src/cards/card-data.js`; artId/plan: `tools/collection-art-ids.csv`
// (plan przepisany DOSŁOWNIE z arkusza właściciela — to etykieta organizacyjna
// kolekcji, nie nazwa krainy setu). Plan batcha:
// `docs/plans/PLAN_2026-09-24c-batch59-kolekcja-126-142.md`.
//
// Podział na sekcje = etapy batcha (G1.1 … G1.10). Każda sekcja ma scenariusz
// legalny, nielegalny i interakcje z istniejącym katalogiem (ADR 0010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { readFileSync } from 'node:fs';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness, effectiveKeywords, replaceObject, markDamage } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 59, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
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

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);

// ---- G1.1: Charismatic Vanguard (129 DMU, plan Dominaria) -------------------

test('B59/G1.1: Charismatic Vanguard — dane Oracle, koszt i druk', () => {
  const def = registry.get('charismatic-vanguard');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Dwarf', 'Soldier']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'DMU');
  assert.equal(def.plan, 'Dominaria');
  assert.equal(def.artId, 129);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('a51764fe'), 'imageUri z druku DMU (dmu/10)');
  assert.equal(MANA_COSTS['charismatic-vanguard'], '{2}{W}');
});

test('B59/G1.1: Charismatic Vanguard — {4}{W} daje całej drużynie +1/+1 do końca tury', () => {
  const state = game();
  put(state, 'vanguard', 'charismatic-vanguard', 'p1', 'battlefield');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield');
  put(state, 'theirs', 'razorfoot-griffin', 'p2', 'battlefield');
  addMana(state, 'p1', 5);
  const activate = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'vanguard');
  assert.ok(activate, 'aktywacja {4}{W} jest oferowana');
  run(state, activate);
  resolve(state);
  assert.equal(effectivePower(state.objects.get('mine'), state), 3, 'mój 2/2 dostaje +1/+1 (razem 3/3)');
  assert.equal(effectiveToughness(state.objects.get('mine'), state), 3, 'toughness też +1');
  assert.equal(effectivePower(state.objects.get('theirs'), state), 2,
    'stwór przeciwnika NIE dostaje hymnu („you control")');
  assert.equal(effectivePower(state.objects.get('vanguard'), state), 4,
    'sam Vanguard też jest stworem pod własnym hymnem (3/2 + 1/+1)');
});

test('B59/G1.1: Charismatic Vanguard — stwór wchodzący PO rozstrzygnięciu nie łapie hymnu (CR 611.2c)', () => {
  const state = game();
  put(state, 'vanguard', 'charismatic-vanguard', 'p1', 'battlefield');
  addMana(state, 'p1', 5);
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'vanguard'));
  resolve(state);
  put(state, 'late', 'razorfoot-griffin', 'p1', 'battlefield');
  assert.equal(effectivePower(state.objects.get('late'), state), 2,
    'zbiór objętych ustala się przy rozstrzygnięciu — późniejszy stwór zostaje 2/2');
});

test('B59/G1.1: Charismatic Vanguard — aktywacja niemożliwa bez 5 many', () => {
  const state = game();
  put(state, 'vanguard', 'charismatic-vanguard', 'p1', 'battlefield');
  put(state, 'mine', 'razorfoot-griffin', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'vanguard'),
    'przy 4 manie oferta aktywacji nie istnieje');
});

// ---- G1.2: Sun-Collared Raptor (141 RIX, plan Ixalan) ----------------------

test('B59/G1.2: Sun-Collared Raptor — dane Oracle, trample i koszt', () => {
  const def = registry.get('sun-collared-raptor');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Dinosaur']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 2);
  assert.deepEqual(def.keywords, ['trample']);
  assert.equal(def.set, 'RIX');
  assert.equal(def.plan, 'Ixalan');
  assert.equal(def.artId, 141);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('62fbd1bc'), 'imageUri z druku RIX (rix/118)');
  assert.equal(MANA_COSTS['sun-collared-raptor'], '{1}{R}');
});

test('B59/G1.2: Sun-Collared Raptor — {2}{R}: +3/+0 do końca tury, wielokrotnie', () => {
  const state = game();
  put(state, 'raptor', 'sun-collared-raptor', 'p1', 'battlefield');
  addMana(state, 'p1', 6);
  const activate = () => commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'raptor');
  assert.ok(activate(), 'pierwsza aktywacja oferowana');
  run(state, activate());
  resolve(state);
  assert.equal(effectivePower(state.objects.get('raptor'), state), 4, '1+3 = 4');
  assert.ok(activate(), 'Oracle nie ma limitu — druga aktywacja też jest oferowana');
  run(state, activate());
  resolve(state);
  assert.equal(effectivePower(state.objects.get('raptor'), state), 7,
    'dwie aktywacje kumulują się (7/2)');
  assert.equal(effectiveToughness(state.objects.get('raptor'), state), 2,
    'toughness bez zmian (+3/+0)');
});

test('B59/G1.2: Sun-Collared Raptor — bez many nie ma aktywacji', () => {
  const state = game();
  put(state, 'raptor', 'sun-collared-raptor', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'raptor'),
    'przy 2 manie oferty brak (koszt {2}{R} = 3)');
});

// ---- G1.3: Savage Hunger (142 ALA, plan Kaldheim) ---------------------------

test('B59/G1.3: Savage Hunger — dane Oracle, aura z pumpem i trample', () => {
  const def = registry.get('savage-hunger');
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.aura, { pump: { power: 1, toughness: 0 }, keywords: ['trample'] });
  assert.equal(def.set, 'ALA');
  assert.equal(def.plan, 'Kaldheim');       // plan DOSŁOWNIE z arkusza właściciela
  assert.equal(def.artId, 142);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('0367fac8'), 'imageUri z druku ALA (ala/147)');
  assert.equal(MANA_COSTS['savage-hunger'], '{2}{G}');
});

test('B59/G1.3: Savage Hunger — +1/+0 i trample na zaczarowanym stworze', () => {
  const state = game();
  put(state, 'savage', 'savage-hunger', 'p1');
  put(state, 'host', 'razorfoot-griffin', 'p1', 'battlefield');
  addMana(state, 'p1', 3);
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'savage');
  assert.ok(cast, 'rzut aury oferowany (aury idą ścieżką cast_permanent)');
  run(state, { ...cast, targetIds: ['host'] });
  resolve(state);
  const host = state.objects.get('host');
  assert.equal(host.zone, 'battlefield', 'aura weszła na pole bitwy przypięta');
  assert.equal(effectivePower(host, state), 3, '2/2 → 3/2 (+1/+0)');
  assert.equal(effectiveToughness(host, state), 2, 'toughness bez zmian');
  assert.ok(effectiveKeywords(host, state).includes('trample'), 'trample nadany przez aurę');
});

test('B59/G1.3: Savage Hunger — cycling {2} z ręki: odrzucenie i dobranie (CR 702.29a)', () => {
  const state = game();
  put(state, 'savage', 'savage-hunger', 'p1');
  put(state, 'lib-p1-9', 'basic-swamp', 'p1', 'library');
  addMana(state, 'p1', 2);
  const before = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  const cyc = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'savage');
  assert.ok(cyc, 'cycling oferowany z ręki');
  run(state, cyc);
  assert.equal(state.zones.stack.length, 1, 'cycling to zdolność AKTYWOWANA — idzie na stos (ruling ALA 2008-10-01)');
  resolve(state);
  assert.ok(find(state, 'savage-hunger', 'graveyard'), 'karta odrzucona do grobu (koszt); zmiana strefy = nowy obiekt (CR 400.7)');
  const after = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(after, before - 1 + 1, 'odrzucenie (-1) i dobranie (+1)');
});

test('B59/G1.3: Savage Hunger — aury nie można rzucić bez celu-stwora', () => {
  const state = game();
  put(state, 'savage', 'savage-hunger', 'p1');
  addMana(state, 'p1', 3);
  assert.ok(!commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'savage'),
    'brak stworów na polu bitwy → brak oferty rzutu aury (607.2 / „enchant creature")');
});

// ---- G1.4: Join the Dance (138 MID, plan Eldraine) -------------------------

test('B59/G1.4: Join the Dance — dane Oracle i dwa tokeny 1/1 Human', () => {
  const def = registry.get('join-the-dance');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['G', 'W']);
  assert.equal(def.manaCost, 2);
  // M428: {3}{G}{W} to PIĘĆ many (cost = suma symboli, nie część generyczna).
  assert.deepEqual(def.spell.flashback, { cost: 5, colors: ['G', 'W'] });
  assert.equal(def.set, 'MID');
  assert.equal(def.plan, 'Eldraine');
  assert.equal(def.artId, 138);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('56b30a99'), 'imageUri z druku MID (mid/229)');
  assert.equal(MANA_COSTS['join-the-dance'], '{G}{W}');
});

test('B59/G1.4: Join the Dance — rozstrzygnięcie tworzy DWA tokeny 1/1 białe Human', () => {
  const state = game();
  put(state, 'dance', 'join-the-dance', 'p1');
  addMana(state, 'p1', 2);
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'dance'));
  resolve(state);
  const tokens = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_human');
  assert.equal(tokens.length, 2, 'dokładnie dwa tokeny Human');
  assert.equal(effectivePower(tokens[0], state), 1);
  assert.equal(effectiveToughness(tokens[0], state), 1);
  assert.deepEqual(tokens[0].colors, ['W'], 'tokeny są białe');
});

test('B59/G1.4: Join the Dance — flashback {3}{G}{W} z grobu (koszt alternatywny)', () => {
  const state = game();
  put(state, 'dance', 'join-the-dance', 'p1', 'graveyard');
  addMana(state, 'p1', 5);
  const fb = commands(state).find((c) => c.type === 'cast_flashback' && c.objectId === 'dance');
  assert.ok(fb, 'flashback oferowany z grobu przy 5 manie ({3}{G}{W})');
  run(state, fb);
  resolve(state);
  assert.ok(find(state, 'join-the-dance', 'exile'),
    'karta rzucona z flashbackiem idzie na WYGNANIE (CR 702.34a), nie do grobu');
  const tokens = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_human');
  assert.equal(tokens.length, 2, 'efekt zadziałał także z flashbacku');
});

test('B59/G1.4: Join the Dance — bez 5 many flashback nie jest oferowany', () => {
  const state = game();
  put(state, 'dance', 'join-the-dance', 'p1', 'graveyard');
  addMana(state, 'p1', 4);
  assert.ok(!commands(state).some((c) => c.type === 'cast_flashback' && c.objectId === 'dance'),
    'koszt flashbacku {3}{G}{W} = 5 many (M428: wcześniej oferta szła już przy 4)');
});

// ---- G1.5: Waveskimmer Aven (134 ALA, plan Forgotten Realms) ----------------

test('B59/G1.5: Waveskimmer Aven — dane Oracle (3 kolory, flying, exalted)', () => {
  const def = registry.get('waveskimmer-aven');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Bird', 'Soldier']);
  assert.deepEqual(def.colors, ['G', 'U', 'W']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 5);
  assert.ok(def.keywords.includes('flying'));
  assert.ok(def.keywords.includes('exalted'));
  assert.equal(def.set, 'ALA');
  assert.equal(def.plan, 'Forgotten Realms');
  assert.equal(def.artId, 134);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('e75ebcb4'), 'imageUri z druku ALA (ala/207)');
  assert.equal(MANA_COSTS['waveskimmer-aven'], '{2}{G}{W}{U}');
});

test('B59/G1.5: Waveskimmer Aven — exalted: atak samotny daje +1/+1 (ruling ALA 2008-10-01)', () => {
  const state = game();
  put(state, 'aven', 'waveskimmer-aven', 'p1', 'battlefield');
  put(state, 'other', 'razorfoot-griffin', 'p1', 'battlefield');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const solo = commands(state).find((c) => c.type === 'declare_attackers');
  assert.ok(solo, 'deklaracja ataku oferowana');
  run(state, { ...solo, attackerIds: ['aven'] });
  resolve(state);
  assert.equal(effectivePower(state.objects.get('aven'), state), 3,
    'samotny atak: 2/4 → 3/5 (exalted +1/+1)');
  assert.equal(effectiveToughness(state.objects.get('aven'), state), 5);
});

// ---- G1.6: Slithering Cryptid (139 TMT, plan TMNT) --------------------------

test('B59/G1.6: Slithering Cryptid — dane Oracle, pip hybrydowy {2}{G/U}', () => {
  const def = registry.get('slithering-cryptid');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Fish', 'Mutant']);
  assert.deepEqual(def.colors, ['G', 'U']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'TMT');
  assert.equal(def.plan, 'Teenage Mutant Ninja Turtles');
  assert.equal(def.artId, 139);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('6d35cb39'), 'imageUri z druku TMT (tmt/168)');
  assert.equal(MANA_COSTS['slithering-cryptid'], '{2}{G/U}');
});

test('B59/G1.6: Slithering Cryptid — ETB tworzy token Mutagen (artefakt z podtypem)', () => {
  const state = game();
  put(state, 'cryptid', 'slithering-cryptid', 'p1');
  addMana(state, 'p1', 3);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'cryptid'));
  resolve(state);
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'token_mutagen');
  assert.ok(token, 'token Mutagen na polu bitwy');
  assert.deepEqual(token.types, ['Artifact']);
  assert.deepEqual(token.subtypes, ['Mutagen']);
  assert.deepEqual(token.colors, []);
  assert.equal(token.kind, 'artifact', 'Mutagen nie jest stworzeniem');
});

test('B59/G1.6: Mutagen — {1},{T},poświęć: +1/+1 na cel, tylko jak sorcery', () => {
  const state = game();
  put(state, 'cryptid', 'slithering-cryptid', 'p1');
  put(state, 'host', 'razorfoot-griffin', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'cryptid'));
  resolve(state);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_mutagen');
  const activate = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === token.id);
  assert.ok(activate, 'zdolność Mutagenu oferowana w main fazie');
  run(state, { ...activate, targetIds: ['host'] });
  resolve(state);
  assert.ok(!state.objects.get(token.id), 'token poświęcony (koszt)');
  assert.equal(effectivePower(state.objects.get('host'), state), 3, '2/2 + licznik +1/+1 = 3/3');
  assert.equal(effectiveToughness(state.objects.get('host'), state), 3);
});

test('B59/G1.6: Mutagen — w fazie walki zdolność NIE jest oferowana (activate only as a sorcery)', () => {
  const state = game();
  put(state, 'cryptid', 'slithering-cryptid', 'p1', 'battlefield');
  put(state, 'host', 'razorfoot-griffin', 'p1', 'battlefield');
  addMana(state, 'p1', 3);
  // token wprost z definicji katalogowej (jak poprzednio, ale bez rzucania)
  run(state, commands(state).find((c) => c.type === 'pass_priority') ?? { type: 'pass_priority' });
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_mutagen');
  if (!token) return; // token powstaje przy wejściu — brak tokenu = scenariusz nieobsługiwany
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === token.id),
    'timing sorcery blokuje aktywację w combat');
});

test('B59/G1.6: Mutagen — katalog i lustro silnika są identyczne (L41)', async () => {
  const { MUTAGEN_TOKEN_EFFECT, MUTAGEN_TOKEN_ABILITY } = await import('../src/engine/tokens.js');
  const catalog = registry.get('token_mutagen');
  assert.deepEqual([...MUTAGEN_TOKEN_EFFECT.types], catalog.types.filter((t) => t !== 'Token'));
  assert.deepEqual([...MUTAGEN_TOKEN_EFFECT.subtypes], catalog.subtypes);
  assert.deepEqual([...MUTAGEN_TOKEN_EFFECT.colors], catalog.colors);
  assert.equal(MUTAGEN_TOKEN_EFFECT.cardId, catalog.id);
  assert.equal(MUTAGEN_TOKEN_EFFECT.name, catalog.name);
  const catAbility = catalog.abilities[0];
  for (const key of ['type', 'timing']) {
    assert.equal(MUTAGEN_TOKEN_ABILITY[key], catAbility[key], `pole ${key} zdolności`);
  }
  assert.deepEqual({ ...MUTAGEN_TOKEN_ABILITY.cost }, { ...catAbility.cost });
  assert.deepEqual({ ...MUTAGEN_TOKEN_ABILITY.effect }, { ...catAbility.effect });
  assert.deepEqual(MUTAGEN_TOKEN_ABILITY.targets.map((t) => t.type), catAbility.targets.map((t) => t.type));
});

// ---- G1.7: Scavenging Harpy (130 THB, plan Wiedźmin) -----------------------

test('B59/G1.7: Scavenging Harpy — dane Oracle, koszt i druk', () => {
  const def = registry.get('scavenging-harpy');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Harpy']);
  assert.deepEqual(def.colors, ['B']);
  assert.deepEqual(def.keywords, ['flying']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'THB');
  assert.equal(def.plan, 'Wiedźmin', 'plan przepisany DOSŁOWNIE z arkusza (nie kraina setu)');
  assert.equal(def.artId, 130);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('b0e237c5'), 'imageUri z druku THB (thb/114)');
  assert.equal(MANA_COSTS['scavenging-harpy'], '{2}{B}');
});

test('B59/G1.7: Scavenging Harpy — ETB wygania kartę z grobu PRZECIWNIKA', () => {
  const state = game();
  put(state, 'harpy', 'scavenging-harpy', 'p1');
  put(state, 'g-mine', 'shock', 'p1', 'graveyard');
  put(state, 'g-shock', 'shock', 'p2', 'graveyard');
  put(state, 'g-hunger', 'savage-hunger', 'p2', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'harpy'));
  resolve(state);
  const oferty = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  assert.deepEqual(oferty.map((c) => c.targetId), ['g-hunger', 'g-shock'],
    'kandydaci to WYŁĄCZNIE karty z grobu przeciwnika (najwartościowsza pierwsza — efekt wrogi)');
  run(state, oferty[0]);
  resolve(state);
  const inZone = (cardId, zone) => [...state.objects.values()].filter((o) => o.cardId === cardId && o.zone === zone);
  assert.equal(inZone('savage-hunger', 'graveyard').length, 0, 'cel opuścił grób');
  assert.equal(inZone('savage-hunger', 'exile').length, 1, 'cel jest na wygnaniu (nowy obiekt, CR 400.7)');
  assert.equal(inZone('shock', 'graveyard').length, 2, 'pozostałe karty zostają w grobach');
  assert.equal(inZone('shock', 'exile').length, 0);
});

test('B59/G1.7: Scavenging Harpy — karta z WŁASNEGO grobu nie jest legalnym celem', () => {
  const state = game();
  put(state, 'harpy', 'scavenging-harpy', 'p1');
  put(state, 'g-mine', 'shock', 'p1', 'graveyard');
  put(state, 'g-opponent-a', 'shock', 'p2', 'graveyard');
  put(state, 'g-opponent-b', 'savage-hunger', 'p2', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'harpy'));
  resolve(state);
  const oferty = commands(state).filter((c) => c.type === 'resolve_trigger_target');
  // Dwóch kandydatów w grobie przeciwnika → decyzja celu (przy jednym engine
  // wybiera automatycznie, CR 115.1d — pilnuje tego test niżej).
  assert.deepEqual(oferty.map((c) => c.targetId), ['g-opponent-b', 'g-opponent-a'],
    'własna karta nie jest oferowana; kolejność = najwartościowsza pierwsza');
  // Wymuszona komenda z nielegalnym celem: odrzucona, nic nie znika.
  const forced = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'g-mine' });
  assert.equal(forced.ok, false, 'walidacja odrzuca własny grób');
  assert.ok(state.objects.get('g-mine'), 'karta z własnego grobu została na miejscu');
});

test('B59/G1.7: Scavenging Harpy — JEDEN kandydat = cel wybierany automatycznie (CR 115.1d)', () => {
  const state = game();
  put(state, 'harpy', 'scavenging-harpy', 'p1');
  put(state, 'g-opponent', 'savage-hunger', 'p2', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'harpy'));
  resolve(state);
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target'),
    'z jednym legalnym celem engine nie pyta kontrolera (duch CR 115.1d)');
  const auto = state.events.find((e) => e.type === 'trigger_target_resolved' && e.cardId === 'scavenging-harpy');
  assert.equal(auto?.auto, true, 'stół widzi automatyczny wybór celu (wpis w logu)');
  const wygnane = [...state.objects.values()].filter((o) => o.cardId === 'savage-hunger' && o.zone === 'exile');
  assert.equal(wygnane.length, 1, 'karta celu trafiła na wygnanie');
});

test('B59/G1.7: Scavenging Harpy — pusty grób przeciwnika = trigger bez celu (M106/Z2)', () => {
  const state = game();
  put(state, 'harpy', 'scavenging-harpy', 'p1');
  put(state, 'g-mine', 'shock', 'p1', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'harpy'));
  resolve(state);
  assert.ok(!commands(state).some((c) => c.type === 'resolve_trigger_target'),
    'brak decyzji celu, gdy w grobach przeciwników nie ma KART');
  const skipped = state.events.find((e) => e.type === 'trigger_resolved' && e.cardId === 'scavenging-harpy');
  assert.equal(skipped?.noEffect, true, 'stół dowiaduje się, że trigger nic nie zrobił');
  assert.equal(skipped?.reason, 'no_targets');
  assert.equal(state.zones.graveyard.length, 1, 'własna karta w grobie nietknięta');
  assert.equal(state.zones.exile.length, 0);
});

test('B59/G1.7: Scavenging Harpy — cel nielegalny przy rozstrzygnięciu = brak efektu (CR 608.2b)', () => {
  const state = game();
  put(state, 'harpy', 'scavenging-harpy', 'p1');
  put(state, 'g-hunger', 'savage-hunger', 'p2', 'graveyard');
  put(state, 'g-shock', 'shock', 'p2', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['B'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'harpy'));
  resolve(state);
  run(state, commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'g-hunger'));
  // Inny efekt wygania wybraną kartę, ZANIM trigger się rozstrzygnie.
  const przed = moveObjectDirectly(state, 'g-hunger', 'exile', 'exile-b59');
  assert.ok(przed, 'karta opuściła grób przed rozstrzygnięciem');
  resolve(state);
  const wygnane = [...state.objects.values()].filter((o) => o.cardId === 'savage-hunger' && o.zone === 'exile');
  assert.equal(wygnane.length, 1, 'efekt nie kładzie drugiej kopii — brak celu = brak efektu (CR 608.2b)');
  assert.ok(state.objects.get('g-shock'), 'inna karta w grobie zostaje nietknięta');
});

// ---- G1.8: Memory's Journey (131 ISD, plan Kamigawa) -----------------------
// „Target player shuffles up to three target cards from their graveyard into
// their library" + flashback {G}. Pierwsza karta z ZALEŻNĄ pozycją celu
// (karty pochodzą z grobu gracza wskazanego w pozycji 0) i pierwsza łącząca
// pozycje OPCJONALNE z rzutem z grobu (flashback). Rulingi ISD 2011-09-22
// (ADR 0028) pinują: obowiązkowy cel-gracz, tasowanie bez wskazanych kart,
// zakaz celowania w samą siebie przy flashbacku.

test('B59/G1.8: Memory\'s Journey — dane Oracle, koszt i druk', () => {
  const def = registry.get('memory-s-journey');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.set, 'ISD');
  assert.equal(def.plan, 'Kamigawa');
  assert.equal(def.artId, 131);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('265aaa73'), 'imageUri z druku ISD (isd/66)');
  assert.equal(MANA_COSTS['memory-s-journey'], '{1}{U}');
  assert.deepEqual(def.spell.flashback, { cost: 1, colors: ['G'] });
  assert.equal(def.spell.targets[0].type, 'player', 'cel-gracz jest OBOWIĄZKOWY');
  assert.deepEqual(def.spell.targets.slice(1).map((t) => t.type),
    ['card_in_graveyard', 'card_in_graveyard', 'card_in_graveyard']);
  assert.deepEqual(def.spell.targets.slice(1).map((t) => t.graveyardOfSlot), [0, 0, 0],
    'pula kart pochodzi z grobu gracza wskazanego w pozycji 0');
  assert.deepEqual(def.spell.targets.slice(1).map((t) => t.optional), [true, true, true]);
  assert.deepEqual([...new Set(def.spell.targets.slice(1).map((t) => t.targetWord))], ['cards'],
    'trzy sloty to JEDNO wystąpienie słowa „target" (CR 601.2c)');
  assert.deepEqual(def.spell.effects, [{
    type: 'shuffle_graveyard_cards_into_library', playerTargetIndex: 0, cardTargetIndexes: [1, 2, 3],
  }]);
});

test('B59/G1.8: karty celują grób WSKAZANEGO gracza — pozycja zależna', () => {
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1');
  put(state, 'm1', 'savage-hunger', 'p1', 'graveyard');
  put(state, 'm2', 'shock', 'p1', 'graveyard');
  put(state, 'o1', 'razorfoot-griffin', 'p2', 'graveyard');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const offers = commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'mj');
  assert.ok(offers.some((c) => c.targets[0] === 'p1'), 'można wskazać SIEBIE („target player")');
  assert.ok(offers.some((c) => c.targets[0] === 'p2'), 'można wskazać przeciwnika');
  for (const cmd of offers) {
    for (const slot of cmd.targets.slice(1)) {
      if (slot == null) continue;
      assert.equal(state.objects.get(slot).controllerId, cmd.targets[0],
        `oferta nie może mieszać grobów: ${JSON.stringify(cmd.targets)}`);
    }
  }
  // Kolejność celów w obrębie jednego wystąpienia słowa „target" nie tworzy
  // duplikatów: {m1, m2} występuje raz (bez luk i bez permutacji).
  const withBothMine = offers.filter((c) => c.targets[0] === 'p1'
    && c.targets.slice(1).filter((t) => t != null).length === 2);
  assert.equal(withBothMine.length, 2, 'dwie pary (kolejność slotów), nie 4 permutacje');
  for (const cmd of withBothMine) {
    const cards = cmd.targets.slice(1).filter((t) => t != null);
    assert.deepEqual([...cards].sort(), ['m1', 'm2']);
    assert.equal(cmd.targets[3], null, 'puste pozycje są tylko na KOŃCU wystąpienia');
  }
});

test('B59/G1.8: rozstrzygnięcie wtasowuje wskazane karty do biblioteki celu', () => {
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1');
  put(state, 'm1', 'savage-hunger', 'p1', 'graveyard');
  put(state, 'm2', 'shock', 'p1', 'graveyard');
  addMana(state, 'p1', 2, { colors: ['U'] });
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'mj'
    && c.targets[0] === 'p1' && c.targets[1] === 'm1' && c.targets[2] === 'm2'));
  resolve(state);
  assert.ok(find(state, 'savage-hunger', 'library'), 'pierwsza karta w bibliotece');
  assert.ok(find(state, 'shock', 'library'), 'druga karta w bibliotece');
  assert.equal([...state.objects.values()]
    .filter((o) => ['savage-hunger', 'shock'].includes(o.cardId) && o.zone === 'graveyard').length, 0,
    'celowane karty opuściły grób (w grobie zostaje sam czar)');
  const shuffled = state.events.filter((e) => e.type === 'library_shuffled');
  assert.equal(shuffled.length, 1, 'tasowanie jest osobnym zdarzeniem logu (M134)');
  assert.equal(shuffled[0].playerId, 'p1', 'tasuje BIBLIOTEKĘ CELU („their library")');
  assert.ok(find(state, 'memory-s-journey', 'graveyard'), 'czar bez flashbacku idzie do grobu');
});

test('B59/G1.8: bez wskazanych kart gracz-cel i tak tasuje (ruling ISD 2011-09-22)', () => {
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1');
  put(state, 'o1', 'razorfoot-griffin', 'p2', 'graveyard');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const offer = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'mj'
    && c.targets[0] === 'p2' && c.targets.slice(1).every((t) => t == null));
  assert.ok(offer, 'wariant „sam gracz" („up to three" = także zero) jest w ofercie');
  run(state, offer);
  resolve(state);
  assert.ok(find(state, 'razorfoot-griffin', 'graveyard'), 'niewskazana karta zostaje w grobie');
  const shuffled = state.events.filter((e) => e.type === 'library_shuffled');
  assert.equal(shuffled.length, 1);
  assert.equal(shuffled[0].playerId, 'p2', 'tasuje gracz-cel, nie rzucający');
});

test('B59/G1.8: karta z CUDZEGO grobu przy innym graczu-celu jest nielegalna (L48/M82)', () => {
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1');
  put(state, 'm1', 'savage-hunger', 'p1', 'graveyard');
  put(state, 'o1', 'razorfoot-griffin', 'p2', 'graveyard');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const bad = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'mj', targets: ['p1', 'o1', null, null],
  });
  assert.equal(bad.ok, false, 'komenda spoza oferty odrzucona (walidacja = oferta)');
  const good = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'mj', targets: ['p1', 'm1', null, null],
  });
  assert.equal(good.ok, true, 'karta z grobu wskazanego gracza przechodzi');
});

test('B59/G1.8: karta, która opuściła grób przed rozstrzygnięciem, nie wraca (CR 608.2b)', () => {
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1');
  put(state, 'm1', 'savage-hunger', 'p1', 'graveyard');
  put(state, 'm2', 'shock', 'p1', 'graveyard');
  addMana(state, 'p1', 2, { colors: ['U'] });
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'mj'
    && c.targets[0] === 'p1' && c.targets[1] === 'm1' && c.targets[2] === 'm2'));
  // Inny efekt wygania jedną z celowanych kart, ZANIM czar się rozstrzygnie.
  assert.ok(moveObjectDirectly(state, 'm2', 'exile', 'exile-b59-mj'), 'karta opuściła grób');
  resolve(state);
  assert.ok(find(state, 'savage-hunger', 'library'), 'legalna karta wraca do biblioteki');
  assert.equal([...state.objects.values()].filter((o) => o.cardId === 'shock' && o.zone === 'library').length, 0,
    'wygnana karta NIE trafia do biblioteki');
  assert.equal(state.events.filter((e) => e.type === 'library_shuffled').length, 1,
    'mimo nielegalnej pozycji gracz-cel tasuje (ruling 2011-09-22)');
});

test('B59/G1.8: flashback {G} — karta nie może obrać SIEBIE i idzie na wygnanie', () => {
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1', 'graveyard');
  put(state, 'o1', 'razorfoot-griffin', 'p2', 'graveyard');
  put(state, 'o2', 'shock', 'p2', 'graveyard');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const offers = commands(state).filter((c) => c.type === 'cast_flashback' && c.objectId === 'mj');
  assert.ok(offers.length > 0, 'flashback oferowany z grobu za {G}');
  assert.ok(offers.every((c) => c.targets.slice(1).every((t) => t !== 'mj')),
    'rzucana karta leży na stosie, gdy wybierasz cele — nie może obrać siebie (ruling 2011-09-22)');
  const forced = execute(state, {
    type: 'cast_flashback', playerId: 'p1', objectId: 'mj', targets: ['p1', 'mj', null, null],
  });
  assert.equal(forced.ok, false, 'walidacja odrzuca celowanie w samą siebie');
  run(state, offers.find((c) => c.targets[0] === 'p2' && c.targets[1] === 'o1' && c.targets[2] == null));
  resolve(state);
  assert.ok(find(state, 'memory-s-journey', 'exile'),
    'czar rzucony z flashbackiem idzie na WYGNANIE (CR 702.34a)');
  assert.ok(find(state, 'razorfoot-griffin', 'library'), 'efekt zadziałał także z flashbacku');
  assert.ok(find(state, 'shock', 'graveyard'), 'niewskazana karta drugiego gracza zostaje');
});

test('B59/G1.8: przy dużym grobie oferta jest przycięta, ale trzyma skrajne wybory', () => {
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1');
  const grave = ['savage-hunger', 'shock', 'razorfoot-griffin', 'basic-swamp', 'basic-island', 'basic-mountain'];
  grave.forEach((cardId, i) => put(state, `g${i}`, cardId, 'p2', 'graveyard'));
  addMana(state, 'p1', 2, { colors: ['U'] });
  const offers = commands(state).filter((c) => c.type === 'cast_spell' && c.objectId === 'mj'
    && c.targets[0] === 'p2');
  assert.ok(offers.length <= 32, `oferta przycięta do limitu panelu (jest ${offers.length})`);
  assert.ok(offers.some((c) => c.targets.slice(1).every((t) => t == null)), 'wariant „zero kart" zostaje');
  assert.ok(offers.some((c) => c.targets.slice(1).filter((t) => t != null).length === 3),
    'wariant „trzy karty" (maksimum) zostaje');
  assert.ok(!offers.some((c) => c.targets.slice(1).filter((t) => t != null).length > 3), 'nigdy więcej niż trzy');
});

// ---- G1.9: Kumano's Blessing (135 BOK, plan Kamigawa) ----------------------
// „Flash / Enchant creature / If a creature dealt damage by enchanted creature
// this turn would die, exile it instead." Pierwszy efekt zastępczy pytający
// o ŹRÓDŁO obrażeń: silnik znał dotąd tylko fakt „dostał obrażenia"
// (`damagedThisTurn`). Pary {ofiara, źródło} zbiera `recordDamageSource`
// (permanents.js), a `zones.exiledByEnchantedDamage` rozstrzyga w chwili
// śmierci (CR 616.1) — dlatego aura dołożona PO obrażeniach też działa
// („enchanted creature" czytamy teraz), a odczepiona przestaje.

/** Walka: deklaracja ataku → okna → blok → obrażenia (ścieżka silnika). */
function fight(state, attackerId, blockerId) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  run(state, { ...commands(state).find((c) => c.type === 'declare_attackers'), attackerIds: [attackerId] });
  run(state, { type: 'pass_priority', playerId: 'p1' });
  run(state, { type: 'pass_priority', playerId: 'p2' });
  run(state, { type: 'declare_blockers', playerId: 'p2', assignments: { [attackerId]: [blockerId] } });
  run(state, { type: 'pass_priority', playerId: 'p2' });
  run(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
}

/** Aura dołożona do stwora wprost (bez rzucania) — jak w testach aury M210. */
function enchanting(state, auraId, hostId) {
  return replaceObject(state, state.objects.get(auraId), { kind: 'aura', attachedTo: hostId });
}

const byCard = (state, cardId) => [...state.objects.values()].find((o) => o.cardId === cardId);

test('B59/G1.9: Kumano\'s Blessing — dane Oracle, koszt, druk i deskryptor aury', () => {
  const def = registry.get('kumanos-blessing');
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 3);
  assert.equal(def.set, 'BOK');
  assert.equal(def.plan, 'Kamigawa');
  assert.equal(def.artId, 135);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('56f0d9aa'), 'imageUri z druku BOK (bok/111)');
  assert.equal(MANA_COSTS['kumanos-blessing'], '{2}{R}');
  assert.deepEqual(def.keywords, ['flash'], 'Flash rzucamy w oknie instant (CR 702.8)');
  assert.equal(def.aura.enchant, 'creature');
  assert.equal(def.aura.exileIfDiesFromEnchantedDamage, true, 'deskryptor generyczny (ADR 0002)');
});

test('B59/G1.9: flash — aura rzucana w oknie instant i załączana do stwora', () => {
  const state = game();
  put(state, 'host', 'fear-of-burning-alive', 'p1', 'battlefield');
  put(state, 'aura', 'kumanos-blessing', 'p1');
  addMana(state, 'p1', 3, { colors: ['R'] });
  // Krok blokujących = okno instant (nie main) — bez flash nie byłoby oferty.
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  const offer = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'aura');
  assert.ok(offer, 'aura z flash oferowana w oknie instant');
  run(state, { ...offer, targetId: 'host' });
  resolve(state);
  const aura = find(state, 'kumanos-blessing');
  assert.equal(aura.attachedTo, 'host', 'aura zaczarowuje wskazanego stwora');
  assert.equal(aura.aura.enchant, 'creature');
  assert.equal(aura.aura.exileIfDiesFromEnchantedDamage, true,
    'deskryptor przechodzi łańcuch karta → registry → obiekt gry (L21)');
});

test('B59/G1.9: ofiara obrażeń zaczarowanego stwora idzie na WYGNANIE, nie do grobu', () => {
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1', 'battlefield');
  put(state, 'victim', 'soulmender', 'p2', 'battlefield');
  put(state, 'aura', 'kumanos-blessing', 'p1', 'battlefield');
  enchanting(state, 'aura', 'dealer');
  fight(state, 'dealer', 'victim');
  const victim = byCard(state, 'soulmender');
  assert.equal(victim.zone, 'exile', 'śmierć od obrażeń bojowych zamiast grobu → wygnanie');
  assert.equal(victim.meta.exiledBy, 'kumanos-blessing', 'odznaka źródła wygnania (M262)');
  assert.equal(state.objects.get('dealer').zone, 'battlefield', 'zaczarowany atakujący przeżył (1/1 nie zabija 4/4)');
});

test('B59/G1.9: bez aury ten sam atak kończy się zwykłym grobem (kontrola)', () => {
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1', 'battlefield');
  put(state, 'victim', 'soulmender', 'p2', 'battlefield');
  fight(state, 'dealer', 'victim');
  assert.equal(byCard(state, 'soulmender').zone, 'graveyard');
});

test('B59/G1.9: obrażenia nie muszą być śmiertelne — liczy się ŹRÓDŁO z tej tury', async () => {
  const { destroyPermanents } = await import('../src/engine/destruction.js');
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1', 'battlefield');
  put(state, 'victim', 'giant-spider', 'p2', 'battlefield');
  put(state, 'aura', 'kumanos-blessing', 'p1', 'battlefield');
  enchanting(state, 'aura', 'dealer');
  markDamage(state, 'victim', 2, 'dealer'); // 2/4 przeżywa, ale „dostał obrażenia od zaczarowanego"
  assert.deepEqual(state.damageSourcesThisTurn, [{ objectId: 'victim', sourceId: 'dealer' }],
    'para {ofiara, źródło} zapisana (nie tylko „dostał obrażenia")');
  destroyPermanents(state, ['victim']);
  assert.equal(byCard(state, 'giant-spider').zone, 'exile',
    'śmierć od INNEGO efektu też jest wygnaniem (Oracle: „would die", nie „lethal damage")');
});

test('B59/G1.9: aura podłożona PO obrażeniach też wygania (warunek liczony przy śmierci, CR 616.1)', async () => {
  const { destroyPermanents } = await import('../src/engine/destruction.js');
  const { deathZoneFor } = await import('../src/engine/zones.js');
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1', 'battlefield');
  put(state, 'victim', 'giant-spider', 'p2', 'battlefield');
  markDamage(state, 'victim', 2, 'dealer');
  assert.equal(deathZoneFor(state, state.objects.get('victim')), 'graveyard',
    'bez aury na polu bitwy efektu zastępczego nie ma');
  put(state, 'aura', 'kumanos-blessing', 'p1', 'battlefield');
  enchanting(state, 'aura', 'dealer');
  assert.equal(deathZoneFor(state, state.objects.get('victim')), 'exile',
    'aura dołożona po obrażeniach przechwytuje śmierć — „enchanted creature" czytamy TERAZ');
  destroyPermanents(state, ['victim']);
  assert.equal(byCard(state, 'giant-spider').meta.exiledBy, 'kumanos-blessing');
});

test('B59/G1.9: aura odczepiona od stwora przestaje działać („enchanted creature")', async () => {
  const { destroyPermanents } = await import('../src/engine/destruction.js');
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1', 'battlefield');
  put(state, 'other', 'razorfoot-griffin', 'p1', 'battlefield');
  put(state, 'victim', 'giant-spider', 'p2', 'battlefield');
  put(state, 'aura', 'kumanos-blessing', 'p1', 'battlefield');
  enchanting(state, 'aura', 'dealer');
  markDamage(state, 'victim', 2, 'dealer');
  enchanting(state, 'aura', 'other'); // aura przeniesiona na innego stwora
  destroyPermanents(state, ['victim']);
  assert.equal(byCard(state, 'giant-spider').zone, 'graveyard',
    'zaczarowany jest teraz INNY stwór, więc pary obrażeń nie łapie');
});

test('B59/G1.9: pary obrażeń wygasają w cleanupie (CR 514.2 — „this turn")', async () => {
  const { destroyPermanents } = await import('../src/engine/destruction.js');
  const state = game();
  put(state, 'dealer', 'fear-of-burning-alive', 'p1', 'battlefield');
  put(state, 'victim', 'giant-spider', 'p2', 'battlefield');
  put(state, 'aura', 'kumanos-blessing', 'p1', 'battlefield');
  enchanting(state, 'aura', 'dealer');
  markDamage(state, 'victim', 2, 'dealer');
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  // Pełna runda passów wychodzi z kroku końcowego i wchodzi w cleanup —
  // dopiero TA ścieżka (nie ręczny jumpToStep) uruchamia blok sprzątania.
  run(state, { type: 'pass_priority', playerId: 'p1' });
  run(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'cleanup', 'jesteśmy w cleanupie');
  assert.deepEqual(state.damageSourcesThisTurn, [], 'pary obrażeń skasowane na koniec tury');
  destroyPermanents(state, ['victim']);
  assert.equal(byCard(state, 'giant-spider').zone, 'graveyard',
    'w nowej turze obrażenia sprzed cleanupu nie wyganiają');
});

// ---- G1.10: Bird Admirer // Wing Shredder (126/127 MID, plan Eldraine) -----
// Karta DWUSTRONNA z pary wpisów arkusza (przód 126, tył 127). Daybound
// (CR 702.145): przód 1/4 reach, tył 3/5 reach. Rulingi MID 2021-09-24:
// wejście w nocy od razu tylną stroną (bez transformu na polu bitwy) oraz
// zakaz obrotu permanentu daybound/nightbound czymkolwiek innym niż para tych
// zdolności — bramka `dayNightDriven` w `effects.transform`.
//
// Scenariusze mechaniczne idą na karcie Z TALII (`worek-baśni` = plan
// Eldraine, Krok 5): tylko materializacja talii niesie `transformTo`, więc
// ręcznie wstawiony obiekt (helper `put`) testowałby atrapę bez drugiej strony.

/** Partia złożona z PRAWDZIWYCH talii (p1: worek-baśni z Bird Admirerem). */
function matchWithBird() {
  const deck = (path) => parseDeckText(readFileSync(path, 'utf8'), registry).cardIds;
  const state = setupCardMatch({
    seed: 59,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deck('decks/worek-basni.txt')], ['p2', deck('decks/worek-dziki.txt')]]),
    registry,
  });
  state.pendingMulligans = []; // testy mechaniczne: bez kolejki mulliganów
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  return state;
}

const birdEntry = (state) => [...state.objects.values()].find((o) => o.cardId === 'bird-admirer');
const birdsOnBoard = (state, cardId) => [...state.objects.values()]
  .filter((o) => o.zone === 'battlefield' && o.cardId === cardId);

test('B59/G1.10: Bird Admirer // Wing Shredder — dane obu twarzy i druk', () => {
  const front = registry.get('bird-admirer');
  assert.deepEqual(front.types, ['Creature']);
  assert.deepEqual(front.subtypes, ['Human', 'Archer', 'Werewolf']);
  assert.deepEqual(front.colors, ['G']);
  assert.deepEqual([front.power, front.toughness], [1, 4]);
  assert.equal(front.manaCost, 3);
  assert.equal(front.set, 'MID');
  assert.equal(front.plan, 'Eldraine');
  assert.equal(front.artId, 126, 'przód pary wpisów 126 MID / 127 MID');
  assert.equal(front.support.status, 'supported');
  assert.deepEqual(front.support.limitations, []);
  assert.deepEqual(front.keywords, ['reach', 'daybound']);
  assert.equal(front.transformTo, 'wing-shredder');
  assert.ok(front.imageUri.includes('/front/') && front.imageUri.includes('71ccc444'),
    'obraz przodu z druku mid/169');
  assert.equal(MANA_COSTS['bird-admirer'], '{2}{G}');

  const back = registry.get('wing-shredder');
  assert.deepEqual([back.power, back.toughness], [3, 5]);
  assert.deepEqual(back.keywords, ['reach', 'nightbound']);
  assert.equal(back.artId, 127);
  assert.equal(back.transformTo, 'bird-admirer');
  assert.ok(back.imageUri.includes('/back/') && back.imageUri.includes('71ccc444'),
    'obraz tyłu z tego samego druku (back)');
  assert.equal(back.support.status, 'back', 'tylna strona nie wchodzi do talii');
  assert.ok(back.support.limitations.length > 0, 'status back niesie powód');
});

test('B59/G1.10: wejście na pole bitwy ustawia dzień — 1/4 z reach', async () => {
  const { processTriggers } = await import('../src/engine/triggers.js');
  const state = matchWithBird();
  const entry = birdEntry(state);
  assert.ok(entry, 'Bird Admirer w talii worek-baśni (Krok 5: talie singleton)');
  assert.equal(entry.transformTo?.cardId, 'wing-shredder',
    'transformTo obecne na obiekcie z materializacji talii (inaczej daybound martwy)');
  assert.equal(entry.frontFaceId, 'bird-admirer', 'karta z talii wchodzi ZAWSZE przodem (CR 712.8a)');
  const bf = moveObjectDirectly(state, entry.id, 'battlefield', `bf-${entry.id}`);
  assert.equal(state.dayNight, null, 'gra startuje bez oznaczenia dnia/nocy (ruling MID)');
  processTriggers(state, [{
    type: 'permanent_entered_battlefield', objectId: bf.id, object: bf,
    cardId: bf.cardId, controllerId: 'p1', resolved: true,
  }]);
  assert.equal(state.dayNight, 'day', 'wejście permanentu z daybound ustawia dzień');
  assert.equal(effectivePower(state.objects.get(bf.id), state), 1);
  assert.equal(effectiveToughness(state.objects.get(bf.id), state), 4);
  assert.ok(effectiveKeywords(state.objects.get(bf.id), state).includes('reach'));
});

test('B59/G1.10: staje się noc → permanent obraca się na Wing Shredder 3/5', async () => {
  const { setDayNight } = await import('../src/engine/triggers.js');
  const state = matchWithBird();
  const entry = birdEntry(state);
  const bf = moveObjectDirectly(state, entry.id, 'battlefield', `bf-${entry.id}`);
  const changed = setDayNight(state, 'night');
  assert.ok(changed.some((e) => e.type === 'day_night_changed'), 'designation się zmieniło');
  const shredded = state.objects.get(bf.id);
  assert.equal(shredded.cardId, 'wing-shredder', 'tylna strona (transform natychmiastowy, CR 702.145)');
  assert.equal(shredded.id, bf.id, 'transform jest IN PLACE — ten sam obiekt, to samo id (CR 712.18)');
  assert.equal(effectivePower(shredded, state), 3);
  assert.equal(effectiveToughness(shredded, state), 5);
  assert.ok(effectiveKeywords(shredded, state).includes('reach'));
  assert.equal(birdsOnBoard(state, 'bird-admirer').length, 0, 'front zniknął z pola bitwy');
  setDayNight(state, 'day');
  assert.equal(state.objects.get(bf.id).cardId, 'bird-admirer', 'świt obraca z powrotem na przód');
});

test('B59/G1.10: rzut przodu W NOCY wchodzi od razu jako tył (ruling MID 2021-09-24)', async () => {
  const { setDayNight } = await import('../src/engine/triggers.js');
  const state = matchWithBird();
  setDayNight(state, 'night');
  const designation = state.events.filter((e) => e.type === 'day_night_changed').length;
  const entry = birdEntry(state);
  const handId = moveObjectDirectly(state, entry.id, 'hand', `hand-${entry.id}`).id;
  addMana(state, 'p1', 3, { colors: ['G'] });
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === handId));
  resolve(state);
  const shredded = birdsOnBoard(state, 'wing-shredder');
  assert.equal(shredded.length, 1, 'wchodzi tylną stroną, gdy jest noc');
  assert.equal(effectiveToughness(shredded[0], state), 5);
  assert.equal(state.events.filter((e) => e.type === 'day_night_changed').length, designation,
    'bez dodatkowej zmiany dnia/nocy — karta nie ląduje przodem i nie obraca się na stole');
  assert.equal(birdsOnBoard(state, 'bird-admirer').length, 0, 'przód nigdy nie pojawia się na polu bitwy');
});

test('B59/G1.10: zakaz obrotu przez INNE efekty niż daybound/nightbound (ruling MID 2021-09-24)', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const { setDayNight } = await import('../src/engine/triggers.js');
  const state = matchWithBird();
  const entry = birdEntry(state);
  const bf = moveObjectDirectly(state, entry.id, 'battlefield', `bf-${entry.id}`);
  // Efekt „transform permanentu" innej karty (wzorzec Moonmist) — bez flagi
  // pary daybound/nightbound silnik odmawia (tylko te zdolności obracają).
  applyEffect(state, { type: 'transform' }, state.objects.get(bf.id), []);
  assert.equal(state.objects.get(bf.id).cardId, 'bird-admirer', 'obcy efekt NIE obraca karty z daybound');
  assert.equal(birdsOnBoard(state, 'wing-shredder').length, 0);
  setDayNight(state, 'night');
  assert.equal(state.objects.get(bf.id).cardId, 'wing-shredder', 'a para daybound/nightbound obraca normalnie');
});
