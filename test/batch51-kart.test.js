// Batch 51 (2026-08-28) — 8 kart z listy właściciela (artId 572–579).
// Dane Oracle: docs/cards/scryfall-*.json (pobrane 2026-08-28).
//
// Karty:
//   - Skinbrand Goblin (GTC)  → Bloodrush: zdolność z RĘKI (nowa mechanika)
//   - Typhoid Rats (FRF)      → deathtouch (keyword)
//   - Invasive Species (M15)  → ETB: oddaj INNY swój permanent (nowy filtr celu)
//   - Dromoka Warrior (DTK)   → wanilia 3/1
//   - Akroan Sergeant (ORI)   → first strike + Renown 1 (nowa mechanika)
//   - Thunderstaff (DST)      → prewencja statyczna + {2},{T} na atakujące (nowe)
//   - Savage Surge (THS)      → instant: +2/+2 i odkręcenie celu
//   - Kulrath Mystic (ECL)    → trigger na czar MV >= 4 (nowy warunek)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { resolveCombatDamage } from '../src/engine/combat.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 51, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

/** Obiekt po cardId — zmiana strefy tworzy NOWE id, więc nie szukamy po id z put(). */
function byCard(state, cardId, ownerId = null) {
  return [...state.objects.values()]
    .find((o) => o.cardId === cardId && (ownerId == null || o.ownerId === ownerId));
}

function resolveStack(state, limit = 20) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

/** Atakujący (p1) bez bloków — pełne obrażenia w gracza p2. */
function unblockedCombat(state, attackerIds, defendingPlayerId = 'p2') {
  state.combat = {
    attackingPlayerId: 'p1', defendingPlayerId, attackers: attackerIds,
    blockers: new Map(), blockedAttackers: new Set(),
  };
  resolveCombatDamage(state, defendingPlayerId);
}

function commands(state, playerId = 'p1') {
  return playerView(state, playerId).legalCommands;
}

// =============================================================================
// Skinbrand Goblin — Bloodrush (CR 207.2c)
// =============================================================================

test('B51: Skinbrand Goblin — dane Oracle i deskryptor bloodrush', () => {
  const def = REGISTRY.get('skinbrand-goblin');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Goblin', 'Warrior']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 2);
  assert.equal(def.artId, 572);
  assert.equal(def.plan, 'Ravnica');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.match(def.oracleText, /^Bloodrush — \{R\}, Discard this card: Target attacking creature gets \+2\/\+1 until end of turn\.$/);
  const ability = def.abilities[0];
  assert.equal(ability.type, 'activated');
  assert.deepEqual(ability.bloodrush, { power: 2, toughness: 1 }, 'deskryptor bloodrush');
  assert.deepEqual(ability.cost, { mana: 1, colors: ['R'] }, 'koszt {R}');
  assert.deepEqual(ability.targets, [{ type: 'attacking_creature' }], 'cel: atakujący stwór');
  assert.deepEqual(ability.effect, { type: 'pump', power: 2, toughness: 1 });
});

test('B51: Skinbrand Goblin — bloodrush z ręki: karta do grobu, atakujący +2/+1', () => {
  const state = game('p1', 'declare_blockers');
  addMana(state, 'p1', 5, { colors: ['R'] });
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'gob', 'skinbrand-goblin', 'p1', 'hand');
  state.combat = { attackingPlayerId: 'p1', defendersPlayerId: 'p2', attackers: ['atk'], blockers: new Map(), blockedAttackers: new Set() };
  const cmd = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'gob');
  assert.ok(cmd, 'bloodrush oferowany w walce na atakującego');
  assert.deepEqual(cmd.targets, ['atk'], 'jedyny legalny cel to atakujący stwór');
  assert.ok(execute(state, cmd).ok, 'aktywacja przyjęta');
  // Odrzucenie jest KOSZTEM — karta leci do grobu przed rozstrzygnięciem.
  const inGrave = [...state.objects.values()].some((o) => o.cardId === 'skinbrand-goblin' && o.zone === 'graveyard');
  assert.ok(inGrave, 'karta odrzucona do grobu (koszt, CR 117.11)');
  assert.equal(effectivePower(state.objects.get('atk'), state), 2, 'jeszcze przed rozstrzygnięciem');
  resolveStack(state);
  const attacker = state.objects.get('atk');
  assert.equal(effectivePower(attacker, state), 4, '2/1 + 2 = 4 mocy');
  assert.equal(effectiveToughness(attacker, state), 2, '1 + 1 = 2 wytrzymałości');
});

test('B51: Skinbrand Goblin — NIELEGALNIE: bloodrush nie działa spoza walki (brak atakujących)', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 5, { colors: ['R'] });
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'gob', 'skinbrand-goblin', 'p1', 'hand');
  const offered = commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'gob');
  assert.equal(offered.length, 0, 'poza walką żaden stwór nie atakuje — brak legalnego celu (CR 508.1k)');
});

test('B51: Skinbrand Goblin — NIELEGALNIE: cel nieatakujący odrzucony przez engine', () => {
  const state = game('p1', 'declare_blockers');
  addMana(state, 'p1', 5, { colors: ['R'] });
  put(state, 'atk', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'bench', 'goblin-piker', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'gob', 'skinbrand-goblin', 'p1', 'hand');
  state.combat = { attackingPlayerId: 'p1', attackers: ['atk'], blockers: new Map(), blockedAttackers: new Set() };
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'gob', abilityIndex: 0, targets: ['bench'] });
  assert.equal(r.ok, false, 'stwór spoza atakujących nie jest legalnym celem bloodrushu');
});

test('B51: Skinbrand Goblin — na polu bitwy zdolność jest martwa (brak oferty)', () => {
  const state = game('p1', 'declare_blockers');
  addMana(state, 'p1', 5, { colors: ['R'] });
  put(state, 'gob', 'skinbrand-goblin', 'p1', 'battlefield');
  state.combat = { attackingPlayerId: 'p1', attackers: [], blockers: new Map(), blockedAttackers: new Set() };
  const offered = commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'gob');
  assert.equal(offered.length, 0, 'bloodrush aktywuje się wyłącznie z ręki (jak cycling/channel/reinforce)');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'gob', abilityIndex: 0, targets: [] });
  assert.equal(r.ok, false, 'próba aktywacji z pola bitwy jest odrzucana');
});

// =============================================================================
// Typhoid Rats — deathtouch
// =============================================================================

test('B51: Typhoid Rats — dane Oracle, deathtouch, druk FRF', () => {
  const def = REGISTRY.get('typhoid-rats');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Rat']);
  assert.deepEqual(def.keywords, ['deathtouch']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.equal(def.artId, 573);
  assert.equal(def.plan, 'Tarkir');
  assert.equal(def.set, 'FRF', 'druk Fate Reforged (Sultai), nie M14');
  assert.deepEqual(def.support.limitations, []);
});

test('B51: Typhoid Rats — 1 obrażenie zabija blokującego 3/3 (deathtouch)', () => {
  const state = game('p1', 'combat_damage');
  addObject(state, {
    id: 'rat', instanceId: 'i-rat', cardId: 'typhoid-rats', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1,
    types: ['Creature'], subtypes: ['Rat'], keywords: ['deathtouch'], colors: ['B'], abilities: [],
  });
  put(state, 'bear', 'hill-giant', 'p2', 'battlefield');
  state.combat = {
    attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['rat'],
    blockers: new Map([['rat', ['bear']]]), blockedAttackers: new Set(['rat']),
  };
  resolveCombatDamage(state, 'p2');
  // Zmiana strefy tworzy NOWY obiekt (id z `put()` znika) — szukamy po karcie.
  const bear = byCard(state, 'hill-giant', 'p2');
  assert.equal(bear.zone, 'graveyard', '3/3 ginie od 1 obrażenia ze stwora z deathtouch (CR 702.2b)');
});

// =============================================================================
// Invasive Species — ETB: „another permanent you control"
// =============================================================================

test('B51: Invasive Species — dane Oracle i filtr celu', () => {
  const def = REGISTRY.get('invasive-species');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Insect']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.equal(def.artId, 574);
  assert.equal(def.plan, 'Warhammer Fantasy');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  const trigger = def.abilities[0].trigger;
  assert.equal(trigger.event, 'enter_battlefield');
  assert.deepEqual(trigger.requiresTarget, { type: 'permanent', controlledBy: 'controller', notSelf: true });
  assert.deepEqual(def.abilities[0].effect, [{ type: 'bounce_permanent' }]);
});

test('B51: Invasive Species — cel to WYŁĄCZNIE inny własny permanent (nie stwór przeciwnika)', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 6, { colors: ['G'] });
  put(state, 'mine', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'mine2', 'dromoka-warrior', 'p1', 'battlefield');
  put(state, 'theirs', 'hill-giant', 'p2', 'battlefield');
  put(state, 'bug', 'invasive-species', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bug');
  assert.ok(cast, 'oferta rzutu Invasive Species');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const targets = commands(state)
    .filter((c) => c.type === 'resolve_trigger_target')
    .map((c) => c.targetId);
  // Dwóch własnych kandydatów = decyzja gracza (przy jednym silnik wybiera
  // sam, M242, i test nie zobaczyłby listy kandydatów).
  assert.ok(targets.length >= 2, `decyzja celu z kompletem kandydatów: ${JSON.stringify(targets)}`);
  assert.ok(!targets.includes('theirs'), 'permanent PRZECIWNIKA nie jest legalnym celem („you control”)');
  assert.ok(!targets.includes('bug'), 'źródło nie jest swoim własnym celem („another”)');
  assert.deepEqual([...targets].sort(), ['mine', 'mine2'], 'wyłącznie inne własne permanenty');
});

test('B51: Invasive Species — wybrany permanent wraca na rękę właściciela', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 6, { colors: ['G'] });
  put(state, 'mine', 'goblin-piker', 'p1', 'battlefield');
  put(state, 'mine2', 'dromoka-warrior', 'p1', 'battlefield');
  put(state, 'bug', 'invasive-species', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bug');
  execute(state, cast);
  resolveStack(state);
  const pick = commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'mine');
  assert.ok(pick, 'decyzja celu z własnym stworem (dwóch kandydatów — brak autowyboru)');
  assert.ok(execute(state, pick).ok, `wybór celu odrzucony: ${state.events.at(-1)?.reason}`);
  resolveStack(state);
  const piker = byCard(state, 'goblin-piker', 'p1');
  assert.equal(piker.zone, 'hand', 'stwór wrócił na rękę właściciela');
  assert.ok(byCard(state, 'invasive-species', 'p1').zone === 'battlefield', 'Invasive Species zostaje na stole');
  assert.equal(byCard(state, 'dromoka-warrior', 'p1').zone, 'battlefield', 'niewybrany własny permanent zostaje');
});

test('B51: Invasive Species — bez innego własnego permanentu trigger gaśnie bez efektu', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 6, { colors: ['G'] });
  put(state, 'bug', 'invasive-species', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'bug');
  execute(state, cast);
  resolveStack(state);
  const noTargets = state.events.some((e) => e.type === 'trigger_resolved' && e.noEffect && e.reason === 'no_targets');
  assert.ok(noTargets, 'cel obowiązkowy: brak kandydata = brak efektu (CR 603.3d)');
  assert.ok(byCard(state, 'invasive-species', 'p1').zone === 'battlefield', 'karta wchodzi normalnie');
});

// =============================================================================
// Dromoka Warrior — wanilia
// =============================================================================

test('B51: Dromoka Warrior — wanilia 3/1 bez zdolności (Oracle pusty)', () => {
  const def = REGISTRY.get('dromoka-warrior');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Warrior']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 1);
  assert.equal(def.oracleText, '', 'karta bez tekstu regułowego');
  assert.equal(def.artId, 575);
  assert.equal(def.plan, 'Tarkir');
  assert.deepEqual(def.abilities, []);
  assert.deepEqual(def.keywords, []);
  assert.deepEqual(def.support.limitations, []);
});

test('B51: Dromoka Warrior — wchodzi na stół jako 3/1, nic nie robi', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 4, { colors: ['W'] });
  put(state, 'war', 'dromoka-warrior', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'war');
  assert.ok(cast, 'oferta rzutu');
  execute(state, cast);
  resolveStack(state);
  const onBoard = byCard(state, 'dromoka-warrior', 'p1');
  assert.equal(onBoard.zone, 'battlefield');
  assert.equal(effectivePower(onBoard, state), 3);
  assert.equal(effectiveToughness(onBoard, state), 1);
});

// =============================================================================
// Akroan Sergeant — first strike + Renown 1 (CR 702.112)
// =============================================================================

test('B51: Akroan Sergeant — dane Oracle, first strike i renown 1', () => {
  const def = REGISTRY.get('akroan-sergeant');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Soldier']);
  assert.deepEqual(def.keywords, ['first_strike']);
  assert.equal(def.renown, 1, 'deskryptor renown 1 (CR 702.112a)');
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.artId, 576);
  assert.equal(def.plan, 'Theros');
  assert.deepEqual(def.support.limitations, []);
  assert.match(def.oracleText, /Renown 1 \(When this creature deals combat damage to a player/);
});

test('B51: Akroan Sergeant — renown: licznik +1/+1 za pierwsze obrażenia bojowe graczowi', () => {
  const state = game('p1', 'combat_damage');
  put(state, 'sgt', 'akroan-sergeant', 'p1', 'battlefield');
  assert.equal(state.objects.get('sgt').renown, 1, 'deskryptor doszedł na obiekt gry (klasa L21)');
  unblockedCombat(state, ['sgt']);
  const sgt = state.objects.get('sgt');
  assert.deepEqual(sgt.counters, { '+1/+1': 1 }, 'renown 1 = jeden licznik');
  assert.equal(sgt.renowned, true, 'stwór stał się „renowned” (CR 702.112b)');
  assert.equal(effectivePower(sgt, state), 3, '2/2 → 3/3');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 18, '2 obrażenia bojowe');
});

test('B51: Akroan Sergeant — renown NIE powtarza się (drugie uderzenie bez licznika)', () => {
  const state = game('p1', 'combat_damage');
  put(state, 'sgt', 'akroan-sergeant', 'p1', 'battlefield');
  unblockedCombat(state, ['sgt']);
  unblockedCombat(state, ['sgt']);
  assert.deepEqual(state.objects.get('sgt').counters, { '+1/+1': 1 },
    'po zostaniu renowned kolejne obrażenia nie dają liczników (CR 702.112a: „if it is not renowned”)');
});

test('B51: Akroan Sergeant — zablokowany atak nie daje renown (obrażenia w stwora)', () => {
  const state = game('p1', 'combat_damage');
  put(state, 'sgt', 'akroan-sergeant', 'p1', 'battlefield');
  put(state, 'bear', 'hill-giant', 'p2', 'battlefield');
  state.combat = {
    attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['sgt'],
    blockers: new Map([['sgt', ['bear']]]), blockedAttackers: new Set(['sgt']),
  };
  resolveCombatDamage(state, 'p2');
  // Asercja po ZDARZENIU: first strike zostawia sgt w grobie (nowe id), więc
  // czytanie `counters` z obiektu nic by nie powiedziało o samym renown.
  const renowned = state.events.filter((e) => e.type === 'creature_became_renowned');
  assert.equal(renowned.length, 0, 'renown odpala się wyłącznie na obrażenia w GRACZA (CR 702.112a)');
});

// =============================================================================
// Thunderstaff — prewencja statyczna + {2},{T}
// =============================================================================

test('B51: Thunderstaff — dane Oracle i oba deskryptory', () => {
  const def = REGISTRY.get('thunderstaff');
  assert.deepEqual(def.types, ['Artifact']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 577);
  assert.equal(def.plan, 'Warhammer Fantasy');
  assert.deepEqual(def.support.limitations, []);
  const staticAbility = def.abilities.find((a) => a.type === 'static');
  assert.deepEqual(staticAbility.preventCombatDamageToController, { amount: 1 }, 'prewencja 1');
  const activated = def.abilities.find((a) => a.type === 'activated');
  assert.deepEqual(activated.cost, { mana: 2, tap: true }, 'koszt {2}, {T}');
  assert.deepEqual(activated.effect, { type: 'buff_attacking_creatures', power: 1, toughness: 0 });
});

test('B51: Thunderstaff — nietapnięty zapobiega 1 obrażeniom bojowym (CR 615.1a)', () => {
  const state = game('p1', 'combat_damage');
  put(state, 'staff', 'thunderstaff', 'p2', 'battlefield');
  put(state, 'atk', 'hill-giant', 'p1', 'battlefield');
  unblockedCombat(state, ['atk']);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 18, '3 obrażenia bojowe − 1 zapobiegnięte = 2 (20 → 18)');
});

test('B51: Thunderstaff — po tapnięciu prewencja gaśnie', () => {
  const state = game('p1', 'combat_damage');
  put(state, 'staff', 'thunderstaff', 'p2', 'battlefield');
  state.objects.set('staff', Object.freeze({ ...state.objects.get('staff'), tapped: true }));
  put(state, 'atk', 'hill-giant', 'p1', 'battlefield');
  unblockedCombat(state, ['atk']);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 17, 'bez prewencji: pełne 3 obrażenia (20 → 17)');
});

test('B51: Thunderstaff — {2}, {T}: atakujące stwory dostają +1/+0 do końca tury', () => {
  const state = game('p1', 'declare_blockers');
  addMana(state, 'p1', 5);
  put(state, 'staff', 'thunderstaff', 'p1', 'battlefield');
  put(state, 'atk', 'hill-giant', 'p1', 'battlefield');
  put(state, 'bench', 'goblin-piker', 'p1', 'battlefield');
  state.combat = { attackingPlayerId: 'p1', attackers: ['atk'], blockers: new Map(), blockedAttackers: new Set() };
  const cmd = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'staff');
  assert.ok(cmd, 'oferta aktywacji {2}, {T}');
  assert.ok(execute(state, cmd).ok);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('atk'), state), 4, 'atakujący 3/3 → 4/3');
  assert.equal(effectivePower(state.objects.get('bench'), state), 2, 'stwór poza walką buffa nie dostaje (CR 611.2c)');
  assert.equal(state.objects.get('staff').tapped, true, 'artefakt został tapnięty kosztem');
});

test('B51: Thunderstaff — NIELEGALNIE: bez 2 many brak oferty aktywacji', () => {
  const state = game('p1', 'declare_blockers');
  put(state, 'staff', 'thunderstaff', 'p1', 'battlefield');
  state.combat = { attackingPlayerId: 'p1', attackers: [], blockers: new Map(), blockedAttackers: new Set() };
  const offered = commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'staff');
  assert.equal(offered.length, 0, 'zdolność kosztuje {2} — bez many nie jest oferowana');
});

// =============================================================================
// Savage Surge — instant: +2/+2 i odkręcenie
// =============================================================================

test('B51: Savage Surge — dane Oracle, timing instant i cel', () => {
  const def = REGISTRY.get('savage-surge');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.artId, 578);
  assert.equal(def.plan, 'Warhammer Fantasy');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.targets, [{ type: 'creature' }]);
  assert.deepEqual(def.spell.effects, [
    { type: 'buff_creature_until_end_of_turn', power: 2, toughness: 2 },
    { type: 'untap_permanent' },
  ]);
});

test('B51: Savage Surge — +2/+2 i odkręcenie zatapniętego stwora', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 5, { colors: ['G'] });
  put(state, 'bear', 'hill-giant', 'p1', 'battlefield', { tapped: true });
  put(state, 'surge', 'savage-surge', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'surge');
  assert.ok(cast, 'oferta rzutu Savage Surge');
  execute(state, cast);
  resolveStack(state);
  const bear = state.objects.get('bear');
  assert.equal(effectivePower(bear, state), 5, '3 + 2 mocy');
  assert.equal(effectiveToughness(bear, state), 5, '3 + 2 wytrzymałości');
  assert.equal(bear.tapped, false, 'stwór został odkręcony („Untap that creature”)');
});

test('B51: Savage Surge — NIELEGALNIE: bez stworów na stole brak oferty rzutu', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 5, { colors: ['G'] });
  put(state, 'surge', 'savage-surge', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'surge');
  assert.ok(!cast, 'cel jest obowiązkowy — bez stwora czaru nie da się rzucić (CR 601.2c)');
});

// =============================================================================
// Kulrath Mystic — trigger na czar MV >= 4
// =============================================================================

test('B51: Kulrath Mystic — dane Oracle i warunek mana value', () => {
  const def = REGISTRY.get('kulrath-mystic');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Elemental', 'Wizard']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 4);
  assert.equal(def.artId, 579);
  assert.equal(def.plan, 'Lorwyn');
  assert.deepEqual(def.support.limitations, []);
  const trigger = def.abilities[0].trigger;
  assert.equal(trigger.event, 'when_you_cast_spell');
  assert.deepEqual(trigger.condition, { spellManaValueAtLeast: 4 }, 'próg MV 4 z Oracle');
  assert.deepEqual(def.abilities[0].effect, {
    type: 'buff_creature_until_end_of_turn', power: 2, toughness: 0, keywords: ['vigilance'],
  });
});

test('B51: Kulrath Mystic — czar MV 4 daje +2/+0 i vigilance do końca tury', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 8, { colors: ['U'] });
  put(state, 'mystic', 'kulrath-mystic', 'p1', 'battlefield');
  put(state, 'big', 'inspiration', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'big');
  assert.ok(cast, 'oferta rzutu Inspiration (MV 4)');
  execute(state, cast);
  resolveStack(state);
  const mystic = state.objects.get('mystic');
  assert.equal(effectivePower(mystic, state), 4, '2 + 2 mocy');
  assert.equal(effectiveToughness(mystic, state), 4, 'wytrzymałość bez zmian (+0)');
  assert.ok(effectiveKeywords(mystic, state).includes('vigilance'), 'vigilance do końca tury');
});

test('B51: Kulrath Mystic — czar MV 1 triggera NIE odpala', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 8, { colors: ['U', 'R'] });
  put(state, 'mystic', 'kulrath-mystic', 'p1', 'battlefield');
  put(state, 'bolt', 'shock', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'bolt');
  assert.ok(cast, 'oferta rzutu Shock (MV 1)');
  execute(state, cast);
  resolveStack(state);
  const mystic = state.objects.get('mystic');
  assert.equal(effectivePower(mystic, state), 2, 'MV 1 nie spełnia progu 4');
  assert.ok(!effectiveKeywords(mystic, state).includes('vigilance'), 'brak vigilance');
});

test('B51: Kulrath Mystic — czar PRZECIWNIKA triggera nie odpala („whenever YOU cast”)', () => {
  const state = game('p1', 'main');
  addMana(state, 'p2', 8, { colors: ['U'] });
  put(state, 'mystic', 'kulrath-mystic', 'p1', 'battlefield');
  put(state, 'theirs', 'inspiration', 'p2', 'hand');
  state.turn.priorityPlayerId = 'p2';
  const cast = commands(state, 'p2').find((c) => c.type === 'cast_spell' && c.objectId === 'theirs');
  assert.ok(cast, 'przeciwnik może rzucić Inspiration');
  execute(state, cast);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('mystic'), state), 2, 'cudzy czar nie buffa mojego stwora');
});
