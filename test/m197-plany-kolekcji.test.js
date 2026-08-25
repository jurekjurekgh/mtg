// M197 — strazniki DANYCH PLANOW kolekcji (zgloszenie wlasciciela 2026-08-23).
//
// Powod powstania: M196 oglosilo „nowy plan w katalogu: Kamigawa" i wpisalo te
// teze do trzech dokumentow oraz do asercji testu Batcha 48. Wlasciciel to
// zakwestionowal — plan Kamigawa istnial JUZ wczesniej (Blade-Blizzard Kitsune,
// Kappa Tech-Wrecker, Greater Tanuki w katalogu; dodatkowo The Kami War
// w slowniku kolekcji). Clawing Torment byl CZWARTA karta tego planu.
//
// Klasa bledu L1 (opis kłamie mimo poprawnych danych), tym razem w dokumentacji
// i w tescie. Naprawa u zrodla = maszynowy straznik zamiast samej korekty zdan:
// dokument nie moze nazwac planu „nowym", jesli katalog albo slownik juz go
// znaja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseCSV, pickArtId, artIdsBySetFromRows } from '../tools/fetch-art-ids.mjs';

const CSV_PATH = 'tools/collection-art-ids.csv';
const REGISTRY = createCardRegistry();

/** Wiersze slownika kolekcji bez naglowka. */
function collectionRows() {
  return parseCSV(fs.readFileSync(CSV_PATH, 'utf8')).slice(1);
}

/** Plany wystepujace w slowniku kolekcji (kolumna „Plan"). */
export function plansInCollection() {
  const plans = new Set();
  for (const row of collectionRows()) {
    const plan = (row[2] ?? '').trim();
    if (plan) plans.add(plan);
  }
  return plans;
}

/** Plany wystepujace w katalogu kart. */
function plansInCatalog() {
  const plans = new Map();
  for (const card of REGISTRY.all()) {
    if (!card.plan) continue;
    plans.set(card.plan, (plans.get(card.plan) ?? 0) + 1);
  }
  return plans;
}

test('M197: „Kamigawa" NIE byla nowym planem — katalog i slownik znaly ja wczesniej', () => {
  const catalog = plansInCatalog();
  // Zarzut wlasciciela: karty tego planu byly w repo przed Batchem 48.
  const kamigawa = REGISTRY.all().filter((card) => card.plan === 'Kamigawa').map((card) => card.name);
  assert.ok(kamigawa.includes('Blade-Blizzard Kitsune'), 'Blade-Blizzard Kitsune to Kamigawa (Batch 40)');
  assert.ok(kamigawa.includes('Kappa Tech-Wrecker'), 'Kappa Tech-Wrecker to Kamigawa (Batch 1)');
  assert.ok(kamigawa.includes('Greater Tanuki'), 'Greater Tanuki to Kamigawa');
  assert.ok(catalog.get('Kamigawa') >= 4, 'Clawing Torment byl CZWARTA karta planu, nie pierwsza');
  assert.ok(plansInCollection().has('Kamigawa'), 'slownik kolekcji tez znal ten plan');
});

test('M197: dokumentacja nie oglasza „nowego planu", ktory juz istnial', () => {
  const known = new Set([...plansInCatalog().keys(), ...plansInCollection()]);
  // Skanujemy dokumenty stanu i plany sesji: zdanie „nowy plan … <Nazwa>"
  // musi dotyczyc planu, ktorego repozytorium NIE zna.
  const files = [
    'docs/PROJECT_HISTORY.md',
    ...fs.readdirSync('docs/plans').map((name) => `docs/plans/${name}`),
  ];
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      // Dokument sprostowania musi moc ZACYTOWAC bledne zdanie. Zwolnienie
      // jest jawne i intencjonalne — marker w tej samej linii.
      // (Pierwsza wersja filtrowala po slowach typu „sprostowanie" gdziekolwiek
      // w linii; mutacja pokazala dziure: zdanie obok slowa-klucza znikalo
      // z kontroli. Marker jest niepodrabialny przez przypadek.)
      if (line.includes('<!-- plan-cytat -->')) continue;
      const m = /now[yaąe]\s+plan[a-ząćęłńóśźż]*\s*(?:w katalogu)?[:\s]*\**([A-ZŚŻŹĆŁ][\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ' -]*)/i.exec(line);
      if (!m) continue;
      const name = m[1].replace(/\*+$/, '').trim();
      if (known.has(name)) offenders.push(`${file}: „${line.trim()}"`);
    }
  }
  assert.deepEqual(offenders, [], 'plan nazwany „nowym" musi byc nieznany repozytorium');
});

test('M197: „Swiat Wiedzmina" to alias planu „Wiedzmin" — nie osobny plan w danych', () => {
  // Decyzja wlasciciela 2026-08-23: „Swiat Wiedzmina to po prostu Wiedzmin".
  const catalog = plansInCatalog();
  assert.equal(catalog.has('Świat Wiedźmina'), false, 'katalog uzywa nazwy „Wiedźmin"');
  assert.equal(plansInCollection().has('Świat Wiedźmina'), false, 'slownik kolekcji tak samo');
});

// --- Higiena slownika kolekcji (M197/K2) ---------------------------------
//
// Zgloszenie wlasciciela zaczelo sie od listy „planow", w ktorej byly nazwy
// kart (Trestle Troll, Lab Rats, Anthem of Champions...). Powod: 10 wierszy
// pliku NIE MIALO kolumny Plan, wiec czytanie „ostatniej kolumny" zwracalo
// dla nich nazwe karty. Kazdy z tych wierszy byl DUBLETEM pozycji obecnej
// wyzej w komplecie. Straznik pilnuje ksztaltu pliku, zeby taki wiersz nie
// wrocil i nie zatruwal zadnej analizy.

test('M197/K2: kazdy wiersz slownika ma komplet 3 kolumn z niepustym planem', () => {
  const rows = collectionRows();
  const broken = rows
    .map((row, index) => ({ line: index + 2, row }))
    .filter(({ row }) => row.length !== 3 || !(row[2] ?? '').trim());
  assert.deepEqual(broken.map(({ line, row }) => `${line}: ${row.join(',')}`), [],
    'wiersz bez kolumny Plan udaje plan o nazwie karty przy czytaniu ostatniej kolumny');
});

test('M197/K2: slownik nie zawiera zdublowanych pozycji (artId + nazwa)', () => {
  const seen = new Map();
  const dups = [];
  collectionRows().forEach((row, index) => {
    const key = `${(row[0] ?? '').trim()}|${(row[1] ?? '').trim()}`;
    if (seen.has(key)) dups.push(`linia ${index + 2}: ${key} (dubel linii ${seen.get(key)})`);
    else seen.set(key, index + 2);
  });
  assert.deepEqual(dups, [], 'ta sama ilustracja i nazwa moze wystapic tylko raz');
});

// --- Spojnosc planow: katalog vs slownik kolekcji (M197/K3) --------------
//
// Zgloszenie wlasciciela: „65STX,Curate,Arcavios / 302BRO,Curate,Arcavios —
// dla tych dwoch kart kazda edycja powinna miec przypisany inny plan".
// Naprawione u zrodla w tools/fetch-plans.mjs (zapis kolumny Plan jest teraz
// set-aware). Ten straznik pilnuje SKUTKU: plan karty w katalogu musi zgadzac
// sie z planem jej DRUKU w slowniku kolekcji.
//
// Slownik odwzorowuje arkusz wlasciciela, wiec jest zrodlem prawdy dla planu.
// Rozjazd oznacza, ze ktos zgadl plan po secie zamiast go odczytac.

/** Plan druku z kolekcji: dopasowanie po secie karty (jak pickArtId). */
function collectionPlanFor(card, bySet) {
  const entries = bySet.get(card.name.toLowerCase());
  if (!entries?.length) return undefined;
  const exact = entries.find((e) => e.set && e.set.toUpperCase() === String(card.set ?? '').toUpperCase());
  return (exact ?? entries[0]).plan;
}

test('M197/K3: plan kazdej karty w katalogu zgadza sie z jej DRUKIEM w kolekcji', () => {
  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  const bySet = new Map();
  for (const row of rows.slice(1)) {
    const art = (row[0] ?? '').trim();
    const name = (row[1] ?? '').trim();
    const plan = (row[2] ?? '').trim();
    const num = art.match(/^\d+/);
    if (!name || !num) continue;
    const set = art.slice(num[0].length).toUpperCase().replace(/^_+/, '');
    if (!bySet.has(name.toLowerCase())) bySet.set(name.toLowerCase(), []);
    bySet.get(name.toLowerCase()).push({ plan, set });
  }
  const mismatches = [];
  for (const card of REGISTRY.all()) {
    if (!card.plan || !card.name) continue;
    const expected = collectionPlanFor(card, bySet);
    if (expected && expected !== card.plan) {
      mismatches.push(`${card.name} (${card.set}): katalog „${card.plan}" vs kolekcja „${expected}"`);
    }
  }
  assert.deepEqual(mismatches, [], 'plan czyta sie z kolekcji, nie zgaduje po secie');
});

test('M197/K3: dwa druki tej samej karty maja WLASNE plany (Curate, Negate)', () => {
  const byName = artIdsBySetFromRows(parseCSV(fs.readFileSync(CSV_PATH, 'utf8')));
  // artId nadal rozstrzyga sie po secie — to samo zrodlo prawdy co plan.
  assert.equal(pickArtId(byName.get('curate'), 'STX'), 65);
  assert.equal(pickArtId(byName.get('curate'), 'BRO'), 302);
  const curate = REGISTRY.get('curate-stx');
  const curateBro = REGISTRY.get('curate');
  assert.equal(curate.plan, 'Arcavios');
  assert.equal(curateBro.plan, 'Forgotten Realms');
  assert.notEqual(curate.plan, curateBro.plan, 'rozne druki = rozne plany (zlecenie Batcha 47)');
  assert.equal(REGISTRY.get('negate-m15').plan, 'Warhammer Fantasy');
  assert.equal(REGISTRY.get('negate').plan, 'Wiedźmin');
});

// --- M197/K4: BRAK artId tez jest bledem ---------------------------------
//
// Wlasciciel 2026-08-23: „Wszystkie karty maja numery ilustracji i plany.
// (...) Wydaje mi sie jednak, ze miales sciagniety CSV gdzie bylo wszystko".
// Zgadza sie — CSV zna numer KAZDEJ z 21 kart, ktore w katalogu mialy
// `artId: null`. Numery nigdy nie zostaly przeniesione do katalogu.
//
// ROOT CAUSE straznika: `test/art-ids-tool.test.js` filtruje
// `card.artId != null`, wiec sprawdza wylacznie karty, KTORE JUZ MAJA numer.
// Karta bez numeru byla dla niego niewidzialna — dokladnie pulapka L23
// („straznik, ktory sam siebie wylacza przy braku danych, wymaga drugiego
// straznika na OBECNOSC tych danych").

/** Karty spoza toru realnych drukow: landy podstawowe, tokeny, atrapy testowe. */
function isVirtualCard(card) {
  const types = card.types ?? [];
  return types.includes('Basic') || types.includes('Token') || card.set == null;
}

test('M197/K4: kazda realna karta ma artId, gdy slownik kolekcji go zna', () => {
  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
  const bySet = artIdsBySetFromRows(rows);
  const missing = [];
  for (const card of REGISTRY.all()) {
    if (isVirtualCard(card) || card.artId != null) continue;
    const known = pickArtId(bySet.get(card.name.toLowerCase()) ?? [], card.set);
    if (known != null) missing.push(`${card.name} (${card.set}): slownik ma ${known}, katalog null`);
  }
  assert.deepEqual(missing, [], 'numer ilustracji jest w kolekcji — trzeba go przeniesc do katalogu');
});

test('M197/K4: kazda realna karta ma plan (kolekcja opisuje plan wszystkich)', () => {
  const withoutPlan = REGISTRY.all()
    .filter((card) => !isVirtualCard(card) && !card.plan)
    .map((card) => `${card.name} (${card.set})`);
  assert.deepEqual(withoutPlan, [], 'realna karta bez planu');
});

test('M197/K4: definicja karty nie ma ZDUBLOWANYCH pol artId/plan', () => {
  // W literale JS druga wartosc nadpisuje pierwsza po cichu, wiec
  // „artId: 47, plan: null," + „plan: 'Mirrodin'," w kolejnej linii DZIALALO
  // przypadkiem. Taki zapis to mina: przestawienie linii zmienia dane.
  const src = fs.readFileSync('src/cards/card-data.js', 'utf8');
  const offenders = [];
  for (const block of src.match(/id: '[^']+'[\s\S]*?\n\s*support:/g) ?? []) {
    const id = /id: '([^']+)'/.exec(block)?.[1] ?? '?';
    for (const field of ['artId', 'plan']) {
      const count = (block.match(new RegExp(`\\b${field}:`, 'g')) ?? []).length;
      if (count > 1) offenders.push(`${id}: pole ${field} wystepuje ${count}x`);
    }
  }
  assert.deepEqual(offenders, [], 'kazde pole definicji wystepuje dokladnie raz');
});

