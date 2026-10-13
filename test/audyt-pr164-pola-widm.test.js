// Strażnik „pól-widm" w bocie (klasa znaleziska A-2 z audytu PR #164).
//
// Po co: PR #164 zostawił w `heuristic-bot.js` filtr czytający pola, których
// `PlayerView` NIGDY nie wysyła, więc warunek był MARTWY (L41: dwie warstwy
// czytają różne słowniki pól). Pętla jakości tej sesji przepuściła ten sam
// typ błędu przez sondę dynamiczną (`tools/probe-phantom-view.mjs`, 28 partii
// na wszystkich taliach) i znalazła martwy odczyt `descriptor.locksUntap` —
// nazwę, której NIE MA w żadnym innym pliku repo (prawdziwe pole to
// `doesntUntap`, obsługiwane obok).
//
// Ten test pilnuje KLASY, nie jednego przypadku: każde pole deskryptora aury
// czytane przez bota musi należeć do słownika pól, który faktycznie normalizują
// warstwy kart (`src/cards/registry.js` + `src/engine/identity.js`) — czyli do
// nazw, które mogą w ogóle trafić do obiektu obiektu gry i jego widoku.
// Nowa nazwa spoza słownika to sygnał (L39): albo literówka (jak
// `locksUntap`), albo pole, które trzeba najpierw dodać do normalizacji
// (i wtedy strażnik sam się rozszerzy, bo czyta listę ze źródła).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BOT = 'src/controllers/heuristic-bot.js';
const NORMALIZERY = ['src/cards/registry.js', 'src/engine/identity.js'];

/** Nazwy pól deskryptora aury normalizowane w danym pliku (`data.aura.X` / `aura.X`). */
function auraFieldNames(file) {
  const text = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const match of text.matchAll(/(?:data\.)?aura\.([A-Za-z_][A-Za-z0-9_]*)|(?:data\.)?aura\[\s*'([A-Za-z_][A-Za-z0-9_]*)'\s*\]/g)) {
    names.add(match[1] ?? match[2]);
  }
  return names;
}

/**
 * Usuwa komentarze (linijkowe i blokowe) prostym automatem stanów.
 * Powód: strażnik mierzy KOD, nie prozę — nazwa pola wspomniana w komentarzu
 * (np. w wyjaśnieniu usuniętego `locksUntap`) nie jest odczytem pola.
 */
export function bezKomentarzy(text) {
  let out = '';
  let i = 0;
  const dl = text.length;
  while (i < dl) {
    const znak = text[i];
    const next = text[i + 1];
    if (znak === '/' && next === '/') {
      while (i < dl && text[i] !== '\n') i += 1;
    } else if (znak === '/' && next === '*') {
      i += 2;
      while (i < dl && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
    } else if (znak === "'" || znak === '"' || znak === '`') {
      out += znak;
      i += 1;
      while (i < dl) {
        if (text[i] === '\\') { out += text[i] + (text[i + 1] ?? ''); i += 2; continue; }
        out += text[i];
        if (text[i] === znak) { i += 1; break; }
        i += 1;
      }
    } else {
      out += znak;
      i += 1;
    }
  }
  return out;
}

/** Pola czytane z obiektu o nazwie `descriptor` w KODZIE bota (`descriptor.X`). */
function descriptorReadsInBot() {
  const text = bezKomentarzy(fs.readFileSync(BOT, 'utf8'));
  const names = new Set();
  for (const match of text.matchAll(/\bdescriptor\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(match[1]);
  return names;
}

test('Audyt PR #164 (pola-widma): bot czyta z deskryptora aury wyłącznie nazwy z normalizacji kart', () => {
  const slownik = new Set();
  const perPlik = NORMALIZERY.map((file) => ({ file, names: auraFieldNames(file) }));
  for (const { names } of perPlik) for (const name of names) slownik.add(name);

  // L39: strażnik mierzy to, co deklaruje — najpierw dowód, że parsowanie
  // w ogóle działa (kotwice słownika) i że obie warstwy normalizują ten sam
  // zestaw pól (L21: jedna lista na warstwę to zaproszenie do rozjazdu).
  assert.ok(slownik.size >= 15, `słownik pól deskryptora aury podejrzanie mały: ${slownik.size}`);
  for (const anchor of ['doesntUntap', 'pump', 'losesKeywords', 'cantAttack', 'cantBlock']) {
    assert.ok(slownik.has(anchor), `słownik musi znać pole "${anchor}" (kotwica parsowania)`);
  }
  const [registry, identity] = perPlik;
  assert.deepEqual([...registry.names].sort(), [...identity.names].sort(),
    `${registry.file} i ${identity.file} normalizują RÓŻNE zestawy pól deskryptora aury — `
    + 'jeśli rozjazd jest zamierzony, rozszerz ten strażnik o powód (wzorzec wyjątku z ADR 0027 pkt 3)');

  const reads = descriptorReadsInBot();
  assert.ok(reads.size >= 5, `bot czyta podejrzanie mało pól deskryptora: ${[...reads].join(', ')}`);
  const obce = [...reads].filter((name) => !slownik.has(name)).sort();
  assert.deepEqual(obce, [],
    'bot czyta pola deskryptora aury, których normalizacja kart nie zna — to MARTWE warunki '
    + '(klasa A-2: pole nigdy nie trafi do obiektu ani widoku). Napraw nazwę albo rozszerz normalizację.\n'
    + obce.map((name) => `  descriptor.${name}`).join('\n'));
});

test('Audyt PR #164 (pola-widma): stripper komentarzy nie zjada kodu ani stringów (próba własna)', () => {
  const zrodlo = [
    "const a = descriptor.pump; // descriptor.locksUntap w komentarzu",
    "const b = 'descriptor.tekst';",
    'const c = "descriptor.tekst2";',
    'const d = `descriptor.tekst3`;',
    '/* descriptor.komentarz */ const e = descriptor.doesntUntap;',
  ].join('\n');
  const czysty = bezKomentarzy(zrodlo);
  assert.match(czysty, /descriptor\.pump/);
  assert.match(czysty, /descriptor\.doesntUntap/);
  // Stringi zostają (to dane, nie komentarz), ale komentarze znikają.
  assert.ok(!czysty.includes('descriptor.locksUntap w komentarzu'),
    'komentarz linijkowy musi zniknąć ze skanu');
  assert.ok(!czysty.includes('descriptor.komentarz'),
    'komentarz blokowy musi zniknąć ze skanu');
  assert.match(czysty, /descriptor\.tekst3/, 'stringi zostają (strażnik nie zgaduje treści)');
});
