// PMSSB-1 — TAKTYCZNA wycena bounce (zlecenie właściciela 2026-09-25h).
//
// Metoda M429 (nie tuning maszynowy): pomiar PRZED sondą
// (/tmp/pmssb1-bounce-przed.mjs), wymiary przemyślane przyczynowo-skutkowo,
// anty-over-fix „wzorzec = dawna wartość", pokrętła-sterują, deskryptor
// tunera. Plan: docs/plans/PLAN_2026-09-25h-pmssb1-bounce.md (aneksy A/B).
//
// Fala A (siła efektu + cel wroga): F7 (Vanish skaluje), F8 (skala
// hand < top < bottom), F2 (token-trwałość, CR 704.5d), F3 (aury L41),
// F6 (kara ETB-wroga — powtórka gratis). Fala B (kierunek własny) i
// fala C (timing + stan) dopisują tu swoje piny.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();

function game(step = 'main1', activePlayerId = 'p1', priorityPlayerId = activePlayerId) {
  const state = createGameState({ seed: 4251, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, priorityPlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = priorityPlayerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell, aura: d.aura,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], ...extra,
  });
  return state.objects.get(id);
}

function stat(state, id, patch) {
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, ...patch }));
}

/** Decyzja bota + mapa wyników wariantów (po etykiecie komendy). */
function decide(state, { playerId = 'p1', params } = {}) {
  const bot = createHeuristicBot({ seed: 7, params });
  const cmd = bot.chooseCommand(playerView(state, playerId), {});
  const entry = bot.trace().at(-1);
  const scores = {};
  for (const o of entry?.options ?? []) {
    if (!o) continue;
    scores[o.cmd] = o.score;
  }
  return { cmd, entry, scores };
}

// =====================================================================
// Fala A — siła efektu + cel wroga
// =====================================================================

test('PMSSB-1/A params: rodzina bounce* jest WŁĄCZONA (wartości przemyślane)', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceLibraryTopBonus, 8);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceLibraryBottomBonus, 18);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceTokenBonus, 12);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceFoeEtbWeight, 1);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceEnemyBase, undefined);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceEnemyPowerWeight, undefined);
});

test('PMSSB-1/A/T1: karta z efektem bounce dostaje deskryptor `bounce` (tuner)', async () => {
  const { cardDescriptors, paramsForDescriptors } = await import('../tools/tune-card.mjs');
  assert.ok(cardDescriptors(REGISTRY.get('force-away')).includes('bounce'), 'Force Away ma deskryptor bounce');
  assert.ok(cardDescriptors(REGISTRY.get('vanish-from-sight')).includes('bounce'), 'Vanish też (top/bottom)');
  const { keys } = paramsForDescriptors(['bounce']);
  assert.deepEqual(keys.sort(), [
    'bounceFoeEtbWeight', 'bounceLibraryBottomBonus', 'bounceLibraryTopBonus',
    // PMSSB-1/B: kierunek własny dopisuje recast + tempo (sort: Recast <
    // Tempo < Token — 'e' < 'o').
    'bounceRecastManaWeight', 'bounceTempoPenalty', 'bounceTokenBonus',
  ]);
});

test('PMSSB-1/A/F7: Vanish skaluje wartością celu (koniec remisu 38/38)', () => {
  const state = game();
  put(state, 'vv', 'vanish-from-sight', 'p1', 'hand');
  put(state, 'big', 'highland-game', 'p2');
  stat(state, 'big', { power: 5, toughness: 5 });
  put(state, 'small', 'goldmeadow-nomad', 'p2');
  addMana(state, 'p1', 6);
  const { cmd, scores } = decide(state);
  assert.ok(scores['cast_spell(vv->big)'] > scores['cast_spell(vv->small)'],
    `duży cel wygrywa: ${JSON.stringify(scores)}`);
  assert.equal(cmd.targets?.[0], 'big');
});

test('PMSSB-1/A/F8: skala siły hand < top < bottom (ten sam latający cel)', () => {
  const state = game();
  put(state, 'bd', 'banishment-decree', 'p1', 'hand');
  put(state, 'fl', 'forced-landing', 'p1', 'hand');
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'fly', 'goldmeadow-nomad', 'p2');
  stat(state, 'fly', { keywords: ['flying'] });
  addMana(state, 'p1', 10);
  const { scores } = decide(state);
  const hand = scores['cast_spell(fa->fly)'];
  const top = scores['cast_spell(bd->fly)'];
  const bottom = scores['cast_spell(fl->fly)'];
  assert.ok(hand != null && top != null && bottom != null, `wszystkie warianty: ${JSON.stringify(scores)}`);
  assert.ok(bottom > top && top > hand, `bottom (${bottom}) > top (${top}) > hand (${hand})`);
});

test('PMSSB-1/A/F2: token trwale znika (CR 704.5d) — bije stwora tego samego rozmiaru', () => {
  const state = game();
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'tok', 'token_cat', 'p2');
  put(state, 'org', 'goldmeadow-nomad', 'p2');
  // Ten sam rozmiar: token_cat to 2/1 — stwór też 2/1. Flaga isToken
  // jawnie (definicja karty-tokena jej nie ustawia na obiekcie).
  stat(state, 'org', { power: 2, toughness: 1 });
  stat(state, 'tok', { power: 2, toughness: 1, isToken: true });
  addMana(state, 'p1', 4);
  const { cmd, scores } = decide(state);
  assert.ok(scores['cast_spell(fa->tok)'] > scores['cast_spell(fa->org)'],
    `token wygrywa trwałością: ${JSON.stringify(scores)}`);
  assert.equal(cmd.targets?.[0], 'tok');
});

test('PMSSB-1/A/F3: cel z aurą wroga bije gołego rówieśnika (+30/aura, L41 z triggera)', () => {
  const state = game();
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'ench', 'goldmeadow-nomad', 'p2');
  put(state, 'au', 'curiosity', 'p2', 'battlefield', { kind: 'aura' });
  // addObject ODRZUCA attachedTo (kontrakt L21) — przyczepienie WYMAGA
  // attachAuraToCreature (sonda PRZED miała aurę w powietrzu!).
  attachAuraToCreature(state, 'au', 'ench');
  put(state, 'bare', 'goldmeadow-nomad', 'p2');
  addMana(state, 'p1', 4);
  const { cmd, scores } = decide(state);
  assert.ok(scores['cast_spell(fa->ench)'] > scores['cast_spell(fa->bare)'],
    `aura wroga liczy: ${JSON.stringify(scores)}`);
  assert.equal(cmd.targets?.[0], 'ench');
});

test('PMSSB-1/A/F6: cel wroga z ETB dostaje karę powtórki (koniec remisu 92/92)', () => {
  const state = game();
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'etb', 'academy-journeymage', 'p2');
  put(state, 'plain', 'highland-game', 'p2');
  stat(state, 'plain', { power: 4, toughness: 4 });
  addMana(state, 'p1', 4);
  const { cmd, scores } = decide(state);
  assert.ok(scores['cast_spell(fa->plain)'] > scores['cast_spell(fa->etb)'],
    `zwykły 4/4 bije Academy z ETB: ${JSON.stringify(scores)}`);
  assert.equal(cmd.targets?.[0], 'plain');
});

test('PMSSB-1/A anty-over-fix: goły 1/1 wroga bez kontekstu wart DOKŁADNIE 80 (jak PRZED)', () => {
  const state = game();
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'g', 'goldmeadow-nomad', 'p2');
  addMana(state, 'p1', 4);
  const { scores } = decide(state);
  assert.equal(scores['cast_spell(fa->g)'], 80, `wzorzec = dawna wartość: ${JSON.stringify(scores)}`);
});

test('PMSSB-1/A pokrętła: bonusy realnie sterują wyceną (nie są atrapami)', () => {
  const mk = () => {
    const state = game();
    put(state, 'fa', 'force-away', 'p1', 'hand');
    put(state, 'tok', 'token_cat', 'p2');
    stat(state, 'tok', { power: 2, toughness: 1, isToken: true });
    addMana(state, 'p1', 4);
    return state;
  };
  const base = decide(mk()).scores['cast_spell(fa->tok)'];
  const zero = decide(mk(), { params: { bounceTokenBonus: 0 } }).scores['cast_spell(fa->tok)'];
  assert.ok(zero === base - 12, `wyzerowanie bonusu zdejmuje 12: ${base} → ${zero}`);
});

// =====================================================================
// Fala B — kierunek własny (ratunek F5, reuse F4, token, aury)
// =====================================================================

/** Stawia wrogi czar ze stosu celujący w `victimId` (widok czyta chosenTargets). */
function foeSpellOnStack(state, id, cardId, victimId) {
  // addObject ODRZUCA chosenTargets (kontrakt L21, jak attachedTo) —
  // cele doklejamy patchem PO dodaniu (widok czyta object.chosenTargets).
  put(state, id, cardId, 'p2', 'stack');
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, chosenTargets: [victimId] }));
  state.zones.stack.push(id);
}

test('PMSSB-1/B params: recast + tempo WŁĄCZONE (wartości przemyślane)', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceRecastManaWeight, 3);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.bounceTempoPenalty, 10);
});

test('PMSSB-1/B/F5: ratunek cennego — Expunge w mojego 5/5, Force Away WYGRYWA z passem', () => {
  const state = game('main1', 'p2', 'p1');
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'big', 'highland-game', 'p1');
  stat(state, 'big', { power: 5, toughness: 5, manaCost: 5 });
  foeSpellOnStack(state, 'ex', 'expunge', 'big');
  addMana(state, 'p1', 4);
  const { cmd, scores } = decide(state);
  assert.ok(scores['cast_spell(fa->big)'] > (scores.pass_priority ?? 0),
    `ratunek 5/5 bije pass: ${JSON.stringify(scores)}`);
  assert.equal(cmd.targets?.[0], 'big');
});

test('PMSSB-1/B/F5-neg: śmiecia nie ratujemy — Expunge w mojego 1/1 (TMC1), pass WYGRYWA', () => {
  const state = game('main1', 'p2', 'p1');
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'small', 'goldmeadow-nomad', 'p1');
  foeSpellOnStack(state, 'ex', 'expunge', 'small');
  addMana(state, 'p1', 4);
  const { cmd, scores } = decide(state);
  assert.ok((scores.pass_priority ?? 0) > scores['cast_spell(fa->small)'],
    `pass bije ratunek 1/1: ${JSON.stringify(scores)}`);
  assert.equal(cmd.type, 'pass_priority');
});

test('PMSSB-1/B/token: własny token pod removalem — NIE ratuj (bounce = zniszczenie, CR 704.5d)', () => {
  const state = game('main1', 'p2', 'p1');
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'tok', 'token_cat', 'p1');
  stat(state, 'tok', { power: 5, toughness: 5, isToken: true, manaCost: 0 });
  foeSpellOnStack(state, 'ex', 'expunge', 'tok');
  addMana(state, 'p1', 4);
  const { cmd, scores } = decide(state);
  assert.ok((scores.pass_priority ?? 0) > scores['cast_spell(fa->tok)'],
    `pass bije „ratunek\" tokena 5/5: ${JSON.stringify(scores)}`);
  assert.equal(cmd.type, 'pass_priority');
});

test('PMSSB-1/B/F3-own: własny z WŁASNĄ aurą (bez zagrożenia) gorszy niż goły (kara −30/aura)', () => {
  const state = game();
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'ench', 'goldmeadow-nomad', 'p1');
  put(state, 'au', 'curiosity', 'p1', 'battlefield', { kind: 'aura' });
  attachAuraToCreature(state, 'au', 'ench');
  put(state, 'bare', 'goldmeadow-nomad', 'p1');
  addMana(state, 'p1', 4);
  const { scores } = decide(state);
  assert.ok(scores['cast_spell(fa->bare)'] > scores['cast_spell(fa->ench)'],
    `goły własny mniej zły niż z własną aurą: ${JSON.stringify(scores)}`);
});

test('PMSSB-1/B pokrętła: tempo i recast sterują ratunkiem (nie atrapy)', () => {
  const mk = () => {
    const state = game('main1', 'p2', 'p1');
    put(state, 'fa', 'force-away', 'p1', 'hand');
    put(state, 'big', 'highland-game', 'p1');
    stat(state, 'big', { power: 5, toughness: 5, manaCost: 5 });
    foeSpellOnStack(state, 'ex', 'expunge', 'big');
    addMana(state, 'p1', 4);
    return state;
  };
  const base = decide(mk()).scores['cast_spell(fa->big)'];
  const noTempo = decide(mk(), { params: { bounceTempoPenalty: 0 } }).scores['cast_spell(fa->big)'];
  assert.equal(noTempo, base + 10, `tempo 0 dodaje 10: ${base} → ${noTempo}`);
  const freeRecast = decide(mk(), { params: { bounceRecastManaWeight: 0 } }).scores['cast_spell(fa->big)'];
  assert.equal(freeRecast, base + 15, `recast 0 dodaje 5×3: ${base} → ${freeRecast}`);
});

// Wzorzec = dawna wartość: −114 = 50 (spellBase) − 90 (gałąź własna
// REMOVAL) − 74 (klamra M179/E: bounce 70 + worth 4). Podwójna kara
// jest zamierzona (dwie niezależne klamry); fala B jej NIE rusza bez
// zagrożenia — ratunek dostaje WYJĄTEK w klamrze (CR 608.2b fizzle).
test('PMSSB-1/B anty-over-fix: własny 2/2 bez kontekstu wart DOKŁADNIE −114 (jak PRZED)', () => {
  const state = game();
  put(state, 'fa', 'force-away', 'p1', 'hand');
  put(state, 'g', 'goldmeadow-nomad', 'p1');
  stat(state, 'g', { power: 2, toughness: 2 });
  addMana(state, 'p1', 4);
  const { scores } = decide(state);
  assert.equal(scores['cast_spell(fa->g)'], -114, `wzorzec = dawna wartość: ${JSON.stringify(scores)}`);
});

test('PMSSB-1/B/F4: Invasive-trigger — reuse ETB-removalu bije taniego plaina (ekonomia recastu)', () => {
  // Setup trigger-decyzji: Invasive Species wchodzi (ETB-bounce, cel:
  // inny permanent kontrolera), moje: tani 1/1 (TMC1) + Faceless Butcher
  // 2/3 (TMC4, ETB-exile 20); wróg ma stwora (cel powtórki ETB).
  // PRZED: tani −23 vs butcher −27 → tani. PO: tani −36 vs butcher −29
  // → BUTCHER (reuse 20 > recast 12 + tempo 10).
  const state = game();
  put(state, 'inv', 'invasive-species', 'p1');
  put(state, 'cheap', 'goldmeadow-nomad', 'p1');
  put(state, 'butcher', 'faceless-butcher', 'p1');
  put(state, 'foe', 'goldmeadow-nomad', 'p2');
  // Kolejka triggera dokładnie jak processTriggers (wzorzec:
  // test/bot-pr65-audit-fixes.test.js) — pełna ability z rejestru
  // (z requiresTarget), kandydatów liczy silnik.
  state.pendingTriggerTargets.push({
    playerId: 'p1', sourceId: 'inv', cardId: 'invasive-species',
    ability: Object.freeze(JSON.parse(JSON.stringify(REGISTRY.get('invasive-species').abilities[0]))),
    candidates: [], allowNone: false, fixedTargetIds: [], extra: {},
  });
  const view = playerView(state, 'p1');
  const cmds = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(cmds.length >= 2, `oferty triggera: ${cmds.length}`);
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.equal(cmd.targetId, 'butcher', `wybrany: ${cmd.targetId}`);
  // Pin ekonomiki (MUT-D: bez kosztu recastu butcher = −7, nie −29):
  // butcher −29 = −20 − value(7) + reuse(20) − recast(4×3) − tempo(10).
  assert.equal(scores['resolve_trigger_target(butcher)'], -29,
    `ekonomika reuse-recast: ${JSON.stringify(scores)}`);
});
