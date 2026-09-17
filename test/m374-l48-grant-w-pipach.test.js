// M374 (znalezisko benchmarku quick-25, klasa L48): ląd z grantem many
// (Nature's Embrace: „{T}: Add two mana of any one color") był liczony przez
// OFERTĘ jako `grant` jednostek, ale PŁATNOŚĆ tapowała go przy pokrywaniu pipa
// z `grantColor: null` — czyli za JEDNĄ jednostkę. Rachunek oferty (5 many)
// i płatności (4 many) się rozjeżdżał, więc silnik ODRZUCAŁ komendę, którą sam
// zaproponował, a odrzucenie zostawiało ślad: tapnięty ląd i manę w puli
// („Niewystarczająca mana" podniesione PO mutacji — CR 601.2h).
//
// Repro (realna partia, 2400/5952 meczu quick-25): `random(wiedzmin-bg) vs
// heuristic(tarkir-wur)`, seed 2039 — p2 rzucał Vandalize {4}{R} (tryb
// „Zniszcz ląd") mając 1 Górę z Nature's Embrace (grant 2, dowolny kolor),
// 2 Równiny i Wyspę. Oferta: 5 many (grant liczy się jako 2), płatność:
// Góra za 1 → 4 < 5 → `illegal_spell:Niewystarczająca mana`.
//
// Piny:
//  1. grant w pipach = pełny grant (Góra z aurą daje 2 many jednego koloru),
//     rzut {4}{R} przy 4 lądach (5 many) jest PRZYJMOWANY i płaci 5,
//  2. atomowość: nieopłacalna płatność rzuca PRZED mutacją (żaden ląd nie
//     jest tapnięty, pula pusta) — CR 601.2h,
//  3. kontrola negatywna: bez aury ten sam rzut jest nieopłacalny (4 many)
//     i nie ma go w ofercie — pin nie przechodzi „przez przypadek".
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { initializeResources, planGrantManaColors, producibleMana, spendMana, spellManaPurpose } from '../src/engine/resources.js';
import { coloredPipsOf } from '../src/engine/mana-cost.js';
import { legalSpellCasts } from '../src/engine/spells.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
  return state.objects.get(id);
}

/**
 * Stan z repro: p2 (aktywny, main1) ma Górę, 2 Równiny, Wyspę i Jeskai
 * Devotee ({1},{T}: dodaj {U}{R}{W} — źródło KOSZTOWE, netto 0), w ręce
 * Vandalize; na Górze leży Nature's Embrace p1 (grant 2). Devotee jest
 * w fiksturze NIE przypadkowo: plan kolorów (`planGrantManaColors`) uznaje
 * grant za zużyty finansowaniem źródła kosztowego i zwraca PUSTY plan, więc
 * faza pipów nie dostaje koloru grantu i tapowała Górę „za 1".
 * `withAura: false` daje kontrolę negatywną (grant znika → 4 many na {4}{R}),
 * `withCostedSource: false` — kontrolę, że źródło kosztowe samo z siebie
 * nie daje many na ten czar (netto 0).
 */
function grantScenario({ withAura = true, withCostedSource = true } = {}) {
  const state = createGameState({ seed: 2039, players: [{ id: 'p1' }, { id: 'p2' }] });
  initializeResources(state);
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addRealCard(state, 'mountain', 'basic-mountain', 'p2', 'battlefield');
  addRealCard(state, 'plains-a', 'basic-plains', 'p2', 'battlefield');
  addRealCard(state, 'plains-b', 'basic-plains', 'p2', 'battlefield');
  addRealCard(state, 'island', 'basic-island', 'p2', 'battlefield');
  addRealCard(state, 'foe-forest', 'basic-forest', 'p1', 'battlefield');
  addRealCard(state, 'vandalize', 'vandalize', 'p2', 'hand');
  if (withCostedSource) addRealCard(state, 'devotee', 'jeskai-devotee', 'p2', 'battlefield');
  if (withAura) {
    addRealCard(state, 'embrace', 'natures-embrace', 'p1', 'battlefield');
    attachAuraToCreature(state, 'embrace', 'mountain');
    assert.equal(state.objects.get('embrace').attachedTo, 'mountain');
  }
  return state;
}

const vandalize = (state) => state.objects.get('vandalize');
const landsUntapped = (state) => ['mountain', 'plains-a', 'plains-b', 'island']
  .every((id) => state.objects.get(id).tapped === false);

test('M374/1: grant lądu płaci w pipach tyle, ile obiecuje oferta (L48)', () => {
  const state = grantScenario();
  const object = vandalize(state);
  const purpose = spellManaPurpose(object);
  const pips = coloredPipsOf(object.cardId);
  // Oferta liczy grant jako 2 many: 4 lądy = 5 jednostek, koszt {4}{R} = 5.
  assert.equal(producibleMana(state, 'p2', null, purpose, pips), 5);
  // Trigger znaleziska: źródło kosztowe „zużywa" grant na rzecz planu kolorów,
  // więc plan nie ma wiersza dla Góry — i to tędy płatność tapowała ją „za 1".
  assert.deepEqual(planGrantManaColors(state, 'p2', pips), []);
  const offers = legalSpellCasts(state, 'p2').filter((cast) => cast.objectId === 'vandalize');
  const landMode = offers.find((cast) => cast.modeIndex === 1 && cast.targets.includes('foe-forest'));
  assert.ok(landMode, 'tryb „Zniszcz ląd" jest w ofercie (oferta = obietnica)');
  const inView = (playerView(state, 'p2').legalCommands ?? [])
    .some((cmd) => cmd.objectId === 'vandalize' && cmd.modeIndex === 1);
  assert.ok(inView, 'playerView oferuje ten rzut botowi/graczowi');

  const result = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'vandalize', targets: ['foe-forest'], modeIndex: 1 });
  assert.ok(result.ok, `rzut przyjęty (${result.events[0]?.reason ?? 'ok'})`);
  const cast = result.events.find((event) => event.type === 'spell_cast');
  assert.equal(cast.manaSpent, 5, 'zapłacono pełny koszt {4}{R}');
  // Źródło-root: Góra z grantem wyprodukowała DWA many jednego koloru
  // (wcześniej: 1 → pula krótsza od oferty o jednostkę).
  const produced = result.events.find((event) => event.type === 'mana_produced' && event.source === 'mountain');
  assert.ok(produced, 'Góra z grantem została tapnięta w płatności');
  assert.equal(produced.amount, 2, 'grant = 2 many jednego koloru');
  assert.equal(produced.grantMana, true);
  assert.equal(produced.colors[0], 'R', 'kolor grantu pokrywa pip {R} rzutu');
  assert.deepEqual(produced.colors, ['R']);
  assert.ok(['mountain', 'plains-a', 'plains-b', 'island'].every((id) => state.objects.get(id).tapped), 'płatność zużyła 5 jednostek z 4 lądów');
  assert.equal(state.players.find((p) => p.id === 'p2').mana, 0, 'pula rozliczona do zera');
});

test('M374/2: nieudana płatność nie zostawia śladu (atomowość, CR 601.2h)', () => {
  const state = grantScenario();
  assert.throws(
    () => spendMana(state, 'p2', 6, [['R']], spellManaPurpose(vandalize(state))),
    /Niewystarczająca mana/,
  );
  assert.ok(landsUntapped(state), 'żaden ląd nie jest tapnięty po odrzuconej płatności');
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.mana, 0);
  assert.deepEqual(p2.manaPool, {}, 'pula bez many z nieudanej płatności');
});

test('M374/3: bez aury ten sam rzut nadal jest nieopłacalny (kontrola negatywna)', () => {
  const state = grantScenario({ withAura: false });
  const object = vandalize(state);
  assert.equal(producibleMana(state, 'p2', null, spellManaPurpose(object), coloredPipsOf(object.cardId)), 4);
  assert.equal(
    legalSpellCasts(state, 'p2').filter((cast) => cast.objectId === 'vandalize').length,
    0,
    'brak oferty przy 4 manach na koszt 5',
  );
  assert.throws(
    () => spendMana(state, 'p2', 5, [['R']], spellManaPurpose(object)),
    /Niewystarczająca mana/,
  );
  assert.ok(landsUntapped(state));
});

test('M374/4: KAŻDA pozycja oferty dla tego rzutu jest wykonywalna (L48: oferta = wykonanie)', () => {
  const probe = grantScenario();
  const offers = legalSpellCasts(probe, 'p2').filter((cast) => cast.objectId === 'vandalize');
  assert.ok(offers.length >= 2, `oferta ma warianty trybów (jest ${offers.length})`);
  for (const offer of offers) {
    const state = grantScenario();
    const result = execute(state, { type: 'cast_spell', playerId: 'p2', ...offer });
    assert.ok(result.ok, `oferta ${JSON.stringify(offer)} odrzucona: ${result.events[0]?.reason}`);
  }
});
