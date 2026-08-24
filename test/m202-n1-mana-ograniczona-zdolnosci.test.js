// M202/N1 — audyt PR #73 (znalezisko N1): mana OGRANICZONA drukiem.
//
// Druk tokenu Powerstone: „{T}: Add {C}. This mana can't be spent **to cast
// a nonartifact spell**.” Zakaz dotyczy wyłącznie rzucania czarów
// nie-artefaktowych — mana może opłacić zdolności aktywowane i czary-artefakty.
//
// Stan po PR #73: `purpose` miało odwróconą semantykę („mana działa tylko przy
// `artifactSpell: true`”), więc `producibleMana` odejmował manę ograniczoną dla
// KAŻDEGO celu innego niż czar-artefakt, a `untappedFreeManaSources` w ogóle nie
// proponował Powerstone. Skutek: przy Powerstone jako jedynym źródle many
// zdolność za {1} nie miała oferty, a wymuszona komenda była odrzucana —
// silnik odbierał graczowi legalną akcję (klasa L44).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
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

/** Stan z tokenem Powerstone (ze Static Net) jako JEDYNYM źródłem many. */
function stateWithPowerstone() {
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
  state.objects.set(token.id, Object.freeze({ ...token, tapped: false }));
  return { state, tokenId: token.id };
}

/** Artefakt ze zdolnością „{1}: dobierz kartę” — płatność bez koloru i bez {T}. */
function addOneManaAbility(state, id, controllerId = 'p1') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], subtypes: [], colors: [], manaCost: 0,
    abilities: [{ type: 'activated', cost: { mana: 1 }, effect: [{ type: 'draw_cards', amount: 1 }] }],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped: false }));
  return state.objects.get(id);
}

/**
 * Syntetyczny permanent do rzutu za {1} — deterministyczny (L53): w katalogu
 * nie ma bezbarwnego czaru nie-artefaktowego za {1}, a test ma mierzyć
 * ograniczenie many, nie skład katalogu.
 */
function addOneCostSpell(state, id, controllerId, kind) {
  const types = kind === 'artifact' ? ['Artifact'] : ['Creature'];
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId, ownerId: controllerId,
    zone: 'hand', kind, power: kind === 'creature' ? 1 : null, toughness: kind === 'creature' ? 1 : null,
    types, subtypes: [], colors: [], manaCost: 1, abilities: [],
  });
  return state.objects.get(id);
}

/** Przewija stos do pustego (zdolność aktywowana rozstrzyga się po rundzie passów). */
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 100) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  return state.zones.stack.length === 0;
}

/** Tapnięcie Powerstone jego własną zdolnością many (jak robi to gracz/bot). */
function tapPowerstone(state, tokenId) {
  const cmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === tokenId);
  assert.ok(cmd, 'Powerstone ma ofertę tapnięcia za manę');
  assert.equal(execute(state, cmd).ok, true);
  assert.equal(state.players[0].artifactOnlyMana, 1, 'mana w puli jest oznaczona jako ograniczona');
}

test('N1: mana z Powerstone PŁACI za zdolność aktywowaną {1} — oferta istnieje', () => {
  const { state, tokenId } = stateWithPowerstone();
  addOneManaAbility(state, 'dev');
  tapPowerstone(state, tokenId);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  assert.ok(offers.length > 0,
    'druk Powerstone zabrania WYŁĄCZNIE rzucania czarów nie-artefaktowych — zdolność za {1} jest legalna');
});

test('N1: oferowana aktywacja faktycznie przechodzi (oferta = walidacja, L48)', () => {
  const { state, tokenId } = stateWithPowerstone();
  addOneManaAbility(state, 'dev');
  put(state, 'lib1', 'hill-giant', 'p1', 'library');
  put(state, 'lib2', 'hill-giant', 'p1', 'library');
  tapPowerstone(state, tokenId);
  const handBefore = state.zones.hand.length;
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  const result = execute(state, offer);
  assert.equal(result.ok, true, `odrzucona oferta: ${result.reason ?? ''}`);
  assert.ok(resolveStack(state), 'stos się rozstrzygnął');
  assert.equal(state.zones.hand.length, handBefore + 1, 'zdolność się rozstrzygnęła (dobrana karta)');
  assert.equal(state.players[0].mana, 0, 'mana ograniczona została wydana');
});

test('N1: licznik many ograniczonej maleje po zapłaceniu nią za zdolność', () => {
  const { state, tokenId } = stateWithPowerstone();
  addOneManaAbility(state, 'dev');
  tapPowerstone(state, tokenId);
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  execute(state, offer);
  assert.equal(state.players[0].artifactOnlyMana, 0,
    'licznik musi iść za pulą — inaczej producibleMana odejmowałby manę, której już nie ma (L48)');
});

test('N1 (anty-over-fix): mana z Powerstone NIE opłaca czaru nie-artefaktowego', () => {
  const { state, tokenId } = stateWithPowerstone();
  addOneCostSpell(state, 'spell', 'p1', 'creature');
  tapPowerstone(state, tokenId);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'spell');
  assert.deepEqual(offers, [], 'druk tokenu: „can\'t be spent to cast a nonartifact spell”');
});

test('N1 (anty-over-fix): mana z Powerstone opłaca czar-artefakt (auto-tap)', () => {
  const { state } = stateWithPowerstone();
  addOneCostSpell(state, 'art', 'p1', 'artifact');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(cast, 'artefakt za {1} jest rzucalny z nietapniętego Powerstone (auto-tap)');
  assert.equal(execute(state, cast).ok, true);
  assert.equal(state.objects.get('art'), undefined, 'karta ze strefy ręki przestała istnieć (CR 400.7)');
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'synthetic-art'),
    'opłacony artefakt jest czarem na stosie');
});

test('N1 (anty-over-fix): auto-tap NIE tapuje Powerstone na czar nie-artefaktowy', () => {
  const { state } = stateWithPowerstone();
  addOneCostSpell(state, 'spell', 'p1', 'creature');
  assert.deepEqual(playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_permanent' && c.objectId === 'spell'), [],
    'bez innego źródła many czaru nie-artefaktowego nie da się rzucić');
});

test('N1: mana ograniczona nie blokuje zdolności, gdy w puli jest też zwykła mana', () => {
  const { state, tokenId } = stateWithPowerstone();
  addOneManaAbility(state, 'dev');
  put(state, 'plains', 'basic-plains', 'p1', 'battlefield');
  tapPowerstone(state, tokenId);
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  assert.ok(offer, 'zdolność za {1} jest oferowana');
  assert.equal(execute(state, offer).ok, true);
});
