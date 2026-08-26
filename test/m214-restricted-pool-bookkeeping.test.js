// M214 — audyt reguł MtG (odznaka wyłapywacza błędów, znalezisko #1):
// księgowość many OGRANICZONEJ drukiem (Powerstone) w MIESZANEJ puli.
//
// Druk tokenu Powerstone: „{T}: Add {C}. This mana can't be spent to cast a
// nonartifact spell." Gdy w puli jest jednocześnie mana zwykła ({W} z Plains)
// i ograniczona ({C} z Powerstone), zapłata za czar nie-artefaktowy
// {1}{W} musi wydać OBIE zwykłe jednostki — manę Powerstone wolno wydać
// wyłącznie na czar-artefakt (albo zdolność/inną płatność niebędącą rzutem).
//
// Objaw błędu sprzed naprawy: `consumeManaPool` nie znała pochodzenia
// jednostek, więc generic {1} konsumował bezbarwną manę Powerstone, a po
// zapłacie licznik `artifactOnlyMana` zostawał zawieszony na POZOSTAŁEJ
// zwykłej {W} — producibleMana dla legalnego czaru nie-artefaktowego spadała
// do 0 mimo many w puli (a zarazem mana Powerstone znikała bez śladu, choć
// nigdy nie została wydana na artefakt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/engine/game-state.js';
import { addMana, spendMana, producibleMana, spellManaPurpose, consumeManaPool } from '../src/engine/resources.js';

const nonArtifactPurpose = spellManaPurpose({ id: 'x', cardId: 'raise-the-alarm', types: ['Instant'], colors: [] });
const artifactPurpose = spellManaPurpose({ id: 'y', types: ['Artifact'] });

function mixedPoolState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  addMana(state, 'p1', 1, { colors: [], spendOnly: 'artifact' }); // Powerstone {C}
  addMana(state, 'p1', 1, { colors: ['W'] }); // Plains
  addMana(state, 'p1', 1, { colors: ['W'] }); // Plains
  return state;
}

test('M214: {1}{W} za czar nie-artefaktowy wydaje WYŁĄCZNIE zwykłą manę (zostaje Powerstone)', () => {
  const state = mixedPoolState();
  const p = state.players[0];
  assert.equal(producibleMana(state, 'p1', null, nonArtifactPurpose), 2, 'oferta: 2 zwykłe jednostki');
  spendMana(state, 'p1', 2, [['W']], nonArtifactPurpose);
  // Poprawny wynik: wydane W+W, w puli zostaje TYLKO ograniczona jednostka.
  assert.deepEqual(p.manaPool, {}, 'zwykła pula zużyta w całości');
  assert.deepEqual(p.restrictedPool, { '': 1 }, 'mana Powerstone nietknięta');
  assert.equal(p.artifactOnlyMana, 1, 'licznik idzie za pulą ograniczoną');
  assert.equal(p.mana, 1, 'suma obu pul = player.mana');
});

test('M214: po zapłacie za nie-artefakt mana Powerstone NIE jest dostępna dla kolejnego czaru nie-artefaktowego', () => {
  const state = mixedPoolState();
  spendMana(state, 'p1', 2, [['W']], nonArtifactPurpose);
  const p = state.players[0];
  assert.equal(producibleMana(state, 'p1', null, nonArtifactPurpose), 0,
    'w puli została wyłącznie mana „only to cast artifact spells”');
  assert.throws(() => spendMana(state, 'p1', 1, [], nonArtifactPurpose), /Niewystarczająca mana/);
  assert.equal(p.restrictedPool[''], 1, 'nieudana próba nie zużyła maney Powerstone');
});

test('M214: ta sama mana Powerstone wydaje się na czar-artefakt (anty-over-fix)', () => {
  const state = mixedPoolState();
  spendMana(state, 'p1', 2, [['W']], nonArtifactPurpose);
  const p = state.players[0];
  assert.equal(producibleMana(state, 'p1', null, artifactPurpose), 1, 'artifact spell widzi manę ograniczoną');
  spendMana(state, 'p1', 1, [], artifactPurpose);
  assert.deepEqual(p.restrictedPool, {});
  assert.equal(p.artifactOnlyMana, 0);
  assert.equal(p.mana, 0);
});

test('M214: konsumpcja NIE nadpisuje puli ograniczonej przy zabronionym celu', () => {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  const p = state.players[0];
  addMana(state, 'p1', 2, { colors: ['W'], spendOnly: 'artifact' }); // teoretycznie kolorowa ograniczona
  addMana(state, 'p1', 1, { colors: ['U'] });
  const colors = consumeManaPool(p, 1, [['U']], false);
  assert.deepEqual(colors, ['U'], 'wydana jednostka wolna (U)');
  assert.deepEqual(p.restrictedPool, { W: 2 }, 'pula ograniczona nietknięta');
  assert.equal(p.mana, 3, 'consumeManaPool nie modyfikuje sumy (robi to spendMana)');
  assert.equal(p.artifactOnlyMana, 2, 'licznik równy sumie restrictedPool');
});

test('M214: przy dozwolonym celu jednostki ograniczone zużywane są NAJPIERW (deterministycznie)', () => {
  const state = createGameState({ seed: 10, players: [{ id: 'p1' }, { id: 'p2' }] });
  const p = state.players[0];
  addMana(state, 'p1', 1, { colors: [], spendOnly: 'artifact' });
  addMana(state, 'p1', 1, { colors: [] });
  consumeManaPool(p, 1, [], true);
  assert.deepEqual(p.restrictedPool, {}, 'ograniczona wyszła pierwsza');
  assert.deepEqual(p.manaPool, { '': 1 }, 'wolna jednostka została');
});
