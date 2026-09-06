// AUDYT PR #100 (sesja arena/01a07682, znalezisko A8 z pętli jakości).
//
// `case 'resolve_springbloom'` brzmiał: `finish(cmd.sacrificeLandId != null ? 40 : 10)`
// — czyli KAŻDY ląd na liście kandydatów dostawał tyle samo. Bot poświęcał
// pierwszego z listy silnika, podczas gdy różnica między kandydatami jest
// mierzalna: jeden ląd jest jedynym źródłem koloru, którego żąda ręka, inny ma
// zdolność poza manową. Zmierzono na 24 partiach: 2 remisy `rozróznialne`
// (`worek-legend|wiedzmin` s4025 tura 10 — trzy lądy po 40 pkt;
// `tarkir-wur|wiedzmin` s4010 tura 9 — dwa lasy i permanent z zdolnością też
// po 40). To ta sama klasa co L132, tylko bez wymówki „widok nie niesie danych":
// lądy są na polu bitwy, czyli JAWNE.
//
// Naprawa: `landLossValue` liczy stratę na tych samych faktach i tą samą
// arytmetyką co wybór lądu do grania (`landAnaliza`/`landPlayDelta`) — kolory z
// `getSourceForObject` (jak w silniku), zapotrzebowanie z `coloredPipsOf`,
// zdolność poza manową z definicji karty. Projekcja remisów nosi TE SAME fakty
// (wcześniej tożsamość lądu: każda para różnych lądów była „różnymi danymi",
// czyli alarm bez informacji).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';

function stółDecyzja() {
  const state = createGameState({ seed: 43, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const lad = (id, cardId, types, subtypes) => addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'land', types, subtypes, colors: [], manaCost: 0, abilities: [], keywords: [],
  });
  lad('las', 'basic-forest', ['Basic', 'Land'], ['Forest']);
  lad('sanc', 'mystic-sanctuary', ['Land'], ['Island']);
  addObject(state, {
    id: 'druid', instanceId: 'i-druid', cardId: 'springbloom-druid', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', types: ['Creature'], subtypes: ['Druid'], colors: ['G'],
    manaCost: 3, power: 1, toughness: 2, abilities: [], keywords: [],
  });
  // Karta w ręce wymagająca {U}: jedynym źródłem niebieskiej many jest `sanc`.
  addObject(state, {
    id: 'reka', instanceId: 'i-reka', cardId: 'willbender', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'creature', types: ['Creature'], subtypes: ['Human', 'Wizard'], colors: ['U'],
    manaCost: 2, power: 1, toughness: 3, abilities: [], keywords: [],
  });
  state.pendingSpringbloom = {
    controllerId: 'p1', sourceId: 'druid', cardId: 'springbloom-druid',
    landIds: ['las', 'sanc'], mandatory: false, restorePriorityTo: 'p1',
  };
  return state;
}

test('A8: SanityCheck — lądy w widoku niosą kolory (bez tego test mierzyłby harness)', () => {
  const view = playerView(stółDecyzja(), 'p1');
  const sanc = view.zones.battlefield.find((o) => o.id === 'sanc');
  assert.ok(sanc, 'ląd widoczny na polu bitwy');
  assert.deepEqual(getSourceForObject(sanc, null)?.colors ?? [], ['U'],
    'Mystic Sanctuary daje {U} tym samym rozwiązaniem co silnik');
});

test('A8: poświęcamy ląd, którego strata nic nie kosztuje, nie jedyny kolor ręki', () => {
  const state = stółDecyzja();
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd.type, 'resolve_springbloom', 'decyzja o poświęceniu lądu');
  const wpis = bot.trace().at(-1);
  const warianty = wpis.options.filter((o) => o.cmd.includes('resolve_springbloom(') && !o.cmd.includes('(skip)'));
  assert.equal(warianty.length, 2, 'dwaj kandydaci');
  assert.notEqual(warianty[0].score, warianty[1].score,
    `wyceny muszą się różnić, było: ${warianty.map((o) => `${o.cmd}=${o.score}`).join(', ')}`);
  assert.equal(cmd.sacrificeLandId, 'las',
    'Forest do wyrzucenia; Mystic Sanctuary jest jedynym źródłem {U} dla ręki');
});

test('A8 (anty-over-fix): brak danych o landzie nie dodaje kary i nie blokuje decyzji', () => {
  const state = stółDecyzja();
  // Kandydat, którego już nie ma na stole (np. zniknął w międzyczasie) —
  // wycena ma wrócić do bazowych 40 pkt, a nie ujemną karę czy wyjątek.
  state.pendingSpringbloom.landIds = ['las', 'duch'];
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(view);
  assert.equal(cmd.type, 'resolve_springbloom');
  const wpis = bot.trace().at(-1);
  const dlaDucha = wpis.options.find((o) => o.cmd.includes('(duch'));
  assert.equal(dlaDucha?.score, 40, 'nieznany obiekt = zero straty, bez fantomowej kary');
});
