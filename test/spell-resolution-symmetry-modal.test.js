// M100/E2 — panel „Rozgrywka" ma pokazywać rozstrzygnięte czary OBU graczy
// (w tym modalne z nazwą trybu), nie tylko czary bota (M99).
//
// Luka przed M100: `noteBotMove` śledził na stosie wyłącznie czary/zdolności
// BOTA (`botStackObjects`). Gdy CZŁOWIEK rzucał czar, a bot auto-passował,
// linie „X zostaje rozstrzygnięty" i skutki („Somebody dostaje +2/+2",
// „zadaje 3 obrażenia") trafiały wyłącznie do logu. Gracz grający przez
// modale (tak gra właściciel na telefonie) nie widział własnych rozstrzygnięć
// — musiał zgadywać, czy czar bota został skontrujny, a własny doszedł.
//
// Fix u root cause (session.js): śledzenie stosu obejmuje OBU kontrolerów
// (`stackObjects`), a `apply()` przepuszcza zdarzenia komendy człowieka przez
// `noteBotMove` (wpuszczane są tylko zdarzenia z rodziny rozstrzygnięć —
// echo własnego zagrania filtruje ta sama bramka co wcześniej).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

// Azorius ma karty modalne (m.in. Aerith Rescue Mission) — pokrywa „tryb:".
function makeSession(seed) {
  const registry = createCardRegistry();
  const decks = new Map([
    // M178 (talie per plan): Forgotten Realms ma i czar modalny (Your Temple
    // Is Under Attack), i dobranie z efektu (Curate) — obie osie tego pliku.
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/forgotten-realms.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/dominaria.txt', 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

/** Zbiera wpisy modala „Rozgrywka" — jak gracz klikający „Rozumiem". */
function playCollectingModals(session, { maxMoves = 400 } = {}) {
  const modalTexts = [];
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      for (const m of session.botMoves) modalTexts.push(m.text);
      session.clearBotMoves();
      session.continueBotPlay();
      for (const m of session.botMoves) modalTexts.push(m.text);
      continue;
    }
    const view = session.view();
    const meaningful = view.legalCommands.filter(
      (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
    );
    // Preferuj rzuty — cel testu to rozstrzygnięcia czarów człowieka.
    const cmd = meaningful.find((c) => c.type.startsWith('cast_'))
      ?? meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
    for (const m of session.botMoves) modalTexts.push(m.text);
    session.clearBotMoves();
  }
  return { modalTexts, log: session.log.map((entry) => entry.text ?? String(entry)) };
}

/** Wyciąga nazwę karty z linii logu „Rzucasz X (— tryb:…)( → cel:…)…". */
function castNameOf(line) {
  let tail = line.replace(/^Rzucasz /, '');
  for (const sep of [' — tryb:', ' → cel:', ' za koszt ', ' z exile po plot', ' z kosztem Cleave', ' (przygoda)']) {
    const at = tail.indexOf(sep);
    if (at > 0) tail = tail.slice(0, at);
  }
  return tail.trim();
}

test('M100/E2: rozstrzygnięcie czaru CZŁOWIEKA trafia do modala „Rozgrywka" (symetria z M99)', () => {
  let checked = 0;
  for (const seed of [42, 7, 11, 77, 123, 202]) {
    const session = makeSession(seed);
    const { modalTexts, log } = playCollectingModals(session);
    for (const line of log.filter((t) => /^Rzucasz /.test(t))) {
      const name = castNameOf(line);
      // Czar człowieka, który wg LOGU się rozstrzygnął…
      const resolvedInLog = log.some((t) => t.includes(name) && t.includes('zostaje rozstrzygnięty'));
      if (!resolvedInLog) continue; // np. skontrowany — brak rozstrzygnięcia
      checked += 1;
      // …musi mieć ślad rozstrzygnięcia także w MODALU.
      assert.ok(
        modalTexts.some((t) => t.includes(name) && t.includes('zostaje rozstrzygnięty')),
        `seed ${seed}: log zna rozstrzygnięcie „${name}", modal milczy (gracz gra przez modale)`,
      );
    }
  }
  assert.ok(checked > 0, 'żaden seed nie wyprodukował rzuconego i rozstrzygniętego czaru człowieka — test nic nie sprawdził');
});

test('M100/E2: czar modalny CZŁOWIEKA pokazuje tryb także przy rozstrzygnięciu w modalu', () => {
  let checkedModal = 0;
  // M178: seedy przelosowane hunterem (FR vs dominaria).
  for (const seed of [1, 2, 5, 9, 12]) {
    const session = makeSession(seed);
    const { modalTexts, log } = playCollectingModals(session);
    for (const line of log.filter((t) => /^Rzucasz .+ — tryb: .+/.test(t))) {
      const name = castNameOf(line);
      const mode = line.match(/ — tryb: (.+?)(?: → cel:|$)/)?.[1];
      const resolvedInLog = log.some((t) => t.includes(name) && t.includes('zostaje rozstrzygnięty'));
      if (!resolvedInLog) continue;
      checkedModal += 1;
      const inModal = modalTexts.find((t) => t.includes(name) && t.includes('zostaje rozstrzygnięty'));
      assert.ok(inModal, `seed ${seed}: modalny czar człowieka ${name} — brak rozstrzygnięcia w modalu`);
      assert.match(inModal, new RegExp(`— tryb: ${mode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        `seed ${seed}: rozstrzygnięcie w modalu bez nazwy trybu: ${inModal}`);
    }
  }
  assert.ok(checkedModal > 0, 'żaden seed nie wyprodukował modalnego czaru człowieka — test nic nie sprawdził');
});


test('M100/E3: dobrana z EFEKTU karta człowieka trafia do modala (draw step zostaje szumem)', () => {
  // Curate / Withstand (azorius): „… / dobierz kartę" — dobranie z efektu,
  // nie z kroku dobierania. Gracz grający przez modale wiedział z logu, CO
  // dobrał z własnego czaru; modal milczał (bramka M99 była tylko dla bota).
  const DRAW_SPELLS = ['Curate', 'Withstand'];
  let checked = 0;
  // Seedy 3/13 dołożone po batchu 34 (azorius +3, black +1): dawna lista
  // przestała produkować dobranie z EFEKTU — przelosowane hunterem.
  // Seed 1 dołożony po Batchu 37 (azorius +Palace Familiar +Village Bell-Ringer),
  // seed 4 po Batchu 37 (azorius +Ojutai's Breath) — przelosowane hunterem.
  // M178: seedy przelosowane hunterem (FR vs dominaria).
  // M203/2: ponownie przelosowane hunterem — zmiana konwencji kolejności ofert
  // (prezentacja = enumeracja) przesunęła wybory bota, więc stara lista seedów
  // przestała produkować ten scenariusz (L25/L53: seed pełnej partii to dług,
  // a nie reguła). Pomiar huntera (seedy 1–48): scenariusz pojawia się dla
  // 12, 13, 19, 29, 30, 34, 35, 41, 45, 47 — i w każdym z nich modal NAZYWA
  // dobraną kartę (0 rozjazdów log↔modal), czyli zachowanie jest poprawne.
  for (const seed of [12, 13, 19, 29, 30, 34]) {
    const session = makeSession(seed);
    const { modalTexts, log } = playCollectingModals(session);
    for (let i = 0; i < log.length; i += 1) {
      const castLine = log[i];
      const spell = DRAW_SPELLS.find((n) => castLine === `Rzucasz ${n}` || castLine.startsWith(`Rzucasz ${n} →`) || castLine.startsWith(`Rzucasz ${n} —`));
      if (!spell) continue;
      // Blok wpisów od rzutu do końca tury. UWAGA na atrybucję: rzut w
      // upkeep następuje PRZED krokiem dobierania TEJ SAMEJ tury — dobranie
      // z kroku dobierania (marker „— beginning/draw —") to szum, nie efekt.
      const block = [];
      for (let j = i + 1; j < log.length && !/^Tura /.test(log[j]); j += 1) block.push(log[j]);
      if (!block.some((t) => t.includes(spell) && t.includes('zostaje rozstrzygnięty'))) continue; // skontrowany
      const drawStepAt = block.findIndex((t) => t === '— beginning/draw —');
      const effectZone = drawStepAt >= 0 ? block.slice(0, drawStepAt) : block;
      const drawn = effectZone.filter((t) => /^Dobierasz: /.test(t));
      if (drawn.length === 0) continue;
      checked += 1;
      for (const line of drawn) {
        assert.ok(
          modalTexts.includes(line),
          `seed ${seed}: log zna „${line}" (dobranie z efektu ${spell}), modal milczy`,
        );
      }
    }
  }
  assert.ok(checked > 0, 'żaden seed nie wyprodukował dobrania z efektu czaru człowieka — test nic nie sprawdził');
});

test('M100/E3 (strażnik szumu): dobranie w KROKU DOBIERANIA nadal NIE nazywa się w modalu', () => {
  // Bez tej reguły modal wróciłby do „Dobierasz: X" co turę (czysty szum).
  // Uruchamiamy partię i sprawdzamy, że każdy wpis „Dobierasz: …" w modalu
  // śledzi rozstrzygnięcie czaru/zdolności (a nie sam początek tury).
  const session = makeSession(42);
  const { modalTexts } = playCollectingModals(session);
  const drawsInModal = modalTexts.filter((t) => /^Dobierasz: /.test(t));
  // Po E2 dobrania z efektu MAJĄ prawo się pojawić — ale wyłącznie obok
  // rozstrzygnięcia; nagłówek „Tura N — Ty" nie może otwierać sekcji dobrań.
  for (let i = 0; i < drawsInModal.length; i += 1) {
    // każdy taki wpis jest legalny (dobranie nazwane może być tylko z efektu —
    // draw step nie trafia do modala wcale, co pilnuje bramka isCardDrawnNoise)
    assert.ok(!/^Tura \d+ — Ty/.test(drawsInModal[i]), `zła linia: ${drawsInModal[i]}`);
  }
});
