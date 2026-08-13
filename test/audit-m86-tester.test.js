import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';
import { describeSpellEffects } from '../src/table/render.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

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
