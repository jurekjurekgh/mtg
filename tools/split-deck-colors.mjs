// M228 (ADR 0024): podział kolorystyczny talii planowej, gdy przekroczy próg.
//
// Reguła (zlecenie właściciela): talia planowa z >= SPLIT_THRESHOLD kartami
// nielandowymi jest OBOWIĄZKOWO dzielona na mniejsze wg kolorów, tak aby każda
// część miała >= MIN_NONLAND kart nielandowych. Gdy plan miał już podział
// (więcej niż jedna talia), dzielimy PONOWNIE cały zbiór kart planu — nie tylko
// nową talię — żeby podział pozostał równomierny (re-balans).
//
// Zasady nadrzędne (ADR 0012/0023, niezmienne):
//  - singleton: każda karta poza basic-landem w DOKŁADNIE jednej talii;
//  - min 15 kart nielandowych na talię;
//  - basic landy = ceil(nielandów/2), liczone osobno per talia (poza generatorem).
//
// Ten moduł operuje na kartach NIELANDOWYCH (bez basic-landów) — rozkład
// basic-landów robi generator (landSplit) już po podziale.
//
// Determinizm (ADR 0005): brute-force po 30 właściwych podzbiorach 5 kolorów
// (bez pustego i pełnego), stała kolejność WUBRG, rozstrzyganie remisów przez
// najmniejszą maskę — zero RNG.

const COLORS = ['W', 'U', 'B', 'R', 'G'];

export const SPLIT_THRESHOLD = 30; // >= tylu kart nielandowych → obowiązkowy podział
export const MIN_NONLAND = 15;     // minimum kart nielandowych na talię (ADR 0012)

/**
 * Tożsamość kolorystyczna karty do podziału.
 *
 * Dla NIE-lądów: pole colors[] (mono/multi/bezkolorowa).
 *
 * Dla NON-BASIC LĄDÓW (poprawka właściciela): kolor wynika z many, jaką ląd
 * PRODUKUJE, nie z colors[] (te są puste). Ląd dający konkretny kolor/kolory
 * ma tożsamość i idzie do talii z tym kolorem (Dimir Guildgate → U/B, Great
 * Furnace → R, Kishla Village → G). Ląd bezbarwny ({C}), any-color (Rupture
 * Spire) albo nieprodukujący many → BEZKOLOROWY wypełniacz (jak artefakty).
 *
 * `colorsOf` wstrzykiwane przez generator (używa engine'owego
 * getSourceForObject — L41: jedna reguła produkcji many, jeden odczyt).
 * Domyślnie: samo colors[] (dla testów syntetycznych bez lądów).
 */
export function defaultColorsOf(card) {
  return Array.isArray(card.colors) ? card.colors.filter((c) => COLORS.includes(c)) : [];
}

/**
 * Sufiks pliku/nazwy dla strony podziału: litery przypisanych kolorów, które
 * SĄ faktycznie używane przez karty tej strony, w kolejności WUBRG. Partycja
 * gwarantuje, że sufiksy obu stron są ROZŁĄCZNE (każdy kolor po jednej stronie).
 * Strona bez kart kolorowych (same bezkolorowe) → 'c'.
 */
function sideSuffix(assignedColors, sideCards, colorsOf) {
  const used = assignedColors.filter((c) => sideCards.some((card) => colorsOf(card).includes(c)));
  return used.join('').toLowerCase() || 'c';
}

/**
 * Dzieli listę kart NIELANDOWYCH jednego planu na DWIE części wg kolorów.
 *
 * Algorytm:
 *  1. Rozważ każdy właściwy podzbiór kolorów jako „stronę A" (30 wariantów).
 *  2. Karty jednokolorowe/wielokolorowe idą na stronę z WIĘKSZOŚCIĄ swoich
 *     kolorów; remis → strona A, gdy ma <=2 przypisane kolory (preferuj mniejszą
 *     tożsamość), inaczej B — deterministycznie.
 *  3. Karty bezkolorowe (artefakty, Eldrazi) to „wypełniacz" — dosypywane do
 *     mniejszej strony, żeby zbalansować liczności. WYJĄTEK (zgłoszenie D
 *     właściciela, 2026-09-20): karta bezkolorowa, której ZDOLNOŚĆ wymaga
 *     kolorowych pipów (`paymentColorsOf`, np. Simian Simulacrum z unearth
 *     {2}{G}{G}), idzie na stronę, która TE PIPY MOŻE ZAPŁACIĆ — karta
 *     bezkolorowa działa w każdej talii, ale jej zdolność nie; brak takiej
 *     strony (obie albo żadna) → zwykły balans liczności. Preferencja nie
 *     zmienia WYBORU podziału (maski): balans w pętli szukającej liczy
 *     wypełniacz jak dotąd, bo karta bezkolorowa jest grywalna po obu stronach
 *     (świadomy zakres — pełne wejście pipów w funkcję celu przenosi CAŁY
 *     podział planu, patrz komentarz w `generate-plan-decks.mjs`).
 *  4. Wynik ważny tylko, gdy OBIE strony mają >= MIN_NONLAND.
 *  5. Funkcja celu: minimalizuj „leak" (karty rozdarte między strony — psują
 *     czystość kolorystyczną) ×10 + |różnica liczności|. Remis → mniejsza maska.
 *
 * Zwraca null, gdy żaden podział nie daje dwóch stron >= MIN_NONLAND
 * (np. plan mocno jednokolorowy) — wtedy caller ZOSTAWIA jedną talię (fallback
 * „fill_then_keep", decyzja właściciela).
 *
 * @param {Array} nonlandCards karty nielandowe planu (obiekty z .colors)
 * @returns {null | { a, b, suffixA, suffixB }} części + sufiksy kolorów
 */
export function splitPlanByColors(nonlandCards, colorsOf = defaultColorsOf, paymentColorsOf = () => []) {
  // „Bezkolorowy wypełniacz" = brak koloru ALBO wszystkie 5 (any-color, np.
  // Rupture Spire) — ląd dający dowolny kolor nie ma preferencji strony, więc
  // balansuje jak artefakt. Karta o 1-4 KONKRETNYCH kolorach ma tożsamość.
  const isFiller = (c) => {
    const n = colorsOf(c).length;
    return n === 0 || n === COLORS.length;
  };
  const filler = nonlandCards.filter(isFiller);
  const colored = nonlandCards.filter((c) => !isFiller(c));

  let best = null;
  for (let mask = 1; mask < 31; mask += 1) {
    const assignedA = COLORS.filter((_, i) => mask & (1 << i));
    const setA = new Set(assignedA);
    const a = [];
    const b = [];
    let leak = 0;
    for (const card of colored) {
      const cs = colorsOf(card);
      const inCountA = cs.filter((c) => setA.has(c)).length;
      const inCountB = cs.length - inCountA;
      if (inCountA > 0 && inCountB > 0) leak += 1; // karta rozdarta między strony
      if (inCountA > inCountB) a.push(card);
      else if (inCountB > inCountA) b.push(card);
      else if (setA.size <= 2) a.push(card); // remis: preferuj mniejszą tożsamość A
      else b.push(card);
    }
    // Wypełniacz bezkolorowy dosypujemy naprzemiennie do mniejszej strony.
    let sizeA = a.length;
    let sizeB = b.length;
    let addA = 0;
    let addB = 0;
    for (let f = filler.length; f > 0; f -= 1) {
      if (sizeA + addA <= sizeB + addB) addA += 1; else addB += 1;
    }
    sizeA += addA;
    sizeB += addB;
    if (sizeA < MIN_NONLAND || sizeB < MIN_NONLAND) continue;

    const imbalance = Math.abs(sizeA - sizeB);
    const cost = leak * 10 + imbalance;
    if (!best || cost < best.cost || (cost === best.cost && mask < best.mask)) {
      best = {
        mask, cost, leak, imbalance, assignedA, coloredA: a, coloredB: b, addA, addB,
      };
    }
  }

  if (!best) return null;

  const assignedB = COLORS.filter((c) => !new Set(best.assignedA).has(c));
  const { a, b } = distributeColorless(
    best.coloredA, best.coloredB, filler, best.assignedA, assignedB, paymentColorsOf,
  );
  return {
    a,
    b,
    suffixA: sideSuffix(best.assignedA, best.coloredA, colorsOf),
    suffixB: sideSuffix(assignedB, best.coloredB, colorsOf),
    leak: best.leak,
    // Liczności RZECZYWISTE (po preferencji pipów) — tym różnią się talie;
    // `leak` zostaje z wyboru podziału (patrz nagłówek).
    imbalance: Math.abs(a.length - b.length),
  };
}

/**
 * Rozdział kart BEZKOLOROWYCH na strony wybranego podziału (L41: jedno źródło
 * dla wyboru strony i dla liczności raportowanych przez generator).
 *
 * 1. Karta z pipami zdolności (`paymentColorsOf`) → strona, która ma WSZYSTKIE
 *    te kolory (jeśli tylko jedna taka strona; obie/żadna = brak preferencji).
 * 2. Reszta → mniejsza strona naprzemiennie (deterministycznie, stała
 *    kolejność wejściowa) — jak przed zgłoszeniem D.
 */
function distributeColorless(coloredA, coloredB, filler, assignedA, assignedB, paymentColorsOf) {
  const a = [...coloredA];
  const b = [...coloredB];
  const undecided = [];
  for (const card of filler) {
    const pips = paymentColorsOf(card) ?? [];
    if (pips.length === 0) { undecided.push(card); continue; }
    const canA = pips.every((color) => assignedA.includes(color));
    const canB = pips.every((color) => assignedB.includes(color));
    if (canA && !canB) a.push(card);
    else if (canB && !canA) b.push(card);
    else undecided.push(card);
  }
  for (const card of undecided) {
    if (a.length <= b.length) a.push(card); else b.push(card);
  }
  return { a, b };
}

/**
 * Czy talia planu wymaga podziału? (>= SPLIT_THRESHOLD kart nielandowych.)
 */
export function needsSplit(nonlandCount) {
  return nonlandCount >= SPLIT_THRESHOLD;
}
