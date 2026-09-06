/**
 * PROWENIENCJA KATALOGU: każda taliowalna karta musi pochodzić z kolekcji
 * właściciela (`tools/collection-art-ids.csv`), a nie z inwencji agenta.
 *
 * Przyczyna (audyt 2026-09-06, alarm właściciela): sesja wdrażająca kontrzenie
 * zdolności (PR #93) potrzebowała nośnika mechaniki, więc dopisała do katalogu
 * realną kartę `Stifle` (CNS) — z snapshotem Scryfall i wpisem w MANA_COSTS.
 * Nic nie protestowało, bo karta była „poprawna”: silnik działa, dane zgodne
 * ze Scryfallem, talie zgodne z generatorem (ADR 0023). Ten ostatni punkt jest
 * właśnie stroną wady: rejestr talii jest WYPROWADZONY z `plan` karty, więc
 * każda karta dopisana do katalogu wchodzi do czyjejś kolekcji i do talii,
 * którą tester nazywa „taliami mojej kolekcji”. Katalog to nie składnica kart
 * potrzebnych testom — braki mechanik uzupełniają karty synteretyczne w teście.
 *
 * Strażnik liczy na wyjątki, których nie da się wyprowadzić z kolekcji:
 *  - lądy podstawowe (nie ma ich w słowniku ilustracji, są w `decks/README.md`),
 *  - tokeny i inne wpisy `isCollectible === false` (nie taliuje się ich).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REPO = new URL('../', import.meta.url);
const REGISTRY = createCardRegistry();
const NAZWY_LADOW_PODSTAWOWYCH = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);

/**
 * Słownik kolekcji: `Ilustracja,Nazwa Karty,Plan`, gdzie pierwsze pole to
 * identyfikator ilustracji z dopisanym kodem setu (`461M20`, rzadziej
 * `188_2XM`). Nazwa karty może zawierać przecinek („Zoraline, Cosmos Caller”),
 * więc pozostałe pola rozbijamy po OSTATNIM przecinku, a nie split(',').
 */
function wczytajKolekcje() {
  const wiersze = fs.readFileSync(new URL('tools/collection-art-ids.csv', REPO), 'utf8')
    .split(/\r?\n/).slice(1).filter((l) => l.trim().length > 0);
  const mapa = new Map();
  for (const line of wiersze) {
    const glowa = line.match(/^(\d+)[_-]?([A-Z0-9]*),/);
    assert.ok(glowa, `słownik kolekcji: nie do sparsowania wiersz „${line}” (pierwsze pole musi być <artId><set>)`);
    const reszta = line.slice(glowa[0].length);
    const przecinek = reszta.lastIndexOf(',');
    assert.ok(przecinek > 0, `słownik kolekcji: brak kolumny Plan w „${line}”`);
    const nazwa = reszta.slice(0, przecinek).replace(/^"|"$/g, '').trim();
    const plan = reszta.slice(przecinek + 1).trim();
    const artId = Number(glowa[1]);
    assert.ok(!mapa.has(artId), `słownik kolekcji: artId ${artId} występuje dwa razy`);
    mapa.set(artId, { nazwa, plan, set: glowa[2] });
  }
  return mapa;
}

const KOLEKCJA = wczytajKolekcje();

/**
 * Kwalifikacja „ta karta wchodzi do talii": lustrzane odbicie filtra z
 * `tools/generate-plan-decks.mjs` (`status === 'supported' && !basic-`).
 * Inaczej strażnik i generator mogłyby się rozjechać — a to generator decyduje
 * o tym, czyja kolekcja dostaje kartę.
 */
function taliowalna(karta) {
  return karta.support?.status === 'supported' && !String(karta.id).startsWith('basic-');
}

/** Karty, które wolno mieć w katalogu bez artId: tokeny i lądy podstawowe. */
function dozwolonaPozaKolekcja(karta) {
  const id = String(karta.id);
  if (id.startsWith('token_') || id.startsWith('basic-')) return true;
  return NAZWY_LADOW_PODSTAWOWYCH.has(karta.name);
}

test('1) każda taliowalna karta katalogu ma artId ze słownika kolekcji', () => {
  const bledy = [];
  for (const karta of REGISTRY.all()) {
    if (!taliowalna(karta)) continue;
    if (karta.artId == null) {
      bledy.push(`${karta.id} (${karta.name}) — karta w katalogu bez artId: nie ma jej w kolekcji właściciela`);
      continue;
    }
    const wiersz = KOLEKCJA.get(karta.artId);
    if (!wiersz) {
      bledy.push(`${karta.id} — artId ${karta.artId} nie istnieje w tools/collection-art-ids.csv`);
      continue;
    }
    if (wiersz.nazwa !== karta.name) {
      bledy.push(`${karta.id} — nazwa katalogu „${karta.name}” ≠ nazwa z kolekcji dla artId ${karta.artId}: „${wiersz.nazwa}”`);
    }
  }
  assert.deepEqual(bledy, [], 'katalog kart rośnie wyłącznie z batchów właściciela (jego kolekcja = narzędzie/„Moje karty”): '
    + 'jeśli silnik potrzebuje nośnika nowej mechaniki, użyj karty synteretycznej w teście, NIE poszerzaj katalogu');
});

test('2) plan karty zgadza się z planem z kolekcji — bez tego talia przestaje być talia właściciela', () => {
  const bledy = [];
  for (const karta of REGISTRY.all()) {
    if (!taliowalna(karta)) continue;
    const wiersz = KOLEKCJA.get(karta.artId);
    if (!wiersz) continue; // test 1 ma już ten komunikat
    if ((karta.plan ?? '') !== wiersz.plan) {
      bledy.push(`${karta.id} — plan katalogu „${karta.plan}” ≠ plan z kolekcji „${wiersz.plan}”; `
        + 'generator talii (tools/generate-plan-decks.mjs) wrzuca kartę do talii po planie, więc to przenoszenie cudzych kart między taliami');
    }
  }
  assert.deepEqual(bledy, []);
});

test('3) poza kolekcją mogą żyć wyłącznie tokeny i lądy podstawowe', () => {
  // „Karty specjalne" nie mogą stać się furtką: token rozpoznajemy po
  // przedrostku id (`token_`) albo po `basic-`, land podstawowy po nazwie.
  // Cokolwiek innego bez artId to karta wyciągnięta z powietrza, a nie z
  // kolekcji — dokładnie klasa `Stifle`.
  const podejrzane = [];
  for (const karta of REGISTRY.all()) {
    if (karta.artId != null || dozwolonaPozaKolekcja(karta)) continue;
    podejrzane.push(`${karta.id} (${karta.name}, set ${karta.set ?? '?'}, status ${karta.support?.status ?? '?'}) — bez artId i nie jest tokenem/landem`);
  }
  assert.deepEqual(podejrzane, [],
    'jeśli to karta z kolekcji — dopisz ją z artId z arkusza właściciela; jeśli jest nośnikiem do testu — nie powinna być w katalogu (użyj karty synteretycznej w pliku testu)');
});

test('4) talie w decks/*.txt nie zawierają karty spoza słownika kolekcji', () => {
  // Ten test patrzy na OBJAW: plik talii jest tym, co właściciel czyta i czym
  // gra tester. Rejestr talii jest generowany z katalogu, więc dopisanie
  // karty do katalogu (test 1) zwykle wystarczy, ale ręczna edycja `decks/`
  // musi się potknąć o to samo.
  const kartaPoNazwie = new Map(REGISTRY.all().map((k) => [k.name, k]));
  const bledy = [];
  for (const plik of fs.readdirSync(new URL('decks/', REPO)).filter((f) => f.endsWith('.txt')).sort()) {
    const tresc = fs.readFileSync(new URL(`decks/${plik}`, REPO), 'utf8');
    for (const linia of tresc.split(/\r?\n/)) {
      const m = linia.match(/^\s*\d+x\s+(.+?)(?:\s*\([A-Z0-9]+\))?\s*$/);
      if (!m) continue;
      const nazwa = m[1].trim();
      if (NAZWY_LADOW_PODSTAWOWYCH.has(nazwa)) continue;
      const karta = kartaPoNazwie.get(nazwa);
      if (!karta) { bledy.push(`${plik}: „${nazwa}” — brak takiej karty w katalogu`); continue; }
      if (taliowalna(karta) && !KOLEKCJA.has(karta.artId)) {
        bledy.push(`${plik}: „${nazwa}” — karta nie ma artId w słowniku kolekcji`);
      }
    }
  }
  assert.deepEqual(bledy, []);
});

test('5) MANA_COSTS nie ma wpisów po kartach, których już w katalogu nie ma', () => {
  // Usuwając kartę, trzeba usunąć jej koszt; zostałaby mapa z kluczem po
  // karcie, której nie ma (źródłem jest `src/cards/mana-costs-data.js`).
  const ids = new Set(REGISTRY.all().map((k) => k.id));
  const osierocone = Object.keys(MANA_COSTS).filter((k) => !ids.has(k));
  assert.deepEqual(osierocone, [], 'wpisy MANA_COSTS bez karty w katalogu — osierocone dane po usuniętej karcie');
});
