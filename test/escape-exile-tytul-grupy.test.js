import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceGroupTitle } from '../src/table/render.js';

/**
 * Znalezisko ŻYWEGO TESTERA (pętla jakości, theros vs warhammer-wu, seed 308,
 * profil impatient): decyzja „wybierz karty do wygnania za Escape”
 * (resolve_escape_exile) — grupa dostała typ `escape_exile`, którego nie znała
 * żadna z dwóch map deskryptorów (CHOICE_GROUP_TYPE_DESCRIPTORS /
 * CHOICE_GROUP_COMMAND_DESCRIPTORS), więc tytuł spadał na generyczne
 * „Wybierz: Wariant (10 opcji)”. Gracz nie wiedział, czego dotyczy wybór.
 *
 * To klasa L102/1: klucz grupy i tytuł to dwie listy warunków o tej samej
 * rodzinie; bliźniacza decyzja cast_escape nazywa czar, a resolve_escape_exile
 * nie miała gałęzi tytułu. Źródło (karta w grobie — strefa publiczna) jedzie
 * z pendingu, nigdy z nazwy zaszytej w warstwie opisu (ADR 0002).
 */

const VIEW = {
  zones: {
    hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [],
  },
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  pendingEscapeExile: { sourceCardId: 'sleep-of-the-dead', exileCount: 3 },
};
const SESSION = {
  nameOf: (id) => (id === 'sleep-of-the-dead' ? 'Sleep of the Dead' : String(id)),
};

test('resolve_escape_exile: grupa nazywa kartę i czynność, nie „Wariant"', () => {
  const request = {
    type: 'escape_exile',
    options: [
      { type: 'resolve_escape_exile', playerId: 'p1', exileIds: ['g1', 'g2', 'g3'] },
      { type: 'resolve_escape_exile', playerId: 'p1', exileIds: ['g1', 'g2', 'g4'] },
    ],
  };
  const title = choiceGroupTitle(request, SESSION, VIEW);
  assert.doesNotMatch(title, /Wariant/, 'generyczny fallback to objaw braku deskryptora');
  assert.match(title, /Sleep of the Dead/, 'tytuł nazywa kartę rzucaną przez Escape');
  assert.match(title, /Ucieczka \(Escape\)/, 'tytuł opisuje czynność (karty do wygnania)');
});
