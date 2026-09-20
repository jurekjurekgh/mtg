import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guideManaSources, renderManaWizard, wizardProgress } from '../src/table/mana-wizard.js';

/**
 * Zgłoszenie G (właściciel, 2026-09-20): „Canonized in Blood (koszt {1}{B}) —
 * kreator many kazał mi tapnąć 4 lądy do czaru za dwa many”.
 *
 * Silnik był czysty (proby: oferta/deskryptor/koszt {1}{B} = 2 many), więc
 * wadliwa była WARSTWA PROWADZENIA PŁATNOŚCI w kreatorze: lista źródeł szła
 * w porządku stołu, a po zebraniu sumy kreator dalej proponował lądy bez
 * brakującego koloru. Gracz tapujący „po kolei z góry” (Wyspa, Góra, Las,
 * Bagno) tapował 4 lądy, bo kolor {B} dopinał się dopiero na ostatnim.
 *
 * Kontrakt pinowany tutaj: przy koszcie {1}{B} i czterech nietapniętych
 * podstawowych lądach (Wyspa, Góra, Las, Bagno) kreator
 * 1) stawia źródło brakującego koloru PIERWSZE (pierwszy wiersz = krok, który
 *    przybliża płatność),
 * 2) po zebraniu sumy NIE proponuje już źródeł bez brakującego koloru,
 * 3) kończy płatność po dwóch tapnięciach, gdy gracz tapuje wiersze z góry.
 */

/** Widok gracza jak z `session.view()` — tylko to, co czyta kreator. */
function widok(battlefield, mana) {
  return {
    players: [{ id: 'p1', mana }],
    zones: { battlefield },
  };
}

const POLE = [
  { id: 'l1', cardId: 'basic-island', kind: 'land', controllerId: 'p1', tapped: false },
  { id: 'l2', cardId: 'basic-mountain', kind: 'land', controllerId: 'p1', tapped: false },
  { id: 'l3', cardId: 'basic-forest', kind: 'land', controllerId: 'p1', tapped: false },
  { id: 'l4', cardId: 'basic-swamp', kind: 'land', controllerId: 'p1', tapped: false },
];
/** Źródła w tej samej kolejności co stół — dokładnie to widział właściciel. */
const ZRODLA = [
  { id: 'l1', cardId: 'basic-island', colors: ['U'], amount: 1 },
  { id: 'l2', cardId: 'basic-mountain', colors: ['R'], amount: 1 },
  { id: 'l3', cardId: 'basic-forest', colors: ['G'], amount: 1 },
  { id: 'l4', cardId: 'basic-swamp', colors: ['B'], amount: 1 },
];
/** Nazwy jak z `session.nameOf` (kreator pokazuje nazwę karty, nie id). */
const NAZWY = {
  l1: 'Island', l2: 'Mountain', l3: 'Forest', l4: 'Swamp',
};
const KOSZT = { totalNeeded: 2, requirements: [['B']], costStr: '{1}{B}' };

test('G: przewodnik płatności stawia źródło brakującego koloru pierwsze ({1}{B} → Bagno) ', () => {
  assert.deepEqual(
    guideManaSources(ZRODLA, ['B'], false).map((s) => s.id),
    ['l4', 'l1', 'l2', 'l3'],
    'źródło {B} musi być pierwsze, a kolejność stołu zachowana w obrębie grup',
  );
});

test('G: po zebraniu sumy źródło bez brakującego koloru NIE jest proponowane', () => {
  assert.deepEqual(
    guideManaSources(ZRODLA, ['B'], true).map((s) => s.id),
    ['l4'],
    'suma zebrana i brak {B} → tylko Bagno może domknąć płatność',
  );
  // Nic nie daje brakującego koloru → lista jest pusta (prawda), nie „wszystko”.
  assert.deepEqual(guideManaSources(ZRODLA.slice(0, 3), ['B'], true), []);
  // Brak wymagań kolorów (np. koszt bezbarwny) → filtr nie chowa niczego.
  assert.deepEqual(
    guideManaSources(ZRODLA.slice(0, 3), [], true).map((s) => s.id),
    ['l1', 'l2', 'l3'],
  );
});

test('G: postęp kreatora prowadzi {1}{B} do końca w DWÓCH tapnięciach', () => {
  const view = widok(POLE, 0);
  let poolUnits = [];
  const tap = (id) => {
    const src = ZRODLA.find((s) => s.id === id);
    poolUnits = [...poolUnits, src.colors];
    return wizardProgress(widok(POLE, poolUnits.length), 'p1', KOSZT, ZRODLA, poolUnits);
  };
  const krok = (progress) => progress.untappedSources[0];
  // Tapnięcie 1: pierwszy wiersz kreatora — musi pokryć kolor {B} i nic nie
  // zmarnować (creator prowadzi), a nie „pierwszy ląd ze stołu”.
  const p1 = wizardProgress(view, 'p1', KOSZT, ZRODLA, poolUnits);
  assert.equal(krok(p1).id, 'l4', 'pierwszy wiersz to Bagno (pokrywa {B})');
  assert.equal(krok(p1).coversMissing, true, 'wiersz wie, że pokrywa brakujący kolor');
  const po1 = tap('l4');
  assert.equal(po1.done, false, 'po jednym tapnięciu płatność jeszcze nie skompletowana');
  // Tapnięcie 2: pierwszy wiersz znowu (gracz tapuje z góry) — kończy płatność.
  const drugi = krok(po1);
  assert.ok(drugi, 'po pokryciu koloru zostają źródła na sumę');
  const po2 = tap(drugi.id);
  assert.equal(po2.done, true, 'płatność {1}{B} domyka się po DWÓCH tapnięciach');
  assert.equal(poolUnits.length, 2, 'dwa tapnięcia — ani jednego więcej niż koszt');
});

test('G: render nazywa brakujący kolor przy źródle i nie prosi o bezużyteczne', () => {
  class MiniEl {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.className = ''; this.textContentValue = ''; }
    set textContent(v) { this.textContentValue = String(v); this.children = []; }
    get textContent() { return this.textContentValue + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this.textContentValue = String(v); this.children = []; }
    get innerHTML() { return this.textContentValue; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const progress = wizardProgress(widok(POLE, 0), 'p1', KOSZT, ZRODLA, []);
    const host = new MiniEl('div');
    renderManaWizard(host, {
      costStr: progress.costStr ?? KOSZT.costStr,
      remainingTotal: progress.remainingTotal,
      requirements: progress.requirements,
      missingColors: progress.missingColors,
      untappedSources: progress.untappedSources.map((src) => ({ ...src, name: NAZWY[src.id] })),
    }, {});
    // Wiersz źródła to element KLIKALNY (rodzina picker.js — klasa wisi też na
    // opakowaniu, dokładnie jak w selektorze Żywego Testera).
    const wiersze = (function walk(el, acc = []) {
      for (const c of el.children ?? []) { acc.push(c); walk(c, acc); }
      return acc;
    })(host).filter((el) => /mana-wizard-source/.test(String(el.className))
      && (el.listeners.click ?? []).length > 0);
    assert.equal(wiersze.length, 4, 'wszystkie cztery lądy są dostępne w pierwszym kroku');
    assert.match(wiersze[0].textContent, /Tapnij: Swamp/);
    assert.match(wiersze[0].textContent, /pokrywa/, 'wiersz mówi wprost, że pokrywa brakujący kolor');
    assert.doesNotMatch(wiersze[1].textContent, /pokrywa/, 'Góra/Wyspa nic nie pokrywają');

    // Suma zebrana bez koloru: kreator nie proponuje już niczego poza kolorem.
    const poSumie = wizardProgress(widok(POLE, 2), 'p1', KOSZT, ZRODLA, [['U'], ['R']]);
    const host2 = new MiniEl('div');
    renderManaWizard(host2, {
      costStr: KOSZT.costStr,
      remainingTotal: poSumie.remainingTotal,
      requirements: poSumie.requirements,
      missingColors: poSumie.missingColors,
      untappedSources: poSumie.untappedSources.map((src) => ({ ...src, name: NAZWY[src.id] })),
    }, {});
    const wiersze2 = (function walk(el, acc = []) {
      for (const c of el.children ?? []) { acc.push(c); walk(c, acc); }
      return acc;
    })(host2).filter((el) => /mana-wizard-source/.test(String(el.className))
      && (el.listeners.click ?? []).length > 0);
    assert.equal(wiersze2.length, 1, 'po zebraniu sumy zostaje JEDEN wiersz');
    assert.match(wiersze2[0].textContent, /Tapnij: Swamp/,
      'po zebraniu sumy zostaje wyłącznie źródło brakującego koloru ({B})');
    assert.doesNotMatch(wiersze2[0].textContent, /Island|Mountain|Forest/, 'źródła bez {B} nie wracają na listę');
  } finally {
    globalThis.document = previousDocument;
  }
});
