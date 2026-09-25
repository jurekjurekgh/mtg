// PMSSB-2 — tokeny (create_token). Wzorzec M429/PMSSB-1: decide/trace,
// anty-over-fix (Chatter 1×1/1 za 1 = 60), pokrętła-sterują, piny exact.
// Fala A (wartość tokena): F3 (L41: wspólny tokenBodyValue — ETB/plot/cast/
// ability liczą to samo) + F4 (rola: mana-bank; keywordy i hostile w fali C)
// + F6 (klucze dynamiczne: cards_named_in_graveyard; ETB czyta amount).
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
  const state = createGameState({ seed: 4251, players: [{ id: 'p1' }, { id: 'p2' }] });
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
    plot: d.plot ?? def.plot ?? null,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], ...extra,
  });
  return state.objects.get(id);
}

function stat(state, id, patch) {
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, ...patch }));
}

/** Decyzja bota + mapa wyników wariantów (po etykiecie komendy). */
function decide(state, { playerId = 'p1', params } = {}) {
  const bot = createHeuristicBot({ seed: 7, params });
  const cmd = bot.chooseCommand(playerView(state, playerId), {});
  const entry = bot.trace().at(-1);
  const scores = {};
  for (const o of entry?.options ?? []) {
    if (!o) continue;
    scores[o.cmd] = o.score;
  }
  return { cmd, entry, scores };
}

// =====================================================================
// Fala A — wartość tokena (F3 + F4-mana + F6)
// =====================================================================

test('PMSSB-2/A params: tokenManaBankWeight WŁĄCZONE (1 mana ≈ 3, symetria z recast)', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.tokenManaBankWeight, 3);
});

test('PMSSB-2/A anty-over-fix: Chatter (1×1/1 za 1) wart DOKŁADNIE 60 (jak PRZED)', () => {
  const state = game();
  put(state, 'cha', 'chatter-of-the-squirrel', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const { scores } = decide(state);
  assert.equal(scores['cast_spell(cha->)'], 60, `wzorzec = dawna wartość: ${JSON.stringify(scores)}`);
});

test('PMSSB-2/A/F3+F6: Undead Servant skaluje grobem — strukturalnie ×3 (nie flat 12)', () => {
  const scoreWith = (n) => {
    const state = game();
    put(state, 'us', 'undead-servant', 'p1', 'hand');
    for (let i = 0; i < n; i += 1) put(state, `g${i}`, 'undead-servant', 'p1', 'graveyard');
    addMana(state, 'p1', 9);
    return decide(state).scores['cast_permanent(us)'];
  };
  const s0 = scoreWith(0);
  const s1 = scoreWith(1);
  const s3 = scoreWith(3);
  assert.ok(s1 > s0, `1 imiennik w grobie > pusty grób: ${s0} → ${s1}`);
  // Pin strukturalny (niezależny od wagi rodziny): 3 tokeny = 3× 1 token
  // (epsilon na kurz float — wagi mnożą przed odejmowaniem).
  assert.ok(Math.abs((s3 - s0) - 3 * (s1 - s0)) < 1e-9, `liniowość w liczbie tokenów: ${s0}/${s1}/${s3}`);
});

test('PMSSB-2/A/F3: Jyoti (ZERO tokenów, commander_casts) nie dostaje 12 za ETB', () => {
  const state = game();
  put(state, 'j', 'jyoti-moag-ancient', 'p1', 'hand');
  addMana(state, 'p1', 9);
  const { scores } = decide(state);
  const v = scores['cast_permanent(j)'];
  // 75.6018 PRZED − 12×0.9 (waga rodziny permanent): ETB czyta amount (0).
  assert.ok(Math.abs(v - 64.8018) < 1e-9, `Jyoti bez premii za 0 tokenów: ${v}`);
});

test('PMSSB-2/A/F4: Thieves Tools (ETB Treasure) — bank many wart 3, nie 12', () => {
  const state = game();
  put(state, 'tt', 'thieves-tools', 'p1', 'hand');
  addMana(state, 'p1', 9);
  const { scores } = decide(state);
  const v = scores['cast_permanent(tt)'];
  // 71.0973 PRZED − 9×0.9: ETB Treasure 12 → 3 (bank-many).
  assert.ok(Math.abs(v - 62.9973) < 1e-9, `Treasure wart 3: ${v}`);
});

test('PMSSB-2/A/F4-keeps: Heap Gate (Treasure za koszt) nadal poniżej passa (M243/C stoi)', () => {
  const state = game();
  put(state, 'hg', 'heap-gate', 'p1');
  put(state, 'gg', 'gond-gate', 'p1');
  put(state, 'l1', 'basic-plains', 'p1');
  put(state, 'l2', 'basic-plains', 'p1');
  addMana(state, 'p1', 4);
  const { cmd, scores } = decide(state);
  const hg2 = scores['activate_ability(hg#2)'];
  assert.ok(hg2 != null, `zdolność Treasure oferowana: ${JSON.stringify(scores)}`);
  assert.ok(hg2 < 0, `bankowanie many za koszt = poniżej passa: ${hg2}`);
  assert.notEqual(cmd.type === 'activate_ability' && cmd.objectId === 'hg' ? 'heap' : 'inne', 'heap');
});

test('PMSSB-2/A/F4: Mutagen (licznik +1/+1) widzi gospodarza — z 5/5 na stole > bez', () => {
  const scoreWith = (host) => {
    const state = game();
    put(state, 'cr', 'slithering-cryptid', 'p1', 'hand');
    if (host) {
      put(state, 'big', 'highland-game', 'p1');
      stat(state, 'big', { power: 5, toughness: 5 });
    }
    addMana(state, 'p1', 9);
    return decide(state).scores['cast_permanent(cr)'];
  };
  const bare = scoreWith(false);
  const hosted = scoreWith(true);
  // Sam: 76.5027 + (20−12)×0.9 (licznik na wchodzącym 2/3: 2+4+2×7=20).
  // Z 5/5: +36×0.9 zamiast +20×0.9 (licznik: 2+4+2×15=36).
  assert.ok(Math.abs(bare - 83.7027) < 1e-9, `Mutagen na wchodzącym: ${bare}`);
  assert.ok(Math.abs(hosted - 98.1027) < 1e-9, `Mutagen na 5/5: ${hosted}`);
});

test('PMSSB-2/A/F3: plot Tumbleweed skaluje greatest_power (G5 − G1 = 40, nie 0)', () => {
  const scoreWith = (p) => {
    const state = game();
    put(state, 'tw', 'tumbleweed-rising', 'p1', 'hand');
    put(state, 'b', 'goldmeadow-nomad', 'p1');
    stat(state, 'b', { power: p, toughness: p });
    addMana(state, 'p1', 9);
    return decide(state).scores.plot_card;
  };
  assert.equal(scoreWith(5) - scoreWith(1), 40, 'plot liczy ciało jak cast (waga spell = 1)');
});

test('PMSSB-2/A pokrętło: tokenManaBankWeight ×0 zdejmuje wartość Treasure', () => {
  const mk = () => {
    const state = game();
    put(state, 'tt', 'thieves-tools', 'p1', 'hand');
    addMana(state, 'p1', 9);
    return state;
  };
  const full = decide(mk()).scores['cast_permanent(tt)'];
  const zero = decide(mk(), { params: { tokenManaBankWeight: 0 } }).scores['cast_permanent(tt)'];
  // Δ = −3×0.9 (waga rodziny): pokrętło steruje, nie atrapa.
  assert.ok(Math.abs(full - 62.9973) < 1e-9, `bank ×3: ${full}`);
  assert.ok(Math.abs(zero - 60.2973) < 1e-9, `bank ×0: ${zero}`);
});

// =====================================================================
// Fala B — timing (F1 okna instantów + choroba; F2-flat zweryfikowane)
// =====================================================================
// Token wchodzi z chorobą (atak następną turę, blok od razu): EOT-własny
// (przed turą wroga — blok gotowy + max info) i declare_attackers-wroga
// (reaktywny chump z pełną informacją — okno Flurry) +swing; po blokach
// wroga (za późno na blok) −swing; mainy 0. Sorcery: main1 = main2
// (obie przed walką wroga — ten sam użytek; S4 70/70 POPRAWNE, nie luka).

/** Token-instant w danym oknie — wynik wariantu (do porównań okien). */
function tokenScoreAt(step, activeId, priorityId, cardId, setup) {
  const state = game(step, activeId, priorityId);
  put(state, 'tk', cardId, 'p1', 'hand');
  if (setup) setup(state);
  addMana(state, 'p1', 12);
  return decide(state).scores;
}

test('PMSSB-2/B params: tokenTimingSwing WŁĄCZONE (8, lustro bounce-F1)', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.tokenTimingSwing, 8);
});

test('PMSSB-2/B/F1: okna instantu — EOT-own (78) > main-own (70) > main2-foe (62)', () => {
  const eot = tokenScoreAt('end', 'p1', 'p1', 'raise-the-alarm')['cast_spell(tk->)'];
  const own = tokenScoreAt('main1', 'p1', 'p1', 'raise-the-alarm')['cast_spell(tk->)'];
  const late = tokenScoreAt('main2', 'p2', 'p1', 'raise-the-alarm')['cast_spell(tk->)'];
  assert.equal(eot, 78, `EOT-own = blok gotowy + max info: ${eot}`);
  assert.equal(own, 70, `main-own = neutralna (kotwica fali A trzyma): ${own}`);
  assert.equal(late, 62, `po walce wroga = token bezczynny cały cykl: ${late}`);
});

test('PMSSB-2/B/F1: reakcja na atak (78) vs po blokach (62) — okno chumpa', () => {
  const mk = (step) => (state) => {
    put(state, 'foe', 'goldmeadow-nomad', 'p2');
    stat(state, 'foe', { power: 3, toughness: 3 });
    state.combat = { attackers: ['foe'], attackingPlayerId: 'p2', blockers: new Map() };
  };
  const reactive = tokenScoreAt('declare_attackers', 'p2', 'p1', 'raise-the-alarm', mk())['cast_spell(tk->)'];
  const tooLate = tokenScoreAt('declare_blockers', 'p2', 'p1', 'raise-the-alarm', mk())['cast_spell(tk->)'];
  assert.equal(reactive, 78, `widzę atakujących → chump w punkt: ${reactive}`);
  assert.equal(tooLate, 62, `bloki zadeklarowane → token nie zablokuje: ${tooLate}`);
});

test('PMSSB-2/B/F1-ability: Canonized (instant-ACT) — reakcja +8 / po blokach −8 (L41 jak czar)', () => {
  // UWAGA ARCHITEKTONICZNA: EOT-własny NIE przechodzi przez pętlę efektów
  // zdolności — wastefulStep (pre-existing, tylko własna tura) zwiera WSZYSTKIE
  // activate_ability do −5/−30 (L6440). F1-ability dowodzimy więc w oknach WROGA
  // (klon testu czaru: reakcja vs po blokach), gdzie zwarcie nie obowiązuje.
  const scoreAt = (step, params) => {
    const state = game(step, 'p2', 'p1');
    put(state, 'cb', 'canonized-in-blood', 'p1');
    put(state, 'foe', 'goldmeadow-nomad', 'p2');
    stat(state, 'foe', { power: 3, toughness: 3 });
    state.combat = { attackers: ['foe'], attackingPlayerId: 'p2', blockers: new Map() };
    addMana(state, 'p1', 12);
    return decide(state, { params }).scores['activate_ability(cb#1)'];  // #1 = ACT (token); #0 to trigger
  };
  const reactive = scoreAt('declare_attackers');
  const tooLate = scoreAt('declare_blockers');
  const neutralDA = scoreAt('declare_attackers', { tokenTimingSwing: 0 });
  const neutralDB = scoreAt('declare_blockers', { tokenTimingSwing: 0 });
  assert.ok(reactive != null && tooLate != null, `zdolność oferowana w obu oknach: ${reactive} / ${tooLate}`);
  assert.equal(reactive - neutralDA, 8, `reaktywny chump z pełną informacją: ${reactive} vs ${neutralDA}`);
  assert.equal(tooLate - neutralDB, -8, `po blokach token nie zablokuje: ${tooLate} vs ${neutralDB}`);
  assert.equal(reactive - tooLate, 16, `rozpiętość okna jak u czaru: ${reactive} vs ${tooLate}`);
  assert.equal(neutralDA, neutralDB, `pokrętło ×0 spłaszcza (kotwica fali A): ${neutralDA}`);
});

test('PMSSB-2/B/F2-flat: Gather main1 = main2 (70 = 70) — POPRAWNE (obie mainy przed walką wroga)', () => {
  const pre = tokenScoreAt('main1', 'p1', 'p1', 'gather-the-townsfolk')['cast_spell(tk->)'];
  const post = tokenScoreAt('main2', 'p1', 'p1', 'gather-the-townsfolk')['cast_spell(tk->)'];
  assert.equal(pre, 70, `main1: ${pre}`);
  assert.equal(post, 70, `main2 = main1 (ten sam użytek tokena): ${post}`);
});

test('PMSSB-2/B guard: Flurry bez atakujących −70 (Z6 stoi); we własnej walce 80 (bez okna)', () => {
  const flat = tokenScoreAt('main1', 'p1', 'p1', 'flurry-of-wings')['cast_spell(tk->)'];
  assert.equal(flat, -70, `0 atakujących = karta w błoto: ${flat}`);
  const st = game('declare_attackers', 'p1');
  put(st, 'fl', 'flurry-of-wings', 'p1', 'hand');
  for (let i = 0; i < 3; i += 1) put(st, `a${i}`, 'goldmeadow-nomad', 'p1');
  st.combat = { attackers: ['a0', 'a1', 'a2'], attackingPlayerId: 'p1', blockers: new Map() };
  addMana(st, 'p1', 12);
  const { scores } = decide(st);
  assert.equal(scores['cast_spell(fl->)'], 80, `własna walka = bez premii okna: ${JSON.stringify(scores)}`);
});

test('PMSSB-2/B pokrętło: tokenTimingSwing ×0 spłaszcza okna (EOT = main)', () => {
  const mk = (step, active) => {
    const state = game(step, active, 'p1');
    put(state, 'tk', 'raise-the-alarm', 'p1', 'hand');
    addMana(state, 'p1', 12);
    return state;
  };
  const eot = decide(mk('end', 'p1')).scores['cast_spell(tk->)'];
  const eotFlat = decide(mk('end', 'p1'), { params: { tokenTimingSwing: 0 } }).scores['cast_spell(tk->)'];
  const main = decide(mk('main1', 'p1')).scores['cast_spell(tk->)'];
  assert.equal(eotFlat, main, `swing 0: EOT (${eot} → ${eotFlat}) = main (${main})`);
});
