// M192 — petla jakosci Zywym Testerem po Batchu 46 (2026-08-22).
//
// Znaleziska z transkryptow `tools/table-tester/audyt-m192/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function buildSession(seed, humanFile = 'worek-dziki.txt', botFile = 'tarkir.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanFile}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return createSession({ seed, registry, decks });
}

/** Prosta polityka czlowieka — wystarczy, zeby partia sie rozwinela. */
function chooseHumanCommand(view) {
  const c = view.legalCommands;
  const first = (type) => c.find((cmd) => cmd.type === type) ?? null;
  return first('draw_card')
    ?? first('play_land')
    ?? first('tap_for_mana')
    ?? first('cast_permanent')
    ?? c.find((cmd) => cmd.type.startsWith('resolve_'))
    ?? first('pass_priority');
}

/** Zbiera wpisy modala „Rozgrywka" z wielu partii. */
function collectBotMoves({ seeds = 30, maxMoves = 500, human, bot } = {}) {
  const entries = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    try {
      const session = buildSession(seed, human, bot);
      for (let i = 0; i < maxMoves; i += 1) {
        if (session.state.status !== 'active') break;
        const view = session.view();
        if (view.turn.priorityPlayerId !== HUMAN_ID) break;
        for (const move of session.botMoves ?? []) entries.push({ ...move, seed });
        const cmd = chooseHumanCommand(view);
        if (!cmd) break;
        if (!session.apply(cmd).ok) break;
      }
    } catch { /* rzadkie uklady pomijamy — liczy sie masa proby */ }
  }
  return entries;
}

/**
 * Ruchy stref z KILKU par talii. Jedna para nie wystarcza: „biblioteka →
 * cmentarz" czy „pole bitwy → wygnanie" pojawiaja sie tylko w taliach, ktore
 * maja mill/removal. Test anty-over-fix musi widziec strefy JAWNE, inaczej
 * mierzylby pusty zbior (i przechodzil nawet po zepsuciu naprawy).
 */
function collectMovesAcrossDecks() {
  const PAIRS = [
    ['worek-dziki.txt', 'tarkir.txt'],
    ['theros.txt', 'worek-mroczny.txt'],
    ['mirrodin.txt', 'ravnica.txt'],
    ['innistrad.txt', 'wiedzmin.txt'],
  ];
  const all = [];
  for (const [human, bot] of PAIRS) {
    all.push(...collectBotMoves({ seeds: 8, maxMoves: 400, human, bot }));
  }
  return all;
}

// ---------------------------------------------------------------------------
// Z1 — PRZECIEK UKRYTEJ INFORMACJI w modalu „Rozgrywka" (CR 400.2).
//
// Objaw (transkrypt audyt-m192/g1.txt, Rediscover the Way u bota):
//   • Nieprzyjaciel patrzy na 3 karty z wierzchu biblioteki
//   • Nieprzyjaciel: Krumar Initiate — biblioteka → reka
//   • Nieprzyjaciel: Mountain — biblioteka → biblioteka
//   • Nieprzyjaciel: Kin-Tree Nurturer — biblioteka → biblioteka
// Gracz poznal DOKLADNIE trzy karty, ktore bot obejrzal prywatnie: te, ktora
// wzial do reki, i te, ktore odlozyl na spod. To pelny podglad prywatnej
// decyzji przeciwnika — wieksza wpadka niz M123 (tam przeciekala miniaturka).
//
// Root cause: M123 zalatalo MINIATURKE (`cardId`) dla ruchow do ukrytej strefy,
// ale TEKST wpisu budowany jest w drugiej galezi `noteBotMove` (object_moved
// jest szumem logu, wiec ma wlasny opis) i wolal `nameOf(...)` bez zadnej
// bramki FoW. Klasa L41: dwie kopie tej samej zasady, zalatana jedna.
// ---------------------------------------------------------------------------

test('M192/Z1: modal nie nazywa kart bota przenoszonych MIEDZY strefami ukrytymi', () => {
  const HIDDEN = /biblioteka → ręka|biblioteka → biblioteka|ręka → biblioteka/;
  const leaks = [];
  for (const move of collectBotMoves()) {
    if (!HIDDEN.test(move.text ?? '')) continue;
    // Legalny ksztalt wpisu jest bezimienny („karta"). Przeciek = konkretna
    // nazwa karty przed mysinikiem.
    const named = /^Nieprzyjaciel: (?!karta —)[^—]+—/.test(move.text);
    if (named) leaks.push(`seed ${move.seed}: ${move.text}`);
  }
  assert.deepEqual(leaks.slice(0, 5), [],
    'modal zdradza karty, ktore bot ogladal prywatnie (CR 400.2)');
});

test('M192/Z1 (anty-over-fix): ruchy dotykajace strefy JAWNEJ nadal nazywaja karte', () => {
  // Grob, wygnanie i pole bitwy sa publiczne (CR 400.2) — wyciszenie nazwy TAM
  // byloby regresja informacyjna (os 2 audytu: „wszystko poza szumem ma byc").
  const moves = collectMovesAcrossDecks();
  const publicMoves = moves.filter((m) => /(cmentarz|pole bitwy|wygnanie)/.test(m.text ?? '')
    && /—\s*[^→]+→/.test(m.text ?? ''));
  assert.ok(publicMoves.length > 0, 'proba musi zawierac ruchy dotykajace stref jawnych');
  const anonymous = publicMoves.filter((m) => /: karta —/.test(m.text));
  assert.deepEqual(anonymous.slice(0, 3).map((m) => m.text), [],
    'karta w ruchu dotykajacym strefy jawnej musi byc nazwana');
});

test('M192/Z1 (anty-over-fix): WLASNE ruchy gracza miedzy strefami ukrytymi sa nazwane', () => {
  // Wlasna reka i wlasna biblioteka to wiedza gracza (CR 400.2) — anonimizacja
  // dotyczy wylacznie przeciwnika. Gdyby bramka patrzyla na same strefy
  // (bez kontrolera), gracz przestalby widziec WLASNE karty.
  const moves = collectMovesAcrossDecks().filter((m) => /^Ty: /.test(m.text ?? ''));
  const ownHidden = moves.filter((m) => /(biblioteka → ręka|ręka → biblioteka|biblioteka → biblioteka)/.test(m.text));
  assert.ok(ownHidden.length > 0, 'proba musi zawierac wlasne ruchy w strefach ukrytych');
  const anonymous = ownHidden.filter((m) => /: karta —/.test(m.text));
  assert.deepEqual(anonymous.slice(0, 3).map((m) => m.text), [],
    'wlasna karta gracza musi byc nazwana takze w strefach ukrytych');
});
