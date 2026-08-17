// M117 — strażnik ADR 0002: „core zna ogólne pojęcia i procedury MtG, ale
// NIE rozpoznaje zachowania po nazwie ani identyfikatorze konkretnej karty”.
//
// Powód powstania: audyt PR #56 znalazł w `src/engine/effects.js` efekt
// zastępczy wpisany na sztywno pod jedną kartę:
//
//     a?.cardId === 'moonlit-meditation' && a.controllerId === ctrl
//
// Zachowanie karty siedziało więc w jądrze silnika. Naprawa (M117) przeniosła
// je do deskryptora `aura.replaceTokenCreation` — engine pyta teraz „czy ta
// aura zastępuje tworzenie tokenów?”, a nie „czy to jest ta karta?”.
//
// Strażnik czyta ŹRÓDŁA silnika i kontrolerów, wycina komentarze i szuka
// porównań `cardId`/`cardName` z literałem. Dopuszczone są wyłącznie
// identyfikatory tokenów (`token_*`) — tokeny nie są kartami (CR 111), engine
// tworzy je z własnych deskryptorów, więc nazwa tokenu jest częścią mechaniki.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIRS = ['src/engine', 'src/controllers'];

/** Usuwa komentarze blokowe i liniowe (żeby opis naprawy nie wywalał testu). */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

function sourceFiles() {
  return DIRS.flatMap((dir) => fs.readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.join(dir, file)));
}

test('engine nie rozpoznaje zachowania po identyfikatorze karty (ADR 0002)', () => {
  const violations = [];
  for (const file of sourceFiles()) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    const pattern = /\b(cardId|cardName)\s*(===|==|!==|!=)\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const value = match[3];
      if (value.startsWith('token_')) continue;   // token to nie karta (CR 111)
      if (value === 'string') continue;           // typeof cardId === 'string'
      const line = code.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line} → ${match[0]}`);
    }
  }
  assert.deepEqual(violations, [],
    `zachowanie konkretnej karty wpisane w core (ADR 0002):\n  ${violations.join('\n  ')}\n`
    + 'Przenieś je do deskryptora karty (pole w definicji + odczyt w engine), '
    + 'tak jak `aura.replaceTokenCreation` zamiast cardId „moonlit-meditation”.');
});

test('engine nie rozpoznaje zachowania po nazwie karty w tablicy/zbiorze', () => {
  // Druga forma tego samego długu: lista nazw kart w kodzie silnika
  // (`['karta-a', 'karta-b'].includes(cardId)`).
  const violations = [];
  for (const file of sourceFiles()) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    const pattern = /\]\s*\.includes\(\s*(?:\w+\.)?(cardId|cardName)\s*\)/g;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const line = code.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line} → ${match[0].trim()}`);
    }
  }
  assert.deepEqual(violations, [],
    `lista nazw kart w core (ADR 0002):\n  ${violations.join('\n  ')}`);
});
