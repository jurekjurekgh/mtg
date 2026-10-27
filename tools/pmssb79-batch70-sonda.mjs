// PMSSB-79 (batch 70) — sonda POMIARU PRZED / PO dla wyceny bota.
// Uruchomienie: node tools/pmssb79-batch70-sonda.mjs
//
// Rodziny nowych mechanik batcha 70 (inwentarz: PLAN_2026-10-27b-pmssb79-batch70.md):
//   1. `xCost` + `cast_permanent {xValue}`  — Magma Pummeler: czy X wchodzi
//      do wyceny (ciało + liczniki + koszt many), czy wszystkie warianty remisują.
//   2. prewencja zdejmująca liczniki (CR 615.1a) — czy symulacja przeżycia
//      widzi liczniki jako bufor obrażeń.
//   3. Improvise (bliźniak convoke PMSSB-72) — czy tapnięcie artefaktu jest
//      karane jak tapnięcie stwora przy convoke.
//   4. `cantBeBlockedByTypes` (bliźniak `cantBeBlockedByKeywords`, PMSSB-60/E).
//   5. trigger `manifest_dread_resolved` (Paranormal Analyst).
//   6. `amountFromGraveyardCardType` (Moldgraf Millipede) — kwota licznika.
//   7. Converge: `damage { amount: 'colors_of_mana_spent' }` (Kaleidoscorch).
//   8. `onlyIfKicked` + `anotherTarget` (Jilt) — drugi cel przy kickerze.
//
// Sonda NIE jest testem zachowania — to tabela do audytu; piny są w
// test/audyt-pmssb79-batch70.test.js.
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addCounter } from '../src/engine/counters.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import {
  botTurn, putSynthCreature, putSynthNoncreature,
} from './pmssb63-batch68-sonda.mjs';

const REGISTRY = createCardRegistry();

/**
 * Karta z rejestru w dowolnej strefie — z PEŁNYM zestawem deskryptorów
 * (`gameObjectDataOf`), bo helper `putCard` sondy PMSSB-63 kopiuje pola
 * ręcznie i gubi m.in. `xCost` (wtedy sonda mierzy inną kartę niż realna).
 */
function put(state, id, cardId, controllerId, zone, overrides = {}) {
  const def = REGISTRY.get(cardId);
  if (!def) throw new Error(`karta ${cardId} nieznana`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], ...overrides,
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  return state.objects.get(id);
}

/** Maks. score wariantów komendy o danym prefiksie (null = brak oferty). */
export function scoreOf(bot, prefix) {
  const opts = bot.trace().at(-1)?.options ?? [];
  const hit = opts.filter((o) => o?.cmd?.startsWith(prefix)).map((o) => o.score);
  return hit.length ? Math.max(...hit) : null;
}

/** Wszystkie warianty (cmd + score) o prefiksie — do tabel X. */
export function optionsOf(bot, prefix) {
  const opts = bot.trace().at(-1)?.options ?? [];
  return opts.filter((o) => o?.cmd?.startsWith(prefix)).map((o) => ({ cmd: o.cmd, score: o.score }));
}

const trace = (state, params) => {
  const bot = createHeuristicBot({ seed: 79, params });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  return { bot, cmd };
};

const fmt = (v) => (v == null ? 'brak' : v.toFixed(2));

// ── 1. X w koszcie permanentu ────────────────────────────────────────────────
/** Stół: Magma Pummeler w ręce, X many w puli (X = 0..5). */
export function xTable({ pool = 6 } = {}) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', pool, { colors: ['R', 'R'] });
  put(state, 'x', 'magma-pummeler', 'p2', 'hand');
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  return state;
}

export function probeXVariants() {
  const state = xTable();
  const { bot } = trace(state);
  // Etykieta komendy nie niesie X — warianty rozpoznajemy po `xValue` z trace.
  const opts = bot.trace().at(-1)?.options ?? [];
  return opts.filter((o) => o?.cmd?.startsWith('cast_permanent(x'))
    .map((o) => ({ xValue: o.xValue ?? o.command?.xValue ?? null, score: o.score }));
}

// ── 2. prewencja zdejmująca liczniki ────────────────────────────────────────
/**
 * Stół do decyzji BLOKU: wróg atakuje 3/3, ja mam Magma Pummeler z N licznikami.
 * Dobry gracz: przy N ≥ 3 blokuje i zabija atakującego bez straty własnej
 * (obrażenia zapobiegnięte, zdjęte 3 liczniki, ciało przeżywa z 0/0 → SBA?
 * NIE: 3 liczniki = +3/+3, po zdjęciu 3 zostaje 0/0 z 0 obrażeń).
 */
export function blockTable({ counters = 0, attackers = 1, toughness = 3 } = {}) {
  // Sekwencja jak w test/audyt-pmssb31-blok-chump.test.js: deklaracja ataku
  // komendą silnika, potem przejście do kroku bloków (inaczej `state.combat`
  // nie istnieje i bot nie dostaje żadnej oferty bloku).
  const state = createGameState({ seed: 79, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'pummel', 'magma-pummeler', 'p2', 'battlefield');
  if (counters > 0) addCounter(state, 'pummel', '+1/+1', counters);
  const attackerIds = [];
  for (let i = 0; i < attackers; i += 1) {
    putSynthCreature(state, `a${i}`, 'p1', { power: 3, toughness, mv: 3 });
    attackerIds.push(`a${i}`);
  }
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  if (!r.ok) throw new Error(`deklaracja ataku odrzucona: ${JSON.stringify(r)}`);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

/** Ocena wariantów bloku: czy bot blokuje i jaką cenę widzi. */
export function probeBlock({ counters }) {
  const state = blockTable({ counters });
  const bot = createHeuristicBot({ seed: 79 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const options = (bot.trace().at(-1)?.options ?? []).map((o) => ({ cmd: o.cmd, score: o.score }));
  const pass = options.find((o) => o.cmd === 'pass_priority');
  const block = options.find((o) => o.cmd.startsWith('block['));
  return { options, pass: pass?.score ?? null, block: block?.score ?? null, chosen: options
    .reduce((a, b) => (b.score > (a?.score ?? -Infinity) ? b : a), null)?.cmd };
}

// ── 3. Improvise ────────────────────────────────────────────────────────────
/** Fen Hauler w ręce + N artefaktów na stole (tapnięcie zamiast many). */
export function improviseTable({ artifacts = 0, mana = 7 } = {}) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', mana, { colors: ['B'] });
  put(state, 'x', 'fen-hauler', 'p2', 'hand');
  for (let i = 0; i < artifacts; i += 1) {
    putSynthNoncreature(state, `art${i}`, 'p2', { types: ['Artifact'], mv: 2 });
  }
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  return state;
}

export function probeImprovise({ artifacts = 0, mana = 7 }) {
  const state = improviseTable({ artifacts, mana });
  const { bot } = trace(state);
  const opts = bot.trace().at(-1)?.options ?? [];
  return opts.filter((o) => o?.cmd?.startsWith('cast_permanent(x'))
    .map((o) => ({ cmd: o.cmd, score: o.score, improvise: (o.command?.improvisePayments ?? []).length }));
}

// ── 4. ewazja po typie blokera ──────────────────────────────────────────────
/** Fen Hauler na stole; bloker artefakt-stwór vs zwykły stwór 2/2. */
export function evasionTable({ artifactBlocker = false, size = 2 } = {}) {
  const state = botTurn({ life: 20 });
  put(state, 'hauler', 'fen-hauler', 'p2', 'battlefield');
  if (artifactBlocker) {
    addObject(state, {
      id: 'b1', instanceId: 'i-b1', cardId: 'synth-art-creature', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'creature', types: ['Artifact', 'Creature'],
      subtypes: [], power: size, toughness: size, manaCost: size, keywords: [], abilities: [], colors: [],
    });
  } else {
    putSynthCreature(state, 'b1', 'p1', { power: size, toughness: size, mv: size });
  }
  // Faza ataku: atakujący = Fen Hauler.
  state.turn = {
    ...state.turn, activePlayerId: 'p2', priorityPlayerId: 'p2',
    phase: 'combat', step: 'declare_attackers',
  };
  return state;
}

export function probeEvasion({ artifactBlocker, size = 6 }) {
  const state = evasionTable({ artifactBlocker, size });
  const bot = createHeuristicBot({ seed: 79 });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  const opts = (bot.trace().at(-1)?.options ?? []).map((o) => ({ cmd: o.cmd, score: o.score }));
  const pass = opts.find((o) => o.cmd === 'pass_priority');
  const attack = opts.filter((o) => o.cmd.startsWith('attack'));
  return { chosen: cmd?.type, pass: pass?.score ?? null, attack: attack.map((o) => o.cmd), options: opts };
}

// ── 5. trigger manifest dread ───────────────────────────────────────────────
/** Paranormal Analyst w ręce; w grobie 0 / 2 karty (trigger zwraca jedną). */
export function manifestTable({ graveyard = 0, enabler = false } = {}) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', 2, { colors: ['U'] });
  put(state, 'x', 'paranormal-analyst', 'p2', 'hand');
  // Aktywator manifest dread (karta z efektem `manifest_dread`) — bramka M429.
  if (enabler) put(state, 'enabler', 'manifest-dread', 'p2', 'hand');
  for (let i = 0; i < graveyard; i += 1) put(state, `g${i}`, 'snarling-wolf', 'p2', 'graveyard');
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  return state;
}

export function probeManifest({ graveyard = 0, enabler = false, params = undefined }) {
  const state = manifestTable({ graveyard, enabler });
  const { bot } = trace(state, params);
  return scoreOf(bot, 'cast_permanent(x');
}

// ── 6. licznik „za kartę typu w cmentarzu” ─────────────────────────────────
/** Moldgraf Millipede w ręce; w grobie 0 / 3 karty stworów. */
export function millipedeTable({ creatures = 0 } = {}) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', 5, { colors: ['G'] });
  put(state, 'x', 'moldgraf-millipede', 'p2', 'hand');
  for (let i = 0; i < creatures; i += 1) put(state, `g${i}`, 'snarling-wolf', 'p2', 'graveyard');
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  return state;
}

export function probeMillipede({ creatures = 0, params = undefined }) {
  const state = millipedeTable({ creatures });
  const { bot } = trace(state, params);
  // Moldgraf to STWÓR — oferta to `cast_permanent`.
  return scoreOf(bot, 'cast_permanent(x');
}

// ── 7. Converge (Kaleidoscorch) ─────────────────────────────────────────────
/** Kaleidoscorch w ręce; mana jednokolorowa vs czterokolorowa. */
export function convergeTable({ colors = 1 } = {}) {
  const state = botTurn({ life: 20 });
  const palette = colors >= 4 ? ['R', 'G', 'W', 'U'] : ['R'];
  for (let i = 0; i < 4; i += 1) {
    addMana(state, 'p2', 1, { colors: [palette[i % palette.length]] });
  }
  put(state, 'x', 'kaleidoscorch', 'p2', 'hand');
  putSynthCreature(state, 'f1', 'p1', { power: 4, toughness: 4, mv: 4 });
  return state;
}

export function probeConverge({ colors = 1, params = undefined }) {
  const state = convergeTable({ colors });
  const { bot } = trace(state, params);
  return scoreOf(bot, 'cast_spell(x');
}

// ── 8. Jilt: drugi cel przy kickerze ───────────────────────────────────────
/** Jilt w ręce; 2 stwory wroga (mały + duży), mana na kicker lub nie. */
export function jiltTable({ kicked = true, big = true } = {}) {
  const state = botTurn({ life: 20 });
  addMana(state, 'p2', kicked ? 4 : 2, { colors: ['U', 'R'] });
  put(state, 'x', 'jilt', 'p2', 'hand');
  putSynthCreature(state, 'f1', 'p1', { power: 2, toughness: 2, mv: 2 });
  if (big) putSynthCreature(state, 'f2', 'p1', { power: 5, toughness: 5, mv: 5 });
  return state;
}

export function probeJilt({ kicked = true, big = true }) {
  const state = jiltTable({ kicked, big });
  const { bot } = trace(state);
  return optionsOf(bot, 'cast_spell(x');
}

// ── Raport ──────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('── 1. X w koszcie permanentu (Magma Pummeler) ──');
  for (const entry of probeXVariants()) console.log(`   X=${entry.xValue} → ${fmt(entry.score)}`);

  console.log('── 2. prewencja zdejmująca liczniki (blok 3/3) ──');
  for (const counters of [0, 1, 3]) {
    const r = probeBlock({ counters });
    console.log(`   liczniki=${counters} → pass=${fmt(r.pass)} blok=${fmt(r.block)} wybór=${r.chosen}`);
  }

  console.log('── 3. Improvise (Fen Hauler) ──');
  for (const artifacts of [0, 2]) {
    console.log(`   artefakty=${artifacts}:`);
    for (const entry of probeImprovise({ artifacts })) {
      console.log(`      ${entry.cmd} (tapnięte artefakty=${entry.improvise}) → ${fmt(entry.score)}`);
    }
  }

  console.log('── 4. ewazja po typie blokera (Fen Hauler, bloker 6/6) ──');
  for (const artifactBlocker of [false, true]) {
    const r = probeEvasion({ artifactBlocker, size: 6 });
    console.log(`   bloker-artefakt=${artifactBlocker} → pass=${fmt(r.pass)} atak=${r.attack.join(' | ') || 'brak'}`);
  }

  console.log('── 5. trigger manifest dread (Paranormal Analyst) ──');
  for (const enabler of [false, true]) {
    for (const graveyard of [0, 2]) {
      console.log(`   aktywator=${enabler} grób=${graveyard} → ${fmt(probeManifest({ graveyard, enabler }))}`);
    }
  }

  console.log('── 6. licznik z cmentarza (Moldgraf Millipede) ──');
  for (const creatures of [0, 3]) {
    console.log(`   stwory w grobie=${creatures} → ${fmt(probeMillipede({ creatures }))}`);
  }

  console.log('── 7. Converge (Kaleidoscorch) ──');
  for (const colors of [1, 4]) {
    console.log(`   kolory many=${colors} → ${fmt(probeConverge({ colors }))}`);
  }

  console.log('── 8. Jilt: warianty przy kickerze ──');
  for (const entry of probeJilt({ kicked: true, big: true })) {
    console.log(`   ${entry.cmd} → ${fmt(entry.score)}`);
  }
}
