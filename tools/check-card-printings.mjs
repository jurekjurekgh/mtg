// Przegląd druków kart: arkusz kolekcji ↔ katalog ↔ snapshot ↔ UUID obrazu.
//
// Odpowiada na pytanie właściciela „czy karta w aplikacji to ten sam druk, który
// mam w kolekcji” bez wychodzenia do sieci: porównuje cztery źródła prawdy
//   1. tools/collection-art-ids.csv — kolumna `Ilustracja`; set to jej OSTATNIE
//      znaki (`3ALA`, `19_8ED`), artId to liczba przed nimi,
//   2. `set` i `artId` w src/cards/card-data.js,
//   3. `set`/`print`/`source` w docs/cards/scryfall-<id>.json,
//   4. UUID obrazu: `image_uris.large` snapshotu vs `imageUri` katalogu.
//      Karty dwustronne (transform/dfc) NIE mają `image_uris` na wierzchu —
//      Scryfall trzyma obrazy przy każdej twarzy, więc czytamy
//      `card_faces[0].image_uris.large` (twarz przednia = druk fizycznej karty).
//
// Rozjazd bez pola `uwaga` w snapshocie = błąd (kod wyjścia 1). `uwaga` to
// świadome, opisane odstępstwo (np. skrót płaszczyzny w arkuszu).
// Karty, których druku nie da się ustalić offline (brak snapshotu, snapshot bez
// obrazu, snapshot składany ręcznie bez `source`), trafiają na listę
// „DO POBRANIA” — krok 2 wymaga sieci: `https://api.scryfall.com/cards/<uuid>`
// (UUID obrazu z katalogu) i odczytanie `set`/`set_name`/`collector_number`.
//
// Druga strona karty dwustronnej NIE potrzebuje własnego snapshotu: Scryfall
// opisuje transform jako JEDEN obiekt karty (`layout: transform`, jedno `id`,
// obie twarze w `card_faces`), a arkusz kolekcji daje obu twarzom ten sam
// `artId`+set. Taka karta trafia do klasy `B2-druga-strona-pokryta-snapshotem`
// tylko wtedy, gdy snapshot „brata” (ten sam UUID obrazu) naprawdę zawiera jej
// nazwę wśród `card_faces` — samo współdzielenie UUID nie wystarcza (token
// `token_rat` dzieli UUID z `lab-rats`, a twarzą tej karty nie jest).
//
// OBIEKTY WSPARCIA (loch Undercity, znacznik Day // Night) są eksportami
// `src/cards/card-data.js`, ale NIE kartami rejestru: nie ma ich w arkuszu
// kolekcji, więc ADR 0029 zakazuje dopisywać ich do katalogu, a gra i tak ich
// używa (panel specjalny po „Take the initiative", znacznik dnia/nocy). Ich
// snapshoty nie są sierotami — są sprawdzane osobno (`przegladObiektowWsparcia`),
// a lista obiektów jest WYPROWADZONA z modułu gry, nie wpisana na sztywno.
//
// Użycie: node tools/check-card-printings.mjs [--json]
//   --json  dodatkowo wypisuje listę „DO POBRANIA” jako JSON na stdout.
//
// Historia: pełny przegląd z 2026-09-12 (509 kart, 9 poprawionych druków) —
// docs/cards/WERYFIKACJA_DRUKOW_2026-09-12.md; zamknięcie zapadni (56 snapshotów
// bez set-aware `source`) i zacieśnienie klasy E (21) —
// docs/audits/WERYFIKACJA_DRUKOW_KOLEKCJI_2026-09-12.md. Zapadnia pilnująca, żeby
// listy snapshotów bez `set=`/bez `source` nie rosły:
// test/zgloszenie-a-druk-karty-z-arkusza.test.js.
import fs from 'node:fs';
import { createCardRegistry, UNDERCITY_DUNGEON, DAY_NIGHT_TOKEN } from '../src/cards/card-data.js';
import { artIdsBySetFromRows, parseCSV } from './fetch-art-ids.mjs';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
// Pola, które Scryfall oddaje w pełnej odpowiedzi — ich obecność dowodzi, że
// snapshot to zapis pobrania (a nie ręcznie sklejony skrót).
export const RAW_FIELDS = ['legalities', 'prices', 'card_back_id', 'games', 'scryfall_uri',
  'edhrec_rank', 'related_uris', 'object', 'oracle_id', 'purchase_uris', 'artist_ids'];

export const uuidOf = (s) => String(s ?? '').match(UUID)?.[0] ?? null;
export const sourceUuid = (s) => String(s ?? '').match(/^https:\/\/api\.scryfall\.com\/cards\/([0-9a-f-]{36})/)?.[1] ?? null;
export const sourceSet = (s) => String(s ?? '').match(/[?&]set=([A-Za-z0-9]+)/)?.[1]?.toLowerCase() ?? null;

// UUID obrazu snapshotu: karty dwustronne trzymają obrazy przy twarzach, więc
// brak `image_uris` na wierzchu nie oznacza braku dowodu druku.
export const uuidObrazuSnapshotu = (snap) => uuidOf(snap?.image_uris?.large)
  ?? uuidOf(snap?.image_uris?.normal)
  ?? uuidOf(snap?.card_faces?.[0]?.image_uris?.large)
  ?? uuidOf(snap?.card_faces?.[0]?.image_uris?.normal)
  ?? null;

export const twarzeSnapshotu = (snap) => (Array.isArray(snap?.card_faces) ? snap.card_faces : [])
  .map((f) => String(f?.name ?? '').trim().toLowerCase())
  .filter(Boolean);

export const wpisArkusza = (def, arkusz) => {
  const wpisy = arkusz.get(String(def?.name ?? '').toLowerCase()) ?? [];
  return wpisy.find((e) => e.artId === def?.artId) ?? (wpisy.length === 1 ? wpisy[0] : null);
};

// Czy karta bez własnego snapshotu jest DRUGĄ TWARZĄ karty, której snapshot mamy?
// Warunki (wszystkie mierzalne offline): ten sam UUID obrazu w katalogu, snapshot
// „brata” istnieje i ma tę nazwę wśród `card_faces`.
export const pokrycieDrugiejStrony = (def, { registry, snapshotOf }) => {
  const uuid = uuidOf(def?.imageUri);
  if (!uuid) return { covered: false, powod: 'katalog bez UUID obrazu' };
  const nazwa = String(def?.name ?? '').trim().toLowerCase();
  if (!nazwa) return { covered: false, powod: 'brak nazwy w katalogu' };
  for (const brat of registry.all()) {
    if (brat.id === def.id) continue;
    if (uuidOf(brat.imageUri) !== uuid) continue;
    const snap = snapshotOf(brat.id);
    if (!snap) continue;
    if (twarzeSnapshotu(snap).includes(nazwa)) {
      return { covered: true, frontId: brat.id, layout: snap.layout ?? null, faceName: nazwa, uuid };
    }
  }
  return { covered: false, powod: 'UUID współdzielony, ale nazwa nie jest twarzą snapshotu' };
};

/**
 * Obiekty wsparcia: prymitywy gry obecne na stole, które NIE są kartami rejestru
 * (loch Undercity — `src/engine/effects.js` tworzy go dynamicznie jako `undercity`;
 * znacznik Day // Night — CR 708.9). Adresy obrazów mają w `card-data.js`, panel
 * bierze je stamtąd (`src/table/render.js`), a snapshot w `docs/cards/` jest
 * prowieniencją tych adresów i zapisem Oracle obu twarzy lochu.
 *
 * Lista jest WYPROWADZONA z modułu, którego używa gra — zero nazw wpisanych na
 * sztywno w narzędziu (dryf dwóch implementacji: F7/L41).
 */
export const obiektyWsparcia = () => Object.freeze(
  [UNDERCITY_DUNGEON, DAY_NIGHT_TOKEN].filter(Boolean).map((o) => Object.freeze({
    id: o.id,
    name: o.name,
    typeLine: o.typeLine ?? null,
    obrazy: Object.freeze([o.imageUri, o.imageUriDay, o.imageUriNight].filter(Boolean)),
  })),
);

/** Co dowodzi druku w adresie obrazu: para set/numer albo UUID. */
export const adresDruku = (uri) => {
  const para = String(uri ?? '').match(/\/cards\/([a-z0-9]+)\/([A-Za-z0-9\u2605]+)\?/i);
  if (para) return { rodzaj: 'set-numer', set: para[1].toLowerCase(), numer: String(para[2]) };
  const uuid = uuidOf(uri);
  return uuid ? { rodzaj: 'uuid', uuid } : { rodzaj: 'brak', uuid: null, set: null, numer: null };
};

/**
 * Przegląd obiektów wsparcia — czysta funkcja (jak `przegladDrukow`).
 * Snapshot obiektu wsparcia potwierdza druk OFFLINE, gdy adres obrazu z
 * `card-data.js` (ten sam, którego używa panel) zgadza się z `set`+
 * `collector_number` snapshotu albo z jego UUID obrazu, a `source` niesie ten sam
 * UUID co `image_uris`. Brak snapshotu nie jest błędem ani „rozjazdem": obiekt nie
 * ma wpisu w arkuszu kolekcji, więc nie ma druku właściciela do udowodnienia —
 * trafia na osobną listę (pobranie wymaga sieci).
 */
export const przegladObiektowWsparcia = ({ obiekty, snapshotOf }) => {
  const wpisy = [];
  for (const o of obiekty) {
    const snap = snapshotOf(o.id);
    if (!snap) {
      wpisy.push({ ...o, klasa: 'W-bez-snapshotu', powod: 'adres obrazu w card-data.js; snapshot wymaga pobrania z sieci' });
      continue;
    }
    const adresy = o.obrazy.map(adresDruku);
    const snapUuid = uuidObrazuSnapshotu(snap);
    const srcUuid = sourceUuid(snap.source ?? '');
    const snapSet = String(snap.set ?? '').toLowerCase();
    const snapNumer = snap.collector_number == null ? null : String(snap.collector_number);
    const zgodnySetNumer = adresy.some((a) => a.rodzaj === 'set-numer' && a.set === snapSet && a.numer === snapNumer);
    const zgodnyUuid = adresy.some((a) => a.rodzaj === 'uuid' && a.uuid === snapUuid);
    const sourceSpojny = Boolean(srcUuid && snapUuid && srcUuid === snapUuid);
    const twarze = twarzeSnapshotu(snap);
    if ((zgodnySetNumer || zgodnyUuid) && sourceSpojny) {
      wpisy.push({
        ...o, klasa: 'W-potwierdzony-offline',
        set: snap.set ?? null, numer: snapNumer, uuid: snapUuid, layout: snap.layout ?? null,
        twarze, dowod: zgodnySetNumer ? `set ${snap.set} nr ${snapNumer} = adres w card-data.js` : `UUID ${snapUuid} = adres w card-data.js`,
      });
      continue;
    }
    wpisy.push({
      ...o, klasa: 'W-snapshot-bez-zgodnosci',
      powod: [
        zgodnySetNumer || zgodnyUuid ? null : 'adres obrazu nie zgadza się z set/numer ani UUID snapshotu',
        sourceSpojny ? null : 'source nie niesie UUID obrazu snapshotu',
      ].filter(Boolean).join('; '),
      set: snap.set ?? null, numer: snapNumer, uuid: snapUuid, twarze,
    });
  }
  return { wpisy, potwierdzone: wpisy.filter((w) => w.klasa === 'W-potwierdzony-offline').length };
};

// Przegląd całej kolekcji — czysta funkcja (bez drukowania), żeby test mógł ją
// uruchomić na prawdziwych danych repozytorium.
export const przegladDrukow = ({ registry, arkusz, snapshotOf }) => {
  const grupy = new Map();
  const dodaj = (grupa, wpis) => {
    if (!grupy.has(grupa)) grupy.set(grupa, []);
    grupy.get(grupa).push(wpis);
  };
  const doSieci = [];
  const rozjazdy = [];
  let obrazPotwierdzony = 0;
  let pozaArkuszem = 0;

  for (const def of registry.all()) {
    const wpis = wpisArkusza(def, arkusz);
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
      const druga = def.artId != null ? pokrycieDrugiejStrony(def, { registry, snapshotOf }) : null;
      if (druga?.covered) {
        dodaj('B2-druga-strona-pokryta-snapshotem', { ...rekord, frontId: druga.frontId, layout: druga.layout });
        continue;
      }
      dodaj('brak-snapshotu', rekord);
      if (def.artId != null) {
        doSieci.push({ powod: druga ? `brak snapshotu (${druga.powod})` : 'brak snapshotu (brak prowieniencji druku)', ...rekord });
      }
      continue;
    }
    const src = snap.source ?? '';
    const raw = RAW_FIELDS.filter((f) => f in snap).length >= 3;
    const snapSet = (snap.set ?? '').toLowerCase();
    const setParam = sourceSet(src);
    const srcUuid = sourceUuid(src);
    const snapImgUuid = uuidObrazuSnapshotu(snap);
    const katImgUuid = uuidOf(def.imageUri);
    rekord.setSnapshot = snap.set ?? null;

    // Tokeny i ziemie podstawowe mają w katalogu `set: null` (44 wpisy syntetyczne — nie są
    // kartami z kolekcji). Bez setu w katalogu nie ma z czym porównać, więc snapshot z setem
    // Scryfalla (np. `tm3c` dla tokena Tarmogoyfa) NIE jest rozjazdem — tak samo jak wyżej
    // przy arkuszu: porównujemy tylko wtedy, gdy obie strony mają set.
    const katSet = String(def.set ?? '').toLowerCase();
    if (snapSet && katSet && snapSet !== katSet) {
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

  const nieuwaga = rozjazdy.filter((r) => !snapshotOf(r.split(':')[0])?.uwaga);
  return { grupy, doSieci, rozjazdy, nieuwaga, obrazPotwierdzony, pozaArkuszem, kart: registry.all().length };
};

const KORZEN = new URL('..', import.meta.url);            // repo, niezależnie od CWD

export const snapshotOfPlik = (id) => {
  const sciezka = new URL(`docs/cards/scryfall-${id}.json`, KORZEN);
  return fs.existsSync(sciezka) ? JSON.parse(fs.readFileSync(sciezka, 'utf8')) : null;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const JAKO_JSON = process.argv.includes('--json');
  const REGISTRY = createCardRegistry();
  const ARKUSZ = artIdsBySetFromRows(
    parseCSV(fs.readFileSync(new URL('tools/collection-art-ids.csv', KORZEN), 'utf8')));
  const wynik = przegladDrukow({ registry: REGISTRY, arkusz: ARKUSZ, snapshotOf: snapshotOfPlik });

  console.log(`Kart w rejestrze: ${wynik.kart}`);
  console.log(`  w arkuszu kolekcji (artId): ${wynik.kart - wynik.pozaArkuszem}, poza arkuszem (tokeny/ziemie): ${wynik.pozaArkuszem}`);
  console.log(`  UUID obrazu potwierdzony offline (snapshot = katalog): ${wynik.obrazPotwierdzony}`);
  console.log('\nKLASY prowiniencji snapshotów:');
  for (const [k, v] of [...wynik.grupy.entries()].sort()) console.log(`  ${k}: ${v.length}`);
  const b2 = wynik.grupy.get('B2-druga-strona-pokryta-snapshotem') ?? [];
  if (b2.length) {
    console.log('\nDRUGIE STRONY pokryte snapshotem karty dwustronnej (osobny snapshot niepotrzebny —');
    console.log('Scryfall opisuje transform jako jeden obiekt z `card_faces`, arkusz daje obu twarzom ten sam artId+set):');
    for (const x of b2) console.log(`  ${x.id} | „${x.name}” ← snapshot ${x.frontId} (layout ${x.layout ?? '?'})`);
  }

  const wsparcie = przegladObiektowWsparcia({ obiekty: obiektyWsparcia(), snapshotOf: snapshotOfPlik });
  console.log('\nOBIEKTY WSPARCIA poza rejestrem kart (nie ma ich w arkuszu kolekcji — ADR 0029;');
  console.log('adres obrazu bierze się z card-data.js, snapshot jest jego prowieniencją):');
  for (const w of wsparcie.wpisy) {
    const plik = snapshotOfPlik(w.id) ? `snapshot scryfall-${w.id}.json` : 'BEZ snapshotu';
    console.log(`  ${w.id} | „${w.name}” | ${w.klasa} | ${plik}${w.dowod ? ` | ${w.dowod}` : ''}${w.powod ? ` | ${w.powod}` : ''}`);
  }

  console.log(`\nDO POBRANIA ZE SCRYFALL (krok 2, wymaga sieci): ${wynik.doSieci.length}`);
  for (const x of wynik.doSieci) {
    console.log(`  ${x.id} | „${x.name}” | katalog=${x.setKatalog} arkusz=${x.setArkusz ?? '—'} snapshot=${x.setSnapshot ?? '—'} | ${x.powod}`);
  }

  console.log(`\nROZJAZDY: ${wynik.rozjazdy.length} (udokumentowane polem \`uwaga\`: ${wynik.rozjazdy.length - wynik.nieuwaga.length})`);
  for (const r of wynik.rozjazdy) console.log(`  ${r}${snapshotOfPlik(r.split(':')[0])?.uwaga ? '  [uwaga]' : ''}`);

  if (JAKO_JSON) console.log(JSON.stringify({ doSieci: wynik.doSieci, rozjazdy: wynik.rozjazdy }, null, 2));
  if (wynik.nieuwaga.length > 0) {
    console.error(`\nBŁĄD: ${wynik.nieuwaga.length} rozjazd(ów) bez udokumentowania — patrz docs/cards/WERYFIKACJA_DRUKOW_2026-09-12.md`);
    process.exitCode = 1;
  }
}
