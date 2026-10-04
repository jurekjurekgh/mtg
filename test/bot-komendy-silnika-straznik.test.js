// PMSSB-54 (2026-10-04c) — strażnik POKRYCIA komend silnika w bocie.
//
// Proweniencja: przegląd czytników `zone === 'exile'` (kolejka z handoffów
// 03d/03i/03j) zamienił się w pytanie „czy bot obsługuje KAŻDĄ decyzję,
// którą silnik potrafi wyemitować?". Pomiar: silnik emituje **89** typów
// komend (`command('…'` w `src/engine/*.js`; `src/table` nie emituje żadnej,
// a jedyne niestatyczne wywołanie to walidacja wejścia w game-state.js:2126),
// bot ma dla nich wszystkich jawne `case` — ale nic tego NIE pilnowało.
//
// Dlaczego to luka klasy L41: brak `case` nie kończy się błędem, tylko
// `default: finish(0)` — czyli wyborem z KOLEJNOŚCI OFERT silnika (wyceną
// przypadkową). Telemetria `bot.unvaluedDecisions()` (detektor Żywego
// Testera, `test/detektor-niewycenione-akcje.test.js`) łapie to dopiero
// W GRZE; ten strażnik łapie to przy budowaniu drzewa — nowy typ decyzji
// dodany do silnika bez wyceny w bocie zapala się od razu.
//
// Zakres: statyczny skan źródeł (jak `cr-numery-702-tabela-straznik`).
// Kotwice (≥80 typów po obu stronach) pilnują, by regex nie „przeszedł na
// pusto" po refaktorze (L13: strażnik mierzy regułę, nie tekst).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = fileURLToPath(new URL('../src/engine/', import.meta.url));
const BOT_FILE = fileURLToPath(new URL('../src/controllers/heuristic-bot.js', import.meta.url));

// Typy ŚWIADOMIE bez `case` (spadają do `default: finish(0)`).
// Pusty z założenia: każdy nowy typ decyzji silnika ma dostać ŚWIADOMĄ
// odpowiedź bota — choćby jawną wycenę 0 z komentarzem (wzorzec E2/D z
// `test/bot-wyceny-pakiet-d.test.js`). Wpis wymaga uzasadnienia tutaj.
const SWIADOMIE_BEZ_CASE = new Set([]);

function typyKomendSilnika() {
  const typy = new Set();
  for (const plik of readdirSync(ENGINE_DIR)) {
    if (!plik.endsWith('.js')) continue;
    const src = readFileSync(ENGINE_DIR + plik, 'utf8');
    for (const dopasowanie of src.matchAll(/\bcommand\('([a-z_]+)'/g)) typy.add(dopasowanie[1]);
  }
  return typy;
}

function casyBota() {
  const src = readFileSync(BOT_FILE, 'utf8');
  const typy = new Set();
  for (const dopasowanie of src.matchAll(/case '([a-z_]+)':/g)) typy.add(dopasowanie[1]);
  return typy;
}

test('PMSSB-54: każdy typ komendy silnika ma jawny case w bocie (brak = default: finish(0))', () => {
  const silnik = typyKomendSilnika();
  const bot = casyBota();
  assert.ok(silnik.size >= 80, `ekstrakcja typów komend silnika działa (znalazłem ${silnik.size})`);
  assert.ok(bot.size >= 80, `ekstrakcja case'ów bota działa (znalazłem ${bot.size})`);
  const brakujace = [...silnik]
    .filter((typ) => !bot.has(typ) && !SWIADOMIE_BEZ_CASE.has(typ))
    .sort();
  assert.deepEqual(brakujace, [],
    `typy bez case w bocie (wybór spadnie do kolejności ofert — antywzorzec L41): ${brakujace.join(', ')}`);
});

test('PMSSB-54: strażnik nie przechodzi na pusto po refaktorze (kotwice typów)', () => {
  assert.ok(typyKomendSilnika().has('pass_priority'), 'pass_priority to najczęstsza komenda — musi być w skanie');
  assert.ok(typyKomendSilnika().has('resolve_ward_pay_choice'), 'decyzja ward (PMSSB-53) w skanie');
  assert.ok(casyBota().has('resolve_ward_pay_choice'), 'decyzja ward ma case w bocie');
  assert.ok(casyBota().has('pass_priority'), 'pass_priority ma case w bocie');
});

test('PMSSB-54: żaden typ nie jest podwójnie wykluczony (lista świadomych wyjątków jest realna)', () => {
  for (const typ of SWIADOMIE_BEZ_CASE) {
    assert.ok(typyKomendSilnika().has(typ),
      `wpis „${typ}" nie odpowiada żadnej komendzie silnika — usuń go (lista nie może gnić)`);
  }
});
