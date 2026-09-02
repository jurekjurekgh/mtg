// Batch 52 (2026-09-01) — 9 kart z listy właściciela (artId 580–588).
// Dane Oracle: docs/cards/scryfall-*.json (pobrane 2026-09-01).
//
// Karty:
//   - Loporrit Scout (FIN)        → another_creature_enters (youControl) → pump +1/+1
//   - Ulna Alley Shopkeep (SOS)   → menace + Infusion (zysk życia w turze → +2/+0)
//   - Vaan, Street Thief (FIN)    → combat damage podtypów → exile wierzchu + may cast /
//                                   Treasure; rzut cudzego czaru → +1/+1 na podtypy
//   - Kill Shot (KTK)             → instant: zniszcz atakującego stwora
//   - Merfolk Falconer (ZNR)      → you_cast_kicked_spell → scry 2
//   - Jolrael, Mwonvuli Recluse (MKC) → drugi dobór → 2/2 Cat; bazowe X/X (X = ręka)
//   - Fourth Bridge Prowler (AER) → ETB „you may” -1/-1 na cel
//   - Leonin Surveyor (DFT)       → start engines; first strike w twojej turze;
//                                   max speed {3} exile z grobu → dobierz
//   - Cemetery Recruitment (EMN)  → zwrot stwora z grobu; Zombie → dobierz
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { drawPlayerCards } from '../src/engine/effects.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 52, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/** Prosty syntetyczny stwór (testy walki/podtypów). */
function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, subtypes = [], keywords = [], abilities = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities, keywords,
    subtypes, types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function commands(state, playerId = 'p1') {
  return playerView(state, playerId).legalCommands;
}

function resolveStack(state, limit = 24) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId)
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

/** Rozstrzyga walkę: p1 atakuje bez bloków — obrażenia w gracza p2. */
function attackUnblocked(state, attackerIds, defendingPlayerId = 'p2') {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // okno obrońcy (CR 509.4)
  return execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId });
}

function byCard(state, cardId, controllerId = null) {
  return [...state.objects.values()]
    .find((o) => o.cardId === cardId && (controllerId == null || o.controllerId === controllerId));
}

// =============================================================================
// Loporrit Scout (FIN) — another_creature_enters → +1/+1 do końca tury
// =============================================================================

test('B52: Loporrit Scout — dane Oracle i deskryptor triggera', () => {
  const def = REGISTRY.get('loporrit-scout');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Rabbit', 'Scout']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 580);
  assert.equal(def.plan, 'Final Fantasy');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.match(def.oracleText, /^Whenever another creature you control enters, this creature gets \+1\/\+1 until end of turn\.$/);
  const trigger = def.abilities[0].trigger;
  assert.equal(trigger.event, 'another_creature_enters');
  assert.equal(trigger.youControl, true, 'tylko stwor kontrolera (another + you control)');
});

test('B52: Loporrit Scout — wejście INNEGO stwora daje +1/+1 do końca tury', () => {
  const state = game();
  addMana(state, 'p1', 2, { colors: ['G'] });
  put(state, 'scout', 'loporrit-scout', 'p1');
  put(state, 'newbie', 'highland-game', 'p1', 'hand');
  // Rzut stwora (normalny pipeline) generuje permanent_entered_battlefield —
  // wejście INNEGO stwora kontrolera odpala trigger Scouta.
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'newbie' }).ok);
  resolveStack(state);
  const scout = state.objects.get('scout');
  assert.equal(effectivePower(scout, state), 4, '3/2 + 1 moc');
  assert.equal(effectiveToughness(scout, state), 3, '2 + 1 wytrzymałość');
});

test('B52: Loporrit Scout — cudzy stwór NIE odpala triggera (you control)', () => {
  const state = game();
  put(state, 'scout', 'loporrit-scout', 'p1');
  addSimpleCreature(state, 'enemy', 'p2', { power: 1, toughness: 1 });
  resolveStack(state);
  const scout = state.objects.get('scout');
  assert.equal(effectivePower(scout, state), 3, 'brak premii za wejście cudzego stwora');
});

// =============================================================================
// Ulna Alley Shopkeep (SOS) — menace + Infusion
// =============================================================================

test('B52: Ulna Alley Shopkeep — dane Oracle, menace i warunek Infusion', () => {
  const def = REGISTRY.get('ulna-alley-shopkeep');
  assert.deepEqual(def.subtypes, ['Goblin', 'Warlock']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 3);
  assert.equal(def.artId, 581);
  assert.equal(def.plan, 'Arcavios');
  assert.deepEqual(def.keywords, ['menace']);
  const ability = def.abilities[0];
  assert.equal(ability.type, 'static');
  assert.deepEqual(ability.condition, { gainedLifeThisTurn: true });
  assert.deepEqual(ability.pump, { power: 2, toughness: 0 });
});

test('B52: Ulna Alley Shopkeep — menace widoczny w keywordach', () => {
  const state = game();
  const shop = put(state, 'shop', 'ulna-alley-shopkeep', 'p1');
  assert.ok(effectiveKeywords(shop, state).includes('menace'));
});

test('B52: Ulna Alley Shopkeep — Infusion: po zyskaniu życia w turze +2/+0', () => {
  const state = game();
  const shop = put(state, 'shop', 'ulna-alley-shopkeep', 'p1');
  assert.equal(effectivePower(shop, state), 2, 'bez zyskanego życia — brak premii');
  // Zyskanie życia w bieżącej turze (zmiana lifeGainedThisTurn — choke point changeLife).
  state.lifeGainedThisTurn = { p1: 3 };
  assert.equal(effectivePower(shop, state), 4, 'Infusion +2/+0 po zyskaniu życia w turze');
  assert.equal(effectiveToughness(shop, state), 3, 'Infusion nie zmienia wytrzymałości');
});

// =============================================================================
// Vaan, Street Thief (FIN) — exile wierzchu + may cast / Treasure + liczniki
// =============================================================================

test('B52: Vaan — dane Oracle i oba triggery', () => {
  const def = REGISTRY.get('vaan-street-thief');
  assert.deepEqual(def.types, ['Legendary', 'Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Scout']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.artId, 582);
  assert.equal(def.plan, 'Final Fantasy');
  assert.equal(def.abilities[0].trigger.event, 'any_combat_damage_to_player');
  assert.deepEqual(def.abilities[0].trigger.subtypes, ['Scout', 'Pirate', 'Rogue']);
  assert.equal(def.abilities[1].trigger.event, 'you_cast_spell_you_dont_own');
});

test('B52: Vaan — combat damage podtypu wygania wierzch; rezygnacja tworzy Skarb', () => {
  const state = game();
  put(state, 'vaan', 'vaan-street-thief', 'p1');
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2, subtypes: ['Scout'] });
  // Wierzch biblioteki p2 (pierwszy element listy) — znana karta.
  put(state, 'top', 'highland-game', 'p2', 'library');
  state.zones.library = ['top', ...state.zones.library.filter((id) => id !== 'top')];

  const combat = attackUnblocked(state, ['atk']);
  assert.ok(combat.ok, combat.events[0]?.reason);
  resolveStack(state); // trigger Vaana → exile wierzchu → pendingExileCast

  const exiled = byCard(state, 'highland-game');
  assert.ok(exiled && exiled.zone === 'exile', 'wierzch biblioteki poszkodowanego wygnany');
  assert.ok(state.pendingExileCast, 'blokująca decyzja rzut-albo-Skarb');

  const decline = commands(state).find((c) => c.type === 'resolve_exile_cast' && c.cast === false);
  assert.ok(decline, 'oferta rezygnacji');
  assert.ok(execute(state, decline).ok);
  const treasure = [...state.objects.values()].find((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield');
  assert.ok(treasure, 'rezygnacja tworzy Skarb');
  assert.equal(state.pendingExileCast, null, 'decyzja rozstrzygnięta');
});

test('B52: Vaan — rzut wygnanej cudzej karty daje +1/+1 na Scouty (you don\'t own)', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['G'] });
  put(state, 'vaan', 'vaan-street-thief', 'p1');
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2, subtypes: ['Scout'] });
  put(state, 'top', 'highland-game', 'p2', 'library');
  state.zones.library = ['top', ...state.zones.library.filter((id) => id !== 'top')];

  attackUnblocked(state, ['atk']);
  resolveStack(state);
  assert.ok(state.pendingExileCast, 'decyzja rzut-albo-Skarb otwarta');

  const cast = commands(state).find((c) => c.type === 'resolve_exile_cast' && c.cast === true);
  assert.ok(cast, 'oferta rzutu (wystarczy many {1}{G})');
  assert.ok(execute(state, cast).ok);
  resolveStack(state); // trigger „you cast a spell you don't own" → +1/+1; potem czar

  const vaan = state.objects.get('vaan');
  assert.equal(vaan.counters?.['+1/+1'], 1, 'licznik +1/+1 na Vaana (Scout)');
  const scout = state.objects.get('atk');
  assert.equal(scout.counters?.['+1/+1'], 1, 'licznik +1/+1 na Scouta');
  const castHighland = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'battlefield');
  assert.ok(castHighland, 'rzucona karta weszła na pole bitwy');
  assert.equal(castHighland.controllerId, 'p1', 'kontrolerem rzutu jest gracz, który go rzucił');
  assert.equal(castHighland.ownerId, 'p2', 'właścicielem zostaje pierwotny gracz');
});

// =============================================================================
// Kill Shot (KTK) — instant: zniszcz atakującego
// =============================================================================

test('B52: Kill Shot — dane Oracle, timing i cel', () => {
  const def = REGISTRY.get('kill-shot');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 583);
  assert.equal(def.plan, 'Tarkir');
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.targets, [{ type: 'attacking_creature' }]);
  assert.deepEqual(def.spell.effects, [{ type: 'destroy_permanent' }]);
});

test('B52: Kill Shot — niszczy atakującego stwora', () => {
  const state = game('p1', 'declare_blockers');
  addMana(state, 'p1', 3, { colors: ['W'] });
  addSimpleCreature(state, 'foe', 'p2', { power: 3, toughness: 3 });
  state.combat = {
    attackingPlayerId: 'p2', defendersPlayerId: 'p1',
    attackers: ['foe'], blockers: new Map(), blockedAttackers: new Set(),
  };
  put(state, 'shot', 'kill-shot', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'shot');
  assert.ok(cast, 'Kill Shot oferowany w walce na atakującego');
  assert.deepEqual(cast.targets, ['foe'], 'jedyny legalny cel: atakujący stwór');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(!state.objects.get('foe') || state.objects.get('foe').zone !== 'battlefield', 'atakujący zniszczony');
});

test('B52: Kill Shot — NIELEGALNIE: bez atakujących brak celu', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 3, { colors: ['W'] });
  put(state, 'shot', 'kill-shot', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'shot');
  assert.ok(!cast, 'poza walką (brak atakujących) czaru nie da się rzucić — CR 508.1k');
});

// =============================================================================
// Merfolk Falconer (ZNR) — you_cast_kicked_spell → scry 2
// =============================================================================

test('B52: Merfolk Falconer — dane Oracle, flying i trigger kickera', () => {
  const def = REGISTRY.get('merfolk-falconer');
  assert.deepEqual(def.subtypes, ['Merfolk', 'Wizard']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.power, 4);
  assert.equal(def.toughness, 4);
  assert.equal(def.artId, 584);
  assert.equal(def.plan, 'Zendikar');
  assert.deepEqual(def.keywords, ['flying']);
  assert.equal(def.abilities[0].trigger.event, 'you_cast_kicked_spell');
  assert.deepEqual(def.abilities[0].effect, { type: 'scry', amount: 2 });
});

test('B52: Merfolk Falconer — rzucony kickerem czar daje scry 2', () => {
  const state = game();
  addMana(state, 'p1', 6, { colors: ['W'] });
  put(state, 'falconer', 'merfolk-falconer', 'p1');
  put(state, 'art', 'seers-lantern', 'p2'); // cel ETB Kor Sanctifiers (inaczej trigger bez celu)
  put(state, 'kor', 'kor-sanctifiers', 'p1', 'hand');
  // Biblioteka p1 z 2 kartami — scry 2 musi mieć w co zajrzeć (inaczej brak decyzji).
  state.zones.library = [];
  put(state, 'l1', 'highland-game', 'p1', 'library');
  put(state, 'l2', 'highland-game', 'p1', 'library');
  // Kor Sanctifiers {2}{W} + kicker {W} = 4 many; kicked → trigger Falconera.
  const kicked = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kor', kicked: true });
  assert.ok(kicked.ok, kicked.events[0]?.reason);
  resolveStack(state);
  assert.ok(state.pendingScry, 'scry 2 otwarte po rzucie z kickerem');
  assert.equal(state.pendingScry.objectIds.length, 2, 'scry zagląda w 2 karty');
});

test('B52: Merfolk Falconer — zwykły rzut (bez kickera) nie daje scry', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  put(state, 'falconer', 'merfolk-falconer', 'p1');
  put(state, 'kor', 'kor-sanctifiers', 'p1', 'hand');
  const plain = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kor' });
  assert.ok(plain.ok, plain.events[0]?.reason);
  resolveStack(state);
  assert.ok(!state.pendingScry, 'bez kickera scry nie odpala');
});

// =============================================================================
// Jolrael, Mwonvuli Recluse (MKC) — drugi dobór → Cat; bazowe X/X
// =============================================================================

test('B52: Jolrael — dane Oracle i deskryptory', () => {
  const def = REGISTRY.get('jolrael-mwonvuli-recluse');
  assert.deepEqual(def.subtypes, ['Human', 'Druid']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 2);
  assert.equal(def.artId, 585);
  assert.equal(def.plan, 'Dominaria');
  assert.equal(def.abilities[0].trigger.event, 'you_draw_second_card_each_turn');
  assert.equal(def.abilities[0].effect[0].type, 'create_token');
  assert.equal(def.abilities[0].effect[0].cardId, 'token_cat');
  assert.equal(def.abilities[1].type, 'activated');
  assert.deepEqual(def.abilities[1].cost, { mana: 6, colors: ['G', 'G'] });
});

test('B52: Jolrael — drugi dobór w turze tworzy 2/2 Cat', () => {
  const state = game();
  put(state, 'jolrael', 'jolrael-mwonvuli-recluse', 'p1');
  state.zones.library = [];
  put(state, 'l1', 'highland-game', 'p1', 'library');
  put(state, 'l2', 'highland-game', 'p1', 'library');
  put(state, 'l3', 'highland-game', 'p1', 'library');
  // Pierwszy dobór (licznik = 1) — trigger nie odpala.
  drawPlayerCards(state, 'p1', 1, 'effect');
  // Drugi dobór (licznik = 2) — odpala trigger.
  const before = state.events.length;
  drawPlayerCards(state, 'p1', 1, 'effect');
  processTriggers(state, state.events.slice(before));
  resolveStack(state);
  const cat = [...state.objects.values()].find((o) => o.cardId === 'token_cat' && o.zone === 'battlefield');
  assert.ok(cat, 'token Cat 2/2 powstał po drugim doborze');
  assert.equal(cat.power, 2);
  assert.equal(cat.toughness, 2);
  assert.deepEqual(cat.colors, ['G']);
});

test('B52: Jolrael — aktywowana zdolność: bazowe X/X (X = karty w ręce)', () => {
  const state = game();
  addMana(state, 'p1', 6, { colors: ['G', 'G'] });
  put(state, 'jolrael', 'jolrael-mwonvuli-recluse', 'p1');
  addSimpleCreature(state, 'bear', 'p1', { power: 2, toughness: 2 });
  put(state, 'h1', 'highland-game', 'p1', 'hand');
  put(state, 'h2', 'highland-game', 'p1', 'hand');
  put(state, 'h3', 'highland-game', 'p1', 'hand');
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'jolrael');
  assert.ok(act, 'zdolność {4}{G}{G} oferowana');
  assert.ok(execute(state, act).ok);
  resolveStack(state);
  const bear = state.objects.get('bear');
  assert.equal(effectivePower(bear, state), 3, 'X = 3 karty w ręce → bazowe 3/3');
  assert.equal(effectiveToughness(bear, state), 3, 'bazowa wytrzymałość 3');
});

// =============================================================================
// Fourth Bridge Prowler (AER) — ETB „you may” -1/-1
// =============================================================================

test('B52: Fourth Bridge Prowler — dane Oracle i deskryptor triggera', () => {
  const def = REGISTRY.get('fourth-bridge-prowler');
  assert.deepEqual(def.subtypes, ['Human', 'Rogue']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 1);
  assert.equal(def.artId, 586);
  assert.equal(def.plan, 'Kaladesh');
  const trigger = def.abilities[0].trigger;
  assert.equal(trigger.event, 'enter_battlefield');
  assert.deepEqual(trigger.requiresTarget, { type: 'creature', optional: true }, 'cel opcjonalny (you may)');
  assert.deepEqual(def.abilities[0].effect, { type: 'buff_creature_until_end_of_turn', power: -1, toughness: -1 });
});

test('B52: Fourth Bridge Prowler — ETB nakłada -1/-1 na wybranego stwora', () => {
  const state = game();
  addMana(state, 'p1', 1, { colors: ['B'] });
  addSimpleCreature(state, 'foe', 'p2', { power: 4, toughness: 4 });
  put(state, 'prowler', 'fourth-bridge-prowler', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'prowler' }).ok);
  resolveStack(state); // zatrzymuje się na decyzji celu triggera
  const pend = state.pendingTriggerTargets.find((p) => p.cardId === 'fourth-bridge-prowler');
  assert.ok(pend, 'trigger czeka na wybór celu (you may)');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'foe' }).ok);
  resolveStack(state); // rozstrzygnij trigger → -1/-1 do końca tury
  const foe = state.objects.get('foe');
  assert.equal(effectivePower(foe, state), 3, '4 - 1 mocy');
  assert.equal(effectiveToughness(foe, state), 3, '4 - 1 wytrzymałości');
});

test('B52: Fourth Bridge Prowler — „you may": odmowa celu = brak efektu', () => {
  const state = game();
  addMana(state, 'p1', 1, { colors: ['B'] });
  addSimpleCreature(state, 'foe', 'p2', { power: 4, toughness: 4 });
  put(state, 'prowler', 'fourth-bridge-prowler', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'prowler' }).ok);
  resolveStack(state);
  // Cel opcjonalny — odmowa (targetId null) zostawia stwora nietkniętego.
  const pend = state.pendingTriggerTargets.find((p) => p.cardId === 'fourth-bridge-prowler');
  if (pend) {
    assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: null }).ok);
    resolveStack(state);
  }
  assert.equal(effectivePower(state.objects.get('foe'), state), 4, 'bez wyboru celu stwór nietknięty');
});

// =============================================================================
// Leonin Surveyor (DFT) — start engines, first strike, max speed
// =============================================================================

test('B52: Leonin Surveyor — dane Oracle i trzy zdolności', () => {
  const def = REGISTRY.get('leonin-surveyor');
  assert.deepEqual(def.subtypes, ['Cat', 'Scout']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.artId, 587);
  assert.equal(def.plan, 'Alara');
  assert.equal(def.abilities[0].effect[0].type, 'start_engines');
  assert.deepEqual(def.abilities[1].condition, { activePlayerIsController: true });
  assert.deepEqual(def.abilities[1].keywords, ['first_strike']);
  const grave = def.abilities[2];
  assert.equal(grave.fromGraveyard, true);
  assert.deepEqual(grave.condition, { maxSpeed: true });
});

test('B52: Leonin Surveyor — ETB startuje speed (1), first strike tylko w twojej turze', () => {
  const state = game('p1');
  addMana(state, 'p1', 2, { colors: ['W'] });
  put(state, 'leonin', 'leonin-surveyor', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'leonin' }).ok);
  resolveStack(state); // ETB start_engines
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.speed, 1, 'speed startuje od 1');
  const leonin = byCard(state, 'leonin-surveyor', 'p1');
  assert.ok(effectiveKeywords(leonin, state).includes('first_strike'), 'first strike w turze kontrolera');
  // Tura przeciwnika — first strike znika (activePlayerIsController = false).
  state.turn.activePlayerId = 'p2';
  assert.ok(!effectiveKeywords(leonin, state).includes('first_strike'), 'brak first strike w turze przeciwnika');
});

test('B52: Leonin Surveyor — max speed: {3} exile z grobu dobiera kartę', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const p1 = state.players.find((p) => p.id === 'p1');
  p1.speed = 4; // max speed
  put(state, 'leonin', 'leonin-surveyor', 'p1', 'graveyard');
  state.zones.library = [];
  put(state, 'l1', 'highland-game', 'p1', 'library');
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'leonin');
  assert.ok(act, 'zdolność z grobu oferowana przy max speed');
  assert.ok(execute(state, act).ok);
  resolveStack(state);
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'leonin-surveyor' && o.zone === 'exile');
  assert.ok(exiled, 'Leonin wygnany z grobu jako koszt');
  const hand = [...state.objects.values()].filter((o) => o.cardId === 'highland-game' && o.zone === 'hand');
  assert.equal(hand.length, 1, 'dobrano kartę');
});

test('B52: Leonin Surveyor — NIELEGALNIE: bez max speed brak oferty z grobu', () => {
  const state = game('p1', 'main');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const p1 = state.players.find((p) => p.id === 'p1');
  p1.speed = 1;
  put(state, 'leonin', 'leonin-surveyor', 'p1', 'graveyard');
  const act = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'leonin');
  assert.ok(!act, 'przy speed < 4 zdolność z grobu nieaktywna');
});

// =============================================================================
// Cemetery Recruitment (EMN) — zwrot stwora; Zombie → dobierz
// =============================================================================

test('B52: Cemetery Recruitment — dane Oracle i deskryptor efektu', () => {
  const def = REGISTRY.get('cemetery-recruitment');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['B']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.artId, 588);
  assert.equal(def.plan, 'Innistrad');
  assert.equal(def.spell.timing, 'sorcery');
  assert.deepEqual(def.spell.targets, [{ type: 'creature_card_in_graveyard' }]);
  assert.deepEqual(def.spell.effects, [{
    type: 'return_card_from_graveyard_to_hand', cardKind: 'creature', drawIfSubtypes: ['Zombie'],
  }]);
});

test('B52: Cemetery Recruitment — zwraca stwora z grobu do ręki', () => {
  const state = game();
  addMana(state, 'p1', 2, { colors: ['B'] });
  put(state, 'grave', 'highland-game', 'p1', 'graveyard');
  put(state, 'recruit', 'cemetery-recruitment', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'recruit');
  assert.ok(cast, 'czar oferowany (cel: karta stwora w grobie)');
  assert.deepEqual(cast.targets, ['grave'], 'jedyny legalny cel');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const hand = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'hand');
  assert.ok(hand, 'stwór wrócił z grobu do ręki');
});

test('B52: Cemetery Recruitment — Zombie dodatkowo daje dobranie', () => {
  const state = game();
  addMana(state, 'p1', 2, { colors: ['B'] });
  put(state, 'zombie', 'mournful-zombie', 'p1', 'graveyard'); // Zombie
  state.zones.library = [];
  put(state, 'l1', 'highland-game', 'p1', 'library');
  put(state, 'recruit', 'cemetery-recruitment', 'p1', 'hand');
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'recruit');
  assert.ok(cast && cast.targets.includes('zombie'), 'Zombie w grobie jest legalnym celem');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const zombieBack = [...state.objects.values()].find((o) => o.cardId === 'mournful-zombie' && o.zone === 'hand');
  assert.ok(zombieBack, 'Zombie wrócił do ręki');
  const drawn = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'hand');
  assert.ok(drawn, 'podtyp Zombie → dodatkowe dobranie');
});
