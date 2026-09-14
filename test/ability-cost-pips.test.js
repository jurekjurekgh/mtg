import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';

/**
 * Strażnik klasowy audytu PR #96/F1 (Óin the Brave): pipy w koszcie zdolności
 * AKTYWOWANEJ (`cost.colors`) muszą mieć pokrycie w tekście Oracle karty —
 * `{1}` to koszt generyczny, nie `{R}` (L23 dla kosztów zaklęć; tu odpowiednik
 * dla kosztów aktywacji).
 *
 * Metoda: z Oracle (po zdjęciu reminder text w nawiasach) zbieramy WYSTĄPIENIA
 * multizbiorów pipów z (a) nagłówków kosztu przed `:` oraz (b) linii
 * „Keyword {koszt}” (ninjutsu/cycling/equip/… — bez dwukropka). Każda zdolność
 * z pipami KONSUMUJE jedno wystąpienie swojego multizbioru.
 *
 * Podniesienie O5 (audyt PR #97, handoff 2026-09-05b): dopasowanie żyło na
 * poziomie KARTY (zbiór unikalnych multizbiorów) — karta z dwiema aktywacjami
 * o tych samych pipach przechodziła nawet, gdy Oracle ma tylko JEDNO
 * wystąpienie. Pierwsza karta z dwiema kolorowymi aktywacjami już jest
 * (death-hood-cobra: 2× {1}{G} gains reach/deathtouch), więc strażnik liczy
 * WYSTĄPIENIA i rozlicza je per zdolność.
 *
 * Ograniczenia (jawne): deskryptory dopłat (kicker/offspring) mają inny kształt
 * i są poza strażnikiem; ROZRÓŻNIENIE WARTOŚCI pipów między zdolnościami tej
 * samej karty (przestawka {R}/{G} vs {G}/{R}) pozostaje poza zasięgiem —
 * tekst Oracle nie niesie mapowania nagłówek→zdolność (patrz test
 * „przestawka pozostaje poza zasięgiem”).
 */
const PIP_RE = /\{([WUBRG])\}/g;
const pipsOf = (s) => [...s.matchAll(PIP_RE)].map((m) => m[1]).sort().join('');

// Symbole, które NIE są generykiem: kolory, {C}, {S}, {T}/{Q} (tap/untap jako
// koszt), {E} (licznik energii). Reszta (hybrydy {W/P}, {2/W}, {X}, {Y}…) czyni
// generyk NIEZNANYM — wtedy strażnik sprawdza tylko pipy (jawna granica metody).
const KNOWN_SYMBOLS = new Set(['W', 'U', 'B', 'R', 'G', 'C', 'S', 'T', 'Q', 'E']);
const GENERIC_TOKEN_RE = /^\{\d+\}$/;

/**
 * Nagłówki kosztów Oracle jako pary (pipy, generyk). Generyk `null` = nieznany
 * (symbol, którego metoda nie umie wycenić) — dopasowanie po generyku wtedy nie
 * obowiązuje. Źródło JEDNO dla strażnika pipów (F1) i strażnika całego kosztu
 * (znalezisko właściciela K, 2026-09-14): rozjazd obu list byłby regresją klasy
 * „dwa miejsca liczą to samo inaczej" (M138/Z10).
 */
function oracleCostHeaders(oracleText) {
  const clean = String(oracleText ?? '').replace(/\([^()]*\)/g, '');
  const headers = [];
  const push = (header) => {
    let generic = 0;
    let unknown = false;
    for (const token of header.match(/\{[^}]+\}/g) ?? []) {
      const inner = token.slice(1, -1);
      if (GENERIC_TOKEN_RE.test(token)) { generic += Number(inner); continue; }
      if (KNOWN_SYMBOLS.has(inner)) continue;
      unknown = true;
    }
    headers.push({ pips: pipsOf(header), generic: unknown ? null : generic });
  };
  for (const m of clean.matchAll(/(\{[^{}]*\}[^:\n]*?):/g)) push(m[1]);
  for (const line of clean.split('\n')) {
    if (line.includes(':')) continue;
    const kw = line.trim().match(/^[A-Z][A-Za-z’', ]*?\d?\s*[—–-]?\s*((?:\{[^{}]+\}\s*)+)$/);
    if (kw) push(kw[1]);
  }
  return headers;
}

/** Multizbiór wystąpień pipów w nagłówkach kosztów Oracle: multizbiór → liczba. */
function oraclePipCounts(oracleText) {
  const counts = new Map();
  for (const header of oracleCostHeaders(oracleText)) counts.set(header.pips, (counts.get(header.pips) ?? 0) + 1);
  return counts;
}

/**
 * Missy pipów aktywacji jednej karty: zdolność bez żadnego wystąpienia
 * swojego multizbioru w Oracle oraz NADMIAROWE konsumpcje (popyt zdolności
 * przekracza liczbę wystąpieów w tekście — luka O5).
 */
function abilityPipMisses(card) {
  const available = oraclePipCounts(card.oracleText);
  const misses = [];
  for (const [index, ability] of (card.abilities ?? []).entries()) {
    const colors = ability.cost?.colors ?? [];
    if (colors.length === 0) continue;
    const want = [...colors].sort().join('');
    if ((available.get(want) ?? 0) <= 0) {
      misses.push(`${card.id}#${index} [${want}] brak w Oracle`);
      continue;
    }
    available.set(want, available.get(want) - 1); // konsumpcja wystąpienia
  }
  return misses;
}

/**
 * Kształt kosztu zdolności jako (pipy, generyk) — TA SAMA arytmetyka co
 * `costTextOf` (`src/table/render.js`) i płatność many: `cost.mana` to ŁĄCZNY
 * koszt (CR 202.1), generyk = mana − liczba pipów.
 */
function costShapeOf(ability) {
  const colors = ability.cost?.colors ?? [];
  return { pips: [...colors].sort().join(''), generic: Math.max(0, (ability.cost?.mana ?? 0) - colors.length) };
}

const shapeMatches = (want, header) => want.pips === header.pips && (header.generic === null || header.generic === want.generic);

/** Zdolność aktywowana z jakimkolwiek kosztem many (także bezbarwnym, np. {7}). */
const isManaCostedAbility = (ability) =>
  ability.type === 'activated' && !ability.cost?.manaX && (ability.cost?.mana != null || (ability.cost?.colors ?? []).length > 0);

/** Znalezisko S-1: literalne „\n" w oracleText skleja tekst w jedną linię. */
const escapedLineFeed = (card) => String(card.oracleText ?? '').includes('\\n');

/**
 * Missy CAŁEGO kosztu (pipy + generyk) — rozliczenie per WYSTĄPIENIE jak w O5.
 * Zdolność bez pary w Oracle jest missem, a nie milczeniem: to właśnie ta luka
 * przepuściła `kishla-village` (koszt bez pipu nie ma `colors`, więc strażnik
 * pipów w ogóle go nie widział) i trzy karty zaniżone o generyk.
 */
function auditAbilityCosts(card) {
  const headers = oracleCostHeaders(card.oracleText);
  const misses = [];
  let checked = 0;
  let skipped = 0;
  for (const [index, ability] of (card.abilities ?? []).entries()) {
    if (!isManaCostedAbility(ability)) continue;
    checked += 1;
    const want = costShapeOf(ability);
    const hit = headers.findIndex((header) => shapeMatches(want, header));
    if (hit >= 0) { headers.splice(hit, 1); continue; }
    // Znalezisko S-1: przy literalnym „\n" Oracle karty jest jedną linią, więc
    // karta bez ANI JEDNEGO nagłówka nie daje strażnikowi punktu odniesienia —
    // pominięcie jest jawne i policzone (nie ciche). Karta, której tekst daje
    // choć jeden nagłówek, jest sprawdzana normalnie.
    if (escapedLineFeed(card) && headers.length === 0) { skipped += 1; continue; }
    misses.push(`${card.id}#${index} [${want.pips || '—'}|generyk ${want.generic}] brak zgodnego nagłówka kosztu w Oracle`);
  }
  return { checked, skipped, misses };
}

const abilityCostMisses = (card) => auditAbilityCosts(card).misses;

test('koszty aktywacji: CAŁY koszt (pipy + generyk) ma pokrycie w Oracle (znalezisko właściciela K)', () => {
  const registry = createCardRegistry();
  const misses = [];
  let checked = 0;
  let skippedEscapedText = 0;
  for (const card of registry.all()) {
    if (card.support?.status !== 'supported') continue;
    const audit = auditAbilityCosts(card);
    checked += audit.checked - audit.skipped;
    skippedEscapedText += audit.skipped;
    misses.push(...audit.misses);
  }

  assert.ok(checked >= 90, `strażnik objął ${checked} zdolności z kosztem many (oczekiwane ≥ 90)`);
  assert.equal(skippedEscapedText, 1, 'jedna zdolność (strandwalker, znalezisko S-1) poza zasięgiem przez literalne \\n w oracleText');
  assert.deepEqual(misses, [], `koszt niezgodny z Oracle: ${misses.join('; ')}`);
});

test('znalezisko K: generyk zaniżony o 1 jest missem (kształt Embalm {3}{U})', () => {
  const card = {
    id: 'test-embalm-zanizony',
    oracleText: 'Embalm {3}{U} ({3}{U}, Exile this card from your graveyard: Create a token.)',
    abilities: [{ type: 'activated', cost: { mana: 3, colors: ['U'] } }],
  };
  assert.deepEqual(abilityCostMisses(card), ['test-embalm-zanizony#0 [U|generyk 2] brak zgodnego nagłówka kosztu w Oracle']);
});

test('znalezisko K: brak pipu jest missem nawet przy zgodnym generyku (kształt Kishla Village)', () => {
  const card = {
    id: 'test-brak-pipu',
    oracleText: '{3}{G}, {T}: Surveil 2.',
    abilities: [{ type: 'activated', cost: { mana: 4, tap: true } }],
  };
  assert.deepEqual(abilityCostMisses(card), ['test-brak-pipu#0 [—|generyk 4] brak zgodnego nagłówka kosztu w Oracle']);
});

test('znalezisko K: generyk NIEZNANY ({X}, hybrydy) zawęża strażnika do pipów — jawna granica', () => {
  const card = {
    id: 'test-generyk-x',
    oracleText: '{X}{R}: Deal X damage.',
    abilities: [{ type: 'activated', cost: { mana: 1, colors: ['R'] } }],
  };
  assert.deepEqual(abilityCostMisses(card), []);
});

test('znalezisko K anti-over-fix: zgodny koszt (pipy + generyk) przechodzi', () => {
  const card = {
    id: 'test-koszt-zgodny',
    oracleText: '{5}{G}, {T}: Look at the top four cards.',
    abilities: [{ type: 'activated', cost: { mana: 6, colors: ['G'], tap: true } }],
  };
  assert.deepEqual(abilityCostMisses(card), []);
});

test('koszty aktywacji: pipy (cost.colors) mają pokrycie w Oracle karty (F1)', () => {
  const registry = createCardRegistry();
  const misses = [];
  let checked = 0;
  let multiActivationCards = 0;
  for (const card of registry.all()) {
    if (card.support?.status !== 'supported') continue;
    const colored = (card.abilities ?? []).filter((a) => (a.cost?.colors ?? []).length > 0).length;
    if (colored >= 2) multiActivationCards += 1;
    checked += colored;
    misses.push(...abilityPipMisses(card));
  }
  assert.ok(checked > 0, 'strażnik objął co najmniej jedną zdolność z pipami');
  assert.ok(multiActivationCards > 0, 'w katalogu jest karta z 2+ kolorowymi aktywacjami (warunek podniesienia O5)');
  assert.deepEqual(misses, [], `pip bez pokrycia w Oracle: ${misses.join(', ')}`);
});

test('O5 podniesienie: dwie aktywacje {G} konsumują DWA wystąpienia — jedno w Oracle to miss', () => {
  // Syntetyk kształtu death-hood-cobra, ale okradziony z drugiego nagłówka:
  // stary strażnik (zbiór unikalnych multizbiorów) to przepuszczał — popyt
  // obu zdolności zaspokaja jedno wystąpienie „G” w zbiorze.
  const card = {
    id: 'test-cobra-okrojona', oracleText: '{1}{G}: This creature gains deathtouch until end of turn.',
    abilities: [
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
    ],
  };
  assert.deepEqual(abilityPipMisses(card), ['test-cobra-okrojona#1 [G] brak w Oracle']);
});

test('O5 podniesienie anty-over-fix: prawidłowe dwie aktywacje {G} przy dwóch wystąpieniach przechodzą', () => {
  const card = {
    id: 'test-cobra-dobra', oracleText: '{1}{G}: Reach.\n{1}{G}: Deathtouch.',
    abilities: [
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
      { type: 'activated', cost: { mana: 2, colors: ['G'] } },
    ],
  };
  assert.deepEqual(abilityPipMisses(card), []);
});

test('O5 ograniczenie udokumentowane: przestawka WARTOŚCI pipów między zdolnościami pozostaje poza zasięgiem', () => {
  // Oracle ma {R}: i {G}:, deskryptory mają przestawione wartości (R↔G).
  // Tekst nie niesie mapowania nagłówek→zdolność, więc multizbiory się
  // zgadzają i strażnik milczy — to jawne ograniczenie nagłówka, nie błąd
  // podniesienia. Test pinnie tę świadomość (gdyby ktoś „naprawił” milczenie
  // przez odrzucanie takich kart, zepsuje fałszywie poprawne karty).
  const card = {
    id: 'test-przestawka', oracleText: '{R}: First ability.\n{G}: Second ability.',
    abilities: [
      { type: 'activated', cost: { mana: 0, colors: ['G'] } },
      { type: 'activated', cost: { mana: 0, colors: ['R'] } },
    ],
  };
  assert.deepEqual(abilityPipMisses(card), []);
});
