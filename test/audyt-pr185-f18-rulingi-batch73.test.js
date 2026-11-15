// Audyt PR #185 (F-18, ADR 0028 §2): 10 nowych snapshotów Oracle bez pola
// `rulings` — „nigdy nie ściągnięte".
//
// Zmierzone w E1: od 2026-09-01 KAŻDY batch dokładał do snapshotów pole
// `rulings` (+ `rulingsSource`, `rulingsPobrano`); batch 73 (pobrano
// 2026-11-11) jest jedynym wyjątkiem — 0/10. Część rozstrzygnięć nie jest w
// `oracle_text`, tylko w rulingach WotC (komentarz narzędzia
// `tools/fetch-card-rulings.mjs`), więc audyt „karta zgodna z Oracle"
// (ADR 0010 §2a, L57) dla tych 10 kart porównywał do niepełnego źródła.
//
// Kształt wpisu rulingu bierze się z `normalizeRulings` narzędzia (L41: jedno
// źródło prawdy dla kształtu) — `{ date, source, comment }`, posortowane po
// dacie, bez pustych komentarzy. M345/F7: brak danych NIE jest potwierdzoną
// pustą listą, więc pusta tablica musi iść w parze z `rulingsSource` i
// `rulingsPobrano` (dowód, że pobranie się odbyło).
//
// Egress HTTPS z sandboxa jest zablokowany (`curl` → SSL_ERROR_SYSCALL), więc
// dane ściągnięto narzędziem `fetch_page` z tych samych URL-i, które buduje
// `tools/fetch-card-rulings.mjs`, i zapisano przez `normalizeRulings` /
// `applyRulings` tego narzędzia.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CARDS_DIR = 'docs/cards';

// Batch 73: kolekcja właściciela 645–655 (Bladewheel Chariot to tył DFC
// Spring-Loaded Sawblades, bez własnego snapshotu).
const BATCH73 = [
  'might-beyond-reason',
  'messengers-speed',
  'get-the-point',
  'setons-desire',
  'spring-loaded-sawblades',
  'leonin-lightbringer',
  'river-herald-guide',
  'necrosavant',
  'kessig-flamebreather',
  'plummet',
];

const czytaj = (slug) => JSON.parse(
  fs.readFileSync(path.join(CARDS_DIR, `scryfall-${slug}.json`), 'utf8'),
);

const urlRulingow = (snap) => `https://api.scryfall.com/cards/${encodeURIComponent(snap.set)}/${encodeURIComponent(snap.collector_number)}/rulings`;

// Scryfall dopuszcza dwie postaci tego endpointu i repo używa obu: `/cards/<set>/
// <numer kolekcji>/rulings` (buduje ją `tools/fetch-card-rulings.mjs`) oraz
// oficjalny alias `/cards/<uuid>/rulings` (35 snapshotów od 2026-10-01).
const POPRAWNE_RULINGS_SOURCE = /^https:\/\/api\.scryfall\.com\/cards\/(?:[a-z0-9]+\/[^/\s]+|[0-9a-f-]{36})\/rulings$/;

test('F-18: każdy snapshot batcha 73 ma rulingi z właściwego URL-a i datę pobrania', () => {
  const braki = [];
  for (const slug of BATCH73) {
    const snap = czytaj(slug);
    if (!Array.isArray(snap.rulings)) braki.push(`${slug}: brak tablicy rulings`);
    if (snap.rulingsSource !== urlRulingow(snap)) {
      braki.push(`${slug}: rulingsSource ${JSON.stringify(snap.rulingsSource)} ≠ ${urlRulingow(snap)}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snap.rulingsPobrano ?? ''))) {
      braki.push(`${slug}: rulingsPobrano ${JSON.stringify(snap.rulingsPobrano)} to nie data`);
    }
  }
  assert.deepEqual(braki, [], `snapshoty batcha 73 bez śladu pobrania rulingów: ${braki.join('; ')}`);
});

test('F-18: wpisy rulingów mają kształt normalizeRulings i są posortowane po dacie', () => {
  for (const slug of BATCH73) {
    const { rulings } = czytaj(slug);
    assert.ok(Array.isArray(rulings), `${slug}: rulings musi być tablicą`);
    const daty = [];
    for (const r of rulings) {
      assert.deepEqual(
        Object.keys(r).sort(),
        ['comment', 'date', 'source'],
        `${slug}: wpis rulingu musi mieć dokładnie {date, source, comment} (kształt normalizeRulings)`,
      );
      assert.ok(typeof r.comment === 'string' && r.comment.trim().length > 0,
        `${slug}: komentarz rulingu nie może być pusty (M345/F7)`);
      assert.ok(typeof r.source === 'string' && r.source.length > 0, `${slug}: brak źródła rulingu`);
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(String(r.date ?? '')), `${slug}: data rulingu ${JSON.stringify(r.date)}`);
      daty.push(String(r.date));
    }
    assert.deepEqual(daty, [...daty].sort(), `${slug}: rulingi muszą być posortowane po dacie`);
  }
});

// Plummet (m20/188): obiekt karty NIE dał się pobrać w tej sesji — cztery próby
// `fetch_page` na `https://api.scryfall.com/cards/m20/188` (i dwie na
// `/cards/named?exact=Plummet&set=m20`) zakończyły się błędem podpisu proxy,
// podczas gdy endpoint rulingów `/cards/m20/188/rulings` odpowiedział (pusta
// lista). Wyjątek jest JAWNY i przypięty: po dopisaniu pól lista musi zmaleć,
// a ten test trzeba zaktualizować — milczące pomijanie byłoby strażnikiem z
// klauzulą „brak danych = przepuszczam" (L26).
const BEZ_OBIEKTU_KARTY = ['plummet'];

test('F-18: snapshoty batcha 73 mają keywords i color_identity (jak batch 72)', () => {
  const braki = [];
  const bezPol = [];
  for (const slug of BATCH73) {
    const snap = czytaj(slug);
    const ma = Array.isArray(snap.keywords) && Array.isArray(snap.color_identity);
    if (!ma) bezPol.push(slug);
    if (ma && BEZ_OBIEKTU_KARTY.includes(slug)) {
      braki.push(`${slug}: pola uzupełnione — usuń go z BEZ_OBIEKTU_KARTY (lista wyjątków musi maleć)`);
    }
    if (!ma && !BEZ_OBIEKTU_KARTY.includes(slug)) {
      braki.push(`${slug}: brak keywords/color_identity i brak na jawnej liście wyjątków`);
    }
  }
  assert.deepEqual(braki, [], braki.join('; '));
  assert.deepEqual(bezPol, BEZ_OBIEKTU_KARTY,
    'zestaw snapshotów bez keywords/color_identity musi być dokładnie jawnej listy wyjątków');
});

test('F-18 (strażnik strukturalny): snapshot pobrany od 2026-10-01 ma ślad rulingów', () => {
  // Batch 73 przeszedł bez rulingów, bo żaden test nie pytał o POLE, tylko o
  // wybrane karty. Strażnik jest ogólny: każdy snapshot z datą pobrania od
  // 2026-10-01 (od tego dnia rulingi były w każdym batchu) musi nieść ślad
  // pobrania — czerwieni się przy następnym batchu ściągniętym bez rulingów.
  const od = '2026-10-01';
  const braki = [];
  for (const file of fs.readdirSync(CARDS_DIR).filter((f) => f.startsWith('scryfall-') && f.endsWith('.json'))) {
    const snap = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    const pobrano = String(snap.pobrano ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pobrano) || pobrano < od) continue;
    if (!Array.isArray(snap.rulings)) braki.push(`${file}: brak rulings (pobrano ${pobrano})`);
    if (!POPRAWNE_RULINGS_SOURCE.test(String(snap.rulingsSource ?? ''))) {
      braki.push(`${file}: rulingsSource ${JSON.stringify(snap.rulingsSource)} to nie endpoint rulingów Scryfall`);
    }
  }
  assert.deepEqual(braki, [], braki);
});
