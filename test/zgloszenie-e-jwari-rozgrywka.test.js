// E — zgłoszenie właściciela z gry (2026-10-24, karta Jwari Shapeshifter):
//
//   „W boksie Rozgrywka nie ma informacji, kogo kopiuje wprowadzona Jwari.
//    Jest w logu, brakuje w Rozgrywka."
//
// Diagnoza (reprodukcja sesją stołu: własna Jwari człowieka kopiująca
// Coralhelm Guide): główny log miał linię „Kopiujesz Coralhelm Guide #1 przy
// wejściu" (opis zdarzenia `enter_as_copy_resolved` w describeGameEvent),
// a bufor modala „Rozgrywka" (botMoves) — wyłącznie generyczne „Jwari
// Shapeshifter kopiuje cechy celu" (stats_modified z flagą `copy`), bez nazwy.
//
// Root cause: typ `enter_as_copy_resolved` nie należał do żadnego zbioru
// bramki `isMainLogEvent`, więc poza oknem `botActing` (ruch bota) nigdy nie
// trafiał do `noteBotMove` — własna Jwari człowieka była właśnie takim
// przypadkiem. Wynik wyboru kopii jest tożsamością permanentu na polu bitwy
// (strefa publiczna, CR 400.2; wartości kopiowane CR 707.2) i — jak
// transformacja (E6/A2) — ma być treścią panelu niezależnie od okna
// botActing/stosu: stąd `COPY_DIGEST_EVENTS` w bramce.
//
// Pin na warstwie, na której był objaw (sesja stołu, nie sam silnik):
//   E/1 — czysty predykat bramki przepuszcza zdarzenie poza oknem bota
//         i przy pustym stosie, dla obu graczy;
//   E/2 — end-to-end: człowiek rzuca własną Jwari, modal „Rozgrywka" nazywa
//         kopiowanego stwora (parytet z logiem);
//   E/3 — end-to-end: Jwari bota też nazywa cel w modalu.
// E/2 i E/3 assertują najpierw, że wybór kopii w ogóle nastąpił (zdarzenie
// z targetId w stanie) — inaczej test byłby pusty (lekcja L65).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_ID, HUMAN_ID, createSession, isMainLogEvent, COPY_DIGEST_EVENTS,
} from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

test('E/1: enter_as_copy_resolved przechodzi bramkę Rozgrywki niezależnie od okna botActing/stosu', () => {
  assert.deepEqual([...COPY_DIGEST_EVENTS], ['enter_as_copy_resolved']);
  const ev = { type: 'enter_as_copy_resolved', playerId: BOT_ID, sourceId: 'x', targetId: 'y' };
  assert.equal(isMainLogEvent(ev, { botActing: false, stackSize: 0, phase: 'main' }), true);
  assert.equal(
    isMainLogEvent({ ...ev, playerId: HUMAN_ID }, { botActing: false, stackSize: 0, phase: 'main' }),
    true);
  // Odmowa kopiowania („wchodzi jako 0/0") też jest wynikiem wyboru na polu
  // bitwy — ten sam typ zdarzenia, targetId null.
  assert.equal(
    isMainLogEvent({ ...ev, targetId: null }, { botActing: false, stackSize: 0, phase: 'main' }),
    true);
});

const comboDeck = () => [
  ...Array(12).fill('basic-island'),
  ...Array(4).fill('coralhelm-guide'),
  ...Array(4).fill('jwari-shapeshifter'),
];
const landsDeck = () => Array(24).fill('basic-island');

function makeSession(humanDeck, botDeck, seed) {
  return createSession({
    registry: createCardRegistry(),
    decks: new Map([[HUMAN_ID, humanDeck], [BOT_ID, botDeck]]),
    seed,
    pauseOnBotMoves: true,
  });
}

function drainModal(session, modal) {
  for (const m of session.botMoves) modal.push(m.text);
  session.clearBotMoves?.();
}

test('E/2: własna Jwari człowieka — Rozgrywka nazywa kopiowanego stwora, jak log', () => {
  const session = makeSession(comboDeck(), landsDeck(), 5);
  const modal = [];
  const cardOf = (id) => session.state.objects.get(id)?.cardId;
  let copied = false;
  let after = 0;
  for (let i = 0; i < 800 && session.state.status === 'active'; i += 1) {
    drainModal(session, modal);
    if (session.botPausePending) { session.continueBotPlay(); drainModal(session, modal); continue; }
    if (copied && (after += 1) > 12) break;
    const cmds = session.view().legalCommands ?? [];
    const allyOnBf = [...session.state.objects.values()].some(
      (o) => o.zone === 'battlefield' && o.controllerId === HUMAN_ID && o.cardId === 'coralhelm-guide');
    const cmd =
      cmds.find((c) => c.type === 'resolve_enter_as_copy' && c.targetId)
      ?? cmds.find((c) => c.type.includes('mulligan'))
      ?? cmds.find((c) => c.type === 'play_land')
      ?? cmds.find((c) => c.type === 'cast_permanent' && cardOf(c.objectId) === 'coralhelm-guide')
      ?? (allyOnBf ? cmds.find((c) => c.type === 'cast_permanent' && cardOf(c.objectId) === 'jwari-shapeshifter') : null)
      ?? cmds.find((c) => c.type.startsWith('resolve_'))
      ?? cmds.find((c) => c.type === 'pass_priority' || c.type === 'resolve_combat')
      ?? cmds.find((c) => c.type !== 'concede');
    assert.ok(cmd, 'sterownik partii musi zawsze mieć komendę');
    if (cmd.type === 'resolve_enter_as_copy') copied = true;
    assert.equal(session.apply(cmd).ok, true, `komenda ${cmd.type} nie może zostać odrzucona`);
  }
  drainModal(session, modal);
  // Scenariusz naprawdę zaszedł (pin niepusty).
  assert.ok(
    session.state.events.some((e) => e.type === 'enter_as_copy_resolved' && e.targetId),
    'partia testowa musi doprowadzić do wyboru kopii przez Jwari');
  const log = session.log.map((entry) => entry.text ?? String(entry));
  assert.ok(
    log.some((t) => t.includes('Kopiujesz Coralhelm Guide')),
    'log nazywa kopiowanego stwora (stan sprzed zgłoszenia E)');
  assert.ok(
    modal.some((t) => t.includes('Kopiujesz Coralhelm Guide')),
    'modal „Rozgrywka" musi nazywać, kogo kopiuje wprowadzona Jwari (zgłoszenie E)');
});

test('E/3: Jwari bota — Rozgrywka nazywa kopiowanego stwora', () => {
  const session = makeSession(landsDeck(), comboDeck(), 5);
  const modal = [];
  for (let i = 0; i < 1200 && session.state.status === 'active'; i += 1) {
    drainModal(session, modal);
    if (session.botPausePending) { session.continueBotPlay(); drainModal(session, modal); continue; }
    if (session.state.events.some((e) => e.type === 'enter_as_copy_resolved' && e.targetId)) break;
    const cmds = session.view().legalCommands ?? [];
    const cmd = cmds.find((c) => c.type.includes('mulligan'))
      ?? cmds.find((c) => c.type.startsWith('resolve_'))
      ?? cmds.find((c) => c.type === 'pass_priority' || c.type === 'resolve_combat')
      ?? cmds.find((c) => c.type !== 'concede');
    assert.ok(cmd, 'sterownik partii musi zawsze mieć komendę');
    assert.equal(session.apply(cmd).ok, true, `komenda ${cmd.type} nie może zostać odrzucona`);
  }
  drainModal(session, modal);
  assert.ok(
    session.state.events.some((e) => e.type === 'enter_as_copy_resolved' && e.targetId),
    'bot musi w partii testowej wprowadzić Jwari jako kopię');
  assert.ok(
    modal.some((t) => t.includes('Nieprzyjaciel kopiuje Coralhelm Guide')),
    'modal „Rozgrywka" musi nazywać, kogo kopiuje Jwari bota');
});
