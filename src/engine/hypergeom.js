/**
 * B3 — modelowanie przeciwnika (docs/BOT_ROADMAP.md): deterministyczne
 * prawdopodobieństwo hipergeometryczne.
 *
 * Talie obu graczy są znane (decks/*.txt), a PlayerView pokazuje liczbę kart
 * w ręce i bibliotece przeciwnika oraz wszystkie strefy publiczne (bitwisko,
 * grób, exile, stos). Model: spośród N nieznanych kart przeciwnika
 * (biblioteka + ręka) K to kopie „odpowiedzi" (np. removalu), a próbka n to
 * jego ręka. P(≥1 odpowiedź w ręce) = 1 − P(0), gdzie P(0) liczy się
 * iteracyjnie — dokładnie, bez silni (małe liczby, zero ryzyka przepełnienia).
 *
 * ADR 0005: czysta matematyka, zero Math.random, zero zegara — ten sam stan
 * daje zawsze tę samą wartość.
 */

/**
 * Prawdopodobieństwo, że w próbce n z populacji N znajdzie się ≥1 spośród
 * K wyróżnionych obiektów (rozkład hipergeometryczny).
 */
export function probAtLeastOne(N, K, n) {
  if (!Number.isInteger(N) || !Number.isInteger(K) || !Number.isInteger(n)) {
    throw new TypeError('Parametry muszą być liczbami całkowitymi');
  }
  if (N < 0 || K < 0 || n < 0) throw new RangeError('Parametry nie mogą być ujemne');
  if (K === 0 || n === 0 || N === 0) return 0;
  const k = Math.min(K, N);
  const sample = Math.min(n, N);
  // P(0) = C(N−K, n) / C(N, n) = ∏_{i=0}^{n−1} (N−K−i)/(N−i)
  let p0 = 1;
  for (let i = 0; i < sample; i += 1) {
    p0 *= (N - k - i) / (N - i);
    if (p0 <= 0) { p0 = 0; break; }
  }
  return 1 - p0;
}
