// M192 — petla jakosci Zywym Testerem po Batchu 46 (2026-08-22).
//
// Znaleziska z transkryptow `tools/table-tester/audyt-m192/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

function buildSession(seed, humanFile = 'worek-dziki.txt', botFile = 'tarkir-bg.txt') {
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
    ['worek-dziki.txt', 'tarkir-bg.txt'],
    ['theros.txt', 'worek-mroczny.txt'],
    ['mirrodin-brg.txt', 'ravnica.txt'],
    ['innistrad-brg.txt', 'wiedzmin.txt'],
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

// ---- Z2: log twierdzil „reszta do grobu", gdy karty szly na SPOD ---------
// Znalezisko petli jakosci: pendingLookTopN ma DWA warianty resztki — grob
// (Gurmag Drowner) i spod biblioteki (Merchant's Dockhand, Rediscover the
// Way). Zdarzenie `look_top_resolved` nie nioslo tej informacji, wiec opis
// zawsze mowil „do grobu" — log wprost klamal o stanie gry (klasa L6/L14).

test('M192/Z2: log mówi „na spód biblioteki", gdy reszta idzie na spód', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => '?', isPlayer: (id) => id === 'human' };
  const line = String(describeGameEvent({
    type: 'look_top_resolved', playerId: 'human', count: 3,
    pickId: 'x', pickCardId: 'mountain', restTo: 'library_bottom',
  }, helpers, { human: 'Ty' }));
  assert.match(line, /spód biblioteki/, `Merchant's Dockhand / Rediscover the Way: ${JSON.stringify(line)}`);
  assert.doesNotMatch(line, /do grobu/, 'karty NIE trafiły do grobu');
});

test('M192/Z2: wariant grobowy (Gurmag Drowner) opisany bez zmian', async () => {
  const { describeGameEvent } = await import('../src/table/session.js');
  const helpers = { nameOf: (c) => c, nameOfObject: () => '?', isPlayer: (id) => id === 'human' };
  const line = String(describeGameEvent({
    type: 'look_top_resolved', playerId: 'human', count: 4,
    pickId: 'x', pickCardId: 'bolt', restTo: 'graveyard',
  }, helpers, { human: 'Ty' }));
  assert.match(line, /do grobu/, `kontrola anty-over-fix: ${JSON.stringify(line)}`);
});

test('M192/Z2: SILNIK niesie miejsce reszty w zdarzeniu (nie zgadywanka opisu)', async () => {
  // Warstwa opisu nie moze rekonstruowac stanu gry — informacje musi wyslac
  // silnik (L6). Pelna sciezka: efekt -> pendingLookTopN -> resolve -> event.
  const { createGameState, addObject, execute } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = createGameState({ seed: 192, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (let i = 0; i < 3; i += 1) {
    addObject(state, { id: `lib${i}`, instanceId: `i${i}`, cardId: 'basic-mountain',
      controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'land' });
  }
  const source = { id: 'src', controllerId: 'p1', cardId: 'merchants-dockhand', zone: 'battlefield' };
  applyEffect(state, { type: 'look_top_put_one_hand_rest_bottom', amount: 3 }, source, []);
  assert.equal(state.pendingLookTopN?.restTo, 'library_bottom', 'silnik zna miejsce reszty');
  const res = execute(state, { type: 'resolve_look_top_choice', playerId: 'p1', cardId: 'lib0' });
  assert.ok(res.ok, `komenda przyjęta: ${JSON.stringify(res)}`);
  const resolved = state.events.find((e) => e.type === 'look_top_resolved');
  assert.equal(resolved?.restTo, 'library_bottom',
    'zdarzenie MUSI nieść restTo — inaczej log zgaduje i kłamie');
});

// ---- Z3: opis efektu pokazywal literalne „X kart" -------------------------

test('M192/Z3: opis efektu podaje LICZBĘ kart, nie literalne „X"', async () => {
  const { rulesText } = await import('../src/table/render.js');
  const { createCardRegistry: reg } = await import('../src/cards/card-data.js');
  const card = reg().get('rediscover-the-way');
  const text = rulesText({
    ...card, abilities: card.abilities ?? [], controllerId: 'human',
  });
  assert.ok(!/\bX kart/.test(text),
    `Saga zna liczbę (amount: 3) — „X" to placeholder z kodu: ${JSON.stringify(text)}`);
});

// ---- Z4: kafel ladu dublowal zdolnosc many -------------------------------
// Znalezisko weryfikacji M193 w Zywym Testerze (warhammer vs mirrodin s11):
// „Dismal Backwater · Land · Gdy wejdzie…: zyskaj 1 zycie. · {T}: dodaj
// 1 mane niebieska lub czarna · T: dodaj 1 mane" — ta sama zdolnosc dwa razy,
// za drugim razem z BLEDNYM kolorem (bezbarwna). Zrodlo: landLine dopisywany
// BEZWARUNKOWO kazdemu ladowi. Dotad maskowal brak deskryptorow (M193/A),
// teraz jest nadmiarowy i wprowadza w blad.

test('M192/Z4: kafel lądu z własną zdolnością many NIE dubluje jej opisu', async () => {
  const { rulesText } = await import('../src/table/render.js');
  const { createCardRegistry: reg } = await import('../src/cards/card-data.js');
  const card = reg().get('dismal-backwater');
  const text = rulesText({ ...card, kind: 'land', abilities: card.abilities ?? [], controllerId: 'human' });
  const manaMentions = (text.match(/dodaj \d+ manę/g) ?? []).length;
  assert.equal(manaMentions, 1,
    `zdolność many ma być opisana RAZ (Oracle: „{T}: Add {U} or {B}"): ${JSON.stringify(text)}`);
  assert.match(text, /niebieską lub czarną/, 'i to z właściwymi kolorami');
});

test('M192/Z4: podstawowy ląd BEZ deskryptora nadal opisuje produkcję many', async () => {
  // Kontrola anty-over-fix: basicki nie maja zdolnosci w danych (produkcja
  // wynika z podtypu, CR 305.6) — dla nich linia „T: dodaj 1 manę" jest
  // JEDYNYM opisem i musi zostac.
  const { rulesText } = await import('../src/table/render.js');
  const { createCardRegistry: reg } = await import('../src/cards/card-data.js');
  const card = reg().get('basic-island');
  const text = rulesText({ ...card, kind: 'land', abilities: card.abilities ?? [], controllerId: 'human' });
  assert.match(text, /dodaj 1 manę/, `basic musi opisywać produkcję: ${JSON.stringify(text)}`);
});
