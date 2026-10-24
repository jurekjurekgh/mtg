import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildStateOverlay, cardInfo, renderCardFullscreen, renderMiniFace, rulesText } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const ALLY = REGISTRY.get('coralhelm-guide');

class MiniEl {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.text = '';
    this.src = '';
    this.alt = '';
    this.style = {};
    this.listeners = {};
  }

  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }

  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join('');
  }

  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
}

globalThis.document = { createElement: (tagName) => new MiniEl(tagName) };

function addCard(state, id, cardId) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `card ${cardId} exists in the registry`);
  addObject(state, {
    id,
    instanceId: `i-${id}`,
    cardId,
    controllerId: 'p1',
    ownerId: 'p1',
    zone: 'battlefield',
    ...gameObjectDataOf(card),
    types: [...(card.types ?? [])],
    keywords: [...(card.keywords ?? [])],
    subtypes: [...(card.subtypes ?? [])],
  });
}

function jwariCopyState(allyCardId = 'coralhelm-guide') {
  const state = createGameState({ seed: 702, players: [{ id: 'p1' }, { id: 'p2' }] });
  addCard(state, 'guide', allyCardId);
  addCard(state, 'jwari', 'jwari-shapeshifter');
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId: 'jwari', candidateIds: ['guide'], restorePriorityTo: 'p1',
  };
  const result = execute(state, {
    type: 'resolve_enter_as_copy', playerId: 'p1', targetId: 'guide',
  });
  assert.ok(result.ok, `Jwari copy resolves: ${result.events?.[0]?.reason ?? ''}`);
  return state;
}

function sessionFor(state, playerId = 'p1') {
  const view = playerView(state, playerId);
  return {
    view: () => view,
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId),
    nameOfObject: (objectId) => objectId,
    nameOrdinalSuffix: () => '',
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
  };
}

function copyBadges(info) {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  return visual.descendants()
    .filter((element) => String(element.className).includes('ovl-badge'))
    .map((element) => element.textContent);
}

test('Jwari battlefield copy displays the copied Ally print and characteristics but keeps its physical cardId', () => {
  const state = jwariCopyState();
  const view = playerView(state, 'p1');
  const entry = view.zones.battlefield.find((object) => object.id === 'jwari');

  assert.equal(entry.cardId, 'jwari-shapeshifter', 'the permanent keeps the identity of the physical Jwari card');
  assert.equal(entry.copiedFromCardId, 'coralhelm-guide', 'the view separately identifies the copied card');
  assert.equal(entry.copiedByCardId, 'jwari-shapeshifter', 'the view identifies the source of the copy effect');
  assert.deepEqual(entry.copiedAbilities, ALLY.abilities, 'copied ability descriptors reach the table view');

  const session = sessionFor(state);
  const info = cardInfo(session, entry);
  assert.equal(info.cardId, 'jwari-shapeshifter', 'display lookup does not replace physical card identity');
  assert.equal(info.imageUri, ALLY.imageUri, 'the table uses the copied Ally\'s Scryfall print');
  assert.deepEqual(info.types, ALLY.types, 'the copied type line is displayed');
  assert.deepEqual(info.subtypes, ALLY.subtypes, 'the copied subtypes replace Jwari\'s Shapeshifter subtype');
  assert.deepEqual(info.abilities, ALLY.abilities, 'the copied ability is displayed');
  assert.match(rulesText(info), /nie może być blokowany/i, 'the copied ability is described on the card face');
  assert.equal(info.copyBadge, 'skopiowane przez Jwari Shapeshifter', 'the copy badge names Jwari');
  assert.ok(copyBadges(info).includes('skopiowane przez Jwari Shapeshifter'), 'the copy badge is rendered on the battlefield overlay');

  const tableTile = new MiniEl('div');
  renderMiniFace(tableTile, session, 'jwari');
  const tileImage = tableTile.descendants().find((element) => element.tagName === 'img');
  assert.equal(tileImage?.src, ALLY.imageUri.replace('/large/', '/normal/'), 'the real table tile loads the copied Ally print');
  assert.ok(tableTile.textContent.includes('Creature — Merfolk Scout Ally'), 'the table tile shows the copied type line');
  assert.ok(tableTile.textContent.includes('nie może być blokowany'), 'the table tile shows the copied ability');
  assert.ok(tableTile.descendants().some((element) => String(element.className).includes('ovl-badge copy')
    && element.textContent === 'skopiowane przez Jwari Shapeshifter'), 'the rendered tile has the copy badge');

  const fullscreen = new MiniEl('div');
  renderCardFullscreen(fullscreen, info);
  const image = fullscreen.descendants().find((element) => element.tagName === 'img');
  assert.equal(image?.src, ALLY.imageUri, 'fullscreen preview also uses the copied Ally\'s Scryfall image');
});

test('Jwari copy takes the copied Ally\'s color and keyword instead of its printed blue color', () => {
  const state = jwariCopyState('makindi-aeronaut');
  const entry = playerView(state, 'p1').zones.battlefield.find((object) => object.id === 'jwari');
  const info = cardInfo(sessionFor(state), entry);

  assert.deepEqual(info.colors, ['W'], 'the copied white Ally is not displayed as Jwari\'s blue');
  assert.ok(info.keywords.includes('flying'), 'the copied Ally\'s flying keyword is visible');
  assert.equal(info.imageUri, REGISTRY.get('makindi-aeronaut').imageUri, 'the copied Ally print is used');
});

test('copy display metadata ends when the permanent leaves the battlefield', () => {
  const state = jwariCopyState();
  const moved = moveObjectDirectly(state, 'jwari', 'graveyard', 'jwari-graveyard');

  assert.equal(moved.cardId, 'jwari-shapeshifter', 'the physical card identity is preserved');
  assert.equal(moved.copiedFromCardId, null, 'the battlefield-only copied-print lookup is cleared');
  assert.equal(moved.copiedByCardId, null, 'the battlefield-only copy badge is cleared');
});

test('Jwari copy display identifiers and abilities stay hidden from an opponent when face down', () => {
  const state = jwariCopyState();
  state.objects.set('jwari', Object.freeze({ ...state.objects.get('jwari'), faceDown: true }));
  const entry = playerView(state, 'p2').zones.battlefield.find((object) => object.id === 'jwari');

  assert.equal(entry.cardId, null, 'the ordinary face-down identity mask remains in place');
  assert.equal(entry.copiedFromCardId, undefined, 'the copy source does not reveal a face-down card');
  assert.equal(entry.copiedByCardId, undefined, 'the copier identity does not reveal a face-down card');
  assert.equal(entry.copiedAbilities, undefined, 'copied abilities do not reveal a face-down card');
});

test('F-3/1 (CR 400.7 + CR 707.2): Jwari leaving the battlefield reverts all copied characteristics to its printed card', () => {
  const state = jwariCopyState('makindi-aeronaut');
  assert.equal(state.objects.get('jwari').enterAsCopy, null,
    'while copying Makindi Aeronaut on battlefield, enterAsCopy is replaced by target copiable values');
  const moved = moveObjectDirectly(state, 'jwari', 'hand', 'jwari-hand');

  assert.equal(moved.cardId, 'jwari-shapeshifter');
  assert.equal(moved.cardName, 'Jwari Shapeshifter');
  assert.equal(moved.name, null, 'non-token card in hand has no battlefield copy name');
  assert.equal(moved.copyNumber ?? null, null, 'copyNumber does not leak outside the battlefield');
  assert.equal(moved.originalBeforeCopy ?? null, null, 'copy snapshot is cleared on zone exit');
  assert.equal(moved.power, 0);
  assert.equal(moved.toughness, 0);
  assert.equal(moved.manaCost, 2);
  assert.deepEqual(moved.colors, ['U']);
  assert.deepEqual(moved.types, ['Creature']);
  assert.deepEqual(moved.subtypes, ['Shapeshifter', 'Ally']);
  assert.deepEqual(moved.keywords, []);
  assert.deepEqual(moved.enterAsCopy, { subtype: 'Ally' },
    'printed enterAsCopy descriptor is restored after leaving the battlefield');

  const handView = playerView(state, 'p1').zones.hand.find((o) => o.id === 'jwari-hand');
  assert.equal(handView.power, 0);
  assert.equal(handView.toughness, 0);
  assert.deepEqual(handView.colors, ['U']);
});

test('F-3/2 (CR 400.7 + CR 707.2): bounced Jwari recast from hand opens a fresh enter_as_copy choice', () => {
  const state = jwariCopyState('makindi-aeronaut');
  moveObjectDirectly(state, 'jwari', 'hand', 'jwari-hand');
  moveObjectDirectly(state, 'guide', 'graveyard', 'guide-gy');
  addCard(state, 'ally2', 'coralhelm-guide');
  addCard(state, 'u1', 'basic-island');
  addCard(state, 'u2', 'basic-island');
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';

  const castRes = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jwari-hand' });
  assert.equal(castRes.ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, true);

  assert.ok(state.pendingEnterAsCopy, 'recast Jwari must trigger enter_as_copy on entering battlefield');
  assert.deepEqual(state.pendingEnterAsCopy.candidateIds, ['ally2']);
});

test('F-3/3 (ADR 0003): mutating copiedAbilities in PlayerView does not mutate GameState', () => {
  const state = jwariCopyState('coralhelm-guide');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'jwari');
  assert.ok(entry.copiedAbilities.length > 0);
  const originalCost = state.objects.get('jwari').abilities[0].cost.mana;
  entry.copiedAbilities[0].cost = { ...entry.copiedAbilities[0].cost, mana: 999 };
  if (entry.copiedAbilities[0].effect && typeof entry.copiedAbilities[0].effect === 'object') {
    try { entry.copiedAbilities[0].effect.mutated = true; } catch { /* frozen is also safe */ }
  }
  assert.equal(state.objects.get('jwari').abilities[0].cost.mana, originalCost);
  assert.equal(state.objects.get('jwari').abilities[0].effect?.mutated, undefined);
});
