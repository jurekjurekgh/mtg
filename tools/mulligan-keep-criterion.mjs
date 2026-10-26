/**
 * Kryterium mulliganu dla narzędzi audytowych (PMSSB-57) — czysta reguła,
 * testowalna bez partii (ADR 0011, wzorzec `isMainLogEvent`).
 *
 * Dlaczego osobny moduł (audyt PR #175, pętla jakości 2026-10-26c): kryterium
 * żyło wprost w pętli `tools/scoring-mulligan-audit.mjs` i miało dwa błędy
 * pomiaru, których nie dało się przypiąć testem:
 *
 *  1. **Cudza ręka liczona jako własne czary.** `playerView.zones.hand` to
 *     strefa ZŁOŻONA — karty przeciwnika trafiają tam jako
 *     `{ id, controllerId, hidden: true }` z ukrytym `kind`
 *     (`src/engine/game-state.js:6867`, kontrakt FoW ADR 0003/0017).
 *     Filtr `kind !== 'land'` liczył je jako czary, więc raport pokazywał
 *     „czary=12” dla 7-kartowej ręki. Silnik filtruje rękę po
 *     `controllerId` (game-state.js:2561) — narzędzie musi tak samo.
 *  2. **Kryterium surowsze od polityki.** Dokumentowana polityka bota to
 *     „keep ⇔ ≥2 lądy albo ≥2 mulligany” (2026-09-14f). Klasa „keep bez
 *     grywalnego czaru” miała opisywać rękę, w której gracz NIC nie robi
 *     przez ≥2 tury, a była zapisana jako `najtańszy > lądy` — czyli
 *     fałszywy alarm dla zwykłej ręki 2 lądy + najtańszy czar 3 many
 *     (po dobraniu jednego lądu czar jest grywalny). Rotująca próbka talii
 *     (ADR 0024) ujawniła to pierwszym trafieniem: 0 obserwacji przez
 *     miesiąc nie znaczyło „klasa czysta”, tylko „brak danych” (L179).
 *
 * Reguła po naprawie: alarm jest wtedy, gdy ręka NIE staje się grywalna nawet
 * po JEDNYM dodatkowym lądzie (`najtańszy > lądy + 1`) — wtedy faktycznie
 * mija ≥2 tury bez akcji. Poprzeczka `lądy + 1` jest wyborem POMIARU
 * (dokumentowanym tutaj), nie zmianą polityki bota; zmiana polityki wymaga
 * pełnego benchmarku (ADR 0018/0019).
 */

/** Karty WŁASNEJ ręki z widoku gracza (strefa ręki jest złożona — FoW). */
export function ownHandCards(hand, playerId) {
  if (!Array.isArray(hand)) return [];
  return hand.filter((card) => card && card.hidden !== true && (card.controllerId ?? playerId) === playerId);
}

/**
 * Podsumowanie własnej ręki do decyzji mulliganu.
 * `cheapestSpell` = najmniejszy `manaCost` wśród nie-lądów (null, gdy brak).
 */
export function ownHandSummary(hand, playerId) {
  const own = ownHandCards(hand, playerId);
  const lands = own.filter((card) => (card.kind ?? '') === 'land').length;
  const spells = own.filter((card) => (card.kind ?? '') !== 'land');
  const cheapestSpell = spells.length ? Math.min(...spells.map((card) => card.manaCost ?? 99)) : null;
  return { lands, spells: spells.length, cheapestSpell };
}

/**
 * Klasyfikacja decyzji mulliganu. Zwraca powód naruszenia albo `null`.
 * Kolejność klas jest istotna: klasa „keep bez czarów” obejmuje ręce bez
 * nie-lądów, więc nie może być liczona dwa razy.
 */
export function classifyMulliganDecision({ keep, mulligans = 0, lands, spells, cheapestSpell }) {
  const mull = Number.isInteger(mulligans) ? mulligans : 0;
  // (a) polityka: keep przy <2 lądach wymaga ≥2 mulliganów.
  if (keep && lands < 2 && mull < 2) return 'KEEP bez polityki';
  if (!keep && lands >= 2 && mull < 2) return 'MULLIGAN mimo 2+ lądów';
  if (!keep) return null;
  // (b) ręka bez czarów albo bez czaru grywalnego nawet po jednym lądzie.
  if (lands >= 2 && spells === 0) return 'KEEP bez czarów (same lądy)';
  if (lands >= 2 && cheapestSpell != null && cheapestSpell > lands + 1) return 'KEEP bez grywalnego czaru';
  return null;
}
