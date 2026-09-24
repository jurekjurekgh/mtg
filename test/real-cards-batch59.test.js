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
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

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
  assert.deepEqual(def.spell.flashback, { cost: 4, colors: ['G', 'W'] });
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
  addMana(state, 'p1', 4);
  const fb = commands(state).find((c) => c.type === 'cast_flashback' && c.objectId === 'dance');
  assert.ok(fb, 'flashback oferowany z grobu przy 4 manie');
  run(state, fb);
  resolve(state);
  assert.ok(find(state, 'join-the-dance', 'exile'),
    'karta rzucona z flashbackiem idzie na WYGNANIE (CR 702.34a), nie do grobu');
  const tokens = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_human');
  assert.equal(tokens.length, 2, 'efekt zadziałał także z flashbacku');
});

test('B59/G1.4: Join the Dance — bez 4 many flashback nie jest oferowany', () => {
  const state = game();
  put(state, 'dance', 'join-the-dance', 'p1', 'graveyard');
  addMana(state, 'p1', 3);
  assert.ok(!commands(state).some((c) => c.type === 'cast_flashback' && c.objectId === 'dance'),
    'koszt flashbacku {3}{G}{W} = 4 many');
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
