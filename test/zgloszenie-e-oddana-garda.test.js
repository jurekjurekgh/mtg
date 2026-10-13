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
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

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
  const put = (id, controllerId, { p, t, kw = [], tapped = false }) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'creature', types: ['Creature'], subtypes: [],
      abilities: [], keywords: kw, colors: [], power: p, toughness: t, manaCost: 0,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped }));
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

test('E/3: anty-over-fix — bez szans na przeżycie i tak (trample przebija gardę) bot atakuje', () => {
  // CR 509.1h/510.1b: zwykły 5/5 zostałby w całości zatrzymany przez legalny
  // blok 2/2, więc garda BY wystarczała. Przypadek „nie ma czego oddawać"
  // wymaga trample: 5 − lethal 2 = 3 ≥ nasze 2 życia. Nasz atakujący lata
  // (bloker 5/5 go nie zatrzyma), więc atak jest czystą presją i zostaje.
  const { bot, view } = scene({ myLife: 2, enemyLife: 18, mine: [{ p: 2, t: 2, kw: ['flying'] }], theirs: [{ p: 5, t: 5, kw: ['trample'] }] });
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

// --- D (uwaga z gry 2026-10-11): legalny blok i przyszłe uchylenie defendera ---

const CARD_REGISTRY = createCardRegistry();

function realKrotiqScene({ forests = 3, manaLand = 'basic-forest', trample = false } = {}) {
  const state = createGameState({ seed: 71, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.players = state.players.map((p) => ({ ...p, life: p.id === 'p1' ? 3 : 9 }));

  const putReal = (id, cardId, controllerId, overrides = {}) => {
    const def = CARD_REGISTRY.get(cardId);
    assert.ok(def, `brak prawdziwej karty ${cardId}`);
    addObject(state, {
      ...gameObjectDataOf(def),
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
      zone: 'battlefield',
    });
    const current = state.objects.get(id);
    state.objects.set(id, Object.freeze({ ...current, ...overrides }));
  };
  const putBody = (id, power) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test-guard', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', types: ['Creature'], subtypes: [],
      abilities: [], keywords: [], colors: [], power, toughness: 3, manaCost: 0,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  };

  putBody('guard-a', 1);
  putBody('guard-b', 1);
  putBody('guard-c', 2);
  putReal('krotiq', 'krotiq-nestguard', 'p2', {
    tapped: true,
    summoningSickness: false,
    powerModifier: 4,
    toughnessModifier: 4,
    keywords: trample ? ['defender', 'trample'] : ['defender'],
  });
  for (let i = 0; i < forests; i += 1) {
    // Są tapnięte w turze bota, ale odtapną się przed następną turą p2.
    putReal(`mana-land-${i + 1}`, manaLand, 'p2', { tapped: true });
  }
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 3 });
  return { state, view, bot };
}

test('D/1 RED: legalny pojedynczy blok zatrzymuje całe 8 obrażeń bez trample', () => {
  const { bot, view } = scene({
    myLife: 3,
    enemyLife: 9,
    mine: [{ p: 1, t: 3 }, { p: 1, t: 3 }, { p: 2, t: 3 }],
    theirs: [{ p: 8, t: 8, tapped: true }],
  });
  const attackers = declaredAttackers(bot, view);
  assert.equal(attackers.length, 2,
    `bez trample dokładnie jeden legalny bloker chroni 3 życia, więc dwa pozostałe mogą naciskać: ${JSON.stringify(attackers)}`);
});

test('D/2 RED produkcyjny: Krotiq 8/8 + trzy Foresty — bot zostawia legalnego blokera', () => {
  const { state, view, bot } = realKrotiqScene({ forests: 3 });
  const krotiq = view.zones.battlefield.find((o) => o.id === 'krotiq');
  assert.ok(krotiq, 'prawdziwy Krotiq materializuje się przez PlayerView');
  assert.equal(krotiq.power, 8);
  assert.equal(krotiq.toughness, 8);
  assert.equal(krotiq.tapped, true);
  assert.equal(krotiq.cantAttackStatic, true, 'dziś defender nadal ogranicza atak');
  assert.ok((krotiq.activatableAbilities ?? []).some((ability) =>
    [ability.effect].flat().some((effect) => effect?.type === 'attack_as_though_no_defender_until_end_of_turn')),
  'PlayerView publikuje generyczny efekt przyszłej aktywacji');

  const chosen = bot.chooseCommand(view, {});
  assert.equal(chosen?.type, 'declare_attackers', `bot powinien atakować częścią stołu: ${JSON.stringify(chosen)}`);
  assert.equal((chosen.attackerIds ?? []).length, 2,
    `jeden legalny blok zatrzymuje 8/8 bez trample, więc bot ma atakować dwoma i zostawić jednego: ${JSON.stringify(chosen.attackerIds)}`);
  const leftHome = ['guard-a', 'guard-b', 'guard-c'].filter((id) => !(chosen.attackerIds ?? []).includes(id));
  assert.ok(leftHome.length >= 1, 'co najmniej jeden nietapnięty 1/3 lub 2/3 zostaje do legalnego bloku');
  const result = execute(state, chosen);
  assert.equal(result.ok, true, `wybrana decyzja musi być legalną komendą produkcyjną: ${result.reason ?? ''}`);
});

test('D/3 anty-over-fix: dwa Foresty nie opłacają {2}{G}, więc defender nie jest przyszłym atakującym', () => {
  const { bot, view } = realKrotiqScene({ forests: 2 });
  assert.equal(declaredAttackers(bot, view).length, 3,
    'bez pełnej liczby i koloru many scoring nie może udawać legalnej aktywacji Krotiqa');
});

test('D/3b anty-over-fix: trzy Island nie pokrywają zielonego pipa aktywacji Krotiqa', () => {
  const { bot, view } = realKrotiqScene({ forests: 3, manaLand: 'basic-island' });
  assert.equal(declaredAttackers(bot, view).length, 3,
    'sama liczba źródeł nie wystarcza — przyszła płatność musi dopasować {G}');
});

test('D/4 anty-over-fix: ogromne trample przebija całą gardę, więc nie ma czego zachowywać', () => {
  const { bot, view } = scene({
    myLife: 3,
    enemyLife: 9,
    mine: [{ p: 1, t: 3 }, { p: 1, t: 3 }, { p: 2, t: 3 }],
    theirs: [{ p: 20, t: 20, kw: ['trample'], tapped: true }],
  });
  assert.equal(view.zones.battlefield.find((o) => o.id === 'e0')?.tapped, true, 'zagrożenie jest tapnięte w bieżącym ataku');
  const attackers = declaredAttackers(bot, view);
  assert.equal(attackers.length, 3,
    `gdy nawet cała garda nie przeżywa trample, kara nie może zamrażać presji: ${JSON.stringify(bot.trace?.() ?? null)}`);
});
