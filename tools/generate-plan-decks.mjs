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

const SINGLE_PLAN_MIN = 15;

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
  Eldraine: 'worek-basni', Lorwyn: 'worek-basni', Bloomburrow: 'worek-basni',
  Kamigawa: 'worek-basni', Moag: 'worek-basni', Core: 'worek-basni',
  Commander: 'worek-basni', 'Modern Horizons': 'worek-basni',
  Theros: 'worek-legend', 'Śródziemie': 'worek-legend', Amonkhet: 'worek-legend',
  Shandalar: 'worek-legend', Rabiah: 'worek-legend', Rath: 'worek-legend',
  Arcavios: 'worek-legend',
  Ixalan: 'worek-dziki', Kaladesh: 'worek-dziki', 'The Edge': 'worek-dziki',
  'Thunder Junction': 'worek-dziki', Muraganda: 'worek-dziki',
  'Final Fantasy': 'worek-mroczny', Duskmourn: 'worek-mroczny',
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
  const decks = new Map(); // file -> { name, cards: [] }
  for (const card of supported) {
    const plan = card.plan;
    if (!plan) throw new Error(`Karta bez planu: ${card.id} — uzupełnij plan w card-data`);
    let file; let name;
    if (SINGLE_PLAN_DECKS[plan]) {
      ({ file, name } = SINGLE_PLAN_DECKS[plan]);
    } else if (WOREK_DECKS[plan]) {
      file = WOREK_DECKS[plan];
      name = WOREK_NAMES[file];
    } else {
      throw new Error(`Plan bez przydziału talii: „${plan}” (${card.id}) — dopisz do WOREK_DECKS (ADR 0023)`);
    }
    if (!decks.has(file)) decks.set(file, { name, cards: [] });
    decks.get(file).cards.push(card);
  }
  // Sanity progu: plan z >= 15 kartami nie może siedzieć w worku.
  const perPlan = new Map();
  for (const card of supported) perPlan.set(card.plan, (perPlan.get(card.plan) ?? 0) + 1);
  for (const [plan, count] of perPlan) {
    if (count >= SINGLE_PLAN_MIN && !SINGLE_PLAN_DECKS[plan]) {
      throw new Error(`Plan „${plan}” ma ${count} kart (>= ${SINGLE_PLAN_MIN}) — należy mu się własna talia (ADR 0023)`);
    }
  }
  const files = new Map();
  for (const [file, { name, cards }] of [...decks.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
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
