// Zgłoszenie E (2026-09-20, uwagi z gry): „Bot ma 2 życia i jedną kreaturę
// 2/2 na stole. Ja też mam jedną 2/2, ale mam 18 życia. Bot atakuje,
// przepuszczam, dostaję 2, potem dobijam bota. Nie powinien się odsłaniać
// mając tak mało życia. Scoring do poprawki."
//
// Reguła (crackback / oddana garda): jeśli KEEPING creatures home wystarcza do
// przeżycia następnej tury, a DEKLARACJA ATAKU to przeżycie odbiera (tapnięte
// stwory nie zablokują), to atak zamienia przeżycie w przegraną — kara musi
// przebić premię wyścigu (L3). Wyjątki: atak wygrywający grę (lethal +1000)
// i sytuacja, w której garda i tak nie wystarczała (nie ma czego oddawać).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Plansza: `mine`/`theirs` to listy stworów `{ p, t, kw }` (moc, wytrzymałość,
 * keywordy). Stwory budujemy wprost (wzorzec harnessu walki: `cardId:'x-test'`,
 * staty i keywordy jawne) — scena testuje WYCENĘ przy zadanych statach, a nie
 * staty karty z katalogu.
 */
function scene({ myLife, enemyLife, mine, theirs }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.players = state.players.map((p) => ({ ...p, life: p.id === 'p1' ? myLife : enemyLife }));
  const put = (id, controllerId, { p, t, kw = [] }) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'creature', types: ['Creature'], subtypes: [],
      abilities: [], keywords: kw, colors: [], power: p, toughness: t, manaCost: 0,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };
  mine.forEach((creature, index) => put(`m${index}`, 'p1', creature));
  theirs.forEach((creature, index) => put(`e${index}`, 'p2', creature));
  const bot = createHeuristicBot({ seed: 3 });
  const view = playerView(state, 'p1');
  return { state, bot, view };
}

/** Co bot deklaruje: lista atakujących (pusta = pass / brak ataku). */
function declaredAttackers(bot, view) {
  const chosen = bot.chooseCommand(view, {});
  if (!chosen || chosen.type !== 'declare_attackers') return [];
  return chosen.attackerIds ?? [];
}

test('E/1: 2 życia, oba 2/2 — bot NIE oddaje gardy (zgłoszenie właściciela)', () => {
  const { bot, view } = scene({ myLife: 2, enemyLife: 18, mine: [{ p: 2, t: 2 }], theirs: [{ p: 2, t: 2 }] });
  assert.deepEqual(declaredAttackers(bot, view), [],
    'atak przy 2 życiach wystawia stwora i oddaje jedyną gardę — bot ma zostać w domu');
});

test('E/2: anty-over-fix — atak wygrywający grę TERAZ zostaje (lethal ponad karą)', () => {
  // Przenikająca moc >= życia wroga: atak kończy partię, choćby garda miała
  // zniknąć (wygrana teraz > przeżycie następnej tury).
  const { bot, view } = scene({ myLife: 2, enemyLife: 1, mine: [{ p: 3, t: 3 }], theirs: [{ p: 2, t: 2 }] });
  const attackers = declaredAttackers(bot, view);
  assert.equal(attackers.length, 1, `atak lethalny ma zostać (wybrano ${JSON.stringify(attackers)})`);
});

test('E/2b: anty-over-fix — wróg na 2 życia MUSI blokować i wymienia 1:1 (garda wraca)', () => {
  // Wróg na 2 życia z 2/2: nasz atak bez bloków go zabija, więc musi blokować
  // — po wymianie 2/2↔2/2 nie ma czym wrócić, więc garda NIE jest oddana
  // (bez tej korekty kara blokowałaby atak, który wygrywa partię).
  const { bot, view } = scene({ myLife: 2, enemyLife: 2, mine: [{ p: 2, t: 2 }], theirs: [{ p: 2, t: 2 }] });
  const attackers = declaredAttackers(bot, view);
  assert.equal(attackers.length, 1, `atak wymuszający blok ma zostać (wybrano ${JSON.stringify(attackers)})`);
});

test('E/3: anty-over-fix — bez szans na przeżycie i tak (garda nie wystarcza) bot atakuje', () => {
  // Wróg ma 5/5 przy naszych 2 życiach: garda 2/2 NIE wystarcza nawet przed
  // atakiem (5 − 2 = 3 ≥ 2), więc nie ma czego oddawać. Atakujący lata
  // (bloker 5/5 go nie zatrzyma), więc atak jest czystą presją i zostaje.
  const { bot, view } = scene({ myLife: 2, enemyLife: 18, mine: [{ p: 2, t: 2, kw: ['flying'] }], theirs: [{ p: 5, t: 5 }] });
  const attackers = declaredAttackers(bot, view);
  assert.equal(attackers.length, 1, `atak bez straty gardy ma zostać (wybrano ${JSON.stringify(attackers)})`);
});

test('E/4: anty-over-fix — wysokie życie: atak z wymianą 2/2↔2/2 nadal wchodzi', () => {
  const { bot, view } = scene({ myLife: 18, enemyLife: 18, mine: [{ p: 2, t: 2 }], theirs: [{ p: 2, t: 2 }] });
  const attackers = declaredAttackers(bot, view);
  assert.equal(attackers.length, 1, 'kara nie może zamrozić normalnej presji przy pełnym życiu');
});

test('E/5: garda liczona z blokerów ZOSTAJĄCYCH w domu (dwa stwory, atak jednym)', () => {
  // Dwa 2/2 w domu, wróg ma 2/2: przed atakiem garda 4 wystarcza (2 − 4 < 2),
  // po ataku jednym stworem garda 2 nadal wystarcza (2 − 2 = 0 < 2) — atak
  // jest bezpieczny i ma zostać (dowód, że kara nie jest „zero ataków”).
  const { bot, view } = scene({ myLife: 2, enemyLife: 18, mine: [{ p: 2, t: 2 }, { p: 2, t: 2 }], theirs: [{ p: 2, t: 2 }] });
  const chosen = bot.chooseCommand(view, {});
  assert.equal(chosen?.type, 'declare_attackers', 'jest co atakować i garda zostaje');
  assert.ok((chosen.attackerIds ?? []).length >= 1, 'przy dwóch stworach atak jednym nie oddaje gardy');
});
