// =============================================================================
// Zgłoszenie J (właściciel, 2026-11-07): „Początek tury bota NIE ZROBIŁ PAUZY
// w Rozgrywce (nie czekał na moje Rozumiem), tylko od razu doszedł do Main1
// i tam zatrzymał się na rzuceniu sorcery przez bota (ekran wysokograficzny).
// Klikam w Rozumiem — jedno kliknięcie, mysz. Zazwyczaj działa, czasem nie."
//
// MECHANIZM (znaleziony po wykluczeniu sesji i pojedynczych klików UI):
// `beginTurnStart` emituje zdarzenia DAY/NIGHT (transformacje DFC!) PRZED
// `turn_started`. Gdy transformacja wypada w strumieniu granicy tury:
//
//   1. `emitTransformEvent` uzbraja `awaitingArtAck` (warstwa grafik) JESZCZE
//      PRZED nagłówkiem nowej tury;
//   2. `turn_started` uzbraja obowiązkową pauzę M261 (`awaitingBotAck`);
//   3. UI tłumi modal pauzy (bramka `artPause` w playDirect) — gracz widzi
//      TYLKO warstwę ilustracji;
//   4. gracz zamyka warstwę → `continueArtPlay` → `advance()`, który KASUJE
//      `awaitingBotAck` NA WEJŚCIU — pauza granicy tury ginie bez pokazania;
//   5. gra przetacza się przez granicę (ogon untap/upkeep/draw) prosto do
//      Main1 bota i zatrzymuje się dopiero na jego zagrywce (rzut = znów
//      warstwa grafik) — dokładnie doświadczenie właściciela.
//
// „Czasem" = tylko gdy transformacja (albo inny obserwator artów) wypadnie
// w strumieniu granicy tury — talie z DFC (wilkołaki) albo rzut z ogona
// (suspend). Pozostałe granice pauzują poprawnie (fuzz: 181 par talii,
// ~1500 tur bota — zero zgłoszeń poza tym mechanizmem).
//
// Pin: sesja z pauseOnBotMoves i obserwatorem onTransform jak żywy stół
// (tryb wysoko-graficzny). Wilkołak bota na polu, dzień → noc na starcie
// jego tury. Pass człowieka kończy jego turę — pauza granicy MUSI być
// uzbrojona razem z warstwą (krok A). Zamknięcie warstwy (jedno kliknięcie)
// NIE MOŻE zjeść pauzy granicy: gra ma STÁĆ na granicy, z nagłówkiem
// „Tura N — Nieprzyaciel" w buforze, i czekać na „Rozumiem" (krok B).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function addObjectTo(state, id, cardId, controllerId, def) {
  state.objects.set(id, Object.freeze({
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  }));
  state.zones.battlefield.push(id);
}

/**
 * Sesja jak żywy stół: pauza po istotnym zagraniu (M261) + obserwator
 * transformacji jak tryb wysoko-graficzny UI (`onTransformShowcase` zwraca
 * `true` = warstwa się pokazała, prośba o pauzę prezentacyjną).
 */
function makeSession() {
  const sess = createSession({
    seed: 77, registry: REGISTRY, pauseOnBotMoves: true,
    onTransform: () => true,
    decks: new Map([
      [HUMAN_ID, Array(20).fill('basic-plains')],
      [BOT_ID, Array(20).fill('basic-plains')],
    ]),
  });
  const s = sess.state;
  s.pendingMulligans = [];
  // Wilkołak bota (Bird Admirer, daybound) na polu bitwy — z deskryptorem
  // tylnej strony (Wing Shredder), jak go składa createCardDeck (engine
  // obraca kartę po deskryptorze, bez registry — ADR 0002).
  const front = REGISTRY.get('bird-admirer');
  const back = REGISTRY.get('wing-shredder');
  addObjectTo(s, 'bot-dfc', 'bird-admirer', BOT_ID, front);
  s.objects.set('bot-dfc', Object.freeze({
    ...s.objects.get('bot-dfc'),
    transformTo: {
      cardId: back.id, kind: 'creature', power: back.power, toughness: back.toughness,
      abilities: back.abilities ?? [], keywords: back.keywords ?? [],
      subtypes: back.subtypes ?? [], types: back.types ?? [],
      manaCost: front.manaCost ?? 0, cardName: back.name,
    },
  }));
  // Jest dzień; tura człowieka bez czarów → na starcie tury BOTA zrobi się
  // noc (CR 708.9) — transformacja poleci w strumieniu granicy tury,
  // PRZED zdarzeniem turn_started (beginTurnStart: day/night najpierw).
  s.dayNight = 'day';
  s.spellsCastThisTurnByPlayer = { [HUMAN_ID]: 0, [BOT_ID]: 0 };
  // Cleanup tury człowieka, priorytet ma człowiek — jego pass zamyka turę.
  s.turn = jumpToStep(s.turn, 'cleanup', HUMAN_ID);
  s.turn.activePlayerId = HUMAN_ID;
  s.turn.priorityPlayerId = HUMAN_ID;
  return sess;
}

test('J/1: granica tury z transformacją uzbraja pauzę M261 i warstwę grafik jednocześnie', () => {
  const sess = makeSession();
  const result = sess.apply({ type: 'pass_priority', playerId: HUMAN_ID });
  // Pass zamknął turę człowieka: strumień niósł day/night (transformacja!)
  // i turn_started tury bota.
  assert.equal(result.ok, true, JSON.stringify(result));
  // Pauza granicy tury obowiązkowa (M261)…
  assert.equal(result.botPause, true, 'pauza granicy tury nie została uzbrojona');
  // …a warstwa grafik otworzyła się na transformacji PRZED nagłówkiem.
  assert.equal(result.artPause, true, 'warstwa grafik nie uzbrojona (transformacja przed nagłówkiem)');
  assert.ok(sess.botPauseAtTurnBoundary, 'pauza nie jest klasyfikowana jako granica tury');
  assert.ok(
    (sess.botMoves ?? []).some((m) => (m.text ?? '').startsWith('Tura 2 — Nieprzyjaciel')),
    'nagłówek „Tura 2 — Nieprzyaciel” nie wszedł do bufora modala',
  );
});

test('J/2: zamknięcie warstwy grafik NIE zjada pauzy granicy tury (jedno kliknięcie „Rozumiem” przedtem)', () => {
  const sess = makeSession();
  const result = sess.apply({ type: 'pass_priority', playerId: HUMAN_ID });
  assert.equal(result.botPause, true);
  assert.equal(result.artPause, true);

  // Gracz zamyka warstwę ilustracji (jedno kliknięcie) — kontynuacja gry
  // ma odbyć się DOPIERO przez potwierdzenie pauzy granicy w modalu.
  const after = sess.continueArtPlay();

  // Gra nadal stoi na pauzie granicy tury…
  assert.equal(after.botPause, true, 'zamknięcie warstwy zjadło pauzę granicy tury');
  assert.equal(after.artPause, false);
  // …nowa tura bota się zaczęła (nagłówek w buforze), ale ogon (untap/
  // upkeep/draw) i Main1 bota CZEKAJĄ na „Rozumiem” — bot nic nie zagrał.
  assert.equal(sess.state.turn.activePlayerId, BOT_ID);
  assert.ok(
    (sess.botMoves ?? []).some((m) => (m.text ?? '').startsWith('Tura 2 — Nieprzyjaciel')),
    'nagłówek „Tura 2 — Nieprzyaciel” zniknął z bufora po zamknięciu warstwy',
  );
  const botActed = (sess.botMoves ?? []).some((m) => /zagrywa |rzuca |Aktywuje /.test(m.text ?? ''));
  assert.equal(botActed, false, 'bot zdążył zagrać w Main1 — pauza granicy została połknięta');
  // Dopiero „Rozumiem” przewija ogon granicy (pauza była pokazana).
  const ack = sess.continueBotPlay();
  assert.equal(ack.ok, true);
});
