/**
 * Parsowanie kosztu many z zapisu Scryfall typu "{1}{W}{B}", "{W/B}{U}", "{2}{W/P}".
 * Zwraca strukturę z generic i listą wymagań kolorowych.
 *
 * Tokeny:
 * - liczba (np. "1", "2", "10") → generic
 * - kolor "W","U","B","R","G" → colored {colors:[W]}
 * - "C" → colorless generic? Traktujemy jako generic, ale zaznaczamy jako colorless
 * - hybryda "W/B" → hybrid {colors:[W,B]}
 * - phyrexian "W/P" → phyrexian {colors:[W]}
 * - "X" → variable, ignorujemy dla sprawdzenia kolorów (może być dowolny)
 *
 * Dla uproszczenia hybrid i phyrexian traktujemy jako OR: wymaga jednej z opcji.
 */

import { MANA_COSTS } from '../cards/mana-costs-data.js';

export function parseManaCost(manaCostStr) {
  if (!manaCostStr) return { generic: 0, colored: [], hybrid: [], phyrexian: [] };
  const tokens = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(manaCostStr)) !== null) {
    tokens.push(match[1]);
  }
  let generic = 0;
  const colored = []; // {colors: ['W']}
  const hybrid = []; // {colors: ['W','B']}
  const phyrexian = []; // {colors: ['W']}

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      generic += Number.parseInt(token, 10);
    } else if (token === 'X' || token === 'Y' || token === 'Z') {
      // variable, ignorujemy – może być dowolny
      continue;
    } else if (token === 'C') {
      // colorless – liczy się jako generic, ale wymaga bezbarwnego źródła
      // Dla naszego uproszczenia traktujemy jako generic (każde źródło może)
      generic += 1;
    } else if (/^[WUBRG]$/.test(token)) {
      colored.push({ colors: [token] });
    } else if (/^[WUBRG]\/[WUBRG]$/.test(token)) {
      // hybrid np. W/B, W/U
      const parts = token.split('/');
      hybrid.push({ colors: parts });
    } else if (/^[WUBRG]\/P$/.test(token)) {
      // phyrexian np. W/P
      const color = token.split('/')[0];
      phyrexian.push({ colors: [color] });
    } else if (/^[WUBRG]\/[WUBRG]\/P$/.test(token)) {
      // hybrid phyrexian e.g. W/B/P – rzadkie, traktuj jako phyrexian hybrid
      const parts = token.split('/').filter((p) => p !== 'P');
      phyrexian.push({ colors: parts });
    } else {
      // nieznany token – ignorujemy
    }
  }
  return { generic, colored, hybrid, phyrexian };
}

/**
 * Łączna liczba many potrzebnej (generic + wszystkie kolorowe symbole)
 */
/**
 * Modyfikatory kosztu czarów z permanentów na bitwisku (CR 601.2f/618,
 * Etherium Sculptor: „Artifact spells you cast cost {1} less to cast").
 * Sumuje `amount` zdolności statycznych z deskryptorem `costModifier`
 * kontrolowanych przez kontrolera rzucanego obiektu, których `spellTypes`
 * pasują do typów rzucanej karty (każdy wymieniony typ musi być na karcie).
 * Zwraca 0, gdy nic nie redukuje. Zdolność żyje na permanencie — znika
 * natychmiast po jego odejściu z bitwiska (liczona przy każdym odczycie).
 */
export function costReductionForSpell(state, object) {
  if (!state || !object?.controllerId) return 0;
  const spellTypes = object.types ?? [];
  let reduction = 0;
  for (const candidate of state.objects.values()) {
    if (candidate?.zone !== 'battlefield' || candidate.controllerId !== object.controllerId) continue;
    for (const ability of candidate.abilities ?? []) {
      const mod = ability?.costModifier;
      if (!mod) continue;
      const required = mod.spellTypes ?? [];
      if (required.length > 0 && !required.every((t) => spellTypes.includes(t))) continue;
      reduction += mod.amount ?? 0;
    }
  }
  return reduction;
}

/**
 * Obniżka kosztu o `reduction` z redukcją WYŁĄCZNIE części generycznej
 * (CR 601.2f — „less to cast" działa na {N}, nie na symbole kolorów):
 * część generyczna bierze się z parseManaCost(MANA_COSTS[cardId]); dla kart
 * spoza słownika (testowe) całość traktowana jest jak generyczna — dotych-
 * czasowa semantyka warunkowej obniżki Metalcraft.
 */
export function reduceGenericCost(cardId, baseCost, reduction) {
  const base = baseCost ?? 0;
  if (!Number.isInteger(reduction) || reduction <= 0) return base;
  const parsed = parseManaCost(MANA_COSTS[cardId] ?? null);
  const genericPart = MANA_COSTS[cardId] != null ? parsed.generic : base;
  const reducible = Math.min(reduction, genericPart);
  return Math.max(0, base - reducible);
}

export function totalManaNeeded(parsed) {
  return parsed.generic + parsed.colored.length + parsed.hybrid.length + parsed.phyrexian.length;
}

/**
 * Sprawdza, czy da się opłacić koszt kolorowy z dostępnych źródeł many.
 *
 * sources: array of { id, colors: ['W','U',...], amount: number } – każde źródło produkuje amount many,
 *          colors to kolory jakie może dać (puste = tylko bezbarwna/generic)
 *          dla any-color: colors = ['W','U','B','R','G']
 *
 * requirements: lista wymagań kolorowych do pokrycia, każde {colors: ['W'] } lub {colors:['W','B']} (OR)
 * generic: liczba generic many do pokrycia (może być dowolnym źródłem)
 *
 * Algorytm: backtracking – próbujemy przypisać każde wymaganie kolorowe do innego źródła
 * zdolnego je pokryć, reszta źródeł idzie na generic.
 */
export function canPayColorRequirements(requirements, sources) {
  // Expand sources by amount (np. Apprentice Wizard 3x colorless)
  const expanded = [];
  for (const src of sources) {
    const amt = src.amount ?? 1;
    for (let i = 0; i < amt; i += 1) {
      expanded.push({ id: src.id, colors: src.colors ?? [], index: i });
    }
  }
  // Sort requirements by fewest options (heurystyka)
  const reqWithOptions = requirements.map((req) => {
    const opts = expanded.filter((src) => src.colors.some((c) => req.colors.includes(c)) || src.colors.includes('ANY') || (req.colors.length === 0));
    // ANY source – treat any-color as capable of any
    const capable = expanded.filter((src) => {
      if (src.colors.length === 0) return false; // colorless can't pay colored
      // any-color marker: src has all 5 colors or explicit ANY
      if (src.colors.includes('ANY')) return true;
      return req.colors.some((rc) => src.colors.includes(rc));
    });
    return { req, capableCount: capable.length };
  });
  reqWithOptions.sort((a, b) => a.capableCount - b.capableCount);

  const used = new Set(); // indices of expanded used

  function backtrack(idx) {
    if (idx >= reqWithOptions.length) return true;
    const { req } = reqWithOptions[idx];
    for (let s = 0; s < expanded.length; s += 1) {
      if (used.has(s)) continue;
      const src = expanded[s];
      // src must be able to produce required color
      if (src.colors.length === 0) continue; // colorless can't pay colored
      const canProduce = src.colors.includes('ANY') || req.colors.some((c) => src.colors.includes(c));
      if (!canProduce) continue;
      used.add(s);
      if (backtrack(idx + 1)) return true;
      used.delete(s);
    }
    return false;
  }

  return backtrack(0);
}

export function canPayManaCost(parsed, sources, phyrexianPayWithLife = 0, availableMana = null) {
  // Oblicz liczbę phyrexian opłaconych życiem – usuń tyle wymagań phyrexian
  let phyrexianRemaining = [...parsed.phyrexian];
  let paid = phyrexianPayWithLife;
  if (paid > 0) {
    // usuń pierwsze paid phyrexian
    phyrexianRemaining = phyrexianRemaining.slice(paid);
  }
  const allColoredRequirements = [...parsed.colored, ...parsed.hybrid, ...phyrexianRemaining];

  // Sprawdź całkowitą liczbę źródeł vs potrzebną manę
  const totalNeeded = parsed.generic + allColoredRequirements.length;
  const totalSources = sources.reduce((sum, s) => sum + (s.amount ?? 1), 0);
  const totalAvailable = availableMana != null ? availableMana : totalSources;
  // availableMana to producibleMana (pool + untapped), ale dla kolorów patrzymy na wszystkie
  if (totalAvailable < totalNeeded) return false;

  // Sprawdź kolorowe wymagania – potrzebujemy źródeł zdolnych je pokryć (wszystkie kontrolowane, nie tylko odtapnięte)
  // Dla uproszczenia: sources to wszystkie kontrolowane kolorowe źródła (tapped+untapped)
  if (allColoredRequirements.length === 0) return true;

  return canPayColorRequirements(allColoredRequirements, sources);
}

/**
 * Pip(y) kolorowe kosztu karty (colored + hybrid + phyrexian po odjęciu symboli
 * opłaconych życiem) — lista zbiorów kolorów. Puste, gdy karta bez danych
 * kosztu albo bez kolorowych symboli. Używane do konsumpcji/pokrycia kolorowej
 * puli many (spendMana, canPayColoredCost, kreator).
 */
export function coloredPipsOf(cardId, phyrexianPayWithLife = 0) {
  const parsed = parseManaCost(MANA_COSTS[cardId] ?? null);
  if (!parsed) return [];
  const lifePaid = Math.max(0, Math.min(phyrexianPayWithLife, parsed.phyrexian.length));
  return [
    ...parsed.colored.map((group) => [...group.colors]),
    ...parsed.hybrid.map((group) => [...group.colors]),
    ...parsed.phyrexian.slice(lifePaid).map((group) => [...group.colors]),
  ];
}

/**
 * Czy lista jednostek many (każda = tablica kolorów, jakie może opłacić jako
 * pip; [] = tylko generic) pokryje WSZYSTKIE pip(y) kolorowe — każde wymaganie
 * dopasowane do innej jednostki o przecinającym się zbiorze kolorów
 * (backtracking, deterministyczne: wymagania od najbardziej restrykcyjnych).
 * Pełna MtG-poprawność: dwubarwna jednostka ['U','R'] opłaca U lub R, nie G.
 */
export function matchColorRequirements(units, requirements) {
  if (requirements.length === 0) return true;
  const order = requirements
    .map((colors, index) => ({ colors, index }))
    .sort((a, b) => a.colors.length - b.colors.length);
  const covers = order.map(({ colors }) =>
    units.map((u, i) => (colors.some((c) => u.includes(c)) ? i : -1)).filter((i) => i >= 0));
  const used = new Array(units.length).fill(false);
  const walk = (pos) => {
    if (pos >= order.length) return true;
    for (const i of covers[pos]) {
      if (used[i]) continue;
      used[i] = true;
      if (walk(pos + 1)) return true;
      used[i] = false;
    }
    return false;
  };
  return walk(0);
}
