// M111 — bot wycenia TRYBY czaru modalnego (CR 700.2).
// Dotąd `scoreCommand` czytał `spell.effects`, które dla czaru modalnego są
// PUSTE (treść siedzi w `spell.modes[i].effects`), więc każdy wariant trybu
// dostawał identyczne 50 pkt i bot brał pierwszy z listy. Trzy karty miały to
// zapisane w limitations jako „boty biorą pierwszy tryb".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 700, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    zone: 'battlefield', kind: 'creature', power: extra.power ?? 5, toughness: extra.toughness ?? 5,
    manaCost: 3, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// L (zgłoszenie właściciela 2026-10-09, Steel Sabotage): tryb kontry
// dostawał płaskie spellBase (50) bez premii za CO zatrzymuje, więc w modalu
// kontra-vs-bounce bounce (80) wygrywał STRUKTURALNIE — bot odsyłał artefakt
// do ręki zamiast wysłać czar do grobu. Kontra groźnego wpisu wroga niesie
// teraz premię jak removal (baza + waga ciała) + dopłatę za TMC (denial
// trwalszy niż tempo). Generycznie po deskryptorze celu ze stosu (ADR 0002).

function stackSpell(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'stack', ...gameObjectDataOf(def),
  });
  return state.objects.get(id);
}

function putBlankArtifact(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    zone: 'battlefield', kind: 'artifact', power: extra.power ?? 0, toughness: extra.toughness ?? 0,
    manaCost: extra.manaCost ?? 3, abilities: [], keywords: [], subtypes: [],
    types: ['Artifact'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function foeTurn(state) {
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

test('bot rozróżnia tryby: usunięcie grubego stwora wroga bije pump własnego 1/1', () => {
  // Selesnya Charm: tryb 1 „+2/+1 i trample twojemu stworowi", tryb 2
  // „wygnaj stwora o mocy ≥ 5 przeciwnika", tryb 3 „token Kithkin 2/2".
  const state = newState();
  putCard(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  putBlank(state, 'moj', 'p1', { power: 1, toughness: 1 });
  putBlank(state, 'goliat', 'p2', { power: 6, toughness: 6 });
  addMana(state, 'p1', 3, { colors: ['G', 'W'] });
  const view = playerView(state, 'p1');
  const casts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'charm');
  assert.ok(casts.length > 1, 'kilka wariantów trybu w ofercie');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_spell');
  assert.ok((chosen.targets ?? []).includes('goliat'),
    `bot powinien wybrać tryb usuwający 6/6, wybrał: ${JSON.stringify(chosen)}`);
});

test('bot nie wybiera trybu bez skutku, gdy inny tryb działa', () => {
  // Bez stwora o mocy ≥ 5 tryb „wygnaj" nie ma celu; bot ma wybrać taki,
  // który coś robi (pump albo token) — nie zawiesić się na pierwszym.
  const state = newState();
  putCard(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  putBlank(state, 'moj', 'p1', { power: 3, toughness: 3 });
  addMana(state, 'p1', 3, { colors: ['G', 'W'] });
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.ok(chosen, 'bot ma jakąś decyzję');
  if (chosen.type === 'cast_spell') {
    assert.ok(!(chosen.targets ?? []).includes('goliat'));
  }
});

test('bot wycenia tryby MODALNEGO TRIGGERA (Etherwrought Page), nie bierze ślepo pierwszego', () => {
  // Bot jest czystą funkcją WIDOKU, więc wystarczy minimalny widok z trzema
  // ofertami trybu. Tryby Etherwrought Page: +2 życia / surveil 1 / każdy
  // przeciwnik traci 1 życie. Przeciwnik na 1 życiu → dobicie wygrywa partię.
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', life: 20 }, { id: 'p2', life: 1 }],
    zones: { hand: [], battlefield: [], graveyard: [], library: [], stack: [], exile: [] },
    turn: { activePlayerId: 'p1', priorityPlayerId: 'p1', phase: 'beginning', step: 'upkeep', number: 5 },
    combat: null,
    pendingModalTrigger: {
      playerId: 'p1', sourceId: 'page', cardId: 'etherwrought-page',
      modes: [{ name: 'Zysk 2 życia' }, { name: 'Surveil 1' }, { name: 'Utrata życia' }],
    },
    legalCommands: [
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 },
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1 },
      { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 2 },
    ],
  };
  const bot = createHeuristicBot({ seed: 3 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'resolve_modal_choice');
  assert.equal(chosen.modeIndex, 2, `przy przeciwniku na 1 życiu bot ma dobić, wybrał ${chosen.modeIndex}`);

  // Przy zdrowym przeciwniku i własnym niskim życiu wygrywa zysk życia.
  const view2 = {
    ...view,
    players: [{ id: 'p1', life: 3 }, { id: 'p2', life: 20 }],
  };
  assert.equal(bot.chooseCommand(view2).modeIndex, 0, 'na 3 życiach bot leczy się zamiast surveilować');
});

test('L: sabotaż KONTRUJE groźny czar artefaktu zamiast odbijać drobiazg', () => {
  // Raport właściciela: przeciwnik rzuca artefakt MV3 (seers-lantern), na
  // stole artefakt 0/0. Kontra (90 = 50+22+6×3) bije bounce (80) — czar
  // idzie do grobu, nie wraca do ręki. PRZED fixem: 50 vs 80 → bounce.
  const state = foeTurn(newState());
  putCard(state, 'sb', 'steel-sabotage', 'p1', 'hand');
  stackSpell(state, 'foe', 'seers-lantern', 'p2');
  putBlankArtifact(state, 'art', 'p2', { power: 0, toughness: 0, manaCost: 3 });
  addMana(state, 'p1', 9);
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_spell');
  assert.equal(chosen.modeIndex, 0, `bot ma kontrować (tryb 0), wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['foe']);
  const opts = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(sb'));
  assert.equal(opts.length, 2);
  const counter = opts.find((o) => o.cmd.endsWith('->foe)'));
  const bounce = opts.find((o) => o.cmd.endsWith('->art)'));
  assert.equal(counter.score, 90);
  assert.ok(bounce.score < counter.score, `bounce (${bounce.score}) ma przegrywać z kontrą (90)`);
});

test('L anti-over-fix: bounce REALNEJ groźby ze stołu bije kontrę małego czaru', () => {
  // Przeżycie przede wszystkim: artefakt 5/5 na stole (bounce ~104) vs
  // kontra Lantern MV3 (90) — bot odbija napastnika. Najsłabszy realny
  // wariant trybu bounce zachowuje wartość (L169).
  const state = foeTurn(newState());
  putCard(state, 'sb', 'steel-sabotage', 'p1', 'hand');
  stackSpell(state, 'foe', 'seers-lantern', 'p2');
  putBlankArtifact(state, 'big', 'p2', { power: 5, toughness: 5, manaCost: 5 });
  addMana(state, 'p1', 9);
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_spell');
  assert.equal(chosen.modeIndex, 1, `przy 5/5 na stole bot ma odbić, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['big']);
});

test('L: modalna kontra drugiego czaru też skaluje (izzet-charm vs howl MV7)', () => {
  // Ten sam fix, zero nazw kart (ADR 0002): tryb kontry Izzet Charm
  // (counter-unless-pays, płatnik bez many) bije burn 2 i loot, gdy na
  // stosie leży groźny czar (howl-of-the-night-pack MV7: 114 = 50+22+6×7).
  const state = foeTurn(newState());
  putCard(state, 'iz', 'izzet-charm', 'p1', 'hand');
  stackSpell(state, 'howl', 'howl-of-the-night-pack', 'p2');
  putCard(state, 'gob', 'phyrexian-rager', 'p2', 'battlefield'); // cel burna
  addMana(state, 'p1', 9);
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_spell');
  assert.equal(chosen.modeIndex, 0, `bot ma kontrować howla, wybrał: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['howl']);
  const opts = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(iz'));
  const counter = opts.find((o) => o.cmd.endsWith('->howl)'));
  assert.equal(counter.score, 114);
  for (const other of opts.filter((o) => o !== counter)) {
    assert.ok(other.score < counter.score, `tryb ${other.cmd} (${other.score}) ma przegrywać z kontrą (114)`);
  }
});

test('L: kontra celuje w groźniejszy czar — stwór 7/7 bije stwora 2/2', () => {
  // Waga ciała zatrzymywanego stwora (P/T z definicji — widok nie niesie
  // P/T wpisów stosu): wantons 7/7 MV5 (130 = 50+22+28+30) vs rager 2/2
  // MV3 (98 = 50+22+8+18). Stoic Rebuttal kontruje dowolny czar.
  const state = foeTurn(newState());
  putCard(state, 'st', 'stoic-rebuttal', 'p1', 'hand');
  stackSpell(state, 'big', 'krallenhorde-wantons', 'p2');
  stackSpell(state, 'sml', 'phyrexian-rager', 'p2');
  addMana(state, 'p1', 9);
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_spell');
  assert.deepEqual(chosen.targets, ['big'], `bot ma kontrować grubasa: ${JSON.stringify(chosen)}`);
  const opts = bot.trace().at(-1).options.filter((o) => o.cmd.includes('cast_spell(st'));
  const byTarget = Object.fromEntries(opts.map((o) => [o.cmd, o.score]));
  assert.equal(byTarget['cast_spell(st->big)'], 130);
  assert.equal(byTarget['cast_spell(st->sml)'], 98);
});
