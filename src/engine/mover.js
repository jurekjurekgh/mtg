/**
 * Rejestr JEDYNEGO choke pointu zmian stref (`moveObjectDirectly`).
 *
 * Po co: `attachments.js` leży NISKO w grafie importów (importują ją
 * `objects.js` i `permanents.js`), ale musi wykonać prawdziwą zmianę strefy,
 * gdy aura traci gospodarza (CR 704.5m). Bezpośredni import
 * `attachments → objects` byłby CYKLEM, którego zabrania
 * `test/module-graph.test.js` (bundler składa moduły w jeden zasięg).
 *
 * Zamiast duplikować logikę przenoszenia — co historycznie kosztowało dwa
 * błędy (M271 #11 grób właściciela CR 400.3, #12 finality CR 122.1e) — moduł
 * `objects.js` REJESTRUJE tu swoją funkcję przy załadowaniu, a warstwy niższe
 * ją pobierają. Kierunek importów pozostaje jednostronny.
 */
let mover = null;

export function registerMover(fn) {
  mover = fn;
}

export function moveObject(state, objectId, toZone, newObjectId, opts = {}) {
  if (typeof mover !== 'function') {
    throw new Error('Choke point zmian stref nie został zarejestrowany (mover.js)');
  }
  return mover(state, objectId, toZone, newObjectId, opts);
}
