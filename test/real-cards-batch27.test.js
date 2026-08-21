import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { processTriggers } from '../src/engine/triggers.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Batch 27 — 10 kart (2026-08-09):
 * Civilized Scholar // Homicidal Brute (DFC transform, draw+discard z
 * transformem), Battle-Rattle Shaman (beginning_of_combat +2/+0 target),
 * Jeskai Devotee (flurry second spell + {1}: add URW once), High Stride,
 * Inspiration (draw 2 target player), Minotaur Abomination (vanilla),
 * Guildsworn Prowler (dies wasn't blocking → draw), Giant Spider (reach),
 * Scroll Thief (combat damage → draw), Force Away (bounce + ferocious
 * you-may-draw-then-discard).
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
  // transformTo (DFC) — jak createCardDeck: dane drugiej strony do obiektu.
  if (card.transformTo) {
    const back = REGISTRY.get(card.transformTo);
    assert.ok(back, `brak drugiej strony ${card.transformTo}`);
    data.transformTo = {
      cardId: back.id, power: back.power, toughness: back.toughness,
      abilities: back.abilities ?? [], keywords: back.keywords ?? [],
      subtypes: back.subtypes ?? [], types: back.types ?? [],
      manaCost: back.manaCost ?? 0, cardName: back.name,
    };
  }
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}

function passBoth(state, first = 'p1') {
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  for (;;) {
    if (guard++ > 60) throw new Error('passBoth nie zakończył rundy');
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
  while (state.zones.stack.length > 0 && guard++ < 200) {
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

function eff(state, id) {
  const o = typeof id === 'string' ? state.objects.get(id) : id;
  return { p: effectivePower(o, state), t: effectiveToughness(o, state) };
}

function hand(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
}

// --- Scryfall sanity ---------------------------------------------------------

test('Batch 27: pliki Scryfall istnieją i mają prawidłowe pola', () => {
  const slugs = [
    'civilized-scholar', 'battle-rattle-shaman', 'jeskai-devotee', 'high-stride',
    'inspiration', 'minotaur-abomination', 'guildsworn-prowler', 'giant-spider',
    'scroll-thief', 'force-away',
  ];
  for (const slug of slugs) {
    const path = `docs/cards/scryfall-${slug}.json`;
    assert.ok(fs.existsSync(path), `brak pliku ${path}`);
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    assert.ok(data.name, `${slug}: brak name`);
    assert.ok(data.image_uris?.large, `${slug}: brak image_uris.large`);
    assert.ok(data.mana_cost !== undefined, `${slug}: brak mana_cost`);
  }
});

// --- Definicje ---------------------------------------------------------------

test('Batch 27: wszystkie karty mają status supported i artId', () => {
  const ids = [
    'civilized-scholar', 'battle-rattle-shaman', 'jeskai-devotee', 'high-stride',
    'inspiration', 'minotaur-abomination', 'guildsworn-prowler', 'giant-spider',
    'scroll-thief', 'force-away',
  ];
  for (const id of ids) {
    const card = REGISTRY.get(id);
    assert.ok(card, `karta ${id} nie znaleziona`);
    assert.equal(card.support?.status, 'supported', `${id}: status != supported`);
    assert.ok(card.artId, `${id}: brak artId`);
    assert.ok(card.imageUri, `${id}: brak imageUri`);
  }
  assert.equal(REGISTRY.get('homicidal-brute').support.status, 'limited', 'tył DFC limited');
});

// --- Civilized Scholar // Homicidal Brute ------------------------------------

test('Civilized Scholar: {T} draw+discard; odrzucenie stwora → untap+transform na Homicidal Brute', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 10; i++) addRealCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addRealCard(state, 'scholar', 'civilized-scholar', 'p1', 'battlefield');
  // ręka: 1 land + 1 stwór
  addRealCard(state, 'h1', 'basic-swamp', 'p1', 'hand');
  addRealCard(state, 'h2', 'highland-game', 'p1', 'hand');
  const before = hand(state, 'p1').length;
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'scholar', abilityIndex: 0 });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state); // D: zdolność na stosie → dobranie + decyzja odrzucenia
  // dobrał 1 — ręka 3; czeka decyzja odrzucenia
  assert.equal(hand(state, 'p1').length, before + 1);
  const view = playerView(state, 'p1');
  const disc = view.legalCommands.find((c) => c.type === 'resolve_discard_choice');
  assert.ok(disc, 'brak resolve_discard_choice');
  // odrzuć STWORA (highland-game) → untap (już odkręcony) + transform
  const creatureDiscard = { ...disc, cardId: hand(state, 'p1').find((id) => state.objects.get(id).cardId === 'highland-game') };
  const r2 = execute(state, creatureDiscard);
  assert.ok(r2.ok, r2.events?.[0]?.reason);
  // transform jest IN-PLACE: obiekt o id 'scholar' zmienia cardId na tył.
  const brute = state.objects.get('scholar');
  assert.equal(brute.cardId, 'homicidal-brute', 'brak transformu na Homicidal Brute');
  assert.equal(brute.zone, 'battlefield');
  assert.equal(eff(state, 'scholar').p, 5, 'Homicidal Brute to 5/1');
});

test('Civilized Scholar: odrzucenie NIEstwora nie transformuje', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 10; i++) addRealCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addRealCard(state, 'scholar', 'civilized-scholar', 'p1', 'battlefield');
  addRealCard(state, 'h1', 'basic-swamp', 'p1', 'hand');
  addRealCard(state, 'h2', 'basic-island', 'p1', 'hand');
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'scholar', abilityIndex: 0 });
  resolveStack(state); // D: zdolność na stosie → dobranie + decyzja odrzucenia
  const view = playerView(state, 'p1');
  const disc = view.legalCommands.find((c) => c.type === 'resolve_discard_choice');
  const landDiscard = { ...disc, cardId: hand(state, 'p1').find((id) => state.objects.get(id).cardId === 'basic-island') };
  const r = execute(state, landDiscard);
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.equal(state.objects.get('scholar').cardId, 'civilized-scholar', 'Scholar pozostaje (bez transformu)');
  assert.equal(state.objects.get('scholar').zone, 'battlefield');
});

test('Homicidal Brute: end step bez ataku → tap + transform z powrotem', () => {
  const state = mainPhase(game());
  addRealCard(state, 'brute', 'homicidal-brute', 'p1', 'battlefield');
  // nie atakował — wejście w end step odpala trigger (procesTriggers przy
  // zdarzeniu step_advanced end; tryFire filtruje aktywnych graczy).
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'end', phase: 'ending' }]);
  resolveStack(state);
  const scholar = [...state.objects.values()].find((o) => o.cardId === 'civilized-scholar' && o.zone === 'battlefield');
  assert.ok(scholar, 'transform z powrotem na Civilized Scholar');
});

// --- Battle-Rattle Shaman ----------------------------------------------------

test('Battle-Rattle Shaman: beginning_of_combat — target +2/+0 do końca tury (opcja odmowy)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'shaman', 'battle-rattle-shaman', 'p1', 'battlefield');
  addRealCard(state, 'gob', 'goblin-piker', 'p1', 'battlefield'); // 2/1
  assert.equal(eff(state, 'gob').p, 2);
  passBoth(state, 'p1'); // main → beginning_of_combat: trigger z celem czeka
  assert.equal(state.turn.step, 'beginning_of_combat');
  const view = playerView(state, 'p1');
  const tt = view.legalCommands.find((c) => c.type === 'resolve_trigger_target');
  assert.ok(tt, 'brak decyzji celu');
  // możliwa odmowa (optional): pozwólmy najpierw odmówić
  const decline = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId == null);
  assert.ok(decline, 'brak opcji odmowy');
  const r = execute(state, { ...tt, targetId: 'gob' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  // rozstrzygnij trigger (passy)
  passBoth(state, 'p1');
  assert.equal(eff(state, 'gob').p, 4, 'gob +2/+0');
});

// --- Jeskai Devotee ----------------------------------------------------------

test('Jeskai Devotee: drugi czar w turze → +1/+1; {1}: dodaje U/R/W (once)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'dev', 'jeskai-devotee', 'p1', 'battlefield');
  addRealCard(state, 'sp1', 'high-stride', 'p1', 'hand');
  addRealCard(state, 'sp2', 'high-stride', 'p1', 'hand');
  addRealCard(state, 't', 'goblin-piker', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['G'] });
  // pierwszy czar
  execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'high-stride', objectId: 'sp1', targets: ['t'] });
  resolveStack(state);
  assert.equal(eff(state, 'dev').p, 2, 'po 1. czarze bez buffa');
  // drugi czar → flurry
  execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'high-stride', objectId: 'sp2', targets: ['t'] });
  resolveStack(state);
  assert.equal(eff(state, 'dev').p, 3, 'flurry +1/+1 po 2. czarze');
  // {1}: add U/R/W
  addMana(state, 'p1', 1, { colors: [] });
  const act = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'dev', abilityIndex: 1 });
  assert.ok(act.ok, act.events?.[0]?.reason);
  const pool = state.players.find((p) => p.id === 'p1').manaPool;
  // manaUnitKey sortuje kolory: {U},{R},{W} → 'WUR' — jednostka opłaca każdy pip.
  assert.ok((pool.WUR ?? 0) >= 1 || pool.U >= 1 || pool.R >= 1 || pool.W >= 1, `pula bez U/R/W: ${JSON.stringify(pool)}`);
  // once per turn: druga aktywacja niedostępna
  addMana(state, 'p1', 1, { colors: [] });
  const v2 = playerView(state, 'p1');
  const offered = v2.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  assert.equal(offered.length, 0, 'druga aktywacja {1} w turze nie jest oferowana');
});

// --- High Stride -------------------------------------------------------------

test('High Stride: +1/+3 + reach + untap', () => {
  const state = mainPhase(game());
  const t = addRealCard(state, 't', 'goblin-piker', 'p1', 'battlefield');
  state.objects.set('t', Object.freeze({ ...t, tapped: true }));
  addRealCard(state, 'hs', 'high-stride', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['G'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'high-stride', objectId: 'hs', targets: ['t'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state);
  assert.deepEqual(eff(state, 't'), { p: 3, t: 4 }, '+1/+3 na 2/1');
  assert.ok(effectiveKeywords(state.objects.get('t'), state).includes('reach'), 'brak reach');
  assert.equal(state.objects.get('t').tapped, false, 'odkręcony');
});

// --- Inspiration -------------------------------------------------------------

test('Inspiration: target player draws two cards', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 20; i++) addRealCard(state, `p2lib${i}`, 'basic-mountain', 'p2', 'library');
  addRealCard(state, 'insp', 'inspiration', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['U'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'inspiration', objectId: 'insp', targets: ['p2'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  resolveStack(state);
  assert.equal(hand(state, 'p2').length, 2, 'p2 dobrał 2');
});

// --- Minotaur Abomination ----------------------------------------------------

test('Minotaur Abomination: vanilla 4/6', () => {
  const card = REGISTRY.get('minotaur-abomination');
  assert.equal(card.power, 4);
  assert.equal(card.toughness, 6);
  assert.equal(card.manaCost, 6);
  assert.equal((card.abilities ?? []).length, 0);
});

// --- Guildsworn Prowler ------------------------------------------------------

test('Guildsworn Prowler: dies bez blokowania → draw', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 10; i++) addRealCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addRealCard(state, 'gw', 'guildsworn-prowler', 'p1', 'battlefield');
  const before = hand(state, 'p1').length;
  // zniszcz efektem (Bone Splinters-style): poświęcenie
  const marker = state.events.length;
  applyEffect(state, { type: 'sacrifice_permanent' }, state.objects.get('gw'), []);
  processTriggers(state, state.events.slice(marker));
  // trigger dies na stos → rozstrzygnij
  resolveStack(state);
  assert.equal(hand(state, 'p1').length, before + 1, 'draw po śmierci bez blokowania');
});

// --- Giant Spider ------------------------------------------------------------

test('Giant Spider: reach blokuje atakującego z flying', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spider', 'giant-spider', 'p2', 'battlefield');
  addRealCard(state, 'falcon', 'rustwing-falcon', 'p1', 'battlefield'); // flying
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['falcon'] }).ok);
  const r = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { falcon: ['spider'] } });
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // M172/C: okno obrońcy po blokach (CR 509.4)
  assert.ok(r.ok, r.events?.[0]?.reason);
});

// --- Scroll Thief ------------------------------------------------------------

test('Scroll Thief: combat damage do gracza → draw', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 10; i++) addRealCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  const st = addRealCard(state, 'st', 'scroll-thief', 'p1', 'battlefield');
  state.objects.set('st', Object.freeze({ ...st, summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const before = hand(state, 'p1').length;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['st'] }).ok);
  // p2 bez bloków
  const view2 = playerView(state, 'p2');
  const noBlocks = view2.legalCommands.find((c) => c.type === 'declare_blockers');
  execute(state, noBlocks);
  execute(state, { type: 'pass_priority', playerId: 'p2' }); // M172/C: okno obrońcy po blokach (CR 509.4)
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  // trigger combat_damage_to_player na stos → rozstrzygnij (jeśli czeka)
  resolveStack(state);
  assert.equal(hand(state, 'p1').length, before + 1, 'draw po obrażeniach bojowych');
});

// --- Force Away --------------------------------------------------------------

test('Force Away: bounce do właściciela + ferocious draw/discard (tak)', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 10; i++) addRealCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  // p1 ma stwora power 4+ (ferocious)
  addRealCard(state, 'big', 'segmented-krotiq', 'p1', 'battlefield'); // 6/9
  addRealCard(state, 'victim', 'goblin-piker', 'p2', 'battlefield'); // 2/1 p2
  addRealCard(state, 'fa', 'force-away', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const before = hand(state, 'p2').length;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'force-away', objectId: 'fa', targets: ['victim'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  // czar na stosie — rozstrzygnij do decyzji
  let guard = 0;
  while (state.zones.stack.length > 0 && !state.pendingOptionalDraw && guard++ < 100) {
    const v = playerView(state, state.turn.priorityPlayerId);
    const pick = v.legalCommands.find((c) => c.type === 'pass_priority') ?? v.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state, pick);
  }
  assert.ok(state.pendingOptionalDraw, 'brak decyzji ferocious');
  const view = playerView(state, 'p1');
  const yes = view.legalCommands.find((c) => c.type === 'resolve_optional_draw' && c.draw === true);
  assert.ok(yes, 'brak opcji draw');
  assert.ok(view.legalCommands.find((c) => c.type === 'resolve_optional_draw' && c.draw === false), 'brak opcji odmowy');
  // bounce już wykonany? (efekt 1. w kolejności — wykonany przy rozstrzyganiu)
  const bounced = [...state.objects.values()].find((o) => o.cardId === 'goblin-piker' && o.zone === 'hand' && o.controllerId === 'p2');
  assert.ok(bounced, 'bounce nastąpił (goblin w ręce p2)');
  assert.equal(hand(state, 'p2').length, before + 1, 'stwór wrócił do ręki p2');
  // TAK: draw + discard
  execute(state, yes);
  const view2 = playerView(state, 'p1');
  const disc = view2.legalCommands.find((c) => c.type === 'resolve_discard_choice');
  assert.ok(disc, 'po draw wymagany discard');
  execute(state, { ...disc, cardId: disc.cardId ?? hand(state, 'p1')[0] });
  assert.ok(state.zones.stack.length === 0 || state.pendingOptionalDraw == null, 'czar rozstrzygnięty');
  // force-away poszedł na stos, p1 dobrał 1 i odrzucił 1 → ręka pusta.
  assert.equal(hand(state, 'p1').length, 0, 'p1 dobrał 1 i odrzucił 1');
});

test('Force Away: bez ferocious (brak stwora 4+) — brak opcji draw', () => {
  const state = mainPhase(game());
  addRealCard(state, 'small', 'goblin-piker', 'p1', 'battlefield'); // 2/1
  addRealCard(state, 'victim', 'goblin-piker', 'p2', 'battlefield');
  addRealCard(state, 'fa', 'force-away', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'force-away', objectId: 'fa', targets: ['victim'] });
  assert.ok(r.ok);
  resolveStack(state);
  assert.ok(!state.pendingOptionalDraw, 'bez ferocious brak decyzji');
  const bounced2 = [...state.objects.values()].find((o) => o.cardId === 'goblin-piker' && o.zone === 'hand' && o.controllerId === 'p2');
  assert.ok(bounced2, 'bounce nastąpił');
});

// --- Determinism -------------------------------------------------------------

test('Batch 27: partia na green vs red kończy się deterministycznie', () => {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const s1 = createSession({ seed: 42, registry: REGISTRY, decks });
  playOut(s1);
  assert.ok(s1.state.status !== 'active', 'partia 1 nie zakończona');
  const decks2 = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const s2 = createSession({ seed: 42, registry: REGISTRY, decks: decks2 });
  playOut(s2);
  assert.equal(s1.state.status, s2.state.status, 'różny status');
});

function playOut(session, maxMoves = 700) {
  const choose = (view) => {
    const ofType = (type) => view.legalCommands.filter((c) => c.type === type);
    const first = (type) => ofType(type)[0] ?? null;
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

