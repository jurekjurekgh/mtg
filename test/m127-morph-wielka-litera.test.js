// =============================================================================
// M127 — uwaga A właściciela (2026-08-17, testy na telefonie):
//
//   „Jeśli w Rozgrywce podawane są informacje o kreaturze zagranej jako morph
//    to zręczniej byłoby pisać go z wielkiej litery: Morph."
//
// `Morph` to NAZWA MECHANIKI (CR 702.37) — jak Flash czy Persist w mapie
// KEYWORD_LABELS. W UI pełni dodatkowo rolę ZASTĘPCZEJ NAZWY zakrytej karty
// (CR 708.2: permanent twarzą w dół nie ma nazwy), więc stoi dokładnie tam,
// gdzie normalnie stoi nazwa karty — pisownia małą literą czytała się jak
// literówka („Nieprzyjaciel zagrywa morph twarzą w dół").
//
// Root cause NIE był „zła wielkość litery w jednym miejscu": etykieta była
// SUROWYM LITERAŁEM powtórzonym w ośmiu miejscach czterech modułów stołu
// (session.js, render.js, choice-request.js, main.js). To wzorzec z L28/L30 —
// punktowa poprawka w miejscu zgłoszenia zostawiłaby siedem ścieżek starą
// pisownią. Naprawa: jedna stała FACE_DOWN_LABEL + helper faceDownName().
//
// Poniżej: (1) testy behawioralne każdej powierzchni renderu, (2) niezmiennik
// czytający ŹRÓDŁO (L31 — strażnik SŁOWNIKA to nie strażnik MIEJSC UŻYCIA).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  describeGameEvent, FACE_DOWN_LABEL, faceDownName, faceDownSuffix,
} from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const KROTIQ = 'segmented-krotiq';
const PLAYER_NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const nameOf = (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?');

function helpersWith(objects = new Map()) {
  return {
    nameOf,
    nameOfObject: (id) => {
      if (id === 'p1' || id === 'p2') return PLAYER_NAMES[id];
      const object = objects.get(id);
      if (!object) return '?';
      if (object.faceDown) return object.controllerId === 'p1' ? faceDownName(nameOf(object.cardId)) : FACE_DOWN_LABEL;
      return nameOf(object.cardId);
    },
    isPlayer: (id) => id === 'p1' || id === 'p2',
  };
}

// --- 1. Kontrakt samej etykiety --------------------------------------------

test('M127: FACE_DOWN_LABEL to „Morph" — nazwa mechaniki wielką literą', () => {
  assert.equal(FACE_DOWN_LABEL, 'Morph');
  // Regresja wprost na zgłoszenie: pierwszy znak MUSI być wielki.
  assert.equal(FACE_DOWN_LABEL[0], FACE_DOWN_LABEL[0].toUpperCase(),
    'etykieta zakrytej karty zaczyna się wielką literą (uwaga A właściciela)');
});

test('M127: faceDownName — cudzy bezimienny (CR 708.2), własny z nazwą i znacznikiem (CR 708.6)', () => {
  assert.equal(faceDownName(null), 'Morph', 'cudzy face-down zostaje bezimienny (FoW)');
  assert.equal(faceDownName('Segmented Krotiq'), 'Segmented Krotiq (Morph)',
    'własny face-down: nazwa + znacznik, żeby nie wyglądał jak pełny stwór (M100/E12)');
  assert.equal(faceDownSuffix(), ' (Morph)');
});

// --- 2. Powierzchnie renderu (każda ścieżka osobno — L30) -------------------

test('M127: log „Rozgrywki" — zagranie twarzą w dół pisze „Morph"', () => {
  const e = { type: 'permanent_cast', playerId: 'p2', faceDown: true, object: { cardId: KROTIQ } };
  const text = describeGameEvent(e, helpersWith(), PLAYER_NAMES);
  assert.equal(text, 'Nieprzyjaciel zagrywa Morph twarzą w dół (2/2)');
  assert.ok(!/\bmorph\b/.test(text), `żadnego „morph" małą literą: ${text}`);
});

test('M127: log — rozstrzygnięcie zakrytego czaru pisze „Morph"', () => {
  const e = { type: 'spell_resolved', controllerId: 'p2', faceDown: true, cardId: KROTIQ };
  const text = describeGameEvent(e, helpersWith(), PLAYER_NAMES);
  assert.match(text, /^Morph zostaje rozstrzygnięty/, text);
});

test('M127: log — zakryty permanent wchodzi na pole bitwy jako „Morph"', () => {
  const objects = new Map([['fd', { id: 'fd', cardId: KROTIQ, controllerId: 'p2', faceDown: true }]]);
  const e = { type: 'permanent_entered_battlefield', objectId: 'fd', cardId: KROTIQ };
  const text = describeGameEvent(e, helpersWith(objects), PLAYER_NAMES);
  assert.match(text, /Morph wchodzi na pole bitwy/, text);
});

test('M127: etykieta celu (commandLabel) — cudzy zakryty stwór to „Morph"', async () => {
  const { commandLabel } = await import('../src/table/render.js');
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      hand: [{ id: 'bolt', cardId: 'brute-force', controllerId: 'p1' }],
      battlefield: [{ id: 'fd', cardId: null, controllerId: 'p2', faceDown: true, kind: 'creature', power: 2, toughness: 2 }],
      stack: [], graveyard: [], exile: [], library: [],
    },
    legalCommands: [],
    turn: { number: 1, phase: 'precombat_main', step: 'main', activePlayerId: 'p1' },
  };
  const session = {
    nameOf: (c) => REGISTRY.get(c)?.name ?? String(c ?? '?'),
    nameOfObject: () => '?',
    abilitiesOf: () => [],
    cardDetails: (c) => REGISTRY.get(c) ?? null,
  };
  const label = commandLabel({ type: 'cast_spell', playerId: 'p1', objectId: 'bolt', targets: ['fd'] }, session, view);
  assert.match(label, /Morph/, `cel zakryty jako „Morph": ${label}`);
  assert.ok(!/\bmorph\b/.test(label), `bez małej litery: ${label}`);
});

test('M127: wizard walki nazywa zakrytego atakującego „Morph"', async () => {
  const { renderCombatWizard } = await import('../src/table/choice-request.js');
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
      this.text = ''; this.html = ''; this.type = ''; this.checked = false; this.disabled = false;
      this.dataset = {};
    }

    set textContent(value) { this.text = String(value); this.html = ''; this.children = []; }

    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

    set innerHTML(value) { this.html = String(value); this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }

    get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }

    appendChild(child) { this.children.push(child); return child; }

    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  }
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const view = {
    playerId: 'p1',
    turn: { number: 3, step: 'declare_blockers' },
    zones: {
      battlefield: [
        { id: 'atk', cardId: null, controllerId: 'p2', faceDown: true, power: 2, toughness: 2 },
        { id: 'blk', cardId: 'highland-game', controllerId: 'p1', power: 2, toughness: 1 },
      ],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const session = { nameOf: (c) => REGISTRY.get(c)?.name ?? String(c), nameOfObject: () => '?' };
  const options = [
    { type: 'declare_blockers', playerId: 'p1', assignments: { atk: [] } },
    { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['blk'] } },
  ];
  const host = new MiniEl('div');
  renderCombatWizard(host, { kind: 'blockers', view, session, options, onComplete: () => {} });
  assert.match(host.textContent, /Morph/, `zakryty atakujący jako „Morph": ${host.textContent}`);
  assert.ok(!/\bmorph\b/.test(host.textContent), `bez małej litery: ${host.textContent}`);
});

// --- 3. Niezmiennik czytający ŹRÓDŁO (L31) ----------------------------------
//
// Strażnik kompletności SŁOWNIKA to nie strażnik MIEJSC UŻYCIA. Bez tego testu
// pierwszy nowy widok znów wpisze `'morph'` z palca i rozjedzie pisownię —
// dokładnie tak powstało osiem kopii tej etykiety przed M127.

const TABLE_MODULES = [
  'src/table/session.js',
  'src/table/render.js',
  'src/table/choice-request.js',
  'src/table/main.js',
];

test('M127 (niezmiennik L31): żaden moduł stołu nie wpisuje etykiety „morph" z palca', () => {
  const offenders = [];
  for (const file of TABLE_MODULES) {
    const source = fs.readFileSync(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, ''); // komentarze wolno omawiać mechanikę
      // Literał 'morph' / "morph" w pozycji WARTOŚCI (etykiety) jest zakazany.
      // Dozwolone są wyłącznie PORÓWNANIA deskryptora karty:
      //   ability.keyword === 'morph', a.keyword === 'megamorph', ['morph', …]
      const matches = code.match(/(['"])(morph|megamorph)\1/g);
      if (!matches) return;
      const isDescriptorCompare = /(===|!==|==|!=)\s*(['"])(morph|megamorph)\2/.test(code)
        || /(['"])(morph|megamorph)\1\s*(===|!==|==|!=)/.test(code)
        || /\[(['"])(morph|megamorph)\1[,\]]/.test(code)      // klucz flagi/tablicy
        || /(['"])(morph|megamorph)\1\s*:/.test(code);        // klucz mapy etykiet
      if (!isDescriptorCompare) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [],
    `etykieta zakrytej karty ma iść z FACE_DOWN_LABEL/faceDownName (M127), a nie z literału:\n${offenders.join('\n')}`);
});

test('M127 (niezmiennik L31): żaden TEKST widoczny dla gracza nie pisze „morph" małą literą', () => {
  // Druga oś tego samego długu — znaleziona dopiero Żywym Testerem, już PO
  // naprawie ośmiu ścieżek nazwy. Etykieta kafla mówiła „…potem obrócić za
  // koszt morph": nazwa mechaniki w ŚRODKU zdania, więc poprzedni strażnik
  // (literały w pozycji wartości) jej nie widział. Transkrypt 3 partii pokazał
  // 10 wystąpień małą literą przy 11 poprawnych — dowód, że strażnik SŁOWNIKA
  // i strażnik MIEJSC UŻYCIA to dwie różne rzeczy (L31).
  //
  // Metoda: wycinamy komentarze, potem z każdej linii bierzemy WYŁĄCZNIE
  // zawartość literałów tekstowych (bez wstawek ${...}, które są kodem)
  // i w niej szukamy słowa „morph" pisanego małą literą.
  const offenders = [];
  for (const file of TABLE_MODULES) {
    const source = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')   // komentarze blokowe
      .replace(/^\s*\/\/.*$/gm, '');       // komentarze liniowe
    source.split('\n').forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '');
      const literals = code.match(/`[^`]*`|'[^']*'|"[^"]*"/g) ?? [];
      for (const literal of literals) {
        // Deskryptory karty i klucze techniczne to NIE tekst dla gracza:
        //   a.keyword === 'morph'        (porównanie deskryptora)
        //   ? 'megamorph' : 'morph'      (wybór wariantu deskryptora)
        //   flags.push(['morph', …])     (klucz nakładki)
        //   megamorph: 'Megamorph'       (klucz mapy etykiet)
        // Rozpoznajemy je po tym, że literał jest ZWYKŁYM stringiem równym
        // dokładnie nazwie deskryptora — tekst dla gracza zawsze ma wokół
        // siebie inne słowa.
        if (/^(['"])(morph|megamorph)\1$/.test(literal)) continue;
        // Wstawki ${...} to kod (np. info.morph.morphCost), nie tekst.
        const text = literal.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
        // Nazwa mechaniki jako SŁOWO w zdaniu — z granicą działającą dla
        // polskich liter (pułapka: \b zawodzi nad \p{L}, patrz handoff §6).
        if (/(^|[^\p{L}\w-])(morph|megamorph)(?![\p{L}\w-])/u.test(text)) {
          offenders.push(`${file}:${index + 1}: ${line.trim()}`);
          break;
        }
      }
    });
  }
  assert.deepEqual(offenders, [],
    `nazwa mechaniki w tekście dla gracza pisze się „Morph"/„Megamorph" (uwaga A właściciela):\n${offenders.join('\n')}`);
});

test('M127 (niezmiennik): mapa KEYWORD_LABELS zna morph I megamorph', () => {
  const source = fs.readFileSync('src/table/render.js', 'utf8');
  const map = source.match(/const KEYWORD_LABELS = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(map, 'KEYWORD_LABELS istnieje w render.js');
  // L29: `MAPA[key] ?? key` to cichy wyciek — brak wpisu = surowy slug w UI.
  assert.match(map[1], /\bmorph:\s*'Morph'/, 'morph → „Morph"');
  assert.match(map[1], /\bmegamorph:\s*'Megamorph'/, 'megamorph → „Megamorph" (brakowało przed M127)');
});
