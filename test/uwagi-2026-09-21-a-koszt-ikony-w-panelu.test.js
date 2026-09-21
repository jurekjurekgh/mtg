// A (zgłoszenie właściciela z żywej gry, 2026-09-21) — koszt czaru MODALNEGO
// w panelu „Twoje działania" był SUROWYM tekstem: „Rzuć: Selesnya Charm
// (koszt {G}{W})" obok kolorowych pipów we wszystkich innych etykietach.
// Właściciel: „To chyba nie powinno tak wyglądać...".
//
// Przyczyna (klasa L102/1 — dwie warstwy opisujące tę samą rodzinę):
//   `choiceGroupTitle` obsługuje DWÓCH konsumentów o różnym kanale zapisu:
//     • panel „Twoje działania"      → `innerHTML` (render.js/renderTableView,
//       main.js/odświeżenie panelu) — tu ikony many są normą od M104/A2;
//     • nagłówek modala + intro      → `textContent` (M87) — tu MUSI zostać
//       notacja `{G}{W}`, inaczej gracz czyta surowy markup.
//   Tytuł powstawał w jednym, tekstowym wariancie i szedł do obu warstw, więc
//   panel tracił ikony. Naprawa: `manaHtml` jako jawny parametr wywołania.
//
// Testy mierzą REGUŁĘ, nie jedną kartę:
//   1. KLASA — dla KAŻDEGO czaru modalnego z katalogu (spell.modes ≥ 2, koszt
//      w MANA_COSTS) wariant panelowy ma ikony i ani jednego surowego symbolu
//      `{…}`; wariant tekstowy (nagłówek modala) ma odwrotnie i nie zawiera
//      HTML-a. Nowy czar modalny wchodzi w ten strażnik automatycznie.
//   2. MIEJSCE UŻYCIA — panel akcji rysuje etykietę przez `choiceGroupLabel`
//      (wariant z ikonami), a nagłówek modala przez `choiceGroupTitle`.
//      Skan po odkomentowaniu (L83: zakomentowane wywołanie nie może zostawić
//      zielonego strażnika).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choiceGroupTitle, choiceGroupLabel } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const registry = createCardRegistry();

/** Skan bez komentarzy — bramka L83. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Karty z katalogu, które rzuca się jako czar modalny („Choose one —"). */
function modalSpellCards() {
  return registry.all().filter((card) => (card.spell?.modes ?? []).length > 1);
}

/** Minimalny widok sesji: karta w ręce gracza (pełne dane, jak własna ręka). */
function viewWithCard(card) {
  return {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      hand: [{ id: 'o1', cardId: card.id, controllerId: 'p1', zone: 'hand', spell: card.spell }],
      battlefield: [], stack: [], graveyard: [], library: [], exile: [],
    },
  };
}

/** Żądanie wyboru dokładnie takie, jakie grupuje `buildActionEntries`. */
const requestFor = (card) => ({
  type: 'command',
  options: (card.spell.modes ?? []).map((_, modeIndex) => ({
    type: 'cast_spell', playerId: 'p1', objectId: 'o1', modeIndex, targets: [],
  })),
});

const SESSION = { nameOf: (id) => id };

test('A/1: panel „Twoje działania" pokazuje koszt czaru modalnego IKONAMI many', () => {
  const selesnya = registry.get('selesnya-charm');
  assert.ok(selesnya, 'brak karty wzorcowej w katalogu');
  const view = viewWithCard(selesnya);
  const label = choiceGroupLabel(requestFor(selesnya), SESSION, view);
  assert.match(label, /Rzuć: selesnya-charm \(koszt /, `tytuł bez kosztu: ${label}`);
  assert.match(label, /class="ms ms-g"/, `brak ikony zielonej many: ${label}`);
  assert.match(label, /class="ms ms-w"/, `brak ikony białej many: ${label}`);
  assert.doesNotMatch(label, /\{[WUBRG0-9]\}/, `surowy symbol many w panelu: ${label}`);
});

test('A/2: nagłówek modala zostaje TEKSTEM — bez markupu ikon (M87)', () => {
  const selesnya = registry.get('selesnya-charm');
  const view = viewWithCard(selesnya);
  const title = choiceGroupTitle(requestFor(selesnya), SESSION, view);
  assert.equal(title, 'Rzuć: selesnya-charm (koszt {G}{W})',
    'nagłówek modala (textContent) musi zostać przy notacji {…}');
  assert.doesNotMatch(title, /</, 'nagłówek modala nie może nieść HTML-a');
});

test('A/3 (klasa): KAŻDY czar modalny z katalogu — panel z ikonami, nagłówek tekstem', () => {
  const cards = modalSpellCards();
  assert.ok(cards.length >= 10, `katalog czarów modalnych podejrzanie mały: ${cards.length}`);
  const bezZmian = [];
  for (const card of cards) {
    const view = viewWithCard(card);
    const request = requestFor(card);
    const label = choiceGroupLabel(request, SESSION, view);
    const title = choiceGroupTitle(request, SESSION, view);
    const raw = MANA_COSTS[card.id];
    assert.ok(!label.includes('<span class="action'), 'etykieta nie jest gotowym blokiem HTML');
    assert.doesNotMatch(label, /\{[WUBRG0-9]\}/,
      `${card.id}: panel pokazuje surowy koszt zamiast ikon — ${label}`);
    assert.doesNotMatch(title, /</, `${card.id}: nagłówek modala dostał HTML — ${title}`);
    if (!raw) continue; // karta bez wpisu w MANA_COSTS — kosztu w tytule nie ma
    assert.ok(label.includes('ms-group'), `${card.id}: brak bloku ikon kosztu — ${label}`);
    bezZmian.push(card.id);
  }
  assert.ok(bezZmian.length >= 10, `zbyt mało kart z kosztem do sprawdzenia: ${bezZmian.length}`);
});

test('A/4 (miejsce użycia): panel akcji bierze wariant z ikonami, modal — tekstowy', () => {
  const render = stripComments(readFileSync(new URL('../src/table/render.js', import.meta.url), 'utf8'));
  const main = stripComments(readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8'));
  assert.match(render, /choiceGroupLabel\(entry\.request, session, view\)/,
    'panel akcji musi etykietować grupy przez choiceGroupLabel (wariant z ikonami)');
  assert.match(render, /choiceGroupTitle\(request, session, view, \{ manaHtml: true \}\)/,
    'choiceGroupLabel musi przekazywać manaHtml: true do choiceGroupTitle');
  assert.match(main, /introLabel: choiceGroupTitle\(request, session, choiceView\)/,
    'nagłówek modala ma brać wariant TEKSTOWY tytułu (textContent)');
});
