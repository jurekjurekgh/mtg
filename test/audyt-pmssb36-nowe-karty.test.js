// PMSSB-36 (2026-10-02b) — mechaniki kart batcha 62 pod kątem pętli PMSSB:
// exploit z zasobami (Vulturous Aven), cel własny ETB (Jade Bearer) i wypłata
// liczników na polu (Tackle Artist, Oreplate Pangolin). Plan:
// `docs/plans/PLAN_2026-10-02b-pmssb36-nowe-karty.md`. Wartości „PRZED” to
// pomiar sondą na HEAD `fdc6559` (te same sceny).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

function game(lib = 30) {
  const s = createGameState({ seed: 36, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < lib; i += 1) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  return s;
}

const READY = { summoningSick: false };
const lands = (s, n, kind) => { for (let i = 0; i < n; i += 1) put(s, `L${i}`, kind, 'p1', 'battlefield', { tapped: false }); };

/** Oferty bota: mapa etykieta → wynik + wybrana komenda. */
function oferta(s, params) {
  const bot = createHeuristicBot({ seed: 2026, params });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  const opcje = new Map();
  for (const o of bot.trace().at(-1)?.options ?? []) opcje.set(o.cmd, o.score);
  return { cmd, opcje };
}
const wynik = (s, prefix, params) => {
  const hits = [...oferta(s, params).opcje].filter(([k]) => k.startsWith(prefix));
  assert.equal(hits.length, 1, `jedna oferta „${prefix}”, są: ${[...oferta(s, params).opcje.keys()].join(' | ')}`);
  return hits[0][1];
};

/** Rzuca Aven (6 lądów) i dochodzi do decyzji exploit; zwraca widok decyzji. */
function avenDecyzja({ life = 20, lib = 30, mine = [], foes = [], params } = {}) {
  const s = game(lib);
  s.players.find((p) => p.id === 'p1').life = life;
  put(s, 'src', 'vulturous-aven');
  mine.forEach((m, i) => put(s, `m${i}`, m.card, 'p1', 'battlefield', { ...READY, ...(m.patch ?? {}) }));
  foes.forEach((m, i) => put(s, `f${i}`, m.card ?? 'maritime-guard', 'p2', 'battlefield', { ...READY, ...(m.patch ?? {}) }));
  lands(s, 6, 'basic-swamp');
  for (let i = 0; i < 6; i += 1) execute(s, { type: 'tap_for_mana', playerId: 'p1', objectId: `L${i}` });
  const cast = playerView(s, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'src');
  assert.ok(cast, 'oferta rzutu Avena');
  execute(s, cast);
  for (let i = 0; i < 8; i += 1) {
    if (playerView(s, 'p1').legalCommands.some((c) => c.type === 'resolve_exploit_choice')) break;
    const pass = playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(s, pass);
  }
  assert.ok(playerView(s, 'p1').legalCommands.some((c) => c.type === 'resolve_exploit_choice'), 'decyzja exploita');
  const { cmd } = oferta(s, params);
  return { s, cmd, ofiara: cmd.skip ? null : s.objects.get(cmd.targetId)?.cardId, id: cmd.targetId };
}
const GUARD = { card: 'maritime-guard' };
const TOKEN = { card: 'maritime-guard', patch: { isToken: true } };
const VANILLA33 = { card: 'maritime-guard', patch: { power: 3, toughness: 3 } };

// ---- A. Vulturous Aven: exploit liczony netto (zysk − koszt − cena ofiary) ----

test('PMSSB36-A1: zdrowe życie i biblioteka, tani stwór → poświęca (kontrola anty-over-fix, jak PRZED)', () => {
  const d = avenDecyzja({ mine: [GUARD] });
  assert.equal(d.ofiara, 'maritime-guard');
});

test('PMSSB36-A2: niskie życie → SKIP (PRZED: poświęcał przy 2 życiach — „strać 2” = śmierć)', () => {
  for (const life of [2, 3, 4, 5]) {
    assert.equal(avenDecyzja({ life, mine: [GUARD] }).cmd.skip, true, `życie ${life}`);
  }
  // 6 życia: zejście do 4 bez progu ratunkowego — koszt symboliczny, exploit się opłaca
  assert.equal(avenDecyzja({ life: 6, mine: [GUARD] }).cmd.skip, undefined);
});

test('PMSSB36-A3: cienka biblioteka → SKIP (PRZED: dobierał 2 z 3 kart); 6+ kart po dobraniu → OK', () => {
  for (const lib of [2, 3, 5]) assert.equal(avenDecyzja({ lib, mine: [GUARD] }).cmd.skip, true, `biblioteka ${lib}`);
  assert.equal(avenDecyzja({ lib: 8, mine: [GUARD] }).cmd.skip, undefined);
});

test('PMSSB36-A4: ofiara = najtańszy bez zdolności; token tańszy niż karta; drogi stwór nie jest poświęcany', () => {
  assert.equal(avenDecyzja({ mine: [VANILLA33, GUARD] }).id !== undefined, true);
  const dwa = avenDecyzja({ mine: [VANILLA33, GUARD] });
  assert.equal(dwa.s.objects.get(dwa.id).toughness, 3);
  assert.equal(dwa.s.objects.get(dwa.id).power, 1, 'wybiera 1/3, nie 3/3');
  const tok = avenDecyzja({ mine: [GUARD, TOKEN] });
  assert.equal(tok.s.objects.get(tok.id).isToken, true, 'token przed kartą');
  // jedyny kandydat: 3/3 bez zdolności (cena 9 > zysk netto 8) albo stwór ze zdolnością → skip (PRZED: poświęcał)
  assert.equal(avenDecyzja({ mine: [VANILLA33] }).cmd.skip, true, 'zwykły 3/3 nie jest wart dwóch kart i 2 życia');
  assert.equal(avenDecyzja({ mine: [{ card: 'silumgar-butcher' }] }).cmd.skip, true, 'stwór ze zdolnością — skip');
});

test('PMSSB36-A5: cienka plansza przy wrogich stworach → SKIP; bez wroga — poświęca; pokrętło ×0 przywraca stare', () => {
  const trzech = [GUARD, GUARD, GUARD];
  assert.equal(avenDecyzja({ life: 7, mine: [GUARD], foes: trzech }).cmd.skip, true, 'jedyny obrońca vs 3 wrogów');
  assert.equal(avenDecyzja({ life: 7, mine: [GUARD] }).cmd.skip, undefined, 'bez wroga plansza nie jest zagrożona');
  assert.equal(avenDecyzja({ life: 7, mine: [GUARD], foes: trzech, params: { exploitThinBoardPenalty: 0 } }).cmd.skip, undefined,
    'pokrętło 0 = dawna ścieżka');
  assert.equal(avenDecyzja({ mine: [GUARD, GUARD], foes: trzech }).cmd.skip, undefined, 'dwa stwory po wymianie — OK');
});

test('PMSSB36-A6: rzut Avena liczy TĘ SAMĄ miarę — fodder podnosi wynik, niskie życie nie (PRZED: impuls x=4 dla każdego)', () => {
  const rzut = (life, mine) => {
    const s = game();
    s.players.find((p) => p.id === 'p1').life = life;
    put(s, 'src', 'vulturous-aven');
    mine.forEach((m, i) => put(s, `m${i}`, m.card, 'p1', 'battlefield', { ...READY, ...(m.patch ?? {}) }));
    lands(s, 4, 'basic-swamp');
    return wynik(s, 'cast_permanent(src)');
  };
  const pusty = rzut(20, []);
  const zFodderem = rzut(20, [GUARD]);
  assert.ok(zFodderem > pusty, `z tanim stworem exploit ma wartość (${zFodderem} > ${pusty})`);
  assert.equal(rzut(2, [GUARD]), rzut(2, []), 'przy 2 życiach exploit nie dodaje wartości (samobójstwo)');
});

// ---- B. Jade Bearer: cel ETB po stronie własnej ----

test('PMSSB36-B1: Jade Bearer — licznik ma wartość tylko, gdy jest INNY Merfolk (PRZED: 63,901 w obu; wróg → +5,4 bez celu)', () => {
  const rzut = (mine, foes = 0) => {
    const s = game();
    lands(s, 1, 'basic-forest');
    put(s, 'jb', 'jade-bearer');
    mine.forEach((c, i) => put(s, `m${i}`, c, 'p1', 'battlefield', READY));
    for (let i = 0; i < foes; i += 1) put(s, `f${i}`, 'hill-giant', 'p2', 'battlefield', READY);
    return wynik(s, 'cast_permanent(jb)');
  };
  const bezMerfolka = rzut(['hill-giant']);
  const zMerfolkiem = rzut(['maritime-guard']);
  assert.ok(Math.abs((zMerfolkiem - bezMerfolka) - 5.4) < 1e-6, `+6 × 0,9 za licznik (${zMerfolkiem} − ${bezMerfolka})`);
  assert.equal(rzut(['hill-giant'], 1), bezMerfolka, 'wróg na stole nie tworzy wartości, której nie ma cel (PRZED: foes>0 → +5,4)');
  assert.ok(Math.abs(rzut(['coralhelm-guide'], 1) - zMerfolkiem) < 1e-6, 'każdy inny Merfolk jest celem (podtyp z deskryptora)');
});

// ---- C. Wypłata liczników na polu ----

test('PMSSB36-C1: Tackle Artist na polu — rzut instanta/sorcery dostaje wartość licznika (PRZED: 0; Shock wypadał gorzej)', () => {
  const shock = (params, artist = true, spell = 'shock', landsN = 5) => {
    const s = game();
    lands(s, landsN, 'basic-mountain');
    put(s, 'h0', spell);
    if (artist) put(s, 'art', 'tackle-artist', 'p1', 'battlefield', READY);
    put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness: 2 });
    return wynik(s, 'cast_spell(h0->p2)', params);
  };
  const z = shock();
  const bez0 = shock({ boardPayoffWeight: 0 });
  assert.ok(z > bez0, `Opus: +${(z - bez0).toFixed(2)} za licznik`);
  assert.equal(shock(undefined, false), 60, 'bez Artysty — wynik jak PRZED');
  assert.equal(bez0, 60, 'pokrętło 0 = stan sprzed zmiany');
  // gałąź „pięć lub więcej many” = DWA liczniki (Rage of Purphoros {4}{R}, cel: stwór wroga)
  const duzy = (params) => {
    const s = game();
    lands(s, 5, 'basic-mountain');
    put(s, 'h0', 'rage-of-purphoros');
    put(s, 'art', 'tackle-artist', 'p1', 'battlefield', READY);
    put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness: 2 });
    return wynik(s, 'cast_spell(h0->b)', params);
  };
  const dwaLiczniki = duzy() - duzy({ boardPayoffWeight: 0 });
  // drugi licznik = + counterAmountWeight (4) × boardPayoffWeight (0,5) = +2
  assert.ok(Math.abs(dwaLiczniki - (z - bez0) - 2) < 1e-6, `5+ many → dwa liczniki (${dwaLiczniki.toFixed(2)} vs ${(z - bez0).toFixed(2)})`);
});

test('PMSSB36-C2: Oreplate Pangolin — rzut artefaktu płaci licznikiem tylko, gdy zostaje {1} na dopłatę', () => {
  const rzut = (landsN, params) => {
    const s = game();
    lands(s, landsN, 'basic-mountain');
    put(s, 'pg', 'oreplate-pangolin', 'p1', 'battlefield', READY);
    put(s, 'h0', 'angels-feather');
    return wynik(s, 'cast_permanent(h0)', params);
  };
  const zapas = rzut(3);
  const bezZapasu = rzut(2);
  assert.ok(zapas > rzut(3, { boardPayoffWeight: 0 }), 'jest {1} zapasu → licznik wart rzutu');
  assert.equal(bezZapasu, rzut(2, { boardPayoffWeight: 0 }), 'bez zapasu mana na dopłatę nie istnieje → 0');
});
