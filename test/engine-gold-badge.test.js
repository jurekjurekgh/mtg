import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { effectivePower, effectiveKeywords, clearStatModifiers } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

// =============================================================================
// Złota odznaka „wyłapywacz błędów" (sesja 2026-08-08, M57) — 5 błędów vs
// zasady MtG znalezionych w przeglądzie istniejących kart i mechanik:
//   1. CR 514.1 — limit ręki w cleanup dotyczył OBU graczy zamiast tylko
//      aktywnego (nieaktywny był zmuszany do odrzucania do 7).
//   2. CR 119.3 — combat damage_dealt niósł kwotę PRZED prewencją; triggery
//      „deals combat damage" odpalały się przy w pełni zapobiegniętych
//      obrażeniach (0 zadanych).
//   3. CR 611.2c — buffy „do końca tury" (Hysterical Blindness -4/-0, Turn
//      the Tide -2/-0, Angel of the Dawn +1/+1 vigilance, Your Temple
//      indestructible) były aplikowane jednorazowo — stwory wchodzące PÓŹNIEJ
//      nie dostawały modyfikatora.
//   4. Opcjonalne płatności triggerów (Panic Spellbomb {R}, Zoraline {W}{B})
//      sprawdzały manę TYLKO z puli — gracz z nietapniętym landem nie widział
//      oferty (check niespójny z płatnością spendMana, która auto-tapuje).
//   5. CR 104.3c — dobranie z pustej biblioteki przez EFEKT karty (draw_cards)
//      nie kończyło gry (przegrana tylko z próby dobrania w kroku draw).
// =============================================================================

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name,
  });
}

function addCreature(state, id, ctrl, p, t) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power: p, toughness: t, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function passRounds(state, rounds = 8) {
  for (let g = 0; g < rounds; g += 1) {
    let passes = state.turn.passes;
    let guard = 0;
    while (passes < 2 && guard < 30) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) return r;
      passes = state.turn.passes;
      guard += 1;
      if (passes === 0) break;
    }
    if (state.zones.stack.length === 0) break;
  }
  return null;
}

// ---------------------------------------------------------------- 1. CR 514.1

test('B1: limit ręki w cleanup dotyczy TYLKO aktywnego gracza (CR 514.1)', () => {
  const state = newState();
  // obaj gracze po 9 kart w ręce; aktywny p1
  for (let i = 0; i < 9; i += 1) {
    addObject(state, { id: `h1-${i}`, instanceId: `i1-${i}`, cardId: 'x-h', controllerId: 'p1', zone: 'hand', kind: 'card', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [], cardName: `H${i}` });
    addObject(state, { id: `h2-${i}`, instanceId: `i2-${i}`, cardId: 'x-h2', controllerId: 'p2', zone: 'hand', kind: 'card', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [], cardName: `J${i}` });
  }
  let guard = 0;
  for (;;) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
    guard += 1;
    if (guard > 80) break;
    if (state.turn.step === 'cleanup' && state.turn.activePlayerId === 'p1' && state.zones.stack.length === 0) break;
  }
  // decyzja odrzucenia należy do AKTYWNEGO (p1), nieaktywny (p2) nie dostaje jej
  assert.ok(state.pendingDiscardChoice, 'cleanup kolejkuje odrzucenie');
  assert.equal(state.pendingDiscardChoice.playerId, 'p1', 'decydentem jest aktywny gracz');
  let g2 = 0;
  while (state.pendingDiscardChoice && g2 < 10) {
    const pending = state.pendingDiscardChoice;
    const r = execute(state, { type: 'resolve_discard_choice', playerId: pending.playerId, cardId: pending.handIds[0] });
    assert.ok(r.ok, 'odrzucenie aktywnego');
    g2 += 1;
  }
  // dokończ cleanup (przejście do następnego kroku)
  for (let i = 0; i < 60; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok || state.turn.step !== 'cleanup') break;
  }
  const p1hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  const p2hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.ok(p1hand <= 7, `aktywny odrzucił do 7 (p1=${p1hand})`);
  assert.equal(p2hand, 9, `nieaktywny ZACHOWUJE rękę (p2=${p2hand}) — CR 514.1`);
});

// ---------------------------------------------------------------- 2. CR 119.3

test('B2: combat damage_dealt niesie kwotę PO prewencji; brak triggera przy 0 zadanych', () => {
  const state = newState();
  addCreature(state, 'att', 'p1', 4, 4);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  state.damageShields = [{ targetId: 'p2', remaining: 3, sourceCardId: 'withstand' }];
  let g = 0;
  for (;;) {
    const rp = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!rp.ok) break;
    g += 1;
    if (g > 60) break;
    if (state.turn.step === 'combat_damage' && state.turn.priorityPlayerId === 'p1' && state.zones.stack.length === 0) break;
  }
  const before = state.events.length;
  execute(state, { type: 'resolve_combat', playerId: state.turn.priorityPlayerId, defendingPlayerId: 'p2' });
  const dmg = state.events.slice(before).find((e) => e.type === 'damage_dealt' && e.combat === true);
  assert.equal(dmg?.amount, 1, 'event niesie kwotę po prewencji (z 4 zapobiegnięto 3)');
  assert.equal(state.players[1].life, 19, 'gracz traci tylko 1');
  // w pełni zapobiegnięte (tarcza 5): trigger „deals combat damage" NIE odpala
  const st2 = newState();
  addCreature(st2, 'att', 'p1', 4, 4);
  addObject(st2, {
    id: 'kappa', instanceId: 'i-k', cardId: 'kappa-tech-wrecker', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 3, manaCost: 2, abilities: REGISTRY.get('kappa-tech-wrecker').abilities,
    keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
  });
  st2.objects.set('kappa', Object.freeze({ ...st2.objects.get('kappa'), summoningSickness: false, counters: { deathtouch: 1 } }));
  st2.turn = jumpToStep(st2.turn, 'declare_attackers', 'p1');
  st2.turn.activePlayerId = 'p1';
  st2.turn.priorityPlayerId = 'p1';
  execute(st2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] });
  st2.damageShields = [{ targetId: 'p2', remaining: 5, sourceCardId: 'withstand' }];
  let g2 = 0;
  for (;;) {
    const rp = execute(st2, { type: 'pass_priority', playerId: st2.turn.priorityPlayerId });
    if (!rp.ok) break;
    g2 += 1;
    if (g2 > 60) break;
    if (st2.turn.step === 'combat_damage' && st2.turn.priorityPlayerId === 'p1' && st2.zones.stack.length === 0) break;
  }
  execute(st2, { type: 'resolve_combat', playerId: st2.turn.priorityPlayerId, defendingPlayerId: 'p2' });
  const kappaFired = st2.pendingTriggerTargets.length > 0
    || st2.zones.stack.some((id) => st2.objects.get(id)?.cardId === 'kappa-tech-wrecker');
  assert.equal(kappaFired, false, '0 zadanych obrażeń = brak triggera (CR 119.3)');
});

// ---------------------------------------------------------------- 3. CR 611.2c

test('B3: buffy „do końca tury" trwają, ale zbiór obiektów zamraża się przy rozstrzygnięciu (CR 611.2c)', () => {
  // M101/B2 (korekta tego testu): oryginalna wersja twierdziła, że buff grupowy
  // obejmuje też stwory wchodzące PÓŹNIEJ. CR 611.2c mówi coś odwrotnego:
  // „If a continuous effect... modifies the characteristics... of a SET of
  // objects, the set is determined when the effect BEGINS." Efekt trwa do
  // końca tury (to zostaje — sedno pierwotnej naprawy złotej odznaki), ale
  // dotyczy wyłącznie stworów obecnych w chwili rozstrzygnięcia.
  const state = newState();
  addCardFromRegistry(state, 'hb', 'hysterical-blindness', 'p1', 'hand');
  addCreature(state, 'cre1', 'p2', 3, 3);
  state.players[0].mana = 3;
  state.players[0].manaPool = { U: 1 };
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'hb', targets: [] }).ok);
  passRounds(state, 2);
  assert.equal(effectivePower(state.objects.get('cre1'), state), -1, 'istniejący stwór -4/-0');
  addCreature(state, 'cre2', 'p2', 5, 5);
  assert.equal(effectivePower(state.objects.get('cre2'), state), 5, 'późniejszy stwór BEZ -4/-0 (CR 611.2c)');
  // keyword z buffa (Angel of the Dawn — vigilance): trwa do końca tury na
  // stworach objętych efektem, ale nie „dolewa się" na nowych.
  const st2 = newState();
  addCardFromRegistry(st2, 'angel', 'angel-of-the-dawn', 'p1', 'hand');
  addCreature(st2, 'c1', 'p1', 2, 2);
  st2.players[0].mana = 5;
  st2.players[0].manaPool = { W: 3 };
  assert.ok(execute(st2, { type: 'cast_permanent', playerId: 'p1', objectId: 'angel' }).ok);
  passRounds(st2, 3);
  assert.ok(effectiveKeywords(st2.objects.get('c1'), st2).includes('vigilance'), 'obecny stwór ma vigilance');
  assert.equal(effectivePower(st2.objects.get('c1'), st2), 3, 'obecny stwór ma +1/+1 przez całą turę');
  addCreature(st2, 'c2', 'p1', 1, 1);
  assert.equal(effectiveKeywords(st2.objects.get('c2'), st2).includes('vigilance'), false, 'późniejszy stwór bez vigilance');
  assert.equal(effectivePower(st2.objects.get('c2'), st2), 1, 'późniejszy stwór bez +1/+1');
  // cleanup czyści buffy
  clearStatModifiers(st2);
  assert.equal(effectivePower(st2.objects.get('c1'), st2), 2, 'cleanup zdejmuje buffy');
  assert.equal(effectiveKeywords(st2.objects.get('c1'), st2).includes('vigilance'), false);
});

// ---------------------------------------------------------------- 4. Trigger pay

test('B4: opcjonalna płatność triggera liczy manę PRODUKOWALNĄ (Panic Spellbomb {R})', () => {
  const state = newState();
  addCardFromRegistry(state, 'bomb', 'panic-spellbomb', 'p1', 'battlefield');
  addObject(state, {
    id: 'mtn', instanceId: 'i-m', cardId: 'basic-mountain', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', power: null, toughness: null, manaCost: 0, abilities: [], keywords: [], subtypes: ['Mountain'],
    types: ['Basic', 'Land'], colors: ['R'],
  });
  addObject(state, { id: 'lib1', instanceId: 'i-l1', cardId: 'x-lib', controllerId: 'p1', zone: 'library', kind: 'card', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [], cardName: 'Lib' });
  state.zones.library = ['lib1'];
  state.players[0].mana = 0; // PUŁA PUSTA — ale nietapnięta góra daje produkowalną 1
  state.players[0].manaPool = {};
  const bombId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'panic-spellbomb');
  const r = execute(state, { type: 'move_object', playerId: 'p1', objectId: bombId, toZone: 'graveyard', newObjectId: 'bomb-grave' });
  assert.ok(r.ok, 'bomb do grobu');
  // trigger „you may pay {R}" musi być OFEROWANY (produkowalna mana z góry)
  assert.ok(state.pendingOptionalPay, 'trigger oferowany przy nietapniętym źródle many');
  const rr = execute(state, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true });
  assert.ok(rr.ok, 'płatność {R}');
  passRounds(state, 3);
  const hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(hand, 1, 'dobrano kartę po zapłacie z tapniętej góry');
  assert.equal(state.objects.get('mtn').tapped, true, 'góra zatapnięta (koszt)');
});

// ---------------------------------------------------------------- 5. CR 104.3c

test('B5: dobranie z pustej biblioteki przez EFEKT karty kończy grę (CR 104.3c)', () => {
  const state = newState();
  addCardFromRegistry(state, 'rager', 'phyrexian-rager', 'p1', 'hand');
  state.zones.library = []; // pusta biblioteka p1
  state.players[0].mana = 3;
  state.players[0].manaPool = { B: 2 };
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'rager' }).ok);
  passRounds(state, 3);
  assert.equal(state.status, 'finished', 'ETB draw z pustej biblioteki = przegrana');
  assert.equal(state.winnerId, 'p2', 'wygranym jest przeciwnik');
  assert.equal(state.players[0].life, 19, 'ETB: -1 życia nadal zadane');
});
