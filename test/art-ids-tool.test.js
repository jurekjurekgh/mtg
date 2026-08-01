import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { artIdsFromRows, parseCSV, withArtId } from '../tools/fetch-art-ids.mjs';

/**
 * Narzędzie uzupełniające `artId` (numer ilustracji z arkusza kolekcji).
 * Testujemy czyste funkcje — bez sieci i bez adresu arkusza, którego
 * w repozytorium nie ma i nie może być (SECURITY.md §Sekrety).
 */

const CSV = [
  'Ilustracja,Nazwa,Set,Plan',
  '412FOT.png,Highland Game,KTK,Tarkir',
  '"77.png","Zoraline, Cosmos Caller",BLB,Bloomburrow',
  'brak-numeru.png,Karta bez numeru,X,Y',
  '9KRA.png,Segmented Krotiq,DTK,Tarkir',
].join('\r\n');

test('parser CSV radzi sobie z cudzysłowami i CRLF (jak w legacy)', () => {
  const rows = parseCSV(CSV);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], ['Ilustracja', 'Nazwa', 'Set', 'Plan']);
  assert.equal(rows[2][1], 'Zoraline, Cosmos Caller', 'przecinek w cudzysłowie nie dzieli pola');
});

test('artId czytany jest z prefiksu nazwy pliku ilustracji', () => {
  const ids = artIdsFromRows(parseCSV(CSV));
  assert.equal(ids.get('highland game'), 412);
  assert.equal(ids.get('zoraline, cosmos caller'), 77);
  assert.equal(ids.get('segmented krotiq'), 9, 'wariant KRA ma ten sam numer bazowy');
  assert.equal(ids.has('karta bez numeru'), false, 'wiersz bez numeru jest pomijany');
});

test('brak wymaganych kolumn to czytelny błąd, nie cicha pustka', () => {
  assert.throws(() => artIdsFromRows(parseCSV('A,B\n1,2')), /Ilustracja/);
});

test('wstawianie artId do definicji jest punktowe i idempotentne', () => {
  const source = fs.readFileSync('src/cards/card-data.js', 'utf8');
  const first = withArtId(source, 'highland-game', 412);
  assert.ok(first.changed);
  assert.match(first.source, /id: 'highland-game'[\s\S]*?artId: 412,[\s\S]*?support:/);
  // Inne karty pozostają nietknięte.
  assert.equal((first.source.match(/artId:/g) || []).length, 1);

  const second = withArtId(first.source, 'highland-game', 412);
  assert.equal(second.changed, false, 'ponowne uruchomienie nie duplikuje pola');
  assert.equal(second.source, first.source);

  const updated = withArtId(first.source, 'highland-game', 999);
  assert.ok(updated.changed);
  assert.match(updated.source, /artId: 999/);

  const unknown = withArtId(source, 'nie-ma-takiej-karty', 1);
  assert.equal(unknown.changed, false);
});

test('narzędzie nie zawiera adresu arkusza ani innych sekretów', () => {
  const tool = fs.readFileSync('tools/fetch-art-ids.mjs', 'utf8');
  assert.equal(/docs\.google\.com/.test(tool), false, 'adres arkusza nie może trafić do repozytorium');
  assert.match(tool, /MTG_COLLECTION_CSV_URL/);
});
