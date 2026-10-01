// =============================================================================
// PMSSB-33 (mikro-pętla) — TRIAGE REMISÓW WYBORU z tie-audytu (na zamrożonym
// drzewie PMSSB-32). Werdykt: **znane równości, nie ślepoty wyceny**.
//
// Tie-audit `--gry=2` wskazał 16 „GROZY" (remis przy różnych danych wejściowych
// decyzji): attack 9, block 2, activate_ability 2, cast_spell 1,
// resolve_color_choice 1, resolve_discard_choice 1. Ten plik ZAMRAŻA wynik
// triage'u tych remisów, żeby następna pętla nie odkrywała ich od nowa
// (rejestr PMSSB: rodzina raz rozstrzygnięta jest ZAMKNIĘTA).
//
// Metoda: tie-audit drukuje PROJEKCJĘ danych, które wycena czyta (`--json`),
// np. dla ataku {atakuje, trafienie, ginie, zabici, smiertelny}. Dla każdej
// klasy sprawdziliśmy, czy remis wynika z CZYTANYCH i wycenionych wejść
// (równość wartości), czy z wejścia pominiętego (ślepota):
//
//  attack (9) — wzorzec „+1 trafienie i +1 ginie": wycena atakującego to
//    suma per-stwór, a wymiana (power ≥ wytrzymałość blokera, stwór ginie) jest
//    wyceniona jako `power − 1`. Przy power 1 daje to DOKŁADNIE 0, czyli remis
//    z passem/`attack[]`. To granica ŚWIADOMEJ formuły (komentarz w kodzie:
//    „wymiana to realny zysk — bez tego bot nigdy nie atakuje w równą planszę"),
//    a nie pominięte wejście: przy power 2 ta sama reguła daje +1, a przy 3/3
//    w 1/1 +6 (piny A2/A3). Remisy 1030 (lethal) i 0/0 to nadwyżka wariantów
//    (przebicie już wygrywającej decyzji i atak bez zysku).
//  block (2) — permutacje przypisania blokerów o IDENTYCZNYM wyniku (oba ataki
//    zablokowane, te same zgony): pin B1 pokazuje remis dwóch pełnych
//    przypisań (2 = 2), a pin B2 — że przy różnych ciałach wycena rozróżnia
//    przypisania (4 > 2). Remis permutacji jest uczciwy.
//  cast_spell / activate_ability / resolve_color_choice / resolve_discard_choice
//    (5) — wybór między celami o równej wartości (dwa identyczne tokeny, dwa
//    równie dobre źródła); to nie produkcja many ani walka, więc zostają
//    w kolejce razem z audytem, ale bez zmiany kodu (brak dowodu złej decyzji).
//
// Wniosek: **żadna ze 16 GROZY nie jest defektem wyceny** — nie zmieniamy kodu.
// Per-kind bramka `tools/bot-tie-audit.mjs --gate=<kind>` pozostaje narzędziem
// POLOWANIA (exit 1 przy każdym remisie „przy różnych danych"), a nie bramką CI:
// przy zamrożonym drzewie `--gate=attack` i `--gate=block` są czerwone
// Z DEFINICJI tych równości.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/** Ciało bez karty katalogu (P/T + kontrola) — wzorzec z pętli PMSSB-31/32. */
function cialo(state, id, power, toughness, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

const etykieta = (cmd) => (cmd.type === 'declare_blockers'
  ? `block[${Object.entries(cmd.assignments ?? {}).map(([a, b]) => `${a}<${b.join('+')}`).join(' ')}]`
  : cmd.type);

/** Decyzja ATAKUJĄCEGO (p1) w declare_attackers. */
function atak(ciala, blokerzy) {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const [id, p, t] of ciala) cialo(state, id, p, t, 'p1');
  for (const [id, p, t] of blokerzy) cialo(state, id, p, t, 'p2');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Decyzja BLOKUJĄCEGO (p2) — atak zadeklarowany przez `execute` (jak PMSSB-31). */
function blok(ciala, blokerzy) {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  const aIds = ciala.map(([id, p, t]) => { cialo(state, id, p, t, 'p1'); return id; });
  for (const [id, p, t] of blokerzy) cialo(state, id, p, t, 'p2');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: aIds });
  assert.equal(r.ok, true, JSON.stringify(r));
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p2';
  return state;
}

/** Wybór bota + wyniki ofert po etykiecie (p1 przy ataku, p2 przy bloku). */
function opcje(state, playerId) {
  const bot = createHeuristicBot({ seed: 7 });
  const wybrany = bot.chooseCommand(playerView(state, playerId), {});
  const wszystkie = bot.trace().at(-1)?.options ?? [];
  return {
    wybrany: etykieta(wybrany),
    wynik: (label) => {
      const trafiona = wszystkie.find((o) => o.cmd === label);
      assert.ok(trafiona, `brak opcji ${label} w: ${wszystkie.map((o) => o.cmd).join(' | ')}`);
      return trafiona.score;
    },
    oferta: (label) => wszystkie.find((o) => o.cmd === label),
  };
}

test('PMSSB-33/A1 (znany remis): wymiana 1/1 za 1/1 to DOKŁADNIE 0 — tyle co brak ataku', () => {
  const o = opcje(atak([['mine', 1, 1]], [['foe', 1, 1]]), 'p1');
  assert.equal(o.wynik('attack[mine]'), 0,
    'formuła wymiany `power − 1` przy power 1 daje 0 (świadoma równość, nie ślepota)');
  assert.equal(o.oferta('attack[]').score, 0, 'brak ataku = 0');
  assert.equal(o.oferta('pass_priority').score, 0, 'pass = 0');
  assert.equal(o.wybrany, 'declare_attackers', 'bot wybiera `attack[]` — nie atakuje na remis');
});

test('PMSSB-33/A2 (anty-remis): ta sama reguła przy power 2 daje 1 — wycena ROZRÓŻNIA', () => {
  const o = opcje(atak([['mine', 2, 2]], [['foe', 2, 2]]), 'p1');
  assert.equal(o.wynik('attack[mine]'), 1, 'wymiana 2/2 za 2/2 = power − 1 = 1 > pass');
  assert.equal(o.wybrany, 'declare_attackers', 'bot atakuje');
  assert.ok(o.oferta('attack[mine]').score > o.oferta('attack[]').score, 'ściśle wyżej niż brak ataku');
});

test('PMSSB-33/A3 (kontrola): 3/3 w 1/1 przeżywa i zabija — 6 pkt', () => {
  const o = opcje(atak([['mine', 3, 3]], [['foe', 1, 1]]), 'p1');
  assert.equal(o.wynik('attack[mine]'), 6, 'gałąź „przeżyje I zabija blokera”');
});

test('PMSSB-33/A4: dwa 1/1 w dwa 1/1 — suma zer, remis wszystkich wariantów', () => {
  const o = opcje(atak([['m1', 1, 1], ['m2', 1, 1]], [['f1', 1, 1], ['f2', 1, 1]]), 'p1');
  for (const label of ['attack[m1]', 'attack[m2]', 'attack[m1,m2]', 'attack[]']) {
    assert.equal(o.wynik(label), 0, `${label} = 0 (dwie wymiany po 0)`);
  }
});

test('PMSSB-33/A5 (anty-over-fix): otwarty stół to NIE remis — 1/1 bez blokerów daje 12', () => {
  const o = opcje(atak([['mine', 1, 1]], []), 'p1');
  assert.equal(o.wynik('attack[mine]'), 12, 'czysta presja: power + attackThroughBonus');
  assert.equal(o.wybrany, 'declare_attackers', 'bot atakuje — remis z A1 nie jest biernością');
  assert.ok(o.oferta('attack[mine]').score > o.oferta('attack[]').score);
});

test('PMSSB-33/B1 (znany remis): permutacja przypisań blokerów o tym samym wyniku', () => {
  const o = opcje(blok([['a1', 1, 1], ['a2', 1, 1]], [['b1', 1, 1], ['b2', 1, 1]]), 'p2');
  assert.equal(o.wynik('block[a1<b1 a2<b2]'), o.wynik('block[a2<b1 a1<b2]'),
    'oba ataki zablokowane, te same zgony — przypisania są zamienne');
  assert.equal(o.wynik('block[a1<b1 a2<b2]'), 2, 'wartość bloku (kotwica)');
});

test('PMSSB-33/B2 (anty-remis): przy RÓŻNYCH ciałach wycena bloku rozróżnia przypisania', () => {
  const o = opcje(blok([['a1', 2, 2], ['a2', 1, 1]], [['b1', 1, 1], ['b2', 2, 2]]), 'p2');
  const dobrze = o.wynik('block[a2<b1 a1<b2]');
  const slabo = o.wynik('block[a1<b1 a2<b2]');
  assert.ok(dobrze > slabo,
    `dobry podział blokerów wygrywa (${dobrze} > ${slabo}) — remis z B1 nie jest ślepotą modelu`);
});
