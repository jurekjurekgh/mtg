/**
 * Sklejanie modułów ESM w jeden plik HTML.
 *
 * Powód istnienia: moduły ES nie działają po otwarciu pliku z dysku (file://),
 * bo przeglądarka blokuje je jako żądanie cross-origin z origin `null`.
 * Właściciel gra na iPadzie/iPhonie, gdzie nie da się uruchomić serwera HTTP.
 * Zob. ADR 0011.
 *
 * Świadome ograniczenia: bez zależności, bez minifikacji, bez map źródeł.
 * Wynik ma pozostać czytelny.
 *
 * Uruchomienie:  node tools/build.mjs [--out dist/mtg-table.html]
 */

import fs from 'node:fs';
import path from 'node:path';

const ENTRY = 'src/table/main.js';
const IMPORT_RE = /^[ \t]*import\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"];?[ \t]*$/gm;

/** Rozwiązuje graf importów w kolejności „najgłębsze pierwsze”. */
function collectModules(entry) {
  const modules = [];
  const state = new Map(); // abs -> 'visiting' | 'done'

  function visit(abs, stack) {
    const seen = state.get(abs);
    if (seen === 'done') return;
    if (seen === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(abs)), abs]
        .map((p) => path.relative('.', p))
        .join(' -> ');
      throw new Error(
        `Wykryto cykliczny import: ${cycle}\n` +
          'Sklejony plik ma jeden zasięg, więc cykl po cichu zgubiłby moduł. Rozerwij zależność.',
      );
    }
    state.set(abs, 'visiting');

    const source = fs.readFileSync(abs, 'utf8');
    const deps = [...source.matchAll(IMPORT_RE)].map((m) => m[1]);
    for (const dep of deps) {
      visit(path.resolve(path.dirname(abs), dep), [...stack, abs]);
    }

    state.set(abs, 'done');
    modules.push({ abs, source });
  }

  visit(path.resolve(entry), []);
  return modules;
}

/** Usuwa składnię modułów — po sklejeniu wszystko dzieli jeden zasięg. */
function stripModuleSyntax(source) {
  return source
    .replace(IMPORT_RE, '')
    .replace(/^[ \t]*export\s+default\s+/gm, 'const __default__ = ')
    .replace(/^[ \t]*export\s+(async\s+function|function|const|let|var|class)\s/gm, '$1 ')
    .replace(/^[ \t]*export\s*\{[^}]*\};?[ \t]*$/gm, '');
}

/** Wykrywa kolizje nazw — jeden zasięg oznacza brak izolacji modułów. */
function assertNoNameCollisions(modules) {
  const declared = new Map();
  // Tylko poziom modułu: deklaracja zaczyna się w kolumnie 0.
  // Zmienne lokalne (z wcięciem) po sklejeniu zostają w swoich funkcjach.
  const declRe = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  const problems = [];

  for (const { abs, source } of modules) {
    const rel = path.relative('.', abs);
    for (const m of source.matchAll(declRe)) {
      const name = m[1];
      if (declared.has(name)) {
        problems.push(`  "${name}" — ${declared.get(name)} oraz ${rel}`);
      } else {
        declared.set(name, rel);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      'Kolizja nazw na najwyższym poziomie modułów:\n' +
        problems.join('\n') +
        '\nPo sklejeniu wszystko dzieli jeden zasięg — zmień nazwę jednego z symboli.',
    );
  }
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
