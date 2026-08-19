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

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Przy pustym stosie nic nie robi; zatrzymuje się na decyzji blokującej.
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
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
    morph: data.morph ?? null, bloodthirst: data.bloodthirst ?? null, additionalCost: data.additionalCost ?? null, keywords: def.keywords ?? [],
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
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'falcon' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  const obj = [...state.objects.values()].find((o) => o.cardId === 'rustwing-falcon' && o.zone === 'battlefield');
  assert.ok(obj, 'Falcon nie na polu bitwy');
  assert.ok(effectiveKeywords(obj, state).includes('flying'));
  assert.equal(obj.zone, 'battlefield');
});

// --- Monastery Flock (KTK) — defender+flying, Morph {U} --------------------

test('Monastery Flock: zwykły rzut 0/5 defender flying', () => {
  const state = game();
  mainPhase(state);
  // M105/B3: {2}{U} = 3 many (katalog miał zaniżony koszt 2).
  giveMana(state, 'p1', 3, ['U']);
  addRealCard(state, 'flock', 'monastery-flock', 'p1', 'hand');
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  const obj = [...state.objects.values()].find((o) => o.cardId === 'monastery-flock' && o.zone === 'battlefield' && !o.faceDown);
  assert.ok(obj, 'Flock nie na polu bitwy');
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
  resolveStack(state);

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
  resolveStack(state); // D: zdolność na stosie → reach po rozstrzygnięciu
  assert.ok(effectiveKeywords(state.objects.get('cobra'), state).includes('reach'), 'reach do EOT');
  const r2 = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cobra', abilityIndex: 1 });
  assert.ok(r2.ok, r2.events[0]?.reason);
  resolveStack(state); // D: zdolność na stosie → deathtouch po rozstrzygnięciu
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
  resolveStack(state); // D: zdolność na stosie → cantBeBlocked po rozstrzygnięciu
  assert.equal(state.objects.get('attk').cantBeBlocked, true, 'cel ma cantBeBlocked');
});

// --- Gorehorn Minotaurs (MM2) — Bloodthirst 2 ------------------------------

test('Gorehorn Minotaurs: bez obrażeń przeciwnika → 3/3 (bez liczników)', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 4, ['R']);
  addRealCard(state, 'gore', 'gorehorn-minotaurs', 'p1', 'hand');
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gore' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
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
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gore' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
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
  // Temat 6: wybór karty z biblioteki.
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  assert.ok(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'basic1' }).ok);
  const inHand = [...state.objects.values()].some((o) => o.cardId === 'basic-forest' && o.zone === 'hand');
  assert.ok(inHand, 'basic land w ręce (bez morbid)');
});

test('Caravan Vigil: z morbid → basic land na pole bitwy', () => {
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
  // Temat 6: wybór karty z biblioteki. BUG4 fix: przy morbid gracz wybiera
  // ręka ALBO pole bitwy („may") — tu wybieramy pole bitwy.
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  assert.ok(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'basic2', destination: 'battlefield' }).ok);
  const onBF = [...state.objects.values()].some((o) => o.cardId === 'basic-forest' && o.zone === 'battlefield');
  assert.ok(onBF, 'basic land na polu bitwy (morbid, wybór gracza)');
});

// --- Chittering Rats (DST) — ETB: opponent hand card → top of library --------

test('Chittering Rats: ETB — CEL wybiera kartę z ręki na wierzch biblioteki', () => {
  const state = game();
  mainPhase(state);
  // p2 ma kartę w ręce.
  addObject(state, { id: 'p2card', instanceId: 'ip2', cardId: 'highland-game', controllerId: 'p2', zone: 'hand', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  giveMana(state, 'p1', 3, ['B']);
  addRealCard(state, 'rats', 'chittering-rats', 'p1', 'hand');
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'rats' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  // Temat 2: „target opponent" — kontroler (p1) wskazuje cel (p2).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' }).ok);
  resolveStack(state); // T6: trigger Rats ze stosu
  // Temat 4: kartę wybiera CEL (p2) — decyzja resolve_hand_top_choice.
  assert.ok(state.pendingHandTopChoice, 'decyzja hand-top czeka');
  assert.equal(state.pendingHandTopChoice.playerId, 'p2');
  assert.ok(execute(state, { type: 'resolve_hand_top_choice', playerId: 'p2', cardId: 'p2card' }).ok);
  const onLib = [...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'library');
  assert.ok(onLib, 'karta p2 na wierzchu biblioteki');
  const inHand = [...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand');
  assert.ok(!inHand, 'karta p2 nie już w ręce');
});

// --- Goldmeadow Nomad (ECL) — {W}, Exile from graveyard: Kithkin token ------

test('Goldmeadow Nomad: aktywacja z grobu → token Kithkin + wygnanie źródła', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'nomad', 'goldmeadow-nomad', 'p1', 'graveyard');
  giveMana(state, 'p1', 1, ['W']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'nomad', abilityIndex: 0 });
  assert.ok(r.ok, r.events[0]?.reason);
  resolveStack(state); // D: zdolność na stosie → token + wygnanie po rozstrzygnięciu
  // Źródło wygnane z grobu.
  assert.equal(state.objects.get('nomad')?.zone, undefined, 'nomad wygnany z grobu');
  // Token Kithkin na polu bitwy.
  const token = [...state.objects.values()].some((o) => o.cardId === 'token_kithkin' && o.zone === 'battlefield');
  assert.ok(token, 'token Kithkin na polu bitwy');
});

// Regresja 2026-08-07 (zgłoszenie C przed scaleniem PR #32): zdolność
// „z grobu" oferowała się i aktywowała, gdy Nomad leżał na polu bitwy.
test('Goldmeadow Nomad: na polu bitwy zdolność „z grobu\" nie jest oferowana ani aktywowalna', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'nomad', 'goldmeadow-nomad', 'p1', 'battlefield');
  giveMana(state, 'p1', 1, ['W']);
  // Oferta: brak activate_ability dla nomada na polu bitwy (zdolność z grobu).
  const view = playerView(state, 'p1');
  const offered = (view.legalCommands ?? []).find((c) => c.type === 'activate_ability' && c.objectId === 'nomad');
  assert.ok(!offered, 'zdolność z grobu nie może być oferowana na polu bitwy');
  // Walidacja: aktywacja z pola bitwy odrzucona.
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'nomad', abilityIndex: 0 });
  assert.ok(!r.ok, 'aktywacja z pola bitwy powinna być nielegalna');
  assert.match(r.events[0]?.reason ?? '', /z grobu/);
});

// --- Fear of Abduction (DSK) — exile cost + ETB exile + dies return ----------

test('Fear of Abduction: koszt exile + ETB exile opponent + dies return', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'sac', 'highland-game', 'p1', 'battlefield'); // creature to exile as cost
  addRealCard(state, 'foe', 'highland-game', 'p2', 'battlefield'); // opponent creature
  addRealCard(state, 'fear', 'fear-of-abduction', 'p1', 'hand');
  giveMana(state, 'p1', 6, ['W']);
  // Cast Fear with exileTargetId = sac (own creature cost).
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fear', exileTargetId: 'sac' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  // Own creature exiled (cost).
  assert.equal(state.objects.get('sac'), undefined, 'własny stwór wygnany (koszt)');
  // Fear on battlefield.
  const fear = [...state.objects.values()].find((o) => o.cardId === 'fear-of-abduction' && o.zone === 'battlefield');
  assert.ok(fear, 'Fear na polu bitwy');
  // ETB: cel „target creature an opponent controls" — decyzja gracza.
  const tgt = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'foe');
  assert.ok(tgt, 'cel ETB Fear w ofercie');
  assert.ok(execute(state, tgt).ok);
  resolveStack(state);
  // Opponent creature exiled (ETB trigger).
  assert.equal(state.objects.get('foe'), undefined, 'stwór przeciwnika wygnany (ETB)');
  const fearLive = state.objects.get(fear.id);
  assert.ok(fearLive.banishedIds?.length > 0, 'Fear ma banishedIds');
});

// --- Moonlit Meditation (EOE) — replacement: first token → copies -----------

test('Moonlit Meditation: aura na stwora; pierwsze tokeny → kopie zaczarowanego', () => {
  const state = game();
  mainPhase(state);
  // Stwór-cel aury (Highland Game 2/1).
  addRealCard(state, 'host', 'highland-game', 'p1', 'battlefield');
  // Moonlit Meditation bezpośrednio na polu bitwy (załączona do hosta).
  const mmDef = REGISTRY.get('moonlit-meditation');
  const mmData = gameObjectDataOf(mmDef);
  addObject(state, {
    id: 'mm', instanceId: 'imm', cardId: 'moonlit-meditation', controllerId: 'p1', zone: 'battlefield',
    kind: 'aura', aura: mmDef.aura, colors: mmData.colors, types: mmDef.types,
  });
  state.objects.set('mm', Object.freeze({ ...state.objects.get('mm'), attachedTo: 'host' }));
  // Teraz rzuć czar tworzący tokeny (Captain's Call — 3 Soldier).
  addRealCard(state, 'call', 'captains-call', 'p1', 'hand');
  giveMana(state, 'p1', 4, ['W']);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'call' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  // Temat 9: „you may instead create copies" — decyzja gracza (zastępujemy).
  assert.ok(state.pendingMoonlitChoice, 'decyzja moonlit czeka');
  assert.ok(execute(state, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: true }).ok);
  // Pierwsze tworzenie tokenów → kopie Highland Game (2/1 G Elk), NIE Soldier 1/1.
  const clones = [...state.objects.values()].filter((o) => o.cardId === 'token_clone' && o.zone === 'battlefield');
  const soldiers = [...state.objects.values()].filter((o) => o.cardId === 'token_soldier' && o.zone === 'battlefield');
  assert.ok(clones.length >= 1, 'powstały klony (zaczarowany permanent)');
  assert.equal(soldiers.length, 0, 'nie powstały Soldier (zastąpione klonami)');
});
