// Audyt batcha 64 (sesja 2026-10-08c) — STRAŻ KATALOGOWA: dane karty w
// `card-data.js` wobec snapshotu Oracle właściciela (`docs/cards/`).
//
// Powód (znalezisko B-1): Man-o'-War miał w definicji `keywords: ['flying']`,
// którego nie ma ani w Oracle, ani w polu `keywords` snapshotu. Błąd przeżył
// audyt PR #158, bo pin „dane Oracle" w `test/real-cards-batch64.test.js`
// przypisywał ten lot jako fakt — `assert.deepEqual(def.keywords, ['flying'],
// 'lot')` (klasa L181: pin skopiowany z definicji cementuje błąd, zamiast go
// łapać). Żadna inna warstwa nie porównywała definicji ze źródłem.
//
// Ta straż porównuje KAŻDĄ kartę, która ma snapshot, w siedmiu polach: name,
// set, typy/podtypy, mana value, kolory, P/T i słowa kluczowe, plus dosłowny
// `oracleText`. Snapshoty w `docs/cards/` są źródłem właściciela (ADR 0029 —
// katalog rośnie wyłącznie z jego kolekcji), więc rozjazd = błąd definicji albo
// nieświeży snapshot; jedno i drugie trzeba zobaczyć.
//
// Granice uczciwie oznaczone:
//   • karty BEZ snapshotu są pomijane (licznik w komunikacie) — nie ma z czym
//     porównać;
//   • snapshoty kart DWUSTRONNYCH starszego formatu nie mają `oracle_text`
//     (np. `scryfall-lodestone-needle.json`: `oracle_text: null`, type_line
//     „Artifact // Artifact") — porównanie tekstu i typów jest dla nich
//     pomijane, nie „zielone";
//   • `cmc` bierzemy ze snapshotu wprost (snapshoty nie mają `mana_value`).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCardRegistry } from '../src/cards/card-data.js';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = createCardRegistry();

// Słowa-umowne (ability words, CR 207.2c) — Oracle wypisuje je w `keywords`,
// ale nie są zdolnościami, więc definicja ich nie niesie.
const ABILITY_WORDS = new Set(['clash', 'delirium', 'delve', 'keen_sight', 'landwalk', 'radiance']);

function snapshot(id) {
  const p = path.join(KORZEN, 'docs', 'cards', `scryfall-${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function podzielTlinie(typeLine) {
  const [typ, pod] = (typeLine ?? '').split('—');
  return {
    typy: (typ ?? '').split(/\s+/).filter(Boolean),
    // Podtypy WIELOWYRAZOWE istnieją („Urza's Mine", „Bolas's Citadel") —
    // porównujemy złączone, bo snapshot nie znosi spacji w nazwie podtypu.
    podtypy: (pod ?? '').trim(),
  };
}

/**
 * Reminder text (CR 207.2a, dosłownie: „Reminder text is italicized text within
 * parentheses that summarizes a rule that applies to that card."; regułę
 * podsumowuje, sama nią nie jest — CR 207.2) — Oracle dopisuje wyjaśnienia
 * mechanik w nawiasach, a definicje w katalogu raz je mają, raz nie (Courage in
 * Crisis bez, Merfolk Falconer z). Porównujemy tekst PO wycięciu nawiasów, żeby
 * straż mierzyła reguły, nie redakcję.
 */
function bezReminder(tekst) {
  return String(tekst ?? '')
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// P/T zmienne (gwiazdka, „X/X", „1+*") — silnik liczy je zdolnością, nie drukiem.
const zmiennePT = (v) => v == null || /[*X+]/.test(String(v));

test('dane katalogu zgodne ze snapshotami Oracle (name, set, typy, MV, kolory, P/T, keywords, oracleText)', () => {
  const rozjazdy = [];
  let bezSnapshotu = 0;
  let bezOracle = 0;
  let porownano = 0;

  for (const def of registry.all()) {
    const snap = snapshot(def.id);
    if (!snap) { bezSnapshotu += 1; continue; }
    porownano += 1;
    const oracle = typeof snap.oracle_text === 'string' ? snap.oracle_text : null;
    const dwustronna = (snap.type_line ?? '').includes('//');
    if (!oracle) bezOracle += 1;

    // Karty dwustronne: snapshot nosi nazwę obu stron („A // B"), definicja
    // jednej — porównujemy tylko pierwszą stronę.
    const snapName = String(snap.name ?? '').split('//')[0].trim();
    if (snapName && snapName !== String(def.name ?? '').trim()) {
      rozjazdy.push(`${def.id}: name „${snapName}" vs „${def.name}"`);
    }
    // Tokeny nie mają dodatku w definicji (`set: null`), a snapshot niesie kod
    // dodatku wydruku tokenu (tkld, tvow…) — nie porównujemy.
    const czyToken = def.id.startsWith('token_');
    if (!czyToken && snap.set && String(snap.set).toUpperCase() !== String(def.set ?? '').toUpperCase()) {
      rozjazdy.push(`${def.id}: set ${snap.set} vs ${def.set}`);
    }
    if (oracle && !dwustronna) {
      const { typy, podtypy } = podzielTlinie(snap.type_line);
      // „Token Creature — Griffin": Scryfall wypisuje Token jako typ, definicje
      // tokenów w katalogu nie — porównujemy bez niego (kolejność reszty musi
      // się zgadzać).
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
    // Tokeny: definicja niesie manaCost 0, a snapshot — koszt DRUKU tokenu
    // (Tarmogoyf token {1}{G}); to cecha wydruku, nie obiektu w silniku.
    if (!czyToken && snap.cmc != null && Number(snap.cmc) !== Number(def.manaCost)) {
      rozjazdy.push(`${def.id}: mana value ${snap.cmc} (${snap.mana_cost}) vs manaCost ${def.manaCost}`);
    }
    if (Array.isArray(snap.colors)) {
      const a = [...snap.colors].sort();
      const b = [...(def.colors ?? [])].sort();
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        rozjazdy.push(`${def.id}: kolory ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      }
    }
    if (snap.power != null && !dwustronna && !zmiennePT(snap.power) && !zmiennePT(snap.toughness)
      && (String(snap.power) !== String(def.power) || String(snap.toughness) !== String(def.toughness))) {
      rozjazdy.push(`${def.id}: P/T ${snap.power}/${snap.toughness} vs ${def.power}/${def.toughness}`);
    }
    // Słowa kluczowe: definicja nie może mieć takiego, którego nie ma ani w
    // `keywords` snapshotu, ani w tekście Oracle (to właśnie B-1).
    const snapKw = (snap.keywords ?? []).map((k) => String(k).toLowerCase().replace(/\s+/g, '_'));
    const tekst = ((oracle ?? '') + '\n' + (snap.type_line ?? '')).toLowerCase();
    for (const k of def.keywords ?? []) {
      const kl = String(k).toLowerCase().replace(/\s+/g, '_');
      if (snapKw.includes(kl)) continue;
      if (ABILITY_WORDS.has(kl) && tekst.includes(kl.replace(/_/g, ' '))) continue;
      if (!oracle) continue;                       // nie ma tekstu = nie ma dowodu
      if (tekst.includes(kl.replace(/_/g, ' '))) continue;
      rozjazdy.push(`${def.id}: definicja ma słowo kluczowe „${k}", którego nie ma w Oracle`
        + ` (snapshot keywords: ${JSON.stringify(snap.keywords ?? null)})`);
    }
    if (oracle && !dwustronna) {
      const a = bezReminder(oracle);
      const b = bezReminder(def.oracleText);
      if (a !== b) {
        rozjazdy.push(`${def.id}: oracleText różny od snapshotu (po wycięciu reminder text):\n`
          + `      snap: ${JSON.stringify(a)}\n      def : ${JSON.stringify(b)}`);
      }
    }
  }

  assert.deepEqual(rozjazdy, [],
    `Rozjazdy definicja ↔ snapshot (${rozjazdy.length}); `
    + `porównano ${porownano} kart, bez snapshotu ${bezSnapshotu}, `
    + `snapshot bez oracle_text ${bezOracle} (karty dwustronne — porównanie tekstu pominięte):\n  `
    + rozjazdy.join('\n  '));
});

// Pin samego znaleziska B-1: Man-o'-War nie lata. Osobno, żeby komunikat był
// jednoznaczny, gdyby ktoś „przywrócił" lot bez czytania straży katalogowej.
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
