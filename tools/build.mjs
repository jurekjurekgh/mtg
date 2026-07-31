/**
 * Sklejanie modułów ESM w jeden plik HTML.
 *
 * Powód istnienia: moduły ES nie działają po otwarciu pliku z dysku (file://),
 * bo przeglądarka blokuje je jako żądanie cross-origin z origin `null`.
 * Właściciel gra na iPadzie/iPhonie, gdzie nie da się uruchomić serwera HTTP.
 * Zob. ADR 0011.
 *
 * Graf modułów (cykle, kolizje nazw) jest współdzielony z testami
 * przez tools/module-graph.mjs.
 *
 * Świadome ograniczenia: bez zależności, bez minifikacji, bez map źródeł.
 * Wynik ma pozostać czytelny.
 *
 * Uruchomienie:  node tools/build.mjs [--out dist/mtg-table.html]
 */

import fs from 'node:fs';
import path from 'node:path';
import { IMPORT_RE, REEXPORT_RE, assertNoNameCollisions, collectModules } from './module-graph.mjs';

const ENTRY = 'src/table/main.js';

/** Usuwa składnię modułów — po sklejeniu wszystko dzieli jeden zasięg. */
function stripModuleSyntax(source) {
  return source
    .replace(REEXPORT_RE, '')
    .replace(IMPORT_RE, '')
    .replace(/^[ \t]*export\s+default\s+/gm, 'const __default__ = ')
    .replace(/^[ \t]*export\s+(async\s+function|function|const|let|var|class)\s/gm, '$1 ')
    .replace(/^[ \t]*export\s*\{[^}]*\};?[ \t]*$/gm, '');
}

function build({ out }) {
  const modules = collectModules(ENTRY);
  assertNoNameCollisions(modules);

  const code = modules
    .map(({ abs, source }) => {
      const rel = path.relative('.', abs).replace(/\\/g, '/');
      return `// ===== ${rel} =====\n${stripModuleSyntax(source).trim()}`;
    })
    .join('\n\n');

  const shell = fs.readFileSync('src/table/index.html', 'utf8');
  if (!shell.includes('<!--BUNDLE-->')) {
    throw new Error('src/table/index.html nie zawiera znacznika <!--BUNDLE-->');
  }

  const built = new Date().toISOString().slice(0, 10);
  const html = shell
    .replace('<!--BUNDLE-->', () => `<script>\n${code}\n</script>`)
    .replace('<!--BUILT-->', () => built);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);

  console.log(`Zbudowano ${out}`);
  console.log(`  modułów: ${modules.length}`);
  console.log(`  rozmiar: ${(html.length / 1024).toFixed(1)} kB`);
  return out;
}

const outArg = process.argv.indexOf('--out');
build({ out: outArg !== -1 ? process.argv[outArg + 1] : 'dist/mtg-table.html' });
