// M311 (zgłoszenie właściciela z testów żywej gry, tor A): KREATOR MANY a
// zdolności many z KOSZTEM aktywacji (Apprentice Wizard „{U}, {T}: Add
// {C}{C}{C}").
//
// Zgłoszenie: „opis w Mana Wizard mówi, że dodaje 2 bezbarwne, ale fizycznie
// dodaje 3; 2 błędy — opis w mana wizard i ilość planowana przez mana wizard
// vs ilość faktycznie dodana do puli many".
//
// Przyczyna u root cause: kreator NETOWAŁ koszt aktywacji z produkcją tego
// samego źródła (3 − 1 = 2). To podwójnie błędne:
//  1. różne waluty — produkcja jest BEZBARWNA {C}{C}{C}, koszt KOLOROWY {U};
//     bezbarwna mana nie zapłaci kolorowego pipu (CR 107.4a);
//  2. różne momenty — koszt płaci `spendMana` z PULI albo auto-tapu INNYCH
//     źródeł PRZED produkcją (CR 601.2h — najpierw koszty, potem zdolność
//     dodaje manę); produkcja NIGDY nie płaci kosztu własnego tapnięcia.
// Skutki u właściciela: opis „+2" kłamał (pula rośnie o 3), a plan płatności
// liczył 2 — nadmiarowa „1 bezbarwna" zostawała w puli i płaciła koszt czaru,
// choć kreator jej nie planował (przeciek).
//
// Naprawa: źródło-zdolność niesie PEŁNĄ produkcję (`amount`) i KOSZT aktywacji
// osobno (`activationCost`); solver wariantów dolicza koszt do zapotrzebowania
// (generic do sumy, pipy kolorowe do wymagań pokrywanych przez INNE źródła).
import test from 'node:test';
import assert from 'node:assert/strict';
import { manaSourcesOf, countPaymentVariants, renderManaWizard } from '../src/table/mana-wizard.js';

/** abilityInfo jak w main.js (skrót z pełnego stanu) — Apprentice Wizard. */
const wizardInfo = () => ({
  cardId: 'apprentice-wizard', colors: [], amount: 3,
  manaCost: 1, costColors: ['U'], isLand: false,
});

const VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Bot' }],
  zones: { battlefield: [
    { id: 'wiz', cardId: 'apprentice-wizard', controllerId: 'p1', tapped: false },
  ] },
  legalCommands: [
    { type: 'activate_ability', playerId: 'p1', objectId: 'wiz', abilityIndex: 0 },
  ],
};

test('M311/1: źródło-zdolność niesie PEŁNĄ produkcję (+3), nie net (2), i koszt aktywacji osobno', () => {
  const sources = manaSourcesOf(VIEW, 'p1', wizardInfo);
  const wiz = sources.find((s) => s.id === 'wiz');
  assert.ok(wiz, 'Apprentice Wizard na liście źródeł many');
  assert.equal(wiz.amount, 3, `produkcja to 3 bezbarwne (opis kłamał „+2"): ${JSON.stringify(wiz)}`);
  assert.deepEqual(wiz.activationCost?.colors, ['U'],
    'koszt aktywacji {U} widoczny osobno (płaci go pula/inne źródło, nie produkcja)');
  assert.equal(wiz.activationCost?.generic, 0);
});

test('M311/2 (główny): solver liczy koszt aktywacji do zapotrzebowania — jedna realna opcja = brak kreatora', () => {
  // Płatność {2}{U} (total 3, wymaganie [U]). Źródła: Wizard + 2 Wyspy.
  // PRZED naprawą: wizard = net 2 bez wymagań → dwa różne kształty płatności
  // ([wizard+Wyspa] i [Wyspa+Wyspa]) → kreator otwierał się przy JEDNEJ realnej
  // opcji. PO naprawie: [wizard+Wyspa] NIE pokrywa dwóch pipów {U} (pips
  // kosztu aktywacji + pip czaru; produkcja wizarda jest bezbarwna), legalna
  // jest wyłącznie [wizard+Wyspa+Wyspa] → jeden kształt = auto-tap, bez wizarda.
  const sources = [
    { id: 'wiz', cardId: 'apprentice-wizard', colors: [], amount: 3, activationCost: { generic: 0, colors: ['U'] } },
    { id: 'i1', cardId: 'basic-island', colors: ['U'], amount: 1 },
    { id: 'i2', cardId: 'basic-island', colors: ['U'], amount: 1 },
  ];
  const variants = countPaymentVariants(sources, 0, 3, [['U']]);
  assert.equal(variants, 1,
    `jedyna realna płatność to Wyspa+Wyspa+Wizard (koszt {U} aktywacji płaci Wyspa) — wariantów: ${variants}`);
});

test('M311/3 (anty-over-fix): bez kosztu aktywacji solver działa jak dotąd', () => {
  // Zwykły ląd (brak activationCost) — reguły M195/A nietknięte: dwa różne
  // lądy = dwa kształty płatności.
  const sources = [
    { id: 'i1', cardId: 'basic-island', colors: ['U'], amount: 1 },
    { id: 'm1', cardId: 'basic-mountain', colors: ['R'], amount: 1 },
  ];
  const variants = countPaymentVariants(sources, 0, 1, []);
  assert.ok(variants >= 2, `Wyspa albo Góra — dalej są 2 warianty: ${variants}`);
});

test('M311/4 (opis): wiersz źródła pokazuje +3 i koszt aktywacji {U}, nie „+2"', () => {
  const { host } = withMiniDom((root) => {
    const model = {
      costStr: '{2}{U}',
      totalNeeded: 3,
      requirements: [{ colors: ['U'], covered: false }],
      remainingTotal: 3,
      untappedSources: [{
        id: 'wiz', name: 'Apprentice Wizard', cardId: 'apprentice-wizard',
        colors: [], amount: 3, activationCost: { generic: 0, colors: ['U'] },
      }],
    };
    renderManaWizard(root, model, { onTapSource: () => {}, onCancel: () => {} });
    return { host: root };
  });
  const row = host.findAll((n) => String(n.className).includes('mana-wizard-source'))[0];
  assert.ok(row, 'wiersz źródła wyrenderowany');
  assert.match(row.textContent, /\+3/, 'pełna produkcja: +3 (było kłamliwe „+2")');
  assert.doesNotMatch(row.textContent, /\+2/, 'net 2 zniknął');
  assert.match(row.textContent, /koszt aktywacji/, 'koszt aktywacji nazwany wprost');
  assert.match(row.textContent, /U/, 'pip {U} kosztu widoczny');
});

/** Mini-DOM (wzorzec m195) z innerHTML zjadającym tagi jak przeglądarka. */
function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.type = ''; this.checked = false; this.name = '';
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    // Przeglądarka zjada tagi — zostaje tekst (wystarczy do asercji o treści).
    set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() {
      const input = this.tagName === 'input' ? this
        : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        if (input.disabled) return;
        input.checked = input.type === 'radio' ? true : !input.checked;
        for (const l of input.listeners.change ?? []) l({ stopPropagation() {}, preventDefault() {} });
        return;
      }
      for (const l of this.listeners.click ?? []) l({});
    }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return run(new MiniEl('div')); } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}
