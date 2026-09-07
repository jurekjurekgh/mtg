import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, playerView, execute, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { addCounter } from '../src/engine/counters.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { renderTableView } from '../src/table/render.js';

/**
 * M315 (zgłoszenie właściciela — Veiled Ascension, „albo karta jest w 100%
 * zgodna z CR i Rulings albo jest nieobsługiwana"):
 *
 * A1. Cloakowane stwory mają z automatu ward {2} (CR 701.56a) — badge kafla
 *     musi to pokazywać TOGETHER z efektami nadanymi zakrytym (Veiled
 *     Ascension: „face-down creatures enter with a flying counter" — licznik
 *     flying jest JAWNY, CR 122.1b). Dotąd kafel gubił Latanie (hardkod
 *     keywordsNow = ['ward']) i mylnie podpisywał mechanikę „Morph".
 * A2. Cloakowany permanent można obrócić twarzą do góry „any time you have
 *     priority" — SPECJALNA AKCJA, bez stosu, niereagowalna (ruling WotC
 *     2024-02-02); tylko gdy pod zakryciem karta STWORA; koszt = koszt many
 *     karty; po obrocie traci ward {2} (CR 701.56b). Dotąd brak komendy w
 *     ogóle — odsłonięcie było niemożliwe.
 */

const REGISTRY = createCardRegistry();

// ---- mini-DOM (harness audytu PR #98) ------------------------------------
const _registry = new Map();
function _el(id) { if (!_registry.has(id)) _registry.set(id, new MiniEl(id)); return _registry.get(id); }
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  getElementById: (id) => _registry.get(id),
  addEventListener() {},
};
globalThis.window = { confirm: () => false };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.style = {}; this.dataset = {}; this.className = ''; this.text = ''; this.html = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  addEventListener() {}
  click() {}
}

function tileTextOf(bfEntry) {
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield: [bfEntry] },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (id) => REGISTRY.get(id)?.name ?? id ?? '?',
    nameOfObject: (id) => id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  const els = { banner: new MiniEl('x'), status: new MiniEl('x'), stackZone: new MiniEl('x'), bfEnemy: new MiniEl('x'), bfOwn: new MiniEl('x'), graveEnemy: new MiniEl('x'), graveOwn: new MiniEl('x'), exileZone: new MiniEl('x'), hand: new MiniEl('x'), actions: new MiniEl('x'), log: new MiniEl('x') };
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  return els.bfOwn.textContent;
}

// ---- silnik ---------------------------------------------------------------
function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function cloakedFrom(state, topCardId, ownerId = 'p1') {
  putCard(state, 'va', 'veiled-ascension', ownerId);
  putCard(state, 'lib-top', topCardId, ownerId, 'library');
  state.zones.library = ['lib-top'];
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  return state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.faceDown && o.controllerId === ownerId);
}

// ---- A1: badge kafla --------------------------------------------------------

test('M315/A1: kafel cloakowanego (właściciel) — „Ward {2}" I „Latanie" (licznik) na kaflu', () => {
  const text = tileTextOf({
    id: 'o1', cardId: 'goblin-piker', controllerId: 'p1', zone: 'battlefield', kind: 'creature',
    faceDown: true, ward: 2, keywords: ['flying', 'ward'], types: ['Creature'],
    power: 2, toughness: 2, powerModifier: 0, toughnessModifier: 0, tapped: false,
    // M326: od tego commitu stół pyta o JAWNĄ przyczynę zakrycia (widok nosi
    // `faceDownCause` przy każdym cloaku — patrz m326/A), nie o `cloakReady`.
    summoningSickness: true, damage: 0, cloakReady: true, faceDownCause: 'cloak',
  });
  assert.match(text, /Ward \{2\}/, `kafl ma pokazać ward {2} zakrycia: ${text}`);
  assert.match(text, /Latani/, `licznik flying (Veiled Ascension) jest jawny — kafel go gubił: ${text}`);
  assert.match(text, /\(Cloak\)/, `własny zakryty z cloak: znacznik mechaniki Cloak (nie Morph): ${text}`);
});

test('M315/A1: przeciwnik widzi tylko jawne granty (flying) — bez ujawnienia cloak-vs-morph', () => {
  const view = {
    status: 'active', winnerId: null, playerId: 'p2',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand: [], battlefield: [{
      id: 'o1', cardId: null, controllerId: 'p1', zone: 'battlefield', kind: 'creature',
      faceDown: true, ward: 2, keywords: ['flying'], types: undefined,
      power: 2, toughness: 2, powerModifier: 0, toughnessModifier: 0, tapped: false,
      summoningSickness: true, damage: 0,
    }] },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (id) => REGISTRY.get(id)?.name ?? id ?? '?',
    nameOfObject: (id) => id,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  const els = { banner: new MiniEl('x'), status: new MiniEl('x'), stackZone: new MiniEl('x'), bfEnemy: new MiniEl('x'), bfOwn: new MiniEl('x'), graveEnemy: new MiniEl('x'), graveOwn: new MiniEl('x'), exileZone: new MiniEl('x'), hand: new MiniEl('x'), actions: new MiniEl('x'), log: new MiniEl('x') };
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const text = els.bfEnemy.textContent;
  assert.match(text, /Latani/, 'grant flying (licznik) jest jawny dla obu stron');
  assert.ok(!text.includes('Cloak'), `mechanika zakrycia przeciwnika NIE jest ujawniana: ${text}`);
  assert.ok(!text.includes('Goblin'), 'tożsamość karty nadal ukryta (FoW)');
});

test('M315/A1: zwykły morph (bez ward, bez grantów) — kafel bez „Ward" i bez „Latania"', () => {
  const text = tileTextOf({
    id: 'o1', cardId: 'goblin-piker', controllerId: 'p1', zone: 'battlefield', kind: 'creature',
    faceDown: true, keywords: [], types: ['Creature'],
    power: 2, toughness: 2, powerModifier: 0, toughnessModifier: 0, tapped: false,
    summoningSickness: true, damage: 0,
  });
  assert.ok(!text.includes('Ward'), `bez warda: ${text}`);
  assert.ok(!text.includes('Latani'), `bez grantów: ${text}`);
});

// ---- A2: specjalna akcja odsłonięcia (uncover) -----------------------------

test('M315/A2: cloakowany (karta stwora) — oferta turn_cloak_face_up w priorytecie', () => {
  const state = game('p1');
  const cloaked = cloakedFrom(state, 'goblin-piker');
  addMana(state, 'p1', 5, { colors: ['R'] });
  assert.ok(cloaked.faceDown);
  assert.equal(cloaked.cloakReady, true, 'karta stwora pod zakryciem — uncover możliwy (RED: brak flagi)');
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find(
    (c) => c.type === 'turn_cloak_face_up' && c.objectId === cloaked.id,
  );
  assert.ok(cmd, `brak oferty odsłonięcia (RED): ${view.legalCommands.map((c) => c.type).join(',')}`);
});

test('M315/A2: uncover kosztuje koszt many KARTY, przywraca cechy i zdejmuje ward (CR 701.56b)', () => {
  const state = game('p1');
  const cloaked = cloakedFrom(state, 'goblin-piker');
  addMana(state, 'p1', 5, { colors: ['R'] });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  assert.ok(cmd, 'oferta uncover');
  // specjalna akcja: NIE idzie na stos (ruling „doesn't use the stack")
  const r = execute(state, cmd);
  assert.ok(r.ok, `uncover przyjęty: ${JSON.stringify(r.events[0]?.reason)}`);
  assert.equal(state.zones.stack.length, 0, 'bez stosu (specjalna akcja)');
  const flipped = state.objects.get(cloaked.id);
  assert.equal(flipped.faceDown, false, 'twarz do góry');
  assert.equal(flipped.cardName ?? REGISTRY.get(flipped.cardId)?.name, 'Goblin Piker', 'nazwa karty przywrócona');
  assert.equal(flipped.manaCost, 2, 'koszt many karty przywrócony (nie 0 zakrycia)');
  assert.ok((flipped.colors ?? []).includes('R'), 'kolory karty przywrócone');
  assert.deepEqual(flipped.keywords ?? [], [], 'keywordy z karty (Piker ich nie ma) — nie zakrycia');
  assert.equal(flipped.ward ?? null, null, 'po uncover cloak TRACI ward {2} (CR 701.56b)');
  assert.ok(!flipped.cloakReady, 'flaga zakrycia zdjęta');
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.ok(p1.mana <= 3, `zapłacono koszt {2} z puli (zostało ≤3): ${p1.mana}`);
});

test('M315/A2: noncreature pod zakryciem — brak oferty (ruling: „revealing that it is a creature card")', () => {
  const state = game('p1');
  const cloaked = cloakedFrom(state, 'basic-plains');
  assert.equal(cloaked.cloakReady ?? true, false, 'land nie jest kartą stwora (RED: flaga zawsze brak)');
  const view = playerView(state, 'p1');
  assert.ok(!view.legalCommands.some((c) => c.type === 'turn_cloak_face_up'),
    'uncover niedostępny dla noncreature');
});

test('M315/A2: za mało many — brak oferty (L48: oferta = walidacja)', () => {
  const state = game('p1');
  const cloaked = cloakedFrom(state, 'goblin-piker');
  assert.ok(cloaked);
  const view = playerView(state, 'p1');
  assert.ok(!view.legalCommands.some((c) => c.type === 'turn_cloak_face_up'),
    'bez many na {2} uncover nie jest oferowany');
});

test('M315/A2: uncover działa też z NIEPUSTYM stosem (special action, any time you have priority)', () => {
  const state = game('p1');
  const cloaked = cloakedFrom(state, 'goblin-piker');
  addMana(state, 'p1', 5, { colors: ['R'] });
  // cokolwiek na stosie: rzut Shocka
  putCard(state, 'shock', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['R'] });
  const rCast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: ['p2'] });
  assert.ok(rCast.ok, `rzut Shocka poszedł na stos: ${JSON.stringify(rCast.events?.[0]?.reason)}`);
  assert.ok(state.zones.stack.length > 0, 'stos niepusty');
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  assert.ok(cmd, 'special action dostępna także ze stosem (any time you have priority)');
  const r = execute(state, cmd);
  assert.ok(r.ok, `przyjęta: ${JSON.stringify(r.events[0]?.reason)}`);
  assert.equal(state.objects.get(cloaked.id).faceDown, false);
  assert.ok(state.zones.stack.length > 0, 'stos nietknięty — akcja nie korzysta ze stosu');
});

test('M315/A2: przeciwnik NIE dostaje oferty uncover cudzego zakrytego', () => {
  const state = game('p2');
  const cloaked = cloakedFrom(state, 'goblin-piker', 'p1');
  addMana(state, 'p2', 9, { colors: ['W'] });
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  assert.ok(!view.legalCommands.some((c) => c.type === 'turn_cloak_face_up'),
    `cudzy zakryty nie podlega uncover (RED gdyby oferta wyszła): ${view.legalCommands.map((c) => c.type).join(',')}`);
  assert.ok(cloaked.faceDown);
});
