// M234 — strojenie bota: EFEKTYWNOŚĆ REMOVALU (zlecenie właściciela po audycie
// M233). Model właściciela: gdy bot ma czar usuwający/odbijający, powinien
// maksymalizować wartość celu:
//  1) preferować DROŻSZE cele — TMC (total mana cost) to publiczny proxy „ma
//     unikalne zdolności" (daje manę/życie/prewencję), bo PlayerView NIE niesie
//     `abilities` (ADR 0017), więc koszt many jest jedynym sygnałem tekstu;
//  2) przy tanich celach zdejmować przede wszystkim te NIE DO PRZEJŚCIA w
//     walce: deathtouch (każda wymiana na jego korzyść) oraz protekcja od
//     mojego koloru (mój stwór go nie tknie).
//
// Ten test dowodzi, że nowe parametry REALNIE przepływają do wyceny
// (pokrętła nie są atrapami) — RED→GREEN. Wartości domyślne = 0 (golden-master
// bot-scoring-snapshot zielony po ekstrakcji); realne wartości włącza
// heuristic-weights/params albo tuner. Reguły po deskryptorach (manaCost,
// keywords, protection z widoku), zero nazw kart (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botTurn() {
  const state = createGameState({ seed: 234, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  return state;
}

function castScores(state, params) {
  const bot = createHeuristicBot({ seed: 234, params });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const out = {};
  for (const o of bot.trace()[0].options) {
    if (o.cmd.startsWith('cast_spell')) out[o.cmd] = o.score;
  }
  return out;
}

test('M234 params: defaulty rodziny efektywności removalu są 0 (golden-master)', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalTmcWeight, 0);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalDeathtouchBonus, 0);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.removalProtectionBonus, 0);
});

test('M234/TMC: waga TMC podnosi wycenę zdjęcia DROŻSZEGO celu', () => {
  const build = () => {
    const s = botTurn();
    put(s, 'spell', 'lash-of-the-balrog', 'p2', 'hand');
    put(s, 'cheap', 'crawling-chorus', 'p1', 'battlefield');      // 1 TMC
    put(s, 'exp', 'chained-throatseeker', 'p1', 'battlefield');   // 6 TMC
    return s;
  };
  const base = castScores(build(), undefined);
  const tuned = castScores(build(), { removalTmcWeight: 4 });
  const expBase = base['cast_spell(spell->exp)'];
  const expTuned = tuned['cast_spell(spell->exp)'];
  const cheapBase = base['cast_spell(spell->cheap)'];
  const cheapTuned = tuned['cast_spell(spell->cheap)'];
  assert.ok(expTuned > expBase, `waga TMC ma podnieść drogi cel (${expBase} -> ${expTuned})`);
  // Drogi cel rośnie mocniej niż tani (różnica TMC 6 vs 1).
  assert.ok((expTuned - expBase) > (cheapTuned - cheapBase),
    `drogi cel ma rosnąć bardziej niż tani (Δexp ${expTuned - expBase} vs Δcheap ${cheapTuned - cheapBase})`);
});

test('M234/deathtouch: premia podnosi wycenę zdjęcia taniego stwora z deathtouch', () => {
  const build = () => {
    const s = botTurn();
    put(s, 'spell', 'lash-of-the-balrog', 'p2', 'hand');
    put(s, 'dt', 'guildsworn-prowler', 'p1', 'battlefield'); // 2 TMC, deathtouch
    return s;
  };
  const base = castScores(build(), undefined);
  const tuned = castScores(build(), { removalDeathtouchBonus: 30 });
  assert.equal(tuned['cast_spell(spell->dt)'] - base['cast_spell(spell->dt)'], 30,
    'premia deathtouch (30) ma wprost podnieść wycenę zdjęcia tego celu');
});

test('M234/protekcja: premia podnosi wycenę zdjęcia stwora z protekcją od mojego koloru', () => {
  const build = () => {
    const s = botTurn();
    // Mój stwór jest niebieski (U) — daję wrogowi protekcję od U (nie tknę go w walce).
    put(s, 'spell', 'lash-of-the-balrog', 'p2', 'hand');
    put(s, 'mine', 'chained-throatseeker', 'p2', 'battlefield'); // U
    put(s, 'prot', 'crawling-chorus', 'p1', 'battlefield');      // wróg 1/1
    s.untilEndOfTurnProtections = [Object.freeze({
      controllerId: 'p1', objectIds: Object.freeze(['prot']),
      quality: Object.freeze({ colors: ['U'] }),
    })];
    return s;
  };
  const base = castScores(build(), undefined);
  const tuned = castScores(build(), { removalProtectionBonus: 40 });
  assert.equal(tuned['cast_spell(spell->prot)'] - base['cast_spell(spell->prot)'], 40,
    'premia protekcji (40) ma wprost podnieść wycenę zdjęcia celu nie do przejścia w walce');
});

test('M234/protekcja: BEZ własnych stworów w tym kolorze premia NIE działa (protekcja bez znaczenia)', () => {
  const build = () => {
    const s = botTurn();
    put(s, 'spell', 'lash-of-the-balrog', 'p2', 'hand');
    // Brak własnych stworów: nie mam czym atakować, więc protekcja celu nie jest problemem walki.
    put(s, 'prot', 'crawling-chorus', 'p1', 'battlefield');
    s.untilEndOfTurnProtections = [Object.freeze({
      controllerId: 'p1', objectIds: Object.freeze(['prot']),
      quality: Object.freeze({ colors: ['U'] }),
    })];
    return s;
  };
  const base = castScores(build(), undefined);
  const tuned = castScores(build(), { removalProtectionBonus: 40 });
  assert.equal(tuned['cast_spell(spell->prot)'], base['cast_spell(spell->prot)'],
    'bez moich stworów w danym kolorze premia protekcji nie ma się aktywować');
});
