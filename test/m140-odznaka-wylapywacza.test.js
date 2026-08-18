// M140 — challenge „brązowa odznaka wyłapywacza błędów”.
// Testy regresyjne do znalezisk rundy 6. Reguły sprawdzane po DESKRYPTORACH
// (ADR 0002): żaden test nie zależy od nazwy konkretnej karty.
import test from 'node:test';
import assert from 'node:assert';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import {
  animatePermanentUntilEndOfTurn, markDamage, effectivePower, effectiveToughness,
} from '../src/engine/permanents.js';

const registry = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }], registry });
}

function putCard(state, id, cardId, zone, controllerId = 'p1') {
  const card = registry.get(cardId);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  if (card.transformTo) {
    const back = registry.get(card.transformTo);
    data.transformTo = {
      cardId: back.id, cardName: back.name, kind: gameObjectDataOf(back).kind,
      power: back.power, toughness: back.toughness, abilities: back.abilities ?? [],
      keywords: back.keywords ?? [], subtypes: back.subtypes ?? [], types: back.types ?? [],
      manaCost: back.manaCost ?? 0,
    };
  }
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, ...data,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function makeToken(state, controllerId = 'p1') {
  const source = state.objects.get('src') ?? addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'src-card', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, types: ['Creature'],
    subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
  });
  applyEffect(state, {
    type: 'create_token', cardId: 'token_skeleton', name: 'Skeleton', kind: 'creature',
    power: 4, toughness: 1, types: ['Creature'], subtypes: ['Skeleton'],
  }, state.objects.get('src') ?? source, []);
  return [...state.objects.values()].find((o) => o.cardId === 'token_skeleton');
}

// --- BUG #1: transformacja porzuca animację (CR 400.7 / 611.2c / 208.1) ------

test('M140/B1: craft ożywionego artefaktu daje permanent drugiej strony, nie stwora bez P/T', () => {
  const state = game();
  const needle = putCard(state, 'needle', 'lodestone-needle', 'battlefield');
  assert.ok(needle.transformTo, 'karta craftowalna ma deskryptor drugiej strony');

  // Animacja „until end of turn”: artefakt staje się stworem 5/5.
  animatePermanentUntilEndOfTurn(state, 'needle', { power: 5, toughness: 5, typesAdd: ['Creature'] });
  const animated = state.objects.get('needle');
  assert.equal(animated.kind, 'creature', 'po animacji to stwór');
  assert.equal(effectivePower(animated, state), 5);

  // Materiał do wygnania kosztem craftu.
  addObject(state, {
    id: 'fodder', instanceId: 'i-fodder', cardId: 'fodder-card', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', power: null, toughness: null, types: ['Artifact'],
    subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
  });
  applyEffect(state, { type: 'craft_transform' }, state.objects.get('needle'), []);
  assert.ok(state.pendingCraftExile, 'craft kolejkuje wybór karty do wygnania');
  assert.ok(execute(state, {
    type: 'resolve_craft_exile', playerId: 'p1', targetId: 'fodder',
  }).ok, 'craft rozstrzygnięty');

  const crafted = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.transformTo?.cardId === 'lodestone-needle');
  assert.ok(crafted, 'przemieniony permanent stoi na bitwisku');
  // CR 400.7 + 611.2c: nowa strona nie dziedziczy efektu animacji.
  assert.equal(crafted.kind, 'artifact', 'nowa strona ma własny RODZAJ, nie ten z animacji');
  assert.ok(!(crafted.types ?? []).includes('Creature'), 'typ Creature z animacji nie przechodzi na drugą stronę');
  // CR 208.1: jeżeli obiekt JEST stworem, musi mieć liczbowe P/T.
  const isCreature = crafted.kind === 'creature' || (crafted.types ?? []).includes('Creature');
  if (isCreature) {
    assert.equal(typeof effectivePower(crafted, state), 'number', 'stwór ma liczbową siłę');
    assert.equal(typeof effectiveToughness(crafted, state), 'number', 'stwór ma liczbową wytrzymałość');
  }
  assert.equal(crafted.originalBeforeAnimation ?? null, null, 'zapis cofnięcia animacji nie przechodzi na nowy obiekt');
});

test('M140/B1: deskryptor drugiej strony niesie RODZAJ permanentu (kind)', () => {
  // Generycznie: KAŻDA karta dwustronna w rejestrze musi mieć kind drugiej strony,
  // inaczej transformacja musi zgadywać rodzaj z linii typów.
  const twoFaced = registry.all().filter((card) => card.transformTo);
  assert.ok(twoFaced.length > 0, 'w rejestrze są karty dwustronne');
  for (const card of twoFaced) {
    const data = gameObjectDataOf(card);
    if (!data.transformTo) continue;
    assert.equal(typeof data.transformTo.kind, 'string',
      `${card.name}: deskryptor transformTo musi nieść kind drugiej strony`);
  }
});

test('M140/B1: stwór na bitwisku ma zawsze liczbowe P/T (CR 208.1)', () => {
  const state = game();
  const needle = putCard(state, 'needle', 'lodestone-needle', 'battlefield');
  animatePermanentUntilEndOfTurn(state, 'needle', { power: 5, toughness: 5, typesAdd: ['Creature'] });
  addObject(state, {
    id: 'fodder', instanceId: 'i-fodder', cardId: 'fodder-card', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', power: null, toughness: null, types: ['Artifact'],
    subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
  });
  applyEffect(state, { type: 'craft_transform' }, state.objects.get('needle'), []);
  execute(state, { type: 'resolve_craft_exile', playerId: 'p1', targetId: 'fodder' });
  runStateBasedActions(state);
  assert.ok(needle, 'setup wykonany');
  for (const object of state.objects.values()) {
    if (object.zone !== 'battlefield') continue;
    const isCreature = object.kind === 'creature' || (object.types ?? []).includes('Creature');
    if (!isCreature) continue;
    assert.equal(typeof effectiveToughness(object, state), 'number',
      `${object.cardId}: stwór bez liczbowej wytrzymałości jest nieśmiertelny wobec SBA (CR 704.5f)`);
  }
});

// --- BUG #2: token poza bitwiskiem przestaje istnieć (CR 111.7 / 704.5e) -----

test('M140/B2: token, który umiera, przestaje istnieć zamiast leżeć w grobie', () => {
  const state = game();
  const token = makeToken(state);
  assert.ok(token, 'token utworzony');
  assert.equal(token.isToken, true, 'token ma jawny deskryptor isToken');

  markDamage(state, token.id, 5);
  runStateBasedActions(state);

  const ghosts = [...state.objects.values()].filter((o) => o.cardId === 'token_skeleton');
  assert.equal(ghosts.length, 0, 'token nie zostaje w żadnej strefie (CR 111.7)');
  assert.ok(state.events.some((e) => e.type === 'token_ceased_to_exist'),
    'zdarzenie informuje gracza, czemu token zniknął');
  assert.ok(!state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'token_skeleton'),
    'grób nie zawiera ducha tokenu');
});

test('M140/B2: ducha tokenu nie da się wskazać jako karty w grobie', () => {
  const state = game();
  putCard(state, 'bark', 'barkform-harvester', 'battlefield');
  for (let i = 0; i < 3; i += 1) {
    addObject(state, {
      id: `l${i}`, instanceId: `i-l${i}`, cardId: 'basic-forest', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', types: ['Land'], subtypes: ['Forest'],
      keywords: [], abilities: [], colors: [], manaCost: 0, power: null, toughness: null,
    });
  }
  const token = makeToken(state);
  markDamage(state, token.id, 5);
  runStateBasedActions(state);

  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.step = 'main';
  const commands = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'activate_ability' && cmd.objectId === 'bark');
  const offered = JSON.stringify(commands);
  assert.ok(!offered.includes('token_skeleton'), 'token nie jest kartą w grobie (CR 111.7)');
  for (const cmd of commands) {
    for (const targetId of cmd.targets ?? []) {
      const target = state.objects.get(targetId);
      assert.ok(target, `oferowany cel ${targetId} musi istnieć`);
      assert.ok(!target.isToken, 'żaden oferowany cel „karta w grobie” nie jest tokenem');
    }
  }
});

test('M140/B2: efekt reanimacji nie wskrzesza tokenu z grobu', () => {
  const state = game();
  const token = makeToken(state);
  const tokenId = token.id;
  markDamage(state, tokenId, 5);
  runStateBasedActions(state);

  applyEffect(state, { type: 'reanimate_under_your_control' }, state.objects.get('src'), [tokenId]);
  const revived = [...state.objects.values()].filter((o) => o.cardId === 'token_skeleton' && o.zone === 'battlefield');
  assert.equal(revived.length, 0, 'nieistniejącego tokenu nie da się wskrzesić');
});

test('M140/B2: trigger „permanenty odchodzą z bitwiska” widzi też TOKENY (CR 603.10)', () => {
  // Regresja: usuwanie tokenu przez SBA nie może zabrać triggerowi LKI.
  const state = game();
  addObject(state, {
    id: 'watcher', instanceId: 'i-watcher', cardId: 'watcher-card', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, types: ['Creature'],
    subtypes: [], keywords: [], abilities: [{
      type: 'triggered', trigger: { event: 'permanents_you_control_leave_battlefield' },
      effect: { type: 'scry', amount: 1 },
    }], colors: [], manaCost: 1,
  });
  const token = makeToken(state);
  state.events.length = 0;
  markDamage(state, token.id, 5);
  const sbaEvents = runStateBasedActions(state);
  const destroyed = [...state.events, ...sbaEvents].find((e) => e.type === 'creature_destroyed');
  assert.ok(destroyed, 'zniszczenie tokenu wygenerowało zdarzenie');
  assert.ok(destroyed.object, 'zdarzenie niesie LKI obiektu (CR 603.10)');
});

test('M140/B2: token-kopia wygnana przez craft nie zostaje w wygnaniu', () => {
  const state = game();
  const token = makeToken(state);
  // Symulacja przeniesienia tokenu do wygnania dowolnym efektem.
  const exileId = `exile-${state.objectSequence += 1}`;
  state.objects.set(exileId, Object.freeze({ ...state.objects.get(token.id), id: exileId, zone: 'exile' }));
  state.objects.delete(token.id);
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== token.id);
  state.zones.exile.push(exileId);

  runStateBasedActions(state);
  assert.ok(!state.objects.has(exileId), 'token w wygnaniu przestaje istnieć (CR 111.7)');
  assert.ok(!state.zones.exile.includes(exileId), 'wygnanie nie trzyma martwego id');
});

test('M140/B2: karta z polem name NIE jest kasowana jak token', () => {
  // Deskryptor tokenu musi być jawny (isToken). Kartom wolno nieść `name`.
  const state = game();
  addObject(state, {
    id: 'lib1', instanceId: 'i-lib1', cardId: 'basic-forest', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'],
    keywords: [], abilities: [], colors: [], manaCost: 0, power: null, toughness: null,
    cardName: 'Forest', name: 'Forest',
  });
  runStateBasedActions(state);
  assert.ok(state.objects.has('lib1'), 'karta w bibliotece z polem name przetrwała SBA');
});
