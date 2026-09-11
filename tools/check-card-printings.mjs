// Przegląd druków kart: arkusz kolekcji ↔ katalog ↔ snapshot ↔ UUID obrazu.
//
// Odpowiada na pytanie właściciela „czy karta w aplikacji to ten sam druk, który
// mam w kolekcji” bez wychodzenia do sieci: porównuje cztery źródła prawdy
//   1. tools/collection-art-ids.csv — kolumna `Ilustracja`; set to jej OSTATNIE
//      znaki (`3ALA`, `19_8ED`), artId to liczba przed nimi,
//   2. `set` i `artId` w src/cards/card-data.js,
//   3. `set`/`print`/`source` w docs/cards/scryfall-<id>.json,
//   4. UUID obrazu: `image_uris.large` snapshotu vs `imageUri` katalogu.
//
// Rozjazd bez pola `uwaga` w snapshocie = błąd (kod wyjścia 1). `uwaga` to
// świadome, opisane odstępstwo (np. skrót płaszczyzny w arkuszu).
// Karty, których druk nie da się ustalić offline (brak snapshotu, snapshot bez
// `image_uris`, snapshot składany ręcznie bez `source`), trafiają na listę
// „DO POBRANIA” — krok 2 wymaga sieci: `https://api.scryfall.com/cards/<uuid>`
// (UUID obrazu z katalogu) i odczytanie `set`/`set_name`/`collector_number`.
//
// Użycie: node tools/check-card-printings.mjs [--json]
//   --json  dodatkowo wypisuje listę „DO POBRANIA” jako JSON na stdout.
//
// Historia: pełny przegląd z 2026-09-12 (509 kart, 9 poprawionych druków) —
// docs/cards/WERYFIKACJA_DRUKOW_2026-09-12.md. Zapadnia pilnująca, żeby listy
// snapshotów bez `set=`/bez `source` nie rosły: test/zgloszenie-a-druk-karty-z-arkusza.test.js.
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { artIdsBySetFromRows, parseCSV } from './fetch-art-ids.mjs';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
// Pola, które Scryfall oddaje w pełnej odpowiedzi — ich obecność dowodzi, że
// snapshot to zapis pobrania (a nie ręcznie sklejony skrót).
const RAW_FIELDS = ['legalities', 'prices', 'card_back_id', 'games', 'scryfall_uri',
  'edhrec_rank', 'related_uris', 'object', 'oracle_id', 'purchase_uris', 'artist_ids'];

const KORZEN = new URL('..', import.meta.url);            // repo, niezależnie od CWD
const REGISTRY = createCardRegistry();
const ARKUSZ = artIdsBySetFromRows(
  parseCSV(fs.readFileSync(new URL('tools/collection-art-ids.csv', KORZEN), 'utf8')));
const JAKO_JSON = process.argv.includes('--json');

const snapshotOf = (id) => {
  const sciezka = new URL(`docs/cards/scryfall-${id}.json`, KORZEN);
  return fs.existsSync(sciezka) ? JSON.parse(fs.readFileSync(sciezka, 'utf8')) : null;
};
const uuidOf = (s) => String(s ?? '').match(UUID)?.[0] ?? null;
const sourceUuid = (s) => String(s ?? '').match(/^https:\/\/api\.scryfall\.com\/cards\/([0-9a-f-]{36})/)?.[1] ?? null;
const sourceSet = (s) => String(s ?? '').match(/[?&]set=([A-Za-z0-9]+)/)?.[1]?.toLowerCase() ?? null;
const wpisArkusza = (def) => {
  const wpisy = ARKUSZ.get(String(def.name ?? '').toLowerCase()) ?? [];
  return wpisy.find((e) => e.artId === def.artId) ?? (wpisy.length === 1 ? wpisy[0] : null);
};

const grupy = new Map();
const dodaj = (grupa, wpis) => {
  if (!grupy.has(grupa)) grupy.set(grupa, []);
  grupy.get(grupa).push(wpis);
};
const doSieci = [];
const rozjazdy = [];
let obrazPotwierdzony = 0;
let pozaArkuszem = 0;

for (const def of REGISTRY.all()) {
  const wpis = wpisArkusza(def);
  const rekord = {
    id: def.id, name: def.name, setKatalog: def.set ?? null, setArkusz: wpis?.set ?? null,
    imageUri: def.imageUri ?? null, artId: def.artId ?? null,
  };
  if (def.artId == null) pozaArkuszem += 1;

  // A/4 — katalog vs arkusz (autorytet druku właściciela)
  if (wpis?.set && wpis.set !== String(def.set ?? '').toUpperCase()) {
    rozjazdy.push(`${def.id}: arkusz ${wpis.artId}${wpis.set} vs katalog ${def.set}`);
  }

  const snap = snapshotOf(def.id);
  if (!snap) {
    dodaj('brak-snapshotu', rekord);
    if (def.artId != null) doSieci.push({ powod: 'brak snapshotu (brak prowiniencji druku)', ...rekord });
    continue;
  }
  const src = snap.source ?? '';
  const raw = RAW_FIELDS.filter((f) => f in snap).length >= 3;
  const snapSet = (snap.set ?? '').toLowerCase();
  const setParam = sourceSet(src);
  const srcUuid = sourceUuid(src);
  const snapImgUuid = uuidOf(snap.image_uris?.large);
  const katImgUuid = uuidOf(def.imageUri);
  rekord.setSnapshot = snap.set ?? null;
  const udokumentowane = Boolean(snap.uwaga);

  if (snapSet && snapSet !== String(def.set ?? '').toLowerCase()) {
    rozjazdy.push(`${def.id}: snapshot set=${snap.set} vs katalog set=${def.set}`);
  }
  if (snapImgUuid && katImgUuid && snapImgUuid !== katImgUuid) {
    rozjazdy.push(`${def.id}: inny druk obrazu (snapshot ${snapImgUuid}, katalog ${katImgUuid})`);
  }
  if (snapImgUuid && katImgUuid && snapImgUuid === katImgUuid) obrazPotwierdzony += 1;

  // Klasy prowiniencji: A/B/E = druk ustalony offline; C/F i brak `source` = do sieci
  if (setParam) { dodaj('A-source-set-aware', rekord); continue; }
  if (srcUuid) {
    if (srcUuid === snapImgUuid) dodaj('B-source-uuid-spójny', rekord);
    else {
      dodaj('B-source-uuid-ROZJAZD', rekord);
      doSieci.push({ powod: 'source wskazuje inną kartę niż obraz', ...rekord });
    }
    continue;
  }
  if (!src) {
    if (raw) dodaj('C-bez-source-surowa-odpowiedz', rekord);
    else {
      dodaj('D-bez-source-reczny', rekord);
      doSieci.push({ powod: 'snapshot bez `source`, składany ręcznie (klasa Curiosity)', ...rekord });
    }
    continue;
  }
  if (/oracleid|%3A/i.test(src)) { dodaj('E-source-wyszukiwanie', rekord); continue; }
  dodaj('F-source-bez-set', rekord);
}

console.log(`Kart w rejestrze: ${REGISTRY.all().length}`);
console.log(`  w arkuszu kolekcji (artId): ${REGISTRY.all().length - pozaArkuszem}, poza arkuszem (tokeny/ziemie): ${pozaArkuszem}`);
console.log(`  UUID obrazu potwierdzony offline (snapshot = katalog): ${obrazPotwierdzony}`);
console.log('\nKLASY prowiniencji snapshotów:');
for (const [k, v] of [...grupy.entries()].sort()) console.log(`  ${k}: ${v.length}`);

console.log(`\nDO POBRANIA ZE SCRYFALL (krok 2, wymaga sieci): ${doSieci.length}`);
for (const x of doSieci) {
  console.log(`  ${x.id} | „${x.name}” | katalog=${x.setKatalog} arkusz=${x.setArkusz ?? '—'} snapshot=${x.setSnapshot ?? '—'} | ${x.powod}`);
}

const nieuwaga = rozjazdy.filter((r) => !snapshotOf(r.split(':')[0])?.uwaga);
console.log(`\nROZJAZDY: ${rozjazdy.length} (udokumentowane polem \`uwaga\`: ${rozjazdy.length - nieuwaga.length})`);
for (const r of rozjazdy) console.log(`  ${r}${snapshotOf(r.split(':')[0])?.uwaga ? '  [uwaga]' : ''}`);

if (JAKO_JSON) console.log(JSON.stringify({ doSieci, rozjazdy }, null, 2));
if (nieuwaga.length > 0) {
  console.error(`\nBŁĄD: ${nieuwaga.length} rozjazd(ów) bez udokumentowania — patrz docs/cards/WERYFIKACJA_DRUKOW_2026-09-12.md`);
  process.exitCode = 1;
}
