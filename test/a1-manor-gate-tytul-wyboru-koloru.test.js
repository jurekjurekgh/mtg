// A1 (znalezisko właściciela z testów, 2026-09-16): komunikat wyboru koloru
// przy wejściu Manor Gate (panel „Twoje działania" + nagłówek modala) brzmiał
// „Kolor (np. ochrona)" — dopisek zgadywał CEL wyboru po pierwszym użyciu
// deskryptora (aura z ochroną), a ląd z chooseColor wybiera kolor PRODUKOWANEJ
// many. Cel wyboru niesie pending z engine (purpose: 'mana' lądu /
// 'protection' aury) + źródło (sourceCardId) — tytuł grupy mówi to samo, co
// log „Rozgrywki": „Manor Gate — wybór koloru (produkcja many)".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceGroupTitle } from '../src/table/render.js';

const fakeSession = (names) => ({ nameOf: (cardId) => names[cardId] ?? cardId });

const colorRequest = () => ({ type: 'target', options: [{ type: 'resolve_color_choice', color: 'B' }] });

test('A1: ląd z chooseColor — tytuł nazywa produkcję many, nie „np. ochrona”', () => {
  const title = choiceGroupTitle(
    colorRequest(),
    fakeSession({ 'manor-gate': 'Manor Gate' }),
    { pendingColorChoice: { purpose: 'mana', sourceCardId: 'manor-gate' } },
  );
  assert.equal(title, 'Manor Gate — wybór koloru (produkcja many)');
});

test('A1: aura z chooseColor — tytuł nazywa ochronę', () => {
  const title = choiceGroupTitle(
    colorRequest(),
    fakeSession({ 'benevolent-blessing': 'Benevolent Blessing' }),
    { pendingColorChoice: { purpose: 'protection', sourceCardId: 'benevolent-blessing' } },
  );
  assert.equal(title, 'Benevolent Blessing — wybór koloru (ochrona przed nim)');
});

test('A1: bez pendingu w widoku zostaje goły „Kolor” — nigdy „(np. ochrona)”', () => {
  assert.equal(choiceGroupTitle(colorRequest(), fakeSession({}), null), 'Wybierz: Kolor');
  assert.equal(
    choiceGroupTitle(colorRequest(), fakeSession({}), {}),
    'Wybierz: Kolor',
    'widok bez pendingColorChoice nie zgaduje celu wyboru',
  );
});
