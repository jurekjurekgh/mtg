import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  choiceGroupTitle, commandLabel, describeSpellEffects, renderTableView,
} from '../src/table/render.js';
import { renderLookWizard } from '../src/table/choice-request.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * M87 — naprawy A–C z transkryptów żywego testera:
 *  A. apostrof w tytule modala (Hunter's Blowgun) + sklejanie kart w look wizard;
 *  B. fałszywy alarm „puste okno passu” przy samym concede;
 *  C. Steel Sabotage: tryby Kontr/Odbicie, opis kafla, grupowanie, Village Rites.
 */

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.type = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
}

globalThis.document ??= { createElement: (tag) => new MiniEl(tag) };
globalThis.window ??= { confirm: () => false, innerWidth: 1024, innerHeight: 768, matchMedia: () => ({ matches: false }) };

const REGISTRY = createCardRegistry();

function fakeSession(view) {
  return {
    view: () => view,
    log: [],
    reasoning: [],
    state: { seed: 87 },
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => id,
    cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
    colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  };
}

function emptyZones() {
  return { hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [] };
}

function tableEls() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  return els;
}

function baseView(overrides = {}) {
  return {
    status: 'active',
    winnerId: null,
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    turn: { number: 3, activePlayerId: 'p1', phase: 'precombat_main', step: 'main' },
    zones: emptyZones(),
    legalCommands: [],
    ...overrides,
  };
}

test('A: choiceGroupTitle Hunter\'s Blowgun nie escape\'uje apostrofu', () => {
  const view = baseView({
    zones: {
      ...emptyZones(),
      battlefield: [{
        id: 'gun', cardId: 'hunters-blowgun', controllerId: 'p1', zone: 'battlefield',
        kind: 'artifact',
      }],
    },
  });
  const req = {
    id: 'c1', type: 'target',
    options: [
      { type: 'activate_ability', objectId: 'gun', abilityIndex: 0, targets: ['c1'] },
      { type: 'activate_ability', objectId: 'gun', abilityIndex: 0, targets: ['c2'] },
    ],
  };
  const title = choiceGroupTitle(req, fakeSession(view), view);
  assert.match(title, /Hunter's Blowgun/);
  assert.doesNotMatch(title, /&#39;/);
  assert.match(title, /Cel zdolności/);
});

test('C: choiceGroupTitle Steel Sabotage rozróżnia tryby Kontr i Odbicie', () => {
  const steel = REGISTRY.get('steel-sabotage');
  const view = baseView({
    zones: {
      ...emptyZones(),
      hand: [{ id: 'ss', cardId: 'steel-sabotage', kind: 'spell', spell: steel.spell }],
    },
  });
  const session = fakeSession(view);
  const kontr = choiceGroupTitle({
    id: 'k', type: 'target',
    options: [{ type: 'cast_spell', objectId: 'ss', modeIndex: 0, targets: ['stack-1'] }],
  }, session, view);
  const odbicie = choiceGroupTitle({
    id: 'o', type: 'target',
    options: [{ type: 'cast_spell', objectId: 'ss', modeIndex: 1, targets: ['art-1'] }],
  }, session, view);
  assert.match(kontr, /Steel Sabotage/);
  assert.match(kontr, /Kontr/);
  assert.match(odbicie, /Steel Sabotage/);
  assert.match(odbicie, /Odbicie/);
  assert.notEqual(kontr, odbicie);
});

test('C: describeSpellEffects Steel Sabotage opisuje tryby, nie puste pole', () => {
  const text = describeSpellEffects(REGISTRY.get('steel-sabotage').spell);
  assert.match(text, /wybierz jedno/);
  assert.match(text, /Kontr/);
  assert.match(text, /Odbicie/);
  assert.notEqual(text.trim(), '');
});

test('C: commandLabel Village Rites pokazuje poświęcanego stwora', () => {
  const view = baseView({
    zones: {
      ...emptyZones(),
      hand: [{ id: 'rites', cardId: 'village-rites', kind: 'spell' }],
      battlefield: [{ id: 'goat', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield', kind: 'creature' }],
    },
  });
  const label = commandLabel(
    { type: 'cast_spell', objectId: 'rites', targets: [], sacrificeTargetId: 'goat' },
    fakeSession(view),
    view,
  );
  assert.match(label, /poświęć/i);
  assert.match(label, /Highland Game/);
});

test('A: renderLookWizard surveil nie skleja Curate2. Woolly', () => {
  const host = new MiniEl('div');
  renderLookWizard(host, {
    kind: 'surveil',
    cards: [{ id: 'c1', name: 'Curate' }, { id: 'c2', name: 'Woolly Loxodon' }],
    onComplete: () => {},
  });
  assert.doesNotMatch(host.textContent, /Curate2\./);
  assert.doesNotMatch(host.textContent, /CurateWoolly/);
  assert.match(host.textContent, /1\. Curate/);
  assert.match(host.textContent, /2\. Woolly Loxodon/);
});

test('B: sam concede nie pokazuje alarmu pustego okna passu', () => {
  const view = baseView({
    legalCommands: [{ type: 'concede', playerId: 'p1' }],
  });
  const els = tableEls();
  renderTableView({ els, session: fakeSession(view), play: () => {}, onCardClick: () => {} });
  assert.doesNotMatch(els.actions.textContent, /To nie powinno się zdarzyć/);
});

test('B: pass + concede pokazuje alarm auto-passu', () => {
  const view = baseView({
    legalCommands: [
      { type: 'pass_priority', playerId: 'p1' },
      { type: 'concede', playerId: 'p1' },
    ],
  });
  const els = tableEls();
  renderTableView({ els, session: fakeSession(view), play: () => {}, onCardClick: () => {} });
  assert.match(els.actions.textContent, /To nie powinno się zdarzyć/);
});

test('C: dwa tryby Steel Sabotage to dwa przyciski, nie jeden Wybierz', () => {
  const steel = REGISTRY.get('steel-sabotage');
  const view = baseView({
    zones: {
      ...emptyZones(),
      hand: [{ id: 'ss', cardId: 'steel-sabotage', kind: 'spell', spell: steel.spell }],
      stack: [{ id: 'stack-1', cardId: 'cogwork-assembler', kind: 'creature', types: ['Artifact', 'Creature'] }],
      battlefield: [{ id: 'art-1', cardId: 'entrancing-lyre', kind: 'artifact', controllerId: 'p2', zone: 'battlefield' }],
    },
    legalCommands: [
      { type: 'cast_spell', objectId: 'ss', modeIndex: 0, targets: ['stack-1'] },
      { type: 'cast_spell', objectId: 'ss', modeIndex: 1, targets: ['art-1'] },
      { type: 'pass_priority', playerId: 'p1' },
      { type: 'concede', playerId: 'p1' },
    ],
  });
  const els = tableEls();
  const opened = [];
  renderTableView({
    els,
    session: fakeSession(view),
    play: () => {},
    onCardClick: () => {},
    onChoiceRequest: (req) => opened.push(req),
  });
  const buttons = els.actions.children.filter((el) => el.tagName === 'button');
  const wybierz = buttons.filter((b) => /Wybierz/.test(b.textContent));
  assert.equal(wybierz.length, 0, `nie oczekiwano jednego Wybierz: ${els.actions.textContent}`);
  const labels = buttons.map((b) => b.textContent);
  assert.ok(labels.some((t) => /Kontr/.test(t)), `brak Kontr: ${labels.join(' | ')}`);
  assert.ok(labels.some((t) => /Odbicie/.test(t)), `brak Odbicie: ${labels.join(' | ')}`);
  assert.equal(opened.length, 0);
});

function game(seed = 87) {
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

test('C: Steel Sabotage tryb Kontr kontruje artifact creature na stosie', () => {
  const state = mainPhase(game(), 'p2');
  addRealCard(state, 'cog', 'cogwork-assembler', 'p2', 'hand');
  addRealCard(state, 'ss', 'steel-sabotage', 'p1', 'hand');
  addMana(state, 'p2', 3, []);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'cog' }).ok);
  const stackedId = state.zones.stack.at(-1);
  const stacked = state.objects.get(stackedId);
  assert.ok(stacked, 'Cogwork na stosie');
  assert.ok((stacked.types ?? []).includes('Artifact') || stacked.kind === 'artifact',
    `types na stosie: ${JSON.stringify(stacked.types)} kind=${stacked.kind}`);
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 1, ['U']);
  const cast = playerView(state, 'p1').legalCommands.find((c) =>
    c.type === 'cast_spell' && c.objectId === 'ss' && c.modeIndex === 0 && c.targets?.[0] === stackedId);
  assert.ok(cast, 'tryb Kontr oferuje artifact creature na stosie');
  assert.ok(execute(state, cast).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const cog = [...state.objects.values()].find((o) => o.cardId === 'cogwork-assembler');
  assert.ok(cog, 'Cogwork nadal istnieje jako obiekt');
  assert.notEqual(cog.zone, 'battlefield', 'skontruwany nie wchodzi na bitwisko');
  assert.equal(cog.zone, 'graveyard', `oczekiwano grobu, jest ${cog.zone}`);
});
