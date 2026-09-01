import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect, counterStackObject } from '../src/engine/effects.js';
import { spellExitZone } from '../src/engine/zones.js';

/**
 * M271 (błąd #15, CR 701.5a + 118.9) — skontrowany czar idzie do grobu
 * WŁAŚCICIELA, ale zastąpienie Halo Foragera („if it would be put into a
 * graveyard, exile it instead") obowiązuje także przy kontrze. PIĘĆ kopii
 * kodu kontrującego szło na sztywno do grobu, więc czar rzucony z grobu
 * Foragerem i skontrowany WRACAŁ do grobu i dawał się rzucić ponownie.
 *
 * Strażnik KLASOWY: sprawdza regułę na poziomie wspólnego helpera oraz
 * pilnuje, by nie odrodziły się kopie omijające go w kodzie źródłowym.
 */
const registry = createCardRegistry();

function stanZCzarem(extra = {}) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  const ofiara = registry.get('twiddle');
  addObject(state, {
    id: 'cel', instanceId: 'ic', cardId: 'twiddle', controllerId: 'p2', ownerId: 'p2',
    zone: 'stack', ...gameObjectDataOf(ofiara), types: ofiara.types,
  });
  state.objects.set('cel', Object.freeze({ ...state.objects.get('cel'), ...extra }));
  const src = registry.get('steel-sabotage');
  addObject(state, {
    id: 'src', instanceId: 'is', cardId: 'steel-sabotage', controllerId: 'p1', ownerId: 'p1',
    zone: 'stack', ...gameObjectDataOf(src), types: src.types,
  });
  state.events.length = 0;
  return state;
}

const strefaPoKontrze = (state) => {
  const zdarzenie = state.events.find((e) => e.type === 'spell_countered');
  return zdarzenie?.toId ? state.objects.get(zdarzenie.toId)?.zone : null;
};

test('efekt counter_spell respektuje exileInsteadOfGraveyard', () => {
  const state = stanZCzarem({ exileInsteadOfGraveyard: true });
  applyEffect(state, { type: 'counter_spell' }, state.objects.get('src'), ['cel']);
  assert.equal(strefaPoKontrze(state), 'exile');
});

test('kontrola negatywna: bez znacznika skontrowany czar idzie do grobu', () => {
  const state = stanZCzarem();
  applyEffect(state, { type: 'counter_spell' }, state.objects.get('src'), ['cel']);
  assert.equal(strefaPoKontrze(state), 'graveyard');
});

test('wspólny helper counterStackObject stosuje tę samą regułę', () => {
  for (const [nazwa, extra, oczekiwana] of [
    ['Forager', { exileInsteadOfGraveyard: true }, 'exile'],
    ['zwykły', {}, 'graveyard'],
    ['flashback', { flashedBack: true }, 'exile'],
  ]) {
    const state = stanZCzarem(extra);
    counterStackObject(state, 'cel', { counteredBy: 'src', counteredByCardId: 'steel-sabotage' });
    assert.equal(strefaPoKontrze(state), oczekiwana, `${nazwa}: strefa zejścia`);
  }
});

test('spellExitZone: jedno źródło reguły dla wszystkich ścieżek', () => {
  assert.equal(spellExitZone({}), 'graveyard');
  assert.equal(spellExitZone({ exileInsteadOfGraveyard: true }), 'exile');
  assert.equal(spellExitZone({}, { adventure: true }), 'exile');
  assert.equal(spellExitZone({}, { flashedBack: true }), 'exile');
  assert.equal(spellExitZone({}, { reboundCast: true }), 'exile');
});

test('KLASA: żadna ścieżka kontry nie przenosi czaru na sztywno do grobu', () => {
  // Kopie kodu kontrującego omijające wspólny helper były źródłem błędu.
  for (const plik of ['src/engine/effects.js', 'src/engine/game-state.js', 'src/engine/spells.js']) {
    const zrodlo = fs.readFileSync(plik, 'utf8');
    const linie = zrodlo.split('\n');
    linie.forEach((linia, index) => {
      if (!linia.includes("spell_countered")) return;
      // Emiter zdarzenia kontry powinien stać w helperze albo obok wyliczonej
      // strefy — nigdy obok literału 'graveyard'.
      const kontekst = linie.slice(Math.max(0, index - 8), index).join('\n');
      assert.ok(
        !kontekst.includes("moveObjectDirectly(state, ") || !kontekst.includes("'graveyard'"),
        `${plik}:${index + 1} — kontra przenosi czar na sztywno do grobu`,
      );
    });
  }
});
