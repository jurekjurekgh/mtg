import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { choiceGroupTitle } from '../src/table/render.js';

const registry = createCardRegistry();

function makeSessionWithAbility(abilities) {
  const sess = createSession({
    seed: 19, registry,
    decks: new Map([
      [HUMAN_ID, Array(60).fill('basic-swamp')],
      [BOT_ID, Array(60).fill('basic-plains')],
    ]),
  });
  const def = registry.get('coralhelm-guide');
  addObject(sess.state, {
    id: 'src', instanceId: 'i-src', cardId: 'coralhelm-guide',
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    abilities,
  });
  return sess;
}

test('F-6/1 (M87): choiceGroupTitle bez manaHtml nie wycieka surowego HTML <span class="ms-group"> dla zdolności z xValue', () => {
  const sess = makeSessionWithAbility([{
    type: 'activated',
    cost: { manaX: true, mana: 1, colors: ['B'], tap: true, payLifeX: true },
    effect: { type: 'endure', amount: 'X' },
  }]);
  const view = sess.view();
  const req = {
    options: [
      { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'src', abilityIndex: 0, xValue: 0 },
      { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'src', abilityIndex: 0, xValue: 1 },
    ],
  };

  const plain = choiceGroupTitle(req, sess, view, { manaHtml: false });
  const html = choiceGroupTitle(req, sess, view, { manaHtml: true });
  assert.doesNotMatch(plain, /<span|<i\b/i, `nagłówek modala textContent nie może zawierać HTML: ${plain}`);
  assert.match(plain, /\(koszt \{X\}\{B\}, \{T\}, zapłać X życia\)/);
  assert.match(html, /ms-group/, 'panel akcji z manaHtml=true nadal dostaje ikony many');
});

test('F-6/2 (M87): choiceGroupTitle bez manaHtml nie wycieka surowego HTML dla zdolności z celem (targets)', () => {
  const sess = makeSessionWithAbility([{
    type: 'activated',
    cost: { mana: 2, colors: ['U'], tap: true },
    target: { type: 'creature' },
    effect: { type: 'tap_target' },
  }]);
  const view = sess.view();
  const req = {
    options: [
      { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'src', abilityIndex: 0, targets: ['t1'] },
      { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'src', abilityIndex: 0, targets: ['t2'] },
    ],
  };

  const plain = choiceGroupTitle(req, sess, view, { manaHtml: false });
  assert.doesNotMatch(plain, /<span|<i\b/i, `nagłówek modala nie może zawierać HTML: ${plain}`);
  assert.match(plain, /\(koszt \{1\}\{U\}, \{T\}\)/);
});

test('F-6/3 (M87): choiceGroupTitle bez manaHtml nie wycieka surowego HTML dla zdolności z tap/sacrifice innego permanentu', () => {
  const sess = makeSessionWithAbility([{
    type: 'activated',
    cost: { mana: 1, colors: ['B'], sacrificeCreature: { another: true } },
    effect: { type: 'draw_cards', count: 1 },
  }]);
  const view = sess.view();
  const req = {
    options: [
      { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'src', abilityIndex: 0, sacrificeCreatureId: 'c1' },
      { type: 'activate_ability', playerId: HUMAN_ID, objectId: 'src', abilityIndex: 0, sacrificeCreatureId: 'c2' },
    ],
  };

  const plain = choiceGroupTitle(req, sess, view, { manaHtml: false });
  assert.doesNotMatch(plain, /<span|<i\b/i, `nagłówek modala nie może zawierać HTML: ${plain}`);
  assert.match(plain, /\(koszt \{B\}, poświęć innego stwora\)/);
});
