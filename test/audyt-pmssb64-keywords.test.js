// PMSSB-64 (batch 68) — słowa kluczowe ciała stworzenia rzucanego z ręki są wyceniane.
// Przed: cast_permanent czytał tylko P/T i koszt → lifelink/haste/deathtouch Δ = 0; latanie
// dawało płaskie +3 niezależnie od blokerów (dublowało się z kotwicami). Pomiar PRZED/PO:
// tools/pmssb64-keywords-sonda.mjs (PRZED → pmssb64-PRZED.txt, PO → pmssb64-PO.txt).
// Skala: wynik rzutu = Σ wag × 0.9 (waga rodziny `cast`), więc Δ = wartość × 0.9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KW_SCENARIOS, castScore } from '../tools/pmssb64-keywords-sonda.mjs';
import { putSynthCreature } from '../tools/pmssb63-batch68-sonda.mjs';
import { DEFAULT_HEURISTIC_PARAMS, normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const sc = (prefix) => KW_SCENARIOS.find((s) => s.id.startsWith(prefix));

function check(prefix) {
  const s = sc(prefix);
  const aa = castScore({ ...s.a });
  const bb = castScore({ ...s.b });
  const idx = s.zakryty ? aa.length - 1 : 0;
  return { a: aa[idx], b: bb[idx], ok: s.oczekuje(aa[idx], bb[idx]) };
}

test('PMSSB-64/KW1 lifelink 3/3 wyżej niż vanilla przy zdrowym życiu (Δ = gainLifeValue×0.9 = 1.8)', () => {
  const r = check('KW1');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
  assert.ok(Math.abs(r.a - r.b - 1.8) < 0.01, `Δ=${r.a - r.b}`);
});

test('PMSSB-64/KW2 latanie bez latających blokerów wroga: pełna ewazja 8 (Δ = 7.2)', () => {
  const r = check('KW2');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
});

test('PMSSB-64/KW3 latanie przy latającym blokerze wroga: tylko residuum obrony 3 (Δ = 2.7), nie 8', () => {
  // Anty-over-fix: przed zmianą latanie dawało +3 zawsze; przy blokerze ma zostać ta sama wartość.
  const r = check('KW3');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
});

test('PMSSB-64/KW4 haste: tempo ataku w turze rzutu (Δ = 6×0.9 = 5.4)', () => {
  const r = check('KW4');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
});

test('PMSSB-64/KW5 deathtouch: wartość > vanilla (Δ = 4×0.9 = 3.6)', () => {
  const r = check('KW5');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
});

test('PMSSB-64/KW6 lifelink zależy od stanu: przy życiu 3 waży więcej niż przy 20', () => {
  // Stan gry, nie stała: gainLifeValue rośnie, gdy życie jest niskie.
  const r = check('KW6');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
});

test('PMSSB-64/KW7 rzut zakryty (morph): słowa awersu nie wpływają na wynik (CR 708.2a)', () => {
  const r = check('KW7');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
});

test('PMSSB-64/KW8 vanilla bez słów: wynik bez zmian (anty-over-fix)', () => {
  const r = check('KW8');
  assert.equal(r.ok, true, `a=${r.a} b=${r.b}`);
});

// Pokrycie wszystkich słów (poza latanie/haste — mają własne skale, i lifelink — stan gry).
// Δ = wartość pokrętła × 0.9 (waga rodziny cast) dla ciała mocy 3 (moc referencyjna: skala = 1).
const FLAT_KEYWORDS = [
  ['deathtouch', 'creatureKwDeathtouch'], ['vigilance', 'creatureKwVigilance'],
  ['first_strike', 'creatureKwFirstStrike'], ['double_strike', 'creatureKwDoubleStrike'],
  ['menace', 'creatureKwMenace'], ['trample', 'creatureKwTrample'], ['reach', 'creatureKwReach'],
  ['indestructible', 'creatureKwIndestructible'], ['hexproof', 'creatureKwHexproof'],
];

// PMSSB-67/F4: słowa płaskie zastąpione udziałem stanu (floorShare). Pusty stół = brak sygnału →
// creatureKwStateFloor × waga; wyjątki z pełnym sygnałem przy braku wrogów: double strike (nic nie
// blokuje → pełne obrażenia) i menace (zero blokerów → nieblokowalny). Pin sprawdza dokładny wzór.
const FULL_ON_EMPTY_BOARD = new Set(['double_strike', 'menace']);
for (const [kw, knob] of FLAT_KEYWORDS) {
  const share = FULL_ON_EMPTY_BOARD.has(kw) ? 1 : DEFAULT_HEURISTIC_PARAMS.creatureKwStateFloor;
  test(`PMSSB-64/pokrycie ${kw}: Δ = ${knob} × 0.9 × udział stanu (pusty stół ${share})`, () => {
    const d = castScore({ keywords: [kw] })[0] - castScore({ keywords: [] })[0];
    assert.ok(Math.abs(d - DEFAULT_HEURISTIC_PARAMS[knob] * 0.9 * share) < 0.01, `Δ=${d} != ${DEFAULT_HEURISTIC_PARAMS[knob] * 0.9 * share}`);
  });
}

test('PMSSB-64/pokrętło sterują: creatureKwDeathtouch = 0 → Δ deathtouch = 0 (wartość nie jest martwa)', () => {
  const zero = normalizeHeuristicParams({ creatureKwDeathtouch: 0 });
  const d = castScore({ keywords: ['deathtouch'], params: zero })[0] - castScore({ keywords: [], params: zero })[0];
  assert.ok(Math.abs(d) < 0.01, `Δ=${d}`);
});

test('PMSSB-64/pokrętło sterują: creatureKwLifelinkWeight = 0 → lifelink nie zmienia wyceny', () => {
  const zero = normalizeHeuristicParams({ creatureKwLifelinkWeight: 0 });
  const d = castScore({ keywords: ['lifelink'], params: zero })[0] - castScore({ keywords: [], params: zero })[0];
  assert.ok(Math.abs(d) < 0.01, `Δ=${d}`);
});

test('PMSSB-64/anty-over-fix: latanie 1-mocy — przepuszczony = zablokowany (dolna granica 3, bez inwersji)', () => {
  // Ten sam stół, ten sam wróg-ciało; różni się TYLKO to, czy wróg lata (blokuje latanie).
  // Porównanie na tym samym stole, bo samo dodanie wroga zmienia inne człony wyceny.
  const body = { power: 1, toughness: 1, mv: 3 };
  const bez = castScore({ keywords: ['flying'], body, board: (s) => putSynthCreature(s, 'ev', 'p1', { power: 2, toughness: 2, mv: 2 }) })[0];
  const zab = castScore({ keywords: ['flying'], body, board: (s) => putSynthCreature(s, 'ef', 'p1', { power: 2, toughness: 2, mv: 2, keywords: ['flying'] }) })[0];
  assert.ok(Math.abs(bez - zab) < 0.01, `przepuszczony ${bez} != zablokowany ${zab} — inwersja lub zmiana dawnej wartości`);
});
