// Uwaga z gry właściciela (2026-09-21, M405) — Twiddle (klasa: czary
// tap/untap z tarczą „artifact_or_creature_or_land”).
//
// Zgłoszenie: „Karta Twiddle. To jest karta która może być albo combat
// trickiem do tapowania potencjalnych blokerów przeciwnika na początku fazy
// walki albo służyć do odtapowania kreatury po ataku, żeby mogła blokować.
// Niestety Bot kompletnie nie umie korzystać z tego czaru. Przed chwilą
// rzucił ten czar w swojej fazie Główna 1, żeby zatapować mój ląd, który
// chwilę później został odtapowany w moim untap phase. Kompletne
// marnotrastwo. To powinno być surowo scoringowo penalizowane.”
//
// Piny mierzą POLITYKĘ WYCENY (żądanie właściciela), nie implementację:
//   T/1  — przypadek właścicieli: Główna 1 + sam ląd wroga → bot NIE rzuca;
//          NAJLEPSZY wariant cast_spell tego czaru ma surowo ujemną ocenę
//          (≤ −10 — surowość jest częścią żądania, nie detalem dnia);
//   T/1b — ta sama klasa marnotrastwa dla STWORA bez mojego potencjału ataku
//          (tapnięcie kupuje nic — wróg odkręca przed swoją turą);
//   T/2  — anty-over-fix: okno blokerskie działa — początek fazy walki, wrogi
//          potencjalny bloker, mój potencjalny atakujący → Tapnięcie WYBRANE;
//   T/3  — anty-over-fix: denial many w turze wroga (jego upkeep, ląd) zostaje
//          wartościowy (okno M202/F);
//   T/4  — klasa (ADR 0002): KAŻDY czar z efektem tap_permanent(ś), którego
//          cel dopuszcza ląd/artefakt, w scenariuszu właściciela dostaje tę
//          samą surowość — nowe karty wchodzą do strażnika automatycznie.
//
// Odkręcenie własnej kreatury po ataku (drugie użycie z zgłoszenia) jest
// już przypięte w test/bot-suspend-twiddle-quality.test.js (M146) — te piny
// go nie ruszają (regresja łapana przez pełną bramę).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, { id, cardId, controllerId, zone, name }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(card);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: card.keywords ?? [], subtypes: card.subtypes ?? [], types: card.types ?? [],
    colors: data.colors ?? [], cardName: name ?? card.name, name: name ?? card.name,
    costReduction: data.costReduction ?? null,
  });
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    ownerId: controllerId, zone: 'battlefield', kind: 'creature',
    power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: extra.keywords ?? [], subtypes: extra.subtypes ?? [],
    types: ['Creature'], colors: [], cardName: extra.cardName ?? id, name: extra.cardName ?? id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botState(step = 'main', active = 'p2') {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p2';
  state.turn.number = 8;
  return state;
}

/** Scenariusz właściciela z parametrem karty/celu — wspólny dla T/1..T/4. */
function wasteScenario({ cardId = 'twiddle', step = 'main', active = 'p2', target = 'land' } = {}) {
  const state = botState(step, active);
  putCard(state, { id: 'tw', cardId, controllerId: 'p2', zone: 'hand' });
  if (target === 'land') {
    putCard(state, { id: 'lad', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield', name: 'Lad-wroga' });
  } else {
    putBlank(state, 'wrog', 'p1', { power: 2, toughness: 2, cardName: 'Wrog' });
  }
  addMana(state, 'p2', 1, { colors: ['U'] });
  const bot = createHeuristicBot({ seed: 3 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  const casts = (entry?.options ?? []).filter((o) => o.cmd.startsWith('cast_spell(tw'));
  return { state, choice, casts };
}

test('T/1 Główna 1 + ląd wroga: bot nie rzuca Twiddle (marnotrastwo surowo ujemne)', () => {
  const { choice, casts } = wasteScenario({ target: 'land' });
  assert.ok(casts.length > 0, `wariant rzutu w śladzie istnieje: ${JSON.stringify(casts)}`);
  for (const o of casts) {
    assert.ok(o.score <= -10, `marnotrastwo surowo ujemne (gotowe do trzymania karty): ${o.cmd} = ${o.score}`);
  }
  assert.ok(!(choice.type === 'cast_spell' && choice.objectId === 'tw'),
    `bot NIE rzuca Twiddle na ląd w Głównej 1: ${JSON.stringify(choice)}`);
});

test('T/1b Główna 1 + wróg stwór bez mojego ataku: tapnięcie kupuje nic — surowo ujemne', () => {
  const { choice, casts } = wasteScenario({ target: 'creature' });
  assert.ok(casts.length > 0, `wariant rzutu w śladzie istnieje: ${JSON.stringify(casts)}`);
  for (const o of casts) {
    assert.ok(o.score <= -10, `tapnięcie bez potencjału ataku to marnotrastwo: ${o.cmd} = ${o.score}`);
  }
  assert.ok(!(choice.type === 'cast_spell' && choice.objectId === 'tw'),
    `bot NIE rzuca Twiddle bez potencjału ataku: ${JSON.stringify(choice)}`);
});

test('T/2 początek fazy walki + bloker wroga + mój atakujący: Tapnięcie WYBRANE (anty-over-fix)', () => {
  const state = botState('beginning_of_combat', 'p2');
  putCard(state, { id: 'tw', cardId: 'twiddle', controllerId: 'p2', zone: 'hand' });
  putBlank(state, 'wrog', 'p1', { power: 2, toughness: 2, cardName: 'Wrog' });
  putBlank(state, 'atak', 'p2', { power: 3, toughness: 3, cardName: 'Atak' });
  addMana(state, 'p2', 1, { colors: ['U'] });
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p2'), {});
  assert.ok(choice.type === 'cast_spell' && choice.objectId === 'tw',
    `combat trick na blokerze zostaje wybrany: ${JSON.stringify(choice)}`);
  assert.equal(choice.modeIndex, 0, 'tryb Tapnięcie');
  assert.equal(choice.targets?.[0], 'wrog', 'cel = potencjalny bloker wroga');
});

test('T/3 upkeep wroga + jego ląd: denial many zostaje wartościowy (anty-over-fix)', () => {
  const { choice, casts } = wasteScenario({ step: 'upkeep', active: 'p1', target: 'land' });
  assert.ok(casts.length > 0, `wariant rzutu w śladzie istnieje: ${JSON.stringify(casts)}`);
  assert.ok(choice.type === 'cast_spell' && choice.objectId === 'tw',
    `tapnięcie lądu w jego upkeepie (denial do jego untapu) zostaje wybrane: ${JSON.stringify(choice)}`);
  assert.equal(choice.targets?.[0], 'lad', 'cel = ląd wroga');
});

test('T/4 klasa ADR 0002: każdy czar tap_permanent(ś) z celem na ląd/artefakt łapie tę samą surowość', () => {
  const all = typeof REGISTRY.all === 'function' ? REGISTRY.all() : [...REGISTRY.cards.values()];
  const family = all.filter((card) => {
    const spells = [card.spell, ...(card.spell?.modes ?? []).map((m) => m)]
      .filter(Boolean);
    const hasTap = spells.some((sp) => (Array.isArray(sp.effects) ? sp.effects : [sp.effects])
      .some((e) => e?.type === 'tap_permanent' || e?.type === 'tap_permanents'));
    if (!hasTap) return false;
    const targets = spells.flatMap((sp) => sp.targets ?? []);
    return targets.some((t) => /land|permanent/i.test(String(t?.type ?? '')) && !/^creature/.test(String(t?.type ?? '')));
  });
  assert.ok(family.length >= 1, `klasa niepusta (Twiddle i pokrewni): ${family.map((c) => c.id).join(', ')}`);
  for (const card of family) {
    const { choice, casts } = wasteScenario({ cardId: card.id, target: 'land' });
    assert.ok(casts.length > 0, `${card.id}: wariant rzutu na ląd istnieje w ofercie`);
    for (const o of casts) {
      assert.ok(o.score <= -10, `${card.id}: marnotrastwo surowo ujemne: ${o.cmd} = ${o.score}`);
    }
    assert.ok(!(choice.type === 'cast_spell' && choice.objectId === 'tw' && choice.targets?.[0] === 'lad'),
      `${card.id}: bot nie rzuca na ląd w Głównej 1: ${JSON.stringify(choice)}`);
  }
});
