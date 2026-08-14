// M89 cd. — bug A: pierwszy swipe w górę na iPhonie zwęża widok do ⅔
// ekranu (pusta przestrzeń po prawej). Właściciel: „Po nowym seedzie
// pierwszy swipe w górę — widok ⅔ ekranu" (2026-08-14).
//
// Root cause: iOS Safari ma dwa niezależne problemy:
// 1) `<meta viewport>` z `maximum-scale=5.0, user-scalable=yes` pozwala
//    użytkownikowi pinch-zoom do 5x, a pionowy swipe na pustym polu (gdzie
//    strona nie ma już treści do scrollowania) aktywuje rubber-band
//    scroll iOS, który zostawia viewport w zmniejszonym rozmiarze.
// 2) Brak `overscroll-behavior: none` na `html, body` pozwala przeglądarce
//    absorbować pionowy swipe w dolną krawędź (pull-to-refresh) i górną
//    (overscroll rubber-band).
//
// Fix: meta viewport blokuje zoom (`maximum-scale=1.0, user-scalable=no`)
// + `overscroll-behavior: none` na html/body. Pinch-zoom i tak nie jest
// użyteczny na stole (karty mają stałe wymiary).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('bug A: meta viewport blokuje pinch-zoom (maximum-scale=1.0, user-scalable=no)', () => {
  // Po fixie M89 cd.: brak user-scalable=yes i maximum-scale=5.0 — iOS nie
  // pozwala na pinch-zoom (który towarzyszy rubber-band scroll przy swipe).
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const match = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/);
  assert.ok(match, '<meta name="viewport"> powinien istnieć w index.html');
  const content = match[1];
  assert.match(content, /maximum-scale=1\.0/,
    'viewport MUSI mieć maximum-scale=1.0 (blokuje pinch-zoom)');
  assert.match(content, /user-scalable=no/,
    'viewport MUSI mieć user-scalable=no (nie pozwala na zoom)');
  // regression strażnik — NIE wracamy do user-scalable=yes / max 5.
  assert.doesNotMatch(content, /user-scalable=yes/,
    'viewport NIE MOŻE mieć user-scalable=yes (regression — bug A)');
  assert.doesNotMatch(content, /maximum-scale=5/,
    'viewport NIE MOŻE mieć maximum-scale=5 (regression — bug A)');
});

test('bug A: html, body mają overscroll-behavior: none (bez rubber-band scroll)', () => {
  // overscroll-behavior: none na html, body eliminuje iOS pull-to-refresh
  // i górny/dolny rubber-band scroll — pionowy swipe na pustym polu nie
  // zmieni rozmiaru viewportu.
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  assert.match(html, /overscroll-behavior:\s*none/,
    'index.html MUSI zawierać overscroll-behavior: none (html/body, blokuje rubber-band scroll)');
});
