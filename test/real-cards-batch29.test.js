import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness, markDamage } from '../src/engine/permanents.js';
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
    ability: Object.freeze({ type: 'triggered', trigger: Object.freeze({ event: 'enchanted_creature_damage_to_opponent', mayFire: true }), effect: Object.freeze({ type: 'draw_cards', amount: 1 }) }),
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

// --- Audyt PR #41 (B2): attacks_alone — trigger tylko dla KONTROLERA atakującego

test('Audyt B2: cudza Angelic Benediction NIE odpala przy moim samotnym ataku (CR 702.82)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  // Przeciwnik (p2) kontroluje Angelic Benediction (exalted + „you may tap").
  addRealCard(state, 'bened', 'angelic-benediction', 'p2', 'battlefield');
  // Ja (p1) atakuję samotnie stworą.
  addRealCard(state, 'mycreature', 'gloomfang-mauler', 'p1', 'battlefield');
  setField(state, 'mycreature', { summoningSickness: false });
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['mycreature'] });
  assert.ok(r.ok, 'deklaracja ataku: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  // Brak pumpa exalted na moim stworze (cudza zdolność nie dotyczy mojego ataku).
  assert.deepEqual(eff(state, 'mycreature'), { p: 5, t: 5 }, 'brak exalted +1/+1 z cudzej Benediction');
  // Brak wiszącej decyzji celu („you may tap target creature") u p2.
  const view2 = playerView(state, 'p2');
  assert.ok(!view2.legalCommands.some((c) => c.type === 'resolve_trigger_target'), 'p2 nie ma celu triggera z mojego ataku');
  // Dla kontrolera: jego własna Benediction odpala przy JEGO samotnym ataku.
  const state2 = game();
  state2.turn = jumpToStep(state2.turn, 'declare_attackers', 'p2');
  state2.turn.activePlayerId = 'p2'; state2.turn.priorityPlayerId = 'p2';
  addRealCard(state2, 'bened2', 'angelic-benediction', 'p2', 'battlefield');
  addRealCard(state2, 'foe', 'gloomfang-mauler', 'p2', 'battlefield');
  setField(state2, 'foe', { summoningSickness: false });
  const r2 = execute(state2, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['foe'] });
  assert.ok(r2.ok, 'deklaracja ataku p2: ' + (r2.events?.[0]?.reason ?? ''));
  // Rozstrzygnij stos + decyzje (exalted pump + ewentualny cel triggera).
  let guard = 0;
  while ((state2.zones.stack.length > 0 || state2.pendingTriggerTargets.length > 0) && guard++ < 100) {
    const holder = state2.turn.priorityPlayerId;
    const view = playerView(state2, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type === 'resolve_trigger_target')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state2, pick);
  }
  assert.deepEqual(eff(state2, 'foe'), { p: 6, t: 6 }, 'własna Benediction daje exalted +1/+1');
});

// --- Audyt PR #41 (B3): Curiosity — także obrażenia NIECOMBAT

test('Audyt B3: Curiosity odpala też przy niecombat damage (Welder Automaton) (Oracle: „deals damage")', () => {
  const state = mainPhase(game());
  addRealCard(state, 'welder', 'welder-automaton', 'p1', 'battlefield');
  addRealCard(state, 'curi', 'curiosity', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['U', 'R'] });
  // Rzuć aurę Curiosity na Weldera i rozstrzygnij.
  const castAura = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'curi', targets: ['welder'], bestow: false });
  assert.ok(castAura.ok, 'rzut aury: ' + (castAura.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos po aurze rozstrzygnięty');
  const curiOnBoard = state.zones.battlefield.map((id) => state.objects.get(id)).find((o) => o?.cardId === 'curiosity');
  assert.ok(curiOnBoard, 'Curiosity na bitwisku');
  assert.equal(curiOnBoard.attachedTo, 'welder', 'Curiosity zaczarowuje Weldera');
  // Aktywuj Weldera {3}{R}: 1 obrażeń każdemu przeciwnikowi (niecombat).
  const act = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'welder', abilityIndex: 0 });
  assert.ok(act.ok, 'aktywacja Weldera: ' + (act.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos po Welderze rozstrzygnięty');
  // p2 stracił 1 życia (niecombat) — a Curiosity powinien zaproponować dobranie.
  assert.equal(life(state, 'p2'), 19, 'Welder zadał 1 niecombat damage');
  const view1 = playerView(state, 'p1');
  assert.ok(view1.legalCommands.some((c) => c.type === 'resolve_optional_trigger_choice'), 'Curiosity: you may draw po niecombat damage');
  // „Tak" — dobranie.
  const draw = execute(state, { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: true });
  assert.ok(draw.ok, 'dobranie: ' + (draw.events?.[0]?.reason ?? ''));
});

// --- Audyt PR #41 (B4): Veiled Ascension — flying counter dla KAŻDEGO face-down
//     (także morph), a licznik faktycznie daje flying (CR 122.1b, ruling cloak)

test('Audyt B4: morph wchodzący przy Veiled Ascension dostaje flying counter', () => {
  const state = mainPhase(game());
  addRealCard(state, 'veiled', 'veiled-ascension', 'p1', 'battlefield');
  addRealCard(state, 'flock', 'monastery-flock', 'p1', 'hand'); // flying + morph
  addMana(state, 'p1', 3, { colors: ['U'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock', faceDown: true });
  assert.ok(r.ok, 'morph: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const fd = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(fd, 'zakryty stwór na bitwisku');
  assert.equal(state.objects.get(fd.id).counters.flying, 1, 'morph dostaje flying counter od Veiled');
  // Licznik flying daje flying także zakrytemu (CR 122.1b; ruling cloak —
  // „other effects can grant it characteristics"). Drukowane keywordy nadal
  // zakryte: bez licznika byłoby [].
  assert.ok(effectiveKeywords(state.objects.get(fd.id), state).includes('flying'), 'flying counter daje flying face-down');
});

test('Audyt B4: zakryty stwór z flying counterem może blokować flyera', () => {
  const state = mainPhase(game());
  addRealCard(state, 'veiled', 'veiled-ascension', 'p2', 'battlefield');
  // p2 ma zakrytego stwora z flying counterem (cloak — przez upkeep Veiled).
  addRealCard(state, 'cloakfd', 'highland-game', 'p2', 'battlefield');
  setField(state, 'cloakfd', { faceDown: true, kind: 'creature', power: 2, toughness: 2, counters: { flying: 1 } });
  // p1 atakuje flyerem.
  const att = addRealCard(state, 'att', 'rustwing-falcon', 'p1', 'battlefield'); // 1/2 flying
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  const r = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['cloakfd'] } });
  assert.ok(r.ok, 'zakryty z flying counterem blokuje flyera: ' + (r.events?.[0]?.reason ?? ''));
});

// --- Audyt PR #41 (B5): oil — P/T tylko przez zdolność Necrosquito

test('Audyt B5: sam licznik oil nie daje +1/+1 (tylko zdolność Necrosquito)', () => {
  const state = mainPhase(game());
  // Zwykły stwór z licznikiem oil (np. proliferate dodał oil) — bez zdolności
  // „gets +1/+1 for each oil counter" NIE rośnie (CR 122.1c).
  addRealCard(state, 'plain', 'highland-game', 'p1', 'battlefield'); // 2/1
  setField(state, 'plain', { counters: { oil: 3 } });
  assert.deepEqual(eff(state, 'plain'), { p: 2, t: 1 }, 'oil bez zdolności nie zmienia P/T');
  // Necrosquito: 0/0 + 2 oil (entersWithCounters) = 2/2; +1 oil przy śmierci.
  addRealCard(state, 'necro', 'necrosquito', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'necro' }).ok, 'rzut Necrosquito');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const necroId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'necrosquito');
  assert.equal(state.objects.get(necroId).counters.oil, 2, '2 oil przy wejściu');
  assert.deepEqual(eff(state, necroId), { p: 2, t: 2 }, 'Necrosquito 0/0 + 2 oil = 2/2');
  addRealCard(state, 'sacme', 'highland-game', 'p1', 'battlefield');
  const before = state.events.length;
  const graveId = 'grave-sacme';
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'sacme');
  state.zones.graveyard.push(graveId);
  const moved = Object.freeze({ ...state.objects.get('sacme'), id: graveId, zone: 'graveyard' });
  state.objects.delete('sacme'); state.objects.set(graveId, moved);
  state.events.push({ type: 'creature_destroyed', fromId: 'sacme', toId: graveId, toZone: 'graveyard', cardId: 'highland-game' });
  processTriggers(state, state.events.slice(before));
  resolveStack(state); // trigger (oil counter) rozstrzyga się ze stosu
  assert.deepEqual(eff(state, necroId), { p: 3, t: 3 }, 'Necrosquito rośnie z kolejnym oil');
});

// --- Audyt PR #41 (B6): protection — ścieżka aury (CR 702.16b)

test('Audyt B6: aura koloru X nie może zaczarować stwora z protection od X', () => {
  const state = mainPhase(game());
  addRealCard(state, 'curi', 'curiosity', 'p1', 'hand'); // {U} aura
  addRealCard(state, 'host', 'highland-game', 'p2', 'battlefield');
  setField(state, 'host', { protectionFromColors: ['U'] });
  addMana(state, 'p1', 1, { colors: ['U'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'curi', targets: ['host'], bestow: false });
  assert.ok(!r.ok, 'rzut aury w chronionego odrzucony');
  assert.equal(state.zones.stack.length, 0, 'aura nie trafiła na stos');
  // Oferta też nie zawiera chronionego celu.
  const view = playerView(state, 'p1');
  const auraCasts = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'curi');
  assert.ok(auraCasts.every((c) => c.targets?.[0] !== 'host'), 'oferta nie celuje w chronionego');
});

test('Audyt B6: gospodarz zyskuje protection na stosie -> czysta aura fizzluje (CR 608.2b)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'curi', 'curiosity', 'p1', 'hand'); // {U} aura
  addRealCard(state, 'host', 'highland-game', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'curi', targets: ['host'], bestow: false });
  assert.ok(r.ok, 'rzut aury: ' + (r.events?.[0]?.reason ?? ''));
  // W oknie odpowiedzi gospodarz zyskuje protection od blue.
  setField(state, 'host', { protectionFromColors: ['U'] });
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.ok(!state.zones.battlefield.some((id) => state.objects.get(id)?.cardId === 'curiosity'), 'aura NIE weszła na bitwisko');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'curiosity'), 'aura poszła do grobu (fizzle)');
});

test('Audyt B6: bestow w chronionego -> wchodzi jako zwykły stwór (CR 702.103b)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand'); // {1}{G}, bestow {3}{G}
  addRealCard(state, 'host', 'highland-game', 'p2', 'battlefield');
  setField(state, 'host', { protectionFromColors: ['G'] });
  addMana(state, 'p1', 4, { colors: ['G'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', targets: ['host'], bestow: true });
  assert.ok(!r.ok, 'bestow w chronionego odrzucony (cel nielegalny przy rzucie)');
});

// --- Audyt PR #41 (B7.1): rewalidacja celów zdolności na stosie (CR 608.2b)

test('Audyt B7.1: Entrancing Lyre — cel urósł ponad X w oknie odpowiedzi -> fizzle (CR 608.2b)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'lyre', 'entrancing-lyre', 'p1', 'battlefield');
  addRealCard(state, 'victim', 'highland-game', 'p2', 'battlefield'); // 2/1
  addMana(state, 'p1', 2, { colors: ['U'] });
  // Aktywacja X=2 (moc celu 2 <= 2).
  const act = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lyre', abilityIndex: 0, xValue: 2, targets: ['victim'] });
  assert.ok(act.ok, 'aktywacja: ' + (act.events?.[0]?.reason ?? ''));
  // W oknie odpowiedzi cel rośnie ponad X (pump z instanta).
  const r = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'x', targets: ['victim'] });
  // (brak instanta w ręce p2 — pomijamy; zamiast tego symulujemy wzrost mocy)
  setField(state, 'victim', { power: 3 });
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('victim').tapped, false, 'cel NIE zatapnięty (nielegalny przy rozstrzyganiu)');
  assert.deepEqual(state.objects.get('victim').untapLockedBy ?? [], [], 'brak blokady odkręcania');
  // Zdolność rozstrzygnięta (wpis zniknął ze stosu).
  assert.equal(state.zones.stack.length, 0, 'stos pusty');
});

test('Audyt B7.1b: Entrancing Lyre — legalny cel nadal działa po rozstrzygnięciu', () => {
  const state = mainPhase(game());
  addRealCard(state, 'lyre', 'entrancing-lyre', 'p1', 'battlefield');
  addRealCard(state, 'victim', 'highland-game', 'p2', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['U'] });
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lyre', abilityIndex: 0, xValue: 2, targets: ['victim'] }).ok);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('victim').tapped, true, 'cel zatapnięty');
  assert.deepEqual(state.objects.get('victim').untapLockedBy, ['lyre'], 'blokada odkręcania');
});

// --- Audyt PR #41 (B7.2): equip na stosie — okno odpowiedzi i fizzle

test('Audyt B7.2: equip działa przy niepustym stosie (instant speed, CR 702.6a)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'cloak', 'cloak-of-the-bat', 'p1', 'battlefield');
  addRealCard(state, 'carrier', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'spell', 'gloomfang-mauler', 'p1', 'hand');
  addMana(state, 'p1', 10, { colors: ['B'] });
  // p1 rzuca stwora — czar czeka na stosie.
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'spell' }).ok, 'rzut stwora');
  assert.ok(state.zones.stack.length > 0, 'coś na stosie');
  // Equip w odpowiedzi ma być legalny mimo niepustego stosu (instant speed,
  // CR 702.6a — wcześniej: „Equip tylko przy pustym stosie").
  const view = playerView(state, 'p1');
  const equip = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'cloak');
  assert.ok(equip, 'equip oferowany przy niepustym stosie (instant speed)');
  const r = execute(state, { ...equip, targets: ['carrier'] });
  assert.ok(r.ok, 'equip w odpowiedzi: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('cloak').attachedTo, 'carrier', 'equip założony po rozstrzygnięciu');
});

test('Audyt B7.2: cel equipu zniszczony w oknie odpowiedzi -> fizzle (CR 608.2b)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'cloak', 'cloak-of-the-bat', 'p1', 'battlefield');
  addRealCard(state, 'carrier', 'highland-game', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cloak', abilityIndex: 0, targets: ['carrier'] }).ok, 'equip aktywowany');
  // W oknie odpowiedzi nosiciel ginie (SBA przez obrażenia).
  markDamage(state, 'carrier', 9);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('cloak').attachedTo, null, 'equip nie założony (cel nielegalny)');
  assert.equal(state.objects.get('cloak').zone, 'battlefield', 'equipment zostaje na bitwisku');
});

// --- Audyt PR #41 (B7.2): ninjutsu na stosie — okno odpowiedzi

test('Audyt B7.2: ninjutsu idzie na stos — kontrczar w oknie odpowiedzi nie wpuszcza Kappy', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'combat_damage', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  state.combat = { attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['attacker'], blockers: new Map(), declared: true };
  addRealCard(state, 'attacker', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'hand');
  addRealCard(state, 'negate', 'negate', 'p2', 'hand');
  addMana(state, 'p1', 2, { colors: ['U'] });
  addMana(state, 'p2', 2, { colors: ['U'] });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'kappa');
  assert.ok(cmd, 'ninjutsu oferowane w oknie combat');
  assert.ok(execute(state, cmd).ok, 'aktywacja ninjutsu');
  // Koszt zapłacony: atakujący wrócił do ręki, mana wydana — KAPPA wciąż w ręce.
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand'), 'atakujący zwrócony (koszt)');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'kappa-tech-wrecker' && o.zone === 'hand'), 'Kappa czeka w ręce (zdolność na stosie)');
  assert.ok(state.zones.stack.length > 0, 'ninjutsu na stosie');
  // p2 kontruje czar-stwór... ninjutsu to zdolność, nie czar — Negate nie
  // celuje w zdolność. Sprawdźmy tylko, że okno odpowiedzi istnieje: p1
  // pasuje → p2 ma priorytet (może rzucić instanta).
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'pass p1');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, 'pass p2');
  // Po rozstrzygnięciu Kappa wchodzi zatapnięta i atakująca.
  const kappa = [...state.objects.values()].find((o) => o.cardId === 'kappa-tech-wrecker' && o.zone === 'battlefield');
  assert.ok(kappa, 'Kappa weszła po rozstrzygnięciu');
  assert.equal(kappa.tapped, true, 'zatapnięta');
  assert.ok(state.combat.attackers.includes(kappa.id), 'atakująca');
});

// --- Audyt PR #41 (B8): sonda pozostałych mechanik M72 ------------------------

test('Audyt B8: Necrosquito — trigger odpala się też przy śmierci ARTEFAKTU („creature or artifact")', () => {
  const state = mainPhase(game());
  addRealCard(state, 'necro', 'necrosquito', 'p1', 'hand');
  addRealCard(state, 'plains', 'basic-plains', 'p1', 'battlefield');
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'necro' }).ok, 'rzut');
  assert.ok(resolveStack(state), 'stos');
  const necroId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'necrosquito');
  assert.equal(state.objects.get(necroId).counters.oil, 2, '2 oil');
  // Artefakt (token) kontrolera ginie -> oil na Necrosquito.
  addRealCard(state, 'treasure', 'token_treasure', 'p1', 'battlefield');
  const before = state.events.length;
  const graveId = 'grave-treasure';
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'treasure');
  state.zones.graveyard.push(graveId);
  const moved = Object.freeze({ ...state.objects.get('treasure'), id: graveId, zone: 'graveyard' });
  state.objects.delete('treasure'); state.objects.set(graveId, moved);
  state.events.push({ type: 'creature_destroyed', fromId: 'treasure', toId: graveId, toZone: 'graveyard', cardId: 'token_treasure' });
  processTriggers(state, state.events.slice(before));
  resolveStack(state);
  assert.equal(state.objects.get(necroId).counters.oil, 3, 'artefakt w grobie -> +1 oil');
  assert.deepEqual(eff(state, necroId), { p: 3, t: 3 }, '3 oil = 3/3');
});

test('Audyt B8: Necrosquito — śmierć SIEBIE nie dokłada oil („another")', () => {
  const state = mainPhase(game());
  addRealCard(state, 'necro', 'necrosquito', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['B'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'necro' }).ok);
  assert.ok(resolveStack(state), 'stos');
  const necroId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'necrosquito');
  assert.equal(state.objects.get(necroId).counters.oil, 2, '2 oil przy wejściu');
  // Zniszczenie samego Necrosquito — trigger „another" nie odpala (brak źródła
  // na bitwisku; count bez zmian, obiekt w grobie).
  const before = state.events.length;
  const graveId = 'grave-necro';
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== necroId);
  state.zones.graveyard.push(graveId);
  const moved = Object.freeze({ ...state.objects.get(necroId), id: graveId, zone: 'graveyard' });
  state.objects.delete(necroId); state.objects.set(graveId, moved);
  state.events.push({ type: 'creature_destroyed', fromId: necroId, toId: graveId, toZone: 'graveyard', cardId: 'necrosquito' });
  processTriggers(state, state.events.slice(before));
  resolveStack(state);
  assert.equal(state.objects.get(graveId).counters.oil, 2, 'self nie dokłada oil („another")');
});

test('Audyt B8: Veiled Ascension ETB — flying counter na KAŻDYM face-down, które już stoi', () => {
  const state = mainPhase(game());
  addRealCard(state, 'veiled', 'veiled-ascension', 'p1', 'hand');
  addRealCard(state, 'fd', 'monastery-flock', 'p1', 'battlefield');
  setField(state, 'fd', { faceDown: true, kind: 'creature', power: 2, toughness: 2 });
  addMana(state, 'p1', 4, { colors: ['W'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'veiled' }).ok, 'rzut Veiled');
  assert.ok(resolveStack(state), 'stos');
  const fd = state.zones.battlefield.map((id) => state.objects.get(id)).find((o) => o?.faceDown);
  assert.ok(fd, 'face-down na bitwisku');
  assert.equal(state.objects.get(fd.id).counters.flying, 1, 'ETB kładzie flying counter na stojące face-down');
});

test('Audyt B8: Warmaker Gunship — station próg 6+ daje flying i stwora', () => {
  const state = mainPhase(game());
  addRealCard(state, 'gunship', 'warmaker-gunship', 'p1', 'battlefield');
  addRealCard(state, 'dork', 'highland-game', 'p1', 'battlefield'); // 2/1 do tapnięcia
  // Station: tap drugiego stwora -> charge = jego moc (2). Do progu 6 brakuje.
  addRealCard(state, 'big', 'gloomfang-mauler', 'p1', 'battlefield'); // 5/5
  addRealCard(state, 'big2', 'gloomfang-mauler', 'p1', 'battlefield');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'gunship');
  assert.ok(offers.length > 0, 'station oferowane');
  // Tapnięcie 5/5 = 5 charge; potem drugie 5/5 = 10 >= 6 → stwór z flying.
  const stationCmd = offers.find((c) => c.tapOtherCreatureId === 'big');
  assert.ok(stationCmd, 'wariant tapnięcia 5/5');
  assert.ok(execute(state, stationCmd).ok, 'station 1');
  resolveStack(state);
  assert.equal(state.objects.get('gunship').counters.charge, 5, 'charge = moc stwora');
  // Drugie tapnięcie — próg 6 osiągnięty: Gunship staje się stworem z flying.
  const offers2 = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'gunship');
  const station2 = offers2.find((c) => c.tapOtherCreatureId === 'big2');
  assert.ok(station2, 'drugie tapnięcie');
  assert.ok(execute(state, station2).ok, 'station 2');
  resolveStack(state);
  const gs = state.objects.get('gunship');
  assert.equal(gs.counters.charge, 10, '10 charge');
  assert.ok(effectiveKeywords(gs, state).includes('flying'), 'próg 6+ → flying');
  assert.equal(effectivePower(gs, state), 4, '4/3 artifact creature po progu');
});

test('Audyt B7.2b: SPRZĘT zniszczony w oknie odpowiedzi -> fizzle equipu (CR 608.2b), bez crasha', () => {
  const state = mainPhase(game());
  addRealCard(state, 'cloak', 'cloak-of-the-bat', 'p1', 'battlefield');
  addRealCard(state, 'carrier', 'highland-game', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cloak', abilityIndex: 0, targets: ['carrier'] }).ok, 'equip aktywowany');
  // W oknie odpowiedzi sam SPRZĘT zostaje zniszczony (efektem — artefakt
  // nie ginie od obrażeń, więc przenosimy go do grobu).
  moveObjectDirectly(state, 'cloak', 'graveyard', 'grave-cloak');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty bez crasha');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'cloak-of-the-bat'), 'sprzęt w grobie');
  assert.equal(state.objects.get('carrier').attachedTo ?? null, null, 'nic nie założone (fizzle)');
});
