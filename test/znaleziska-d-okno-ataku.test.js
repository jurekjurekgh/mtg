// D (znalezisko testera): po deklaracji atakujących silnik skakał OD RAZU
// do bloków — obrońca nie miał okna „gdy Bot mnie zaatakuje” (CR 508.2:
// po deklaracji priorytet dostaje AKTYWNY gracz, potem tura priorytetów).
// Fix (precedens M172/C dla 509.4): deklaracja zostaje w kroku, priorytet →
// aktywny; pełna runda passów przechodzi do bloków jak zwykle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { BOT_ID, HUMAN_ID, createSession, commandOptionKey } from '../src/table/session.js';

const R = createCardRegistry();
function combat() {
  const s = createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2');
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p2';
  return s;
}
function put(s, id, cardId, c, zone, patch = {}) {
  const d = R.get(cardId); assert.ok(d, cardId);
  addObject(s, { ...gameObjectDataOf(d), id, instanceId: `i-${id}`, cardId, controllerId: c, ownerId: c, zone,
    types: d.types ?? [], keywords: d.keywords ?? [], subtypes: d.subtypes ?? [], spell: d.spell, ...patch });
}
function readyAttacker(s) {
  put(s, 'att', 'goblin-piker', 'p2', 'battlefield');
  s.objects.set('att', Object.freeze({ ...s.objects.get('att'), summoningSickness: false }));
}
function declare(s, ids = ['att']) {
  const cmd = playerView(s, 'p2').legalCommands.find((c) => c.type === 'declare_attackers'
    && JSON.stringify(c.attackerIds) === JSON.stringify(ids));
  assert.ok(cmd, 'oferta deklaracji');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}

test('D: po deklaracji krok zostaje, priorytet wraca do aktywnego (508.2)', () => {
  const s = combat(); readyAttacker(s);
  const r = declare(s);
  assert.equal(s.turn.step, 'declare_attackers', 'okno odpowiedzi w kroku ataku');
  assert.equal(s.turn.priorityPlayerId, 'p2', 'najpierw aktywny (CR 508.2)');
  assert.ok(s.combat, 'walka zapamiętana');
  assert.equal(r.events.some((e) => e.type === 'step_advanced'), false, 'krok się nie zmienił');
});

test('D: pełna runda passów po deklaracji przechodzi do bloków', () => {
  const s = combat(); readyAttacker(s);
  declare(s);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(s.turn.step, 'declare_blockers');
  assert.equal(s.turn.priorityPlayerId, 'p1');
  assert.ok(playerView(s, 'p1').legalCommands.some((c) => c.type === 'declare_blockers'), 'oferta bloków');
});

test('D: obrońca rzuca flash w oknie po deklaracji (scenariusz właściciela)', () => {
  const s = combat(); readyAttacker(s);
  put(s, 'bell', 'village-bell-ringer', 'p1', 'hand');
  put(s, 'pl1', 'basic-plains', 'p1', 'battlefield');
  put(s, 'pl2', 'basic-plains', 'p1', 'battlefield');
  put(s, 'pl3', 'basic-plains', 'p1', 'battlefield');
  declare(s);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok);
  const v = playerView(s, 'p1');
  const cast = v.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'bell');
  assert.ok(cast, 'Bell Ringer rzucalny w oknie 508.2');
  assert.ok(execute(s, cast).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok([...s.objects.values()].some((o) => o.cardId === 'village-bell-ringer' && o.zone === 'battlefield'),
    'Bell Ringer wchodzi na pole w oknie 508.2');
});

test('D: powtórna deklaracja w tym samym combacie odrzucana', () => {
  const s = combat(); readyAttacker(s);
  declare(s);
  const again = playerView(s, 'p2').legalCommands.filter((c) => c.type === 'declare_attackers');
  assert.equal(again.length, 0, 'brak oferty re-deklaracji');
  const r = execute(s, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['att'] });
  assert.equal(r.ok, false, 'twardy reject re-deklaracji');
});

test('D: pusta deklaracja też daje okno; po pustej walce combat sprzątnięty', () => {
  const s = combat(); readyAttacker(s);
  declare(s, []);
  assert.equal(s.turn.step, 'declare_attackers');
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(s.turn.step, 'declare_blockers');
  const blk = playerView(s, 'p1').legalCommands.find((c) => c.type === 'declare_blockers');
  assert.ok(blk);
  assert.ok(execute(s, blk).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(s, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.equal(s.turn.step, 'end_of_combat', 'brak atakujących = skip obrażeń (M257)');
  assert.equal(s.combat, null, 'pusty combat nie zalega do następnej walki');
});

test('D/sesja: auto-pass STAJE w oknie 508.2 przy nieodmutowanym fleszu; wyciszony — przewija', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, Array.from({ length: 10 }, () => 'basic-plains')],
    [BOT_ID, Array.from({ length: 10 }, () => 'basic-mountain')],
  ]);
  const ignored = new Set();
  const session = createSession({ seed: 7, registry, decks, ignoredOptionKeys: ignored, pauseOnBotMoves: false });
  const state = session.state;
  while (true) {
    const mull = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
    if (!mull) break;
    assert.ok(session.apply({ ...mull, keep: true }).ok);
  }
  const addReal = (id, cardId, playerId, zone, patch = {}) => {
    const card = registry.get(cardId);
    addObject(state, { ...gameObjectDataOf(card), id, instanceId: `i-${id}`, cardId,
      controllerId: playerId, ownerId: playerId, zone,
      types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [], ...patch });
  };
  // Scena: tura bota, krok deklaracji, bot ma gotowego atakującego.
  state.turn = jumpToStep(state.turn, 'declare_attackers', BOT_ID);
  state.turn.activePlayerId = BOT_ID; state.turn.priorityPlayerId = BOT_ID;
  addReal('orc', 'goblin-piker', BOT_ID, 'battlefield');
  state.objects.set('orc', Object.freeze({ ...state.objects.get('orc'), summoningSickness: false }));
  // Człowiek: Bell Ringer w ręce + 3 odtapnięte równiny.
  for (const id of [...state.zones.hand]) {
    if (state.objects.get(id)?.controllerId !== HUMAN_ID) continue;
    state.zones.hand = state.zones.hand.filter((x) => x !== id);
    const gid = `grave-${state.objectSequence++}`;
    state.zones.graveyard.push(gid);
    const o = state.objects.get(id);
    state.objects.delete(id);
    state.objects.set(gid, Object.freeze({ ...o, id: gid, zone: 'graveyard' }));
  }
  addReal('bell', 'village-bell-ringer', HUMAN_ID, 'hand');
  addReal('pl1', 'basic-plains', HUMAN_ID, 'battlefield');
  addReal('pl2', 'basic-plains', HUMAN_ID, 'battlefield');
  addReal('pl3', 'basic-plains', HUMAN_ID, 'battlefield');
  // Bot deklaruje (bezpośrednio, żeby nie zależeć od polityki ataku).
  assert.ok(execute(state, { type: 'declare_attackers', playerId: BOT_ID, attackerIds: ['orc'] }).ok);
  // 1. Flesz NIE wyciszony → auto-pass STAJE u człowieka w oknie 508.2.
  session.recheckAutoPass();
  const v = session.view();
  assert.equal(v.turn.priorityPlayerId, HUMAN_ID, 'stop u człowieka w oknie po deklaracji');
  assert.equal(v.turn.step, 'declare_attackers', 'okno 508.2, nie bloki');
  const cast = v.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'bell');
  assert.ok(cast, 'Bell Ringer w ofercie (odmutowany flesz przerywa)');
  // 2. Wyciszony flesz → auto-pass przewija (semantyka mute bez zmian).
  ignored.add(commandOptionKey(cast));
  session.recheckAutoPass();
  const v2 = session.view();
  assert.ok(v2.turn.step !== 'declare_attackers' || v2.turn.priorityPlayerId !== HUMAN_ID,
    'wyciszony flesz nie zatrzymuje auto-passu');
});
