// M182 — Batch 43 (lista właściciela 2026-08-22).
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
import { effectiveAbilityManaCost } from '../src/engine/abilities.js';

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

// transformTo materializuje się w createCardDeck (nie w gameObjectDataOf) —
// testy wstawiające DFC przez addObject budują deskryptor drugiej strony same
// (ten sam kształt co materialize.js).
function transformDescriptor(cardId) {
  const back = REGISTRY.get(cardId);
  return {
    cardId: back.id, kind: gameObjectDataOf(back).kind, power: back.power, toughness: back.toughness,
    abilities: back.abilities ?? [], keywords: back.keywords ?? [], subtypes: back.subtypes ?? [],
    types: back.types ?? [], manaCost: back.manaCost ?? 0, cardName: back.name,
  };
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

test('B43/1: Greenwood Sentinel — 2/2 Elf Scout z czujnością', () => {
  const def = REGISTRY.get('greenwood-sentinel');
  assert.deepEqual(def.keywords, ['vigilance']);
  assert.deepEqual(def.subtypes, ['Elf', 'Scout']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  assert.equal(def.artId, 169);
  assert.equal(def.plan, 'Śródziemie');
});

test('B43/2: Fleeting Distraction — cel dostaje −1/−0, rzucający dobiera kartę', () => {
  const state = game('p1');
  putCard(state, 'fd', 'fleeting-distraction', 'p1', 'hand');
  putCard(state, 'grizzly', 'highland-game', 'p2');
  putCard(state, 'lib1', 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fd');
  assert.ok(cast, 'oferta rzutu w cel przeciwnika');
  assert.ok(execute(state, { ...cast, targets: ['grizzly'] }).ok);
  assert.ok(resolveStack(state));
  const target = state.objects.get('grizzly');
  assert.equal(effectivePower(target, state), 1, 'moc 2−1=1');
  assert.equal(effectiveToughness(target, state), 1, 'wytrzymałość bez zmian (Highland Game 2/1)');
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore, 'czar wyszedł z ręki (−1), karta dobrana (+1)');
});

test('B43/3: Tireless Hauler — daybound/nightbound: transform przy zapadnięciu nocy', () => {
  const front = REGISTRY.get('tireless-hauler');
  const back = REGISTRY.get('dire-strain-brawler');
  assert.deepEqual(front.keywords, ['vigilance', 'daybound']);
  assert.deepEqual(back.keywords, ['vigilance', 'nightbound']);
  assert.equal(front.transformTo, 'dire-strain-brawler');
  assert.equal(back.transformTo, 'tireless-hauler');
  assert.equal(back.support.status, 'limited', 'tylna strona nie jest taliowalna');
  // Wejście na pole bitwy w NOCY: daybound wchodzi od razu nightbound stroną
  // (CR 708.9 — „Permanents enter the battlefield nightbound").
  const state = game('p1');
  state.dayNight = 'night';
  putCard(state, 'hauler', 'tireless-hauler', 'p1', 'hand', { transformTo: transformDescriptor('dire-strain-brawler') });
  addMana(state, 'p1', 5, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'hauler');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const onBoard = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.kind === 'creature' && o.controllerId === 'p1');
  assert.equal(onBoard.cardId, 'dire-strain-brawler', 'w nocy wchodzi tylną stroną');
  assert.equal(onBoard.power, 6);
  assert.equal(onBoard.toughness, 6);
});

test("B43/4: Dispeller's Capsule — {2}{W}, {T}, sacrifice: niszczy enchantment", () => {
  const state = game('p1');
  putCard(state, 'capsule', 'dispellers-capsule', 'p1');
  putCard(state, 'curse', 'curse-of-the-pierced-heart', 'p2', 'battlefield', { kind: 'enchantment' });
  addMana(state, 'p1', 3, { colors: ['W'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'capsule');
  assert.ok(offers.length > 0, 'oferta aktywacji kapsuły');
  const cmd = offers.find((c) => (c.targets ?? []).includes('curse')) ?? { ...offers[0], targets: ['curse'] };
  assert.ok(execute(state, cmd).ok, 'aktywacja przechodzi');
  assert.ok(resolveStack(state));
  const curse = [...state.objects.values()].find((o) => o.cardId === 'curse-of-the-pierced-heart');
  assert.equal(curse.zone, 'graveyard', 'enchantment zniszczony');
  const capsule = [...state.objects.values()].find((o) => o.cardId === 'dispellers-capsule');
  assert.equal(capsule.zone, 'graveyard', 'kapsuła poświęcona (koszt)');
});

test('B43/5: Sleep of the Dead — tapuje cel i blokuje najbliższe odkręcenie; Escape z grobu', () => {
  const state = game('p1');
  putCard(state, 'sleep', 'sleep-of-the-dead', 'p1', 'hand');
  putCard(state, 'grizzly', 'highland-game', 'p2');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'sleep');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, { ...cast, targets: ['grizzly'] }).ok);
  assert.ok(resolveStack(state));
  const grizzly = state.objects.get('grizzly');
  assert.equal(grizzly.tapped, true, 'cel tapnięty');
  assert.equal(grizzly.dontUntapNextUntapStep, 'p2', 'jednorazowa blokada odkręcenia');
  // Czar w grobie + 3 inne karty → oferta Escape {2}{U} z wygnaniem 3 kart.
  const inGrave = [...state.objects.values()].find((o) => o.cardId === 'sleep-of-the-dead' && o.zone === 'graveyard');
  assert.ok(inGrave, 'czar po rozstrzygnięciu w grobie');
  putCard(state, 'g1', 'highland-game', 'p1', 'graveyard');
  putCard(state, 'g2', 'highland-game', 'p1', 'graveyard');
  putCard(state, 'g3', 'highland-game', 'p1', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['U'] });
  const esc = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_escape' && c.objectId === inGrave.id);
  assert.ok(esc, 'oferta Escape z grobu');
  assert.equal((esc.escapeExileIds ?? []).length, 3, 'koszt: wygnanie 3 innych kart');
});

// ---- Transza B ----------------------------------------------------------------

test('B43/6: Severed Strands — zysk życia = wytrzymałość poświęconego, cel zniszczony', () => {
  const state = game('p1');
  putCard(state, 'strands', 'severed-strands', 'p1', 'hand');
  putCard(state, 'mine', 'alaborn-trooper', 'p1'); // 2/3 — toughness 3
  putCard(state, 'theirs', 'highland-game', 'p2');
  addMana(state, 'p1', 2, { colors: ['B'] });
  const life0 = lifeOf(state, 'p1');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'strands' && c.sacrificeTargetId === 'mine');
  assert.ok(cast, 'oferta z wariantem poświęcenia własnego stwora');
  assert.ok(execute(state, { ...cast, targets: ['theirs'] }).ok);
  const sacd = [...state.objects.values()].find((o) => o.cardId === 'alaborn-trooper');
  assert.equal(sacd.zone, 'graveyard', 'poświęcenie to KOSZT — przed rozstrzygnięciem');
  assert.ok(resolveStack(state));
  assert.equal(lifeOf(state, 'p1'), life0 + 3, 'zysk życia = wytrzymałość poświęconego (3)');
  const theirs = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.ownerId === 'p2');
  assert.equal(theirs.zone, 'graveyard', 'cel przeciwnika zniszczony');
});

test('B43/7: Severed Strands — nielegalny cel przy rozstrzygnięciu: czar fizzluje BEZ zysku życia', () => {
  const state = game('p1');
  putCard(state, 'strands', 'severed-strands', 'p1', 'hand');
  putCard(state, 'mine', 'alaborn-trooper', 'p1');
  putCard(state, 'theirs', 'highland-game', 'p2');
  addMana(state, 'p1', 2, { colors: ['B'] });
  const life0 = lifeOf(state, 'p1');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'strands' && c.sacrificeTargetId === 'mine');
  assert.ok(execute(state, { ...cast, targets: ['theirs'] }).ok);
  // Cel znika, zanim czar się rozstrzygnie (CR 608.2b) — cały czar fizzluje.
  applyEffect(state, { type: 'destroy_permanent' }, state.objects.get('mine'), ['theirs']);
  assert.ok(resolveStack(state));
  assert.equal(lifeOf(state, 'p1'), life0, 'fizzle: żaden efekt nie działa — bez zysku życia');
});

test('B43/8: Rush of Battle — +2/+1 dla wszystkich, lifelink TYLKO dla Warriorów', () => {
  const state = game('p1');
  putCard(state, 'rush', 'rush-of-battle', 'p1', 'hand');
  putCard(state, 'warrior', 'crew-captain', 'p1');   // Human Warrior 4/2
  putCard(state, 'deer', 'highland-game', 'p1');     // Deer 2/2 — nie-Warrior
  addMana(state, 'p1', 4, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'rush');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const warrior = state.objects.get('warrior');
  const deer = state.objects.get('deer');
  assert.equal(effectivePower(warrior, state), 6, 'Warrior 4+2');
  assert.equal(effectiveToughness(warrior, state), 3, 'Warrior 2+1');
  assert.equal(effectivePower(deer, state), 4, 'nie-Warrior 2+2');
  assert.equal(effectiveToughness(deer, state), 2, 'nie-Warrior 1+1 (Highland Game 2/1)');
  assert.ok(effectiveKeywords(warrior, state).includes('lifelink'), 'Warrior zyskuje lifelink');
  assert.ok(!effectiveKeywords(deer, state).includes('lifelink'), 'nie-Warrior BEZ lifelinka');
});

test('B43/9: Forced Landing — cel z lataniem na SPÓD biblioteki właściciela', () => {
  const state = game('p1');
  putCard(state, 'fl', 'forced-landing', 'p1', 'hand');
  putCard(state, 'bird', 'swooping-protector', 'p2'); // flying
  putCard(state, 'deer', 'highland-game', 'p2');      // bez flying
  putCard(state, 'lib1', 'highland-game', 'p2', 'library');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'fl');
  assert.ok(casts.some((c) => (c.targets ?? []).includes('bird')), 'stwór z lataniem jest celem');
  assert.ok(!casts.some((c) => (c.targets ?? []).includes('deer')), 'stwór bez latania NIE jest celem');
  assert.ok(execute(state, { ...casts[0], targets: ['bird'] }).ok);
  assert.ok(resolveStack(state));
  const bird = [...state.objects.values()].find((o) => o.cardId === 'swooping-protector');
  assert.equal(bird.zone, 'library', 'ptak w bibliotece');
  assert.equal(bird.controllerId, 'p2', 'w bibliotece WŁAŚCICIELA');
  const libIds = state.zones.library;
  assert.equal(libIds[libIds.length - 1], bird.id, 'na SPODZIE (ostatni element strefy)');
});

test('B43/10: Forced Landing — token z lataniem przestaje istnieć (CR 111.7)', () => {
  const state = game('p1');
  const src = putCard(state, 'dummy', 'highland-game', 'p1');
  putCard(state, 'tok', 'swooping-protector', 'p2', 'battlefield');
  state.objects.set('tok', Object.freeze({ ...state.objects.get('tok'), isToken: true }));
  applyEffect(state, { type: 'bounce_to_library_bottom' }, src, ['tok']);
  assert.ok(!state.objects.has('tok'), 'token skasowany od razu');
  assert.ok(state.events.some((e) => e.type === 'token_ceased_to_exist'), 'zdarzenie token_ceased_to_exist');
  assert.ok(!state.zones.library.includes('tok'), 'token NIE trafił do biblioteki');
});

test("B43/11: Sea God's Scorn — do trzech celów: stwory i/lub enchantmenty wracają do rąk właścicieli", () => {
  const state = game('p1');
  putCard(state, 'scorn', 'sea-gods-scorn', 'p1', 'hand');
  putCard(state, 'their-creature', 'highland-game', 'p2');
  putCard(state, 'their-ench', 'curse-of-the-pierced-heart', 'p2', 'battlefield', { kind: 'enchantment' });
  putCard(state, 'my-creature', 'alaborn-trooper', 'p1');
  addMana(state, 'p1', 6, { colors: ['U', 'U'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'scorn');
  assert.ok(casts.length > 0, 'oferty czaru modalnego z variableTargets');
  const triple = casts.find((c) => (c.targets ?? []).length === 3
    && c.targets.includes('their-creature') && c.targets.includes('their-ench') && c.targets.includes('my-creature'));
  assert.ok(triple, 'wariant z trzema celami (stwór + enchantment + własny stwór)');
  assert.ok(execute(state, triple).ok);
  assert.ok(resolveStack(state));
  assert.equal(state.objects.get('their-creature')?.zone ?? [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.ownerId === 'p2')?.zone, 'hand');
  assert.equal([...state.objects.values()].find((o) => o.cardId === 'curse-of-the-pierced-heart')?.zone, 'hand', 'enchantment w ręce właściciela');
  assert.equal([...state.objects.values()].find((o) => o.cardId === 'alaborn-trooper')?.zone, 'hand', 'własny stwór też wraca (cel dozwolony)');
});

// ---- Transza C ----------------------------------------------------------------

test('B43/12: Balamb Garden, SeeD Academy — transform za {5}{G}{U}; redukcja za INNE Towny', () => {
  const state = game('p1');
  putCard(state, 'balamb', 'balamb-garden-seed-academy', 'p1', 'battlefield', {
    transformTo: transformDescriptor('balamb-garden-airborne'),
  });
  const balamb = state.objects.get('balamb');
  const transformAbility = balamb.abilities[1];
  assert.equal(effectiveAbilityManaCost(state, 'p1', transformAbility, balamb), 7, 'bez innych Townów pełny koszt {5}{G}{U}');
  // Drugi Town (syntetyczny patch) → koszt 6 ({1} mniej za każdy INNY Town).
  putCard(state, 'town2', 'highland-game', 'p1', 'battlefield', { subtypes: ['Town'] });
  state.objects.set('town2', Object.freeze({ ...state.objects.get('town2'), subtypes: Object.freeze(['Town']) }));
  assert.equal(effectiveAbilityManaCost(state, 'p1', transformAbility, balamb), 6, 'jeden inny Town = {1} mniej');
  // Aktywacja: mana {G}{U}+5, tap; po rozstrzygnięciu — tylna strona Vehicle.
  addMana(state, 'p1', 3, { colors: ['G'] });
  addMana(state, 'p1', 3, { colors: ['U'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'balamb' && c.abilityIndex === 1);
  assert.ok(offers.length > 0, 'oferta transformacji przy 6 manie (koszt zredukowany do 6)');
  assert.ok(execute(state, offers[0]).ok);
  assert.ok(resolveStack(state));
  const after = state.objects.get('balamb');
  assert.equal(after.cardId, 'balamb-garden-airborne', 'tylna strona po transformacji');
  assert.deepEqual([...after.types], ['Legendary', 'Artifact'], 'Legendary Artifact');
  assert.deepEqual([...after.subtypes], ['Vehicle'], 'Vehicle');
  assert.equal(after.power, 5);
  assert.equal(after.toughness, 4);
});

test('B43/13: Balamb Garden, Airborne — Crew 1 animuje; trigger ataku dobiera kartę', () => {
  const back = REGISTRY.get('balamb-garden-airborne');
  assert.equal(back.support.status, 'limited', 'tylna strona nie jest taliowalna');
  assert.deepEqual(back.keywords, ['flying']);
  assert.equal(back.abilities[0].trigger.event, 'attacks', 'trigger ataku');
  assert.equal(back.abilities[1].cost.crewPower, 1, 'Crew 1');
  const state = game('p1');
  putCard(state, 'vehicle', 'balamb-garden-airborne', 'p1', 'battlefield', { kind: 'artifact' });
  putCard(state, 'pilot', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'vehicle');
  assert.ok(offers.length > 0, 'oferta crew');
  assert.ok(execute(state, offers[0]).ok, 'crew przechodzi');
  assert.ok(resolveStack(state));
  const vehicle = state.objects.get('vehicle');
  assert.equal(vehicle.kind, 'creature', 'Vehicle staje się artefaktowym stworem');
  assert.equal(state.objects.get('pilot').tapped, true, 'pilot tapnięty kosztem crew');
});
