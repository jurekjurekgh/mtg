#!/usr/bin/env node
/**
 * Strażnik ISTNIENIA numerów CR (audyt PR #135, znalezisko F-1, rekomendacja
 * C3 z `docs/audits/AUDYT_PR135_2026-09-24b.md`).
 *
 * Problem: `test/cr-numery-701-tabela-straznik.test.js` i
 * `test/cr-numery-702-tabela-straznik.test.js` pokrywają tylko sekcje 701/702,
 * a strażnicy par to heurystyki OKNA (patrz F-2). Cytat numeru z innej sekcji —
 * albo litera podreguły, która nie istnieje — nie był sprawdzany przez nic;
 * audyt PR #135 znalazł tak 16 martwych numerów / 57 wystąpień, w tym `103.7a`
 * w 26 miejscach (m.in. „skok draw stepu", a w CR 2026-09-25 to 103.8a).
 *
 * Rozwiązanie (offline, bez sieci w CI):
 * - `test/helpers/cr-numery-tabela.js` — GENEROWANA lista numerów CYTOWANYCH
 *   w repo, z których każdy został zweryfikowany jako istniejący w wydaniu CR
 *   podanym w nagłówku (nie cała lista 3000+ reguł — dzięki temu nowy cytat
 *   ZAWSZE wymaga spotkania z tabelą). Regeneracja wymaga pliku CR:
 *     node tools/cr-numery.mjs --zapisz --cr /tmp/cr.txt
 *   (skąd wziąć plik: nagłówek tabeli + ADR 0030 — dosłowny tekst, nie pamięć).
 * - `test/cr-numery-istnienie-straznik.test.js` — każdy cytat `CR <numer>`
 *   w `src/`, `test/`, `tools/` MUSI być w tabeli. Nowy numer to nie błąd sam
 *   w sobie — to sygnał „zweryfikuj u źródła i dopisz do tabeli" (L5: strażnik
 *   pilnuje reguły, nie pamięci autora).
 *
 * Czego narzędzie NIE robi: nie ocenia, czy numer PASUJE do zdania obok (to
 * klasa F-2 — pary „mechanika ↔ numer" w `test/cr-numery-mechanik-straznik.test.js`).
 *
 * Użycie:
 *   node tools/cr-numery.mjs                              # check offline: kod vs tabela
 *   node tools/cr-numery.mjs --cr /tmp/cr.txt             # + tabela i kod wobec pliku CR
 *   node tools/cr-numery.mjs --zapisz --cr /tmp/cr.txt    # regeneracja tabeli
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLIK_TABELI = 'test/helpers/cr-numery-tabela.js';
export const KATALOGI_SKANU = ['src', 'test', 'tools'];
export const DOMYSLNY_PLIK_CR = process.env.CR_TXT ?? '/tmp/cr.txt';

/**
 * Pliki wykluczone ze skanu CYTATÓW — każdy z powodem (wyjątek bez powodu jest
 * naruszeniem, nie wyjątkiem — ADR 0027 pkt 3):
 * - tabela: to dane, nie cytat (numery bez prefiksu „CR");
 * - ten strażnik: zawiera CELOWY fixture `CR 999.99` (próba detektora);
 * - strażniki 701/702: zawierają CELOWE fixture'y `CR 701.99` i `CR 702.404`
 *   (numer spoza tabeli musi czerwienić ICH detektor — inwariant klasy L39);
 * - ten plik: dokumentuje powyższe fixture'y, więc sam je cytuje.
 */
export const WYKLUCZONE = new Set([
  PLIK_TABELI,
  'tools/cr-numery.mjs',
  'test/cr-numery-istnienie-straznik.test.js',
  'test/cr-numery-701-tabela-straznik.test.js',
  'test/cr-numery-702-tabela-straznik.test.js',
]);

/** Wzorzec cytatu w kodzie: `CR <3 cyfry>.<cyfry>[litera]` (bez „a/b", zakresów itp.). */
export const WZORZEC_CYTATU = /CR\s+(\d{3}\.\d+[a-z]?)/g;

/** Wzorzec linii-reguły w pliku CR (`100.1. tekst`, `205.1a tekst`). */
const WZORZEC_REGULY = /^(\d{3}\.\d+[a-z]?)(?=[.\s])/;

/** Rekurencyjna lista plików `.js`/`.mjs` w katalogach (bez node_modules i dist). */
export function plikiKodu(korzen = KORZEN, katalogi = KATALOGI_SKANU) {
  const out = [];
  const wejdz = (katalog) => {
    for (const wejscie of fs.readdirSync(katalog, { withFileTypes: true })) {
      if (wejscie.name === 'node_modules' || wejscie.name === '.git' || wejscie.name === 'dist') continue;
      const pelna = path.join(katalog, wejscie.name);
      if (wejscie.isDirectory()) wejdz(pelna);
      else if (/\.(js|mjs)$/.test(wejscie.name)) out.push(pelna);
    }
  };
  for (const katalog of katalogi) wejdz(path.join(korzen, katalog));
  return out.sort();
}

/** Zbiór numerów reguł istniejących w tekście CR. */
export function numeryZCr(tekstCr) {
  const numery = new Set();
  for (const linia of tekstCr.split(/\r?\n/)) {
    const m = WZORZEC_REGULY.exec(linia.trim());
    if (m) numery.add(m[1]);
  }
  return numery;
}

/** Cytaty `CR <numer>` w pojedynczym tekście (eksport dla prób detektora). */
export function cytatyZTekstu(tekst) {
  const out = [];
  const re = new RegExp(WZORZEC_CYTATU.source, 'g');
  let m;
  while ((m = re.exec(tekst))) out.push(m[1]);
  return out;
}

/**
 * Cytaty `CR <numer>` w kodzie repo.
 * @returns {{ wpisy: Array<{numer: string, plik: string, linia: number}>, unikalne: Map<string, number> }}
 */
export function cytatyWKodzie(korzen = KORZEN) {
  const wpisy = [];
  const unikalne = new Map();
  for (const plik of plikiKodu(korzen)) {
    const rel = path.relative(korzen, plik).split(path.sep).join('/');
    if (WYKLUCZONE.has(rel)) continue;
    fs.readFileSync(plik, 'utf8').split('\n').forEach((linia, indeks) => {
      for (const numer of cytatyZTekstu(linia)) {
        wpisy.push({ numer, plik: rel, linia: indeks + 1 });
        unikalne.set(numer, (unikalne.get(numer) ?? 0) + 1);
      }
    });
  }
  return { wpisy, unikalne };
}

/** Wczytuje wygenerowaną tabelę (moduł ESM z eksportami CR_* i NUMERY). */
export async function wczytajTabele(korzen = KORZEN) {
  const plik = path.join(korzen, PLIK_TABELI);
  if (!fs.existsSync(plik)) {
    return { brak: true, wydanie: null, sha256: null, zrodlo: null, pobrano: null, numery: new Set() };
  }
  const modul = await import(pathToFileURL(plik).href);
  return {
    brak: false,
    wydanie: modul.CR_WYDANIE,
    sha256: modul.CR_SHA256,
    zrodlo: modul.CR_ZRODLO,
    pobrano: modul.CR_DATA_POBRANIA,
    numery: new Set(modul.NUMERY),
  };
}

/** Wydanie CR z nagłówka pliku („effective as of September 25, 2026") → ISO. */
export function wydanieZCr(tekstCr) {
  const MIESIACE = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
  const m = /effective as of (\w+) (\d{1,2}), (\d{4})/i.exec(tekstCr);
  if (!m) return null;
  const mm = MIESIACE[m[1].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2].padStart(2, '0')}` : null;
}

/** Zapisuje tabelę z podanego zbioru numerów (format stabilny — grupy po sekcji). */
export function zapiszTabele(numery, { wydanie, sha256, zrodlo, pobrano }, korzen = KORZEN) {
  const posortowane = [...numery].sort((a, b) => {
    const [aGlowny, aReszta] = a.split('.');
    const [bGlowny, bReszta] = b.split('.');
    if (aGlowny !== bGlowny) return Number(aGlowny) - Number(bGlowny);
    const liczba = (t) => Number(/(\d+)/.exec(t)?.[1] ?? 0);
    if (liczba(aReszta) !== liczba(bReszta)) return liczba(aReszta) - liczba(bReszta);
    return a.localeCompare(b);
  });
  const linie = [
    '// GENEROWANE — nie edytuj ręcznie.',
    `// Regeneracja: node tools/cr-numery.mjs --zapisz --cr <plik CR>`,
    '//',
    '// Tabela ISTNIENIA numerów CYTOWANYCH: każdy cytat `CR <numer>` w `src/`,',
    '// `test/` i `tools/` musi tu być (strażnik: test/cr-numery-istnienie-straznik.test.js).',
    '// Zawiera TYLKO numery użyte w repo — nie pełny spis reguł CR.',
    '// Nowy numer dopisuj TYLKO po weryfikacji wobec dosłownego tekstu CR w BIEŻĄCYM',
    '// wydaniu (ADR 0030; L164 — masowe przenumerowanie bywa o wydanie do tyłu),',
    '// najlepiej przez `--zapisz` na świeżo pobranym pliku. Powód: audyt PR #135',
    '// znalazł 16 martwych numerów (F-1), których nie pilnowało nic.',
    '//',
    `// Wydanie CR: ${wydanie}`,
    `// SHA-256 pliku CR: ${sha256}`,
    `// Źródło (ADR 0030): ${zrodlo}`,
    `// Data pobrania: ${pobrano}`,
    '',
    'export const CR_WYDANIE = ' + JSON.stringify(wydanie) + ';',
    'export const CR_SHA256 = ' + JSON.stringify(sha256) + ';',
    'export const CR_ZRODLO = ' + JSON.stringify(zrodlo) + ';',
    'export const CR_DATA_POBRANIA = ' + JSON.stringify(pobrano) + ';',
    '',
    'export const NUMERY = [',
  ];
  let grupa = null;
  for (const numer of posortowane) {
    const prefiks = numer.slice(0, 1);
    if (prefiks !== grupa) {
      grupa = prefiks;
      linie.push(`  // ${prefiks}xx`);
    }
    linie.push(`  '${numer}',`);
  }
  linie.push('];', '');
  fs.writeFileSync(path.join(korzen, PLIK_TABELI), linie.join('\n'));
  return posortowane.length;
}

/** Ścieżka uruchomienia skryptu (CLI) vs import z testu. */
const uruchomionyBezposrednio = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (uruchomionyBezposrednio) {
  const argv = process.argv.slice(2);
  const zapisz = argv.includes('--zapisz');
  const i = argv.indexOf('--cr');
  const plikCr = i >= 0 ? argv[i + 1] : DOMYSLNY_PLIK_CR;
  const tabela = await wczytajTabele();
  const { wpisy, unikalne } = cytatyWKodzie();
  const cytowane = [...unikalne.keys()].sort();
  const pozaTabela = cytowane.filter((n) => !tabela.numery.has(n));

  if (tabela.brak) console.log('tabela: BRAK pliku — uruchom z --zapisz (wymaga pliku CR)');
  else console.log(`tabela: ${tabela.numery.size} numerów (CR ${tabela.wydanie}, pobrano ${tabela.pobrano})`);
  console.log(`kod:    ${cytowane.length} unikalnych numerów w ${wpisy.length} cytatach`);

  let pozaCR = [];
  if (fs.existsSync(plikCr)) {
    const tekst = fs.readFileSync(plikCr, 'utf8');
    const numeryCr = numeryZCr(tekst);
    pozaCR = cytowane.filter((n) => !numeryCr.has(n));
    const tabelaPozaCR = [...tabela.numery].filter((n) => !numeryCr.has(n));
    console.log(`CR:     ${numeryCr.size} numerów w ${plikCr}`);
    if (tabelaPozaCR.length > 0) {
      console.log(`\nUWAGA — tabela zawiera ${tabelaPozaCR.length} numerów spoza tego pliku CR (odśwież tabelę):`);
      tabelaPozaCR.slice(0, 20).forEach((n) => console.log('   ' + n));
    }
    if (zapisz) {
      const wydanie = argv[argv.indexOf('--wydanie') + 1] && argv.includes('--wydanie')
        ? argv[argv.indexOf('--wydanie') + 1]
        : (wydanieZCr(tekst) ?? path.basename(plikCr));
      const sha256 = crypto.createHash('sha256').update(tekst).digest('hex');
      // Tabela = (cytowane w kodzie ∪ już w tabeli) ∩ istniejące w CR.
      // Śmieci (cytaty-widma) NIE wchodzą — najpierw naprawa numeru, potem zapis.
      const doTabeli = new Set([...cytowane, ...tabela.numery].filter((n) => numeryCr.has(n)));
      const liczba = zapiszTabele(doTabeli, {
        wydanie,
        sha256,
        zrodlo: 'mirror nwgarne/mtg-data (rules/cr-raw.txt) — patrz docs/audits/AUDYT_PR135_2026-09-24b.md §0',
        pobrano: new Date().toISOString().slice(0, 10),
      });
      console.log(`\nZAPISANO tabelę: ${liczba} numerów (CR ${wydanie}, sha256 ${sha256.slice(0, 12)}…)`);
      process.exit(0);
    }
  } else if (zapisz) {
    console.error(`brak pliku CR: ${plikCr} (pobranie: patrz nagłówek tabeli / ADR 0030)`);
    process.exit(2);
  }

  if (pozaCR.length > 0) {
    console.log(`\nCYTATY POZA CR (${pozaCR.length}) — napraw numer albo dodaj fixture do WYKLUCZONE:`);
    pozaCR.forEach((n) => console.log('   CR ' + n));
  }
  if (pozaTabela.length > 0) {
    console.log(`\nCYTATY POZA TABELĄ (${pozaTabela.length}) — zweryfikuj w BIEŻĄCYM wydaniu i uruchom --zapisz:`);
    pozaTabela.forEach((n) => console.log('   CR ' + n));
  }
  const zle = pozaCR.length > 0 || pozaTabela.length > 0;
  console.log(zle ? '\nWYNIK: do poprawy.' : '\nWYNIK: OK (każdy cytat istnieje).');
  process.exit(zle ? 1 : 0);
}
