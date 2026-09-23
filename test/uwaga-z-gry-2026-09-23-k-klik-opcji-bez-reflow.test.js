// Uwaga K (właściciel, 2026-09-23c): „Klik w długą opcję akcji gubi się przy
// reflow — zamrozić szerokość kolumny opisu / nie zmieniać czcionek”.
// Zgłoszenie szczegółowe: „Klik w »Wybierz: deklaracja blokujących« czasem nie
// działa (press-down przebudowuje layout i release mija przycisk)”.
//
// ROOT CAUSE (odtworzony ze źródła stylu): `button:active` przesuwał przycisk
// (`transform: translateY(1px)`), a lista akcji to kontener przewijany
// (`.actions-wrap`, `max-height: 280px`). Transform wchodzi do OBSZARU
// PRZEWIJANIA, więc w chwili press-downu pojawiał się pasek przewijania,
// kolumna opisu zwężała się o jego grubość, DŁUGIE etykiety (tytuły grup
// decyzji) łamały się inaczej i przycisk uciekał spod kursora — mouseup
// wypadał poza przycisk, więc `click` nie powstawał wcale.
//
// NAPRAWA (K):
//  1. feedback wciśnięcia bez geometrii (`filter: brightness(...)`), dla obu
//     rodzin wierszy (przyciski akcji i wiersze wyboru — L41);
//  2. `scrollbar-gutter: stable` w kontenerach przewijanych, w których są
//     cele tapnięcia — pasek nie zwęża kolumny opisu ani na chwilę;
//  3. kolumna opisu ma STAŁĄ elastyczną szerokość (`.action-label`), więc
//     długość etykiety nie przestawia układu;
//  4. `touch-action: manipulation` na przyciskach (dotyk nie czeka na
//     rozstrzygnięcie podwójnego tapu).
// Guard czyta ŹRÓDŁO stylu (wzorzec `ios-viewport` / `m129` / `m197`):
// regresja CSS nie objawia się w testach DOM-owych, bo harness nie liczy stylów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const HTML = fs.readFileSync('src/table/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const STYLE = HTML.slice(HTML.indexOf('<style>') + '<style>'.length, HTML.indexOf('</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, ''); // komentarze opisują naprawę — nie są kodem

/** Treść reguły o dokładnie takim selektorze (pierwsze wystąpienie). */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(STYLE);
  return match ? match[1] : null;
}

/** Właściwości, które zmieniają geometrię/typografię elementu w trakcie gestu. */
const PRZEBUDOWA = /(?:^|[;\s])(transform|translate|scale|padding|margin|width|height|min-height|max-height|font-size|font-weight|letter-spacing|line-height|border-width)\s*:/;

/** Wszystkie reguły `:active` w stylu (także te wewnątrz @media). */
const ACTIVE_RULES = [...STYLE.matchAll(/([^{}]*:active[^{}]*)\{([^{}]*)\}/g)]
  .map((m) => ({ selector: m[1].trim(), body: m[2] }));

test('K/1: wciśnięcie przycisku nie przebudowuje layoutu (bez transform i bez zmiany czcionek)', () => {
  const body = ruleBody('button:active');
  assert.ok(body != null, 'brak reguły button:active — feedback wciśnięcia zniknął');
  assert.doesNotMatch(body, PRZEBUDOWA,
    `button:active nie może zmieniać geometrii ani czcionki (press przesuwał przycisk, release mijał cel): ${body}`);
  assert.match(body, /filter:\s*brightness/, `feedback wciśnięcia ma być niegeometryczny (jasność): ${body}`);
});

test('K/2: rodzina wierszy wyboru ma ten sam kontrakt wciśnięcia (L41)', () => {
  const body = ruleBody('.picker-row:active');
  assert.ok(body != null, 'brak reguły .picker-row:active');
  assert.doesNotMatch(body, PRZEBUDOWA,
    `.picker-row:active nie może przesuwać wiersza pod palcem: ${body}`);
});

test('K/3: żadna reguła :active przycisków/wierszy nie rusza geometrii', () => {
  const dotyczy = ACTIVE_RULES.filter((r) => /\bbutton\b|\.picker-row|\.action\b/.test(r.selector));
  assert.ok(dotyczy.length >= 2, `oczekiwano reguł :active dla przycisków i wierszy, jest: ${dotyczy.length}`);
  for (const rule of dotyczy) {
    assert.doesNotMatch(rule.body, PRZEBUDOWA,
      `reguła ${rule.selector} przebudowuje layout w trakcie gestu: ${rule.body}`);
  }
});

test('K/4: pasek przewijania nie zwęża kolumny opisu (scrollbar-gutter: stable)', () => {
  for (const selector of ['.actions-wrap', '.modal-body', '.drawer-body']) {
    const body = ruleBody(selector);
    assert.ok(body != null, `brak reguły ${selector}`);
    assert.match(body, /scrollbar-gutter:\s*stable/,
      `${selector} musi rezerwować miejsce na pasek przewijania: ${body}`);
  }
});

test('K/5: kolumna opisu ma stałą szerokość, a przyciski nie czekają na podwójny tap', () => {
  const label = ruleBody('.action-label');
  assert.ok(label != null, 'brak reguły .action-label');
  assert.match(label, /flex:\s*1 1 auto/, `kolumna opisu ma brać stałą resztę wiersza: ${label}`);
  assert.match(label, /min-width:\s*0/, `kolumna opisu musi móc się zawijać (min-width: 0): ${label}`);
  const button = ruleBody('button');
  assert.ok(button != null, 'brak reguły button');
  assert.match(button, /touch-action:\s*manipulation/,
    `przycisk ma nie czekać na rozstrzygnięcie podwójnego tapu: ${button}`);
});

test('K/6 (anty-over-fix): naprawa nie ucina etykiet ani nie psuje wyglądu opcji', () => {
  // Reflow rozwiązujemy układem, a nie ukrywaniem tekstu: długie etykiety
  // („Wybierz: Deklaracja blokujących…”) muszą się nadal zawijać w całości.
  const label = ruleBody('.action-label');
  const action = ruleBody('.action') ?? '';
  assert.doesNotMatch(label + action, /white-space:\s*nowrap/, 'etykieta akcji nie może być ucinana w jednej linii');
  assert.doesNotMatch(label + action, /text-overflow:\s*ellipsis/, 'etykieta akcji nie może być skracana wielokropkiem');
  assert.match(STYLE, /\.action::before\s*\{[^}]*content:\s*"◆"/, 'diament opcji akcji zostaje');
  assert.match(STYLE, /button\.action\.primary\s*\{/, 'wyróżnienie opcji głównej zostaje');
  assert.match(STYLE, /button\.action\.danger\s*\{/, 'wyróżnienie opcji niebezpiecznej zostaje');
  assert.match(HTML, /<div class="actions-wrap" id="actions">/, 'kontener akcji pozostaje kontenerem przewijanym');
});

// ---------------------------------------------------------------------------
// Warstwa JS: wciśnięcie przechwytuje wskaźnik, więc release wraca do opcji
// nawet gdy lista przebudowała layout między press-down a release.
// ---------------------------------------------------------------------------

const { installPressActivation } = await import('../src/table/gestures.js');

/** Minimalny element: rejestruje listenery i liczbę przechwyceń wskaźnika. */
function elementStub() {
  const el = {
    listeners: {},
    przechwycenia: [],
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    setPointerCapture(id) { this.przechwycenia.push(id); },
    dispatch(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn(event); },
  };
  return el;
}

test('K/7: release po przebudowie layoutu aktywuje opcję (wskaźnik przechwycony)', () => {
  const el = elementStub();
  let akcje = 0;
  installPressActivation(el, () => { akcje += 1; });
  el.dispatch('pointerdown', { button: 0, pointerId: 7, clientX: 40, clientY: 120 });
  assert.deepEqual(el.przechwycenia, [7], 'press-down ma przechwycić wskaźnik (release wróci do opcji)');
  el.dispatch('pointerup', { pointerId: 7, clientX: 41, clientY: 122 });
  assert.equal(akcje, 1, 'wciśnięcie i puszczenie w miejscu = aktywacja opcji');
});

test('K/8: przesunięcie palca (scroll) nie aktywuje opcji', () => {
  const el = elementStub();
  let akcje = 0;
  installPressActivation(el, () => { akcje += 1; });
  el.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
  el.dispatch('pointerup', { pointerId: 1, clientX: 10, clientY: 60 });
  assert.equal(akcje, 0, 'gest przewijania nie może klikać opcji');
});

test('K/9: pointercancel (przewijanie na dotyku) gasi aktywację', () => {
  const el = elementStub();
  let akcje = 0;
  installPressActivation(el, () => { akcje += 1; });
  el.dispatch('pointerdown', { button: 0, pointerId: 2, clientX: 5, clientY: 5 });
  el.dispatch('pointercancel', { pointerId: 2 });
  el.dispatch('pointerup', { pointerId: 2, clientX: 5, clientY: 5 });
  assert.equal(akcje, 0, 'po pointercancel release nie należy do tej opcji');
});

test('K/10: natywny click po aktywacji pointerem nie odpala opcji drugi raz', () => {
  const el = elementStub();
  let akcje = 0;
  installPressActivation(el, () => { akcje += 1; });
  el.dispatch('pointerdown', { button: 0, pointerId: 3, clientX: 8, clientY: 8 });
  el.dispatch('pointerup', { pointerId: 3, clientX: 8, clientY: 8 });
  el.dispatch('click', { detail: 1 }); // przeglądarka dosyła click po pointerup
  assert.equal(akcje, 1, 'opcja ma się wykonać dokładnie raz');
});

test('K/11: klawiatura (click z detail === 0) aktywuje opcję jak dotąd', () => {
  const el = elementStub();
  let akcje = 0;
  installPressActivation(el, () => { akcje += 1; });
  el.dispatch('click', { detail: 0 });
  assert.equal(akcje, 1, 'Enter/Spacja na przycisku muszą działać');
});

test('K/12: prawy przycisk myszy nie uzbraja aktywacji', () => {
  const el = elementStub();
  let akcje = 0;
  installPressActivation(el, () => { akcje += 1; });
  el.dispatch('pointerdown', { button: 2, pointerId: 9, clientX: 1, clientY: 1 });
  el.dispatch('pointerup', { pointerId: 9, clientX: 1, clientY: 1 });
  assert.equal(akcje, 0, 'menu kontekstowe nie może uruchamiać opcji');
});
