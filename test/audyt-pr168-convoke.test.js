// Audyt PR #168/A-1 — CR 702.51a–d: tapnięty do zapłaty kosztu stwór
// NIE produkuje many; sam fakt posiadania zdolności many nie wyklucza convoke.
// Convoke płaci ZA manę, więc nie liczy się do manaSpent/kolorów wydanej many.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const cards = createCardRegistry();
function scene({ generic = 0, myrs = 0 } = {}) {
  const state = createGameState({ seed: 168, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.priorityPlayerId = state.turn.activePlayerId = 'p1';
  const addCard = (id, cardId, zone) => {
    const def = cards.get(cardId);
    assert.ok(def, cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
      zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  };
  addCard('kavu', 'kavu-primarch', 'hand'); // {3}{G}, convoke
  addCard('villager', 'scorned-villager', 'battlefield'); // {T}: Add {G}
  for (let i = 0; i < myrs; i += 1) addCard(`myr-${i}`, 'myr-scrapling', 'battlefield');
  if (generic) addMana(state, 'p1', generic, { colors: [] });
  return state;
}
const payments = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'cast_permanent' && c.objectId === 'kavu' && c.convokePayments);
const cast = (convokePayments) => ({ type: 'cast_permanent', playerId: 'p1', objectId: 'kavu', convokePayments });

// Zapis eventu, nie tylko licznik puli: trigger „mana spent to cast" czyta pole manaSpent.
const permanentCast = (result) => result.events.find((event) => event.type === 'permanent_cast');

test('A-1: stwór z {T}: Add {G}, nawet z chorobą przywołania, może convoke G; nie produkuje many', () => {
  const state = scene({ generic: 3 });
  state.objects.set('villager', Object.freeze({ ...state.objects.get('villager'), summoningSickness: true }));
  const option = payments(state).find((c) => c.convokePayments.length === 1
    && c.convokePayments[0].creatureId === 'villager' && c.convokePayments[0].color === 'G');
  assert.ok(option, 'legalCommands pozwalają wybrać nietapniętego stwora z manową zdolnością');
  const before = state.events.length;
  const result = execute(state, option);
  assert.ok(result.ok, `oferta musi przejść walidację: ${result.reason}`);
  assert.equal(state.objects.get('villager').tapped, true);
  assert.equal(permanentCast(result)?.manaSpent, 3, 'tylko trzy jednostki MANy zostały wydane');
  assert.equal(state.lastManaSpend?.amount, 3);
  assert.equal(state.objects.get(permanentCast(result).object.id).manaColorsSpent.includes('G'), false,
    'G zapłacone tapnięciem stwora NIE jest zieloną maną (Adamant)');
  assert.equal(state.events.slice(before).filter((event) => event.type === 'mana_produced' && event.source === 'villager').length, 0,
    'convoking mana creature did not activate its mana ability');
  assert.equal(state.players[0].mana, 0);
});

test('A-1: wybrany do convoke stwór nie jest dostępny także jako źródło reszty many (oferta=odmowa atomowa)', () => {
  const state = scene({ myrs: 2 }); // 3 stwory, koszt 4, żadnego innego źródła
  assert.equal(payments(state).length, 0, 'nie ma wariantu z podwójnym policzeniem Villagera');
  const before = state.events.length;
  const result = execute(state, cast([
    { creatureId: 'villager', color: 'G' },
    { creatureId: 'myr-0', color: 'generic' },
    { creatureId: 'myr-1', color: 'generic' },
  ]));
  assert.equal(result.ok, false, 'ręcznie zadeklarowany brakujący {1} też odrzucony');
  assert.equal(state.objects.get('villager').tapped, false);
  assert.equal(state.objects.get('myr-0').tapped, false);
  assert.equal(state.objects.get('myr-1').tapped, false);
  assert.equal(state.players[0].mana, 0);
  assert.equal(state.events.length, before, 'odmowa nie zmieniła zdarzeń');
});

test('A-1: konwokujące źródło G nie może opłacić jednocześnie pozostawionego pipa G', () => {
  const state = scene({ generic: 2, myrs: 1 });
  assert.equal(payments(state).some((c) => c.convokePayments.length === 2
    && c.convokePayments.some((p) => p.creatureId === 'villager' && p.color === 'generic')), false,
  'żadna oferta nie liczy Villagera jako źródła zielonej many po jego convoke na generic');
  const before = state.events.length;
  const result = execute(state, cast([
    { creatureId: 'villager', color: 'generic' },
    { creatureId: 'myr-0', color: 'generic' },
  ]));
  assert.equal(result.ok, false);
  assert.equal(state.events.length, before, 'przed tapnięciem sprawdzamy też pozostałe pipy');
  assert.equal(state.players[0].mana, 2);
  assert.equal(state.objects.get('villager').tapped, false);
  assert.equal(state.objects.get('myr-0').tapped, false);
});

test('A-1 anty-over-fix: stwór z mana ability może zapłacić MANA, gdy inni konwokują', () => {
  const state = scene({ myrs: 3 });
  const option = payments(state).find((c) => c.convokePayments.length === 3
    && c.convokePayments.every((p) => p.creatureId.startsWith('myr-')));
  assert.ok(option, 'trzy Myry convoke, Villager jest źródłem zielonej many');
  const result = execute(state, option);
  assert.ok(result.ok, `oferta musi przejść: ${result.reason}`);
  assert.equal(state.objects.get('villager').tapped, true);
  assert.equal(permanentCast(result)?.manaSpent, 1, 'tylko zielona mana Villagera opłaca czar');
  assert.ok(state.events.some((e) => e.type === 'mana_produced' && e.source === 'villager'));
  assert.deepEqual(state.objects.get(permanentCast(result).object.id).manaColorsSpent, ['G']);
});

test('A-1: cztery stwory płacą pełne {3}{G}; manaSpent=0 i brak sztucznej many', () => {
  const state = scene({ myrs: 3 });
  state.objects.set('villager', Object.freeze({ ...state.objects.get('villager'), summoningSickness: true }));
  const option = payments(state).find((c) => c.convokePayments.length === 4
    && c.convokePayments.some((p) => p.creatureId === 'villager' && p.color === 'G'));
  assert.ok(option, 'gdy Villager nie może wyprodukować many, UI oferuje pełne convoke');
  const before = state.events.length;
  const result = execute(state, option);
  assert.ok(result.ok, `opcja legalna także dla summon sick stwora: ${result.reason}`);
  assert.equal(permanentCast(result)?.manaSpent, 0);
  assert.deepEqual(state.objects.get(permanentCast(result).object.id).manaColorsSpent, []);
  assert.equal(state.lastManaSpend?.amount, 0);
  assert.equal(state.events.slice(before).some((e) => e.type === 'mana_produced'), false,
    'convoke nie jest zdolnością many');
  assert.equal(state.players[0].mana, 0);
});
