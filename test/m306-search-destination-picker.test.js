// AUDYT PR #100 (sesja arena/01a07682, znalezisko A2) — drugi wymiar wyboru.
//
// Silnik dedupuje oferty szukania po KROTCIE `cardId|destination`
// (game-state ~6199), więc szukanie z wieloma destynacjami (Caravan Vigil:
// „search … for a basic land card … Put that card onto the battlefield if a
// creature died this turn, otherwise put it into your hand") daje dla jednej
// karty DWIE różne komendy. `singleTargetPlanOf` zbierał wiersze po samym
// `cmd[field]` (id karty) — drugi wariant znikał z kreatora, a
// `commandForSingleTargetSelection` zwracał PIERWSZĄ komendę pasującą do id,
// czyli zawsze `hand`. Kreator nie umie wyrazić drugiego wymiaru, więc nie ma
// go udawać (L48): przy niespójnej liczbie wariantów wracamy do listy ofert
// silnika, a etykieta wiersza nosi nazwę strefy docelowej (L41 — to samo
// źródło co tytuł modala).
import test from 'node:test';
import assert from 'node:assert/strict';
import { singleTargetPlanOf, commandForSingleTargetSelection } from '../src/table/multi-target.js';
import { commandLabel } from '../src/table/render.js';

const wariant = (found, destination) => ({ type: 'resolve_search_choice', playerId: 'p1', found, destination });
const ODMOWA = { type: 'resolve_search_choice', playerId: 'p1', found: null };

test('A2: kreator nie zwija szukania z dwiema destynacjami tej samej karty', () => {
  const options = [
    wariant('las', 'hand'), wariant('las', 'battlefield'),
    wariant('row', 'hand'), wariant('row', 'battlefield'),
    ODMOWA,
  ];
  assert.equal(singleTargetPlanOf(options), null,
    '4 komendy / 2 kandydatów = kreator zgubiłby połowę wariantów');
  // Anty-over-fix: jedna destynacja to normalny kreator radiowy.
  const pojedynczo = [wariant('las', 'hand'), wariant('row', 'hand'), ODMOWA];
  const plan = singleTargetPlanOf(pojedynczo);
  assert.ok(plan, 'bez drugiego wymiaru kreator zostaje');
  assert.deepEqual(plan.targets, ['las', 'row']);
  assert.equal(plan.singleField, 'found');
  assert.ok(plan.allowNone, 'odmowa pozostaje wierszem');
  const dlaLasu = commandForSingleTargetSelection(pojedynczo, { targetId: 'las', field: 'found' });
  assert.equal(dlaLasu?.destination, 'hand', 'jedyny cel = jedyna komenda');
});

test('A2: etykieta wiersza nazywa destynację, gdy jest ich kilka (L41 — wspólne źródło z tytułem)', () => {
  const session = {
    nameOfObject: (id) => ({ las: 'Forest', row: 'Plains' })[id] ?? id,
    nameOf: (cardId) => cardId,
  };
  const widok = {
    pendingSearchChoice: {
      sourceCardId: 'caravan-vigil', destination: 'hand', destinations: ['hand', 'battlefield'], cards: [],
    },
  };
  const doReki = commandLabel(wariant('las', 'hand'), session, widok);
  const naPole = commandLabel(wariant('las', 'battlefield'), session, widok);
  assert.notEqual(doReki, naPole, `dwa warianty nie mogą brzmieć tak samo: ${doReki}`);
  assert.match(doReki, /do ręki/);
  assert.match(naPole, /na pole bitwy/);
  // Anty-over-fix: przy jednej destynacji nie dokładamy szumu do etykiety.
  const jedna = { pendingSearchChoice: { sourceCardId: 'dawntreader-elk', destination: 'hand', destinations: null, cards: [] } };
  assert.equal(commandLabel(wariant('las', 'hand'), session, jedna), 'Szukanie: Forest');
  assert.equal(commandLabel(ODMOWA, session, widok), 'Szukanie — nie znajduj karty (rezygnuję)');
});
