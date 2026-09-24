// M429 — TAKTYCZNA wycena kart batcha 59 (zlecenie właściciela 2026-09-24e).
//
// Zlecenie (cytat): „Nie chodzi o sprzeczność z CR — tego pilnuje engine.
// Chodzi o OPTYMALNE TAKTYCZNIE wykorzystanie tych czarów, czyli takie
// strojenie scoringu, żeby nie korzystał z tych czarów wtedy gdy ma to mały
// sens i korzystał wtedy gdy ma największy uzysk taktyczny. (…) Weź przykład
// z innych podobnych kart o podobnych efektach."
//
// ETAP A1 — „licznik na wskazanym celu" (P1 `token_mutagen`). Pomiar PRZED
// (deterministyczny, 6 seedów na talii `decks/audyt-batch59.txt`): 14/14/14 dla
// tokena 1/1, Cryptida 2/3 i Hill Gianta 4/4 — bot brał PIERWSZĄ ofertę, czyli
// najsłabsze ciało (klasa L50). Precedensy w kodzie: gospodarz aury (M257 r4 —
// „opłaca się tym bardziej, im większy gospodarz"), kryterium zmiany wyniku
// walki (M218/2), skazany permanent (M236/2). Reguły po deskryptorach
// z PlayerView — zero nazw kart (ADR 0002).
// (Etapy A2 — wtasowanie z grobu, A3 — masowy pump — dopisują tu swoje piny.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();

function game(step = 'main1', activePlayerId = 'p1', priorityPlayerId = activePlayerId) {
  const state = createGameState({ seed: 429, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, priorityPlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = priorityPlayerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function lands(state, n, controllerId = 'p1', cardId = 'basic-plains') {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `land-${i}`, instanceId: `i-land-${i}`, cardId, controllerId, ownerId: controllerId,
      zone: 'library', kind: 'land', types: ['Basic', 'Land'],
    });
  }
}

/** Decyzja bota + mapa wyników wariantów (po etykiecie komendy). */
function decide(state, { playerId = 'p1', params } = {}) {
  const bot = createHeuristicBot({ seed: 429, params });
  const cmd = bot.chooseCommand(playerView(state, playerId), {});
  const entry = bot.trace().at(-1);
  const scores = {};
  for (const o of entry?.options ?? []) {
    if (!o) continue;
    scores[o.cmd] = o.score;
  }
  return { cmd, entry, scores };
}

const label = (cmd) => cmd
  ? `${cmd.type}(${cmd.objectId ?? ''}${cmd.targets ? `->${cmd.targets.join('+')}` : ''})`
  : 'brak';

// =====================================================================
// P1 — Mutagen (Batch 59): licznik na najlepszym gospodarzu
// =====================================================================

test('M429 params: rodziny taktyczne są WŁĄCZONE (zlecenie: przemysłane wartości)', () => {
  // Licznik na wskazanym celu (P1).
  assert.equal(DEFAULT_HEURISTIC_PARAMS.counterBase, 2);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.counterAmountWeight, 4);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.counterHostWorthWeight, 2);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.counterCombatBonus, 12);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.counterDoomedHostPenalty, 20);
});

test('M429/T1: karta z efektem licznika dostaje deskryptor `counter` (tuner)', async () => {
  // Rodzina dopięta pod deskryptor, żeby `tools/tune-card.mjs` umiał stroić
  // karty z tym efektem (T1: jedna rodzina = jedna ścieżka tunera).
  const { cardDescriptors, paramsForDescriptors } = await import('../tools/tune-card.mjs');
  const mutagen = REGISTRY.get('token_mutagen');
  assert.ok(cardDescriptors(mutagen).includes('counter'), 'token Mutagen ma deskryptor counter');
  assert.ok(cardDescriptors(REGISTRY.get('courage-in-crisis')).includes('counter'),
    'czar z add_counter też (treść czaru, nie tylko zdolność)');
  const { keys } = paramsForDescriptors(['counter']);
  assert.deepEqual(keys.sort(), [
    'counterAmountWeight', 'counterBase', 'counterCombatBonus',
    'counterDoomedHostPenalty', 'counterHostWorthWeight',
  ]);
});

test('M429/Mutagen (P1): licznik idzie na ciało o największej WARTOŚCI BOJOWEJ', () => {
  // Pomiar PRZED: 14/14/14 (token 1/1, Cryptid 2/3, Hill Giant 4/4) — bot brał
  // pierwszą ofertę, czyli token. Po zmianie gospodarz jest różnicowany wagą
  // wartości (precedens aury: moc×2 + wytrzymałość), więc wygrywa realne ciało.
  const state = game();
  put(state, 'tok', 'token_mutagen', 'p1', 'battlefield', { kind: 'artifact' });
  put(state, 'small', 'token_human', 'p1');
  put(state, 'crypt', 'slithering-cryptid', 'p1');
  put(state, 'big', 'hill-giant', 'p1');
  addMana(state, 'p1', 6, { colors: ['G'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'activate_ability');
  assert.deepEqual(cmd.targets, ['big'], `cel = największe ciało, wybrano ${label(cmd)}`);
  assert.ok(scores['activate_ability(tok#0->big)'] > scores['activate_ability(tok#0->small)'],
    'wariant 4/4 bije token 1/1');
  assert.ok(scores['activate_ability(tok#0->crypt)'] > scores['activate_ability(tok#0->small)'],
    'wariant 2/3 bije token 1/1');
});

test('M429/Mutagen (P1) anty-over-fix: gospodarz-wzorzec (1/1) wart DOKŁADNIE dawną stałą', () => {
  // Dawna stała rodziny to 8 + 4·amount; nowa baza (2) + waga gospodarza (2)
  // × worth(1/1)=3 odtwarza ją co do punktu, więc NAJSŁABSZY gospodarz nie
  // stracił na wartości (kontrakt B6 T0 dla przypadku z obserwacji).
  const state = game();
  put(state, 'tok', 'token_mutagen', 'p1', 'battlefield', { kind: 'artifact' });
  put(state, 'small', 'token_human', 'p1');
  addMana(state, 'p1', 6, { colors: ['G'] });
  const { cmd, entry } = decide(state);
  assert.equal(cmd.type, 'activate_ability');
  assert.deepEqual(cmd.targets, ['small']);
  assert.equal(entry.score, 14, 'baza zdolności 2 + licznik 12 = dawna wycena');
});

test('M429/Mutagen (P1): pokrętła realnie sterują wyceną (nie są atrapami)', () => {
  // Zerowanie nowej wagi wraca do zachowania sprzed zmiany: remis i pierwsza
  // oferta (token 1/1).
  const state = game();
  put(state, 'tok', 'token_mutagen', 'p1', 'battlefield', { kind: 'artifact' });
  put(state, 'small', 'token_human', 'p1');
  put(state, 'big', 'hill-giant', 'p1');
  addMana(state, 'p1', 6, { colors: ['G'] });
  const { cmd, scores } = decide(state, {
    params: { counterHostWorthWeight: 0, counterCombatBonus: 0, counterDoomedHostPenalty: 0 },
  });
  assert.equal(scores['activate_ability(tok#0->small)'], scores['activate_ability(tok#0->big)']);
  assert.deepEqual(cmd.targets, ['small'], 'z zerową wagą wraca remis → pierwsza oferta');
});

// =====================================================================
// P1 cd. — liczniki z AKTYWOWANEJ zdolności instant (Cenn's Tactician):
// okno walki i gospodarz skazany. Dla Mutagenu (timing sorcery) te dwa
// terminy są niewidoczne — silnik nie oferuje aktywacji przy niepustym
// stosie ani poza własną fazą główną — ale to ta sama gałąź kodu (L41).
// =====================================================================

test('M429/licznik instant: walka rozstrzygana TERAZ bije większe bezczynne ciało', () => {
  // Tura przeciwnika, krok deklaracji bloków: mój 2/2 (Soldier) blokuje 3/3 —
  // +1/+1 zabija blokera (wynik walki się POPRAWIA, M218/2), więc licznik ma
  // największy uzysk właśnie tam, mimo że bezczynny 3/3 jest większy.
  const state = game('declare_blockers', 'p2', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1');
  put(state, 'mine', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 2, toughness: 2 });
  put(state, 'idle', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 3, toughness: 3 });
  put(state, 'foe', 'hill-giant', 'p2', 'battlefield', { power: 3, toughness: 3 });
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['foe'], blockers: new Map([['foe', ['mine']]]),
  };
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  const walczacy = scores['activate_ability(tac#1->mine)'];
  const bezczynny = scores['activate_ability(tac#1->idle)'];
  assert.ok(walczacy > bezczynny,
    `walczący (${walczacy}) > bezczynny (${bezczynny}) — premia za poprawę wyniku walki`);
  assert.equal(cmd.type, 'activate_ability');
  assert.deepEqual(cmd.targets, ['mine'], `licznik na walczącym, wybrano ${label(cmd)}`);
});

test('M429/licznik instant: gospodarz SKAZANY w tej turze nie dostaje licznika', () => {
  // Mój 2/2 blokuje 10/10: ginie i +1/+1 tego nie zmienia (brak poprawy wyniku),
  // a permanent ginie z licznikiem (M236/2) — licznik idzie na bezczynne ciało.
  const state = game('declare_blockers', 'p2', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1');
  put(state, 'mine', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 2, toughness: 2 });
  put(state, 'idle', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 3, toughness: 3 });
  put(state, 'foe', 'hill-giant', 'p2', 'battlefield', { power: 10, toughness: 10 });
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['foe'], blockers: new Map([['foe', ['mine']]]),
  };
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  assert.ok(scores['activate_ability(tac#1->idle)'] > scores['activate_ability(tac#1->mine)'],
    'kara za skazanego gospodarza przebija różnicę wartości ciał');
  assert.deepEqual(cmd.targets, ['idle'], `omija skazanego, wybrano ${label(cmd)}`);
});

test('M429/licznik instant: JEDYNY gospodarz skazany → licznik w ogóle nie idzie', () => {
  // Źródło bez własnej zdolności-celu (Reinforce z ręki celuje w „creature"),
  // więc jedynym legalnym gospodarzem jest skazany bloker 2/2 — licznik ginie
  // razem z nim, więc aktywacja musi zejść pod pass (L3: kara > baza).
  const state = game('declare_blockers', 'p2', 'p1');
  put(state, 'rein', 'mosquito-guard', 'p1', 'hand');
  put(state, 'mine', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 2, toughness: 2 });
  put(state, 'foe', 'hill-giant', 'p2', 'battlefield', { power: 10, toughness: 10 });
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['foe'], blockers: new Map([['foe', ['mine']]]),
  };
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  const jedyny = scores['activate_ability(rein#0->mine)'];
  assert.ok(jedyny != null, 'silnik oferuje aktywację na skazanym blokerze');
  assert.ok(jedyny < 0, `aktywacja schodzi pod pass (${jedyny})`);
  assert.notEqual(cmd.type, 'activate_ability');
});

// =====================================================================
// P2 — Memory's Journey (Batch 59): wtasowanie kart z grobu do biblioteki
// =====================================================================

test('M429/T1: karta z wtasowaniem grobu dostaje deskryptor `graveyardShuffle`', async () => {
  const { cardDescriptors, paramsForDescriptors } = await import('../tools/tune-card.mjs');
  const journey = REGISTRY.get('memory-s-journey');
  assert.ok(cardDescriptors(journey).includes('graveyardShuffle'), 'Memory\'s Journey ma deskryptor');
  assert.deepEqual(paramsForDescriptors(['graveyardShuffle']).keys.sort(), [
    'graveyardShuffleBase', 'graveyardShuffleCardValue', 'graveyardShuffleEmptyPenalty',
    'graveyardShuffleNoPressurePenalty', 'graveyardShuffleRescueWeight',
  ]);
});

test("M429/Memory's Journey (P2): zdrowa biblioteka → bot TRZYMA kartę (pass)", () => {
  // Pomiar PRZED: 58 pkt przy 30 kartach w bibliotece (bez żadnej presji).
  // Rzut w zdrową bibliotekę to strata karty (3 karty wracają do biblioteki,
  // nie do ręki) — instant czeka na realne zagrożenie (wzorzec M235).
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1', 'hand');
  lands(state, 30);
  put(state, 'gy0', 'hill-giant', 'p1', 'graveyard');
  put(state, 'gy1', 'razorfoot-griffin', 'p1', 'graveyard');
  put(state, 'gy2', 'trestle-troll', 'p1', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['U'] });
  const { cmd, scores } = decide(state);
  assert.notEqual(cmd.type, 'cast_spell', `bot nie marnuje karty: ${label(cmd)}`);
  assert.ok(scores['cast_spell(mj->p1+gy0+gy1+gy2)'] < 0, 'wariant z 3 kartami schodzi pod pass');
});

test("M429/Memory's Journey (P2): presja deck-outu → rzut ratujący bibliotekę", () => {
  // Ta sama ręka i grób, ale biblioteka pod progiem bezpieczeństwa (~20 kart,
  // `librarySafeMargin`): każda wracająca karta to dodatkowa tura życia.
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1', 'hand');
  lands(state, 12);
  put(state, 'gy0', 'hill-giant', 'p1', 'graveyard');
  put(state, 'gy1', 'razorfoot-griffin', 'p1', 'graveyard');
  put(state, 'gy2', 'trestle-troll', 'p1', 'graveyard');
  addMana(state, 'p1', 3, { colors: ['U'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'cast_spell', `oczekiwano rzutu, wybrano ${label(cmd)}`);
  assert.deepEqual(cmd.targets.slice(0, 1), ['p1']);
  assert.equal(cmd.targets.filter((t) => t != null).length, 4, 'cel-gracz + 3 karty z grobu');
  assert.ok(scores['cast_spell(mj->p1+gy0+gy1+gy2)'] > scores['cast_spell(mj->p1+++)'],
    'ratunek (3 karty) bije wariant bez kart');
});

test("M429/Memory's Journey (P2): zero wracających kart → jałowy efekt pod passem", () => {
  // Wariant „target player + 0 kart" zmienia tylko kolejność biblioteki —
  // żadnego zasobu, więc karta jest wyrzucona (L3/M146: kara przebija bazę).
  const state = game();
  put(state, 'mj', 'memory-s-journey', 'p1', 'hand');
  lands(state, 12);
  addMana(state, 'p1', 3, { colors: ['U'] });
  const { cmd, scores } = decide(state);
  const zero = scores['cast_spell(mj->p1+++)'];
  assert.ok(zero != null, 'silnik oferuje wariant bez kart');
  assert.ok(zero < 0, `wariant bez kart poniżej passu (${zero})`);
  assert.notEqual(cmd.type, 'cast_spell');
});
