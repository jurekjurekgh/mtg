// Batch 69 (2026-10-20) — kolekcja artId 412–425, 10 kart, wszystkie `supported` (100%).
// Plan: docs/plans/PLAN_2026-10-20c-batch69-kolekcja-412-425.md. Dane Oracle i rulingi:
// docs/cards/scryfall-<slug>.json (pobrane 2026-10-20).
// Mechaniki generyczne (ADR 0002) testowane na prawdziwych kartach i prawdziwym silniku:
// convoke (Kavu Primarch), riot (Gruul Beastmaster), kicker z licznikiem „if kicked\",
// koszt „sacrifice enchanted creature\" (Bloodfire Infusion), prewencja obrażeń bojowych
// celu (Fleeting Flight), trample dla stworów z licznikiem (Tuskguard Captain),
// aktywacja z cmentarza przy „control an enchantment\" (Heron-Blessed Geist),
// redukcja kosztu za przeciwników z obrażeniami (Gnoll War Band).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 69, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) {
    for (let i = 0; i < 8; i += 1) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  }
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  if (Object.keys(patch).length > 0) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
const find = (state, cardId, zone = 'battlefield') => [...state.objects.values()]
  .find((object) => object.cardId === cardId && object.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

function run(state, command) {
  assert.ok(command, 'oferta komendy istnieje');
  const result = execute(state, command);
  assert.ok(result.ok, `${result.reason ?? 'odrzucono'}: ${JSON.stringify(result.events ?? [])}`);
  return result;
}

/** Rozstrzyga stos i pytania triggerów; [choose] wybiera cel, [mode] tryb modalny. */
function settle(state, { choose = null, mode = null, max = 120 } = {}) {
  for (let i = 0; i < max; i += 1) {
    const list = commands(state);
    if (state.pendingRiotChoice && mode != null) {
      const pick = list.find((c) => c.type === 'resolve_riot_choice' && c.modeIndex === mode);
      assert.ok(pick, 'wybór riot przed wejściem dostępny');
      run(state, pick);
      continue;
    }
    if (state.pendingModalTrigger && mode != null) {
      const pick = list.find((c) => c.type === 'resolve_modal_choice' && c.modeIndex === mode);
      assert.ok(pick, 'wybór trybu dostępny');
      run(state, pick);
      continue;
    }
    const trig = list.find((c) => c.type === 'resolve_trigger_target');
    if (trig) {
      const pick = choose ? list.find((c) => c.type === 'resolve_trigger_target' && c.targetId === choose) : null;
      run(state, pick ?? trig);
      continue;
    }
    const resolving = list.find((c) => c.type.startsWith('resolve_'));
    if (resolving) { run(state, resolving); continue; }
    if (state.zones.stack.length === 0) return;
    const pass = list.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'stos ma legalny pass priority');
    run(state, pass);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

const castCmd = (state, objectId, extra = {}) => commands(state).find((c) => (c.type === 'cast_spell' || c.type === 'cast_permanent')
  && c.objectId === objectId && Object.entries(extra).every(([k, v]) => JSON.stringify(c[k]) === JSON.stringify(v)));

function sanity(id, { set, plan, artId, types, manaCost, power, toughness }) {
  const def = registry.get(id);
  const snap = snapshotOf(id);
  assert.ok(def, `${id} istnieje w rejestrze`);
  assert.equal(def.oracleText, snap.oracle_text, 'Oracle 1:1 ze snapshotem Scryfalla');
  assert.equal(def.set, set);
  assert.equal(def.plan, plan, 'plan z listy właściciela jest wiążący (1:1)');
  assert.equal(def.artId, artId);
  assert.equal(def.support.status, 'supported', '100%: karta wspierana');
  assert.deepEqual(def.support.limitations, [], 'bez ograniczeń');
  assert.equal(MANA_COSTS[id], snap.mana_cost, 'koszt w MANA_COSTS = dokładny druk');
  assert.equal(snap.print, set.toLowerCase());
  assert.ok(Array.isArray(snap.rulings), 'rulingi zapisane, także pusta lista');
  assert.deepEqual(def.types, types);
  assert.equal(def.manaCost, manaCost);
  if (power != null) { assert.equal(def.power, power); assert.equal(def.toughness, toughness); }
  return def;
}

// ---------- sanity danych: 10 kart z listy właściciela (1:1 Plan) ----------

test('B69 sanity: Makindi Aeronaut (OGW 412, plan Zendikar)', () => {
  sanity('makindi-aeronaut', { set: 'OGW', plan: 'Zendikar', artId: 412, types: ['Creature'], manaCost: 2, power: 1, toughness: 3 });
});
test('B69 sanity: Bloodfire Infusion (APC 413, plan Warhammer Fantasy)', () => {
  sanity('bloodfire-infusion', { set: 'APC', plan: 'Warhammer Fantasy', artId: 413, types: ['Enchantment'], manaCost: 3 });
});
test('B69 sanity: Tuskguard Captain (2X2 414, plan Kaldheim)', () => {
  sanity('tuskguard-captain', { set: '2X2', plan: 'Kaldheim', artId: 414, types: ['Creature'], manaCost: 3, power: 2, toughness: 3 });
});
test('B69 sanity: Kavu Primarch (DMR 415, plan Dominaria)', () => {
  sanity('kavu-primarch', { set: 'DMR', plan: 'Dominaria', artId: 415, types: ['Creature'], manaCost: 4, power: 3, toughness: 3 });
});
test('B69 sanity: Fleeting Flight (FDN 416, plan Forgotten Realms)', () => {
  sanity('fleeting-flight', { set: 'FDN', plan: 'Forgotten Realms', artId: 416, types: ['Instant'], manaCost: 1 });
});
test('B69 sanity: Heron-Blessed Geist (VOW 417, plan Innistrad)', () => {
  sanity('heron-blessed-geist', { set: 'VOW', plan: 'Innistrad', artId: 417, types: ['Creature'], manaCost: 5, power: 3, toughness: 3 });
});
test('B69 sanity: Ior Ruin Expedition (ZEN 418, plan Zendikar)', () => {
  sanity('ior-ruin-expedition', { set: 'ZEN', plan: 'Zendikar', artId: 418, types: ['Enchantment'], manaCost: 2 });
});
test('B69 sanity: Gnoll War Band (CLB 423, plan Forgotten Realms)', () => {
  sanity('gnoll-war-band', { set: 'CLB', plan: 'Forgotten Realms', artId: 423, types: ['Creature'], manaCost: 6, power: 5, toughness: 5 });
});
test('B69 sanity: Gruul Beastmaster (RNA 424, plan Ravnica)', () => {
  sanity('gruul-beastmaster', { set: 'RNA', plan: 'Ravnica', artId: 424, types: ['Creature'], manaCost: 4, power: 2, toughness: 2 });
});
test('B69 sanity: Myr Scrapling (MH2 425, plan Mirrodin)', () => {
  sanity('myr-scrapling', { set: 'MH2', plan: 'Mirrodin', artId: 425, types: ['Artifact', 'Creature'], manaCost: 1, power: 1, toughness: 1 });
});

// ---------- scenariusze: mechaniki generyczne na prawdziwych kartach ----------

test('B69/416 Fleeting Flight — +1/+1, latanie i zapobieżenie obrażeniom bojowym celu', () => {
  const state = game();
  put(state, 'ff', 'fleeting-flight');
  put(state, 'mak', 'makindi-aeronaut', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['W'] });
  run(state, castCmd(state, 'ff', { targets: ['mak'] }));
  settle(state);
  const mak = state.objects.get('mak');
  assert.equal(mak.counters?.['+1/+1'], 1, 'licznik +1/+1 na celu');
  assert.ok(effectiveKeywords(mak, state).includes('flying'), 'lata do końca tury');
  assert.equal(state.preventDamageThisTurn?.some((f) => f.objectId === 'mak' && f.combatOnly), true,
    'filtr prewencji obrażeń bojowych na celu');
});

test('B69/416 prewencja działa tylko na obrażenia BOJOWE celu (nie niebojowe)', () => {
  const state = game();
  put(state, 'ff', 'fleeting-flight');
  put(state, 'mak', 'makindi-aeronaut', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['W'] });
  run(state, castCmd(state, 'ff', { targets: ['mak'] }));
  settle(state);
  const mak = state.objects.get('mak');
  const filters = state.preventDamageThisTurn ?? [];
  assert.equal(filters.filter((f) => f.objectId === 'mak').every((f) => f.combatOnly === true), true);
  assert.equal(filters.some((f) => f.objectId === 'mak' && !f.combatOnly), false, 'bez filtra niebojowego');
  assert.ok(mak, 'cel nadal na polu');
});

test('B69/415 Kavu Primarch — kicked wchodzi z czterema licznikami', () => {
  const state = game();
  put(state, 'kav', 'kavu-primarch');
  addMana(state, 'p1', 8, { colors: ['G'] });
  run(state, castCmd(state, 'kav', { kicked: true }));
  settle(state);
  assert.equal(find(state, 'kavu-primarch')?.counters?.['+1/+1'], 4, 'cztery +1/+1 po kicked');
});

test('B69/415 Kavu Primarch — bez kicker wchodzi bez liczników', () => {
  const state = game();
  put(state, 'kav', 'kavu-primarch');
  addMana(state, 'p1', 4, { colors: ['G'] });
  run(state, castCmd(state, 'kav'));
  settle(state);
  assert.equal(find(state, 'kavu-primarch')?.counters?.['+1/+1'] ?? 0, 0, 'brak liczników bez kicker');
});

test('B69/415 Convoke — stwory tapują się i płacą {G} oraz {1}; koszt zmniejsza się', () => {
  const state = game();
  put(state, 'kav', 'kavu-primarch');
  put(state, 'tusk', 'tuskguard-captain', 'p1', 'battlefield');
  put(state, 'mak', 'makindi-aeronaut', 'p1', 'battlefield');
  // koszt {3}{G}: pula 2 bezbarwne + stwór G (G) + stwór W (generic) = 4
  addMana(state, 'p1', 2, { colors: [] });
  const result = execute(state, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'kav', kicked: false,
    convokePayments: [{ creatureId: 'tusk', color: 'G' }, { creatureId: 'mak', color: 'generic' }],
  });
  assert.ok(result.ok, `convoke odrzucone: ${result.reason ?? ''} ${JSON.stringify(result.events ?? []).slice(0, 200)}`);
  settle(state);
  assert.equal(state.objects.get('tusk').tapped, true, 'stwór G stapowany');
  assert.equal(state.objects.get('mak').tapped, true, 'stwór generic stapowany');
  assert.ok(find(state, 'kavu-primarch'), 'Kavu na polu bez ładowania landów');
});

test('B69/415 Convoke — stwór już stapowany lub niekontrolowany jest odrzucany', () => {
  const state = game();
  put(state, 'kav', 'kavu-primarch');
  put(state, 'tusk', 'tuskguard-captain', 'p1', 'battlefield', { tapped: true });
  addMana(state, 'p1', 3, { colors: [] });
  const result = execute(state, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'kav', kicked: false,
    convokePayments: [{ creatureId: 'tusk', color: 'G' }],
  });
  assert.equal(result.ok, false, 'stapowany stwór nie płaci convoke');
  assert.equal(state.objects.get('kav').zone, 'hand', 'odrzucenie nie rusza karty (atomowość)');
});

test('B69/413 Bloodfire Infusion — poświęć dołączonego stwora: obrażenia = jego moc każdemu stworowi', () => {
  const state = game();
  put(state, 'host', 'tuskguard-captain', 'p1', 'battlefield');
  put(state, 'foe', 'makindi-aeronaut', 'p2', 'battlefield');
  put(state, 'bf', 'bloodfire-infusion', 'p1', 'battlefield', { attachedTo: 'host' });
  addMana(state, 'p1', 1, { colors: ['R'] });
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'bf'));
  settle(state);
  assert.notEqual(state.objects.get('host')?.zone, 'battlefield', 'stwór-gospodarz poświęcony');
  assert.equal(state.objects.get('foe')?.damage, 2, 'moc poświęconego (2) jako obrażenia każdemu stworowi');
});

test('B69/414 Tuskguard Captain — trample tylko dla stworów z licznikiem +1/+1', () => {
  const state = game();
  put(state, 'tusk', 'tuskguard-captain', 'p1', 'battlefield');
  put(state, 'bare', 'makindi-aeronaut', 'p1', 'battlefield');
  put(state, 'cnt', 'makindi-aeronaut', 'p1', 'battlefield', { counters: { '+1/+1': 1 } });
  assert.ok(effectiveKeywords(state.objects.get('cnt'), state).includes('trample'), 'stwór z licznikiem ma trample');
  assert.equal(effectiveKeywords(state.objects.get('bare'), state).includes('trample'), false, 'stwór bez licznika bez trample');
});

test('B69/417 Heron-Blessed Geist — ze cmentarza tylko przy enchantmencie; daje dwa 1/1 z przelotką', () => {
  const state = game();
  put(state, 'hgeist', 'heron-blessed-geist', 'p1', 'graveyard');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const offered = () => commands(state).some((c) => c.type === 'activate_ability' && c.objectId === 'hgeist');
  assert.equal(offered(), false, 'bez enchantmentu aktywacji nie ma');
  put(state, 'enc', 'ior-ruin-expedition', 'p1', 'battlefield');
  assert.equal(offered(), true, 'z enchantmentem aktywacja oferowana');
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'hgeist'));
  settle(state);
  const spirits = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_heron_spirit');
  assert.equal(spirits.length, 2, 'dwa tokeny Spirit');
  assert.ok(spirits.every((s) => effectiveKeywords(s, state).includes('flying')), 'tokeny z przelotką');
});

test('B69/418 Ior Ruin Expedition — usuń 3 quest i poświęć: dobierz dwie karty', () => {
  const state = game();
  put(state, 'ior', 'ior-ruin-expedition', 'p1', 'battlefield', { counters: { quest: 3 } });
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'ior'));
  settle(state);
  assert.equal(find(state, 'ior-ruin-expedition', 'graveyard') != null, true, 'poświęcony');
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter - handBefore, 2, 'dobrane dwie karty');
});

test('B69/423 Gnoll War Band — {1} taniej za każdego przeciwnika z obrażeniami w tej turze', () => {
  const state = game();
  put(state, 'gnoll', 'gnoll-war-band');
  addMana(state, 'p1', 5, { colors: ['R'] });
  assert.equal(castCmd(state, 'gnoll'), undefined, 'bez obrażeń koszt 6 — 5 many za mało');
  state.damageTakenByPlayerThisTurn = { p2: 1 };
  assert.ok(castCmd(state, 'gnoll'), 'z obrażeniami przeciwnika koszt 5 — rzut legalny');
});

test('B69/424 Gruul Beastmaster — riot: wybór +1/+1 albo haste (decyzja gracza)', () => {
  const state = game();
  put(state, 'gruul', 'gruul-beastmaster');
  addMana(state, 'p1', 4, { colors: ['G'] });
  run(state, castCmd(state, 'gruul'));
  settle(state, { mode: 0 });
  assert.equal(find(state, 'gruul-beastmaster')?.counters?.['+1/+1'], 1, 'tryb 0: licznik +1/+1');
});

test('B69/424 Gruul Beastmaster — riot tryb haste daje przelotkę-haste bezterminowo', () => {
  const state = game();
  put(state, 'gruul', 'gruul-beastmaster');
  addMana(state, 'p1', 4, { colors: ['G'] });
  run(state, castCmd(state, 'gruul'));
  settle(state, { mode: 1 });
  const g = find(state, 'gruul-beastmaster');
  assert.equal(g?.counters?.['+1/+1'] ?? 0, 0, 'tryb 1: bez licznika');
  assert.ok(effectiveKeywords(g, state).includes('haste'), 'haste nadane');
});

test('B69/425 Myr Scrapling — poświęcenie daje +1/+1 na cel', () => {
  const state = game();
  put(state, 'myr', 'myr-scrapling', 'p1', 'battlefield');
  put(state, 'mak', 'makindi-aeronaut', 'p1', 'battlefield');
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'myr');
  assert.ok(act, 'zdolność oferowana');
  run(state, { ...act, targets: ['mak'] });
  settle(state);
  assert.equal(find(state, 'myr-scrapling', 'graveyard') != null, true, 'Myr poświęcony');
  assert.equal(state.objects.get('mak').counters?.['+1/+1'], 1, 'licznik na celu');
});

test('B69/423 Myriad — model 1:1: trigger ataku z warunkiem „inny przeciwnik” (ADR 0022)', () => {
  const def = registry.get('gnoll-war-band');
  const ability = def.abilities.find((a) => a.trigger?.event === 'attacks');
  assert.ok(ability, 'trigger ataku istnieje');
  assert.equal(ability.trigger.condition.anotherOpponentExists, true, 'w 1:1 martwy warunek, jak Exterminator Magmarch');
  assert.deepEqual(ability.effect, [], 'brak tokenów w 1:1 (ruling: defending player jest jedynym przeciwnikiem)');
});
