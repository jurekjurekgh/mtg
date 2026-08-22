// M101/D — zgłoszenie właściciela (2026-08-15, „poważny błąd"):
// panel „Rozgrywka" GUBI kluczowe zdarzenia tury przeciwnika.
//
// Obserwacja z partii (talia azoriusowa gracza vs talia z Puppeteer Clique):
// panel pokazał tylko „Puppeteer Clique — cel: Furious Forebear" + „Rozumiem",
// po czym od razu zaczęła się własna tura. Log tej samej tury zawierał
// natomiast: przejęcie kontroli nad Furious Forebear, atak przejętym stworem,
// obrażenia i opóźniony trigger wygnania w kroku końcowym. Gracz, który gra
// wyłącznie przez modale, nie dowiaduje się, że stracił kontrolę nad własnym
// stworem ani że oberwał nim po twarzy.
//
// Root cause (dwie współpracujące bramki w src/table/session.js):
//
//  1. `BOT_RESOLUTION_EVENTS` — zbiór typów wpuszczanych do panelu, gdy stos
//     rozstrzyga się PO komendzie człowieka (`botActing === false`) — nie
//     zawierał ani `control_changed`, ani zdarzeń triggerów
//     (`ability_triggered`, `trigger_resolved`, `delayed_trigger_armed`).
//     Skutek rozstrzygnięcia triggera Puppeteer Clique wypadał więc z panelu,
//     mimo że jego rzucenie i wybór celu już tam były.
//
//  2. `trackStack` wymagało kontrolera z pola zdarzenia
//     (`controllerId ?? playerId`), a zdarzenia triggerów go NIE niosą
//     (`{ type: 'ability_triggered', objectId, cardId, trigger }`). Trigger na
//     stosie nie otwierał więc okna rozstrzygnięcia: gdy trigger był jedynym
//     obiektem na stosie (opóźniony trigger w upkeep/cleanup, trigger śmierci),
//     `stackObjects` było puste i CAŁY jego skutek przepadał.
//
// Test jest odporny na zmiany silnika: nie sprawdza konkretnych kart ani
// seedów, tylko własność „żadna linia z klasy zdarzeń krytycznych dla gracza
// nie może istnieć w logu, nie istniejąc w panelu" na zestawie seedów.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function makeSession(seed, botDeck = 'dominaria.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/innistrad.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botDeck}`, 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

/**
 * Wierna symulacja pętli UI ze stołu (src/table/main.js): `playDirect` woła
 * `apply` i zaraz `showBotMoves`, a klik „Rozumiem" woła `continueBotPlay`
 * i znowu `showBotMoves`. Zbiera WSZYSTKO, co gracz zobaczyłby w modalach.
 */
function playCollectingPanel(session, { maxMoves = 600 } = {}) {
  const shown = [];
  const showBotMoves = () => {
    for (let guard = 0; guard < 500; guard += 1) {
      const moves = session.botMoves ?? [];
      const meaningful = moves.filter((m) => !/^Faza:/.test(m.text ?? ''));
      if (meaningful.length === 0 && moves.length > 0) {
        session.clearBotMoves();
        if (session.botPausePending) { session.continueBotPlay(); continue; }
        return;
      }
      if (moves.length > 0) {
        for (const m of moves) shown.push(m.text);
        session.clearBotMoves();
        return; // modal otwarty — czeka na klik gracza
      }
      if (session.botPausePending) { session.continueBotPlay(); continue; }
      return;
    }
  };
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) { // klik „Rozumiem"
      session.continueBotPlay();
      showBotMoves();
      continue;
    }
    const view = session.view();
    const meaningful = view.legalCommands.filter(
      (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
    showBotMoves();
  }
  return { shown, log: session.log.map((e) => e.text ?? String(e)) };
}

/**
 * Klasy zdarzeń, o które upomniał się właściciel. To nie jest „ładny opis" —
 * to informacje zmieniające ocenę pozycji: kto kontroluje moje stwory, czym
 * zostałem zaatakowany, ile straciłem życia i co zniknęło z pola bitwy.
 */
const KRYTYCZNE = [
  [/przechodzi pod kontrolę/, 'przejęcie kontroli nad permanentem'],
  [/zostaje wygnany/, 'wygnanie permanentu'],
  [/trigger się rozstrzyga \(opóźniony\)/, 'rozstrzygnięcie opóźnionego triggera'],
];

/**
 * Zakres zgłoszenia D to TURA PRZECIWNIKA — tam gracz nie ma żadnego innego
 * źródła wiedzy niż panel. We własnej turze każde wygnanie, jakie widzieliśmy
 * w logu, jest kosztem zdolności, którą gracz właśnie kliknął (panel pokazuje
 * ją linijkę niżej: „Ty aktywuje zdolność: … "), więc nie jest luką.
 * Log dzielimy na tury po znaczniku „Tura gracza <kto>".
 */
function liniiTuryPrzeciwnika(log) {
  const linie = [];
  let aktywnyToPrzeciwnik = false;
  for (const line of log) {
    const m = /^Tura gracza (.+)$/.exec(line);
    if (m) { aktywnyToPrzeciwnik = m[1] !== 'Ty'; continue; }
    if (aktywnyToPrzeciwnik) linie.push(line);
  }
  return linie;
}

function brakiWPanelu(seed) {
  const { shown, log } = playCollectingPanel(makeSession(seed));
  const panel = new Set(shown);
  const braki = [];
  for (const line of liniiTuryPrzeciwnika(log)) {
    for (const [re, label] of KRYTYCZNE) {
      if (re.test(line) && !panel.has(line)) braki.push(`${label} — „${line}"`);
    }
  }
  return braki;
}

test('M101/D: panel „Rozgrywka" nie gubi przejęcia kontroli ani opóźnionych triggerów z tury przeciwnika', () => {
  const seedy = [5, 7, 8, 9, 11, 12, 13, 20, 24, 29, 32, 34, 37, 39, 40];
  const raport = new Map();
  for (const seed of seedy) {
    const braki = brakiWPanelu(seed);
    if (braki.length > 0) raport.set(seed, braki);
  }
  assert.equal(
    raport.size,
    0,
    `Panel „Rozgrywka" zgubił zdarzenia widoczne w logu:\n${[...raport]
      .map(([seed, braki]) => `  seed ${seed}:\n${braki.map((b) => `    - ${b}`).join('\n')}`)
      .join('\n')}`,
  );
});

test('M101/D: trigger jako JEDYNY obiekt na stosie też raportuje swój skutek', () => {
  // Regresja root cause nr 2: `trackStack` ignorowało zdarzenia bez pola
  // kontrolera, a zdarzenia triggerów go nie niosą. Gdy trigger odpalał się
  // bez żadnego czaru na stosie (opóźniony trigger w upkeep, trigger śmierci
  // po walce), `stackObjects` zostawało puste i skutek nie miał jak wejść.
  // Sprawdzamy, że w partii z takimi triggerami panel widzi ich rozstrzygnięcia.
  // Seed 1 po Batchu 36 (azorius +Survivor of Korlis) — przelosowane hunterem.
  // Seed 3 po Batchu 37 (azorius +Ojutai's Breath +Static Net, graveyard +Emerald Oryx) — przelosowane hunterem.
  // Seed 60 po Batchu 41 KOMPLET (graveyard +8 kart +Skullcairn +2 Islands +Forager) — hunter (2 opóźnione).
  // Seed 38 po Batchu 42 transze A–C (graveyard +Mauler/Vizier/Final Parting +1 Island) — hunter (2 opóźnione).
  // M178 (talie per plan): opóźnione triggery daje para innistrad vs alara
  // (Plague Reaver) — hunter 1..60, seed 7 (5 opóźnionych).
  // Seed 2 po Batchu 44 A (innistrad +Farbog Explorer +1 land) — hunter
  // (5 opóźnionych; kolejne trafienia: 3, 4, 9, 10, 12).
  const { shown, log } = playCollectingPanel(makeSession(2, 'alara.txt'));
  const panel = shown.join('\n');
  const opoznione = log.filter((l) => /trigger się rozstrzyga \(opóźniony\)/.test(l));
  assert.ok(opoznione.length > 0, 'seed 2 miał zawierać opóźnione triggery — zmienił się przebieg partii');
  for (const line of opoznione) {
    assert.ok(panel.includes(line), `opóźniony trigger poza panelem: „${line}"`);
  }
});
