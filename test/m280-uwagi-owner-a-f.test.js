// =============================================================================
// M280 — uwagi właściciela A–F (2026-09-02).
//
//  A. Karta dwustronna (DFC): kliknięcie na stole ZAWSZE otwiera warstwę
//     Działania z podglądem OBU stron (bieżącej i drugiej). Silnik eksponuje
//     `transformToCardId` w widoku pola bitwy — obie strony DFC są publiczne
//     (CR 711/712), a po craft/incubate tył nie ma linku powrotnego w rejestrze.
//  B. Pierwsze odwrócenie DFC otwiera warstwę wysoko-graficzną (jeśli tryb
//     włączony) — obserwator `onTransform` sesji; podpis „Przemiana: <karta>".
//  C. Makeshift Mauler: JEDNA opcja rzutu (warianty kosztu „wygnaj stwora"
//     grupowane po karcie) + modal wyboru kreatury do wygnania.
//  D. Deepwood Denizen: bot nie dobiera kart, gdy opróżniłby bibliotekę
//     (CR 121.4/704.5b — deck-out).
//  E. Benevolent Blessing: badge zaczarowanej kreatury pokazuje kolor ochrony
//     („Ochrona przed: Czarny") obok „zaczarowana: Benevolent Blessing".
//  F. Discover: oferta „rzuć za darmo" tylko dla kart w prostym zakresie
//     (bez celów/kosztów dodatkowych/X/Fireball/modów) — koniec fizzlującego
//     no-opa (CR 608.2b).
//
// Reguły po deskryptorach (ADR 0002), zero nazw kart w warstwie logiki.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { protectionBadges, choiceRequestGroupKey, commandLabel, renderCardArtShowcase } from '../src/table/render.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { queueTriggerToStack } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

// Mini-DOM dla renderu warstwy grafik (wzorzec: m232-hi-gfx-showcase.test.js).
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.style = {};
    this.className = ''; this.text = ''; this.src = ''; this.alt = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelector(sel) { return this.descendants().find((el) => el.matchesSelector?.(sel)) ?? null; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  matchesSelector(sel) {
    if (sel.startsWith('.')) return this.className.split(' ').includes(sel.slice(1));
    if (sel.startsWith('#')) return this.id === sel.slice(1);
    return this.tagName.toLowerCase() === sel.toLowerCase();
  }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

function game(playerId = 'p1', step = 'main1') {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.phase = 'precombat_main';
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const config = {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  };
  // DFC: gameObjectDataOf nie niesie `transformTo` (dodaje je dopiero
  // createDeck) — dokładamy payload drugiej strony jak materializacja talii.
  if (def.transformTo) {
    const back = REGISTRY.get(def.transformTo);
    assert.ok(back, `druga strona ${def.transformTo} w rejestrze`);
    config.transformTo = { cardId: back.id, cardName: back.name };
    config.frontFaceId = def.id;
  }
  addObject(state, config);
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function decide(view, seed = 3) {
  const bot = createHeuristicBot({ seed });
  const chosen = bot.chooseCommand(view);
  const last = bot.trace().at(-1);
  return { chosen, options: last.options };
}

function scoreOf(options, prefix) {
  const opt = options.find((o) => String(o.cmd).startsWith(prefix));
  return opt ? opt.score : null;
}

// =============================================================================
// A — transformToCardId w widoku pola bitwy (menu podglądu drugiej strony)
// =============================================================================

test('A–F/A: widok DFC niesie transformToCardId (przód → tył i tył → przód)', () => {
  const state = game('p1');
  put(state, 'front', 'scorned-villager', 'p1');          // przód: Scorned Villager
  put(state, 'back', 'moonscarred-werewolf', 'p1');       // tył jako osobny permanent
  const view = playerView(state, 'p1');
  const front = view.zones.battlefield.find((o) => o.id === 'front');
  const back = view.zones.battlefield.find((o) => o.id === 'back');
  assert.equal(front.transformToCardId, 'moonscarred-werewolf', 'przód wskazuje tył');
  assert.equal(back.transformToCardId, 'scorned-villager', 'tył wskazuje przód');
});

test('A–F/A: permanent bez drugiej strony nie niesie transformToCardId (brak szumu)', () => {
  const state = game('p1');
  put(state, 'plain', 'goblin-piker', 'p1');
  const view = playerView(state, 'p1');
  const entry = view.zones.battlefield.find((o) => o.id === 'plain');
  assert.equal(entry.transformToCardId, undefined, 'zwykła karta nie jest DFC');
});

// =============================================================================
// B — obserwator onTransform sesji + podpis warstwy
// =============================================================================

test('A–F/B: renderCardArtShowcase używa czasownika z opcji („Przemiana: X")', () => {
  // renderCardArtShowcase wymaga mini-DOM; sprawdzamy przez kontrakt tekstu.
  const host = document.createElement('div');
  const card = REGISTRY.get('scorned-villager');
  renderCardArtShowcase(host, card, { casterName: 'Moonscarred Werewolf', verb: 'Przemiana' });
  const caption = host.querySelector('.showcase-caster');
  assert.ok(caption, 'podpis warstwy istnieje przy label');
  assert.match(caption.textContent, /^Przemiana: /, caption.textContent);
});

test('A–F/B: sesja woła onTransform dla object_transformed (i pauzuje warstwę)', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(readFileSync('decks/innistrad-brg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(readFileSync('decks/innistrad-wu.txt', 'utf8'), registry).cardIds],
  ]);
  const calls = [];
  const session = createSession({ seed: 11, registry, decks, onTransform: (p) => { calls.push(p); return true; } });
  const state = session.state;

  // Wystaw Scorned Villager na pole bitwy i odpal trigger upkeep (front→back).
  let hid = null;
  for (const [id, o] of state.objects) {
    if (o.cardId === 'scorned-villager' && (o.zone === 'hand' || o.zone === 'library')) { hid = id; break; }
  }
  assert.ok(hid, 'Scorned Villager w talii BRG');
  const bfId = moveObjectDirectly(state, hid, 'battlefield', `bf-${hid}`).id;
  const ability = registry.get('scorned-villager').abilities.find((a) => a.trigger?.event === 'upkeep');
  assert.ok(ability, 'trigger upkeep w definicji');
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  queueTriggerToStack(state, ability, state.objects.get(bfId), [], []);

  // Rozstrzygnij stos przez komendy sesji (passy).
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 200) {
    guard += 1;
    const view = session.view();
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!cmd) break;
    const r = session.apply(cmd);
    if (!r.ok) break;
  }
  assert.equal(state.objects.get(bfId).cardId, 'moonscarred-werewolf', 'transformacja się dokonała');
  assert.ok(calls.length >= 1, 'onTransform musi się odpalić dla object_transformed');
  assert.equal(calls[0].cardId, 'moonscarred-werewolf', 'cardId = NOWA strona');
  assert.equal(calls[0].fromCardId, 'scorned-villager', 'fromCardId = strona opuszczana');
  assert.equal(calls[0].objectId, bfId, 'objectId = permanent');
  assert.equal(calls[0].playerId, 'p1', 'controllerId z eventu');
  assert.equal(session.artPausePending, true, 'obserwator zwrócił true → pauza prezentacyjna');
});

// =============================================================================
// C — Makeshift Mauler: jedna opcja + modal wyboru kreatury do wygnania
// =============================================================================

test('A–F/C: warianty cast_permanent z exileTargetId grupują się po karcie', () => {
  const key = choiceRequestGroupKey({ type: 'cast_permanent', playerId: 'p1', objectId: 'mm', exileTargetId: 'g1' });
  assert.equal(key, 'permanent-exile:mm', 'klucz grupy ignoruje konkretny cel');
  const key2 = choiceRequestGroupKey({ type: 'cast_permanent', playerId: 'p1', objectId: 'mm', exileTargetId: 'g2' });
  assert.equal(key2, key, 'warianty celu mają ten sam klucz → jedna grupa');
});

test('A–F/C: etykieta wariantu kosztu nazywa WYGNANĄ kreaturę', () => {
  const view = {
    zones: {
      hand: [{ id: 'mm', cardId: 'makeshift-mauler' }],
      battlefield: [], stack: [],
      graveyard: [{ id: 'g1', cardId: 'highland-game' }, { id: 'g2', cardId: 'woolly-loxodon' }],
      library: [], exile: [],
    },
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  };
  const session = { nameOf: (id) => REGISTRY.get(id)?.name ?? String(id), nameOfObject: (id) => String(id), cardDetails: (id) => REGISTRY.get(id) };
  const a = commandLabel({ type: 'cast_permanent', playerId: 'p1', objectId: 'mm', exileTargetId: 'g1' }, session, view);
  const b = commandLabel({ type: 'cast_permanent', playerId: 'p1', objectId: 'mm', exileTargetId: 'g2' }, session, view);
  assert.notEqual(a, b, `opcje muszą być rozróżnialne: ${a}`);
  assert.match(a.replace(/<[^>]+>/g, ''), /Highland Game/, a);
  assert.match(b.replace(/<[^>]+>/g, ''), /Woolly Loxodon/, b);
});

// =============================================================================
// D — Deepwood Denizen: bot nie dobiera, gdy opróżniłby bibliotekę
// =============================================================================

test('A–F/D: bot NIE aktywuje dobierania, gdy biblioteka się opróżni', () => {
  const state = game('p1');
  addMana(state, 'p1', 6, { colors: ['G'] });
  put(state, 'denizen', 'deepwood-denizen', 'p1');
  put(state, 'l1', 'highland-game', 'p1', 'library'); // JEDYNA karta w bibliotece
  const view = playerView(state, 'p1');
  const { chosen, options } = decide(view);
  const draw = scoreOf(options, 'activate_ability(denizen#0)');
  assert.ok(draw != null, 'zdolność dobierania oferowana (mana wystarcza)');
  assert.ok(draw < 0, `dobranie do zera ma schodzić pod pass: ${draw}`);
  assert.notEqual(chosen.type, 'activate_ability',
    `bot nie deck-outuje się zdolnością: ${JSON.stringify(chosen)}`);
});

test('A–F/D: bot AKTYWUJE dobieranie, gdy biblioteka jest bezpieczna', () => {
  const state = game('p1');
  addMana(state, 'p1', 6, { colors: ['G'] });
  put(state, 'denizen', 'deepwood-denizen', 'p1');
  for (let i = 1; i <= 5; i += 1) put(state, `l${i}`, 'highland-game', 'p1', 'library');
  const view = playerView(state, 'p1');
  const { chosen, options } = decide(view);
  const draw = scoreOf(options, 'activate_ability(denizen#0)');
  assert.ok(draw != null, 'zdolność oferowana');
  assert.ok(draw > 0, `dobieranie przy pełnej bibliotece ma być dodatnie: ${draw}`);
  assert.equal(chosen.type, 'activate_ability', `bot ma dobrać kartę: ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, 'denizen');
});

// =============================================================================
// E — Benevolent Blessing: kolor ochrony na badge zaczarowanej kreatury
// =============================================================================

test('A–F/E: widok kreatury z aurą chosenColor niesie kolor ochrony', () => {
  const state = game('p1');
  put(state, 'cre', 'goblin-piker', 'p1');
  addObject(state, {
    id: 'bb', instanceId: 'i-bb', cardId: 'benevolent-blessing', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', types: ['Enchantment', 'Aura'],
    abilities: [], keywords: [], subtypes: [], colors: ['W'],
    aura: { enchant: 'creature', chooseColor: true, keepOwnAttachmentsOnProtection: true, chosenColor: 'B' },
  });
  attachAuraToCreature(state, 'bb', 'cre');
  // chosenColor jest nadawane na aurze przy rozstrzygnięciu resolve_color_choice
  // (createGameObject nie przepisuje go z deskryptora karty — L21). Symulujemy
  // tę samą mutację stanu (zamrożony obiekt → nowy z dopisanym chosenColor).
  const bb = state.objects.get('bb');
  state.objects.set('bb', Object.freeze({ ...bb, aura: { ...bb.aura, chosenColor: 'B' } }));
  const cre = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'cre');
  assert.ok(cre.protection, 'kreatura w widoku niesie pole protection');
  assert.equal(cre.protection[0]?.colors?.[0], 'B', 'ochrona przed czarnym');
  assert.deepEqual(protectionBadges(cre.protection), ['Ochrona przed: Czarny']);
});

test('A–F/E: ochrona wielokolorowa (jakość) nadal działa obok koloru', () => {
  // Guildscorn Ward (jakość `multicolored`) nie znika po dodaniu ścieżki koloru.
  const state = game('p1');
  put(state, 'cre', 'goblin-piker', 'p1');
  addObject(state, {
    id: 'gw', instanceId: 'i-gw', cardId: 'guildscorn-ward', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', types: ['Enchantment', 'Aura'],
    abilities: [], keywords: [], subtypes: [], colors: ['W'],
    aura: { enchant: 'creature', protection: { multicolored: true } },
  });
  attachAuraToCreature(state, 'gw', 'cre');
  const cre = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'cre');
  assert.deepEqual(protectionBadges(cre.protection), ['Ochrona przed: wielokolorowymi']);
});

// =============================================================================
// F — Discover: oferta „rzuć za darmo" tylko dla kart w prostym zakresie
// =============================================================================

function discoverState(foundPatch) {
  const state = game('p1');
  addObject(state, {
    id: 'found', instanceId: 'i-found', cardId: foundPatch.cardId ?? 'test-found',
    controllerId: 'p1', ownerId: 'p1', zone: 'exile', manaCost: foundPatch.manaCost ?? 0,
    ...foundPatch,
  });
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: 'found', foundCardId: 'test-found',
    restExileIds: [], restorePriorityTo: 'p1', amount: 3,
  };
  return state;
}

test('A–F/F: Discover oferuje darmowy rzut dla permanenta bez celów', () => {
  const state = discoverState({ kind: 'creature', power: 2, toughness: 2, types: ['Creature'], colors: [] });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discover_choice');
  assert.ok(offers.some((c) => c.castFree === true), 'permanent rzucalny za darmo');
  assert.ok(offers.some((c) => c.castFree === false), 'zawsze opcja „weź do ręki"');
});

test('A–F/F: Discover NIE oferuje darmowego rzutu dla czaru z celami (noop → fizzle)', () => {
  const state = discoverState({
    kind: 'spell',
    spell: { timing: 'sorcery', targets: [{ type: 'creature' }], effects: [{ type: 'destroy_permanent' }] },
  });
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discover_choice');
  assert.ok(offers.some((c) => c.castFree === false), 'opcja „weź do ręki" zostaje');
  assert.ok(!offers.some((c) => c.castFree === true), 'celowany czar nie może iść na stos bez celów');
});

test('A–F/F: Discover NIE oferuje darmowego rzutu dla czaru z kosztem dodatkowym/X/modami', () => {
  const withX = discoverState({ kind: 'spell', spell: { timing: 'sorcery', targets: [], xCost: true, effects: [] } });
  const xOffers = playerView(withX, 'p1').legalCommands.filter((c) => c.type === 'resolve_discover_choice');
  assert.ok(!xOffers.some((c) => c.castFree === true), 'X-cost poza prostym zakresem');
});
