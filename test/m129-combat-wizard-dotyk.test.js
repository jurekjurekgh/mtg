// =============================================================================
// M129 — uwaga C właściciela (2026-08-17, testy na telefonie):
//
//   „Pola wyboru (ptaszki) podczas wybierania atakujących i blokujących są
//    strasznie małe i trudno w nie trafić palcem na telefonie — nie dałoby
//    rady jakoś zwiększyć aktywne pole wokół tych pól?"
//
// ROOT CAUSE: dla klas `.combat-wizard-*` NIE ISTNIAŁA w `src/table/index.html`
// ani jedna reguła CSS (grep dawał 0 trafień). Ptaszek renderował się więc
// w domyślnym rozmiarze przeglądarki (~13-16 px), a wiersz nie miał ani
// paddingu, ani `min-height` — jedynym celem dotyku był sam kwadracik.
// Ptaszek wyciszenia w panelu akcji dostał taką opiekę już w M91
// (`.action-ignore`, padding 6/12 px); wizard walki został wtedy pominięty.
//
// NAPRAWA: celem dotyku jest CAŁY WIERSZ (`<label class="combat-wizard-row">`,
// więc klik gdziekolwiek przełącza ptaszek natywnie) o wysokości >= 44 px —
// próg Apple Human Interface Guidelines (Material Design: 48 dp). Sam ptaszek
// rośnie do 24 px.
//
// Strażnik czyta ŹRÓDŁO `index.html` — wzorzec z `test/ios-viewport.test.js`
// i `test/look-wizard-contrast.test.js` (regresja CSS nie objawia się
// w testach DOM-owych, bo harness nie liczy stylów).
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const HTML = fs.readFileSync('src/table/index.html', 'utf8');

/** Treść reguły CSS dla selektora (pierwsze wystąpienie). */
function ruleOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = HTML.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

/** Wartość px z deklaracji (np. „min-height: 44px" → 44). */
function pxOf(rule, property) {
  const match = rule?.match(new RegExp(`${property}:\\s*(\\d+(?:\\.\\d+)?)px`));
  return match ? Number(match[1]) : null;
}

// Próg z Apple HIG (44×44 pt). Material Design mówi 48 dp — bierzemy niższy
// z dwóch, żeby strażnik pilnował minimum, a nie preferencji.
const MIN_TOUCH_TARGET_PX = 44;

test('M129/C: wiersz wyboru w wizardzie walki ma cel dotyku >= 44 px', () => {
  const rule = ruleOf('.combat-wizard-row');
  assert.ok(rule, '.combat-wizard-row MUSI mieć regułę CSS (przed M129 nie istniała żadna)');
  const minHeight = pxOf(rule, 'min-height');
  assert.ok(minHeight !== null, `.combat-wizard-row potrzebuje min-height: ${rule}`);
  assert.ok(minHeight >= MIN_TOUCH_TARGET_PX,
    `cel dotyku ma mieć >= ${MIN_TOUCH_TARGET_PX}px (jest ${minHeight}px) — uwaga C właściciela`);
});

test('M129/C: cały wiersz jest klikalny, nie tylko sam kwadracik', () => {
  const rule = ruleOf('.combat-wizard-row');
  // Wiersz to <label> (choice-request.js) — padding rozszerza obszar, który
  // natywnie przełącza ptaszek. Bez paddingu „aktywne pole" = sam input.
  assert.match(rule, /padding:/, 'wiersz potrzebuje paddingu (obszar wokół ptaszka)');
  assert.match(rule, /cursor:\s*pointer/, 'wiersz ma wyglądać na klikalny');
  // touch-action: manipulation usuwa 300 ms opóźnienia double-tap na iOS —
  // ta sama decyzja co dla kafli (.tile) i przycisków stołu.
  assert.match(rule, /touch-action:\s*manipulation/,
    'bez touch-action iOS dokłada opóźnienie double-tap');
});

test('M129/C: sam ptaszek jest wyraźnie większy niż domyślny (>= 24 px)', () => {
  const rule = ruleOf('.combat-wizard-toggle');
  assert.ok(rule, '.combat-wizard-toggle MUSI mieć regułę CSS');
  const width = pxOf(rule, 'width');
  const height = pxOf(rule, 'height');
  assert.ok(width >= 24 && height >= 24,
    `ptaszek ma mieć >= 24×24px (jest ${width}×${height}px); domyślny to ~13-16px`);
  assert.match(rule, /flex-shrink:\s*0/,
    'ptaszek nie może się kurczyć przy długiej nazwie karty');
});

test('M129/C: zaznaczenie widać na CAŁYM wierszu (kontrola wzrokowa na telefonie)', () => {
  // Regułę z :has() czytamy osobno — pxOf/ruleOf nie obsłuży zagnieżdżonych
  // nawiasów w selektorze.
  assert.match(HTML, /\.combat-wizard-row:has\(\.combat-wizard-toggle:checked\)\s*\{[^}]*\}/,
    'stan zaznaczenia ma być widoczny na wierszu, nie tylko w 24px kwadracie');
});

test('M129/C: steppery przydziału obrażeń też są dotykowe (ta sama rodzina)', () => {
  // L28: nie łatamy jednego wizarda — obok jest drugi z tym samym problemem.
  const row = ruleOf('.damage-wizard-row');
  assert.ok(row, '.damage-wizard-row MUSI mieć regułę CSS');
  assert.ok(pxOf(row, 'min-height') >= MIN_TOUCH_TARGET_PX,
    `wiersz przydziału obrażeń >= ${MIN_TOUCH_TARGET_PX}px`);
  const plus = ruleOf('.damage-wizard-minus, .damage-wizard-plus');
  assert.ok(plus, 'przyciski +1/−1 MUSZĄ mieć regułę CSS');
  assert.ok(pxOf(plus, 'min-height') >= MIN_TOUCH_TARGET_PX,
    `przyciski +1/−1 >= ${MIN_TOUCH_TARGET_PX}px wysokości`);
  assert.ok(pxOf(plus, 'min-width') >= MIN_TOUCH_TARGET_PX,
    `przyciski +1/−1 >= ${MIN_TOUCH_TARGET_PX}px szerokości (są obok siebie — łatwo o pomyłkę)`);
});

test('M129 (anty-over-fix): klik w nazwę karty nadal otwiera podgląd, nie przełącza wyboru', async () => {
  // Powiększenie celu dotyku nie może odebrać funkcji nazwie stwora
  // (fullscreen karty — uwaga C z 2026-08-11). Kontrakt behawioralny;
  // stopPropagation/preventDefault żyje w choice-request.js od M66.
  const { renderCombatWizard } = await import('../src/table/choice-request.js');
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
      this.text = ''; this.type = ''; this.checked = false; this.disabled = false; this.dataset = {};
    }

    set textContent(value) { this.text = String(value); this.children = []; }

    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

    set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }

    get innerHTML() { return this.text + this.children.map((c) => c.innerHTML).join(''); }

    appendChild(child) { this.children.push(child); return child; }

    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }

    click() { for (const l of this.listeners.click ?? []) l({ stopPropagation() {}, preventDefault() {} }); }
  }
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const opened = [];
  const view = {
    playerId: 'p1',
    turn: { number: 3, step: 'declare_attackers' },
    zones: {
      battlefield: [{ id: 'a1', cardId: 'highland-game', controllerId: 'p1', power: 2, toughness: 1 }],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const session = { nameOf: (c) => c, nameOfObject: () => '?' };
  const options = [
    { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
    { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] },
  ];
  const host = new MiniEl('div');
  renderCombatWizard(host, {
    kind: 'attackers', view, session, options, onComplete: () => {}, onOpenCard: (id) => opened.push(id),
  });
  const row = host.children[1].children[0];
  const input = row.children.find((c) => c.tagName === 'input');
  const name = row.children.find((c) => String(c.className).includes('combat-wizard-name'));
  assert.ok(input && name, 'wiersz ma ptaszek i klikalną nazwę');
  name.click();
  assert.deepEqual(opened, ['a1'], 'klik w nazwę otwiera podgląd karty');
  assert.equal(input.checked, false, 'i NIE zaznacza atakującego przy okazji');
});
