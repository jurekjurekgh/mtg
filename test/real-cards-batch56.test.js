import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
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
