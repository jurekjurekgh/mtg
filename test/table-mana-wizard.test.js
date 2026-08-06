import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countPaymentVariants,
  coveredRequirementCount,
  manaSourcesOf,
  paymentDescriptorOf,
  renderManaWizard,
  sourceColorsLabel,
  untappedLandSourcesOf,
  wizardProgress,
} from '../src/table/mana-wizard.js';

/**
 * Sekwencyjny kreator płatności many (E.3a, zgłoszenie właściciela 2026-08-06):
 * „engine daje opcje na kolejne many po jednej i dolicza do potrzebnej sumy
 * (tapnij x/y/z)". Testy czystego solvera jednoznaczności + renderowania —
 * integracja mini-DOM z dwukolorową talią jest w test/table-ui.test.js
 * („kreator many: dwukolorowa ręka otwiera wizard i tapuje po jednym”…).
 */

const island = (id) => ({ id, cardId: 'basic-island', colors: ['U'], amount: 1 });
const forest = (id) => ({ id, cardId: 'basic-forest', colors: ['G'], amount: 1 });
const plains = (id) => ({ id, cardId: 'basic-plains', colors: ['W'], amount: 1 });
const campus = (id) => ({ id, cardId: 'prismari-campus', colors: ['U', 'R'], amount: 1 });
const werewolf = (id) => ({ id, cardId: 'moonscarred-werewolf', colors: ['G'], amount: 2 });

test('kreator many: suma z puli pokrywa koszt bez tapowania — płatność jednoznaczna', () => {
  assert.equal(countPaymentVariants([island('a'), forest('b')], 2, 2, [['U']]), 1);
  assert.equal(countPaymentVariants([island('a')], 5, 3, []), 1);
});

test('kreator many: jedyny wariant źródeł — płatność jednoznaczna (auto-tap)', () => {
  // {1}{U} przy dokładnie Wyatt+Lesie: oba muszą wejść do płatności.
  assert.equal(countPaymentVariants([island('a'), forest('b')], 0, 2, [['U']]), 1);
  // {U}{U} przy dwóch Wyspach i Lesie — zbiór {Wyspa,Wyspa} to jedyny profil.
  assert.equal(countPaymentVariants([island('a'), island('b'), forest('c')], 0, 2, [['U'], ['U']]), 1);
});

test('kreator many: kilka wariantów to sygnał kreatora (≥2)', () => {
  // {1}{U} przy Wyspie, Lesie i Równinie: {W,U?} — {I,F} albo {I,P}.
  assert.equal(countPaymentVariants([island('a'), forest('b'), plains('c')], 0, 2, [['U']]), 2);
  // {1}{U} przy dwóch Wyspach i Równinie: {I,I} albo {I,P}.
  assert.equal(countPaymentVariants([island('a'), island('b'), plains('c')], 0, 2, [['U']]), 2);
  // Dwubarwny nonbasic (Prismari Campus) + Wyspa: {Campus} w obu rolach to
  // ten sam profil, ale {U zapłaci Campus albo Wyspa} przy koszcie {1}{U}
  // to jeden profil-zbiór… drugi wariant daje {Campus,Wyspa}.
  assert.equal(countPaymentVariants([campus('a'), island('b')], 0, 2, [['U']]), 1);
  assert.equal(countPaymentVariants([campus('a'), island('b'), forest('c')], 0, 2, [['U']]), 2);
});

test('kreator many: nieopłacalny kolor wymuszony źródłami — 0 wariantów', () => {
  assert.equal(countPaymentVariants([forest('a'), plains('b')], 0, 1, [['U']]), 0);
});

test('kreator many: źródło z amount>1 liczy się do sumy wariantów', () => {
  // Wilkołak {G}{G} + Równina: {2}{G} ma jeden wariant ({Wilkołak,Równina}),
  // bo {Wilkołak x2 profil?} nie — Wilkołak daje 2 many i kolor {G}.
  assert.equal(countPaymentVariants([werewolf('a'), plains('b')], 0, 3, [['G']]), 1);
});

test('kreator many: hybryda akceptuje każdą ze swoich opcji', () => {
  assert.equal(countPaymentVariants([plains('a'), island('b')], 0, 1, [['W', 'U']]), 2);
  assert.equal(countPaymentVariants([plains('a'), plains('b')], 0, 1, [['W', 'U']]), 1);
});

test('kreator many: pokrycie wymagań dopasowuje każde do innego źródła', () => {
  assert.equal(coveredRequirementCount([island('a'), island('b')], [['U'], ['U']]), 2);
  assert.equal(coveredRequirementCount([island('a')], [['U'], ['U']]), 1);
  assert.equal(coveredRequirementCount([campus('a')], [['R']]), 1);
  assert.equal(coveredRequirementCount([forest('a')], [['U']]), 0);
});

test('kreator many: etykiety kolorów źródła', () => {
  assert.equal(sourceColorsLabel(['U', 'R']), '{U}{R}');
  assert.equal(sourceColorsLabel([]), 'bezbarwna');
  assert.equal(sourceColorsLabel(['W', 'U', 'B', 'R', 'G']), 'dowolny kolor');
});

function fakeView({ hand = [], battlefield = [], graveyard = [], legalCommands = [], mana = 0 }) {
  return {
    players: [{ id: 'p1', life: 20, mana }],
    zones: {
      hand, battlefield, stack: [], graveyard, exile: [], library: [],
    },
    legalCommands,
  };
}

test('kreator many: deskryptor płatności czyta koszt z MANA_COSTS (Curate {1}{U})', () => {
  const view = fakeView({ hand: [{ id: 'h1', cardId: 'curate', controllerId: 'p1' }] });
  const d = paymentDescriptorOf({ type: 'cast_spell', objectId: 'h1' }, view);
  assert.ok(d, 'Curate powinien mieć deskryptor');
  assert.equal(d.totalNeeded, 2);
  assert.deepEqual(d.requirements, [['U']]);
  assert.equal(d.costStr, '{1}{U}');
});

test('kreator many: effectiveGeneric skraca płatność obniżoną z pełnego stanu (Etherium Sculptor)', () => {
  const view = fakeView({ hand: [{ id: 'h1', cardId: 'curate', controllerId: 'p1' }] });
  const full = paymentDescriptorOf({ type: 'cast_spell', objectId: 'h1' }, view, { effectiveGeneric: 0 });
  assert.ok(full, 'deskryptor z opcją efektywną');
  assert.equal(full.totalNeeded, 1, '{1}{U} z generyczną obniżoną do 0 = tylko niebieskie źródło');
  assert.equal(full.effectiveGeneric, 0);
  const capped = paymentDescriptorOf({ type: 'cast_spell', objectId: 'h1' }, view, { effectiveGeneric: 7 });
  assert.equal(capped.totalNeeded, 2, 'effectiveGeneric nigdy ponad wydrukowaną generyczną');
  assert.equal(capped.effectiveGeneric, 1);
});

test('kreator many: deskryptor pomija komendy bez wyboru kolorów źródeł', () => {
  const view = fakeView({ hand: [{ id: 'h1', cardId: 'curate', controllerId: 'p1' }] });
  assert.equal(paymentDescriptorOf({ type: 'cast_spell', objectId: 'h1', xValue: 3 }, view), null, '{X} poza kreatorem');
  assert.equal(paymentDescriptorOf({ type: 'cast_spell', objectId: 'h1', faceDown: true }, view), null, 'morph poza kreatorem');
  assert.equal(paymentDescriptorOf({ type: 'play_land', objectId: 'h1' }, view), null, 'ląd to nie rzut');
  assert.equal(paymentDescriptorOf({ type: 'cast_spell', objectId: 'nie-ma' }, view), null, 'obcy obiekt');
});

// --- E.3a cz. B: tryby kosztu alternatywnego (cleave/escape/bestow/morph) ---

test('kreator many: cleave — koszt alternatywny jako liczba, kolory z bazy', () => {
  // Lunar Rejection {1}{U} (baza), cleave {3}{U} = manaCost 4.
  const view = fakeView({ hand: [{ id: 'h1', cardId: 'lunar-rejection', controllerId: 'p1', spell: { cleave: { manaCost: 4 } } }] });
  const d = paymentDescriptorOf({ type: 'cast_cleave', objectId: 'h1' }, view);
  assert.ok(d, 'cleave powinien mieć deskryptor');
  assert.equal(d.totalNeeded, 4);
  assert.deepEqual(d.requirements, [['U']], 'kolory z bazowego {1}{U}');
  assert.equal(d.costStr, 'Cleave (4)');
  assert.equal(d.effectiveGeneric, 3, '4 − 1 wymóg {U} = 3 generyczne (bez obniżek)');
});

test('kreator many: escape — koszt z opts (widok grobu nie niesie spell)', () => {
  // Sweet Oblivion {1}{U} (baza), escape {3}{U} = cost 4. Obiekt w GROBIE.
  const view = fakeView({ graveyard: [{ id: 'g1', cardId: 'sweet-oblivion', controllerId: 'p1' }] });
  assert.equal(paymentDescriptorOf({ type: 'cast_escape', objectId: 'g1' }, view), null, 'brak opts.escapeCost → null');
  const d = paymentDescriptorOf({ type: 'cast_escape', objectId: 'g1' }, view, { escapeCost: 4 });
  assert.ok(d);
  assert.equal(d.totalNeeded, 4);
  assert.deepEqual(d.requirements, [['U']]);
  assert.equal(d.costStr, 'Escape (4)');
});

test('kreator many: bestow — koszt alternatywny aury', () => {
  // Leafcrown Dryad {1}{G} (baza), bestow {3}{G} = cost 4.
  const view = fakeView({ hand: [{ id: 'h1', cardId: 'leafcrown-dryad', controllerId: 'p1', bestow: { cost: 4 } }] });
  const d = paymentDescriptorOf({ type: 'cast_permanent', objectId: 'h1', bestow: true, targets: ['t1'] }, view);
  assert.ok(d);
  assert.equal(d.totalNeeded, 4);
  assert.deepEqual(d.requirements, [['G']]);
  assert.equal(d.costStr, 'Bestow (4)');
});

test('kreator many: morph — bezbarwny koszt, brak wymagań kolorów', () => {
  // Woolly Loxodon morph {3} (zwykły rzut {5}{G}{G}).
  const view = fakeView({ hand: [{ id: 'h1', cardId: 'woolly-loxodon', controllerId: 'p1', morph: { cost: 3 } }] });
  const d = paymentDescriptorOf({ type: 'cast_permanent', objectId: 'h1', faceDown: true }, view);
  assert.ok(d);
  assert.equal(d.totalNeeded, 3);
  assert.deepEqual(d.requirements, [], 'morph bezbarwny (CR 702.36) — brak wymagań kolorów');
  assert.equal(d.costStr, 'Morph (3)');
});

test('kreator many: tryby kosztu bez deskryptora → null', () => {
  const view = fakeView({ hand: [{ id: 'h1', cardId: 'curate', controllerId: 'p1' }] });
  assert.equal(paymentDescriptorOf({ type: 'cast_cleave', objectId: 'h1' }, view), null, 'cleave bez spell.cleave');
  assert.equal(paymentDescriptorOf({ type: 'cast_permanent', objectId: 'h1', bestow: true }, view), null, 'bestow bez object.bestow');
  assert.equal(paymentDescriptorOf({ type: 'cast_permanent', objectId: 'h1', faceDown: true }, view), null, 'morph bez object.morph');
});

test('kreator many: cleave z dwubarwnym landem → ≥2 warianty (kreator się otwiera)', () => {
  // Lunar Rejection cleave {3}{U}=4. 5 źródeł (need 4) → jest wybór, których
  // nie tapnąć: dwubarwny land {U/R} vs Island determinują ≥2 profile.
  const sources = [campus('a'), island('b'), plains('c'), plains('d'), plains('e')];
  assert.ok(countPaymentVariants(sources, 0, 4, [['U']]) >= 2, 'dwubarwny land daje ≥2 profile płatności');
});

// --- E.3a cz. A: źródła nie-lądowe (zdolności many permanentów) ---

test('kreator many: manaSourcesOf — lądy + nie-lądowe zdolności many', () => {
  const view = fakeView({
    battlefield: [
      { id: 'l1', cardId: 'basic-island', kind: 'land', controllerId: 'p1', tapped: false },
      { id: 'l2', cardId: 'basic-plains', kind: 'land', controllerId: 'p1', tapped: true },
      { id: 'a1', cardId: 'apprentice-wizard', kind: 'creature', controllerId: 'p1', tapped: false },
      { id: 'a2', cardId: 'seers-lantern', kind: 'artifact', controllerId: 'p1', tapped: false },
    ],
    legalCommands: [
      { type: 'activate_ability', playerId: 'p1', objectId: 'a1', abilityIndex: 0 },
      { type: 'activate_ability', playerId: 'p1', objectId: 'a2', abilityIndex: 0 },
      { type: 'activate_ability', playerId: 'p1', objectId: 'a2', abilityIndex: 1 },
    ],
  });
  // abilityInfo symuluje czytanie pełnego stanu (main.js w runtime):
  const info = {
    'a1:0': { cardId: 'apprentice-wizard', colors: [], amount: 3, manaCost: 1, isLand: false },
    'a2:0': { cardId: 'seers-lantern', colors: [], amount: 1, manaCost: 0, isLand: false },
    'a2:1': null, // scry — nie mana
  };
  const abilityInfo = (oid, idx) => info[`${oid}:${idx}`] ?? null;
  const sources = manaSourcesOf(view, 'p1', abilityInfo);
  const ids = sources.map((s) => s.id);
  assert.ok(ids.includes('l1'), 'nietapnięty land w liście');
  assert.ok(!ids.includes('l2'), 'tapnięty land pominięty');
  assert.ok(ids.includes('a1'), 'Apprentice Wizard (dork) w liście');
  assert.ok(ids.includes('a2'), "Seer's Lantern w liście");
  const apprentice = sources.find((s) => s.id === 'a1');
  assert.equal(apprentice.amount, 2, 'Apprentice net +2 (3 produkcji − 1 kosztu {U})');
  assert.equal(apprentice.command.type, 'activate_ability');
  assert.equal(apprentice.kind, 'ability');
  const land = sources.find((s) => s.id === 'l1');
  assert.equal(land.command.type, 'tap_for_mana');
  assert.equal(land.kind, 'land');
});

test('kreator many: manaSourcesOf bez abilityInfo → tylko lądy (zachowanie wstecz)', () => {
  const view = fakeView({ battlefield: [{ id: 'l1', cardId: 'basic-island', kind: 'land', controllerId: 'p1', tapped: false }] });
  const sources = manaSourcesOf(view, 'p1');
  assert.deepEqual(sources.map((s) => s.id), ['l1']);
  assert.equal(sources[0].command.type, 'tap_for_mana');
});

test('kreator many: manaSourcesOf pomija zdolność o netGain ≤ 0', () => {
  const view = fakeView({
    battlefield: [{ id: 'x1', cardId: 'cos', kind: 'artifact', controllerId: 'p1', tapped: false }],
    legalCommands: [{ type: 'activate_ability', playerId: 'p1', objectId: 'x1', abilityIndex: 0 }],
  });
  const abilityInfo = () => ({ cardId: 'cos', colors: [], amount: 1, manaCost: 2, isLand: false }); // net −1
  const sources = manaSourcesOf(view, 'p1', abilityInfo);
  assert.ok(!sources.some((s) => s.id === 'x1'), 'netGain ≤ 0 pominięte');
});

test('kreator many: samo kontrolowanie źródła (bez tapnięcia w sesji) NIE pokrywa koloru', () => {
  // Zasada: manę płaci się TAPUJĄC źródło, nie samym jego kontrolowaniem
  // (posiadanie lasu liczy się do forestwalk, nie do many). Wyspa na bitwisku,
  // ale gracz w tej sesji kreatora nic nie tapnął → {U} niepokryte mimo
  // pełnej puli; rzut nie odpala, dopóki gracz nie tapnie kolorowego źródła.
  const view = fakeView({
    battlefield: [{ id: 'l1', cardId: 'basic-island', kind: 'land', controllerId: 'p1', tapped: false }],
    mana: 2,
  });
  const descriptor = { totalNeeded: 2, requirements: [['U']], costStr: '{1}{U}' };
  const progress = wizardProgress(view, 'p1', descriptor, undefined, []); // pusta pula
  assert.deepEqual(progress.requirements, [{ colors: ['U'], covered: false }]);
  assert.equal(progress.done, false, 'pool pełny, ale pusta pula kolorów — rzut nie odpala');
  // Gracz tapnie Wyspę → w puli jednostka {U} → kolor pokryty, rzut odpala.
  const done = wizardProgress(view, 'p1', descriptor, undefined, [['U']]);
  assert.deepEqual(done.requirements, [{ colors: ['U'], covered: true }]);
  assert.equal(done.done, true);
});

test('kreator many: dork kolorowy (bezbarwny) tworzy wariant płatności', () => {
  // Koszt {3} bezbarwny. Źródła: Apprentice Wizard (net +2, bezbarwny) + 3 Plains.
  // Warianty: {Apprentice, Plains} (suma 3) albo {Plains, Plains, Plains} (suma 3).
  const apprentice = { id: 'a', colors: [], amount: 2 };
  const sources = [apprentice, plains('b'), plains('c'), plains('d')];
  assert.ok(countPaymentVariants(sources, 0, 3, []) >= 2, 'dork +2 daje ≥2 profile płatności');
});

test('kreator many: render — źródło z amount≠1 pokazuje +N', () => {
  let tappedCmd = null;
  class MiniEl {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.className = ''; this.textContentValue = ''; }
    set textContent(v) { this.textContentValue = String(v); this.children = []; }
    get textContent() { return this.textContentValue + this.children.map((c) => c.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    click() { for (const fn of this.listeners.click ?? []) fn({}); }
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const host = new MiniEl('div');
    renderManaWizard(host, {
      costStr: 'Morph (3)', remainingTotal: 3, requirements: [],
      untappedSources: [
        { id: 'a1', cardId: 'apprentice-wizard', name: 'Apprentice Wizard', colors: [], amount: 2, command: { type: 'activate_ability', objectId: 'a1', abilityIndex: 0 } },
        { id: 'l1', cardId: 'basic-island', name: 'Island', colors: ['U'], amount: 1, command: { type: 'tap_for_mana', objectId: 'l1' } },
      ],
    }, { onTapSource: (id) => { tappedCmd = id; } });
    const clickables = (function walk(el2, acc = []) {
      for (const c of el2.children ?? []) { acc.push(c); walk(c, acc); }
      return acc;
    })(host).filter((el3) => (el3.listeners.click ?? []).length > 0);
    assert.match(clickables[0].textContent, /Apprentice Wizard \(bezbarwna \+2\)/, 'dork +2 z sufiksem');
    assert.match(clickables[1].textContent, /Island \(\{U\}\)/, 'land amount=1 bez sufiksu');
    clickables[0].click();
    assert.equal(tappedCmd, 'a1', 'klik dorka → onTapSource(id)');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('kreator many: postęp — Wyspa tapnięta w sesji pokrywa {U}, suma z puli', () => {
  const view = fakeView({
    battlefield: [
      { id: 'l1', cardId: 'basic-island', kind: 'land', controllerId: 'p1', tapped: true },
      { id: 'l2', cardId: 'basic-plains', kind: 'land', controllerId: 'p1', tapped: false },
    ],
    mana: 1,
  });
  const descriptor = { totalNeeded: 2, requirements: [['U']], costStr: '{1}{U}' };
  // Wyspa (l1) tapnięta — w kolorowej puli jest jednostka {U} (poolUnits).
  const poolUnits = [['U']];
  const progress = wizardProgress(view, 'p1', descriptor, undefined, poolUnits);
  assert.equal(progress.remainingTotal, 1);
  assert.deepEqual(progress.requirements, [{ colors: ['U'], covered: true }]);
  assert.equal(progress.done, false);
  assert.deepEqual(progress.untappedSources.map((s) => s.id), ['l2']);
  // Dorzucamy drugą manę — płatność kompletna (committed pokrywa {U}).
  const done = wizardProgress(fakeView({ battlefield: view.zones.battlefield, mana: 2 }), 'p1', descriptor, undefined, poolUnits);
  assert.equal(done.done, true);
  assert.deepEqual(untappedLandSourcesOf(view, 'p1').map((s) => s.cardId), ['basic-plains']);
});

test('kreator many: render — przyciski po jednym źródle i Anuluj', () => {
  const taps = [];
  let cancelled = 0;
  class MiniEl {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.listeners = {};
      this.className = '';
      this.textContentValue = '';
    }
    set textContent(v) { this.textContentValue = String(v); this.children = []; }
    get textContent() { return this.textContentValue + this.children.map((c) => c.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    click() { for (const fn of this.listeners.click ?? []) fn({}); }
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    const host = new MiniEl('div');
    renderManaWizard(host, {
      costStr: '{1}{U}',
      remainingTotal: 2,
      requirements: [{ colors: ['U'], covered: false }],
      untappedSources: [
        { id: 'l1', cardId: 'basic-island', name: 'Island', colors: ['U'], amount: 1 },
        { id: 'l2', cardId: 'basic-plains', name: 'Plains', colors: ['W'], amount: 1 },
      ],
    }, {
      onTapSource: (id) => taps.push(id),
      onCancel: () => { cancelled += 1; },
    });
    assert.match(host.textContent, /Płatność \{1\}\{U\} — tapuj źródła po jednym/);
    assert.match(host.textContent, /pozostało 2 many/);
    assert.match(host.textContent, /kolory do pokrycia: \{U\}/);
    const buttons = host.descendants?.() ?? [];
    const clickables = (function walk(el2, acc = []) {
      for (const c of el2.children ?? []) { acc.push(c); walk(c, acc); }
      return acc;
    })(host).filter((el3) => (el3.listeners.click ?? []).length > 0);
    assert.equal(clickables.length, 3, 'dwa źródła + Anuluj');
    assert.match(clickables[0].textContent, /Tapnij: Island \(\{U\}\)/);
    assert.match(clickables[1].textContent, /Tapnij: Plains \(\{W\}\)/);
    clickables[0].click();
    assert.deepEqual(taps, ['l1']);
    clickables[2].click();
    assert.equal(cancelled, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});
