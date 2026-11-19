// =============================================================================
// Zgłoszenie D (playtest 2026-11-16): Mindstab rzucany jako Suspend
//
// Objaw na stole: gracz klika „Suspend: Mindstab" — karta mechanicznie trafia
// do exile z 4 licznikami czasu i odliczanie działa poprawnie, ale brak
// JAKIEJKOLWIEK widocznej informacji zwrotnej (ani w modalu „Rozgrywka",
// ani na ekranie wysokograficznym).
//
// Przyczyna:
//  1. `card_suspended` i `card_plotted` były w BOT_PAUSE_EVENTS (bot) i miały
//     opisy w `describeEvent`, ale brakowało ich w `HUMAN_DIGEST_EVENTS` (brak
//     wpisu w „Rozgrywce" dla człowieka) i w `BOT_MOVE_CARD_EVENTS` (brak
//     miniatury karty w „Rozgrywce").
//  2. `CAST_EVENT_TYPES` nie zawierało `card_suspended`/`card_plotted`, więc
//     ekran wysokograficzny (`onCast` / `onCastShowcase`) nigdy nie odpalał
//     się przy zawieszaniu / plotowaniu.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession, HUMAN_DIGEST_EVENTS } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { renderCardArtShowcase } from '../src/table/render.js';
import * as artShowcase from '../src/table/art-showcase.js';

const REGISTRY = createCardRegistry();

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.alt = '';
    this.src = '';
    this.decoding = '';
    this.style = {};
    this.children = [];
    this.listeners = new Map();
  }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  descendants() {
    const out = [];
    for (const c of this.children) {
      out.push(c);
      if (typeof c.descendants === 'function') out.push(...c.descendants());
    }
    return out;
  }
}

function withFakeDocument(fn) {
  const prev = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try { return fn(); }
  finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

function addCardToZone(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  state.objects.set(id, Object.freeze({
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone, ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  }));
  state.zones[zone].push(id);
}

function makeHumanActionSession({ handCardId, landCardId, onCast = null, pauseOnBotMoves = true } = {}) {
  const sess = createSession({
    seed: 101,
    registry: REGISTRY,
    pauseOnBotMoves,
    onCast,
    decks: new Map([
      [HUMAN_ID, Array(20).fill('basic-plains')],
      [BOT_ID, Array(20).fill('basic-swamp')],
    ]),
  });
  const s = sess.state;
  s.pendingMulligans = [];
  addCardToZone(s, 'h-card', handCardId, HUMAN_ID, 'hand');
  addCardToZone(s, 'h-land', landCardId, HUMAN_ID, 'battlefield');
  s.turn = jumpToStep(s.turn, 'main1', HUMAN_ID);
  s.turn.activePlayerId = HUMAN_ID;
  s.turn.priorityPlayerId = HUMAN_ID;
  return sess;
}

test('D1: Mindstab (suspend_card) wpisuje się do „Rozgrywki" z miniaturą i odpala ekran wysokograficzny', () => {
  assert.equal(HUMAN_DIGEST_EVENTS.has('card_suspended'), true,
    'HUMAN_DIGEST_EVENTS musi zawierać card_suspended');

  const onCastCalls = [];
  const sess = makeHumanActionSession({
    handCardId: 'mindstab',
    landCardId: 'basic-swamp',
    onCast: (payload) => { onCastCalls.push(payload); return true; },
  });

  const view = sess.view();
  const suspendCmd = view.legalCommands.find((c) => c.type === 'suspend_card' && c.objectId === 'h-card');
  assert.ok(suspendCmd, 'gracz ma legalną komendę suspend_card dla Mindstab');

  const res = sess.apply(suspendCmd);
  assert.equal(res.ok, true);
  assert.equal(res.artPause, true, 'onCast zwrócił true → artPause wstrzymuje grę do zamknięcia warstwy grafik');
  assert.equal(sess.artPausePending, true);

  assert.equal(onCastCalls.length, 1, 'onCast musi zostać wywołany dla suspend_card');
  assert.deepEqual(onCastCalls[0], {
    cardId: 'mindstab',
    playerId: HUMAN_ID,
    eventType: 'card_suspended',
    faceDown: false,
  });

  const suspendMove = sess.botMoves.find((m) => m.type === 'card_suspended');
  assert.ok(suspendMove, 'modal „Rozgrywka" (botMoves) musi dostać wpis card_suspended dla człowieka');
  assert.match(suspendMove.text, /Zawieszasz Mindstab \(4 liczniki czasu\)/);
  assert.equal(suspendMove.cardId, 'mindstab', 'wpis w „Rozgrywce" musi nieść cardId do miniatury');

  // Po zamknięciu warstwy grafik człowiek ma nadal priorytet i wpis w Rozgrywce zostaje do wyświetlenia.
  const after = sess.continueArtPlay();
  assert.equal(after.artPause, false);
  assert.equal(sess.artPausePending, false);
  assert.ok(sess.botMoves.some((m) => m.type === 'card_suspended' && m.cardId === 'mindstab'));
});

test('D2: Plot (plot_card) wpisuje się do „Rozgrywki" z miniaturą i odpala ekran wysokograficzny', () => {
  assert.equal(HUMAN_DIGEST_EVENTS.has('card_plotted'), true,
    'HUMAN_DIGEST_EVENTS musi zawierać card_plotted');

  const onCastCalls = [];
  const sess = makeHumanActionSession({
    handCardId: 'tumbleweed-rising',
    landCardId: 'basic-forest',
    onCast: (payload) => { onCastCalls.push(payload); return true; },
  });
  // Plot kosztuje {3}{G} — dodajemy 3 dodatkowe lasy.
  addCardToZone(sess.state, 'h-land-2', 'basic-forest', HUMAN_ID, 'battlefield');
  addCardToZone(sess.state, 'h-land-3', 'basic-forest', HUMAN_ID, 'battlefield');
  addCardToZone(sess.state, 'h-land-4', 'basic-forest', HUMAN_ID, 'battlefield');

  const view = sess.view();
  const plotCmd = view.legalCommands.find((c) => c.type === 'plot_card' && c.objectId === 'h-card');
  assert.ok(plotCmd, 'gracz ma legalną komendę plot_card dla Tumbleweed Rising');

  const res = sess.apply(plotCmd);
  assert.equal(res.ok, true);
  assert.equal(res.artPause, true);

  assert.equal(onCastCalls.length, 1);
  assert.deepEqual(onCastCalls[0], {
    cardId: 'tumbleweed-rising',
    playerId: HUMAN_ID,
    eventType: 'card_plotted',
    faceDown: false,
  });

  const plotMove = sess.botMoves.find((m) => m.type === 'card_plotted');
  assert.ok(plotMove, 'modal „Rozgrywka" (botMoves) musi dostać wpis card_plotted dla człowieka');
  assert.match(plotMove.text, /Plotujesz Tumbleweed Rising/);
  assert.equal(plotMove.cardId, 'tumbleweed-rising');
});

test('D3: gdy bot zawiesza Mindstab, onCast i „Rozgrywka" dostają card_suspended + miniaturę (exile jawne)', () => {
  const onCastCalls = [];
  const sess = createSession({
    seed: 100,
    registry: REGISTRY,
    pauseOnBotMoves: true,
    onCast: (payload) => { onCastCalls.push(payload); return false; },
    decks: new Map([
      [HUMAN_ID, Array(20).fill('basic-plains')],
      [BOT_ID, Array(20).fill('mindstab')],
    ]),
  });
  sess.state.pendingMulligans = [];
  addCardToZone(sess.state, 'bot-swamp', 'basic-swamp', BOT_ID, 'battlefield');
  sess.state.turn = jumpToStep(sess.state.turn, 'main1', HUMAN_ID);
  sess.state.turn.activePlayerId = HUMAN_ID;
  sess.state.turn.priorityPlayerId = HUMAN_ID;

  let suspendMove = null;
  for (let i = 0; i < 300 && sess.state.status === 'active'; i += 1) {
    if (sess.botPausePending) {
      const hit = sess.botMoves.find((m) => m.type === 'card_suspended');
      if (hit) { suspendMove = hit; break; }
      sess.clearBotMoves();
      sess.continueBotPlay();
      continue;
    }
    const view = sess.view();
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd || !sess.apply(cmd).ok) break;
  }

  assert.ok(suspendMove, 'bot w partii testowej zawiesza Mindstab');
  assert.equal(suspendMove.cardId, 'mindstab', 'CR 400.2: wygnanie jest jawne, więc wpis bota niesie miniaturę');
  const botOnCast = onCastCalls.find((c) => c.eventType === 'card_suspended' && c.playerId === BOT_ID);
  assert.ok(botOnCast, 'onCast odpala się też dla zawieszenia bota');
  assert.equal(botOnCast.cardId, 'mindstab');
  assert.equal(botOnCast.faceDown, false);
});

test('D4: ekran wysokograficzny dobiera czasownik Zawiesza / Plotuje i przekazuje go w main.js', () => {
  assert.equal(typeof artShowcase.castShowcaseVerbOf, 'function',
    'art-showcase.js powinien eksportować castShowcaseVerbOf');
  assert.equal(artShowcase.castShowcaseVerbOf('card_suspended'), 'Zawiesza');
  assert.equal(artShowcase.castShowcaseVerbOf('card_plotted'), 'Plotuje');
  assert.equal(artShowcase.castShowcaseVerbOf('spell_cast'), 'Rzuca');

  const mindstab = REGISTRY.get('mindstab');
  withFakeDocument(() => {
    const host = new MiniEl('div');
    renderCardArtShowcase(host, mindstab, {
      casterName: 'Czarodziejka',
      verb: artShowcase.castShowcaseVerbOf('card_suspended'),
    });
    const caption = host.descendants().find((el) => el.className === 'showcase-caster');
    assert.equal(caption?.textContent, 'Zawiesza: Czarodziejka');
  });

  const mainSrc = fs.readFileSync('src/table/main.js', 'utf8');
  const start = mainSrc.indexOf('function onCastShowcase(');
  const end = mainSrc.indexOf('function onTransformShowcase(', start);
  const body = mainSrc.slice(start, end);
  assert.match(body, /eventType/, 'onCastShowcase musi przyjmować eventType');
  assert.match(body, /castShowcaseVerbOf/, 'onCastShowcase musi mapować eventType przez castShowcaseVerbOf');
});
