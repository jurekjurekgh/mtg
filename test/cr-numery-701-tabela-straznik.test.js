// Strażnik tabelaryczny numerów CR 701.x (weryfikacja cytatów u źródła,
// PR #135, 2026-09-24 — zadanie właściciela „a ty nie możesz sprawdzić sam?”).
//
// Dlaczego: sekcja „701. Keyword Actions” jest numerowana HISTORYCZNIE (nowe
// akcje dopisuje się na końcu, a stare czasem wypadają), więc numer przypięty
// do wydania z dnia kodowania mechaniki po kilku wydaniach wskazuje INNĄ akcję.
// Weryfikacja wobec oficjalnego tekstu CR 2026-09-25 znalazła w `src/` i `test/`
// ~150 takich rozjazdów z co najmniej trzech epok numeracji, m.in.:
//   • regeneracja jako 701.12 / 701.15 (dziś 701.12 = Exchange, 701.15 = Goad;
//     regeneracja to 701.19 — potwierdzają to odsyłacze 302.7 i 614.8),
//   • walka (fight) jako 701.12 (dziś 701.14),
//   • przeszukanie biblioteki jako 701.19b/c (dziś 701.23b/d; 701.19 = Regenerate),
//   • detain jako 701.29 (dziś 701.35; 701.29 = Fateseal),
//   • goad jako 701.38 (dziś 701.15; 701.38 = Vote),
//   • scry/odrzucenie jako 701.18 (dziś 701.22 / 701.9; 701.18 = Play),
//   • surveil jako 701.41 (dziś 701.25; 701.41 = Support),
//   • clash jako 701.40 (dziś 701.30; 701.40 = Manifest),
//   • discover jako 701.53 (dziś 701.57; 701.53 = Incubate),
//   • tap/untap jako 701.20/701.21 (dziś 701.26; 701.20 = Reveal, 701.21 = Sacrifice).
//
// Detektor (ten sam kształt co `cr-numery-702-tabela-straznik.test.js`): dla
// KAŻDEGO cytatu `701.<n>` w `src/` i `test/` sprawdza, czy w oknie ±OKNO linii
// pada nazwa akcji, którą `701.<n>` oznacza w BIEŻĄCYM wydaniu CR.
//
// Źródło tabeli (ADR 0030): oficjalny tekst Comprehensive Rules „These rules are
// effective as of September 25, 2026”, pobrany 2026-09-24 z
// https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt
// (sekcje 701.2–701.67 czytane dosłownie), spis 701.68–701.71 z
// mtg.wiki/page/Keyword_action (ten sam dzień, to samo wydanie).
//
// Gdy detektor świeci — uczciwe wyjścia w tej kolejności:
//   1. popraw numer na ten z tabeli (rozjazd),
//   2. dopisz nazwę akcji obok cytatu (komentarz był niekompletny),
//   3. dopisz wzorzec do `WYJATKI_701` Z POWODEM — nigdy nie kasuj assertion.
//
// Zakres: `src/**` i `test/**`. `docs/` NIE jest skanowany (zapis historyczny,
// ADR 0016); mapowanie jest w docs/audits/AUDYT_PR134_2026-09-24.md §7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Pliki, które celowo cytują numery przestarzałe, żeby je opisać. */
const POMIN = new Set([
  'test/cr-numery-701-tabela-straznik.test.js',
  'test/cr-numery-702-tabela-straznik.test.js',
  'test/cr-numery-mechanik-straznik.test.js',
  'test/audyt-pr134-2026-09-24-cytaty-cr.test.js',
]);

/** 701.<n> → nazwa akcji, CR 2026-09-25 (Reality Fracture). */
const TABELA_701 = {
  2: 'Activate', 3: 'Attach', 4: 'Behold', 5: 'Cast', 6: 'Counter', 7: 'Create',
  8: 'Destroy', 9: 'Discard', 10: 'Double', 11: 'Triple', 12: 'Exchange',
  13: 'Exile', 14: 'Fight', 15: 'Goad', 16: 'Investigate', 17: 'Mill', 18: 'Play',
  19: 'Regenerate', 20: 'Reveal', 21: 'Sacrifice', 22: 'Scry', 23: 'Search',
  24: 'Shuffle', 25: 'Surveil', 26: 'Tap and Untap', 27: 'Transform', 28: 'Convert',
  29: 'Fateseal', 30: 'Clash', 31: 'Planeswalk', 32: 'Set in Motion', 33: 'Abandon',
  34: 'Proliferate', 35: 'Detain', 36: 'Populate', 37: 'Monstrosity', 38: 'Vote',
  39: 'Bolster', 40: 'Manifest', 41: 'Support', 42: 'Meld', 43: 'Exert',
  44: 'Explore', 45: 'Assemble', 46: 'Adapt', 47: 'Amass', 48: 'Learn',
  49: 'Venture into the Dungeon', 50: 'Connive', 51: 'Open an Attraction',
  52: 'Roll to Visit Your Attractions', 53: 'Incubate', 54: 'The Ring Tempts You',
  55: 'Face a Villainous Choice', 56: 'Time Travel', 57: 'Discover', 58: 'Cloak',
  59: 'Collect Evidence', 60: 'Suspect', 61: 'Forage', 62: 'Manifest Dread',
  63: 'Endure', 64: 'Harness', 65: 'Airbend', 66: 'Earthbend', 67: 'Waterbend',
  68: 'Blight', 69: 'Heal', 70: 'Recruit', 71: 'Empower Jace',
};

/** Polskie nazwy i odmiany, po których poznajemy akcję w komentarzu. */
const ALIASY_701 = {
  2: ['activat', 'aktyw'],
  3: ['attach', 'przypi', 'przypię', 'załącz', 'odłącz', 'nosiciel', 'znacznik'],
  5: ['cast', 'rzut', 'rzuc', 'rzuć'],
  6: ['counter', 'kontr', 'skontr'],
  7: ['creat', 'token', 'stwórz', 'tworz'],
  8: ['destroy', 'niszcz', 'znisz'],
  9: ['discard', 'odrzuc', 'odrzuć', 'odrzuca'],
  10: ['doubl', 'podwaj', 'podwój', 'podwoj'],
  12: ['exchang', 'wymian', 'zamian'],
  13: ['exile', 'wygna', 'wygn'],
  14: ['fight', 'walk', 'walcz', 'wzajem'],
  15: ['goad'],
  16: ['investigat', 'clue', 'poszlak'],
  17: ['mill', 'młyn'],
  18: ['play', 'zagr', 'land', 'ląd'],
  19: ['regenera', 'regeneru', 'tarcz'],
  20: ['reveal', 'odsłon', 'odsłoń', 'jawn', 'look at', 'przegląd', 'patrz'],
  21: ['sacrific', 'poświęc'],
  22: ['scry'],
  23: ['search', 'szuka', 'szukan', 'przeszuk', 'tutor', 'fail to find'],
  24: ['shuffl', 'tasow', 'przetas'],
  25: ['surveil'],
  26: ['tap', 'odkręc', 'odkrec', 'untap'],
  27: ['transform', 'przemien', 'przemian', 'dwustronn', 'dfc', 'twarz'],
  28: ['convert'],
  29: ['fateseal'],
  30: ['clash'],
  34: ['proliferat'],
  35: ['detain', 'zatrzyma'],
  36: ['populat'],
  37: ['monstro'],
  38: ['vote', 'głos'],
  40: ['manifest'],
  41: ['support'],
  43: ['exert'],
  44: ['explor'],
  47: ['amass', 'army'],
  49: ['venture', 'loch', 'dungeon'],
  53: ['incubat'],
  54: ['ring', 'pierście', 'tempt'],
  55: ['villain'],
  56: ['time travel'],
  57: ['discover'],
  58: ['cloak', 'zasłon', 'zakry'],
  59: ['evidence', 'dowod', 'dowód'],
  60: ['suspect', 'podejrz'],
  61: ['forage'],
  62: ['manifest dread', 'dread'],
  63: ['endure'],
};

/**
 * Linie, które cytują numer 701.x bez nazwy akcji i są POPRAWNE.
 * Każdy wpis ma powód — bez powodu to byłoby wygaszanie detektora (L5).
 */
const WYJATKI_701 = [
  { wzorzec: /starsze komentarze repo cytują/, powod: 'notka historyczna: opisuje numery z dawnej numeracji' },
  { wzorzec: /dawniej \d|star[aą] numeracj/, powod: 'notka historyczna o dawnej numeracji — zapis z dnia kodowania mechaniki (ADR 0030)' },
  { wzorzec: /Poprzedni numer/, powod: 'notka historyczna o dawnym numerze reguły (ADR 0030)' },
];

/** 701.1 to reguła ogólna o keyword actions — bywa cytowana bez nazwy akcji. */
const NUMERY_OGOLNE = new Set([1]);

const OKNO = 4;

function wzorceNazwy(n) {
  const nazwa = TABELA_701[n];
  const out = [];
  if (nazwa) out.push(new RegExp(nazwa.replace(/[- ]/g, '[ \\-]?'), 'i'));
  for (const a of ALIASY_701[n] ?? []) out.push(new RegExp(a, 'i'));
  return out;
}

/**
 * Rdzeń detektora: lista rozjazdów dla podanych linii. Czysta funkcja —
 * test karmi ją syntetycznym przypadkiem (dowód RED bez mutacji repo, L13).
 */
export function znajdzRozjazdy701(linie, nazwaPliku = 'pamiec') {
  const trafienia = [];
  linie.forEach((linia, i) => {
    for (const m of linia.matchAll(/(?<![0-9.])701\.(\d+)/g)) {
      const n = Number(m[1]);
      if (NUMERY_OGOLNE.has(n)) continue;
      if (WYJATKI_701.some((w) => w.wzorzec.test(linia))) continue;
      if (!(n in TABELA_701)) {
        trafienia.push(`${nazwaPliku}:${i + 1} — 701.${n} nie istnieje w CR 2026-09-25 (sekcja 701 kończy się na 701.71)`);
        continue;
      }
      const okno = linie.slice(Math.max(0, i - OKNO), i + OKNO + 1).join('\n');
      if (!wzorceNazwy(n).some((w) => w.test(okno))) {
        trafienia.push(`${nazwaPliku}:${i + 1} — 701.${n} to ${TABELA_701[n]}, a w oknie ±${OKNO} linii nie ma tej nazwy`);
      }
    }
  });
  return trafienia;
}

function pliki() {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(ROOT, d, entry.name);
      if (entry.isDirectory()) walk(path.join(d, entry.name));
      else if (/\.(js|mjs|html)$/.test(entry.name)) out.push(full);
    }
  };
  walk('src');
  walk('test');
  return out.filter((p) => !POMIN.has(path.relative(ROOT, p))).sort();
}

test('CR 701.x: każdy cytat siedzi przy nazwie akcji z BIEŻĄCEGO wydania CR (2026-09-25)', () => {
  const trafienia = [];
  for (const plik of pliki()) {
    const rel = path.relative(ROOT, plik);
    trafienia.push(...znajdzRozjazdy701(fs.readFileSync(plik, 'utf8').split('\n'), rel));
  }
  assert.deepEqual(trafienia, [],
    `rozjazdy „numer ↔ akcja” (popraw numer wg tabeli, dopisz nazwę albo dodaj udokumentowany wyjątek):\n${trafienia.join('\n')}`);
});

test('CR 701.x: detektor łapie podstawione rozjazdy (dowód RED bez mutacji repo)', () => {
  // Przypadki znalezione w weryfikacji 2026-09-24 — odtworzone 1:1.
  const regen = znajdzRozjazdy701(['// Regeneracja (CR 701.12): tarcza zastępuje zniszczenie.']);
  assert.equal(regen.length, 1, 'regeneracja + 701.12 (Exchange) ma świecić');
  assert.match(regen[0], /701\.12 to Exchange/);

  const detain = znajdzRozjazdy701(['// Detain (CR 701.29, M177/E): zatrzymany stwór nie atakuje.']);
  assert.equal(detain.length, 1, 'detain + 701.29 (Fateseal) ma świecić');

  const clash = znajdzRozjazdy701(['// Clash (CR 701.40): „na spód albo zostaw”.']);
  assert.equal(clash.length, 1, 'clash + 701.40 (Manifest) ma świecić');

  const poprawne = znajdzRozjazdy701([
    '// Regeneracja (CR 701.19a): tarcza do końca tury.',
    '// Detain (CR 701.35a): do następnej tury zatrzymującego.',
    '// Clash (CR 701.30a): odsłoń wierzchnią kartę.',
    '// Fight (CR 701.14a): każdy zadaje obrażenia równe swojej mocy.',
  ]);
  assert.deepEqual(poprawne, [], 'poprawne cytaty nie mogą świecić');

  const pozaTabela = znajdzRozjazdy701(['// coś (CR 701.99)']);
  assert.equal(pozaTabela.length, 1, 'numer spoza sekcji 701 ma świecić');
});

test('CR 701.x: tabela i skan nie są puste (kontrola własna, L5)', () => {
  assert.ok(Object.keys(TABELA_701).length >= 70, 'tabela 701.x ma 70 wpisów z CR 2026-09-25');
  assert.ok(WYJATKI_701.every((w) => w.powod && w.powod.length > 10), 'każdy wyjątek ma powód');
  const lista = pliki();
  assert.ok(lista.filter((p) => p.includes(`${path.sep}src${path.sep}`)).length > 40, 'skanuje src/');
  assert.ok(lista.filter((p) => p.includes(`${path.sep}test${path.sep}`)).length > 100, 'skanuje test/');
});
