// M201/E (zgłoszenie właściciela, Battle-Rattle Shaman):
// „Zdolność powinna się rozstrzygać tylko w fazie walki JEJ KONTROLERA.
//  Rozstrzyga się w każdej fazie walki (dodaje +2/0).”
//
// Oracle (zweryfikowane u źródła — L57):
//  • Battle-Rattle Shaman: „At the beginning of combat ON YOUR TURN, you may
//    have target creature get +2/+0 until end of turn.” → tylko tura kontrolera;
//  • Jyoti, Moag Ancient: „At the beginning of EACH combat, land creatures you
//    control get +X/+X…” → każda walka, także przeciwnika.
//
// Silnik miał JEDNO zdarzenie `beginning_of_combat` bez rozróżnienia, więc
// obie karty odpalały w każdej walce — jedna zgodnie z Oracle, druga wbrew.
// Rozróżnienie jest DESKRYPTOREM (`eachCombat`), nie warunkiem po nazwie
// karty (ADR 0002), a strażnik katalogu pilnuje zgodności z Oracle (L56).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();
const BEGIN_COMBAT = 4; // indeks kroku beginning_of_combat

function put(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Wchodzi w krok „początek walki” tury `active` i zwraca zdarzenia komendy. */
function enterCombat(active, build) {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  const idx = BEGIN_COMBAT - 1; // declare... wchodzimy passami z poprzedniego kroku
  state.turn = { ...initialTurn(active), ...TURN_STEPS[idx], stepIndex: idx, activePlayerId: active, priorityPlayerId: active, passes: 0 };
  build(state);
  const events = [];
  for (let i = 0; i < 4 && state.turn.step !== 'beginning_of_combat'; i += 1) {
    const res = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.equal(res.ok, true);
    events.push(...res.events);
  }
  assert.equal(state.turn.step, 'beginning_of_combat', 'scenariusz: jesteśmy w początku walki');
  return { state, events };
}

const firedFor = (events, cardId) => events.filter((e) => e.type === 'ability_triggered' && e.cardId === cardId).length
  + events.filter((e) => e.type === 'trigger_target_required' && e.cardId === cardId).length;

test('M201/E: „on your turn” — Battle-Rattle Shaman NIE odpala w walce przeciwnika', () => {
  const { events } = enterCombat('p2', (state) => {
    put(state, 'shaman', 'battle-rattle-shaman', 'p1');
    put(state, 'foe', 'hill-giant', 'p2');
  });
  assert.equal(firedFor(events, 'battle-rattle-shaman'), 0,
    'Oracle: „at the beginning of combat on your turn” — cudza walka nie odpala zdolności');
});

test('M201/E: „on your turn” — Battle-Rattle Shaman odpala we WŁASNEJ walce', () => {
  const { events } = enterCombat('p1', (state) => {
    put(state, 'shaman', 'battle-rattle-shaman', 'p1');
    put(state, 'friend', 'hill-giant', 'p1');
  });
  assert.ok(firedFor(events, 'battle-rattle-shaman') > 0, 'własna walka MUSI odpalić zdolność');
});

test('M201/E: anty-over-fix — „each combat” (Jyoti) odpala także w walce przeciwnika', () => {
  const { events } = enterCombat('p2', (state) => {
    put(state, 'jyoti', 'jyoti-moag-ancient', 'p1');
  });
  assert.ok(firedFor(events, 'jyoti-moag-ancient') > 0,
    'Oracle Jyoti: „at the beginning of EACH combat” — cudza walka też');
});

test('M201/E (strażnik katalogu, L56): deskryptor zgodny z Oracle każdej karty', () => {
  const problems = [];
  for (const card of REGISTRY.all()) {
    for (const ability of card.abilities ?? []) {
      if (ability?.trigger?.event !== 'beginning_of_combat') continue;
      const oracle = (card.oracleText ?? '').toLowerCase();
      const saysEach = /beginning of each combat/.test(oracle);
      const saysYourTurn = /beginning of combat on your turn/.test(oracle);
      const declaredEach = ability.trigger.eachCombat === true;
      if (saysEach && !declaredEach) problems.push(`${card.id}: Oracle mówi „each combat”, brak trigger.eachCombat`);
      if (saysYourTurn && declaredEach) problems.push(`${card.id}: Oracle mówi „on your turn”, a deskryptor ma eachCombat`);
      if (!saysEach && !saysYourTurn) {
        problems.push(`${card.id}: Oracle nie mówi ani „each combat”, ani „on your turn” — rozstrzygnij ręcznie i dopisz wyjątek`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});
