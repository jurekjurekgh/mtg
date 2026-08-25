// Batch 49 (2026-08-25) — 10 kart z listy właściciela (pozycje 557–566).
// Dane Oracle: docs/cards/scryfall-*.json (pobrane 2026-08-25).
//
// Cztery karty wymagały ROZSZERZENIA silnika (nie nowej architektury):
//   - Kishla Village    → wariant `controls_land_subtype_any` w resources.js
//   - Time to Feed      → efekt `gain_life_if_target_dies_this_turn` (CR 603.7a)
//   - Dead Ringers      → efekt `destroy_pair_if_same_colors` + cel `nonblack_creature`
//   - Creakwood Safewright → intervening-if `subtypeCardInYourGraveyard`/`selfHasCounter`
// Pozostałe 6 leży na istniejących wzorcach (Heap Gate, Greatsword of Tyr,
// Warrior's Sword, token Powerstone, static pump warunkowy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 49, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function lands(state, n, cardId = 'basic-island', controllerId = 'p1') {
  const subtype = { 'basic-island': 'Island', 'basic-swamp': 'Swamp', 'basic-forest': 'Forest',
    'basic-mountain': 'Mountain', 'basic-plains': 'Plains' }[cardId];
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `${cardId}-${controllerId}-${i}`, instanceId: `i-l${cardId}${controllerId}${i}`,
      cardId, controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: [subtype],
    });
  }
}

/**
 * Obiekt po cardId (i opcjonalnie właścicielu). Zmiana strefy tworzy NOWE id,
 * więc po rozstrzygnięciu czaru nie wolno szukać po id z `put()`.
 */
function byCard(state, cardId, ownerId = null) {
  return [...state.objects.values()]
    .find((o) => o.cardId === cardId && (ownerId === null || o.ownerId === ownerId));
}

/** Pass obu graczy — popycha grę o jedno okno priorytetu. */
function passBoth(state) {
  for (const playerId of [state.turn.priorityPlayerId, state.turn.priorityPlayerId]) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) return;
    execute(state, pass);
    void playerId;
  }
}

/**
 * Doprowadza grę DO kroku końcowego aktywnego gracza. Trigger `end_step`
 * odpala zdarzenie `step_advanced`, więc test musi w ten krok WEJŚĆ —
 * ustawienie `jumpToStep(..., 'end')` na starcie nic nie odpala.
 */
function wejdzWEndStep(state) {
  state.turn = jumpToStep(state.turn, 'end_of_combat', state.turn.activePlayerId);
  for (let i = 0; i < 10 && state.turn.step !== 'end'; i += 1) passBoth(state);
  assert.equal(state.turn.step, 'end', 'gra weszła w krok końcowy');
}

/** Rozstrzyga stos do końca (pass obu stron). */
function resolveStack(state, limit = 16) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

// ---- Transza A: karty na istniejących wzorcach -----------------------------

test('B49/A1: Shock — {R} instant, 2 obrażenia w dowolny cel', () => {
  const card = REGISTRY.get('shock');
  assert.equal(card.manaCost, 1);
  assert.deepEqual(card.colors, ['R']);
  assert.equal(card.spell.timing, 'instant');
  assert.deepEqual(card.spell.targets, [{ type: 'any_target' }]);
  assert.deepEqual(card.spell.effects, [{ type: 'damage', amount: 2 }]);
});

test('B49/A2: Shock — pełna ścieżka: 2 obrażenia zabijają stwora 2/2', () => {
  const state = game('p1');
  put(state, 'wrog', 'razorfoot-griffin', 'p2');
  put(state, 'spell', 'shock', 'p1', 'hand');
  lands(state, 1, 'basic-mountain');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && (c.targets ?? []).includes('wrog'));
  assert.ok(cast, 'oferta rzutu Shocka w stwora wroga');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(byCard(state, 'razorfoot-griffin', 'p2').zone, 'graveyard',
    'Griffin 2/2 ginie od 2 obrażeń');
});

test('B49/A3: Razorfoot Griffin — 2/2 flying + first strike', () => {
  const card = REGISTRY.get('razorfoot-griffin');
  assert.deepEqual([card.power, card.toughness], [2, 2]);
  assert.equal(card.manaCost, 4);
  assert.deepEqual(card.keywords, ['flying', 'first_strike']);
  assert.deepEqual(card.subtypes, ['Griffin']);
});

test('B49/A4: Gaelicat — +2/+0 dopiero przy dwóch artefaktach', () => {
  const card = REGISTRY.get('gaelicat');
  assert.deepEqual([card.power, card.toughness], [1, 3]);
  assert.deepEqual(card.keywords, ['flying', 'vigilance']);
  const stat = card.abilities.find((a) => a.condition?.minArtifactsControlled === 2);
  assert.ok(stat, 'statyczny warunek na 2+ artefaktach');
  assert.deepEqual([stat.pump.power, stat.pump.toughness], [2, 0]);

  // 0 artefaktów → 1/3; 1 artefakt → wciąż 1/3; 2 artefakty → 3/3.
  const state = game('p1');
  put(state, 'cat', 'gaelicat', 'p1');
  assert.equal(effectivePower(state.objects.get('cat'), state), 1, 'bez artefaktów 1/3');
  put(state, 'art1', 'mana-cylix', 'p1');
  assert.equal(effectivePower(state.objects.get('cat'), state), 1, 'jeden artefakt to za mało');
  put(state, 'art2', 'mana-cylix', 'p1');
  assert.equal(effectivePower(state.objects.get('cat'), state), 3, 'dwa artefakty → +2/+0');
  assert.equal(effectiveToughness(state.objects.get('cat'), state), 3, 'wytrzymałość bez zmian');
});

test('B49/A5: Mana Cylix — {1},{T}: mana dowolnego koloru', () => {
  const card = REGISTRY.get('mana-cylix');
  assert.equal(card.manaCost, 1);
  assert.deepEqual(card.types, ['Artifact']);
  const ability = card.abilities[0];
  assert.deepEqual(ability.cost, { mana: 1, tap: true });
  assert.equal(ability.effect.type, 'add_mana');
  assert.deepEqual(ability.effect.colors, ['W', 'U', 'B', 'R', 'G'], 'WUBRG = „any color”');
});

test('B49/A6: Koilos Roc — flash, flying, ETB tapnięty Powerstone', () => {
  const card = REGISTRY.get('koilos-roc');
  assert.deepEqual([card.power, card.toughness], [3, 3]);
  assert.deepEqual(card.keywords, ['flash', 'flying']);
  const etb = card.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  const effects = Array.isArray(etb.effect) ? etb.effect : [etb.effect];
  assert.equal(effects[0].type, 'create_token');
  assert.equal(effects[0].cardId, 'token_powerstone');
  assert.equal(effects[0].tapped, true, 'Oracle: „create a TAPPED Powerstone token”');
});

test('B49/A7: Koilos Roc — pełna ścieżka ETB tworzy tapnięty Powerstone', () => {
  const state = game('p1');
  put(state, 'roc', 'koilos-roc', 'p1', 'hand');
  lands(state, 5, 'basic-island');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'roc');
  assert.ok(cast, 'oferta rzutu Koilos Roc');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const stones = [...state.objects.values()]
    .filter((o) => o.cardId === 'token_powerstone' && o.zone === 'battlefield');
  assert.equal(stones.length, 1, 'dokładnie jeden Powerstone');
  assert.equal(stones[0].tapped, true, 'token wchodzi zatapnięty');
});

test('B49/A8: White Mage\u2019s Staff — job select, +1/+1, Cleric, equip {3}', () => {
  const card = REGISTRY.get('white-mages-staff');
  assert.deepEqual(card.subtypes, ['Equipment']);
  assert.deepEqual([card.equipment.pump.power, card.equipment.pump.toughness], [1, 1]);
  assert.deepEqual(card.equipment.subtypes, ['Cleric'], 'nosiciel jest dodatkowo Clericem');
  assert.equal(card.equipment.equip, 3);
  assert.ok(card.abilities.some((a) => a.effect?.type === 'job_select'), 'ETB job select');
  const attack = card.abilities.find((a) => a.trigger?.event === 'equipped_creature_attacks');
  assert.ok(attack, 'trigger ataku nosiciela');
  assert.deepEqual((Array.isArray(attack.effect) ? attack.effect : [attack.effect]),
    [{ type: 'gain_life', amount: 1 }], 'Oracle: „you gain 1 life”');
});

test('B49/A9: White Mage\u2019s Staff — job select tworzy Hero i przypina do niego ekwipunek', () => {
  const state = game('p1');
  put(state, 'staff', 'white-mages-staff', 'p1', 'hand');
  lands(state, 2, 'basic-plains');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'staff');
  assert.ok(cast, 'oferta rzutu ekwipunku');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const hero = [...state.objects.values()]
    .find((o) => o.cardId === 'token_hero' && o.zone === 'battlefield');
  assert.ok(hero, 'token Hero 1/1 powstał');
  assert.equal(byCard(state, 'white-mages-staff', 'p1').attachedTo, hero.id,
    'ekwipunek przypięty do Hero');
  // +1/+1 z ekwipunku: Hero 1/1 → 2/2.
  assert.equal(effectivePower(hero, state), 2, 'Hero dostaje +1/+1');
  assert.equal(effectiveToughness(hero, state), 2);
});

test('B49/A10 (M212/Z4): White Mage\u2019s Staff — atak Hero DAJE 1 życie i NIE pyta o cel', () => {
  // Audyt Żywym Testerem (/tmp/g6.txt): trigger „Whenever equipped creature
  // attacks, you gain 1 life" prosił o cel („można odmówić"), gracz odmawiał
  // i trigger kończył jako „bez efektu" — karta NIGDY nie dawała życia.
  // Przyczyna: ścieżka `equipped_creature_attacks` wstawiała na sztywno spec
  // celu Greatsword of Tyr każdej zdolności z tym eventem (ADR 0002).
  const state = game('p1');
  put(state, 'staff', 'white-mages-staff', 'p1', 'hand');
  lands(state, 2, 'basic-plains');
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'staff'));
  resolveStack(state);
  const hero = [...state.objects.values()]
    .find((o) => o.cardId === 'token_hero' && o.zone === 'battlefield');
  state.objects.set(hero.id, Object.freeze({ ...state.objects.get(hero.id), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const life0 = state.players.find((p) => p.id === 'p1').life;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [hero.id] }).ok);
  assert.equal(state.pendingTriggerTargets.length, 0,
    'trigger bez celu w Oracle NIE otwiera decyzji celu');
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p1').life, life0 + 1,
    'atak wyposażonego Hero daje dokładnie 1 życie');
});

// ---- Transza B: karty wymagające rozszerzeń silnika ------------------------

test('B49/B1: Kishla Village — dane karty i zdolności wg Oracle', () => {
  const card = REGISTRY.get('kishla-village');
  assert.deepEqual(card.types, ['Land']);
  assert.equal(card.entersTapped, true);
  assert.deepEqual(card.entersTappedCondition,
    { type: 'controls_land_subtype_any', subtypes: ['Island', 'Swamp'], amount: 1 });
  const mana = card.abilities.find((a) => a.effect?.type === 'add_mana');
  assert.deepEqual(mana.effect.colors, ['G'], '{T}: Add {G}');
  const surveil = card.abilities.find((a) => a.effect?.type === 'surveil');
  assert.deepEqual(surveil.cost, { mana: 4, tap: true }, '{3}{G} = 4 many');
  assert.equal(surveil.effect.amount, 2);
});

test('B49/B2: Kishla Village — bez Island/Swamp wchodzi ZATAPNIĘTA', () => {
  const state = game('p1');
  lands(state, 2, 'basic-forest'); // same lasy — warunek niespełniony
  put(state, 'village', 'kishla-village', 'p1', 'hand');
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'village');
  assert.ok(play, 'oferta zagrania landu');
  assert.ok(execute(state, play).ok);
  const onBoard = [...state.objects.values()]
    .find((o) => o.cardId === 'kishla-village' && o.zone === 'battlefield');
  assert.equal(onBoard.tapped, true, 'brak Island/Swamp → land wchodzi tapnięty');
});

test('B49/B3: Kishla Village — Island ALBO Swamp odblokowuje wejście odkryte', () => {
  for (const [landId, opis] of [['basic-island', 'Island'], ['basic-swamp', 'Swamp']]) {
    const state = game('p1');
    lands(state, 1, landId);
    put(state, 'village', 'kishla-village', 'p1', 'hand');
    const play = playerView(state, 'p1').legalCommands
      .find((c) => c.type === 'play_land' && c.objectId === 'village');
    assert.ok(execute(state, play).ok);
    const onBoard = [...state.objects.values()]
      .find((o) => o.cardId === 'kishla-village' && o.zone === 'battlefield');
    assert.ok(!onBoard.tapped, `${opis} u siebie → land wchodzi odkryty`);
  }
});

test('B49/B4: Kishla Village — land PRZECIWNIKA nie liczy się do warunku', () => {
  const state = game('p1');
  lands(state, 3, 'basic-island', 'p2'); // wyspy wroga
  put(state, 'village', 'kishla-village', 'p1', 'hand');
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'village');
  assert.ok(execute(state, play).ok);
  const onBoard = [...state.objects.values()]
    .find((o) => o.cardId === 'kishla-village' && o.zone === 'battlefield');
  assert.equal(onBoard.tapped, true, 'Oracle: „YOU control” — cudze wyspy nie pomagają');
});

test('B49/B5: Time to Feed — kolejność efektów wg Oracle (znacznik PRZED walką)', () => {
  const card = REGISTRY.get('time-to-feed');
  assert.equal(card.spell.timing, 'sorcery');
  assert.deepEqual(card.spell.targets.map((t) => t.type),
    ['creature_opponent_controls', 'creature_you_control']);
  assert.deepEqual(card.spell.effects.map((e) => e.type),
    ['gain_life_if_target_dies_this_turn', 'fight'],
    'znacznik zakładany przed fightem — stwór zabity w tej walce też daje życie');
});

test('B49/B6: Time to Feed — wygrana walka: wróg ginie, kontroler zyskuje 3 życia', () => {
  const state = game('p1');
  // 5/5 bije 2/2: wróg ginie w walce → opóźniony trigger płaci 3 życia.
  put(state, 'moj', 'creakwood-safewright', 'p1', 'battlefield', { summoningSickness: false, counters: {} });
  put(state, 'wrog', 'razorfoot-griffin', 'p2');
  put(state, 'spell', 'time-to-feed', 'p1', 'hand');
  lands(state, 3, 'basic-forest');
  const zycieStart = state.players.find((p) => p.id === 'p1').life;
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell'
      && (c.targets ?? []).includes('wrog') && (c.targets ?? []).includes('moj'));
  assert.ok(cast, 'oferta rzutu z obydwoma celami');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(byCard(state, 'razorfoot-griffin', 'p2').zone, 'graveyard', 'Griffin ginie w walce');
  assert.equal(state.players.find((p) => p.id === 'p1').life, zycieStart + 3,
    'Oracle: „you gain 3 life” po śmierci celu');
});

test('B49/B7: Time to Feed — wróg PRZEŻYWA walkę: brak zysku życia', () => {
  const state = game('p1');
  // 1/3 bije 3/3 — nikt nie ginie, znacznik wisi bezczynnie.
  put(state, 'moj', 'gaelicat', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'wrog', 'koilos-roc', 'p2');
  put(state, 'spell', 'time-to-feed', 'p1', 'hand');
  lands(state, 3, 'basic-forest');
  const zycieStart = state.players.find((p) => p.id === 'p1').life;
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell'
      && (c.targets ?? []).includes('wrog') && (c.targets ?? []).includes('moj'));
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(byCard(state, 'koilos-roc', 'p2').zone, 'battlefield', 'Roc 3/3 przeżywa cios 1/3');
  assert.equal(state.players.find((p) => p.id === 'p1').life, zycieStart,
    'brak śmierci = brak zysku życia');
});

test('B49/B8: Dead Ringers — dwa cele nonblack i efekt parowy', () => {
  const card = REGISTRY.get('dead-ringers');
  assert.equal(card.manaCost, 5);
  assert.deepEqual(card.spell.targets.map((t) => t.type), ['nonblack_creature', 'nonblack_creature']);
  assert.deepEqual(card.spell.effects,
    [{ type: 'destroy_pair_if_same_colors', targetIndexA: 0, targetIndexB: 1 }]);
});

test('B49/B9: Dead Ringers — IDENTYCZNE kolory: oba cele giną', () => {
  const state = game('p1');
  // Dwa białe stwory: Razorfoot Griffin (W) i Gaelicat (W).
  put(state, 'a', 'razorfoot-griffin', 'p2');
  put(state, 'b', 'gaelicat', 'p2');
  put(state, 'spell', 'dead-ringers', 'p1', 'hand');
  lands(state, 5, 'basic-swamp');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell'
      && (c.targets ?? []).includes('a') && (c.targets ?? []).includes('b'));
  assert.ok(cast, 'oferta rzutu w dwa białe stwory');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(byCard(state, 'razorfoot-griffin', 'p2').zone, 'graveyard', 'pierwszy cel zniszczony');
  assert.equal(byCard(state, 'gaelicat', 'p2').zone, 'graveyard', 'drugi cel zniszczony');
});

test('B49/B10: Dead Ringers — RÓŻNE kolory: nie ginie ŻADEN cel', () => {
  const state = game('p1');
  // Biały Griffin vs niebieski Roc — „a color the other isn't”.
  put(state, 'a', 'razorfoot-griffin', 'p2');
  put(state, 'b', 'koilos-roc', 'p2');
  put(state, 'spell', 'dead-ringers', 'p1', 'hand');
  lands(state, 5, 'basic-swamp');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell'
      && (c.targets ?? []).includes('a') && (c.targets ?? []).includes('b'));
  assert.ok(cast, 'oferta rzutu istnieje mimo różnych kolorów (legalność ≠ skutek)');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(byCard(state, 'razorfoot-griffin', 'p2').zone, 'battlefield', 'biały cel przeżywa');
  assert.equal(byCard(state, 'koilos-roc', 'p2').zone, 'battlefield', 'niebieski cel przeżywa');
});

test('B49/B11: Dead Ringers — czarny stwór NIE jest legalnym celem', () => {
  const state = game('p1');
  put(state, 'czarny', 'creakwood-safewright', 'p2', 'battlefield', { counters: {} });
  put(state, 'bialy', 'razorfoot-griffin', 'p2');
  put(state, 'spell', 'dead-ringers', 'p1', 'hand');
  lands(state, 5, 'basic-swamp');
  const oferty = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(oferty.length > 0, 'jakieś oferty istnieją');
  assert.ok(oferty.every((c) => !(c.targets ?? []).includes('czarny')),
    'Oracle: „two target NONBLACK creatures” — czarny stwór poza ofertą');
});

test('B49/B12: Dead Ringers — dwa bezbarwne stwory (puste zbiory) też giną', () => {
  const state = game('p1');
  // Powerstone'y nie są stworami, więc bierzemy dwa tokeny Hero (bezbarwne 1/1).
  addObject(state, {
    id: 'h1', instanceId: 'i-h1', cardId: 'token_hero', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1,
    colors: [], types: ['Creature'], subtypes: ['Hero'],
  });
  addObject(state, {
    id: 'h2', instanceId: 'i-h2', cardId: 'token_hero', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1,
    colors: [], types: ['Creature'], subtypes: ['Hero'],
  });
  put(state, 'spell', 'dead-ringers', 'p1', 'hand');
  lands(state, 5, 'basic-swamp');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell'
      && (c.targets ?? []).includes('h1') && (c.targets ?? []).includes('h2'));
  assert.ok(cast, 'bezbarwne stwory są nonblack → legalne cele');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(!state.objects.get('h1') || state.objects.get('h1').zone !== 'battlefield',
    'pierwszy Hero zniszczony (puste zbiory kolorów są równe)');
  assert.ok(!state.objects.get('h2') || state.objects.get('h2').zone !== 'battlefield',
    'drugi Hero zniszczony');
});

test('B49/B13: Creakwood Safewright — 5/5 wchodzi z trzema -1/-1 (efektywnie 2/2)', () => {
  const card = REGISTRY.get('creakwood-safewright');
  assert.deepEqual([card.power, card.toughness], [5, 5]);
  assert.deepEqual(card.entersWithCounters, { '-1/-1': 3 });
  assert.deepEqual(card.subtypes, ['Elf', 'Warrior']);

  const state = game('p1');
  put(state, 'elf', 'creakwood-safewright', 'p1', 'hand');
  lands(state, 2, 'basic-swamp');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'elf');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const onBoard = [...state.objects.values()]
    .find((o) => o.cardId === 'creakwood-safewright' && o.zone === 'battlefield');
  assert.equal(onBoard.counters?.['-1/-1'], 3, 'trzy liczniki -1/-1');
  assert.equal(effectivePower(onBoard, state), 2, '5/5 z trzema -1/-1 = 2/2');
  assert.equal(effectiveToughness(onBoard, state), 2);
});

test('B49/B14: Creakwood Safewright — trigger end stepu z warunkiem dwuczłonowym', () => {
  const card = REGISTRY.get('creakwood-safewright');
  const trig = card.abilities.find((a) => a.trigger?.event === 'end_step');
  assert.ok(trig, 'trigger „at the beginning of your end step”');
  assert.deepEqual(trig.trigger.condition,
    { subtypeCardInYourGraveyard: 'Elf', selfHasCounter: '-1/-1' });
  assert.deepEqual((Array.isArray(trig.effect) ? trig.effect : [trig.effect]),
    [{ type: 'remove_counter', counter: '-1/-1', amount: 1 }]);
});

test('B49/B15: Creakwood Safewright — Elf w grobie zdejmuje licznik w end stepie', () => {
  const state = game('p1');
  put(state, 'elf', 'creakwood-safewright', 'p1', 'battlefield', { counters: { '-1/-1': 3 } });
  // Elf w WŁASNYM grobie — warunek intervening-if spełniony.
  put(state, 'grob', 'creakwood-safewright', 'p1', 'graveyard');
  wejdzWEndStep(state);
  resolveStack(state);
  assert.equal(state.objects.get('elf').counters['-1/-1'], 2, 'jeden licznik zdjęty');
});

test('B49/B16: Creakwood Safewright — BEZ Elfa w grobie licznik zostaje', () => {
  const state = game('p1');
  put(state, 'elf', 'creakwood-safewright', 'p1', 'battlefield', { counters: { '-1/-1': 3 } });
  // W grobie leży Griffin (nie-Elf) — warunek niespełniony.
  put(state, 'grob', 'razorfoot-griffin', 'p1', 'graveyard');
  wejdzWEndStep(state);
  resolveStack(state);
  assert.equal(state.objects.get('elf').counters['-1/-1'], 3,
    'brak Elfa w grobie → trigger nie odpala (intervening-if)');
});

test('B49/B17: Creakwood Safewright — bez licznika trigger nie odpala', () => {
  const state = game('p1');
  put(state, 'elf', 'creakwood-safewright', 'p1', 'battlefield', { counters: {} });
  put(state, 'grob', 'creakwood-safewright', 'p1', 'graveyard');
  wejdzWEndStep(state);
  resolveStack(state);
  assert.deepEqual(state.objects.get('elf').counters ?? {}, {},
    'drugi człon warunku: brak licznika -1/-1 = brak triggera');
});

// ---- Sanity całego batcha --------------------------------------------------

test('B49/S1: wszystkie 10 kart jest w rejestrze jako supported, bez ograniczeń', () => {
  const ids = ['kishla-village', 'white-mages-staff', 'gaelicat', 'dead-ringers', 'time-to-feed',
    'shock', 'koilos-roc', 'razorfoot-griffin', 'mana-cylix', 'creakwood-safewright'];
  for (const id of ids) {
    const card = REGISTRY.get(id);
    assert.ok(card, `${id} w rejestrze`);
    assert.equal(card.support?.status, 'supported', `${id}: pełne wsparcie (ADR 0022)`);
    assert.deepEqual(card.support?.limitations ?? [], [], `${id}: bez ograniczeń`);
    assert.ok(card.imageUri?.includes('cards.scryfall.io'), `${id}: ilustracja ze Scryfalla`);
    assert.ok(card.artId >= 557 && card.artId <= 566, `${id}: artId z listy właściciela`);
  }
});
