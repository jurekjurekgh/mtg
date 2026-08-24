// M201 — polowanie na błędy (odznaka), znalezisko #3:
// TOKEN POWERSTONE (Static Net) NIE PRODUKUJE ŻADNEJ MANY.
//
// Druk tokenu (Wizards, token „Powerstone”): „Artifact — Powerstone.
// {T}: Add {C}. This mana can't be spent to cast a nonartifact spell.”
// Deskryptor tokenu w danych nie miał ŻADNEJ zdolności, więc:
//  • kamień nigdy nie dawał many (druga połowa Static Net była martwa),
//  • wpis w MANA_SOURCE_MAP był nieosiągalny (od M193 kolory czyta się
//    z deskryptora zdolności, a tego nie było).
// Przy okazji reguła, której silnik nie znał wcale: mana OGRANICZONA
// („spend only to cast artifact spells”) — bez niej naprawa samego
// „{T}: Add {C}” złamałaby druk w drugą stronę.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { producibleMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function stateWithPowerstone({ untapped = true } = {}) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'static-net', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', types: ['Enchantment'], abilities: [],
  });
  const netTokenEffect = (REGISTRY.get('static-net').abilities ?? [])
    .flatMap((a) => (Array.isArray(a.effect) ? a.effect : [a.effect]))
    .find((e) => e?.type === 'create_token' && e.cardId === 'token_powerstone');
  assert.ok(netTokenEffect, 'Static Net tworzy token Powerstone');
  applyEffect(state, netTokenEffect, state.objects.get('src'), []);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_powerstone');
  assert.ok(token, 'token powstał');
  if (untapped) state.objects.set(token.id, Object.freeze({ ...token, tapped: false }));
  return { state, tokenId: token.id };
}

test('BUG3: Powerstone ma wydrukowaną zdolność many „{T}: Add {C}”', () => {
  const { state, tokenId } = stateWithPowerstone();
  const token = state.objects.get(tokenId);
  const manaAbility = (token.abilities ?? []).find((a) => {
    const effects = Array.isArray(a.effect) ? a.effect : [a.effect];
    return a.type === 'activated' && a.cost?.tap === true && effects.some((e) => e?.type === 'add_mana');
  });
  assert.ok(manaAbility, `token bez zdolności many: ${JSON.stringify(token.abilities ?? [])}`);
});

test('BUG3: Powerstone PŁACI za czar-artefakt', () => {
  const { state } = stateWithPowerstone();
  const artifact = REGISTRY.all().find((c) => (c.types ?? []).includes('Artifact') && !c.spell && (c.manaCost ?? 0) === 1);
  assert.ok(artifact, 'w katalogu jest artefakt za {1}');
  put(state, 'art', artifact.id, 'p1', 'hand');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(cast, 'artefakt za {1} rzucalny z samego Powerstone');
  assert.equal(execute(state, cast).ok, true);
});

test('BUG3: mana z Powerstone NIE opłaca czaru nie-artefaktowego (druk tokenu)', () => {
  const { state } = stateWithPowerstone();
  const creature = REGISTRY.all().find((c) => (c.types ?? []).includes('Creature')
    && !(c.types ?? []).includes('Artifact') && (c.manaCost ?? 0) === 1 && (c.colors ?? []).length === 0);
  const spell = creature ?? REGISTRY.all().find((c) => (c.types ?? []).includes('Creature')
    && !(c.types ?? []).includes('Artifact') && (c.manaCost ?? 0) === 1);
  assert.ok(spell, 'w katalogu jest nie-artefaktowy czar za {1}');
  put(state, 'cre', spell.id, 'p1', 'hand');
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'cre');
  assert.deepEqual(casts, [],
    'druk tokenu: „This mana can\'t be spent to cast a nonartifact spell”');
});

test('BUG3: liczenie many rozróżnia cel wydania (oferta = płatność, L48)', () => {
  const { state } = stateWithPowerstone();
  assert.equal(producibleMana(state, 'p1'), 0, 'domyślnie mana ograniczona się nie liczy');
  assert.equal(producibleMana(state, 'p1', null, { artifactSpell: true }), 1, 'dla czaru-artefaktu liczy się');
});

test('BUG3 (anty-over-fix): zwykły ląd płaci za wszystko', () => {
  const { state } = stateWithPowerstone({ untapped: false });
  put(state, 'forest', 'basic-forest', 'p1');
  assert.equal(producibleMana(state, 'p1'), 1, 'ląd bez ograniczeń');
  const creature = REGISTRY.all().find((c) => (c.types ?? []).includes('Creature')
    && !(c.types ?? []).includes('Artifact') && (c.manaCost ?? 0) === 1 && (c.colors ?? []).includes('G'));
  if (creature) {
    put(state, 'cre', creature.id, 'p1', 'hand');
    const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'cre');
    assert.ok(cast, 'zielony stwór za {G} rzucalny z lasu');
  }
});

test('BUG3: ograniczenie działa też po RĘCZNYM tapnięciu (mana w puli)', () => {
  // Kreator many pozwala tapnąć źródło przed wyborem czaru — restrykcja
  // musi przeżyć drogę „źródło → pula”, inaczej gracz obchodzi druk tokenu.
  const { state, tokenId } = stateWithPowerstone();
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === tokenId);
  assert.ok(activate, 'kamień da się tapnąć ręcznie');
  assert.equal(execute(state, activate).ok, true);
  const player = state.players.find((p) => p.id === 'p1');
  assert.equal(player.mana, 1, 'mana trafiła do puli');
  assert.equal(producibleMana(state, 'p1'), 0,
    'ale dla czaru nie-artefaktowego jest niedostępna (druk tokenu)');
  assert.equal(producibleMana(state, 'p1', null, { artifactSpell: true }), 1,
    'dla czaru-artefaktu — dostępna');
});
