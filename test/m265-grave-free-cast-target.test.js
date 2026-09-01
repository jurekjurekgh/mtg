// M265 (Żywy Tester, theros vs worek-basni seed 332, detektor `bot`):
//   „Nieprzyjaciel rzuca Sleep of the Dead → cel: Blade-Blizzard Kitsune"
// Sleep of the Dead tapuje cel i blokuje mu odkręcenie — a Blade-Blizzard
// Kitsune to WŁASNY stwór bota, który w tej samej turze miał atakować.
// Bot unieruchomił własnego bijącego, płacąc za to {1}.
//
// Przyczyna (klasa L41 — bliźniacza gałąź bez pinu): rodzina „darmowych
// rzutów" enumeruje ofertę PER ZESTAW CELÓW (epicCastOffers), więc wycena
// MUSI odejmować karę za cel. `resolve_suspend_cast`, `resolve_rebound_cast`
// i `resolve_madness_cast` wołają `freeCastTargetPenalty` (M212/Z7),
// a `resolve_grave_free_cast` (Halo Forager — „cast target instant or
// sorcery from a graveyard without paying its mana cost") jako JEDYNA
// z rodziny zwracała stałą wartość zależną tylko od {X}. Wszystkie zestawy
// celów remisowały i bot brał pierwszy z brzegu — także własnego stwora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Halo Forager: decyzja „rzuć czar z DOWOLNEGO grobu za {X}". */
function graveFreeCastPending({ graveOwner = 'p1' } = {}) {
  const state = createGameState({ seed: 265, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'moj', 'trade-route-envoy', 'p1');
  put(state, 'wrogi', 'trade-route-envoy', 'p2');
  put(state, 'sleep', 'sleep-of-the-dead', graveOwner, 'graveyard');
  addMana(state, 'p1', 5, { colors: ['U', 'B'] });
  state.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager' };
  return state;
}

function botChoice(state, playerId = 'p1') {
  const view = playerView(state, playerId);
  const bot = createHeuristicBot({ playerId, seed: 1 });
  return { chosen: bot.chooseCommand(view), view };
}

test('M265: darmowy rzut z grobu (Halo Forager) tapuje WROGIEGO stwora, nie własnego', () => {
  const state = graveFreeCastPending();
  const { chosen, view } = botChoice(state);
  const oferty = view.legalCommands.filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);
  // Kontrola pozytywna: obie oferty MUSZĄ istnieć, inaczej test zieleniałby
  // z braku wyboru, a nie dzięki wycenie (klasa M255/G2).
  assert.ok(oferty.some((o) => o.targets?.[0] === 'moj'), 'oferta we własnego stwora istnieje');
  assert.ok(oferty.some((o) => o.targets?.[0] === 'wrogi'), 'oferta we wrogiego stwora istnieje');
  assert.equal(chosen.type, 'resolve_grave_free_cast', `bot rozstrzyga tę decyzję, wybrał: ${chosen.type}`);
  assert.equal(chosen.targets?.[0], 'wrogi',
    `bot unieruchamia stwora PRZECIWNIKA, wybrał: ${chosen.targets?.[0]}`);
});

test('M265: czar z grobu PRZECIWNIKA też nie może uderzać we własnego stwora', () => {
  // Halo Forager czyta „a graveyard" — dowolny. Cel wycenia się tak samo.
  const state = graveFreeCastPending({ graveOwner: 'p2' });
  const { chosen } = botChoice(state);
  assert.equal(chosen.targets?.[0], 'wrogi',
    `cel wroga niezależnie od tego, czyj jest grób: ${chosen.targets?.[0]}`);
});

test('M265: wpis GROBU niesie deskryptor czaru (grób jest strefą jawną, CR 400.2)', () => {
  // Druga przyczyna, ta sama co M212/Z7 w wygnaniu: bez `spell` w widoku
  // wycena czyta pustą listę efektów i każdy cel dostaje identyczny wynik.
  const state = graveFreeCastPending();
  const entry = playerView(state, 'p1').zones.graveyard.find((o) => o.id === 'sleep');
  assert.ok(entry, 'karta widoczna w grobie');
  assert.deepEqual(
    (entry.spell?.effects ?? []).map((e) => e.type),
    ['tap_permanent', 'dont_untap_next_untap_step'],
    'deskryptor efektów dostępny z widoku',
  );
  // Grób jest publiczny — przeciwnik widzi to samo.
  const foe = playerView(state, 'p2').zones.graveyard.find((o) => o.id === 'sleep');
  assert.ok(foe?.spell, 'grób jest strefą publiczną dla obu graczy');
});

test('M265: rezygnacja przegrywa z sensownym celem (kara nie może zabić oferty)', () => {
  // Anty-over-fix: kara za własny cel nie może zepchnąć CAŁEJ rodziny poniżej
  // „decline" — inaczej bot przestałby korzystać z Halo Forager.
  const state = graveFreeCastPending();
  const { chosen } = botChoice(state);
  assert.notEqual(chosen.decline, true, 'bot nie rezygnuje, gdy ma legalny wrogi cel');
});
