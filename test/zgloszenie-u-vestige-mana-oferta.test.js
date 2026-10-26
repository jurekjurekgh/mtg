// =============================================================================
// Zgłoszenie U (2026-10-26, właściciel) — Crumbling Vestige a oferta Xu-Ifita:
//   „Mam na stole 8 lądów, w tym tylko 1 swamp. Mam w ręku Xu-Ifit
//   ({1}{B}{B}). Po wystawieniu Crumbling Vestige w Głównej 1 powinienem
//   dostać ofertę wystawienia Xu-Ifit (1 mana z ETB, swamp i dowolny ląd).
//   Nie dostałem, automat przeszedł od razu do fazy walki."
//
// Rozpoznanie (sondy `.arena/probe-u*.mjs`): dokładna scena silnikowa
// (obiekty z `createCardDeck`) i ta sama przez prawdziwą sesję stołu
// DZIAŁAJĄ — ETB *Crumbling Vestige* to zdolność wyzwalana, nie many
// (CR 605.1b), po rozstrzygnięciu pula = {WUBRG:1} (CR 106.4), aktywny
// gracz odzyskuje priorytet (CR 117.3b) i oferta `cast_permanent` jest.
// Jedyna droga, którą legalna oferta może „zniknąć" auto-passowi, to
// wyciszenie (`commandOptionKey` w `ignoredOptionKeys`) — a klucze
// osadzają `objectId`, które rodzi się od nowa co partię (`hand-N`,
// `p1-opening-K`), podczas gdy zbiór żył w pamięci strony i przechodził
// między partiami: wyciszenie z poprzedniej gry potrafiło po cichu
// wyciszyć inną kartę o tym samym identyfikatorze (gracz w tej partii
// niczego nie wyciszał — por. lekcja ze zgłoszenia M).
//
// Fix: wyciszenia są decyzją na partię — `createSession` i podmiana
// stanu w `resumeReplayText` czyszczą zbiór; UI nadal mutuje ten sam
// zbiór w trakcie gry (świadome wyciszenie działa jak dotąd).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, commandOptionKey, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(s, id, cardId, zone = 'battlefield', pid = HUMAN_ID) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: pid, registry: REGISTRY });
  const { objectId, ...data } = entry;
  s.objects.set(id, Object.freeze({
    ...data, id, instanceId: `i-${id}`, controllerId: pid, ownerId: pid, zone,
  }));
  s.zones[zone].push(id);
}

/** Prawdziwa sesja stołu ustawiona w scenę właściciela (Główna 1 człowieka). */
function sesjaZeSceną(ignoredOptionKeys) {
  const decks = new Map([
    [HUMAN_ID, Array.from({ length: 12 }, () => 'basic-mountain')],
    [BOT_ID, Array.from({ length: 12 }, () => 'basic-mountain')],
  ]);
  const session = createSession({
    seed: 7, registry: REGISTRY, decks, ignoredOptionKeys, pauseOnBotMoves: false,
  });
  const s = session.state;
  for (let i = 0; i < 10; i += 1) {
    const m = playerView(s, s.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'resolve_mulligan_choice');
    if (!m) break;
    execute(s, { ...m, keep: true });
  }
  s.turn = jumpToStep(s.turn, 'main', HUMAN_ID);
  s.turn.activePlayerId = HUMAN_ID;
  s.turn.priorityPlayerId = HUMAN_ID;
  // Wyczyść rękę człowieka (scena budowana ręcznie, jak `b10Session`).
  for (const id of [...s.zones.hand]) {
    const o = s.objects.get(id);
    if (o?.controllerId !== HUMAN_ID) continue;
    s.zones.hand = s.zones.hand.filter((x) => x !== id);
    const gid = `g-${s.objectSequence++}`;
    s.zones.graveyard.push(gid);
    s.objects.delete(id);
    s.objects.set(gid, Object.freeze({ ...o, id: gid, zone: 'graveyard' }));
  }
  put(s, 'swamp', 'basic-swamp');
  for (let i = 0; i < 6; i += 1) put(s, `mtn${i}`, 'basic-mountain');
  put(s, 'vest', 'crumbling-vestige', 'hand');
  put(s, 'xu', 'xu-ifit-osteoharmonist', 'hand');
  return session;
}

/** Zagraj Vestige przez `session.apply` i oddaj widok po rozstrzygnięciu triggera. */
function zagrajVestige(session) {
  const play = session.view().legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'vest');
  assert.ok(play, 'oferta zagrania Crumbling Vestige');
  assert.equal(session.apply(play).ok, true);
  return session.view();
}

function assertOfertaXu(session, view) {
  const s = session.state;
  assert.equal(s.turn.step, 'main1', 'auto-pass stoi w Głównej 1 (nie przeszedł do walki)');
  assert.equal(s.turn.priorityPlayerId, HUMAN_ID, 'priorytet wrócił do aktywnego gracza (CR 117.3b)');
  const gracz = s.players.find((p) => p.id === HUMAN_ID);
  assert.deepEqual(gracz.manaPool, { WUBRG: 1 }, 'mana z triggera ETB czeka w puli (CR 106.4)');
  assert.ok(
    view.legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'xu'),
    'oferta rzutu Xu-Ifita za manę z ETB + Swamp + dowolny ląd',
  );
}

test('U/1: po triggerze Vestige auto-pass staje na ofercie Xu-Ifita (scena właściciela, prawdziwa sesja)', () => {
  const session = sesjaZeSceną(new Set());
  assertOfertaXu(session, zagrajVestige(session));
});

test('U/2: wyciszenie z POPRZEDNIEJ partii (ten sam objectId) nie wycieka do nowej sesji', () => {
  // Klucz, który w poprzedniej partii (ta sama strona) wyciszył rzut karty
  // o identyfikatorze `xu`; w nowej partii ten identyfikator dostaje Xu-Ifit.
  const ignored = new Set([commandOptionKey({ type: 'cast_permanent', objectId: 'xu' })]);
  const session = sesjaZeSceną(ignored);
  assert.equal(ignored.size, 0, 'createSession czyści obce klucze wyciszeń na starcie partii');
  assertOfertaXu(session, zagrajVestige(session));
});

test('U/3: anty-overfix — świadome wyciszenie W TRAKCIE partii nadal działa', () => {
  const ignored = new Set();
  const session = sesjaZeSceną(ignored);
  assertOfertaXu(session, zagrajVestige(session));
  const turnBefore = session.state.turn.number;
  ignored.add(commandOptionKey({ type: 'cast_permanent', objectId: 'xu' }));
  session.recheckAutoPass();
  // Bot ma same góry, więc przewinięta partia ląduje aż w następnej turze
  // człowieka — sygnaturą przewinięcia jest numer tury, nie sam krok.
  assert.ok(session.state.turn.number > turnBefore,
    'po świadomym wyciszeniu auto-pass przewija dalej (decyzja gracza, nie wyciek)');
});
