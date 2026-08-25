// M203 — Halo Forager (MOM): „you may pay {X}. When you do, you may cast
// target instant or sorcery card WITH MANA VALUE X from a graveyard WITHOUT
// PAYING ITS MANA COST."
//
// Stan przed fixem (zmierzony w audycie PR #74, N-NEW-1):
//   • rzut „bez kosztu many" KOSZTOWAŁ manę — silnik pobierał MV karty
//     (3 many → 2 po rzucie karty MV 1), czyli złamanie CR 118.5/118.9a,
//     które własny test repo (m201-u2-…) stosuje dla Epic/suspend/rebound;
//   • X w ogóle nie było sprawdzane — oferta istniała dla KAŻDEJ karty
//     o MV ≤ budżet, więc gracz „płacąc {X}" mógł rzucić kartę o MV ≠ X.
//
// Reguły wdrożone tutaj (po deskryptorach, ADR 0002):
//   • X jest WYBOREM gracza i musi równać się MV rzucanej karty (druk);
//   • zapłata {X} to jedyna mana wydana przy tym rzucie — koszt many czaru
//     wynosi {0} (CR 118.9a), a koszty dodatkowe pozostają płatne (M201/U2);
//   • zapłata {X} za czar NIE-artefaktowy nie może być pokryta maną
//     ograniczoną drukiem (Powerstone: „can't be spent to cast a nonartifact
//     spell") — cel wydania niesie rzucana karta (M202/N1, L59).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

/** Stan z decyzją darmowego rzutu z grobu (efekt `pay_x_cast_from_graveyard`). */
function foragerState({ grave = [], mana = 0, restrictedMana = 0, controller = 'p1' } = {}) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  grave.forEach((cardId, i) => put(state, `g${i}`, cardId, controller, 'graveyard'));
  if (mana > 0) addMana(state, 'p1', mana, { colors: [] });
  if (restrictedMana > 0) addMana(state, 'p1', restrictedMana, { colors: [], spendOnly: 'artifact' });
  // jak w effects.js: decyzja należy do kontrolera źródła
  state.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager', restorePriorityTo: 'p1' };
  state.turn.priorityPlayerId = 'p1';
  return state;
}

const offersOf = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);

test('M203/A: X = MV karty, a rzut NIE pobiera kosztu many czaru (CR 118.9a)', () => {
  // Caravan Vigil MV 1, Raise the Alarm MV 2 — obie bez celów w spec.
  const state = foragerState({ grave: ['caravan-vigil', 'raise-the-alarm'], mana: 3 });
  const offers = offersOf(state);
  const byCard = new Map(offers.map((c) => [c.cardId, c]));
  assert.equal(byCard.get('caravan-vigil')?.xValue, 1, 'X = MV karty (Caravan Vigil)');
  assert.equal(byCard.get('raise-the-alarm')?.xValue, 2, 'X = MV karty (Raise the Alarm)');

  const before = state.players[0].mana;
  assert.equal(execute(state, byCard.get('caravan-vigil')).ok, true, 'oferta jest wykonalna (L48)');
  assert.equal(state.players[0].mana, before - 1,
    'pobrana mana = X (1), a nie koszt many czaru „bez kosztu many"');
  assert.ok([...state.objects.values()].some((o) => o.zone === 'stack' && o.cardId === 'caravan-vigil'),
    'czar jest na stosie');
});

test('M203/B: karty o MV większym niż budżet NIE mają oferty (X musi być opłacalne)', () => {
  const state = foragerState({ grave: ['raise-the-alarm'], mana: 1 });
  assert.deepEqual(offersOf(state), [], 'MV 2 przy 1 manie: brak oferty (oferta = walidacja, L48)');
});

test('M203/C: X różne od MV karty jest odrzucane (druk: „with mana value X")', () => {
  const state = foragerState({ grave: ['caravan-vigil'], mana: 5 });
  const offer = offersOf(state)[0];
  assert.ok(offer, 'poprawna oferta istnieje');
  const bogus = { ...offer, xValue: 3 };
  const res = execute(state, bogus);
  assert.equal(res.ok, false, 'X = 3 przy karcie MV 1 musi być odrzucone');
  // Powód jest w zdarzeniu `command_rejected` (konwencja `reject()` w silniku).
  const reason = res.events?.find((e) => e.type === 'command_rejected')?.reason;
  assert.equal(reason, 'illegal_grave_free_cast_x', 'maszynowo rozpoznawalny powód');
});

test('M203/D: rezygnacja („you may") pozostaje dostępna i nic nie kosztuje', () => {
  const state = foragerState({ grave: ['caravan-vigil'], mana: 3 });
  const decline = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_grave_free_cast' && c.decline);
  assert.ok(decline, 'rezygnacja jest w ofercie (CR 608.2b / „you may")');
  assert.equal(execute(state, decline).ok, true);
  assert.equal(state.players[0].mana, 3, 'rezygnacja nie pobiera many');
});

test('M203/E: mana ograniczona drukiem NIE płaci {X} za czar nie-artefaktowy (M202/N1)', () => {
  // Powerstone: „This mana can't be spent to cast a nonartifact spell".
  // Jedyna mana gracza jest ograniczona — brak oferty i odrzucona komenda.
  const state = foragerState({ grave: ['caravan-vigil'], restrictedMana: 1 });
  assert.deepEqual(offersOf(state), [], 'brak oferty przy manie ograniczonej i czarze nie-artefaktowym');
  const forced = {
    type: 'resolve_grave_free_cast', playerId: 'p1',
    objectId: 'g0', cardId: 'caravan-vigil', xValue: 1, targets: [],
  };
  const res = execute(state, forced);
  assert.equal(res.ok, false, 'walidacja odrzuca płatność maną ograniczoną');
  assert.equal(state.players[0].mana, 1, 'mana nie została wydana');
});

test('M203/F: karta z kosztem dodatkowym pozostaje poza zakresem (M201/U2)', () => {
  // Bone Splinters: „As an additional cost to cast this spell, sacrifice
  // a creature." Ścieżka Halo Foragera w danych karty takich nie oferuje.
  const state = foragerState({ grave: ['bone-splinters'], mana: 5, creatures: 1 });
  const offers = offersOf(state);
  assert.equal(offers.some((c) => c.cardId === 'bone-splinters'), false,
    'karta z kosztem dodatkowym nie jest oferowana w tej ścieżce (zakres karty)');
});

test('M203/G: anty-over-fix — zwykły rzut z ręki nadal kosztuje manę', () => {
  // Gdyby fix „zdjął koszt" globalnie, ten test czerwienieje.
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  put(state, 'hand1', 'caravan-vigil', 'p1', 'hand');
  // Kolorowa pula many (ADR 0015): {G} musi mieć źródło, więc land, nie sama pula.
  put(state, 'for1', 'basic-forest', 'p1', 'battlefield');
  put(state, 'for2', 'basic-forest', 'p1', 'battlefield');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'hand1');
  assert.ok(cast, 'zwykły rzut z ręki jest oferowany');
  assert.equal(execute(state, cast).ok, true);
  // Płatność widać po tapnięciu źródła (pula jest buforem, nie miarą kosztu).
  const tapped = ['for1', 'for2'].filter((id) => state.objects.get(id).tapped);
  assert.equal(tapped.length, 1, 'rzut z ręki płaci koszt many — jedno źródło {G} tapnięte');
});
