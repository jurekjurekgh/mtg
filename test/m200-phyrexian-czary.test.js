// M200/N2 (audyt PR #70, CR 118.9 + L23): phyrexian pips w CZARACH.
//
// Batch 48 (Ruthless Invasion {3}{R/P}) przyniósł PIERWSZY czar z pitem
// phyrexian. Ścieżka permanentów (cast_permanent) od Batcha 11 zna warianty
// phyrexianPayWithLife (mana LUB 2 życia), a ścieżka czarów (legalSpellCasts/
// castSpell) ich nie znała:
//   1. koszt liczony BEZ pipa — {3}{R/P} rzucane za 3 many zamiast 4
//      (karta o manę tańsza — klasa L23/B3);
//   2. bramka kolorów zawsze z pitem {R} — gracz bez czerwieni nie miał
//      oferty, choć CR 118.9 pozwala zapłacić 2 życiem;
//   3. wariant życiowy nie istniał (brak komendy z phyrexianPayWithLife).
// Fix = lustro ścieżki permanentów (oferta, walidacja, płatność, UI, bot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { producibleMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Gra w Głównej 1 gracza p1: pula many wprost (manaPool), lądy na stole. */
function game({ life = 20, pool = {}, battlefield = [], hand = [] }) {
  const state = createGameState({ seed: 200, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const p1 = state.players.find((p) => p.id === 'p1');
  p1.life = life;
  p1.mana = Object.values(pool).reduce((a, b) => a + b, 0);
  p1.manaPool = pool;
  let n = 0;
  for (const cardId of battlefield) putCard(state, `b${n++}`, cardId, 'p1');
  for (const cardId of hand) putCard(state, `h${n++}`, cardId, 'p1', 'hand');
  return state;
}

const spells = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'cast_spell');

// ---- N2/1: oferta — płatność życiem bez czerwonego źródła (CR 118.9) --------

test('M200/N2: Ruthless Invasion — 3 many bez czerwieni + 10 życia = oferta za 2 życia', () => {
  const state = game({ life: 10, pool: { '': 3 }, hand: ['ruthless-invasion'] });
  const casts = spells(state).filter((c) => c.objectId === 'h0');
  assert.equal(casts.length, 1, 'dokładnie jeden wariant (życiowy) — brak czerwieni = bez wariantu manowego');
  assert.equal(casts[0].phyrexianPayWithLife, 1, 'wariant opłacony 2 życiami');
});

test('M200/N2: 4 czerwone many = oba warianty, manowy PIERWSZY (najtańszy)', () => {
  const state = game({
    life: 20, pool: {}, battlefield: ['basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-mountain'],
    hand: ['ruthless-invasion'],
  });
  const casts = spells(state).filter((c) => c.objectId === 'h4');
  assert.deepEqual(casts.map((c) => c.phyrexianPayWithLife ?? 0), [0, 1],
    'k=0 (mana) przed k=1 (życie) — konwencja cast_permanent: najtańszy pierwszy');
});

// ---- N2/2: koszt — {3}{R/P} za manę to 4 many, nie 3 (L23/B3) --------------

test('M200/N2: rzut za manę kosztuje 4 many (pip to pełna jednostka)', () => {
  const state = game({
    life: 20, pool: {}, battlefield: ['basic-mountain', 'basic-mountain', 'basic-mountain', 'basic-mountain'],
    hand: ['ruthless-invasion'],
  });
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'h4', targets: [] });
  assert.ok(res.ok, 'rzut za maną legalny');
  assert.equal(producibleMana(state, 'p1'), 0,
    'Oracle {3}{R/P} = 3 generyczne + pip {R} = 4 many; przed fixem zostawała 1');
  assert.equal(state.zones.stack.length, 1, 'czar na stosie');
});

// ---- N2/3: płatność życiem — 2 życia, zero many ----------------------------

test('M200/N2: wariant życiowy — pip za 2 życia, część generyczna za manę', () => {
  const state = game({ life: 10, pool: { '': 3 }, hand: ['ruthless-invasion'] });
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'h0', targets: [], phyrexianPayWithLife: 1 });
  assert.ok(res.ok, 'rzut legalny (CR 118.9: {R/P} = 2 życia)');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 8, '2 życia za pip {R/P}');
  assert.equal(producibleMana(state, 'p1'), 0, '{3} generyczne płaci maną (razem 3 many + 2 życia)');
  assert.equal(state.zones.stack.length, 1, 'czar na stosie');
});

test('M200/N2: 1 życie = wariant życiowy NIE jest oferowany', () => {
  const state = game({ life: 1, pool: { '': 3 }, hand: ['ruthless-invasion'] });
  const casts = spells(state).filter((c) => c.objectId === 'h0');
  assert.equal(casts.length, 0, '2 życia > 1 dostępne — płatność niewykonalna (CR 118.9)');
});

// ---- N2/4: walidacja spójna z ofertą (L48) ----------------------------------

test('M200/N2: execute odrzuca k przekraczające liczbę pipsów', () => {
  const state = game({ life: 20, pool: { '': 3 }, hand: ['ruthless-invasion'] });
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'h0', targets: [], phyrexianPayWithLife: 2 });
  assert.ok(!res.ok, 'k=2 > liczba pipsów {R/P}=1 — nielegalne');
  assert.equal(state.zones.stack.length, 0, 'odrzucony rzut nie zmienia stanu (L4)');
});

test('M200/N2: execute odrzuca płatność życiem przy za małym życiu', () => {
  const state = game({ life: 1, pool: { '': 3 }, hand: ['ruthless-invasion'] });
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'h0', targets: [], phyrexianPayWithLife: 1 });
  assert.ok(!res.ok, '1 życie < 2 — nie da się zapłacić');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 1, 'życie nietknięte po odrzuceniu');
});

// ---- N2/5: anty-over-fix — czary bez pipsów phyrexian bez zmian ------------

test('M200/N2: anty-over-fix — czar bez phyrexian bez pola wariantu, koszt bez zmian', () => {
  // Raise the Alarm {1}{W} (bez celu) — zwykły pip kolorowy; oferta i płatność
  // bez phyrexianPayWithLife.
  const state = game({ life: 20, pool: { '': 1 }, battlefield: ['basic-plains'], hand: ['raise-the-alarm'] });
  const casts = spells(state).filter((c) => c.objectId === 'h1');
  assert.equal(casts.length, 1, 'oferta Raise the Alarm istnieje');
  assert.equal(casts[0].phyrexianPayWithLife, undefined, 'brak pipsów phyrexian = brak wariantu');
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'h1', targets: [] });
  assert.ok(res.ok, 'rzut legalny');
  assert.equal(producibleMana(state, 'p1'), 0, '{1}{W} = 2 many');
});

// ---- N2/6: log nazywa wybór płatności (L24 — ciche skutki nie istnieją) -----

test('M200/N2: zdarzenie spell_cast niesie dane phyrexian; log nazywa wybór', async () => {
  const state = game({ life: 10, pool: { '': 3 }, hand: ['ruthless-invasion'] });
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'h0', targets: [], phyrexianPayWithLife: 1 });
  const ev = state.events.find((e) => e.type === 'spell_cast');
  assert.equal(ev.phyrexianSymbols, 1, 'zdarzenie niesie liczbę pipsów');
  assert.equal(ev.phyrexianPaidWithLife, 1, 'zdarzenie niesie wybór życiowy');
  const { describeGameEvent } = await import('../src/table/session.js');
  const line = describeGameEvent(ev, {
    nameOf: () => 'Ruthless Invasion', nameOfObject: () => '?', isPlayer: (id) => id === 'p1',
  }, { p1: 'Ty' });
  assert.match(line, /1× po 2 życia/, `opis nazywa płatność życiem: ${line}`);
});
