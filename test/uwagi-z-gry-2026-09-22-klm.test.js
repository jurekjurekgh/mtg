// Uwagi z gry właściciela, 2026-09-22 (K, L, M).
//
// K. Titan's Strength („Target creature gets +3/+1 until end of turn. Scry 1.”):
//    „To combat trick. Bot rzuca ją w kompletnie bezsensownym momencie — na
//    koniec mojej tury. Ta karta powinna być rzucana jak większość combat
//    tricków albo na swojego atakera po zadeklarowaniu blokerów przez
//    przeciwnika, albo na swojego blokującego po zadeklarowaniu atakujących.”
//    Root cause (pomiar śladem bota): rzut w end stepie miał 1 pkt, pass 0 pkt.
//    Kara −60 za pump poza oknem walki DZIAŁAŁA, ale premia +10 „scry w end
//    stepie przeciwnika” (M211/A1 — odkładaj układanie biblioteki na moment,
//    gdy mana i tak przepadnie) niemal ją zerowała. Premia należy się tylko
//    czarom, których CAŁA treść to układanie własnej biblioteki; dla czaru
//    MIESZANEGO o oknie decyduje efekt główny, nie rider.
//
// L. Entrancing Lyre („{X}, {T}: Tap target creature with power X or less…
//    for as long as this artifact remains tapped”): „Bot używa jej zdolności
//    natychmiast jak tylko ma chociaż jedną manę i tapuje jakiegoś mojego
//    tokena 1/1 zamiast poczekać do następnej tury i za 2 albo 3 unieruchomić
//    groźną kreaturę. Bez sensu. Powinien próbować unieruchomić największe
//    zagrożenie, nawet czekając na manę.”
//    Root cause (pomiar): tapnięcie tokena 1/1 w upkeepie przeciwnika = 53,5 pkt.
//    `tapTargetValue` wyceniał OKNO i moc celu, ale nie znał kosztu
//    alternatywnego: zdolność trzyma cel tylko dopóki źródło pozostaje
//    tapnięte, więc jest zasobem JEDNORAZOWYM — zużyta na 1/1 przestaje
//    istnieć dla 5/5. Czekanie na manę nic nie kosztuje.
//
// M. Dream Twist („Target player mills three cards. Flashback {1}{U}”):
//    „Flashback. Zamiast modala z opcjami targetowania, opcje target player
//    pokazują się w Twoje działania.”
//    Root cause: `choiceRequestGroupKey` grupowało cele dla `cast_spell`
//    i `cast_escape`, ale NIE dla `cast_flashback` (L41 — rozjazd bliźniaczych
//    ścieżek: rzut z ręki grupował, rzut z grobu nie). Flashback to
//    alternatywny KOSZT tego samego rzutu (CR 702.34a), a wybór celu jest
//    decyzją w trakcie rzucania (CR 601.2c) — więc jedna oferta + modal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { choiceRequestGroupKey, choiceRequestType } from '../src/table/render.js';
import { readFileSync } from 'node:fs';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, ctrl, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
    ...data, types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], cardName: def.name, ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

/** Wynik wariantu ze śladu bota — pomiar, nie zgadywanie. */
function scores(view, seed = 7) {
  const bot = createHeuristicBot({ seed });
  bot.chooseCommand(view);
  const entry = bot.trace()[0];
  return { chosen: entry.chosen, options: entry.options };
}

// ─── K ───────────────────────────────────────────────────────────────────────

function titanScene({ step, phase, active, combat = null }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = phase;
  state.turn.step = step;
  state.turn.number = 6;
  put(state, 'mtn', 'basic-mountain', 'p1');
  put(state, 'ts', 'titans-strength', 'p1', 'hand');
  for (let i = 0; i < 5; i += 1) put(state, `lib${i}`, 'basic-mountain', 'p1', 'library');
  return state;
}

test('K: combat trick z riderem Scry NIE jest palony w end stepie przeciwnika', () => {
  const state = titanScene({ step: 'end', phase: 'ending', active: 'p2' });
  put(state, 'satyr', 'satyr-wayfinder', 'p1');
  const { chosen, options } = scores(playerView(state, 'p1'));
  assert.equal(chosen, 'pass_priority', `bot ma poczekać, a wybrał: ${chosen}`);
  const cast = options.find((o) => o.cmd.startsWith('cast_spell'));
  const pass = options.find((o) => o.cmd === 'pass_priority');
  assert.ok(cast.score < pass.score,
    `rzut poza walką musi być gorszy od passu (rzut ${cast.score} vs pass ${pass.score})`);
});

test('K: ten sam trick PO deklaracji blokerów jest rzucany na własnego atakującego', () => {
  const state = titanScene({ step: 'declare_blockers', phase: 'combat', active: 'p1' });
  put(state, 'atk', 'satyr-wayfinder', 'p1', 'battlefield', { power: 2, toughness: 2 });
  put(state, 'blk', 'satyr-wayfinder', 'p2', 'battlefield', { power: 3, toughness: 3 });
  state.combat = { attackers: ['atk'], blockers: new Map([['atk', ['blk']]]) };
  const { chosen, options } = scores(playerView(state, 'p1'), 9);
  assert.ok(chosen.startsWith('cast_spell') && chosen.includes('atk'),
    `w oknie walki trick ma polecieć na atakującego, a padło: ${chosen}`);
  const naWrogu = options.find((o) => o.cmd.includes('->blk'));
  assert.ok(naWrogu.score < 0, 'pompowanie cudzego blokera pozostaje błędem');
});

test('K: czar, którego CAŁA treść to scry, nadal korzysta z okna końca tury', () => {
  // Kontrola granicy: premia M211/A1 nie może zniknąć dla czystego układania
  // biblioteki — naprawa K zawęża ją, nie kasuje.
  const src = readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  assert.ok(/pureBonusWindow && isPureDeckArranging/.test(src),
    'premia okna należy się wyłącznie czaru czysto układającemu bibliotekę');
});

// ─── L ───────────────────────────────────────────────────────────────────────

function lyreScene({ lands, active = 'p2' }) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'upkeep', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'beginning';
  state.turn.step = 'upkeep';
  state.turn.number = 6;
  put(state, 'lyre', 'entrancing-lyre', 'p1');
  for (let i = 0; i < lands; i += 1) put(state, `isl${i}`, 'basic-island', 'p1');
  put(state, 'tok', 'token_soldier', 'p2', 'battlefield', { kind: 'creature', power: 1, toughness: 1 });
  put(state, 'big', 'satyr-wayfinder', 'p2', 'battlefield', { power: 5, toughness: 5 });
  return playerView(state, 'p1');
}

test('L: przy jednej manie bot CZEKA, zamiast unieruchomić token 1/1', () => {
  const { chosen, options } = scores(lyreScene({ lands: 1 }), 11);
  assert.equal(chosen, 'pass_priority', `bot miał poczekać na manę, a zrobił: ${chosen}`);
  const naTokenie = options.find((o) => o.cmd.includes('->tok'));
  assert.ok(naTokenie.score < 0,
    `spalenie jednorazowego zasobu na 1/1 musi być ujemne (było ${naTokenie.score})`);
});

test('L: gdy stać go na największe zagrożenie — używa zdolności na 5/5', () => {
  const { chosen, options } = scores(lyreScene({ lands: 6 }), 11);
  assert.ok(chosen.includes('->big'), `celem ma być największe zagrożenie, a padło: ${chosen}`);
  const naDuzym = options.find((o) => o.cmd.includes('->big'));
  const naTokenie = options.find((o) => o.cmd.includes('->tok'));
  assert.ok(naDuzym.score > naTokenie.score,
    'groźna kreatura musi bić token na punkty, gdy oba cele są opłacalne');
});

// ─── M ───────────────────────────────────────────────────────────────────────

test('M: warianty celu flashbacku to JEDNA oferta panelu, nie dwie', () => {
  const cmds = [
    { type: 'cast_flashback', objectId: 'dt', targets: ['p1'] },
    { type: 'cast_flashback', objectId: 'dt', targets: ['p2'] },
  ];
  const keys = new Set(cmds.map(choiceRequestGroupKey));
  assert.equal(keys.size, 1, 'oba warianty celu należą do jednej grupy (jeden wpis w „Twoje działania”)');
  assert.equal([...keys][0], 'flashback:dt');
  assert.equal(choiceRequestType(cmds), 'flashback', 'grupa otwiera modal flashbacku');
});

test('M: flashback BEZ celów zostaje zwykłą ofertą (bez sztucznego modala)', () => {
  const bezCelu = { type: 'cast_flashback', objectId: 'x' };
  assert.notEqual(choiceRequestGroupKey(bezCelu), 'flashback:x',
    'czar bez wyboru celu nie potrzebuje modala — nie grupujemy go');
});
