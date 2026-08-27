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

/** Kolory karty (mono/multi/bezkolorowa) — z pola colors[]. */
function cardColors(card) {
  return Array.isArray(card.colors) ? card.colors.filter((c) => COLORS.includes(c)) : [];
}

/**
 * Sufiks pliku/nazwy dla strony podziału: litery przypisanych kolorów, które
 * SĄ faktycznie używane przez karty tej strony, w kolejności WUBRG. Partycja
 * gwarantuje, że sufiksy obu stron są ROZŁĄCZNE (każdy kolor po jednej stronie).
 * Strona bez kart kolorowych (same bezkolorowe) → 'c'.
 */
function sideSuffix(assignedColors, sideCards) {
  const used = assignedColors.filter((c) => sideCards.some((card) => cardColors(card).includes(c)));
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
 *     mniejszej strony, żeby zbalansować liczności.
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
export function splitPlanByColors(nonlandCards) {
  const filler = nonlandCards.filter((c) => cardColors(c).length === 0);
  const colored = nonlandCards.filter((c) => cardColors(c).length > 0);

  let best = null;
  for (let mask = 1; mask < 31; mask += 1) {
    const assignedA = COLORS.filter((_, i) => mask & (1 << i));
    const setA = new Set(assignedA);
    const a = [];
    const b = [];
    let leak = 0;
    for (const card of colored) {
      const cs = cardColors(card);
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

  // Rozdziel wypełniacz bezkolorowy zgodnie z policzonymi addA/addB
  // (deterministycznie: stała kolejność wejściowa).
  const fillerA = filler.slice(0, best.addA);
  const fillerB = filler.slice(best.addA, best.addA + best.addB);
  const a = [...best.coloredA, ...fillerA];
  const b = [...best.coloredB, ...fillerB];
  const assignedB = COLORS.filter((c) => !new Set(best.assignedA).has(c));
  return {
    a,
    b,
    suffixA: sideSuffix(best.assignedA, best.coloredA),
    suffixB: sideSuffix(assignedB, best.coloredB),
    leak: best.leak,
    imbalance: best.imbalance,
  };
}

/**
 * Czy talia planu wymaga podziału? (>= SPLIT_THRESHOLD kart nielandowych.)
 */
export function needsSplit(nonlandCount) {
  return nonlandCount >= SPLIT_THRESHOLD;
}
