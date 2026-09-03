import fs from 'node:fs';
import path from 'node:path';

/**
 * Ściąga rulingi WotC do snapshotów kart (`docs/cards/scryfall-<slug>.json`)
 * i dopisuje je do pliku jako pole `rulings` (+ `rulingsSource`,
 * `rulingsPobrano`).
 *
 * Po co: audyt „karta zgodna z Oracle\" (ADR 0010 §2a, L57) porównywał do tej
 * pory tylko `oracle_text`. Tymczasem część rozstrzygnięć NIE jest w tekście
 * karty, tylko w rulingach — i to one rozstrzygają spory typu:
 *
 * - Vaan, Street Thief: „Timing restrictions based on the card's type are
 *   ignored\" — potwierdza, że rzut z wygnania omija bramki main fazy i stosu;
 * - Jolrael, Mwonvuli Recluse: „The triggered ability can trigger only once
 *   each turn … if it's not on the battlefield when the second card is drawn,
 *   the ability can't trigger at all that turn\" — czyli licznik jest PER
 *   GRACZ i liczy od początku tury, niezależnie od obecności Jolrael (patrz
 *   `recordCardDrawn`, M281);
 * - Leonin Surveyor: „Start your engines! isn't a triggered ability\" — to
 *   akcja oparta na stanie, więc działa też po przejęciu permanentu.
 *
 * Użycie (potrzebny egress HTTPS; w sandboxie Arena jest on zablokowany —
 * wtedy niech agent ściągnie te same URL-e narzędziem `fetch_page` i zapisze
 * wynik tutaj, a skrypt posłuży do odświeżenia):
 *
 *   node tools/fetch-card-rulings.mjs                 # wszystkie snapshoty
 *   node tools/fetch-card-rulings.mjs --only=vaan     # wybrane slugi (podciąg)
 *   node tools/fetch-card-rulings.mjs --dry-run       # bez zapisu, co by zmienił
 *
 * Identyfikatory bierze z pól `set` + `collector_number` snapshotu, więc NIE
 * potrzebujeUUID karty: endpoint `/cards/<set>/<kolekcja>/rulings` jest
 * oficjalnym aliasem `/cards/<uuid>/rulings`.
 */

const CARDS_DIR = process.env.MTG_CARDS_DIR ?? 'docs/cards';
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const dryRun = args.includes('--dry-run');

function listSnapshots(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('scryfall-') && f.endsWith('.json'))
    .filter((f) => (only ? f.includes(only) : true))
    .map((f) => path.join(dir, f));
}

/** Jedno pobranie z opóźnieniem i dwoma ponowieniami (rate limit Scryfalla). */
async function fetchRulings(set, number) {
  const url = `https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(number)}/rulings`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after') ?? '2');
        await new Promise((r) => setTimeout(r, Math.max(1000, wait * 1000)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return { url, data: body.data ?? [] };
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { url: '', data: [] };
}

/** Normalizacja: zapisujemy tylko to, co czytają audyty (komentarz + źródło). */
export function normalizeRulings(list) {
  return list
    .map((r) => ({
      date: r.published_at ?? null,
      source: r.source ?? 'wotc',
      comment: String(r.comment ?? '').trim(),
    }))
    .filter((r) => r.comment.length > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function applyRulings(snapshot, rulings, url, date = new Date().toISOString().slice(0, 10)) {
  return { ...snapshot, rulings, rulingsSource: url, rulingsPobrano: date };
}

// Uruchomienie bezpośrednie (import dla testów NIE wolno networkować — wzorzec
// `tools/family-audit.mjs`).
if (process.argv[1] && process.argv[1].endsWith('fetch-card-rulings.mjs')) {

  if (!files.length) {
    console.error(`Brak snapshotów w ${CARDS_DIR} (albo --only nie trafił w żaden plik).`);
    process.exit(1);
  }
  let changed = 0;
  let failed = 0;
  for (const file of files) {
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!snapshot.set || snapshot.collector_number == null) {
      console.log(`POMINIĘTY ${path.basename(file)} — brak set/collector_number w snapshotcie`);
      continue;
    }
    let fetched;
    try {
      fetched = await fetchRulings(snapshot.set, snapshot.collector_number);
    } catch (error) {
      // To jest ścieżka, na której opiera się audyt kart — głośny błąd, nie cisza.
      console.error(`BŁĄD ${path.basename(file)}: ${error.message}`);
      failed += 1;
      continue;
    }
    const rulings = normalizeRulings(fetched.data);
    // Pusta lista jest ZAPISYWANA (odróżnia „ściągnięto, brak rulingów" od
    // „nigdy nie ściągnięto") — dlatego porównanie normalizuje nieobecność pola
    // do [], inaczej narzędzie przepisywałoby plik przy każdym uruchomieniu.
    const przed = JSON.stringify(snapshot.rulings ?? []);
    const po = JSON.stringify(rulings);
    if (przed === po) {
      console.log(`bez zmian  ${path.basename(file)} (${rulings.length} rulingów)`);
      continue;
    }
    const updated = applyRulings(snapshot, rulings, fetched.url);
    changed += 1;
    if (dryRun) {
      console.log(`[dry-run]  ${path.basename(file)}: ${rulings.length} rulingów`);
      continue;
    }
    fs.writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    console.log(`zapisane   ${path.basename(file)}: ${rulings.length} rulingów`);
  }
  console.log(`\nSnapshoty: ${files.length}, zaktualizowane: ${changed}, błędy: ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}
