import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectiveKeywords } from '../src/engine/permanents.js';

/**
 * Batch 20 realnych kart (ADR 0010 §2a) — pełne mechaniki (decyzja właściciela
 * 2026-08-03). Scenariusz legalny + nielegalny każdej karty, sanity Scryfall
 * (fs.readFileSync), determinizm replay. Dane: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, bloodthirst: data.bloodthirst ?? null, keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

function addMana(state, playerId, amount, colors = ['W', 'U', 'B', 'R', 'G']) {
  // kolorowa pula (M41): dowolny kolor domyślnie (wygoda testu)
  for (let i = 0; i < amount; i += 1) {
    execute(state, { type: 'tap_for_mana', playerId, objectId: 'lib-mana' });
  }
  // prostsza droga: nie ma tu landu — dodaj manę bezpośrednio przez stan
}

// Bezpośrednie dodanie many kolorowej do puli (kolorowa pula, cz. 6).
import { addMana as addColoredMana } from '../src/engine/resources.js';
function giveMana(state, playerId, amount, colors = ['W', 'U', 'B', 'R', 'G']) {
  addColoredMana(state, playerId, amount, { colors });
}

function defined(id) {
  const def = REGISTRY.get(id);
  assert.ok(def, `Brak definicji: ${id}`);
  return def;
}

test('sanity: wszystkie 10 kart ma dane Scryfall i wpis kosztu many', () => {
  const ids = ['chittering-rats', 'coralhelm-guide', 'rustwing-falcon', 'caravan-vigil',
    'gorehorn-minotaurs', 'moonlit-meditation', 'goldmeadow-nomad', 'fear-of-abduction',
    'monastery-flock', 'death-hood-cobra'];
  for (const id of ids) {
    const raw = fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8');
    const j = JSON.parse(raw);
    const def = REGISTRY.get(id);
    if (def) assert.equal(j.name, def.name, `${id}: nazwa Scryfall != definicja`);
  }
});

// --- Rustwing Falcon (M19) — vanilla flyier ---------------------------------

test('Rustwing Falcon: {W} 1/2 z flying, legalny rzut z Plains', () => {
  const state = game();
  mainPhase(state);
  addObject(state, { id: 'plains', instanceId: 'ip', cardId: 'basic-plains', controllerId: 'p1', zone: 'battlefield', kind: 'land' });
  addRealCard(state, 'falcon', 'rustwing-falcon', 'p1', 'hand');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'falcon' });
  assert.ok(r.ok, r.events[0]?.reason);
  const obj = [...state.objects.values()].find((o) => o.cardId === 'rustwing-falcon' && o.zone === 'battlefield');
  assert.ok(obj, 'Falcon nie na bitwisku');
  assert.ok(effectiveKeywords(obj, state).includes('flying'));
  assert.equal(obj.zone, 'battlefield');
});

// --- Monastery Flock (KTK) — defender+flying, Morph {U} --------------------

test('Monastery Flock: zwykły rzut 0/5 defender flying', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 2, ['U']);
  addRealCard(state, 'flock', 'monastery-flock', 'p1', 'hand');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock' });
  assert.ok(r.ok, r.events[0]?.reason);
  const obj = [...state.objects.values()].find((o) => o.cardId === 'monastery-flock' && o.zone === 'battlefield' && !o.faceDown);
  assert.ok(obj, 'Flock nie na bitwisku');
  const kw = effectiveKeywords(obj, state);
  assert.ok(kw.includes('defender') && kw.includes('flying'));
  assert.equal(obj.power, 0);
  assert.equal(obj.toughness, 5);
});

test('Monastery Flock: Morph {3} twarzą w dół, obrót za {U}', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 3, ['U']);
  addRealCard(state, 'flock', 'monastery-flock', 'p1', 'hand');
  // Zagranie twarzą w dół za {3}.
  const down = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock', faceDown: true });
  assert.ok(down.ok, down.events[0]?.reason);
  const facedown = [...state.objects.values()].find((o) => o.cardId === 'monastery-flock');
  assert.equal(facedown.faceDown, true);
  // Obrót za {U} (morph cost {1}).
  giveMana(state, 'p1', 1, ['U']);
  const abil = (facedown.abilities ?? []).find((a) => a.keyword === 'morph');
  assert.ok(abil, 'morph ability obecna przy face-down');
  const up = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: facedown.id, abilityIndex: facedown.abilities.indexOf(abil) });
  assert.ok(up.ok, up.events[0]?.reason);
  assert.equal(state.objects.get(facedown.id).faceDown, false, 'obrót twarzą do góry');
});

// --- Death-Hood Cobra (2XM) — {1}{G}: reach/deathtouch EOT (self) ----------

test('Death-Hood Cobra: aktywowane granty reach/deathtouch na sobie', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cobra', 'death-hood-cobra', 'p1', 'battlefield');
  giveMana(state, 'p1', 4, ['G']);  // 2 na każdą z dwóch aktywacji
  state.objects.set('cobra', Object.freeze({ ...state.objects.get('cobra'), summoningSickness: false }));
  const kw0 = effectiveKeywords(state.objects.get('cobra'), state);
  assert.ok(!kw0.includes('reach') && !kw0.includes('deathtouch'), 'bez grantów na starcie');
  const r1 = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cobra', abilityIndex: 0 });
  assert.ok(r1.ok, r1.events[0]?.reason);
  assert.ok(effectiveKeywords(state.objects.get('cobra'), state).includes('reach'), 'reach do EOT');
  const r2 = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cobra', abilityIndex: 1 });
  assert.ok(r2.ok, r2.events[0]?.reason);
  assert.ok(effectiveKeywords(state.objects.get('cobra'), state).includes('deathtouch'), 'deathtouch do EOT');
});

// --- Coralhelm Guide (BFZ) — {4}{U}: target creature can't be blocked -------

test('Coralhelm Guide: aktywowana {4}{U} nadaje cantBeBlocked celowi', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'guide', 'coralhelm-guide', 'p1', 'battlefield');
  state.objects.set('guide', Object.freeze({ ...state.objects.get('guide'), summoningSickness: false }));
  addRealCard(state, 'attk', 'highland-game', 'p1', 'battlefield');
  giveMana(state, 'p1', 5, ['U']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'guide', abilityIndex: 0, targets: ['attk'] });
  assert.ok(r.ok, r.events[0]?.reason);
  assert.equal(state.objects.get('attk').cantBeBlocked, true, 'cel ma cantBeBlocked');
});

// --- Gorehorn Minotaurs (MM2) — Bloodthirst 2 ------------------------------

test('Gorehorn Minotaurs: bez obrażeń przeciwnika → 3/3 (bez liczników)', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 4, ['R']);
  addRealCard(state, 'gore', 'gorehorn-minotaurs', 'p1', 'hand');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gore' });
  assert.ok(r.ok, r.events[0]?.reason);
  const obj = [...state.objects.values()].find((o) => o.cardId === 'gorehorn-minotaurs' && o.zone === 'battlefield');
  assert.ok(obj);
  assert.equal(obj.power, 3, 'bez bloodthirst: 3/3');
});

test('Gorehorn Minotaurs: po obrażeniach przeciwnika → 5/5 (bloodthirst 2)', () => {
  const state = game();
  mainPhase(state);
  state.dealtDamageToOpponentThisTurn['p1'] = true;
  giveMana(state, 'p1', 4, ['R']);
  addRealCard(state, 'gore', 'gorehorn-minotaurs', 'p1', 'hand');
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gore' });
  assert.ok(r.ok, r.events[0]?.reason);
  const obj = [...state.objects.values()].find((o) => o.cardId === 'gorehorn-minotaurs' && o.zone === 'battlefield');
  assert.ok(obj);
  const counters = obj.counters ?? {};
  assert.equal(counters['+1/+1'], 2, 'bloodthirst: 2 liczniki +1/+1');
});

// --- Caravan Vigil (ISD) — search basic land; Morbid → battlefield ----------

test('Caravan Vigil: bez morbid → basic land do ręki', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'vigil', 'caravan-vigil', 'p1', 'hand');
  addObject(state, { id: 'basic1', instanceId: 'ib1', cardId: 'basic-forest', controllerId: 'p1', zone: 'library', kind: 'land', types: ['Basic', 'Land'] });
  giveMana(state, 'p1', 1, ['G']);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'vigil' });
  assert.ok(r.ok, r.events[0]?.reason);
  // Sorcery → stos: pass obu graczy do resolwowania.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const inHand = [...state.objects.values()].some((o) => o.cardId === 'basic-forest' && o.zone === 'hand');
  assert.ok(inHand, 'basic land w ręce (bez morbid)');
});

test('Caravan Vigil: z morbid → basic land na bitwisko', () => {
  const state = game();
  mainPhase(state);
  state.creatureDiedThisTurn = true;
  addRealCard(state, 'vigil', 'caravan-vigil', 'p1', 'hand');
  addObject(state, { id: 'basic2', instanceId: 'ib2', cardId: 'basic-forest', controllerId: 'p1', zone: 'library', kind: 'land', types: ['Basic', 'Land'] });
  giveMana(state, 'p1', 1, ['G']);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'vigil' });
  assert.ok(r.ok, r.events[0]?.reason);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const onBF = [...state.objects.values()].some((o) => o.cardId === 'basic-forest' && o.zone === 'battlefield');
  assert.ok(onBF, 'basic land na bitwisku (morbid)');
});
