import fs from 'node:fs';
import path from 'node:path';

/**
 * Wspólny graf zależności modułów ESM — używany przez build.mjs i testy.
 *
 * Sklejony artefakt ma jeden wspólny zasięg (ADR 0011), więc:
 * - cykliczny import po cichu zgubiłby moduł — jest twardym błędem;
 * - kolizja nazw na najwyższym poziomie modułów nadpisałaby symbol —
 *   jest wykrywana przed sklejeniem.
 */

export const IMPORT_RE = /^[ \t]*import\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"];?[ \t]*$/gm;
export const REEXPORT_RE = /^[ \t]*export\s+\{[^}]*\}\s+from\s+['"](\.[^'"]+)['"];?[ \t]*$/gm;
/** Pełne instrukcje importu względnego — z klauzulą po lewej stronie `from`. */
const IMPORT_FULL_RE = /^[ \t]*import\s+([\s\S]*?)\s+from\s+['"](\.[^'"]+)['"];?[ \t]*$/gm;

/**
 * Wiązania aliasów z importów względnych (`import { a as b } from './x'`).
 *
 * Płaski zasięg artefaktu (ADR 0011) zna nazwy ORYGINALNE modułu
 * importowanego — instrukcja `import` znika przy sklejaniu (`stripModuleSyntax`),
 * więc `b` nigdy nie powstaje i przeglądarka dostaje `ReferenceError`
 * przy pierwszym wywołaniu (F-4 audytu PR #173: pierwszy alias w `src/`
 * wprowadził `heuristic-bot.js`, a Żywy Tester mierzy `dist/`, nie `src/`).
 * Zwraca `[{ local, original }]` — tylko aliasy; nazwy bez `as` już
 * istnieją w płaskim zakresie. Kształty default/namespace odrzucamy jawnie
 * (build musiałby wygenerować inne wiązanie — L52: sygnał, nie cisza).
 */
export function importAliasBindings(source) {
  const out = [];
  for (const m of source.matchAll(IMPORT_FULL_RE)) {
    const clause = m[1].trim();
    if (clause.startsWith('.')) continue; // import './x.js' — bez wiązań
    if (!clause.startsWith('{')) {
      throw new Error(
        `Nierozwiązany kształt importu względnego: import ${clause} … — `
        + 'płaski zasięg artefaktu potrafi rozwiązać tylko klauzurę {…} z aliasami (F-4).',
      );
    }
    const end = clause.lastIndexOf('}');
    for (const part of clause.slice(1, end === -1 ? clause.length : end).split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const as = trimmed.match(/^([\s\S]+?)\s+as\s+([\s\S]+)$/);
      if (as) out.push({ local: as[2].trim(), original: as[1].trim() });
    }
  }
  return out;
}

function dependenciesOf(source) {
  return [...source.matchAll(IMPORT_RE), ...source.matchAll(REEXPORT_RE)].map((m) => m[1]);
}

/** Rozwiązuje graf importów w kolejności „najgłębsze pierwsze"; rzuca przy cyklu. */
export function collectModules(entry, { rootDir = '.' } = {}) {
  const modules = [];
  const state = new Map(); // abs -> 'visiting' | 'done'

  function visit(abs, stack) {
    const seen = state.get(abs);
    if (seen === 'done') return;
    if (seen === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(abs)), abs]
        .map((p) => path.relative(rootDir, p))
        .join(' -> ');
      throw new Error(
        `Wykryto cykliczny import: ${cycle}\n` +
        'Sklejony plik ma jeden zasięg, więc cykl po cichu zgubiłby moduł. Rozerwij zależność.',
      );
    }
    state.set(abs, 'visiting');

    const source = fs.readFileSync(abs, 'utf8');
    for (const dep of dependenciesOf(source)) {
      visit(path.resolve(path.dirname(abs), dep), [...stack, abs]);
    }

    state.set(abs, 'done');
    modules.push({ abs, source });
  }

  visit(path.resolve(rootDir, entry), []);
  return modules;
}

/** Wykrywa kolizje nazw — jeden zasięg oznacza brak izolacji modułów. */
export function assertNoNameCollisions(modules, { rootDir = '.' } = {}) {
  const declared = new Map();
  // Tylko poziom modułu: deklaracja zaczyna się w kolumnie 0.
  // Zmienne lokalne (z wcięciem) po sklejeniu zostają w swoich funkcjach.
  const declRe = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  const problems = [];

  for (const { abs, source } of modules) {
    const rel = path.relative(rootDir, abs);
    for (const m of source.matchAll(declRe)) {
      const name = m[1];
      if (declared.has(name)) {
        problems.push(`  "${name}" — ${declared.get(name)} oraz ${rel}`);
      } else {
        declared.set(name, rel);
      }
    }
    // F-4: alias importu też tworzy symbol najwyższego poziomu po sklejeniu
    // (`const <local> = <original>;`) — kolizja z deklaracją jakiegokolwiek
    // modułu nadpisałaby go w płaskim zakresie.
    for (const { local } of importAliasBindings(source)) {
      if (declared.has(local)) {
        problems.push(`  "${local}" — ${declared.get(local)} oraz alias importu w ${rel}`);
      } else {
        declared.set(local, `alias importu w ${rel}`);
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
