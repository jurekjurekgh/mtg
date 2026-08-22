// M177 — Batch 42 (lista właściciela 2026-08-22). Transza A.
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function resolveStack(state, max = 12) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

// ---- Transza A ----------------------------------------------------------------

test('A1: Swooping Protector — flash+flying, wchodzi z licznikiem shield', () => {
  const def = REGISTRY.get('swooping-protector');
  assert.deepEqual(def.keywords, ['flash', 'flying']);
  assert.deepEqual(def.entersWithCounters, { shield: 1 });
  assert.equal(def.artId, 379);
  const state = game('p1');
  putCard(state, 'bird', 'swooping-protector', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'bird');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'swooping-protector' && o.zone === 'battlefield');
  assert.ok(onBoard, 'ptak na polu bitwy');
  assert.equal(onBoard.counters?.shield, 1, 'licznik shield z wejścia');
});

test('A2: shield konsumuje destroy — ptak przeżywa bez licznika', () => {
  const state = game('p1');
  putCard(state, 'bird', 'swooping-protector', 'p1', 'battlefield');
  // addObject nie przenosi `counters` z patcha — licznik nakładamy wprost.
  state.objects.set('bird', Object.freeze({ ...state.objects.get('bird'), counters: Object.freeze({ shield: 1 }) }));
  const bird = state.objects.get('bird');
  applyEffect(state, { type: 'destroy_permanent' }, bird, ['bird']);
  const after = state.objects.get('bird');
  assert.equal(after.zone, 'battlefield', 'przeżył destroy');
  assert.ok(!(after.counters?.shield > 0), 'shield zużyty');
  assert.ok(state.events.some((e) => e.type === 'shield_consumed'), 'zdarzenie shield_consumed');
});

test("A3: You're Not Alone — +2/+2 przy <3 stworach, +4/+4 przy 3+", () => {
  // Wariant 1: tylko cel na stole → +2/+2.
  const s1 = game('p1');
  putCard(s1, 'yna', 'youre-not-alone', 'p1', 'hand');
  putCard(s1, 'me', 'highland-game', 'p1');
  addMana(s1, 'p1', 1, { colors: ['W'] });
  const cast1 = playerView(s1, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'yna' && c.targets?.[0] === 'me');
  assert.ok(cast1, 'oferta na własnego stwora');
  assert.ok(execute(s1, cast1).ok);
  assert.ok(resolveStack(s1));
  assert.equal(s1.objects.get('me').powerModifier, 2, '+2 mocy');
  assert.equal(s1.objects.get('me').toughnessModifier, 2, '+2 wytrzymałości');

  // Wariant 2: trzy własne stwory przy ROZSTRZYGANIU → +4/+4 zamiast +2/+2.
  const s2 = game('p1');
  putCard(s2, 'yna', 'youre-not-alone', 'p1', 'hand');
  putCard(s2, 'me', 'highland-game', 'p1');
  putCard(s2, 'me2', 'highland-game', 'p1');
  putCard(s2, 'me3', 'highland-game', 'p1');
  addMana(s2, 'p1', 1, { colors: ['W'] });
  const cast2 = playerView(s2, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'yna' && c.targets?.[0] === 'me');
  assert.ok(execute(s2, cast2).ok);
  assert.ok(resolveStack(s2));
  assert.equal(s2.objects.get('me').powerModifier, 4, '+4 mocy (instead)');
  assert.equal(s2.objects.get('me').toughnessModifier, 4, '+4 wytrzymałości (instead)');
});

test('A4: Agate Assault tryb 1 — 4 obrażenia zabijają i WYGANIAJĄ (nie grób)', () => {
  const state = game('p1');
  putCard(state, 'agate', 'agate-assault', 'p1', 'hand');
  putCard(state, 'foe', 'highland-game', 'p2'); // 2/1
  addMana(state, 'p1', 3, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'agate' && c.modeIndex === 0 && c.targets?.[0] === 'foe');
  assert.ok(cast, 'oferta trybu obrażeń');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const foe = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.controllerId === 'p2');
  assert.equal(foe.zone, 'exile', 'zamiast do grobu — na wygnanie');
});

test('A4b: znacznik działa na KAŻDĄ śmierć w tej turze (przeżył Agate, zginął później)', () => {
  const state = game('p1');
  putCard(state, 'agate', 'agate-assault', 'p1', 'hand');
  putCard(state, 'big', 'segmented-krotiq', 'p2'); // 6/5 — przeżyje 4 obrażenia
  addMana(state, 'p1', 3, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'agate' && c.modeIndex === 0 && c.targets?.[0] === 'big');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const big = state.objects.get('big');
  assert.equal(big.zone, 'battlefield', 'przeżył 4 obrażenia');
  // Ginie w TEJ SAMEJ turze z innego źródła — nadal wygnanie (CR 614.6).
  applyEffect(state, { type: 'destroy_permanent' }, big, ['big']);
  const after = [...state.objects.values()].find((o) => o.cardId === 'segmented-krotiq');
  assert.equal(after.zone, 'exile', 'śmierć z innego źródła też → exile');
});

test('A4c: Agate Assault tryb 2 — wygnanie artefaktu', () => {
  const state = game('p1');
  putCard(state, 'agate', 'agate-assault', 'p1', 'hand');
  putCard(state, 'bomb', 'panic-spellbomb', 'p2');
  addMana(state, 'p1', 3, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'agate' && c.modeIndex === 1 && c.targets?.[0] === 'bomb');
  assert.ok(cast, 'oferta trybu artefaktowego');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const bomb = [...state.objects.values()].find((o) => o.cardId === 'panic-spellbomb');
  assert.equal(bomb.zone, 'exile', 'artefakt wygnany');
});

// ---- Transza B ----------------------------------------------------------------

test('B1: Makeshift Mauler — rzut WYMAGA wygnania karty stwora z własnego grobu', () => {
  const state = game('p1');
  putCard(state, 'mauler', 'makeshift-mauler', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['U'] });
  // Pusty grób: zero ofert rzutu (CR 601.2h — koszt nieopłacalny).
  const none = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'mauler');
  assert.equal(none.length, 0, 'bez karty stwora w grobie brak oferty');
  // Karta stwora w grobie: wariant z exileTargetId.
  putCard(state, 'deadwolf', 'highland-game', 'p1', 'graveyard');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'mauler' && c.exileTargetId === 'deadwolf');
  assert.ok(cast, 'oferta z wygnaniem karty z grobu');
  assert.ok(execute(state, cast).ok);
  assert.equal(state.objects.get('deadwolf'), undefined, 'karta opuściła grób (nowe id w exile)');
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'highland-game');
  assert.equal(exiled.zone, 'exile', 'koszt zapłacony przy rzucie (przed stosem)');
  assert.ok(resolveStack(state));
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'makeshift-mauler');
  assert.equal(onBoard.zone, 'battlefield', 'Mauler na polu bitwy');
});

test('B2: Rakshasa Vizier — licznik +1/+1 za kartę wygnaną z grobu (koszt Maulera)', () => {
  const state = game('p1');
  putCard(state, 'vizier', 'rakshasa-vizier', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'mauler', 'makeshift-mauler', 'p1', 'hand');
  putCard(state, 'deadwolf', 'highland-game', 'p1', 'graveyard');
  addMana(state, 'p1', 4, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'mauler' && c.exileTargetId === 'deadwolf');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const vizier = state.objects.get('vizier');
  assert.equal(vizier.counters?.['+1/+1'], 1, 'trigger dał licznik +1/+1');
});

test('B3: trigger Rakshasy NIE odpala od wygnań z CUDZEGO grobu', () => {
  const state = game('p2');
  putCard(state, 'vizier', 'rakshasa-vizier', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'mauler', 'makeshift-mauler', 'p2', 'hand');
  putCard(state, 'deadfoe', 'highland-game', 'p2', 'graveyard');
  addMana(state, 'p2', 4, { colors: ['U'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'mauler' && c.exileTargetId === 'deadfoe');
  assert.ok(cast, 'oferta rzutu p2');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const vizier = state.objects.get('vizier');
  assert.ok(!(vizier.counters?.['+1/+1'] > 0), 'cudzy grób nie karmi Rakshasy');
});

test('B4: Rakshasa — kwota z kontekstu (amountFromContext) dla wielu kart', () => {
  const state = game('p1');
  const vizier = putCard(state, 'vizier', 'rakshasa-vizier', 'p1');
  const ability = REGISTRY.get('rakshasa-vizier').abilities[0];
  applyEffect(state, ability.effect, vizier, [], { exiledCount: 3 });
  assert.equal(state.objects.get('vizier').counters?.['+1/+1'], 3, '3 karty = 3 liczniki');
});

// ---- Transza C ----------------------------------------------------------------

test('C1: Sifter Wurm — ETB scry 3, po decyzji reveal wierzchu i życie = MV', () => {
  const state = game('p1');
  putCard(state, 'wurm', 'sifter-wurm', 'p1', 'hand');
  // Biblioteka p1: wierzch po scry będzie znany — ułóż 3 karty.
  putCard(state, 'lib1', 'gorger-wurm', 'p1', 'library');   // MV 5
  putCard(state, 'lib2', 'highland-game', 'p1', 'library'); // MV 2
  putCard(state, 'lib3', 'basic-forest', 'p1', 'library'); // MV 0
  addMana(state, 'p1', 7, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'wurm');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state), 'stwór wchodzi, trigger ETB na stosie/rozstrzyga');
  assert.ok(state.pendingScry, 'scry 3 blokuje');
  assert.equal(state.pendingScry.playerId, 'p1');
  assert.ok(state.pendingScry.revealTopGainLife, 'flaga then-reveal na pendingScry');
  const lifeBefore = state.players.find((pl) => pl.id === 'p1').life;
  // Decyzja: wszystko zostaje na wierzchu w kolejności lib1 (MV 5) na górze.
  assert.ok(execute(state, {
    type: 'resolve_scry', playerId: 'p1', bottomIds: [],
    topOrder: state.pendingScry.objectIds,
  }).ok);
  const lifeAfter = state.players.find((pl) => pl.id === 'p1').life;
  assert.equal(lifeAfter - lifeBefore, 5, 'życie = mana value odsłoniętej karty (Gorger Wurm MV 5)');
  assert.ok(state.events.some((e) => e.type === 'card_revealed' && e.fromLibraryTop), 'reveal wierzchu w zdarzeniach');
});

test('C2: Final Parting — dwa OBOWIĄZKOWE wybory: ręka, potem grób', () => {
  const state = game('p1');
  putCard(state, 'fp', 'final-parting', 'p1', 'hand');
  putCard(state, 'lib1', 'gorger-wurm', 'p1', 'library');
  putCard(state, 'lib2', 'highland-game', 'p1', 'library');
  putCard(state, 'lib3', 'basic-forest', 'p1', 'library');
  addMana(state, 'p1', 5, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fp');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(state.pendingSearchChoice, 'pierwsza decyzja szukania');
  assert.equal(state.pendingSearchChoice.destination, 'hand');
  assert.equal(state.pendingSearchChoice.mandatory, true, 'bez kryterium = obowiązkowe');
  const offers1 = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_search_choice');
  assert.ok(offers1.length > 0, 'są oferty wyboru');
  assert.ok(!offers1.some((c) => c.found == null), 'BEZ oferty rezygnacji (CR 701.19c)');
  const declined = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: null });
  assert.equal(declined.ok, false, 'decline odrzucony (search_mandatory)');
  // Wybór 1: Gorger Wurm do ręki.
  assert.ok(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib1' }).ok);
  const inHand = [...state.objects.values()].find((o) => o.cardId === 'gorger-wurm');
  assert.equal(inHand.zone, 'hand', 'pierwsza karta w ręce');
  // Wybór 2 (łańcuch): destination graveyard, też obowiązkowy.
  assert.ok(state.pendingSearchChoice, 'druga decyzja (łańcuch)');
  assert.equal(state.pendingSearchChoice.destination, 'graveyard');
  assert.equal(state.pendingSearchChoice.mandatory, true);
  const pick2 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_search_choice' && c.found != null);
  assert.ok(pick2, 'oferta drugiego wyboru');
  assert.ok(execute(state, pick2).ok);
  const chosen2 = [...state.objects.values()].find((o) => o.id === pick2.found || (o.zone === 'graveyard' && o.controllerId === 'p1'));
  assert.equal(chosen2.zone, 'graveyard', 'druga karta w grobie');
  assert.equal(state.pendingSearchChoice, null, 'decyzje domknięte');
});
