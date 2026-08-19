// M99 — znalezisko Żywego Testera (oś 2: braki informacji w modalu „Ruch
// przeciwnika"), partia `black vs green --profile random --policy-seed 9 --seed 42`.
//
// W transkrypcie modal pokazał:
//
//   • Nieprzyjaciel rzuca Awaken the Bear → cel: Servant of the Scale
//   • (koniec bloku — następny modal to już „Nieprzyjaciel zagrywa Forest")
//
// a LOG partii w tym samym momencie miał:
//
//   Awaken the Bear zostaje rozstrzygnięty
//   Servant of the Scale zyskuje: zadeptywanie
//   Servant of the Scale dostaje +3/+3
//
// Gracz, który gra WYŁĄCZNIE przez modale (tak gra właściciel na telefonie),
// widzi, że przeciwnik coś rzucił, ale nigdy się nie dowiaduje, że jego stwór
// urósł o +3/+3 i dostał zadeptywanie — czyli dlaczego zaraz potem przegrywa
// walkę. To dokładnie oś 2 audytu: „wyniki działania czarów i zdolności
// wszystko poza szumem powinno tam być".
//
// Root cause: `noteBotMove` zapisuje zdarzenia tylko gdy `botActing` (gałąź
// bota w `advance()`), a czar bota rozstrzyga się DOPIERO gdy obaj gracze
// spasują — czyli po komendzie CZŁOWIEKA (`session.apply(pass_priority)`),
// gdzie `botActing` jest już false. Zdarzenia `spell_resolved` i skutki czaru
// bota wpadały wtedy tylko do logu.
//
// Fix u root cause: rozstrzygnięcia czarów/zdolności BOTA (rozpoznane po
// kontrolerze, nie po nazwie karty) trafiają do modala także wtedy, gdy
// wywołała je komenda człowieka.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function makeSession(seed) {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/black.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

/**
 * Rozgrywa partię i zbiera wpisy modala per „blok" — dokładnie to, co gracz
 * przeczytałby, klikając „Rozumiem". Zwraca też log partii do porównania.
 */
function playCollectingModals(session, { maxMoves = 400 } = {}) {
  const modalTexts = [];
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      for (const m of session.botMoves) modalTexts.push(m.text);
      session.clearBotMoves();
      session.continueBotPlay();
      // Wznowienie samo produkuje kolejne wpisy — zbierz je zanim `apply`
      // wyczyści bufor („modal pokazuje odpowiedź na TEN ruch gracza").
      for (const m of session.botMoves) modalTexts.push(m.text);
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
    // Pauza mogła powstać dopiero po komendzie człowieka — zbierz i te wpisy.
    for (const m of session.botMoves) modalTexts.push(m.text);
    session.clearBotMoves();
  }
  return { modalTexts, log: session.log.map((entry) => entry.text ?? String(entry)) };
}

test('M99: rozstrzygnięcie czaru bota trafia do modala „Rozgrywka", nie tylko do logu', () => {
  // Skanujemy kilka seedów: szukamy partii, w której bot RZUCIŁ czar
  // (inaczej test niczego nie sprawdza i cicho przechodzi).
  let checked = 0;
  for (const seed of [42, 7, 11, 77, 123, 202]) {
    const session = makeSession(seed);
    const { modalTexts, log } = playCollectingModals(session);
    const castInModal = modalTexts.filter((t) => /^Nieprzyjaciel rzuca /.test(t));
    for (const cast of castInModal) {
      const name = cast.replace(/^Nieprzyjaciel rzuca /, '').split(' → ')[0].split(' za koszt ')[0].trim();
      // Czar bota, który rozstrzygnął się wg LOGU...
      const resolvedInLog = log.some((t) => t.includes(`${name} zostaje rozstrzygnięty`));
      if (!resolvedInLog) continue;
      checked += 1;
      // ...musi mieć ślad rozstrzygnięcia także w MODALU.
      const resolvedInModal = modalTexts.some((t) => t.includes(`${name} zostaje rozstrzygnięty`));
      assert.ok(
        resolvedInModal,
        `seed ${seed}: modal pokazał „${cast}", ale nigdy nie powiedział, że czar się rozstrzygnął`,
      );
    }
  }
  assert.ok(checked > 0, 'żaden seed nie wyprodukował rzuconego i rozstrzygniętego czaru bota — test nic nie sprawdził');
});

test('M99: skutek czaru bota (+X/+X) też trafia do modala, nie tylko do logu', () => {
  // Awaken the Bear (KTK): „Target creature gets +3/+3 and gains trample".
  // Modal pokazywał „zyskuje: zadeptywanie", ale nie „+3/+3" — `stats_modified`
  // jest globalnie wyciszone jako szum (ciągłe przeliczenia P/T co zdarzenie).
  // Szumem jest jednak przeliczenie, a nie SKUTEK rozstrzygającego się czaru
  // przeciwnika: to informacja, przez którą gracz przegrywa walkę.
  // Seed 42 → 3 po batchu 34 (black +1, green +1) — przelosowane hunterem.
  // Seed 1 po Batchu 36 (green +Feral Invocation +Grizzled Leotau +1 Forest) —
  // przelosowane hunterem.
  const session = makeSession(1);
  const { modalTexts, log } = playCollectingModals(session);
  const pumpInLog = log.filter((t) => /dostaje \+\d+\/\+\d+/.test(t));
  assert.ok(pumpInLog.length > 0, 'seed 3 miał produkować pump w logu');
  const pumpInModal = modalTexts.filter((t) => /dostaje \+\d+\/\+\d+/.test(t));
  assert.ok(
    pumpInModal.length > 0,
    `log zna ${JSON.stringify(pumpInLog.slice(0, 3))}, a modal nie powiedział o tym nic`,
  );
});
