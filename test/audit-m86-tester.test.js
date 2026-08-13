import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { describeSpellEffects, renderTableView, renderBotMoves } from '../src/table/render.js';
import { renderChoiceRequest } from '../src/table/choice-request.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.className = '';
    this.text = '';
    this.html = '';
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
}
globalThis.document ??= { createElement: (tag) => new MiniEl(tag) };

const helpers = {
  nameOf: (id) => id,
  nameOfObject: () => 'Karta',
};

test('cards_milled od spodu nie wpisuje nazwy karty (ADR 0002)', () => {
  const text = describeGameEvent({
    type: 'cards_milled', playerId: 'p1', amount: 4, fromBottom: true,
  }, helpers);
  assert.match(text, /od spodu biblioteki/);
  assert.doesNotMatch(text, /Sweet Oblivion/);
});

test('object_flipped nie dubluje turned_face_up w logu', () => {
  assert.equal(describeGameEvent({ type: 'object_flipped', objectId: 'x' }, helpers), null);
});

test('opisy efektów: mill od spodu, Flurry, Howl (Forest)', () => {
  assert.match(
    describeSpellEffects({ effects: [{ type: 'mill_from_bottom', amount: 4 }] }),
    /od spodu/,
  );
  assert.match(
    describeSpellEffects({
      effects: [{ type: 'create_token', amount: 'attacking_creatures_count', power: 1, toughness: 1, name: 'Bird' }],
    }),
    /atakującego/,
  );
});

test('Ty tworzysz token — poprawna odmiana (nie „Ty tworzy”)', () => {
  const text = describeGameEvent({
    type: 'token_created', controllerId: 'p1', name: 'Wolf', power: 2, toughness: 2,
  }, helpers);
  assert.match(text, /Ty tworzysz token Wolf/);
});

test('bot mieli przeciwnika, nie siebie', () => {
  const bot = createHeuristicBot({ seed: 11 });
  const view = {
    playerId: 'p2',
    winnerId: null,
    status: 'active',
    turn: { number: 4, step: 'main', phase: 'precombat_main', activePlayerId: 'p2' },
    players: [{ id: 'p1', life: 18 }, { id: 'p2', life: 18 }],
    zones: {
      hand: [{
        id: 'so', cardId: 'sweet-oblivion', kind: 'spell', controllerId: 'p2', manaCost: 2,
        spell: { timing: 'sorcery', targets: [{ type: 'player' }], effects: [{ type: 'mill_from_bottom', amount: 4 }] },
      }],
      battlefield: [],
      library: Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, controllerId: 'p2' })),
      graveyard: [], exile: [], stack: [],
    },
    legalCommands: [
      { type: 'cast_spell', objectId: 'so', targets: ['p2'] },
      { type: 'cast_spell', objectId: 'so', targets: ['p1'] },
      { type: 'pass_priority', playerId: 'p2' },
    ],
  };
  const cmd = bot.chooseCommand(view);
  assert.deepEqual(cmd.targets, ['p1']);
});

test('bot nie strzela ETB-obrażeń we własnego stwora', () => {
  const bot = createHeuristicBot({ seed: 12 });
  const view = {
    playerId: 'p2',
    winnerId: null,
    status: 'active',
    turn: { number: 5, step: 'main', phase: 'precombat_main', activePlayerId: 'p2' },
    players: [{ id: 'p1', life: 18 }, { id: 'p2', life: 18 }],
    zones: {
      hand: [],
      battlefield: [
        { id: 'mine', controllerId: 'p2', kind: 'creature', power: 4, toughness: 3 },
        { id: 'foe', controllerId: 'p1', kind: 'creature', power: 2, toughness: 2 },
      ],
      library: Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, controllerId: 'p2' })),
      graveyard: [], exile: [], stack: [],
    },
    legalCommands: [
      { type: 'resolve_trigger_target', targetId: 'mine' },
      { type: 'resolve_trigger_target', targetId: 'foe' },
    ],
  };
  const cmd = bot.chooseCommand(view);
  assert.equal(cmd.targetId, 'foe');
});

test('modal wyboru: textContent nie skleja MulliganMulligan', () => {
  const host = new MiniEl('div');
  renderChoiceRequest(host, {
    id: 'c', type: 'command',
    options: [
      { type: 'resolve_mulligan_choice', playerId: 'p1', keep: true },
      { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false },
    ],
  }, {
    introLabel: 'Wybierz: Mulligan',
    labelForOption: (o) => (o.keep ? 'Mulligan: Zatrzymaj tę rękę' : 'Mulligan: Weź mulligana'),
    onResponse: () => {},
  });
  assert.doesNotMatch(host.textContent, /MulliganMulligan/);
  assert.match(host.textContent, /Wybierz: Mulligan/);
  assert.match(host.textContent, /Mulligan: Zatrzymaj/);
});

test('ruch bota: twarz karty nie skleja się z opisem (IslandIBasic)', () => {
  const host = new MiniEl('div');
  const registry = createCardRegistry();
  const session = {
    cardDetails: (id) => registry.get(id) ?? null,
    nameOf: (id) => registry.get(id)?.name ?? id,
  };
  renderBotMoves(host, [{ cardId: 'basic-island', text: 'Nieprzyjaciel zagrywa Island' }], session);
  assert.doesNotMatch(host.textContent, /IslandIBasic/);
  assert.match(host.textContent, /Nieprzyjaciel zagrywa Island/);
});

test('kafel: P/T i zaczarowana tylko raz (nie 2/22/2)', () => {
  const registry = createCardRegistry();
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [], hand: [],
      battlefield: [
        { id: 'host', cardId: 'rustwing-falcon', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 2 },
        { id: 'aura1', cardId: 'hobble', controllerId: 'p1', zone: 'battlefield', kind: 'aura', attachedTo: 'host', aura: true },
      ],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => id,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn', 'exileZone', 'hand', 'actions', 'log']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const bf = els.bfOwn.textContent;
  assert.doesNotMatch(bf, /1\/21\/2/);
  const enc = bf.match(/zaczarowana:/g) ?? [];
  assert.equal(enc.length, 1, bf.slice(0, 280));
});
