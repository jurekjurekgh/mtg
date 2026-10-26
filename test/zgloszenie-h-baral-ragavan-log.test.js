// H — zgłoszenie właściciela z gry (2026-10-24, Baral and Kari Zev):
//
//   „Rzuciłem czar instant. Nie miałem innego, którego mógłbym rzucić bez
//    kosztu. Zgodnie z treścią karty na stole pojawił się First Mate
//    Ragavan, ale nie dostałem o tym żadnej informacji ani w Rozgrywka ani
//    w logu. Powinna był informacja, że stworzyłem tego tokena."
//
// Baral and Kari Zev: „Whenever you cast your first instant or sorcery spell
// each turn, you may cast a spell with lesser mana value that shares a card
// type with it from your hand without paying its mana cost. If you don't,
// create First Mate Ragavan…". Przy braku kandydatów silnik domyka decyzję
// sam (auto-skip w `pruneDeadPendingDecisions`, B6b) i aplikuje elseEffect
// przez `applyEffect`.
//
// Root cause: `pruneDeadPendingDecisions` zwracał wyniki ręcznie zbieraną
// listą przy `state.events.push(e)` — zdarzeń dopisanych PRZEZ SAM
// `applyEffect` (m.in. `token_created`, wejście tokena, nadanie haste) lista
// nie zawierała. Token powstawał więc wyłącznie w historii stanu: żaden
// wynik komendy nie niósł tych zdarzeń do sesji, więc akt stworzenia nie
// istniał ani w logu, ani w „Rozgrywka" (był tylko prompt triggera).
// Fix: prune zwraca cały plaster `state.events` dopisany podczas
// przycinania (jedno źródło kontraktu zdarzeń wyniku).
//
// Pin na warstwie objawu (sesja stołu): własny Baral + pierwszy instant
// w turze (Shock o MV 1 — żaden czar nie ma mniejszej MV, więc kandydów brak
// zawsze) → token na stole ORAZ linia „tworzysz token First Mate Ragavan"
// w logu i w modalu „Rozgrywka".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

test('H: auto-rezygnacja Barala (brak kandydatów) — stworzenie Ragavana widać w logu i w „Rozgrywka"', () => {
  const registry = createCardRegistry();
  const human = [...Array(7).fill('basic-mountain'), ...Array(7).fill('basic-island'),
    ...Array(4).fill('baral-and-kari-zev'), ...Array(4).fill('shock')];
  const session = createSession({
    registry,
    decks: new Map([[HUMAN_ID, human], [BOT_ID, Array(24).fill('basic-island')]]),
    seed: 5,
    pauseOnBotMoves: true,
  });
  const modal = [];
  const drain = () => { for (const m of session.botMoves) modal.push(m.text); session.clearBotMoves?.(); };
  const cardOf = (id) => session.state.objects.get(id)?.cardId;
  const hasRagavan = () => [...session.state.objects.values()]
    .some((o) => o.cardId === 'token_first_mate_ragavan' && o.zone === 'battlefield');
  const baralOnBf = () => [...session.state.objects.values()]
    .some((o) => o.cardId === 'baral-and-kari-zev' && o.zone === 'battlefield');
  let shockCast = false;
  let after = 0;
  for (let i = 0; i < 900 && session.state.status === 'active'; i += 1) {
    drain();
    if (session.botPausePending) { session.continueBotPlay(); drain(); continue; }
    if (hasRagavan() && (after += 1) > 3) break;
    const cmds = session.view().legalCommands ?? [];
    const cmd =
      cmds.find((c) => c.type.includes('mulligan'))
      ?? cmds.find((c) => c.type === 'play_land')
      ?? cmds.find((c) => c.type === 'cast_permanent' && cardOf(c.objectId) === 'baral-and-kari-zev')
      ?? ((!shockCast && baralOnBf())
        ? cmds.find((c) => c.type === 'cast_spell' && cardOf(c.objectId) === 'shock')
        : null)
      ?? cmds.find((c) => c.type.startsWith('resolve_'))
      ?? cmds.find((c) => c.type === 'pass_priority' || c.type === 'resolve_combat')
      ?? cmds.find((c) => c.type !== 'concede');
    assert.ok(cmd, 'sterownik partii musi zawsze mieć komendę');
    if (cmd.type === 'cast_spell' && cardOf(cmd.objectId) === 'shock') shockCast = true;
    assert.equal(session.apply(cmd).ok, true, `komenda ${cmd.type} nie może zostać odrzucona`);
  }
  drain();
  // Scenariusz naprawdę zaszedł ścieżką auto-domknięcia (pin niepusty).
  assert.ok(hasRagavan(), 'First Mate Ragavan powstał na stole');
  assert.ok(session.state.events.some(
    (e) => e.type === 'hand_free_cast_resolved' && e.declined && e.noCandidates),
  'decyzja domknięta automatycznie z braku kandydatów (ścieżka zgłoszenia)');
  const log = session.log.map((entry) => entry.text ?? String(entry));
  assert.ok(log.some((t) => t.includes('tworzysz token First Mate Ragavan')),
    'log informuje o stworzeniu tokena');
  assert.ok(modal.some((t) => t.includes('tworzysz token First Mate Ragavan')),
    'modal „Rozgrywka" informuje o stworzeniu tokena');
});
