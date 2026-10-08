// =============================================================================
// Zgłoszenie H (2026-10-08, właściciel) — Krumar Initiate:
//   „{X}{B}, {T}, Pay X life: This creature endures X. Activate only as a
//   sorcery. (Put X +1/+1 counters on it or create an X/X white Spirit
//   creature token.)"
//   „Bot co kolejkę tworzy za 1 życia spirit 1/1. Co kolejkę ten token ginie.
//   Niby wielkiej straty nie ma, bo zablokował mnie i nie stracił życia, ale
//   ta karta mogłaby być lepiej wykorzystana. Mógłby stworzyć potwora typu 5/5
//   który zblokowałby wszelkie moje stwory (zamiast 5 razy tworzyć 1/1 za te
//   same 5 życia stworzyłby 5/5) albo mógłby siebie dopakować +3/+3
//   counterami i mieć ten sam efekt. Tak myślę, że optymalnie to byłoby
//   stworzyć spirit token albo siebie dopakować tak, żeby mieć kreaturę o
//   power większym niż toughness mojego największego stwora albo toughness
//   większy niż power mojego największego stwora (do blokowania). W każdym
//   razie tworzenie co kolejkę 1/1 za 1 życia jest wielce nieoptymalne.
//   Oczywiście trzeba tak to robić, żeby nie zabić siebie -> pewnie treshhold
//   np. nie więcej płacę niż 25% mojego życia jest konieczny."
//
// Pomiar PRZED (sonda `.arena/probe-h-krumar.mjs`): oferta ma warianty
// X=1..8, ale efekt `endure_x` NIE miał wyceny w gałęzi `activate_ability`
// (goła baza 2) — jedynym składnikiem zależnym od X była kara za manę
// (`min(X,2) * 0,5`), więc X=1 wygrywało ZAWSZE. Koszt „Pay X life" nie był
// wyceniony NIGDZIE, więc 1 i 8 życia wychodziło po samo. Pomiar: X=1 = 0,5,
// X=2..8 = 0 → bot tworzył 1/1 za 1 życia co kolejkę, dokładnie jak w
// zgłoszeniu. Dodatkowo wybór TRYBU (`resolve_endure_choice`) był płaski
// (42 token / 40 liczniki) niezależnie od N, a warianty X miały w śladzie
// IDENTYCZNĄ etykietę `activate_ability(kru#0)` (klasa L34/L40).
//
// Fix (generycznie po deskryptorze efektu `endure_x` + kosztu `payLifeX`,
// ADR 0002 — bez nazw kart; P/T i życie wyłącznie z PlayerView, ADR 0017):
// - `endureBodyValue(view, size)` — JEDNA miara ciała dla obu trybów (L41):
//   punkty do `need` = max(P, T) największego ciała przeciwnika + 1 mają
//   pełną wagę (P×2 + T×1), powyżej `need` ważą mniej niż koszt życia za
//   punkt (`endureOversizeWeight` 1 vs 2) — bot rośnie do celu, nie do limitu
//   many. Bez ciał przeciownika celem jest bezpieczny budżet życia (próg),
//   bo inaczej karta degraduje do „1/1 za 1 życie co kolejkę".
// - `endureXValue(view, x, source)` = LEPSZY z trybów: liczniki na ŹRÓDLE
//   (rozmiar = źródło + X) albo token X/X — druga połówka uwagi właściciela
//   („siebie dopakować +3/+3 counterami i mieć ten sam efekt").
// - koszt „Pay X life" (CR 601.2h): wspólna drabina samouszkodzenia
//   (PMSSB-36) + próg 25% puli (`payLifeXThreshold`) z karą
//   `payLifeXOverThresholdPenalty` za każdy punkt powyżej progu.
// - `resolve_endure_choice` liczy ciało z N (nowe pole widoku
//   `pendingEndures`, ADR 0017/L48) tą SAMĄ miarą + premia za drugie ciało
//   (`endureTokenBodyPremium`) — inaczej aktywacja wybierała X pod liczniki,
//   a rozstrzyganie robiło mniejszy token.
// - tap źródła w precombat płaci `tapBodyCost` (L41) — atak w tej turze.
// - ślad: etykieta wariantu nosi `,X=n` (M195/B / M203/2 / PMSSB-41/C).
//
// Dowód mutacyjny (każda mutacja musi wyłączyć konkretne testy):
//   - `endureBodyValue` → stała (jak dawny wpis ETB 4/N): czerwone H/2, H/2b,
//     H/3 (X=1 znowu wygrywa — rozmiar nie idzie za ciałem wroga),
//   - zdjęty próg 25% (`payLifeXThreshold: 1`): czerwone H/3 (bot płaci całą
//     pulę, bo kara za oversize jest mniejsza niż zysk z ciała),
//   - `resolve_endure_choice` z powrotem na płaskie 42/40: czerwone H/6
//     (tryb przestaje wynikać z rozmiaru),
//   - bez X w etykiecie śladu: czerwone H/4 (nie da się odczytać wybranego X).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'main1') {
  const s = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(s, {
        id: `lib-${p}-${i}`, instanceId: `i-lib-${p}-${i}`, cardId: 'basic-plains',
        controllerId: p, ownerId: p, zone: 'library', kind: 'spell', manaCost: 0,
      });
    }
  }
  return s;
}

function put(s, id, cardId, playerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

const creature = (s, id, pid, power, toughness) => addObject(s, {
  id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid, zone: 'battlefield',
  kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [], subtypes: [],
  types: ['Creature'], colors: [],
});

/** Scena aktywacji (p1): Krumar Initiate na polu, mana, życie, ciała wroga. */
function scena({ step = 'main1', mana = 9, life = 20, own = [], foe = [] } = {}) {
  const s = game(step);
  put(s, 'kru', 'krumar-initiate', 'p1');
  addMana(s, 'p1', mana);
  s.players[0].life = life;
  own.forEach(([id, p, t]) => creature(s, id, 'p1', p, t));
  foe.forEach(([id, p, t]) => creature(s, id, 'p2', p, t));
  return s;
}

/** Decyzja bota + noty WSZYSTKICH wariantów X (etykieta śladu nosi `,X=n`). */
function decyzja(s, seed = 5) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}
const scoreX = (scores, x) => scores[`activate_ability(kru#0,X=${x})`];

/**
 * Rozstrzyga stos do końca (aktywacja → efekt → decyzja endure) botem.
 * Zwraca wybory oraz NOTY decyzji o trybie endure.
 */
function resolveAll(s, seed = 5) {
  const picks = [];
  let modeTrace = null;
  for (let i = 0; i < 10 && (s.zones.stack.length > 0 || s.pendingEndures.length > 0); i += 1) {
    const bot = createHeuristicBot({ seed });
    const pick = bot.chooseCommand(playerView(s, s.turn.priorityPlayerId));
    picks.push(pick);
    if (pick.type === 'resolve_endure_choice') {
      modeTrace = {};
      for (const o of bot.trace().at(-1)?.options ?? []) modeTrace[o.cmd] = o.score;
    }
    assert.ok(execute(s, pick).ok, `krok ${pick.type} legalny`);
  }
  return { picks, modeTrace };
}

// =============================================================================
// H/1 — scenariusz właściciela: wróg 5/5 → rośnięcie do ciała, które go przeżyje
// =============================================================================

test('H/1: wróg 5/5, 20 życia, 9 many → X=4 (liczniki: źródło 6/6), nie 1/1 za 1 życie', () => {
  const { cmd, scores } = decyzja(scena({ step: 'main2', foe: [['f55', 5, 5]] }));
  assert.equal(cmd.type, 'activate_ability', `bot aktywuje zdolność: ${JSON.stringify(cmd)}`);
  assert.equal(cmd.xValue, 4,
    `X=4 = najmniejszy X dający ciało przewyższające 5/5 wroga (wybrano ${cmd.xValue})`);
  // Stara patologia (1/1 za 1 życie) jest wyraźnie gorsza.
  assert.ok(scoreX(scores, 1) < scoreX(scores, 4),
    `X=1 (${scoreX(scores, 1)}) poniżej X=4 (${scoreX(scores, 4)})`);
  // I nie przepłaca: powyżej `need` punkt waży mniej niż życie za niego.
  assert.ok(scoreX(scores, 4) > scoreX(scores, 5),
    `X=5 (${scoreX(scores, 5)}) poniżej X=4 — rozmiar powyżej celu nie jest opłacalny`);
});

test('H/1b: E2E — X=4 płaci 4 życia i daje ciało przeżywające 5/5 (liczniki na źródle)', () => {
  const s = scena({ step: 'main2', foe: [['f55', 5, 5]] });
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'));
  const lifeBefore = s.players[0].life;
  assert.equal(cmd.xValue, 4, 'bot wybiera X=4');
  assert.ok(execute(s, cmd).ok, 'aktywacja jest legalna');
  const { picks } = resolveAll(s);
  assert.ok(picks.some((p) => p.type === 'resolve_endure_choice'), 'bot rozstrzyga tryb endure');
  assert.equal(s.players[0].life, lifeBefore - 4,
    `zapłacone 4 życia (${lifeBefore} → ${s.players[0].life})`);
  const kru = s.objects.get('kru');
  assert.equal(effectivePower(kru, s), 6, `źródło po licznikach: ${effectivePower(kru, s)}/${effectiveToughness(kru, s)}`);
  assert.equal(effectiveToughness(kru, s), 6, 'źródło 6/6 przeżyje 5 obrażeń wrogiej 5/5');
});

// =============================================================================
// H/2 — rozmiar idzie za największym ciałem wroga (reguła właściciela)
// =============================================================================

test('H/2: X = najmniejsza wartość, której ciało przeżywa największego stwora wroga', () => {
  // need = max(P, T) wroga + 1; liczniki na źródle 2/2 dodają X do rozmiaru.
  const przypadki = [
    { foe: [['f22', 2, 2]], life: 20, x: 1, label: '2/2 → 3/3 (X=1)' },
    { foe: [['f44', 4, 4]], life: 20, x: 3, label: '4/4 → 5/5 (X=3)' },
    { foe: [['f55', 5, 5]], life: 20, x: 4, label: '5/5 → 6/6 (X=4)' },
    { foe: [['f88', 8, 8]], life: 40, x: 7, label: '8/8 → 9/9 (X=7)' },
  ];
  for (const p of przypadki) {
    const { cmd } = decyzja(scena({ step: 'main2', life: p.life, foe: p.foe }));
    assert.equal(cmd.type, 'activate_ability', `${p.label}: aktywacja`);
    assert.equal(cmd.xValue, p.x, `${p.label}: wybrano X=${cmd.xValue}`);
  }
});

test('H/2b: pusty stół — bez ciał wroga bot i tak nie robi 1/1 (cel = bezpieczny budżet życia)', () => {
  const { cmd, scores } = decyzja(scena({ step: 'main2' }));
  assert.equal(cmd.type, 'activate_ability', `aktywacja ma sens: ${cmd.type}`);
  assert.equal(cmd.xValue, 3, `20 życia → cel 5/5 za 3 życia (wybrano ${cmd.xValue})`);
  assert.ok(scoreX(scores, 1) < scoreX(scores, 3),
    `X=1 (${scoreX(scores, 1)}) poniżej X=3 (${scoreX(scores, 3)}) — 1/1 za 1 życie nie jest optymalne`);
});

// =============================================================================
// H/3 — próg życia: nie zabija siebie, nie płaci więcej niż 25% puli
// =============================================================================

test('H/3: próg 25% puli — 8 życia daje małe X, 20 życia większe', () => {
  const niskie = decyzja(scena({ step: 'main2', life: 8, foe: [['f22', 2, 2]] }));
  const wysokie = decyzja(scena({ step: 'main2', life: 20, foe: [['f55', 5, 5]] }));
  assert.equal(niskie.cmd.xValue, 1, `8 życia → X=1 (wybrano ${niskie.cmd.xValue})`);
  assert.equal(wysokie.cmd.xValue, 4, `20 życia → X=4 (wybrano ${wysokie.cmd.xValue})`);
  // Płacenie ponad próg jest karane mocniej niż zysk z kolejnego punktu.
  const { scores } = decyzja(scena({ step: 'main2', life: 8, foe: [['f22', 2, 2]] }));
  assert.ok(scoreX(scores, 3) < scoreX(scores, 1),
    `X=3 przy 8 życiach (${scoreX(scores, 3)}) poniżej X=1 (${scoreX(scores, 1)}) — próg 25%`);
});

test('H/3b: wariant samobójczy (X większy niż pula) jest poza ofertą, a wycena i tak go zabija', () => {
  const s = scena({ step: 'main2', life: 4, mana: 9 });
  const view = playerView(s, 'p1');
  const legal = (view.legalCommands ?? []).filter((c) => c.type === 'activate_ability');
  assert.ok(legal.length > 0, 'silnik oferuje warianty X');
  assert.ok(legal.every((c) => c.xValue <= 4),
    `X nigdy nie przekracza puli życia (CR 118.4): ${legal.map((c) => c.xValue)}`);
  const { cmd } = decyzja(s);
  if (cmd.type === 'activate_ability') {
    assert.ok(s.players[0].life - cmd.xValue > 0, `bot nie płaci więcej, niż ma: X=${cmd.xValue}`);
    assert.ok(cmd.xValue <= 1, `4 życia → próg 1 punkt (wybrano ${cmd.xValue})`);
  }
});

// =============================================================================
// H/4 — ślad rozróżnia warianty X (klasa L34/L40)
// =============================================================================

test('H/4: warianty X są rozróżnialne w śladzie i mają różne noty', () => {
  const { scores } = decyzja(scena({ step: 'main2', foe: [['f55', 5, 5]] }));
  const klucze = Object.keys(scores).filter((k) => k.startsWith('activate_ability(kru#0'));
  assert.equal(klucze.length, 8, `osiem różnych etykiet dla ośmiu wariantów X: ${klucze.length}`);
  for (const x of [1, 2, 3, 4, 5]) {
    assert.equal(typeof scoreX(scores, x), 'number', `wariant X=${x} ma własną notę`);
  }
  const noty = [1, 2, 3, 4, 5].map((x) => scoreX(scores, x));
  assert.equal(new Set(noty).size, 5, `noty różne między wariantami: ${noty.join(', ')}`);
  // X rośnie monotonicznie do `need` (5/5 → X=4), potem spada.
  assert.ok(scoreX(scores, 4) > scoreX(scores, 3) && scoreX(scores, 3) > scoreX(scores, 2),
    `nota rośnie z X aż do celu: ${noty.join(', ')}`);
});

// =============================================================================
// H/5 — koszt tapa źródła w precombat (atak w tej turze)
// =============================================================================

test('H/5: precombat płaci atakiem źródła — ta sama nota w main2 jest wyższa o tapBodyCost', () => {
  const przed = decyzja(scena({ step: 'main1', foe: [['f55', 5, 5]] }));
  const po = decyzja(scena({ step: 'main2', foe: [['f55', 5, 5]] }));
  assert.equal(przed.cmd.xValue, 4, `main1: X=4 (wybrano ${przed.cmd.xValue})`);
  assert.equal(po.cmd.xValue, 4, `main2: X=4 (wybrano ${po.cmd.xValue})`);
  assert.ok(po.scores['activate_ability(kru#0,X=4)'] > przed.scores['activate_ability(kru#0,X=4)'],
    `main2 (${po.scores['activate_ability(kru#0,X=4)']}) > main1 (${przed.scores['activate_ability(kru#0,X=4)']}) — po walce źródło nie traci ataku`);
});

// =============================================================================
// H/6 — wybór trybu przy rozstrzyganiu: ta sama miara ciała co przy wyborze X
// =============================================================================

test('H/6: tryb endure liczy ciało z N — przy X=4 i wrogiej 5/5 wygryzają liczniki (6/6)', () => {
  const s = scena({ step: 'main2', foe: [['f55', 5, 5]] });
  execute(s, playerView(s, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.xValue === 4));
  const { picks, modeTrace } = resolveAll(s);
  const pick = picks.find((p) => p.type === 'resolve_endure_choice');
  assert.ok(pick, 'bot rozstrzyga tryb endure');
  assert.equal(pick.mode, 'counters',
    `liczniki dają 6/6, token tylko 4/4 — wybrano ${pick.mode}`);
  const noty = modeTrace;
  // 6/6 = 6 × 5 punktów ciała; token 4/4 = 20 + premia 6 za drugie ciało.
  assert.equal(noty['resolve_endure_choice(counters)'], 30,
    `liczniki 6/6 = 30 (wybrano ${noty['resolve_endure_choice(counters)']})`);
  assert.equal(noty['resolve_endure_choice(token)'], 26,
    `token 4/4 = 20 + 6 (wybrano ${noty['resolve_endure_choice(token)']})`);
});

test('H/6b: przy dużym N token (drugie ciało) wygrywa z jednym wielkim', () => {
  const s = scena({ step: 'main2', life: 40, foe: [['f55', 5, 5]] });
  const act = playerView(s, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.xValue === 8);
  assert.ok(act, 'wariant X=8 jest w ofercie (40 życia → próg 10)');
  execute(s, act);
  const { picks, modeTrace } = resolveAll(s);
  const pick = picks.find((p) => p.type === 'resolve_endure_choice');
  assert.equal(pick.mode, 'token',
    `N=8: token 8/8 obok źródła 2/2 > liczniki 10/10 (wybrano ${pick.mode})`);
  const noty = modeTrace;
  assert.equal(noty['resolve_endure_choice(token)'], 38, `token 8/8 = 32 + 6 (wybrano ${noty['resolve_endure_choice(token)']})`);
  assert.equal(noty['resolve_endure_choice(counters)'], 34, `liczniki 10/10 = 30 + 4 oversize (wybrano ${noty['resolve_endure_choice(counters)']})`);
});

test('H/6c: źródło, które JUŻ dominuje, nie jest dalej dopakowywane — X spada do minimum', () => {
  // need = 3 (wroga 2/2) jest osiągany już przez X=1 (źródło 3/3), więc bot nie
  // płaci życia za rozmiar, którego nie potrzebuje.
  const { cmd, scores } = decyzja(scena({ step: 'main2', foe: [['f22', 2, 2]] }));
  assert.equal(cmd.xValue, 1, `wróg 2/2, źródło 2/2 → X=1 daje 3/3 (wybrano ${cmd.xValue})`);
  assert.ok(scoreX(scores, 1) >= scoreX(scores, 2),
    `X=2 nie jest lepsze od X=1 (${scoreX(scores, 1)} vs ${scoreX(scores, 2)})`);
});
