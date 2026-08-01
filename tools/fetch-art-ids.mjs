/**
 * Uzupełnianie `artId` w definicjach kart z arkusza kolekcji właściciela.
 *
 * Po co: lokalne tory podglądu (FOT/KON) adresują pliki `./img/<ID>FOT.png`
 * i `./img/<ID>KON.png`, a ID nie jest osobną kolumną arkusza — jest prefiksem
 * nazwy pliku w kolumnie „Ilustracja" (audyt legacy §3.2). Zamiast wpisywać
 * numery ręcznie, to narzędzie pobiera opublikowany CSV, dopasowuje wiersze do
 * kart z rejestru po nazwie i **samo dopisuje `artId`** do `src/cards/card-data.js`.
 *
 * Bezpieczeństwo (SECURITY.md §Sekrety): adres arkusza NIE jest i nie może być
 * w repozytorium. Narzędzie czyta go ze zmiennej środowiskowej
 * `MTG_COLLECTION_CSV_URL` (lokalnie) albo z sekretu w GitHub Actions.
 * Do repozytorium trafia wyłącznie wynik — numery ilustracji.
 *
 * Uruchomienie:
 *   MTG_COLLECTION_CSV_URL='https://…/pub?output=csv' node tools/fetch-art-ids.mjs
 *   … --dry-run     tylko raport dopasowań, bez zapisu
 *   … --csv plik    źródło z dysku zamiast sieci (np. ręcznie pobrany eksport)
 *
 * Determinizm: narzędzie jest offline-owe wobec gry (nie działa w runtime stołu),
 * a jego wynik to zwykły commit w repozytorium — engine i replay pozostają
 * deterministyczne (ADR 0005).
 */

import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';

const CARD_DATA_PATH = 'src/cards/card-data.js';

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
 * Mapa „nazwa karty (lowercase) → artId" z wierszy arkusza.
 * ID jest prefiksem nazwy pliku ilustracji; warianty (KRA/FOT/KON) mają ten
 * sam numer bazowy, więc bierzemy pierwsze wystąpienie nazwy.
 */
export function artIdsFromRows(rows) {
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
    const match = art.match(/^\d+/);
    if (!name || !match) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, Number.parseInt(match[0], 10));
  }
  return map;
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
  if (new RegExp(`artId:\\s*${artId}\\b`).test(body)) return { source, changed: false, reason: 'bez zmian' };
  const indent = (match[2].match(/\n(\s*)support:/) || [, '    '])[1];
  const updated = body.includes('artId:')
    ? body.replace(/artId:\s*\d+/, `artId: ${artId}`)
    : `${body}\n${indent}artId: ${artId},`;
  return { source: source.replace(defRe, `${updated}${match[2]}`), changed: true, reason: 'zapisano' };
}

async function readCsv({ file, url }) {
  if (file) return fs.readFileSync(file, 'utf8');
  if (!url) {
    throw new Error([
      'Brak źródła CSV.',
      'Podaj adres opublikowanego arkusza w zmiennej środowiskowej MTG_COLLECTION_CSV_URL',
      'albo plik: node tools/fetch-art-ids.mjs --csv eksport.csv',
      'Adresu NIE commitujemy (SECURITY.md §Sekrety i dane wrażliwe).',
    ].join('\n'));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Arkusz nie odpowiedział poprawnie (HTTP ${response.status})`);
  return response.text();
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const fileIndex = argv.indexOf('--csv');
  const file = fileIndex !== -1 ? argv[fileIndex + 1] : null;
  const csv = await readCsv({ file, url: process.env.MTG_COLLECTION_CSV_URL });

  const ids = artIdsFromRows(parseCSV(csv));
  const registry = createCardRegistry();
  let source = fs.readFileSync(CARD_DATA_PATH, 'utf8');

  const matched = [];
  const missing = [];
  for (const card of registry.all()) {
    const artId = ids.get(card.name.toLowerCase());
    if (artId == null) { missing.push(card.name); continue; }
    const result = withArtId(source, card.id, artId);
    source = result.source;
    matched.push({ name: card.name, artId, status: result.reason });
  }

  console.log(`Wierszy w arkuszu z ID: ${ids.size}`);
  console.log(`Dopasowane karty (${matched.length}):`);
  for (const row of matched) console.log(`  ${row.name} → artId ${row.artId} (${row.status})`);
  if (missing.length) console.log(`Bez odpowiednika w arkuszu (${missing.length}): ${missing.join(', ')}`);

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
