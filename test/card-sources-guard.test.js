// M117 — strażnik ŹRÓDEŁ danych kart (ADR 0010 §2a, lekcja L23).
//
// Powód powstania: audyt PR #56 znalazł w katalogu adres ilustracji, którego
// nikt nigdy nie pobrał ze Scryfalla —
// `…/large/front/9/1/91b1f0f3-krumar-initiate.jpg` (Krumar Initiate). Adres
// wygląda jak prawdziwy, ale nie zawiera UUID druku i zwraca 404, więc karta
// pokazywała się na stole bez ilustracji.
//
// Dlaczego nie złapał tego istniejący strażnik (`test/card-data.test.js`,
// „imageUri każdej karty zgadza się z plikiem Scryfall”)? Bo ma klauzulę
// `if (!expected) continue` — brak pliku `docs/cards/scryfall-<id>.json`
// oznaczał BRAK WERYFIKACJI. Dwadzieścia kart batchy 33–34 weszło do katalogu
// bez pliku źródłowego i tą właśnie dziurą przeszedł zmyślony adres.
//
// Reguła (L23): dane istniejące w dwóch reprezentacjach dostają strażnika
// porównującego je maszynowo — a strażnik, który sam siebie wyłącza przy
// braku danych, wymaga drugiego strażnika na OBECNOŚĆ tych danych.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const SOURCE_DIR = 'docs/cards';

const sourcePath = (id) => `${SOURCE_DIR}/scryfall-${id}.json`;
const hasSource = (id) => fs.existsSync(sourcePath(id));
const readSource = (id) => JSON.parse(fs.readFileSync(sourcePath(id), 'utf8'));

/** Karty spoza toru „realna karta ze Scryfalla”: lądy podstawowe i tokeny. */
function isVirtual(card) {
  const types = card.types ?? [];
  return types.includes('Basic') || types.includes('Token') || card.set === null;
}

/** UUID druku wycięty z adresu obrazu (jedyna stabilna część adresu Scryfalla). */
function uuidFrom(url) {
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(url ?? '');
  return m ? m[1] : null;
}

/**
 * Normalizacja tekstu reguł do PORÓWNANIA (nie do wyświetlania):
 * literalne „\n” = nowa linia, przypisy w nawiasach (objaśnienia słów
 * kluczowych dopisywane przez Scryfall) i różnice cudzysłowów są nieistotne.
 */
function normalizeOracle(text) {
  return String(text ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\s*\([^()]*\)/g, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

test('adres cards.scryfall.io ZAWSZE zawiera UUID druku (nie da się go wymyślić)', () => {
  // Anty-zmyślanie: nazwa karty w ścieżce pliku to sygnał, że adres powstał
  // „z głowy”, a nie z odpowiedzi API. Prawdziwy adres to /<a>/<b>/<uuid>.jpg,
  // gdzie <a><b> to dwa pierwsze znaki UUID.
  const bad = [];
  for (const card of REGISTRY.all()) {
    const url = card.imageUri;
    if (!url || !url.includes('cards.scryfall.io')) continue;
    const uuid = uuidFrom(url);
    if (!uuid) { bad.push(`${card.id}: brak UUID w adresie → ${url}`); continue; }
    const dirs = /cards\.scryfall\.io\/[a-z_]+\/(?:front|back)\/([0-9a-f])\/([0-9a-f])\//.exec(url);
    if (!dirs) { bad.push(`${card.id}: adres bez katalogów <a>/<b> → ${url}`); continue; }
    if (dirs[1] !== uuid[0] || dirs[2] !== uuid[1]) {
      bad.push(`${card.id}: katalogi ${dirs[1]}/${dirs[2]} != początek UUID ${uuid.slice(0, 2)}`);
    }
  }
  assert.deepEqual(bad, [], `adresy ilustracji niezgodne ze schematem Scryfalla:\n  ${bad.join('\n  ')}`);
});

test('każda realna karta supported ma plik źródłowy docs/cards (ADR 0010 §2a)', () => {
  // Bez pliku źródłowego strażnik imageUri milczy — dlatego obecność pliku
  // jest wymagana, a nie „mile widziana”.
  const missing = [];
  for (const card of REGISTRY.supported()) {
    if (isVirtual(card)) continue;
    if (!hasSource(card.id)) missing.push(card.id);
  }
  assert.deepEqual(missing, [],
    `karty supported bez docs/cards/scryfall-<id>.json:\n  ${missing.join('\n  ')}\n`
    + 'Pobierz dane ze Scryfalla PRZED kodowaniem karty (ADR 0010 §2a) i zapisz plik.');
});

test('imageUri karty = adres druku z pliku źródłowego (co do UUID)', () => {
  const bad = [];
  for (const card of REGISTRY.all()) {
    if (!card.imageUri || !hasSource(card.id)) continue;
    const images = readSource(card.id).image_uris ?? {};
    const expected = uuidFrom(images.large ?? images.normal ?? null);
    const got = uuidFrom(card.imageUri);
    if (expected && got && expected !== got) bad.push(`${card.id}: ${got} != ${expected}`);
  }
  assert.deepEqual(bad, [], `imageUri niezgodne z plikiem źródłowym:\n  ${bad.join('\n  ')}`);
});

test('pliki źródłowe kart dwustronnych mają JEDEN kształt (card_faces)', () => {
  // M117: pliki DFC miały cztery różne kształty — `card_faces`, `faces`,
  // `oracle_text_front`/`oracle_text_back` oraz jeden string z prefiksami
  // „FRONT:”/„BACK:”. Każdy wariant to osobna gałąź w każdym czytniku, więc
  // porównanie tekstu po prostu je pomijało (dług z docs/TODO.md).
  // Kanonem jest kształt Scryfalla: tablica `card_faces` z `oracle_text`.
  const wrong = [];
  for (const file of fs.readdirSync(SOURCE_DIR)) {
    if (!file.startsWith('scryfall-') || !file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(`${SOURCE_DIR}/${file}`, 'utf8'));
    if (data.faces) wrong.push(`${file}: klucz 'faces' zamiast 'card_faces'`);
    if (data.oracle_text_front || data.oracle_text_back) {
      wrong.push(`${file}: 'oracle_text_front/back' zamiast 'card_faces'`);
    }
    if (typeof data.oracle_text === 'string' && /^FRONT:/m.test(data.oracle_text)) {
      wrong.push(`${file}: strony sklejone w jeden string 'FRONT:/BACK:'`);
    }
  }
  assert.deepEqual(wrong, [],
    `niekanoniczny zapis kart dwustronnych:\n  ${wrong.join('\n  ')}\n`
    + 'Użyj kształtu Scryfalla: card_faces: [{ name, oracle_text, … }].');
});

test('oracleText strony DFC = oracle_text tej strony w pliku źródłowym', () => {
  // Domknięcie długu: przód i tył karty dwustronnej to w katalogu DWIE
  // definicje (`transformTo`), a w pliku źródłowym dwa wpisy `card_faces`.
  // Dopasowanie idzie po NAZWIE strony, więc test nie zakłada kolejności.
  //
  // Porównujemy WYŁĄCZNIE layout `transform`: tam dwie strony to dwie odrębne
  // karty (i dwie definicje w katalogu połączone `transformTo`). Layout
  // `adventure` (Gray Slaad) to JEDNA karta z dwiema częściami — katalog
  // celowo trzyma oba teksty w jednym `oracleText`, więc porównanie „strona
  // po stronie” dałoby tam fałszywy alarm.
  const byFaceName = new Map();
  for (const file of fs.readdirSync(SOURCE_DIR)) {
    if (!file.startsWith('scryfall-') || !file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(`${SOURCE_DIR}/${file}`, 'utf8'));
    if (data.layout !== 'transform') continue;
    for (const face of data.card_faces ?? []) {
      if (face.name && typeof face.oracle_text === 'string') {
        byFaceName.set(face.name, face.oracle_text);
      }
    }
  }
  assert.ok(byFaceName.size >= 10, 'pliki DFC muszą dostarczać tekst stron');

  const drift = [];
  for (const card of REGISTRY.all()) {
    if (!card.oracleText || !byFaceName.has(card.name)) continue;
    const expected = normalizeOracle(byFaceName.get(card.name));
    const got = normalizeOracle(card.oracleText);
    if (expected && got !== expected) {
      drift.push(`${card.id} (${card.name}):\n      katalog : ${got}\n      scryfall: ${expected}`);
    }
  }
  assert.deepEqual(drift, [],
    `tekst strony karty dwustronnej rozjeżdża się ze źródłem:\n  ${drift.join('\n  ')}`);
});

test('oracleText karty = oracle_text z pliku źródłowego (tekst reguł nie dryfuje)', () => {
  // Cellar Door miał w katalogu „Target player mills 1”, a Oracle mówi
  // „puts the bottom card of their library into their graveyard” — mechanika
  // (mill_from_bottom) była poprawna, ale gracz czytał w UI inną kartę.
  //
  // Porównanie pomija pliki bez `oracle_text` (karty dwustronne trzymają tekst
  // w `card_faces`) oraz przypisy w nawiasach — katalog zapisuje treść reguł,
  // a Scryfall dokleja do niej objaśnienia słów kluczowych.
  const drift = [];
  for (const card of REGISTRY.all()) {
    if (!card.oracleText || !hasSource(card.id)) continue;
    const source = readSource(card.id);
    if (!source.oracle_text) continue;               // DFC: tekst w card_faces
    if (/^FRONT:/m.test(source.oracle_text)) continue; // zapis dwustronny w pliku
    const expected = normalizeOracle(source.oracle_text);
    const got = normalizeOracle(card.oracleText);
    if (expected && got !== expected) drift.push(`${card.id}:\n      katalog : ${got}\n      scryfall: ${expected}`);
  }
  assert.deepEqual(drift, [],
    `oracleText rozjeżdża się z plikiem źródłowym:\n  ${drift.join('\n  ')}\n`
    + 'Tekst karty w katalogu ma być wydrukiem Oracle — inaczej gracz czyta w UI inną kartę.');
});

// =============================================================================
// M122/#3 — STRAŻNIK: każdy event triggera ma polską etykietę dla gracza.
//
// Żywy Tester (mechanicy vs graveyard, seed 2002) pokazał w logu surowy slug:
// „Chronic Flooding — trigger (enchanted_permanent_tapped)". `describeGameEvent`
// ma fallback `TRIGGER_EVENT_LABELS[e.trigger] ?? e.trigger`, więc brak wpisu
// nie wywala się — po prostu WYCIEKA identyfikator do oczu gracza.
//
// Audyt wszystkich eventów w bazie wykazał wtedy DWA braki: drugi (Tiller of
// Flesh) czekał tylko na odpowiednią partię. Dlatego zamiast poprawiać slug
// po slugu, pilnujemy niezmiennika: każdy `trigger.event` użyty w card-data.js
// musi mieć wpis w TRIGGER_EVENT_LABELS. Nowa karta z nowym triggerem zapala
// ten test, zanim gracz zobaczy surowy identyfikator.
// =============================================================================

test('M122: każdy event triggera z bazy kart ma polską etykietę', async () => {
  const { TRIGGER_EVENT_LABELS } = await import('../src/table/session.js');
  const registry = createCardRegistry();
  const missing = new Map();
  for (const card of registry.all()) {
    for (const ability of card.abilities ?? []) {
      const event = ability?.trigger?.event;
      if (!event || TRIGGER_EVENT_LABELS[event]) continue;
      if (!missing.has(event)) missing.set(event, []);
      missing.get(event).push(card.name);
    }
  }
  // M122/#6: eventy triggerów rodzi też SILNIK (triggers.js: `delayed`
  // dla „exile at end of turn"/reanimate), nie tylko baza kart — pierwsza
  // wersja strażnika ich nie widziała i „trigger (delayed)" dalej wyciekał.
  // PR #98 (Żywy Tester, „trigger (storm)"): pseudo-zdolności triggerowe rodzą
  // się też POZA triggers.js (storm w spells.js) i w innej składni
  // (`trigger: Object.freeze({ event: … })`). Zasięg skanu = zasięg KLASY
  // (L113), nie plik z pierwszym przypadkiem — skanujemy CAŁY src/engine.
  const engineFiles = fs.readdirSync('src/engine')
    .filter((f) => f.endsWith('.js')).map((f) => `src/engine/${f}`);
  for (const file of engineFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/trigger: (?:Object\.freeze\()?\{ event: '([a-z0-9_]+)'/g)) {
      const event = match[1];
      if (TRIGGER_EVENT_LABELS[event]) continue;
      if (!missing.has(event)) missing.set(event, []);
      missing.get(event).push(file);
    }
  }
  const report = [...missing.entries()]
    .map(([event, cards]) => `${event} (${cards.slice(0, 3).join(', ')})`)
    .join('; ');
  assert.equal(missing.size, 0,
    `eventy triggerów bez etykiety wyciekną do logu gracza: ${report}`);
});

// =============================================================================
// M122/#5 — STRAŻNIK: każdy typ efektu ma polski opis w panelu akcji.
//
// Żywy Tester (ostrza vs wiedzmin, seed 3005) pokazał w panelu:
// „Aktywuj: Kazuul's Toll Collector — efekt (attach_equipment_to_source)".
// `describeEffect` ma fallback `efekt (${e.type})`, więc brak wpisu nie psuje
// gry — po prostu pokazuje graczowi surowy identyfikator z kodu.
//
// Audyt wszystkich 121 typów efektów w bazie wykazał 9 braków; tester trafił
// jeden, bo pozostałe wymagały rzadkich układów partii. Niezmiennik pilnuje
// całej rodziny, żeby kolejna karta nie przemyciła sluga do panelu.
// =============================================================================

test('M122: każdy typ efektu z bazy kart ma polski opis w panelu', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const start = source.indexOf('const generic = {');
  const end = source.indexOf('const fn = generic[e.type];');
  assert.ok(start > 0 && end > start, 'mapa opisów efektów jest na swoim miejscu');
  const known = new Set([...source.slice(start, end).matchAll(/^ {4}([a-z0-9_]+):/gm)].map((m) => m[1]));

  const registry = createCardRegistry();
  const missing = new Map();
  const note = (effect, cardName) => {
    if (!effect || typeof effect.type !== 'string' || !effect.type) return;
    if (known.has(effect.type)) return;
    if (!missing.has(effect.type)) missing.set(effect.type, []);
    missing.get(effect.type).push(cardName);
  };
  for (const card of registry.all()) {
    for (const effect of card.spell?.effects ?? []) note(effect, card.name);
    for (const mode of card.spell?.modes ?? []) {
      for (const effect of mode.effects ?? []) note(effect, card.name);
    }
    for (const ability of card.abilities ?? []) {
      const effects = Array.isArray(ability.effect) ? ability.effect : (ability.effect ? [ability.effect] : []);
      for (const effect of effects) note(effect, card.name);
    }
  }
  const report = [...missing.entries()]
    .map(([type, cards]) => `${type} (${cards.slice(0, 3).join(', ')})`)
    .join('; ');
  assert.equal(missing.size, 0,
    `typy efektów bez polskiego opisu pokażą surowy slug w panelu: ${report}`);
});

// =============================================================================
// M124/C — STRAŻNIK: nazwy trybów modalnych są po polsku.
//
// Zgłoszenie właściciela: „Rzuć: Steel Sabotage — Kontr … chyba powinno być
// Kontra nie Kontr". Audyt wszystkich 16 nazw trybów w bazie wykazał, że obok
// ucdiętego „Kontr" siedziały cztery nazwy wprost po ANGIELSKU („Destroy
// artifact", „Destroy land", „Destroy both", „Pump") — właściciel ich nie
// zgłosił, bo te karty nie trafiły mu do ręki.
//
// Nazwa trybu jest widoczna w panelu „Twoje działania", więc musi być polska.
// Heurystyka: odrzucamy nazwy złożone wyłącznie ze słów wyglądających na
// angielskie. Lista wyjątków jest pusta — gdyby kiedyś była potrzebna
// (np. nazwa własna), dopisz ją świadomie razem z uzasadnieniem.
// =============================================================================

test('M124: nazwy trybów modalnych są po polsku', () => {
  const registry = createCardRegistry();
  // Słowa-sygnały: typowe angielskie czasowniki/rzeczowniki z tekstów Oracle.
  const ENGLISH = /^(destroy|counter|pump|bounce|exile|draw|return|create|target|gain|lose|deal|damage|both|artifact|land|creature|player|card)$/i;
  const offenders = [];
  for (const card of registry.all()) {
    for (const mode of card.spell?.modes ?? []) {
      const name = mode?.name;
      if (!name) continue;
      const words = name.split(/\s+/).filter(Boolean);
      // Nazwa jest podejrzana, gdy KAŻDE słowo wygląda na angielskie.
      if (words.length > 0 && words.every((w) => ENGLISH.test(w))) {
        offenders.push(`${card.name}: „${name}”`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `nazwy trybów widoczne w panelu muszą być po polsku: ${offenders.join('; ')}`);
});

test('M124: Steel Sabotage ma tryb „Kontra" (nie ucięte „Kontr")', () => {
  const card = createCardRegistry().get('steel-sabotage');
  const names = (card.spell?.modes ?? []).map((m) => m.name);
  assert.ok(names.includes('Kontra'), `tryby Steel Sabotage: ${names.join(', ')}`);
  assert.ok(!names.includes('Kontr'), 'ucięta forma „Kontr" nie może wrócić');
});

// =============================================================================
// M126/#4 i #5 — STRAŻNIKI kompletności map tekstów dla gracza.
//
// Żywy Tester pokazał w tekście kafli surowe slugi: „cel: creature_without_
// subtype", „cel: equipment_you_control" (51 wystąpień) oraz licznik „stun×2"
// (37 wystąpień). Za każdym razem winny był fallback `MAPA[key] ?? key` —
// nie wywala się, nie ostrzega, po prostu wypuszcza identyfikator do UI (L29).
//
// Audyt całych rodzin wykazał, że tester trafił mniejszość braków: 2 z 6
// typów celu i 1 z 2 liczników. Reszta czekała na rzadszy układ partii.
// Dlatego pilnujemy niezmiennika, a nie pojedynczych slugów.
// =============================================================================

/** Klucze mapy `const NAZWA = Object.freeze({ ... })` ze źródła render.js. */
function labelMapKeys(source, mapName) {
  const start = source.indexOf(`const ${mapName} = Object.freeze({`);
  assert.ok(start > 0, `mapa ${mapName} istnieje w render.js`);
  const body = source.slice(start, source.indexOf('});', start));
  return new Set([...body.matchAll(/'?([a-zA-Z0-9_+/-]+)'?\s*:/g)].map((m) => m[1]));
}

test('M126: każdy typ celu z bazy kart ma polską etykietę', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const known = labelMapKeys(source, 'TARGET_TYPE_LABELS');
  const registry = createCardRegistry();
  const missing = new Map();
  const note = (type, cardName) => {
    if (!type || known.has(type)) return;
    if (!missing.has(type)) missing.set(type, []);
    missing.get(type).push(cardName);
  };
  for (const card of registry.all()) {
    for (const target of card.spell?.targets ?? []) note(target?.type, card.name);
    for (const mode of card.spell?.modes ?? []) {
      for (const target of mode.targets ?? []) note(target?.type, card.name);
    }
    for (const ability of card.abilities ?? []) {
      for (const target of ability.targets ?? []) note(target?.type, card.name);
      note(ability.trigger?.requiresTarget?.type, card.name);
    }
  }
  const report = [...missing.entries()].map(([t, cards]) => `${t} (${cards.slice(0, 2).join(', ')})`).join('; ');
  assert.equal(missing.size, 0, `typy celu bez etykiety pokażą surowy slug graczowi: ${report}`);
});

test('M126: każdy licznik z bazy kart ma polską etykietę', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const known = labelMapKeys(source, 'COUNTER_LABELS');
  const registry = createCardRegistry();
  const missing = new Map();
  const note = (counter, cardName) => {
    if (!counter || known.has(counter)) return;
    if (!missing.has(counter)) missing.set(counter, []);
    missing.get(counter).push(cardName);
  };
  for (const card of registry.all()) {
    for (const effect of card.spell?.effects ?? []) note(effect?.counter, card.name);
    for (const mode of card.spell?.modes ?? []) {
      for (const effect of mode.effects ?? []) note(effect?.counter, card.name);
    }
    for (const ability of card.abilities ?? []) {
      const effects = Array.isArray(ability.effect) ? ability.effect : (ability.effect ? [ability.effect] : []);
      for (const effect of effects) note(effect?.counter, card.name);
    }
  }
  const report = [...missing.entries()].map(([c, cards]) => `${c} (${cards.slice(0, 2).join(', ')})`).join('; ');
  assert.equal(missing.size, 0, `liczniki bez etykiety pokażą surowy slug na kaflu: ${report}`);
});
