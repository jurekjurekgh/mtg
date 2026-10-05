// M141+ — zgłoszenia A/B z testów właściciela
//
// A. Chittering Rats — hand_top_choice_resolved nie ujawnia karty (FoW)
//    M144: własna karta nadal z nazwą (CR 400.2); test zachowaniowy (L5).
// B. Fathom Fleet Cutthroat — zniszczenie trafia do panelu Rozgrywka

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { playerView } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addMana } from '../src/engine/resources.js';
import { markDamage } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';

const helpers = {
  nameOf: (id) => ({ swamp: 'Swamp', 'chittering-rats': 'Chittering Rats' }[id] ?? id),
  nameOfObject: () => '?',
};

// --- Bug A: Chittering Rats FoW (M142 + korekta M144) ---

test('Bug A: hand_top_choice_resolved — karta przeciwnika bez nazwy (FoW)', () => {
  const text = describeGameEvent({
    type: 'hand_top_choice_resolved',
    playerId: BOT_ID,
    cardId: 'swamp',
  }, helpers);
  assert.match(text, /kartę/);
  assert.doesNotMatch(text, /Swamp/);
});

test('Bug A: hand_top_choice_resolved — własna karta z nazwą (CR 400.2)', () => {
  const text = describeGameEvent({
    type: 'hand_top_choice_resolved',
    playerId: HUMAN_ID,
    cardId: 'swamp',
  }, helpers);
  assert.match(text, /Swamp/);
});

test('Bug A: hand_top_choice_required nie wpisuje nazwy karty z palca (ADR 0002)', () => {
  const withSrc = describeGameEvent({
    type: 'hand_top_choice_required',
    playerId: BOT_ID,
    sourceCardId: 'chittering-rats',
  }, helpers);
  assert.match(withSrc, /Chittering Rats/);
  const noSrc = describeGameEvent({
    type: 'hand_top_choice_required',
    playerId: BOT_ID,
  }, helpers);
  assert.doesNotMatch(noSrc, /Chittering Rats/);
});

// --- Bug B: Fathom Fleet Cutthroat — sprawdź że zniszczenia trafiają do panelu ---

/** Realna karta i wymuszony scenariusz zamiast polowania na zniszczenie
 * w 14 seedach ruchomych talii repo. Dawny test nie musiał nawet zagrać
 * Fathom Fleet Cutthroat; migracja Dominarii wyzerowała jego obserwacje.
 */
function cutthroatSession() {
  const registry = createCardRegistry();
  const session = createSession({ registry, seed: 141, pauseOnBotMoves: true,
    decks: new Map([
      [HUMAN_ID, ['woolly-loxodon', ...Array(20).fill('basic-forest')]],
      [BOT_ID, ['fathom-fleet-cutthroat', ...Array(20).fill('basic-swamp')]],
    ]),
    // Sterownik scenariusza, nie test strategii: gra prawdziwym ETB, a
    // pozostałe kroki pasuje. Każda zwracana komenda pochodzi z oferty.
    botFactory: () => ({ chooseCommand(view) {
      const source = view.zones.hand.find(o => o.cardId === 'fathom-fleet-cutthroat');
      const cmd = view.legalCommands.find(c => c.type === 'cast_permanent' && c.objectId === source?.id)
        ?? view.legalCommands.find(c => c.type === 'resolve_trigger_target')
        ?? view.legalCommands.find(c => c.type === 'pass_priority')
        ?? view.legalCommands.find(c => c.type !== 'concede');
      assert.ok(cmd, 'sterownik ma legalną komendę');
      return cmd;
    } }),
  });
  const state = session.state;
  state.pendingMulligans = [];
  const locate = cardId => [...state.objects.values()].find(o => o.cardId === cardId);
  const victim = moveObjectDirectly(state, locate('woolly-loxodon').id, 'battlefield', 'victim');
  const cutthroat = locate('fathom-fleet-cutthroat');
  moveObjectDirectly(state, cutthroat.id, 'hand', 'cutthroat');
  state.turn = jumpToStep(state.turn, 'main', BOT_ID);
  state.turn.activePlayerId = BOT_ID; state.turn.priorityPlayerId = BOT_ID;
  markDamage(state, victim.id, 1); // 6/7 żyje, ale został zraniony w tej turze.
  addMana(state, BOT_ID, 4, { colors: ['B'] });
  return session;
}

for (const finalPass of [HUMAN_ID, BOT_ID]) {
  test(`Bug B: Fathom Fleet Cutthroat — zniszczenie w panelu, ostatni pass ${finalPass}`, () => {
    const session = cutthroatSession(); const state = session.state;
    const offered = () => playerView(state, state.turn.priorityPlayerId).legalCommands;
    const cast = offered().find(c => c.type === 'cast_permanent' && c.objectId === 'cutthroat');
    assert.ok(cast, 'rzut rzeczywistego Cutthroat jest legalny');
    assert.ok(session.apply(cast, { holdPriority: true }).ok);
    // Cały przebieg idzie przez sesję, aby jej tracker stosu dostał zapowiedź.
    // Rozstrzygnij TYLKO czar stworzenia. ETB z jedynym legalnym celem
    // pozostaje na stosie; oba passy muszą zostać zaakceptowane.
    for (let i = 0; i < 8 && !state.zones.stack.some(id => state.objects.get(id)?.triggerEntry); i++) {
      assert.ok(session.apply(offered().find(c => c.type === 'pass_priority'), { holdPriority: true }).ok);
    }
    const trigger = state.objects.get(state.zones.stack.at(-1));
    assert.equal(trigger?.cardId, 'fathom-fleet-cutthroat');
    assert.deepEqual(trigger.triggerEntry.targets, ['victim']);
    assert.equal(state.objects.get('victim')?.zone, 'battlefield');
    session.clearBotMoves();
    // Ustaw wyłącznie punkt startu priorytetu fixture. Od teraz wejście
    // przez sesję: obejmuje obie ścieżki streamowania skutku (M141/M146).
    const firstPass = finalPass === HUMAN_ID ? BOT_ID : HUMAN_ID;
    state.turn.priorityPlayerId = firstPass; state.turn.passes = 0;
    if (firstPass === BOT_ID) {
      assert.ok(session.apply(offered().find(c => c.type === 'pass_priority'), { holdPriority: true }).ok);
    }
    const humanPass = session.view().legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(humanPass); assert.ok(session.apply(humanPass).ok);
    const log = session.log.filter(e => (e.text ?? '').includes('zostaje zniszczony'));
    const panel = session.botMoves.filter(e => (e.text ?? '').includes('zostaje zniszczony'));
    assert.equal(state.events.filter(e => e.type === 'permanent_destroyed' && e.fromId === 'victim').length, 1,
      'zdarzenie naprawdę zaszło, dokładnie raz');
    assert.equal(log.length, 1, 'konkretne zniszczenie w logu, nie warunkowy skip');
    assert.equal(panel.length, 1, 'ten sam skutek w panelu Rozgrywka');
    assert.match(panel[0].text, /Woolly Loxodon/);
    assert.equal(panel[0].cardId, 'woolly-loxodon', 'publiczna miniatura ofiary');
  });
}

// --- M146: stats_modified opisuje każdy wariant skutku (nie „undefined/undefined") ---

test('M146: stats_modified lock_untap ma czytelny opis (nie undefined/undefined)', () => {
  const text = describeGameEvent({
    type: 'stats_modified', objectId: 'lyre-host', cardId: 'entrancing-lyre',
    untapLocked: true, sourceId: 'lyre',
  }, { ...helpers, nameOfObject: (id) => ({ 'lyre-host': 'Krumar Initiate', lyre: 'Entrancing Lyre' }[id] ?? id) });
  assert.ok(!text.includes('undefined'), `undefined w opisie: ${text}`);
  assert.match(text, /nie odkręca się/);
  assert.match(text, /Entrancing Lyre/);
});

test('M146: stats_modified skipsNextUntap i base PT mają czytelne opisy', () => {
  const nameOfObject = (id) => ({ host: 'Wavecrash Triton' }[id] ?? id);
  const skip = describeGameEvent({ type: 'stats_modified', objectId: 'host', cardId: 'wavecrash-triton', skipsNextUntap: true }, { ...helpers, nameOfObject });
  assert.ok(!skip.includes('undefined'), `undefined w opisie: ${skip}`);
  assert.match(skip, /nie odkręca się w następnym kroku odkręcania/);
  const base = describeGameEvent({ type: 'stats_modified', objectId: 'host', cardId: 'x', basePower: 4, baseToughness: 4, untilEndOfTurn: true }, { ...helpers, nameOfObject });
  assert.ok(!base.includes('undefined'), `undefined w opisie: ${base}`);
  assert.match(base, /staje się 4\/4 do końca tury/);
});

// --- M146 (uwaga właściciela): trigger PRZECIWNIKA nie mówi „twoich" -------
test('M146: trigger przeciwnika (Nefarious Imp) opisuje „permanenty (Nieprzyjaciel)", nie „twoje"', () => {
  const names = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent({
    type: 'ability_triggered',
    objectId: 'imp', cardId: 'nefarious-imp',
    trigger: 'permanents_you_control_leave_battlefield',
  }, {
    ...helpers,
    nameOf: (id) => ({ 'nefarious-imp': 'Nefarious Imp' }[id] ?? id),
    controllerOf: () => 'p2', // źródło należy do bota
  }, names);
  assert.ok(!text.includes('twoich'), `zaimek „twoich" przy cudzym triggerze: ${text}`);
  assert.match(text, /permanentów \(Nieprzyjaciel\)/);
});

test('M146: trigger WŁASNY nadal mówi „twoich" (perspektywa gracza)', () => {
  const names = { p1: 'Czarodziejka', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent({
    type: 'ability_triggered',
    objectId: 'x', cardId: 'x',
    trigger: 'permanents_you_control_leave_battlefield',
  }, {
    ...helpers,
    controllerOf: () => 'p1', // źródło gracza
  }, names);
  assert.match(text, /twoich permanentów/);
});
