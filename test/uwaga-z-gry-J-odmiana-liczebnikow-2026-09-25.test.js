import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describeGameEvent, PLAYER_NAMES } from '../src/table/session.js';
import { polishPluralCount } from '../src/table/render.js';

/**
 * Znalezione przy okazji M432 (Żywy Tester, detektor językowy) i naprawione bez
 * pytania — uwaga właściciela 2026-09-25b: „znalezione błędy naprawiasz, nie
 * pytasz mnie, czy naprawić".
 *
 * Objaw: opis wyczerpanej biblioteki przy discover bota brzmiał
 * „przejrzano 4 **kart**" (powinno być „4 karty"), a log startowy
 * „Ręka startowa Nieprzyjaciel: 7 **kart**" (przy 1 karcie: „1 karta").
 * Ten sam błąd siedział w kreatorze talii (3 liczniki).
 *
 * Przyczyna GEOGRAFII, nie reguły: `polishPluralCount` mieszkał w `render.js`,
 * a `session.js` nie może importować z `render.js` (render importuje z session —
 * cykl), więc licznik lepiono ręcznie w sztywną formę „N kart". Naprawa: liść
 * `src/table/polish-plural.js` (zero zależności) jako JEDNO źródło odmiany dla
 * całego stołu; `render.js` re-eksportuje, by nie ruszać dotychczasowych
 * konsumentów (`choice-request.js`, `main.js`).
 */

const helpers = { nameOf: (cardId) => String(cardId), nameOfObject: () => '?' };
const opis = (e) => describeGameEvent(e, helpers, PLAYER_NAMES);

test('J1: discover z wyczerpaną biblioteką — odmiana liczebnika, nie sztywna forma', () => {
  const forN = (n) => opis({
    type: 'discover_resolved', playerId: 'p1', amount: 3, found: false,
    revealedCardIds: Array.from({ length: n }, (_, i) => `karta-${i}`),
    bottomCount: n, libraryExhausted: true,
  });
  assert.match(forN(1), /przejrzano 1 kartę(?![a-z])/);
  assert.match(forN(2), /przejrzano 2 karty(?![a-z])/);
  assert.match(forN(4), /przejrzano 4 karty(?![a-z])/, 'to dokładnie zgłoszona forma („4 kart")');
  assert.match(forN(5), /przejrzano 5 kart(?![a-z])/, '5+ zostaje „kart" — nie jest to bezmyślne zastąpienie');
  assert.match(forN(12), /przejrzano 12 kart(?![a-z])/, 'nastki 12–14 idą za mod100');
  assert.match(forN(22), /przejrzano 22 karty(?![a-z])/);
  assert.doesNotMatch(forN(4), /4 kart(?![a-z])/);
});

test('J2: zero przejrzanych kart nie brzmi „0 kartę"', () => {
  const tekst = opis({
    type: 'discover_resolved', playerId: 'p2', amount: 3, found: false,
    revealedCardIds: [], bottomCount: 0, libraryExhausted: true,
  });
  assert.match(tekst, /przejrzano 0 kart(?![a-z])/, '0 → forma mnoga („kart"), nie „kartę/karty"');
});

test('J3: odmiana vive la funkcja, nie litery w plikach stołu (strażnik ŹRÓDŁA)', () => {
  // Jakakolwiek warstwa stołu, która znowu sklei „${licznik} kart" bez
  // odmiany, musi zapalić ten test (L23: licznik z odmianą ma mieć
  // producenta, nie kopie w opisach).
  const pliki = fs.readdirSync('src/table').filter((f) => f.endsWith('.js') && f !== 'polish-plural.js');
  const winowajcy = [];
  for (const f of pliki) {
    const src = fs.readFileSync(`src/table/${f}`, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/\$\{[^{}]{1,80}\}\s+kart(?![a-zA-Ząćęłńóśźż])/.test(line) && !line.includes('polishPluralCount')) {
        winowajcy.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(winowajcy, [],
    'sztywna forma „N kart" bez polishPluralCount — użyj odmiany z liścia');
});

test('J4: JEDNO źródło odmiany — render re-eksportuje liść, nie duplikuje ciała', () => {
  const render = fs.readFileSync('src/table/render.js', 'utf8');
  assert.equal(render.includes('export function polishPluralCount'), false,
    'definicja nie może wrócić do render.js (session nie może go importować — cykl)');
  assert.match(render, /export \{ polishPluralCount \} from '\.\/polish-plural\.js';/);
  const leaf = fs.readFileSync('src/table/polish-plural.js', 'utf8');
  assert.equal(leaf.includes('import '), false, 'liść ma zero zależności (inaczej cykl)');
  assert.equal(typeof polishPluralCount, 'function', 'starzy konsumenci (choice-request, main) widzą tę samą funkcję');
  assert.equal(polishPluralCount(3, 'karta', 'karty', 'kart'), 'karty');
});
