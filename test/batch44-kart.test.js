// M183 — Batch 44 (lista właściciela 2026-08-22).
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function resolveStack(state, max = 12) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function lifeOf(state, playerId) {
  return state.players.find((p) => p.id === playerId).life;
}

// ---- Transza A ----------------------------------------------------------------

test('B44/1: Hill Giant — vanilla 3/3 Giant', () => {
  const def = REGISTRY.get('hill-giant');
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 3);
  assert.deepEqual(def.subtypes, ['Giant']);
  assert.equal(def.oracleText, '');
  assert.equal(def.artId, 258);
  assert.equal(def.plan, 'Warhammer Fantasy');
});

test('B44/2: Farbog Explorer — swampwalk: nieblokowalny, gdy obrońca ma Swamp', () => {
  const def = REGISTRY.get('farbog-explorer');
  assert.equal(def.abilities[0].landwalk.subtype, 'Swamp');
  assert.equal(def.plan, 'Innistrad');
});

test('B44/3: Dismal Backwater — wchodzi tapnięty, ETB +1 życia', () => {
  const state = game('p1');
  const def = REGISTRY.get('dismal-backwater');
  assert.equal(def.entersTapped, true);
  putCard(state, 'db', 'dismal-backwater', 'p1', 'hand');
  const life0 = lifeOf(state, 'p1');
  const play = playerView(state, 'p1').legalCommands.find((c) => c.type === 'play_land' && c.objectId === 'db');
  assert.ok(play, 'oferta zagrania landa');
  assert.ok(execute(state, play).ok);
  assert.ok(resolveStack(state), 'trigger ETB rozstrzygnięty');
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'dismal-backwater' && o.zone === 'battlefield');
  assert.equal(onBoard.tapped, true, 'wchodzi tapnięty');
  assert.equal(lifeOf(state, 'p1'), life0 + 1, 'ETB: +1 życia');
});

test('B44/4: Glaring Aegis — ETB tapuje stwora przeciwnika; nosiciel +1/+3', () => {
  const state = game('p1');
  putCard(state, 'aegis', 'glaring-aegis', 'p1', 'hand');
  putCard(state, 'mine', 'highland-game', 'p1');
  putCard(state, 'theirs', 'alaborn-trooper', 'p2');
  addMana(state, 'p1', 1, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'aegis'
      && (c.targets ?? [])[0] === 'mine');
  assert.ok(cast, 'oferta rzutu aury (cast_permanent z celem)');
  assert.ok(execute(state, cast).ok, 'aura na własnego stwora');
  assert.ok(resolveStack(state));
  // Trigger ETB aury celuje w stwora PRZECIWNIKA — mógł wymagać decyzji celu.
  const view = playerView(state, 'p1');
  const trg = view.legalCommands.find((c) => c.type === 'resolve_trigger_target');
  if (trg) { assert.ok(execute(state, { ...trg, targetId: 'theirs' }).ok); resolveStack(state); }
  const theirs = state.objects.get('theirs');
  assert.equal(theirs.tapped, true, 'stwór przeciwnika tapnięty');
  const mine = state.objects.get('mine');
  assert.equal(effectivePower(mine, state), 3, '2+1');
  assert.equal(effectiveToughness(mine, state), 4, '1+3');
});

test('B44/5: Descendant of Storms — atak → opłata {1}{W} → endure 1 (licznik)', () => {
  const state = game('p1');
  putCard(state, 'dos', 'descendant-of-storms', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: ['W'] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const atk = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('dos'));
  assert.ok(atk, 'oferta ataku');
  assert.ok(execute(state, atk).ok);
  const payOffer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true);
  assert.ok(payOffer, 'decyzja opłaty {1}{W} po ataku');
  assert.ok(execute(state, payOffer).ok);
  assert.ok(resolveStack(state), 'trigger endure na stosie');
  const endure = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_endure_choice' && c.mode === 'counters');
  assert.ok(endure, 'wybór endure: liczniki albo token');
  assert.ok(execute(state, endure).ok);
  const dos = state.objects.get('dos');
  assert.equal(dos.counters?.['+1/+1'], 1, 'endure 1 → licznik +1/+1');
});

// ---- Transza B ----------------------------------------------------------------

test('B44/6: Blanchwood Prowler — land wśród zmielonych: do ręki, reszta do grobu', () => {
  const state = game('p1');
  putCard(state, 'prowler', 'blanchwood-prowler', 'p1', 'hand');
  putCard(state, 'lib1', 'basic-forest', 'p1', 'library');
  putCard(state, 'lib2', 'highland-game', 'p1', 'library');
  putCard(state, 'lib3', 'alaborn-trooper', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'prowler');
  assert.ok(cast);
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const pick = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_satyr_look_choice' && c.pickId === 'lib1');
  assert.ok(pick, 'oferta wzięcia landa ze zmielonych');
  assert.ok(execute(state, pick).ok);
  const forest = [...state.objects.values()].find((o) => o.cardId === 'basic-forest' && o.controllerId === 'p1');
  assert.equal(forest.zone, 'hand', 'land w ręce');
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'blanchwood-prowler' && o.zone === 'battlefield');
  assert.ok(!(onBoard.counters?.['+1/+1'] > 0), 'wziął landa — bez licznika');
});

test('B44/7: Blanchwood Prowler — rezygnacja z landa daje +1/+1', () => {
  const state = game('p1');
  putCard(state, 'prowler', 'blanchwood-prowler', 'p1', 'hand');
  putCard(state, 'lib1', 'basic-forest', 'p1', 'library');
  putCard(state, 'lib2', 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'prowler');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_satyr_look_choice' && (c.pickId == null));
  assert.ok(decline, 'oferta rezygnacji');
  assert.ok(execute(state, decline).ok);
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'blanchwood-prowler' && o.zone === 'battlefield');
  assert.equal(onBoard.counters?.['+1/+1'], 1, 'nie wziął landa → licznik');
});

test('B44/8: Blanchwood Prowler — bez landa w top 3: mill + licznik bez decyzji', () => {
  const state = game('p1');
  putCard(state, 'prowler', 'blanchwood-prowler', 'p1');
  putCard(state, 'lib1', 'highland-game', 'p1', 'library');
  putCard(state, 'lib2', 'alaborn-trooper', 'p1', 'library');
  const prowler = state.objects.get('prowler');
  applyEffect(state, { type: 'reveal_top_pick_land_rest_grave', amount: 3, counterIfNone: true }, prowler, []);
  assert.equal(state.pendingSatyrLook, null, 'bez landów nie ma decyzji');
  const after = state.objects.get('prowler');
  assert.equal(after.counters?.['+1/+1'], 1, 'licznik od razu');
  const milled = [...state.objects.values()].filter((o) => o.zone === 'graveyard' && o.controllerId === 'p1');
  assert.equal(milled.length, 2, 'obie karty w grobie');
});

test("B44/9: Thieves' Tools — ETB Treasure; nosiciel o mocy <=3 nieblokowalny", () => {
  const state = game('p1');
  putCard(state, 'tools', 'thieves-tools', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'tools');
  assert.ok(cast, 'oferta rzutu equipmentu');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const treasure = [...state.objects.values()].find((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield');
  assert.ok(treasure, 'Skarb z ETB');
  // Nieblokowalność progu mocy: atakujący z przypiętym equipmentem.
  const s2 = game('p1');
  putCard(s2, 'rogue', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  putCard(s2, 'tools2', 'thieves-tools', 'p1', 'battlefield', { kind: 'artifact' });
  s2.objects.set('tools2', Object.freeze({ ...s2.objects.get('tools2'), attachedTo: 'rogue' }));
  putCard(s2, 'blocker', 'alaborn-trooper', 'p2', 'battlefield', { summoningSickness: false });
  s2.turn = jumpToStep(s2.turn, 'declare_attackers', 'p1');
  s2.turn.activePlayerId = 'p1';
  s2.turn.priorityPlayerId = 'p1';
  assert.ok(execute(s2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['rogue'] }).ok);
  // pass do declare_blockers
  for (let i = 0; i < 4 && s2.turn.step !== 'declare_blockers'; i += 1) {
    execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  }
  const r = execute(s2, { type: 'declare_blockers', playerId: 'p2', assignments: { rogue: ['blocker'] } });
  assert.equal(r.ok, false, 'moc 2 <= 3 — nie można blokować');
});

test('B44/10: Heap Gate — trzy zdolności; Treasure za tapnięcie INNEJ bramy', () => {
  const state = game('p1');
  putCard(state, 'heap', 'heap-gate', 'p1');
  putCard(state, 'basilisk', 'basilisk-gate', 'p1');
  putCard(state, 'island', 'basic-island', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'heap');
  const treasureOffer = offers.find((c) => c.abilityIndex === 2);
  assert.ok(treasureOffer, 'oferta trzeciej zdolności (Treasure)');
  assert.equal(treasureOffer.tapPermanentCostId, 'basilisk', 'koszt: tapnięcie INNEJ bramy');
  assert.ok(execute(state, treasureOffer).ok);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('basilisk').tapped, true, 'Basilisk Gate tapnięta kosztem');
  assert.equal(state.objects.get('heap').tapped, true, 'Heap Gate tapnięta ({T})');
  const treasure = [...state.objects.values()].find((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield');
  assert.ok(treasure, 'Skarb stworzony');
});

test('B44/11: Heap Gate — bez drugiej bramy trzecia zdolność nie jest oferowana', () => {
  const state = game('p1');
  putCard(state, 'heap', 'heap-gate', 'p1');
  putCard(state, 'island', 'basic-island', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'heap' && c.abilityIndex === 2);
  assert.equal(offers.length, 0, 'brak INNEJ bramy = brak oferty');
});

test("B44/12: Angel's Herald — koszt: poświęć stwora G, W i U; search fails to find", () => {
  const state = game('p1');
  putCard(state, 'herald', 'angels-herald', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'green', 'highland-game', 'p1');   // G
  putCard(state, 'white', 'alaborn-trooper', 'p1'); // W
  putCard(state, 'blue', 'wishful-merfolk', 'p1');  // U
  putCard(state, 'lib1', 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'herald');
  assert.ok(offers.length > 0, 'oferta aktywacji z trójką stworów');
  const offer = offers[0];
  assert.deepEqual(offer.sacrificeCreatureIds, ['green', 'white', 'blue'], 'po jednym stworze na kolor');
  assert.ok(execute(state, offer).ok);
  assert.ok(resolveStack(state));
  for (const id of ['green', 'white', 'blue']) {
    assert.ok(!state.objects.has(id) || state.objects.get(id).zone !== 'battlefield', `${id} poświęcony`);
  }
  // Empyrial Archangel nie istnieje w katalogu — search fail to find + shuffle.
  assert.ok(state.events.some((e) => e.type === 'library_searched' && e.foundCardId === null), 'fail to find + tasowanie');
});

test('B44/13: Frightful Delusion — kontroler płaci {1} (czar zostaje) albo nie (skontrowany); zawsze discard', () => {
  // Wariant 1: kontroler NIE płaci — czar skontrowany, potem odrzuca kartę.
  const state = game('p2');
  putCard(state, 'their-spell', 'fleeting-distraction', 'p2', 'hand');
  putCard(state, 'their-target', 'highland-game', 'p1');
  putCard(state, 'their-extra', 'alaborn-trooper', 'p2', 'hand');
  putCard(state, 'their-island', 'basic-island', 'p2'); // źródło {1} — bez niego auto-kontra bez decyzji
  putCard(state, 'fd', 'frightful-delusion', 'p1', 'hand');
  addMana(state, 'p2', 1, { colors: ['U'] });
  addMana(state, 'p1', 3, { colors: ['U'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'their-spell');
  assert.ok(cast, 'przeciwnik rzuca czar');
  assert.ok(execute(state, { ...cast, targets: ['their-target'] }).ok);
  // p1 w odpowiedzi rzuca Frightful Delusion na czar na stosie
  // (pass p2 oddaje priorytet p1 — czar zostaje na stosie).
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const stackId = state.zones.stack[state.zones.stack.length - 1];
  const counterCast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fd');
  assert.ok(counterCast, 'oferta kontrczaru');
  assert.ok(execute(state, { ...counterCast, targets: [stackId] }).ok);
  // Pass do rozstrzygnięcia Frightful Delusion → decyzja p2.
  for (let i = 0; i < 6 && !state.pendingCounterPay; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(state.pendingCounterPay, 'decyzja kontrolera celu');
  const noPay = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === false);
  assert.ok(noPay, 'oferta „nie płać"');
  assert.ok(execute(state, noPay).ok);
  assert.ok(state.events.some((e) => e.type === 'spell_countered'), 'czar skontrowany');
  // „That player discards a card" — wybór karty do odrzucenia.
  const disc = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'resolve_discard_choice');
  assert.ok(disc, 'kontroler odrzuca kartę');
  assert.ok(execute(state, disc).ok);
  assert.ok(state.events.some((e) => e.type === 'card_discarded'), 'karta odrzucona');
  const fdGone = [...state.objects.values()].find((o) => o.cardId === 'frightful-delusion');
  assert.equal(fdGone.zone, 'graveyard', 'Frightful Delusion dokończył rozstrzyganie');

  // Wariant 2: kontroler PŁACI — czar zostaje na stosie i rozstrzyga się.
  const s2 = game('p2');
  putCard(s2, 'spell2', 'fleeting-distraction', 'p2', 'hand');
  putCard(s2, 'tgt2', 'highland-game', 'p1');
  putCard(s2, 'extra2', 'alaborn-trooper', 'p2', 'hand');
  putCard(s2, 'lib-p2', 'highland-game', 'p2', 'library');
  putCard(s2, 'fd2', 'frightful-delusion', 'p1', 'hand');
  putCard(s2, 'island2', 'basic-island', 'p2');
  addMana(s2, 'p2', 1, { colors: ['U'] });
  addMana(s2, 'p1', 3, { colors: ['U'] });
  const cast2 = playerView(s2, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell2');
  assert.ok(execute(s2, { ...cast2, targets: ['tgt2'] }).ok);
  assert.ok(execute(s2, { type: 'pass_priority', playerId: 'p2' }).ok);
  const stackId2 = s2.zones.stack[s2.zones.stack.length - 1];
  const counterCast2 = playerView(s2, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fd2');
  assert.ok(execute(s2, { ...counterCast2, targets: [stackId2] }).ok);
  for (let i = 0; i < 6 && !s2.pendingCounterPay; i += 1) {
    execute(s2, { type: 'pass_priority', playerId: s2.turn.priorityPlayerId });
  }
  assert.ok(s2.pendingCounterPay);
  const pay = playerView(s2, 'p2').legalCommands
    .find((c) => c.type === 'resolve_counter_pay_choice' && c.pay === true);
  assert.ok(pay, 'oferta zapłaty {1} (ma landa)');
  assert.ok(execute(s2, pay).ok);
  const disc2 = playerView(s2, 'p2').legalCommands
    .find((c) => c.type === 'resolve_discard_choice');
  assert.ok(disc2, 'discard także po zapłacie');
  assert.ok(execute(s2, disc2).ok);
  assert.ok(!s2.events.some((e) => e.type === 'spell_countered'), 'czar NIE skontrowany');
  const spellObj = [...s2.objects.values()].find((o) => o.cardId === 'fleeting-distraction');
  assert.equal(spellObj.zone, 'stack', 'czar wciąż na stosie po zapłacie');
  assert.ok(resolveStack(s2), 'czar rozstrzyga się normalnie');
});
