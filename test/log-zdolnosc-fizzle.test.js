// M102/U10 — log nie mówi graczowi, że zdolność rozstrzygnęła się BEZ EFEKTU.
//
// Znalezione Żywym Testerem (partia innistrad vs wiedzmin, seed 42, tura 20):
//   „Nieprzyjaciel aktywuje zdolność: Barkform Harvester → cel: Negate"   ×3
//   „Nieprzyjaciel: Negate — cmentarz → biblioteka"                       ×1
//   „Nieprzyjaciel: zdolność Barkform Harvester rozstrzygnięta"           ×2
// Trzy aktywacje celowały w tę samą kartę w cmentarzu. Pierwsza ją przeniosła,
// dwie kolejne fizzlowały (CR 608.2b — cel przestał być legalny), ale log
// zameldował je identycznie jak sukces: „zdolność rozstrzygnięta". Gracz widzi
// trzy zapłacone koszty, jeden skutek i żadnego wyjaśnienia.
//
// Silnik JEST poprawny: emituje `ability_resolved` z `fizzled: true`
// i `reason: 'no_legal_targets'` (spells.js). Błąd jest w czytelniku panelu:
// `case 'ability_resolved'` sprawdza `fizzled` WYŁĄCZNIE dla keyworda `equip`,
// a wszystkie pozostałe zdolności opisuje jednym zdaniem o sukcesie.
//
// Wzorzec do naśladowania jest już w kodzie — czary mówią wprost:
//   „X zostaje rozstrzygnięty (cel nielegalny — bez efektu)".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const helpers = {
  nameOf: (cardId) => ({
    'barkform-harvester': 'Barkform Harvester',
    'entrancing-lyre': 'Entrancing Lyre',
  }[cardId] ?? cardId),
  nameOfObject: (id) => (id === 'p1' ? 'Ty' : (id === 'p2' ? 'Nieprzyjaciel' : 'Obiekt')),
  isPlayer: (id) => id === 'p1' || id === 'p2',
};

test('U10: zdolność bez legalnych celów melduje BRAK EFEKTU, nie zwykły sukces', () => {
  const text = describeGameEvent({
    type: 'ability_resolved', playerId: 'p2', sourceId: 'src',
    cardId: 'barkform-harvester', abilityIndex: 0,
    fizzled: true, reason: 'no_legal_targets',
  }, helpers);
  assert.ok(text, 'zdarzenie musi mieć opis');
  assert.match(text, /bez efektu|cel nielegalny|fizzl/i,
    `fizzle zdolności musi być widoczny w logu, dostałem: „${text}"`);
});

test('U10: udana zdolność nadal melduje zwykłe rozstrzygnięcie', () => {
  const text = describeGameEvent({
    type: 'ability_resolved', playerId: 'p2', sourceId: 'src',
    cardId: 'barkform-harvester', abilityIndex: 0,
  }, helpers);
  assert.ok(text, 'zdarzenie musi mieć opis');
  assert.doesNotMatch(text, /bez efektu|cel nielegalny|fizzl/i,
    `sukces nie może straszyć fizzlem: „${text}"`);
  assert.match(text, /rozstrzygni/i, `sukces ma mówić o rozstrzygnięciu: „${text}"`);
});

test('U10: fizzle equipa zachowuje swój bardziej szczegółowy komunikat (regresja M100/E13)', () => {
  const text = describeGameEvent({
    type: 'ability_resolved', playerId: 'p1', sourceId: 'src',
    cardId: 'barkform-harvester', abilityIndex: 0, keyword: 'equip', fizzled: true,
  }, helpers);
  assert.match(text, /sprzęt zostaje odłączony/,
    `equip ma własny, dokładniejszy opis fizzla: „${text}"`);
});

test('U10: udany equip nadal jest cichy (opisuje go „X wyposaża Y")', () => {
  const text = describeGameEvent({
    type: 'ability_resolved', playerId: 'p1', sourceId: 'src',
    cardId: 'barkform-harvester', abilityIndex: 0, keyword: 'equip',
  }, helpers);
  assert.equal(text, null, 'udany equip nie dubluje linii object_attached');
});
