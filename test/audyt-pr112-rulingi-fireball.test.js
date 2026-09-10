// Audyt PR #112, znalezisko F1 (sesja arena/01a08d0e, 2026-09-10).
//
// PR #112 zmienił zachowanie silnika (`resolveFireball`: podział X między cele
// WYŁĄCZNIE wciąż legalne przy rozstrzygnięciu) na podstawie rulingów WotC
// 2017-11-17 cytowanych w komentarzach kodu — ale snapshot karty
// (`docs/cards/scryfall-fireball.json`) miał `rulings: null`, czyli w słowniku
// ADR 0028 „nikt nie patrzył" (pusta lista `[]` znaczy „pobrano, WotC nie ma
// nic"). Karta została DOTKNIĘTA, więc zgodnie z ADR 0028 §2 („przy kartce")
// snapshot musi nieść rulingi, a ADR 0030 §3 wymaga, żeby ślad źródła żył
// w artefaktach repozytorium, nie tylko w opisie commita.
//
// Dodatkowo (zmierzone 2026-09-10): identyfikator ze snapshotu (`jvc` / `214`)
// NIE rozwiązuje się w Scryfall — `GET /cards/jvc/214` i `/cards/jvc/214/rulings`
// dają HTTP 404 — więc `tools/fetch-card-rulings.mjs` nie mógł tej karty
// obsłużyć i rulingi trzeba było pobrać po identyfikatorze karty. Stąd
// `rulingsSource` tego snapshotu jest adresem z UUID, nie z pary set/kolekcja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SNAPSHOT = 'docs/cards/scryfall-fireball.json';
const KLUCZOWA_KLAUZULA = 'The division involves only targets that are still legal as Fireball resolves';
const ZERO_CELOW = 'You may cast Fireball with zero targets, regardless of the value chosen for X';

function snapshot() {
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
}

test('F1/1: snapshot Fireballa niesie rulingi z proweniencją (ADR 0028 §2 — null ≠ „pobrano, brak")', () => {
  const snap = snapshot();
  assert.ok(Array.isArray(snap.rulings), 'rulings musi być tablicą (null znaczy „nikt nie patrzył")');
  assert.ok(snap.rulings.length > 0, 'WotC ma rulingi dla Fireballa — lista nie może być pusta');
  assert.equal(snap.rulingsPobrano, '2026-09-10', 'data pobrania (ADR 0028 §2)');
  assert.match(snap.rulingsSource ?? '', /^https:\/\/api\.scryfall\.com\/cards\/.+\/rulings$/,
    'adres źródła, z którego pobrano rulingi');
  for (const ruling of snap.rulings) {
    assert.equal(typeof ruling.comment, 'string');
    assert.ok(ruling.comment.length > 0, 'ruling bez treści nie jest rulingiem');
    assert.equal(ruling.source, 'wotc');
    assert.match(ruling.date ?? '', /^\d{4}-\d{2}-\d{2}$/, 'data publikacji rulingu');
  }
});

test('F1/2: klauzule, na których opiera się resolveFireball, są w snapshotcie DOSŁOWNIE', () => {
  const komentarze = snapshot().rulings.map((r) => r.comment);
  // Podział przez żywe cele (fix E5-1 z PR #112).
  assert.ok(komentarze.some((c) => c.includes(KLUCZOWA_KLAUZULA)),
    'brak rulingu o podziale między cele wciąż legalne — fix silnika straciłby źródło w repo');
  // X=0 / zero celów = legalny czar bez efektu (zmiana `fizzled` w PR #112).
  assert.ok(komentarze.some((c) => c.includes(ZERO_CELOW)),
    'brak rulingu o rzucie bez celów');
});

test('F1/3: data cytowana w komentarzu silnika istnieje w rulingach snapshotu (ADR 0030 §3)', () => {
  const src = fs.readFileSync('src/engine/spells.js', 'utf8');
  const okno = src.slice(src.indexOf('function resolveFireball') - 2000, src.indexOf('function resolveFireball'));
  // Daty RULINGÓW (oznaczone „WotC <data>"), nie dowolne daty z komentarza —
  // obok żyje data audytu (2026-09-10), która rulingiem nie jest.
  const cytowane = [...okno.matchAll(/WotC\s+(20\d{2}-\d{2}-\d{2})/g)].map((m) => m[1]);
  assert.ok(cytowane.length > 0, 'komentarz resolveFireball ma cytować datę rulingu (ślad źródła)');
  const datyWRulesach = new Set(snapshot().rulings.map((r) => r.date));
  for (const data of cytowane) {
    assert.ok(datyWRulesach.has(data),
      `komentarz silnika cytuje ${data}, a snapshot nie ma rulingu z tą datą — ślad rozjechał się z danymi`);
  }
});
