// M117 — strażnik ŹRÓDEŁ danych kart (ADR 0010 §2a, lekcja L23).
//
// Powód powstania: audyt PR #56 znalazł w katalogu adres ilustracji, którego
// nikt nigdy nie pobrał ze Scryfalla —
// `…/large/front/9/1/91b1f0f3-krumar-initiate.jpg` (Krumar Initiate). Adres
// wygląda jak prawdziwy, ale nie zawiera UUID druku i zwraca 404, więc karta
// pokazywała się na stole bez ilustracji.
//
// Dlaczego nie złapał tego istniejący strażnik (`test/card-data.test.js`,
// „imageUri każdej karty zgadza się z plikiem Scryfall”)? Bo ma klauzulę
// `if (!expected) continue` — brak pliku `docs/cards/scryfall-<id>.json`
// oznaczał BRAK WERYFIKACJI. Dwadzieścia kart batchy 33–34 weszło do katalogu
// bez pliku źródłowego i tą właśnie dziurą przeszedł zmyślony adres.
//
// Reguła (L23): dane istniejące w dwóch reprezentacjach dostają strażnika
// porównującego je maszynowo — a strażnik, który sam siebie wyłącza przy
// braku danych, wymaga drugiego strażnika na OBECNOŚĆ tych danych.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const SOURCE_DIR = 'docs/cards';

const sourcePath = (id) => `${SOURCE_DIR}/scryfall-${id}.json`;
const hasSource = (id) => fs.existsSync(sourcePath(id));
const readSource = (id) => JSON.parse(fs.readFileSync(sourcePath(id), 'utf8'));

/** Karty spoza toru „realna karta ze Scryfalla”: lądy podstawowe i tokeny. */
function isVirtual(card) {
  const types = card.types ?? [];
  return types.includes('Basic') || types.includes('Token') || card.set === null;
}

/** UUID druku wycięty z adresu obrazu (jedyna stabilna część adresu Scryfalla). */
function uuidFrom(url) {
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(url ?? '');
  return m ? m[1] : null;
}

test('adres cards.scryfall.io ZAWSZE zawiera UUID druku (nie da się go wymyślić)', () => {
  // Anty-zmyślanie: nazwa karty w ścieżce pliku to sygnał, że adres powstał
  // „z głowy”, a nie z odpowiedzi API. Prawdziwy adres to /<a>/<b>/<uuid>.jpg,
  // gdzie <a><b> to dwa pierwsze znaki UUID.
  const bad = [];
  for (const card of REGISTRY.all()) {
    const url = card.imageUri;
    if (!url || !url.includes('cards.scryfall.io')) continue;
    const uuid = uuidFrom(url);
    if (!uuid) { bad.push(`${card.id}: brak UUID w adresie → ${url}`); continue; }
    const dirs = /cards\.scryfall\.io\/[a-z_]+\/(?:front|back)\/([0-9a-f])\/([0-9a-f])\//.exec(url);
    if (!dirs) { bad.push(`${card.id}: adres bez katalogów <a>/<b> → ${url}`); continue; }
    if (dirs[1] !== uuid[0] || dirs[2] !== uuid[1]) {
      bad.push(`${card.id}: katalogi ${dirs[1]}/${dirs[2]} != początek UUID ${uuid.slice(0, 2)}`);
    }
  }
  assert.deepEqual(bad, [], `adresy ilustracji niezgodne ze schematem Scryfalla:\n  ${bad.join('\n  ')}`);
});

test('każda realna karta supported ma plik źródłowy docs/cards (ADR 0010 §2a)', () => {
  // Bez pliku źródłowego strażnik imageUri milczy — dlatego obecność pliku
  // jest wymagana, a nie „mile widziana”.
  const missing = [];
  for (const card of REGISTRY.supported()) {
    if (isVirtual(card)) continue;
    if (!hasSource(card.id)) missing.push(card.id);
  }
  assert.deepEqual(missing, [],
    `karty supported bez docs/cards/scryfall-<id>.json:\n  ${missing.join('\n  ')}\n`
    + 'Pobierz dane ze Scryfalla PRZED kodowaniem karty (ADR 0010 §2a) i zapisz plik.');
});

test('imageUri karty = adres druku z pliku źródłowego (co do UUID)', () => {
  const bad = [];
  for (const card of REGISTRY.all()) {
    if (!card.imageUri || !hasSource(card.id)) continue;
    const images = readSource(card.id).image_uris ?? {};
    const expected = uuidFrom(images.large ?? images.normal ?? null);
    const got = uuidFrom(card.imageUri);
    if (expected && got && expected !== got) bad.push(`${card.id}: ${got} != ${expected}`);
  }
  assert.deepEqual(bad, [], `imageUri niezgodne z plikiem źródłowym:\n  ${bad.join('\n  ')}`);
});

test('oracleText karty = oracle_text z pliku źródłowego (tekst reguł nie dryfuje)', () => {
  // Cellar Door miał w katalogu „Target player mills 1”, a Oracle mówi
  // „puts the bottom card of their library into their graveyard” — mechanika
  // (mill_from_bottom) była poprawna, ale gracz czytał w UI inną kartę.
  //
  // Porównanie pomija pliki bez `oracle_text` (karty dwustronne trzymają tekst
  // w `card_faces`) oraz przypisy w nawiasach — katalog zapisuje treść reguł,
  // a Scryfall dokleja do niej objaśnienia słów kluczowych.
  const norm = (text) => String(text ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\s*\([^()]*\)/g, '')   // przypis objaśniający słowo kluczowe
    .replace(/[""]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const drift = [];
  for (const card of REGISTRY.all()) {
    if (!card.oracleText || !hasSource(card.id)) continue;
    const source = readSource(card.id);
    if (!source.oracle_text) continue;               // DFC: tekst w card_faces
    if (/^FRONT:/m.test(source.oracle_text)) continue; // zapis dwustronny w pliku
    const expected = norm(source.oracle_text);
    const got = norm(card.oracleText);
    if (expected && got !== expected) drift.push(`${card.id}:\n      katalog : ${got}\n      scryfall: ${expected}`);
  }
  assert.deepEqual(drift, [],
    `oracleText rozjeżdża się z plikiem źródłowym:\n  ${drift.join('\n  ')}\n`
    + 'Tekst karty w katalogu ma być wydrukiem Oracle — inaczej gracz czyta w UI inną kartę.');
});
