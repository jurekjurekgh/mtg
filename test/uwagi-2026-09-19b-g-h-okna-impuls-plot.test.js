// =============================================================================
// P6 (paka uwag właściciela 2026-09-19b) — punkty G i H: okna czasowe.
//
// G — Caves of Chaos Adventurer: „attacked T25 po ukończonym lochu, wygnana
//   karta opisana »Impuls · zagrywalna do końca tury 27«", a Oracle obu gałęzi
//   mówi „you may play that card THIS TURN". Pomiar (2026-09-19b): silnik
//   stemplował okno jak dla Gili Courser („do końca TWOJEJ NASTĘPNEJ tury" =
//   numer + 2), więc okno było o turę za długie, a etykiety powtarzały kłamstwo.
//   Fix: okno jest DESKRYPTOREM DANYCH (`window: 'this_turn'` na efekcie karty,
//   ADR 0002); silnik bez deskryptora zostaje przy „next turn" (Gila Courser).
//
// H — Sheriff of Safe Passage: „plot nie działa — po zagraniu za koszt plotu
//   karta w exile, a następna tura oferuje rzut ZA PEŁNY koszt". Pomiar:
//   płatność JEST poprawna (rzut zaplotowanej karty zużywa 0 many), ale
//   ETYKIETA oferty mówiła „Zagraj: Sheriff of Safe Passage (koszt {2}{W})" —
//   gracz nie miał z czego poznać, że to rzut z wygnania bez kosztu. Ta sama
//   luka dotyczyła impulsu (darmowego i płatnego). Fix: jedna reguła etykiety
//   dla kart CZEKAJĄCYCH w wygnaniu (plot/impuls) + status kafla mówiący
//   o oknie impulsu także wtedy, gdy rzut jest płatny.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { commandLabel, rulesText, waitingExileStatus } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
};

/** Efekt ataku karty — źródło prawdy dla pinów (nie literał w teście). */
function attackEffect(cardId) {
  const card = REGISTRY.get(cardId);
  const ability = card.abilities.find((a) => a.trigger?.event === 'attacks');
  assert.ok(ability, `${cardId}: zdolność ataku`);
  return (Array.isArray(ability.effect) ? ability.effect : [ability.effect])[0];
}

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, plot: def.plot ?? null, ...extra,
  });
  return state.objects.get(id);
}

function game({ turn = 25, lands = 0, landId = 'basic-mountain' } = {}) {
  const state = createGameState({ seed: 25, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.number = turn;
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < lands; i += 1) put(state, `land${i}`, landId, 'p1');
  return state;
}

/** Wygnanie wierzchu biblioteki efektem ataku karty (jak trigger). */
function impulseExile(state, cardId, { room = 9, libraryCard = 'hill-giant' } = {}) {
  put(state, 'lib0', libraryCard, 'p1', 'library', { kind: 'creature' });
  state.undercityProgress = { p1: room };
  applyEffect(state, attackEffect(cardId),
    { id: 'src', controllerId: 'p1', cardId, zone: 'battlefield' }, []);
  return [...state.objects.values()].find((o) => o.zone === 'exile');
}

// Karta wygnana impulsem to WIERZCH biblioteki (w scenach: Hill Giant), nie
// źródło zdolności — wpis w wygnaniu szukamy po niej.
const exileEntry = (state, cardId = 'hill-giant') => playerView(state, 'p1').zones.exile.find((e) => e.cardId === cardId);

// ---------------------------------------------------------------------------
// G — Caves of Chaos Adventurer: okno „this turn"
// ---------------------------------------------------------------------------

test('G/1: dane karty niosą okno („this_turn”), a Gila Courser zostaje przy „next turn”', () => {
  assert.equal(attackEffect('caves-of-chaos-adventurer').window, 'this_turn',
    'Caves of Chaos Adventurer: Oracle „this turn” → deskryptor okna (ADR 0002)');
  assert.equal(attackEffect('gila-courser').window, undefined,
    'Gila Courser: „until the end of your NEXT turn” — bez deskryptora (domyślne okno)');
});

test('G/2: stempel okna kończy się w turze zdolności (this turn), nie w następnej', () => {
  const caves = impulseExile(game({ turn: 25 }), 'caves-of-chaos-adventurer');
  assert.equal(caves.playableUntilTurn, 25,
    'zagranie w turze 25 → okno kończy się w turze 25 (a nie 27)');
  assert.equal(caves.playableWithoutPaying, true, 'po ukończonym lochu — bez kosztu many');
  // Anty-over-fix: Gila Courser (inna karta, to samo pole stempla) zostaje
  // przy „do końca twojej następnej tury".
  const gila = impulseExile(game({ turn: 25 }), 'gila-courser');
  assert.equal(gila.playableUntilTurn, 27, 'Gila: tura 25 + 2 — okno następnej tury bez zmian');
});

test('G/3: okno nie przeżywa swojej tury — oferta znika (CR 601.2b)', () => {
  const state = game({ turn: 25 });
  const exiled = impulseExile(state, 'caves-of-chaos-adventurer');
  assert.ok(playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_permanent' && c.objectId === exiled.id), 'oferta w turze 25');
  state.turn.number = 26;
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  assert.ok(!playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_permanent' && c.objectId === exiled.id),
  'w turze 26 okno „this turn” już nie żyje');
});

test('G/4: etykiety (kafel + oferta) mówią o turze okna i o braku kosztu', () => {
  const state = game({ turn: 25 });
  const exiled = impulseExile(state, 'caves-of-chaos-adventurer');
  const entry = exileEntry(state);
  assert.equal(waitingExileStatus(entry),
    'Impuls · zagrywalna do końca tury 25 · bez kosztu many');
  const view = playerView(state, 'p1');
  const offer = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === exiled.id);
  assert.ok(offer, 'oferta rzutu z wygnania');
  const label = commandLabel(offer, SESSION, view);
  assert.match(label, /Zagraj z wygnania \(Impuls\)/);
  assert.match(label, /bez kosztu many, do końca tury 25/);
  assert.doesNotMatch(label, /koszt <span/, 'darmowy impuls nie pokazuje kosztu many');
});

test('G/5: płatny impuls pokazuje koszt I numer tury okna (nie udaje darmowego)', () => {
  const state = game({ turn: 25, lands: 4 });
  const exiled = impulseExile(state, 'caves-of-chaos-adventurer', { room: 3 });
  assert.equal(exiled.playableUntilTurn, 25, 'bez ukończonego lochu okno też jest „this turn”');
  assert.notEqual(exiled.playableWithoutPaying, true, 'ale za pełny koszt many');
  const view = playerView(state, 'p1');
  const offer = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === exiled.id);
  assert.ok(offer, 'oferta przy 4 lądach (Hill Giant {3}{R})');
  const label = commandLabel(offer, SESSION, view);
  assert.match(label, /\(Impuls\)/);
  assert.match(label, /koszt <span/, 'płatny impuls pokazuje koszt');
  assert.match(label, /do końca tury 25/);
  assert.equal(waitingExileStatus(exileEntry(state)),
    'Impuls · zagrywalna do końca tury 25 · za pełny koszt');
});

test('G/6: opis zdolności w linii reguł mówi to samo co stempel (this turn vs next turn)', () => {
  const cavesLine = rulesText({ abilities: [REGISTRY.get('caves-of-chaos-adventurer')
    .abilities.find((a) => a.trigger?.event === 'attacks')], keywords: [], subtypes: [] });
  assert.match(cavesLine, /w tej turze/);
  assert.doesNotMatch(cavesLine, /następnej tury/);
  const gilaLine = rulesText({ abilities: [REGISTRY.get('gila-courser')
    .abilities.find((a) => a.trigger?.event === 'attacks')], keywords: [], subtypes: [] });
  assert.match(gilaLine, /do końca swojej następnej tury/);
});

// ---------------------------------------------------------------------------
// H — Sheriff of Safe Passage: plot (i impuls) to rzut z WYGNANIA, nie z ręki
// ---------------------------------------------------------------------------

test('H/1: plot przenosi kartę do exile, a rzut w następnej turze jest DARMOWY i tak opisany', () => {
  const state = game({ turn: 25, lands: 3, landId: 'basic-plains' });
  put(state, 'sheriff', 'sheriff-of-safe-passage', 'p1', 'hand');
  const view25 = playerView(state, 'p1');
  const plot = view25.legalCommands.find((c) => c.type === 'plot_card');
  assert.ok(plot, 'oferta plotu w main przy 3 lądach (Plot {1}{W})');
  assert.match(commandLabel(plot, SESSION, view25), /^Plotuj: Sheriff of Safe Passage/);
  assert.ok(execute(state, plot).ok);
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'sheriff-of-safe-passage');
  assert.equal(exiled.zone, 'exile', 'zaplotowana karta leży w wygnaniu');
  assert.equal(exiled.plotted, true);
  assert.equal(exiled.plottedAtTurn, 25, 'stempel tury zaplotowania');

  // Ta sama tura: CR 702.170d — rzut dopiero „on a later turn”.
  assert.ok(!playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_permanent' && c.objectId === exiled.id),
  'w turze zaplotowania nie ma oferty rzutu');

  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.number = 26;
  const view26 = playerView(state, 'p1');
  const offer = view26.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === exiled.id);
  assert.ok(offer, 'w następnej turze oferta rzutu z wygnania');
  const label = commandLabel(offer, SESSION, view26);
  assert.match(label, /Zagraj z wygnania \(Plot\)/, 'etykieta mówi o plocie, nie o zwykłym rzucie');
  assert.match(label, /bez kosztu many/);
  assert.doesNotMatch(label, /koszt <span/, 'plot nie płaci kosztu many — etykieta nie może go pokazywać');
  assert.match(waitingExileStatus(playerView(state, 'p1').zones.exile
    .find((e) => e.cardId === 'sheriff-of-safe-passage')),
  /^Plot · rzut bez kosztu od tury 26/);

  // Pomiar płatności: pula bez zmian, zdarzenie z kosztem 0.
  const manaBefore = state.players[0].mana;
  assert.ok(execute(state, offer).ok);
  assert.equal(state.players[0].mana, manaBefore, 'rzut zaplotowanej karty nie zużywa many');
  const cast = state.events.find((e) => e.type === 'permanent_cast' && e.object?.cardId === 'sheriff-of-safe-passage');
  assert.ok(cast, 'zdarzenie rzutu');
  assert.equal(cast.manaSpent ?? 0, 0, 'manaSpent 0 — plot nie płaci kosztu many');
});

test('H/2: zwykła karta z ręki zachowuje etykietę z kosztem (brak over-fixu)', () => {
  const state = game({ turn: 25, lands: 3, landId: 'basic-plains' });
  put(state, 'sheriff', 'sheriff-of-safe-passage', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const cast = view.legalCommands.find((c) => c.type === 'cast_permanent');
  assert.ok(cast, 'zwykły rzut z ręki');
  const label = commandLabel(cast, SESSION, view);
  assert.match(label, /^Zagraj: Sheriff of Safe Passage \(koszt <span/);
  assert.doesNotMatch(label, /z wygnania/);
});
