// =============================================================================
// Zgłoszenie FJ (2026-11-09, właściciel) — Fiery Justice: bot rzuca ją w
// przeciwnika, który traci 5 życia i po chwili odzyskuje 5 życia. „Kompletnie
// bezsensowne zmarnowanie tej karty.”
//
// Podstawa źródłowa (ADR 0030):
//   Oracle (docs/cards/scryfall-fiery-justice.json): „Fiery Justice deals 5
//   damage divided as you choose among any number of targets. Target opponent
//   gains 5 life.”
//   Ruling WotC 2017-03-14: „The target opponent for the life-gaining effect
//   may also be a target for the damage-dealing effect. If this happens and
//   the damage brings that player's life total to 0 or less, the life-gaining
//   effect will raise their life total above 0 again before the player would
//   lose the game.”
//   CR 119.3: „If an effect causes a player to gain life or lose life, that
//   player’s life total is adjusted accordingly.”
//   CR 608.2c: „The controller of the spell or ability follows its
//   instructions in the order written. […] read the whole text and apply the
//   rules of English to the text.”
//   CR 704.3 / 704.5a: SBA sprawdzane przy priorytecie, po rozstrzygnięciu;
//   „If a player has 0 or less life, that player loses the game.”
//
// Naprawa jest polityką bota po deskryptorze (ADR 0002), nie po nazwie karty:
// obrażenia i zysk życia TEGO SAMEGO gracza w jednym rozstrzygnięciu liczą
// się netto. Silnik bez zmian — ruling jest już pinowany w B62/210.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(state, id, cardId, zone, pid = 'p1') {
  const def = registry.get(cardId);
  assert.ok(def, `missing card definition: ${cardId}`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

function body(state, id, pid, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: extra.manaCost ?? 3,
    abilities: [], keywords: extra.keywords ?? [], subtypes: [], types: ['Creature'],
    colors: [], cardName: id, ...extra,
  });
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
}

/** Syntetyk deskryptora — dowód, że reguła nie czyta nazwy/ID karty. */
function synthetic(state, id, spell, pid = 'p1') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'hand', kind: 'spell', types: ['Sorcery'], manaCost: 3, colors: ['R', 'G', 'W'],
    cardName: id, abilities: [], keywords: [], subtypes: [], spell,
  });
}

function scene({ foeLife = 20, myLife = 20, foeBodies = [], spellId = 'fiery-justice', synSpell = null } = {}) {
  const s = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.pendingMulligans = [];
  s.players.find((p) => p.id === 'p1').life = myLife;
  s.players.find((p) => p.id === 'p2').life = foeLife;
  if (synSpell) synthetic(s, 'spell', synSpell);
  else put(s, 'spell', spellId, 'hand');
  for (const [i, cardId] of ['basic-mountain', 'basic-forest', 'basic-plains'].entries()) {
    put(s, `land-${i}`, cardId, 'battlefield');
  }
  for (const [i, b] of foeBodies.entries()) body(s, `foe-${i}`, 'p2', b[0], b[1], b[2] ?? {});
  for (let i = 0; i < 12; i += 1) {
    addObject(s, { id: `l1-${i}`, instanceId: `il1-${i}`, cardId: 'basic-forest', controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'land', manaCost: 0 });
    addObject(s, { id: `l2-${i}`, instanceId: `il2-${i}`, cardId: 'basic-forest', controllerId: 'p2', ownerId: 'p2', zone: 'library', kind: 'land', manaCost: 0 });
  }
  return s;
}

function choose(s) {
  const bot = createHeuristicBot({ seed: 5, registry });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  const options = bot.trace().at(-1)?.options ?? [];
  return { cmd, options };
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
function run(s, cmd) {
  assert.ok(cmd, 'komenda istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, `${cmd.type} odrzucone: ${r.reason ?? ''}`);
  return r;
}
function settle(s, max = 40) {
  for (let i = 0; i < max; i += 1) {
    if (s.status === 'finished') return;
    const idle = s.zones.stack.length === 0 && s.pendingTriggerTargets.length === 0;
    const choices = commands(s);
    if (idle && !choices.some((c) => c.type.startsWith('resolve_'))) return;
    const pick = choices.find((c) => c.type === 'pass_priority' && s.zones.stack.length)
      ?? choices.find((c) => c.type.startsWith('resolve_'))
      ?? choices.find((c) => c.type === 'pass_priority');
    if (!pick) return;
    run(s, pick);
  }
}
const lifeOf = (s, id) => s.players.find((p) => p.id === id).life;
const inZone = (s, id, zone) => [...s.objects.values()].some((o) => o.cardId === `test-${id}` && o.zone === zone);
const castScores = (options, type = 'cast_spell') => options.filter((o) => String(o.cmd).startsWith(type)).map((o) => o.score);
const best = (scores) => scores.length ? Math.max(...scores) : -Infinity;

// ---------------------------------------------------------------------------
// Silnik / ruling — kontrakt, którego bot musi słuchać
// ---------------------------------------------------------------------------

test('FJ/1: ruling WotC — 5 obrażeń + 5 życia przy 5 życia NIE dobija (SBA po rozstrzygnięciu)', () => {
  const s = scene({ foeLife: 5 });
  const cast = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'spell'
    && c.damageDivision?.length === 1 && c.damageDivision[0].id === 'p2' && c.damageDivision[0].amount === 5);
  assert.ok(cast, 'oferta podziału 5→p2 istnieje');
  run(s, cast);
  settle(s);
  assert.equal(lifeOf(s, 'p2'), 5, '5 − 5 + 5 = 5');
  assert.notEqual(s.status, 'finished', 'gra trwa — CR 704.3/704.5a dopiero po rozstrzygnięciu');
});

// ---------------------------------------------------------------------------
// Zgłoszenie: zero netto w twarz = pass, nie rzut
// ---------------------------------------------------------------------------

test('FJ/2: pusty stół, 20 życia — bot NIE rzuca Fiery Justice w twarz (zero netto)', () => {
  const s = scene({ foeLife: 20 });
  const { cmd, options } = choose(s);
  assert.notEqual(cmd.type, 'cast_spell', `bot trzyma kartę: ${JSON.stringify(cmd)}`);
  assert.ok(best(castScores(options)) < 0, `każdy wariant rzutu poniżej passu: ${best(castScores(options))}`);
  // Dowód w silniku: wymuszony wariant nie zmienia życia.
  const cast = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'spell'
    && c.damageDivision?.[0]?.id === 'p2' && c.damageDivision[0].amount === 5);
  run(s, cast);
  settle(s);
  assert.equal(lifeOf(s, 'p2'), 20, '20 − 5 + 5 = 20');
});

test('FJ/3: wróg 5 życia — bot NIE ogłasza fałszywego dobicia (5−5+5=5)', () => {
  const s = scene({ foeLife: 5 });
  const { cmd, options } = choose(s);
  assert.notEqual(cmd.type, 'cast_spell', `bot nie „dobija”: ${JSON.stringify(cmd)}`);
  assert.ok(best(castScores(options)) < 0, `wariant 5→p2 poniżej passu: ${best(castScores(options))}`);
});

test('FJ/4: wróg 4 życia — zero netto nadal poniżej passu', () => {
  const s = scene({ foeLife: 4 });
  const { cmd, options } = choose(s);
  assert.notEqual(cmd.type, 'cast_spell', `bot trzyma kartę: ${JSON.stringify(cmd)}`);
  assert.ok(best(castScores(options)) < 0, `rzut poniżej passu: ${best(castScores(options))}`);
});

test('FJ/5: anty-over-fix — syntetyk 10 obrażeń / +5 życia przy 5 życia DOBIJA (netto 5)', () => {
  const spell = {
    timing: 'sorcery', targets: [{ type: 'opponent' }],
    divided: { total: 10, targetType: 'any_target' },
    effects: [{ type: 'damage_divided_among_targets' }, { type: 'gain_life_target', amount: 5 }],
  };
  const s = scene({ foeLife: 5, synSpell: spell });
  const { cmd } = choose(s);
  assert.equal(cmd.type, 'cast_spell', `netto 5 ≥ 5 życia = dobicie: ${JSON.stringify(cmd)}`);
  run(s, cmd);
  settle(s);
  assert.equal(lifeOf(s, 'p2'), 0, '5 − 10 + 5 = 0');
  assert.equal(s.status, 'finished', 'SBA: gracz z 0 życia przegrywa');
  assert.equal(s.winnerId, 'p1');
});

// ---------------------------------------------------------------------------
// Anty-over-fix: podział, który realnie zabija stwory, zostaje
// ---------------------------------------------------------------------------

test('FJ/6: dwa 2/2 wroga — bot rzuca i zabija oba (removal, nie zero netto)', () => {
  const s = scene({ foeLife: 20, foeBodies: [[2, 2], [2, 2]] });
  const { cmd, options } = choose(s);
  assert.equal(cmd.type, 'cast_spell', `bot koristi z removalu: ${JSON.stringify(cmd)}`);
  assert.ok(best(castScores(options)) > 0);
  run(s, cmd);
  settle(s);
  assert.ok(inZone(s, 'foe-0', 'graveyard'), 'foe-0 w grobie');
  assert.ok(inZone(s, 'foe-1', 'graveyard'), 'foe-1 w grobie');
});

test('FJ/7: jeden 3/3 wroga — bot dobija stwora, życie wroga rośnie o nadwyżkę', () => {
  const s = scene({ foeLife: 20, foeBodies: [[3, 3]] });
  const { cmd } = choose(s);
  assert.equal(cmd.type, 'cast_spell');
  run(s, cmd);
  settle(s);
  assert.ok(inZone(s, 'foe-0', 'graveyard'), 'foe-0 w grobie');
  assert.ok(lifeOf(s, 'p2') >= 20, 'przeciwnik dostaje życie z ridera, ale stwór ginie');
});

test('FJ/7b: 1/3 wroga — bot dzieli 3 w stwora i 2 w twarz (oszczędza życie wroga)', () => {
  // Zgłoszenie właściciela 2026-11-08 (log partii, „BEZ SENSU"):
  //   „Bot rzuca Fiery Justice i zamiast podzielić to na moba (jego
  //    toughness), a reszta w przeciwnika, to ładuje całość w moba, który
  //    jest 1/3. Zabija moba i daje przeciwnikowi 5 życia. Gdyby 3 walnął
  //    w moba i 2 w przeciwnika, przeciwnik zyskałby tylko 3 życia."
  //
  // Rider („Target opponent gains 5 life") działa niezależnie od podziału,
  // więc jest KOSZTEM STAŁYM — każdy wariant oddaje te 5 życia. Obrażenia
  // przeniesione na twarz ratują życie 1:1, więc podział 3 + 2 kończy na
  // +3 zamiast +5. Wcześniej `damageTargetValue` karał porcję twarzy netto
  // (−60 za netto ≤ 0), co czyniło JAKIEKOLWIEK dotknięcie twarzy gorszym
  // od przepalenia całej puli w stwora.
  const s = scene({ foeLife: 20, foeBodies: [[1, 3]] });
  const { cmd } = choose(s);
  assert.equal(cmd.type, 'cast_spell', `bot rzuca: ${JSON.stringify(cmd)}`);
  const div = cmd.damageDivision ?? [];
  const wStwora = div.find((d) => d.id === 'foe-0')?.amount ?? 0;
  const wTwarz = div.find((d) => d.id === 'p2')?.amount ?? 0;
  assert.equal(wStwora, 3, `dokładnie toughness w stwora: ${JSON.stringify(div)}`);
  assert.equal(wTwarz, 2, `reszta w twarz: ${JSON.stringify(div)}`);
  run(s, cmd);
  settle(s);
  assert.ok(inZone(s, 'foe-0', 'graveyard'), '1/3 ginie');
  assert.equal(lifeOf(s, 'p2'), 23, '20 + 5 (rider) − 2 (obrażenia) = 23, nie 25');
});

test('FJ/8: 6/6 wroga — chip 5 poza walką nie zabija, bot nie marnuje czaru', () => {
  const s = scene({ foeLife: 20, foeBodies: [[6, 6, { manaCost: 6 }]] });
  const { cmd, options } = choose(s);
  assert.notEqual(cmd.type, 'cast_spell', `bot trzyma kartę: ${JSON.stringify(cmd)}`);
  assert.ok(best(castScores(options)) < 0);
});

// ---------------------------------------------------------------------------
// Darmowe okno rzutu z ręki (Baral/Kari Zev) — ta sama arytmetyka netto
// ---------------------------------------------------------------------------

function handFreeCast(s) {
  s.pendingHandFreeCast = {
    playerId: 'p1', sourceId: 'baral', sourceCardId: 'baral-and-kari-zev',
    cardTypes: ['Sorcery'], maxManaValue: 4, elseEffect: null, restorePriorityTo: 'p1',
  };
}

test('FJ/9: darmowy rzut z ręki, zero netto — bot ODMAWIA (skip > cast)', () => {
  const s = scene({ foeLife: 20 });
  handFreeCast(s);
  const { cmd, options } = choose(s);
  assert.equal(cmd.type, 'resolve_hand_free_cast');
  assert.equal(cmd.decline, true, `bot nie marnuje darmowego rzutu: ${JSON.stringify(cmd)}`);
  const skip = options.find((o) => String(o.cmd).includes('skip'))?.score ?? 4;
  const castOnly = options.filter((o) => String(o.cmd).startsWith('resolve_hand_free_cast') && !String(o.cmd).includes('skip')).map((o) => o.score);
  assert.ok(best(castOnly) < skip, `rzut (${best(castOnly)}) poniżej odmowy (${skip})`);
});

test('FJ/10: darmowy rzut z ręki, 2/2 wroga — bot rzuca i zabija stwora', () => {
  const s = scene({ foeLife: 20, foeBodies: [[2, 2]] });
  handFreeCast(s);
  const { cmd } = choose(s);
  assert.equal(cmd.type, 'resolve_hand_free_cast');
  assert.notEqual(cmd.decline, true, `removal wygrywa z odmową: ${JSON.stringify(cmd)}`);
  run(s, cmd);
  settle(s);
  assert.ok(inZone(s, 'foe-0', 'graveyard'), 'foe-0 w grobie');
});

// ---------------------------------------------------------------------------
// Generyczność: odbiorca życia ma znaczenie (nie nazwa karty)
// ---------------------------------------------------------------------------

test('FJ/11: obrażenia wroga + gain_life KONTROLERA — bot rzuca (życie bota nie offsetuje wroga)', () => {
  const spell = {
    timing: 'sorcery', targets: [{ type: 'opponent' }],
    effects: [{ type: 'damage', amount: 5 }, { type: 'gain_life', amount: 5 }],
  };
  const s = scene({ foeLife: 20, synSpell: spell });
  const { cmd, options } = choose(s);
  assert.equal(cmd.type, 'cast_spell', `dren dla siebie jest zyskiem: ${JSON.stringify(cmd)}`);
  assert.ok(best(castScores(options)) > 0);
  run(s, cmd);
  settle(s);
  assert.equal(lifeOf(s, 'p2'), 15);
  assert.equal(lifeOf(s, 'p1'), 25);
});

test('FJ/12: gain_life_target na SLOCIE 1 tego samego przeciwnika — zero netto, bot nie rzuca', () => {
  const spell = {
    timing: 'sorcery', targets: [{ type: 'opponent' }, { type: 'opponent' }],
    divided: { total: 5, targetType: 'any_target' },
    effects: [{ type: 'damage_divided_among_targets' }, { type: 'gain_life_target', amount: 5, targetIndex: 1 }],
  };
  const s = scene({ foeLife: 20, synSpell: spell });
  const { cmd, options } = choose(s);
  assert.notEqual(cmd.type, 'cast_spell', `targetIndex czytany z deskryptora: ${JSON.stringify(cmd)}`);
  assert.ok(best(castScores(options)) < 0);
});

test('FJ/13: gain_life_target na SLOCIE 1 w SIEBIE — bot rzuca w przeciwnika (cudze życie nie offsetuje)', () => {
  const spell = {
    timing: 'sorcery', targets: [{ type: 'opponent' }, { type: 'player' }],
    divided: { total: 5, targetType: 'any_target' },
    effects: [{ type: 'damage_divided_among_targets' }, { type: 'gain_life_target', amount: 5, targetIndex: 1 }],
  };
  const s = scene({ foeLife: 20, synSpell: spell });
  const { cmd } = choose(s);
  assert.equal(cmd.type, 'cast_spell', `obrażenia wroga + życie swoje = zysk: ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.targets, ['p2', 'p1']);
  assert.ok((cmd.damageDivision ?? []).some((d) => d.id === 'p2' && d.amount === 5),
    `obrażenia idą w przeciwnika: ${JSON.stringify(cmd.damageDivision)}`);
});

test('FJ/14: anty-over-fix — czyste obrażenia 5 w twarz bez ridera nadal są rzucane', () => {
  const spell = {
    timing: 'sorcery', targets: [{ type: 'opponent' }],
    effects: [{ type: 'damage', amount: 5 }],
  };
  const s = scene({ foeLife: 20, synSpell: spell });
  const { cmd, options } = choose(s);
  assert.equal(cmd.type, 'cast_spell');
  assert.ok(best(castScores(options)) > 0);
  run(s, cmd);
  settle(s);
  assert.equal(lifeOf(s, 'p2'), 15);
});

// ---------------------------------------------------------------------------
// Audyt PR #184 / F-1: zabijaCokolwiek nie może zerować ridera dla progu +1000
// (CR 704.3 / 704.5a + ruling WotC 2017-03-14)
// ---------------------------------------------------------------------------

test('FJ/15 (Audyt PR #184 / F-1): przy 2 życia wroga i 0/1 na stole prawdziwy letalny burn (2 dmg) wygrywa z Fiery Justice', () => {
  const s = scene({ foeLife: 2, foeBodies: [[0, 1, { manaCost: 0 }]] });
  addObject(s, {
    id: 'burn', instanceId: 'i-burn', cardId: 'test-burn', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', types: ['Instant'], manaCost: 2, colors: ['R'],
    cardName: 'burn', abilities: [], keywords: [], subtypes: [],
    spell: { timing: 'instant', targets: [{ type: 'any_target' }], effects: [{ type: 'damage', amount: 2 }] },
  });
  const { cmd, options } = choose(s);
  const fjScores = options.filter((o) => String(o.cmd).startsWith('cast_spell(spell')).map((o) => o.score);
  assert.ok(best(fjScores) < 500,
    `Fiery Justice (2 − 2 + 5 = 5 życia wroga) nie może dostawać premii letalnej +1000: ${best(fjScores)}`);
  assert.equal(cmd.type, 'cast_spell');
  assert.equal(cmd.objectId, 'burn', `bot wybiera prawdziwe dobicie zamiast leczenia wroga do 5: ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.targets, ['p2']);
  run(s, cmd);
  settle(s);
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'p1');
});

test('FJ/16 (Audyt PR #184 / F-1): w ramach tego samego czaru nieletalne [5→0/1, 5→p2] nie przebija prawdziwego dobicia [10→p2]', () => {
  // Przed naprawą F-1 wariant [5→foe-0, 5→p2] dostawał fałszywe +1000 za 5>=4
  // plus premię za zabicie 0/1 (razem >1000) i WYGRYWAŁ z prawdziwym dobiciem
  // [10→p2] (1000), zostawiając wroga przy 4 życia (4 − 5 + 5 = 4) zamiast
  // zakończyć partię (4 − 10 + 5 = −1 <= 0, CR 704.5a).
  const spell = {
    timing: 'sorcery', targets: [{ type: 'opponent' }],
    divided: { total: 10, targetType: 'any_target' },
    effects: [{ type: 'damage_divided_among_targets' }, { type: 'gain_life_target', amount: 5 }],
  };
  const s = scene({ foeLife: 4, foeBodies: [[0, 1, { manaCost: 0 }]], synSpell: spell });
  const { cmd, options } = choose(s);
  assert.equal(cmd.type, 'cast_spell');
  assert.ok(best(castScores(options)) >= 1000,
    `prawdziwe dobicie netto zachowuje +1000: ${best(castScores(options))}`);
  run(s, cmd);
  settle(s);
  assert.ok(lifeOf(s, 'p2') <= 0, `wróg ginie z netto <= 0 życia (jest ${lifeOf(s, 'p2')})`);
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'p1');
});

