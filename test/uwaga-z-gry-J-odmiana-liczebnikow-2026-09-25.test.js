import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { describeGameEvent, PLAYER_NAMES } from '../src/table/session.js';
import { commandLabel, polishPluralCount } from '../src/table/render.js';

/**
 * Znalezione przy okazji M432 (Żywy Tester, detektor językowy) i naprawione od
 * razu — uwaga właściciela 2026-09-25b: „znalezione błędy naprawiasz, nie
 * pytasz mnie, czy naprawić".
 *
 * Objaw: „przejrzano 4 **kart**" w opisie wyczerpanej biblioteki, „Ręka
 * startowa Nieprzyjaciel: 7 **kart**" w logu oraz trzy liczniki w kreatorze
 * talii. Po polsku przy 2–4 chodzi „karty".
 *
 * Przyczyna to GEOGRAFIA, nie reguła: `polishPluralCount` mieszkał w
 * `render.js`, a `session.js` nie może importować z `render.js` (render
 * importuje z session — cykl), więc `describeGameEvent` i `deck-builder.js`
 * lepiły licznik na sztywno. Naprawa: liść `src/table/polish-plural.js` (zero
 * zależności) jako JEDNO źródło odmiany dla całego stołu.
 *
 * Pułapka utrwalona w J4/J5: gołe `export { x } from './plik.js'` re-eksportuje
 * nazwę, ale NIE wiąże jej lokalnie — a `render.js` używa helpera u siebie.
 * Efekt: 60 testów pada z `ReferenceError: polishPluralCount is not defined`.
 * Stąd render ma IMPORT oraz osobny `export {}`, a test sprawdza render NA
 * ŻYWO (renderTableView), bo sam odczyt tekstu pliku by tego nie złapał.
 */

const helpers = { nameOf: (cardId) => String(cardId), nameOfObject: () => '?' };
const opis = (e) => describeGameEvent(e, helpers, PLAYER_NAMES);

test('J1: discover z wyczerpaną biblioteką — odmiana liczebnika, nie sztywna forma', () => {
  const forN = (n) => opis({
    type: 'discover_resolved', playerId: 'p1', amount: 3, found: false,
    revealedCardIds: Array.from({ length: n }, (_, i) => `karta-${i}`),
    bottomCount: n, libraryExhausted: true,
  });
  // Uwaga dla kolejnych testów: `\b` w regexpie JS NIE działa po polskich
  // literach (diacritics nie są `\w`) — granicę wyrazu piszemy `(?![a-z])`.
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

test('J3: sztywna forma „${N} kart" nie wraca do warstwy stołu (strażnik ŹRÓDŁA)', () => {
  // Jakikolwiek plik stołu, który znowu sklei licznik bez odmiany, odpala ten
  // test (L23: licznik z odmianą ma mieć producenta, nie kopie w opisach).
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
  // Gołe `export { x } from './plik.js'` NIE wiąże nazwy lokalnie — render używa
  // helpera u siebie w ~20 miejscach, więc musi mieć import ORAZ re-eksport.
  assert.match(render, /^import \{ polishPluralCount \} from '\.\/polish-plural\.js';$/m,
    'render musi IMPORTOWAĆ odmianę (używa jej w swoich opisach), nie tylko re-eksportować');
  assert.match(render, /^export \{ polishPluralCount \};$/m,
    're-eksport dla dawnych konsumentów (choice-request, main)');
  const leaf = fs.readFileSync('src/table/polish-plural.js', 'utf8');
  assert.equal(leaf.includes('import '), false, 'liść ma zero zależności (inaczej cykl)');
  // Smoke wywołaniem (a nie odczytem pliku) siedzi w J5 — tam, gdzie helper
  // jest realnie używany (`commandLabel`).
  assert.equal(typeof polishPluralCount, 'function', 'starzy konsumenci widzą tę samą funkcję');
  assert.equal(polishPluralCount(3, 'karta', 'karty', 'kart'), 'karty');
});

// --- J5: wywołanie kodu render.js (łapie ReferenceError z gołego re-eksportu) ---
// `commandLabel` to dokładnie to miejsce, gdzie padł `polishPluralCount is not
// defined`, gdy render miał sam `export { x } from` bez importu. Nie spinamy
// tego odczytem pliku — spinamy wołaniem funkcji.
function miniview(hand) {
  return {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: { stack: [], graveyard: [], exile: [], library: [], hand, battlefield: [] },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
}
function minisession(registry, view) {
  return {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (cardId) => registry.get(cardId)?.name ?? cardId ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (cardId) => registry.get(cardId) ?? null,
    colorsOf: (cardId) => registry.get(cardId)?.colors ?? [],
    abilitiesOf: (cardId) => registry.get(cardId)?.abilities ?? [],
  };
}

test('J5: render.js używa liścia u siebie (commandLabel nie jest rozbitym re-eksportem)', () => {
  const registry = createCardRegistry();
  const hand = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, controllerId: 'p1', cardId: 'basic-forest' }));
  const view = miniview(hand);
  const session = minisession(registry, view);
  session.state.mulliganCounts = {};
  const keep = commandLabel({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }, session, view);
  assert.match(keep, /keep — 6 kart(?![a-z])/, keep);
  const take = commandLabel({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }, session, view);
  assert.match(take, /odłóż 1 kartę(?![a-z]) na spód/, take);
  assert.match(take, /dobierz 7 kart(?![a-z])/, take);
});
