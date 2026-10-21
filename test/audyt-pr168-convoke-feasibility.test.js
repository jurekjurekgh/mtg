// Audyt #168/A-9 — oferta convoke nie może zawiesić widoku, gdy żaden
// nietapnięty stwór ani źródło many nie pokrywa obowiązkowego pipa koloru.
// Kavu Primarch z kickerem {4}: nawet przy 27 bezbarwnych Myrach {G} jest
// nieosiągalne. Spawn z watchdogiem chroni cały test runner przed regresją.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { convokePaymentVariants } from '../src/engine/resources.js';

function scene(myrs, green) {
  const registry = createCardRegistry();
  const state = createGameState({ seed: 168, players: [{ id: 'p1' }, { id: 'p2' }] });
  const add = (id, cardId, zone) => {
    const def = registry.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, ownerId: 'p1', controllerId: 'p1',
      zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  };
  add('kavu', 'kavu-primarch', 'hand');
  if (green) add('green', 'tuskguard-captain', 'battlefield');
  for (let i = 0; i < myrs; i += 1) add(`myr-${i}`, 'myr-scrapling', 'battlefield');
  return state;
}

if (process.argv[2] === 'probe') {
  const state = scene(27, false);
  const variants = convokePaymentVariants(state, 'p1', state.objects.get('kavu'), 8, [['G']], {});
  assert.equal(variants.length, 0);
  console.log('A-9: 0 wariantów; brak zielonego pipa');
} else {
  test('A-9: niewykonalny zielony pip odcina enumerację dla 27 stworów i kickera', () => {
    const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'probe'],
      { encoding: 'utf8', timeout: 2000 });
    assert.equal(probe.error?.code, undefined, `widok convoke nie może wisieć >2s: ${probe.error?.message}`);
    assert.equal(probe.status, 0, `sonda zakończona błędem: ${probe.stderr}`);
    assert.match(probe.stdout, /A-9: 0 wariantów/);
  });

  test('A-9 anty-over-fix: zielony stwór na początku listy dalej może zapłacić obowiązkowy pip', () => {
    const state = scene(5, true); // brak zielonej many, ale zielony Tuskguard + trzy Myry pokrywają {3}{G}
    const variants = convokePaymentVariants(state, 'p1', state.objects.get('kavu'), 4, [['G']], {});
    assert.ok(variants.length > 0);
    assert.ok(variants.every((payments) => payments.some((p) => p.creatureId === 'green' && p.color === 'G')),
      'każda opłacalna płatność musi użyć zielonego stwora na zielony pip');
  });
}
