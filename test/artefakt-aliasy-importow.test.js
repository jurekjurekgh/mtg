/**
 * Audyt PR #173 (F-4, 2026-10-26 — znalezione Żywcem Testerem): artefakt
 * musi deklarować KAŻDE wiązanie aliasu z importu względnego.
 *
 * Przyczyna: `stripModuleSyntax` (build.mjs) kasuje całe instrukcje `import`
 * (IMPORT_RE), a płaski zasięg artefaktu zna wyłącznie ORYGINALNE nazwy
 * eksportów modułu-importowanego. Aliasy importera (`{ x as y }`) nie
 * dostają żadnej deklaracji → `ReferenceError: y is not defined` przy
 * pierwszym wywołaniu. Pierwszy alias w `src/` wprowadził PR #173
 * (`heuristic-bot.js`: `hasManaActivationOffer as castFiltersApplicable`) —
 * testy Node przechodzą (prawdziwy ESM rozwiązuje aliasy), a artefakt pada
 * w przeglądarce: Żywy Tester (4 partie, sesja 2026-10-26) złapał
 * `Błąd wewnętrzny stołu: castFiltersApplicable is not defined` i martwe
 * okna bez panelu (L76: tester mierzy dist/, nie src/).
 *
 * Piny:
 *   A1 — skan `src/` po aliasach + REALNY build do `.arena/` → każdy alias
 *        ma deklarację `const <alias> = …` w `<script>` artefaktu
 *        (RED przed naprawą);
 *   A2 — `importAliasBindings` rozkłada `{ a, b as c }` na wiązania
 *        (dynamiczny import — brak eksportu to FAIL z komunikatem);
 *   A3 — `assertNoNameCollisions` ZNA aliasy: alias kolidujący z deklaracją
 *        modułu musi wywołać błąd (płaski zasięg nadpisałby symbol).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Aliasowe importy względne we WSZYSTKICH modułach artefaktu (bez tools/). */
function aliasedImportsIn(srcDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const text = fs.readFileSync(abs, 'utf8');
      const re = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/gm;
      for (const m of text.matchAll(re)) {
        for (const part of m[1].split(',')) {
          const trimmed = part.trim();
          const as = trimmed.match(/^(.+?)\s+as\s+(.+)$/);
          if (as) out.push({ file: abs, original: as[1].trim(), local: as[2].trim() });
        }
      }
    }
  };
  walk(srcDir);
  return out;
}

test('A1: każdy alias importu z src/ ma deklarację w zbudowanym artefakcie', () => {
  const pairs = aliasedImportsIn('src');
  assert.ok(pairs.length >= 1,
    'kod musi trzymać choć jeden alias — inaczej ten strażnik jest próżny (L26) '
    + 'i należy go przepisać razem z usunięciem aliasów');
  const out = '.arena/build-alias-test.html';
  execFileSync(process.execPath, ['tools/build.mjs', '--out', out], { stdio: 'pipe' });
  const html = fs.readFileSync(out, 'utf8');
  const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
  for (const { file, local, original } of pairs) {
    assert.match(
      script,
      new RegExp(`const\\s+${local}\\s*=\\s*${original}\\s*;`),
      `alias ${local} (z ${file}, oryginał ${original}) nie ma deklaracji w artefakcie — `
      + 'ReferenceError przy pierwszym wywołaniu w przeglądarce (F-4)',
    );
  }
  // Uwaga: komentarz `// import { … }` w main.js zostaje w artefakcie celowo
  // (nie jest instrukcją) — pinujemy WIĄZANIA, nie obecność tekstu „import {".
});

test('A2: importAliasBindings rozkłada aliasy na pary local = original', async () => {
  const mod = await import('../tools/module-graph.mjs');
  assert.equal(typeof mod.importAliasBindings, 'function',
    'module-graph musi eksportować importAliasBindings (F-4)');
  const bindings = mod.importAliasBindings([
    "import { alpha, beta as gamma } from './x.js';",
    "import { delta as epsilon } from",
    "  './z.js';",
  ].join('\n'));
  assert.deepEqual(bindings, [
    { local: 'gamma', original: 'beta' },
    { local: 'epsilon', original: 'delta' },
  ], 'aliasy z nawiasów klamrowych; nazwy bez `as` już istnieją w płaskim zakresie');
  // Kształt default/namespace w imporcie względnym jest głośnym błędem
  // buildu (L52), nie cichym pominięciem — w src/ dzisiaj nie występuje.
  assert.throws(
    () => mod.importAliasBindings("import plain from './y.js';"),
    /Nierozwiązany kształt importu/,
    'default z modułu względnego wymaga świadomej obsługi wiązania',
  );
});

test('A3: kolizja aliasu z deklaracją modułu jest wykrywana przed sklejeniem', async () => {
  const mod = await import('../tools/module-graph.mjs');
  const modules = [
    { abs: 'a.js', source: "import { thing as shared } from './b.js';\nconst useA = () => shared;" },
    { abs: 'b.js', source: 'const shared = 1;\nexport const thing = shared;' },
  ];
  assert.throws(
    () => mod.assertNoNameCollisions(modules),
    /shared/,
    'alias `shared` koliduje z deklaracją b.js — płaski zasięg nadpisałby symbol',
  );
  // Kontrola pozytywna: brak kolizji → cicho.
  mod.assertNoNameCollisions([
    { abs: 'a.js', source: "import { thing as localName } from './b.js';\nconst useA = () => localName;" },
    { abs: 'b.js', source: 'export const thing = 1;' },
  ]);
});
