import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceGroupTitle, choiceRequestGroupKey } from '../src/table/render.js';

/**
 * M267 — znalezisko ŻYWEGO TESTERA (profil `explorer`, warhammer-wu vs
 * worek-basni, seed 506, krok 45), złapane przez detektor
 * `detectGenericChoiceTitle` dodany w M266/D.
 *
 * Objaw: panel pokazał „Wybierz: Wariant (8 opcji)" dla You're Confronted
 * by Robbers — modalnego instanta („Choose one —"), którego pierwszy tryb
 * („Stall for Time") celuje w 0–3 stwory.
 *
 * Przyczyna (piąty przypadek klasy L102 w tej serii): KLUCZ GRUPY dla
 * `cast_spell` powstaje, gdy komenda ma `targets` ALBO `sacrificeTargetId`
 * ALBO `modeIndex` (render.js, `choiceRequestGroupKey`), ale gałąź TYTUŁU pyta wyłącznie
 * o `cmd.targets?.length`. Tryb z `variableTargets: { min: 0 }` wystawia
 * ofertę „zero celów" jako PIERWSZĄ opcję grupy, a tytuł liczy się właśnie
 * z `options[0]` — więc spadał na fallback „Wariant".
 *
 * To ta sama klasa co L102/1: klucz i tytuł to dwie listy warunków opisujące
 * TĘ SAMĄ rodzinę; rozjazd między nimi znaczy grupę bez nazwy.
 */

const VIEW = {
  zones: {
    hand: [{
      id: 'o1',
      cardId: 'youre-confronted-by-robbers',
      spell: { modes: [{ name: 'Zyskiwanie czasu' }, { name: 'Wezwanie pomocy' }] },
    }],
    battlefield: [], stack: [], graveyard: [], library: [], exile: [],
  },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
};
const SESSION = { nameOf: (id) => (id === 'youre-confronted-by-robbers' ? "You're Confronted by Robbers" : String(id)) };

test('M267: tryb modalny z ZEROMA celów ma nazwany tytuł grupy', () => {
  // Dokładnie oferta z transkryptu: modeIndex 0, pusta lista celów.
  const request = {
    type: 'command',
    options: [
      { type: 'cast_spell', objectId: 'o1', modeIndex: 0, targets: [] },
      { type: 'cast_spell', objectId: 'o1', modeIndex: 0, targets: ['e1'] },
    ],
  };
  const title = choiceGroupTitle(request, SESSION, VIEW);
  assert.doesNotMatch(title, /Wariant/, 'generyczny fallback to objaw braku deskryptora');
  assert.match(title, /Confronted by Robbers/, 'tytuł nazywa kartę');
  assert.match(title, /Zyskiwanie czasu/, 'tytuł nazywa TRYB (grupa jest per tryb)');
});

test('M267: tryb bez celów w ogóle (Call for Aid) też ma nazwany tytuł', () => {
  const request = {
    type: 'command',
    options: [{ type: 'cast_spell', objectId: 'o1', modeIndex: 1, targets: [] }],
  };
  const title = choiceGroupTitle(request, SESSION, VIEW);
  assert.doesNotMatch(title, /Wariant/);
  assert.match(title, /Wezwanie pomocy/);
});

test('M267: tryb Z celami zachowuje dotychczasowy tytuł (bez regresu)', () => {
  const request = {
    type: 'command',
    options: [{ type: 'cast_spell', objectId: 'o1', modeIndex: 0, targets: ['e1'] }],
  };
  const title = choiceGroupTitle(request, SESSION, VIEW);
  assert.match(title, /Cel czaru/, 'stara ścieżka niezmieniona');
  assert.match(title, /Zyskiwanie czasu/);
});

test('M267 (klasa): każda komenda tworząca KLUCZ GRUPY ma nazwany tytuł', () => {
  // Strażnik klasowy (L102/1): klucz grupy i tytuł to dwie listy warunków
  // o tej samej rodzinie. Enumerujemy kombinacje pól, które `choiceRequestGroupKey`
  // uznaje za grupę, i żądamy, by ŻADNA nie spadła na „Wariant".
  const cases = [
    ['cast_spell + modeIndex, zero celów', { type: 'cast_spell', objectId: 'o1', modeIndex: 0, targets: [] }],
    ['cast_spell + modeIndex, brak pola targets', { type: 'cast_spell', objectId: 'o1', modeIndex: 1 }],
    ['cast_spell + cele', { type: 'cast_spell', objectId: 'o1', modeIndex: 0, targets: ['e1'] }],
    ['cast_spell + poświęcenie', { type: 'cast_spell', objectId: 'o1', sacrificeTargetId: 'e1' }],
  ];
  const bad = [];
  for (const [label, cmd] of cases) {
    const key = choiceRequestGroupKey(cmd);
    if (!key) continue; // nie tworzy grupy — tytuł nieistotny
    const title = choiceGroupTitle({ type: 'command', options: [cmd] }, SESSION, VIEW);
    if (/Wybierz:\s*Wariant/.test(title)) bad.push(`${label} → „${title}"`);
  }
  assert.deepEqual(bad, [], 'komendy grupujące się bez nazwanego tytułu');
});
