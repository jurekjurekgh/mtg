/**
 * Uzupełnianie `artId` w definicjach kart z arkusza kolekcji właściciela.
 *
 * Po co: lokalne tory podglądu (FOT/KON) adresują pliki `./img/<ID>FOT.png`
 * i `./img/<ID>KON.png`, a ID nie jest osobną kolumną arkusza — jest prefiksem
 * nazwy pliku w kolumnie „Ilustracja" (audyt legacy §3.2). Zamiast wpisywać
 * numery ręcznie, to narzędzie pobiera opublikowany CSV, dopasowuje wiersze do
 * kart z rejestru po nazwie i **samo dopisuje `artId`** do `src/cards/card-data.js`.
 *
 * Adres arkusza: wczytywany w tej kolejności — (1) zmienna środowiskowa
 * `MTG_COLLECTION_CSV_URL`, (2) plik `tools/collection.config.json` (pole
 * `csvUrl`). Ten drugi jest opcjonalny i — zgodnie z decyzją właściciela
 * 2026-08-02 — może być zapisany w repozytorium, o ile arkusz jest
 * publicznie opublikowany (wówczas adres NIE jest sekretem w rozumieniu
 * SECURITY.md §Sekrety). Gdy arkusz jest prywatny, należy użyć wyłącznie
 * zmiennej środowiskowej/sekretu Actions i trzymać `collection.config.json`
 * poza Git (jest w `.gitignore`? nie — plik konfiguracyjny jest jawny,
 * ale można go usunąć, by wrócić do trybu wyłącznie-env).
 * Do repozytorium i do artefaktu stołu (przeglądarki) trafia wyłącznie
 * wynik — numery ilustracji (`artId`), nigdy sam adres.
 *
 * Uruchomienie:
 *   node tools/fetch-art-ids.mjs                                      # domyślnie: słownik tools/collection-art-ids.csv
 *   node tools/fetch-art-ids.mjs --dry-run                            # raport dopasowań, bez zapisu
 *   node tools/fetch-art-ids.mjs --csv eksport.csv                    # wyłącznie dany plik (pełne nadpisanie źródeł)
 *   MTG_COLLECTION_CSV_URL='https://…/pub?output=csv' node tools/fetch-art-ids.mjs
 *
 * Logika źródeł (bez `--csv`):
 *   1. lokalny słownik `tools/collection-art-ids.csv` (pełna lista kolekcji
 *      wersjonowana w repo) — domyślne źródło, działa offline;
 *   2. karty spoza słownika → świeży fetch z arkusza (`MTG_COLLECTION_CSV_URL`
 *      lub `csvUrl` z configu); gdy fetch się nie powiedzie — ostrzeżenie;
 *   3. karty nadal bez numeru → zostają bez `artId` (tory FOT/KON spadają
 *      na Scryfall — poprawne zachowanie dla kart spoza kolekcji).
 *
 * Duplikaty nazw z różnych setów (np. Negate M15 i M20) są zachowywane
 * w słowniku; dopasowanie preferuje wpis zgodny z setem karty, inaczej
 * bierze pierwsze wystąpienie. Determinizm: narzędzie jest offline-owe
 * wobec gry (nie działa w runtime stołu), a jego wynik to zwykły commit
 * w repozytorium — engine i replay pozostają deterministyczne (ADR 0005).
 */

import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';

const CARD_DATA_PATH = 'src/cards/card-data.js';
const CONFIG_PATH = new URL('./collection.config.json', import.meta.url);
const BUNDLED_CSV_PATH = new URL('./collection-art-ids.csv', import.meta.url);

/**
 * Adres arkusza z `tools/collection.config.json` (pole `csvUrl`), jeśli plik
 * istnieje i jest poprawny. Zwraca `null` przy braku/uszkodzeniu — wtedy
 * narzędzie polega na zmiennej środowiskowej albo na `--csv`.
 */
function loadCollectionConfigUrl() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const url = cfg?.csvUrl;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    return null;
  }
}

/** Parser CSV zgodny z tym z pliku legacy (cudzysłowy, „"" ” jako escape, CRLF). */
export function parseCSV(text) {
  const rows = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const row = [];
    while (i < n && (text[i] === '\r' || text[i] === '\n')) i += 1;
    if (i >= n) break;
    while (i < n && text[i] !== '\n' && !(text[i] === '\r' && text[i + 1] === '\n')) {
      let field = '';
      if (text[i] === '"') {
        i += 1;
        while (i < n) {
          if (text[i] === '"' && text[i + 1] === '"') { field += '"'; i += 2; } else if (text[i] === '"') { i += 1; break; } else { field += text[i]; i += 1; }
        }
      } else {
        while (i < n && text[i] !== ',' && text[i] !== '\n' && !(text[i] === '\r' && text[i + 1] === '\n')) { field += text[i]; i += 1; }
      }
      row.push(field.trim());
      if (i < n && text[i] === ',') i += 1;
    }
    if (row.length > 1 || row[0] !== '') rows.push(row);
    if (i < n && text[i] === '\r') i += 1;
    if (i < n && text[i] === '\n') i += 1;
  }
  return rows;
}

/**
 * Mapa „nazwa karty (lowercase) → [{artId, set}]” z wierszy arkusza.
 * Duplikaty nazw z różnych setów (np. Negate M15 i M20) są zachowywane,
 * bo każdy druk ma własny numer ilustracji. Set jest odczytywany z reszty
 * ID ilustracji po liczbie (`1LTR` → set `LTR`, `5_2XM` → set `2XM`);
 * warianty (KRA/FOT/KON) i sufiksy pliku nie są setami.
 */
export function artIdsBySetFromRows(rows) {
  if (!rows.length) return new Map();
  const headers = rows[0].map((h) => h.toLowerCase());
  const artColumn = headers.findIndex((h) => h.includes('ilustracja'));
  const nameColumn = headers.findIndex((h) => h.includes('nazwa'));
  if (artColumn === -1 || nameColumn === -1) {
    throw new Error('CSV nie ma kolumn „Ilustracja" i „Nazwa" — sprawdź, czy to arkusz kolekcji');
  }
  const map = new Map();
  for (const row of rows.slice(1)) {
    const name = (row[nameColumn] || '').trim();
    const art = (row[artColumn] || '').trim();
    // Format kolumny „Ilustracja" bywa różny: „412FOT.png", „77.png",
    // „9KRA.png" albo „1LTR" / „5_2XM" (liczba + kod setu). Zawsze liczy
    // się liczba z początku, po odcięciu sufiksu pliku i wariantu.
    const cleaned = art.replace(/\.png$/i, '').replace(/(FOT|KON|KRA)$/i, '');
    const num = cleaned.match(/^\d+/);
    if (!name || !num) continue;
    const key = name.toLowerCase();
    // Kod setu: reszta po liczbie; wiodący podkreślnik to ucieczka arkusza
    // dla setów zaczynających się cyfrą („_2XM" → „2XM").
    const set = cleaned.slice(num[0].length).toUpperCase().replace(/^_+/, '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ artId: Number.parseInt(num[0], 10), set });
  }
  return map;
}

/**
 * Mapa „nazwa karty (lowercase) → artId" — wygoda: pierwsze wystąpienie nazwy
 * (warianty KRA/FOT/KON i różne sety mają różne numery, ale dla dopasowania
 * bez setu liczy się pierwszy wpis). Dopasowanie ze świadomością setu robi
 * `pickArtId` na wyniku `artIdsBySetFromRows`.
 */
export function artIdsFromRows(rows) {
  const map = new Map();
  for (const [key, entries] of artIdsBySetFromRows(rows)) {
    map.set(key, entries[0].artId);
  }
  return map;
}

/**
 * Wybór artId dla karty: preferuje wpis, którego set zgadza się z setem karty
 * (np. Negate M20 → 461, a nie M15 → 76); bez zgodnego setu — pierwszy wpis.
 */
export function pickArtId(entries, cardSet) {
  if (!entries?.length) return undefined;
  const set = String(cardSet || '').toUpperCase();
  const exact = entries.find((e) => e.set && e.set === set);
  return exact ? exact.artId : entries[0].artId;
}

/** Dokleja wpisy z `src` do `dst` (Map nazwa → tablica {artId, set}). */
function mergeEntries(dst, src) {
  for (const [key, entries] of src) {
    if (!dst.has(key)) dst.set(key, []);
    for (const e of entries) dst.get(key).push(e);
  }
}

/**
 * Wstawia/aktualizuje `artId` w definicji karty o danym `id`.
 * Operacja jest idempotentna: ponowne uruchomienie nic nie zmienia.
 */
export function withArtId(source, cardId, artId) {
  const defRe = new RegExp(`(id:\\s*'${cardId}'[\\s\\S]*?)(\\n\\s*support:)`);
  const match = source.match(defRe);
  if (!match) return { source, changed: false, reason: 'nie znaleziono definicji' };
  const body = match[1];
  if (new RegExp(`artId:\\s*${String(artId)}\\b`).test(body)) return { source, changed: false, reason: 'bez zmian' };
  const indent = (match[2].match(/\n(\s*)support:/) || [, '    '])[1];
  const updated = body.includes('artId:')
    ? body.replace(/artId:\s*\S+/, `artId: ${artId},`)
    : `${body}\n${indent}artId: ${artId},`;
  return { source: source.replace(defRe, `${updated}${match[2]}`), changed: true, reason: 'zapisano' };
}

/**
 * Lokalny słownik kart kolekcji wersjonowany w repo — domyślne źródło
 * (kolejność: `--csv` > env > `csvUrl` z configu > ten słownik; słownik
 * bywa też fallbackiem przy błędzie sieci). Odświeżanie wg
 * docs/setup/ILUSTRACJE_KART.md.
 */
function bundledCsvSource() {
  try {
    return fs.readFileSync(BUNDLED_CSV_PATH, 'utf8');
  } catch {
    throw new Error([
      'Brak lokalnego słownika tools/collection-art-ids.csv.',
      'Odzyskaj go (eksport arkusza: …pub?gid=0&single=true&output=csv&range=A:B)',
      'albo podaj źródło jawnie: --csv plik / MTG_COLLECTION_CSV_URL.',
    ].join('\n'));
  }
}

async function readCsv(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Arkusz nie odpowiedział poprawnie (HTTP ${response.status})`);
  return response.text();
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const fileIndex = argv.indexOf('--csv');
  const file = fileIndex !== -1 ? argv[fileIndex + 1] : null;
  const url = process.env.MTG_COLLECTION_CSV_URL || loadCollectionConfigUrl();

  const registry = createCardRegistry();
  const cards = registry.all();
  let source = fs.readFileSync(CARD_DATA_PATH, 'utf8');

  const byName = new Map(); // nazwa (lowercase) → [{artId, set}]
  const sourceNotes = [];

  if (file) {
    // Jawny `--csv` — wyłącznie ten plik, bez słownika i sieci.
    mergeEntries(byName, artIdsBySetFromRows(parseCSV(fs.readFileSync(file, 'utf8'))));
    sourceNotes.push(`plik ${file}`);
  } else {
    // 1) Lokalny słownik z repo — domyślne źródło (działa offline).
    mergeEntries(byName, artIdsBySetFromRows(parseCSV(bundledCsvSource())));
    sourceNotes.push('słownik tools/collection-art-ids.csv');

    // 2) Karty spoza słownika → świeży fetch z arkusza (jeśli możliwy).
    const missing = cards.filter((card) => !byName.has(card.name.toLowerCase()));
    if (missing.length) {
      if (url) {
        try {
          mergeEntries(byName, artIdsBySetFromRows(parseCSV(await readCsv(url))));
          const found = missing.filter((card) => byName.has(card.name.toLowerCase())).length;
          sourceNotes.push(`fetch z arkusza uzupełnił ${found} z ${missing.length} brakujących w słowniku`);
        } catch (error) {
          console.warn(`Uwaga: nie udało się pobrać CSV z arkusza (${error.message}).`);
          console.warn('Karty spoza słownika zostaną bez artId — tory FOT/KON spadną na Scryfall.');
        }
      } else {
        console.warn('Uwaga: brak źródła sieciowego (MTG_COLLECTION_CSV_URL / csvUrl) —');
        console.warn('karty spoza słownika zostaną bez artId (tory FOT/KON spadną na Scryfall).');
      }
    }
  }

  // 3) Dopasowanie: set karty rozstrzyga duplikaty nazw, inaczej pierwszy wpis.
  const matched = [];
  const missing = [];
  for (const card of cards) {
    const entries = byName.get(card.name.toLowerCase());
    const artId = entries ? pickArtId(entries, card.set) : undefined;
    if (artId == null) { missing.push(card.name); continue; }
    const result = withArtId(source, card.id, artId);
    source = result.source;
    matched.push({ name: card.name, artId, status: result.reason });
  }

  console.log(`Źródła ID: ${sourceNotes.join(' → ')}`);
  console.log(`Unikalnych nazw w źródłach: ${byName.size}`);
  console.log(`Dopasowane karty (${matched.length}):`);
  for (const row of matched) console.log(`  ${row.name} → artId ${row.artId} (${row.status})`);
  if (missing.length) {
    console.log(`Bez artId — tory FOT/KON spadną na Scryfall (${missing.length}): ${missing.join(', ')}`);
  }

  if (dryRun) { console.log('\n--dry-run: nic nie zapisano.'); return; }
  if (matched.some((row) => row.status === 'zapisano')) {
    fs.writeFileSync(CARD_DATA_PATH, source);
    console.log(`\nZaktualizowano ${CARD_DATA_PATH}. Uruchom: npm test && npm run build`);
  } else {
    console.log('\nBrak zmian do zapisania.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
