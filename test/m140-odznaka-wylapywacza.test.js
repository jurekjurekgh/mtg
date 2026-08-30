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
  // M257-r5b/B: starter losowy — testy operują turą 1 p1 BEZ dobierania
  // (CR 103.7a: starter nie dobiera w turze 1; biblioteki tu są puste),
  // więc seed musi dawać startera p1 (seed 7) i aktywności nie pinujemy.
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }], registry });
  return state;
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
  assert.ok(crafted, 'przemieniony permanent stoi na polu bitwy');
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

test('M140/B1: stwór na polu bitwy ma zawsze liczbowe P/T (CR 208.1)', () => {
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

// --- BUG #2: token poza polem bitwy przestaje istnieć (CR 111.7 / 704.5e) -----

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

test('M140/B2: trigger „permanenty odchodzą z pola bitwy” widzi też TOKENY (CR 603.10)', () => {
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

// --- BUG #3: goad to wymóg ATAKU, nie zakaz blokowania (CR 701.38b) ---------

test('M140/B3: goadowany stwór może blokować', () => {
  const state = game();
  const creature = (id, controllerId, power, toughness, extra = {}) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'creature', power, toughness, types: ['Creature'],
      subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  };
  creature('atk', 'p1', 3, 3);
  creature('blk', 'p2', 2, 4, { goaded: true, goadedUntilTurn: 99 });

  for (let i = 0; i < 40 && state.turn.step !== 'declare_attackers'; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const declare = playerView(state, 'p1').legalCommands
    .find((cmd) => cmd.type === 'declare_attackers' && (cmd.attackerIds ?? []).includes('atk'));
  assert.ok(declare && execute(state, declare).ok, 'atak zadeklarowany');
  for (let i = 0; i < 10 && state.turn.step !== 'declare_blockers'; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const blockOption = playerView(state, 'p2').legalCommands
    .filter((cmd) => cmd.type === 'declare_blockers')
    .find((cmd) => JSON.stringify(cmd.assignments ?? {}).includes('blk'));
  assert.ok(blockOption, 'goadowany stwór jest oferowany jako bloker (CR 701.38b)');
  assert.ok(execute(state, blockOption).ok, 'blok goadowanym stworem przyjęty');
  assert.ok(state.combat.blockers.get('atk')?.includes('blk'), 'blok zapisany w stanie walki');
});

test('M140/B3: goad nadal WYMUSZA atak (CR 508.1a) — naprawa nie zniosła wymogu', () => {
  const state = game();
  const creature = (id, controllerId, extra = {}) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `c-${id}`, controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, types: ['Creature'],
      subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  };
  creature('goaded', 'p1', { goaded: true, goadedUntilTurn: 99 });
  creature('free', 'p1');
  for (let i = 0; i < 40 && state.turn.step !== 'declare_attackers'; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const options = playerView(state, 'p1').legalCommands.filter((cmd) => cmd.type === 'declare_attackers');
  assert.ok(options.length > 0, 'są opcje ataku');
  for (const option of options) {
    assert.ok((option.attackerIds ?? []).includes('goaded'),
      'każda oferowana deklaracja zawiera goadowanego stwora (CR 508.1a)');
  }
  const illegal = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['free'] });
  assert.ok(!illegal.ok, 'deklaracja pomijająca goadowanego stwora jest nielegalna');
});

// --- BUG #4: zakryty permanent nie zdradza tożsamości (CR 708.2) ------------

test('M140/B4: face-down permanent nie ujawnia przeciwnikowi podtypów ani morpha', () => {
  const state = game();
  const morphCards = registry.all().filter((card) => card.morph);
  assert.ok(morphCards.length > 0, 'w rejestrze są karty z morph');
  morphCards.forEach((card, index) => {
    const data = gameObjectDataOf(card);
    data.types = card.types ?? [];
    data.keywords = card.keywords ?? [];
    data.subtypes = card.subtypes ?? [];
    addObject(state, {
      id: `m${index}`, instanceId: `i-m${index}`, cardId: card.id,
      controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', ...data,
    });
    state.objects.set(`m${index}`, Object.freeze({
      ...state.objects.get(`m${index}`), faceDown: true, cardName: null,
    }));
  });

  const view = playerView(state, 'p1');
  for (const entry of view.zones.battlefield) {
    assert.equal(entry.cardId, null, 'tożsamość ukryta');
    assert.equal(entry.subtypes ?? null, null, 'podtypy ukryte (CR 708.2)');
    assert.equal(entry.types ?? null, null, 'linia typów ukryta (CR 708.2)');
    assert.equal(entry.morph ?? null, null, 'deskryptor morpha (koszt + kolory) ukryty');
    assert.equal(entry.power, 2, 'zakryty stwór to 2/2');
    assert.equal(entry.toughness, 2, 'zakryty stwór to 2/2');
  }
  // Wszystkie zakryte permanenty muszą być dla przeciwnika NIEROZRÓŻNIALNE.
  const fingerprints = new Set(view.zones.battlefield
    .map((entry) => JSON.stringify({ ...entry, id: null })));
  assert.equal(fingerprints.size, 1,
    'różne karty pod zakryciem wyglądają identycznie — inaczej mgła wojny jest pozorna');
});

test('M140/B4: kontroler nadal widzi własny face-down w pełni', () => {
  const state = game();
  const card = registry.all().find((entry) => entry.morph);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id: 'mine', instanceId: 'i-mine', cardId: card.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...data,
  });
  state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), faceDown: true }));

  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'mine');
  assert.equal(entry.cardId, card.id, 'kontroler zna swoją kartę');
  assert.ok(entry.morph, 'kontroler widzi koszt obrotu (etykieta „Obróć twarzą do góry”)');
});

// --- BUG #5: kopia bierze tylko wartości kopiowalne (CR 707.2) --------------

function copyTokenOf(state, cardId, mutate = null) {
  const card = registry.get(cardId);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id: 'orig', instanceId: 'i-orig', cardId, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...data,
  });
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'src-card', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, types: ['Creature'],
    subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
  });
  if (mutate) mutate(state);
  applyEffect(state, { type: 'create_copy_token' }, state.objects.get('src'), ['orig']);
  return [...state.objects.values()].find((o) => o.isToken);
}

test('M140/B5: token-kopia OŻYWIONEGO artefaktu nie dziedziczy animacji', () => {
  const state = game();
  const token = copyTokenOf(state, 'lodestone-needle', (s) => {
    // Animacja „until end of turn” — NIE jest wartością kopiowalną (CR 707.2).
    animatePermanentUntilEndOfTurn(s, 'orig', { power: 5, toughness: 5, typesAdd: ['Creature'] });
    markDamage(s, 'orig', 2);
  });
  assert.ok(token, 'token-kopia powstał');
  assert.equal(token.kind, 'artifact', 'kopia ma rodzaj z KARTY, nie z animacji');
  assert.ok(!(token.types ?? []).includes('Creature'), 'animacja nie dodaje typu Creature kopii');
  assert.equal(token.power, null, 'kopia artefaktu bez P/T');
  assert.equal(token.damage ?? 0, 0, 'obrażenia nie są kopiowalne');
  assert.equal(Object.keys(token.counters ?? {}).length, 0, 'liczniki nie są kopiowalne');
});

test('M140/B5: kopia artefaktowego STWORA z karty nadal jest stworem (bez regresji)', () => {
  const artifactCreature = registry.all()
    .find((card) => (card.types ?? []).includes('Artifact') && (card.types ?? []).includes('Creature'));
  assert.ok(artifactCreature, 'w rejestrze jest artefaktowy stwór');
  const state = game();
  const token = copyTokenOf(state, artifactCreature.id);
  assert.equal(token.kind, 'creature', 'kopia stwora z karty pozostaje stworem');
  assert.equal(token.power, artifactCreature.power, 'P/T z karty');
});

test('M140/B5: token-kopia karty dwustronnej zachowuje drugą stronę (CR 707.8a)', () => {
  const state = game();
  const card = registry.get('lodestone-needle');
  const back = registry.get(card.transformTo);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  data.transformTo = {
    cardId: back.id, cardName: back.name, kind: gameObjectDataOf(back).kind,
    power: back.power, toughness: back.toughness, abilities: back.abilities ?? [],
    keywords: back.keywords ?? [], subtypes: back.subtypes ?? [], types: back.types ?? [],
    manaCost: back.manaCost ?? 0,
  };
  addObject(state, {
    id: 'orig', instanceId: 'i-orig', cardId: card.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...data,
  });
  addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'src-card', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, types: ['Creature'],
    subtypes: [], keywords: [], abilities: [], colors: [], manaCost: 1,
  });
  applyEffect(state, { type: 'create_copy_token' }, state.objects.get('src'), ['orig']);
  const token = [...state.objects.values()].find((o) => o.isToken);
  assert.ok(token.transformTo, 'token-kopia DFC ma drugą stronę');
});
