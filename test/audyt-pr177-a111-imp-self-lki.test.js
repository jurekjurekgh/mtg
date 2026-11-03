// A111: samotne odejście źródła grupowego triggera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

// A111 zamknięte w PR #179: własne odejście źródła grupowego triggera czyta
// stan sprzed ruchu, a wygnanie zamiast śmierci nie wyłącza skanu odejścia.
// Wszystkie przypadki są aktywne; nie wymagają już flagi wymuszenia.
//
// CR 603.6c: „Leaves-the-battlefield abilities trigger when a permanent moves
// from the battlefield to another zone”. CR 603.10a: „Some zone-change
// triggers look back in time. These are leaves-the-battlefield abilities”.
// CR 122.1h: finality „If this permanent would be put into a graveyard from
// the battlefield, exile it instead.” Tekst CR: nwgarne/mtg-data, SHA-256
// 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
const audit = (name, fn) => test(name, fn);
const registry = createCardRegistry();
const other = (p) => (p === 'p1' ? 'p2' : 'p1');
function put(state, id, cardId, ownerId, zone) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  return addObject(state, { ...data, id, instanceId: `i-${id}`, zone, controllerId: ownerId });
}
const view = (state) => playerView(state, state.turn.priorityPlayerId);
function act(state, command) {
  assert.ok(command, JSON.stringify(view(state).legalCommands));
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result));
}
function pass(state) {
  act(
    state,
    view(state).legalCommands.find((c) => c.type === 'pass_priority'),
  );
}
// Tura, pula, biblioteka, Imp i niektóre cechy są syntetycznie ustawione;
// Shock rzeczywiście rzucany i rozstrzygany.
function scene(
  controller,
  { stolen = false, finality = false, stripped = false, second = false } = {},
) {
  const state = createGameState({ seed: 177111, players: [{ id: 'p1' }, { id: 'p2' }] });
  const shooter = other(controller),
    owner = stolen ? shooter : controller;
  state.turn = jumpToStep(state.turn, 'main1', shooter);
  state.turn.activePlayerId = state.turn.priorityPlayerId = shooter;
  put(state, 'imp', 'nefarious-imp', owner, 'battlefield');
  if (stolen || stripped)
    state.objects.set(
      'imp',
      Object.freeze({
        ...state.objects.get('imp'),
        controllerId: controller,
        ...(stripped ? { abilitiesStripped: true } : {}),
      }),
    );
  if (finality) addCounter(state, 'imp', 'finality', 1);
  if (second) put(state, 'second', 'nefarious-imp', controller, 'battlefield');
  put(state, 'other-imp', 'nefarious-imp', other(controller), 'battlefield');
  for (let i = 0; i < 3; i++) put(state, `lib-${i}`, 'basic-forest', controller, 'library');
  put(state, 'shock', 'shock', shooter, 'hand');
  addMana(state, shooter, 1, { colors: ['R'] });
  return state;
}
function castAndResolve(state) {
  act(
    state,
    view(state).legalCommands.find(
      (c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes('imp'),
    ),
  );
  pass(state);
  pass(state);
}
function impEvents(state) {
  return state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'nefarious-imp');
}
function replayCheck(state, base, factory) {
  const replay = replayFromState(state);
  const verified = verifyReplay(
    { ...replay, commands: replay.commands.slice(base) },
    factory,
    execute,
  );
  assert.ok(verified.deterministic);
  assert.ok(verified.results.every((r) => r.ok));
  assert.equal(stateFingerprint(verified.state), stateFingerprint(state));
}
for (const controller of ['p1', 'p2'])
  for (const stolen of [false, true])
    for (const finality of [false, true]) {
      audit(
        `A111: Imp wyzwala własne odejście i scry (${controller}, ${stolen ? 'przejęty' : 'własny'}, ${finality ? 'finality' : 'grób'})`,
        () => {
          const opts = { stolen, finality },
            state = scene(controller, opts),
            base = state.commands.length;
          castAndResolve(state);
          const moved = [...state.objects.values()].find(
            (o) => o.cardId === 'nefarious-imp' && o.kind !== 'trigger' && o.zone !== 'battlefield',
          );
          assert.ok(moved);
          assert.equal(moved.zone, finality ? 'exile' : 'graveyard');
          assert.equal(
            moved.controllerId,
            stolen ? other(controller) : controller,
            'nowy obiekt należy do właściciela',
          );
          const fired = impEvents(state);
          assert.equal(fired.length, 1);
          assert.equal(fired[0].objectId, 'imp');
          assert.equal(fired[0].playerId, controller);
          replayCheck(state, base, () => scene(controller, opts));
          pass(state);
          pass(state);
          assert.equal(
            state.pendingScry?.playerId,
            controller,
            'zachowana zdolność faktycznie rozstrzyga scry',
          );
          replayCheck(state, base, () => scene(controller, opts));
        },
      );
    }
for (const controller of ['p1', 'p2']) {
  test(`A111: utrata zdolności wyłącza własny trigger Imp (${controller})`, () => {
    const state = scene(controller, { stripped: true });
    castAndResolve(state);
    assert.equal(impEvents(state).length, 0);
  });
  audit(`A111: żywy drugi Imp i odchodzący Imp wyzwalają się po razie (${controller})`, () => {
    const state = scene(controller, { second: true });
    castAndResolve(state);
    const fired = impEvents(state);
    assert.equal(fired.length, 2);
    assert.deepEqual(fired.map((e) => e.objectId).sort(), ['imp', 'second']);
    assert.ok(fired.every((e) => e.playerId === controller));
  });
}

// Syntetycznie pozbawiony zdolności Imp zostaje wygnany z finality;
// żywy drugi Imp obserwuje odejście, mimo że „dies” nie zachodzi.
for (const controller of ['p1', 'p2'])
  audit(`A111: żywy Imp widzi wygnanie innego permanentu z finality (${controller})`, () => {
    const state = scene(controller, { second: true, stripped: true, finality: true });
    castAndResolve(state);
    const fired = impEvents(state);
    assert.equal(fired.length, 1);
    assert.equal(fired[0].objectId, 'second');
    assert.equal(fired[0].playerId, controller);
    assert.ok(
      [...state.objects.values()].some((o) => o.cardId === 'nefarious-imp' && o.zone === 'exile'),
    );
  });

// Rzeczywiste niszczenie efektem oraz poświęcenie jako koszt; obie ścieżki
// z finality to odejście, lecz nie „dies”. Selhoff jest dodatkową kontrolą.
for (const controller of ['p1', 'p2'])
  for (const method of ['destroy', 'sacrifice'])
    audit(`A111: ${method} z finality wyzwala odejście, nie dies (${controller})`, () => {
      const state = scene(controller, { second: true, stripped: true, finality: true });
      put(state, 'selhoff', 'selhoff-occultist', other(controller), 'battlefield');
      if (method === 'destroy') {
        const shooter = other(controller);
        put(state, 'terminal', 'terminal-agony', shooter, 'hand');
        addMana(state, shooter, 4, { colors: ['B', 'R'] });
        act(
          state,
          view(state).legalCommands.find(
            (c) =>
              c.type === 'cast_spell' && c.objectId === 'terminal' && c.targets?.includes('imp'),
          ),
        );
        pass(state);
        pass(state);
      } else {
        state.turn = jumpToStep(state.turn, 'main1', controller);
        state.turn.activePlayerId = state.turn.priorityPlayerId = controller;
        put(state, 'rites', 'village-rites', controller, 'hand');
        addMana(state, controller, 1, { colors: ['B'] });
        act(
          state,
          view(state).legalCommands.find(
            (c) =>
              c.type === 'cast_spell' && c.objectId === 'rites' && c.sacrificeTargetId === 'imp',
          ),
        );
      }
      const fired = impEvents(state);
      assert.equal(fired.length, 1);
      assert.equal(fired[0].objectId, 'second');
      assert.equal(fired[0].playerId, controller);
      assert.equal(
        state.events.filter(
          (e) => e.type === 'ability_triggered' && e.cardId === 'selhoff-occultist',
        ).length,
        0,
        'wygnanie nie jest śmiercią',
      );
      assert.equal(
        Boolean(state.descendedThisTurn[controller]),
        false,
        'wygnana karta nie powoduje descended',
      );
      assert.ok(
        [...state.objects.values()].some((o) => o.cardId === 'nefarious-imp' && o.zone === 'exile'),
      );
    });

// Kontrola: zwykłe poświęcenie karty naprawdę powoduje descended i dies.
for (const controller of ['p1', 'p2'])
  test(`A111: poświęcenie do grobu nadal powoduje descended i dies (${controller})`, () => {
    const state = scene(controller, { second: true, stripped: true });
    state.turn = jumpToStep(state.turn, 'main1', controller);
    state.turn.activePlayerId = state.turn.priorityPlayerId = controller;
    put(state, 'selhoff', 'selhoff-occultist', other(controller), 'battlefield');
    put(state, 'rites', 'village-rites', controller, 'hand');
    addMana(state, controller, 1, { colors: ['B'] });
    act(
      state,
      view(state).legalCommands.find(
        (c) => c.type === 'cast_spell' && c.objectId === 'rites' && c.sacrificeTargetId === 'imp',
      ),
    );
    assert.equal(Boolean(state.descendedThisTurn[controller]), true);
    assert.equal(
      state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'selhoff-occultist')
        .length,
      1,
    );
    assert.equal(impEvents(state).filter((e) => e.objectId === 'second').length, 1);
  });

// Syntetycznie nadany prawdziwy deskryptor triggera przeżywa utratę druku.
for (const controller of ['p1', 'p2'])
  audit(`A111: LKI widzi nadaną zdolność mimo utraty druku (${controller})`, () => {
    const state = scene(controller, { stripped: true });
    const imp = state.objects.get('imp'),
      granted = registry.get('nefarious-imp').abilities[0];
    state.objects.set('imp', Object.freeze({ ...imp, abilityGrants: Object.freeze([granted]) }));
    castAndResolve(state);
    const fired = impEvents(state);
    assert.equal(fired.length, 1);
    assert.equal(fired[0].objectId, 'imp');
    assert.equal(fired[0].playerId, controller);
    pass(state);
    pass(state);
    assert.equal(state.pendingScry?.playerId, controller);
  });

// Obrażenia + SBA z finality: odejście tak, dies i descended nie.
for (const controller of ['p1', 'p2'])
  audit(`A111: finality po Shock wyzwala odejście, nie dies (${controller})`, () => {
    const state = scene(controller, { second: true, stripped: true, finality: true });
    put(state, 'selhoff', 'selhoff-occultist', other(controller), 'battlefield');
    castAndResolve(state);
    assert.equal(impEvents(state).filter((e) => e.objectId === 'second').length, 1);
    assert.equal(
      state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'selhoff-occultist')
        .length,
      0,
    );
    assert.equal(Boolean(state.descendedThisTurn[controller]), false);
  });
