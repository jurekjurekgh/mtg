// Audyt batcha 64 / R-3 — STRAŻ katalog–snapshot (PR #159).
//
// Źródłem porównania są snapshoty właściciela w `docs/cards/`. Test nie może
// uznawać luk pokrycia za zielony wynik: dokładna lista brakujących snapshotów
// i osierocony snapshot są przypięte osobno. Dla kart wielostronnych cechy
// porównujemy z przednią twarzą, jeśli snapshot ją rozbija w `card_faces`.
//
// Granice danych:
//   • `cmc` jest snapshotowym polem mana value; tokeny mają inny koszt druku niż
//     reprezentacja tokenu w katalogu, więc nie porównujemy tokenowego MV/setu;
//   • P/T z `*`, X lub `+` jest dynamiczne i nie jest tu przypinane;
//   • Scryfall top-level `keywords` może agregować obie strony oraz keyword
//     actions. Kierunek odwrotny ograniczony jest do jawnej listy keyword
//     abilities modelowanych przez `def.keywords`; DFC muszą też drukować je na
//     froncie. Devoid jest mapowane na kolor, a `transform` pomijane jako akcja.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCardRegistry } from '../src/cards/card-data.js';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KATALOG_SNAPSHOTOW = path.join(KORZEN, 'docs', 'cards');
const registry = createCardRegistry();

// Właściciel dopuszcza brak snapshotu dla tych 55 wpisów; każdy nowy wyjątek
// wymaga jawnej aktualizacji tej listy albo dodania snapshotu do repo.
const BEZ_SNAPSHOTU = Object.freeze([
  'balamb-garden-airborne',
  'ballista-wielder',
  'basic-forest',
  'basic-island',
  'basic-mountain',
  'basic-plains',
  'basic-swamp',
  'dire-strain-brawler',
  'guidestone-compass',
  'homicidal-brute',
  'krallenhorde-wantons',
  'shiva-warden-of-ice',
  'token_bird_chocobo',
  'token_bird_soldier',
  'token_cat',
  'token_clone',
  'token_clue',
  'token_dinosaur',
  'token_eldrazi_scion',
  'token_elemental',
  'token_food',
  'token_forest_dryad',
  'token_germ',
  'token_goblin',
  'token_goblin_construct',
  'token_hero',
  'token_human',
  'token_human_citizen',
  'token_incubator',
  'token_insect',
  'token_kithkin',
  'token_knight',
  'token_merfolk',
  'token_mutagen',
  'token_orc_army',
  'token_phyrexian',
  'token_phyrexian_mite',
  'token_powerstone',
  'token_rat',
  'token_reliquary_dragon',
  'token_robot',
  'token_skeleton',
  'token_soldier',
  'token_soldier_lifelink',
  'token_spirit',
  'token_spirit_flying',
  'token_squirrel',
  'token_thopter',
  'token_treasure',
  'token_vampire_demon',
  'token_wizard',
  'token_wolf',
  'token_zombie',
  'token_zombie_army',
  'wing-shredder',
]);
const OSIEROCONE_SNAPSHOTY = Object.freeze(['undercity']);

// Słowa-umowne (ability words, CR 207.2c) — same nie są zdolnościami.
const ABILITY_WORDS = new Set(['clash', 'delirium', 'delve', 'keen_sight', 'landwalk', 'radiance']);

// Jawny zakres odwrotnej straży: keyword abilities, których katalog używa w
// `def.keywords`. Nie obejmuje keyword actions (np. transform/incubate/scry)
// ani morph/saddle, które mają osobne deskryptory (`def.morph`, abilities).
const MODELOWANE_KEYWORD_ABILITIES = new Set([
  'changeling', 'daybound', 'deathtouch', 'defender', 'double_strike', 'echo',
  'exalted', 'first_strike', 'flash', 'flying', 'haste', 'infect', 'level_up',
  'lifelink', 'menace', 'nightbound', 'outlast', 'persist', 'reach', 'toxic',
  'training', 'trample', 'vigilance',
]);
const ODDZIELNE_REPREZENTACJE_KEYWORDOW = Object.freeze({
  morph: (def) => Boolean(def.morph),
  saddle: (def) => (def.abilities ?? []).some((ability) => ability.keyword === 'saddle'),
});

function snapshot(id) {
  const p = path.join(KATALOG_SNAPSHOTOW, `scryfall-${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function frontFace(snap) {
  return Array.isArray(snap.card_faces) && snap.card_faces.length > 0
    ? snap.card_faces[0]
    : null;
}

function wielostronna(snap) {
  return (Array.isArray(snap.card_faces) && snap.card_faces.length > 1)
    || String(snap.type_line ?? '').includes('//');
}

function frontName(snap) {
  const face = frontFace(snap);
  if (typeof face?.name === 'string' && face.name.length > 0) return face.name;
  return String(snap.name ?? '').split('//')[0].trim();
}

function frontTypeLine(snap) {
  const face = frontFace(snap);
  if (typeof face?.type_line === 'string') return face.type_line;
  if (typeof snap.type_line === 'string') return snap.type_line.split('//')[0].trim();
  return null;
}

function frontOracleText(snap) {
  const face = frontFace(snap);
  if (typeof face?.oracle_text === 'string') return face.oracle_text;
  if (typeof snap.oracle_text === 'string') return snap.oracle_text.split(/\s+\/\/\s+/)[0];
  return null;
}

function frontDefinitionOracleText(def, snap) {
  let text = String(def.oracleText ?? '');
  const faces = Array.isArray(snap.card_faces) ? snap.card_faces : [];
  // Adventure Gray Slaad: katalog oracleText dokleja nazwę/koszt drugiej twarzy;
  // reguły stwora porównujemy z `card_faces[0]`, po odcięciu tej etykiety.
  if (def.adventure && typeof faces[1]?.name === 'string') {
    const label = `\n${faces[1].name} —`;
    const labelAt = text.indexOf(label);
    if (labelAt >= 0) text = text.slice(0, labelAt);
  }
  if (wielostronna(snap)) text = text.split(/\s+\/\/\s+/)[0];
  return text;
}

function podzielTlinie(typeLine) {
  const [typ, pod] = (typeLine ?? '').split('—');
  return {
    typy: (typ ?? '').split(/\s+/).filter(Boolean),
    // Podtypy WIELOWYRAZOWE istnieją („Urza's Mine", „Bolas's Citadel").
    podtypy: (pod ?? '').trim(),
  };
}

/**
 * Reminder text (CR 207.2a) podsumowuje regułę, ale samą regułą nie jest.
 * Definicje raz go mają, raz nie; wycinamy go po obu stronach.
 */
function bezReminder(tekst) {
  return String(tekst ?? '')
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// P/T zmienne (gwiazdka, „X/X", „1+*") — silnik liczy je zdolnością, nie drukiem.
const zmiennePT = (v) => v == null || /[*X+]/.test(String(v));
const normalizujKeyword = (k) => String(k).toLowerCase().replace(/\s+/g, '_');

function zawieraSlowo(tekst, keyword) {
  const slowo = normalizujKeyword(keyword).replace(/_/g, ' ')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${slowo}([^a-z]|$)`, 'i').test(String(tekst ?? ''));
}

/** Keyword ability jest drukowana jako wpis/linia, nie tylko wspomniana w Oracle. */
function oracleMaLinieKeywordu(oracle, keyword) {
  const slowo = normalizujKeyword(keyword).replace(/_/g, ' ')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const poczatek = new RegExp(`^\\s*${slowo}(?=$|[\\s,{(])`, 'i');
  return String(oracle ?? '').split(/\r?\n/).some((linia) => poczatek.test(linia));
}

function keywordJestNaFroncie(snap, keyword, snapKeywords, oracle) {
  if (!snapKeywords.has(keyword)) return false;
  if (!wielostronna(snap)) return true;
  if (MODELOWANE_KEYWORD_ABILITIES.has(keyword)) return oracleMaLinieKeywordu(oracle, keyword);
  // „Transform" w danych Scryfall jest także zapisywane dla keyword action.
  return zawieraSlowo(oracle, keyword);
}

test('pokrycie snapshotów katalogu jest jawne i dokładne', () => {
  const pliki = fs.readdirSync(KATALOG_SNAPSHOTOW)
    .filter((nazwa) => /^scryfall-.+\.json$/.test(nazwa));
  const idsSnapshotow = pliki
    .map((nazwa) => nazwa.slice('scryfall-'.length, -'.json'.length))
    .sort();
  const idsDefinicji = new Set(registry.all().map((def) => def.id));
  const brakujace = registry.all()
    .filter((def) => !fs.existsSync(path.join(KATALOG_SNAPSHOTOW, `scryfall-${def.id}.json`)))
    .map((def) => def.id)
    .sort();
  const osierocone = idsSnapshotow.filter((id) => !idsDefinicji.has(id));

  assert.equal(registry.all().length, 621, 'liczba definicji wymaga przeglądu po zmianie katalogu');
  assert.equal(idsSnapshotow.length, 567, 'liczba snapshotów wymaga przeglądu po zmianie dokumentów');
  assert.deepEqual(brakujace, [...BEZ_SNAPSHOTU], 'zmieniła się jawna lista kart bez snapshotu');
  assert.deepEqual(osierocone, [...OSIEROCONE_SNAPSHOTY], 'zmieniły się snapshoty bez definicji katalogowej');
  assert.equal(idsSnapshotow.length - osierocone.length, 566,
    'liczba dopasowanych snapshotów wymaga aktualizacji wraz z allowlistą');
});

test('dane katalogu zgodne ze snapshotami Oracle (front face, coverage, keywords w obie strony)', () => {
  const rozjazdy = [];
  let bezSnapshotu = 0;
  let oracleTopNull = 0;
  let oracleTopEmpty = 0;
  let oracleTopNullMultiface = 0;
  let oracleTopEmptySingleFace = 0;
  let wielostronnych = 0;
  let frontTypePorownano = 0;
  let frontOraclePorownano = 0;
  let porownano = 0;

  for (const def of registry.all()) {
    const snap = snapshot(def.id);
    if (!snap) { bezSnapshotu += 1; continue; }
    porownano += 1;
    const oracle = frontOracleText(snap);
    const typeLine = frontTypeLine(snap);
    const dwustronna = wielostronna(snap);
    if (dwustronna) wielostronnych += 1;
    if (snap.oracle_text === null || snap.oracle_text === undefined) {
      oracleTopNull += 1;
      if (dwustronna) oracleTopNullMultiface += 1;
    } else if (snap.oracle_text === '') {
      oracleTopEmpty += 1;
      if (!dwustronna) oracleTopEmptySingleFace += 1;
    }
    if (oracle !== null) frontOraclePorownano += 1;
    if (typeLine !== null) frontTypePorownano += 1;
    const snapName = frontName(snap);
    if (snapName && snapName !== String(def.name ?? '').trim()) {
      rozjazdy.push(`${def.id}: name „${snapName}" vs „${def.name}"`);
    }

    // Tokeny nie mają dodatku w definicji (`set: null`), a snapshot niesie kod
    // dodatku wydruku tokenu (tkld, tvow…) — nie porównujemy.
    const czyToken = def.id.startsWith('token_');
    if (!czyToken && snap.set && String(snap.set).toUpperCase() !== String(def.set ?? '').toUpperCase()) {
      rozjazdy.push(`${def.id}: set ${snap.set} vs ${def.set}`);
    }

    // Front DFC ma osobną type_line nawet wtedy, gdy Oracle tekstu top-level brak.
    if (typeLine !== null) {
      const { typy, podtypy } = podzielTlinie(typeLine);
      const typyBezTokena = typy.filter((t) => t !== 'Token');
      const typyDefBezTokena = (def.types ?? []).filter((t) => t !== 'Token');
      if (JSON.stringify(typyBezTokena) !== JSON.stringify(typyDefBezTokena)) {
        rozjazdy.push(`${def.id}: typy ${JSON.stringify(typyBezTokena)} vs ${JSON.stringify(typyDefBezTokena)}`);
      }
      const podtypyDef = (def.subtypes ?? []).join(' ').trim();
      if (podtypy !== podtypyDef) {
        rozjazdy.push(`${def.id}: podtypy „${podtypy}" vs „${podtypyDef}"`);
      }
    }

    // Tokeny: definicja niesie manaCost 0, snapshot może nieść koszt druku tokenu.
    if (!czyToken && snap.cmc != null && Number(snap.cmc) !== Number(def.manaCost)) {
      rozjazdy.push(`${def.id}: mana value ${snap.cmc} (${snap.mana_cost}) vs manaCost ${def.manaCost}`);
    }

    const face = frontFace(snap);
    const snapColors = Array.isArray(face?.colors) ? face.colors : snap.colors;
    if (Array.isArray(snapColors)) {
      const a = [...snapColors].sort();
      const b = [...(def.colors ?? [])].sort();
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        rozjazdy.push(`${def.id}: kolory ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      }
    }

    const snapPower = face?.power ?? snap.power;
    const snapToughness = face?.toughness ?? snap.toughness;
    if (snapPower != null && !zmiennePT(snapPower) && !zmiennePT(snapToughness)
      && (String(snapPower) !== String(def.power) || String(snapToughness) !== String(def.toughness))) {
      rozjazdy.push(`${def.id}: P/T ${snapPower}/${snapToughness} vs ${def.power}/${def.toughness}`);
    }

    const snapKw = new Set((snap.keywords ?? []).map(normalizujKeyword));
    const defKw = new Set((def.keywords ?? []).map(normalizujKeyword));
    const tekst = `${oracle ?? ''}\n${typeLine ?? ''}`.toLowerCase();

    // Kierunek katalog → snapshot/Oracle. Null oznacza brak dowodu; pusty
    // string jest dowodem ujemnym i nie może być pomylony z brakiem pola.
    for (const k of defKw) {
      if (keywordJestNaFroncie(snap, k, snapKw, oracle)) continue;
      if (ABILITY_WORDS.has(k) && zawieraSlowo(tekst, k)) continue;
      if (oracle === null) continue;
      if (zawieraSlowo(tekst, k)) continue;
      rozjazdy.push(`${def.id}: definicja ma słowo kluczowe „${k}", którego nie ma na przedniej twarzy Oracle`
        + ` (snapshot keywords: ${JSON.stringify(snap.keywords ?? null)})`);
    }

    // Kierunek Oracle/Scryfall → katalog. Top-level keywords DFC są agregatem;
    // wymagamy albo jawnej linii keywordu na froncie, albo metadata single-face.
    for (const k of MODELOWANE_KEYWORD_ABILITIES) {
      const wTekscieFrontu = oracleMaLinieKeywordu(oracle, k);
      if ((wTekscieFrontu || keywordJestNaFroncie(snap, k, snapKw, oracle)) && !defKw.has(k)) {
        rozjazdy.push(`${def.id}: front Oracle/snapshot ma słowo kluczowe „${k}", którego brak w def.keywords`);
      }
    }
    for (const [k, maReprezentacje] of Object.entries(ODDZIELNE_REPREZENTACJE_KEYWORDOW)) {
      const wTekscieFrontu = oracleMaLinieKeywordu(oracle, k);
      if ((wTekscieFrontu || keywordJestNaFroncie(snap, k, snapKw, oracle)) && !maReprezentacje(def)) {
        rozjazdy.push(`${def.id}: front Oracle/snapshot ma „${k}", którego brak w jego deskryptorze`);
      }
    }
    const devoidNaFroncie = oracleMaLinieKeywordu(oracle, 'devoid')
      || keywordJestNaFroncie(snap, 'devoid', snapKw, oracle);
    if (devoidNaFroncie && Array.isArray(snapColors) && snapColors.length > 0) {
      rozjazdy.push(`${def.id}: Devoid powinien dawać bezbarwny front, snapshot ma kolory ${JSON.stringify(snapColors)}`);
    }

    // DFC porównują wyłącznie przednią twarz; Adventure dopina w niektórych
    // definicjach nazwę/koszt drugiej twarzy, odcięte przez helper powyżej.
    if (oracle !== null) {
      const a = bezReminder(oracle);
      const b = bezReminder(frontDefinitionOracleText(def, snap));
      if (a !== b) {
        rozjazdy.push(`${def.id}: oracleText różny od snapshotu frontu (po wycięciu reminder text):\n`
          + `      snap: ${JSON.stringify(a)}\n      def : ${JSON.stringify(b)}`);
      }
    }
  }

  assert.equal(porownano, 566, `zmieniła się liczba dopasowanych snapshotów: ${porownano}`);
  assert.equal(bezSnapshotu, 55, `zmieniła się liczba brakujących snapshotów: ${bezSnapshotu}`);
  assert.equal(wielostronnych, 11, `zmieniła się liczba kart wielostronnych: ${wielostronnych}`);
  assert.equal(frontTypePorownano, 566, `typy/podtypy nie porównano dla ${561 - frontTypePorownano} snapshotów`);
  assert.equal(frontOraclePorownano, 566, `Oracle frontu nie porównano dla ${561 - frontOraclePorownano} snapshotów`);
  assert.equal(oracleTopNull, 9, `oracle_text null/brak: oczekiwano 9, jest ${oracleTopNull}`);
  assert.equal(oracleTopNullMultiface, 9, `oracle_text null/brak na DFC: oczekiwano 9, jest ${oracleTopNullMultiface}`);
  assert.equal(oracleTopEmpty, 12, `pusty oracle_text: oczekiwano 12, jest ${oracleTopEmpty}`);
  assert.equal(oracleTopEmptySingleFace, 12, `puste Oracle kart jednostronnych: oczekiwano 12, jest ${oracleTopEmptySingleFace}`);
  assert.deepEqual(rozjazdy, [],
    `Rozjazdy definicja ↔ snapshot (${rozjazdy.length}); porównano ${porownano} kart; `
    + `bez snapshotu ${bezSnapshotu}; oracle_text top-level null/brak: ${oracleTopNull}, `
    + `pusty string: ${oracleTopEmpty}; rozjazdy:\n  ` + rozjazdy.join('\n  '));
});

// Pin B-1: Man-o'-War nie lata. Osobno, żeby komunikat był jednoznaczny,
// gdyby ktoś przywrócił lot bez czytania straży katalogowej.
test('B-1: Man-o\'-War nie ma flying (Oracle MH1: „When this creature enters, return target creature to its owner\'s hand.")', () => {
  const def = registry.get('man-o-war');
  assert.deepEqual(def.keywords ?? [], [], 'Oracle nie zawiera słowa kluczowego');
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  const snap = snapshot('man-o-war');
  assert.ok(snap, 'snapshot istnieje');
  assert.deepEqual(snap.keywords ?? [], [], 'snapshot: keywords puste');
  assert.equal(snap.type_line, 'Creature — Jellyfish');
  assert.ok(!/flying/i.test(snap.oracle_text ?? ''), 'w tekście Oracle nie ma flying');
});
