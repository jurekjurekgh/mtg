// =============================================================================
// M137 — „kontrakt addObject" (temat z backlogu wskazany przez właściciela):
//
//   „Z lekcji L21: pole spoza kontraktu fabryki ginie po cichu, przez co dwa
//    testy przechodziły z fałszywych powodów. Pomysł: dorobić walidację."
//
// L21 opisywała objaw: dwa testy „Rustvine: odkręć docelowy ląd" tworzyły ląd
// przez `addObject(..., { tapped: true })`, ląd powstawał ODKRĘCONY, a asercja
// `tapped === false` sprawdzała stan początkowy zamiast skutku zdolności.
// Lekcja kończyła się uwagą: „Strażnik »addObject rzuca na nieznane pole«
// byłby ładniejszy, ale dziś wywraca ~40 plików testów".
//
// ZMIERZONE (skan wszystkich wywołań): cztery pola spoza kontraktu —
// `summoningSickness` (22 pliki), `counters` (3), `supertypes` (1),
// `tapped` (1). Twardy rzut wywracał 141 testów, bo pola trafiają tam też
// przez `...spread` w helperach (46 plików rozsypuje `...data` / `...extra`).
//
// ROZWIĄZANIE (dwa tryby, żeby ochrona nie oznaczała przepisania repo):
//   • domyślnie — OSTRZEŻENIE z konkretną podpowiedzią, raz na pole;
//   • `MTG_STRICT_ADD_OBJECT=1` — twardy wyjątek (sprzątanie i ten strażnik).
//
// Przy okazji naprawiono 39 wywołań w 23 plikach (pola przeniesione na jawne
// ustawienie po dodaniu obiektu) i ujawniono JEDEN test przechodzący
// z fałszywego powodu: „BUG3: Dunland Crebain amass" oczekiwał 2 liczników,
// bo licznik startowy z `counters:` ginął — po naprawie są 3 (1 + 2 z amass).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, ADD_OBJECT_FIELDS } from '../src/engine/game-state.js';

function board() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

const CREATURE = Object.freeze({
  instanceId: 'i-x', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
  zone: 'battlefield', kind: 'creature', power: 2, toughness: 1, manaCost: 2,
});

// --- Kontrakt jest jawny i kompletny ---------------------------------------

test('M137: ADD_OBJECT_FIELDS pokrywa DOKŁADNIE parametry destrukturyzacji', () => {
  // Lista pól i sama destrukturyzacja muszą się nie rozjechać — inaczej
  // walidacja zacznie odrzucać legalne pola (albo przepuszczać literówki).
  const source = fs.readFileSync('src/engine/game-state.js', 'utf8');
  const start = source.indexOf('export function addObject(state, config)');
  const destructuring = source.slice(source.indexOf('const {', start), source.indexOf('} = config;', start));
  const declared = new Set([...destructuring.matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*(?:=[^,]*)?(?:,|$)/g)]
    .map((m) => m[1]));
  const missingInList = [...declared].filter((f) => !ADD_OBJECT_FIELDS.includes(f));
  const missingInCode = ADD_OBJECT_FIELDS.filter((f) => !declared.has(f));
  assert.deepEqual(missingInList, [], `pola w kodzie, ale nie w ADD_OBJECT_FIELDS: ${missingInList}`);
  assert.deepEqual(missingInCode, [], `pola w ADD_OBJECT_FIELDS, ale nie w kodzie: ${missingInCode}`);
});

// --- Tryb ostrzegawczy (domyślny) ------------------------------------------

test('M137: nieznane pole NIE jest już ciche — zostaje ostrzeżenie', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    addObject(board(), { ...CREATURE, id: 'x1', zupelnieNieznanePole: 42 });
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1, 'dokładnie jedno ostrzeżenie');
  assert.match(warnings[0], /zupelnieNieznanePole/, `ostrzeżenie nazywa pole: ${warnings[0]}`);
  assert.match(warnings[0], /L21/, 'ostrzeżenie wskazuje lekcję źródłową');
});

test('M137: ostrzeżenie podpowiada, CO zrobić zamiast tego', () => {
  // Strażnik, który tylko krzyczy, jest przeszkodą. Komunikat ma prowadzić
  // do poprawnego wzorca — dla pól stanu bojowego wprost pokazuje kod.
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    addObject(board(), { ...CREATURE, id: 'x2', tapped: true });
  } finally {
    console.warn = original;
  }
  assert.match(warnings.join(' '), /state\.objects\.set/, 'podpowiedź pokazuje właściwy wzorzec');
});

test('M137: poprawne wywołanie NIE ostrzega (anty-over-fix)', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    addObject(board(), { ...CREATURE, id: 'x3', keywords: ['flying'], types: ['Creature'] });
  } finally {
    console.warn = original;
  }
  assert.deepEqual(warnings, [], `czyste wywołanie nie może hałasować: ${warnings}`);
});

// --- Sedno L21: pola stanu naprawdę nie działają przez fabrykę --------------

test('M137 (L21): pola stanu przekazane do fabryki NIE mają skutku — dlatego ostrzegamy', () => {
  // To jest dokładnie pułapka z lekcji: wywołanie wygląda, jakby ustawiało
  // stan, a obiekt powstaje bez niego. Test przypina to zachowanie, żeby
  // nikt nie „naprawił" go przez ciche rozszerzenie kontraktu.
  const state = board();
  const original = console.warn;
  console.warn = () => {};
  let object;
  try {
    object = addObject(state, {
      ...CREATURE, id: 'x4', tapped: true, counters: { '+1/+1': 3 }, supertypes: ['Legendary'],
    });
  } finally {
    console.warn = original;
  }
  assert.equal(object.tapped, false, 'tapped z fabryki nie działa (stan nadają efekty)');
  assert.deepEqual(object.counters, {}, 'counters z fabryki nie działa');
  assert.equal(object.supertypes, undefined, 'supertypes nie jest polem obiektu (idzie w types)');
});

test('M137: wzorzec zalecany przez L21 działa — jawne ustawienie po dodaniu', () => {
  const state = board();
  addObject(state, { ...CREATURE, id: 'x5' });
  state.objects.set('x5', Object.freeze({ ...state.objects.get('x5'), tapped: true }));
  assert.equal(state.objects.get('x5').tapped, true, 'stan nadany jawnie po dodaniu obiektu');
});

// --- Tryb ostry: dla sprzątania i CI ---------------------------------------

test('M137: MTG_STRICT_ADD_OBJECT=1 zamienia ostrzeżenie w twardy błąd', () => {
  const previous = process.env.MTG_STRICT_ADD_OBJECT;
  process.env.MTG_STRICT_ADD_OBJECT = '1';
  try {
    assert.throws(
      () => addObject(board(), { ...CREATURE, id: 'x6', literowkaWPolu: 1 }),
      /pole spoza kontraktu/,
      'tryb ostry ma rzucać wyjątkiem',
    );
    // Anty-over-fix: poprawne wywołanie w trybie ostrym przechodzi normalnie.
    assert.doesNotThrow(() => addObject(board(), { ...CREATURE, id: 'x7' }));
  } finally {
    if (previous === undefined) delete process.env.MTG_STRICT_ADD_OBJECT;
    else process.env.MTG_STRICT_ADD_OBJECT = previous;
  }
});

// --- Dług: ile wywołań jeszcze łamie kontrakt ------------------------------

test('M137: żadne wywołanie addObject w src/ nie łamie kontraktu', () => {
  // Kod produkcyjny ma być czysty — ostrzeżenia dotyczą wyłącznie helperów
  // testowych, które sprzątamy stopniowo. Ten strażnik pilnuje, żeby dług
  // nie wrócił do `src/`.
  const offenders = [];
  const known = new Set(ADD_OBJECT_FIELDS);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!full.endsWith('.js')) continue;
      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(/addObject\s*\(\s*[a-zA-Z_$][\w$]*\s*,\s*\{/g)) {
        const start = source.indexOf('{', match.index + match[0].length - 1);
        let depth = 0;
        let end = start;
        for (let i = start; i < source.length; i += 1) {
          if (source[i] === '{') depth += 1;
          else if (source[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
        }
        const body = source.slice(start + 1, end);
        let level = 0;
        let current = '';
        const parts = [];
        for (const char of body) {
          if ('{(['.includes(char)) level += 1;
          else if ('})]'.includes(char)) level -= 1;
          if (char === ',' && level === 0) { parts.push(current); current = ''; continue; }
          current += char;
        }
        parts.push(current);
        for (const part of parts) {
          const key = part.match(/^\s*([a-zA-Z][\w]*)\s*:/);
          if (key && !known.has(key[1])) offenders.push(`${full}: ${key[1]}`);
        }
      }
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], `kod produkcyjny łamie kontrakt addObject:\n${offenders.join('\n')}`);
});
