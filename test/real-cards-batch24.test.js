import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { castSpell } from '../src/engine/spells.js';
import { legalActivatedAbilities, activateAbility } from '../src/engine/abilities.js';
import { effectivePower, effectiveKeywords } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

// =============================================================================
// Batch 24 — 10 realnych kart (kolejka właściciela). Testy behawioralne
// end-to-end (nie asercje definicji — lekcja M55).
// =============================================================================

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
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
    types: def.types ?? [], colors: data.colors ?? [],
    aura: def.aura ?? null, bestow: def.bestow ?? null, enchantPlayer: def.enchantPlayer ?? false,
    cardName: def.name, morph: data.morph ?? null, plot: data.plot ?? null,
    entersTapped: data.entersTapped ?? false, entersTappedCondition: data.entersTappedCondition ?? null,
    equipment: data.equipment ?? null,
  });
}

function addCreature(state, id, controllerId, power, toughness, { colors = [], keywords = [], subtypes = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords,
    subtypes, types: ['Creature'], colors, summoningSickness: false,
  });
}

function addLand(state, id, controllerId, { subtype = 'Forest', color = 'G' } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId, zone: 'battlefield',
    kind: 'land', power: null, toughness: null, manaCost: 0, abilities: [],
    keywords: [], subtypes: [subtype], types: ['Land'], colors: [color],
  });
}

function giveMana(state, playerId, amount, colors = {}) {
  const player = state.players.find((p) => p.id === playerId);
  player.mana = amount;
  player.manaPool = { ...(player.manaPool ?? {}), ...colors };
}

function passRounds(state, rounds = 6) {
  for (let g = 0; g < rounds; g += 1) {
    let passes = state.turn.passes;
    let guard = 0;
    while (passes < 2 && guard < 20) {
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

function resolveTriggerTarget(state, targetId) {
  const pending = state.pendingTriggerTargets?.[0];
  if (!pending) return null;
  return execute(state, { type: 'resolve_trigger_target', playerId: pending.playerId, targetId });
}

function byCard(state, cardId, zone) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
}

function assertScryfall(id) {
  const j = JSON.parse(fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8'));
  const def = REGISTRY.get(id);
  assert.equal(j.name, def.name, `${id}: nazwa`);
  assert.equal(j.cmc, def.manaCost, `${id}: cmc`);
  assert.equal(j.set, def.set.toLowerCase(), `${id}: set`);
}

// ---------------------------------------------------------------- 1. Faceless Butcher

test('Faceless Butcher: ETB exile other creature, LTB return under owner control', () => {
  assertScryfall('faceless-butcher');
  const state = newState();
  giveMana(state, 'p1', 4, { B: 2 });
  addCardFromRegistry(state, 'butcher', 'faceless-butcher', 'p1', 'hand');
  addCreature(state, 'foe', 'p2', 3, 3, { colors: ['R'] });
  addCreature(state, 'own', 'p1', 2, 2, { colors: ['G'] });
  castPermanentViaCmd(state, 'butcher');
  passRounds(state, 1); // czar na stosie -> rozstrzygnięcie
  // ETB trigger z requiresTarget: wybór stwora do wygnania
  assert.ok(state.pendingTriggerTargets.length >= 1, 'trigger ETB czeka na cel');
  const r = resolveTriggerTarget(state, 'foe');
  assert.ok(r && r.ok, 'cel wybrany');
  passRounds(state, 3); // trigger na stosie -> rozstrzygnięcie (exile)
  const butcher = byCard(state, 'faceless-butcher', 'battlefield');
  assert.ok(butcher, 'butcher na bitwisku');
  // moveObjectDirectly tworzy NOWY obiekt — szukamy po cardId i sile.
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'x-test' && o.power === 3 && o.zone === 'exile');
  assert.ok(exiled, 'stwór przeciwnika wygnany');
  assert.equal(state.objects.get('own')?.zone, 'battlefield', 'własny stwór nietknięty');
  // Zniszcz butcher komendą (przez execute → processTriggers → LTB trigger).
  const rKill = execute(state, { type: 'move_object', playerId: 'p1', objectId: butcher.id, toZone: 'graveyard', newObjectId: 'butcher-grave' });
  assert.ok(rKill.ok, 'move_object: ' + (rKill.events?.[0]?.reason ?? ''));
  passRounds(state, 2);
  const returned = [...state.objects.values()].find((o) => o.cardId === 'x-test' && o.zone === 'battlefield' && o.controllerId === 'p2' && o.power === 3);
  assert.ok(returned, 'wygnany stwór wrócił na bitwisko pod kontrolą właściciela');
});

function castPermanentViaCmd(state, objectId, extra = {}) {
  const cmd = { type: 'cast_permanent', playerId: 'p1', objectId, ...extra };
  const r = execute(state, cmd);
  assert.ok(r.ok, r.events?.[0]?.reason ?? '');
}

// ---------------------------------------------------------------- 2. Unbreakable Bond

test('Unbreakable Bond: reanimacja z lifelink counter (keyword lifelink)', () => {
  assertScryfall('unbreakable-bond');
  const state = newState();
  giveMana(state, 'p1', 5, { B: 2 });
  addCardFromRegistry(state, 'bond', 'unbreakable-bond', 'p1', 'hand');
  // stwór w grobie p1
  addCreature(state, 'dead', 'p1', 4, 4, { colors: ['G'] });
  moveObjectDirectly(state, 'dead', 'graveyard', 'dead-grave');
  const r = castSpell(state, 'p1', 'bond', ['dead-grave'], undefined, undefined);
  assert.ok(r, 'rzut');
  passRounds(state, 1);
  const revived = [...state.objects.values()].find((o) => o.cardId === 'x-test' && o.zone === 'battlefield');
  assert.ok(revived, 'stwór wrócił na bitwisko');
  assert.equal((revived.counters ?? {}).lifelink, 1, 'licznik lifelink na obiekcie');
  assert.ok(effectiveKeywords(revived, state).includes('lifelink'), 'keyword lifelink (CR 122.1b)');
});

// ---------------------------------------------------------------- 3. Spinewoods Paladin

test('Spinewoods Paladin: ETB gain 3 life + plot → cast z exile bez many', () => {
  assertScryfall('spinewoods-paladin');
  const state = newState();
  giveMana(state, 'p1', 6, { G: 2 });
  addCardFromRegistry(state, 'paladin', 'spinewoods-paladin', 'p1', 'hand');
  addLand(state, 'land1', 'p1');
  const rPlot = execute(state, { type: 'plot_card', playerId: 'p1', objectId: 'paladin' });
  assert.ok(rPlot.ok, 'plot: ' + (rPlot.events?.[0]?.reason ?? ''));
  const exiled = byCard(state, 'spinewoods-paladin', 'exile');
  assert.ok(exiled && exiled.plotted, 'karta w exile z plotem');
  // CR 702.136: plot wymaga "later turn" — w teście wymuszamy to przez
  // ustawienie plottedAtTurn na 0 (symulacja "karta zaplotowana w turze 0").
  const exiledObj = state.objects.get(exiled.id);
  if (exiledObj) state.objects.set(exiled.id, Object.freeze({ ...exiledObj, plottedAtTurn: 0 }));
  const manaBefore = state.players[0].mana;
  const v = playerView(state, 'p1');
  const castOffers = v.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === exiled.id);
  assert.ok(castOffers.length === 1, 'oferta cast_permanent z exile (plotted)');
  const r2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: exiled.id });
  assert.ok(r2.ok, 'cast z exile: ' + (r2.events?.[0]?.reason ?? ''));
  assert.equal(state.players[0].mana, manaBefore, 'cast zaplotowany bez many');
  passRounds(state, 3);
  const paladin = byCard(state, 'spinewoods-paladin', 'battlefield');
  assert.ok(paladin, 'paladyn na bitwisku');
  assert.equal(state.players[0].life, 23, 'ETB: +3 życia');
  assert.ok(effectiveKeywords(paladin, state).includes('trample'));
});

// ---------------------------------------------------------------- 4. Tome Scour

test('Tome Scour: target player mills 5', () => {
  assertScryfall('tome-scour');
  const state = newState();
  giveMana(state, 'p1', 1, { U: 1 });
  addCardFromRegistry(state, 'scour', 'tome-scour', 'p1', 'hand');
  for (let i = 0; i < 6; i += 1) {
    addObject(state, { id: `lib-${i}`, instanceId: `i-l${i}`, cardId: 'x-card', controllerId: 'p2', zone: 'library', kind: 'card', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `C${i}` });
  }
  state.zones.library = ['lib-0', 'lib-1', 'lib-2', 'lib-3', 'lib-4', 'lib-5'];
  const r = castSpell(state, 'p1', 'scour', ['p2'], undefined, undefined);
  assert.ok(r, 'rzut na p2');
  passRounds(state, 1);
  const inGrave = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p2').length;
  assert.equal(inGrave, 5, '5 kart zmillowanych');
  assert.equal(state.zones.library.length, 1, 'została 1 karta');
});

// ---------------------------------------------------------------- 5. Goblin Battle Jester

test('Goblin Battle Jester: rzucenie czerwonego czaru → cel nie może blokować', () => {
  assertScryfall('goblin-battle-jester');
  const state = newState();
  addCardFromRegistry(state, 'jester', 'goblin-battle-jester', 'p1', 'battlefield');
  addCreature(state, 'blocker', 'p2', 2, 3, { colors: ['W'] });
  // rzuć czerwony czar (Brute Force — {R} instant)
  giveMana(state, 'p1', 1, { R: 1 });
  addCardFromRegistry(state, 'brute', 'brute-force', 'p1', 'hand');
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'brute', targets: ['blocker'] });
  assert.ok(r.ok, 'czerwony czar rzucony: ' + (r.events?.[0]?.reason ?? ''));
  // trigger Jestera (when_you_cast_spell + red) z requiresTarget
  assert.ok(state.pendingTriggerTargets.length >= 1, 'trigger czeka na cel');
  const rr = resolveTriggerTarget(state, 'blocker');
  assert.ok(rr && rr.ok, 'cel wybrany');
  passRounds(state, 2);
  assert.equal(state.objects.get('blocker').cantBlock, true, 'stwór nie może blokować');
});

// ---------------------------------------------------------------- 6. Brawler's Plate

test("Brawler's Plate: equip → +2/+2 i trample", () => {
  assertScryfall('brawlers-plate');
  const state = newState();
  giveMana(state, 'p1', 4, {});
  addCardFromRegistry(state, 'plate', 'brawlers-plate', 'p1', 'battlefield');
  addCreature(state, 'bear', 'p1', 2, 2, { colors: ['G'] });
  const offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'plate');
  assert.equal(offers.length, 1, 'equip oferowany');
  const act = activateAbility(state, 'p1', 'plate', offers[0].abilityIndex, undefined, ['bear']);
  assert.ok(act, 'equip wykonany');
  const bear = state.objects.get('bear');
  assert.equal(effectivePower(bear, state), 4, '+2 siły');
  assert.equal(effectiveKeywords(bear, state).includes('trample'), true, 'trample');
});

// ---------------------------------------------------------------- 7. Glitch Ghost Surveyor

test('Glitch Ghost Surveyor: speed start + wzrost + max speed draw', () => {
  assertScryfall('glitch-ghost-surveyor');
  const state = newState();
  giveMana(state, 'p1', 3, { U: 2 });
  addCardFromRegistry(state, 'surveyor', 'glitch-ghost-surveyor', 'p1', 'hand');
  castPermanentViaCmd(state, 'surveyor');
  passRounds(state, 3);
  assert.equal(state.players[0].speed, 1, 'start your engines: speed 1');
  // Wzrost speed: przeciwnik traci życie w turze p1 (obrażenia niecombat).
  // Najpierw zagraj weldera ({2}), POTEM daj manę na aktywację ({3}{R}).
  addCardFromRegistry(state, 'welder', 'welder-automaton', 'p1', 'hand');
  giveMana(state, 'p1', 2, {});
  castPermanentViaCmd(state, 'welder');
  passRounds(state, 1);
  giveMana(state, 'p1', 4, { R: 1 });
  const welderId = byCard(state, 'welder-automaton', 'battlefield').id;
  const wOffers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === welderId);
  assert.equal(wOffers.length, 1, 'zdolność weldera oferowana');
  const rAct = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: welderId, abilityIndex: wOffers[0].abilityIndex });
  assert.ok(rAct.ok, 'aktywacja weldera: ' + (rAct.events?.[0]?.reason ?? ''));
  passRounds(state, 1); // D: zdolność na stosie → obrażenia po rozstrzygnięciu
  assert.equal(state.players[0].speed, 2, 'speed wzrosło po obrażeniach przeciwnika');
  // max speed nieosiągnięte — zdolność z grobu NIEdostępna
  const surveyor = byCard(state, 'glitch-ghost-surveyor', 'battlefield');
  moveObjectDirectly(state, surveyor.id, 'graveyard', 'surveyor-grave');
  giveMana(state, 'p1', 3, {});
  const gOffers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'surveyor-grave');
  assert.equal(gOffers.length, 0, 'max speed: zdolność z grobu niedostępna przy speed<4');
  // Dobić speed do 4 (kolejne obrażenia w tej samej turze nie działają — raz
  // na turę; symulujemy przez ustawienie i sprawdzenie warunku).
  state.players[0].speed = 4;
  const gOffers2 = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'surveyor-grave');
  assert.equal(gOffers2.length, 1, 'max speed: zdolność dostępna przy speed 4');
  // Biblioteka p1 (do dobrania karty)
  for (let i = 0; i < 3; i += 1) {
    addObject(state, { id: `plib-${i}`, instanceId: `i-pl${i}`, cardId: 'x-lib', controllerId: 'p1', zone: 'library', kind: 'card', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `L${i}` });
  }
  state.zones.library = [...state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1')];
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  activateAbility(state, 'p1', gOffers2[0].objectId, gOffers2[0].abilityIndex, undefined);
  passRounds(state, 1); // D: zdolność na stosie → dobranie po rozstrzygnięciu
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 1, 'dobrano kartę');
  assert.equal(byCard(state, 'glitch-ghost-surveyor', 'graveyard'), undefined, 'karta wygnana z grobu (koszt)');
});

// ---------------------------------------------------------------- 8. Mystic Sanctuary

test('Mystic Sanctuary: enters tapped bez 3+ Islands; untapped z 3+; ETB put instant na wierzch', () => {
  assertScryfall('mystic-sanctuary');
  // (a) mniej niż 3 wyspy → wchodzi tapped
  const state = newState();
  addLand(state, 'is1', 'p1', { subtype: 'Island', color: 'U' });
  addLand(state, 'is2', 'p1', { subtype: 'Island', color: 'U' });
  addCardFromRegistry(state, 'sanct', 'mystic-sanctuary', 'p1', 'hand');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'sanct' });
  assert.ok(r.ok, 'land drop: ' + (r.events?.[0]?.reason ?? ''));
  const sanc = byCard(state, 'mystic-sanctuary', 'battlefield');
  assert.equal(sanc.tapped, true, 'wchodzi tapped przy 2 wyspach');
  // (b) 3+ wyspy → untapped + ETB może położyć instant z grobu na wierzch
  const state2 = newState();
  addLand(state2, 'is1', 'p1', { subtype: 'Island', color: 'U' });
  addLand(state2, 'is2', 'p1', { subtype: 'Island', color: 'U' });
  addLand(state2, 'is3', 'p1', { subtype: 'Island', color: 'U' });
  addCardFromRegistry(state2, 'sanct', 'mystic-sanctuary', 'p1', 'hand');
  // instant w grobie p1
  addCardFromRegistry(state2, 'curate', 'curate', 'p1', 'hand');
  moveObjectDirectly(state2, 'curate', 'graveyard', 'curate-grave');
  const r2 = execute(state2, { type: 'play_land', playerId: 'p1', objectId: 'sanct' });
  assert.ok(r2.ok, 'land drop: ' + (r2.events?.[0]?.reason ?? ''));
  const sanc2 = byCard(state2, 'mystic-sanctuary', 'battlefield');
  assert.equal(sanc2.tapped, false, 'wchodzi untapped przy 3+ wyspach');
  assert.ok(state2.pendingTriggerTargets.length >= 1, 'ETB trigger z requiresTarget (may)');
  const rr = resolveTriggerTarget(state2, 'curate-grave');
  assert.ok(rr && rr.ok, 'cel: instant z grobu');
  passRounds(state2, 2);
  const top = state2.zones.library[0];
  assert.equal(state2.objects.get(top)?.cardId, 'curate', 'instant na wierzchu biblioteki');
});

// ---------------------------------------------------------------- 9. Willbender

test('Willbender: morph flip → redirect celu czaru na stosie', () => {
  assertScryfall('willbender');
  const state = newState();
  giveMana(state, 'p1', 3, {});
  addCardFromRegistry(state, 'wb', 'willbender', 'p1', 'hand');
  // Zagraj twarzą w dół ({3} bezbarwne — morph)
  castPermanentViaCmd(state, 'wb', { faceDown: true });
  passRounds(state, 1);
  const fd = byCard(state, 'willbender', 'battlefield');
  assert.ok(fd && fd.faceDown, 'willbender twarzą w dół');
  // NAJPIERW czar na stosie (Shatter na artA), POTEM flip — w MtG trigger
  // Willbendera wybiera cel w chwili wejścia na stos (CR 603.3d), więc czar
  // musi już tam być.
  giveMana(state, 'p1', 2, { R: 1 });
  addCardFromRegistry(state, 'shatter', 'shatter', 'p1', 'hand');
  addObject(state, { id: 'artA', instanceId: 'i-a', cardId: 'x-art', controllerId: 'p2', zone: 'battlefield', kind: 'artifact', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [] });
  addObject(state, { id: 'artB', instanceId: 'i-b', cardId: 'x-art2', controllerId: 'p2', zone: 'battlefield', kind: 'artifact', power: null, toughness: null, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [] });
  const rCast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shatter', targets: ['artA'] });
  assert.ok(rCast.ok, 'Shatter na artA: ' + (rCast.events?.[0]?.reason ?? ''));
  const shatterStackId = state.zones.stack[state.zones.stack.length - 1];
  // Obróć Willbendera za {1}{U} (przez execute — processTriggers odpali trigger)
  giveMana(state, 'p1', 2, { U: 1 });
  const flipOffers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === fd.id);
  assert.equal(flipOffers.length, 1, 'flip oferowany');
  const rFlip = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: fd.id, abilityIndex: flipOffers[0].abilityIndex });
  assert.ok(rFlip.ok, 'flip: ' + (rFlip.events?.[0]?.reason ?? ''));
  // Trigger Willbendera czeka na cel (czar na stosie z jednym celem)
  assert.ok(state.pendingTriggerTargets.length >= 1, 'trigger turned_face_up czeka na cel');
  const rr = resolveTriggerTarget(state, shatterStackId);
  assert.ok(rr && rr.ok, 'wybrano czar do przekierowania');
  passRounds(state, 1); // trigger na stosie -> rozstrzygnięcie -> redirect_choice
  assert.ok(state.pendingRedirectChoice, 'redirect czeka na wybór nowego celu');
  const v = playerView(state, 'p1');
  const offers = v.legalCommands.filter((c) => c.type === 'resolve_redirect_choice');
  assert.ok(offers.length >= 1, 'oferta nowego celu');
  const newTarget = offers.find((c) => c.targetId === 'artB');
  assert.ok(newTarget, 'artB wśród kandydatów');
  const rRedir = execute(state, { type: 'resolve_redirect_choice', playerId: 'p1', targetId: 'artB' });
  assert.ok(rRedir.ok, 'redirect: ' + (rRedir.events?.[0]?.reason ?? ''));
  passRounds(state, 2); // czar rozstrzyga się z NOWYM celem
  assert.equal(state.objects.get('artA')?.zone, 'battlefield', 'artA ocalało (cel zmieniony)');
  assert.notEqual(state.objects.get('artB')?.zone, 'battlefield', 'artB zniszczone (nowy cel)');
});

// ---------------------------------------------------------------- 10. Scion Summoner

test('Scion Summoner: ETB token Eldrazi Scion, sacrifice → Add {C}', () => {
  assertScryfall('scion-summoner');
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addCardFromRegistry(state, 'scion', 'scion-summoner', 'p1', 'hand');
  castPermanentViaCmd(state, 'scion');
  passRounds(state, 3);
  const token = [...state.objects.values()].find((o) => o.name === 'Eldrazi Scion' && o.zone === 'battlefield');
  assert.ok(token, 'token Eldrazi Scion na bitwisku');
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  const manaBefore = state.players[0].mana;
  const offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === token.id);
  assert.equal(offers.length, 1, 'zdolność sacrifice oferowana');
  const act = activateAbility(state, 'p1', token.id, offers[0].abilityIndex, undefined);
  assert.ok(act, 'sacrifice: ' + (act?.type ?? ''));
  assert.equal(state.players[0].mana, manaBefore + 1, 'Add {C}');
  assert.notEqual(state.objects.get(token.id)?.zone, 'battlefield', 'token poświęcony');
});
