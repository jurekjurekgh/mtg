// PMSSB-79 — pętla strojenia NOWYCH mechanik batcha 70 (plan:
// docs/plans/PLAN_2026-10-27b-pmssb79-batch70.md; procedura: docs/PMSSB.md).
//
// Piny mierzą DECYZJE bota (trace → score), nie silnik: silnik ma własne piny
// w test/batch70-mechaniki.test.js i test/real-cards-batch70.test.js.
// Każdy pin „DONE" ma mutację przez pokrętło = 0 (dawne zachowanie) — to
// wymóg M429: nowe wymiary są dopłatami, nie zamianą modelu.
//
// Werdykty pętli (szczegóły w docs/PMSSB.md §PMSSB-79):
//   DONE (kod zmieniony): Converge-damage, trigger manifest dread, licznik
//     z cmentarza, ewazja po typie blokera.
//   ZAMKNIĘTE BEZ ZMIANY (pomiar wykazał poprawne zachowanie): X w koszcie
//     permanentu, Improvise (bliźniak convoke), drugi cel kickera, prewencja
//     zdejmująca liczniki w symulacji bloku.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockTable, convergeTable, evasionTable, improviseTable, jiltTable,
  manifestTable, millipedeTable, probeBlock, probeConverge, probeEvasion,
  probeImprovise, probeManifest, probeMillipede, probeXVariants, xTable,
} from '../tools/pmssb79-batch70-sonda.mjs';
import { execute, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const bot = (params) => createHeuristicBot({ seed: 79, ...(params ? { params } : {}) });
const BASE = DEFAULT_HEURISTIC_PARAMS;

/** Wybrany wariant + tabela score'ów przy danym stole. */
function decision(state, playerId = 'p2', params) {
  const engine = bot(params);
  const chosen = engine.chooseCommand(playerView(state, playerId), {});
  const options = engine.trace().at(-1)?.options ?? [];
  return { chosen, options, scoreOf: (cmd) => options.find((o) => o.cmd === cmd)?.score ?? null };
}

// ── 1. Converge (Kaleidoscorch) — NAPRAWIONE ────────────────────────────────
test('PMSSB-79/1a: Converge — cztery kolory many biją jeden kolor', () => {
  const jeden = probeConverge({ colors: 1 });
  const cztery = probeConverge({ colors: 4 });
  assert.ok(jeden != null && cztery != null, 'oferta rzutu Kaleidoscorchem istnieje');
  assert.ok(cztery > jeden,
    `kwota „kolory many” nie wchodzi do wyceny: 1 kolor=${jeden}, 4 kolory=${cztery}`);
});

test('PMSSB-79/1b: Converge — czar jest dodatnio wyceniany (bot go rzuca)', () => {
  // PRZED: damage z kwotą stringową spadał do 0 → score −61 (karę „efekt bez
  // skutku") i bot nigdy nie rzucał Kaleidoscorcha.
  assert.ok(probeConverge({ colors: 2 }) > 0,
    `czar z Converge wciąż wyceniany na zero/ujemnie: ${probeConverge({ colors: 2 })}`);
});

test('PMSSB-79/1c: Converge — pokrętło 0 wraca do dawnego zachowania (M429)', () => {
  const jeden = probeConverge({ colors: 1, params: { convergeDamagePerColor: 0 } });
  const cztery = probeConverge({ colors: 4, params: { convergeDamagePerColor: 0 } });
  assert.equal(jeden, cztery, 'przy pokrętle 0 liczba kolorów nie może zmieniać wyceny');
});

// ── 2. Trigger manifest dread (Paranormal Analyst) — NAPRAWIONE ────────────
test('PMSSB-79/2a: manifest dread — trigger z aktywatorem i kartą w grobie podnosi wycenę', () => {
  const bez = probeManifest({ graveyard: 2, enabler: false });
  const z = probeManifest({ graveyard: 2, enabler: true });
  assert.ok(z > bez,
    `trigger „whenever you manifest dread” wciąż niemy: bez aktywatora=${bez}, z=${z}`);
});

test('PMSSB-79/2b: manifest dread — bramka dowodu (M429): bez aktywatora i bez karty w grobie zero', () => {
  const bezAktywatora = probeManifest({ graveyard: 2, enabler: false });
  const bezKarty = probeManifest({ graveyard: 0, enabler: true });
  assert.equal(bezAktywatora, probeManifest({ graveyard: 0, enabler: false }),
    'brak aktywatora nie może dawać bonusu');
  assert.ok(bezKarty <= bezAktywatora,
    'pusty grób nie ma czego zwracać — trigger nie może dawać pełnej wartości');
});

test('PMSSB-79/2c: manifest dread — pokrętło 0 wraca do dawnego zachowania', () => {
  const params = { manifestDreadTriggerValue: 0 };
  assert.equal(
    probeManifest({ graveyard: 2, enabler: true, params }),
    probeManifest({ graveyard: 2, enabler: false, params }),
    'przy pokrętle 0 triggery z/bez aktywatora muszą być równe',
  );
});

// ── 3. Licznik „za kartę typu w cmentarzu” (Moldgraf) — NAPRAWIONE ─────────
test('PMSSB-79/3a: licznik z cmentarza — 3 karty stworów w grobie biją pusty grób', () => {
  const pusty = probeMillipede({ creatures: 0 });
  const pelny = probeMillipede({ creatures: 3 });
  assert.ok(pelny > pusty,
    `kwota licznika z cmentarza nie wchodzi do wyceny ETB: 0=${pusty}, 3=${pelny}`);
});

test('PMSSB-79/3b: licznik z cmentarza — pokrętło 0 wraca do płaskiej dawnej wartości', () => {
  const params = { graveyardCounterWeight: 0 };
  assert.equal(
    probeMillipede({ creatures: 3, params }),
    probeMillipede({ creatures: 0, params }),
    'przy pokrętle 0 cmentarz nie może zmieniać wyceny ETB',
  );
});

// ── 4. Ewazja po typie blokera (Fen Hauler) — NAPRAWIONE ───────────────────
test('PMSSB-79/4a: ewazja po typie — artefakt-stwór 6/6 nie blokuje Fen Haulera', () => {
  const artefakt = probeEvasion({ artifactBlocker: true, size: 6 });
  const score = artefakt.options.find((o) => o.cmd === 'attack[hauler]')?.score ?? null;
  assert.ok(score != null && score > 0,
    `atak w nieblokowalność musi być dodatni: ${score}`);
});

test('PMSSB-79/4b: ewazja po typie — zwykły stwór 6/6 NADAL blokuje (kontrola negatywna)', () => {
  const zwykly = probeEvasion({ artifactBlocker: false, size: 6 });
  const score = zwykly.options.find((o) => o.cmd === 'attack[hauler]')?.score ?? null;
  assert.ok(score != null && score < 0,
    `bez artefaktu-blokera atak 5/5 w 6/6 musi być nieopłacalny: ${score}`);
});

// ── 5. Kontrole zamknięte BEZ ZMIANY (pomiar = poprawne zachowanie) ────────
test('PMSSB-79/5a: X w koszcie permanentu — rosnące X rośnie w wycenie, X=0 karane', () => {
  const scores = probeXVariants().map((entry) => entry.score);
  assert.ok(scores.length >= 4, `oczekiwane warianty X=0..4: ${scores.join(', ')}`);
  // Trace nie niesie X — warianty są sortowane malejąco: najwyższe X wygrywa.
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2],
    `wycena nie odróżnia X: ${scores.join(', ')}`);
  assert.ok(scores[scores.length - 1] < 0,
    `X = 0 (stwór 0/0 ginie od SBA, CR 704.5f) musi być ujemne: ${scores.join(', ')}`);
});

test('PMSSB-79/5b: Improvise — bot rzuca, gdy tapnięcie artefaktów to JEDYNA droga', () => {
  const biedny = improviseTable({ mana: 5, artifacts: 2 });
  const wynik = decision(biedny);
  assert.equal(wynik.chosen?.type, 'cast_permanent',
    'przy 5 many i 7-kosztowym Fen Haulerze improvise musi umożliwić rzut');
  assert.ok((wynik.chosen?.improvisePayments ?? []).length > 0,
    'wariant rzutu musi płacić tapnięciem artefaktów');
});

test('PMSSB-79/5c: Improvise — przy pełnej manie bot płaci maną (artefakty nietknięte)', () => {
  const bogaty = improviseTable({ mana: 7, artifacts: 2 });
  const wynik = decision(bogaty);
  assert.equal(wynik.chosen?.type, 'cast_permanent', 'rzut jest opłacalny');
  assert.equal((wynik.chosen?.improvisePayments ?? []).length, 0,
    'kara improvise (5 × ciało/4) przewyższa wartość zaoszczędzonej many — '
    + 'artefakty zostają nietknięte, dopóki mana wystarcza');
});

test('PMSSB-79/5d: Jilt — wariant z kickerem i dwoma celami wygrywa (drugi cel wyceniany)', () => {
  const wynik = decision(jiltTable({ kicked: true, big: true }));
  const dwa = wynik.scoreOf('cast_spell(x->f2+f1)');
  const jeden = wynik.scoreOf('cast_spell(x->f2)');
  assert.ok(dwa != null && jeden != null, 'oba warianty muszą istnieć');
  assert.ok(dwa > jeden, `drugi cel nie dodaje wartości: ${dwa} vs ${jeden}`);
});

test('PMSSB-79/5e: prewencja zdejmująca liczniki — blok widzi liczniki jako ciało', () => {
  // Rozstrzygnięcie „anomalii 0.00” z POMIARU PRZED: Pummeler z X=0 jest 0/0
  // i ginie od SBA (CR 704.5f) — taki blok nie jest wart więcej niż przepuszczenie,
  // więc remis 0.00 vs 0.00 to POPRAWNY model stanu zdegenerowanego, nie luka.
  const bez = probeBlock({ counters: 0 });
  assert.equal(bez.block, 0, '0/0 (X=0, CR 704.5f) nie ma czym blokować');
  assert.equal(bez.pass, 0, 'w stanie zdegenerowanym przepuszczenie też jest warte 0');
  const jeden = probeBlock({ counters: 1 });
  const trzy = probeBlock({ counters: 3 });
  assert.ok(trzy.block > 0, `3 liczniki (3/3) muszą czynić blok opłacalnym: ${trzy.block}`);
  assert.ok(trzy.block > jeden.block && jeden.block > bez.block,
    `wymiana musi rosnąć z liczbą liczników: 0→${bez.block} 1→${jeden.block} 3→${trzy.block}`);
});

// ── 6. Silnik: kwota `colors_of_mana_spent` rozstrzyga się poprawnie ───────
test('PMSSB-79/6a: silnik — Kaleidoscorch zadaje tyle obrażeń, ile kolorów many wydano', () => {
  // Weryfikacja „domniemanej luki silnika” z POMIARU PRZED: przy rzucie
  // {1}{R} z czterech różnych kolorów płatność wybiera DWA kolory, więc 2
  // obrażenia to wynik POPRAWNY (CR 601.2f: nie można przepłacić).
  const sprawdz = (colors) => {
    const state = convergeTable({ colors });
    const cast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'x', targets: ['f1'] });
    assert.equal(cast.ok, true, 'rzut musi być legalny');
    for (let i = 0; i < 8; i += 1) {
      execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    }
    const dealt = state.events.find((e) => e.type === 'damage_dealt' && e.target === 'f1');
    return dealt?.amount ?? 0;
  };
  assert.equal(sprawdz(1), 1, 'jeden kolor many = 1 obrażenie');
  assert.equal(sprawdz(4), 2, 'cztery kolory w puli, ale koszt {1}{R} = 2 kolory = 2 obrażenia');
});

// ── 7. Kontrola: pokrętła istnieją i mają domyślne wartości ─────────────────
test('PMSSB-79/7: nowe pokrętła mają domyślne wartości w heuristic-params', () => {
  assert.equal(BASE.convergeDamagePerColor, 1);
  assert.equal(BASE.manifestDreadTriggerValue, 4);
  assert.equal(BASE.graveyardCounterWeight, 1);
  assert.equal(BASE.graveyardCounterCap, 8);
  // Anty-over-fix: zerowanie któregokolwiek = dawne zachowanie (piny 1c/2c/3b).
  void blockTable; void convergeTable; void evasionTable; void manifestTable;
  void millipedeTable; void xTable;
});
