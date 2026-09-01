import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceGroupTitle } from '../src/table/render.js';

/**
 * Znalezisko ŻYWEGO TESTERA (pętla jakości, tarkir-wur vs innistrad-brg,
 * seed 316, profil explorer): decyzja „look at the top N cards, put one into
 * your hand" (resolve_look_top_choice — Gurmag Drowner / Merchant's Dockhand)
 * spadała na generyczne „Wybierz: Wariant (4 opcje)": klucz grupy istniał
 * (choiceRequestGroupKey), ale ani `choiceSourceTitle`, ani
 * CHOICE_GROUP_COMMAND_DESCRIPTORS nie znały tego typu.
 *
 * Klasa L102/1: klucz grupy i tytuł to dwie listy warunków o tej samej
 * rodzinie. Sąsiednie decyzje tej samej klasy (manifest dread M251/B,
 * satyr look M240/B) nazywają źródło — tu źródło (permanent na polu bitwy,
 * strefa publiczna) jedzie z pendingu jak u nich (ADR 0002, bez nazw
 * w warstwie opisu).
 */

const VIEW = {
  zones: {
    hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [],
  },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  pendingLookTopN: { playerId: 'p1', count: 4, sourceCardId: 'gurmag-drowner' },
};
const SESSION = {
  nameOf: (id) => (id === 'gurmag-drowner' ? 'Gurmag Drowner' : String(id)),
};

test('resolve_look_top_choice: grupa nazywa kartę i czynność, nie „Wariant"', () => {
  const request = {
    type: 'command',
    options: [
      { type: 'resolve_look_top_choice', playerId: 'p1', cardId: 'g1' },
      { type: 'resolve_look_top_choice', playerId: 'p1', cardId: 'g2' },
    ],
  };
  const title = choiceGroupTitle(request, SESSION, VIEW);
  assert.doesNotMatch(title, /Wariant/, 'generyczny fallback to objaw braku deskryptora');
  assert.match(title, /Gurmag Drowner/, 'tytuł nazywa źródło decyzji (karta na polu bitwy)');
  assert.match(title, /do ręki/, 'tytuł opisuje czynność');
});
