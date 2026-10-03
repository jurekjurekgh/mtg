// PMSSB-50 (2026-10-03m) — „premia ewazyjna deathtouch/double strike w wycenie
// walki" (kolejka 3 handoffu 03g/03h, granica (1) §PMSSB-41).
//
// POMIAR PRZED (sonda `tools/probe-pmssb50-evazja-dt-ds.mjs`):
//   A2: 1/1 DEATHTOUCH vs bloker 5/5      → attack[atk] = −10  (jak bez DT!)
//   A4: 3/3 DEATHTOUCH vs bloker 5/5      → −10                (jak bez DT!)
//   A5: 3/3 DEATHTOUCH vs bloker 1/5      → −2 („przeżyje, nie zabije”)
//   B2: otwarty stół, 2/2 DOUBLE STRIKE   → 13 = tyle samo co 2/2 bez DS
//   B3: obrońca 4 życia, 2/2 DOUBLE STRIKE→ 33 = brak wykrycia lethalu
//   B5: 2/2 DOUBLE STRIKE vs bloker 4/4   → −10 (chump; a to wymiana 2+2 ≥ 4)
// Model liczył progi zabicia gołą mocą (`power >= blocker.toughness`), więc:
//  • deathtouch (CR 702.2b — każde ≥1 obrażenie jest śmiertelne) nie istniał
//    w wycenie ataku: bot nie atakował stworami, których bloku obrońca nie
//    może wygrać (1 moc = lethal ⇒ praktycznie nieblokowalny),
//  • double strike (CR 702.7b — moc w OBU odsłonach) nie istniał ani w progu
//    zabicia (2/2 DS zabija 4/4), ani w obrażeniach w twarz (2/2 DS = 4).
//
// Naprawa (jedno źródło reguły, bez nazw kart — ADR 0002/0017):
//   `lethalDamageOf` (deathtouch → ∞, double strike → 2× moc) w progach
//   zabicia + `faceDamageOf` (double strike → 2× moc) w gałęziach „przechodzi
//   w twarz" + gałąź „deathtouch praktycznie nieblokowalny": gdy KAŻDY
//   nietapnięty bloker jest cenniejszy (moc + wytrzymałość) niż mój atakujący,
//   blok nie przyjdzie (obrońca nie odda 5/5 za 1/1) i atak liczy się jak
//   ewazyjny, a nie jak chump.
//
// Piny: E1–E3 deathtouch (przez / wymiana / równowartościowy bloker), E4–E7
// double strike (twarz, lethal, wymiana 2/2↔4/4, kontrolny blok 2/2), E8–E9
// anty-over-fix (bez keywordów wynik bez zmian; próg „cenniejszy” jest OSTRA
// nierównością, więc równa wymiana nadal jest wymianą, nie ewazją).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, playerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types,
    subtypes: def.subtypes, keywords: def.keywords,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
}

/**
 * Bot = p2 atakuje w kroku `declare_attackers`; p1 broni (opcjonalnie bloker).
 * `patch` atakującego: { power, toughness, keywords }.
 */
function scena({ atk = {}, blocker = null, defenderLife = 20 } = {}) {
  const s = createGameState({ seed: 50, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p2';
  s.players = s.players.map((p) => ({ ...p, life: p.id === 'p1' ? defenderLife : 20 }));
  put(s, 'atk', 'hill-giant', 'p2', { power: 2, toughness: 2, keywords: [], ...atk });
  if (blocker) put(s, 'blk', 'hill-giant', 'p1', { power: 1, toughness: 5, keywords: [], ...blocker });
  return s;
}

/** Wynik wariantu ataku jednym stworem + wybrana komenda. */
function atak(s) {
  const bot = createHeuristicBot({ seed: 4 });
  const view = playerView(s, 'p2');
  const cmd = bot.chooseCommand(view);
  const trace = bot.trace().at(-1).options;
  return {
    score: trace.find((o) => o.cmd === 'attack[atk]')?.score,
    wybrany: cmd.type === 'declare_attackers' && (cmd.attackerIds ?? []).includes('atk'),
  };
}

// ── E1–E3: deathtouch (CR 702.2b) ──────────────────────────────────────────

test('E1: 1/1 deathtouch vs bloker 5/5 — blok przegrany dla obrońcy, atak wchodzi', () => {
  // Każdy bloker (5/5 = 10) jest cenniejszy niż 1/1 (= 2), więc blok nie
  // przyjdzie: 1 obrażeń w twarz + premia ewazyjna (M202/H) = 1 + 3.
  assert.deepEqual(atak(scena({
    atk: { power: 1, toughness: 1, keywords: ['deathtouch'] },
    blocker: { power: 5, toughness: 5 },
  })), { score: 4, wybrany: true });
});

test('E2: 3/3 deathtouch vs bloker 5/5 — nadal ewazja (bloker droższy: 10 > 6)', () => {
  assert.deepEqual(atak(scena({
    atk: { power: 3, toughness: 3, keywords: ['deathtouch'] },
    blocker: { power: 5, toughness: 5 },
  })), { score: 6, wybrany: true });
});

test('E3: 3/3 deathtouch vs bloker 1/5 — „przeżyje I zabija blokera” (próg to 1, nie 5)', () => {
  // Bloker 1/5 = 6 = wartość atakującego (6) → NIE ewazja (nierówność ostra),
  // ale deathtouch zabija go w walce: 3/3 przeżywa (moc blokera 1 < 3), więc
  // gałąź „realny zysk” = moc + premia przejścia = 3 + 3.
  assert.deepEqual(atak(scena({
    atk: { power: 3, toughness: 3, keywords: ['deathtouch'] },
    blocker: { power: 1, toughness: 5 },
  })), { score: 6, wybrany: true });
});

// ── E4–E7: double strike (CR 702.7b) ──────────────────────────────────────

test('E4: otwarty stół — 2/2 double strike zadaje 4 (dwie odsłony), nie 2', () => {
  const ds = atak(scena({ atk: { power: 2, toughness: 2, keywords: ['double_strike'] } }));
  const vanilla = atak(scena({ atk: { power: 2, toughness: 2 } }));
  assert.deepEqual(ds, { score: 15, wybrany: true }); // 4 + premia 3 + otwarta plansza 8
  assert.deepEqual(vanilla, { score: 13, wybrany: true }); // 2 + 3 + 8 — kotwica bez zmian
});

test('E5: lethal — 2/2 double strike przy 4 życia obrońcy widzi wygraną partii', () => {
  const ds = atak(scena({ atk: { power: 2, toughness: 2, keywords: ['double_strike'] }, defenderLife: 4 }));
  const vanilla = atak(scena({ atk: { power: 2, toughness: 2 }, defenderLife: 4 }));
  assert.ok(ds.score >= 1000, `4 obrażenia ≥ 4 życia = lethal (+1000), jest ${ds.score}`);
  assert.ok(vanilla.score < 1000, `2 obrażenia < 4 życia = brak lethalu, jest ${vanilla.score}`);
});

test('E6: 2/2 double strike vs bloker 4/4 — 2+2 = lethal, więc WYMIANA (nie chump)', () => {
  // Bloker 4/4 = 8 > 4 = atakujący, więc blok jest dla obrońcy opłacalny
  // (ginie tylko mój 2/2) — deathtouchowa gałąź ewazji tu NIE działa (brak DT),
  // ale double strike zabija blokera w obu odsłonach: wymiana = moc − 1 = 1.
  const r = atak(scena({
    atk: { power: 2, toughness: 2, keywords: ['double_strike'] },
    blocker: { power: 4, toughness: 4 },
  }));
  assert.equal(r.score, 1, 'próg zabicia to 2 × moc (CR 702.7b)');
  assert.ok(r.wybrany, 'wymiana 2/2 ↔ 4/4 jest opłacalna — atak wybrany');
});

test('E7: 2/2 double strike vs bloker 2/2 — bloker ginie w pierwszej odsłonie (bez zmian)', () => {
  assert.deepEqual(atak(scena({
    atk: { power: 2, toughness: 2, keywords: ['double_strike'] },
    blocker: { power: 2, toughness: 2 },
  })), { score: 5, wybrany: true }); // moc + premia przejścia (M202/N, kotwica)
});

// ── E8–E9: anty-over-fix ──────────────────────────────────────────────────

test('E8: bez keywordów wycena bez zmian — chump −10 i wymiana +1 (kotwice M188/M202)', () => {
  const chump = atak(scena({
    atk: { power: 3, toughness: 3 },
    blocker: { power: 5, toughness: 5 },
  }));
  assert.deepEqual(chump, { score: -10, wybrany: false }, '3/3 bez keywordów w 5/5 = strata');
  const trade = atak(scena({
    atk: { power: 2, toughness: 2 },
    blocker: { power: 2, toughness: 2 },
  }));
  assert.deepEqual(trade, { score: 1, wybrany: true }, 'równa wymiana 2/2 ↔ 2/2');
  const survivesNoKill = atak(scena({
    atk: { power: 2, toughness: 2 },
    blocker: { power: 1, toughness: 5 },
  }));
  assert.deepEqual(survivesNoKill, { score: -2, wybrany: false }, 'przeżyje, ale nie zabije = jałowy');
});

test('E9: deathtouch NIE daje ewazji, gdy bloker jest równie tani (równa wymiana zostaje wymianą)', () => {
  // 2/2 deathtouch (wartość 4) vs bloker 2/2 (4): próg „cenniejszy” jest
  // OSTRA nierównością, więc blok może przyjść — wycena to wymiana (moc − 1).
  const r = atak(scena({
    atk: { power: 2, toughness: 2, keywords: ['deathtouch'] },
    blocker: { power: 2, toughness: 2 },
  }));
  assert.deepEqual(r, { score: 1, wybrany: true });
});
