// =============================================================================
// M (zgłoszenie właściciela 2026-09-19b) — You're Confronted by Robbers:
//
//   „Znów to samo. Oferta w »Twoje działania« rozdzielona na dwie opcje.
//    Rzucenie czaru powinno być jedną ofertą w »Twoje działania«, a potem
//    modal wyboru, a wygląda teraz tak:
//      TWOJE DZIAŁANIA
//      You're Confronted by Robbers — tryb: Zyskiwanie czasu
//      Rzuć: You're Confronted by Robbers — Wezwanie pomocy (koszt 3W)
//    Tu ma być jedno: Rzuć: You're Confronted by Robbers. A wybór trybu
//    w modalu, a nie tak niespójnie jak teraz — raz Rzuć:, raz z kosztem,
//    raz bez. Bez sensu.”
//
// Kontrakt (CR 601.2b — tryb modalnego czaru ogłasza się W TRAKCIE rzucania,
// więc oba tryby należą do JEDNEGO rzutu — tak jak dar w zgłoszeniu K):
//   1. panel „Twoje działania" ma JEDEN wpis na czar modalny;
//   2. wpis nazywa CZYNNOŚĆ i kartę („Rzuć: <karta>") — bez wybierania trybu
//      w tytule (tytuł liczył się z pierwszego wariantu pierwszego trybu, stąd
//      „<karta> — tryb: Zyskiwanie czasu" bez kosztu obok drugiego wpisu
//      z kosztem: dwie konwencje etykiety jednej akcji);
//   3. klik otwiera modal, w którym są WSZYSTKIE warianty rzutu, a etykieta
//      każdego wariantu nazywa jego tryb (`commandLabel`) — wybór trybu nie
//      ginie, tylko przenosi się tam, gdzie jego miejsce.
//
// Reguła jest generyczna (ADR 0002 — po KSZTAŁCIE grupy: jedna karta, komendy
// `cast_spell` z `modeIndex`, karta ma >1 trybów w deskryptorze), a grupuje
// silnikowa lista komend bez zmian: oba tryby nadal są osobnymi komendami
// (bot i kreator celów z nich korzystają) — scalanie jest PREZENTACJĄ panelu.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { buildActionEntries, choiceGroupTitle, choiceRequestGroupKey, commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;

/** Stół ze zgłoszenia: Robbers w ręce, 3W+1 w puli, stwory na polu bitewnym. */
function robbersBoard({ withCreatures = true } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (cardId, zone, controllerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje`);
    const data = gameObjectDataOf(def);
    const id = `${cardId}#${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
      types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, spell: def.spell,
    });
    return id;
  };
  const spellId = put('youre-confronted-by-robbers', 'hand');
  const moj = withCreatures ? put('scorch-spitter', 'battlefield') : null;
  const obcy = withCreatures ? put('scorch-spitter', 'battlefield', 'p2') : null;
  addMana(state, 'p1', 4, { colors: ['W'] }); // {3}{W}
  return { state, spellId, moj, obcy };
}

/** Wpisy panelu dotyczące rzutu Robbers (pojedyncze komendy albo grupy/modal). */
function robbersEntries(state) {
  const view = playerView(state, 'p1');
  const wpisy = buildActionEntries(view.legalCommands, SESSION, view).filter((e) => {
    const cmds = e.request?.options ?? (e.group?.commands ?? (e.command ? [e.command] : []));
    return cmds.some((c) => c.type.startsWith('cast_') && c.objectId?.startsWith('youre-confronted-by-robbers'));
  });
  return { view, wpisy };
}

/** Rozstrzyga stos do końca (gra z samymi czarami). */
function resolveStack(state) {
  for (let i = 0; i < 12 && state.zones.stack.length > 0; i += 1) {
    const rv = playerView(state, state.turn.priorityPlayerId);
    const cmd = rv.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? rv.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd, 'jest komenda rozstrzygająca stos');
    assert.ok(execute(state, cmd).ok, 'rozstrzygnięcie stosu się powiodło');
  }
}

test('M/1: rzut modalnego czaru to JEDEN wpis panelu (scena ze zgłoszenia)', () => {
  const { state } = robbersBoard();
  const { wpisy } = robbersEntries(state);
  assert.equal(wpisy.length, 1,
    `jeden wpis na czar, nie osobne oferty trybów: ${JSON.stringify(wpisy.map((w) => (w.request ? 'modal' : 'akcja')))}`);
  const wpis = wpisy[0];
  assert.ok(wpis.request, 'wpis otwiera modal wyboru sposobu rzucenia (M)');
  const warianty = wpis.request.options;
  const tryby = new Set(warianty.map((c) => c.modeIndex));
  assert.deepEqual([...tryby].sort(), [0, 1], 'modal niesie oba tryby czaru');
  assert.ok(warianty.length > 2, 'modal niesie też warianty celów trybu 0–3 stwory');
});

test('M/2: tytuł wpisu to czynność + karta („Rzuć: <karta>”), nie nazwa trybu', () => {
  const { state } = robbersBoard();
  const { view, wpisy } = robbersEntries(state);
  const tytul = choiceGroupTitle(wpisy[0].request, SESSION, view).replace(/<[^>]*>/g, '').trim();
  assert.equal(tytul, "Rzuć: You're Confronted by Robbers",
    `tytuł ma nazywać rzut karty, nie pierwszy tryb grupy: „${tytul}"`);
  assert.doesNotMatch(tytul, /tryb:/, 'tryb wybiera się w modalu, nie w tytule panelu');
});

test('M/3: tryby są rozróżnialne w modalu (etykiety wariantów nazywają tryb)', () => {
  const { state } = robbersBoard();
  const { view, wpisy } = robbersEntries(state);
  const etykiety = wpisy[0].request.options
    .map((c) => commandLabel(c, SESSION, view).replace(/<[^>]*>/g, ''));
  assert.ok(etykiety.some((l) => /Zyskiwanie czasu/.test(l)), `wariant trybu 1 nazwany: ${JSON.stringify(etykiety)}`);
  assert.ok(etykiety.some((l) => /Wezwanie pomocy/.test(l)), `wariant trybu 2 nazwany: ${JSON.stringify(etykiety)}`);
  assert.equal(new Set(etykiety).size, etykiety.length,
    `warianty o RÓŻNYM skutku nie mogą mieć identycznych etykiet: ${JSON.stringify(etykiety)}`);
});

test('M/4: silnik nadal oferuje OBA tryby i oba są wykonalne (scalanie to prezentacja)', () => {
  const { state, spellId, moj } = robbersBoard();
  const view = playerView(state, 'p1');
  const oferty = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === spellId);
  const tryby = new Set(oferty.map((c) => c.modeIndex));
  assert.deepEqual([...tryby].sort(), [0, 1], 'obie komendy trybów zostają w ofertach silnika');

  // Tryb 1 („Wezwanie pomocy"): trzy tokeny Soldier.
  const tokeny = oferty.find((c) => c.modeIndex === 1 && (c.targets ?? []).length === 0);
  assert.ok(tokeny, 'oferta trybu 1 bez celów');
  assert.ok(execute(state, tokeny).ok, 'rzut trybu 1 wykonalny');
  resolveStack(state);
  const sold = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'token_soldier');
  assert.equal(sold.length, 3, 'trzy tokeny Soldier z trybu 1');
  assert.equal(state.zones.stack.length, 0, 'stos pusty po rozstrzygnięciu');

  // Tryb 0 („Zyskiwanie czasu"): tapnięcie celu.
  const { state: s2, spellId: spell2, moj: moj2 } = robbersBoard();
  const v2 = playerView(s2, 'p1');
  const tap = v2.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === spell2
    && c.modeIndex === 0 && (c.targets ?? []).includes(moj2));
  assert.ok(tap, 'oferta trybu 0 z celem');
  assert.ok(execute(s2, tap).ok, 'rzut trybu 0 wykonalny');
  resolveStack(s2);
  assert.equal(s2.objects.get(moj2).tapped, true, 'cel trybu 0 został zatapnięty');
  assert.ok(moj, 'scena ma własnego stwora do tapnięcia');
});

test('M/5 (klasa, ADR 0002): czar bez trybów zachowuje dawny tytuł grupy — anty-over-fix', () => {
  const objectId = 'zwykly-czar';
  const view = {
    zones: {
      hand: [{ id: objectId, cardId: objectId, spell: { timing: 'instant' } }],
      battlefield: [{ id: 'cel-1', cardId: 'scorch-spitter' }],
      stack: [], graveyard: [], library: [], exile: [],
    },
    players: [{ id: 'p1' }, { id: 'p2' }],
  };
  const session = { nameOf: (id) => (id === objectId ? 'Zwykły Czar' : id) };
  const options = [
    { type: 'cast_spell', objectId, targets: ['cel-1'] },
    { type: 'cast_spell', objectId, targets: [] },
  ];
  const tytul = choiceGroupTitle({ type: 'command', options }, session, view);
  assert.match(tytul, /Cel czaru/, `nie-modalny czar z celami zachowuje tytuł „Cel czaru": ${tytul}`);
  assert.doesNotMatch(tytul, /^Rzuć:/, 'tytułu rzutu nie dostaje grupa, która nie jest modalna');
});

test('M/6 (klasa): wszystkie warianty trybów lądują w JEDNEJ grupie klucza', () => {
  const a = { type: 'cast_spell', objectId: 'obj', modeIndex: 0, targets: [] };
  const b = { type: 'cast_spell', objectId: 'obj', modeIndex: 0, targets: ['x'] };
  const c = { type: 'cast_spell', objectId: 'obj', modeIndex: 1, targets: [] };
  const keys = new Set([a, b, c].map((cmd) => choiceRequestGroupKey(cmd)));
  assert.equal(keys.size, 1, `jeden klucz grupy na czar modalny: ${JSON.stringify([...keys])}`);
  const inny = { type: 'cast_spell', objectId: 'obj-inny', modeIndex: 0 };
  assert.notEqual(choiceRequestGroupKey(inny), choiceRequestGroupKey(a), 'inna karta = inna grupa');
});
