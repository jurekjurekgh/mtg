import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Zgłoszenie F (właściciel, 2026-09-20): sekcja „Kreator talii” jest MARTWA —
 * właściciel jej nie używa i nie będzie. Ma być zakomentowana „tak, żeby nie
 * pokazywała się W OGÓLE” w aplikacji.
 *
 * Guard pinuje DWIE rzeczy naraz (L26 — strażnik struktury, nie ręczna lista):
 * 1. w `src/table/index.html` nie ma ŻYWEJ deklaracji sekcji kreatora (poza
 *    komentarzem HTML) — czyli przeglądarka nie ma czego pokazać;
 * 2. `src/table/main.js` nie woła `mountDeckBuilder` — czyli bootstrap nie
 *    wypełnia panelu nawet gdyby markup wrócił przez pomyłkę.
 *
 * Jednocześnie pinujemy ODWRACALNOŚĆ: zakomentowany blok zostaje w pliku
 * (z markupem w środku), więc przywrócenie to odkomentowanie + przywrócenie
 * montażu — bez odtwarzania panelu z historii gita.
 */

const INDEX = fs.readFileSync('src/table/index.html', 'utf8');
const MAIN = fs.readFileSync('src/table/main.js', 'utf8');

/**
 * Zostawia wyłącznie ŻYWY markup widoczny dla gracza: bez komentarzy HTML
 * i bez arkusza stylów (w `<style>` zostaje komentarz dla deweloperów, że
 * reguły panelu są uśpione — to nie jest element interfejsu).
 */
function zywyMarkup(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
}

/** Linie kodu bez komentarzy // (prosty skaner wystarcza: brak literałów z `//` w linii). */
function linieKodu(source) {
  return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

test('F: index.html nie deklaruje ŻADNEGO żywego elementu kreatora talii', () => {
  const zywe = zywyMarkup(INDEX);
  const zyweId = [...zywe.matchAll(/\sid="(deck-builder[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(zyweId, [],
    `sekcja kreatora talii musi być zakomentowana w całości, a żywe są: ${zyweId.join(', ')}`);
  // Panel nie może też zostać „ukryty” klasą/hidden — właściciel chce sekcji,
  // której w aplikacji NIE MA (komentarz), nie sekcji schowanej.
  assert.doesNotMatch(zywe, /Kreator talii/,
    'opis panelu „Kreator talii” nie może zostać w żywym markupie');
});

test('F: zakomentowany blok zachowuje markup panelu (odwracalność przywrócenia)', () => {
  const komentarze = [...INDEX.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]).join('\n');
  for (const id of ['deck-builder', 'deck-builder-name', 'deck-builder-card-list',
    'deck-builder-summary', 'deck-builder-output', 'deck-builder-add-filtered']) {
    assert.match(komentarze, new RegExp(`id="${id}"`),
      `markup panelu (${id}) ma zostać w zakomentowanym bloku — inaczej przywrócenie wymaga historii gita`);
  }
});

test('F: main.js nie montuje kreatora talii (zero żywych wywołań mountDeckBuilder)', () => {
  const zywe = linieKodu(MAIN);
  const wolania = zywe.filter((line) => /mountDeckBuilder\s*\(/.test(line));
  assert.deepEqual(wolania, [],
    `bootstrap nie może montować panelu kreatora talii, a woła: ${wolania.map((l) => l.trim()).join(' | ')}`);
  // Moduł zostaje w repozytorium (ADR 0012 bez zmian) — wyłączony jest montaż,
  // nie implementacja.
  assert.ok(fs.existsSync('src/table/deck-builder.js'), 'moduł panelu ma zostać w repozytorium');
  assert.ok(fs.existsSync('src/cards/deck-builder.js'), 'logika kreatora (ADR 0012) ma zostać w repozytorium');
});
