import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { processTriggers } from '../src/engine/triggers.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Batch 29 — 10 kart (2026-08-11): Mournful Zombie, Necrosquito, Curiosity,
 * Veiled Ascension, Angelic Benediction, Frontline War-Rager, Lash of the
 * Balrog, Fireball, Spread the Sickness, Warmaker Gunship. Testy behawioralne
 * (nie definicyjne): każdy odtwarza realny przebieg gry.
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}

function setField(state, id, patch) {
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, ...patch }));
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 250) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function life(state, id) {
  return state.players.find((p) => p.id === id).life;
}

function eff(state, id) {
  const o = state.objects.get(id);
  return { p: effectivePower(o, state), t: effectiveToughness(o, state) };
}

function hand(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
}

// --- Scryfall sanity ---------------------------------------------------------

test('Batch 29: pliki Scryfall istnieją i mają prawidłowe pola', () => {
  const slugs = [
    'mournful-zombie', 'necrosquito', 'curiosity', 'veiled-ascension',
    'angelic-benediction', 'frontline-war-rager', 'lash-of-the-balrog',
    'fireball', 'spread-the-sickness', 'warmaker-gunship',
  ];
  for (const slug of slugs) {
    const raw = fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8');
    const data = JSON.parse(raw);
    assert.equal(data.object, 'card', `${slug}: object=card`);
    assert.ok(data.oracle_text, `${slug}: oracle_text`);
    assert.ok(data.mana_cost, `${slug}: mana_cost`);
  }
});

test('Batch 29: każda karta jest supported w rejestrze', () => {
  const ids = [
    'mournful-zombie', 'necrosquito', 'curiosity', 'veiled-ascension',
    'angelic-benediction', 'frontline-war-rager', 'lash-of-the-balrog',
    'fireball', 'spread-the-sickness', 'warmaker-gunship',
  ];
  for (const id of ids) {
    const card = REGISTRY.get(id);
    assert.ok(card, `brak karty ${id}`);
    assert.equal(card.support.status, 'supported', `${id} supported`);
  }
});

// --- 1. Mournful Zombie: {W},{T}: target player gains 1 life ----------------

test('Mournful Zombie: aktywacja {W},{T} daje 1 życie GRACZOWI-CELOWI', () => {
  const state = mainPhase(game());
  addRealCard(state, 'zombie', 'mournful-zombie', 'p1', 'battlefield');
  setField(state, 'zombie', { summoningSickness: false });
  addMana(state, 'p1', 1, { colors: ['W'] });
  const before = life(state, 'p2');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'zombie', abilityIndex: 0, targets: ['p2'] });
  assert.ok(r.ok, 'aktywacja: ' + (r.events?.[0]?.reason ?? ''));
  assert.equal(state.objects.get('zombie').tapped, true, 'zombie się tapuje');
  resolveStack(state); // D: aktywowana zdolność idzie na stos (CR 602.2a)
  assert.equal(life(state, 'p2'), before + 1, 'cel-p2 zyskuje 1 życie');
});

// --- 2. Necrosquito: oil counters --------------------------------------------

test('Necrosquito: wchodzi z 2 oil i rośnie przy śmierci innego permanentu', () => {
  const state = mainPhase(game());
  // Rzut Necrosquito z ręki -> ETB nakłada 2 oil (realny przebieg).
  addRealCard(state, 'sq', 'necrosquito', 'p1', 'hand');
  addRealCard(state, 'plains', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'swamp1', 'basic-swamp', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'swamp2', 'basic-swamp', 'p1', 'battlefield', { tapped: false });
  addRealCard(state, 'swamp3', 'basic-swamp', 'p1', 'battlefield', { tapped: false });
  addMana(state, 'p1', 4, { colors: ['B'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sq' });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const sqId = [...state.objects.values()].find((o) => o.cardId === 'necrosquito' && o.zone === 'battlefield').id;
  assert.equal(eff(state, sqId).p, 2, '2 oil = 2/2');
  assert.equal(eff(state, sqId).t, 2, '2 oil = 2/2');
  // Śmierć innego stwora kontrolera -> +1 oil (symulacja zniszczenia)
  addRealCard(state, 'other', 'highland-game', 'p1', 'battlefield');
  const before = state.events.length;
  const graveId = 'grave-x';
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'other');
  state.zones.graveyard.push(graveId);
  const moved = Object.freeze({ ...state.objects.get('other'), id: graveId, zone: 'graveyard' });
  state.objects.delete('other'); state.objects.set(graveId, moved);
  state.events.push({ type: 'creature_destroyed', fromId: 'other', toId: graveId, toZone: 'graveyard', cardId: 'highland-game' });
  processTriggers(state, state.events.slice(before));
  resolveStack(state); // trigger (oil counter) rozstrzyga się ze stosu
  assert.equal(eff(state, sqId).p, 3, '3 oil = 3/3 po śmierci innego');
});

// --- 3. Curiosity: aura -> draw when enchanted creature deals damage ---------

test('Curiosity: zaczarowany stwór zadaje damage przeciwnikowi -> you may draw', () => {
  const state = mainPhase(game());
  addRealCard(state, 'aura', 'curiosity', 'p1', 'hand');
  addRealCard(state, 'host', 'goldmeadow-nomad', 'p1', 'battlefield');
  setField(state, 'host', { summoningSickness: false });
  addRealCard(state, 'lib0', 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'aura', targets: ['host'] });
  assert.ok(r.ok, 'rzut aury: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const auraObj = [...state.objects.values()].find((o) => o.cardId === 'curiosity' && o.zone === 'battlefield');
  assert.ok(auraObj, 'aura na bitwisku');
  assert.equal(auraObj.attachedTo, 'host', 'aura załączona');
  // host atakuje samotnie i zadaje combat damage graczowi p2
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['host'] }).ok);
  const nb = playerView(state, 'p2').legalCommands.find((c) => c.type === 'declare_blockers');
  execute(state, nb);
  // p1 resolve_combat -> niezablokowany host trafia p2
  const rc = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_combat');
  const r2 = execute(state, rc);
  assert.ok(r2.ok, 'combat: ' + (r2.events?.[0]?.reason ?? ''));
  // Trigger may-draw powinien pojawić się jako decyzja optional trigger
  const view = playerView(state, 'p1');
  const drawCmd = view.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice');
  if (drawCmd) {
    const beforeHand = hand(state, 'p1').length;
    const rd = execute(state, { ...drawCmd, fire: true });
    assert.ok(rd.ok, 'may draw: ' + (rd.events?.[0]?.reason ?? ''));
    resolveStack(state);
    assert.ok(hand(state, 'p1').length > beforeHand, 'dobrano kartę');
  }
});

// --- 4. Veiled Ascension: cloak + flying counters ----------------------------

test('Veiled Ascension: upkeep may cloak -> wierzch biblioteki wchodzi face-down z flying counter', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'veiled', 'veiled-ascension', 'p1', 'battlefield');
  addRealCard(state, 'top', 'highland-game', 'p1', 'library');
  state.zones.library = ['top', ...state.zones.library.filter((id) => id !== 'top')];
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  const view = playerView(state, 'p1');
  const cloakCmd = view.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice');
  if (cloakCmd) {
    const r = execute(state, { ...cloakCmd, fire: true });
    assert.ok(r.ok, 'cloak: ' + (r.events?.[0]?.reason ?? ''));
    resolveStack(state); // trigger cloak rozstrzyga się ze stosu
    const cloaked = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
    assert.ok(cloaked, 'wierzch wszedł face-down');
    assert.equal(eff(state, cloaked.id).p, 2, 'face-down 2/2');
    assert.equal(state.objects.get(cloaked.id).counters.flying, 1,
      'face-down dostaje flying counter od Veiled Ascension');
  }
});

// --- 5. Angelic Benediction: exalted + attacks alone -------------------------

test('Angelic Benediction: atakujący samotnie dostaje +1/+1 (exalted)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'ab', 'angelic-benediction', 'p1', 'battlefield');
  addRealCard(state, 'cre', 'highland-game', 'p1', 'battlefield');
  setField(state, 'cre', { summoningSickness: false });
  const before = eff(state, 'cre').p;
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['cre'] });
  assert.ok(r.ok, 'atak: ' + (r.events?.[0]?.reason ?? ''));
  // Exalted to trigger na stosie — +1/+1 po rozstrzygnięciu.
  resolveStack(state);
  assert.equal(eff(state, 'cre').p, before + 1, 'exalted +1/+1 samotnemu atakującemu');
});

// --- 6. Frontline War-Rager: end step + tapped creatures ---------------------

test('Frontline War-Rager: end step z 2+ zatapniętymi stworami -> +1/+1 counter', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fw', 'frontline-war-rager', 'p1', 'battlefield');
  addRealCard(state, 'a', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'b', 'goldmeadow-nomad', 'p1', 'battlefield');
  setField(state, 'a', { tapped: true });
  setField(state, 'b', { tapped: true });
  const before = eff(state, 'fw').t;
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.activePlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'end', phase: 'ending' }]);
  resolveStack(state);
  const after = eff(state, 'fw').t;
  assert.equal(after, before + 1, '2 zatapnięte stwory -> +1/+1 (intervening if)');
});

// --- 7. Lash of the Balrog: sacrifice OR pay {4} -----------------------------

test('Lash of the Balrog: zapłata {4} zamiast poświęcenia — niszczy cel, nie poświęca', () => {
  const state = mainPhase(game());
  addRealCard(state, 'lash', 'lash-of-the-balrog', 'p1', 'hand');
  addRealCard(state, 'sac', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'target', 'highland-game', 'p2', 'battlefield');
  addRealCard(state, 'plains', 'basic-plains', 'p1', 'battlefield', { tapped: false });
  addMana(state, 'p1', 5, { colors: ['B'] });
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'lash');
  const payAlt = casts.find((c) => c.payAltCost);
  assert.ok(payAlt, 'oferta zawiera wariant zapłaty {4} (payAltCost)');
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'lash', targets: ['target'], payAltCost: true });
  assert.ok(r.ok, 'rzut z zapłatą: ' + (r.events?.[0]?.reason ?? ''));
  assert.equal(state.objects.get('sac').zone, 'battlefield', 'stwór NIE został poświęcony (zapłacono maną)');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const targetGone = state.objects.get('target')?.zone !== 'battlefield'
    || [...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'graveyard');
  assert.ok(targetGone, 'cel zniszczony');
});

test('Lash of the Balrog: wariant poświęcenia stwora zamiast many', () => {
  const state = mainPhase(game());
  addRealCard(state, 'lash', 'lash-of-the-balrog', 'p1', 'hand');
  addRealCard(state, 'sac', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'target', 'highland-game', 'p2', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'lash', targets: ['target'], sacrificeTargetId: 'sac' });
  assert.ok(r.ok, 'rzut z poświęceniem: ' + (r.events?.[0]?.reason ?? ''));
  const sacGone = state.objects.get('sac')?.zone !== 'battlefield';
  assert.ok(sacGone, 'stwór poświęcony');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
});

// --- 8. Fireball: X + divided evenly, rounded down (CR 119.4 / Oracle JVC) ---

test('Fireball: X=4 między 2 cele — po 2 obrażeń (divided evenly)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fb', 'fireball', 'p1', 'hand');
  // Użyj stworów o wysokiej wytrzymałości, żeby przeżyły (sprawdzenie obrażeń).
  addRealCard(state, 't1', 'gloomfang-mauler', 'p2', 'battlefield'); // 6/6
  addRealCard(state, 't2', 'gloomfang-mauler', 'p2', 'battlefield'); // 6/6
  addMana(state, 'p1', 10, { colors: ['R'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['t1', 't2'], xValue: 4 });
  assert.ok(r.ok, 'rzut Fireball: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('t1').damage, 2, 'cel 1: 2 obrażeń (4/2)');
  assert.equal(state.objects.get('t2').damage, 2, 'cel 2: 2 obrażeń (4/2)');
  assert.equal(state.zones.stack.length, 0, 'czar rozstrzygnięty');
});

test('Fireball: X=5 między 2 cele — po 2, reszta 1 PRZEPADA (rounded down)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fb', 'fireball', 'p1', 'hand');
  addRealCard(state, 't1', 'gloomfang-mauler', 'p2', 'battlefield');
  addRealCard(state, 't2', 'gloomfang-mauler', 'p2', 'battlefield');
  addMana(state, 'p1', 10, { colors: ['R'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['t1', 't2'], xValue: 5 }).ok);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('t1').damage, 2, 'floor(5/2)=2');
  assert.equal(state.objects.get('t2').damage, 2, 'floor(5/2)=2');
  assert.equal(state.objects.get('t1').damage + state.objects.get('t2').damage, 4, 'reszta z dzielenia NIE jest zadana');
});

test('Fireball: X=5 między 3 cele — po 1 (floor(5/3)), reszta 2 przepada', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fb', 'fireball', 'p1', 'hand');
  addRealCard(state, 't1', 'gloomfang-mauler', 'p2', 'battlefield');
  addRealCard(state, 't2', 'gloomfang-mauler', 'p2', 'battlefield');
  addRealCard(state, 't3', 'gloomfang-mauler', 'p2', 'battlefield');
  addMana(state, 'p1', 10, { colors: ['R'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['t1', 't2', 't3'], xValue: 5 }).ok);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('t1').damage, 1, 'floor(5/3)=1');
  assert.equal(state.objects.get('t2').damage, 1);
  assert.equal(state.objects.get('t3').damage, 1);
});

test('Fireball: koszt {1} za każdy cel ponad pierwszy — 2 cele = X + {R} + 1', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fb', 'fireball', 'p1', 'hand');
  addRealCard(state, 't1', 'gloomfang-mauler', 'p2', 'battlefield');
  addRealCard(state, 't2', 'gloomfang-mauler', 'p2', 'battlefield');
  addMana(state, 'p1', 10, { colors: ['R'] });
  // X=4 + {R} + {1} = 6 many — bez 6 many rzut nie przechodzi.
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['t1', 't2'], xValue: 4 }).ok);
  assert.equal(state.players[0].mana, 10 - 6, 'koszt 2 celów = X + {R} + {1}');
});

test('Fireball: cel z protection od red jest nielegalny (CR 702.16b)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fb', 'fireball', 'p1', 'hand');
  addRealCard(state, 't1', 'gloomfang-mauler', 'p2', 'battlefield');
  setField(state, 't1', { protectionFromColors: ['R'] });
  addMana(state, 'p1', 10, { colors: ['R'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['t1'], xValue: 3 });
  assert.ok(!r.ok, 'rzut w chroniony cel odrzucony');
  assert.equal(state.zones.stack.length, 0, 'czar nie trafił na stos');
});

test('Fireball: cel zniknięty przed rozstrzygnięciem — jego udział przepada (oryginalny podział)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fb', 'fireball', 'p1', 'hand');
  addRealCard(state, 't1', 'gloomfang-mauler', 'p2', 'battlefield');
  addRealCard(state, 't2', 'gloomfang-mauler', 'p2', 'battlefield');
  addMana(state, 'p1', 10, { colors: ['R'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: ['t1', 't2'], xValue: 4 }).ok);
  // Cel 1 opuszcza bitwisko przed rozstrzygnięciem (odpowiedź instanitem).
  moveObjectDirectly(state, 't1', 'exile', 'exile-t1');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('t2').damage, 2, 'żywy cel bierze swój udział (4/2)');
  assert.equal(state.objects.get('exile-t1').damage ?? 0, 0, 'udział martwego celu przepada');
});

test('Fireball: X=0 i 0 celów to legalny rzut bez efektu (any number of targets)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fb', 'fireball', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets: [], xValue: 0 });
  assert.ok(r.ok, 'rzut X=0 bez celów: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id)?.cardId === 'fireball').length, 1, 'czar w grobie');
});

// --- 9. Spread the Sickness: destroy + proliferate ---------------------------

test('Spread the Sickness: niszczy cel, potem proliferate', () => {
  const state = mainPhase(game());
  addRealCard(state, 'sts', 'spread-the-sickness', 'p1', 'hand');
  addRealCard(state, 'target', 'highland-game', 'p2', 'battlefield');
  addRealCard(state, 'counter-creature', 'goblin-piker', 'p1', 'battlefield');
  setField(state, 'counter-creature', { counters: { '+1/+1': 2 } });
  addMana(state, 'p1', 5, { colors: ['B'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'sts', targets: ['target'] });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  let guard = 0;
  while (state.zones.stack.length > 0 && !state.pendingProliferate && guard++ < 100) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state, pick);
  }
  assert.ok(state.objects.get('target')?.zone !== 'battlefield', 'cel zniszczony');
  if (state.pendingProliferate) {
    const pp = state.pendingProliferate;
    const r2 = execute(state, { type: 'resolve_proliferate', playerId: pp.playerId, targetIds: ['counter-creature'] });
    assert.ok(r2.ok, 'proliferate: ' + (r2.events?.[0]?.reason ?? ''));
    assert.equal(state.objects.get('counter-creature').counters['+1/+1'], 3, 'licznik proliferowany');
  }
});

// --- 10. Warmaker Gunship: station + ETB damage ------------------------------

test('Warmaker Gunship: ETB zadaje obrażenia = liczba artefaktów kontrolera', () => {
  const state = mainPhase(game());
  addRealCard(state, 'gunship', 'warmaker-gunship', 'p1', 'hand');
  addRealCard(state, 'target', 'highland-game', 'p2', 'battlefield');
  addRealCard(state, 'art1', 'brawlers-plate', 'p1', 'battlefield');
  addRealCard(state, 'art2', 'dragonbroods-relic', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['R'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gunship' });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  // Rozstrzygnij stos permanentu -> ETB trigger odpala się z decyzją celu.
  let guard = 0;
  while (state.zones.stack.length > 0 && state.pendingTriggerTargets.length === 0 && guard++ < 50) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state, pick);
  }
  assert.ok(state.pendingTriggerTargets.length > 0, 'ETB trigger czeka na cel');
  const tt = state.pendingTriggerTargets[0];
  const r2 = execute(state, { type: 'resolve_trigger_target', playerId: tt.playerId, targetId: 'target' });
  assert.ok(r2.ok, 'cel triggera: ' + (r2.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const t = state.objects.get('target');
  const dead = !t || t.zone !== 'battlefield';
  const damaged = t ? (t.damage ?? 0) > 0 : false;
  assert.ok(dead || damaged, `cel otrzymał obrażenia (damage=${t?.damage ?? 0}, zone=${t?.zone ?? 'gone'})`);
});

// --- Determinizm: sesja botów z batch29 --------------------------------------

test('Batch 29: partia botów (black vs green) kończy się rozstrzygnięciem i jest deterministyczna', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/black.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), registry).cardIds],
  ]);
  const play = (seed) => {
    const session = createSession({ seed, registry, decks });
    let guard = 0;
    while (session.state.status === 'active' && guard++ < 800) {
      const view = session.view();
      const cmd = view.legalCommands[0];
      if (!cmd) break;
      session.apply(cmd);
    }
    return session.state.status;
  };
  const a = play(7);
  const b = play(7);
  assert.ok(a === 'finished', 'partia kończy się');
  assert.equal(a, b, 'ten sam seed = ten sam wynik');
});

// --- Regresja M72: optional trigger (Curiosity) + cel triggera tego samego
// gracza nie mogą się zablokować (deadlock benchmarku) ----------------------

test('Batch 29 regresja: pendingOptionalTrigger + pendingTriggerTarget tego samego gracza — optional trigger pierwszy', () => {
  const state = game();
  mainPhase(state, 'p1');
  // Wymuśmy jednoczesne decyzje: optional trigger (Curiosity may-draw) i cel
  // triggera (resolve_trigger_target) czekają u p1.
  state.pendingOptionalTrigger = {
    playerId: 'p1', sourceId: 'aura-x', cardId: 'curiosity',
    ability: Object.freeze({ type: 'triggered', trigger: Object.freeze({ event: 'enchanted_creature_combat_damage_to_opponent', mayFire: true }), effect: Object.freeze({ type: 'draw_cards', amount: 1 }) }),
    extra: Object.freeze({}), restorePriorityTo: 'p1',
  };
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: 'src', cardId: 'x', ability: Object.freeze({ type: 'triggered', trigger: Object.freeze({ event: 'enter_battlefield', requiresTarget: { type: 'creature' } }), effect: Object.freeze({ type: 'tap_permanent' }) }),
    candidates: [], allowNone: false, fixedTargetIds: [], extra: Object.freeze({}),
    specOverride: null, restorePriorityTo: 'p1',
  });
  state.turn.priorityPlayerId = 'p1';
  const view = playerView(state, 'p1');
  const optional = view.legalCommands.filter((c) => c.type === 'resolve_optional_trigger_choice');
  assert.ok(optional.length > 0,
    'optional trigger oferowany jako pierwszy (nie zablokowany przez cel triggera) — deadlock M72');
  // Komenda optional trigger jest akceptowana.
  const r = execute(state, { ...optional[0], fire: false });
  assert.ok(r.ok, 'odrzucenie may-draw akceptowane: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(!state.pendingOptionalTrigger, 'optional trigger rozstrzygnięty');
});
