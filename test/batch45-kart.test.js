// M185 — Batch 45 (lista właściciela 2026-08-22).
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';

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

// applyEffect wywołany wprost nie przechodzi przez pętlę triggerów execute —
// po efekcie przetwarzamy nagrane zdarzenia (dies → token itd.).
function applyWithTriggers(state, effect, source, targets) {
  const before = state.events.length;
  applyEffect(state, effect, source, targets);
  processTriggers(state, state.events.slice(before));
}

function resolveStack(state, max = 14) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

// ---- Transza A ----------------------------------------------------------------

test('B45/1: Ghost Warden — {T}: cel +1/+1 do końca tury', () => {
  const state = game('p1');
  putCard(state, 'warden', 'ghost-warden', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'deer', 'highland-game', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'warden');
  const onDeer = offers.find((c) => (c.targets ?? []).includes('deer'));
  assert.ok(onDeer, 'oferta aktywacji z celem');
  assert.ok(execute(state, onDeer).ok);
  assert.ok(resolveStack(state));
  const deer = state.objects.get('deer');
  assert.equal(effectivePower(deer, state), 3, '2+1');
  assert.equal(effectiveToughness(deer, state), 2, '1+1');
  assert.equal(state.objects.get('warden').tapped, true, 'koszt {T}');
});

test('B45/2: Doomed Dissenter — dies → token Zombie 2/2', () => {
  const state = game('p1');
  putCard(state, 'dissenter', 'doomed-dissenter', 'p1');
  applyWithTriggers(state, { type: 'destroy_permanent' }, state.objects.get('dissenter'), ['dissenter']);
  assert.ok(resolveStack(state), 'trigger dies rozstrzygnięty');
  const zombie = [...state.objects.values()].find((o) => o.cardId === 'token_zombie' && o.zone === 'battlefield');
  assert.ok(zombie, 'token Zombie na polu');
  assert.equal(zombie.power, 2);
  assert.equal(zombie.controllerId, 'p1');
});

test('B45/3: Patron of the Arts — Treasure przy WEJŚCIU i przy ŚMIERCI', () => {
  const state = game('p1');
  putCard(state, 'patron', 'patron-of-the-arts', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'patron');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  let treasures = [...state.objects.values()].filter((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield');
  assert.equal(treasures.length, 1, 'Skarb z ETB');
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'patron-of-the-arts' && o.zone === 'battlefield');
  applyWithTriggers(state, { type: 'destroy_permanent' }, onBoard, [onBoard.id]);
  assert.ok(resolveStack(state));
  treasures = [...state.objects.values()].filter((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield');
  assert.equal(treasures.length, 2, 'drugi Skarb ze śmierci');
});

test('B45/4: Unearth — wskrzesza stwora mv≤3; mv 4+ nie jest celem; Cycling {2} dobiera', () => {
  const state = game('p1');
  putCard(state, 'unearth', 'unearth', 'p1', 'hand');
  putCard(state, 'cheap', 'highland-game', 'p1', 'graveyard');   // mv 2
  putCard(state, 'fat', 'hill-giant', 'p1', 'graveyard');        // mv 4
  addMana(state, 'p1', 1, { colors: ['B'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'unearth');
  assert.ok(casts.some((c) => (c.targets ?? []).includes('cheap')), 'mv2 jest celem');
  assert.ok(!casts.some((c) => (c.targets ?? []).includes('fat')), 'mv4 NIE jest celem');
  assert.ok(execute(state, { ...casts[0], targets: ['cheap'] }).ok);
  assert.ok(resolveStack(state));
  const back = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'battlefield');
  assert.ok(back, 'stwór wskrzeszony');
  // Cycling {2}: osobny stan — odrzuć i dobierz.
  const s2 = game('p1');
  putCard(s2, 'unearth2', 'unearth', 'p1', 'hand');
  putCard(s2, 'lib', 'highland-game', 'p1', 'library');
  addMana(s2, 'p1', 2, { colors: ['B'] });
  const cyc = playerView(s2, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'unearth2');
  assert.ok(cyc, 'oferta cyclingu z ręki');
  assert.ok(execute(s2, cyc).ok);
  assert.ok(resolveStack(s2));
  const drawn = [...s2.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'hand');
  assert.ok(drawn, 'cycling dobrał kartę');
});

test('B45/5: Call the Mountain Chocobo — tutor Mountain + token Bird z landfallowym +1/+0', () => {
  const state = game('p1');
  putCard(state, 'chocobo', 'call-the-mountain-chocobo', 'p1', 'hand');
  putCard(state, 'lib-mountain', 'basic-mountain', 'p1', 'library');
  putCard(state, 'hand-land', 'basic-forest', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'chocobo');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  // Czar wisi na blokującej decyzji search — passy aż do pendingu.
  for (let i = 0; i < 12 && !state.pendingSearchChoice; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
  assert.ok(state.pendingSearchChoice, 'blokująca decyzja searcha');
  const search = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_search_choice' && c.found === 'lib-mountain');
  assert.ok(search, 'oferta wzięcia Mountain z biblioteki');
  assert.ok(execute(state, search).ok);
  const mountain = [...state.objects.values()].find((o) => o.cardId === 'basic-mountain' && o.controllerId === 'p1');
  assert.equal(mountain.zone, 'hand', 'Mountain w ręce');
  const bird = [...state.objects.values()].find((o) => o.cardId === 'token_bird_chocobo' && o.zone === 'battlefield');
  assert.ok(bird, 'token Bird 2/2');
  // Landfall: zagranie landa pumpuje tokena +1/+0.
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'hand-land');
  assert.ok(play, 'oferta zagrania landa');
  assert.ok(execute(state, play).ok);
  assert.ok(resolveStack(state), 'trigger landfall tokena');
  assert.equal(effectivePower(state.objects.get(bird.id), state), 3, 'Bird 2+1 po landfallu');
});

// ---- Transza B ----------------------------------------------------------------

test('B45/6: Ivy Lane Denizen — licznik tylko przy wejściu INNEGO ZIELONEGO stwora', () => {
  const state = game('p1');
  putCard(state, 'ivy', 'ivy-lane-denizen', 'p1');
  putCard(state, 'green-card', 'highland-game', 'p1', 'hand');   // zielony
  putCard(state, 'white-card', 'alaborn-trooper', 'p1', 'hand'); // biały
  addMana(state, 'p1', 6, { colors: ['G', 'G', 'W'] });
  // Biały stwór wchodzi — trigger NIE odpala.
  const castW = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'white-card');
  assert.ok(execute(state, castW).ok);
  assert.ok(resolveStack(state));
  assert.ok(!state.pendingTriggerTargets.length, 'biały stwór nie odpala triggera');
  // Zielony stwór wchodzi — trigger z celem (+1/+1 na wskazanego).
  const castG = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'green-card');
  assert.ok(execute(state, castG).ok);
  assert.ok(resolveStack(state));
  const trg = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_trigger_target' && (c.targetId === 'ivy' || (c.candidateIds ?? []).includes('ivy')));
  assert.ok(trg, 'zielony stwór odpala trigger z wyborem celu');
  assert.ok(execute(state, { ...trg, targetId: 'ivy' }).ok);
  resolveStack(state);
  assert.equal(state.objects.get('ivy').counters?.['+1/+1'], 1, 'licznik na wskazanym stworze');
});

test('B45/7: Malamet Battle Glyph — licznik (wszedł w tej turze) + fight', () => {
  const state = game('p1');
  putCard(state, 'glyph', 'malamet-battle-glyph', 'p1', 'hand');
  putCard(state, 'mine', 'alaborn-trooper', 'p1', 'battlefield', {});
  state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), enteredOnTurn: state.turn.number }));
  putCard(state, 'theirs', 'highland-game', 'p2'); // 2/1
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'glyph'
      && (c.targets ?? [])[0] === 'mine' && (c.targets ?? [])[1] === 'theirs');
  assert.ok(cast, 'oferta z dwoma celami');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const mine = state.objects.get('mine');
  assert.equal(mine.counters?.['+1/+1'], 1, 'wszedł w tej turze → licznik');
  // Fight: mine 3/4 (z licznikiem) vs theirs 2/1 → theirs ginie, mine ma 2 obrażenia.
  const theirs = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.ownerId === 'p2');
  assert.equal(theirs.zone, 'graveyard', 'wrogi stwór zginął w walce (3 obrażeń w 1 wytrzymałości)');
  assert.equal(mine.damage, 2, 'nasz stwór ma 2 obrażenia od wroga');
  assert.equal(mine.zone, 'battlefield', 'nasz 3/4 przeżył');
});

test('B45/8: Malamet — stwór z POPRZEDNICH tur bez licznika; fight i tak następuje', () => {
  const state = game('p1');
  putCard(state, 'glyph', 'malamet-battle-glyph', 'p1', 'hand');
  putCard(state, 'old', 'alaborn-trooper', 'p1', 'battlefield', { summoningSickness: false });
  state.objects.set('old', Object.freeze({ ...state.objects.get('old'), enteredOnTurn: 0 }));
  putCard(state, 'theirs', 'highland-game', 'p2');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'glyph');
  assert.ok(execute(state, { ...cast, targets: ['old', 'theirs'] }).ok);
  assert.ok(resolveStack(state));
  const old = state.objects.get('old');
  assert.ok(!(old.counters?.['+1/+1'] > 0), 'bez licznika (nie wszedł w tej turze)');
  const theirs = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.ownerId === 'p2');
  assert.equal(theirs.zone, 'graveyard', 'fight i tak nastąpił (2 obrażeń w 1 wytrzymałości)');
});

test('B45/9: Assert Perfection — z ugryzieniem i BEZ drugiego celu (up to one)', () => {
  const state = game('p1');
  putCard(state, 'assert', 'assert-perfection', 'p1', 'hand');
  putCard(state, 'mine', 'highland-game', 'p1'); // 2/1
  putCard(state, 'theirs', 'alaborn-trooper', 'p2'); // 2/3
  addMana(state, 'p1', 2, { colors: ['G'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'assert');
  const withBite = casts.find((c) => (c.targets ?? [])[1] === 'theirs');
  const noBite = casts.find((c) => (c.targets ?? [])[1] == null);
  assert.ok(withBite, 'wariant z ugryzieniem');
  assert.ok(noBite, 'wariant bez drugiego celu (up to one)');
  assert.ok(execute(state, withBite).ok);
  assert.ok(resolveStack(state));
  const theirs = [...state.objects.values()].find((o) => o.cardId === 'alaborn-trooper' && o.ownerId === 'p2');
  assert.equal(theirs.zone, 'graveyard', '3 obrażeń (moc PO pumpie 2+1) zabija 2/3');
  // Wariant bez celu: czysty pump.
  const s2 = game('p1');
  putCard(s2, 'assert2', 'assert-perfection', 'p1', 'hand');
  putCard(s2, 'mine2', 'highland-game', 'p1');
  addMana(s2, 'p1', 2, { colors: ['G'] });
  const casts2 = playerView(s2, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'assert2');
  assert.ok(casts2.length > 0, 'rzucalny bez wrogich stworów');
  assert.ok(execute(s2, casts2[0]).ok);
  assert.ok(resolveStack(s2));
  assert.equal(effectivePower(s2.objects.get('mine2'), s2), 3, 'pump działa bez ugryzienia');
});

test('B45/10: Crawling Chorus — toxic 1: combat damage graczowi daje poison + życie spada', () => {
  const state = game('p1');
  putCard(state, 'chorus', 'crawling-chorus', 'p1', 'battlefield', { summoningSickness: false });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['chorus'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // okno obrońcy (CR 509.4)
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, 19, 'życie spada normalnie (1 obrażenie)');
  assert.equal(p2.poison, 1, 'toxic 1 → 1 poison counter DODATKOWO');
});

test('B45/11: Crawling Chorus — dies → token Mite (toxic 1, nie może blokować)', () => {
  const state = game('p1');
  putCard(state, 'chorus', 'crawling-chorus', 'p1');
  applyWithTriggers(state, { type: 'destroy_permanent' }, state.objects.get('chorus'), ['chorus']);
  assert.ok(resolveStack(state));
  const mite = [...state.objects.values()].find((o) => o.cardId === 'token_phyrexian_mite' && o.zone === 'battlefield');
  assert.ok(mite, 'token Mite na polu');
  assert.equal(mite.toxic, 1, 'Mite niesie toxic 1');
  assert.equal(mite.cantBlock, true, 'Mite nie może blokować');
});

test('B45/12: Pain for All — ETB: host bije w INNY cel; obrażenia hosta odbijają się w przeciwnika', () => {
  const state = game('p1');
  putCard(state, 'pain', 'pain-for-all', 'p1', 'hand');
  putCard(state, 'host', 'alaborn-trooper', 'p1'); // 2/3
  putCard(state, 'victim', 'highland-game', 'p2'); // 2/1
  addMana(state, 'p1', 3, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'pain' && (c.targets ?? [])[0] === 'host');
  assert.ok(cast, 'aura na WŁASNEGO stwora');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  // ETB trigger: cel obrażeń (kandydaci NIE zawierają hosta).
  const trg = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(trg.length > 0, 'wybór celu ETB');
  assert.ok(!trg.some((c) => c.targetId === 'host'), 'host WYKLUCZONY (any other target)');
  const onVictim = trg.find((c) => c.targetId === 'victim');
  assert.ok(onVictim, 'wrogi stwór jest kandydatem');
  assert.ok(execute(state, onVictim).ok);
  resolveStack(state);
  const victim = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.ownerId === 'p2');
  assert.equal(victim.zone, 'graveyard', 'moc hosta (2) zabija 2/1');
  // Trigger odbicia: obrażenia w hosta lecą w przeciwnika.
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  applyWithTriggers(state, { type: 'damage', amount: 2 }, state.objects.get('host'), ['host']);
  assert.ok(resolveStack(state), 'trigger odbicia rozstrzygnięty');
  const lifeAfter = state.players.find((p) => p.id === 'p2').life;
  assert.equal(lifeBefore - lifeAfter, 2, 'przeciwnik dostaje tyle, ile host');
});

test('B45/13: Pain for All — aura NIE wchodzi na stwora przeciwnika (enchant creature you control)', () => {
  const state = game('p1');
  putCard(state, 'pain', 'pain-for-all', 'p1', 'hand');
  putCard(state, 'theirs', 'highland-game', 'p2');
  addMana(state, 'p1', 3, { colors: ['R'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'pain');
  assert.ok(!casts.some((c) => (c.targets ?? []).includes('theirs')), 'wrogi stwór nie jest legalnym gospodarzem');
});
