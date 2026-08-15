import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Audyt PR #44 + uwagi właściciela A/B (2026-08-12):
 * A  — modal „Rozgrywka” bez pustych faz;
 * B1 — niezablokowany atak pokazuje „zadaje N obrażeń” w logu i modalu;
 * B1+ — zablokowany atak: bloki + obrażenia stwór–stwór; infect: trucizna;
 * B2 — fullscreen nie chowa wizardu ataku/bloku (choice-request).
 */

function addRealCard(state, registry, id, cardId, playerId, zone, extra = {}) {
  const card = registry.get(cardId);
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

function keepMulligan(session) {
  const mull = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  if (mull) assert.ok(session.apply({ ...mull, keep: true }).ok, 'keep mulligan');
}

function dumpHumanHand(state) {
  for (const id of [...state.zones.hand]) {
    if (state.objects.get(id)?.controllerId !== HUMAN_ID) continue;
    state.zones.hand = state.zones.hand.filter((x) => x !== id);
    const gid = `grave-${state.objectSequence++}`;
    state.zones.graveyard.push(gid);
    const o = state.objects.get(id);
    state.objects.delete(id);
    state.objects.set(gid, Object.freeze({ ...o, id: gid, zone: 'graveyard' }));
  }
}

function passBotFactory() {
  return () => ({
    chooseCommand(view) {
      const emptyBlock = view.legalCommands.find(
        (c) => c.type === 'declare_blockers' && Object.keys(c.assignments ?? {}).length === 0,
      );
      if (emptyBlock) return emptyBlock;
      const keep = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep !== false);
      if (keep) return keep;
      const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
      if (pass) return pass;
      return view.legalCommands.find((c) => c.type !== 'concede') ?? view.legalCommands[0];
    },
  });
}

/** Bot zawsze blokuje, gdy ma jakąkolwiek niepustą ofertę declare_blockers. */
function blockingBotFactory() {
  return () => ({
    chooseCommand(view) {
      const blocks = view.legalCommands.filter(
        (c) => c.type === 'declare_blockers' && Object.keys(c.assignments ?? {}).length > 0,
      );
      if (blocks.length > 0) return blocks[0];
      const emptyBlock = view.legalCommands.find((c) => c.type === 'declare_blockers');
      if (emptyBlock) return emptyBlock;
      const keep = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep !== false);
      if (keep) return keep;
      const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
      if (pass) return pass;
      return view.legalCommands.find((c) => c.type !== 'concede') ?? view.legalCommands[0];
    },
  });
}

test('B1: niezablokowany atak człowieka — log i modal mają „zadaje … obrażeń\"', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, Array.from({ length: 8 }, () => 'basic-plains')],
    [BOT_ID, Array.from({ length: 8 }, () => 'basic-mountain')],
  ]);
  const session = createSession({
    seed: 11, registry, decks, pauseOnBotMoves: false, botFactory: passBotFactory(),
  });
  keepMulligan(session);
  const state = session.state;
  dumpHumanHand(state);
  addRealCard(state, registry, 'att', 'highland-game', HUMAN_ID, 'battlefield');
  state.objects.set('att', Object.freeze({ ...state.objects.get('att'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  const attack = session.view().legalCommands.find(
    (c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('att'),
  );
  assert.ok(attack, 'deklaracja ataku Highland Game w ofercie');
  assert.ok(session.apply(attack).ok, 'apply ataku');
  const logText = session.log.map((l) => l.text).join('\n');
  assert.match(logText, /zadaje .+ obraż/, `log bez obrażeń walki:\n${logText}`);
  const modalText = session.botMoves.map((m) => m.text).join('\n');
  assert.match(modalText, /zadaje .+ obraż/, `modal bez obrażeń walki:\n${modalText}`);
  assert.ok(
    !session.botMoves.some((m) => m.type === 'discard_choice_required' || m.type.startsWith('resolve_')),
    'decyzje człowieka nie trafiają do botMoves',
  );
});

test('B2: openCardFullscreen / ByCardId nie chowają choice-request', () => {
  const src = fs.readFileSync('src/table/main.js', 'utf8');
  const stmt = /^[ \t]*hideModal\('choice-request'\);/m;
  const openById = src.slice(src.indexOf('function openCardFullscreenByCardId'), src.indexOf('function openUndercityFullscreen'));
  const openObj = src.slice(src.indexOf('function openCardFullscreen(objectId)'), src.indexOf('function renderFullscreenFor'));
  assert.ok(!stmt.test(openById), 'openCardFullscreenByCardId nie może chować wizardu');
  assert.ok(!stmt.test(openObj), 'openCardFullscreen nie może chować wizardu');
});

test('B1: zablokowany atak — modal ma blok i obrażenia stwór–stwór', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, Array.from({ length: 8 }, () => 'basic-plains')],
    [BOT_ID, Array.from({ length: 8 }, () => 'basic-mountain')],
  ]);
  const session = createSession({
    seed: 11, registry, decks, pauseOnBotMoves: false, botFactory: blockingBotFactory(),
  });
  keepMulligan(session);
  const state = session.state;
  dumpHumanHand(state);
  addRealCard(state, registry, 'att', 'highland-game', HUMAN_ID, 'battlefield');
  addRealCard(state, registry, 'blk', 'goblin-piker', BOT_ID, 'battlefield');
  state.objects.set('att', Object.freeze({ ...state.objects.get('att'), summoningSickness: false }));
  state.objects.set('blk', Object.freeze({ ...state.objects.get('blk'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  const attack = session.view().legalCommands.find(
    (c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('att'),
  );
  assert.ok(attack, 'deklaracja ataku w ofercie');
  assert.ok(session.apply(attack).ok, 'apply ataku');
  const modalText = session.botMoves.map((m) => m.text).join('\n');
  assert.match(modalText, /blokuje/, `modal bez bloku:\n${modalText}`);
  assert.match(modalText, /zadaje .+ obraż/, `modal bez obrażeń stwór–stwór:\n${modalText}`);
});

test('B1: infect — modal pokazuje znaki trucizny (nie tylko utratę życia)', () => {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, Array.from({ length: 8 }, () => 'basic-plains')],
    [BOT_ID, Array.from({ length: 8 }, () => 'basic-mountain')],
  ]);
  const session = createSession({
    seed: 11, registry, decks, pauseOnBotMoves: false, botFactory: passBotFactory(),
  });
  keepMulligan(session);
  const state = session.state;
  dumpHumanHand(state);
  addRealCard(state, registry, 'inf', 'token_insect', HUMAN_ID, 'battlefield');
  state.objects.set('inf', Object.freeze({ ...state.objects.get('inf'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  const attack = session.view().legalCommands.find(
    (c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('inf'),
  );
  assert.ok(attack, 'deklaracja ataku owada z infect');
  assert.ok(session.apply(attack).ok, 'apply ataku infect');
  const modalText = session.botMoves.map((m) => m.text).join('\n');
  assert.match(modalText, /trucizn/, `modal bez trucizny:\n${modalText}`);
  const bot = state.players.find((pl) => pl.id === BOT_ID);
  assert.ok((bot.poison ?? 0) >= 1, 'przeciwnik dostał znak trucizny');
});
