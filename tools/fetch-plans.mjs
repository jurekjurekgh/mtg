/**
 * Uzupełnianie `plan` (setting/plane MtG) w definicjach kart z arkusza kolekcji.
 *
 * Kolumna „Plan / Setting" arkusza kolekcji to setting/plane karty (np.
 * Śródziemie, Zendikar, Dominaria) — filtr Plan w kreatorze talii grupuje po
 * niej karty. W przeciwieństwie do `artId` (które jest prefiksem nazwy pliku
 * w kolumnie „Ilustracja"), plan NIE jest nigdzie w repo — trzeba go pobrać
 * z pełnego arkusza (który ma kolumnę „Plan / Setting").
 *
 * To narzędzie:
 *   1. pobiera pełny CSV kolekcji (--csv plik / MTG_COLLECTION_CSV_URL /
 *      csvUrl z tools/collection.config.json);
 *   2. wyciąga mapę nazwa → plan (kolumna „Plan / Setting");
 *   3. dopisuje kolumnę Plan do lokalnego słownika tools/collection-art-ids.csv
 *      (idempotentnie — „dopisac do pliku z img id");
 *   4. wstawia `plan: '<wartość>'` do definicji kart w src/cards/card-data.js
 *      dopasowanych po nazwie (idempotentnie).
 *
 * Uruchomienie (wymaga sieci do arkusza — sandbox ją blokuje jak Scryfall):
 *   node tools/fetch-plans.mjs                 # z MTG_COLLECTION_CSV_URL / configu
 *   node tools/fetch-plans.mjs --csv eksport.csv
 *   node tools/fetch-plans.mjs --dry-run       # raport bez zapisu
 *
 * Wynik to zwykły commit w repo; engine/replay pozostają deterministyczne.
 * Adres arkusza NIE trafia do repo/artefaktu (jak w fetch-art-ids.mjs).
 */

import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseCSV } from './fetch-art-ids.mjs';

const CARD_DATA_PATH = 'src/cards/card-data.js';
const CONFIG_PATH = new URL('./collection.config.json', import.meta.url);
const BUNDLED_CSV_PATH = new URL('./collection-art-ids.csv', import.meta.url);

function loadCollectionConfigUrl() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const url = cfg?.csvUrl;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Mapa „nazwa karty (lowercase) → plan/setting" z wierszy pełnego arkusza.
 * Szuka kolumny „Plan / Setting" (header zawiera „plan") i „Nazwa".
 */
export function plansFromRows(rows) {
  if (!rows.length) return new Map();
  const headers = rows[0].map((h) => h.toLowerCase());
  const planColumn = headers.findIndex((h) => h.includes('plan'));
  const nameColumn = headers.findIndex((h) => h.includes('nazwa'));
  if (planColumn === -1 || nameColumn === -1) {
    throw new Error('CSV nie ma kolumn „Nazwa" i „Plan / Setting" — sprawdź pełny eksport arkusza');
  }
  const map = new Map();
  for (const row of rows.slice(1)) {
    const name = (row[nameColumn] || '').trim();
    const plan = (row[planColumn] || '').trim();
    if (!name || !plan) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, plan); // pierwsze wystąpienie nazwy
  }
  return map;
}

/**
 * Wstawia/aktualizuje `plan` w definicji karty o danym `id`. Idempotentne.
 */
export function withPlan(source, cardId, plan) {
  const defRe = new RegExp(`(id:\\s*'${cardId}'[\\s\\S]*?)(\\n\\s*support:)`);
  const match = source.match(defRe);
  if (!match) return { source, changed: false, reason: 'nie znaleziono definicji' };
  const body = match[1];
  const escaped = String(plan).replace(/'/g, "\\'");
  if (/(plan:\s*')/.test(body)) {
    const updated = body.replace(/plan:\s*'[^']*'/, `plan: '${escaped}'`);
    return { source: source.replace(defRe, `${updated}${match[2]}`), changed: true, reason: 'zaktualizowano' };
  }
  const indent = (match[2].match(/\n(\s*)support:/) || [, '    '])[1];
  const updated = `${body}\n${indent}plan: '${escaped}',`;
  return { source: source.replace(defRe, `${updated}${match[2]}`), changed: true, reason: 'zapisano' };
}

/**
 * Przepisuje lokalny słownik tools/collection-art-ids.csv, dodając kolumnę Plan
 * (3. kolumna) dopasowaną po nazwie. Zachowuje istniejące wiersze; brak planu
 * dla nazwy → pusta komórka.
 */
export function collectionCsvWithPlan(existingText, plansByName) {
  const rows = parseCSV(existingText);
  if (!rows.length) return existingText;
  const header = rows[0];
  const nameCol = header.findIndex((h) => h.toLowerCase().includes('nazwa'));
  const out = ['Ilustracja,Nazwa Karty,Plan'];
  const csvField = (value) => {
    const v = String(value ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  for (const row of rows.slice(1)) {
    const illus = csvField(row[0] ?? '');
    const name = row[nameCol >= 0 ? nameCol : 1] ?? row[1] ?? '';
    const plan = plansByName.get(String(name).trim().toLowerCase()) ?? '';
    out.push(`${illus},${csvField(name)},${csvField(plan)}`);
  }
  return `${out.join('\n')}\n`;
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

  let csvText;
  if (file) {
    csvText = fs.readFileSync(file, 'utf8');
  } else if (url) {
    csvText = await readCsv(url);
  } else {
    throw new Error('Brak źródła arkusza: podaj --csv plik albo ustaw MTG_COLLECTION_CSV_URL / csvUrl w tools/collection.config.json');
  }

  const plans = plansFromRows(parseCSV(csvText));
  const registry = createCardRegistry();
  const cards = registry.all();

  let source = fs.readFileSync(CARD_DATA_PATH, 'utf8');
  const matched = [];
  const missing = [];
  for (const card of cards) {
    const plan = plans.get(card.name.toLowerCase());
    if (plan == null) { missing.push(card.name); continue; }
    const result = withPlan(source, card.id, plan);
    source = result.source;
    matched.push({ name: card.name, plan, status: result.reason });
  }

  console.log(`Unikalnych nazw z planem w arkuszu: ${plans.size}`);
  console.log(`Dopasowane karty (${matched.length}):`);
  for (const row of matched) console.log(`  ${row.name} → plan "${row.plan}" (${row.status})`);
  if (missing.length) console.log(`Bez planu w arkuszu (${missing.length}): ${missing.join(', ')}`);

  if (dryRun) { console.log('\n--dry-run: nic nie zapisano.'); return; }

  const changedCards = matched.some((row) => row.status === 'zapisano' || row.status === 'zaktualizowano');
  if (changedCards) {
    fs.writeFileSync(CARD_DATA_PATH, source);
    console.log(`\nZaktualizowano ${CARD_DATA_PATH}.`);
  }
  // Dopisz kolumnę Plan do lokalnego słownika (zawsze, by trzymać ją w repo).
  const bundled = fs.readFileSync(BUNDLED_CSV_PATH, 'utf8');
  const updatedCsv = collectionCsvWithPlan(bundled, plans);
  if (updatedCsv !== bundled) {
    fs.writeFileSync(BUNDLED_CSV_PATH, updatedCsv);
    console.log(`Zaktualizowano ${BUNDLED_CSV_PATH.href.replace(/^file:\/\//, '')} (kolumna Plan).`);
  }
  console.log('\nGotowe. Uruchom: npm test && npm run build');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
