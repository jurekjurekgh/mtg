/**
 * Parsowanie kosztu many z zapisu Scryfall typu "{1}{W}{B}", "{W/B}{U}", "{2}{W/P}".
 * Zwraca strukturę z generic i listą wymagań kolorowych.
 *
 * Tokeny:
 * - liczba (np. "1", "2", "10") → generic
 * - kolor "W","U","B","R","G" → colored {colors:[W]}
 * - hybryda "W/B" → hybrid {colors:[W,B]} — pip opłacany JEDNYM z kolorów
 *   (CR 107.4e; dokładne, nie uproszczenie)
 * - phyrexian "W/P" → phyrexian {colors:[W]} — pip opłacany {W} ALBO 2 życia
 *   (CR 107.4f/118.9); ścieżki rzutu odejmują pipy opłacone życiem
 *   (`phyrexianPayWithLife`, coloredPipsOf niżej)
 * - "X" → variable: wartość wybiera gracz przy rzucie (CR 107.3a), więc
 *   parser jej nie liczy — ścieżki X dokładają ją same
 *
 * GRANICE KATALOGU (Etap F, polecenie właściciela: reguł kart nieobecnych
 * nie kodujemy, ale opisujemy je jasno w kodzie; strażnik:
 * test/etap-f-2026-09-24-granice-katalogu.test.js):
 * - "{C}" (CR 107.4c: pip bezbarwny płaci się WYŁĄCZNIE maną bezbarwną) —
 *   żadna karta katalogu nie ma go w koszcie many. Parser liczy go dziś jak
 *   generic, co byłoby BŁĘDEM (kolorowe źródło nie może go opłacić). Gdy
 *   pojawi się pierwsza taka karta: dodać kategorię `colorless` w wyniku
 *   parseManaCost, wymaganie „jednostka bez koloru" w matchColorRequirements/
 *   canPayColoredCost/spendMana (resources.js) i w kreatorze many.
 * - hybryda mono „{2/W}" (CR 107.4e: {2} ALBO {W}) i phyrexian hybryda
 *   „{W/U/P}" — brak w katalogu; pierwszy nie jest dziś rozpoznawany (token
 *   nieznany = pomijany), drugi traktowany jak phyrexian z OR kolorów.
 * - „{S}" (snow), „{H}" i inne — brak w katalogu; nieznany token jest
 *   pomijany, więc pierwsza taka karta MUSI dostać obsługę razem z wpisem.
 */

import { MANA_COSTS } from '../cards/mana-costs-data.js';
// CR 702.73a — rabat „następny czar [podtyp]" czyta typy stworów przez
// wspólny predykat (changeling jest każdym typem stworów, także w ręce).
import { hasCreatureType } from './permanents.js';

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
      // CR 107.4c: {C} wymaga many BEZBARWNEJ — w katalogu nie występuje
      // (strażnik granic katalogu); patrz nagłówek pliku, co zrobić, gdy się
      // pojawi. Do tego czasu gałąź nie jest osiągalna z danych kart.
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
      // Nieznany token: nieosiągalny z katalogu (strażnik granic katalogu
      // sprawdza każdy koszt w MANA_COSTS). Patrz nagłówek pliku.
    }
  }
  return { generic, colored, hybrid, phyrexian };
}

/**
 * Łączna liczba many potrzebnej (generic + wszystkie kolorowe symbole)
 */
/**
 * Modyfikatory kosztu czarów z permanentów na polu bitwy (CR 601.2f/618,
 * Etherium Sculptor: „Artifact spells you cast cost {1} less to cast").
 * Sumuje `amount` zdolności statycznych z deskryptorem `costModifier`
 * kontrolowanych przez kontrolera rzucanego obiektu, których `spellTypes`
 * pasują do typów rzucanej karty (każdy wymieniony typ musi być na karcie).
 * Zwraca 0, gdy nic nie redukuje. Zdolność żyje na permanencie — znika
 * natychmiast po jego odejściu z pola bitwy (liczona przy każdym odczycie).
 */
/**
 * M158/Batch 39 (Invasion of the Giants III): zużycie jednorazowego rabatu
 * na następny czar podtypu — wywoływane po UDANYM rzucie czaru/permanentu
 * (rabat „the NEXT ... spell" nie zostaje na kolejne zaklęcia).
 */
export function consumePendingSpellDiscount(state, object) {
  if (!state || !object?.controllerId || !(state.pendingSpellDiscounts ?? []).length) return;
  const idx = (state.pendingSpellDiscounts ?? []).findIndex((d) => {
    if (d.playerId !== object.controllerId) return false;
    if (d.subtype != null && !hasCreatureType(object, d.subtype)) return false;
    return (d.amount ?? 0) > 0;
  });
  if (idx === -1) return;
  state.pendingSpellDiscounts = state.pendingSpellDiscounts.filter((_, i) => i !== idx);
}

export function costReductionForSpell(state, object) {
  if (!state || !object?.controllerId) return 0;
  const spellTypes = object.types ?? [];
  let reduction = 0;
  // M158/Batch 39 (Invasion of the Giants III): jednorazowy rabat na następny
  // czar podtypu („The next Giant spell ... costs {2} less") — konsumowany
  // przy udanym rzucie (consumePendingSpellDiscount), wygasa w cleanup.
  for (const discount of state.pendingSpellDiscounts ?? []) {
    if (discount.playerId !== object.controllerId) continue;
    if (discount.subtype != null && !hasCreatureType(object, discount.subtype)) continue;
    reduction += discount.amount ?? 0;
  }
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

/**
 * M111 (CR 601.2f): obniżka kosztu przy KOSZCIE ALTERNATYWNYM (escape,
 * flashback, cleave, adventure, bestow). Kolejność wyliczania kosztu to
 * „koszt alternatywny → podwyżki → obniżki", więc modyfikatory z permanentów
 * (Etherium Sculptor) działają także wtedy, gdy gracz NIE płaci kosztu
 * wydrukowanego. Redukujemy wyłącznie część generyczną TEGO kosztu — pipy
 * kolorowe zostają (`colors` opisuje wymagania kolorowe kosztu alternatywnego;
 * gdy deskryptor ich nie niesie, cały koszt liczy się jak generyczny).
 */
/**
 * M113 (CR 601.2f): WARUNKOWA obniżka z samej karty — „this spell costs {1}
 * less to cast if …". Deskryptor (`object.costReduction` dla permanentów,
 * `object.spell.costReduction` dla instant/sorcery) niesie kwotę i warunek;
 * warunki są generyczne (liczba artefaktów, kontrolowany podtyp), nigdy nazwa
 * karty (ADR 0002). Zwraca kwotę obniżki (0, gdy warunek nie zachodzi).
 */
export function conditionalCostReduction(state, object) {
  const descriptor = object?.costReduction ?? object?.spell?.costReduction ?? null;
  if (!descriptor) return 0;
  const condition = descriptor.condition ?? {};
  const amount = descriptor.amount ?? 0;
  const controlled = () => [...(state?.objects?.values?.() ?? [])]
    .filter((candidate) => candidate.zone === 'battlefield' && candidate.controllerId === object.controllerId);
  if (condition.controlsArtifactsAtLeast != null) {
    const artifacts = controlled()
      .filter((c) => c.kind === 'artifact' || (c.types ?? []).includes('Artifact')).length;
    return artifacts >= condition.controlsArtifactsAtLeast ? amount : 0;
  }
  // Affinity (CR 702.41, Steelfin Whale): „This spell costs {1} less to cast
  // for each artifact you control" — obniżka PER ARTEFAKT, nie progowa.
  // `amount` = obniżka za każdy artefakt (zwykle 1). Warunek niesie flagę,
  // więc liczba artefaktów kontrolera mnoży kwotę.
  if (condition.affinityToArtifacts) {
    const artifacts = controlled()
      .filter((c) => c.kind === 'artifact' || (c.types ?? []).includes('Artifact')).length;
    return artifacts * amount;
  }
  if (condition.controlsSubtype != null) {
    const has = controlled().some((c) => hasCreatureType(c, condition.controlsSubtype, state));
    return has ? amount : 0;
  }
  return 0;
}

/**
 * CR 702.66a/66b (Delve): część GENERYCZNA kosztu CAŁKOWITEGO czaru —
 * „For each generic mana in this spell's total cost, you may exile a card from
 * your graveyard rather than pay that mana”, a sama zdolność „applies only
 * after the total cost of the spell with delve is determined”. Limit wygnania
 * NIE jest więc liczbą z wydruku: obniżki (CR 601.2f — modyfikatory z
 * permanentów i warunkowe z samej karty) zmniejszają część generyczną, a
 * efekt zwiększający koszt by ją zwiększył (ruling KTK 2021-03-19: „you can't
 * exile more cards than the generic mana requirement of a spell with delve …
 * unless an effect has increased its cost”). Podwyżek kosztu katalog nie
 * modeluje (ADR 0022 — żadna karta kolekcji ich nie ma), więc wzór obejmuje
 * druk minus obniżki, nigdy poniżej {0} (CR 118.7).
 *
 * JEDNO źródło dla limitu (`delveExileLimit` w spells.js) i dla walidacji obu
 * ścieżek płatności (`castSpell`, `castPermanent`) — klasa L107: bliźniacza
 * reguła policzona dwa razy rozjeżdża się (audyt PR #130, znalezisko B: limit
 * z wydruku pozwalał wygnać więcej, niż wynosił koszt, więc `manaSpent`
 * stawał się ujemny i `spendMana` rzucała RangeError PO wygnaniu kart).
 * Dla kart spoza `MANA_COSTS` (obiekty syntetyczne) cały `manaCost` liczy się
 * jak generyczny — ta sama konwencja co `reduceGenericCost`.
 */
export function delveGenericMana(state, object) {
  const costStr = MANA_COSTS[object?.cardId] ?? null;
  const printed = costStr != null ? parseManaCost(costStr).generic : (object?.manaCost ?? 0);
  const reduction = Math.max(0, costReductionForSpell(state, object) + conditionalCostReduction(state, object));
  return Math.max(0, printed - Math.min(reduction, printed));
}

export function reduceAlternativeCost(state, object, totalCost, colors = []) {
  const base = totalCost ?? 0;
  const reduction = costReductionForSpell(state, object);
  if (!Number.isInteger(reduction) || reduction <= 0) return base;
  const generic = Math.max(0, base - (colors?.length ?? 0));
  return Math.max(0, base - Math.min(reduction, generic));
}

export function totalManaNeeded(parsed) {
  return parsed.generic + parsed.colored.length + parsed.hybrid.length + parsed.phyrexian.length;
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
