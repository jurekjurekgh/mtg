// Harness E8: niszczenie przez realną ścieżkę efektu (destroyPermanentByEffect).
import { destroyPermanentByEffect } from '../../src/engine/effects.js';

export function destroyPermanentAndClear(state, objectId) {
  return destroyPermanentByEffect(state, objectId, { reason: 'e8-test' });
}
