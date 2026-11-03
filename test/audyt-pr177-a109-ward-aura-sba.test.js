// Rzeczywisty Scion oraz Ward {2} z disguise Riftburst Helliona.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck, gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { replayFromState, verifyReplay } from '../src/engine/replay.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { addCounter } from '../src/engine/counters.js';
// Otwarte: wykonywalny RED na żądanie, bez blokowania całej szybkiej paczki.
const audit = (name, fn) =>
  test(
    name,
    {
      skip: process.env.AUDIT_A109_ENFORCE === '1' ? false : 'otwarte A109 (AUDIT_A109_ENFORCE=1)',
    },
    fn,
  );
const reg = createCardRegistry();
function put(s, id, card, zone, p) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [card], ownerId: p, registry: reg });
  addObject(s, { ...data, id, instanceId: `i-${id}`, zone, controllerId: p });
}
const view = (s) => playerView(s, s.turn.priorityPlayerId);
function act(s, c) {
  assert.ok(c, JSON.stringify(view(s).legalCommands));
  const r = execute(s, c);
  assert.ok(r.ok, JSON.stringify(r));
}
function pass(s) {
  act(
    s,
    view(s).legalCommands.find((c) => c.type === 'pass_priority'),
  );
}
function turn(s, p) {
  s.turn = jumpToStep(s.turn, 'main1', p);
  s.turn.activePlayerId = s.turn.priorityPlayerId = p;
}
function scene(
  active,
  payer,
  {
    aura = false,
    imp = false,
    forebear = false,
    blood = false,
    dryad = false,
    torch = false,
    opposingAura = false,
    treasureAura = false,
  } = {},
) {
  const s = createGameState({ seed: 17795, players: [{ id: 'p1' }, { id: 'p2' }] }),
    opp = payer === 'p1' ? 'p2' : 'p1';
  turn(s, payer);
  addMana(s, payer, 6, { colors: ['G'] });
  for (let i = 0; i < 2; i++) {
    put(s, `summoner${i}`, 'scion-summoner', 'hand', payer);
    act(
      s,
      view(s).legalCommands.find(
        (c) => c.type === 'cast_permanent' && c.objectId === `summoner${i}`,
      ),
    );
    pass(s);
    pass(s);
    pass(s);
    pass(s);
  }
  const tokens = [...s.objects.values()].filter(
    (o) => o.cardId === 'token_eldrazi_scion' && o.zone === 'battlefield',
  );
  assert.equal(tokens.length, 2);
  if (aura) {
    put(s, 'guide', 'griffin-guide', 'hand', payer);
    addMana(s, payer, 3, { colors: ['W'] });
    const c = view(s).legalCommands.find(
      (c) =>
        c.type === 'cast_permanent' && c.objectId === 'guide' && c.targets?.includes(tokens[0].id),
    );
    assert.ok(c, JSON.stringify(view(s).legalCommands));
    act(s, c);
    pass(s);
    pass(s);
    assert.ok(
      [...s.objects.values()].some(
        (o) => o.cardId === 'griffin-guide' && o.attachedTo === tokens[0].id,
      ),
    );
  }
  if (blood) {
    put(s, 'blood', 'infectious-bloodlust', 'hand', payer);
    addMana(s, payer, 2, { colors: ['R'] });
    act(
      s,
      view(s).legalCommands.find(
        (c) =>
          c.type === 'cast_permanent' &&
          c.objectId === 'blood' &&
          c.targets?.includes(tokens[0].id),
      ),
    );
    pass(s);
    pass(s);
    assert.ok(
      [...s.objects.values()].some(
        (o) => o.cardId === 'infectious-bloodlust' && o.attachedTo === tokens[0].id,
      ),
    );
  }
  if (dryad) {
    put(s, 'dryad', 'leafcrown-dryad', 'hand', payer);
    addMana(s, payer, 4, { colors: ['G'] });
    act(
      s,
      view(s).legalCommands.find(
        (c) =>
          c.type === 'cast_permanent' &&
          c.objectId === 'dryad' &&
          c.bestow &&
          c.targets?.includes(tokens[0].id),
      ),
    );
    pass(s);
    pass(s);
    assert.ok(
      [...s.objects.values()].some(
        (o) => o.cardId === 'leafcrown-dryad' && o.attachedTo === tokens[0].id,
      ),
    );
  }
  if (torch) {
    put(s, 'torch', 'blazing-torch', 'battlefield', payer);
    addMana(s, payer, 1, { colors: [] });
    act(
      s,
      view(s).legalCommands.find(
        (c) =>
          c.type === 'activate_ability' &&
          c.objectId === 'torch' &&
          c.targets?.includes(tokens[0].id),
      ),
    );
    pass(s);
    pass(s);
    assert.equal(s.objects.get('torch').attachedTo, tokens[0].id);
  }
  if (treasureAura) {
    // Treasure'y umieszczone w setupie; Clawing Torment rzucono i rozstrzygnięto.
    for (const id of ['treasure1', 'treasure2'])
      addObject(s, {
        ...gameObjectDataOf(reg.get('token_treasure')),
        id,
        instanceId: `i-${id}`,
        cardId: 'token_treasure',
        ownerId: payer,
        controllerId: payer,
        zone: 'battlefield',
        isToken: true,
      });
    put(s, 'torment', 'clawing-torment', 'hand', payer);
    addMana(s, payer, 1, { colors: ['B'] });
    act(
      s,
      view(s).legalCommands.find(
        (c) =>
          c.type === 'cast_permanent' &&
          c.objectId === 'torment' &&
          c.targets?.includes('treasure1'),
      ),
    );
    pass(s);
    pass(s);
    assert.ok(
      [...s.objects.values()].some(
        (o) => o.cardId === 'clawing-torment' && o.attachedTo === 'treasure1',
      ),
    );
  }
  turn(s, opp);
  if (opposingAura) {
    put(s, 'opposing-aura', 'infectious-bloodlust', 'hand', opp);
    addMana(s, opp, 2, { colors: ['R'] });
    act(
      s,
      view(s).legalCommands.find(
        (c) =>
          c.type === 'cast_permanent' &&
          c.objectId === 'opposing-aura' &&
          c.targets?.includes(tokens[0].id),
      ),
    );
    pass(s);
    pass(s);
    assert.ok(
      [...s.objects.values()].some(
        (o) =>
          o.cardId === 'infectious-bloodlust' &&
          o.attachedTo === tokens[0].id &&
          o.controllerId === opp,
      ),
    );
  }
  put(s, 'hellion', 'riftburst-hellion', 'hand', opp);
  addMana(s, opp, 3, { colors: ['R'] });
  act(
    s,
    view(s).legalCommands.find((c) => c.objectId === 'hellion' && c.faceDown),
  );
  pass(s);
  pass(s);
  const hidden = [...s.objects.values()].find(
    (o) => o.cardId === 'riftburst-hellion' && o.faceDown,
  );
  assert.ok(hidden);
  for (const p of ['p2', 'p1']) {
    put(s, `${p}-occult`, 'selhoff-occultist', 'battlefield', p);
    for (let i = 0; i < 4; i++) put(s, `${p}-lib${i}`, 'basic-forest', 'library', p);
  }
  if (imp) put(s, 'imp', 'nefarious-imp', 'battlefield', payer);
  if (forebear) put(s, 'forebear', 'furious-forebear', 'graveyard', payer);
  turn(s, active);
  s.turn.priorityPlayerId = payer;
  put(s, 'shock', 'shock', 'hand', payer);
  addMana(s, payer, 1, { colors: ['R'] });
  act(
    s,
    view(s).legalCommands.find(
      (c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes(hidden.id),
    ),
  );
  pass(s);
  pass(s);
  assert.ok(s.pendingWardPay);
  return { s, tokens, payer, active };
}

// Karty i akcje realne; pule/tura/priorytet ustawiono w setupie.
for (const payer of ['p1', 'p2'])
  for (const pay of [false, true])
    audit(
      `A109: Griffin i token czekają na SBA po Ward, ${pay ? 'zapłata' : 'odmowa'} (${payer})`,
      () => {
        const { s, tokens } = scene(payer, payer, { aura: true }),
          base = s.commands.length;
        const aura = () =>
          [...s.objects.values()].find((o) => o.cardId === 'griffin-guide' && o.kind !== 'trigger');
        const graveTokens = () =>
          [...s.objects.values()].filter(
            (o) => o.cardId === 'token_eldrazi_scion' && o.zone === 'graveyard',
          );
        const checkReplay = () => {
          const replay = replayFromState(s),
            result = verifyReplay(
              { ...replay, commands: replay.commands.slice(base) },
              () => scene(payer, payer, { aura: true }).s,
              execute,
            );
          assert.ok(result.deterministic);
          assert.ok(result.results.every((r) => r.ok));
          assert.equal(stateFingerprint(result.state), stateFingerprint(s));
        };
        act(
          s,
          view(s).legalCommands.find(
            (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
          ),
        );
        assert.ok(s.pendingWardPay);
        assert.equal(aura()?.zone, 'battlefield', 'osierocona aura czeka na akcję stanową');
        assert.equal(graveTokens().length, 1, 'token przestaje istnieć dopiero w SBA');
        checkReplay();
        if (pay)
          act(
            s,
            view(s).legalCommands.find(
              (c) => c.type === 'activate_ability' && c.objectId === tokens[1].id,
            ),
          );
        act(
          s,
          view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && c.pay === pay),
        );
        assert.equal(aura()?.zone, 'graveyard');
        assert.equal(graveTokens().length, 0);
        assert.equal(
          s.events.filter(
            (e) =>
              e.type === 'ability_triggered' &&
              e.cardId === 'griffin-guide' &&
              e.trigger === 'enchanted_creature_dies',
          ).length,
          1,
        );
        checkReplay();
      },
    );

// Rzeczywiste drugie zaklęcie; oba triggery powstają po jednym, a SBA czeka.
for (const payer of ['p1', 'p2'])
  audit(`A109: dwie aury na Scionie zachowują LKI i pojedyncze triggery (${payer})`, () => {
    const { s, tokens } = scene(payer, payer, { aura: true, blood: true });
    const card = (id) =>
      [...s.objects.values()].find((o) => o.cardId === id && o.kind !== 'trigger');
    act(
      s,
      view(s).legalCommands.find(
        (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
      ),
    );
    for (const id of ['griffin-guide', 'infectious-bloodlust'])
      assert.equal(card(id).zone, 'battlefield');
    act(
      s,
      view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && !c.pay),
    );
    for (const id of ['griffin-guide', 'infectious-bloodlust']) {
      assert.equal(card(id).zone, 'graveyard');
      assert.equal(
        s.events.filter(
          (e) =>
            e.type === 'ability_triggered' &&
            e.cardId === id &&
            e.trigger === 'enchanted_creature_dies',
        ).length,
        1,
      );
    }
  });
// Liczniki finality są ustawione syntetycznie, obiekty i komendy rzeczywiste.
for (const payer of ['p1', 'p2'])
  for (const finality of ['host', 'aura'])
    audit(`A109: finality ${finality} nie gubi granicy SBA ani warunku dies (${payer})`, () => {
      const { s, tokens } = scene(payer, payer, { aura: true }),
        guide = [...s.objects.values()].find(
          (o) => o.cardId === 'griffin-guide' && o.zone === 'battlefield',
        );
      addCounter(s, finality === 'host' ? tokens[0].id : guide.id, 'finality', 1);
      act(
        s,
        view(s).legalCommands.find(
          (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
        ),
      );
      assert.equal(s.objects.get(guide.id).zone, 'battlefield');
      act(
        s,
        view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && !c.pay),
      );
      const moved = [...s.objects.values()].find(
        (o) => o.cardId === 'griffin-guide' && o.kind !== 'trigger',
      );
      assert.equal(moved.zone, finality === 'aura' ? 'exile' : 'graveyard');
      assert.equal(
        s.events.filter(
          (e) =>
            e.type === 'ability_triggered' &&
            e.cardId === 'griffin-guide' &&
            e.trigger === 'enchanted_creature_dies',
        ).length,
        finality === 'host' ? 0 : 1,
      );
    });
// Realny bestow oraz rzeczywista aktywacja equip (sam Torch umieszczony w setupie).
for (const payer of ['p1', 'p2'])
  audit(`A109: bestow i equipment nie trafiają do grobu jak czysta aura (${payer})`, () => {
    const { s, tokens } = scene(payer, payer, { aura: true, dryad: true, torch: true });
    act(
      s,
      view(s).legalCommands.find(
        (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
      ),
    );
    const dryad = [...s.objects.values()].find(
      (o) => o.cardId === 'leafcrown-dryad' && o.zone === 'battlefield',
    );
    assert.equal(dryad?.kind, 'creature');
    assert.equal(dryad.attachedTo, null);
    assert.equal(s.objects.get('torch').zone, 'battlefield');
    assert.equal(s.objects.get('torch').attachedTo, null);
    assert.equal(
      [...s.objects.values()].find((o) => o.cardId === 'griffin-guide' && o.kind !== 'trigger')
        .zone,
      'battlefield',
    );
    act(
      s,
      view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && !c.pay),
    );
    assert.equal(dryad.zone, 'battlefield');
    assert.equal(s.objects.get('torch').zone, 'battlefield');
  });

for (const payer of ['p1', 'p2'])
  audit(`A109: trigger aury przeciwnika zachowuje kontrolera z chwili zdarzenia (${payer})`, () => {
    const opponent = payer === 'p1' ? 'p2' : 'p1',
      { s, tokens } = scene(payer, payer, { aura: true, opposingAura: true });
    const aura = [...s.objects.values()].find(
      (o) => o.cardId === 'infectious-bloodlust' && o.zone === 'battlefield',
    );
    act(
      s,
      view(s).legalCommands.find(
        (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
      ),
    );
    assert.equal(s.objects.get(aura.id).zone, 'battlefield');
    const fired = s.events.filter(
      (e) =>
        e.type === 'ability_triggered' &&
        e.cardId === 'infectious-bloodlust' &&
        e.trigger === 'enchanted_creature_dies',
    );
    assert.equal(fired.length, 1);
    assert.equal(fired[0].playerId, opponent);
    act(
      s,
      view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && !c.pay),
    );
    assert.equal(
      [...s.objects.values()].find(
        (o) => o.cardId === 'infectious-bloodlust' && o.kind !== 'trigger',
      ).zone,
      'graveyard',
    );
  });
// Imp na polu bitwy w setupie: oddzielne zdarzenia Sciona i aury dają dwa triggery.
for (const payer of ['p1', 'p2'])
  audit(`A109: Imp widzi osobne odejścia Sciona i aury po Ward (${payer})`, () => {
    const { s, tokens } = scene(payer, payer, { aura: true, imp: true });
    const fired = () =>
      s.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'nefarious-imp').length;
    act(
      s,
      view(s).legalCommands.find(
        (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
      ),
    );
    assert.equal(fired(), 1);
    act(
      s,
      view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && !c.pay),
    );
    assert.equal(fired(), 2, 'drugi trigger po rzeczywistym opuszczeniu pola przez aurę');
  });
// Zmiana kontrolera aury jest syntetyczna; Impy, Griffin, Scion i Ward są rzeczywiste.
for (const payer of ['p1', 'p2'])
  for (const exile of [false, true])
    audit(
      `A109: Imp kontrolera skradzionej aury widzi jej ${exile ? 'wygnanie' : 'grób'} (${payer})`,
      () => {
        const opponent = payer === 'p1' ? 'p2' : 'p1',
          { s, tokens } = scene(payer, payer, { aura: true, imp: true });
        put(s, 'opp-imp', 'nefarious-imp', 'battlefield', opponent);
        const aura = [...s.objects.values()].find(
          (o) => o.cardId === 'griffin-guide' && o.zone === 'battlefield',
        );
        s.objects.set(aura.id, Object.freeze({ ...aura, controllerId: opponent }));
        if (exile) addCounter(s, aura.id, 'finality', 1);
        const impEvents = () =>
          s.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'nefarious-imp');
        act(
          s,
          view(s).legalCommands.find(
            (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
          ),
        );
        assert.equal(impEvents().filter((e) => e.playerId === payer).length, 1);
        assert.equal(impEvents().filter((e) => e.playerId === opponent).length, 0);
        act(
          s,
          view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && !c.pay),
        );
        assert.equal(impEvents().filter((e) => e.playerId === payer).length, 1);
        assert.equal(impEvents().filter((e) => e.playerId === opponent).length, 1);
        const moved = [...s.objects.values()].find(
          (o) => o.cardId === 'griffin-guide' && o.kind !== 'trigger',
        );
        assert.equal(moved.zone, exile ? 'exile' : 'graveyard');
        assert.equal(moved.controllerId, payer);
      },
    );
// Syntetyczne obniżenie życia po otwarciu Ward symuluje koszt/efekt w toku.
for (const payer of ['p1', 'p2'])
  audit(`A109: przegrana z 0 życia sprawdzana po zakończeniu Ward (${payer})`, () => {
    const { s, tokens } = scene(payer, payer, { aura: true });
    s.players.find((p) => p.id === payer).life = 0;
    act(
      s,
      view(s).legalCommands.find(
        (c) => c.type === 'activate_ability' && c.objectId === tokens[0].id,
      ),
    );
    assert.equal(s.status, 'active');
    assert.ok(s.pendingWardPay);
    act(
      s,
      view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && !c.pay),
    );
    assert.notEqual(s.status, 'active');
    assert.ok(s.events.some((e) => e.type === 'player_lost' && e.playerId === payer));
  });

// Auto-zapłata {2} poświęca po kolei dwa prawdziwe Treasure'y; Imp powinien
// osobno zobaczyć oba koszty i późniejsze SBA aury, nie jedną grupę komendy.
for (const payer of ['p1', 'p2'])
  audit(`A109: auto-Ward, dwa Treasure i oddzielne SBA aury (${payer})`, () => {
    const { s } = scene(payer, payer, { imp: true, treasureAura: true });
    const fired = () =>
      s.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'nefarious-imp').length;
    const aura = [...s.objects.values()].find(
      (o) => o.cardId === 'clawing-torment' && o.zone === 'battlefield',
    );
    assert.ok(aura);
    assert.equal(fired(), 0);
    act(
      s,
      view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && c.pay),
    );
    assert.deepEqual(
      s.events
        .filter((e) => e.type === 'permanent_sacrificed' && e.cardId === 'token_treasure')
        .map((e) => e.fromId),
      ['treasure1', 'treasure2'],
    );
    assert.equal(
      [...s.objects.values()].find((o) => o.cardId === 'clawing-torment' && o.kind !== 'trigger')
        .zone,
      'graveyard',
    );
    assert.equal(fired(), 3, 'dwa osobne poświęcenia i późniejsze odejście aury');
  });
// Przy automatycznej zapłacie aura nie może opuścić pola PRZED końcem Ward.
for (const payer of ['p1', 'p2'])
  audit(`A109: auto-Ward odkłada odejście aury do SBA (${payer})`, () => {
    const { s } = scene(payer, payer, { imp: true, treasureAura: true });
    const base = s.commands.length;
    act(
      s,
      view(s).legalCommands.find((c) => c.type === 'resolve_ward_pay_choice' && c.pay),
    );
    const resolution = s.events.findIndex((e) => e.type === 'ward_pay_resolved');
    const departure = s.events.findIndex(
      (e) => e.type === 'permanent_put_into_graveyard' && e.cardId === 'clawing-torment',
    );
    assert.ok(
      resolution >= 0 && departure > resolution,
      'aura opuszcza pole dopiero w SBA po rozstrzygnięciu Ward',
    );
    const replay = replayFromState(s);
    const result = verifyReplay(
      { ...replay, commands: replay.commands.slice(base) },
      () => scene(payer, payer, { imp: true, treasureAura: true }).s,
      execute,
    );
    assert.ok(result.deterministic);
    assert.ok(result.results.every((r) => r.ok));
    assert.equal(stateFingerprint(result.state), stateFingerprint(s));
  });
