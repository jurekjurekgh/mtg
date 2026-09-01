// Spójność dokumentacji decyzji (ADR) i rejestru lekcji.
//
// Uwaga właściciela (2026-08-14): „Lepiej takie zasady zapisywać w jakichś
// generalnych zasadach projektu, a nie w handoffie, który jest jednorazowy
// i przepada". Reguły trwałe mieszkają więc w `docs/decisions/` (ADR) oraz
// `docs/LESSONS.md` — a te dokumenty muszą pozostać spójne z repozytorium,
// inaczej po kilku sesjach znów staną się nieaktualne.
//
// Test pilnuje kontraktu dokumentacji (nie treści merytorycznej):
//  - każdy plik ADR jest wpisany do tabeli w README i odwrotnie;
//  - numeracja plików zgadza się z numerem w nagłówku i linkiem w tabeli;
//  - każdy ADR ma wymagane sekcje i status ze słownika;
//  - `docs/LESSONS.md` istnieje, jest podlinkowany z AGENTS.md i ma lekcje
//    w spójnym formacie (LN + data).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DECISIONS_DIR = 'docs/decisions';
const README = path.join(DECISIONS_DIR, 'README.md');
const VALID_STATUSES = ['Proponowana', 'Zaakceptowana', 'Odrzucona', 'Zastąpiona', 'Wycofana'];

function adrFiles() {
  return fs.readdirSync(DECISIONS_DIR)
    .filter((name) => /^\d{4}-.*\.md$/.test(name))
    .sort();
}

function readmeRows() {
  const readme = fs.readFileSync(README, 'utf8');
  // Wiersze tabeli: | [0001](0001-....md) | Tytuł | Status |
  return [...readme.matchAll(/^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|([^|]+)\|([^|]+)\|/gm)]
    .map((m) => ({ number: m[1], link: m[2], title: m[3].trim(), status: m[4].trim() }));
}

test('ADR: każdy plik decyzji jest wpisany do tabeli w README', () => {
  const rows = readmeRows();
  const listed = new Set(rows.map((r) => r.link));
  for (const file of adrFiles()) {
    assert.ok(listed.has(file),
      `ADR ${file} istnieje, ale nie ma go w tabeli docs/decisions/README.md`);
  }
});

test('ADR: każdy wiersz tabeli wskazuje istniejący plik', () => {
  for (const row of readmeRows()) {
    const full = path.join(DECISIONS_DIR, row.link);
    assert.ok(fs.existsSync(full),
      `tabela README wskazuje nieistniejący plik: ${row.link}`);
  }
});

test('ADR: numer w nazwie pliku zgadza się z numerem w nagłówku i w tabeli', () => {
  const rows = new Map(readmeRows().map((r) => [r.link, r]));
  for (const file of adrFiles()) {
    const number = file.slice(0, 4);
    const content = fs.readFileSync(path.join(DECISIONS_DIR, file), 'utf8');
    const heading = content.match(/^#\s*ADR\s*(\d{4}):/m);
    assert.ok(heading, `${file}: brak nagłówka „# ADR NNNN: Tytuł"`);
    assert.equal(heading[1], number,
      `${file}: numer w nagłówku (${heading[1]}) różni się od numeru w nazwie pliku (${number})`);
    assert.equal(rows.get(file)?.number, number,
      `${file}: numer w tabeli README nie zgadza się z nazwą pliku`);
  }
});

test('ADR: każdy dokument ma status ze słownika i wymagane sekcje', () => {
  for (const file of adrFiles()) {
    const content = fs.readFileSync(path.join(DECISIONS_DIR, file), 'utf8');
    const status = content.match(/^-\s*\*\*Status:\*\*\s*(.+)$/m);
    assert.ok(status, `${file}: brak pola „**Status:**"`);
    const value = status[1].trim().split(' ')[0];
    assert.ok(VALID_STATUSES.includes(value),
      `${file}: nieznany status „${value}" (dozwolone: ${VALID_STATUSES.join(', ')})`);
    for (const section of ['## Kontekst', '## Decyzja', '## Konsekwencje']) {
      assert.ok(content.includes(section), `${file}: brak sekcji „${section}"`);
    }
  }
});

test('ADR 0017 (kompletność PlayerView) istnieje i jest zaakceptowany', () => {
  const file = adrFiles().find((name) => name.startsWith('0017-'));
  assert.ok(file, 'ADR 0017 (kontrakt widok↔kontroler) powinien istnieć');
  const content = fs.readFileSync(path.join(DECISIONS_DIR, file), 'utf8');
  assert.match(content, /\*\*Status:\*\*\s*Zaakceptowana/, 'ADR 0017 musi być zaakceptowany');
  // Reguła musi wprost wiązać widok z decyzjami kontrolera i chronić przed
  // odwrotnym błędem („wystawiajmy wszystko na zapas").
  assert.match(content, /PlayerView/, 'ADR 0017 musi mówić o PlayerView');
  assert.match(content, /na zapas/i, 'ADR 0017 musi zawierać zakaz wystawiania pól „na zapas"');
});

test('LESSONS: rejestr lekcji istnieje i ma spójny format wpisów', () => {
  assert.ok(fs.existsSync('docs/LESSONS.md'), 'docs/LESSONS.md musi istnieć (trwały rejestr lekcji)');
  const lessons = fs.readFileSync('docs/LESSONS.md', 'utf8');
  const entries = [...lessons.matchAll(/^##\s*(L\d+)\s*\((\d{4}-\d{2}-\d{2})\)\s*—\s*.+$/gm)];
  assert.ok(entries.length >= 1, 'rejestr lekcji musi mieć wpisy w formacie „## LN (YYYY-MM-DD) — tytuł"');
  const ids = entries.map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `zduplikowane identyfikatory lekcji: ${ids.join(', ')}`);
});

test('LESSONS i ADR są podlinkowane z AGENTS.md (żeby nowa sesja je przeczytała)', () => {
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /docs\/LESSONS\.md/,
    'AGENTS.md musi kierować do docs/LESSONS.md — inaczej rejestr lekcji zostanie pominięty');
  assert.match(agents, /docs\/decisions/,
    'AGENTS.md musi kierować do rejestru ADR');
  assert.match(agents, /docs\/setup\/ENVIRONMENT\.md/,
    'AGENTS.md musi kierować do docs/setup/ENVIRONMENT.md (pułapki środowiska)');
});

// ---------------------------------------------------------------------------
// Ograniczenia środowiska — dokument trwały, nie handoff
//
// Właściciel (2026-08-14): „nowa sesja nie ma dostępu do plików lokalnych starej
// sesji Areny, tylko do main i handoffa w formie wiadomości tekstowej"; pułapki
// (cofanie HEAD itd.) rozsiane po kilkunastu handoffach mają być w jednym,
// trwałym miejscu.
// ---------------------------------------------------------------------------

test('ENVIRONMENT: dokument istnieje i opisuje izolację sesji (main + prompt)', () => {
  assert.ok(fs.existsSync('docs/setup/ENVIRONMENT.md'),
    'docs/setup/ENVIRONMENT.md musi istnieć (trwały opis ograniczeń środowiska)');
  const env = fs.readFileSync('docs/setup/ENVIRONMENT.md', 'utf8');
  // Najważniejsza reguła: co przetrwa do następnej sesji.
  assert.match(env, /main/, 'ENVIRONMENT musi wskazywać main jako źródło stanu nowej sesji');
  assert.match(env, /prompt/i, 'ENVIRONMENT musi wspominać o pierwszym prompcie jako drugim źródle');
  assert.match(env, /git push/,
    'ENVIRONMENT musi zawierać regułę „praca istnieje dopiero po git push"');
});

test('ENVIRONMENT: opisuje reset workspace i procedurę odzyskania', () => {
  const env = fs.readFileSync('docs/setup/ENVIRONMENT.md', 'utf8');
  assert.match(env, /reflog/, 'ENVIRONMENT musi podawać reflog jako sposób rozpoznania resetu workspace');
  assert.match(env, /FETCH_HEAD/, 'ENVIRONMENT musi podawać procedurę odzyskania (fetch + reset)');
  assert.match(env, /cherry-pick/, 'ENVIRONMENT musi opisywać przeniesienie commita z main na gałąź sesji');
});

test('ENVIRONMENT: zbiera znane pułapki narzędzi (git checkout, token, sieć)', () => {
  const env = fs.readFileSync('docs/setup/ENVIRONMENT.md', 'utf8');
  for (const [pattern, description] of [
    [/git checkout/, 'pułapka git checkout cofającego własne zmiany'],
    [/GH_TOKEN/, 'wygasanie tokena GitHub'],
    [/Scryfall/, 'blokada egressu i pobieranie danych kart'],
  ]) {
    assert.match(env, pattern, `ENVIRONMENT powinien opisywać: ${description}`);
  }
});

test('AGENTS.md niesie regułę „praca istnieje dopiero po push" (nie tylko handoff)', () => {
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /Praca istnieje dopiero po `git push`/,
    'AGENTS.md musi zawierać regułę o pushowaniu — to najczęstsza przyczyna utraty pracy');
});

test('AGENTS.md jest plikiem startowym i każe czytać wszystkie ADR-y przed odpowiedzią', () => {
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  const head = agents.slice(0, 2500);
  assert.match(head, /jedyny plik startowy/i,
    'AGENTS.md musi na górze ogłaszać się jedynym plikiem startowym sesji');
  assert.match(head, /Czytaj zanim cokolwiek zrobisz/,
    'AGENTS.md musi mieć §0 „Czytaj zanim cokolwiek zrobisz” przed trybem sesji');
  assert.match(head, /Wszystkie ADR-y/,
    '§0 musi kazać czytać WSZYSTKIE ADR-y, nie „właściwe ADR-y obszaru”');
  assert.match(head, /0020-mandatory-session-workflow/,
    '§0 musi wskazywać ADR 0020 zanim agent zacznie pracę');
  assert.match(head, /LESSONS\.md/, '§0 musi wymieniać LESSONS przed stanem projektu');
  assert.match(head, /ENVIRONMENT\.md/, '§0 musi wymieniać ENVIRONMENT przed stanem projektu');

  const readme = fs.readFileSync('README.md', 'utf8');
  assert.match(readme.slice(0, 800), /AGENTS\.md/,
    'README musi na górze kierować agenta do AGENTS.md');

  const lessons = fs.readFileSync('docs/LESSONS.md', 'utf8');
  assert.match(lessons, /## L49 /, 'L49 opisuje, że luka była w kolejności lektur');
});


// ---------------------------------------------------------------------------
// Dokumentacja Żywego Testera — osie audytu i reguła naprawiania narzędzia
//
// Właściciel (2026-08-14): „Zapisz też w dokumentacji testera te osie
// poszukiwań — to się przyda na przyszłość. I że jeśli tester czegoś nie widzi
// albo nie obsługuje, to należy poprawiać także tester, a nie akceptować
// braków."
// ---------------------------------------------------------------------------

test('TESTER_STOLU: dokument opisuje trzy osie audytu', () => {
  const doc = fs.readFileSync('docs/setup/TESTER_STOLU.md', 'utf8');
  assert.match(doc, /Czego szukać/i, 'brak sekcji z checklistą audytu');
  assert.match(doc, /Oś 1[^\n]*bot/i, 'oś 1: bezsensowne działania bota');
  assert.match(doc, /Oś 2[^\n]*(informacj|log)/i, 'oś 2: kompletność informacji w logu/modalu');
  assert.match(doc, /Oś 3[^\n]*ptaszk/i, 'oś 3: ptaszki wyciszenia auto-pass');
  assert.match(doc, /poza szumem powinno tam być/i,
    'zasada właściciela o kompletności informacji musi być zacytowana wprost');
});

test('TESTER_STOLU: reguła „braki testera naprawia się w testerze"', () => {
  const doc = fs.readFileSync('docs/setup/TESTER_STOLU.md', 'utf8');
  assert.match(doc, /poprawiamy TESTER|poprawiasz .*run-game|tester też się naprawia/i,
    'dokument musi mówić wprost, że braki narzędzia naprawia się w narzędziu');
  assert.match(doc, /artefakt/i,
    'dokument musi uczyć odróżniania artefaktu narzędzia od błędu produktu');
});

test('AGENTS.md kieruje do osi audytu i reguły naprawiania testera', () => {
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  assert.match(agents, /osie audytu/i, 'AGENTS.md musi wspominać o osiach audytu');
  assert.match(agents, /Braki testera naprawia się w testerze/i,
    'AGENTS.md musi nieść regułę o naprawianiu narzędzia');
});

// ---------------------------------------------------------------------------
// M275: archiwum decyzji (docs/decisions/archive/)
//
// Do archiwum trafia decyzja, która PRZESTAŁA obowiązywać — i dopiero PO
// przeniesieniu wszystkich jej wciąż żywych ustaleń do dokumentu następcy.
// Archiwum jest poza lekturą startową, więc musi być pilnowane: dokument
// obowiązujący, który tam wyląduje, zniknie z pola widzenia sesji.
// ---------------------------------------------------------------------------

const ARCHIVE_DIR = path.join(DECISIONS_DIR, 'archive');

function archivedFiles() {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  return fs.readdirSync(ARCHIVE_DIR).filter((name) => /^\d{4}-.*\.md$/.test(name)).sort();
}

test('ADR archiwum: żadna zarchiwizowana decyzja nie ma statusu obowiązującego', () => {
  for (const name of archivedFiles()) {
    const tresc = fs.readFileSync(path.join(ARCHIVE_DIR, name), 'utf8');
    const status = tresc.match(/^-\s*\*\*Status:\*\*\s*(.+)$/m)?.[1] ?? '';
    assert.ok(
      /Zastąpiona|Wycofana|Odrzucona/.test(status),
      `${name}: w archiwum mogą leżeć wyłącznie decyzje zastąpione/wycofane/`
      + `odrzucone, a ta ma status „${status.trim()}". Decyzja obowiązująca `
      + 'w archiwum jest niewidoczna dla sesji (poza lekturą startową).',
    );
  }
});

test('ADR archiwum: każdy plik mówi, gdzie żyją jego zasady', () => {
  for (const name of archivedFiles()) {
    const tresc = fs.readFileSync(path.join(ARCHIVE_DIR, name), 'utf8');
    assert.match(
      tresc, /ZARCHIWIZOWANA \d{4}-\d{2}-\d{2}/,
      `${name}: brak noty archiwizacyjnej z datą — czytelnik nie wie, że to `
      + 'dokument historyczny.',
    );
    assert.match(
      tresc, /\.\.\/\d{4}-[a-z0-9-]+\.md/,
      `${name}: nota musi linkować do ADR-następcy, w którym żyją przeniesione `
      + 'zasady (link względny ../NNNN-...md).',
    );
  }
});

test('ADR archiwum: jest wpisane do tabeli archiwum w README', () => {
  const readme = fs.readFileSync(README, 'utf8');
  for (const name of archivedFiles()) {
    assert.ok(
      readme.includes(`archive/${name}`),
      `${name}: brak wiersza w sekcji „Archiwum" README — plik zniknąłby `
      + 'z rejestru bez śladu.',
    );
  }
});

test('ADR archiwum: zarchiwizowana decyzja nie jest cytowana jako obowiązująca', () => {
  // Kod i lektura startowa nie mogą odsyłać do archiwum jak do źródła zasad
  // (poza README i samym archiwum, gdzie odsyłacz jest historyczny).
  const zarchiwizowane = archivedFiles().map((n) => n.slice(0, 4));
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  for (const numer of zarchiwizowane) {
    assert.ok(
      !new RegExp(`ADR ${numer}\\b(?![^\\n]*archiw)`, 'i').test(agents),
      `AGENTS.md powołuje się na ADR ${numer}, który jest w archiwum — `
      + 'wskaż dokument następcy.',
    );
  }
});

// ---------------------------------------------------------------------------
// M275: wpisy zbiorcze w LESSONS.md
//
// Kilka lekcji opisywało tę samą klasę błędu. Zebrano je we wpisy zbiorcze:
// pełna reguła w jednym miejscu, pozostałe numery jako KOTWICE z odsyłaczem.
// Numery lekcji są cytowane w kodzie ~1150 razy, więc kotwica musi istnieć
// i realnie prowadzić do wpisu głównego.
// ---------------------------------------------------------------------------

test('LESSONS: mapa klas wskazuje istniejące lekcje, a kotwice prowadzą do wpisu głównego', () => {
  const lessons = fs.readFileSync('docs/LESSONS.md', 'utf8');
  const naglowki = new Set([...lessons.matchAll(/^##\s*(L\d+)\s*\(/gm)].map((m) => m[1]));

  const wiersze = [...lessons.matchAll(/^\|[^|\n]+\|\s*\*\*(L\d+)\*\*\s*\|([^|\n]*)\|/gm)];
  assert.ok(wiersze.length >= 5, 'mapa klas musi wymieniać wpisy zbiorcze');

  for (const [, glowny, kotwiceRaw] of wiersze) {
    assert.ok(naglowki.has(glowny), `mapa klas wskazuje nieistniejącą lekcję ${glowny}`);
    const kotwice = [...kotwiceRaw.matchAll(/L\d+/g)].map((m) => m[0]);
    for (const kotwica of kotwice) {
      assert.ok(
        naglowki.has(kotwica),
        `kotwica ${kotwica} (klasa ${glowny}) nie ma własnego nagłówka — numer `
        + 'cytowany w kodzie przestałby prowadzić gdziekolwiek',
      );
      // Treść kotwicy musi odsyłać do wpisu głównego.
      const od = lessons.indexOf(`## ${kotwica} (`);
      const nast = lessons.slice(od + 1).search(/^## L\d+ \(/m);
      const tresc = nast === -1 ? lessons.slice(od) : lessons.slice(od, od + 1 + nast);
      assert.ok(
        tresc.includes(`(#${glowny.toLowerCase()}-`) || tresc.includes(`[${glowny}]`),
        `${kotwica}: kotwica musi odsyłać do wpisu głównego ${glowny} `
        + '(inaczej czytelnik dostaje skrót bez reguły)',
      );
    }
  }
});

test('LESSONS: kotwica zachowuje własny KONKRET, nie jest samym odsyłaczem', () => {
  // Skrócenie lekcji nie może wyciąć faktów (karta, test, plik, numer CR) —
  // to one pozwalają rozpoznać klasę w nowym przebraniu.
  const lessons = fs.readFileSync('docs/LESSONS.md', 'utf8');
  const KOTWICE = ['L93', 'L94', 'L101', 'L61', 'L70', 'L26', 'L31', 'L44', 'L83', 'L40', 'L73', 'L75', 'L90'];
  for (const nr of KOTWICE) {
    const od = lessons.indexOf(`## ${nr} (`);
    assert.ok(od !== -1, `brak lekcji ${nr}`);
    const nast = lessons.slice(od + 1).search(/^## L\d+ \(/m);
    const tresc = nast === -1 ? lessons.slice(od) : lessons.slice(od, od + 1 + nast);
    const bezNaglowka = tresc.replace(/^##[^\n]*\n/, '').trim();
    assert.ok(
      bezNaglowka.length >= 300,
      `${nr}: kotwica skrócona do samego odsyłacza (${bezNaglowka.length} zn.) — `
      + 'musi zostać opis WŁASNEGO przypadku z faktami',
    );
  }
});
