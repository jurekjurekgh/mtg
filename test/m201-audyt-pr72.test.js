import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { collectModules } from '../tools/module-graph.mjs';

/**
 * M201 — audyt PR #72.
 *
 * N1: w `scoreCommand` heuristic-bota został DEBUG z poprzedniej sesji:
 *   `if (process.env.BOT_DEBUG_SCORES && cmd.objectId === 'slaad') console.error(...)`
 * Trzy osobne wady w jednej linii:
 *  1. `process` NIE ISTNIEJE w przeglądarce — sklejony artefakt (ADR 0011)
 *     rzucałby ReferenceError przy PIERWSZEJ wycenie ruchu bota, czyli stół
 *     na iPadzie/iPhonie właściciela przestaje działać (testy w Node tego
 *     nie widzą — tam `process` jest globalny; L5: zielony test ≠ działający
 *     produkt);
 *  2. rozpoznawanie konkretnej karty po ID w rdzeniu (`'slaad'`) — ADR 0002;
 *  3. instrumentacja diagnostyczna w kodzie produkcyjnym (ENVIRONMENT §3).
 *
 * Strażnik jest GENERYCZNY (L28/L31): pilnuje KAŻDEGO modułu wchodzącego do
 * artefaktu, nie jednej linii — dowolna nodowa globalna w kodzie stołu
 * czerwienieje przed scaleniem.
 */

const NODE_ONLY_PATTERNS = Object.freeze([
  { name: 'process.', re: /\bprocess\s*\./ },
  { name: '__dirname', re: /\b__dirname\b/ },
  { name: '__filename', re: /\b__filename\b/ },
  { name: 'require(', re: /\brequire\s*\(/ },
  { name: "import 'node:…'", re: /from\s+['"]node:/ },
]);

/**
 * Linie pliku BEZ komentarzy — wzmianka o `process.env` w komentarzu (np.
 * w opisie tej właśnie pułapki) jest legalna. Komentarze blokowe trzeba
 * zdejmować razem z liniowymi: pierwsza wersja strażnika zaczerwieniła się
 * na własnym komentarzu w `session.js`, a fałszywy alarm to strażnik, któremu
 * przestaje się ufać.
 */
function codeLinesOf(source) {
  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
  return blanked.split('\n').map((line) => {
    const idx = line.indexOf('//');
    return idx === -1 ? line : line.slice(0, idx);
  });
}

test('M201/N1: żaden moduł artefaktu przeglądarkowego nie używa globali Node', () => {
  const modules = collectModules('src/table/main.js');
  const hits = [];
  for (const { abs, source } of modules) {
    const rel = path.relative('.', abs).replace(/\\/g, '/');
    codeLinesOf(source).forEach((code, i) => {
      for (const { name, re } of NODE_ONLY_PATTERNS) {
        if (re.test(code)) hits.push(`${rel}:${i + 1} — ${name}: ${code.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(hits, [],
    'Moduł stołu odwołuje się do globalnej Node — w przeglądarce (file://, ADR 0011) '
    + 'to ReferenceError w trakcie gry:\n' + hits.join('\n'));
});

test('M201/N1: kod stołu nie zawiera instrumentacji debug po nazwie/ID karty', () => {
  const modules = collectModules('src/table/main.js');
  const hits = [];
  for (const { abs, source } of modules) {
    const rel = path.relative('.', abs).replace(/\\/g, '/');
    codeLinesOf(source).forEach((code, i) => {
      if (/console\.(log|error|debug)\s*\(/.test(code) && /BOT_DEBUG|DEBUG_/.test(code)) {
        hits.push(`${rel}:${i + 1} — ${code.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(hits, [], 'Instrumentacja debug została w kodzie produkcyjnym:\n' + hits.join('\n'));
});

test('M201/N1: zbudowany artefakt (jeśli istnieje) nie niesie globali Node', () => {
  const out = 'dist/mtg-table.html';
  if (!fs.existsSync(out)) return; // build jest osobnym krokiem — brak pliku nie jest błędem
  const html = fs.readFileSync(out, 'utf8');
  const bad = codeLinesOf(html)
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => /\bprocess\s*\.env\b/.test(line));
  assert.equal(bad.length, 0,
    `Artefakt zawiera odwołanie do process.env (linie: ${bad.map((b) => b.i + 1).join(', ')})`);
});
