// =============================================================================
// Zgłoszenie H, kontynuacja (2026-11-07, odpowiedź właściciela na wyjaśnienie):
// „Zawieszenie nastąpiło w fazie Podtrzymanie i stąd w ogóle zgłoszenie."
//
// Silnik bramkuje akt zawieszenia do własnej fazy main przy pustym stosie od
// PR #36/#64 (piny: test/zgloszenie-h1-suspend-timing.test.js — zielone także
// na drzewie 7a18659, czyli buildzie po PR #179). To, co właściciel realnie
// zobaczył, było wadą WARSTWY OGŁOSZEŃ:
//
//   suspendCard/plotCard przenoszą kartę cichym `moveObjectDirectly` (bez
//   `object_moved`), a `card_suspended`/`card_plotted` nie było w
//   BOT_PAUSE_EVENTS — decyzja właściciela 2026-08-05 („pauza po zmianie
//   strefy karty") nie łapała więc specjalnych akcji. Ogłoszenie
//   „Nieprzyaciel zawiesza Mindstab" czekało w buforze modala do następnego
//   przystanku — granicy tury — i pokazywało się, gdy stół był już
//   w PODTRZYMANIU następnej tury. Gracz czytający „Rozgrywkę" widział
//   zawieszenie ogłoszone w upkeep.
//
// Fix: `card_suspended`/`card_plotted` w BOT_PAUSE_EVENTS — modal „Rozgrywka"
// pauzuje przy SAMYM akcie, we właściwej fazie, z nagłówkiem „Faza: Główna …"
// tuż nad ogłoszeniem.
//
// Pin: sesja z pauseOnBotMoves (jak żywy stół) — bot zawiesza Mindstaba;
// blok modala z ogłoszeniem „zawiesza" MUSI pojawiać się, gdy faza gry to
// nadal główna (PRZED fixem: ogłoszenie wjeżdżało w pauzę nagłówka tury
// przeciwnika, faza „beginning" — dokładnie doświadczenie właściciela).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

/**
 * Sesja jak żywy stół (pauseOnBotMoves: true). Talia bota = same Mindstaby:
 * dobierając czary (nigdy lądy), bot ma dokładnie 1 bagno — rzut {1}{B} jest
 * NIEOSIĄGALNY, więc wycena odroczenia trzyma bazę 30 (patrz
 * audyt-pmssb35-odroczenie.test.js B1), a po H2 akt wypada w Głównej 2.
 */
function makeSession() {
  const sess = createSession({
    seed: 100, registry: REGISTRY, pauseOnBotMoves: true,
    decks: new Map([
      [HUMAN_ID, Array(20).fill('basic-plains')],
      [BOT_ID, Array(20).fill('mindstab')],
    ]),
  });
  const s = sess.state;
  s.pendingMulligans = [];
  const def = REGISTRY.get('basic-swamp');
  addObjectTo(s, 'bot-swamp', 'basic-swamp', BOT_ID, def);
  // Start w głównej fazie człowieka — bot dojdzie do swojej tury w pętli gry.
  s.turn = jumpToStep(s.turn, 'main1', HUMAN_ID);
  s.turn.activePlayerId = HUMAN_ID;
  s.turn.priorityPlayerId = HUMAN_ID;
  return sess;
}

function addObjectTo(state, id, cardId, controllerId, def) {
  state.objects.set(id, Object.freeze({
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  }));
  state.zones.battlefield.push(id);
}

/**
 * Pompuje partię jak gracz na żywym stole: przy pauzie bota czyta modal
 * („Rozumiem" = continueBotPlay), w swoim oknie pasuje. Zwraca bloki modala:
 * { faza, step, texts } — stan świata W CHWILI, gdy modal był otwarty.
 */
function playCollectingPauseBlocks(sess, { maxMoves = 300 } = {}) {
  const blocks = [];
  for (let i = 0; i < maxMoves && sess.state.status === 'active'; i += 1) {
    if (sess.botPausePending) {
      blocks.push({
        faza: sess.state.turn.phase,
        step: sess.state.turn.step,
        texts: sess.botMoves.map((m) => m.text),
      });
      sess.clearBotMoves();
      sess.continueBotPlay();
      continue;
    }
    const view = sess.view();
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    if (!sess.apply(cmd).ok) break;
  }
  return blocks;
}

test('H-ogł/1: ogłoszenie „zawiesza Mindstab" pojawia się w fazie GŁÓWNEJ, nie w Podtrzymaniu', () => {
  const sess = makeSession();
  const blocks = playCollectingPauseBlocks(sess);
  const withSuspend = blocks.filter((b) => b.texts.some((t) => /zawiesza Mindstab/.test(t)));
  assert.ok(withSuspend.length > 0, 'bot w tej partii zawiesza Mindstaba (scena: 1 bagno, rzut nieosiągalny)');
  // Każdy blok z ogłoszeniem zawieszenia musi być pokazany, gdy gra jest
  // NADAL w fazie głównej bota — PRZED fixem ogłoszenie czekało w buforze
  // do granicy tury i wjeżdżało w Podtrzymanie/odkręcenie następnej tury.
  for (const block of withSuspend) {
    assert.ok(['precombat_main', 'postcombat_main'].includes(block.faza),
      `modal z „zawiesza Mindstab" pokazany w fazie ${block.faza}/${block.step} — `
      + 'ma pauzować przy SAMYM akcie, we właściwej fazie (zgłoszenie H 2026-11-07)');
  }
});

test('H-ogł/2: ogłoszenie zawieszenia niesie kontekst „Faza: Główna …" tuż nad sobą', () => {
  const sess = makeSession();
  const blocks = playCollectingPauseBlocks(sess);
  const block = blocks.find((b) => b.texts.some((t) => /zawiesza Mindstab/.test(t)));
  assert.ok(block, 'scena dochodzi do zawieszenia');
  const idx = block.texts.findIndex((t) => /zawiesza Mindstab/.test(t));
  let faza = null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (/^Faza: /.test(block.texts[i])) { faza = block.texts[i]; break; }
  }
  // H2 domyka obraz: dodatni scoring suspend istnieje wyłącznie w Głównej 2,
  // więc akt (i jego nagłówek) wypada właśnie tam — tego samego gracza, który
  // czyta modal, nie trzeba już prowadzić po logu.
  assert.equal(faza, 'Faza: Główna 2',
    `nagłówek fazy nad ogłoszeniem: ${JSON.stringify(faza)}; blok: ${JSON.stringify(block.texts)}`);
});
