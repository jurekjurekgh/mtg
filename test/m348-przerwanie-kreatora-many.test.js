import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addMana } from '../src/engine/resources.js';

const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
function localFunction(name) {
  const from = source.indexOf(`  function ${name}(`);
  assert.notEqual(from, -1, `${name} w main.js`);
  const end = source.indexOf('\n  }', from);
  assert.ok(end > from);
  return source.slice(from, end + '\n  }'.length);
}
function realSession() {
  return createSession({
    seed: 348, registry: createCardRegistry(),
    decks: new Map([[HUMAN_ID, Array(20).fill('goblin-piker')], [BOT_ID, Array(20).fill('basic-forest')]]),
  });
}

for (const nextNeedsWizard of [false, true]) {
  test(`M348/A: przerwanie kreatora loguje i obsługuje nową komendę (nowy kreator: ${nextNeedsWizard})`, () => {
    // Prawdziwa sesja/log/mana; stubowane są tylko manipulacje DOM i wykonanie
    // kolejnego kroku UI. Legalność kosztów sprawdzają testy mana-wizard/engine.
    const session = realSession();
    addMana(session.state, HUMAN_ID, 1, { colors: ['R'] });
    const oldCard = session.view().zones.hand.find((o) => o.controllerId === HUMAN_ID);
    assert.ok(oldCard);
    const previous = { cmd: { type: 'cast_permanent', objectId: oldCard.id, playerId: HUMAN_ID } };
    const next = { type: 'cast_spell', playerId: HUMAN_ID, objectId: 'next' };
    const following = { cmd: next, totalNeeded: 3 };
    const before = session.debugFingerprint();
    const logCount = session.log.length;
    const calls = [];
    const ctx = createContext({ session, manaWizardDescriptor: previous });
    ctx.closeManaWizard = () => { calls.push('close'); ctx.manaWizardDescriptor = null; };
    ctx.manaWizardFor = (cmd) => {
      assert.equal(cmd, next);
      assert.equal(session.log.at(-1).kind, 'system');
      assert.match(session.log.at(-1).text, /Przerwano płatność many: Goblin Piker/);
      calls.push('plan');
      return nextNeedsWizard ? following : null;
    };
    ctx.playDirect = (cmd) => { assert.equal(cmd, next); calls.push('direct'); };
    ctx.openManaWizard = (descriptor) => { assert.equal(descriptor, following); calls.push('open'); ctx.manaWizardDescriptor = descriptor; };
    const play = runInContext(`${localFunction('describeAbandonedCast')}\n${localFunction('play')}\nplay;`, ctx);
    assert.doesNotThrow(() => play(next), 'tablica session.log nie jest funkcją');
    assert.deepEqual(calls, ['close', 'plan', nextNeedsWizard ? 'open' : 'direct']);
    assert.equal(session.log.length, logCount + 1, 'dokładnie jeden wpis o anulowaniu');
    assert.ok(Array.isArray(session.log), 'czytelnicy nadal dostają tablicę');
    assert.equal(session.debugFingerprint(), before, 'samo przerwanie nie wydaje ani nie cofa many');
    assert.equal(ctx.manaWizardDescriptor, nextNeedsWizard ? following : null);
  });
}

test('M348/B: wpis systemowy ma jawne API i nie udaje zdarzenia silnika', () => {
  const session = realSession();
  const before = session.debugFingerprint();
  const count = session.log.length;
  assert.equal(typeof session.logSystem, 'function');
  session.logSystem('Komunikat interfejsu');
  assert.deepEqual(session.log.at(-1), { kind: 'system', text: 'Komunikat interfejsu' });
  assert.equal(session.log.length, count + 1);
  assert.equal(session.debugFingerprint(), before);
});

test('M348/C: bez poprzedniego kreatora nie ma anulowania ani próby logowania', () => {
  const session = realSession();
  const count = session.log.length;
  const calls = [];
  const cmd = { type: 'pass_priority', playerId: HUMAN_ID };
  const ctx = createContext({ session, manaWizardDescriptor: null, manaWizardFor: () => null, playDirect: (c) => calls.push(c) });
  const play = runInContext(`${localFunction('play')}\nplay;`, ctx);
  play(cmd);
  assert.deepEqual(calls, [cmd]);
  assert.equal(session.log.length, count);
});
