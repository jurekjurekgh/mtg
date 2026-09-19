// =============================================================================
// K (zgłoszenie właściciela 2026-09-19b) — Crumb and Get It:
//
//   „Można ją rzucić z obiecaniem giftu albo bez. Ale opcje pokazują mi się
//    od razu w »Twoje działania« zamiast dopiero po rzuceniu karty w modalu
//    wyboru. Tak to nie powinno wyglądać. Wszystkie czary, które wymagają
//    jakiejś decyzji podczas rzucania, powinny mieć najpierw ofertę rzucenia
//    w »Twoje działania«, a dopiero potem modal wyboru sposobu rzucenia.”
//
// Kontrakt (CR 702.174a — dar to decyzja „as you cast this spell”, więc obie
// obietnice należą do JEDNEGO rzutu, nie do dwóch rzutów):
//   1. panel „Twoje działania” ma JEDEN wpis na czar (bez wariantów daru);
//   2. klik otwiera modal, w którym są WSZYSTKIE sposoby rzucenia — bez daru
//      i z darem (etykieta daru rozróżnia warianty — klasa M101/B: dwa
//      przyciski o różnym skutku nie mogą wyglądać identycznie).
//
// Reguła jest generyczna (ADR 0002 — po KSZTAŁCIE komendy, nie po karcie):
// strażnik sprawdza klucz grupowania dla syntetycznych komend obu rodzin
// (cel rzutu i płatność phyrexian), więc dotyczy każdego przyszłego czaru
// z darem, także bez celów.
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { buildActionEntries, choiceRequestGroupKey, commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;

/** Stół: Crumb and Get It w ręce, własny stwór na polu, mana {W}. */
function giftBoard() {
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
      // Dar żyje na OBIEKCIE karty (kontrakt addObject), nie w danych materiału.
      gift: def.gift ?? null,
    });
    return id;
  };
  put('basic-plains', 'battlefield');
  put('basic-plains', 'battlefield');
  const nabywca = put('dawntreader-elk', 'battlefield');
  const spellId = put('crumb-and-get-it', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  return { state, spellId, nabywca };
}

test('K/1: dar nie rozbija rzutu na dwa wpisy panelu (klucz grupowania)', () => {
  const bazowy = { type: 'cast_spell', objectId: 'obj', targets: ['cel'] };
  const zDarem = { ...bazowy, gifted: true, giftRecipientId: 'p2' };
  assert.equal(choiceRequestGroupKey(zDarem), choiceRequestGroupKey(bazowy),
    'wariant daru należy do TEJ SAMEJ grupy co rzut bazowy (CR 702.174a)');
  const phyrexian = { type: 'cast_spell', objectId: 'obj', phyrexianPayWithLife: 1 };
  assert.equal(choiceRequestGroupKey({ ...phyrexian, gifted: true, giftRecipientId: 'p2' }),
    choiceRequestGroupKey(phyrexian),
    'ta sama reguła dla wariantu płatności phyrexian');
});

test('K/2: panel pokazuje JEDEN wpis czaru, a dar jest wariantem w modalu', () => {
  const { state } = giftBoard();
  const view = playerView(state, 'p1');
  const czary = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.gifted);
  assert.ok(czary.length >= 1, 'silnik oferuje wariant z darem (CR 702.174a)');
  const wpisy = buildActionEntries(view.legalCommands, SESSION, view)
    .filter((e) => e.request?.options?.some((c) => c.type === 'cast_spell')
      || e.command?.type === 'cast_spell');
  assert.equal(wpisy.length, 1,
    `jeden wpis na czar w panelu, nie osobne przyciski wariantów: ${JSON.stringify(wpisy.map((w) => w.request ? 'modal' : w.command))}`);
  const modal = wpisy[0].request;
  assert.ok(modal, 'wpis czaru otwiera modal wyboru sposobu rzucenia (K)');
  const warianty = modal.options.filter((c) => c.type === 'cast_spell');
  assert.ok(warianty.some((c) => c.gifted), 'modal niesie wariant z darem');
  assert.ok(warianty.some((c) => !c.gifted), 'modal niesie wariant bez daru');
});

test('K/3: warianty w modalu są rozróżnialne — dar jest nazwany', () => {
  const { state } = giftBoard();
  const view = playerView(state, 'p1');
  const modal = buildActionEntries(view.legalCommands, SESSION, view)
    .find((e) => e.request?.options?.some((c) => c.type === 'cast_spell'))?.request;
  const etykiety = modal.options
    .filter((c) => c.type === 'cast_spell')
    .map((c) => commandLabel(c, SESSION, view).replace(/<[^>]*>/g, ''));
  const zDarem = etykiety.find((l) => /dar/i.test(l));
  assert.ok(zDarem, `etykieta wariantu z darem mówi o darze: ${JSON.stringify(etykiety)}`);
  assert.equal(new Set(etykiety).size, etykiety.length,
    `warianty o RÓŻNYM skutku nie mogą mieć identycznych etykiet: ${JSON.stringify(etykiety)}`);
});

test('K/4 (anty-over-fix): wybór daru nadal dociera do silnika jako wariant komendy', () => {
  const { state } = giftBoard();
  const view = playerView(state, 'p1');
  const zDarem = view.legalCommands.find((c) => c.type === 'cast_spell' && c.gifted);
  assert.equal(zDarem.gifted, true, 'komenda niesie obietnicę daru');
  assert.ok(zDarem.giftRecipientId, 'komenda wskazuje odbiorcę daru (CR 702.174a)');
});
