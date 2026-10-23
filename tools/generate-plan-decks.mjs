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
/**
 * D/G (zgłoszenia właściciela): `abilityCostColorsOf` zbiera kolorowe symbole
 * z kosztów zdolności i alternatywnych/dodatkowych kosztów czaru — aktywowanych
 * (`ability.cost.colors`, np. unearth, cycling, equip), opcjonalnej płatności
 * triggera (`trigger.payColors`) oraz deskryptorów `spell.*` (escape,
 * flashback, buyback, cleave). Generator używa tych kosztów wyłącznie jako
 * preferencji płatności dla bezkolorowego wypełniacza, nie zmieniając `colors`
 * karty ani jej strony w głównym podziale.
 *
 * ŚWIADOMY ZAKRES: NIE czytamy `effects[]` ani `qualifier` — tamte `colors`
 * opisują np. TOKEN albo wybór w efekcie, nie koszt karty (Call the Mountain
 * Chocobo tworzy zielonego ptaka, ale sam jest czerwony). Pipy ukryte głębiej
 * niż jedno piętro (np. w `additionalCost.*`) też pomijamy — katalog dziś ich
 * nie ma, a nowy kształt danych wymaga świadomej decyzji.
 *
 * G (2026-09-22, Panic Spellbomb): opcjonalna płatność triggera {R} jest
 * zapisana w `trigger.payColors` i musi kierować bezkolorowy wypełniacz ku R.
 * `abilityCostColorsOf` zachowuje ten koszt razem z pozostałymi kosztami.
 */
export function abilityCostColorsOf(card) {
  const found = new Set();
  const add = (colors) => {
    for (const color of Array.isArray(colors) ? colors : []) {
      if (COLOR_ORDER.includes(color)) found.add(color);
    }
  };
  const objectsIn = (block) => (block && typeof block === 'object' && !Array.isArray(block)
    ? Object.values(block).filter((value) => value && typeof value === 'object' && !Array.isArray(value))
    : []);
  for (const ability of card.abilities ?? []) {
    add(ability?.cost?.colors);
    for (const nested of objectsIn(ability?.cost)) add(nested.colors);
    // G (2026-09-22): opcjonalna płatność wyzwalacza („you may pay {R}”) —
    // ten sam rodzaj faktu co koszt aktywacji, tylko inne pole deskryptora.
    add(ability?.trigger?.payColors);
  }
  const spell = card.spell && typeof card.spell === 'object' ? card.spell : null;
  for (const descriptor of objectsIn(spell)) add(descriptor.colors);
  for (const key of ['additionalCost', 'additionalCosts']) {
    for (const nested of objectsIn(spell?.[key])) add(nested.colors);
  }
  return COLOR_ORDER.filter((color) => found.has(color));
}

export function splitColorsOf(card) {
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
  // Casting-cost pips (np. Scion Summoner {2}{G}) i ability-cost pips nie
  // zmieniają koloru karty ani jej strony w WYBORZE podziału: Devoid pozostaje
  // bezkolorowy (CR 702.114a), choć {G} nadal wymaga zielonej many (CR 107.4a).
  // Zamiast przenosić cały podział planu, oba rodzaje kosztów kierują wyłącznie
  // wypełniaczem w `distributeColorless` (trzeci argument splitPlanByColors).
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
  // Amonkhet przeszedł do worka-mrocznego (Batch 62/T2, patrz niżej).
  Shandalar: 'worek-legend', Rabiah: 'worek-legend',
  Rath: 'worek-legend',
  'The Edge': 'worek-legend',
  // Transpozycja 2026-09-13 (zlecenie właściciela): Fiora i Ikoria USUNIĘTE
  // (Vow of Flight → Eldraine, Unbreakable Bond → Ixalan, Tiller of Flesh
  // → Mirrodin) — w mapie nie ma planów bez kart.
  // Batch 52: Kaladesh dobiło do 15 wspieranych kart (+Fourth Bridge Prowler)
  // i WYSZŁO z worka jako własna talia (auto-awans M181) — worek-dziki spadł
  // do 11 kart nielandowych, poniżej minimum walidatora. Thunder Junction
  // (pogranicze/„dziki zachód") wraca z legend do dzikich (ADR 0023 §4).
  // Bilans: legendy 18, dzikie 17. Wpis Kaladesh zostaje jako MARTWY po awansie.
  'Thunder Junction': 'worek-dziki',
  Ixalan: 'worek-dziki', Kaladesh: 'worek-dziki', Muraganda: 'worek-dziki',
  // Batch 56 (B6, karta 28 Kraken's Eye, plan Ixalan): Ixalan dobił do 15
  // wspieranych kart i AWANSUJE do własnej talii „ixalan" (M181) — razem
  // z wcześniejszym awansem Kaladesh (B52) worek-dziki spada do 6 kart
  // nielandowych (Thunder Junction), poniżej minimum walidatora.
  // Przetasowanie mapy (ADR 0023 §4, liczby nielandowe po komplecie kart B6):
  // do worka-dzikiego wchodzą Kaldheim (2 — nordyckie krainy dzikie),
  // Duskmourn (5 — pełzający dom grozy, przetrwanie w dziczy) i Arcavios (2
  // — dzika magia Snarls poza murami Strixhaven). Bilans po B6: baśnie 21,
  // legendy 15, dzikie 15, mroczny 27.
  // Batch 68 (2026-10-17): plan „Lorwyn” (karta 400 Kulrath Zealot) dobił do 15
  // kart nielandowych i AWANSUJE do własnej talii „lorwyn” (M181) — worek-legend
  // spadł do 6 kart (sam Arcavios), poniżej minimum walidatora. Przetasowanie
  // (ADR 0023 §4), nielandowych po komplecie kart B68: Kaldheim → legendy (sagi
  // i legendarne opowieści nordyckie: legend 6+11 = 17), Duskmourn → dzikie
  // (przetrwanie w dziczy, jak w batchu 6: dzikie 12+6 = 18, mroczny 21−6 = 15).
  // Baśnie 18 bez zmian. Wpisy Lorwyn/Theros/Śródziemie/The Edge są martwe po awansie.
  Kaldheim: 'worek-legend',
  'Final Fantasy': 'worek-mroczny',
  'New Capenna': 'worek-mroczny',
  // Batch 56 (2026-09-17): nowy plan właściciela „Teenage Mutant Ninja Turtles”
  // (karta 30 Containment Protocol) — motyw miejsko-mroczny, spójny z New
  // Capenna i Duskmourn, więc worek-mroczny (nie ma jeszcze progu 15 kart).
  Phyrexia: 'worek-mroczny',
  // Batch 62 / T2 (karty 178 Oreplate Pangolin i 192 Crumbling Vestige, plan
  // „The Edge”): „The Edge” dobił do 15 kart i AWANSUJE do własnej talii
  // (M181), więc worek-legend spadł do 5 kart nielandowych. Przy 61 kartach
  // nielandowych w planach workowych cztery worki po ≥15 dają tylko jeden
  // podział z zapasem 1 karty (Lorwyn 12 + Arcavios 4 = 16; reszta po
  // dokładnie 15). Przetasowanie (ADR 0023 §4), nielandowych po komplecie
  // kart: baśnie 15 (Kamigawa 8, Bloomburrow 7 — bez zmian), legendy 16
  // (Lorwyn 12 + Arcavios 4: kroniki światów z „Eclipsed” i uczelni magii),
  // mroczny 15 (New Capenna 5, Duskmourn 5, Amonkhet 5: noir, dom grozy,
  // kraina umarłych), dzikie 15 (Thunder Junction 7, Kaldheim 6, TMNT 2:
  // pogranicze, Północ i ulice poza prawem). Wpisy Eldraine/Kaladesh/Ixalan/
  // Theros/Śródziemie/Final Fantasy/The Edge są martwe po awansach.
  Lorwyn: 'worek-legend', Arcavios: 'worek-legend',
  Duskmourn: 'worek-dziki', Amonkhet: 'worek-mroczny',
  'Teenage Mutant Ninja Turtles': 'worek-dziki',
  // Batch 63/T2 (2026-10-04): nowy plan właściciela „Marvel” (karta 241 News
  // Helicopter, set SPM) — miejskie ulice i superbohaterowie, motyw spójny
  // z TMNT („ulice poza prawem”), więc worek-dziki. Worek ma 15 kart
  // nielandowych, +1 nie narusza minimum walidatora (ADR 0023 §4).
  Marvel: 'worek-dziki',
  // Batch 67 / fala F (2026-10-14): nowy plan właściciela „Star Wars”
  // (karta 378 Sentry Bot, set PIP) — droidy, energia i artefakty, motyw
  // spójny z cyberpunkową Kamigawą („Neon Dynasty”) w worku-baśni, który
  // jest też NAJMNIEJSZYM workiem (19 kart nie-basic; ADR 0023 §4: motyw
  // + najmniejsza talia). Jedna karta — próg awansu (15) daleko.
  'Star Wars': 'worek-basni',
});

export const WOREK_NAMES = Object.freeze({
  'worek-basni': 'Worek: Baśnie',
  'worek-legend': 'Worek: Legendy',
  'worek-dziki': 'Worek: Dzikie Światy',
  'worek-mroczny': 'Worek: Mroczne Światy',
});

const BASIC_BY_COLOR = Object.freeze({ W: 'basic-plains', U: 'basic-island', B: 'basic-swamp', R: 'basic-mountain', G: 'basic-forest' });
const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

/** Kolorowe symbole kosztu many z MANA_COSTS (np. "{2}{B}{G}{U}"), fallback: colors. */
export function coloredPips(card) {
  const cost = MANA_COSTS[card.id];
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (cost) {
    // M389 (Batch 57, Messenger Falcons {2}{G/U}{W}; usterka ukryta na Esper
    // Stormblade {W/B}{U} w alara.txt): symbol hybrydowy `{X/Y}` płaci JEDEN
    // z dwóch kolorów, więc talia musi mieć co najmniej jedno źródło KTÓREGÓ-
    // KOLWIEK z pary. Rozstrzygamy deterministycznie: pip liczy się do
    // PIERWSZEGO koloru pary w kolejności WUBRG (stabilne, niezależne od
    // kolejności kart; proporcja liczona jak dotąd — jeden pip = jedno
    // wymaganie). Stary regex `\{([WUBRG])\}` gubił cały symbol, więc talia
    // dostawała wyłącznie źródła drugiego koloru pary.
    //
    // ŚWIADOMY ZAKRES: liczy się WYŁĄCZNIE hybryda dwóch KOLORÓW (`{G/U}`).
    // `{W/P}` (Phyrexian, Porcelain Legionnaire) i `{2/W}` (dwubrid) mają
    // alternatywę płatną bez koloru (2 życia / 2 generyczne), więc nie nakładają
    // wymogu źródła — liczenie ich jak pip koloru zawyżałoby proporcję
    // (mirrodin-wu: 4/6 → 5/5 bez powodu; zmierzone w B2).
    for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
      const parts = m[1].split('/');
      if (parts.length === 1) {
        if (pips[parts[0]] != null) pips[parts[0]] += 1;
        continue;
      }
      if (parts.length !== 2 || !parts.every((symbol) => pips[symbol] != null)) continue;
      const color = COLOR_ORDER.indexOf(parts[0]) < COLOR_ORDER.indexOf(parts[1]) ? parts[0] : parts[1];
      pips[color] += 1;
    }
  } else {
    for (const c of card.colors ?? []) if (pips[c] != null) pips[c] += 1;
  }
  return pips;
}

/**
 * Kolory, które karta bezkolorowa może wymagać przy rzuceniu lub użyciu zdolności.
 * `coloredPips` czyta wydrukowany koszt many; `abilityCostColorsOf` zbiera
 * pozostałe koszty. To preferencja strony dla bezkolorowego wypełniacza, nie
 * zmiana `card.colors` ani tożsamości sterującej wyborem podziału.
 */
export function paymentColorsOf(card) {
  const found = new Set(abilityCostColorsOf(card));
  const castingPips = coloredPips(card);
  for (const color of COLOR_ORDER) if (castingPips[color] > 0) found.add(color);
  return COLOR_ORDER.filter((color) => found.has(color));
}

/** Rozkład landów: ceil(n/2) proporcjonalnie do pipów, min 1 na używany kolor.
 * 15g/C (zlecenie właściciela): minimum per kolor to maks pipów JEDNEJ karty
 * (karta z {R}{R} wymusza 2 Góry — proporcja dałaby czasem 1, nie do
 * rzucenia). Niedobór dobierany kosztem innych kolorów (suma stała, nie
 * poniżej ICH minimów); gdy suma minimów przekracza total, total rośnie. */
export function landSplit(cards) {
  let total = Math.ceil(cards.length / 2);
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const minNeed = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  // Batch 69 (zasada właściciela): kolor pipa ZDOLNOŚCI (aktywowanej, wyzwalacza
  // z „you may pay", alternatywnego kosztu) też wymaga źródła w talii — nawet
  // gdy koszt czaru go nie zawiera. Ten zbiór wchodzi do „używanych” kolorów,
  // więc dostaje co najmniej jeden ląd (minimum per kolor, bez zmiany sumy).
  const abilityColors = new Set();
  const abilityWeight = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of cards) {
    const p = coloredPips(card);
    for (const c of COLOR_ORDER) {
      pips[c] += p[c];
      if (p[c] > minNeed[c]) minNeed[c] = p[c];
    }
    for (const c of abilityCostColorsOf(card)) {
      abilityColors.add(c);
      abilityWeight[c] += 1; // liczba kart wymagających koloru w zdolności
    }
  }
  const used = COLOR_ORDER.filter((c) => pips[c] > 0 || abilityColors.has(c));
  // O1 (audyt PR #123): talia w całości bezkolorowa → JAWNY błąd zamiast
  // NaN-crashu (`remainders[i % 0]` → TypeError głęboko w pętli doboru).
  // Kontrakt narzędzia: basic landy dobieramy pod KOLOROWE pipy — plan bez
  // żadnego pipa nie ma czego rozkładać (ewentualne Wastes to świadoma
  // decyzja projektowa, nie wypadkowa proporcji).
  if (used.length === 0) {
    throw new Error(`landSplit: plan bez kolorowych pipów (${cards.length} kart) — co najmniej jedna karta musi mieć kolorowy symbol many`);
  }
  for (const c of used) if (minNeed[c] < 1) minNeed[c] = 1;
  const minSum = used.reduce((acc, c) => acc + minNeed[c], 0);
  if (minSum > total) total = minSum;
  // Audyt PR #168/A-5: po dodaniu pipów zdolności do `used` plan może NIE
  // mieć żadnego pipa drukowanego (np. same Secluded Steppe + cycling {W}).
  // Samo minimum nie wystarcza: `0 / sum(pips)=0/0` dałoby NaN. W TYM JEDNYM
  // przypadku używamy wag zdolności; dla planów z drukowanym pipem wynik
  // musi zostać identyczny z dotychczasowym (zdolność nadal daje min. 1).
  const printedSum = used.reduce((acc, c) => acc + pips[c], 0);
  const weights = printedSum > 0 ? pips : abilityWeight;
  const sum = used.reduce((acc, c) => acc + weights[c], 0);
  const out = {};
  let assigned = 0;
  const remainders = [];
  for (const c of used) {
    const exact = (weights[c] / sum) * total;
    const base = Math.max(minNeed[c], Math.floor(exact));
    out[c] = base;
    assigned += base;
    remainders.push([c, exact - Math.floor(exact)]);
  }
  // Dobierz/odbierz do sumy: największe reszty dostają (deterministycznie,
  // remis → kolejność WUBRG); przy nadmiarze zabieraj od najmniejszych reszt,
  // nie schodząc poniżej minimum koloru (15g/C).
  remainders.sort((a, b) => (b[1] - a[1]) || (COLOR_ORDER.indexOf(a[0]) - COLOR_ORDER.indexOf(b[0])));
  let i = 0;
  while (assigned < total) { out[remainders[i % remainders.length][0]] += 1; assigned += 1; i += 1; }
  i = remainders.length - 1;
  while (assigned > total && i >= 0) {
    const c = remainders[i][0];
    if (out[c] > minNeed[c]) { out[c] -= 1; assigned -= 1; } else { i -= 1; }
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
    const split = splitPlanByColors(nonBasic, splitColorsOf, paymentColorsOf);
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
