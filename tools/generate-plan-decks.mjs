// M178 (rewolucja talii, ADR 0023): generator talii per PLAN.
//
// Źródło prawdy przydziału planów do talii. Zasady:
//  - plan z >= 15 kartami wspieranymi = własna talia jednoplanowa;
//  - mniejsze plany — przydział do jednego z 4 worków (mapa niżej);
//  - singleton (1x każda karta), KAŻDA wspierana karta w dokładnie jednej talii;
//  - basic landy: ceil(nielandów / 2), kolory proporcjonalnie do pipów
//    kosztów many (każdy kolor z >= 1 pipem dostaje >= 1 land);
//  - deterministycznie: karty sortowane po (manaCost, nazwa), landy na końcu
//    w stałej kolejności WUBRG; format = writeDeckText (round-trip).
//
// Użycie: node tools/generate-plan-decks.mjs   (nadpisuje decks/*.txt)

import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { writeDeckText } from '../src/cards/deck-text.js';
import { splitPlanByColors, needsSplit, SPLIT_THRESHOLD } from './split-deck-colors.mjs';
import { getSourceForObject } from '../src/engine/mana-sources.js';

const SINGLE_PLAN_MIN = 15;

/** Karta liczy się do progu podziału i minimum 15, o ile NIE jest basic-landem. */
function isNonBasic(card) {
  return !card.id.startsWith('basic-');
}

/**
 * Tożsamość kolorystyczna karty dla podziału (ADR 0024, poprawki właściciela):
 *  1. Karta z kolorami w definicji (colors[]) → te kolory (zwykłe czary/stwory).
 *  2. Karta BEZKOLOROWA (ląd, artefakt-„mana rock", stwór devoid) → kolory
 *     MANY, jaką PRODUKUJE, z engine'owego getSourceForObject (L41: jedna
 *     reguła produkcji many, jeden odczyt). Dotyczy WSZYSTKICH kart, nie tylko
 *     lądów: Mind Stone-owy artefakt dający {U} idzie do talii z U tak samo jak
 *     Dimir Guildgate.
 *  3. Źródło bezbarwne ({C}), any-color albo NIE-źródło many → pusta lista →
 *     wypełniacz (balansuje strony, bez tożsamości koloru).
 */
function splitColorsOf(card) {
  const declared = Array.isArray(card.colors) ? card.colors.filter((c) => 'WUBRG'.includes(c)) : [];
  if (declared.length > 0) return declared;
  // Bezkolorowa: sprawdź produkcję many (ląd / artefakt / devoid — bez różnicy).
  const kind = (card.types ?? []).includes('Land') ? 'land'
    : (card.types ?? []).includes('Creature') ? 'creature' : 'artifact';
  const src = getSourceForObject({
    id: card.id, cardId: card.id, kind,
    types: card.types ?? [], subtypes: card.subtypes ?? [],
    abilities: card.abilities ?? [], colors: [],
  }, null);
  return src?.colors ?? [];
}

/**
 * M181 (ADR 0023 §2/§4, zlecenie właściciela): slug pliku talii z nazwy
 * planu — małe litery, bez diakrytyków, spacje/apostrofy → myślniki.
 * Używany przy AUTOMATYCZNYM awansie planu z worka (≥15 kart = własna
 * talia bez ręcznej edycji map).
 */
export function slugifyPlan(plan) {
  const folded = String(plan)
    .replaceAll('ł', 'l').replaceAll('Ł', 'L')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return folded.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Talie jednoplanowe: plan → (plik, nazwa). Wiedźmin wchłania Świat Wiedźmina. */
export const SINGLE_PLAN_DECKS = Object.freeze({
  Innistrad: { file: 'innistrad', name: 'Innistrad' },
  Tarkir: { file: 'tarkir', name: 'Tarkir' },
  Mirrodin: { file: 'mirrodin', name: 'Mirrodin' },
  Dominaria: { file: 'dominaria', name: 'Dominaria' },
  'Warhammer Fantasy': { file: 'warhammer', name: 'Warhammer Fantasy' },
  'Wiedźmin': { file: 'wiedzmin', name: 'Wiedźmin' },
  'Świat Wiedźmina': { file: 'wiedzmin', name: 'Wiedźmin' },
  Alara: { file: 'alara', name: 'Alara' },
  'Forgotten Realms': { file: 'forgotten-realms', name: 'Forgotten Realms' },
  Zendikar: { file: 'zendikar', name: 'Zendikar' },
  Ravnica: { file: 'ravnica', name: 'Ravnica' },
});

/** Worki: plan → plik. NOWY PLAN dopisz tutaj (motyw + najmniejsza talia). */
export const WOREK_DECKS = Object.freeze({
  // Batch 49: Final Fantasy dobiło do 15 wspieranych kart i WYSZŁO z worka
  // jako własna talia (auto-awans M181) — worek-mroczny spadł do 11 kart
  // nielandowych, poniżej minimum walidatora. Lorwyn przechodzi z worka-baśni
  // do mrocznego (ADR 0023 §4): motyw pasuje — nowy set to „Lorwyn Eclipsed”,
  // mroczna strona planu (Shadowmoor). Bilans: baśnie 17, mroczny 20.
  Eldraine: 'worek-basni', Bloomburrow: 'worek-basni',
  Kamigawa: 'worek-basni', Moag: 'worek-basni', Core: 'worek-basni',
  Commander: 'worek-basni', 'Modern Horizons': 'worek-basni',
  // M202/A (zlecenie właściciela 2026-08-24): rezygnacja z niszowych planów
  // na rzecz popularniejszych przesunęła 6 kart między planami. Skutek: Theros
  // i Śródziemie dobiły do progu 15 wspieranych kart i WYSZŁY z worka jako
  // własne talie (auto-awans M181), a worek-legend został z 5 kartami —
  // poniżej minimum walidatora. Przesunięcie „The Edge” i „Thunder Junction”
  // z worka-dzikiego domyka bilans (ADR 0023 §4): legend 21, dzikie 24.
  // Wpisy Theros/Śródziemie usunięte — były martwe po awansie.
  // Theros i Śródziemie są PO AWANSIE (mają własne talie) — wpisy zostają
  // jako MARTWE, bo test m181-auto-awans.test.js dokumentuje na nich mechanizm
  // auto-awansu, a generator i tak sprawdza próg przed mapą worków.
  Theros: 'worek-legend', 'Śródziemie': 'worek-legend',
  Amonkhet: 'worek-legend', Shandalar: 'worek-legend', Rabiah: 'worek-legend',
  Rath: 'worek-legend', Arcavios: 'worek-legend',
  'The Edge': 'worek-legend', 'Thunder Junction': 'worek-legend',
  // Batch 50: Fiora (świat Commander Legends — intrygi/szlachta) → legendy.
  Fiora: 'worek-legend',
  Ixalan: 'worek-dziki', Kaladesh: 'worek-dziki', Muraganda: 'worek-dziki',
  'Final Fantasy': 'worek-mroczny', Duskmourn: 'worek-mroczny',
  Lorwyn: 'worek-mroczny',
  'New Capenna': 'worek-mroczny', Kaldheim: 'worek-mroczny',
  Ikoria: 'worek-mroczny', Phyrexia: 'worek-mroczny',
});

export const WOREK_NAMES = Object.freeze({
  'worek-basni': 'Worek: Baśnie',
  'worek-legend': 'Worek: Legendy',
  'worek-dziki': 'Worek: Dzikie Światy',
  'worek-mroczny': 'Worek: Mroczne Światy',
});

const BASIC_BY_COLOR = Object.freeze({ W: 'basic-plains', U: 'basic-island', B: 'basic-swamp', R: 'basic-mountain', G: 'basic-forest' });
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

/** Pipy kolorowe karty: z MANA_COSTS (np. "{2}{B}{G}{U}"), fallback: colors. */
export function coloredPips(card) {
  const cost = MANA_COSTS[card.id];
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (cost) {
    for (const m of cost.matchAll(/\{([WUBRG])\}/g)) pips[m[1]] += 1;
  } else {
    for (const c of card.colors ?? []) if (pips[c] != null) pips[c] += 1;
  }
  return pips;
}

/** Rozkład landów: ceil(n/2) proporcjonalnie do pipów, min 1 na używany kolor. */
export function landSplit(cards) {
  const total = Math.ceil(cards.length / 2);
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of cards) {
    const p = coloredPips(card);
    for (const c of COLOR_ORDER) pips[c] += p[c];
  }
  const used = COLOR_ORDER.filter((c) => pips[c] > 0);
  const sum = used.reduce((acc, c) => acc + pips[c], 0);
  const out = {};
  let assigned = 0;
  const remainders = [];
  for (const c of used) {
    const exact = (pips[c] / sum) * total;
    const base = Math.max(1, Math.floor(exact));
    out[c] = base;
    assigned += base;
    remainders.push([c, exact - Math.floor(exact)]);
  }
  // Dobierz/odbierz do sumy: największe reszty dostają (deterministycznie,
  // remis → kolejność WUBRG); przy nadmiarze zabieraj od najmniejszych reszt,
  // nie schodząc poniżej 1.
  remainders.sort((a, b) => (b[1] - a[1]) || (COLOR_ORDER.indexOf(a[0]) - COLOR_ORDER.indexOf(b[0])));
  let i = 0;
  while (assigned < total) { out[remainders[i % remainders.length][0]] += 1; assigned += 1; i += 1; }
  i = remainders.length - 1;
  while (assigned > total && i >= 0) {
    const c = remainders[i][0];
    if (out[c] > 1) { out[c] -= 1; assigned -= 1; } else { i -= 1; }
  }
  return out;
}

export function buildDecks(registry = createCardRegistry()) {
  // Basic landy poznajemy po id (UWAGA: tablica VIRTUAL_BASIC_LANDS zawiera
  // historycznie także realne karty batchów 24+ — nie nadaje się na filtr).
  const supported = registry.all().filter((c) => c.support?.status === 'supported'
    && !c.id.startsWith('basic-'));
  // M181 (ADR 0023): najpierw liczymy karty per plan — próg decyduje
  // o AUTOMATYCZNYM awansie planu z worka do własnej talii.
  const perPlan = new Map();
  for (const card of supported) perPlan.set(card.plan, (perPlan.get(card.plan) ?? 0) + 1);

  const decks = new Map(); // file -> { name, cards: [] }
  const promoted = [];
  for (const card of supported) {
    const plan = card.plan;
    if (!plan) throw new Error(`Karta bez planu: ${card.id} — uzupełnij plan w card-data`);
    let file; let name;
    if (SINGLE_PLAN_DECKS[plan]) {
      // Jawne nadpisania nazw/plików (np. wiedzmin ← Wiedźmin + Świat
      // Wiedźmina) mają pierwszeństwo przed automatem.
      ({ file, name } = SINGLE_PLAN_DECKS[plan]);
    } else if ((perPlan.get(plan) ?? 0) >= SINGLE_PLAN_MIN) {
      // M181: AUTO-AWANS — plan dobił do progu, wychodzi z worka jako
      // własna talia (nawet jeśli WOREK_DECKS wciąż go wymienia); wpis
      // w mapie worka staje się martwy i można go sprzątnąć przy okazji.
      file = slugifyPlan(plan);
      name = plan;
      if (!promoted.includes(plan)) promoted.push(plan);
    } else if (WOREK_DECKS[plan]) {
      file = WOREK_DECKS[plan];
      name = WOREK_NAMES[file];
    } else {
      throw new Error(`Plan bez przydziału talii: „${plan}” (${card.id}) — dopisz do WOREK_DECKS (ADR 0023)`);
    }
    if (!decks.has(file)) decks.set(file, { name, cards: [] });
    decks.get(file).cards.push(card);
  }
  for (const plan of promoted) {
    if (WOREK_DECKS[plan]) {
      console.warn(`[generator] AUTO-AWANS: plan „${plan}” (${perPlan.get(plan)} kart) wychodzi z worka `
        + `„${WOREK_DECKS[plan]}” do talii „${slugifyPlan(plan)}” (ADR 0023 §4) — wpis w WOREK_DECKS jest już martwy.`);
    }
  }
  // Worek po awansach nie może spaść poniżej minimum walidatora — to
  // sygnał do Świadomego przetasowania mapy WOREK_DECKS (nie automat).
  for (const [file, { cards }] of decks) {
    const nonland = cards.filter((card) => !(card.types ?? []).includes('Land')).length;
    if (file.startsWith('worek') && nonland < SINGLE_PLAN_MIN) {
      throw new Error(`Worek „${file}” ma po awansach tylko ${nonland} kart nielandowych `
        + `(minimum ${SINGLE_PLAN_MIN}) — przetasuj plany w WOREK_DECKS (ADR 0023 §4).`);
    }
  }

  // M228 (ADR 0024): OBOWIĄZKOWY podział kolorystyczny talii jednoplanowej,
  // która osiągnęła próg (>= SPLIT_THRESHOLD kart nielandowych, tzn. poza
  // basic-landami). Worki są przejściowe (ADR 0023) — ich nie dzielimy;
  // zamiast tego plan awansuje z worka do własnej talii i DOPIERO wtedy może
  // podlegać podziałowi. „Nieland" = wszystko poza basic-landami (spójnie
  // z validateDeck: karty utility-land liczą się do progu i minimum 15).
  const splitDecks = new Map();
  for (const [file, entry] of decks) {
    if (file.startsWith('worek')) { splitDecks.set(file, entry); continue; }
    const nonBasic = entry.cards.filter(isNonBasic);
    if (!needsSplit(nonBasic.length)) { splitDecks.set(file, entry); continue; }
    const split = splitPlanByColors(nonBasic, splitColorsOf);
    if (!split) {
      // Fallback (decyzja właściciela „fill_then_keep"): plan zbyt jednokolorowy,
      // by dać dwie talie >=15 — ZOSTAW jedną talię i ostrzeż. Nie tworzymy
      // sztucznej, niespójnej talii.
      console.warn(`[generator] UWAGA: plan „${entry.name}” ma ${nonBasic.length} kart nielandowych `
        + `(>= ${SPLIT_THRESHOLD}), ale nie da się go podzielić kolorystycznie na dwie talie `
        + `>=${SINGLE_PLAN_MIN} — zostaje jedną talią (ADR 0024, fallback).`);
      splitDecks.set(file, entry);
      continue;
    }
    // Dwie talie: <slug>-<koloryA> i <slug>-<koloryB>. Nazwa czytelna z kolorami.
    const nameA = `${entry.name} (${split.suffixA.toUpperCase()})`;
    const nameB = `${entry.name} (${split.suffixB.toUpperCase()})`;
    splitDecks.set(`${file}-${split.suffixA}`, { name: nameA, cards: split.a });
    splitDecks.set(`${file}-${split.suffixB}`, { name: nameB, cards: split.b });
    console.warn(`[generator] PODZIAŁ: „${entry.name}” (${nonBasic.length} kart) → `
      + `„${file}-${split.suffixA}” (${split.a.length}) + „${file}-${split.suffixB}” (${split.b.length}) `
      + `[leak ${split.leak}, imbalance ${split.imbalance}] (ADR 0024).`);
  }

  const files = new Map();
  for (const [file, { name, cards }] of [...splitDecks.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    cards.sort((a, b) => ((a.manaCost ?? 0) - (b.manaCost ?? 0)) || a.name.localeCompare(b.name));
    const lands = landSplit(cards);
    const cardIds = [...cards.map((c) => c.id)];
    for (const c of COLOR_ORDER) {
      for (let k = 0; k < (lands[c] ?? 0); k += 1) cardIds.push(BASIC_BY_COLOR[c]);
    }
    files.set(file, writeDeckText({ name, cardIds }, registry));
  }
  return files;
}

const isMain = process.argv[1] && process.argv[1].endsWith('generate-plan-decks.mjs');
if (isMain) {
  const files = buildDecks();
  for (const old of fs.readdirSync('decks').filter((f) => f.endsWith('.txt'))) {
    if (!files.has(old.replace(/\.txt$/, ''))) fs.unlinkSync(`decks/${old}`);
  }
  for (const [file, text] of files) fs.writeFileSync(`decks/${file}.txt`, text);
  console.log(`Zapisano ${files.size} talii:`, [...files.keys()].join(', '));
}
