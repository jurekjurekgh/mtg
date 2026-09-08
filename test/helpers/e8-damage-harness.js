// Harness E8: domyślny przydział obrażeń przez nieeksportowany helper combat.js
// (defaultDamageAssignment) — reprodukujemy jego logikę wywołaniem przez
// publiczną powierzchnię? Nie: test pinuje BEHAWIOR, więc wołamy eksport
// pomocniczy dodany w combat.js (export defaultDamageAssignmentFor).
import { defaultDamageAssignmentFor } from '../../src/engine/combat.js';
export { defaultDamageAssignmentFor };
