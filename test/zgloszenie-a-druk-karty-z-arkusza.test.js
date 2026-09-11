// Zgłoszenie właściciela A (2026-09-12, partia przy stole): w warstwie
// wysokograficznej (podgląd hover i tory FOT/KON przy rzucaniu czaru)
// Curiosity pokazywała druk z JMP (Jumpstart), a właściciel ma druk ISD.
//
// Przyczyna zmierzona w DANYCH, nie w renderze: stół bierze obraz z `imageUri`
// definicji karty (docs/setup/ILUSTRACJE_KART.md — kafel, hover, pełny podgląd
// i fallback torów FOT/KON), a `imageUri` Curiosity był adresem druku JMP
// (id c5a0be10-c20f-4ac0-89a5-1770ecf48aad, Jumpstart nr 147). Wziął się z
// `docs/cards/scryfall-curiosity.json`, który pobrano BEZ parametru `set=`
// (`cards/named?exact=Curiosity`) — Scryfall zwraca wtedy swój DOMYŚLNY druk
// nazwy. Rekord był wewnętrznie sprzeczny: `set: isd` i `collector_number: 56`
// wpisane ręcznie (ISD ma nr 49, JMP ma 147), adres obrazu z JMP. Procedura w
// docs/cards/HOW_TO_ADD_CARD.md pokazywała pobranie bez `set=`, więc to jest
// root cause całej klasy, nie jednostkowa literówka.
//
// Autorytet druku właściciela: arkusz kolekcji — kod setu to ostatnie znaki
// kolumny „Ilustracja" w tools/collection-art-ids.csv (`428ISD` → ISD),
// potwierdzone przez właściciela 2026-09-12. Parser arkusza jest TEN SAM,
// którego używa tools/fetch-art-ids.mjs (L41: jedna reguła, jedno miejsce).
//
// Zakres strażnika (wszystko offline, bez sieci):
//   A/1 pin zgłoszenia — Curiosity = druk ISD (i JMP nie może wrócić);
//   A/2 snapshot ↔ katalog: ten sam set i ten sam UUID obrazu;
//   A/3 snapshot wewnętrznie spójny: `source`, `print`, `set` i obraz
//       pochodzą z JEDNEGO pobrania;
//   A/4 katalog ↔ arkusz: `set` karty = kod setu z jej wpisu `artId`;
//   A/5 zapadnia: listy snapshotów pobranych bez `set=` / bez `source` oraz
//       lista udokumentowanych odstępstw (`uwaga`) są ZAMROŻONE — mogą tylko
//       maleć, nowy rozjazd wymaga świadomej zmiany fixture;
//   A/6 procedura: HOW_TO_ADD_CARD.md każe pobierać set-aware i nazywa arkusz
//       autorytetem (bez tego kolejny batch zrobi to samo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { artIdsBySetFromRows, parseCSV } from '../tools/fetch-art-ids.mjs';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const REGISTRY = createCardRegistry();
const ARKUSZ = artIdsBySetFromRows(parseCSV(fs.readFileSync('tools/collection-art-ids.csv', 'utf8')));
const ZAPADNIA = JSON.parse(fs.readFileSync('test/fixtures/druki-kart-zapadnia.json', 'utf8'));

function snapshotOf(id) {
  const sciezka = `docs/cards/scryfall-${id}.json`;
  return fs.existsSync(sciezka) ? JSON.parse(fs.readFileSync(sciezka, 'utf8')) : null;
}
const uuidOf = (adres) => String(adres ?? '').match(UUID_RE)?.[0] ?? null;
/** `print` bywa kodem setu („ktk") albo legacy „Nazwa (KTK)" — liczy się kod. */
const printKod = (print) => {
  const m = String(print ?? '').match(/\(([A-Za-z0-9]+)\)\s*$/);
  return (m ? m[1] : String(print ?? '')).toLowerCase();
};
/** Czy `source` to adres JEDNEJ karty (`/cards/<uuid>`), a nie wyszukiwanie. */
const sourceUuid = (source) => String(source ?? '')
  .match(/^https:\/\/api\.scryfall\.com\/cards\/([0-9a-f-]{36})/)?.[1] ?? null;
const sourceSet = (source) => String(source ?? '').match(/[?&]set=([A-Za-z0-9]+)/)?.[1]?.toLowerCase() ?? null;

/**
 * Jeden przebieg po katalogu — wszystkie asercje czytają jego wynik (spójne
 * dane, jeden zestaw reguł; L41).
 */
function przegląd() {
  const out = {
    zeSnapshotem: 0, problemySetu: [], problemyDruku: [], problemyZrodla: [],
    problemyArkusza: [], bezSetu: [], bezZrodla: [], odstepstwa: new Set(),
  };
  for (const def of REGISTRY.all()) {
    const snap = snapshotOf(def.id);
    const udokumentowane = Boolean(snap?.uwaga);
    const odstepstwo = (lista, komunikat) => {
      if (udokumentowane) out.odstepstwa.add(def.id);
      else lista.push(komunikat);
    };
    if (snap) {
      out.zeSnapshotem += 1;
      // A/2 — ten sam druk w snapshocie i w katalogu
      if ((snap.set ?? '').toLowerCase() !== String(def.set ?? '').toLowerCase()) {
        odstepstwo(out.problemySetu, `${def.id}: snapshot set=${snap.set}, katalog set=${def.set}`);
      }
      const snapUuid = uuidOf(snap.image_uris?.large);
      const katUuid = uuidOf(def.imageUri);
      if (snapUuid && katUuid && snapUuid !== katUuid) {
        odstepstwo(out.problemyDruku,
          `${def.id}: inny druk obrazu (snapshot ${snapUuid}, katalog ${katUuid})`);
      }
      // A/3 — spójność wewnętrzna snapshotu (jedno pobranie = jeden druk)
      const srcUuid = sourceUuid(snap.source);
      if (srcUuid && snapUuid && srcUuid !== snapUuid) {
        out.problemyZrodla.push(`${def.id}: source wskazuje kartę ${srcUuid}, a obraz ${snapUuid}`);
      }
      const srcSet = sourceSet(snap.source);
      if (srcSet && srcSet !== (snap.set ?? '').toLowerCase()) {
        out.problemyZrodla.push(`${def.id}: source ma set=${srcSet}, snapshot set=${snap.set}`);
      }
      if (snap.print && printKod(snap.print) !== (snap.set ?? '').toLowerCase()) {
        out.problemyZrodla.push(`${def.id}: print=${snap.print} nie zgadza się z set=${snap.set}`);
      }
      // A/5 — zapadnia: skąd pochodzi snapshot
      if (!snap.source) out.bezZrodla.push(def.id);
      else if (!srcSet && !srcUuid && !/oracleid|%3A/.test(snap.source)) out.bezSetu.push(def.id);
    }
    // A/4 — katalog vs arkusz kolekcji (autorytet druku właściciela)
    if (def.artId != null) {
      const wpis = (ARKUSZ.get(String(def.name ?? '').toLowerCase()) ?? [])
        .find((e) => e.artId === def.artId);
      if (wpis?.set && wpis.set !== String(def.set ?? '').toUpperCase()) {
        odstepstwo(out.problemyArkusza,
          `${def.id}: arkusz ma ${wpis.artId}${wpis.set}, katalog set=${def.set}`);
      }
    }
  }
  out.odstepstwa = [...out.odstepstwa].sort();
  out.bezSetu.sort();
  out.bezZrodla.sort();
  return out;
}

const WYNIK = przegląd();

test('A/1 (zgłoszenie właściciela): Curiosity pokazuje druk ISD z arkusza, nie domyślny JMP', () => {
  const def = REGISTRY.get('curiosity');
  assert.ok(def, 'Curiosity w katalogu');
  assert.equal(def.set, 'ISD', 'set właściciela (arkusz: 428ISD)');
  assert.equal(def.artId, 428, 'numer ilustracji z arkusza');
  assert.equal(uuidOf(def.imageUri), 'b212c36a-6d1f-4217-b384-1c2b0e07b68a',
    `imageUri musi być drukiem ISD (Innistrad nr 49), jest: ${def.imageUri}`);
  assert.ok(!def.imageUri.includes('c5a0be10-c20f-4ac0-89a5-1770ecf48aad'),
    'druk JMP (Jumpstart nr 147) nie może wrócić do imageUri');

  const snap = snapshotOf('curiosity');
  assert.ok(snap, 'snapshot Curiosity istnieje');
  assert.equal(snap.set, 'isd');
  assert.equal(snap.print, 'isd', 'print = set (ten sam druk)');
  assert.equal(snap.collector_number, '49', 'ISD Curiosity to nr 49 (JMP ma 147, ręczne 56 nie istniało)');
  assert.equal(sourceSet(snap.source), 'isd',
    'pobranie musi być set-aware — bez `set=` Scryfall zwraca druk domyślny');
  assert.equal(snap.image_uris.large, def.imageUri, 'katalog i snapshot niosą TEN SAM adres druku');
  assert.ok(snap.pobrano, 'data weryfikacji (ADR 0010 §2a)');
  assert.match(snap.poprawka ?? '', /JMP|Jumpstart/, 'snapshot mówi, skąd wziął się zły druk');
});

test('A/2 (klasa): snapshot i katalog niosą ten sam druk — set i UUID obrazu', () => {
  assert.ok(WYNIK.zeSnapshotem > 400, `przegląd objął ${WYNIK.zeSnapshotem} kart ze snapshotem`);
  assert.deepEqual(WYNIK.problemySetu, [],
    'snapshot mówi inny set niż katalog (rozjazd = na stole widać cudzy druk)');
  assert.deepEqual(WYNIK.problemyDruku, [],
    'adres obrazu w katalogu jest z innego druku niż snapshot');
});

test('A/3 (klasa): snapshot jest wewnętrznie spójny — source/print/set/obraz z jednego pobrania', () => {
  assert.deepEqual(WYNIK.problemyZrodla, [],
    'pola snapshotu pochodzą z różnych druków (tak Curiosity miała set:isd i obraz z JMP)');
});

test('A/4 (klasa): set karty w katalogu = kod setu z arkusza kolekcji', () => {
  assert.deepEqual(WYNIK.problemyArkusza, [],
    'katalog ma inny set niż arkusz właściciela (ostatnie znaki kolumny Ilustracja)');
  // Odstępstwo jest legalne TYLKO z powodem zapisanym w snapshocie (`uwaga`)
  // i tylko wtedy, gdy jest na zamrożonej liście — inaczej nowa niezgodność
  // przeszłaby cicho dopisaniem pola.
  assert.deepEqual(WYNIK.odstepstwa, ZAPADNIA.uwagaSet,
    'lista udokumentowanych odstępstw (`uwaga` w snapshocie) rozjechała się z fixture');
  for (const id of WYNIK.odstepstwa) {
    assert.match(snapshotOf(id)?.uwaga ?? '', /20\d\d-\d\d-\d\d/,
      `${id}: odstępstwo musi mieć powód z datą`);
  }
});

test('A/5 (zapadnia): snapshoty pobrane bez `set=` i bez `source` — lista tylko maleje', () => {
  assert.deepEqual(WYNIK.bezSetu, ZAPADNIA.bezSetu,
    'pobranie bez `set=` daje druk DOMYŚLNY Scryfalla, nie druk właściciela (zgłoszenie A). '
    + 'Popraw snapshot (pobranie set-aware) i usuń wpis z fixture — dopisanie nowego wymaga świadomej zmiany listy.');
  assert.deepEqual(WYNIK.bezZrodla, ZAPADNIA.bezZrodla,
    'snapshot bez pola `source` nie ma prowiniencji (ADR 0030 §3) — uzupełnij i usuń wpis z fixture');
});

test('A/6 (procedura): HOW_TO_ADD_CARD.md każe pobierać druk set-aware i nazywa arkusz autorytetem', () => {
  const doc = fs.readFileSync('docs/cards/HOW_TO_ADD_CARD.md', 'utf8');
  assert.match(doc, /named\?exact=[^)\s"]*&set=/,
    'przykładowe pobranie musi mieć `set=` — bez niego następny batch znów weźmie druk domyślny');
  assert.match(doc, /DOMYŚLNY druk/i, 'dokument musi mówić, DLACZEGO `set=` jest obowiązkowe');
  assert.match(doc, /collection-art-ids\.csv/, 'dokument musi wskazywać arkusz jako źródło kodu setu');
  assert.match(doc, /JEDNEGO pobrania/, 'dokument musi zakazywać składania snapshotu z dwóch druków');
  assert.match(doc, /uwaga/, 'odstępstwo musi mieć udokumentowaną ścieżkę (pole `uwaga`)');
});
