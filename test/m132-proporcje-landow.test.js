// =============================================================================
// M132 — zgłoszenie B właściciela (2026-08-17):
//
//   „Sprawdź czy po dodaniu do talii wielu nowych kart dodałeś też odpowiednią
//    ilość lądów, bo mam wrażenie, że proporcje 2 do 1 nie są zachowane
//    i lądów jest w taliach za mało."
//
// Intuicja potwierdzona pomiarem. Talie, które rosły wraz z kolejnymi batchami
// realnych kart, zjechały poniżej progu (nieland : land):
//
//   green 2,52  |  red 2,32  |  black 2,25  |  azorius 2,18   (przy progu 2,00)
//
// ROOT CAUSE nie jest „ktoś zapomniał dosypać lądów przy batchu 33". Konwencja
// z decks/README.md („~10-15 lądów dopasowanych do talii") nie miała ŻADNEGO
// strażnika, a `repo-decks.test.js` pilnował wyłącznie formatu, singletona
// i minimum 15 kart nielandowych. Każdy batch dokładał więc czary do talii,
// nie ruszając lądów — i nikt tego nie widział. To ten sam wzorzec co L29/L31:
// reguła zapisana wyłącznie w prozie dokumentacji jest regułą nieegzekwowaną.
//
// Ten test jest odpowiedzią na przyczynę, nie na objaw: liczby poprawiono raz,
// a strażnik pilnuje ich przy każdym kolejnym batchu.
//
// Próg: klasyczna manabaza Magic to ok. 17 lądów na 40 kart (~40 %) albo
// 24 na 60 (~40 %). Właściciel podał regułę „2 do 1" (nieland : land), czyli
// ~33 % lądów — bierzemy ją jako TWARDY limit górny, z zapasem na dolny kraniec
// (talie z małą krzywą many mogą mieć lądów więcej).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const BY_NAME = new Map(REGISTRY.all().map((card) => [card.name.toLowerCase(), card]));

/** Reguła właściciela: na każde 2 karty nielandowe co najmniej 1 ląd. */
const MAX_NONLAND_PER_LAND = 2.0;

/** Talie „małe" bywają landowo przeważone — to nie błąd, ale nie bez granic. */
const MAX_LAND_SHARE = 0.55;

const DECK_FILES = fs.readdirSync('decks').filter((name) => name.endsWith('.txt')).sort();

/** Rozkład talii na karty nielandowe i lądy (po LINII TYPÓW, nie po nazwie). */
function countDeck(file) {
  let nonland = 0;
  let lands = 0;
  const unknown = [];
  for (const raw of fs.readFileSync(`decks/${file}`, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(\d+)x\s+(.+)$/);
    if (!match) continue;
    const count = Number(match[1]);
    const card = BY_NAME.get(match[2].trim().toLowerCase());
    if (!card) { unknown.push(match[2]); continue; }
    // Liczymy WSZYSTKIE lądy, także niepodstawowe (Great Furnace, Fertile
    // Thicket) — one też produkują manę, więc należą do manabazy.
    if ((card.types ?? []).includes('Land')) lands += count;
    else nonland += count;
  }
  return { nonland, lands, unknown };
}

test('M132/B: każda talia ma co najmniej 1 ląd na 2 karty nielandowe', () => {
  const offenders = [];
  for (const file of DECK_FILES) {
    const { nonland, lands, unknown } = countDeck(file);
    assert.deepEqual(unknown, [], `${file}: nieznane karty ${unknown.join(', ')}`);
    assert.ok(lands > 0, `${file}: talia bez lądów`);
    const ratio = nonland / lands;
    if (ratio > MAX_NONLAND_PER_LAND) {
      const needed = Math.ceil(nonland / MAX_NONLAND_PER_LAND) - lands;
      offenders.push(`${file}: ${nonland} nielandowych / ${lands} lądów = ${ratio.toFixed(2)} `
        + `(próg ${MAX_NONLAND_PER_LAND.toFixed(2)}; brakuje ${needed} lądów)`);
    }
  }
  assert.deepEqual(offenders, [],
    'talia urosła o karty, ale nie o lądy (zgłoszenie B właściciela):\n' + offenders.join('\n'));
});

test('M132/B: żadna talia nie jest przeważona lądami', () => {
  // Druga strona tej samej miary — bez niej „naprawa" mogłaby polegać na
  // dosypaniu lądów w nieskończoność.
  const offenders = [];
  for (const file of DECK_FILES) {
    const { nonland, lands } = countDeck(file);
    const share = lands / (nonland + lands);
    if (share > MAX_LAND_SHARE) {
      offenders.push(`${file}: ${(share * 100).toFixed(1)} % lądów (limit ${(MAX_LAND_SHARE * 100).toFixed(0)} %)`);
    }
  }
  assert.deepEqual(offenders, [], 'talia przeważona lądami:\n' + offenders.join('\n'));
});

test('M178: talie generowane per plan trzymają regułę 1:2 z konstrukcji', () => {
  // M178 (rewolucja talii, ADR 0023): stare talie batchowe (green/red/black/
  // azorius) zastąpione taliami per PLAN z generatora
  // (tools/generate-plan-decks.mjs) — landy = ceil(nielandów/2), więc każda
  // talia spełnia próg z konstrukcji; ten test pilnuje, żeby generator się
  // nie rozjechał (i żeby ręczne poprawki talii nie złamały reguły).
  for (const file of DECK_FILES) {
    const { nonland, lands } = countDeck(file);
    const ratio = nonland / lands;
    assert.ok(ratio <= MAX_NONLAND_PER_LAND,
      `${file}: ${ratio.toFixed(2)} nielandowych na ląd — próg to ${MAX_NONLAND_PER_LAND.toFixed(2)}`);
  }
});
