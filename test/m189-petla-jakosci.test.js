// M189 — pętla jakości Żywym Testerem (dokończenie po M187).
// Z2: „trigger bez efektu (nic się nie wydarzyło (zerowy wynik))" pokazywany
// dla LEGALNEGO no-opa (tap już tapniętego celu — CR 701.20b). Komunikat
// sugerował graczowi zgubioną zdolność albo błąd silnika.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function game(playerId = 'p1') {
  const state = createGameState({ seed: 189, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Rzuca Glaring Aegis na własnego stwora, celując triggerem we wroga. */
function castAegis(state) {
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'aegis');
  assert.ok(cast, 'oferta rzutu aury');
  assert.ok(execute(state, cast).ok);
  // Aura ma DWIE decyzje: gospodarz (w komendzie) i cel triggera ETB —
  // pętla domyka jedno i drugie, aż stos i decyzje się wyczerpią.
  for (let i = 0; i < 20; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const cmds = playerView(state, pid).legalCommands;
    const choice = cmds.find((c) => c.type.startsWith('resolve_'));
    if (!choice && state.zones.stack.length === 0) break;
    const r = execute(state, choice ?? { type: 'pass_priority', playerId: pid });
    if (!r.ok) break;
  }
  return state.events.filter((e) => e.type === 'trigger_resolved');
}

test('Z2: tap JUŻ TAPNIĘTEGO celu to legalny no-op, nie „zerowy wynik"', () => {
  // Transkrypt audyt-m187/g10: gracz stapował Jeskai Devotee zdolnością many,
  // bot rzucił Glaring Aegis („tap target creature an opponent controls"),
  // a log ogłosił „trigger bez efektu (nic się nie wydarzyło)". Trigger był
  // legalny i w pełni wykonany — cel po prostu był już tapnięty.
  const state = game('p1');
  putCard(state, 'aegis', 'glaring-aegis', 'p1', 'hand');
  putCard(state, 'mine', 'highland-game', 'p1');
  putCard(state, 'foe', 'jeskai-devotee', 'p2', 'battlefield', {});
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), tapped: true }));
  addMana(state, 'p1', 1, { colors: ['W'] });
  const resolved = castAegis(state);
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  const noEffect = resolved.filter((e) => e.noEffect);
  assert.deepEqual(noEffect.map((e) => e.reason), [],
    'legalnie wykonany trigger NIE jest oznaczany jako „bez efektu\"');
  assert.equal(state.objects.get('foe').tapped, true, 'cel pozostaje tapnięty');
});

test('Z2b: tap ODKRĘCONEGO celu działa jak dotąd (kontrola)', () => {
  const state = game('p1');
  putCard(state, 'aegis', 'glaring-aegis', 'p1', 'hand');
  putCard(state, 'mine', 'highland-game', 'p1');
  putCard(state, 'foe', 'jeskai-devotee', 'p2');
  addMana(state, 'p1', 1, { colors: ['W'] });
  const resolved = castAegis(state);
  assert.ok(!resolved.some((e) => e.noEffect), 'brak komunikatu o braku efektu');
  assert.equal(state.objects.get('foe').tapped, true, 'cel realnie tapnięty');
});

test('Z2c: trigger, który NAPRAWDĘ nic nie zrobił, nadal to mówi (kontrola)', () => {
  // Anty-over-fix: komunikat M106/Z2 ma dalej działać tam, gdzie powstał
  // (Undead Servant przy pustym grobie — zero tokenów).
  const line = describeGameEvent(
    { type: 'trigger_resolved', cardId: 'undead-servant', noEffect: true, reason: 'no_result' },
    HELPERS, NAMES,
  );
  assert.match(String(line), /bez efektu/, 'realny brak skutku nadal opisany');
});

test('Z2d: opis „no_result" nie sugeruje błędu, tylko brak zmiany stanu', () => {
  const line = String(describeGameEvent(
    { type: 'trigger_resolved', cardId: 'glaring-aegis', noEffect: true, reason: 'no_result' },
    HELPERS, NAMES,
  ));
  assert.ok(!line.includes('zerowy wynik'),
    `komunikat po polsku, bez żargonu implementacji: ${JSON.stringify(line)}`);
});

test('Z2e: untap WŁASNEGO źródła, które jest już odkręcone, to też no-op', () => {
  // Transkrypt audyt-m187/g8: Steelfin Whale („whenever an artifact you
  // control enters, untap this creature") stał odkręcony, a każdy wchodzący
  // artefakt produkował „trigger bez efektu". Efekt bez jawnego celu działa
  // na ŹRÓDŁO — pierwsza wersja naprawy czytała wyłącznie `targets`.
  const state = game('p2');
  putCard(state, 'whale', 'steelfin-whale', 'p2', 'battlefield', {});
  putCard(state, 'art', 'bladed-sentinel', 'p2', 'hand');
  addMana(state, 'p2', 6, { colors: ['U', 'U', 'U', 'U', 'U', 'U'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(cast, 'oferta rzutu artefaktu');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const choice = playerView(state, pid).legalCommands.find((c) => c.type.startsWith('resolve_'));
    execute(state, choice ?? { type: 'pass_priority', playerId: pid });
  }
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'steelfin-whale');
  assert.ok(resolved.length > 0, 'trigger wieloryba się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'odkręcony stwór + untap = legalny no-op, nie „brak efektu\"');
});
