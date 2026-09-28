import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// F4/PR140: bot dostaje publiczną zdolność źródła (manaSource), nie kolor karty.
// Pełna produkcyjna materializacja + PlayerView + chooseCommand/trace.
const registry = createCardRegistry();
function put(s, id, cardId, playerId = 'p1', zone = 'battlefield') {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
}
function game() {
  const s = createGameState({ seed: 142, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1'); s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 30; i++) put(s, `lib-${i}`, 'basic-swamp', 'p1', 'library');
  put(s, 'enemy', 'highland-game', 'p2'); addMana(s, 'p1', 14);
  return s;
}
function scoreView(view) {
  const before = structuredClone(view);
  const bot = createHeuristicBot({ seed: 9 }); bot.chooseCommand(view);
  const scores = bot.trace().at(-1).options.filter((o) => o.cmd.startsWith('cast_permanent(bomb'));
  assert.equal(scores.length, 1, 'rzeczywista oferta w śladzie, nie wynik pomocniczej formuły');
  assert.deepEqual(view, before, 'bot nie mutuje widoku');
  return scores[0].score;
}
function viewFor(s, cardId = 'panic-spellbomb') {
  put(s, 'bomb', cardId, 'p1', 'hand');
  return playerView(s, 'p1');
}
function landScore(card, land, { owner = 'p1', tapped = false } = {}) {
  const s = game();
  if (land) {
    put(s, 'land', land, owner);
    if (tapped) s.objects.set('land', Object.freeze({ ...s.objects.get('land'), tapped: true }));
    assert.deepEqual(s.objects.get('land').colors, [], 'prawdziwy basic jest bezbarwny');
  }
  return scoreView(viewFor(s, card));
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≈ ${b}`);

for (const [card, right, wrong] of [
  ['panic-spellbomb', 'basic-mountain', 'basic-forest'],
  ['horizon-spellbomb', 'basic-forest', 'basic-mountain'],
]) {
  test(`PR140/F4: ${card} + rzeczywiste źródło właściwego koloru daje +2.25`, () => {
    const yes = landScore(card, right); const no = landScore(card, wrong);
    close(yes - no, 2.25);
    close(yes, 67.9491); close(no, 65.6991);
  });
}

test('PR140/F4: Descendant of Storms czyta produkowane W, nie kolor Plains', () => {
  close(landScore('descendant-of-storms', 'basic-plains') - landScore('descendant-of-storms', 'basic-forest'), 0.45);
});

test('PR140/F4: brak źródła i źródło przeciwnika nie otwierają mojej bramki', () => {
  const no = landScore('panic-spellbomb', null);
  close(landScore('panic-spellbomb', 'basic-forest'), no);
  close(landScore('panic-spellbomb', 'basic-mountain', { owner: 'p2' }), no);
  close(landScore('panic-spellbomb', 'basic-mountain') - no, 2.25);
});

test('PR140/F4: anty-overfix — tapnięte źródło nadal liczy się w przyszłej anticipacji', () => {
  close(landScore('panic-spellbomb', 'basic-mountain'), landScore('panic-spellbomb', 'basic-mountain', { tapped: true }));
});

test('PR140/F4: kolor karty nie może zastąpić manaSource (fixture widoku)', () => {
  const s = game(); put(s, 'forest', 'basic-forest'); const view = viewFor(s);
  const modified = structuredClone(view);
  modified.zones.battlefield.find((o) => o.id === 'forest').colors = ['R'];
  close(scoreView(view), scoreView(modified), 'produkuje G, choć karta dostała kolor R');
});

function manorView(color) {
  const s = game(); put(s, 'gate', 'manor-gate', 'p1', 'hand');
  const cast = playerView(s, 'p1').legalCommands.find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.ok(cast); assert.equal(execute(s, cast).ok, true);
  const choice = playerView(s, 'p1').legalCommands.find((c) => c.type === 'resolve_color_choice' && c.color === color);
  assert.ok(choice); assert.equal(execute(s, choice).ok, true);
  return viewFor(s);
}
test('PR140/F4: wybrany realną komendą kolor Manor Gate dociera do wyceny', () => {
  const red = manorView('R'); const blue = manorView('U');
  assert.ok(red.zones.battlefield.find((o) => o.cardId === 'manor-gate').manaSource.colors.includes('R'));
  close(scoreView(red) - scoreView(blue), 2.25);
});

test('PR140/F4: dynamiczny Gond Gate korzysta z gotowego manaSource w PlayerView', () => {
  const s = game(); put(s, 'gond', 'gond-gate'); put(s, 'heap', 'heap-gate');
  const view = viewFor(s);
  const gond = view.zones.battlefield.find((o) => o.id === 'gond');
  assert.ok(gond.manaSource.colors.includes('R'), 'stan rozwiązał colorsFrom z drugiej Bramy');
  assert.ok(!view.zones.battlefield.find((o) => o.id === 'heap').manaSource.colors.includes('R'), 'Heap za samo T daje C');
  const withoutResolvedColor = structuredClone(view);
  withoutResolvedColor.zones.battlefield.find((o) => o.id === 'gond').manaSource = { colors: [], amount: 1 };
  close(scoreView(view) - scoreView(withoutResolvedColor), 2.25);
});
