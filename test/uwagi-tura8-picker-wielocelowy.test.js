// Uwaga A (2026-09-02, uwagi właściciela z żywej gry): JEDEN wspólny helper
// dla efektów wielocelowych.
//
// Zgłoszenie:
//   „Knockout Maneuver — wskaż po jednym celu dla każdej pozycji: 1. twój stwór:
//    [ ] Krotiq Nestguard (Ty) Podgląd … 2. stwór przeciwnika: [ ] Angel of the
//    Dawn (Nieprzyjaciel) Podgląd. Brakuje: twój stwór, stwór przeciwnika.
//    Zupełnie inny modal niż pozostałe modale wielocelowe, np. blokowania czy
//    Fireball. Warto byłoby go przerobić na jeden wspólny helper do efektów
//    wielocelowych w stylu blokowania czy wyboru atakujących. A nie tak, że
//    każda zdolność ma zupełnie inaczej wyglądającego modala. Oczywiście logika
//    musi być w każdym typie efektu inna, ale wygląd może być taki sam
//    (elastyczny helper)."
//
// Rozpoznanie (zmierzone, nie zgadywane):
//  - `.multi-target-*` i `.escape-exile-*` NIE MIAŁI ani jednej reguły CSS —
//    wiersze były gołymi <button> z marką w tekście (`[ ] Nazwa`) i osobnym
//    przyciskiem „Podgląd";
//  - wizard walki (`combat-wizard-*`) miał od M129/C natywne <input> w <label>,
//    cel dotyku 44 px i klik w nazwę otwierający kartę;
//  - stąd dwa różne ekrany na tej samej planszy, mimo że oba składają wybór na
//    komendę z `legalCommands`.
//
// Ten test spinuje NOWY kontrakt: wspólny `src/table/picker.js` (widok), logika
// zostaje per efekt (wybór pozycji = radio w grupie, cele = checkboxy,
// poświęcenie = radio, mulligan = checkboxy), a pozycje nadal opisuje karta.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { multiTargetPlanOf } from '../src/table/multi-target.js';
import { targetTypeLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

// --- mini-DOM z natywną aktywacją (tak samo liczy Żywy Tester na jsdomie) ---
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = [];
    this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
    this.type = ''; this.checked = false; this.name = '';
    this.style = {}; this.listeners = {};
    this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n.flat(); }
  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
  fire(type, e = {}) { for (const l of this.listeners[type] ?? []) l(e); }
  click() {
    const input = this.tagName === 'input' ? this
      : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
    if (input && (input.type === 'checkbox' || input.type === 'radio')) {
      if (input.disabled) return;
      input.checked = input.type === 'radio' ? true : !input.checked;
      input.fire('change', {});
      return;
    }
    for (const l of this.listeners.click ?? []) l({ stopPropagation() {}, preventDefault() {} });
  }
  all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
  find(pred) { return this.all().find(pred); }
  findAll(pred) { return this.all().filter(pred); }
  byClass(cls) { return this.findAll((n) => String(n.className).includes(cls)); }
}
globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (t) => ({ isText: true, text: String(t), get textContent() { return this.text; } }),
};

const { renderMultiTargetWizard, renderCombatWizard } = await import('../src/table/choice-request.js');
const { renderPickerRow } = await import('../src/table/picker.js');

// --- PRAWDZIWA pozycja z silnika: Knockout Maneuver w ręce -----------------
function stoKnockout() {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 6, { colors: ['G', 'G', 'G', 'G'] });
  const put = (id, cardId, controllerId, zone, over = {}) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `brak karty ${cardId} w katalogu`);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...gameObjectDataOf(def),
      types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
      abilities: def.abilities ?? [], power: def.power, toughness: def.toughness, ...over,
    });
  };
  put('czar', 'knockout-maneuver', 'p1', 'hand');
  put('moj1', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  put('moj2', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false });
  put('wrog1', 'plague-reaver', 'p2', 'battlefield', { summoningSickness: false });
  return state;
}

/** Komendy cast te same, które dostaje panel decyzji (iloczyn pozycji). */
function castCommands(state) {
  return playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'czar');
}

function wizardFor(host, state, { onComplete = () => {}, onOpenCard = null } = {}) {
  const commands = castCommands(state);
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan, 'silnik enumeruje pozycje celu — kreator ma z czego budować');
  const view = playerView(state, 'p1');
  const session = { nameOf: (id) => REGISTRY.get(id)?.name ?? id, nameOfObject: (id) => id, faceDownName: () => 'morph' };
  renderMultiTargetWizard(host, {
    view,
    session,
    plan,
    commands,
    sourceName: 'Knockout Maneuver',
    // Tak jak main.js: nazwy pozycji deklaruje KARTA (ADR 0002), nie kreator.
    slotLabels: (REGISTRY.get('knockout-maneuver').spell.targets ?? []).map((spec) => targetTypeLabel(spec)),
    onComplete,
    onCancel: () => {},
    onOpenCard,
  });
  return { plan, commands, view };
}

test('A: modal pozycji celu to ten sam picker co wybór atakujących (nie osobny wynalazek)', () => {
  const state = stoKnockout();
  const host = new MiniEl('div');
  const { plan } = wizardFor(host, state);
  assert.equal(plan.slots?.length, 2, 'dwie pozycje celu z Oracle');

  const rows = host.byClass('picker-row');
  const oczekiwana = plan.slots.reduce((n, ids) => n + ids.length, 0);
  assert.equal(rows.length, oczekiwana,
    `jeden wiersz na KANDYDATA pozycji (2 swoich + 1 wróg), nie na kombinację — jest ${rows.length}`);
  assert.equal(oczekiwana, 3, `kandydaci z silnika: ${JSON.stringify(plan.slots.map((s) => s.length))}`);
  for (const row of rows) {
    assert.equal(String(row.tagName).toLowerCase(), 'label', 'wiersz to <label> (cały jest celem dotyku, M129/C)');
    const input = (row.children ?? []).find((c) => c.tagName === 'input');
    assert.ok(input, 'wiersz ma natywny ptaszek <input>');
    assert.ok(String(input.className).includes('multi-target-toggle'),
      'ptaszek NIESIE KLASĘ TOGGULA — na nią patrzy Żywy Tester (kontrakt M206)');
    assert.equal(input.type, 'radio', 'pozycja celu ma JEDEN wybór → radio');
    const name = (row.children ?? []).find((c) => String(c.className).includes('picker-name'));
    assert.ok(name, 'nazwa celu jest w <span class="picker-name">');
  }

  // Dawna marka w tekście i osobny przycisk „Podgląd" znikły razem z osobną
  // budową wiersza.
  assert.equal(host.all().filter((n) => /^\s*\[[ x]\]/.test(n.text)).length, 0,
    'żaden wiersz nie zaczyna się od „[ ]"/„[x]" — stan jest w ptaszku');
  assert.equal(host.byClass('multi-target-peek').length, 0, 'brak przycisków „Podgląd" obok wierszy');
});

test('A: pozycje nazywa karta, a radio grupuje wybór w obrębie pozycji', () => {
  const host = new MiniEl('div');
  const { plan } = wizardFor(host, stoKnockout());
  const sections = host.byClass('picker-section').map((n) => n.textContent);
  assert.deepEqual(sections, ['1. twój stwór:', '2. stwór przeciwnika:'],
    `nagłówki sekcji prosto z Oracle: ${JSON.stringify(sections)}`);
  const inputs = host.byClass('picker-toggle');
  const groups = inputs.map((i) => i.name);
  assert.equal(new Set(groups.slice(0, plan.slots[0].length)).size, 1,
    'wiersze jednej pozycji dzielą grupę radia');
  assert.notEqual(groups[0], groups[groups.length - 1],
    'pozycje NIE dzielą grupy — inaczej wybór celu przeciwnika zdjąłby wybór swojego stwora');
});

test('A: status mówi, czego brakuje, a zatwierdzenie oddaje komendę silnika', () => {
  const state = stoKnockout();
  const host = new MiniEl('div');
  let submitted = null;
  const { commands } = wizardFor(host, state, { onComplete: (cmd) => { submitted = cmd; } });
  const status = () => host.byClass('multi-target-status')[0].textContent;
  const confirm = host.byClass('multi-target-confirm')[0];

  assert.equal(status(), 'Brakuje: twój stwór, stwór przeciwnika', `oba pola puste: ${status()}`);
  assert.equal(confirm.disabled, true, 'bez kompletu pozycji nie ma zatwierdzenia');

  const inputs = host.byClass('picker-toggle');
  inputs[0].click();                                  // pierwszy własny stwór
  assert.equal(status(), 'Brakuje: stwór przeciwnika', `zostało jedno: ${status()}`);
  inputs[1].click();                                  // DRUGI własny stwór — zastępuje
  assert.equal(inputs[0].checked, false, 'poprzedni wybór pozycji zwolniony (model → DOM)');
  assert.equal(inputs[1].checked, true, 'nowy wybór pozycji zaznaczony');

  const wróg = inputs[inputs.length - 1];
  wróg.click();
  assert.equal(confirm.disabled, false, 'komplet pozycji odblokowuje zatwierdzenie');
  assert.match(status(), /Wybrano komplet celów/, status());
  confirm.click();
  assert.ok(submitted, 'zatwierdzenie oddało komendę');
  assert.ok(commands.includes(submitted), 'to komenda z legalCommands — silnik ją zna (L48)');
  assert.equal(submitted.targets.length, 2);
  assert.equal(submitted.targets[0], 'moj2', 'pozycja 0 = wskazany własny stwór (kolejność niesie znaczenie)');
});

test('A: nazwa celu otwiera pełny ekran karty i nie przełącza wyboru', () => {
  const host = new MiniEl('div');
  const opened = [];
  wizardFor(host, stoKnockout(), { onOpenCard: (id) => opened.push(id) });
  const first = host.byClass('picker-name')[0];
  first.click();
  assert.deepEqual(opened, ['moj1'], `klik w nazwę otwiera kartę celu: ${JSON.stringify(opened)}`);
  const input = host.byClass('picker-toggle')[0];
  assert.equal(input.checked, false, 'i NIE zaznacza celu przy okazji (wzorzec M66)');
  // Bez `onOpenCard` (np. gracz bez własnego druku do pokazania) żaden wiersz
  // nie udaje linku — patrz osobny test na gracza jako cel poniżej.
  assert.ok(host.byClass('picker-name').every((n) => String(n.className).includes('is-openable')),
    'wszystkie cele są stworami → wszystkie nazwy otwierają kartę');
});

test('A: kreator wielocelowy i wizard walki rysuje TEN SAM helper', async () => {
  const atak = new MiniEl('div');
  const view = {
    playerId: 'p1',
    turn: { number: 3, step: 'declare_attackers' },
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [{ id: 'a1', cardId: 'highland-game', controllerId: 'p1', power: 2, toughness: 1 }],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const session = { nameOf: (c) => c, nameOfObject: () => '?' };
  renderCombatWizard(atak, {
    kind: 'attackers', view, session,
    options: [
      { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
      { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] },
    ],
    onComplete: () => {}, onCancel: () => {}, onOpenCard: () => {},
  });
  const row = atak.byClass('picker-row')[0];
  assert.ok(row, 'wizard walki też stoi na picker-* (wspólny wygląd)');
  assert.ok(String(row.className).includes('combat-wizard-row'), 'swoje klasy rodzinne zachowane');
  assert.equal((row.children ?? []).find((c) => c.tagName === 'input').type, 'checkbox',
    'atakujących zaznacza się wielokrotnie → checkbox');
});

test('A: gracz jako cel nie dostaje linku do karty (listę płaską też obsługuje picker)', () => {
  const host = new MiniEl('div');
  const opened = [];
  const commands = [];
  for (const targets of [['c0'], ['c1'], ['p2'], ['c0', 'p2']]) {
    for (const xValue of [1, 2]) {
      commands.push({ type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets, xValue });
    }
  }
  const plan = multiTargetPlanOf(commands);
  assert.equal(plan.slots, null, 'jednorodne cele (Fireball) zostają wspólną listą');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { battlefield: [
      { id: 'c0', cardId: 'highland-game', controllerId: 'p1' },
      { id: 'c1', cardId: 'plague-reaver', controllerId: 'p2' },
    ] },
  };
  const session = { nameOf: (id) => REGISTRY.get(id)?.name ?? id, nameOfObject: (id) => id, faceDownName: () => 'morph' };
  renderMultiTargetWizard(host, {
    view, session, plan, commands, sourceName: 'Fireball',
    onComplete: () => {}, onCancel: () => {}, onOpenCard: (id) => opened.push(id),
  });
  const names = host.byClass('picker-name');
  assert.equal(names.length, 3, 'trzy wiersze: dwa stwory i gracz');
  const gracz = names.find((n) => n.textContent.includes('Nieprzyjaciel') && !n.textContent.includes('('));
  assert.ok(gracz, `wiersz gracza obecny: ${JSON.stringify(names.map((n) => n.textContent))}`);
  assert.ok(!String(gracz.className).includes('is-openable'), 'gracz nie jest kartą — bez linku');
  for (const n of names) { if (n !== gracz) n.click(); }
  assert.deepEqual(opened, ['c0', 'c1'], 'stwory otwierają swoje karty: ' + JSON.stringify(opened));
  // Płaska lista = checkboxy (wiele celów), pozycje = radio (test wyżej).
  assert.deepEqual(host.byClass('picker-toggle').map((i) => i.type), ['checkbox', 'checkbox', 'checkbox'],
    ' Fireball „any number of targets" zostaje wielokrotnym zaznaczaniem');
});

// --- drut i CSS: to tu uśpiło uwagę A na rok --------------------------------

test('A: wybór pozycji jest budowany z ORACLE karty, nie z nazwy w UI', () => {
  const main = fs.readFileSync('src/table/main.js', 'utf8');
  assert.match(main, /slotLabels: multiPlan\.slots\s*\n?\s*\? \(registry\.get\(sourceObject\?\.cardId\)\?\.spell\?\.targets \?\? \[\]\)\.map\(\(spec\) => targetTypeLabel\(spec\)\)/,
    'main.js przekazuje nazwy pozycji z deskryptora `spell.targets` (ADR 0002)');
});

test('A: wspólny helper jest realnie współdzielony, nie skopiowany', () => {
  const src = fs.readFileSync('src/table/choice-request.js', 'utf8');
  assert.match(src, /from '\.\/picker\.js'/, 'choice-request.js importuje picker');
  const uses = (src.match(/renderPickerRow\(/g) ?? []).length;
  assert.ok(uses >= 3, `kreator celów, wizard walki i escape używają renderPickerRow (jest ${uses})`);
  assert.ok(!/multi-target-peek/.test(src), 'osobny przycisk „Podgląd" zniknął z kodu');
  assert.ok(!/card-preview-btn/.test(src), 'osobny przycisk „🔍 Podgląd karty" zniknął z kodu');
  assert.ok(!/\[\s*\]\s|\[x\]/.test(src.match(/const refresh = \(\) => \{[\s\S]{0,700}/)?.[0] ?? ''),
    'refresh() nie maluje już stanu w tekście wiersza');
});

test('A: rodzina picker ma CSS dotykowy (przed M288/A nie było ani jednej reguły)', () => {
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const ruleOf = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = html.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    return m ? m[1] : null;
  };
  const px = (rule, prop) => Number(rule?.match(new RegExp(`${prop}:\\s*(\\d+(?:\\.\\d+)?)px`))?.[1] ?? NaN);
  const row = ruleOf('.picker-row');
  assert.ok(row, ".picker-row MUSI mieć regułę CSS — brak reguły był root cause'em uwagi A");
  assert.ok(px(row, 'min-height') >= 44, `cel dotyku >= 44px, jest ${px(row, 'min-height')}`);
  const toggle = ruleOf('.picker-toggle');
  assert.ok(toggle && px(toggle, 'width') >= 24, `ptaszek >= 24px: ${toggle}`);
  assert.match(html, /\.picker-row:has\(\.picker-toggle:checked\)/,
    'zaznaczenie musi być widoczne na całym wierszu (kontrakt M129/C przeniesiony na rodzinę)');
  assert.match(html, /\.picker-section\b/, 'nagłówki sekcji mają własną regułę');
  assert.match(html, /\.picker-status\.is-problem\b/, 'stan „Brakuje…"/„niedozwolony" jest wyróżniony kolorem');
});

test('A: renderPickerRow nie wymaga prawdziwego DOM-u i zwraca uchwyt synchronizacji', () => {
  const host = new MiniEl('div');
  const toggled = [];
  const handle = renderPickerRow(host, {
    id: 'x1', label: 'X', kind: 'checkbox', onToggle: (on, id) => toggled.push([on, id]),
  });
  assert.equal(host.children.length, 1, 'wiersz dopisany do hosta');
  handle.input.fire('change');
  assert.deepEqual(toggled, [[false, 'x1']], 'zmiana ptaszka trafia do modelu wywołującego');
  handle.setChecked(true);
  assert.equal(handle.input.checked, true, 'setChecked synchronizuje DOM z modelem');
  handle.setDisabled(true);
  assert.equal(handle.input.disabled, true, 'setDisabled istnieje (pozycje wymuszone)');
});
