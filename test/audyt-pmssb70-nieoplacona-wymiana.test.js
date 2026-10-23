// =============================================================================
// PMSSB-70 — nieopłacona wymiana w deklaracji ataku (remis s4011 t26).
//
// Plan: docs/plans/PLAN_2026-10-20d-pmssb70-nieoplacona-wymiana.md
//
// Problem: wycena ataku sumuje wartości per atakujący, a każdy z nich zakłada
// zabicie TEGO SAMEGO blokera. Gdy trzech atakujących „przeżyje i zabija”
// jedynego blokera, czwarty atakujący w gałęzi wymiany (`power − 1`) dokładał
// 0 — nie zabijał nikogo nowego, a ginął. Remis ex aequo: bot wybierał wariant
// z tym stworem (B) zamiast bez niego (A). Właściciel: wybór B jest bez sensu.
//
// Reguła: wymiana PONAD wolne sloty (blokery − przeżyjące zabójstwa) jest
// nieopłacona i dostaje `−P.unpaidTradeLoss` zamiast swojej wartości.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/** Ciało bez karty katalogu (P/T + kontrola) — wzorzec z PMSSB-33. */
function cialo(state, id, power, toughness, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function atak(ciala, blokerzy, zyciePrzeciwnika = 20) {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const [id, p, t] of ciala) cialo(state, id, p, t, 'p1');
  for (const [id, p, t] of blokerzy) cialo(state, id, p, t, 'p2');
  state.players.find((pl) => pl.id === 'p2').life = zyciePrzeciwnika;
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Wybór bota + oferty po zbiorze atakujących (kolejność etykiety bez znaczenia). */
function opcje(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 7, params });
  const wybrany = bot.chooseCommand(playerView(state, 'p1'), {});
  const wszystkie = bot.trace().at(-1)?.options ?? [];
  const zbior = (label) => label.replace(/^attack\[|\]$/g, '').split(',').filter(Boolean).sort().join(',');
  return {
    wybrany,
    wynik: (ids) => {
      const want = [...ids].sort().join(',');
      const o = wszystkie.find((x) => x.cmd.startsWith('attack[') && zbior(x.cmd) === want);
      assert.ok(o, `brak opcji attack[${want}] w: ${wszystkie.map((x) => x.cmd).join(' | ')}`);
      return o.score;
    },
  };
}

// Pozycja s4011 w minimalnej postaci: trzech atakujących przeżywa i zabija
// blokera (2/2, 1/4, 1/4), czwarty 1/1 (token) idzie w wymianę.
//
// B (2026-10-22, poprawka „bloker bierze tylko jednego"): pierwotna pozycja
// miała JEDNEGO blokera 1/1 przy czterech atakujących i 4 życiach wroga.
// Przy jednym blokerze trzy atakujące przechodzą w twarz (CR 509.1a), więc
// token NIE jest „wymianą ponad wolne sloty" — wchodzi za 1 obrażenie i
// przeżywa. Dodanie go jest realnie zyskowane, co właściciel wprost opisał:
// „im więcej kreatur atakuje, tym więcej przechodzi".
//
// Żeby zbadać NAPRAWDĘ nieopłaconą wymianę, scena dostaje cztery blokery 2/2
// przy trzech DUŻYCH atakujących 4/4: trzech przeżywa i zabija trzech blokerów,
// a czwarty token 1/1 zostaje zablokowany i ginie bez zysku. Zmierzone:
// A = 21, B = 12 — token płaci karę, bot wybiera A. Sam mechanizm nietknięty.
//
// KONTROLA tej samej reguły przy TRZECH blokerach (zmierzono: A = 21, B = 25):
// czwarty atakujący przechodzi w twarz, bo blokerów już nie starcza (CR 509.1a),
// więc token ZARABIA i wariant B wygrywa. To jest dokładnie zgłoszenie
// właściciela z 2026-10-22: „im więcej kreatur atakuje, tym więcej przechodzi”.
const S4011 = () => atak(
  [['mine81', 4, 4], ['mine91', 4, 4], ['mine108', 4, 4], ['tok', 1, 1]],
  [['f1', 2, 2], ['f2', 2, 2], ['f3', 2, 2], ['f4', 2, 2]],
  20,
);

test('PMSSB-70/A (RED): s4011 — bot wybiera A (bez stwora w wymianie), nie B', () => {
  const o = opcje(S4011());
  const cmd = o.wybrany;
  assert.equal(cmd.type, 'declare_attackers');
  const wybrani = [...(cmd.attackerIds ?? [])].sort().join(',');
  assert.equal(wybrani, 'mine108,mine81,mine91'.split(',').sort().join(','),
    `bot wybrał ${wybrani}; wariant z tokenem (B) nic nie daje — musi przegrać z A`);
  assert.ok(o.wynik(['mine81', 'mine91', 'mine108']) > o.wynik(['mine81', 'mine91', 'mine108', 'tok']),
    'A ściśle wyżej niż B (token w wymianie ponad wolne sloty płaci karę)');
});

test('PMSSB-70/K1 (anty-over-fix): wymiana MIEŚCI SIĘ w wolnych slotach — pełna wartość', () => {
  // Dwa blokery 1/1. Przeżywający 2/2 zabija JEDNEGO (1 wolny slot zostaje),
  // więc wymiana tokenu 1/1 jest opłacona: 5 (przeżyje i zabija) + 0 (wymiana).
  const o = opcje(atak([['mine', 2, 2], ['tok', 1, 1]], [['f1', 1, 1], ['f2', 1, 1]]));
  assert.equal(o.wynik(['mine', 'tok']), 5, 'wymiana w wolnym slocie nie dostaje kary');
});

test('PMSSB-70/K2 (kontrola PMSSB-33/A1): pojedyncza wymiana 1/1 za 1/1 nadal 0', () => {
  const o = opcje(atak([['mine', 1, 1]], [['foe', 1, 1]]));
  assert.equal(o.wynik(['mine']), 0, 'jeden bloker, jedna wymiana — opłacona, bez zmiany');
});

test('PMSSB-70/P (pokrętło): token nie przynosi zysku, bo ginie w bloku (CR 509.1a)', () => {
  // Uczciwa wersja pokrętła po poprawce B. W pierwotnej pozycji s4011 (JEDEN
  // bloker 1/1, cztery atakujące, 4 życia wroga) token wchodził w twarz i żył,
  // więc dodanie go NAPRAWDĘ zarabiało — i właściciel wprost tak ustanowił
  // 2026-10-22 („im więcej kreatur atakuje, tym więcej przechodzi"). Remis
  // A = B był artefaktem błędnego modelu, który zakładał, że KAŻDY atakujący
  // stoi naprzeciwko swojemu blokerowi.
  //
  // Po poprawce token ginie w bloku (cztery blokery 2/2 przy trzech 4/4), więc
  // nic nie wnosi — i to jest teraz powód, dla którego wariant B przegrywa.
  // Ten test pilnuje właściwej przyczyny, a nie numerów z 2026-10-20.
  const o = opcje(S4011());
  assert.ok(o.wynik(['mine81', 'mine91', 'mine108']) > o.wynik(['mine81', 'mine91', 'mine108', 'tok']),
    'token zablokowany i ginący nie wnosi nic — wariant B musi przegrywać');
});

test('PMSSB-70/G (granica zakresu): nadmiarowy atakujący PRZECHODZI i warto go dodać', () => {
  // Odwrócona granica zakresu po poprawce B. Dwa 1/1 przeciw JEDNEMU blokerowi
  // 1/1: obrońca bierze tylko jednego (CR 509.1a), więc drugi 1/1 wchodzi w
  // twarz i zostaje na stole. Dodanie go jest zyskiem, nie „wymianą ponad
  // wolne sloty" — zmierzone: atak jednego = 0, atak obu = 4.
  //
  // To jest dokładnie zgłoszenie właściciela: dodanie atakującego ZAWSZE
  // daje szansę na dodatkowe obrażenia, więc nie może być traktowane jako
  // bezczynna wymiana. Poprzednie „wycena bez zmian" (0 == 0) wynikało z
  // błędnego założenia, że każdy atakujący ma swój bloker.
  const o = opcje(atak([['m1', 1, 1], ['m2', 1, 1]], [['f1', 1, 1]]));
  assert.ok(o.wynik(['m1', 'm2']) > o.wynik(['m1']),
    `nadmiarowy atakujący przechodzi do twarzy — dodanie go musi pomaga `
    + `(${o.wynik(['m1', 'm2'])} vs ${o.wynik(['m1'])})`);
});
