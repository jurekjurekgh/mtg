import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { artIdsBySetFromRows, artIdsFromRows, parseCSV, pickArtId, withArtId } from '../tools/fetch-art-ids.mjs';
import { createCardRegistry } from '../src/cards/card-data.js';

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
  // Inne karty pozostają nietknięte — każda realna karta ma teraz własne artId.
  assert.equal((first.source.match(/artId:/g) || []).length, (source.match(/artId:/g) || []).length);
  assert.match(first.source, /id: 'kappa-tech-wrecker'[\s\S]*?artId: 278,/);

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

test('lokalny słownik zawiera wszystkie karty z ID setu, bez ucieczek i z dubletami setów', () => {
  const rows = parseCSV(fs.readFileSync('tools/collection-art-ids.csv', 'utf8'));
  const data = rows.slice(1);
  assert.equal(data.length, 566, 'pełna lista kolekcji (566 kart — Batch 48 dopisał 14)');
  for (const [art, name] of data) {
    assert.match(art, /^\d+[A-Za-z0-9_]*$/, `ID ilustracji bez znaków specjalnych: ${art}`);
    assert.ok(name.trim(), `nazwa nie może być pusta (ID ${art})`);
  }
  // Duplikaty nazw z różnych setów zostają w słowniku (każdy druk ma numer).
  const byName = artIdsBySetFromRows(rows);
  const curate = byName.get('curate');
  assert.deepEqual(curate.map((e) => [e.artId, e.set]), [[65, 'STX'], [302, 'BRO']]);
  const negate = byName.get('negate');
  assert.deepEqual(negate.map((e) => [e.artId, e.set]), [[76, 'M15'], [461, 'M20']]);
});

test('dopasowanie rozstrzyga duplikaty po secie karty, inaczej pierwszym wpisem', () => {
  const byName = artIdsBySetFromRows(parseCSV('Ilustracja,Nazwa\n76M15,Negate\n461M20,Negate\n'));
  const entries = byName.get('negate');
  assert.equal(pickArtId(entries, 'M15'), 76);
  assert.equal(pickArtId(entries, 'M20'), 461);
  assert.equal(pickArtId(entries, 'XYZ'), 76, 'nieznany set → pierwszy wpis');
  assert.equal(pickArtId(entries, 'm20'), 461, 'set bez rozróżniania wielkości');
  assert.equal(pickArtId([], 'M20'), undefined);
  assert.equal(pickArtId(undefined, 'M20'), undefined);
  // Set z ucieczką podkreślnika: „_2XM" w arkuszu = kod „2XM".
  const u = artIdsBySetFromRows(parseCSV('Ilustracja,Nazwa\n5_2XM,Test Card\n'));
  assert.deepEqual(u.get('test card'), [{ artId: 5, set: '2XM' }]);
});

test('lokalny słownik (tools/collection-art-ids.csv) pokrywa karty z artId', () => {
  const dict = artIdsFromRows(parseCSV(fs.readFileSync('tools/collection-art-ids.csv', 'utf8')));
  // Pełna lista kolekcji z arkusza (566 kart; duplikaty nazw to różne druki —
  // to różne druki, np. Curate 65STX/302BRO — pierwsze wystąpienie wygrywa).
  assert.ok(dict.size >= 500, 'słownik zawiera pełną listę kolekcji');

  // Każda karta z artId w katalogu ma zgodny wpis w słowniku — gdy nowy batch
  // doda kartę bez odświeżenia słownika, ten test od razu to wskaże.
  const registry = createCardRegistry();
  const withArt = registry.all().filter((card) => card.artId != null);
  assert.equal(withArt.length, 384, 'dokładnie 384 wpisy mają artId (Batche 1–47 + Batch 48 transza A)');
  const byName = artIdsBySetFromRows(parseCSV(fs.readFileSync('tools/collection-art-ids.csv', 'utf8')));
  for (const card of withArt) {
    const entries = byName.get(card.name.toLowerCase()) ?? [];
    // Nazwy występujące w słowniku RAZ: pierwszy wpis musi się zgadzać.
    // Duplikaty (np. Curate 65STX/302BRO) rozstrzyga wyłącznie set-aware
    // pickArtId (ILUSTRACJE_KART.md) — pierwszy wpis należy do innego druku.
    if (entries.length === 1) {
      assert.equal(dict.get(card.name.toLowerCase()), card.artId, `słownik (pierwszy wpis) dla: ${card.name}`);
    }
    // Ścieżka set-aware daje ten sam numer dla realnych kart.
    assert.equal(pickArtId(entries, card.set), card.artId, `słownik (set ${card.set}) dla: ${card.name}`);
  }
});

test('realne karty supported mają plan (setting/plane) z kolekcji', () => {
  const registry = createCardRegistry();
  // Plany wpisane z kolumny „Plan / Setting" arkusza kolekcji przez
  // tools/fetch-plans.mjs (dopasowanie set-aware).
  assert.equal(registry.get('highland-game').plan, 'Tarkir', 'Highland Game → Tarkir');
  // Curate występuje w dwóch setach (STX Arcavios, BRO Forgotten Realms);
  // karta z setu BRO musi dostać plan Forgotten Realms (set-aware).
  assert.equal(registry.get('curate').plan, 'Forgotten Realms', 'Curate BRO → Forgotten Realms');
  assert.equal(registry.get('howl-of-the-night-pack').plan, 'Wiedźmin');
  const withPlan = registry.supported().filter((c) => c.plan);
  assert.ok(withPlan.length >= 74, `za mało kart z planem: ${withPlan.length}`);
});
