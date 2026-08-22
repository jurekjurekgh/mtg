import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { processTriggers } from '../src/engine/triggers.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Batch 28 — 9 kart (2026-08-10); Moonscarred Werewolf zostaje tyłem DFC:
 * Silumgar Butcher (exploit), Relic Robber (token u ofiary), Flurry of Wings
 * (tokeny wg atakujących), Expose to Daylight, Etherium Abomination (unearth),
 * Awaken the Bear, Security Rhox (koszt ze Skarbów), Dreams of Steel and Oil
 * (reveal + wybory), Tenth District Veteran (attacks → untap target).
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

function passBoth(state, first = 'p1') {
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  for (;;) {
    if (guard++ > 80) throw new Error('passBoth nie zakończył rundy');
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return;
      assert.ok(r1.ok, r1.events[0]?.reason);
      if (state.turn.passes === 0) break;
      passesDone = state.turn.passes;
    }
    if (state.turn.passes === 0) return;
  }
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

/** Rozstrzyga stos, ale ZATRZYMUJE się przed decyzją exploit (nie auto-odpowiada). */
function resolveStackToExploit(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && state.pendingExploits.length === 0 && guard++ < 250) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0 || state.pendingExploits.length > 0;
}

/** Rozstrzyga stos, ale ZATRZYMUJE się przed decyzją danego typu (nie auto-odpowiada). */
function resolveStackUntil(state, decisionType) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 250) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pendingActive = (() => {
      const p = view.pendingRevealExile; if (p && p.playerId === holder) return true;
      const ps = view.pendingScry; if (ps && ps.playerId === holder) return true;
      return false;
    })();
    if (pendingActive) return true;
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function eff(state, id) {
  const o = state.objects.get(id);
  return { p: effectivePower(o, state), t: effectiveToughness(o, state) };
}

function hand(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
}

// --- Scryfall sanity ---------------------------------------------------------

test('Batch 28: pliki Scryfall istnieją i mają prawidłowe pola', () => {
  const slugs = [
    'silumgar-butcher', 'relic-robber', 'flurry-of-wings', 'expose-to-daylight',
    'etherium-abomination', 'awaken-the-bear', 'security-rhox', 'dreams-of-steel-and-oil',
    'moonscarred-werewolf', 'tenth-district-veteran',
  ];
  for (const slug of slugs) {
    const path = `docs/cards/scryfall-${slug}.json`;
    assert.ok(fs.existsSync(path), `brak pliku ${path}`);
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    assert.ok(data.name, `${slug}: brak name`);
    assert.ok(data.image_uris?.large, `${slug}: brak image_uris.large`);
  }
});

test('Batch 28: 9 kart supported z artId; Moonscarred zostaje limited (tył DFC)', () => {
  const ids = [
    'silumgar-butcher', 'relic-robber', 'flurry-of-wings', 'expose-to-daylight',
    'etherium-abomination', 'awaken-the-bear', 'security-rhox', 'dreams-of-steel-and-oil',
    'tenth-district-veteran',
  ];
  for (const id of ids) {
    const card = REGISTRY.get(id);
    assert.ok(card, `karta ${id} nie znaleziona`);
    assert.equal(card.support?.status, 'supported', `${id}: status != supported`);
    assert.ok(card.artId, `${id}: brak artId`);
  }
  const mw = REGISTRY.get('moonscarred-werewolf');
  assert.equal(mw.support.status, 'limited', 'Moonscarred zostaje tyłem DFC (limited)');
});

// --- Silumgar Butcher (exploit) ----------------------------------------------

test('Silumgar Butcher: exploit — poświęcenie stwora odpala -3/-3 na cel', () => {
  const state = mainPhase(game());
  addRealCard(state, 'food1', 'highland-game', 'p1', 'battlefield'); // 2/1
  addRealCard(state, 'food2', 'goblin-piker', 'p1', 'battlefield'); // 2/1
  addRealCard(state, 'victim', 'goblin-piker', 'p2', 'battlefield'); // cel -3/-3
  addRealCard(state, 'butcher', 'silumgar-butcher', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', cardId: 'silumgar-butcher', objectId: 'butcher' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStackToExploit(state); // wejście → exploit choice (bez auto-odpowiedzi)
  const view = playerView(state, 'p1');
  const exploit = view.legalCommands.filter((c) => c.type === 'resolve_exploit_choice');
  assert.ok(exploit.length >= 2, 'oferta exploit (poświęć x2 + skip)');
  assert.ok(exploit.some((c) => c.skip === true), 'opcja skip');
  const sac = exploit.find((c) => c.targetId === 'food1');
  assert.ok(sac, 'można poświęcić highland-game');
  const r2 = execute(state, sac);
  assert.ok(r2.ok, r2.events?.[0]?.reason);
  // po poświęceniu trigger exploits z celem — wybierz victim
  let guard = 0;
  while (!viewLegalHas(state, 'p1', 'resolve_trigger_target') && guard++ < 40) execute(state, viewLegalFirst(state, 'p1'));
  const v2 = playerView(state, 'p1');
  const tt = v2.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'victim');
  assert.ok(tt, 'cel triggera exploits → victim');
  const r3 = execute(state, tt);
  assert.ok(r3.ok, r3.events?.[0]?.reason);
  resolveStack(state);
  const victimGrave = [...state.objects.values()].find((o) => o.cardId === 'goblin-piker' && o.zone === 'graveyard' && o.controllerId === 'p2');
  assert.ok(victimGrave, 'victim -3/-3 z 2/1 ginie');
  assert.ok([...state.objects.values()].every((o) => o.id !== 'food1' || o.zone !== 'battlefield'), 'food1 poświęcony');
});

test('Silumgar Butcher: exploit — skip (bez poświęcenia) nie odpala triggera', () => {
  const state = mainPhase(game());
  addRealCard(state, 'food1', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'butcher', 'silumgar-butcher', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['B'] });
  execute(state, { type: 'cast_permanent', playerId: 'p1', cardId: 'silumgar-butcher', objectId: 'butcher' });
  resolveStackToExploit(state);
  const view = playerView(state, 'p1');
  const skip = view.legalCommands.find((c) => c.type === 'resolve_exploit_choice' && c.skip === true);
  assert.ok(skip, 'opcja skip');
  const r = execute(state, skip);
  assert.ok(r.ok);
  resolveStack(state);
  assert.ok(state.objects.get('food1').zone === 'battlefield', 'nic nie poświęcone');
  assert.ok(!state.events.some((e) => e.type === 'exploited'), 'brak zdarzenia exploited');
});

// --- Relic Robber ------------------------------------------------------------

test('Relic Robber: combat damage do gracza → TEN gracz dostaje Goblin Construct 0/1 cantBlock', () => {
  const state = mainPhase(game());
  const rr = addRealCard(state, 'rr', 'relic-robber', 'p1', 'battlefield');
  state.objects.set('rr', Object.freeze({ ...rr, summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['rr'] }).ok);
  const noBlocks = playerView(state, 'p2').legalCommands.find((c) => c.type === 'declare_blockers');
  execute(state, noBlocks);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // M172/C: okno obrońcy po blokach
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_goblin_construct' && o.zone === 'battlefield');
  assert.ok(token, 'token Goblin Construct powstał');
  assert.equal(token.controllerId, 'p2', 'kontrolerem tokenu jest OFIARA (p2)');
  assert.equal(token.power, 0);
  assert.equal(token.toughness, 1);
  assert.equal(token.cantBlock, true, 'token can\'t block');
  // upkeep p2 → token zadaje 1 do p2
  const life = state.players.find((p) => p.id === 'p2').life;
  state.turn = jumpToStep(state.turn, 'upkeep', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, life - 1, 'upkeep: 1 obrażenia do kontrolera');
});

// --- Flurry of Wings ---------------------------------------------------------

test('Flurry of Wings: X tokenów Bird Soldier = liczba atakujących', () => {
  const state = mainPhase(game());
  addRealCard(state, 'a1', 'goblin-piker', 'p1', 'battlefield');
  addRealCard(state, 'a2', 'goblin-piker', 'p1', 'battlefield');
  const a1 = state.objects.get('a1');
  const a2 = state.objects.get('a2');
  state.objects.set('a1', Object.freeze({ ...a1, summoningSickness: false }));
  state.objects.set('a2', Object.freeze({ ...a2, summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] }).ok);
  // p2 bez bloków (declare_blockers), potem p1 ma priorytet w combat_damage
  const nb = playerView(state, 'p2').legalCommands.find((c) => c.type === 'declare_blockers');
  execute(state, nb);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // M172/C: okno obrońcy po blokach
  // p1 rzuca Flurry w odpowiedzi na atak (instant — z priorytetem po blokach)
  addRealCard(state, 'flurry', 'flurry-of-wings', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G', 'W', 'U'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'flurry-of-wings', objectId: 'flurry' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state);
  const birds = [...state.objects.values()].filter((o) => o.cardId === 'token_bird_soldier' && o.zone === 'battlefield');
  assert.equal(birds.length, 2, 'X = 2 atakujących');
  assert.ok(birds.every((b) => b.power === 1 && b.toughness === 1 && b.controllerId === 'p1'), '1/1 p1');
  assert.ok(birds.every((b) => effectiveKeywords(b, state).includes('flying')), 'flying');
});

// --- Expose to Daylight ------------------------------------------------------

test('Expose to Daylight: niszczy artefakt/enchantment + scry 1', () => {
  const state = mainPhase(game());
  addRealCard(state, 'art', 'cloak-of-the-bat', 'p2', 'battlefield'); // equipment (artifact)
  for (let i = 0; i < 5; i++) addRealCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addRealCard(state, 'expose', 'expose-to-daylight', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'expose-to-daylight', objectId: 'expose', targets: ['art'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStackUntil(state, 'resolve_scry');
  assert.ok([...state.objects.values()].every((o) => o.id !== 'art' || o.zone !== 'battlefield'), 'artefakt zniszczony');
  // scry 1 — pendingScry (decyzja gracza); bot bierze pierwszą ofertę (zostaw)
  const view = playerView(state, 'p1');
  const scry = view.legalCommands.find((c) => c.type === 'resolve_scry');
  assert.ok(scry, 'scry 1 czeka na decyzję');
});

// --- Etherium Abomination (unearth) ------------------------------------------

test('Etherium Abomination: unearth z grobu — haste, exile na end step', () => {
  const state = mainPhase(game());
  addRealCard(state, 'ea', 'etherium-abomination', 'p1', 'graveyard');
  addMana(state, 'p1', 2, { colors: ['U', 'B'] });
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'ea', abilityIndex: 0 });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state); // D: zdolność na stosie → wrót na pole bitwy po rozstrzygnięciu
  const bf = [...state.objects.values()].find((o) => o.cardId === 'etherium-abomination' && o.zone === 'battlefield');
  assert.ok(bf, 'wrócił na pole bitwy');
  assert.equal(bf.controllerId, 'p1', 'pod kontrolą właściciela');
  assert.ok(effectiveKeywords(bf, state).includes('haste'), 'haste');
  assert.equal(bf.unearthExile, true, 'flaga unearthExile');
  // end step → exile
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'end', phase: 'ending' }]);
  resolveStack(state);
  const ex = [...state.objects.values()].find((o) => o.cardId === 'etherium-abomination' && o.zone === 'exile');
  assert.ok(ex, 'wygnany na end step');
});

// --- Awaken the Bear ---------------------------------------------------------

test('Awaken the Bear: +3/+3 i trample', () => {
  const state = mainPhase(game());
  addRealCard(state, 't', 'goblin-piker', 'p1', 'battlefield');
  addRealCard(state, 'ab', 'awaken-the-bear', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'awaken-the-bear', objectId: 'ab', targets: ['t'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state);
  assert.deepEqual(eff(state, 't'), { p: 5, t: 4 }, '+3/+3 na 2/1');
  assert.ok(effectiveKeywords(state.objects.get('t'), state).includes('trample'));
});

// --- Security Rhox (treasure alt cost) ---------------------------------------

test('Security Rhox: wariant ze Skarbów oferowany tylko z maną ze Skarbów; rzut zwykły działa', () => {
  // Bez Skarbów — brak wariantu treasureAlt; zwykły rzut {2}{R}{G} oferowany.
  const state = mainPhase(game());
  addRealCard(state, 'rhox', 'security-rhox', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R', 'G'] });
  const view = playerView(state, 'p1');
  const variants = view.legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'rhox');
  assert.ok(variants.some((c) => !c.treasureAlt), 'zwykły rzut oferowany');
  assert.ok(!variants.some((c) => c.treasureAlt), 'bez Skarbów brak wariantu treasureAlt');
  // Z dwoma Skarbami — wariant treasureAlt {R}{G} oferowany.
  const state2 = mainPhase(game());
  addRealCard(state2, 'rhox2', 'security-rhox', 'p1', 'hand');
  createBattlefieldToken(state2, 'p1', {
    cardId: 'token_treasure', name: 'Treasure', kind: 'artifact',
    types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [{ type: 'activated', cost: { tap: true, sacrificeSelf: true }, effect: { type: 'add_mana', amount: 1 } }],
  });
  createBattlefieldToken(state2, 'p1', {
    cardId: 'token_treasure', name: 'Treasure', kind: 'artifact',
    types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [{ type: 'activated', cost: { tap: true, sacrificeSelf: true }, effect: { type: 'add_mana', amount: 1 } }],
  });
  const view2 = playerView(state2, 'p1');
  const alt = view2.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'rhox2' && c.treasureAlt === true);
  assert.ok(alt, 'wariant treasureAlt oferowany z 2 Skarbami');
  const r = execute(state2, alt);
  assert.ok(r.ok, r.events?.[0]?.reason);
  // Skarby poświęcone (pula treasureMana), rhox na stosie
  assert.equal(state2.players.find((p) => p.id === 'p1').treasureMana, 0, 'Skarby wydane');
  const treasures = [...state2.objects.values()].filter((o) => o.cardId === 'token_treasure');
  assert.equal(treasures.filter((o) => o.zone === 'battlefield').length, 0, 'Skarby poświęcone');
});

// --- Dreams of Steel and Oil -------------------------------------------------

test('Dreams of Steel and Oil: reveal ręki + wybór z ręki i grobu → exile obu', () => {
  const state = mainPhase(game());
  // p2: ręka ze stworem i artefaktem, grób ze stworem
  addRealCard(state, 'p2h1', 'goblin-piker', 'p2', 'hand'); // creature
  addRealCard(state, 'p2h2', 'cloak-of-the-bat', 'p2', 'hand'); // artifact
  addRealCard(state, 'p2h3', 'basic-mountain', 'p2', 'hand'); // land — nie kandydat
  addRealCard(state, 'p2g1', 'highland-game', 'p2', 'graveyard'); // creature
  addRealCard(state, 'dreams', 'dreams-of-steel-and-oil', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'dreams-of-steel-and-oil', objectId: 'dreams', targets: ['p2'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStackUntil(state, 'resolve_reveal_exile_hand'); // do pierwszej decyzji (reveal hand)
  const view = playerView(state, 'p1');
  assert.ok(view.pendingRevealExile, 'pendingRevealExile w widoku');
  assert.equal(view.pendingRevealExile.handCardIds.length, 2, 'ręka odsłonięta (2 kandydatów artifact/creature)');
  const handChoice = view.legalCommands.find((c) => c.type === 'resolve_reveal_exile_hand' && c.cardId === 'p2h1');
  assert.ok(handChoice, 'wybór stwora z ręki');
  const r2 = execute(state, handChoice);
  assert.ok(r2.ok, r2.events?.[0]?.reason);
  const view2 = playerView(state, 'p1');
  const graveChoice = view2.legalCommands.find((c) => c.type === 'resolve_reveal_exile_grave' && c.cardId === 'p2g1');
  assert.ok(graveChoice, 'wybór z grobu');
  const r3 = execute(state, graveChoice);
  assert.ok(r3.ok, r3.events?.[0]?.reason);
  // oba wygnane
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'goblin-piker' && o.zone === 'exile'), 'stwór z ręki wygnany');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'exile'), 'stwór z grobu wygnany');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'cloak-of-the-bat' && o.zone === 'hand'), 'artefakt z ręki nietknięty');
});

// --- Tenth District Veteran --------------------------------------------------

test('Tenth District Veteran: atak odkręca inny stwór (target)', () => {
  const state = mainPhase(game());
  const vet = addRealCard(state, 'vet', 'tenth-district-veteran', 'p1', 'battlefield');
  state.objects.set('vet', Object.freeze({ ...vet, summoningSickness: false }));
  const other = addRealCard(state, 'other', 'goblin-piker', 'p1', 'battlefield');
  state.objects.set('other', Object.freeze({ ...other, tapped: true, summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['vet'] }).ok);
  // trigger attacks z celem — wybierz 'other' (odkręcenie)
  const view = playerView(state, 'p1');
  const tt = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'other');
  assert.ok(tt, 'cel triggera attacks → other');
  const r = execute(state, tt);
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state);
  assert.equal(state.objects.get('other').tapped, false, 'other odkręcony');
});

// --- Determinism -------------------------------------------------------------

test('Batch 28: partia na tarkir vs warhammer kończy się deterministycznie (M178)', () => {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const s1 = createSession({ seed: 42, registry: REGISTRY, decks });
  playOut(s1);
  assert.ok(s1.state.status !== 'active', 'partia 1 nie zakończona');
  const decks2 = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const s2 = createSession({ seed: 42, registry: REGISTRY, decks: decks2 });
  playOut(s2);
  assert.equal(s1.state.status, s2.state.status, 'różny status');
});

function playOut(session, maxMoves = 700) {
  const choose = (view) => {
    const ofType = (t) => view.legalCommands.filter((c) => c.type === t);
    const first = (t) => ofType(t)[0] ?? null;
    return first('draw_card') ?? first('play_land') ?? first('cast_permanent')
      ?? (() => { const c = ofType('cast_spell'); const h = c.find(cmd => { const t = view.zones.battlefield.find(o => o.id === cmd.targets?.[0]); return t && t.controllerId !== view.playerId; }); return h ?? null; })()
      ?? (() => { const a = ofType('declare_attackers'); return a.length ? a.reduce((b, c) => c.attackerIds.length > b.attackerIds.length ? c : b) : null; })()
      ?? first('declare_blockers') ?? first('resolve_combat')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null
      ?? first('pass_priority');
  };
  for (let i = 0; i < maxMoves; i++) {
    if (session.state.status !== 'active') return i;
    const view = session.view();
    const cmd = choose(view);
    if (!cmd) break;
    const r = session.apply(cmd);
    if (!r.ok) break;
  }
  return -1;
}

// helpery widoku
function viewLegalHas(state, playerId, type) {
  return playerView(state, playerId).legalCommands.some((c) => c.type === type);
}
function viewLegalFirst(state, playerId) {
  const v = playerView(state, playerId);
  return v.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? v.legalCommands.find((c) => c.type === 'pass_priority');
}
