// =============================================================================
// M129 (uwaga C właściciela, 2026-08-17, testy na telefonie) + M292 (2026-09-03)
//
//   „Pola wyboru (ptaszki) podczas wybierania atakujących i blokujących są
//    strasznie małe i trudno w nie trafić palcem na telefonie — nie dałoby
//    rady jakiś zwiększyć aktywne pole wokół tych pól?"
//
// ROOT CAUSE sprzed naprawy: dla `.combat-wizard-*` NIE ISTNIAŁA w
// `src/table/index.html` ani jedna reguła CSS (grep dawał 0 trafień). Ptaszek
// miał domyślny rozmiar przeglądarki (~13-16 px), a wiersz ani paddingu, ani
// `min-height` — jedynym celem dotyku był sam kwadracik.
//
// NAPRAWA M129/C: celem dotyku jest CAŁY WIERSZ o wysokości >= 44 px (próg
// Apple HIG; Material mówi 48 dp), ptaszek 24 px.
//
// PRZERÓBKA M292 (decyzja właściciela „1+2+3 i przerobienie testu"): od M288/A
// wiersze buduje JEDEN komponent (`src/table/picker.js`), który dokłada elementowi
// klasy `picker-row` obok rodzinnych (`combat-wizard-row`). Reguły rodziny picker
// i rodziny wizarda walki były BAJT W BAJT identyczne (261 znaków na blok), więc
// dotychczasowy strażnik — „`.combat-wizard-row` MUSI mieć własną regułę" —
// pilnował duplikatu, a nie faktu. Zduplikowany blok CSS usunęliśmy, a strażnik
// liczy teraz STYL EFEKTYWNY: bierze REALNĄ listę klas elementu z renderera i
// rozwiązuje ją przezstylesheet stołu. To znaczy:
//   - wiersz bez `min-height` w RODZINIE picker → RED (było: zielone, jeśli
//     któraś rodzina miała swój kopię reguły),
//   - ktoś dopisuje `.damage-wizard-row { min-height: … }` obok pickerowej → RED
//     (nowy zakaz duplikowania, sedno prośby o jeden komponent),
//   - rodzina dostaje własny hook klasy i nic więcej → GREEN (tak ma być).
//
// Wzorzec czytania ŹRÓDŁA (nie przeglądarki) zostaje ten sam co w
// `test/ios-viewport.test.js` i `test/look-wizard-contrast.test.js`: regresja
// CSS nie objawia się w testach DOM-owych, bo harness nie liczy stylów.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MIN_TOUCH_TARGET_PX,
  MiniEl,
  effectiveDeclarationsFor,
  loadRules,
  pxOf,
  subjectClasses,
  withDocument,
} from './harness/css-effective.js';

/** Reguły stylu stołu — JEDNO źródło dla obu strażników (m129 i chipy). */
const RULES = loadRules();
const effectiveDeclarations = (classList) => effectiveDeclarationsFor(RULES, classList);

/** Render wizarda walki i jego pierwszy wiersz + ptaszek (realne klasy, nie zgadywane). */
async function combatRow() {
  const { renderCombatWizard } = await loadChoiceModule();
  return withDocument(() => {
    const host = new MiniEl('div');
    const view = {
      playerId: 'p1',
      turn: { number: 3, step: 'declare_attackers' },
      zones: {
        battlefield: [{ id: 'a1', cardId: 'highland-game', controllerId: 'p1', power: 2, toughness: 1 }],
        hand: [], stack: [], graveyard: [], library: [],
      },
    };
    const session = { nameOf: (c) => c, nameOfObject: () => '?' };
    renderCombatWizard(host, {
      kind: 'attackers', view, session,
      options: [
        { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
        { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] },
      ],
      onComplete: () => {}, onOpenCard: () => {},
    });
    const rows = [];
    const inputs = [];
    const walk = (n) => {
      if (String(n.className).includes('-row')) rows.push(n);
      if (n.tagName === 'input') inputs.push(n);
      for (const c of n.children ?? []) walk(c);
    };
    walk(host);
    return { row: rows[0], input: inputs[0] };
  });
}

/** `require` w czystym ESM-testie: import modułu stołu raz, przed asercjami. */
let CHOICE_MODULE = null;
async function loadChoiceModule() {
  CHOICE_MODULE ??= await import('../src/table/choice-request.js');
  return CHOICE_MODULE;
}

async function damageRows() {
  const { renderDamageWizard, renderDamageDivisionWizard } = await loadChoiceModule();
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [
        { id: 'a1', cardId: 'highland-game', controllerId: 'p1', power: 3, toughness: 3 },
        { id: 'b1', cardId: 'leafcrown-dryad', controllerId: 'p2', power: 2, toughness: 2 },
      ],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const session = { nameOf: (id) => id, nameOfObject: (id) => id, faceDownName: () => 'morph' };
  const pending = {
    playerId: 'p2',
    entries: [{
      attackerId: 'b1', power: 3, trample: false,
      blockers: [{ id: 'a1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }],
    }],
  };
  const out = withDocument(() => {
    const hostA = new MiniEl('div');
    renderDamageWizard(hostA, { view, session, pending, onComplete: () => {} });
    const hostB = new MiniEl('div');
    renderDamageDivisionWizard(hostB, {
      view, session, candidateIds: ['a1', 'p2'], total: 3, maxTargets: 3,
      onComplete: () => {}, onCancel: () => {},
    });
    const grab = (host, cls) => {
      const hits = [];
      const walk = (n) => { if (String(n.className).includes(cls)) hits.push(n); for (const c of n.children ?? []) walk(c); };
      walk(host);
      return hits;
    };
    return {
      bojowe: { row: grab(hostA, 'damage-wizard-row')[0], inc: grab(hostA, 'damage-wizard-plus')[0] },
      podzial: { row: grab(hostB, 'damage-wizard-row')[0], inc: grab(hostB, 'damage-wizard-plus')[0] },
    };
  });
  return out;
}

test('M129/C + M292: wiersz wyboru w wizardzie walki ma cel dotyku >= 44 px (styl efektywny)', async () => {
  const { row } = await combatRow();
  assert.ok(row, 'wizard walki rysuje wiersz');
  assert.match(row.className, /(^| )picker-row( |$)/,
    'wiersz należy do rodziny picker-* (inaczej nie dziedziczy wspólnego wyglądu)');
  const { decls, matched } = effectiveDeclarations(row.className);
  assert.ok(matched.length > 0, `żadna reguła nie aplikuje się na „${row.className}”`);
  const minH = pxOf(decls, 'min-height');
  assert.ok(minH !== null && minH >= MIN_TOUCH_TARGET_PX,
    `cel dotyku ma mieć >= ${MIN_TOUCH_TARGET_PX}px (jest ${minH}px z klas: ${row.className})`);
});

test('M129/C + M292: cały wiersz jest klikalny, nie tylko sam kwadracik', async () => {
  const { row } = await combatRow();
  const { decls } = effectiveDeclarations(row.className);
  assert.ok(decls.padding, 'wiersz potrzebuje paddingu (obszar wokół ptaszka)');
  assert.match(decls.cursor ?? '', /pointer/, 'wiersz ma wyglądać na klikalny');
  assert.match(decls['touch-action'] ?? '', /manipulation/,
    'bez touch-action iOS dokłada opóźnienie double-tap');
});

test('M129/C + M292: ptaszek jest wyraźnie większy niż domyślny (>= 24 px)', async () => {
  const { input } = await combatRow();
  assert.ok(input, 'wiersz ma input');
  const { decls } = effectiveDeclarations(input.className);
  const width = pxOf(decls, 'width');
  const height = pxOf(decls, 'height');
  assert.ok(width >= 24 && height >= 24,
    `ptaszek ma mieć >= 24×24px (jest ${width}×${height}px); domyślny to ~13-16px`);
  assert.match(decls['flex-shrink'] ?? '', /^0$/,
    'ptaszek nie może się kurczyć przy długiej nazwie karty');
});

test('M129/C + M292: zaznaczenie widać na CAŁYM wierszu (kontrola wzrokowa na telefonie)', async () => {
  const { row } = await combatRow();
  const tokens = String(row.className).split(/\s+/);
  const hasCheckedRule = RULES.some((r) => /:has\(/.test(r.selector) && /:checked/.test(r.selector)
    && subjectClasses(r.selector).some((c) => tokens.includes(c))
    && /border-color/.test(r.body) && /background/.test(r.body));
  assert.ok(hasCheckedRule,
    'musi istnieć reguła `:has(...:checked)` na którejś klasie tego wiersza — stan wyboru widoczny na wierszu, nie w 24px kwadracie');
});

test('M129/C + M292: steppery przydziału obrażeń są w TEJ SAMEJ rodzinie dotykowej', async () => {
  const { bojowe, podzial } = await damageRows();
  for (const [nazwa, r] of Object.entries({ 'przydział bojowy': bojowe, 'podział obrażeń': podzial })) {
    assert.ok(r.row, `${nazwa}: wiersz istnieje`);
    assert.match(r.row.className, /picker-row/,
      `${nazwa}: wiersz buduje picker (inaczej to równoległa wizualizacja)`);
    const rowDecls = effectiveDeclarations(r.row.className).decls;
    assert.ok(pxOf(rowDecls, 'min-height') >= MIN_TOUCH_TARGET_PX,
      `${nazwa}: wiersz >= ${MIN_TOUCH_TARGET_PX}px (jest ${pxOf(rowDecls, 'min-height')})`);
    assert.ok(r.inc, `${nazwa}: przycisk +1 istnieje`);
    const incDecls = effectiveDeclarations(r.inc.className).decls;
    assert.ok(pxOf(incDecls, 'min-height') >= MIN_TOUCH_TARGET_PX,
      `${nazwa}: +1/-1 >= ${MIN_TOUCH_TARGET_PX}px wysokości`);
    assert.ok(pxOf(incDecls, 'min-width') >= MIN_TOUCH_TARGET_PX,
      `${nazwa}: +1/-1 >= ${MIN_TOUCH_TARGET_PX}px szerokości (są obok siebie — łatwo o pomyłkę)`);
    assert.match(r.inc.className, /damage-wizard-plus/,
      `${nazwa}: hak kreatora zostaje na elemencie (patrzy na niego Tester i m136/m172)`);
  }
});

test('M292: rodzina kreatora NIE dubluje wyglądu wiersza (jeden komponent, parametry)', () => {
  // Sedno prośby właściciela: „elastyczne komponenty z parametrami, a nie każdy
  // efekt na innej, równoległej funkcji wizualizującej wybory". Dopóki reguła
  // wiersza mieszka w rodzinie `.picker-*`, duplikat w rodzinie kreatora jest
  // niepotrzebny i grozi rozjazdem (tak było między M129 a M288 — dwa bloki po
  // 261 znaków, z których zmieniano zawsze tylko jeden).
  const families = ['combat-wizard-row', 'multi-target-row', 'escape-exile-row', 'damage-wizard-row'];
  for (const fam of families) {
    const own = RULES.filter((r) => subjectClasses(r.selector).length === 1
      && subjectClasses(r.selector)[0] === fam
      && /min-height|padding|border-radius/.test(r.body));
    assert.deepEqual(own.map((r) => r.selector), [],
      `.${fam} nie może mieć własnych reguł wiersza — wygląd daje rodzina picker-*`);
  }
  // M293: od tury 14 dotyczy to także chipów (pigułek z nazwą karty) — je też
  // rysuje picker (`kind: 'chip'`), a `.look-wizard-card*` są hakami. Tło chipa
  // pilnuje osobny test (`look-wizard-contrast`), tu chodzi o duplikat.
  for (const fam of ['look-wizard-card', 'look-wizard-cards']) {
    const own = RULES.filter((r) => subjectClasses(r.selector).length === 1
      && subjectClasses(r.selector)[0] === fam
      && /background|min-height|padding|border-radius|gap/.test(r.body));
    assert.deepEqual(own.map((r) => r.selector), [],
      `.${fam} jest HAKIEM — wygląd chipa daje rodzina .picker-chip* (M293)`);
  }
});

test('M292: ptaszki wyboru buduje WYŁĄCZNIE picker (zero lepionych inputów)', () => {
  // Ręcznie lepiony <label>+<input> to był dokładnie ten równoległy tor, przez
  // który Knockout Maneuver wyglądał inaczej niż blokowanie (M288/A), a ptaszek
  // wyciszenia miał dwa niezależne zamienniki (M292). Teraz: jeden producent.
  const dir = 'src/table';
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const winowajcy = [];
  for (const f of files) {
    if (f === 'picker.js') continue;
    const src = fs.readFileSync(`${dir}/${f}`, 'utf8');
    const n = (src.match(/\.type = 'checkbox'/g) ?? []).length
      + (src.match(/\.type = 'radio'/g) ?? []).length;
    if (n > 0) winowajcy.push(`${f}:${n}`);
  }
  assert.deepEqual(winowajcy, [],
    'pliki src/table nie mogą same ustawiać type=checkbox/radio — robi to renderPickerRow');
});

test('M129 (anty-over-fix): klik w nazwę karty nadal otwiera podgląd, nie przełącza wyboru', async () => {
  // Powiększenie celu dotyku nie może odebrać funkcji nazwie stwora
  // (pełny ekran karty — uwaga C z 2026-08-11). Kontrakt behawioralny;
  // stopPropagation/preventDefault żyje w picker.js od M66/M288/A.
  await loadChoiceModule();
  const { renderCombatWizard } = CHOICE_MODULE;
  const opened = [];
  const host = withDocument(() => {
    const h = new MiniEl('div');
    const view = {
      playerId: 'p1',
      turn: { number: 3, step: 'declare_attackers' },
      zones: {
        battlefield: [{ id: 'a1', cardId: 'highland-game', controllerId: 'p1', power: 2, toughness: 1 }],
        hand: [], stack: [], graveyard: [], library: [],
      },
    };
    const session = { nameOf: (c) => c, nameOfObject: () => '?' };
    renderCombatWizard(h, {
      kind: 'attackers', view, session,
      options: [
        { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
        { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] },
      ],
      onComplete: () => {}, onOpenCard: (id) => opened.push(id),
    });
    return h;
  });
  const row = host.children[1].children[0];
  const input = row.children.find((c) => c.tagName === 'input');
  const name = row.children.find((c) => String(c.className).includes('combat-wizard-name'));
  assert.ok(input && name, 'wiersz ma ptaszek i klikalną nazwę');
  name.click();
  assert.deepEqual(opened, ['a1'], 'klik w nazwę otwiera podgląd karty');
  assert.equal(input.checked, false, 'i NIE zaznacza atakującego przy okazji');
});
